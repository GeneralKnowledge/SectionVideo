import snapshot from "../../../curriculum/good-dog-curriculum.v1.json";

export type SafetyFlag =
  | "fear_intimidation_punishment"
  | "leash_corrections_aversive_equipment"
  | "aggression_reactivity"
  | "pain_injury_medical"
  | "unsafe_dog_interactions"
  | "stage_concern"
  | "good_dog_aversive_pattern";

const GROUPS: Array<{ id: SafetyFlag; patterns: RegExp[] }> = [
  {
    id: "fear_intimidation_punishment",
    patterns: [
      /\bpunish(?:ment|ed|ing)?\b/i,
      /\bintimidat(?:e|ion|ing)\b/i,
      /\balpha roll\b/i,
      /\bshock(?:ed|ing)?\b/i,
      /\bhit(?:ting)? (?:the |your )?dog\b/i,
      /\byell(?:ing)? at\b/i,
      /\bshout(?:ing)? at\b/i,
    ],
  },
  {
    id: "leash_corrections_aversive_equipment",
    patterns: [
      /\b(?:leash|lead) correction\b/i,
      /\bprong\b/i,
      /\bchoke chain\b/i,
      /\bslip lead\b/i,
      /\be-?collar\b/i,
      /\bshock collar\b/i,
      /\bjerk(?:ing)? the (?:lead|leash)\b/i,
    ],
  },
  {
    id: "aggression_reactivity",
    patterns: [/\baggress/i, /\breactiv/i, /\blung(?:e|ing)\b/i, /\bsnarl/i, /\bbite\b/i],
  },
  {
    id: "pain_injury_medical",
    patterns: [/\blimp(?:ing)?\b/i, /\binjur/i, /\bmedication\b/i, /\bpain relief\b/i, /\bdiagnos/i],
  },
  {
    id: "unsafe_dog_interactions",
    patterns: [/\blet them sort it out\b/i, /\bdominance fight\b/i, /\bdog park fight\b/i],
  },
];

const goodDogPatterns = (
  snapshot.aversivePatterns as Array<{ source: string; flags?: string }>
).map((pattern) => new RegExp(pattern.source, pattern.flags ?? "i"));

export function safetyFlagsFor(text: string, stageConcern = false): SafetyFlag[] {
  const flags = new Set<SafetyFlag>();
  for (const group of GROUPS) {
    if (group.patterns.some((pattern) => pattern.test(text))) flags.add(group.id);
  }
  if (goodDogPatterns.some((pattern) => pattern.test(text))) {
    flags.add("good_dog_aversive_pattern");
  }
  if (stageConcern) flags.add("stage_concern");
  return [...flags];
}

export const SAFETY_FLAG_LABELS: Record<SafetyFlag, string> = {
  fear_intimidation_punishment: "Fear, intimidation, or punishment",
  leash_corrections_aversive_equipment: "Leash corrections or aversive equipment",
  aggression_reactivity: "Aggression or reactivity",
  pain_injury_medical: "Pain, injury, or medical advice",
  unsafe_dog_interactions: "Unsafe dog-to-dog interaction",
  stage_concern: "May not suit the lesson’s life stage",
  good_dog_aversive_pattern: "Matches a Good Dog aversive pattern",
};
