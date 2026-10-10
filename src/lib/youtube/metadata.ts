import { z } from "zod";
import type { ImportPayload } from "./types";

export const metadataFileSchema = z.object({
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{10,80}$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().default(""),
  videos: z
    .array(
      z.object({
        videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(20000).optional().default(""),
        channelName: z.string().max(200).optional().default(""),
        durationSeconds: z.number().int().nonnegative().nullable().optional(),
        position: z.number().int().nonnegative(),
        availability: z
          .enum(["available", "unavailable", "private", "deleted", "age_restricted", "unknown"])
          .optional(),
        thumbnailUrl: z.string().url().nullable().optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export function payloadFromMetadata(raw: unknown): ImportPayload {
  const parsed = metadataFileSchema.parse(raw);
  return {
    playlistId: parsed.playlistId,
    title: parsed.title,
    description: parsed.description,
    source: "metadata_file",
    isFixture: false,
    warnings: ["Imported from a metadata file supplied by the curator. YouTube was not contacted."],
    videos: parsed.videos.map((video) => ({
      videoId: video.videoId,
      title: video.title,
      description: video.description,
      channelName: video.channelName,
      durationSeconds: video.durationSeconds ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
      position: video.position,
      availability: video.availability ?? "unknown",
      embedStatus: "unknown",
      unavailableReason:
        video.availability && video.availability !== "available"
          ? `Metadata file marked this video ${video.availability}.`
          : null,
    })),
  };
}
