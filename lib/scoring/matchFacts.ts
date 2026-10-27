import type { Book } from "@/lib/schemas";
import type { ReaderContext } from "@/lib/profile/context";

/**
 * Builds deterministic, factual strings per book strictly from verified data.
 * The LLM explanation prompt is grounded on these matchFacts.
 */
export function buildMatchFacts(book: Book, context?: ReaderContext | null): string[] {
  const facts: string[] = [];

  if (!context) {
    if (book.pageCount) facts.push(`${book.pageCount} pages`);
    if (book.level) facts.push(`${book.level.charAt(0).toUpperCase() + book.level.slice(1)} reading level`);
    if (book.tone && book.tone.length > 0) facts.push(`Tone: ${book.tone.slice(0, 2).join(", ")}`);
    return facts;
  }

  // 1. Length fact
  if (book.pageCount) {
    if (context.length) {
      if (book.pageCount >= context.length.min && book.pageCount <= context.length.max) {
        facts.push(`${book.pageCount} pages, inside your target length range`);
      } else {
        facts.push(`${book.pageCount} pages`);
      }
    } else {
      facts.push(`${book.pageCount} pages`);
    }
  }

  // 2. Complexity / Level fact
  if (book.complexity) {
    if (context.complexityRange) {
      const [minC, maxC] = context.complexityRange;
      if (book.complexity >= minC && book.complexity <= maxC) {
        facts.push(`Plot complexity ${book.complexity} of 5, matches your desired plot style`);
      } else {
        facts.push(`Plot complexity ${book.complexity} of 5 (${book.level} level)`);
      }
    } else {
      facts.push(`Plot complexity ${book.complexity} of 5 (${book.level} level)`);
    }
  }

  // 3. Mood / Tone match
  if (context.moods.length > 0 && book.tone && book.tone.length > 0) {
    const matched = book.tone.filter((t) =>
      context.moods.some((m) => t.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(t.toLowerCase()))
    );
    if (matched.length > 0) {
      facts.push(`Tone tags "${matched.join(", ")}" match your desired mood`);
    }
  }

  // 4. Past reads similarity
  if (context.similarTo.length > 0) {
    const sameGenreOrAuthor = context.similarTo.find(
      (pr) =>
        pr.author.toLowerCase() === book.author.toLowerCase() ||
        book.genres.some((g) => pr.title.toLowerCase().includes(g))
    );
    if (sameGenreOrAuthor) {
      facts.push(`Recommended because you loved ${sameGenreOrAuthor.title}`);
    }
  }

  // 5. Dual-source confirmation
  if (book.sources && book.sources.includes("google") && book.sources.includes("openlibrary")) {
    facts.push("Verified by Google Books and Open Library");
  } else if (book.sources && book.sources.length > 0) {
    facts.push(`Verified catalog data from ${book.sources.join(" & ")}`);
  }

  return facts.slice(0, 4);
}
