# Architecture

Good Dog Video Curator is a separate application from [Good Dog](https://github.com/GeneralKnowledge/Good-Dog). It stores curator records in its own SQLite database and exchanges curriculum and approved segments through versioned JSON. It does not write to the Good Dog database, and this repository does not change the Good Dog application.

Inspection used a local checkout of Good Dog at commit `de42e3e226278fc66790a80d85da094579ec1738` (`Refresh KB from DogResearch main (12 guides, crash course, ex-kb-*) (#25)`, 2026-10-10). The committed snapshot is `curriculum/good-dog-curriculum.v1.json`, version `good-dog@de42e3e226278fc66790a80d85da094579ec1738`.

## What Good Dog actually is

Good Dog is a Next.js 16.4 App Router application (React 19, Tailwind 4, TypeScript). Persistence is SQLite through `better-sqlite3` and Drizzle. Validation uses Zod. Tests use Vitest and Playwright. Owner sessions use `jose` and `bcryptjs`.

There is no HTTP API for lessons. Practical lessons are TypeScript content in `src/lib/domains/dog-training/content/exercises.ts` (`EXERCISE_LIBRARY`), copied into the `exercises` table by the seed script, and opened at `/exercise/[exerciseId]`. Guides are JSON in `src/lib/domains/dog-training/content/kb-import/good-dog-guides.json` and open at `/learn/guides/[lessonId]`.

The module split, from Good Dog’s own `docs/architecture.md`, is one-way:

- `src/lib/coaching` is a domain-neutral planning engine.
- `src/lib/domains/dog-training` holds exercises, objectives, life stages, and knowledge-base imports. It must not import the database or the framework.
- `src/lib/services` is the only layer that reads and writes SQLite.
- `src/app` and `src/components` are the UI.

Production deploys from `main` with `.github/workflows/deploy.yml`, which SSHs to the host and runs `/opt/good-dog-deploy/deploy-main.sh`. That script updates `/opt/good-dog`, runs `npm ci` and `npm run build`, and restarts the `good-dog.service` systemd unit. The app listens on `127.0.0.1:8080`. Authentication is an owner session for the household app. There is no curator role and no shared database the curator can attach to. A separate process with its own SQLite file is the integration that fits this deployment.

## Canonical identifiers

These identifiers were copied from the Good Dog source. They were not invented for the curator.

| Concept | Identifier | Where it lives |
| --- | --- | --- |
| Practical lesson | `exercises.id`, such as `ex-lead-loose` | `EXERCISE_LIBRARY`, then the `exercises` table. Route `/exercise/[exerciseId]`. |
| Learning objective | `learningObjectiveId`, such as `lead-walking` | `content/learning-objectives.ts`. The snapshot lists 18 defined objectives. |
| Guide | `lessonId`, such as `lesson-how-dogs-learn` | `good-dog-guides.json`. Route `/learn/guides/[lessonId]`. The snapshot has 12 guides. |
| Crash-course skill alias | `lesson-*` mapped to an exercise id | `LESSON_EXERCISE_MAP` in `kb-crash-course.ts`. 16 entries. These are aliases, not a third database id. |
| Life stage | `young_puppy`, `older_puppy`, `adolescent`, `adult`, `senior` | Exercise `lifeStages`. |
| Skill progress | `not_introduced`, `introduced`, `practising`, `becoming_consistent`, `ready_to_increase`, `needs_easier` | `SkillState` in `src/lib/coaching/types.ts`. This is a dog’s progress, not a lesson id. |
| Topic group | `everyday_foundations`, `puppy_life`, `walking_together`, `coming_back`, `calm_confidence`, `life_at_home` | `exercises.ts`. |
| Crash-course stage | `stage-*`, such as `stage-how-dogs-learn` | `good-dog-crash-course.json`, grouped into `part-understand`, `part-practise`, and `part-real-life`. |

Three exercise objective ids are used in `EXERCISE_LIBRARY` but have no entry in `LEARNING_OBJECTIVES`: `down`, `housetraining`, and `puppy-mouthing`. The snapshot keeps them in `missingObjectiveDefinitions` and does not invent labels.

`lesson-loose-lead` is mapped twice, and both mappings are preserved:

- `LESSON_EXERCISE_MAP` in `kb-crash-course.ts` points it at `ex-lead-intro`.
- `good-dog-domain.json` `held[]` points it at `ex-lead-loose`.

The curator shows the conflict. It does not choose a winner. Approved exports use the exercise or guide id the curator selected (`ex-lead-loose` or `ex-lead-intro`), never the ambiguous alias alone.

`ex-lead-loose` (“Loose-lead walking foundations”) is the practical lesson for a loose-lead demonstration. Its prerequisite is `ex-lead-intro`. Its objective is `lead-walking`. Its life stages exclude `young_puppy`.

## Why the curator stays separate

Good Dog has no lesson endpoint to call, and its production database is an on-host SQLite file behind SSH. Coupling the curator into that deploy would mix editorial data with owner training records and would require changing the production app. The contract is:

1. `npm run curriculum:extract` reads a Good Dog checkout (`GOOD_DOG_PATH`) and writes `curriculum/good-dog-curriculum.v1.json`.
2. On boot the curator upserts `lesson_references` from that file. Existing suggestions and approved segments are kept. A new `curriculumVersion` marks suggestions stale. Lessons absent from the new file get `removed_at` set; their segments stay.
3. Approved segments leave through `GET /api/export` as schema version 1. See `docs/integration.md`.

## Curator shape

```
src/app                  App Router pages and the authenticated export route
src/components           Shell, status pills, video studio
src/lib/actions          Server actions (auth, import, review)
src/lib/services         Database orchestration
src/lib/db               Drizzle schema, connection, SQL migrations
src/lib/youtube          URL parsing, Data API client, embeds
src/lib/transcripts      Description chapters, VTT and SRT
src/lib/matching         Deterministic search, optional LLM validation, welfare flags
src/lib/curriculum       Snapshot schema
src/lib/export           Export schema
src/lib/auth             Password hashing and session cookie
```

The database file defaults to `./data/curator.db`. `openDatabase` enables foreign keys and WAL, then applies `drizzle/*.sql` through a `schema_migrations` table. Tables:

- `curators` — dashboard accounts.
- `playlists`, `videos`, `playlist_entries` — one video can sit in several playlists. Order is `position`.
- `chapters` — description chapters or curator-entered chapters.
- `transcripts`, `transcript_segments` — one transcript’s cues, with source type and provenance. Suggestions store a short evidence quote and refs, not a second copy of the transcript.
- `curriculum_syncs`, `lesson_references` — cached Good Dog lessons. Primary key is `exercise:<id>` or `guide:<id>`.
- `match_suggestions` — proposed matches, including review status and the curriculum version used.
- `curated_segments` — the human-approved record. At most one segment per suggestion.
- `audit_events` — approval, rejection, and return-to-draft.

Import is idempotent on YouTube playlist id and video id. Re-import updates metadata and playlist membership and does not delete transcripts or approved segments.

## YouTube

Playlist and video URLs are parsed locally. The server never fetches a URL the curator pasted. Metadata calls go only to `https://www.googleapis.com/youtube/v3` when `YOUTUBE_API_KEY` is set. Playlist items are paged with `nextPageToken`. Video details are requested in chunks. Failures retry with backoff. The API key is stripped from error text.

Without a key, the curator still works:

- paste one video URL (optional oEmbed from `https://www.youtube.com/oembed`);
- upload a metadata JSON file that matches the import schema;
- import the labelled development fixture.

The fixture playlist id is `FIXTUREDEV01`. Its videos are `MOCKLEAD001` and `MOCKGONE001`. They are not YouTube videos. The candidate playlists `PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp` and `PLuC3XYn_061gRfPD36FvekujhPRXSlxde` were not requested. No live playlist has been imported in this repository.

Embeds use `https://www.youtube-nocookie.com/embed/{videoId}` with `start`, optional `end`, and `rel=0`. The `end` parameter is a player hint. This app does not claim the player stops on that exact frame. Privacy-enhanced mode still lets YouTube receive playback data; it is not a privacy guarantee. Unavailable, private, deleted, age-restricted, and non-embeddable videos keep a direct watch link and do not break the page. Thumbnails are accepted only from `i.ytimg.com` and `yt3.ggpht.com`.

Transcripts come from a pasted caption file or an uploaded `.vtt` or `.srt`. The app does not download YouTube captions and does not scrape them. Each saved transcript records that the curator supplied it. If a video has only a description, the UI says “Metadata only” or “Chapters available”. A retrieval error on an available video is “Extraction failed”. An unavailable video is “Manual review required”, not a fake successful extraction.

## Matching and review

Deterministic matching prefers, in order: transcript cues, chapters, then title and description. A transcript suggestion is the smallest useful window, capped at 90 seconds, that contains the lesson keywords. A timestamp is stored only when it comes from a cue, a chapter, or a time the curator typed. Description-only hits are ungrounded and are dropped when a grounded hit exists for the same lesson. Overlapping suggestions for the same lesson collapse to the stronger one.

If `OPENAI_API_KEY` is set, an optional client may propose extra matches. The model must return JSON. Zod checks the shape. Unknown lesson ids and video ids are rejected. Timestamps outside a supplied evidence window are rejected. The evidence quote must be a substring of that window. A provider failure leaves the deterministic suggestions in place. Nothing from the model is approved by itself.

Welfare flags (punishment, aversives, aggression, pain or medical claims, unsafe dog interactions, life-stage mismatch, and the aversive patterns copied from Good Dog’s safety file) are review prompts. They do not auto-reject a video. Explanations are labelled as editorial. The model is not asked to certify a trainer.

Approval writes a `curated_segments` row, an audit event, and a watch URL. `last_verified_at` is the time the curator confirmed the segment in this app. It is not a live YouTube probe. Rejection and return-to-draft remove the segment from the export.

## Authentication

The dashboard and `GET /api/export` require a `curator_session` cookie signed with `AUTH_SECRET` (at least 16 characters). The first account is created from `CURATOR_EMAIL`, `CURATOR_PASSWORD`, and `CURATOR_NAME` when the database has no curators. Sign-in is limited to 8 attempts per email per 10 minutes. YouTube Data API calls are limited to 20 per hour in-process. There is no public write API.

## Backup and migrations

The database is one file plus its WAL sidecars (`curator.db`, `curator.db-wal`, `curator.db-shm`). To back it up, stop the process or use SQLite’s online backup, and copy all three files. Restoring only the main file while a WAL is present can drop the latest commits.

Schema changes are new ordered files in `drizzle/`. `migrate()` runs each file once inside a transaction and records it in `schema_migrations`. `npm run db:migrate` applies them. `npm run db:reset` deletes the local database and seeds again. Do not point `DATABASE_URL` at Good Dog’s `data/good-dog.db`.

## What is implemented

A curator can sign in, import the fixture or a single video, attach a VTT/SRT transcript or chapters, generate deterministic suggestions against the real Good Dog catalogue, edit timestamps, approve or reject, return a segment to draft, and download validated JSON. Playlist import, pagination, and retries are implemented and tested with mocked API responses. They are unused until `YOUTUBE_API_KEY` is set.

## What is not implemented

- No change to the Good Dog app, and no push of segments into its database.
- No import of the two candidate playlists, and no claim that their videos were retrieved.
- No YouTube caption download.
- No live call to an LLM provider in tests or in the default setup.
- The `published` status exists for a later hand-off. Export includes `approved` and `published` rows; this app does not flip rows to `published` by itself.
- In-process rate limits reset when the process restarts. They are not a shared quota store.
