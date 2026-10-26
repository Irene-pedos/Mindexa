// Run with: node --test lib/lecturer-sessions.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const lib = await import(new URL("./lecturer-sessions.ts", import.meta.url).href);
const {
  sanitizeSessionModule,
  parseStoredSessions,
  parseStoredPins,
  upsertSession,
  removeSession,
  orderSessions,
  togglePinned,
  unpin,
  sessionTitle,
} = lib;

const session = (id: string, created_at: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  module: "chat",
  workspaceId: null,
  history: [],
  created_at,
  ...extra,
});

test("legacy module names are mapped and unknown ones fall back to chat", () => {
  assert.equal(sanitizeSessionModule("assessment"), "questions");
  assert.equal(sanitizeSessionModule("content"), "slides");
  assert.equal(sanitizeSessionModule("analytics"), "digest");
  assert.equal(sanitizeSessionModule("insights"), "digest");
  assert.equal(sanitizeSessionModule("rubric"), "rubric");
  assert.equal(sanitizeSessionModule("nonsense"), "chat");
  assert.equal(sanitizeSessionModule(undefined), "chat");
});

test("malformed stored sessions never throw and bad entries are dropped", () => {
  assert.deepEqual(parseStoredSessions(null), []);
  assert.deepEqual(parseStoredSessions("not json"), []);
  assert.deepEqual(parseStoredSessions('{"a":1}'), []);

  const parsed = parseStoredSessions(
    JSON.stringify([session("ok", "2027-01-01T00:00:00Z", { module: "assessment" }), { title: "no id" }, null, 7]),
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, "ok");
  assert.equal(parsed[0].module, "questions");
});

test("old sessions missing optional fields are repaired", () => {
  const [s] = parseStoredSessions(JSON.stringify([{ id: "x" }]));
  assert.equal(s.title, "Untitled session");
  assert.equal(s.module, "chat");
  assert.equal(s.workspaceId, null);
  assert.deepEqual(s.history, []);
});

test("upserting a known session keeps its creation time and position data", () => {
  const original = session("a", "2027-01-01T00:00:00Z");
  const other = session("b", "2027-02-01T00:00:00Z");
  const updated = upsertSession([other, original], session("a", "2030-12-31T00:00:00Z", { title: "renamed" }));

  assert.equal(updated.length, 2);
  const a = updated.find((s: { id: string }) => s.id === "a");
  assert.equal(a.title, "renamed");
  assert.equal(a.created_at, "2027-01-01T00:00:00Z");
});

test("a new session is added at the front", () => {
  const updated = upsertSession([session("a", "2027-01-01T00:00:00Z")], session("b", "2027-02-01T00:00:00Z"));
  assert.deepEqual(updated.map((s: { id: string }) => s.id), ["b", "a"]);
});

test("ordering puts pinned first, then newest first, without mutating the input", () => {
  const list = [
    session("old", "2027-01-01T00:00:00Z"),
    session("new", "2027-03-01T00:00:00Z"),
    session("pinned-old", "2026-01-01T00:00:00Z"),
  ];
  const before = list.map((s) => s.id);

  const ordered = orderSessions(list, new Set(["pinned-old"]));

  assert.deepEqual(ordered.map((s: { id: string }) => s.id), ["pinned-old", "new", "old"]);
  assert.deepEqual(list.map((s) => s.id), before);
});

test("pin toggling reports the new state and leaves the original set alone", () => {
  const start = new Set<string>();
  const pinned = togglePinned(start, "a");
  assert.equal(pinned.isPinned, true);
  assert.ok(pinned.next.has("a"));
  assert.equal(start.size, 0);

  const unpinned = togglePinned(pinned.next, "a");
  assert.equal(unpinned.isPinned, false);
  assert.equal(unpinned.next.size, 0);
});

test("deleting a session also drops its pin", () => {
  const pins = new Set(["a", "b"]);
  assert.deepEqual([...unpin(pins, "a")], ["b"]);
  assert.equal(unpin(pins, "zzz"), pins); // unchanged set is returned as-is
  assert.deepEqual(removeSession([session("a", "x"), session("b", "y")], "a").map((s: { id: string }) => s.id), ["b"]);
});

test("stored pins ignore junk", () => {
  assert.deepEqual([...parseStoredPins('["a", 3, null, "b"]')], ["a", "b"]);
  assert.equal(parseStoredPins("garbage").size, 0);
  assert.equal(parseStoredPins(null).size, 0);
});

test("titles come from the explicit name, then the first user message, then a dated label", () => {
  const history = [
    { role: "model", content: "hello" },
    { role: "user", content: "x".repeat(100) },
  ];
  assert.equal(sessionTitle(history, "chat", "Custom"), "Custom");
  assert.equal(sessionTitle(history, "chat"), "x".repeat(36));
  assert.match(sessionTitle([], "slides", undefined, new Date("2027-05-06T00:00:00Z")), /^SLIDES Session \(/);
});
