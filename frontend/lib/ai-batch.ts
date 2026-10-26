/**
 * AI question-generation batches are produced by a background worker, so a batch is only
 * usable once it reaches a terminal status. The API sends statuses in upper case
 * (PENDING, PROCESSING, COMPLETED, PARTIAL_FAILURE, FAILED); compare case-insensitively.
 */

export type BatchPhase = "running" | "ready" | "failed";

export function batchPhase(status: string | null | undefined): BatchPhase {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
    case "partial_failure":
      return "ready";
    case "failed":
      return "failed";
    // pending, processing, or anything unrecognised: keep waiting rather than reading the
    // (still empty) question list as "the AI returned nothing".
    default:
      return "running";
  }
}
