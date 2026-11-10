// Run with: node --test lib/study-code-language.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";

const { guessCodeLanguage, hasCodeFence } = await import(
  new URL("./study-code-language.ts", import.meta.url).href
);

test("javascript is recognised, including object and array literals that are not JSON", () => {
  assert.equal(guessCodeLanguage("const total = items.reduce((a, b) => a + b, 0);"), "javascript");
  assert.equal(guessCodeLanguage("console.log('hi');"), "javascript");
  assert.equal(guessCodeLanguage("function add(a, b) {\n  return a + b;\n}"), "javascript");
  assert.equal(guessCodeLanguage("[1, 2, 3].map(n => n * 2)"), "javascript");
});

test("typescript is told apart from javascript by its type annotations", () => {
  assert.equal(guessCodeLanguage("const n: number = 5;"), "typescript");
  assert.equal(guessCodeLanguage("interface User {\n  id: string;\n}\nconst u = (x) => x;"), "typescript");
});

test("python is no longer labelled javascript", () => {
  assert.equal(guessCodeLanguage("def add(a, b):\n    return a + b"), "python");
  assert.equal(guessCodeLanguage("import numpy as np"), "python");
  assert.equal(guessCodeLanguage("for i in range(3):\n    print(i)"), "python");
  assert.equal(guessCodeLanguage("class Stack:\n    def __init__(self):\n        self.items = []"), "python");
});

test("sql needs a statement and a clause, so ordinary prose is not sql", () => {
  assert.equal(guessCodeLanguage("SELECT name FROM users WHERE id = 1;"), "sql");
  assert.equal(guessCodeLanguage("CREATE TABLE users (\n  id INT PRIMARY KEY\n);"), "sql");
  assert.notEqual(guessCodeLanguage("Select the best option from the list"), "sql");
});

test("json only when it really parses", () => {
  assert.equal(guessCodeLanguage('{"a": 1, "b": [2, 3]}'), "json");
  assert.equal(guessCodeLanguage("[1, 2, 3]"), "json");
  assert.notEqual(guessCodeLanguage("{ a: 1 }"), "json");
});

test("markup, css, c family, java and shell", () => {
  assert.equal(guessCodeLanguage("<div class=\"box\">Hi</div>"), "html");
  assert.equal(guessCodeLanguage(".container {\n  width: 100%;\n}"), "css");
  assert.equal(guessCodeLanguage("#include <stdio.h>\nint main() { return 0; }"), "c");
  assert.equal(guessCodeLanguage("#include <iostream>\nint main() { std::cout << 1; }"), "cpp");
  assert.equal(guessCodeLanguage("public class Main {\n  public static void main(String[] a) {}\n}"), "java");
  assert.equal(guessCodeLanguage("git commit -m 'msg'"), "bash");
});

test("formulas, pseudocode and empty input fall back to plain text instead of a wrong language", () => {
  assert.equal(guessCodeLanguage("E = mc^2"), "text");
  assert.equal(guessCodeLanguage("x = (-b ± sqrt(b^2 - 4ac)) / 2a"), "text");
  assert.equal(guessCodeLanguage("BEGIN\n  total <- 0\nEND"), "text");
  assert.equal(guessCodeLanguage("   "), "text");
});

test("already-fenced examples are detected so they are not wrapped twice", () => {
  assert.equal(hasCodeFence("```python\nprint(1)\n```"), true);
  assert.equal(hasCodeFence("Explanation first\n```sql\nSELECT 1;\n```"), true);
  assert.equal(hasCodeFence("print(1)"), false);
});
