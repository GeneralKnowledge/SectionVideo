/**
 * Build a versioned curriculum snapshot from a local Good Dog checkout.
 *
 * Usage:
 *   GOOD_DOG_PATH=/path/to/Good-Dog node scripts/extract-good-dog-curriculum.mjs
 *
 * The script reads committed source files. It does not call Good Dog at runtime
 * and it does not invent lesson identifiers.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const goodDogPath = process.env.GOOD_DOG_PATH;
if (!goodDogPath) {
  console.error("Set GOOD_DOG_PATH to a Good Dog checkout.");
  process.exit(1);
}

const root = path.resolve(goodDogPath);
const contentRoot = path.join(root, "src/lib/domains/dog-training");

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing Good Dog file: ${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function plain(text) {
  if (!text) return "";
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, (_, term) => term.replace(/-/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function loadExercises() {
  let source = read(
    "src/lib/domains/dog-training/content/exercises.ts",
  );
  source = source.replace(/^import[\s\S]*?;\s*/m, "");
  source = source.replace(
    /export const EXERCISE_LIBRARY: ExerciseContent\[\] = /,
    "const EXERCISE_LIBRARY = ",
  );
  source = source.replace(
    /export const TOPIC_GROUPS:[\s\S]*?=\s*\[/,
    "const TOPIC_GROUPS = [",
  );
  source = source.replace(/export function[\s\S]*$/, "");
  const loaded = new Function(
    `${source}\nreturn { EXERCISE_LIBRARY, TOPIC_GROUPS };`,
  )();
  return loaded;
}

function loadObjectives() {
  let source = read(
    "src/lib/domains/dog-training/content/learning-objectives.ts",
  );
  source = source.replace(/^export interface[\s\S]*?}\n/m, "");
  source = source.replace(
    /export const LEARNING_OBJECTIVES: LearningObjective\[\] = /,
    "const LEARNING_OBJECTIVES = ",
  );
  source = source.replace(/export function[\s\S]*$/, "");
  return new Function(`${source}\nreturn LEARNING_OBJECTIVES;`)();
}

function loadLessonExerciseMap() {
  const source = read("src/lib/domains/dog-training/kb-crash-course.ts");
  const match = source.match(
    /const LESSON_EXERCISE_MAP: Record<string, string> = \{([\s\S]*?)\};/,
  );
  if (!match) {
    throw new Error("LESSON_EXERCISE_MAP not found in kb-crash-course.ts");
  }
  return new Function(`return {${match[1]}};`)();
}

