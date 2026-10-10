import { parseIsoDuration } from "./duration";
import { canonicalWatchUrl } from "./embed";
import { isPlaylistId, isVideoId } from "./parse";
import type { Availability, EmbedStatus, ImportPayload, ImportVideo } from "./types";

type FetchImpl = typeof fetch;

type PlaylistItem = {
  snippet?: {
    title?: string;
    description?: string;
    position?: number;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  };
  contentDetails?: { videoId?: string };
  status?: { privacyStatus?: string };
};

type VideoResource = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  };
  contentDetails?: {
    duration?: string;
    contentRating?: { ytRating?: string };
  };
  status?: {
    privacyStatus?: string;
    embeddable?: boolean;
    uploadStatus?: string;
  };
};

export type YouTubeFetchOptions = {
  playlistId: string;
  apiKey: string;
  fetchImpl?: FetchImpl;
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
  videoChunkSize?: number;
};

function assertApiUrl(url: URL): void {
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com") {
    throw new Error("Refusing a YouTube request to an unexpected host.");
  }
  if (!url.pathname.startsWith("/youtube/v3/")) {
    throw new Error("Refusing a YouTube request to an unexpected path.");
  }
}

function redact(message: string, apiKey: string): string {
  return apiKey ? message.split(apiKey).join("[redacted]") : message;
}

async function requestJson(
  url: URL,
  apiKey: string,
  fetchImpl: FetchImpl,
  sleep: (ms: number) => Promise<void>,
): Promise<{ ok: true; body: unknown } | { ok: false; error: string; status: number }> {
  assertApiUrl(url);
  let lastError = "YouTube did not respond.";
  let status = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(url);
      status = response.status;
      if (response.ok) {
        return { ok: true, body: await response.json() };
      }
      const text = await response.text();
      lastError = redact(`YouTube API returned ${response.status}: ${text.slice(0, 240)}`, apiKey);
      if (response.status !== 429 && response.status < 500) {
        return { ok: false, error: lastError, status: response.status };
      }
    } catch (error) {
      lastError = redact(
        error instanceof Error ? error.message : "YouTube request failed.",
        apiKey,
      );
    }
    if (attempt < 3) await sleep(300 * 3 ** (attempt - 1));
  }
  return { ok: false, error: lastError, status };
}

function availabilityFromPrivacy(privacy: string | undefined, title: string): Availability {
  const normalised = title.trim().toLowerCase();
  if (normalised === "deleted video") return "deleted";
  if (normalised === "private video" || privacy === "private") return "private";
  if (privacy === "privacyStatusUnspecified") return "unavailable";
  if (privacy === "public" || privacy === "unlisted") return "available";
  return "unknown";
}

