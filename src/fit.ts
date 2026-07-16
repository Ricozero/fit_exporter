import { Encoder, Profile } from "@garmin/fitsdk";
import type { TrackPoint, WorkoutDetail } from "./types";

interface SportMapping {
  sport: string;
  subSport: string;
}

function definedEntries(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  );
}

function degreesToSemicircles(degrees: number | undefined): number | undefined {
  return degrees === undefined ? undefined : Math.round(degrees * (2 ** 31 / 180));
}

function mapSport(sport: number): SportMapping {
  switch (sport) {
    case 1:
      return { sport: "running", subSport: "generic" };
    case 2:
      return { sport: "walking", subSport: "generic" };
    case 3:
      return { sport: "cycling", subSport: "generic" };
    default:
      return { sport: "generic", subSport: "generic" };
  }
}

function toFitCalories(calories: number | undefined): number | undefined {
  if (calories === undefined || calories <= 0) {
    return undefined;
  }

  const kilocalories = calories > 10_000 ? calories / 1000 : calories;
  return Math.min(65_534, Math.round(kilocalories));
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

export function encodeWorkoutFit(detail: WorkoutDetail, points: TrackPoint[]): Uint8Array {
  if (points.length === 0) {
    throw new Error("轨迹没有可导出的采样点");
  }

  const encoder = new Encoder();
  const writeMessage = (mesgNum: number, message: Record<string, unknown>): void => {
    encoder.onMesg(mesgNum, message as Parameters<Encoder["onMesg"]>[1]);
  };
  const sport = mapSport(detail.sport);
  const firstPoint = points[0];
  const lastPoint = points.at(-1) ?? firstPoint;
  const startTime = firstPoint.timestamp;
  const endTime = lastPoint.timestamp;
  const elapsedTime = Math.max(0, (endTime.getTime() - startTime.getTime()) / 1000);
  const timerTime = positive(detail.duration) ?? elapsedTime;
  const totalDistance = positive(detail.distance) ?? lastPoint.distance;

  writeMessage(Profile.MesgNum.FILE_ID, {
    type: "activity",
    manufacturer: "development",
    product: positive(detail.product) ?? 1,
    serialNumber: detail.workout_id,
    timeCreated: startTime,
  });

  writeMessage(Profile.MesgNum.EVENT, {
    timestamp: startTime,
    event: "timer",
    eventType: "start",
  });

  for (const point of points) {
    writeMessage(Profile.MesgNum.RECORD, definedEntries({
      timestamp: point.timestamp,
      positionLat: degreesToSemicircles(point.latitude),
      positionLong: degreesToSemicircles(point.longitude),
      altitude: point.altitude,
      enhancedAltitude: point.altitude,
      heartRate: point.heartRate,
      cadence: point.cadence,
      distance: point.distance,
      speed: point.speed,
      enhancedSpeed: point.speed,
      power: point.power,
      temperature: point.temperature,
      leftRightBalance: point.leftRightBalance,
      leftTorqueEffectiveness: point.leftTorqueEffectiveness,
      rightTorqueEffectiveness: point.rightTorqueEffectiveness,
      leftPedalSmoothness: point.leftPedalSmoothness,
      rightPedalSmoothness: point.rightPedalSmoothness,
    }));
  }

  writeMessage(Profile.MesgNum.EVENT, {
    timestamp: endTime,
    event: "timer",
    eventType: "stopAll",
  });

  const summary = definedEntries({
    timestamp: endTime,
    startTime,
    startPositionLat: degreesToSemicircles(firstPoint.latitude),
    startPositionLong: degreesToSemicircles(firstPoint.longitude),
    endPositionLat: degreesToSemicircles(lastPoint.latitude),
    endPositionLong: degreesToSemicircles(lastPoint.longitude),
    totalElapsedTime: elapsedTime,
    totalTimerTime: timerTime,
    totalDistance,
    totalCalories: toFitCalories(detail.calories),
    avgSpeed: positive(detail.avg_speed) === undefined ? undefined : (detail.avg_speed ?? 0) / 3.6,
    maxSpeed: positive(detail.max_speed) === undefined ? undefined : (detail.max_speed ?? 0) / 3.6,
    avgHeartRate: positive(detail.avg_heartrate),
    maxHeartRate: positive(detail.max_heartrate),
    avgCadence: positive(detail.avg_cadence),
    maxCadence: positive(detail.max_cadence),
    avgPower: positive(detail.power_avg),
    maxPower: positive(detail.power_max),
    normalizedPower: positive(detail.power_np),
    thresholdPower: positive(detail.power_ftp),
    intensityFactor: positive(detail.power_if),
    trainingStressScore: positive(detail.power_tss),
    totalAscent: positive(detail.elevation_gain),
    totalDescent: positive(detail.elevation_loss),
    avgAltitude: detail.avg_altitude,
    maxAltitude: detail.max_altitude,
    avgGrade: detail.avg_grade,
    maxPosGrade: detail.max_grade,
    maxNegGrade: detail.min_grade,
    sport: sport.sport,
    subSport: sport.subSport,
  });

  writeMessage(Profile.MesgNum.LAP, {
    ...summary,
    messageIndex: 0,
    event: "lap",
    eventType: "stop",
    intensity: "active",
    lapTrigger: "sessionEnd",
  });

  writeMessage(Profile.MesgNum.SESSION, {
    ...summary,
    messageIndex: 0,
    event: "session",
    eventType: "stop",
    firstLapIndex: 0,
    numLaps: 1,
    trigger: "activityEnd",
  });

  writeMessage(Profile.MesgNum.ACTIVITY, {
    timestamp: endTime,
    totalTimerTime: timerTime,
    numSessions: 1,
    type: "manual",
    event: "activity",
    eventType: "stop",
  });

  return encoder.close();
}
