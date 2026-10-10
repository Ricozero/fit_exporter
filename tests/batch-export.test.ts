import { readFileSync } from "node:fs";
import { Decoder, Stream } from "@garmin/fitsdk";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchWorkoutList } from "../src/api";
import { createArchive } from "../src/archive";
import { runBatchExport, type BatchDependencies, type BatchProgress } from "../src/batch-export";
import type { WorkoutDetail, WorkoutListItem } from "../src/types";

const workout = (id: number): WorkoutListItem => ({ id, title: `Workout ${id}`, sport: 3 });

function setup(pages: WorkoutListItem[][]) {
  const archives: Uint8Array[] = [];
  const updates: BatchProgress[] = [];
  const controller = new AbortController();
  const deps: BatchDependencies = {
    list: vi.fn(async () => pages.shift() ?? []),
    gpx: vi.fn(async (id) => new TextEncoder().encode(`<gpx><name>${id}</name></gpx>`)),
    detail: vi.fn(), stream: vi.fn(), archive: createArchive,
  };
  const options = {
    format: "gpx" as const,
    filters: { sport: 0, year: 2026, month: 1 },
    signal: controller.signal,
    requestDelayMs: 0,
    onProgress: (progress: BatchProgress) => { updates.push(progress); },
    onArchive: (bytes: Uint8Array) => { archives.push(bytes); },
  };
  return { archives, updates, controller, deps, options };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("batch export", () => {
  it("runs pagination and file requests without a default delay", async () => {
    vi.useFakeTimers();
    const { deps, options } = setup([[workout(1)], [workout(2)], []]);
    deps.archive = vi.fn(async () => new Uint8Array([1]));

    const result = await runBatchExport({ ...options, requestDelayMs: undefined }, deps);

    expect(result.progress).toMatchObject({ total: 2, succeeded: 2, archiveSaved: true });
    expect(deps.list).toHaveBeenCalledTimes(3);
    expect(deps.gpx).toHaveBeenCalledTimes(2);
  });

  it("paginates with a fixed filter, deduplicates IDs, and saves one valid ZIP", async () => {
    const { archives, updates, deps, options } = setup([[workout(1), workout(2)], [workout(2), workout(3)], []]);
    const result = await runBatchExport(options, deps);
    expect(result.error).toBeUndefined();
    expect(result.progress).toMatchObject({ total: 3, processed: 3, succeeded: 3, failed: 0, archiveSaved: true });
    expect(vi.mocked(deps.list).mock.calls.map((call) => call[1])).toEqual([0, 2, 4]);
    for (const call of vi.mocked(deps.list).mock.calls) expect(call[0]).toEqual(options.filters);
    expect(vi.mocked(deps.gpx).mock.calls.map((call) => call[0])).toEqual([1, 2, 3]);
    expect(archives).toHaveLength(1);
    expect(Object.keys(unzipSync(archives[0]))).toEqual(["1.gpx", "2.gpx", "3.gpx"]);
    expect(strFromU8(unzipSync(archives[0])["3.gpx"])).toContain("<name>3</name>");
    expect(updates.some((update) => update.stage === "packing")).toBe(true);
  });

  it("uses the real nested list response and includes sport=0 in query parameters", async () => {
    const response = JSON.parse(readFileSync(new URL("../example/pgworkout.json", import.meta.url), "utf8"));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const items = await fetchWorkoutList({ sport: 0, year: 2026, month: 7 }, 20);
    expect(items).toHaveLength(20);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/pgworkout/?offset=20&sport=0&year=2026&month=7");
  });

  it("stops repeated pages before making any file requests", async () => {
    const { deps, options, archives } = setup([[workout(1)], [workout(1)]]);
    const result = await runBatchExport(options, deps);
    expect(result.error).toContain("重复");
    expect(deps.gpx).not.toHaveBeenCalled();
    expect(archives).toEqual([]);
  });

  it("handles empty filters without downloading an empty ZIP", async () => {
    const { deps, options, archives } = setup([[]]);
    const result = await runBatchExport(options, deps);
    expect(result.progress.total).toBe(0);
    expect(archives).toEqual([]);
  });

  it("continues after a file failure and includes an error report in the ZIP", async () => {
    const { deps, options, archives } = setup([[workout(1), workout(2), workout(3)], []]);
    vi.mocked(deps.gpx).mockImplementation(async (id) => {
      if (id === 2) throw new ApiError("Not found", 404);
      return new Uint8Array([id]);
    });
    const result = await runBatchExport(options, deps);
    expect(result.progress).toMatchObject({ processed: 3, succeeded: 2, failed: 1 });
    const files = unzipSync(archives[0]);
    expect(Object.keys(files)).toEqual(["1.gpx", "3.gpx", "export-errors.json"]);
    expect(JSON.parse(strFromU8(files["export-errors.json"]))).toEqual([{ id: 2, title: "Workout 2", reason: "Not found" }]);
  });

  it("stops on authentication failure and retains completed files", async () => {
    const { deps, options, archives } = setup([[workout(1), workout(2), workout(3)], []]);
    vi.mocked(deps.gpx).mockImplementation(async (id) => {
      if (id === 2) throw new ApiError("Login expired", 401);
      return new Uint8Array([id]);
    });
    const result = await runBatchExport(options, deps);
    expect(result.error).toBe("Login expired");
    expect(result.pendingFiles.map((file) => file.name)).toEqual(["1.gpx"]);
    expect(deps.gpx).toHaveBeenCalledTimes(2);
    expect(archives).toEqual([]);
  });

  it("waits between requests, retries 429, and respects Retry-After", async () => {
    vi.useFakeTimers();
    const { deps, options } = setup([[workout(1)], []]);
    const times: number[] = [];
    let calls = 0;
    vi.mocked(deps.gpx).mockImplementation(async () => {
      times.push(Date.now());
      if (calls++ === 0) throw new ApiError("Rate limited", 429, 5000);
      return new Uint8Array([1]);
    });
    deps.archive = vi.fn(async () => new Uint8Array([1]));
    const start = Date.now();
    const running = runBatchExport({ ...options, requestDelayMs: 1000 }, deps);
    await vi.runAllTimersAsync();
    const result = await running;
    expect(result.progress.succeeded).toBe(1);
    expect(times[0] - start).toBeGreaterThanOrEqual(2000);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(5000);
  });

  it("cancels a pending request without losing completed files", async () => {
    const { deps, options, controller } = setup([[workout(1), workout(2)], []]);
    vi.mocked(deps.gpx).mockImplementation(async (id, signal) => {
      if (id === 1) return new Uint8Array([1]);
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        controller.abort();
      });
    });
    const result = await runBatchExport(options, deps);
    expect(result.cancelled).toBe(true);
    expect(result.progress).toMatchObject({ succeeded: 1, failed: 0 });
    const files = unzipSync(await createArchive(result.pendingFiles));
    expect(Object.keys(files)).toEqual(["1.gpx"]);
  });

  it.each(["gpx", "fit"] as const)("keeps four successes and zero failures when cancelling a ten-workout %s export", async (format) => {
    const items = Array.from({ length: 10 }, (_, index) => workout(index + 1));
    const { deps, options, controller } = setup([items, []]);
    const detail = JSON.parse(readFileSync(new URL("../example/pgworkout_id.json", import.meta.url), "utf8")).data.workout as WorkoutDetail;
    const stream = JSON.parse(readFileSync(new URL("../example/pgworkout_id_stream.json", import.meta.url), "utf8")).data;
    const cancelFifth = (signal?: AbortSignal): Promise<never> => new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      controller.abort();
    });
    vi.mocked(deps.gpx).mockImplementation(async (id, signal) => id === 5 ? cancelFifth(signal) : new Uint8Array([id]));
    vi.mocked(deps.detail).mockImplementation(async (id, signal) => id === 5 ? cancelFifth(signal) : detail);
    vi.mocked(deps.stream).mockResolvedValue(stream);

    const result = await runBatchExport({ ...options, format }, deps);

    expect(result.cancelled).toBe(true);
    expect(result.progress).toMatchObject({ total: 10, processed: 4, succeeded: 4, failed: 0 });
    expect(result.failures).toEqual([]);
    expect(result.pendingFiles.map((file) => file.name)).toEqual([1, 2, 3, 4].map((id) => `${id}.${format}`));
  });

  it("preserves real failures from before cancellation", async () => {
    const items = Array.from({ length: 10 }, (_, index) => workout(index + 1));
    const { deps, options, controller } = setup([items, []]);
    vi.mocked(deps.gpx).mockImplementation(async (id, signal) => {
      if (id <= 4) return new Uint8Array([id]);
      if (id <= 8) throw new ApiError("Not found", 404);
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        controller.abort();
      });
    });
    const result = await runBatchExport(options, deps);
    expect(result.cancelled).toBe(true);
    expect(result.progress).toMatchObject({ total: 10, processed: 8, succeeded: 4, failed: 4 });
    expect(result.failures.map((failure) => failure.id)).toEqual([5, 6, 7, 8]);
  });

  it("cancels during the inter-request delay", async () => {
    const { deps, options, controller } = setup([[workout(1), workout(2)], []]);
    const onProgress = (progress: BatchProgress): void => {
      if (progress.succeeded === 1) setTimeout(() => controller.abort(), 10);
    };
    const result = await runBatchExport({ ...options, requestDelayMs: 20, onProgress }, deps);
    expect(result.cancelled).toBe(true);
    expect(deps.gpx).toHaveBeenCalledTimes(1);
    expect(result.pendingFiles).toHaveLength(1);
  });

  it("keeps the archive files if compression fails", async () => {
    const { deps, options } = setup([[workout(1)], []]);
    deps.archive = vi.fn(async () => { throw new Error("Compression failed"); });
    const result = await runBatchExport(options, deps);
    expect(result.error).toBe("Compression failed");
    expect(result.pendingFiles[0].name).toBe("1.gpx");
  });

  it("retains files when cancellation happens during compression", async () => {
    const { deps, options, controller, archives } = setup([[workout(1)], []]);
    deps.archive = vi.fn(async () => {
      controller.abort();
      return new Uint8Array([1]);
    });
    const result = await runBatchExport(options, deps);
    expect(result.cancelled).toBe(true);
    expect(archives).toEqual([]);
    expect(result.pendingFiles.map((file) => file.name)).toEqual(["1.gpx"]);
  });

  it("records failure after two retries and continues to the next file", async () => {
    vi.useFakeTimers();
    const { deps, options } = setup([[workout(1), workout(2)], []]);
    vi.mocked(deps.gpx).mockImplementation(async (id) => {
      if (id === 1) throw new TypeError("Network failed");
      return new Uint8Array([2]);
    });
    deps.archive = vi.fn(async () => new Uint8Array([1]));
    const running = runBatchExport(options, deps);
    await vi.runAllTimersAsync();
    const result = await running;
    expect(vi.mocked(deps.gpx).mock.calls.map((call) => call[0])).toEqual([1, 1, 1, 2]);
    expect(result.progress).toMatchObject({ succeeded: 1, failed: 1, processed: 2 });
  });

  it("keeps more than 100 files and the failure report together in one ZIP", async () => {
    const items = Array.from({ length: 102 }, (_, index) => workout(index + 1));
    const { deps, options, archives } = setup([items, []]);
    vi.mocked(deps.gpx).mockImplementation(async (id) => {
      expect(archives).toHaveLength(0);
      if (id === 102) throw new ApiError("Not found", 404);
      return new Uint8Array([id]);
    });
    const result = await runBatchExport(options, deps);
    expect(result.progress).toMatchObject({ succeeded: 101, failed: 1, archiveSaved: true });
    expect(archives).toHaveLength(1);
    const files = unzipSync(archives[0]);
    expect(Object.keys(files)).toHaveLength(102);
    expect(files["101.gpx"]).toEqual(new Uint8Array([101]));
    expect(JSON.parse(strFromU8(files["export-errors.json"]))[0].id).toBe(102);
  });

  it("stores a failure-only report in one ZIP", async () => {
    const { deps, options, archives } = setup([[workout(1)], []]);
    vi.mocked(deps.gpx).mockRejectedValue(new ApiError("Not found", 404));
    await runBatchExport(options, deps);
    expect(archives).toHaveLength(1);
    expect(Object.keys(unzipSync(archives[0]))).toEqual(["export-errors.json"]);
  });

  it("encodes and archives valid FIT files using their IDs", async () => {
    const { deps, options, archives } = setup([[workout(217855597)], []]);
    const detail = JSON.parse(readFileSync(new URL("../example/pgworkout_id.json", import.meta.url), "utf8")).data.workout as WorkoutDetail;
    const stream = JSON.parse(readFileSync(new URL("../example/pgworkout_id_stream.json", import.meta.url), "utf8")).data;
    vi.mocked(deps.detail).mockResolvedValue(detail);
    vi.mocked(deps.stream).mockResolvedValue(stream);
    const result = await runBatchExport({ ...options, format: "fit" }, deps);
    expect(result.progress.succeeded).toBe(1);
    const files = unzipSync(archives[0]);
    expect(Object.keys(files)).toEqual(["217855597.fit"]);
    const decoder = new Decoder(Stream.fromByteArray(files["217855597.fit"]));
    expect(decoder.checkIntegrity()).toBe(true);
    const decoded = decoder.read();
    expect(decoded.errors).toEqual([]);
    expect(decoded.messages.recordMesgs).toHaveLength(749);
    expect(deps.gpx).not.toHaveBeenCalled();
  });
});