export async function fetchYouTubePlaylist(
  options: YouTubeFetchOptions,
): Promise<{ ok: true; payload: ImportPayload } | { ok: false; error: string }> {
  if (!isPlaylistId(options.playlistId)) {
    return { ok: false, error: "The playlist ID is not valid." };
  }
  if (!options.apiKey) {
    return {
      ok: false,
      error:
        "YouTube Data API key is not configured. Add a video URL manually, upload a metadata file, or import the labelled development fixture.",
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxPages = options.maxPages ?? 40;
  const chunkSize = options.videoChunkSize ?? 50;
  const items: PlaylistItem[] = [];
  let pageToken = "";
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", options.playlistId);
    url.searchParams.set("key", options.apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const result = await requestJson(url, options.apiKey, fetchImpl, sleep);
    if (!result.ok) {
      if (result.status === 404) {
        return { ok: false, error: "YouTube could not find that playlist. It may be private or deleted." };
      }
      if (result.status === 403) {
        return { ok: false, error: "YouTube refused this playlist. It may be private, or the API key is not allowed to read it." };
      }
      return { ok: false, error: result.error };
    }
    const body = result.body as { items?: PlaylistItem[]; nextPageToken?: string };
    items.push(...(body.items ?? []));
    if (!body.nextPageToken) {
      pageToken = "";
      break;
    }
    pageToken = body.nextPageToken;
    if (page === maxPages - 1) truncated = true;
  }

  const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
  playlistUrl.searchParams.set("part", "snippet,status");
  playlistUrl.searchParams.set("id", options.playlistId);
  playlistUrl.searchParams.set("key", options.apiKey);
  const playlistResult = await requestJson(playlistUrl, options.apiKey, fetchImpl, sleep);
  let title = "Imported playlist";
  let description = "";
  if (playlistResult.ok) {
    const body = playlistResult.body as {
      items?: Array<{ snippet?: { title?: string; description?: string } }>;
    };
    title = body.items?.[0]?.snippet?.title || title;
    description = body.items?.[0]?.snippet?.description || "";
  }

  const ids = items
    .map((item) => item.contentDetails?.videoId || "")
    .filter((id) => isVideoId(id));
  const details = new Map<string, VideoResource>();
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("key", options.apiKey);
    const result = await requestJson(url, options.apiKey, fetchImpl, sleep);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    const body = result.body as { items?: VideoResource[] };
    for (const video of body.items ?? []) {
      if (video.id) details.set(video.id, video);
    }
  }

  const videos: ImportVideo[] = [];
  const warnings: string[] = [];
  if (truncated) {
    warnings.push("Import stopped after the page limit. Re-import later to continue if YouTube returns further pages.");
  }

  for (const item of items) {
    const videoId = item.contentDetails?.videoId ?? "";
    if (!isVideoId(videoId)) {
      warnings.push("Skipped a playlist entry without a usable video ID.");
      continue;
    }
    const detail = details.get(videoId);
    const snippetTitle = detail?.snippet?.title || item.snippet?.title || "Untitled video";
    let availability = availabilityFromPrivacy(
      detail?.status?.privacyStatus || item.status?.privacyStatus,
      snippetTitle,
    );
    if (detail?.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") {
      availability = "age_restricted";
    }
    if (!detail && availability === "available") availability = "unavailable";
    const embedStatus: EmbedStatus =
      detail?.status?.embeddable === true
        ? "allowed"
        : detail?.status?.embeddable === false
          ? "blocked"
          : "unknown";
    const thumbnail =
      detail?.snippet?.thumbnails?.high?.url ||
      detail?.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      null;
    videos.push({
      videoId,
      title: snippetTitle,
      description: detail?.snippet?.description || item.snippet?.description || "",
      channelName: detail?.snippet?.channelTitle || "",
      channelUrl: null,
      durationSeconds: parseIsoDuration(detail?.contentDetails?.duration),
      thumbnailUrl: thumbnail,
      position: item.snippet?.position ?? videos.length,
      availability,
      embedStatus,
      unavailableReason:
        availability === "available" ? null : `YouTube reported this video as ${availability.replaceAll("_", " ")}.`,
    });
  }

  videos.sort((a, b) => a.position - b.position);
  return {
    ok: true,
    payload: {
      playlistId: options.playlistId,
      title,
      description,
      source: "api",
      isFixture: false,
      videos,
      warnings,
      canonicalPlaylistUrl: `https://www.youtube.com/playlist?list=${options.playlistId}`,
      watchUrlFor: canonicalWatchUrl,
    },
  };
}

export async function fetchOEmbed(
  videoId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<
  | {
      ok: true;
      title: string;
      channelName: string;
      channelUrl: string | null;
      thumbnailUrl: string | null;
      embedStatus: "allowed";
    }
  | {
      ok: false;
      error: string;
      availability: Availability;
      embedStatus: EmbedStatus;
    }
> {
  if (!isVideoId(videoId)) {
    return {
      ok: false,
      error: "That video ID is not valid.",
      availability: "unknown",
      embedStatus: "unknown",
    };
  }
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("format", "json");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  if (url.protocol !== "https:" || url.hostname !== "www.youtube.com" || url.pathname !== "/oembed") {
    return {
      ok: false,
      error: "Refusing an unexpected oEmbed address.",
      availability: "unknown",
      embedStatus: "unknown",
    };
  }
  try {
    const response = await fetchImpl(url);
    if (response.ok) {
      const body = (await response.json()) as {
        title?: string;
        author_name?: string;
        author_url?: string;
        thumbnail_url?: string;
      };
      return {
        ok: true,
        title: body.title || "Untitled video",
        channelName: body.author_name || "",
        channelUrl: body.author_url || null,
        thumbnailUrl: body.thumbnail_url || null,
        embedStatus: "allowed",
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error: "YouTube oEmbed refused embedding for this video.",
        availability: "available",
        embedStatus: "blocked",
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        error: "YouTube could not find this video. It may be private or deleted.",
        availability: "unavailable",
        embedStatus: "unknown",
      };
    }
    return {
      ok: false,
      error: `YouTube oEmbed returned ${response.status}.`,
      availability: "unknown",
      embedStatus: "unknown",
    };
  } catch {
    return {
      ok: false,
      error: "YouTube oEmbed could not be reached.",
      availability: "unknown",
      embedStatus: "unknown",
    };
  }
}
