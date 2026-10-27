import "server-only";

import { env } from "@/lib/env";
import { getLLM, getEmbeddingsModel } from "@/lib/llm";
import { supabase } from "@/lib/db/supabase";
import { amazonSearchUrl } from "@/lib/utils";
import type { Book, Level } from "@/lib/schemas";
import { LEVEL_RUBRIC } from "@/lib/scoring/rubric";
import type { ReaderContext } from "@/lib/profile/context";
import { z } from "zod";

export interface ExternalBook {
  title: string;
  author: string;
  normalizedKey: string;
  pageCount: number | null;
  description: string | null;
  coverUrl: string | null;
  avgRating: number | null;
  ratingsCount?: number | null;
  genres: string[];
  sources: ("google" | "openlibrary")[];
  isbn?: string | null;
  googleBooksId?: string | null;
  openLibraryKey?: string | null;
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

export function normalizeTitleAuthorKey(title: string, author: string): string {
  const cleanTitle = (title || "")
    .toLowerCase()
    .split(":")[0] // strip subtitle after colon
    .replace(/[^a-z0-9]/g, "");

  const cleanAuthor = (author || "")
    .toLowerCase()
    .split(",")[0]
    .replace(/[^a-z0-9]/g, "");

  return `${cleanTitle}|${cleanAuthor}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms in ${label}`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Fetch from Google Books API
 */
async function fetchGoogleBooks(query: string, maxResults = 15): Promise<ExternalBook[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    orderBy: "relevance",
    printType: "books",
    langRestrict: "en",
  });

  if (env.GOOGLE_BOOKS_API_KEY) {
    params.set("key", env.GOOGLE_BOOKS_API_KEY);
  }

  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(3800) });
  if (!res.ok) {
    throw new Error(`Google Books API HTTP ${res.status}`);
  }

  const data = await res.json();
  const items = data.items || [];
  const books: ExternalBook[] = [];

  for (const item of items) {
    const info = item.volumeInfo || {};
    const title = info.title;
    const author = info.authors?.[0];
    if (!title || !author) continue;

    let coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
    if (coverUrl) {
      coverUrl = coverUrl.replace(/^http:\/\//i, "https://");
      coverUrl = coverUrl.replace("&edge=curl", "");
      if (coverUrl.includes("&zoom=")) {
        coverUrl = coverUrl.replace(/&zoom=\d/, "&zoom=2");
      }
    }

    const isbn = info.industryIdentifiers?.find((id: { type: string; identifier: string }) =>
      id.type.includes("ISBN")
    )?.identifier || null;

    books.push({
      title,
      author,
      normalizedKey: normalizeTitleAuthorKey(title, author),
      pageCount: info.pageCount || null,
      description: info.description || null,
      coverUrl,
      avgRating: typeof info.averageRating === "number" ? info.averageRating : null,
      ratingsCount: typeof info.ratingsCount === "number" ? info.ratingsCount : null,
      genres: info.categories || [],
      sources: ["google"],
      isbn,
      googleBooksId: item.id,
    });
  }

  return books;
}

/**
 * Fetch from Open Library API
 */
async function fetchOpenLibrary(query: string, maxResults = 15): Promise<ExternalBook[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(maxResults),
    language: "eng",
    fields: "key,title,author_name,number_of_pages_median,cover_i,ratings_average,ratings_count,isbn,subject,first_sentence",
  });

  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BookCompass/2.0 (contact@bookcompass.ai)",
    },
    signal: AbortSignal.timeout(3800),
  });

  if (!res.ok) {
    throw new Error(`Open Library API HTTP ${res.status}`);
  }

  const data = await res.json();
  const docs = data.docs || [];
  const books: ExternalBook[] = [];

  for (const doc of docs) {
    const title = doc.title;
    const author = doc.author_name?.[0];
    if (!title || !author) continue;

    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : null;

    const isbn = doc.isbn?.[0] || null;
    const desc = doc.first_sentence?.[0] || null;

    books.push({
      title,
      author,
      normalizedKey: normalizeTitleAuthorKey(title, author),
      pageCount: doc.number_of_pages_median || null,
      description: desc,
      coverUrl,
      avgRating: typeof doc.ratings_average === "number" ? doc.ratings_average : null,
      ratingsCount: typeof doc.ratings_count === "number" ? doc.ratings_count : null,
      genres: doc.subject?.slice(0, 5) || [],
      sources: ["openlibrary"],
      isbn,
      openLibraryKey: doc.key,
    });
  }

  return books;
}

