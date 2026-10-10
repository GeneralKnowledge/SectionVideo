# Good Dog integration

The curator does not call Good Dog at runtime. Good Dog does not yet import this file. The contract is a versioned JSON document that a future Good Dog change can read, plus a curriculum snapshot this app already reads.

## Curriculum snapshot

`curriculum/good-dog-curriculum.v1.json` is produced from a Good Dog checkout:

```bash
GOOD_DOG_PATH=/path/to/Good-Dog npm run curriculum:extract
```

The script reads committed source only:

- `src/lib/domains/dog-training/content/exercises.ts`
- `src/lib/domains/dog-training/content/learning-objectives.ts`
- `src/lib/domains/dog-training/kb-crash-course.ts`
- `src/lib/domains/dog-training/content/kb-import/good-dog-guides.json`
- `src/lib/domains/dog-training/content/kb-import/good-dog-domain.json`
- `src/lib/domains/dog-training/content/kb-import/good-dog-crash-course.json`
- `src/lib/domains/dog-training/content/kb-import/good-dog-safety.json`

Commit the new snapshot, then restart the curator or run `npm run db:seed`. Sync upserts `lesson_references` by `(lesson_id, lesson_kind)`. It does not delete suggestions or approved segments. If `curriculumVersion` changes, existing suggestions are marked stale so a person can look at them again. Lessons missing from the new snapshot get `removed_at`. Their segments remain and the export adds a `lesson_removed` warning.

The current snapshot is Good Dog commit `de42e3e226278fc66790a80d85da094579ec1738`: 28 exercises and 12 guides.

## Which id to store

Use the id Good Dog already uses in routes and tables.

| `lessonKind` | `lessonId` | Good Dog route |
| --- | --- | --- |
| `exercise` | `exercises.id`, for example `ex-lead-loose` | `/exercise/ex-lead-loose` |
| `guide` | guide `lessonId`, for example `lesson-how-dogs-learn` | `/learn/guides/lesson-how-dogs-learn` |

Do not match on titles. Titles change; these ids are the stable keys.

Crash-course ids such as `lesson-loose-lead` are aliases. `lesson-loose-lead` currently points at both `ex-lead-intro` (from `LESSON_EXERCISE_MAP`) and `ex-lead-loose` (from `good-dog-domain.json` `held[]`). Exports name the exercise the curator chose. Good Dog should resolve aliases with the same two sources and should not assume they agree.

## Export document

`GET /api/export` returns `good-dog-segments.json` for a signed-in curator. The same document is previewed on the Export page. The body is validated with Zod before it is sent. Schema version is `1`.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-10-10T18:00:00.000Z",
  "curriculumVersion": "good-dog@de42e3e226278fc66790a80d85da094579ec1738",
  "source": {
    "application": "section-video",
    "note": "Approved segments only. AI suggestions are never included unless a curator approved them."
  },
  "segments": [
    {
      "videoId": "MOCKLEAD001",
      "title": "Demonstrating the technique",
      "startSeconds": 45,
      "endSeconds": 88,
      "lessonId": "ex-lead-loose",
      "lessonKind": "exercise",
      "learningObjectiveId": "lead-walking",
      "learningObjective": "Walking more comfortably on lead",
      "viewingInstructions": ["Observe how the handler rewards the dog for a loose lead."],
      "sourceUrl": "https://www.youtube.com/watch?v=MOCKLEAD001&t=45s",
      "channelName": "Fixture channel — sample data",
      "embedAllowed": null,
      "availability": "available",
      "reviewStatus": "approved",
      "fixture": true,
      "curriculumVersion": "good-dog@de42e3e226278fc66790a80d85da094579ec1738"
    }
  ],
  "warnings": [
    {
      "code": "fixture_video",
      "videoId": "MOCKLEAD001",
      "lessonId": "ex-lead-loose",
      "message": "Fixture video. Do not publish this segment to Good Dog as a real recommendation."
    }
  ]
}
```

The segment above is the shape, illustrated with the labelled fixture. `MOCKLEAD001` is not a YouTube video. Good Dog must skip every segment with `fixture: true`, and every warning with code `fixture_video`.

Only rows a person approved are present. Suggested matches are absent.

### Fields Good Dog should trust

- `lessonId` plus `lessonKind` — look up the exercise or guide. Ignore the segment when that id is not in the current catalogue.
- `videoId` — 11-character YouTube id. Build the embed from this id. Do not download the media.
- `startSeconds` — integer seconds, the point the curator approved.
- `endSeconds` — integer seconds, or `null`. Pass `end` to the iframe if you wish. YouTube does not guarantee the player stops on that frame. Keep a link to `sourceUrl` either way.
- `viewingInstructions` — curator copy. It is not a transcript and not a certification of the channel.
- `channelName` — attribution. Show it next to the embed.
- `curriculumVersion` — the Good Dog commit the lesson text was taken from. If it differs from the build that is importing, refresh the lesson text from Good Dog and keep the segment only when `lessonId` still exists.

### Warnings

| Code | What to do |
| --- | --- |
| `fixture_video` | Drop the segment. It is sample data. |
| `video_unavailable` | `availability` is `deleted`, `private`, `unavailable`, `age_restricted`, or `unknown`. Do not iframe it. Show `sourceUrl` and say the video could not be played. |
| `embed_blocked` | `embedAllowed` is `false`. Link to `sourceUrl` instead of embedding. |
| `lesson_removed` | The lesson id was in an older snapshot and is missing from the latest sync. Hide the segment until someone maps it to a current lesson. |

`availability: available` with `embedAllowed: null` means the curator has not been told whether embedding is allowed. Try the nocookie iframe, and fall back to `sourceUrl` if the player reports that embedding is blocked.

### Schema changes

Reject a document whose `schemaVersion` is not `1`. A later version will add a field or change a type only by bumping `schemaVersion`. Consumers should ignore unknown warning codes inside version 1, and should refuse unknown segment fields only when they cannot satisfy the required ones above.

Validate with the same rules as `src/lib/export/schema.ts` before inserting anything: `videoId` matches `^[A-Za-z0-9_-]{11}$`, `startSeconds` is a non-negative integer, and `endSeconds` is either `null` or greater than `startSeconds`.

### Playback

A compliant embed, when `embedAllowed` is not `false` and `availability` is `available`:

```text
https://www.youtube-nocookie.com/embed/{videoId}?start={startSeconds}&end={endSeconds}&rel=0
```

Omit `end` when `endSeconds` is null. Omit `start` when it is 0. The privacy-enhanced host does not remove YouTube’s data collection. Attribute `channelName` and link `sourceUrl`.

This curator never downloads, transcodes, or rehosts the video file.
