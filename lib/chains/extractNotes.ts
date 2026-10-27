import "server-only";

import { z } from "zod";
import { getLLM } from "@/lib/llm";
import { GENRES, type Genre, type ReaderProfile } from "@/lib/schemas";
import { cleanText } from "@/lib/text/cleanText";

export const ExtractedNotesSchema = z.object({
  subGenres: z.array(z.string()).default([]),
  heatLevel: z.enum(["clean", "mild", "steamy"]).nullable().default(null),
  moodsToAdd: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  similarTo: z.array(z.string()).default([]),
  targetBookQuery: z.string().nullable().default(null),
  genreGuess: z
    .object({
      genre: z.enum(GENRES),
      confidence: z.number().min(0).max(1),
    })
    .nullable()
    .default(null),
  explicitOverride: z
    .object({
      field: z.string(),
      from: z.string(),
      to: z.string(),
      cue: z.string(),
    })
    .nullable()
    .default(null),
});

export type ExtractedNotes = z.infer<typeof ExtractedNotesSchema>;

const DEFAULT_NOTES: ExtractedNotes = {
  subGenres: [],
  heatLevel: null,
  moodsToAdd: [],
  avoid: [],
  similarTo: [],
  targetBookQuery: null,
  genreGuess: null,
  explicitOverride: null,
};

export async function extractNotes(
  message: string,
  profile?: ReaderProfile | null
): Promise<ExtractedNotes> {
  const cleanMessage = cleanText(message || "");
  if (!cleanMessage) {
    return DEFAULT_NOTES;
  }

  try {
    const model = getLLM(0.1);
    const structuredModel = model.withStructuredOutput(ExtractedNotesSchema);

    const prompt = `You read a short free-text note from a reader and extract extra preferences.

The reader has already filled in a questionnaire. READER_PROFILE below is ground truth.
Do not restate it and do not change it, with one exception: if the note explicitly
contradicts a field (for example "actually I want horror" while the profile says romance),
report that in "explicitOverride" with the exact cue from the note.

Extract only:
- subGenres: tropes or sub-genres named or clearly implied (rom-com, slow-burn, enemies-to-lovers, space opera)
- heatLevel: clean, mild, steamy, or null if not mentioned
- moodsToAdd: extra moods not already in the profile
- avoid: topics or content the reader wants to avoid (e.g. "no sad endings", "no gore")
- similarTo: book titles or authors the reader names
- targetBookQuery: a specific book title if the reader is asking about one book
- genreGuess: genre and confidence from 0 to 1, only if the note clearly implies one

If the note is empty or vague, return empty arrays and nulls. Never invent anything.
Return JSON that matches the schema. Plain text values only.

READER_PROFILE: ${JSON.stringify(profile || {})}
NOTE: ${cleanMessage}`;

    const result = await structuredModel.invoke(prompt);
    return ExtractedNotesSchema.parse(result);
  } catch (err) {
    console.warn("[extractNotes] LLM note extraction failed, using heuristic fallback:", err);

    // Heuristic fallbacks
    const lower = cleanMessage.toLowerCase();
    const notes: ExtractedNotes = { ...DEFAULT_NOTES };

    if (lower.includes("spicy") || lower.includes("steamy") || lower.includes("smut")) {
      notes.heatLevel = "steamy";
    } else if (lower.includes("clean") || lower.includes("sweet romance")) {
      notes.heatLevel = "clean";
    }

    if (lower.includes("rom-com") || lower.includes("romcom")) {
      notes.subGenres = ["rom-com"];
    } else if (lower.includes("enemies to lovers") || lower.includes("enemies-to-lovers")) {
      notes.subGenres = ["enemies-to-lovers"];
    } else if (lower.includes("slow burn") || lower.includes("slow-burn")) {
      notes.subGenres = ["slow-burn"];
    }

    return notes;
  }
}