/**
 * Dual-Source Parallel Retrieval querying Google Books and Open Library simultaneously
 */
export async function fetchDualSourceCandidates(
  context: ReaderContext
): Promise<{ candidates: Book[]; notice?: string }> {
  const primaryGenre = context.genres[0] || "fiction";

  // Build 3 queries (Section 4.2)
  const queries: string[] = [
    `subject:${primaryGenre}`,
    ...(context.subGenres.length > 0 || context.moods.length > 0
      ? [`${primaryGenre} ${context.subGenres.join(" ")} ${context.moods.slice(0, 2).join(" ")}`.trim()]
      : []),
    ...(context.similarTo.length > 0
      ? [`${primaryGenre} inauthor:"${context.similarTo[0].author}"`]
      : []),
  ];

  const candidateMap = new Map<string, ExternalBook>();

  let googleSuccess = false;
  let openLibSuccess = false;

  for (const q of queries.slice(0, 2)) {
    const [googleResult, openLibResult] = await Promise.allSettled([
      withTimeout(fetchGoogleBooks(q, 15), 4000, "Google Books"),
      withTimeout(fetchOpenLibrary(q, 15), 4000, "Open Library"),
    ]);

    if (googleResult.status === "fulfilled") {
      googleSuccess = true;
      for (const b of googleResult.value) {
        mergeCandidate(candidateMap, b);
      }
    } else {
      console.warn(`[DualSource] Google Books failed for query "${q}":`, googleResult.reason);
    }

    if (openLibResult.status === "fulfilled") {
      openLibSuccess = true;
      for (const b of openLibResult.value) {
        mergeCandidate(candidateMap, b);
      }
    } else {
      console.warn(`[DualSource] Open Library failed for query "${q}":`, openLibResult.reason);
    }
  }

  let notice: string | undefined;
  if (!googleSuccess && !openLibSuccess) {
    notice = "Live book sources are slow right now, so these picks come from our saved catalog.";
  } else if (!googleSuccess && openLibSuccess) {
    notice = "Google Books is taking a moment, enriched with Open Library results.";
  } else if (googleSuccess && !openLibSuccess) {
    notice = "Open Library is taking a moment, enriched with Google Books results.";
  }

  // Filter candidates: require title, author, description, and page count
  const validCandidates: ExternalBook[] = [];
  for (const cand of candidateMap.values()) {
    if (cand.title && cand.author && (cand.pageCount || cand.description)) {
      validCandidates.push(cand);
    }
  }

  if (validCandidates.length === 0) {
    return { candidates: [], notice };
  }

  // Tag uncataloged books with Gemini
  const enrichedBooks = await batchTagAndEnrich(validCandidates.slice(0, 10), primaryGenre);
  return { candidates: enrichedBooks, notice };
}

