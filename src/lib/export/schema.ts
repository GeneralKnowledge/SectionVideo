import { z } from "zod";

export const EXPORT_SCHEMA_VERSION = 1;

const availabilitySchema = z.enum([
  "available",
  "unavailable",
  "private",
  "deleted",
  "age_restricted",
  "unknown",
]);

export const exportedSegmentSchema = z
  .object({
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    title: z.string().min(1),
    startSeconds: z.number().int().nonnegative(),
    endSeconds: z.number().int().positive().nullable(),
    lessonId: z.string().min(1),
    lessonKind: z.enum(["exercise", "guide"]),
    learningObjectiveId: z.string().nullable(),
    learningObjective: z.string(),
    viewingInstructions: z.array(z.string().min(1)).min(1),
    sourceUrl: z.string().url(),
    channelName: z.string(),
    embedAllowed: z.boolean().nullable(),
    availability: availabilitySchema,
    reviewStatus: z.enum(["approved", "published"]),
    fixture: z.boolean(),
    curriculumVersion: z.string().min(1),
  })
  .superRefine((segment, ctx) => {
    if (segment.endSeconds !== null && segment.endSeconds <= segment.startSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endSeconds must be after startSeconds",
        path: ["endSeconds"],
      });
    }
  });

export const exportWarningSchema = z.object({
  code: z.enum(["fixture_video", "video_unavailable", "lesson_removed", "embed_blocked"]),
  videoId: z.string().optional(),
  lessonId: z.string().optional(),
  message: z.string(),
});

export const exportDocumentSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  curriculumVersion: z.string().min(1),
  source: z.object({
    application: z.literal("section-video"),
    note: z.string(),
  }),
  segments: z.array(exportedSegmentSchema),
  warnings: z.array(exportWarningSchema),
});

export type ExportDocument = z.infer<typeof exportDocumentSchema>;

export function parseExportDocument(raw: unknown): ExportDocument {
  return exportDocumentSchema.parse(raw);
}
