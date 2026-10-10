import { isVideoId } from "./parse";

export function canonicalWatchUrl(videoId: string, startSeconds?: number | null): string {
  if (!isVideoId(videoId)) {
    throw new Error("Cannot build a YouTube link for an invalid video ID.");
  }
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  if (startSeconds != null && startSeconds > 0) {
    url.searchParams.set("t", `${Math.floor(startSeconds)}s`);
  }
  return url.toString();
}

export function buildEmbedUrl(input: {
  videoId: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  privacyEnhanced?: boolean;
}): string {
  if (!isVideoId(input.videoId)) {
    throw new Error("Cannot embed an invalid video ID.");
  }
  const host = input.privacyEnhanced === false ? "www.youtube.com" : "www.youtube-nocookie.com";
  const url = new URL(`https://${host}/embed/${input.videoId}`);
  if (input.startSeconds != null && input.startSeconds > 0) {
    url.searchParams.set("start", String(Math.floor(input.startSeconds)));
  }
  if (input.endSeconds != null && input.endSeconds > 0) {
    url.searchParams.set("end", String(Math.floor(input.endSeconds)));
  }
  url.searchParams.set("rel", "0");
  return url.toString();
}

export function safeThumbnailUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "i.ytimg.com" && url.hostname !== "yt3.ggpht.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}
