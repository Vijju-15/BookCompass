/**
 * Deterministic Profile-Aware Book Scoring (BookCompass v2)
 *
 * Score = 0.20*L + 0.15*C + 0.15*G + 0.20*S + 0.10*T + 0.10*R + 0.10*P
 *
 * All scoring is deterministic code — NO LLM calls here.
 */

import { LEVEL_RUBRIC, getAdjacentLevels, type Level } from "./rubric";
import { clamp } from "@/lib/utils";
import type { Book } from "@/lib/schemas";

/** 7-Factor Scoring weights — single source of truth */
export const SCORING_WEIGHTS = {
  levelMatch: 0.20,
  complexityMatch: 0.15,
  genreMatch: 0.15,
  semanticSimilarity: 0.20,
  toneAndSubGenreMatch: 0.10,
  rating: 0.10,
  lengthFit: 0.10,
} as const;

/** Penalty multiplier for books in the user's "avoid" list */
export const AVOID_PENALTY = 0.1;

export interface ScoringInput {
  bookLevel: Level;
  bookGenres: string[];
  bookPageCount: number | null;
  bookAvgRating: number | null;
  bookTone: string[];
  bookComplexity?: number;
  semanticSimilarity: number;
  targetLevel: Level;
  targetGenres: string[];
  avoidList: string[];
  targetSubGenres?: string[];
  targetMood?: string[];
  targetComplexityRange?: [number, number] | null;
  targetLengthRange?: { min: number; max: number } | null;
  heatLevel?: string | null;
  isExcluded?: boolean;
  isDislikedAuthor?: boolean;
  isConfirmedBothSources?: boolean;
}

/**
 * Compute the level match score (L).
 * 1.0 = exact match, 0.5 = adjacent level, 0.1 = two levels apart
 */
export function scoreLevelMatch(bookLevel: Level, targetLevel: Level): number {
  if (bookLevel === targetLevel) return 1.0;
  if (getAdjacentLevels(targetLevel).includes(bookLevel)) return 0.5;
  return 0.1;
}

/**
 * Compute the complexity match score (C).
 * 1.0 = inside chosen range, 0.5 = one step outside, 0.1 = further.
 * No preference = 0.7
 */
export function scoreComplexityMatch(
  bookComplexity: number | undefined,
  targetRange?: [number, number] | null
): number {
  if (!targetRange) return 0.7;
  const complexity = bookComplexity || 3;
  const [min, max] = targetRange;
  if (complexity >= min && complexity <= max) return 1.0;
  if (complexity === min - 1 || complexity === max + 1) return 0.5;
  return 0.1;
}

/**
 * Compute the genre match score (G).
 * Returns the fraction of target genres that appear in the book's genres.
 * If no target genres provided, returns 1.0.
 */
export function scoreGenreMatch(
  bookGenres: string[],
  targetGenres: string[]
): number {
  if (targetGenres.length === 0) return 1.0;

  const normalizedBookGenres = bookGenres.map((g) => g.toLowerCase().trim());
  const matchCount = targetGenres.filter((tg) => {
    const cleanTg = tg.toLowerCase().trim();
    return normalizedBookGenres.some(
      (bg) => bg.includes(cleanTg) || cleanTg.includes(bg)
    );
  }).length;

  return matchCount / targetGenres.length;
}

/**
 * Compute the length fit score (P).
 * 1.0 inside chosen range, decaying linearly outside.
 * Unknown page count gives 0.5.
 */
export function scoreLengthFit(
  pageCount: number | null,
  targetLevelOrRange: Level | { min: number; max: number } | null
): number {
  if (pageCount === null) return 0.5;

  let min = 100;
  let max = 400;

  if (targetLevelOrRange && typeof targetLevelOrRange === "object") {
    min = targetLevelOrRange.min;
    max = targetLevelOrRange.max;
  } else if (typeof targetLevelOrRange === "string" && LEVEL_RUBRIC[targetLevelOrRange]) {
    min = LEVEL_RUBRIC[targetLevelOrRange].pageRange.min;
    max = LEVEL_RUBRIC[targetLevelOrRange].pageRange.max;
  } else {
    return 0.7;
  }

  if (pageCount >= min && pageCount <= max) return 1.0;

  if (pageCount > max) {
    return clamp(1.0 - (pageCount - max) * 0.0015, 0.05, 1);
  }

  return clamp(1.0 - (min - pageCount) * 0.005, 0.05, 1);
}

/**
 * Normalize a book's average rating to 0-1 scale (R).
 * Verified rating / 5. Missing rating scores neutral 0.5 or 0.6.
 */
export function scoreRating(avgRating: number | null): number {
  if (avgRating === null || avgRating === undefined) return 0.5;
  return clamp(avgRating / 5.0, 0, 1);
}

/**
 * Compute match for tone, sub-genres, and heat level (T).
 * A heat level mismatch counts as 0 for this factor.
 */
