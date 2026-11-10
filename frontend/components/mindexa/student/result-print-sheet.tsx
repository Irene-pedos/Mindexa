"use client";

import React from "react";
import { format } from "date-fns";

import { formatLetterGrade } from "@/lib/letter-grade";
import { getQuestionTypeLabel } from "@/lib/grading-utils";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";

/**
 * The student's printed result slip.
 *
 * It is a separate, print-only layout with fixed light colours so a student in dark mode
 * still prints a clean black-on-white paper. It carries the institution's identity, the
 * student's details, the marks and grade, every question with the answer, the correct
 * answer and feedback, a repeating security footer, and a diagonal watermark that names
 * the student (so a photocopy or screenshot can be traced back to its owner).
 */

export interface PrintBreakdown {
  id: string;
  question_text?: string | null;
  question_type: string;
  section_title?: string | null;
  max_score: number;
  awarded_score?: number | null;
  score?: number | null;
  was_skipped?: boolean;
  student_answer?: string | null;
  student_answer_json?: unknown;
  correct_answer?: string | null;
  feedback?: string | null;
  options?: Array<{ id: string; text?: string | null; content?: string | null }> | null;
}

export interface PrintableResult {
  assessment_title: string | null;
  assessment_type?: string | null;
  institution_name?: string | null;
  institution_logo_url?: string | null;
  college_name?: string | null;
  department_name?: string | null;
  option_name?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  class_name?: string | null;
  academic_level?: string | null;
  academic_year?: string | null;
  duration_minutes?: number | null;
  submitted_at?: string | null;
  released_at: string | null;
  total_score: number;
  max_score: number;
  percentage: number;
  letter_grade: string | null;
  is_passing: boolean;
  integrity_hold: boolean;
  is_post_release_corrected?: boolean;
  post_release_corrected_at?: string | null;
  is_group_result?: boolean;
  group_name?: string | null;
  group_feedback?: string | null;
  breakdowns: PrintBreakdown[];
}

interface ResultPrintSheetProps {
  result: PrintableResult;
  assessmentTypeLabel: string;
  studentName: string;
  studentNumber?: string | null;
  /** Code from the archived copy, so the printed paper can be checked later. */
  verificationCode?: string | null;
}

const INK = "#0f172a";
const MUTED = "#475569";
const LINE = "#cbd5e1";
const ACCENT = "#1f4e79";
const GOOD = "#047857";
const WARN = "#b45309";
const BAD = "#be123c";

