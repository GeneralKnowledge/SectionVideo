import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const aliasSchema = z.object({
  lessonId: z.string(),
  source: z.string(),
});

const exerciseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  learningObjectiveId: z.string(),
  category: z.string(),
  lifeStages: z.array(z.string()),
  difficulty: z.number(),
  estimatedMinutes: z.number(),
  prerequisiteIds: z.array(z.string()),
  purpose: z.string(),
  preparation: z.string(),
  steps: z.array(z.string()),
  lookFor: z.string(),
  ifDifficult: z.string(),
  safetyNote: z.string().nullable(),
  hint: z.string(),
  topicGroup: z.string(),
  glossaryTermIds: z.array(z.string()),
  contentVersion: z.number(),
  crashLessonAliases: z.array(aliasSchema),
});

const guideSchema = z.object({
  lessonId: z.string(),
  title: z.string(),
  summary: z.string(),
  advisory: z.boolean(),
  advisoryMessage: z.string().nullable(),
  protocolId: z.string(),
  instructions: z.string(),
  safetyNotes: z.string(),
  keywords: z.array(z.string()),
});

const stageSchema = z.object({
  id: z.string(),
  title: z.string(),
  aim: z.string(),
  lessons: z.array(
    z.object({
      lessonId: z.string(),
      title: z.string(),
      kind: z.string(),
    }),
  ),
});

export const curriculumSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  curriculumVersion: z.string().min(1),
  source: z.object({
    repository: z.string().url(),
    commit: z.string().min(7),
    retrievedAt: z.string(),
  }),
  identifierNotes: z.array(z.string()),
  learningObjectives: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      plainEnglish: z.string(),
    }),
  ),
  missingObjectiveDefinitions: z.array(z.string()),
  exercises: z.array(exerciseSchema).min(1),
  guides: z.array(guideSchema).min(1),
  crashCourse: z.object({
    lessonExerciseMap: z.record(z.string()),
    held: z.array(
      z.object({
        lessonId: z.string(),
        goodDogExerciseId: z.string().nullable(),
        source: z.string(),
      }),
    ),
    stages: z.array(stageSchema),
  }),
});

export type CurriculumSnapshot = z.infer<typeof curriculumSnapshotSchema>;
export type SnapshotExercise = z.infer<typeof exerciseSchema>;
export type SnapshotGuide = z.infer<typeof guideSchema>;

export function loadCurriculumSnapshot(file = path.join(process.cwd(), "curriculum/good-dog-curriculum.v1.json")): CurriculumSnapshot {
  const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  return curriculumSnapshotSchema.parse(raw);
}

export function objectiveLabel(snapshot: CurriculumSnapshot, id: string | null): string | null {
  if (!id) return null;
  return snapshot.learningObjectives.find((item) => item.id === id)?.plainEnglish ?? null;
}

export type AliasUse = { lessonId: string; exerciseId: string; source: string };

export function aliasUses(snapshot: CurriculumSnapshot): AliasUse[] {
  const uses: AliasUse[] = [];
  for (const exercise of snapshot.exercises) {
    for (const alias of exercise.crashLessonAliases) {
      uses.push({ lessonId: alias.lessonId, exerciseId: exercise.id, source: alias.source });
    }
  }
  return uses;
}

export function conflictingAliases(snapshot: CurriculumSnapshot): Array<{
  lessonId: string;
  exerciseIds: string[];
}> {
  const grouped = new Map<string, Set<string>>();
  for (const use of aliasUses(snapshot)) {
    const set = grouped.get(use.lessonId) ?? new Set<string>();
    set.add(use.exerciseId);
    grouped.set(use.lessonId, set);
  }
  return [...grouped.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([lessonId, ids]) => ({ lessonId, exerciseIds: [...ids].sort() }));
}