export function scoreToneAndSubGenreMatch(
  bookTone: string[],
  targetSubGenres: string[] = [],
  targetMood: string[] = [],
  heatLevel?: string | null
): number {
  const bookTonesLower = (bookTone || []).map((t) => t.toLowerCase().trim());

  // Heat level check: if user asked for steamy and book is not steamy -> 0
  if (heatLevel && (heatLevel === "steamy" || heatLevel === "spicy")) {
    const isSteamy = bookTonesLower.some((t) =>
      ["steamy", "spicy", "smut", "erotic"].includes(t)
    );
    if (!isSteamy) return 0.0;
  }

  const targets = [
    ...targetSubGenres.map((s) => s.toLowerCase().trim()),
    ...targetMood.map((m) => m.toLowerCase().trim()),
  ];

  if (targets.length === 0) {
    return 1.0; // full credit if no tone constraints
  }

  let matches = 0;
  for (const target of targets) {
    if (bookTonesLower.some((bt) => bt.includes(target) || target.includes(bt))) {
      matches++;
    }
  }

  if (matches > 0) {
    return clamp(0.5 + 0.5 * (matches / targets.length), 0, 1);
  }
  return 0.3;
}

export function matchesAvoidList(
  bookTitle: string,
  bookTone: string[],
  bookGenres: string[],
  avoidList: string[]
): boolean {
  if (avoidList.length === 0) return false;

  const searchable = [
    bookTitle.toLowerCase(),
    ...(bookTone || []).map((t) => t.toLowerCase()),
    ...(bookGenres || []).map((g) => g.toLowerCase()),
  ].join(" ");

  return avoidList.some((term) =>
    searchable.includes(term.toLowerCase().trim())
  );
}

export interface ScoreBreakdown {
  levelMatch: number;
  complexityMatch: number;
  genreMatch: number;
  semanticSimilarity: number;
  toneAndSubGenreMatch: number;
  rating: number;
  lengthFit: number;
  total: number;
}

/**
 * Compute the detailed score breakdown for a book using the 7-factor model.
 */
export function scoreBookDetailed(input: ScoringInput): ScoreBreakdown {
  const w = SCORING_WEIGHTS;

  const levelScore = scoreLevelMatch(input.bookLevel, input.targetLevel);
  const complexityScore = scoreComplexityMatch(input.bookComplexity, input.targetComplexityRange);
  const genreScore = scoreGenreMatch(input.bookGenres, input.targetGenres);
  const semanticScore = clamp(input.semanticSimilarity, 0, 1);
  const toneScore = scoreToneAndSubGenreMatch(
    input.bookTone,
    input.targetSubGenres,
    input.targetMood,
    input.heatLevel
  );
  const ratingScore = scoreRating(input.bookAvgRating);
  const lengthScore = scoreLengthFit(
    input.bookPageCount,
    input.targetLengthRange || input.targetLevel
  );

  let total =
    w.levelMatch * levelScore +
    w.complexityMatch * complexityScore +
    w.genreMatch * genreScore +
    w.semanticSimilarity * semanticScore +
    w.toneAndSubGenreMatch * toneScore +
    w.rating * ratingScore +
    w.lengthFit * lengthScore;

  // Post-score rules:
  if (matchesAvoidList("", input.bookTone, input.bookGenres, input.avoidList)) {
    total *= AVOID_PENALTY;
  }

  if (input.isDislikedAuthor) {
    total *= 0.5;
  }

  if (input.isConfirmedBothSources) {
    total = Math.min(1.0, total + 0.03);
  }

  if (input.isExcluded) {
    total = Math.max(0, total - 0.5);
  }

  return {
    levelMatch: levelScore,
    complexityMatch: complexityScore,
    genreMatch: genreScore,
    semanticSimilarity: semanticScore,
    toneAndSubGenreMatch: toneScore,
    rating: ratingScore,
    lengthFit: lengthScore,
    total: clamp(Number(total.toFixed(4)), 0, 1),
  };
}

/** Compute overall score for a book */
export function scoreBook(input: ScoringInput): number {
  return scoreBookDetailed(input).total;
}

/** Cosine similarity between two numerical vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Maximal Marginal Relevance (MMR) for diversifying recommendations.
 */
export function maximalMarginalRelevance(
  candidates: Book[],
  targetCount: number = 3,
  lambda: number = 0.7
): Book[] {
  if (candidates.length <= targetCount) return candidates;

  const selected: Book[] = [];
  const remaining = [...candidates];

  // First pick: best scoring candidate
  remaining.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  selected.push(remaining.shift()!);

  while (selected.length < targetCount && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const relevance = cand.score ?? 0;

      // Max similarity to already selected books
      let maxSim = 0;
      for (const sel of selected) {
        let sim = 0;
        if (cand.embedding && sel.embedding) {
          sim = Math.max(0, cosineSimilarity(cand.embedding, sel.embedding));
        } else {
          // Heuristic similarity: genre overlap + author match
          const genreOverlap = cand.genres.filter((g) => sel.genres.includes(g)).length;
          const authorMatch = cand.author.toLowerCase() === sel.author.toLowerCase() ? 0.8 : 0;
          sim = Math.max(authorMatch, genreOverlap / Math.max(cand.genres.length, 1));
        }
        if (sim > maxSim) maxSim = sim;
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}
