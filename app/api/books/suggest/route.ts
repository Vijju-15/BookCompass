import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import { checkRateLimit } from "@/lib/ratelimit";
import { searchGoogleBooks } from "@/lib/retrieval/googleBooks";
import { searchOpenLibrary } from "@/lib/retrieval/openLibrary";

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anonymous";

    const rateLimit = await checkRateLimit(`suggest:${ip}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ books: [] });
    }

    const suggestions: Array<{
      id: string;
      title: string;
      author: string;
      coverUrl: string | null;
      genres: string[];
    }> = [];

    const seenKeys = new Set<string>();

    const addSuggestion = (item: {
      id?: string;
      title?: string;
      author?: string;
      coverUrl?: string | null;
      genres?: string[];
    }) => {
      if (!item.title || !item.author) return;
      const key = `${item.title.toLowerCase().trim()}|${item.author.toLowerCase().trim()}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      suggestions.push({
        id: item.id || `ext-${key}`,
        title: item.title,
        author: item.author,
        coverUrl: item.coverUrl || null,
        genres: item.genres || [],
      });
    };

    // 1. Search DB catalog first
    try {
      const { data: dbBooks } = await supabase
        .from("books")
        .select("id, title, author, cover_url, genres")
        .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
        .limit(8);

      if (dbBooks) {
        for (const b of dbBooks) {
          addSuggestion({
            id: b.id,
            title: b.title,
            author: b.author,
            coverUrl: b.cover_url,
            genres: b.genres,
          });
        }
      }
    } catch (dbErr) {
      console.warn("Suggest DB lookup error:", dbErr);
    }

    // 2. If fewer than 8, query Google Books & Open Library in parallel
    if (suggestions.length < 8) {
      try {
        const [gbRes, olRes] = await Promise.allSettled([
          searchGoogleBooks(query, 8),
          searchOpenLibrary(query, 8),
        ]);

        if (gbRes.status === "fulfilled" && Array.isArray(gbRes.value)) {
          for (const b of gbRes.value) {
            addSuggestion({
              id: b.id || (b as { google_books_id?: string }).google_books_id,
              title: b.title,
              author: b.author,
              coverUrl: b.coverUrl,
              genres: b.genres,
            });
            if (suggestions.length >= 8) break;
          }
        }

        if (suggestions.length < 8 && olRes.status === "fulfilled" && Array.isArray(olRes.value)) {
          for (const b of olRes.value) {
            addSuggestion({
              title: b.title,
              author: b.author,
              coverUrl: b.coverUrl,
              genres: b.genres,
            });
            if (suggestions.length >= 8) break;
          }
        }
      } catch (extErr) {
        console.warn("Suggest external lookup error:", extErr);
      }
    }

    return NextResponse.json({
      books: suggestions.slice(0, 8),
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_")) {
      throw error;
    }
    console.error("Books suggest error:", error);
    return NextResponse.json({ books: [] });
  }
}
