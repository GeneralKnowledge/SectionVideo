const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;

export type ParsedVideo = { videoId: string };
export type ParsedPlaylist = { playlistId: string; videoId?: string };

function asUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function bareId(input: string, pattern: RegExp): string | null {
  const trimmed = input.trim();
  return pattern.test(trimmed) ? trimmed : null;
}

export function parseVideoUrl(input: string): { ok: true; video: ParsedVideo } | { ok: false; error: string } {
  const direct = bareId(input, VIDEO_ID);
  if (direct) return { ok: true, video: { videoId: direct } };

  const url = asUrl(input);
  if (!url) {
    return { ok: false, error: "Enter a YouTube video URL or an 11-character video ID." };
  }

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!VIDEO_ID.test(videoId)) {
      return { ok: false, error: "That youtu.be link does not contain a video ID." };
    }
    return { ok: true, video: { videoId } };
  }

  if (!YOUTUBE_HOSTS.has(host)) {
    return { ok: false, error: "Only YouTube links can be imported. Other addresses are refused." };
  }

  const fromQuery = url.searchParams.get("v");
  if (fromQuery && VIDEO_ID.test(fromQuery)) {
    return { ok: true, video: { videoId: fromQuery } };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const markers = ["embed", "shorts", "live", "v"];
  const markerIndex = parts.findIndex((part) => markers.includes(part));
  const candidate = markerIndex >= 0 ? parts[markerIndex + 1] : "";
  if (candidate && VIDEO_ID.test(candidate)) {
    return { ok: true, video: { videoId: candidate } };
  }

  return { ok: false, error: "That YouTube link does not contain a video ID." };
}

export function parsePlaylistUrl(
  input: string,
): { ok: true; playlist: ParsedPlaylist } | { ok: false; error: string } {
  const direct = bareId(input, PLAYLIST_ID);
  if (direct && !VIDEO_ID.test(direct)) {
    return { ok: true, playlist: { playlistId: direct } };
  }

  const url = asUrl(input);
  if (!url) {
    return { ok: false, error: "Enter a YouTube playlist URL." };
  }

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || !YOUTUBE_HOSTS.has(host)) {
    return { ok: false, error: "Only YouTube playlist links are accepted." };
  }

  const playlistId = url.searchParams.get("list") ?? "";
  if (!PLAYLIST_ID.test(playlistId)) {
    return { ok: false, error: "That link does not contain a YouTube playlist ID." };
  }

  const video = parseVideoUrl(input);
  return {
    ok: true,
    playlist: {
      playlistId,
      videoId: video.ok ? video.video.videoId : undefined,
    },
  };
}

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

export function isPlaylistId(value: string): boolean {
  return PLAYLIST_ID.test(value);
}