function mergeCandidate(map: Map<string, ExternalBook>, incoming: ExternalBook) {
  const key = incoming.normalizedKey;
  const existing = map.get(key);

  if (!existing) {
    map.set(key, { ...incoming });
    return;
  }

  // Merge according to Section 4.4:
  // Title & author: prefer Google
  const title = existing.sources.includes("google") ? existing.title : incoming.title;
  const author = existing.sources.includes("google") ? existing.author : incoming.author;

  // Page count: prefer Open Library median when present, else Google
  const pageCount =
    incoming.sources.includes("openlibrary") && incoming.pageCount
      ? incoming.pageCount
      : existing.pageCount || incoming.pageCount;

  // Description: prefer longer one
  const desc =
    (incoming.description?.length || 0) > (existing.description?.length || 0)
      ? incoming.description
      : existing.description;

  // Cover URL: prefer Google https zoom=2, then Open Library
  const coverUrl = existing.coverUrl || incoming.coverUrl;

  // Rating: weighted average
  let avgRating = existing.avgRating;
  if (existing.avgRating && incoming.avgRating) {
    avgRating = Number(((existing.avgRating + incoming.avgRating) / 2).toFixed(1));
  } else {
    avgRating = existing.avgRating || incoming.avgRating;
  }

  const combinedGenres = Array.from(new Set([...existing.genres, ...incoming.genres]));
  const combinedSources = Array.from(new Set([...existing.sources, ...incoming.sources])) as ("google" | "openlibrary")[];

  map.set(key, {
    title,
    author,
    normalizedKey: key,
    pageCount,
    description: desc,
    coverUrl,
    avgRating,
    genres: combinedGenres,
    sources: combinedSources,
    isbn: existing.isbn || incoming.isbn,
    googleBooksId: existing.googleBooksId || incoming.googleBooksId,
    openLibraryKey: existing.openLibraryKey || incoming.openLibraryKey,
  });
}

async function batchTagAndEnrich(
  candidates: ExternalBook[],
  genre: string
): Promise<Book[]> {
  if (candidates.length === 0) return [];

  const booksToTag = candidates.map((c, index) => ({
    index,
    title: c.title,
    author: c.author,
    pages: c.pageCount || 250,
    description: c.description ? c.description.slice(0, 300) : "No description",
  }));

  let taggedData: Array<{
    index: number;
    level: "beginner" | "intermediate" | "advanced";
    complexity: number;
    pacing: "slow" | "medium" | "fast";
    tone: string[];
    heatLevel?: "clean" | "mild" | "steamy" | "unknown";
  }> = [];

  try {
    const model = getLLM({ temperature: 0.1 });
    const structuredModel = model.withStructuredOutput(BatchTaggingSchema);

    const prompt = `Tag these books with level, complexity, pacing, tone, and heatLevel based strictly on their description and page count:

LEVEL RUBRIC (Source of Truth):
- Beginner: Complexity 1-2, up to 320 pages. Accessible, clear narrative.
- Advanced: Complexity 4-5, or over 500 pages. Layered, dense, complex.
- Intermediate: All other books.

BOOKS:
${JSON.stringify(booksToTag, null, 2)}`;

    const res = await structuredModel.invoke(prompt);
    taggedData = res.tags;
  } catch (err) {
    console.warn("[batchTagAndEnrich] Tagging failed, using rubric fallbacks:", err);
  }

  const enriched: Book[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const tag = taggedData.find((t) => t.index === i);

    const pages = cand.pageCount || 250;
    let level: Level = "intermediate";
    let complexity = 3;
    let pacing: "slow" | "medium" | "fast" = "medium";
    let tone = ["engaging"];

    if (tag) {
      level = tag.level;
      complexity = tag.complexity;
      pacing = tag.pacing;
      tone = tag.tone;
    } else {
      if (pages <= 320) {
        level = "beginner";
        complexity = 2;
        pacing = "fast";
      } else if (pages > 500) {
        level = "advanced";
        complexity = 4;
        pacing = "medium";
      }
    }

    const book: Book = {
      id: cand.googleBooksId || `ext-${cand.normalizedKey}`,
      title: cand.title,
      author: cand.author,
      genres: [genre, ...cand.genres].slice(0, 3),
      level,
      complexity,
      pacing,
      tone,
      pageCount: cand.pageCount,
      description: cand.description,
      coverUrl: cand.coverUrl,
      avgRating: cand.avgRating,
      whyStartHere: `A popular recommendation in ${genre} with ${pages} pages.`,
      amazonSearchUrl: amazonSearchUrl(cand.title, cand.author),
      sources: cand.sources,
    };

    enriched.push(book);
  }

  return enriched;
}
