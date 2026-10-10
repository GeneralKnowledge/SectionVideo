"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { requireCurator } from "@/lib/auth/current";
import { getDb } from "@/lib/db";
import { takeToken } from "@/lib/rate-limit";
import { createOpenAiClient } from "@/lib/matching/openai";
import { parseExportDocument } from "@/lib/export/schema";
import { addManualVideo } from "@/lib/services/manual-video";
import { importDevelopmentFixture, importPlaylist, recordPlaylistFailure } from "@/lib/services/importing";
import {
  approveSuggestion,
  createManualSuggestion,
  generateSuggestions,
  rejectSuggestion,
  returnSegmentToDraft,
} from "@/lib/services/review";
import { findCuratorByEmail, ensureReady } from "@/lib/services/ready";
import { addManualChapter, saveTranscript } from "@/lib/services/transcripts";
import { fetchYouTubePlaylist } from "@/lib/youtube/api";
import { payloadFromMetadata } from "@/lib/youtube/metadata";
import { parsePlaylistUrl } from "@/lib/youtube/parse";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function wholeSeconds(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function signInAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  if (!takeToken(`signin:${email}`, 8, 10 * 60 * 1000)) {
    return { ok: false, error: "Too many sign-in attempts. Wait a few minutes and try again." };
  }
  const handle = getDb();
  await ensureReady(handle);
  const curator = findCuratorByEmail(handle, email);
  if (!curator || !(await verifyPassword(password, curator.passwordHash))) {
    return { ok: false, error: "Those details do not match a curator account." };
  }
  const token = await createSessionToken(curator.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}

export async function importFixtureAction(): Promise<void> {
  const actor = await requireCurator();
  const result = importDevelopmentFixture(getDb(), actor.id);
  redirect(`/playlists/${result.playlistInternalId}`);
}

export async function importPlaylistAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireCurator();
  const parsed = parsePlaylistUrl(text(formData, "playlistUrl"));
  if (!parsed.ok) return parsed;
  const apiKey = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return {
      ok: false,
      error:
        "No YouTube Data API key is configured. Add videos manually, upload a metadata file, or import the labelled development fixture.",
    };
  }
  if (!takeToken("youtube-api", 20, 60 * 60 * 1000)) {
    return { ok: false, error: "The YouTube import limit for this hour has been reached." };
  }
  const fetched = await fetchYouTubePlaylist({ playlistId: parsed.playlist.playlistId, apiKey });
  if (!fetched.ok) {
    const id = recordPlaylistFailure(
      getDb(),
      { playlistId: parsed.playlist.playlistId, title: "Playlist import failed", error: fetched.error },
      actor.id,
    );
    redirect(`/playlists/${id}`);
  }
  const result = importPlaylist(getDb(), fetched.payload, actor.id);
  redirect(`/playlists/${result.playlistInternalId}`);
}

export async function importMetadataAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireCurator();
  const file = formData.get("metadata");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a JSON metadata file." };
  }
  if (file.size > 2_000_000) return { ok: false, error: "That metadata file is too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  let payload;
  try {
    payload = payloadFromMetadata(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: "The metadata file did not match the import schema." };
    }
    throw error;
  }
  const result = importPlaylist(getDb(), payload, actor.id);
  redirect(`/playlists/${result.playlistInternalId}`);
}

export async function addVideoAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireCurator();
  const duration = wholeSeconds(text(formData, "duration"));
  const result = await addManualVideo(getDb(), {
    url: text(formData, "url"),
    title: text(formData, "title"),
    description: text(formData, "description"),
    channelName: text(formData, "channel"),
    durationSeconds: duration,
    actorId: actor.id,
  });
  if (!result.ok) return result;
  redirect(`/videos/${result.videoId}`);
}

export async function saveTranscriptAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireCurator();
  const videoId = text(formData, "videoId");
  const file = formData.get("file");
  let source = text(formData, "transcript");
  let filename = "";
  if (file instanceof File && file.size > 0) {
    if (file.size > 1_000_000) return { ok: false, error: "That transcript file is too large." };
    source = await file.text();
    filename = file.name;
  }
  const result = saveTranscript(getDb(), {
    videoId,
    source,
    filename,
    actorId: actor.id,
  });
  if (!result.ok) return result;
  revalidatePath(`/videos/${videoId}`);
  return { ok: true, message: `Stored ${result.cueCount} transcript cues.` };
}

