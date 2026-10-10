import { eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  loadCurriculumSnapshot,
  objectiveLabel,
  type CurriculumSnapshot,
} from "@/lib/curriculum/snapshot";
import type { DatabaseHandle } from "@/lib/db/connection";
import { curriculumSyncs, lessonReferences, matchSuggestions } from "@/lib/db/schema";
import { keywordsForLesson } from "@/lib/matching/keywords";

function stageIdFor(snapshot: CurriculumSnapshot, ids: string[]): string | null {
  const wanted = new Set(ids);
  const stage = snapshot.crashCourse.stages.find((item) =>
    item.lessons.some((lesson) => wanted.has(lesson.lessonId)),
  );
  return stage?.id ?? null;
}

export function syncCurriculum(
  handle: DatabaseHandle,
  snapshot = loadCurriculumSnapshot(),
): { lessonCount: number; version: string } {
  const now = Date.now();
  const seen = new Set<string>();

  const write = handle.sqlite.transaction(() => {
    for (const exercise of snapshot.exercises) {
      const id = `exercise:${exercise.id}`;
      seen.add(id);
      const objective = objectiveLabel(snapshot, exercise.learningObjectiveId);
      const aliasIds = exercise.crashLessonAliases.map((alias) => alias.lessonId);
      for (const [crashId, exerciseId] of Object.entries(snapshot.crashCourse.lessonExerciseMap)) {
        if (exerciseId === exercise.id) aliasIds.push(crashId);
      }
      const keywords = keywordsForLesson({
        title: exercise.title,
        summary: exercise.summary,
        learningObjectiveId: exercise.learningObjectiveId,
        learningObjectiveLabel: objective,
        steps: exercise.steps,
        extraPhrases: exercise.glossaryTermIds,
      });
      const values = {
        id,
        lessonId: exercise.id,
        lessonKind: "exercise" as const,
        curriculumVersion: snapshot.curriculumVersion,
        title: exercise.title,
        summary: exercise.summary,
        learningObjectiveId: exercise.learningObjectiveId,
        learningObjectiveLabel: objective,
        skillsJson: JSON.stringify(
          [exercise.learningObjectiveId, exercise.category, exercise.topicGroup].filter(Boolean),
        ),
        prerequisitesJson: JSON.stringify(exercise.prerequisiteIds),
        lifeStagesJson: JSON.stringify(exercise.lifeStages),
        trainingStageId: stageIdFor(snapshot, aliasIds),
        instructionsJson: JSON.stringify(exercise.steps),
        safetyNotes: exercise.safetyNote,
        topicGroup: exercise.topicGroup,
        difficulty: exercise.difficulty,
        keywordsJson: JSON.stringify(keywords),
        crashAliasesJson: JSON.stringify(exercise.crashLessonAliases),
        searchText: [exercise.title, exercise.summary, objective, exercise.purpose, ...exercise.steps]
          .filter(Boolean)
          .join("\n"),
        lastSyncedAt: now,
        removedAt: null,
      };
      handle.db
        .insert(lessonReferences)
        .values(values)
        .onConflictDoUpdate({
          target: [lessonReferences.lessonId, lessonReferences.lessonKind],
          set: values,
        })
        .run();
    }

    for (const guide of snapshot.guides) {
      const id = `guide:${guide.lessonId}`;
      seen.add(id);
      const keywords = keywordsForLesson({
        title: guide.title,
        summary: guide.summary,
        extraPhrases: guide.keywords,
      });
      const values = {
        id,
        lessonId: guide.lessonId,
        lessonKind: "guide" as const,
        curriculumVersion: snapshot.curriculumVersion,
        title: guide.title,
        summary: guide.summary,
        learningObjectiveId: null,
        learningObjectiveLabel: null,
        skillsJson: JSON.stringify(guide.keywords.slice(0, 8)),
        prerequisitesJson: JSON.stringify([]),
        lifeStagesJson: JSON.stringify([]),
        trainingStageId: stageIdFor(snapshot, [guide.lessonId]),
        instructionsJson: JSON.stringify(guide.instructions ? [guide.instructions] : []),
        safetyNotes: [guide.safetyNotes, guide.advisoryMessage].filter(Boolean).join("\n") || null,
        topicGroup: null,
        difficulty: null,
        keywordsJson: JSON.stringify(keywords),
        crashAliasesJson: JSON.stringify([]),
        searchText: [guide.title, guide.summary, guide.instructions, ...guide.keywords].join("\n"),
        lastSyncedAt: now,
        removedAt: null,
      };
      handle.db
        .insert(lessonReferences)
        .values(values)
        .onConflictDoUpdate({
          target: [lessonReferences.lessonId, lessonReferences.lessonKind],
          set: values,
        })
        .run();
    }

    const existing = handle.db.select().from(lessonReferences).all();
    for (const lesson of existing) {
      if (seen.has(lesson.id) || lesson.removedAt) continue;
      handle.db
        .update(lessonReferences)
        .set({ removedAt: now })
        .where(eq(lessonReferences.id, lesson.id))
        .run();
    }

    handle.db
      .update(matchSuggestions)
      .set({ stale: true, updatedAt: now })
      .where(ne(matchSuggestions.curriculumVersion, snapshot.curriculumVersion))
      .run();

    handle.db
      .insert(curriculumSyncs)
      .values({
        id: nanoid(),
        curriculumVersion: snapshot.curriculumVersion,
        sourceCommit: snapshot.source.commit,
        sourceLabel: snapshot.source.repository,
        retrievedAt: now,
        lessonCount: seen.size,
        notes: snapshot.identifierNotes.join(" "),
      })
      .run();
  });

  write();
  return { lessonCount: seen.size, version: snapshot.curriculumVersion };
}
