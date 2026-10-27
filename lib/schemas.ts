import { z } from "zod";

/** Supported genres */
export const GENRES = [
  "romance",
  "thriller",
  "mystery",
  "horror",
  "fantasy",
  "sci-fi",
  "action-adventure",
  "action/adventure",
  "classics",
  "non-fiction",
  "self-help",
  "motivational/self-help",
] as const;

export type Genre = (typeof GENRES)[number];

/** Reader levels */
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const HEAT_LEVELS = ["clean", "mild", "steamy", "any"] as const;
export type HeatLevel = (typeof HEAT_LEVELS)[number];

export const MOODS = [
  "light-hearted",
  "emotional",
  "dark",
  "suspenseful",
  "inspiring",
  "thought-provoking",
  "funny",
] as const;
export type Mood = (typeof MOODS)[number];

export type LevelSource = "message" | "ui" | "default";

/** Schema for parsed user preferences (LLM output) */
export const PreferencesSchema = z.object({
  genres: z.array(z.enum(GENRES)).min(1),
  subGenres: z.array(z.string()).default([]),
  level: z.enum(LEVELS).default("beginner"),
  heatLevel: z.enum(["clean", "mild", "steamy"]).nullable().optional(),
  maxPages: z.number().int().min(1).nullable().optional(),
  mood: z.array(z.string()).default([]),
  similarTo: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  targetBookQuery: z
    .string()
    .optional()
    .describe("If the user is asking about a specific book or title (e.g. 'The Notebook'), extract the book title here"),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

/** Past read item */
export const PastReadSchema = z.object({
  bookId: z.string().optional(),
  googleBooksId: z.string().optional(),
  title: z.string().min(1).max(200),
  author: z.string().min(1).max(200),
  opinion: z.enum(["loved", "okay", "disliked"]).default("loved"),
});

export type PastRead = z.infer<typeof PastReadSchema>;

/** Reader profile collected via the questionnaire (Workstream A) */
export const ReaderProfileSchema = z.object({
  genres: z.array(z.enum(GENRES)).max(2).default([]),
  level: z.enum(LEVELS),
  length: z.enum(["short", "medium", "long", "epic", "any"]).default("any"),
  plot: z.enum(["simple", "twisty", "layered", "any"]).default("any"),
  moods: z.array(z.enum(MOODS)).max(3).default([]),
  heatLevel: z.enum(["clean", "mild", "steamy", "any"]).default("any"),
  pastReads: z.array(PastReadSchema).max(5).default([]),
});

export type ReaderProfile = z.infer<typeof ReaderProfileSchema>;

/** Schema for the recommendation request body */
export const RecommendRequestSchema = z
  .object({
    profile: ReaderProfileSchema.optional(),
    message: z.string().max(4000).default(""),
    genre: z
      .enum(GENRES)
      .optional()
      .nullable()
      .or(z.literal(""))
      .or(z.literal("any"))
      .transform((val) =>
        val && typeof val === "string" && val.trim() && val.trim().toLowerCase() !== "any"
          ? (val as Genre)
          : undefined
      ),
    level: z
      .enum(LEVELS)
      .optional()
      .nullable()
      .or(z.literal(""))
      .or(z.literal("any"))
      .transform((val) =>
        val && typeof val === "string" && val.trim() && val.trim().toLowerCase() !== "any"
          ? (val as Level)
          : undefined
      ),
    email: z
      .string()
      .trim()
      .email("Please provide a valid email address.")
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((val) =>
        val && typeof val === "string" && val.trim() ? val.trim().toLowerCase() : undefined
      ),
    chatId: z
      .string()
      .uuid("Invalid chat identifier format.")
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((val) =>
        val && typeof val === "string" && val.trim() ? val.trim() : undefined
      ),
    excludeBookIds: z.array(z.string()).optional().default([]),
  })
  .refine(
    (v) =>
      (v.profile && (v.profile.genres.length > 0 || v.profile.moods.length > 0)) ||
      v.message.trim().length > 0 ||
      Boolean(v.genre),
    { message: "Pick a genre, pick a mood, or describe what you want." }
  );

export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

/** A verified book with score, ready for the UI */
export const BookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  genres: z.array(z.string()),
  level: z.enum(LEVELS),
  complexity: z.number().min(1).max(5),
  pacing: z.enum(["slow", "medium", "fast"]),
  tone: z.array(z.string()),
  pageCount: z.number().nullable(),
  description: z.string().nullable(),
  coverUrl: z.string().url().nullable(),
  avgRating: z.number().nullable(),
  whyStartHere: z.string().nullable(),
  score: z.number().optional(),
  amazonSearchUrl: z.string().url().optional(),
  embedding: z.array(z.number()).nullable().optional(),
  whyItFits: z.string().optional(),
  whyThisLevel: z.string().optional(),
  watchOut: z.string().nullable().optional(),
  sources: z.array(z.string()).optional(),
  matchFacts: z.array(z.string()).optional(),
});

export type Book = z.infer<typeof BookSchema>;

/** Reading ladder step */
export const LadderStepSchema = z.object({
  step: z.number().min(1).max(3),
  book: BookSchema,
  note: z.string().nullable(),
});

export type LadderStep = z.infer<typeof LadderStepSchema>;

/** Structured explanation for a specific book */
export const BookExplanationSchema = z.object({
  bookId: z.string(),
  whyItFits: z.string(),
  whyThisLevel: z.string(),
  watchOut: z.string().nullable().optional(),
});

export type BookExplanation = z.infer<typeof BookExplanationSchema>;

/** Structured full explanation response */
export const ExplanationResponseSchema = z.object({
  notice: z.string().nullable().optional(),
  summary: z.string(),
  books: z.array(BookExplanationSchema),
  ladderNote: z.string().nullable().optional(),
});

export type ExplanationResponse = z.infer<typeof ExplanationResponseSchema>;

/** API response event types for SSE streaming */
export type StreamEvent =
  | { type: "books"; data: Book[] }
  | { type: "ladder"; data: LadderStep[] }
  | { type: "notice"; data: string }
  | { type: "explanation"; data: ExplanationResponse }
  | { type: "text"; data: string }
  | { type: "chatId"; data: string }
  | { type: "debug"; data: unknown }
  | { type: "error"; data: string }
  | { type: "done"; data?: null };
