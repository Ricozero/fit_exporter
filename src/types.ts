export interface ApiResponse<T> {
  code: number;
  data: T;
  msg: string;
}

export interface WorkoutDetailData {
  workout: WorkoutDetail;
}

export interface WorkoutDetail {
  id: number;
  workout_id: number;
  title: string;
  sport: number;
  duration: number;
  start_time: number;
  end_time: number;
  distance: number;
  calories?: number;
  elevation_gain?: number;
  elevation_loss?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_heartrate?: number;
  max_heartrate?: number;
  avg_cadence?: number;
  max_cadence?: number;
  power_avg?: number;
  power_max?: number;
  power_np?: number;
  power_ftp?: number;
  power_if?: number;
  power_tss?: number;
  avg_altitude?: number;
  max_altitude?: number;
  avg_grade?: number;
  min_grade?: number;
  max_grade?: number;
  source?: string;
  manufacturer?: string;
  product?: number;
  product_name?: string;
}

export interface WorkoutStream {
  location?: Array<[number, number] | null>;
  timestamp?: number[];
  altitude?: number[];
  heartrate?: number[];
  cadence?: number[];
  distance?: number[];
  speed?: number[];
  power?: number[];
  temperature?: number[];
  left_balance?: number[];
  right_balance?: number[];
  left_torque_effectiveness?: number[];
  right_torque_effectiveness?: number[];
  left_pedal_smoothness?: number[];
  right_pedal_smoothness?: number[];
}

export interface TrackPoint {
  timestamp: Date;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  heartRate?: number;
  cadence?: number;
  distance?: number;
  speed?: number;
  power?: number;
  temperature?: number;
  leftRightBalance?: number;
  leftTorqueEffectiveness?: number;
  rightTorqueEffectiveness?: number;
  leftPedalSmoothness?: number;
  rightPedalSmoothness?: number;
}
