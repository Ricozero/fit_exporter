const BATCH_BUTTON_ID = "fit-exporter-batch-button";

export function mountBatchExport(): void {
  if (document.getElementById(BATCH_BUTTON_ID)) {
    return;
  }

  const button = document.createElement("button");
  button.id = BATCH_BUTTON_ID;
  button.type = "button";
  button.textContent = "批量导出 FIT（占位）";

  Object.assign(button.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    zIndex: "2147483647",
    padding: "10px 16px",
    cursor: "pointer",
  });

  button.addEventListener("click", () => {
    window.alert("批量导出功能暂未实现");
  });

  document.body.append(button);
}
