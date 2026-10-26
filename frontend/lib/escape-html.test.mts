// Run with: node --test lib/escape-html.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { escapeHtml } = await import(
  new URL("./escape-html.ts", import.meta.url).href
);

test("escapes markup so injected script cannot execute", () => {
  const out = escapeHtml('<script>alert(1)</script><img src=x onerror="a()">');
  assert.ok(!out.includes("<"));
  assert.ok(!out.includes(">"));
  assert.ok(out.includes("&lt;script&gt;"));
  assert.ok(out.includes("&quot;"));
});

test("escapes ampersands first so entities are not double-decoded", () => {
  assert.equal(escapeHtml("a & b &lt;"), "a &amp; b &amp;lt;");
});

test("leaves plain text unchanged", () => {
  assert.equal(escapeHtml("Plain answer, 2 + 2 = 4."), "Plain answer, 2 + 2 = 4.");
});
