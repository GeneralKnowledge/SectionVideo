import { describe, expect, it } from "vitest";
import { conflictingAliases, loadCurriculumSnapshot } from "./snapshot";

describe("Good Dog curriculum snapshot", () => {
  const snapshot = loadCurriculumSnapshot();

  it("uses real exercise and guide identifiers from the inspected repository", () => {
    expect(snapshot.curriculumVersion).toContain("de42e3e226278fc66790a80d85da094579ec1738");
    expect(snapshot.exercises.map((item) => item.id)).toContain("ex-lead-loose");
    expect(snapshot.guides.map((item) => item.lessonId)).toContain("lesson-reactive-management");
    expect(snapshot.learningObjectives.map((item) => item.id)).toContain("lead-walking");
    expect(snapshot.missingObjectiveDefinitions).toEqual(
      expect.arrayContaining(["down", "housetraining", "puppy-mouthing"]),
    );
  });

  it("preserves the loose-lead alias conflict instead of inventing a winner", () => {
    const conflict = conflictingAliases(snapshot).find((item) => item.lessonId === "lesson-loose-lead");
    expect(conflict?.exerciseIds).toEqual(["ex-lead-intro", "ex-lead-loose"]);
  });
});
