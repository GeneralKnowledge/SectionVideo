const CLOCK = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const match = CLOCK.exec(trimmed);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function clockToMs(value: string): number | null {
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? match[4].padEnd(3, "0").slice(0, 3) : "0";
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + Number(fraction);
}

export type TimingInput = {
  startSeconds: number;
  endSeconds: number | null;
  durationSeconds?: number | null;
};

export function validateTiming(input: TimingInput): { ok: true } | { ok: false; error: string } {
  const { startSeconds, endSeconds, durationSeconds } = input;
  if (!Number.isInteger(startSeconds) || startSeconds < 0) {
    return { ok: false, error: "Start time must be a whole number of seconds, zero or greater." };
  }
  if (endSeconds !== null && (!Number.isInteger(endSeconds) || endSeconds <= startSeconds)) {
    return { ok: false, error: "End time must be a whole number of seconds after the start." };
  }
  if (durationSeconds != null) {
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
      return { ok: false, error: "Video duration is not a valid number of seconds." };
    }
    if (startSeconds >= durationSeconds) {
      return { ok: false, error: "Start time is past the end of the video." };
    }
    if (endSeconds !== null && endSeconds > durationSeconds) {
      return { ok: false, error: "End time is past the end of the video." };
    }
  }
  return { ok: true };
}

export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}
