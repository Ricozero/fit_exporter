export type Page =
  | { type: "detail"; workoutId: number }
  | { type: "list" }
  | { type: "unsupported" };

const LIST_PATH_PATTERN = /^\/workouts\/list\/?$/;
const DETAIL_PATH_PATTERN = /^\/workouts\/(\d+)\/?$/;

export function detectPage(url: URL): Page {
  if (url.origin !== "https://www.imxingzhe.com") {
    return { type: "unsupported" };
  }

  if (LIST_PATH_PATTERN.test(url.pathname)) {
    return { type: "list" };
  }

  const detailMatch = url.pathname.match(DETAIL_PATH_PATTERN);

  if (!detailMatch) {
    return { type: "unsupported" };
  }

  return {
    type: "detail",
    workoutId: Number(detailMatch[1]),
  };
}
