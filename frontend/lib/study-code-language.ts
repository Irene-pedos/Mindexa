/**
 * Best-effort language label for a code example that arrives without a fenced block.
 *
 * Lesson examples are AI-generated and carry no language field, and they used to be labelled
 * "javascript" no matter what they were. This only picks the label shown on the code block (the
 * block does no syntax highlighting), so a wrong guess is cosmetic. It falls back to "text"
 * rather than inventing a language when nothing matches clearly.
 */
export function guessCodeLanguage(code: string): string {
  const source = code.trim();
  if (!source) return "text";

  // JSON: only if it actually parses.
  if (source.startsWith("{") || source.startsWith("[")) {
    try {
      JSON.parse(source);
      return "json";
    } catch {
      // not JSON; keep looking (it may be a JS object or array literal)
    }
  }

  // Markup
  if (/^<(!doctype|html|head|body|div|span|p|ul|ol|table|form|section|a|h[1-6]|script|style)\b/i.test(source)) {
    return "html";
  }

  // SQL needs a statement keyword and a clause keyword, so prose mentioning "select" is ignored.
  if (
    /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(
      source,
    ) &&
    /\b(FROM|INTO|TABLE|SET|VALUES|WHERE|INDEX|VIEW|DATABASE)\b/i.test(source) &&
    /;\s*$|\n/.test(source)
  ) {
    return "sql";
  }

  // C family
  if (/#include\s*[<"]|\bint\s+main\s*\(/.test(source)) return source.includes("std::") || source.includes("cout") ? "cpp" : "c";
  if (/\bpublic\s+(static\s+)?(class|void|int)\b|System\.out\.print/.test(source)) return "java";

  // JavaScript / TypeScript: definite markers
  if (/\b(const|let|var)\s+[\w${}[\],\s:<>|.]+\s*=|=>|\bfunction\s*\w*\s*\(|console\.(log|error)|\brequire\(|\bexport\s+(default|const|function)\b|document\.|window\./.test(source)) {
    return /:\s*(string|number|boolean|void)\b|\binterface\s+\w+\s*\{|<\w+>\(/.test(source) ? "typescript" : "javascript";
  }

  // Python: definite markers
  if (
    /^\s*(def\s+\w+\s*\(|class\s+\w+(\(.*\))?\s*:|elif\b|from\s+\w+(\.\w+)*\s+import\b|import\s+\w+(\s+as\s+\w+)?\s*$|if\s+__name__\s*==|print\(|for\s+\w+\s+in\s+.*:\s*$|self\.)/m.test(
      source,
    )
  ) {
    return "python";
  }

  // CSS
  if (/^[\s\S]*[.#@]?[\w-]+(\s*[>+~,]\s*[\w.#-]+)*\s*\{[^}]*:\s*[^}]*;?[^}]*\}/.test(source) && !/[()]\s*\{/.test(source.split("{")[0])) {
    return "css";
  }

  // Shell
  if (/^\s*(\$\s+|sudo\s|npm\s|npx\s|git\s|pip\s|cd\s|ls\b|curl\s|docker\s)/m.test(source)) return "bash";

  return "text";
}

/**
 * Whether a lesson example already contains markdown code fences, in which case it should be
 * rendered as markdown instead of being wrapped in a second block.
 */
export function hasCodeFence(code: string): boolean {
  return /^\s*```/m.test(code);
}