function sectionAfter(markdown, heading) {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(\\n## |$)`);
  const match = markdown.match(pattern);
  return match ? match[1].trim() : "";
}

let commit = process.env.GOOD_DOG_COMMIT ?? "";
if (!commit) {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

const { EXERCISE_LIBRARY, TOPIC_GROUPS } = loadExercises();
const objectives = loadObjectives();
const lessonExerciseMap = loadLessonExerciseMap();
const guidesBundle = readJson(
  "src/lib/domains/dog-training/content/kb-import/good-dog-guides.json",
);
const domainBundle = readJson(
  "src/lib/domains/dog-training/content/kb-import/good-dog-domain.json",
);
const crashBundle = readJson(
  "src/lib/domains/dog-training/content/kb-import/good-dog-crash-course.json",
);
const safetyBundle = readJson(
  "src/lib/domains/dog-training/content/kb-import/good-dog-safety.json",
);

const objectiveById = new Map(objectives.map((item) => [item.id, item]));
const exerciseIds = new Set(EXERCISE_LIBRARY.map((item) => item.id));

const aliasesByExercise = new Map();
for (const [lessonId, exerciseId] of Object.entries(lessonExerciseMap)) {
  if (!exerciseIds.has(exerciseId)) {
    throw new Error(
      `LESSON_EXERCISE_MAP points at unknown exercise ${exerciseId} for ${lessonId}`,
    );
  }
  const list = aliasesByExercise.get(exerciseId) ?? [];
  list.push({
    lessonId,
    source: "src/lib/domains/dog-training/kb-crash-course.ts#LESSON_EXERCISE_MAP",
  });
  aliasesByExercise.set(exerciseId, list);
}

const held = (domainBundle.held ?? []).map((entry) => ({
  lessonId: entry.lessonId,
  goodDogExerciseId: entry.goodDogExerciseId ?? null,
  protocolId: entry.protocolId ?? null,
  reason: entry.reason ?? null,
  source: "src/lib/domains/dog-training/content/kb-import/good-dog-domain.json#held",
}));

for (const entry of held) {
  if (!entry.goodDogExerciseId || !exerciseIds.has(entry.goodDogExerciseId)) {
    continue;
  }
  const list = aliasesByExercise.get(entry.goodDogExerciseId) ?? [];
  if (!list.some((alias) => alias.lessonId === entry.lessonId && alias.source.includes("held"))) {
    list.push({
      lessonId: entry.lessonId,
      source: entry.source,
    });
    aliasesByExercise.set(entry.goodDogExerciseId, list);
  }
}

const usedObjectiveIds = [...new Set(EXERCISE_LIBRARY.map((item) => item.learningObjectiveId))];
const missingObjectiveDefinitions = usedObjectiveIds.filter((id) => !objectiveById.has(id));

const exercises = EXERCISE_LIBRARY.map((exercise) => ({
  id: exercise.id,
  slug: exercise.slug,
  title: exercise.title,
  summary: plain(exercise.summary),
  learningObjectiveId: exercise.learningObjectiveId,
  category: exercise.category,
  lifeStages: exercise.lifeStages,
  difficulty: exercise.difficulty,
  estimatedMinutes: exercise.estimatedMinutes,
  prerequisiteIds: exercise.prerequisiteIds,
  purpose: plain(exercise.purpose),
  preparation: plain(exercise.preparation),
  steps: exercise.steps.map((step) => plain(step)),
  lookFor: plain(exercise.lookFor),
  ifDifficult: plain(exercise.ifDifficult),
  safetyNote: exercise.safetyNote ? plain(exercise.safetyNote) : null,
  hint: plain(exercise.hint),
  topicGroup: exercise.topicGroup,
  glossaryTermIds: exercise.glossaryTermIds ?? [],
  contentVersion: exercise.contentVersion,
  easierVariationId: exercise.easierVariationId ?? null,
  harderVariationId: exercise.harderVariationId ?? null,
  crashLessonAliases: aliasesByExercise.get(exercise.id) ?? [],
}));

const guides = guidesBundle.guides.map((guide) => {
  const pause = sectionAfter(guide.ownerBodyMarkdown ?? "", "When to pause");
  const trySteps = sectionAfter(guide.ownerBodyMarkdown ?? "", "What to try");
  return {
    lessonId: guide.lessonId,
    title: guide.title,
    summary: guide.summary,
    advisory: Boolean(guide.advisory),
    advisoryMessage: guide.advisoryMessage ?? null,
    protocolId: guide.protocolId,
    kind: guide.kind ?? null,
    instructions: plain(trySteps || guide.summary),
    safetyNotes: [pause, guide.advisoryMessage].filter(Boolean).join("\n"),
    keywords: guide.suggestedAskKeywords ?? [],
    provenance: guide.provenance ?? null,
  };
});

const snapshot = {
  schemaVersion: 1,
  curriculumVersion: `good-dog@${commit}`,
  source: {
    repository: "https://github.com/GeneralKnowledge/Good-Dog",
    commit,
    retrievedAt: new Date().toISOString(),
    files: [
      "src/lib/domains/dog-training/content/exercises.ts",
      "src/lib/domains/dog-training/content/learning-objectives.ts",
      "src/lib/domains/dog-training/kb-crash-course.ts",
      "src/lib/domains/dog-training/content/kb-import/good-dog-guides.json",
      "src/lib/domains/dog-training/content/kb-import/good-dog-domain.json",
      "src/lib/domains/dog-training/content/kb-import/good-dog-crash-course.json",
      "src/lib/domains/dog-training/content/kb-import/good-dog-safety.json",
    ],
  },
  identifierNotes: [
    "Practical lessons in the running Good Dog app use exercises.id values (ex-*) from EXERCISE_LIBRARY. They are stored in the exercises table and opened at /exercise/[exerciseId].",
    "Knowledge-base guides use lessonId values (lesson-*) from good-dog-guides.json and open at /learn/guides/[lessonId].",
    "Crash-course entries also use lesson-* identifiers. Skill entries are aliases mapped to exercise ids by LESSON_EXERCISE_MAP in kb-crash-course.ts. They are not a third id space in the database.",
    "lesson-loose-lead is mapped to ex-lead-intro by LESSON_EXERCISE_MAP and to ex-lead-loose by good-dog-domain.json held[]. Both mappings are copied from those files.",
    "Some exercise learningObjectiveId values are not defined in LEARNING_OBJECTIVES. They are preserved as used and listed in missingObjectiveDefinitions.",
  ],
  learningObjectives: objectives,
  missingObjectiveDefinitions,
  lifeStages: ["young_puppy", "older_puppy", "adolescent", "adult", "senior"],
  skillStates: [
    "not_introduced",
    "introduced",
    "practising",
    "becoming_consistent",
    "ready_to_increase",
    "needs_easier",
  ],
  topicGroups: TOPIC_GROUPS,
  exercises,
  guides,
  crashCourse: {
    courseId: crashBundle.courseId,
    title: crashBundle.title,
    schemaVersion: crashBundle.schemaVersion,
    generatedAt: crashBundle.generatedAt,
    parts: crashBundle.parts,
    stages: crashBundle.stages.map((stage) => ({
      id: stage.id,
      part: stage.part,
      order: stage.order,
      title: stage.title,
      aim: stage.aim,
      lessons: stage.lessons,
    })),
    lessonExerciseMap,
    held,
  },
  bundles: {
    guidesSchemaVersion: guidesBundle.schemaVersion,
    guidesGeneratedAt: guidesBundle.generatedAt,
    domainSchemaVersion: domainBundle.schemaVersion,
    domainGeneratedAt: domainBundle.generatedAt,
  },
  aversivePatterns: safetyBundle.violatesNoAversivePatterns ?? [],
};

const outDir = path.join(process.cwd(), "curriculum");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "good-dog-curriculum.v1.json");
fs.writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `Wrote ${outFile} (${exercises.length} exercises, ${guides.length} guides) from ${commit}`,
);
