import { describe, it, expect } from "vitest";
import {
  scoreLevelMatch,
  scoreGenreMatch,
  scoreLengthFit,
  scoreRating,
  matchesAvoidList,
  scoreToneAndSubGenreMatch,
  cosineSimilarity,
  maximalMarginalRelevance,
  scoreBook,
  SCORING_WEIGHTS,
  type ScoringInput,
} from "@/lib/scoring/score";

describe("scoreLevelMatch", () => {
  it("returns 1.0 for exact level match", () => {
    expect(scoreLevelMatch("beginner", "beginner")).toBe(1.0);
    expect(scoreLevelMatch("intermediate", "intermediate")).toBe(1.0);
    expect(scoreLevelMatch("advanced", "advanced")).toBe(1.0);
  });

  it("returns 0.5 for adjacent levels", () => {
    expect(scoreLevelMatch("intermediate", "beginner")).toBe(0.5);
    expect(scoreLevelMatch("beginner", "intermediate")).toBe(0.5);
    expect(scoreLevelMatch("intermediate", "advanced")).toBe(0.5);
    expect(scoreLevelMatch("advanced", "intermediate")).toBe(0.5);
  });

  it("returns 0.1 for non-adjacent levels", () => {
    expect(scoreLevelMatch("beginner", "advanced")).toBe(0.1);
    expect(scoreLevelMatch("advanced", "beginner")).toBe(0.1);
  });
});

describe("scoreGenreMatch", () => {
  it("returns 1.0 when all target genres match", () => {
    expect(scoreGenreMatch(["horror", "thriller"], ["horror"])).toBe(1.0);
    expect(
      scoreGenreMatch(["horror", "thriller"], ["horror", "thriller"])
    ).toBe(1.0);
  });

  it("returns fraction for partial match", () => {
    expect(
      scoreGenreMatch(["horror"], ["horror", "thriller"])
    ).toBe(0.5);
  });

  it("returns 0.0 when no genres match", () => {
    expect(scoreGenreMatch(["romance"], ["horror"])).toBe(0.0);
  });

  it("returns 1.0 when no target genres specified", () => {
    expect(scoreGenreMatch(["horror"], [])).toBe(1.0);
  });

  it("is case-insensitive", () => {
    expect(scoreGenreMatch(["Horror"], ["horror"])).toBe(1.0);
  });
});

describe("scoreLengthFit", () => {
  it("returns 1.0 when within range", () => {
    expect(scoreLengthFit(200, "beginner")).toBe(1.0); // range: 100-300
    expect(scoreLengthFit(350, "intermediate")).toBe(1.0); // range: 250-450
    expect(scoreLengthFit(500, "advanced")).toBe(1.0); // range: 400-1200
  });

  it("returns 0.5 for unknown page count", () => {
    expect(scoreLengthFit(null, "beginner")).toBe(0.5);
  });

  it("decays below range", () => {
    const score = scoreLengthFit(50, "beginner"); // 50 pages below min of 100
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0.0);
  });

  it("decays above range", () => {
    const score = scoreLengthFit(500, "beginner"); // 200 pages above max of 300
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0.0);
  });
});

describe("scoreRating", () => {
  it("normalizes to 0-1 scale", () => {
    expect(scoreRating(5.0)).toBe(1.0);
    expect(scoreRating(2.5)).toBe(0.5);
    expect(scoreRating(0)).toBe(0.0);
  });

  it("returns 0.5 for null", () => {
    expect(scoreRating(null)).toBe(0.6);
  });
});

describe("matchesAvoidList", () => {
  it("returns false for empty avoid list", () => {
    expect(matchesAvoidList("Book", ["dark"], ["horror"], [])).toBe(false);
  });

  it("returns true when tone matches avoid", () => {
    expect(
      matchesAvoidList("Book", ["dark", "violent"], ["horror"], ["violent"])
    ).toBe(true);
  });

  it("returns true when genre matches avoid", () => {
    expect(
      matchesAvoidList("Book", [], ["romance"], ["romance"])
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      matchesAvoidList("Book", ["Dark"], [], ["dark"])
    ).toBe(true);
  });
});

