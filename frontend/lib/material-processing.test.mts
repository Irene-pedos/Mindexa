// Run with: node --test lib/material-processing.test.mts
import assert from "node:assert/strict"
import { test } from "node:test"

const M = await import(new URL("./material-processing.ts", import.meta.url).href)

test("an indexed material is ready and shows its section count", () => {
  const v = M.materialView({ processing_status: "PROCESSED", chunk_count: 12, file_extension: ".pdf" })
  assert.equal(v.phase, "ready")
  assert.match(v.label, /12 sections/)
  assert.equal(v.active, false)
})

test("a working material shows its step and percent and keeps polling", () => {
  const v = M.materialView({ processing_status: "PROCESSING", processing_stage: "EMBEDDING", processing_progress: 45, file_extension: ".pdf" })
  assert.equal(v.phase, "working")
  assert.equal(v.percent, 45)
  assert.equal(v.label, "Creating AI embeddings · 45%")
  assert.equal(v.active, true)
})

test("a queued or retrying material is waiting, not failed", () => {
  assert.equal(M.materialView({ processing_status: "PENDING", processing_stage: "QUEUED" }).phase, "waiting")
  const retry = M.materialView({ processing_status: "PROCESSING", processing_stage: "RETRYING", processing_progress: 30 })
  assert.equal(retry.phase, "waiting")
  assert.match(retry.label, /Trying again automatically/)
  assert.equal(retry.active, true)
})

test("a failed material carries the server's message and stops polling", () => {
  const v = M.materialView({ processing_status: "FAILED", processing_error: "Could not be indexed right now." })
  assert.equal(v.phase, "failed")
  assert.equal(v.label, "Could not be indexed right now.")
  assert.equal(v.active, false)
})

test("images are never shown as failed", () => {
  const v = M.materialView({ processing_status: "FAILED", file_extension: ".PNG" })
  assert.equal(v.phase, "ready")
})

test("percent is clamped and anyActive looks at every material", () => {
  assert.equal(M.materialView({ processing_status: "PROCESSING", processing_progress: 250 }).percent, 100)
  assert.equal(M.anyActive([{ processing_status: "PROCESSED" }, { processing_status: "PENDING" }]), true)
  assert.equal(M.anyActive([{ processing_status: "PROCESSED" }, { processing_status: "FAILED" }]), false)
})

test("upload validation explains the problem before sending", () => {
  const file = (name: string, size: number) => ({ name, size }) as File
  assert.equal(M.validateUploadFile(file("a.pdf", 1000)), null)
  assert.match(M.validateUploadFile(file("a.pdf", 0)) ?? "", /empty/)
  assert.match(M.validateUploadFile(file("a.pdf", 101 * 1024 * 1024)) ?? "", /over 100 MB/)
  assert.match(M.validateUploadFile(file("a.exe", 10)) ?? "", /Upload a PDF/)
  assert.equal(M.formatBytes(1536), "2 KB")
  assert.equal(M.formatBytes(5 * 1024 * 1024), "5.0 MB")
})
