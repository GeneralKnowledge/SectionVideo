import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const curators = sqliteTable("curators", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(),
  youtubePlaylistId: text("youtube_playlist_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  importStatus: text("import_status", {
    enum: ["imported", "partial", "failed", "empty"],
  }).notNull(),
  source: text("source", {
    enum: ["api", "manual", "fixture", "metadata_file"],
  }).notNull(),
  isFixture: integer("is_fixture", { mode: "boolean" }).notNull().default(false),
  lastImportedAt: integer("last_imported_at"),
  errorDetails: text("error_details"),
  itemCount: integer("item_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  youtubeVideoId: text("youtube_video_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  channelName: text("channel_name").notNull().default(""),
  channelUrl: text("channel_url"),
  durationSeconds: integer("duration_seconds"),
  thumbnailUrl: text("thumbnail_url"),
  canonicalUrl: text("canonical_url").notNull(),
  availabilityStatus: text("availability_status", {
    enum: [
      "available",
      "unavailable",
      "private",
      "deleted",
      "age_restricted",
      "unknown",
    ],
  }).notNull(),
  embedStatus: text("embed_status", {
    enum: ["unknown", "allowed", "blocked"],
  })
    .notNull()
    .default("unknown"),
  metadataRetrievedAt: integer("metadata_retrieved_at"),
  retrievalError: text("retrieval_error"),
  isFixture: integer("is_fixture", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const playlistEntries = sqliteTable(
  "playlist_entries",
  {
    id: text("id").primaryKey(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    unavailableReason: text("unavailable_reason"),
  },
  (table) => [
    uniqueIndex("playlist_entries_unique").on(table.playlistId, table.videoId),
    index("playlist_entries_order_idx").on(table.playlistId, table.position),
    index("playlist_entries_video_idx").on(table.videoId),
  ],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startSeconds: integer("start_seconds").notNull(),
    endSeconds: integer("end_seconds"),
    source: text("source", { enum: ["description", "manual"] }).notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("chapters_video_idx").on(table.videoId, table.position)],
);

export const transcripts = sqliteTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    sourceType: text("source_type", { enum: ["manual", "vtt", "srt"] }).notNull(),
    language: text("language").notNull().default("en"),
    retrievedAt: integer("retrieved_at").notNull(),
    provenanceNotes: text("provenance_notes").notNull(),
    processingStatus: text("processing_status", {
      enum: ["available", "failed", "empty"],
    }).notNull(),
  },
  (table) => [index("transcripts_video_idx").on(table.videoId)],
);

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    transcriptId: text("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    sourceIndex: integer("source_index").notNull(),
  },
  (table) => [
    index("transcript_segments_order_idx").on(table.transcriptId, table.sourceIndex),
  ],
);

export const curriculumSyncs = sqliteTable("curriculum_syncs", {
  id: text("id").primaryKey(),
  curriculumVersion: text("curriculum_version").notNull(),
  sourceCommit: text("source_commit"),
  sourceLabel: text("source_label").notNull(),
  retrievedAt: integer("retrieved_at").notNull(),
  lessonCount: integer("lesson_count").notNull(),
  notes: text("notes"),
});

export const lessonReferences = sqliteTable(
  "lesson_references",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id").notNull(),
    lessonKind: text("lesson_kind", { enum: ["exercise", "guide"] }).notNull(),
    curriculumVersion: text("curriculum_version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    learningObjectiveId: text("learning_objective_id"),
    learningObjectiveLabel: text("learning_objective_label"),
    skillsJson: text("skills_json").notNull().default("[]"),
    prerequisitesJson: text("prerequisites_json").notNull().default("[]"),
    lifeStagesJson: text("life_stages_json").notNull().default("[]"),
    trainingStageId: text("training_stage_id"),
    instructionsJson: text("instructions_json").notNull().default("[]"),
    safetyNotes: text("safety_notes"),
    topicGroup: text("topic_group"),
    difficulty: integer("difficulty"),
    keywordsJson: text("keywords_json").notNull().default("[]"),
    crashAliasesJson: text("crash_aliases_json").notNull().default("[]"),
    searchText: text("search_text").notNull().default(""),
    lastSyncedAt: integer("last_synced_at").notNull(),
    removedAt: integer("removed_at"),
  },
  (table) => [
    uniqueIndex("lesson_references_identity").on(table.lessonId, table.lessonKind),
    index("lesson_references_kind_idx").on(table.lessonKind),
  ],
);

