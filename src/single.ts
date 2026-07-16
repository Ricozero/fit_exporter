import { fetchWorkoutDetail, fetchWorkoutStream } from "./api";
import { downloadFit } from "./download";
import { encodeWorkoutFit } from "./fit";
import { normalizeStream } from "./normalize";

const FIT_BUTTON_ID = "fit-exporter-single-button";
const FIT_LABEL = "导出FIT";
const GPX_LINK_SELECTOR = 'a[href*="/gpx/"]';

async function exportWorkout(workoutId: number, item: HTMLElement, label: Element): Promise<void> {
  if (item.dataset.exporting === "true") {
    return;
  }

  item.dataset.exporting = "true";
  label.textContent = "请求中";

  try {
    const [detail, stream] = await Promise.all([
      fetchWorkoutDetail(workoutId),
      fetchWorkoutStream(workoutId),
    ]);

    label.textContent = "生成中";
    const points = normalizeStream(stream);
    const fitBytes = encodeWorkoutFit(detail, points);
    downloadFit(fitBytes, detail.title, workoutId);
    label.textContent = FIT_LABEL;
  } catch (error) {
    console.error("[fit-exporter] 导出失败", error);
    label.textContent = "导出失败";
    window.setTimeout(() => {
      label.textContent = FIT_LABEL;
    }, 1000);
  } finally {
    delete item.dataset.exporting;
  }
}

function mountNextToGpxButton(workoutId: number): void {
  if (document.getElementById(FIT_BUTTON_ID)) {
    return;
  }

  const gpxButton = document.querySelector<HTMLAnchorElement>(GPX_LINK_SELECTOR);
  const gpxItem = gpxButton?.closest<HTMLElement>(".info_btn_box");

  if (!gpxButton || !gpxItem) {
    return;
  }

  const fitItem = gpxItem.cloneNode(true) as HTMLElement;
  const fitButton = fitItem.querySelector<HTMLAnchorElement>("a");

  if (!fitButton) {
    return;
  }

  fitItem.id = FIT_BUTTON_ID;
  fitButton.removeAttribute("href");
  fitButton.removeAttribute("target");

  const label = Array.from(fitItem.children).find(
    (element) => element !== fitButton && element.textContent?.trim() === "导出GPX",
  );

  if (!label) {
    return;
  }

  label.textContent = FIT_LABEL;
  fitItem.addEventListener("click", (event) => {
    event.preventDefault();
    void exportWorkout(workoutId, fitItem, label);
  });

  gpxItem.insertAdjacentElement("afterend", fitItem);
}

export function mountSingleExport(workoutId: number): void {
  mountNextToGpxButton(workoutId);

  const observer = new MutationObserver(() => {
    mountNextToGpxButton(workoutId);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
