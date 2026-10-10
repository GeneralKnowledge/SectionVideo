export type Availability =
  | "available"
  | "unavailable"
  | "private"
  | "deleted"
  | "age_restricted"
  | "unknown";

export type EmbedStatus = "unknown" | "allowed" | "blocked";

export type ImportSource = "api" | "manual" | "fixture" | "metadata_file";

export type ImportVideo = {
  videoId: string;
  title: string;
  description: string;
  channelName: string;
  channelUrl?: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  position: number;
  availability: Availability;
  embedStatus: EmbedStatus;
  unavailableReason?: string | null;
};

export type ImportPayload = {
  playlistId: string;
  title: string;
  description: string;
  source: ImportSource;
  isFixture: boolean;
  videos: ImportVideo[];
  warnings: string[];
  canonicalPlaylistUrl?: string;
  watchUrlFor?: (videoId: string) => string;
};
