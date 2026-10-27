import "server-only";

import { supabase, type BookRow } from "@/lib/db/supabase";
import { getEmbeddingsModel, getChatModel } from "@/lib/llm";
import { searchGoogleBooks } from "@/lib/retrieval/googleBooks";
import { fetchDualSourceCandidates } from "@/lib/retrieval/external";
import type { Preferences, Book, Level } from "@/lib/schemas";
import { amazonSearchUrl } from "@/lib/utils";
import { z } from "zod";

export interface RetrievalStats {
  sqlCount: number;
  vectorCount: number;
  googleBooksCount: number;
  total: number;
  errors: string[];
}

const BatchTaggingSchema = z.object({
  tags: z.array(
    z.object({
      index: z.number(),
      level: z.enum(["beginner", "intermediate", "advanced"]),
      complexity: z.number().int().min(1).max(5),
      pacing: z.enum(["slow", "medium", "fast"]),
      tone: z.array(z.string()),
      heatLevel: z.enum(["clean", "mild", "steamy", "unknown"]).default("unknown"),
    })
  ),
});

/**
 * Search the curated book catalog using SQL filters + vector similarity,
 * augmented with live Google Books API results when candidates < 8.
 * Returns books sorted by relevance.
 */
export async function searchCatalog(
  preferences: Preferences,
  limit: number = 15,
  rawUserMessage?: string,
  statsCollector?: RetrievalStats
): Promise<Book[]> {
  const results: Book[] = [];
  const seenIds = new Set<string>();
  const seenTitleAuthors = new Set<string>();

  const trackBook = (b: Book): boolean => {
    const norm = `${b.title.toLowerCase().trim()}|${b.author.toLowerCase().trim()}`;
    if (seenIds.has(b.id) || seenTitleAuthors.has(norm)) {
      return false;
    }
    seenIds.add(b.id);
    seenTitleAuthors.add(norm);
    results.push(b);
    return true;
  };

  // Step 0: If user asked about a specific book title, look for exact or ilike title match first
  if (preferences.targetBookQuery) {
    try {
      const { data: titleMatches, error: titleErr } = await supabase
        .from("books")
        .select("*")
        .ilike("title", `%${preferences.targetBookQuery.trim()}%`)
        .limit(3);

      if (titleErr && statsCollector) {
        statsCollector.errors.push(`[STAGE 4: Title match error]: ${titleErr.message}`);
      }

      if (titleMatches && titleMatches.length > 0) {
        for (const row of titleMatches) {
          trackBook(rowToBook(row));
        }
      }
    } catch (err: unknown) {
      if (statsCollector) statsCollector.errors.push(`[STAGE 4: Title search exception]: ${String(err)}`);
    }
  }

  // Step 1: SQL filter - FILTER BY GENRE ONLY (soft filtering: level is handled in scoring)
  let sqlBooks: Book[] = [];
  try {
    sqlBooks = await sqlFilterBooks(preferences, 25);
  } catch (err: unknown) {
    if (statsCollector) statsCollector.errors.push(`[STAGE 4: SQL filter exception]: ${String(err)}`);
  }
  if (statsCollector) statsCollector.sqlCount = sqlBooks.length;

  for (const b of sqlBooks) {
    trackBook(b);
  }

  // Step 2: Vector similarity search if we have mood/similarTo cues
  if (preferences.mood.length > 0 || preferences.similarTo.length > 0 || preferences.targetBookQuery) {
    let vectorBooks: Book[] = [];
    try {
      vectorBooks = await vectorSearchBooks(preferences, 15);
    } catch (err: unknown) {
      if (statsCollector) statsCollector.errors.push(`[STAGE 4: Vector search exception]: ${String(err)}`);
    }
    if (statsCollector) statsCollector.vectorCount = vectorBooks.length;

    for (const book of vectorBooks) {
      trackBook(book);
    }
  }

  // Step 3: Google Books fallback
  // Triggered when candidates after genre filtering are fewer than 8, or user has specific keywords/mood
  let gbCount = 0;
  const isSpecificNiche =
    preferences.mood.length > 0 ||
    preferences.similarTo.length > 0 ||
    (rawUserMessage && (rawUserMessage.toLowerCase().includes("spicy") || rawUserMessage.toLowerCase().includes("rom-com")));

  if (results.length < 8 || isSpecificNiche) {
    try {
      const primaryGenre = preferences.genres[0] || "fiction";
      const searchTerms: string[] = [`subject:${primaryGenre}`];

      if (preferences.mood.length > 0) {
        searchTerms.push(preferences.mood.slice(0, 2).join(" "));
      }
      if (rawUserMessage && rawUserMessage.toLowerCase().includes("spicy")) {
        searchTerms.push("spicy");
      }
      if (rawUserMessage && rawUserMessage.toLowerCase().includes("rom-com")) {
        searchTerms.push("romantic comedy");
      }

      const queryString = searchTerms.join(" ").trim();
      const apiCandidates = await searchGoogleBooks(queryString, 20);
      gbCount = apiCandidates.length;

      // Filter out books already in results
      const newCandidates = apiCandidates.filter((cand) => {
        if (!cand.title || !cand.author || !cand.description || !cand.pageCount) return false;
        const norm = `${cand.title.toLowerCase().trim()}|${cand.author.toLowerCase().trim()}`;
        return !seenTitleAuthors.has(norm);
      });

      if (newCandidates.length > 0) {
        // Tag new candidates in a single batched structured output call
        const taggedBatch = await batchTagCandidates(newCandidates.slice(0, 8), primaryGenre);

        for (let i = 0; i < taggedBatch.length; i++) {
          const raw = newCandidates[i];
          const tag = taggedBatch[i];

          const book: Book = {
            id: raw.id || crypto.randomUUID(),
            title: raw.title!,
            author: raw.author!,
            genres: [primaryGenre],
            level: tag.level,
            complexity: tag.complexity,
            pacing: tag.pacing,
            tone: tag.tone.length > 0 ? tag.tone : ["engaging"],
            pageCount: raw.pageCount ?? null,
            description: raw.description ?? null,
            coverUrl: raw.coverUrl ?? null,
            avgRating: raw.avgRating ?? 4.0,
            whyStartHere: `Curated recommendation matching "${queryString}".`,
            amazonSearchUrl: raw.amazonSearchUrl,
          };

          if (trackBook(book)) {
            // Asynchronously cache in Supabase books table with embeddings
            void cacheBookInDatabase(book);
          }
        }
      }
    } catch (apiErr: unknown) {
      console.error("[STAGE 4: Fallback retrieval error]:", apiErr);
      if (statsCollector) statsCollector.errors.push(`[STAGE 4: Fallback retrieval error]: ${String(apiErr)}`);
    }
  }

  if (statsCollector) {
    statsCollector.googleBooksCount = gbCount;
    statsCollector.total = results.length;
  }

  return results;
}

