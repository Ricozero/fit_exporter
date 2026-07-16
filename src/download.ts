function safeFileName(value: string): string {
  const printable = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  ).join("");
  const cleaned = printable
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "activity";
}

export function downloadFit(bytes: Uint8Array, title: string, workoutId: number): void {
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const blob = new Blob([data.buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(title)}-${workoutId}.fit`;
  anchor.click();
  URL.revokeObjectURL(url);
}
