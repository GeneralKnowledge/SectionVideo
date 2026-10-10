import { describe, expect, it } from "vitest";
import { buildMatchingPrompt, validateLlmMatches } from "./llm";

const context = {
  videoId: "MOCKLEAD001",
  lessons: [{ lessonId: "ex-lead-loose", lessonKind: "exercise" as const, title: "Loose-lead walking foundations" }],
  windows: [{ startSeconds: 45, endSeconds: 90, text: "Reward the loose lead and wait for slack." }],
};

describe("LLM output validation", () => {
  it("accepts a grounded match and labels it as editorial", () => {
    const decision = validateLlmMatches(
      {
        matches: [
          {
            lessonId: "ex-lead-loose",
            lessonKind: "exercise",
            videoId: "MOCKLEAD001",
            startSeconds: 45,
            endSeconds: 90,
            evidenceQuote: "loose lead",
            explanation: "Shows the slack-lead moment.",
            confidence: 0.8,
            safetyConcerns: [],
          },
        ],
      },
      context,
    );
    expect(decision.rejected).toHaveLength(0);
    expect(decision.accepted[0]?.provider).toBe("llm");
    expect(decision.accepted[0]?.explanation).toMatch(/not a certification/i);
  });

  it("rejects hallucinated timestamps and unknown lessons", () => {
    const decision = validateLlmMatches(
      {
        matches: [
          {
            lessonId: "ex-made-up",
            lessonKind: "exercise",
            videoId: "MOCKLEAD001",
            startSeconds: 45,
            endSeconds: 50,
            evidenceQuote: "loose lead",
            explanation: "Nope",
            confidence: 0.4,
            safetyConcerns: [],
          },
          {
            lessonId: "ex-lead-loose",
            lessonKind: "exercise",
            videoId: "MOCKLEAD001",
            startSeconds: 999,
            endSeconds: 1000,
            evidenceQuote: "loose lead",
            explanation: "Invented time",
            confidence: 0.4,
            safetyConcerns: [],
          },
        ],
      },
      context,
    );
    expect(decision.accepted).toHaveLength(0);
    expect(decision.rejected.map((item) => item.reason).join(" ")).toMatch(/unknown lesson/i);
    expect(decision.rejected.map((item) => item.reason).join(" ")).toMatch(/evidence window/i);
  });

  it("rejects a response that is not the expected JSON shape", () => {
    const decision = validateLlmMatches({ matches: [{ lessonId: "ex-lead-loose" }] }, context);
    expect(decision.accepted).toHaveLength(0);
    expect(decision.rejected[0]?.reason).toMatch(/JSON shape/);
  });

  it("tells the model not to invent timestamps", () => {
    expect(buildMatchingPrompt(context)).toMatch(/Do not invent timestamps/);
    expect(buildMatchingPrompt(context)).toContain("ex-lead-loose");
    expect(buildMatchingPrompt(context)).toContain("45");
  });
});
