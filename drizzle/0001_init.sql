CREATE TABLE curators (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  youtube_playlist_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  import_status TEXT NOT NULL,
  source TEXT NOT NULL,
  is_fixture INTEGER NOT NULL DEFAULT 0,
  last_imported_at INTEGER,
  error_details TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  youtube_video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  channel_name TEXT NOT NULL DEFAULT '',
  channel_url TEXT,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  canonical_url TEXT NOT NULL,
  availability_status TEXT NOT NULL,
  embed_status TEXT NOT NULL DEFAULT 'unknown',
  metadata_retrieved_at INTEGER,
  retrieval_error TEXT,
  is_fixture INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE playlist_entries (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  unavailable_reason TEXT,
  UNIQUE (playlist_id, video_id)
);

CREATE INDEX playlist_entries_order_idx ON playlist_entries (playlist_id, position);
CREATE INDEX playlist_entries_video_idx ON playlist_entries (video_id);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER,
  source TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE INDEX chapters_video_idx ON chapters (video_id, position);

CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  retrieved_at INTEGER NOT NULL,
  provenance_notes TEXT NOT NULL,
  processing_status TEXT NOT NULL
);

CREATE INDEX transcripts_video_idx ON transcripts (video_id);

CREATE TABLE transcript_segments (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  source_index INTEGER NOT NULL
);

CREATE INDEX transcript_segments_order_idx ON transcript_segments (transcript_id, source_index);

CREATE TABLE curriculum_syncs (
  id TEXT PRIMARY KEY,
  curriculum_version TEXT NOT NULL,
  source_commit TEXT,
  source_label TEXT NOT NULL,
  retrieved_at INTEGER NOT NULL,
  lesson_count INTEGER NOT NULL,
  notes TEXT
);

CREATE TABLE lesson_references (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  lesson_kind TEXT NOT NULL,
  curriculum_version TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  learning_objective_id TEXT,
  learning_objective_label TEXT,
  skills_json TEXT NOT NULL DEFAULT '[]',
  prerequisites_json TEXT NOT NULL DEFAULT '[]',
  life_stages_json TEXT NOT NULL DEFAULT '[]',
  training_stage_id TEXT,
  instructions_json TEXT NOT NULL DEFAULT '[]',
  safety_notes TEXT,
  topic_group TEXT,
  difficulty INTEGER,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  crash_aliases_json TEXT NOT NULL DEFAULT '[]',
  search_text TEXT NOT NULL DEFAULT '',
  last_synced_at INTEGER NOT NULL,
  removed_at INTEGER,
  UNIQUE (lesson_id, lesson_kind)
);

CREATE INDEX lesson_references_kind_idx ON lesson_references (lesson_kind);

CREATE TABLE match_suggestions (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  lesson_reference_id TEXT NOT NULL REFERENCES lesson_references(id),
  start_seconds INTEGER,
  end_seconds INTEGER,
  timing_grounded INTEGER NOT NULL DEFAULT 0,
  evidence_kind TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL,
  confidence REAL NOT NULL,
  stage_mismatch TEXT,
  prerequisite_note TEXT,
  safety_flags_json TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  provider_metadata_json TEXT,
  curriculum_version TEXT NOT NULL,
  review_status TEXT NOT NULL,
  reviewer_id TEXT REFERENCES curators(id),
  reviewed_at INTEGER,
  curator_notes TEXT,
  stale INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX match_suggestions_status_idx ON match_suggestions (review_status);
CREATE INDEX match_suggestions_video_idx ON match_suggestions (video_id);
CREATE INDEX match_suggestions_lesson_idx ON match_suggestions (lesson_reference_id);

CREATE TABLE curated_segments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  lesson_reference_id TEXT NOT NULL REFERENCES lesson_references(id),
  suggestion_id TEXT UNIQUE REFERENCES match_suggestions(id),
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER,
  display_title TEXT NOT NULL,
  learning_context TEXT NOT NULL,
  viewing_instructions_json TEXT NOT NULL DEFAULT '[]',
  creator_attribution TEXT NOT NULL,
  reviewer_notes TEXT,
  publication_status TEXT NOT NULL,
  reviewer_id TEXT REFERENCES curators(id),
  reviewed_at INTEGER,
  source_url TEXT NOT NULL,
  embed_status TEXT NOT NULL DEFAULT 'unknown',
  last_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX curated_segments_status_idx ON curated_segments (publication_status);
CREATE INDEX curated_segments_lesson_idx ON curated_segments (lesson_reference_id);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id);
