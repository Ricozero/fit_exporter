import { mountBatchExport } from "./batch";
import { detectPage } from "./route";
import { mountSingleExport } from "./single";

const page = detectPage(new URL(window.location.href));

switch (page.type) {
  case "detail":
    mountSingleExport(page.workoutId);
    break;
  case "list":
    mountBatchExport();
    break;
  case "unsupported":
    break;
}
