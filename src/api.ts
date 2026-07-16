import type { ApiResponse, WorkoutDetail, WorkoutDetailData, WorkoutStream } from "./types";

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }

  const result = (await response.json()) as ApiResponse<T>;

  if (result.code !== 200) {
    throw new Error(result.msg || `请求失败：API ${result.code}`);
  }

  return result.data;
}

export async function fetchWorkoutDetail(workoutId: number): Promise<WorkoutDetail> {
  const data = await fetchApi<WorkoutDetailData>(`/api/v1/pgworkout/${workoutId}`);
  return data.workout;
}

export function fetchWorkoutStream(workoutId: number): Promise<WorkoutStream> {
  return fetchApi<WorkoutStream>(`/api/v1/pgworkout/${workoutId}/stream`);
}
