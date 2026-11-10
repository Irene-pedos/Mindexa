// frontend/lib/api/marked-scripts.ts
// Marks export (Excel / CSV) and the archived marked papers (PDF / ZIP).
import { apiClient } from "./client";

export type MarksExportFormat = "xlsx" | "csv";

export interface MarkedScriptVersion {
  version: number;
  trigger: "RELEASE" | "CORRECTION" | "APPEAL" | "BACKFILL" | string;
  created_at: string;
  verification_code: string;
  total_score: number;
  max_score: number;
}

export interface MarkedScriptHistory {
  result_id: string;
  assessment_id: string;
  audience: "staff" | "student" | "reviewer";
  versions: MarkedScriptVersion[];
}

export interface ScriptVerification {
  found: boolean;
  code: string;
  intact?: boolean;
  version?: number;
  is_latest_version?: boolean;
  trigger?: string;
  created_at?: string;
  assessment_title?: string | null;
  course_code?: string | null;
  total_score?: number;
  max_score?: number;
}

/** Hand a downloaded blob to the browser as a file. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/** Make a title safe to use inside a file name. */
export function fileSafe(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+|[._]+$/g, "");
  return cleaned || "export";
}

export const markedScriptsApi = {
  /**
   * Marks sheet for one assessment. Released results only, unless
   * `includeUnreleased` is set (those rows are labelled in the file).
   */
  downloadMarksheet: async (
    assessmentId: string,
    options: { format: MarksExportFormat; includeUnreleased: boolean; title: string },
  ): Promise<void> => {
    const params = new URLSearchParams({ format: options.format });
    if (options.includeUnreleased) params.set("include_unreleased", "true");
    const blob = (await apiClient(
      `/lecturer/assessments/${assessmentId}/export/marksheet?${params.toString()}`,
      { responseType: "blob" },
    )) as Blob;
    saveBlob(blob, `${fileSafe(options.title)}_marks.${options.format}`);
  },

  getHistory: (attemptId: string): Promise<MarkedScriptHistory> =>
    apiClient(`/attempts/${attemptId}/script`),

  /** One student's archived marked paper as PDF (latest version unless given). */
  downloadPaper: async (
    attemptId: string,
    options: { version?: number; label: string },
  ): Promise<void> => {
    const query = options.version ? `?version=${options.version}` : "";
    const blob = (await apiClient(`/attempts/${attemptId}/script/pdf${query}`, {
      responseType: "blob",
    })) as Blob;
    const suffix = options.version ? `_v${options.version}` : "";
    saveBlob(blob, `${fileSafe(options.label)}_marked-paper${suffix}.pdf`);
  },

  /** Every released student's marked paper for an assessment, as one ZIP. */
  downloadBundle: async (assessmentId: string, title: string): Promise<void> => {
    const blob = (await apiClient(`/assessments/${assessmentId}/scripts/bundle`, {
      method: "POST",
      responseType: "blob",
    })) as Blob;
    saveBlob(blob, `${fileSafe(title)}_marked-papers.zip`);
  },

  verify: (code: string): Promise<ScriptVerification> =>
    apiClient(`/scripts/verify/${encodeURIComponent(code)}`),
};
