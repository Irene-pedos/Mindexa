// Run with: node --test lib/tutor-chat.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const lib = await import(new URL("./tutor-chat.ts", import.meta.url).href);
const {
  turnsToMessages,
  orderConversations,
  toHistoryPayload,
  recordTurn,
  isScopeKinyarwanda,
  scopeLabel,
  resolveScope,
  buildTranscriptMarkdown,
  buildTranscriptPlainText,
  formatHistoryDate,
} = lib;

const conv = (id: string, last: string, turns = 1) => ({
  conversation_id: id,
  preview: id,
  created_at: last,
  last_activity_at: last,
  turn_count: turns,
});

const catalog = {
  workspaces: [
    { id: "ws-en", code: "CS101", title: "Intro", language: "EN" },
    { id: "ws-rw", code: "KIN1", title: "Ikinyarwanda", language: "RW" },
  ],
  materials: [
    { id: "m-en", workspace_id: "ws-en", teaching_workspace_id: "ws-en", display_name: "Notes", original_filename: "n.pdf", course_code: "CS101" },
    { id: "m-rw", workspace_id: "ws-rw", teaching_workspace_id: "ws-rw", display_name: null, original_filename: "k.pdf", course_code: "" },
  ],
  personal: [{ id: "p1", display_name: null, original_filename: "mine.txt" }],
};

test("turnsToMessages splits attachments out of the stored question and keeps citations", () => {
  const split = (q: string) => ({ text: q.replace(" [file]", ""), fileNames: q.includes("[file]") ? ["a.pdf"] : [] });
  const out = turnsToMessages(
    [{ id: "t1", question: "hi [file]", answer: "yo", citations: [{ resource_name: "R" }], created_at: "2026-01-01T10:00:00Z" }],
    split
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "hi");
  assert.deepEqual(out[0].attachments.map((a: { name: string }) => a.name), ["a.pdf"]);
  assert.equal(out[1].sender, "ai");
  assert.equal(out[1].citations.length, 1);
});

test("orderConversations puts pinned first, then newest activity", () => {
  const list = [conv("old", "2026-01-01T00:00:00Z"), conv("new", "2026-03-01T00:00:00Z"), conv("pinned-old", "2025-01-01T00:00:00Z")];
  const ordered = orderConversations(list, new Set(["pinned-old"])).map((c: { conversation_id: string }) => c.conversation_id);
  assert.deepEqual(ordered, ["pinned-old", "new", "old"]);
  assert.equal(list[0].conversation_id, "old", "input is not mutated");
});

test("recordTurn bumps an existing conversation to the top and adds a new one with a trimmed preview", () => {
  const base = [conv("a", "2026-01-01T00:00:00Z", 2), conv("b", "2026-01-02T00:00:00Z")];
  const bumped = recordTurn(base, "a", "q", "2026-02-01T00:00:00Z");
  assert.equal(bumped[0].conversation_id, "a");
  assert.equal(bumped[0].turn_count, 3);
  assert.equal(bumped.length, 2);

  const long = "x".repeat(200);
  const added = recordTurn(base, "c", long, "2026-02-01T00:00:00Z");
  assert.equal(added[0].conversation_id, "c");
  assert.equal(added[0].preview.length, 80);
  assert.ok(added[0].preview.endsWith("..."));
  assert.equal(recordTurn([], "d", "", "2026-02-01T00:00:00Z")[0].preview, "New Conversation");
});

test("toHistoryPayload maps roles, drops empty turns and keeps only the most recent ones", () => {
  const when = new Date();
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    sender: i % 2 === 0 ? "student" : "ai",
    text: `m${i}`,
    timestamp: when,
  }));
  const payload = toHistoryPayload([...many, { id: "e", sender: "ai", text: "   ", timestamp: when }]);
  assert.equal(payload.length, 20);
  assert.equal(payload[payload.length - 1].content, "m29");
  assert.equal(payload[0].role, "user");
  assert.equal(toHistoryPayload([{ id: "l", sender: "ai", text: "x".repeat(5000), timestamp: when }])[0].content.length, 4000);
});

test("isScopeKinyarwanda checks the course itself and the course of a material", () => {
  assert.equal(isScopeKinyarwanda(null, catalog), false);
  assert.equal(isScopeKinyarwanda("ws-rw", catalog), true);
  assert.equal(isScopeKinyarwanda("ws-en", catalog), false);
  assert.equal(isScopeKinyarwanda("m-rw", catalog), true);
  assert.equal(isScopeKinyarwanda("m-en", catalog), false);
  assert.equal(isScopeKinyarwanda("p1", catalog), false);
});

test("scopeLabel names the selection, or null for general knowledge", () => {
  assert.equal(scopeLabel(null, catalog), null);
  assert.equal(scopeLabel("ws-en", catalog), "CS101 (Course)");
  assert.equal(scopeLabel("p1", catalog), "mine.txt");
  assert.equal(scopeLabel("m-en", catalog), "Notes (CS101)");
  assert.equal(scopeLabel("m-rw", catalog), "k.pdf (Material)");
  assert.equal(scopeLabel("unknown", catalog), "Context Selected");
});

test("resolveScope maps the selection to the ids the API expects", () => {
  assert.deepEqual(resolveScope(null, catalog, false), { stale: false });
  assert.deepEqual(resolveScope("ws-en", catalog, false), { teachingWorkspaceId: "ws-en", stale: false });
  assert.deepEqual(resolveScope("m-en", catalog, false), { selectedResourceId: "m-en", teachingWorkspaceId: "ws-en", stale: false });
  assert.deepEqual(resolveScope("p1", catalog, false), { selectedResourceId: "p1", stale: false });
});

test("resolveScope flags an unknown id as stale once loaded, but passes it through while loading", () => {
  assert.deepEqual(resolveScope("gone", catalog, false), { stale: true });
  assert.deepEqual(resolveScope("gone", catalog, true), { selectedResourceId: "gone", stale: false });
});

test("transcripts include attachments and references, in order", () => {
  const when = new Date("2026-01-01T10:00:00Z");
  const messages = [
    { id: "1", sender: "student", text: "What is 3NF?", attachments: [{ name: "a.pdf" }], timestamp: when },
    { id: "2", sender: "ai", text: "Third normal form.", citations: [{ resource_name: "Notes", page_number: 4 }], timestamp: when },
  ];
  const md = buildTranscriptMarkdown(messages, when);
  assert.ok(md.includes("What is 3NF?") && md.includes("*Attached: a.pdf*"));
  assert.ok(md.indexOf("What is 3NF?") < md.indexOf("Third normal form."));
  assert.ok(md.includes("- Notes (p. 4)"));

  const txt = buildTranscriptPlainText(messages, when);
  assert.ok(txt.includes("STUDENT:") && txt.includes("AI TUTOR:"));
});

test("formatHistoryDate is empty for missing or invalid dates and shows time for today", () => {
  assert.equal(formatHistoryDate(undefined), "");
  assert.equal(formatHistoryDate("not a date"), "");
  const now = new Date("2026-05-05T12:00:00");
  assert.match(formatHistoryDate("2026-05-05T09:30:00", now), /\d/);
  assert.notEqual(formatHistoryDate("2026-01-02T09:30:00", now), formatHistoryDate("2026-05-05T09:30:00", now));
});
