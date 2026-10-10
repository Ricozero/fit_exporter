import type {
  ApiResponse, ExportFormat, WorkoutDetail, WorkoutDetailData,
  WorkoutFilters, WorkoutListData, WorkoutListItem, WorkoutStream,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs = 0) {
    super(message);
    this.name = "ApiError";
  }

  get authenticationRequired(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

async function request(url: string, accept: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: accept },
    signal,
  });

  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    const retryAfterMs = retryAfter === null ? 0 : /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
    throw new ApiError(`请求失败：HTTP ${response.status}`, response.status, retryAfterMs || 0);
  }

  if (response.redirected && /\/(login|signin)(\/|\?|$)/i.test(response.url)) {
    throw new ApiError("登录已失效，请重新登录", 401);
  }
  return response;
}

async function fetchApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await request(url, "application/json", signal);
  if (response.headers.get("Content-Type")?.includes("text/html")) {
    throw new ApiError("接口返回了网页，请检查登录状态", 401);
  }
  const result = (await response.json()) as ApiResponse<T>;
  if (result.code !== 0 && result.code !== 200) {
    throw new ApiError(result.msg || `请求失败：API ${result.code}`, result.code);
  }
  return result.data;
}

export async function fetchWorkoutDetail(workoutId: number, signal?: AbortSignal): Promise<WorkoutDetail> {
  const data = await fetchApi<WorkoutDetailData>(`/api/v1/pgworkout/${workoutId}`, signal);
  return data.workout;
}

export function fetchWorkoutStream(workoutId: number, signal?: AbortSignal): Promise<WorkoutStream> {
  return fetchApi<WorkoutStream>(`/api/v1/pgworkout/${workoutId}/stream`, signal);
}

export async function fetchWorkoutList(
  filters: WorkoutFilters, offset: number, signal?: AbortSignal,
): Promise<WorkoutListItem[]> {
  const query = new URLSearchParams({ offset: String(offset) });
  for (const key of ["sport", "year", "month"] as const) {
    if (filters[key] !== undefined) query.set(key, String(filters[key]));
  }
  const result = await fetchApi<WorkoutListData>(`/api/v1/pgworkout/?${query}`, signal);
  if (!Array.isArray(result.data) || result.data.some((item) => !Number.isSafeInteger(item.id) || item.id <= 0)) {
    throw new Error("轨迹列表响应格式不正确");
  }
  return result.data;
}

export async function fetchWorkoutFile(
  url: string, format: ExportFormat, signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await request(url, "*/*", signal);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.headers.get("Content-Type")?.includes("text/html")) {
    throw new ApiError("接口返回了网页，请检查登录状态", 401);
  }
  if (format === "gpx") {
    const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
    if (document.documentElement.localName !== "gpx" || document.getElementsByTagName("parsererror").length > 0) {
      throw new Error("接口未返回有效的 GPX 文件");
    }
  } else if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(8, 12)) !== ".FIT") {
    throw new Error("接口未返回有效的 FIT 文件");
  }
  return bytes;
}

export function fetchWorkoutGpx(workoutId: number, signal?: AbortSignal): Promise<Uint8Array> {
  return fetchWorkoutFile(`/api/v1/pgworkout/${workoutId}/gpx/`, "gpx", signal);
}
