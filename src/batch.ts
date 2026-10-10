import { createArchive } from "./archive";
import { errorMessage, failureReport, runBatchExport, type BatchProgress } from "./batch-export";
import { readWorkoutFilters } from "./batch-filters";
import { downloadBytes } from "./download";
import { FIT_ICON, GPX_ICON } from "./icons";
import type { ExportFormat, WorkoutFilters } from "./types";

const BUTTON_PREFIX = "fit-exporter-batch-";
const PANEL_ID = "fit-exporter-batch-progress";
let activeController: AbortController | undefined;

function setButtonsDisabled(disabled: boolean): void {
  for (const format of ["gpx", "fit"]) {
    const button = document.getElementById(`${BUTTON_PREFIX}${format}`) as HTMLButtonElement | null;
    if (button) button.disabled = disabled;
  }
}

function archiveName(format: ExportFormat, filters: WorkoutFilters, stamp: string): string {
  const scope = [filters.sport === undefined ? "all-sports" : `sport-${filters.sport}`,
    filters.year ?? "all-years", filters.month ?? "all-months"].join("-");
  return `${format}-${scope}-${stamp}.zip`;
}

function createProgressPanel(format: ExportFormat, description: string) {
  document.getElementById(PANEL_ID)?.remove();
  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.setAttribute("aria-label", "批量导出进度");
  Object.assign(panel.style, {
    position: "fixed", right: "24px", bottom: "24px", zIndex: "2147483647",
    width: "360px", maxWidth: "calc(100vw - 48px)", boxSizing: "border-box",
    padding: "20px", background: "white", color: "#333", borderRadius: "8px",
    boxShadow: "0 4px 24px #0003", fontSize: "14px", lineHeight: "1.6",
  });
  const title = document.createElement("strong");
  title.textContent = `批量导出${format === "gpx" ? "GPX" : "Fit"}`;
  const scope = document.createElement("div");
  scope.textContent = description;
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  const progress = document.createElement("progress");
  progress.max = 1;
  progress.removeAttribute("value");
  progress.style.width = "100%";
  const current = document.createElement("div");
  current.style.overflowWrap = "anywhere";
  const stats = document.createElement("div");
  const failureDetails = document.createElement("details");
  failureDetails.hidden = true;
  const failureSummary = document.createElement("summary");
  failureSummary.textContent = "查看失败原因";
  const failureList = document.createElement("ul");
  Object.assign(failureList.style, { maxHeight: "160px", overflowY: "auto", overflowWrap: "anywhere" });
  failureDetails.append(failureSummary, failureList);
  const actions = document.createElement("div");
  Object.assign(actions.style, { display: "flex", gap: "8px", marginTop: "12px" });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => {
    activeController?.abort();
    cancel.disabled = true;
    status.textContent = "正在取消…";
  });
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存已完成文件";
  save.hidden = true;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "关闭";
  close.hidden = true;
  close.addEventListener("click", () => panel.remove());
  actions.append(cancel, save, close);
  panel.append(title, scope, status, progress, current, stats, failureDetails, actions);
  document.body.append(panel);

  const update = (value: BatchProgress): void => {
    if (value.stage === "listing") {
      progress.removeAttribute("value");
      status.textContent = `正在获取轨迹列表，已找到 ${value.total} 条`;
    } else {
      progress.max = Math.max(1, value.total);
      progress.value = value.processed;
      status.textContent = value.stage === "packing" ? "正在打包 ZIP…" : `已处理 ${value.processed} / ${value.total}`;
    }
    if (value.retry) status.textContent += `，正在第 ${value.retry} 次重试`;
    current.textContent = value.current ? `${value.current.id} · ${value.current.title}` : "";
    stats.textContent = `成功 ${value.succeeded}，失败 ${value.failed}`
      + (value.stage === "listing" ? "" : `，未处理 ${Math.max(0, value.total - value.processed)}`)
      + (value.archiveSaved ? "，ZIP 已保存" : "");
  };
  return { panel, status, progress, current, cancel, save, close, failureDetails, failureList, update };
}

