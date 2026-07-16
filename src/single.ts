const FIT_BUTTON_ID = "fit-exporter-single-button";
const FIT_LABEL = "导出FIT";
const GPX_LINK_SELECTOR = 'a[href*="/gpx/"]';

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
    window.alert(`${workoutId}`);
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