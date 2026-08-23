// frontend/components/mindexa/study-reader/types.ts

export type ReaderSourceKind = "lecturer_material" | "student_resource";

export interface ReaderSource {
  kind: ReaderSourceKind;
  id: string;
  workspaceId?: string; // required for course materials; optional for personal
  title: string;
  mimeType: string;
  extension: string;
  academicResourceId?: string;
  downloadFilename?: string;
  courseCode?: string;
  courseTitle?: string;
}

export type ZoomMode = "fit-width" | "fit-page" | "custom";

export interface ReaderProgress {
  page: number;
  numPages: number;
  zoom: number; // percentage (e.g. 100, 125, 150)
  zoomMode: ZoomMode;
  rotation: number; // 0, 90, 180, 270
  twoPageView: boolean;
  lastReadAt: string;
}

export interface PdfOutlineItem {
  title: string;
  pageNumber?: number;
  dest?: string | any[];
  items?: PdfOutlineItem[];
}

export interface SearchMatch {
  pageNumber: number; // 1-indexed
  matchIndex: number;
  snippet: string;
  text: string;
}

// ── Phase 2 Types: Capture (Annotations, Key Points, AI Support) ────────────

export type AnnotationColor = "key_idea" | "definition" | "example" | "confused";
export type KeyPointTag = "definition" | "formula" | "process" | "exam_likely" | "other";
export type KeyPointConfidence = "got_it" | "fuzzy" | "lost";

export interface NormalizedRect {
  x: number; // 0..1 relative to page width
  y: number; // 0..1 relative to page height
  w: number; // 0..1
  h: number; // 0..1
  page: number;
}

export interface StudentAnnotation {
  id: string;
  student_id?: string;
  source_kind: ReaderSourceKind;
  source_id: string;
  page_number: number;
  color: AnnotationColor;
  selected_text: string;
  rects: NormalizedRect[];
  note_text?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface StudentKeyPoint {
  id: string;
  student_id?: string;
  source_kind: ReaderSourceKind;
  source_id: string;
  title: string;
  quote?: string | null;
  page_number: number;
  tag: KeyPointTag;
  confidence: KeyPointConfidence;
  annotation_id?: string | null;
  next_review_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SelectionRangeInfo {
  text: string;
  pageNumber: number;
  rects: NormalizedRect[];
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export interface SkimBullet {
  bullet: string;
  page_number?: number | null;
}

export interface SkimResponse {
  title: string;
  summary: string;
  bullets: SkimBullet[];
}

export interface RevisionSheetExport {
  source_id: string;
  source_kind: string;
  title: string;
  key_points: StudentKeyPoint[];
  annotations: StudentAnnotation[];
  markdown: string;
}

// ── Phase 3 Types: Focus (Weakness Engine & Page Check) ──────────────────────

export interface WeakQuestionContext {
  question_id: string;
  assessment_id: string;
  assessment_title: string;
  score?: number | null;
  max_score: number;
  stem_preview: string;
  feedback?: string | null;
  similarity: number;
}

export interface PageHeatItem {
  page_number: number;
  heat: number; // 0..1
  heat_level: "high" | "medium" | "low" | "none";
  weak_question_count: number;
  weak_questions: WeakQuestionContext[];
  key_point_count: number;
  annotation_count: number;
  summary_reason?: string | null;
}

export interface FocusNextRecommendation {
  start_page: number;
  end_page: number;
  title: string;
  reason: string;
  heat_level: "high" | "medium" | "low";
  question_id?: string | null;
  assessment_title?: string | null;
}

export interface FocusResponse {
  exam_mapping: boolean;
  source_kind: string;
  source_id: string;
  heatmap: PageHeatItem[];
  focus_next: FocusNextRecommendation[];
  spaced_reviews: StudentKeyPoint[];
  total_weak_points: number;
}

export interface PageCheckQuestion {
  id: string;
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
}

export interface PageCheckResponse {
  page_number: number;
  questions: PageCheckQuestion[];
}

export interface PageCheckAnswerItem {
  question_id: string;
  selected_option_index: number;
  selected_option_text?: string;
}

export interface PageCheckFeedbackItem {
  question_id: string;
  is_correct: boolean;
  selected_option_index: number;
  correct_option_index: number;
  explanation: string;
}

export interface PageCheckSubmitResponse {
  page_number: number;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  feedback: PageCheckFeedbackItem[];
  created_key_point_id?: string | null;
}

export interface ExamLensResponse {
  assessment_id: string;
  assessment_title: string;
  pages: PageHeatItem[];
}

export type ReaderSidebarTab = "outline" | "search" | "keypoints" | "ask" | "focus" | "check";
