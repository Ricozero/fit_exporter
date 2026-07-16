const BUTTON_ID = "fit-exporter-button";

function mountButton(): void {
  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "导出 FIT（开发中）";
  button.title = "fit_exporter 用户脚本已成功加载";

  Object.assign(button.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    zIndex: "2147483647",
    padding: "10px 16px",
    border: "0",
    borderRadius: "8px",
    color: "#ffffff",
    background: "#1677ff",
    boxShadow: "0 4px 12px rgb(0 0 0 / 20%)",
    cursor: "pointer",
    fontSize: "14px",
  });

  button.addEventListener("click", () => {
    window.alert("fit_exporter 已通过 TypeScript + Vite 加载成功。");
  });

  document.body.append(button);
}

mountButton();