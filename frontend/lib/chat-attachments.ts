/**
 * Attached-file text travels to the AI inside the question, wrapped in markers. The same
 * markers are what come back when a conversation is reloaded from the server, so they are
 * parsed here to show the student their own message, not a wall of file contents.
 */

export interface AttachmentLike {
  name: string;
  extractedText?: string;
}

/** Backend `question` limit is 64k characters; leave room for what the student typed. */
const MAX_CHARS_PER_FILE = 15_000;
const MAX_CHARS_ALL_FILES = 40_000;

const FILE_BLOCK = /\n?--- ATTACHED STUDY FILE: (.+?) ---\n[\s\S]*?\n--- END FILE ---/g;
const NAME_ONLY = /\n?\[Attached Study File: (.+?)\]/g;

/**
 * Build the text block for the attached files, within an overall character budget so several
 * large files cannot push the request over the server limit (which rejects the whole send).
 */
export function buildAttachmentPrompt(attachments: AttachmentLike[]): string {
  let budget = MAX_CHARS_ALL_FILES;
  return attachments
    .map((a) => {
      if (!a.extractedText || budget <= 0) return `\n[Attached Study File: ${a.name}]`;
      const slice = a.extractedText.slice(0, Math.min(MAX_CHARS_PER_FILE, budget));
      budget -= slice.length;
      return `\n--- ATTACHED STUDY FILE: ${a.name} ---\n${slice}\n--- END FILE ---`;
    })
    .join("\n");
}

/** Separate what the student typed from the attachment markers inside a stored question. */
export function splitAttachedFiles(question: string): { text: string; fileNames: string[] } {
  const fileNames: string[] = [];
  const collect = (_match: string, name: string) => {
    fileNames.push(name);
    return "";
  };
  const text = question.replace(FILE_BLOCK, collect).replace(NAME_ONLY, collect).trim();
  return { text, fileNames };
}