/**
 * Batch tag new external books with level, complexity, pacing, tone, and heatLevel
 * using Gemini structured output.
 */
async function batchTagCandidates(
  candidates: Partial<Book>[],
  genre: string
): Promise<Array<{
  level: Level;
  complexity: number;
  pacing: "slow" | "medium" | "fast";
  tone: string[];
  heatLevel: "clean" | "mild" | "steamy" | "unknown";
}>> {
  try {
    const model = getChatModel({ maxOutputTokens: 2048, temperature: 0.1 });
    const structuredModel = model.withStructuredOutput(BatchTaggingSchema);

    const summaries = candidates.map((c, idx) => ({
      index: idx,
      title: c.title,
      author: c.author,
      pageCount: c.pageCount,
      description: c.description?.slice(0, 300),
    }));

    const response = await structuredModel.invoke([
      {
        role: "system",
        content: `You are a literary metadata tagger. Tag each book based STRICTLY on its page count and description.
Rules:
1. level: "beginner" (<=300 pages, accessible premise), "intermediate" (300-500 pages), "advanced" (>500 pages or dense literary prose).
2. complexity: 1 to 5 integer.
3. pacing: "fast", "medium", or "slow".
4. tone: array of 1-3 adjectives (e.g. ["humorous", "romantic"]).
5. heatLevel: for romance/erotica only. "clean", "mild", "steamy", or "unknown" if facts are insufficient.
Do NOT guess or invent plot facts not present in the description.`,
      },
      {
        role: "user",
        content: `Genre: ${genre}\nBooks to tag: ${JSON.stringify(summaries)}`,
      },
    ]);

    const tagsMap = new Map<number, (typeof response.tags)[0]>();
    for (const t of response.tags) {
      tagsMap.set(t.index, t);
    }

    return candidates.map((c, idx) => {
      const t = tagsMap.get(idx);
      if (t) {
        return {
          level: t.level,
          complexity: t.complexity,
          pacing: t.pacing,
          tone: t.tone,
          heatLevel: t.heatLevel ?? "unknown",
        };
      }
      const pages = c.pageCount ?? 300;
      return {
        level: pages <= 300 ? "beginner" : pages <= 500 ? "intermediate" : "advanced",
        complexity: pages <= 300 ? 2 : 3,
        pacing: "medium",
        tone: ["engaging"],
        heatLevel: "unknown",
      };
    });
  } catch (err: unknown) {
    console.error("[STAGE 4: Batch tagging fallback used]:", err);
    return candidates.map((c) => {
      const pages = c.pageCount ?? 300;
      return {
        level: pages <= 300 ? "beginner" : pages <= 500 ? "intermediate" : "advanced",
        complexity: pages <= 300 ? 2 : 3,
        pacing: "medium",
        tone: ["engaging"],
        heatLevel: "unknown",
      };
    });
  }
}

