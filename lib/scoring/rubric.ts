/**
 * Reader Level Rubric — Single Source of Truth
 *
 * Defines the characteristics of each reading level.
 * Used by the scoring algorithm, seed data tagging, and level classification.
 */

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export interface LevelDefinition {
  level: Level;
  label: string;
  description: string;
  pageRange: { min: number; max: number };
  complexityRange: { min: number; max: number };
  pacing: string[];
  traits: string[];
}

export const LEVEL_RUBRIC: Record<Level, LevelDefinition> = {
  beginner: {
    level: "beginner",
    label: "Beginner",
    description: "Perfect for new readers or those returning to reading",
    pageRange: { min: 100, max: 320 },
    complexityRange: { min: 1, max: 2 },
    pacing: ["fast", "medium"],
    traits: [
      "Simple, linear plot",
      "Easy language",
      "Fast pacing",
      "Few characters",
      "Standalone or light series",
    ],
  },
  intermediate: {
    level: "intermediate",
    label: "Intermediate",
    description: "For readers who enjoy some complexity and depth",
    pageRange: { min: 250, max: 450 },
    complexityRange: { min: 2, max: 3 },
    pacing: ["medium", "fast"],
    traits: [
      "Subplots and some twists",
      "Moderate language",
      "Multiple POVs allowed",
      "Steady pacing",
    ],
  },
  advanced: {
    level: "advanced",
    label: "Advanced",
    description: "For experienced readers seeking challenging reads",
    pageRange: { min: 400, max: 1200 },
    complexityRange: { min: 4, max: 5 },
    pacing: ["slow", "medium"],
    traits: [
      "Layered, non-linear narratives",
      "Demanding language",
      "Slow burn",
      "Literary quality",
      "Large casts",
      "Heavy themes",
    ],
  },
};

/**
 * Classify a book's level according to Section 3.5 single source of truth:
 * - complexity 1-2 and pages <= 320 -> beginner
 * - complexity 4-5 or pages > 500 -> advanced
 * - everything else -> intermediate
 */
export function classifyLevel(complexity: number, pageCount: number | null): Level {
  const pages = pageCount || 250;
  if (complexity <= 2 && pages <= 320) return "beginner";
  if (complexity >= 4 || pages > 500) return "advanced";
  return "intermediate";
}

/**
 * Get the adjacent levels for a given level.
 * Used in scoring: adjacent level = 0.5 match, exact = 1.0, others = 0.1
 */
export function getAdjacentLevels(level: Level): Level[] {
  switch (level) {
    case "beginner":
      return ["intermediate"];
    case "intermediate":
      return ["beginner", "advanced"];
    case "advanced":
      return ["intermediate"];
  }
}