function date(iso?: string | null, withTime = false): string {
  if (!iso) return "-";
  try {
    return format(new Date(iso), withTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy");
  } catch {
    return "-";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function plain(value: unknown): string {
  return String(value ?? "").replace(/\*\*/g, "");
}

/**
 * Matching / ordering / fill-in / case-study answers arrive as JSON keyed by ids.
 * Print them as readable lines: option ids become the option's text, and ids that
 * cannot be resolved (case-study parts) become "Part n".
 */
function answerLines(item: PrintBreakdown): string[] {
  const names = new Map<string, string>();
  for (const o of item.options ?? []) names.set(o.id, plain(o.text ?? o.content ?? ""));
  const name = (value: unknown): string => {
    const key = String(value);
    return names.get(key) ?? (UUID_RE.test(key) ? "" : plain(key));
  };

  const json = item.student_answer_json;
  if (json && typeof json === "object") {
    if (Array.isArray(json)) {
      return json.map((entry, i) =>
        entry && typeof entry === "object"
          ? Object.entries(entry as Record<string, unknown>)
              .map(([k, v]) => `${k}: ${plain(v)}`)
              .join(", ")
          : `${i + 1}. ${name(entry) || plain(entry)}`,
      );
    }
    const entries = Object.entries(json as Record<string, unknown>);
    if (entries.length) {
      return entries.map(([k, v], i) => {
        const label = name(k) || `Part ${i + 1}`;
        return `${label}: ${name(v) || plain(v)}`;
      });
    }
  }
  return item.student_answer ? plain(item.student_answer).split("\n") : [];
}

function watermarkUrl(label: string): string {
  const safe = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260">` +
    `<g transform="rotate(-28 210 130)" font-family="Arial, Helvetica, sans-serif" font-size="15" ` +
    `font-weight="700" fill="${INK}" fill-opacity="0.07" text-anchor="middle">` +
    `<text x="210" y="120">${safe}</text>` +
    `<text x="210" y="142">MINDEXA OFFICIAL RESULT</text></g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function marksColour(score: number | null | undefined, max: number, skipped?: boolean): string {
  if (skipped || score === null || score === undefined || score <= 0) return BAD;
  return score >= max ? GOOD : WARN;
}

export function ResultPrintSheet({
  result,
  assessmentTypeLabel,
  studentName,
  studentNumber,
  verificationCode,
}: ResultPrintSheetProps) {
  const pct = Math.round(result.percentage || 0);
  const printedOn = format(new Date(), "d MMM yyyy, HH:mm");

  // Marks per section (or question type), as on the screen version.
  const sections = new Map<string, { score: number; max: number }>();
  for (const item of result.breakdowns) {
    const key = item.section_title || getQuestionTypeLabel(item.question_type);
    const entry = sections.get(key) ?? { score: 0, max: 0 };
    entry.score += item.awarded_score ?? item.score ?? 0;
    entry.max += item.max_score ?? 0;
    sections.set(key, entry);
  }

  const details: Array<[string, string]> = [
    ["Student", studentName || "-"],
    ["Student no.", studentNumber || "-"],
    ["Course", [result.course_code, result.course_name].filter(Boolean).join(" - ") || "-"],
    ["Assessment", `${result.assessment_title ?? "-"} (${assessmentTypeLabel})`],
    ["Programme", [result.department_name, result.option_name].filter(Boolean).join(" / ") || "-"],
    ["Class / level", [result.class_name, result.academic_level].filter(Boolean).join(" / ") || "-"],
    ["Academic year", result.academic_year || "-"],
    ["Duration", result.duration_minutes ? `${result.duration_minutes} minutes` : "-"],
    ["Submitted", date(result.submitted_at, true)],
    ["Results released", date(result.released_at, true)],
  ];

  const cell: React.CSSProperties = { padding: "3px 8px", verticalAlign: "top", fontSize: 11 };

  return (
    <div
      className="result-print-sheet hidden print:block"
      style={{
        color: INK,
        background: "#ffffff",
        fontFamily: "Arial, Helvetica, sans-serif",
        position: "relative",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Security watermark: repeats on every page and names the student */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: watermarkUrl(
            [studentName, studentNumber].filter(Boolean).join(" · ") || "STUDENT COPY",
          ),
          backgroundRepeat: "repeat",
        }}
      />

      <table style={{ width: "100%", borderCollapse: "collapse", position: "relative", zIndex: 1 }}>
        <tbody>
          <tr>
            <td style={{ padding: 0 }}>
              {/* Letterhead */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  borderBottom: `2px solid ${ACCENT}`,
                  paddingBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {result.institution_logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.institution_logo_url}
                      alt=""
                      style={{ height: 54, width: "auto", maxWidth: 120, objectFit: "contain" }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {result.institution_name || "Institution"}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED }}>
                      {[result.college_name, result.department_name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT, letterSpacing: 1, whiteSpace: "nowrap" }}>
                    RESULT SLIP
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap" }}>Printed {printedOn}</div>
                </div>
              </div>

              {/* Student and assessment details */}
              <table
                style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, border: `1px solid ${LINE}` }}
              >
                <tbody>
                  {[0, 2, 4, 6, 8].map((i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                      {[details[i], details[i + 1]].map(([label, value]) => (
                        <React.Fragment key={label}>
                          <td style={{ ...cell, width: "16%", color: MUTED, background: "#f1f5f9" }}>{label}</td>
                          <td style={{ ...cell, width: "34%", fontWeight: 600 }}>{value}</td>
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Result */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  marginTop: 10,
                  border: `1.5px solid ${ACCENT}`,
                  background: "#f1f5fa",
                  textAlign: "center",
                }}
              >
                <tbody>
                  <tr>
                    {[
                      ["TOTAL", `${result.total_score} / ${result.max_score}`],
                      ["PERCENTAGE", `${pct}%`],
                      ["GRADE", formatLetterGrade(result.letter_grade)],
                      ["OUTCOME", result.is_passing ? "PASS" : "NOT PASSED"],
                    ].map(([label, value], idx) => (
                      <td
                        key={label}
                        style={{ padding: "8px 4px", borderLeft: idx ? `1px solid ${LINE}` : undefined }}
                      >
                        <div style={{ fontSize: 9, letterSpacing: 1, color: MUTED }}>{label}</div>
                        <div
                          style={{
                            fontSize: 17,
                            fontWeight: 700,
                            color: label === "OUTCOME" ? (result.is_passing ? GOOD : BAD) : INK,
                          }}
                        >
                          {value}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>

              {(result.is_post_release_corrected || result.integrity_hold) && (
                <p style={{ fontSize: 10.5, color: WARN, margin: "6px 0 0" }}>
                  {result.integrity_hold
                    ? "Provisional: this result is under routine moderation and may change."
                    : `Marks were adjusted after review${
                        result.post_release_corrected_at ? ` on ${date(result.post_release_corrected_at)}` : ""
                      }.`}
                </p>
              )}

              {/* Marks by section */}
              {sections.size > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                  <thead>
                    <tr style={{ background: ACCENT, color: "#ffffff" }}>
                      <th style={{ ...cell, textAlign: "left" }}>Section</th>
                      <th style={{ ...cell, textAlign: "right", width: 90 }}>Marks</th>
                      <th style={{ ...cell, textAlign: "right", width: 70 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(sections, ([name, s]) => (
                      <tr key={name} style={{ borderBottom: `1px solid ${LINE}` }}>
                        <td style={cell}>{name}</td>
                        <td style={{ ...cell, textAlign: "right" }}>
                          {s.score} / {s.max}
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>
                          {s.max > 0 ? Math.round((s.score / s.max) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {result.is_group_result && (
                <p style={{ fontSize: 11, margin: "10px 0 0" }}>
                  <strong>Group:</strong> {result.group_name || "Assigned team"}
                  {result.group_feedback ? ` — ${result.group_feedback}` : ""}
                </p>
              )}

              {/* Questions */}
              {result.breakdowns.length > 0 && (
                <h2 style={{ fontSize: 13, margin: "16px 0 6px", color: ACCENT }}>
                  Questions, answers and feedback
                </h2>
              )}
              {result.breakdowns.map((item, idx) => {
                const score = item.awarded_score ?? item.score;
                const lines = answerLines(item);
                return (
                  <div
                    key={item.id}
                    style={{
                      border: `1px solid ${LINE}`,
                      borderRadius: 4,
                      marginBottom: 8,
                      breakInside: "avoid",
                      pageBreakInside: "avoid",
                      background: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        background: "#e8eef6",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      <span>
                        Question {idx + 1}{" "}
                        <span style={{ fontWeight: 400, color: MUTED }}>
                          · {getQuestionTypeLabel(item.question_type)}
                          {item.section_title ? ` · ${item.section_title}` : ""}
                        </span>
                      </span>
                      <span style={{ color: marksColour(score, item.max_score, item.was_skipped) }}>
                        {item.was_skipped ? "Skipped" : score ?? "-"} / {item.max_score}
                      </span>
                    </div>
                    <div style={{ padding: "6px 8px", fontSize: 11, lineHeight: 1.45 }}>
                      {item.question_text && (
                        <div style={{ marginBottom: 4 }}>{renderRichMathText(item.question_text)}</div>
                      )}
                      <div>
                        <strong>Your answer:</strong>{" "}
                        {item.was_skipped || lines.length === 0 ? (
                          <em style={{ color: MUTED }}>No answer given</em>
                        ) : (
                          lines.map((line, i) => (
                            <div key={i} style={{ paddingLeft: 8 }}>
                              {line}
                            </div>
                          ))
                        )}
                      </div>
                      {item.correct_answer && (
                        <div style={{ marginTop: 3 }}>
                          <strong style={{ color: GOOD }}>Correct answer:</strong> {item.correct_answer}
                        </div>
                      )}
                      {item.feedback && (
                        <div style={{ marginTop: 3 }}>
                          <strong>Feedback:</strong> {renderRichMathText(item.feedback)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </td>
          </tr>
        </tbody>
        {/* Repeats at the bottom of every printed page */}
        <tfoot>
          <tr>
            <td style={{ paddingTop: 8 }}>
              <div
                style={{
                  borderTop: `1px solid ${LINE}`,
                  paddingTop: 4,
                  fontSize: 8.5,
                  color: MUTED,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>
                  Issued by Mindexa for {studentName || "the student"}
                  {studentNumber ? ` (${studentNumber})` : ""}. Valid only with the verification code.
                </span>
                <span>
                  {verificationCode ? `Verification code: ${verificationCode}` : "Unverified copy"}
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
