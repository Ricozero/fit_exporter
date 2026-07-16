import type { TrackPoint, WorkoutStream } from "./types";

function optionalNumber(values: number[] | undefined, index: number): number | undefined {
  const value = values?.[index];
  return Number.isFinite(value) ? value : undefined;
}

function optionalSensorNumber(values: number[] | undefined, index: number): number | undefined {
  return values && values.length > 0 ? optionalNumber(values, index) : undefined;
}

function combineBalance(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) {
    return undefined;
  }

  return Math.max(0, Math.min(100, left ?? 100 - (right ?? 0)));
}

export function normalizeStream(stream: WorkoutStream): TrackPoint[] {
  return (stream.timestamp ?? []).flatMap((timestamp, index) => {
    if (!Number.isFinite(timestamp)) {
      return [];
    }

    const location = stream.location?.[index];
    const longitude = location?.[0];
    const latitude = location?.[1];

    return [{
      timestamp: new Date(timestamp * 1000),
      longitude: Number.isFinite(longitude) ? longitude : undefined,
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      altitude: optionalNumber(stream.altitude, index),
      heartRate: optionalSensorNumber(stream.heartrate, index),
      cadence: optionalSensorNumber(stream.cadence, index),
      distance: optionalNumber(stream.distance, index),
      speed: optionalNumber(stream.speed, index),
      power: optionalSensorNumber(stream.power, index),
      temperature: optionalSensorNumber(stream.temperature, index),
      leftRightBalance: combineBalance(
        optionalSensorNumber(stream.left_balance, index),
        optionalSensorNumber(stream.right_balance, index),
      ),
      leftTorqueEffectiveness: optionalSensorNumber(stream.left_torque_effectiveness, index),
      rightTorqueEffectiveness: optionalSensorNumber(stream.right_torque_effectiveness, index),
      leftPedalSmoothness: optionalSensorNumber(stream.left_pedal_smoothness, index),
      rightPedalSmoothness: optionalSensorNumber(stream.right_pedal_smoothness, index),
    }];
  });
}
