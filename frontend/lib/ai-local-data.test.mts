// Run with: node --test lib/ai-local-data.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { clearAiLocalData } = await import(
  new URL("./ai-local-data.ts", import.meta.url).href
);

function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

test("removes every AI key and leaves unrelated data alone", () => {
  const storage = fakeStorage({
    mindexa_lecturer_ai_sessions: "[...]",
    mindexa_lecturer_ai_workspace: "w",
    mindexa_lecturer_pinned_sessions: "[]",
    mindexa_ai_tutor_scope: "s",
    mindexa_pinned_conversations: "[]",
    theme: "dark",
    "grading:resume": "keep",
  });

  clearAiLocalData(storage);

  assert.deepEqual(Array.from(storage.data.keys()).sort(), ["grading:resume", "theme"]);
});

test("is a no-op on empty storage", () => {
  const storage = fakeStorage({});
  clearAiLocalData(storage);
  assert.equal(storage.data.size, 0);
});
