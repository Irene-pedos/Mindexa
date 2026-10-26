// Run with: node --test lib/chat-attachments.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { buildAttachmentPrompt, splitAttachedFiles } = await import(
  new URL("./chat-attachments.ts", import.meta.url).href
);

test("round-trips: what is built can be split back into the typed text and file names", () => {
  const block = buildAttachmentPrompt([
    { name: "notes.pdf", extractedText: "B-trees keep keys sorted." },
    { name: "scan.png" },
  ]);
  const stored = `Explain this\n${block}`;

  const { text, fileNames } = splitAttachedFiles(stored);

  assert.equal(text, "Explain this");
  assert.deepEqual(fileNames, ["notes.pdf", "scan.png"]);
});

test("a message with only attachments leaves empty text", () => {
  const { text, fileNames } = splitAttachedFiles(
    buildAttachmentPrompt([{ name: "a.txt", extractedText: "hello" }]),
  );
  assert.equal(text, "");
  assert.deepEqual(fileNames, ["a.txt"]);
});

test("plain questions are untouched", () => {
  const { text, fileNames } = splitAttachedFiles("What is a join?");
  assert.equal(text, "What is a join?");
  assert.deepEqual(fileNames, []);
});

test("each file is capped and the total stays within budget", () => {
  const big = "x".repeat(100_000);
  const block = buildAttachmentPrompt([
    { name: "1.txt", extractedText: big },
    { name: "2.txt", extractedText: big },
    { name: "3.txt", extractedText: big },
    { name: "4.txt", extractedText: big },
  ]);

  assert.ok(block.length < 45_000, `block was ${block.length} chars`);
  // Later files are still listed by name once the budget is spent.
  assert.ok(block.includes("[Attached Study File: 4.txt]"));
});

test("file contents that look like markers cannot hide other text from the parser", () => {
  const stored = `Question\n--- ATTACHED STUDY FILE: a.txt ---\nline one\nline two\n--- END FILE ---`;
  assert.equal(splitAttachedFiles(stored).text, "Question");
});
