import { parseClock } from "@/lib/timestamps";

export type ChapterDraft = {
  title: string;
  startSeconds: number;
  endSeconds: number | null;
};

const LINE =
  /^\s*(?:[-*]\s*)?(?:\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?)\s*[-–—:]?\s+(\S.*)$/;

export function extractChapters(description: string): ChapterDraft[] {
  const found: Array<{ title: string; startSeconds: number }> = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const match = LINE.exec(rawLine);
    if (!match) continue;
    const startSeconds = parseClock(match[1] ?? "");
    const title = (match[2] ?? "").trim();
    if (startSeconds === null || !title) continue;
    found.push({ title: title.replace(/\s+/g, " "), startSeconds });
  }
  if (found.length < 2) return [];
  found.sort((a, b) => a.startSeconds - b.startSeconds);
  return found.map((chapter, index) => ({
    title: chapter.title,
    startSeconds: chapter.startSeconds,
    endSeconds: found[index + 1]?.startSeconds ?? null,
  }));
}