/**
 * Cache an enriched external book into Supabase books table with embeddings.
 */
async function cacheBookInDatabase(book: Book) {
  try {
    const embeddings = getEmbeddingsModel();
    const textToEmbed = `${book.title} by ${book.author}. ${book.description || ""} Genres: ${book.genres.join(", ")}. Tone: ${book.tone.join(", ")}.`;
    const embedding = await embeddings.embedQuery(textToEmbed);

    await supabase.from("books").upsert(
      {
        title: book.title,
        author: book.author,
        genres: book.genres,
        level: book.level,
        complexity: book.complexity,
        pacing: book.pacing,
        tone: book.tone,
        page_count: book.pageCount,
        description: book.description,
        cover_url: book.coverUrl,
        avg_rating: book.avgRating,
        google_books_id: book.id,
        why_start_here: book.whyStartHere,
        embedding,
      },
      { onConflict: "title,author", ignoreDuplicates: true }
    );
  } catch (err: unknown) {
    // Non-fatal caching error: log and continue
    console.warn(`[STAGE 4: Caching book "${book.title}" in DB]:`, err);
  }
}

/**
 * SQL filter: find books matching genre ONLY.
 * Never hard-filter by reading level — level is handled as a score component in Task 1!
 */
async function sqlFilterBooks(
  preferences: Preferences,
  limit: number
): Promise<Book[]> {
  let query = supabase.from("books").select("*").limit(limit);

  // Filter by genre only (soft filtering)
  if (preferences.genres.length > 0) {
    query = query.overlaps("genres", preferences.genres);
  }

  // Filter by max pages if specified
  if (preferences.maxPages) {
    query = query.lte("page_count", preferences.maxPages);
  }

  const { data, error } = await query;

  if (error) {
    console.error("SQL filter error:", error);
    return [];
  }

  return (data ?? []).map(rowToBook);
}

/**
 * Vector similarity search using the match_books function.
 */
