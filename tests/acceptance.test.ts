import { describe, it, expect } from "vitest";
import {
  ReaderProfileSchema,
  RecommendRequestSchema,
  PastReadSchema,
  type ReaderProfile,
  type Book,
} from "@/lib/schemas";
import { resolveGenre } from "@/lib/profile/genreResolver";
import {
  scoreBookDetailed,
  scoreLevelMatch,
  scoreRating,
  scoreLengthFit,
  scoreComplexityMatch,
  maximalMarginalRelevance,
  type ScoringInput,
} from "@/lib/scoring/score";
import { normalizeTitleAuthorKey } from "@/lib/retrieval/external";
import { buildMatchFacts } from "@/lib/scoring/matchFacts";
import { cleanText } from "@/lib/text/cleanText";
import { LEVEL_RUBRIC, classifyLevel } from "@/lib/scoring/rubric";

describe("BookCompass v2 Acceptance Tests (Section 9)", () => {
  describe("1. Intake & Profile Validation (Criteria 1-5)", () => {
    it("validates that a valid profile requires level and adheres to constraints", () => {
      const validProfile = {
        genres: ["romance"],
        level: "beginner",
        length: "short",
        plot: "simple",
        moods: ["light-hearted"],
        heatLevel: "mild",
        pastReads: [],
      };
      const result = ReaderProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
    });

    it("restricts genres to maximum of 2 choices", () => {
      const invalidProfile = {
        genres: ["romance", "fantasy", "sci-fi"],
        level: "beginner",
      };
      const result = ReaderProfileSchema.safeParse(invalidProfile);
      expect(result.success).toBe(false);
    });

    it("validates verified past reads and rejects arbitrary malformed objects", () => {
      const validRead = {
        bookId: "b1",
        title: "The Notebook",
        author: "Nicholas Sparks",
        opinion: "loved",
      };
      expect(PastReadSchema.safeParse(validRead).success).toBe(true);

      const invalidRead = {
        title: "",
        author: "Unknown",
      };
      expect(PastReadSchema.safeParse(invalidRead).success).toBe(false);
    });

    it("validates RecommendRequestSchema requires profile or non-empty message/genre", () => {
      expect(
        RecommendRequestSchema.safeParse({
          message: "",
          genre: "",
        }).success
      ).toBe(false);

      expect(
        RecommendRequestSchema.safeParse({
          message: "something funny",
        }).success
      ).toBe(true);

      expect(
        RecommendRequestSchema.safeParse({
          profile: {
            genres: ["thriller"],
            level: "intermediate",
            length: "medium",
            plot: "twisty",
            moods: ["suspenseful"],
            heatLevel: "any",
            pastReads: [],
          },
        }).success
      ).toBe(true);
    });
  });

  describe("2. Context, Overrides & Genre Inference (Criteria 6-9)", () => {
    it("uses chosen form genre with 1.0 confidence when selected", () => {
      const profile: ReaderProfile = {
        genres: ["thriller"],
        level: "intermediate",
        length: "medium",
        plot: "twisty",
        moods: ["suspenseful"],
        heatLevel: "any",
        pastReads: [],
      };
      const res = resolveGenre(profile, { explicitOverride: null } as any, "recommend me a good book");
      expect(res.genreSource).toBe("form");
      expect(res.genres).toContain("thriller");
      expect(res.genreConfidence).toBe(1.0);
    });

    it("detects explicit prompt contradiction and emits override notice (Criterion 9)", () => {
      const profile: ReaderProfile = {
        genres: ["romance"],
        level: "beginner",
        length: "short",
        plot: "simple",
        moods: ["light-hearted"],
        heatLevel: "clean",
        pastReads: [],
      };
      const res = resolveGenre(
        profile,
        {
          explicitOverride: {
            field: "genre",
            from: "romance",
            to: "horror",
            cue: "actually I want horror",
          },
        } as any,
        "actually I want horror"
      );
      expect(res.genreSource).toBe("message");
      expect(res.genres).toContain("horror");
      expect(res.override).toBeDefined();
      expect(res.override?.from).toBe("romance");
      expect(res.override?.to).toBe("horror");
    });

    it("infers genre transparently with reasons when user is unsure (Criterion 8)", () => {
      const profile: ReaderProfile = {
        genres: [],
        level: "beginner",
        length: "short",
        plot: "twisty",
        moods: ["suspenseful", "dark"],
        heatLevel: "any",
        pastReads: [
          {
            title: "Gone Girl",
            author: "Gillian Flynn",
            opinion: "loved",
          },
        ],
      };
      const res = resolveGenre(
        profile,
        {
          explicitOverride: null,
          genreGuess: { genre: "thriller", confidence: 0.8 },
        } as any,
        "give me something with a wild twist"
      );
      expect(res.genreSource).toBe("inferred");
      expect(res.genreConfidence).toBeGreaterThanOrEqual(0.4);
      expect(res.inferenceReasons.length).toBeGreaterThan(0);
    });
  });

  describe("3. Deterministic 7-Factor Scoring & Retrieval (Criteria 6, 7, 10-13)", () => {
    it("returns completely different scores for Beginner/Short vs Advanced/Epic (Criterion 6)", () => {
      const beginnerBook: ScoringInput = {
        bookLevel: "beginner",
        bookGenres: ["romance"],
        bookPageCount: 180,
        bookAvgRating: 4.2,
        bookTone: ["light-hearted", "funny"],
        bookComplexity: 1,
        semanticSimilarity: 0.7,
        targetLevel: "beginner",
        targetGenres: ["romance"],
        avoidList: [],
        targetComplexityRange: [1, 2],
        targetLengthRange: { min: 0, max: 200 },
        heatLevel: "clean",
        isExcluded: false,
      };

      const advancedProfileInput: ScoringInput = {
        ...beginnerBook,
        targetLevel: "advanced",
        targetComplexityRange: [4, 5],
        targetLengthRange: { min: 500, max: 1500 },
      };

      const scoreForBeginner = scoreBookDetailed(beginnerBook).total;
      const scoreForAdvanced = scoreBookDetailed(advancedProfileInput).total;

      expect(scoreForBeginner).toBeGreaterThan(0.85);
      expect(scoreForAdvanced).toBeLessThan(0.60);
      expect(Math.abs(scoreForBeginner - scoreForAdvanced)).toBeGreaterThan(0.25);
    });

    it("strictly excludes past-read books by giving score 0.0 (Criterion 7)", () => {
      const input: ScoringInput = {
        bookLevel: "beginner",
        bookGenres: ["romance"],
        bookPageCount: 200,
        bookAvgRating: 4.5,
        bookTone: ["romantic"],
        semanticSimilarity: 0.9,
        targetLevel: "beginner",
        targetGenres: ["romance"],
        avoidList: [],
        isExcluded: true,
      };
      const breakdown = scoreBookDetailed(input);
      expect(breakdown.total).toBe(0.0);
    });

    it("awards +0.03 confirmation bonus for dual-source confirmation (Criterion 10)", () => {
      const baseInput: ScoringInput = {
        bookLevel: "intermediate",
        bookGenres: ["sci-fi"],
        bookPageCount: 320,
        bookAvgRating: 4.0,
        bookTone: ["thought-provoking"],
        bookComplexity: 3,
        semanticSimilarity: 0.6,
        targetLevel: "intermediate",
        targetGenres: ["sci-fi"],
        avoidList: [],
        isConfirmedBothSources: false,
      };
      const scoreSingle = scoreBookDetailed(baseInput).total;
      const scoreDual = scoreBookDetailed({ ...baseInput, isConfirmedBothSources: true }).total;

      expect(Number((scoreDual - scoreSingle).toFixed(2))).toBe(0.03);
    });

    it("assigns neutral 0.6 score to unrated books instead of penalizing with 0 (Criterion 13)", () => {
      expect(scoreRating(null)).toBe(0.6);
      expect(scoreRating(undefined)).toBe(0.6);
      expect(scoreRating(5.0)).toBe(1.0);
      expect(scoreRating(3.0)).toBe(0.6);
    });

    it("normalizes title and author keys identically to prevent duplicates (Criterion 12)", () => {
      const k1 = normalizeTitleAuthorKey("The Notebook", "Nicholas Sparks");
      const k2 = normalizeTitleAuthorKey(" the notebook: a novel ", "Nicholas Sparks, author");
      expect(k1).toBe(k2);
      expect(k1).toBe("thenotebook|nicholassparks");
    });

    it("diversifies candidates with MMR instead of clustering identical books", () => {
      const candidates: Partial<Book>[] = [
        { id: "1", score: 0.95, author: "Author A", genres: ["romance"], embedding: [1, 0] },
        { id: "2", score: 0.94, author: "Author A", genres: ["romance"], embedding: [0.99, 0.01] },
        { id: "3", score: 0.89, author: "Author B", genres: ["romance", "comedy"], embedding: [0, 1] },
      ];
      const selected = maximalMarginalRelevance(candidates as Book[], 2, 0.7);
      expect(selected).toHaveLength(2);
      expect(selected[0].id).toBe("1");
      expect(selected[1].id).toBe("3");
    });
  });

  describe("4. Rubric Classification & Match Facts (Sections 3.5 & 3.6)", () => {
    it("classifies levels deterministically according to single rubric source of truth", () => {
      expect(classifyLevel(1, 200)).toBe("beginner");
      expect(classifyLevel(2, 320)).toBe("beginner");
      expect(classifyLevel(3, 300)).toBe("intermediate");
      expect(classifyLevel(4, 300)).toBe("advanced");
      expect(classifyLevel(2, 550)).toBe("advanced");
    });

    it("builds factual matchFacts strings based strictly on code verification", () => {
      const book: Book = {
        id: "b-test",
        title: "Test Novel",
        author: "Jane Doe",
        genres: ["romance"],
        level: "beginner",
        complexity: 1,
        pacing: "fast",
        tone: ["light-hearted", "humorous"],
        pageCount: 195,
        description: "A funny romance.",
        coverUrl: null,
        avgRating: 4.3,
        whyStartHere: null,
        sources: ["google", "openlibrary"],
      };

      const context = {
        genres: ["romance" as const],
        genreSource: "form" as const,
        genreConfidence: 1.0,
        level: "beginner" as const,
        length: { min: 0, max: 200 },
        complexityRange: [1, 2] as [number, number],
        moods: ["light-hearted"],
        subGenres: [],
        heatLevel: "clean" as const,
        avoid: [],
        similarTo: [],
        dislikedAuthors: [],
        excludeBookIds: [],
        targetBookQuery: null,
        overrides: [],
        inferenceReasons: [],
      };

      const facts = buildMatchFacts(book, context);
      expect(facts.some((f) => f.includes("195 pages"))).toBe(true);
      expect(facts.some((f) => f.includes("Plot complexity 1 of 5"))).toBe(true);
      expect(facts.some((f) => f.includes("light-hearted") || f.includes("humorous"))).toBe(true);
      expect(facts.some((f) => f.includes("Google Books and Open Library"))).toBe(true);
    });
  });

  describe("5. Text Sanitization (Criterion 21)", () => {
    it("strips raw markdown symbols (**bold**, ### heading, * bullet, backticks)", () => {
      const raw = `### Recommendation:
* **The Notebook** by Nicholas Sparks.
A \`great\` choice with *emotional* depth.`;

      const cleaned = cleanText(raw);
      expect(cleaned).not.toContain("###");
      expect(cleaned).not.toContain("**");
      expect(cleaned).not.toContain("* ");
      expect(cleaned).not.toContain("`");
      expect(cleaned).toContain("The Notebook by Nicholas Sparks");
    });
  });
});
