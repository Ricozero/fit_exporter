import { readFileSync } from "node:fs";
import { Decoder, Stream } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import { encodeWorkoutFit } from "../src/fit";
import { normalizeStream } from "../src/normalize";
import type {
  ApiResponse,
  WorkoutDetailData,
  WorkoutStream,
} from "../src/types";

const detailResponse = JSON.parse(
  readFileSync(new URL("../example/pgworkout_id.json", import.meta.url), "utf8"),
) as ApiResponse<WorkoutDetailData>;

const streamResponse = JSON.parse(
  readFileSync(new URL("../example/pgworkout_id_stream.json", import.meta.url), "utf8"),
) as ApiResponse<WorkoutStream>;

describe("encodeWorkoutFit", () => {
  it("creates a valid activity FIT file from the sample workout", () => {
    const points = normalizeStream(streamResponse.data);
    const bytes = encodeWorkoutFit(detailResponse.data.workout, points);
    const stream = Stream.fromByteArray(bytes);
    const decoder = new Decoder(stream);

    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);

    const { messages, errors } = decoder.read();
    const records = messages.recordMesgs ?? [];
    const session = messages.sessionMesgs?.[0];

    expect(errors).toEqual([]);
    expect(records).toHaveLength(749);
    expect(records[0]).toMatchObject({
      timestamp: new Date(1_784_077_955_000),
      heartRate: 94,
      cadence: 0,
      distance: 0,
    });
    expect(records.at(-1)?.distance).toBeCloseTo(8762.12, 1);
    expect(session).toMatchObject({
      sport: "cycling",
      totalDistance: 8784,
      avgHeartRate: 144,
      maxHeartRate: 178,
      avgCadence: 79,
      maxCadence: 105,
      numLaps: 1,
    });
    expect(messages.lapMesgs).toHaveLength(1);
    expect(messages.activityMesgs).toHaveLength(1);
  });
});
