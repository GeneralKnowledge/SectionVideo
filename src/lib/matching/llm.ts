import { z } from "zod";
import type { SuggestionDraft } from "./deterministic";
import { evidenceIsRelevant } from "./deterministic";
import { safetyFlagsFor } from "./welfare";

const matchSchema = z.object({
  lessonId: z.string().min(1),
  lessonKind: z.enum(["exercise", "guide"]),
  videoId: z.string().min(1),
  startSeconds: z.number().int().nonnegative(),
  endSeconds: z.number().int().positive().nullable(),
  evidenceQuote: z.string().min(1).max(500),
  explanation: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
  safetyConcerns: z.array(z.string().max(200)).max(8),
});

const responseSchema = z.object({
  matches: z.array(matchSchema).max(12),
});

export type EvidenceWindow = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type LlmContext = {
  videoId: string;
  lessons: Array<{ lessonId: string; lessonKind: "exercise" | "guide"; title: string }>;
  windows: EvidenceWindow[];
};

export type LlmDecision = {
  accepted: SuggestionDraft[];
  rejected: Array<{ reason: string }>;
};

export function buildMatchingPrompt(context: LlmContext): string {
  return [
    "You match dog-training video evidence to existing Good Dog lessons.",
    "Return JSON only: {\"matches\":[...]}.",
    "Use only lessonId and lessonKind values from the catalogue.",
    "Use only the videoId provided.",
    "Every startSeconds and endSeconds must fall inside one supplied evidence window.",
    "Do not invent timestamps. If a window has no useful match, return no match for it.",
    "evidenceQuote must be copied from that window.",
    "explanation is editorial commentary, not a claim that a trainer said those words, and not a certification of the trainer.",
    `videoId: ${context.videoId}`,
    `catalogue: ${JSON.stringify(context.lessons)}`,
    `windows: ${JSON.stringify(context.windows)}`,
  ].join("\n");
}

function coveringWindow(match: z.infer<typeof matchSchema>, windows: EvidenceWindow[]) {
  return windows.find(
    (window) =>
      match.startSeconds >= window.startSeconds &&
      match.startSeconds < window.endSeconds &&
      (match.endSeconds === null ||
        (match.endSeconds > match.startSeconds && match.endSeconds <= window.endSeconds)),
  );
}

export function validateLlmMatches(raw: unknown, context: LlmContext): LlmDecision {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      accepted: [],
      rejected: [{ reason: "The model response was not the expected JSON shape." }],
    };
  }

  const accepted: SuggestionDraft[] = [];
  const rejected: Array<{ reason: string }> = [];
  const known = new Set(context.lessons.map((lesson) => `${lesson.lessonKind}:${lesson.lessonId}`));

  for (const match of parsed.data.matches) {
    if (match.videoId !== context.videoId) {
      rejected.push({ reason: `Rejected a match for unknown video ${match.videoId}.` });
      continue;
    }
    if (!known.has(`${match.lessonKind}:${match.lessonId}`)) {
      rejected.push({ reason: `Rejected unknown lesson ${match.lessonId}.` });
      continue;
    }
    const window = coveringWindow(match, context.windows);
    if (!window) {
      rejected.push({
        reason: `Rejected ${match.lessonId} because ${match.startSeconds}s is not inside a supplied evidence window.`,
      });
      continue;
    }
    if (!evidenceIsRelevant(window.text, match.evidenceQuote)) {
      rejected.push({ reason: `Rejected ${match.lessonId} because the quote is not in the evidence window.` });
      continue;
    }
    const lesson = context.lessons.find(
      (item) => item.lessonId === match.lessonId && item.lessonKind === match.lessonKind,
    );
    accepted.push({
      lessonId: match.lessonId,
      lessonKind: match.lessonKind,
      startSeconds: match.startSeconds,
      endSeconds: match.endSeconds,
      timingGrounded: true,
      evidenceKind: "transcript",
      evidenceText: match.evidenceQuote,
      evidenceRefs: ["llm-window"],
      explanation: `Editorial suggestion from the configured model, not trainer certification and not a transcript quote. ${match.explanation}`,
      confidence: Math.round(match.confidence * 100) / 100,
      stageMismatch: null,
      prerequisiteNote: null,
      safetyFlags: safetyFlagsFor(`${window.text}\n${match.safetyConcerns.join(" ")}`),
      provider: "llm",
    });
    const created = accepted[accepted.length - 1];
    if (lesson && created) {
      created.explanation = `Editorial suggestion from the configured model for ${lesson.title} (${lesson.lessonId}). This is not a certification and not a verbatim trainer instruction. ${match.explanation}`;
    }
  }

  return { accepted, rejected };
}

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? trimmed;
  return JSON.parse(body);
}
