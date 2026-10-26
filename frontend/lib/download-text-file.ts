/** Offer `content` to the user as a file download. */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string = "text/markdown;charset=utf-8;"
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
