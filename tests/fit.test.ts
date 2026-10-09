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

  it.each([
    [0, "generic", "generic"],
    [1, "walking", "generic"],
    [2, "running", "generic"],
    [3, "cycling", "generic"],
    [4, "hiking", "generic"],
    [5, "swimming", "generic"],
    [6, "alpineSkiing", "generic"],
    [7, "generic", "generic"],
    [8, "training", "generic"],
    [11, "cycling", "indoorCycling"],
    [12, "cycling", "virtualActivity"],
    [99, "generic", "generic"],
  ])("exports Xingzhe sport %i as %s / %s without optional sensors", (sport, fitSport, subSport) => {
    const detail = {
      id: 1,
      workout_id: 1,
      title: "Workout",
      sport: Number(sport),
      duration: 10,
      start_time: 1_784_077_955_000,
      end_time: 1_784_077_965_000,
      distance: 25,
    };
    const points = normalizeStream({
      timestamp: [1_784_077_955, 1_784_077_965],
      distance: [0, 25],
    });
    const decoder = new Decoder(Stream.fromByteArray(encodeWorkoutFit(detail, points)));

    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toEqual([]);
    expect(messages.sessionMesgs?.[0]).toMatchObject({
      sport: fitSport,
      subSport,
      totalDistance: 25,
      totalTimerTime: 10,
    });
    expect(messages.lapMesgs?.[0]).toMatchObject({ sport: fitSport, subSport });
    expect(messages.recordMesgs).toHaveLength(2);
    for (const record of messages.recordMesgs ?? []) {
      expect(record.positionLat).toBeUndefined();
      expect(record.positionLong).toBeUndefined();
      expect(record.heartRate).toBeUndefined();
      expect(record.cadence).toBeUndefined();
      expect(record.power).toBeUndefined();
    }
  });
});
