import { containsKeyword, normaliseText } from "./keywords";
import { safetyFlagsFor, type SafetyFlag } from "./welfare";

export type LessonProfile = {
  lessonId: string;
  lessonKind: "exercise" | "guide";
  title: string;
  learningObjectiveLabel?: string | null;
  keywords: string[];
  lifeStages: string[];
  prerequisiteIds: string[];
};

export type TimedText = {
  ref: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type SuggestionDraft = {
  lessonId: string;
  lessonKind: "exercise" | "guide";
  startSeconds: number | null;
  endSeconds: number | null;
  timingGrounded: boolean;
  evidenceKind: "transcript" | "chapter" | "description" | "title" | "notes";
  evidenceText: string;
  evidenceRefs: string[];
  explanation: string;
  confidence: number;
  stageMismatch: string | null;
  prerequisiteNote: string | null;
  safetyFlags: SafetyFlag[];
  provider: "deterministic" | "llm";
};

const KIND_RANK = {
  transcript: 4,
  chapter: 3,
  notes: 2,
  description: 1,
  title: 0,
} as const;

function scoreText(text: string, keywords: string[]): { score: number; hits: string[] } {
  const hits: string[] = [];
  let score = 0;
  for (const keyword of keywords) {
    if (!containsKeyword(text, keyword)) continue;
    hits.push(keyword);
    score += keyword.includes(" ") ? 4 : keyword.length >= 8 ? 2 : 1;
  }
  return { score, hits };
}

function stageMismatch(lifeStages: string[], text: string): string | null {
  if (lifeStages.length === 0) return null;
  const mentionsPuppy = /\bpupp(?:y|ies)\b/i.test(text);
  const allowsPuppy = lifeStages.includes("young_puppy") || lifeStages.includes("older_puppy");
  if (mentionsPuppy && !allowsPuppy) {
    return "The lesson is not listed for puppies, but this passage mentions a puppy.";
  }
  return null;
}

function explanation(lesson: LessonProfile, kind: string, hits: string[]): string {
  const shown = hits.slice(0, 4).map((hit) => `“${hit}”`).join(", ");
  return `Editorial match only — this is not a quotation of trainer advice. The ${kind} overlaps ${lesson.title} (${lesson.lessonId}) through ${shown}.`;
}

function confidenceFor(score: number, kind: SuggestionDraft["evidenceKind"]): number {
  const base = kind === "transcript" ? 0.42 : kind === "chapter" ? 0.36 : 0.22;
  return Math.round(Math.min(0.9, base + Math.min(0.45, score * 0.04)) * 100) / 100;
}

function transcriptWindows(segments: TimedText[]): TimedText[] {
  const windows: TimedText[] = [];
  for (let start = 0; start < segments.length; start += 1) {
    for (let end = start; end < segments.length && end < start + 8; end += 1) {
      const slice = segments.slice(start, end + 1);
      const first = slice[0];
      const last = slice[slice.length - 1];
      if (!first || !last) continue;
      const duration = last.endSeconds - first.startSeconds;
      if (duration > 90) break;
      if (duration < 8 && slice.length < 2) continue;
      windows.push({
        ref: slice.map((item) => item.ref).join(","),
        startSeconds: first.startSeconds,
        endSeconds: last.endSeconds,
        text: slice.map((item) => item.text).join(" "),
      });
    }
  }
  return windows;
}

function better(a: SuggestionDraft, b: SuggestionDraft): boolean {
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  const rank = KIND_RANK[a.evidenceKind] - KIND_RANK[b.evidenceKind];
  if (rank !== 0) return rank > 0;
  const aDuration = (a.endSeconds ?? Number.MAX_SAFE_INTEGER) - (a.startSeconds ?? 0);
  const bDuration = (b.endSeconds ?? Number.MAX_SAFE_INTEGER) - (b.startSeconds ?? 0);
  return aDuration < bDuration;
}

function overlaps(a: SuggestionDraft, b: SuggestionDraft): boolean {
  if (a.lessonId !== b.lessonId || a.lessonKind !== b.lessonKind) return false;
  if (a.startSeconds == null || b.startSeconds == null) return true;
  const aEnd = a.endSeconds ?? a.startSeconds + 1;
  const bEnd = b.endSeconds ?? b.startSeconds + 1;
  return a.startSeconds < bEnd && b.startSeconds < aEnd;
}

export function dedupeSuggestions(drafts: SuggestionDraft[]): SuggestionDraft[] {
  const kept: SuggestionDraft[] = [];
  const ordered = [...drafts].sort((a, b) => (better(a, b) ? -1 : 1));
  for (const draft of ordered) {
    const clash = kept.find((item) => overlaps(item, draft));
    if (!clash) kept.push(draft);
  }
  const groundedLessons = new Set(
    kept.filter((item) => item.timingGrounded).map((item) => `${item.lessonKind}:${item.lessonId}`),
  );
  return kept
    .filter((item) => item.timingGrounded || !groundedLessons.has(`${item.lessonKind}:${item.lessonId}`))
    .sort((a, b) => (better(a, b) ? -1 : 1));
}

function draftFrom(input: {
  lesson: LessonProfile;
  kind: SuggestionDraft["evidenceKind"];
  text: string;
  refs: string[];
  startSeconds: number | null;
  endSeconds: number | null;
  grounded: boolean;
  score: number;
  hits: string[];
}): SuggestionDraft | null {
  if (input.score < 4 && !input.hits.some((hit) => hit.includes(" "))) return null;
  if (input.hits.length === 0) return null;
  const mismatch = stageMismatch(input.lesson.lifeStages, input.text);
  const excerpt = input.text.replace(/\s+/g, " ").trim().slice(0, 500);
  return {
    lessonId: input.lesson.lessonId,
    lessonKind: input.lesson.lessonKind,
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    timingGrounded: input.grounded,
    evidenceKind: input.kind,
    evidenceText: excerpt,
    evidenceRefs: input.refs,
    explanation: explanation(input.lesson, input.kind, input.hits),
    confidence: confidenceFor(input.score, input.kind),
    stageMismatch: mismatch,
    prerequisiteNote:
      input.lesson.prerequisiteIds.length > 0
        ? `Prerequisites recorded in Good Dog: ${input.lesson.prerequisiteIds.join(", ")}.`
        : null,
    safetyFlags: safetyFlagsFor(input.text, Boolean(mismatch)),
    provider: "deterministic",
  };
}

export function suggestMatches(input: {
  lessons: LessonProfile[];
  segments: TimedText[];
  chapters: TimedText[];
  title: string;
  description: string;
  notes?: string;
}): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];
  const windows = transcriptWindows(input.segments);

  for (const lesson of input.lessons) {
    let bestWindow: { window: TimedText; score: number; hits: string[] } | null = null;
    for (const window of windows) {
      const scored = scoreText(window.text, lesson.keywords);
      if (!bestWindow || scored.score > bestWindow.score || (scored.score === bestWindow.score && window.endSeconds - window.startSeconds < bestWindow.window.endSeconds - bestWindow.window.startSeconds)) {
        if (scored.score > 0) bestWindow = { window, ...scored };
      }
    }
    if (bestWindow) {
      const draft = draftFrom({
        lesson,
        kind: "transcript",
        text: bestWindow.window.text,
        refs: bestWindow.window.ref.split(",").filter(Boolean),
        startSeconds: bestWindow.window.startSeconds,
        endSeconds: bestWindow.window.endSeconds,
        grounded: true,
        score: bestWindow.score,
        hits: bestWindow.hits,
      });
      if (draft) drafts.push(draft);
    }

    for (const chapter of input.chapters) {
      const scored = scoreText(chapter.text, lesson.keywords);
      const draft = draftFrom({
        lesson,
        kind: "chapter",
        text: chapter.text,
        refs: [chapter.ref],
        startSeconds: chapter.startSeconds,
        endSeconds: chapter.endSeconds,
        grounded: true,
        score: scored.score,
        hits: scored.hits,
      });
      if (draft) drafts.push(draft);
    }

    const described = scoreText(`${input.title}\n${input.description}`, lesson.keywords);
    const descriptionDraft = draftFrom({
      lesson,
      kind: input.description ? "description" : "title",
      text: `${input.title}. ${input.description}`.trim(),
      refs: ["metadata"],
      startSeconds: null,
      endSeconds: null,
      grounded: false,
      score: described.score,
      hits: described.hits,
    });
    if (descriptionDraft) drafts.push(descriptionDraft);

    if (input.notes) {
      const noted = scoreText(input.notes, lesson.keywords);
      const timed = input.notes.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
      const noteDraft = draftFrom({
        lesson,
        kind: "notes",
        text: input.notes,
        refs: ["notes"],
        startSeconds: null,
        endSeconds: null,
        grounded: false,
        score: noted.score,
        hits: noted.hits,
      });
      if (noteDraft && timed) {
        drafts.push({ ...noteDraft, timingGrounded: false });
      } else if (noteDraft) {
        drafts.push(noteDraft);
      }
    }
  }

  return dedupeSuggestions(drafts).slice(0, 12);
}

export function evidenceIsRelevant(text: string, quote: string): boolean {
  return normaliseText(text).includes(normaliseText(quote));
}
