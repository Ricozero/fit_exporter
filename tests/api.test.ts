import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkoutFile, fetchWorkoutGpx } from "../src/api";

afterEach(() => vi.unstubAllGlobals());

describe("download request content negotiation", () => {
  it("uses the GPX download URL and a wildcard Accept header to avoid HTTP 406", async () => {
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      if (new Headers(options.headers).get("Accept") !== "*/*") {
        return new Response('{"detail":"Could not satisfy the request Accept header."}', { status: 406 });
      }
      return new Response('{"code":401,"msg":"Authentication credentials were not provided."}', { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(fetchWorkoutGpx(207448731, controller.signal)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/pgworkout/207448731/gpx/", {
      credentials: "include", headers: { Accept: "*/*" }, signal: controller.signal,
    });
  });

  it("also accepts FIT attachments regardless of their response MIME type", async () => {
    const bytes = new Uint8Array(14);
    bytes.set(new TextEncoder().encode(".FIT"), 8);
    const fetchMock = vi.fn(async () => new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWorkoutFile("/api/v1/workout/207448731/fit/", "fit")).resolves.toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/workout/207448731/fit/", {
      credentials: "include", headers: { Accept: "*/*" }, signal: undefined,
    });
  });
});
