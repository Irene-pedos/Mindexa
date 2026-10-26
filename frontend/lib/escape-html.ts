const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape text before interpolating it into an HTML string (e.g. the print/PDF window).
 * AI output is derived from retrieved documents and attachments, so it must be treated as
 * untrusted: unescaped, it could run script in our origin.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
