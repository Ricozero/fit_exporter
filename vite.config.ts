import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "行者 FIT 导出器",
        namespace: "fit-exporter",
        description: "从行者网页导出 FIT 文件",
        match: ["https://*.imxingzhe.com/*"],
        grant: "none",
        "run-at": "document-idle",
      },
      server: {
        open: false,
      },
      build: {
        fileName: "fit-exporter.user.js",
      },
    }),
  ],
});