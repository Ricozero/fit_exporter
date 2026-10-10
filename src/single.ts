import { fetchWorkoutDetail, fetchWorkoutFile, fetchWorkoutStream } from "./api";
import { downloadBytes, downloadFit } from "./download";
import { FIT_ICON } from "./icons";
import { encodeWorkoutFit } from "./fit";
import { normalizeStream } from "./normalize";
import type { ExportFormat } from "./types";

const FIT_BUTTON_ID = "fit-exporter-single-button";
const FIT_LABEL = "导出Fit";
const GPX_LINK_SELECTOR = 'a[href*="/gpx/"]';
const boundDownloadLinks = new WeakSet<HTMLAnchorElement>();

function bindNativeDownloads(workoutId: number): void {
  for (const format of ["gpx", "fit"] as const) {
    const links = document.querySelectorAll<HTMLAnchorElement>(`.info_btn_box a[href*="/${format}/"]`);
    for (const link of links) {
      if (boundDownloadLinks.has(link)) continue;
      boundDownloadLinks.add(link);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void downloadNativeFile(link, format, workoutId);
      }, { capture: true });
    }
  }
}

async function downloadNativeFile(link: HTMLAnchorElement, format: ExportFormat, workoutId: number): Promise<void> {
  if (link.dataset.exporting === "true") return;
  link.dataset.exporting = "true";
  try {
    const bytes = await fetchWorkoutFile(link.href, format);
    downloadBytes(bytes, `${workoutId}.${format}`);
  } catch (error) {
    console.error("[fit-exporter] 下载失败", error);
    window.alert(error instanceof Error ? error.message : "下载失败");
  } finally {
    delete link.dataset.exporting;
  }
}

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
    downloadFit(fitBytes, workoutId);
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
  bindNativeDownloads(workoutId);
  const existingItem = document.getElementById(FIT_BUTTON_ID);
  const nativeFitButton = Array.from(document.querySelectorAll<HTMLElement>(".info_btn_box")).find(
    (item) => item.id !== FIT_BUTTON_ID && item.textContent?.trim() === FIT_LABEL,
  );

  if (nativeFitButton) {
    existingItem?.remove();
    return;
  }

  if (existingItem) {
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

  const icon = fitButton.querySelector<HTMLImageElement>("img");
  if (icon) {
    icon.src = FIT_ICON;
  }

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