export const matchSuggestions = sqliteTable(
  "match_suggestions",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    lessonReferenceId: text("lesson_reference_id")
      .notNull()
      .references(() => lessonReferences.id),
    startSeconds: integer("start_seconds"),
    endSeconds: integer("end_seconds"),
    timingGrounded: integer("timing_grounded", { mode: "boolean" }).notNull().default(false),
    evidenceKind: text("evidence_kind", {
      enum: ["transcript", "chapter", "description", "title", "notes", "manual"],
    }).notNull(),
    evidenceText: text("evidence_text").notNull(),
    evidenceRefsJson: text("evidence_refs_json").notNull().default("[]"),
    explanation: text("explanation").notNull(),
    confidence: real("confidence").notNull(),
    stageMismatch: text("stage_mismatch"),
    prerequisiteNote: text("prerequisite_note"),
    safetyFlagsJson: text("safety_flags_json").notNull().default("[]"),
    provider: text("provider", { enum: ["deterministic", "llm", "manual"] }).notNull(),
    providerMetadataJson: text("provider_metadata_json"),
    curriculumVersion: text("curriculum_version").notNull(),
    reviewStatus: text("review_status", {
      enum: ["suggested", "approved", "rejected", "draft"],
    }).notNull(),
    reviewerId: text("reviewer_id").references(() => curators.id),
    reviewedAt: integer("reviewed_at"),
    curatorNotes: text("curator_notes"),
    stale: integer("stale", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("match_suggestions_status_idx").on(table.reviewStatus),
    index("match_suggestions_video_idx").on(table.videoId),
    index("match_suggestions_lesson_idx").on(table.lessonReferenceId),
  ],
);

export const curatedSegments = sqliteTable(
  "curated_segments",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    lessonReferenceId: text("lesson_reference_id")
      .notNull()
      .references(() => lessonReferences.id),
    suggestionId: text("suggestion_id")
      .unique()
      .references(() => matchSuggestions.id),
    startSeconds: integer("start_seconds").notNull(),
    endSeconds: integer("end_seconds"),
    displayTitle: text("display_title").notNull(),
    learningContext: text("learning_context").notNull(),
    viewingInstructionsJson: text("viewing_instructions_json").notNull().default("[]"),
    creatorAttribution: text("creator_attribution").notNull(),
    reviewerNotes: text("reviewer_notes"),
    publicationStatus: text("publication_status", {
      enum: ["draft", "approved", "published"],
    }).notNull(),
    reviewerId: text("reviewer_id").references(() => curators.id),
    reviewedAt: integer("reviewed_at"),
    sourceUrl: text("source_url").notNull(),
    embedStatus: text("embed_status", {
      enum: ["unknown", "allowed", "blocked"],
    })
      .notNull()
      .default("unknown"),
    lastVerifiedAt: integer("last_verified_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("curated_segments_status_idx").on(table.publicationStatus),
    index("curated_segments_lesson_idx").on(table.lessonReferenceId),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detailJson: text("detail_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("audit_events_entity_idx").on(table.entityType, table.entityId)],
);

export type Curator = typeof curators.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type Video = typeof videos.$inferSelect;
export type LessonReference = typeof lessonReferences.$inferSelect;
export type MatchSuggestion = typeof matchSuggestions.$inferSelect;
export type CuratedSegment = typeof curatedSegments.$inferSelect;