async function vectorSearchBooks(
  preferences: Preferences,
  limit: number
): Promise<Book[]> {
  try {
    const embeddings = getEmbeddingsModel();
    const queryText = [
      preferences.genres.join(" "),
      ...preferences.mood,
      ...preferences.similarTo,
    ]
      .filter(Boolean)
      .join(" ");

    if (!queryText) return [];

    const queryEmbedding = await embeddings.embedQuery(queryText);

    const { data, error } = await supabase.rpc("match_books", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: limit,
      filter_genres: preferences.genres,
    });

    if (error) {
      return [];
    }

    return (data ?? []).map(rowToBook);
  } catch {
    return [];
  }
}

/**
 * Get reading ladder for a genre from the database.
 */
export async function getReadingLadder(genre: string): Promise<Book[]> {
  const levels: Level[] = ["beginner", "intermediate", "advanced"];
  const ladder: Book[] = [];

  for (const lvl of levels) {
    const { data } = await supabase
      .from("books")
      .select("*")
      .contains("genres", [genre.toLowerCase()])
      .eq("level", lvl)
      .order("complexity", { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      ladder.push(rowToBook(data[0]));
    }
  }

  return ladder;
}

/**
 * Construct a dynamic 3-step reading ladder from the candidate set and database:
 * Step 1: User level match (Start here)
 * Step 2: Complexity bump / intermediate progression (Level up)
 * Step 3: Stretch pick (Ready for a challenge)
 */
export async function getDynamicReadingLadder(
  candidates: Book[],
  targetLevel: Level,
  primaryGenre: string
): Promise<{ step: number; book: Book; note: string }[]> {
  const steps: { step: number; book: Book; note: string }[] = [];

  let step1Level: Level = "beginner";
  let step2Level: Level = "intermediate";
  let step3Level: Level = "advanced";

  if (targetLevel === "intermediate") {
    step1Level = "intermediate";
    step2Level = "intermediate";
    step3Level = "advanced";
  } else if (targetLevel === "advanced") {
    step1Level = "intermediate";
    step2Level = "advanced";
    step3Level = "advanced";
  }

  // Look in current candidates pool first
  const candStep1 = candidates.find((b) => b.level === step1Level);
  const candStep2 = candidates.find(
    (b) => b.id !== candStep1?.id && (b.level === step2Level || (candStep1 && b.complexity > candStep1.complexity))
  );
  const candStep3 = candidates.find(
    (b) => b.id !== candStep1?.id && b.id !== candStep2?.id && b.level === step3Level
  );

  const dbLadder = await getReadingLadder(primaryGenre);

  const book1 = candStep1 || dbLadder.find((b) => b.level === step1Level) || dbLadder[0];
  const book2 = candStep2 || dbLadder.find((b) => b.id !== book1?.id && b.level === step2Level) || dbLadder[1] || dbLadder[0];
  const book3 = candStep3 || dbLadder.find((b) => b.id !== book1?.id && b.id !== book2?.id && b.level === step3Level) || dbLadder[2] || dbLadder[1];

  if (book1) {
    steps.push({
      step: 1,
      book: book1,
      note: targetLevel === "beginner" ? "Start here" : "Foundation step",
    });
  }
  if (book2 && book2.id !== book1?.id) {
    steps.push({
      step: 2,
      book: book2,
      note: "Level up",
    });
  }
  if (book3 && book3.id !== book1?.id && book3.id !== book2?.id) {
    steps.push({
      step: 3,
      book: book3,
      note: "Ready for a challenge",
    });
  }

  return steps;
}

function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genres: row.genres,
    level: row.level,
    complexity: row.complexity,
    pacing: row.pacing,
    tone: row.tone,
    pageCount: row.page_count,
    description: row.description,
    coverUrl: row.cover_url,
    avgRating: row.avg_rating,
    whyStartHere: row.why_start_here,
    amazonSearchUrl: amazonSearchUrl(row.title, row.author),
    embedding: row.embedding ?? null,
  };
}