export async function addChapterAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireCurator();
  const start = wholeSeconds(text(formData, "start"));
  if (start === null) return { ok: false, error: "Enter a chapter start in whole seconds." };
  const end = wholeSeconds(text(formData, "end"));
  const result = addManualChapter(getDb(), {
    videoId: text(formData, "videoId"),
    title: text(formData, "title"),
    startSeconds: start,
    endSeconds: end,
    actorId: actor.id,
  });
  if (!result.ok) return result;
  revalidatePath(`/videos/${text(formData, "videoId")}`);
  return { ok: true, message: "Chapter saved." };
}

export async function suggestFormAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return suggestAction(text(formData, "videoId"));
}

export async function suggestAction(videoId: string): Promise<ActionResult> {
  try {
    const actor = await requireCurator();
    const result = await generateSuggestions(getDb(), videoId, actor.id, createOpenAiClient());
    if (!result.ok) return result;
    const extra = result.llmNote ? ` ${result.llmNote}` : "";
    revalidatePath(`/videos/${videoId}`);
    revalidatePath("/review");
    return { ok: true, message: `Prepared ${result.count} suggestion(s).${extra}` };
  } catch (error) {
    console.error("suggestAction failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Matching failed.",
    };
  }
}

export async function manualMapAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireCurator();
  const start = wholeSeconds(text(formData, "start"));
  if (start === null) return { ok: false, error: "Enter a start time in whole seconds." };
  const result = createManualSuggestion(getDb(), actor, {
    videoId: text(formData, "videoId"),
    lessonReferenceId: text(formData, "lessonReferenceId"),
    startSeconds: start,
    endSeconds: wholeSeconds(text(formData, "end")),
    note: text(formData, "note"),
  });
  if (!result.ok) return result;
  revalidatePath(`/videos/${text(formData, "videoId")}`);
  revalidatePath("/review");
  return { ok: true, message: "Manual mapping added to the review list." };
}

export async function approveFormAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return approveAction(formData);
}

export async function approveAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireCurator();
  const start = wholeSeconds(text(formData, "start"));
  if (start === null) return { ok: false, error: "Enter a start time in whole seconds." };
  const result = approveSuggestion(getDb(), actor, {
    suggestionId: text(formData, "suggestionId"),
    startSeconds: start,
    endSeconds: wholeSeconds(text(formData, "end")),
    displayTitle: text(formData, "title"),
    viewingInstructions: lines(text(formData, "instructions")),
    curatorNotes: text(formData, "notes"),
  });
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/export");
  revalidatePath("/lessons");
  return { ok: true, message: "Segment approved. It can now be exported." };
}

export async function rejectFormAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return rejectAction(formData);
}

export async function rejectAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireCurator();
  const result = rejectSuggestion(getDb(), actor, text(formData, "suggestionId"), text(formData, "notes"));
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/export");
  return { ok: true, message: "Suggestion rejected." };
}

export async function draftFormAction(formData: FormData): Promise<void> {
  await draftAction(formData);
}

export async function draftAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireCurator();
  const result = returnSegmentToDraft(getDb(), actor, text(formData, "segmentId"));
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/export");
  revalidatePath("/lessons");
  return { ok: true, message: "Segment returned to draft and removed from the export." };
}

export async function validateExportAction(
  _state: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireCurator();
  const file = formData.get("exportFile");
  const pasted = text(formData, "exportJson");
  const source = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!source) return { ok: false, error: "Paste export JSON or choose a file." };
  try {
    const document = parseExportDocument(JSON.parse(source));
    return {
      ok: true,
      message: `Valid schema version ${document.schemaVersion} with ${document.segments.length} segment(s) and ${document.warnings.length} warning(s).`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The file did not match the export schema.",
    };
  }
}