async function startBatchExport(format: ExportFormat): Promise<void> {
  if (activeController) return;
  let selected: ReturnType<typeof readWorkoutFilters>;
  try {
    selected = readWorkoutFilters(document.querySelector(".trajectory-workouts") ?? document);
  } catch (error) {
    window.alert(errorMessage(error));
    return;
  }
  const controller = new AbortController();
  activeController = controller;
  setButtonsDisabled(true);
  const ui = createProgressPanel(format, selected.description);
  const stamp = String(Date.now());
  const saveArchive = (bytes: Uint8Array): void => {
    downloadBytes(bytes, archiveName(format, selected.filters, stamp), "application/zip");
  };
  try {
    const result = await runBatchExport({
      format, filters: selected.filters, signal: controller.signal,
      onProgress: ui.update, onArchive: saveArchive,
    });
    ui.update(result.progress);
    ui.current.textContent = "";
    ui.status.textContent = result.cancelled ? "已取消" : result.error ? `导出停止：${result.error}`
      : result.progress.total === 0 ? "没有可导出的轨迹" : "导出完成";
    if (result.failures.length > 0) {
      ui.failureDetails.hidden = false;
      for (const failure of result.failures) {
        const item = document.createElement("li");
        item.textContent = `${failure.id} · ${failure.title}：${failure.reason}`;
        ui.failureList.append(item);
      }
    }
    if (result.pendingFiles.length > 0 || ((result.cancelled || result.error) && result.failures.length > 0)) {
      const files = [...result.pendingFiles];
      if (result.failures.length > 0 && !files.some((file) => file.name === "export-errors.json")) {
        files.push(failureReport(result.failures));
      }
      ui.save.hidden = false;
      ui.save.addEventListener("click", async () => {
        ui.save.disabled = true;
        ui.close.disabled = true;
        ui.status.textContent = "正在打包已完成文件…";
        try {
          saveArchive(await createArchive(files));
          result.progress.archiveSaved = true;
          ui.update(result.progress);
          ui.save.hidden = true;
          ui.status.textContent = "已保存已完成文件";
          files.length = 0;
          result.pendingFiles.length = 0;
        } catch (error) {
          ui.status.textContent = `保存失败：${errorMessage(error)}`;
          ui.save.disabled = false;
        } finally {
          ui.close.disabled = false;
        }
      });
    }
  } catch (error) {
    ui.status.textContent = `导出失败：${errorMessage(error)}`;
  } finally {
    ui.cancel.hidden = true;
    ui.close.hidden = false;
    activeController = undefined;
    setButtonsDisabled(false);
  }
}

function mountButtons(): void {
  const merge = document.querySelector<HTMLElement>(".trajectory-workouts .nav_title_box .merge-entry");
  if (!merge) return;
  let previous: HTMLElement = merge;
  for (const format of ["gpx", "fit"] as const) {
    const id = `${BUTTON_PREFIX}${format}`;
    const existing = document.getElementById(id);
    if (existing) {
      previous = existing;
      continue;
    }
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.disabled = activeController !== undefined;
    Object.assign(button.style, {
      display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
      marginLeft: "15px", padding: "0", border: "0", background: "transparent",
      color: "inherit", font: "inherit", cursor: "pointer", whiteSpace: "nowrap",
    });
    const image = document.createElement("img");
    image.src = format === "gpx" ? GPX_ICON : FIT_ICON;
    image.alt = "";
    image.width = 30;
    image.height = 30;
    const label = document.createElement("span");
    Object.assign(label.style, { fontSize: "12px", fontWeight: "400", lineHeight: "1.4" });
    label.textContent = `批量导出${format === "gpx" ? "GPX" : "Fit"}`;
    button.append(image, label);
    button.addEventListener("click", () => { void startBatchExport(format); });
    previous.insertAdjacentElement("afterend", button);
    previous = button;
  }
}

export function mountBatchExport(): void {
  mountButtons();
  const observer = new MutationObserver(mountButtons);
  observer.observe(document.body, { childList: true, subtree: true });
}
