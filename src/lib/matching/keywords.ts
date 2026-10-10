const STOP = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "before",
  "dog",
  "dogs",
  "from",
  "have",
  "help",
  "into",
  "just",
  "keep",
  "more",
  "practice",
  "practise",
  "reward",
  "rewards",
  "session",
  "short",
  "that",
  "their",
  "them",
  "then",
  "they",
  "this",
  "treat",
  "treats",
  "with",
  "your",
]);

const OBJECTIVE_PHRASES: Record<string, string[]> = {
  "lead-walking": ["loose lead", "loose leash", "leash", "slack", "soft lead", "lead walking"],
  recall: ["recall", "come when called"],
  sit: ["sit"],
  "leave-it": ["leave it"],
  "name-response": ["name response"],
  "reward-marker": ["marker word", "yes word"],
  "mat-settle": ["settle on a mat", "mat"],
  "check-in": ["check in", "check-in"],
  down: ["down"],
  "hand-target": ["hand touch", "nose to hand"],
  handling: ["handling", "gentle touch"],
  greetings: ["greeting", "jumping up"],
  "door-manners": ["doorway", "door manners"],
  "puppy-mouthing": ["mouthing"],
  housetraining: ["toilet", "house training"],
  "trick-training": ["spin"],
  wait: ["wait", "stay"],
  engagement: ["attention", "engagement"],
  "calm-home": ["settle", "calm at home"],
  "rest-spot": ["rest spot"],
  "puppy-confidence": ["puppy confidence", "surfaces", "sounds"],
};

export function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordsForLesson(input: {
  title: string;
  summary: string;
  learningObjectiveId?: string | null;
  learningObjectiveLabel?: string | null;
  steps?: string[];
  extraPhrases?: string[];
}): string[] {
  const phrases = new Set<string>();
  const title = normaliseText(input.title);
  if (title.split(" ").length >= 2) phrases.add(title);
  if (input.learningObjectiveLabel) {
    const label = normaliseText(input.learningObjectiveLabel);
    if (label) phrases.add(label);
  }
  for (const phrase of OBJECTIVE_PHRASES[input.learningObjectiveId ?? ""] ?? []) {
    phrases.add(normaliseText(phrase));
  }
  for (const phrase of input.extraPhrases ?? []) {
    const normalised = normaliseText(phrase);
    if (normalised.length >= 4) phrases.add(normalised);
  }
  const tokens = normaliseText(
    [input.summary, ...(input.steps ?? [])].join(" "),
  )
    .split(" ")
    .filter((token) => token.length >= 5 && !STOP.has(token));
  for (const token of tokens.slice(0, 16)) phrases.add(token);
  return [...phrases].filter(Boolean);
}

export function containsKeyword(haystack: string, keyword: string): boolean {
  const hay = normaliseText(haystack);
  const needle = normaliseText(keyword);
  if (!needle) return false;
  if (needle.includes(" ")) return hay.includes(needle);
  return new RegExp(`(?:^|\\s)${needle}(?:\\s|$)`).test(hay);
}
