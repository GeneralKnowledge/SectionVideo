import { describe, expect, it } from "vitest";
import { loadCurriculumSnapshot } from "@/lib/curriculum/snapshot";
import { FIXTURE_LOOSE_LEAD_VTT } from "@/lib/fixtures/dev-playlist";
import { parseVtt } from "@/lib/transcripts/cues";
import { suggestMatches, type LessonProfile } from "./deterministic";
import { keywordsForLesson } from "./keywords";
import type { SnapshotExercise } from "@/lib/curriculum/snapshot";

function profile(exercise: SnapshotExercise): LessonProfile {
  const snapshot = loadCurriculumSnapshot();
  const objective = snapshot.learningObjectives.find((item) => item.id === exercise.learningObjectiveId);
  return {
    lessonId: exercise.id,
    lessonKind: "exercise",
    title: exercise.title,
    learningObjectiveLabel: objective?.plainEnglish ?? null,
    keywords: keywordsForLesson({
      title: exercise.title,
      summary: exercise.summary,
      learningObjectiveId: exercise.learningObjectiveId,
      learningObjectiveLabel: objective?.plainEnglish,
      steps: exercise.steps,
    }),
    lifeStages: exercise.lifeStages,
    prerequisiteIds: exercise.prerequisiteIds,
  };
}

describe("deterministic matching", () => {
  const snapshot = loadCurriculumSnapshot();
  const loose = snapshot.exercises.find((item) => item.id === "ex-lead-loose");
  const intro = snapshot.exercises.find((item) => item.id === "ex-lead-intro");
  if (!loose || !intro) throw new Error("Expected lead lessons in the snapshot");

  it("grounds a loose-lead suggestion in the transcript window rather than the whole video", () => {
    const parsed = parseVtt(FIXTURE_LOOSE_LEAD_VTT);
    if (!parsed.ok) throw new Error(parsed.error);
    const matches = suggestMatches({
      lessons: [profile(loose), profile(intro)],
      segments: parsed.cues.map((cue, index) => ({
        ref: `segment:${index}`,
        startSeconds: Math.floor(cue.startMs / 1000),
        endSeconds: Math.ceil(cue.endMs / 1000),
        text: cue.text,
      })),
      chapters: [
        { ref: "chapter:1", startSeconds: 0, endSeconds: 45, text: "Greeting the dog" },
        { ref: "chapter:2", startSeconds: 45, endSeconds: 130, text: "Loose-lead walking" },
        { ref: "chapter:3", startSeconds: 130, endSeconds: 180, text: "Recall practice" },
      ],
      title: "[Fixture] Loose-lead walking demonstration",
      description: "0:00 Greeting the dog\n0:45 Loose-lead walking\n2:10 Recall practice",
    });
    const lead = matches.find((match) => match.lessonId === "ex-lead-loose");
    expect(lead).toBeTruthy();
    expect(lead?.timingGrounded).toBe(true);
    expect(lead?.evidenceKind).toBe("transcript");
    expect(lead?.startSeconds).toBe(45);
    expect(lead?.endSeconds).toBeGreaterThan(45);
    expect(lead?.endSeconds).toBeLessThanOrEqual(90);
    expect(lead?.prerequisiteNote).toContain("ex-lead-intro");
    expect(matches.filter((match) => match.lessonId === "ex-lead-loose")).toHaveLength(1);
  });

  it("flags aversive wording for review and still returns the suggestion", () => {
    const matches = suggestMatches({
      lessons: [profile(loose)],
      segments: [
        {
          ref: "segment:0",
          startSeconds: 10,
          endSeconds: 40,
          text: "The trainer fits a prong collar and gives a leash correction, then asks for a loose lead.",
        },
      ],
      chapters: [],
      title: "Lead work",
      description: "",
    });
    expect(matches[0]?.safetyFlags).toEqual(
      expect.arrayContaining(["leash_corrections_aversive_equipment", "good_dog_aversive_pattern"]),
    );
    expect(matches[0]?.lessonId).toBe("ex-lead-loose");
  });
});
