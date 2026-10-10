export function downloadBytes(bytes: Uint8Array, fileName: string, type = "application/octet-stream"): void {
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const blob = new Blob([data.buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadFit(bytes: Uint8Array, workoutId: number): void {
  downloadBytes(bytes, `${workoutId}.fit`);
}
