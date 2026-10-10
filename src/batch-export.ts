import { ApiError, fetchWorkoutDetail, fetchWorkoutGpx, fetchWorkoutList, fetchWorkoutStream } from "./api";
import { createArchive, type ArchiveFile } from "./archive";
import { encodeWorkoutFit } from "./fit";
import { normalizeStream } from "./normalize";
import type { ExportFormat, WorkoutFilters, WorkoutListItem } from "./types";

export interface ExportFailure {
  id: number;
  title: string;
  reason: string;
}

export interface BatchProgress {
  stage: "listing" | "exporting" | "packing";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  archiveSaved: boolean;
  current?: WorkoutListItem;
  retry?: number;
}

export interface BatchResult {
  progress: BatchProgress;
  cancelled: boolean;
  error?: string;
  pendingFiles: ArchiveFile[];
  failures: ExportFailure[];
}

interface BatchOptions {
  format: ExportFormat;
  filters: WorkoutFilters;
  signal: AbortSignal;
  onProgress: (progress: BatchProgress) => void;
  onArchive: (bytes: Uint8Array) => void | Promise<void>;
  requestDelayMs?: number;
}

export interface BatchDependencies {
  list: typeof fetchWorkoutList;
  gpx: typeof fetchWorkoutGpx;
  detail: typeof fetchWorkoutDetail;
  stream: typeof fetchWorkoutStream;
  archive: typeof createArchive;
}

const dependencies: BatchDependencies = {
  list: fetchWorkoutList, gpx: fetchWorkoutGpx, detail: fetchWorkoutDetail,
  stream: fetchWorkoutStream, archive: createArchive,
};

export function waitForDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function failureReport(failures: ExportFailure[]): ArchiveFile {
  return {
    name: "export-errors.json",
    bytes: new TextEncoder().encode(JSON.stringify(failures, null, 2)),
  };
}

export async function runBatchExport(options: BatchOptions, deps = dependencies): Promise<BatchResult> {
  const progress: BatchProgress = {
    stage: "listing", total: 0, processed: 0, succeeded: 0, failed: 0, archiveSaved: false,
  };
  const failures: ExportFailure[] = [];
  const pendingFiles: ArchiveFile[] = [];
  let lastRequestFinished: number | undefined;
  const delay = options.requestDelayMs ?? 100;
  const update = (): void => options.onProgress({ ...progress });

  const request = async <T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      options.signal.throwIfAborted();
      if (lastRequestFinished !== undefined) {
        const remaining = delay - (Date.now() - lastRequestFinished);
        if (remaining > 0) await waitForDelay(remaining, options.signal);
      }
      try {
        const signal = AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]);
        return await action(signal);
      } catch (error) {
        options.signal.throwIfAborted();
        const retryable = error instanceof ApiError ? error.retryable
          : error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
        if (!retryable || attempt >= 2) throw error;
        progress.retry = attempt + 1;
        update();
        const backoff = Math.max(2000 * 2 ** attempt, error instanceof ApiError ? error.retryAfterMs : 0);
        await waitForDelay(backoff, options.signal);
      } finally {
        lastRequestFinished = Date.now();
        progress.retry = undefined;
      }
    }
  };

  const saveArchive = async (): Promise<void> => {
    if (pendingFiles.length === 0) return;
    progress.stage = "packing";
    update();
    const bytes = await deps.archive(pendingFiles);
    options.signal.throwIfAborted();
    await options.onArchive(bytes);
    progress.archiveSaved = true;
    pendingFiles.length = 0;
    progress.stage = "exporting";
    update();
  };

  try {
    const workouts: WorkoutListItem[] = [];
    const ids = new Set<number>();
    let offset = 0;
    update();
    while (true) {
      const page = await request((signal) => deps.list(options.filters, offset, signal));
      if (page.length === 0) break;
      let added = 0;
      for (const workout of page) {
        if (!ids.has(workout.id)) {
          ids.add(workout.id);
          workouts.push(workout);
          added++;
        }
      }
      if (added === 0) throw new Error("列表接口重复返回已有轨迹，已停止分页，请稍后重试");
      offset += page.length;
      progress.total = workouts.length;
      update();
    }

    progress.stage = "exporting";
    update();
    for (const workout of workouts) {
      options.signal.throwIfAborted();
      progress.current = workout;
      update();
      let bytes: Uint8Array;
      try {
        if (options.format === "gpx") {
          bytes = await request((signal) => deps.gpx(workout.id, signal));
        } else {
          const detail = await request((signal) => deps.detail(workout.id, signal));
          const stream = await request((signal) => deps.stream(workout.id, signal));
          bytes = encodeWorkoutFit(detail, normalizeStream(stream));
        }
      } catch (error) {
        options.signal.throwIfAborted();
        failures.push({ id: workout.id, title: workout.title, reason: errorMessage(error) });
        progress.failed++;
        progress.processed++;
        update();
        if (error instanceof ApiError && error.authenticationRequired) throw error;
        continue;
      }

      pendingFiles.push({ name: `${workout.id}.${options.format}`, bytes });
      progress.succeeded++;
      progress.processed++;
      update();
    }
    progress.current = undefined;
    if (failures.length > 0) pendingFiles.push(failureReport(failures));
    await saveArchive();
    return { progress, cancelled: false, pendingFiles, failures };
  } catch (error) {
    return {
      progress, cancelled: options.signal.aborted,
      error: options.signal.aborted ? undefined : errorMessage(error), pendingFiles, failures,
    };
  }
}
