// Run with: node --test lib/letter-grade.test.mts
import assert from "node:assert/strict"
import { test } from "node:test"

const { formatLetterGrade } = await import(new URL("./letter-grade.ts", import.meta.url).href)

test("enum names become conventional letter grades", () => {
  assert.equal(formatLetterGrade("A_PLUS"), "A+")
  assert.equal(formatLetterGrade("B_MINUS"), "B-")
  assert.equal(formatLetterGrade("C"), "C")
  assert.equal(formatLetterGrade("F"), "F")
})

test("already formatted or missing grades are safe", () => {
  assert.equal(formatLetterGrade("A+"), "A+")
  assert.equal(formatLetterGrade(null), "—")
  assert.equal(formatLetterGrade(undefined), "—")
  assert.equal(formatLetterGrade(""), "—")
})
