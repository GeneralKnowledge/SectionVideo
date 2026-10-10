import { clockToMs } from "@/lib/timestamps";

export type Cue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type CueParseResult =
  | { ok: true; sourceType: "vtt" | "srt"; cues: Cue[] }
  | { ok: false; error: string };

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRange(line: string): { startMs: number; endMs: number } | null {
  const match = line
    .trim()
    .match(
      /((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/,
    );
  if (!match) return null;
  const startMs = clockToMs((match[1] ?? "").replace(",", "."));
  const endMs = clockToMs((match[2] ?? "").replace(",", "."));
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  return { startMs, endMs };
}

export function parseVtt(source: string): CueParseResult {
  const text = source.replace(/^\uFEFF/, "");
  if (!/^WEBVTT\b/.test(text.trim())) {
    return { ok: false, error: "That file does not start with a WEBVTT header." };
  }
  const lines = text.split(/\r?\n/);
  const cues: Cue[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) {
      index += 1;
      while (index < lines.length && (lines[index] ?? "").trim() !== "") index += 1;
      continue;
    }
    const range = parseRange(line);
    if (!range) {
      index += 1;
      continue;
    }
    index += 1;
    const parts: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() !== "") {
      parts.push(lines[index] ?? "");
      index += 1;
    }
    const cueText = decode(parts.join(" "));
    if (cueText) cues.push({ ...range, text: cueText });
  }
  if (cues.length === 0) {
    return { ok: false, error: "The VTT file did not contain any cues." };
  }
  return { ok: true, sourceType: "vtt", cues };
}

export function parseSrt(source: string): CueParseResult {
  const blocks = source.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) continue;
    const rangeLine = lines.find((line) => line.includes("-->"));
    if (!rangeLine) continue;
    const range = parseRange(rangeLine);
    if (!range) continue;
    const textLines = lines.slice(lines.indexOf(rangeLine) + 1);
    const cueText = decode(textLines.join(" "));
    if (cueText) cues.push({ ...range, text: cueText });
  }
  if (cues.length === 0) {
    return { ok: false, error: "The SRT file did not contain any cues." };
  }
  return { ok: true, sourceType: "srt", cues };
}

export function parseTranscript(source: string, filename = ""): CueParseResult {
  const trimmed = source.trim();
  const lower = filename.toLowerCase();
  if (lower.endsWith(".vtt") || trimmed.startsWith("WEBVTT")) return parseVtt(source);
  if (lower.endsWith(".srt") || /-->/.test(trimmed)) return parseSrt(source);
  return {
    ok: false,
    error: "Paste a VTT or SRT transcript, or upload a .vtt or .srt file.",
  };
}
