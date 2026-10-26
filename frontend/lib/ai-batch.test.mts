// Run with: node --test lib/ai-batch.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { batchPhase } = await import(new URL("./ai-batch.ts", import.meta.url).href);

test("terminal statuses are recognised whatever their case", () => {
  assert.equal(batchPhase("COMPLETED"), "ready");
  assert.equal(batchPhase("completed"), "ready");
  assert.equal(batchPhase("PARTIAL_FAILURE"), "ready");
  assert.equal(batchPhase("FAILED"), "failed");
});

test("PENDING and PROCESSING (as the API sends them) mean keep waiting, not 'no questions'", () => {
  assert.equal(batchPhase("PENDING"), "running");
  assert.equal(batchPhase("PROCESSING"), "running");
  assert.equal(batchPhase("pending"), "running");
});

test("missing or unknown statuses are treated as still running", () => {
  assert.equal(batchPhase(undefined), "running");
  assert.equal(batchPhase(null), "running");
  assert.equal(batchPhase("SOMETHING_NEW"), "running");
});
