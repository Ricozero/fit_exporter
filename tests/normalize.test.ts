import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeStream } from "../src/normalize";
import type { ApiResponse, WorkoutStream } from "../src/types";

const streamResponse = JSON.parse(
  readFileSync(new URL("../example/pgworkout_id_stream.json", import.meta.url), "utf8"),
) as ApiResponse<WorkoutStream>;

describe("normalizeStream", () => {
  it("aligns stream columns into track points", () => {
    const points = normalizeStream(streamResponse.data);

    expect(points).toHaveLength(749);
    expect(points[0]).toMatchObject({
      timestamp: new Date(1_784_077_955_000),
      longitude: 116.536085,
      latitude: 40.032062,
      altitude: 32.94,
      heartRate: 94,
      cadence: 0,
      distance: 0,
      speed: 0.31,
    });
    expect(points.at(-1)?.distance).toBe(8762.12);
    expect(points[0].power).toBeUndefined();
  });
});
