import { fetchWorkoutDetail, fetchWorkoutStream } from "./api";
import { downloadFit } from "./download";
import { encodeWorkoutFit } from "./fit";
import { normalizeStream } from "./normalize";

const FIT_BUTTON_ID = "fit-exporter-single-button";
const FIT_LABEL = "导出Fit";
const GPX_LINK_SELECTOR = 'a[href*="/gpx/"]';
const FIT_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAQAAAD9CzEMAAAAEnRFWHRleGlmOkV4aWZPZmZzZXQAMjZTG6JlAAAABGdBTUEAALGPC/xhBQAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAASKADAAQAAAABAAAASAAAAACQMUbvAAAAAmJLR0QA/4ePzL8AAAK9SURBVHja7ddPSJNxHMfx9+9xQ6fz3w5aUelmSVghpCURsUMXLwnWKToo2D8vCRIJCYV/Tt4ED4Z68BDdunSoUyJBq1uSjAh5pEOBhnPzb7bt+SXuh0OfjZ7HbdDB12mw3/P97PN7nh/jwZ5qZ7UTW/KwwXdJDIgWz4/ln1gmLA93c4NRXMAmD3ilr2W1wdm8eD9PKAHAiV8UH5v6JbMW4D0XfU4HLlBcXInWl8+GFzPdIjVeTFJv+ilxZmTb/GyGDbxOT6eY4DQa+2kcFTfLN8s+h40DB/jc4iH9eNghA+IEADECnATAzVURLZ9Z/nOgAK9XTHKfAgA2GZLd4pEKaCDGRZxAPtdoKPsQDpOGRho1jWKcZvV9iAEGnRESDH2ZQQYIqQnNYrym0dZN9hWK63KMYgAkX+nQA1Drim0k2uiFAL7LTHBGTVgVd+VrfcNqgzY5osbDFO3b44G4ABW5Qw/QzhQJxXKENusNFqgAYIWXdOlb7KgqylsDYF13767MZ5hb6gAu6pUWG6jdjdJLjxoPGMkGu/Qteuglqq5KwUEqd+gCRvV3kFSgxU0BoEcY8QXpRDJs4ySfKoK5dfaoKZERAFb00tTrLTdIvdjQhPpgab2iYZmBDeYGVXlanejDj4ekb/TrL1CElirJ18Ig50kKMS2fGcHv8X0NtseP0bpnPNTylF0OQSqP94wHD61iTKszbZHoo+kfWyQs71WT6DMF4Mdse4sg5TlIGuILZn7TY+pTl+mCNLwVYiH9iU03R8Myh6mBSYaPac4Dko9pbgJkrhtouQ4QBgmxXN2DJcIAcg4bHFg2v+W7zT1WGMpRAGhv4u9FdP53zgLmJKvYpGHTYcBhQPYC7J+DEB71j5QNIXODabJp2vSGUxYUFzhOdnyS3eHFfQGlS+KjOEIlrow3563sNoIRyaH/xF+j/td45CYa1AAAAABJRU5ErkJggg==";

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