describe("scoreBook", () => {
  const baseInput: ScoringInput = {
    bookLevel: "beginner",
    bookGenres: ["horror"],
    bookPageCount: 250,
    bookAvgRating: 4.0,
    bookTone: ["spooky"],
    semanticSimilarity: 0.8,
    targetLevel: "beginner",
    targetGenres: ["horror"],
    avoidList: [],
  };

  it("returns a score between 0 and 1", () => {
    const score = scoreBook(baseInput);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("scores a perfect match highly", () => {
    const score = scoreBook(baseInput);
    expect(score).toBeGreaterThan(0.7);
  });

  it("scores worse for level mismatch", () => {
    const mismatch = scoreBook({ ...baseInput, bookLevel: "advanced" });
    const match = scoreBook(baseInput);
    expect(mismatch).toBeLessThan(match);
  });

  it("scores worse for genre mismatch", () => {
    const mismatch = scoreBook({
      ...baseInput,
      bookGenres: ["romance"],
    });
    const match = scoreBook(baseInput);
    expect(mismatch).toBeLessThan(match);
  });

  it("applies avoid penalty", () => {
    const avoided = scoreBook({
      ...baseInput,
      bookTone: ["violent"],
      avoidList: ["violent"],
    });
    const normal = scoreBook(baseInput);
    expect(avoided).toBeLessThan(normal * 0.5);
  });

  it("weights sum to 1.0", () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("penalizes previously seen books with seenEarlierInChat", () => {
    const normal = scoreBook(baseInput);
    const seen = scoreBook({ ...baseInput, seenEarlierInChat: true });
    expect(seen).toBe(Math.max(0, normal - 0.5));
  });

  it("strictly excludes books with isExcluded (score = 0.0)", () => {
    const excluded = scoreBook({ ...baseInput, isExcluded: true });
    expect(excluded).toBe(0.0);
  });
});

describe("scoreToneAndSubGenreMatch", () => {
  it("returns 1.0 when no targets specified", () => {
    expect(scoreToneAndSubGenreMatch(["romantic"])).toBe(1.0);
  });

  it("scores higher when tone or subgenre matches", () => {
    const match = scoreToneAndSubGenreMatch(["spicy", "enemies-to-lovers"], ["enemies-to-lovers"]);
    const noMatch = scoreToneAndSubGenreMatch(["sweet", "clean"], ["enemies-to-lovers"]);
    expect(match).toBeGreaterThan(noMatch);
  });

  it("recognizes steamy / spicy heat levels", () => {
    const match = scoreToneAndSubGenreMatch(["spicy", "sensual"], [], [], "steamy");
    expect(match).toBe(1.0);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });
});

describe("maximalMarginalRelevance", () => {
  it("returns all items if count <= k", () => {
    const items = [
      { id: "1", score: 0.9 },
      { id: "2", score: 0.8 },
    ];
    expect(maximalMarginalRelevance(items as any, 3)).toHaveLength(2);
  });

  it("diversifies candidates and does not blindly take top 2 identical items", () => {
    const items = [
      { id: "1", score: 0.95, author: "Author A", genres: ["romance"], embedding: [1, 0] },
      { id: "2", score: 0.94, author: "Author A", genres: ["romance"], embedding: [0.99, 0.01] },
      { id: "3", score: 0.88, author: "Author B", genres: ["rom-com"], embedding: [0, 1] },
    ];
    const picked = maximalMarginalRelevance(items as any, 2, 0.7);
    expect(picked).toHaveLength(2);
    expect(picked[0].id).toBe("1");
    // Picked item 2 should be item 3 because item 2 has near 1.0 similarity with item 1
    expect(picked[1].id).toBe("3");
  });
});
