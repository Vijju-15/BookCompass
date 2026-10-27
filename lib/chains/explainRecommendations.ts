import "server-only";

import { getChatModel } from "@/lib/llm";
import {
  ExplanationResponseSchema,
  type ExplanationResponse,
  type Book,
  type Preferences,
} from "@/lib/schemas";
import { cleanText } from "@/lib/text/cleanText";
import { buildMatchFacts } from "@/lib/scoring/matchFacts";
import type { ReaderContext } from "@/lib/profile/context";

const SYSTEM_PROMPT = `Write short explanations for book recommendations.

Rules:
- Use only the facts in each book's "matchFacts" and "description". Do not add plot details,
  awards, numbers or opinions that are not given.
- whyItFits: 1 to 2 plain sentences linking the book to what the reader chose.
- whyThisLevel: 1 plain sentence about level and complexity.
- watchOut: one honest caveat, or null.
- Plain text only. No markdown, no asterisks, no hashes, no bullets, no emojis.
- No filler openers such as "Absolutely" or "Great choice".
- Return every supplied bookId exactly once, in the supplied order.`;

/**
 * Generate structured explanations for recommended books, grounded strictly on code-built matchFacts.
 */
export async function generateStructuredExplanation(
  books: Book[],
  preferences: Preferences,
  userMessage: string,
  existingNotice?: string | null,
  context?: ReaderContext | null
): Promise<ExplanationResponse> {
  const model = getChatModel({ maxOutputTokens: 2048, temperature: 0.3 });
  const structuredModel = model.withStructuredOutput(ExplanationResponseSchema);

  const booksWithMatchFacts = books.map((b) => {
    const facts = buildMatchFacts(b, context);
    return {
      bookId: b.id,
      title: b.title,
      author: b.author,
      level: b.level,
      complexity: b.complexity,
      pacing: b.pacing,
      tone: b.tone,
      pages: b.pageCount,
      description: b.description?.slice(0, 300),
      matchFacts: facts,
    };
  });

  try {
    const result = await structuredModel.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `READER_CONTEXT:
${JSON.stringify(context || preferences, null, 2)}

BOOKS:
${JSON.stringify(booksWithMatchFacts, null, 2)}`,
      },
    ]);

    // Sanitize all text fields using cleanText to remove any inadvertent markdown artifacts
    return {
      notice: existingNotice ? cleanText(existingNotice) : result.notice ? cleanText(result.notice) : null,
      summary: cleanText(result.summary),
      books: (result.books || []).map((b) => ({
        bookId: b.bookId,
        whyItFits: cleanText(b.whyItFits),
        whyThisLevel: cleanText(b.whyThisLevel),
        watchOut: b.watchOut ? cleanText(b.watchOut) : null,
      })),
      ladderNote: result.ladderNote ? cleanText(result.ladderNote) : null,
    };
  } catch (err: unknown) {
    console.error("[EXPLAIN_RECOMMENDATIONS] Structured output failed, falling back to clean prose:", err);
    return {
      notice: existingNotice ? cleanText(existingNotice) : null,
      summary: cleanText(
        `Here are hand-picked recommendations tailored to your taste in ${preferences.genres.join(", ")}. Each selection offers an inviting entry point matching your reading level.`
      ),
      books: books.map((b) => ({
        bookId: b.id,
        whyItFits: cleanText(b.whyStartHere || `A standout match for ${preferences.genres.join(", ")} readers.`),
        whyThisLevel: cleanText(`Calibrated for ${b.level} reading with ${b.pacing} pacing.`),
        watchOut: null,
      })),
      ladderNote: "Follow our reading ladder below to level up your reading journey.",
    };
  }
}
