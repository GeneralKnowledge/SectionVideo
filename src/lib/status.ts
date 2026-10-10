export const SOURCE_LABELS = [
  "Transcript available",
  "Chapters available",
  "Metadata only",
  "Manual review required",
  "Extraction failed",
] as const;

export type SourceLabel = (typeof SOURCE_LABELS)[number];

export function sourceLabels(input: {
  availability: string;
  retrievalError: string | null;
  transcript: "available" | "failed" | "none";
  chapterCount: number;
}): SourceLabel[] {
  const labels: SourceLabel[] = [];
  const failed = Boolean(input.retrievalError) || input.transcript === "failed";
  if (input.transcript === "available") labels.push("Transcript available");
  if (input.chapterCount > 0) labels.push("Chapters available");
  const blocked = ["deleted", "private", "unavailable", "age_restricted", "unknown"].includes(
    input.availability,
  );
  if (blocked) labels.push("Manual review required");
  if (failed) labels.push("Extraction failed");
  if (labels.length === 0) labels.push("Metadata only");
  return labels;
}
