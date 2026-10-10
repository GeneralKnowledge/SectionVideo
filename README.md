# Good Dog Video Curator

Editorial tool for attaching YouTube demonstrations to [Good Dog](https://github.com/GeneralKnowledge/Good-Dog) lessons. The video stays on YouTube. A curator approves a start time, an optional end time, and a short viewing note. Approved rows export as versioned JSON.

Manual curation works with no YouTube Data API key and no LLM key. Suggestions are never exported until a person approves them.

This repository does not modify Good Dog. Lesson ids come from a snapshot of Good Dog commit `de42e3e226278fc66790a80d85da094579ec1738`. See [docs/architecture.md](docs/architecture.md) and [docs/integration.md](docs/integration.md).

The two candidate playlists (`PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp` and `PLuC3XYn_061gRfPD36FvekujhPRXSlxde`) are not imported here. Nothing in the database claims to be those playlists.

## Setup

```bash
npm install
cp .env.example .env.local
npm run db:seed
npm run dev
```

Open the app, sign in with `CURATOR_EMAIL` and `CURATOR_PASSWORD`, then import the labelled development fixture or paste a single YouTube URL.

`DATABASE_URL` must be this app’s SQLite file (default `./data/curator.db`). Do not point it at Good Dog’s database.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | SQLite path |
| `AUTH_SECRET` | yes | Session signing secret, at least 16 characters |
| `CURATOR_EMAIL` | yes for the first account | Seeded curator |
| `CURATOR_PASSWORD` | yes for the first account | Seeded curator |
| `CURATOR_NAME` | no | Display name |
| `YOUTUBE_API_KEY` | no | Playlist import via the Data API |
| `OPENAI_API_KEY` | no | Optional semantic matching |
| `OPENAI_BASE_URL` | no | OpenAI-compatible chat endpoint |
| `OPENAI_MODEL` | no | Chat model name |
| `GOOD_DOG_PATH` | only for extract | Local Good Dog checkout |

## Daily commands

```bash
npm run dev            # next dev
npm run db:migrate     # apply drizzle/*.sql
npm run db:seed        # migrate, sync the curriculum snapshot, ensure a curator
npm run db:reset       # delete the local database and seed again
npm run curriculum:extract   # rebuild the snapshot from GOOD_DOG_PATH
npm run lint
npm run typecheck
npm run test           # Vitest; YouTube is mocked
npm run test:e2e       # Playwright against the labelled fixture
npm run check
```

## Workflow

1. Import the fixture, a video URL, a metadata file, or (when a key is set) a playlist URL.
2. Open a video. Chapters parsed from the description show as “Chapters available”.
3. Paste or upload a VTT or SRT if you have one. The status becomes “Transcript available”. The app does not download YouTube captions.
4. Suggest matches, or map a lesson yourself and type the start and end in whole seconds.
5. Preview the privacy-enhanced embed. Approve, reject, or later return the segment to draft.
6. Export. The file includes only approved segments and is checked against schema version 1.

On the review queue, `j` and `k` move between suggestions, `a` approves, and `r` rejects, when focus is outside a text field.

The development fixture uses playlist id `FIXTUREDEV01` and video ids `MOCKLEAD001` and `MOCKGONE001`. Those ids are sample data. Exports mark them with `fixture: true`. Good Dog should skip them.

## Backup

Copy `data/curator.db` together with `data/curator.db-wal` and `data/curator.db-shm`, or use SQLite’s online backup while the app is running. Restoring the main file alone can drop commits that were still in the WAL. Schema changes are new files in `drizzle/`. Details are in [docs/architecture.md](docs/architecture.md).
