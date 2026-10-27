/**
 * Seed script: loads curated books, enriches via Google Books,
 * generates embeddings, and inserts into Supabase.
 *
 * Usage: npx tsx scripts/seed-books.ts
 */

import { createClient } from "@supabase/supabase-js";
import curatedBooks from "./data/curated-books.json";

// Load env vars from .env.local, .env, or process.env
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env if present

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GOOGLE_BOOKS_API = "https://www.googleapis.com/books/v1/volumes";
const GEMINI_EMBED_API = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

interface CuratedBook {
  title: string;
  author: string;
  genres: string[];
  level: string;
  complexity: number;
  pacing: string;
  tone: string[];
  page_count: number | null;
  isbn: string | null;
  why_start_here: string;
}

interface EnrichedBook extends CuratedBook {
  description: string | null;
  cover_url: string | null;
  avg_rating: number | null;
  google_books_id: string | null;
  embedding: number[] | null;
}

function normalizeTitleAuthorKey(title: string, author: string): string {
  const cleanTitle = (title || "")
    .toLowerCase()
    .split(":")[0]
    .replace(/[^a-z0-9]/g, "");

  const cleanAuthor = (author || "")
    .toLowerCase()
    .split(",")[0]
    .replace(/[^a-z0-9]/g, "");

  return `${cleanTitle}|${cleanAuthor}`;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichFromOpenLibrary(title: string, author: string) {
  try {
    const q = encodeURIComponent(`${title} ${author}`);
    const res = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data.docs?.[0];
    if (!doc) return null;
    return {
      cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      page_count: doc.number_of_pages_median ?? null,
      description: doc.first_sentence?.[0] ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Search Google Books for a book by title + author, with Open Library fallback
 */
async function enrichFromGoogleBooks(
  title: string,
  author: string
): Promise<{
  description: string | null;
  cover_url: string | null;
  avg_rating: number | null;
  google_books_id: string | null;
  page_count: number | null;
}> {
  try {
    const params = new URLSearchParams({
      q: `intitle:${title} inauthor:${author}`,
      maxResults: "3",
      orderBy: "relevance",
      printType: "books",
    });

    if (GOOGLE_BOOKS_API_KEY) {
      params.set("key", GOOGLE_BOOKS_API_KEY);
    }

    const response = await fetch(`${GOOGLE_BOOKS_API}?${params}`, {
      signal: AbortSignal.timeout(6000),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.items?.length) {
        const best = data.items[0];
        const info = best.volumeInfo;
        return {
          description: info.description ?? null,
          cover_url:
            info.imageLinks?.thumbnail?.replace("http:", "https:") ?? null,
          avg_rating: info.averageRating ?? null,
          google_books_id: best.id,
          page_count: info.pageCount ?? null,
        };
      }
    }
  } catch (error) {
    // Fall through to Open Library
  }

  // Open Library fallback
  const ol = await enrichFromOpenLibrary(title, author);
  return {
    description: ol?.description ?? null,
    cover_url: ol?.cover_url ?? null,
    avg_rating: null,
    google_books_id: null,
    page_count: ol?.page_count ?? null,
  };
}

/**
 * Generate an embedding using Gemini Embeddings API directly
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${GEMINI_EMBED_API}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`  ⚠ Embedding API returned ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json();
    return data.embedding?.values ?? null;
  } catch (error) {
    console.warn("  ⚠ Embedding generation failed:", error);
    return null;
  }
}

/**
 * Build embedding text from a book's metadata
 */
function buildEmbeddingText(book: CuratedBook, description: string | null): string {
  const parts = [
    book.title,
    `by ${book.author}`,
    `genres: ${book.genres.join(", ")}`,
    `level: ${book.level}`,
    `tone: ${book.tone.join(", ")}`,
    `pacing: ${book.pacing}`,
    book.why_start_here,
  ];
  if (description) {
    parts.push(description.slice(0, 500));
  }
  return parts.join(". ");
}

async function main() {
  console.log("📚 BookCompass Seed Script");
  console.log("========================\n");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    console.error("   Please ensure .env.local has your Supabase URL and Publishable Key.");
    process.exit(1);
  }
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === "your_gemini_api_key_here") {
    console.error("❌ Missing or placeholder GOOGLE_API_KEY");
    console.error("   The seed script generates vector embeddings for each book using Gemini.");
    console.error("   Please set your real GOOGLE_API_KEY in .env.local (get a free key at https://aistudio.google.com/app/apikey).");
    process.exit(1);
  }

  const books = curatedBooks as CuratedBook[];
  console.log(`Found ${books.length} curated books to seed.\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    console.log(
      `[${i + 1}/${books.length}] Processing: "${book.title}" by ${book.author}`
    );

    // Check if book already exists
    const { data: existing } = await supabase
      .from("books")
      .select("id")
      .eq("title", book.title)
      .eq("author", book.author)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log("  ⏭ Already exists, skipping");
      skipCount++;
      continue;
    }

    // Enrich from Google Books
    console.log("  🔍 Enriching from Google Books...");
    const enrichment = await enrichFromGoogleBooks(book.title, book.author);
    await sleep(300); // Rate limit courtesy

    // Generate embedding
    console.log("  🧮 Generating embedding...");
    const embeddingText = buildEmbeddingText(book, enrichment.description);
    const embedding = await generateEmbedding(embeddingText);
    await sleep(200); // Rate limit courtesy

    // Insert into Supabase
    const enrichedBook: EnrichedBook = {
      ...book,
      description: enrichment.description,
      cover_url: enrichment.cover_url,
      avg_rating: enrichment.avg_rating,
      google_books_id: enrichment.google_books_id,
      page_count: book.page_count || enrichment.page_count || null,
      embedding,
    };

    const titleAuthorKey = normalizeTitleAuthorKey(enrichedBook.title, enrichedBook.author);
    const { error: insertError } = await supabase.from("books").upsert(
      {
        title_author_key: titleAuthorKey,
        title: enrichedBook.title,
        author: enrichedBook.author,
        genres: enrichedBook.genres,
        level: enrichedBook.level,
        complexity: enrichedBook.complexity,
        pacing: enrichedBook.pacing,
        tone: enrichedBook.tone,
        page_count: enrichedBook.page_count,
        description: enrichedBook.description,
        cover_url: enrichedBook.cover_url,
        avg_rating: enrichedBook.avg_rating,
        google_books_id: enrichedBook.google_books_id,
        isbn: enrichedBook.isbn,
        why_start_here: enrichedBook.why_start_here,
        embedding: enrichedBook.embedding,
        sources: ["catalog"],
      },
      { onConflict: "title_author_key" }
    );

    if (insertError) {
      console.error(`  ❌ Insert failed: ${insertError.message}`);
      errorCount++;
    } else {
      console.log("  ✅ Inserted successfully");
      successCount++;
    }
  }

  console.log("\n========================");
  console.log(`📊 Results: ${successCount} inserted, ${skipCount} skipped, ${errorCount} errors`);
  console.log("Done! 🎉");
}

main().catch(console.error);
