import "server-only";

import {
  type Genre,
  type Level,
  type ReaderProfile,
  type PastRead,
  type ReaderContext,
} from "@/lib/schemas";
import { LENGTH_RANGES, PLOT_TO_COMPLEXITY } from "@/lib/profile/mapping";
import { resolveGenre, type GenreResolution } from "@/lib/profile/genreResolver";
import { extractNotes, type ExtractedNotes } from "@/lib/chains/extractNotes";
import { getEmbeddingsModel } from "@/lib/llm";
import { cosineSimilarity } from "@/lib/scoring/score";

export type { ReaderContext };

export async function buildReaderContext(
  profile: ReaderProfile | null | undefined,
  message: string,
  excludeBookIds: string[] = []
): Promise<ReaderContext> {
  // Step 3: Note extraction with Gemini (message only, profile given)
  const notes: ExtractedNotes = await extractNotes(message, profile);

  // Step 5: Genre resolver
  const resolution: GenreResolution = resolveGenre(profile, notes, message);

  // Level precedence: message override -> profile level -> default beginner
  let level: Level = profile?.level || "beginner";
  if (notes.explicitOverride && notes.explicitOverride.field === "level") {
    level = notes.explicitOverride.to.toLowerCase() as Level;
  }

  // Length range mapping
  const chosenLength = profile?.length || "any";
  const lengthRange = LENGTH_RANGES[chosenLength] || null;

  // Complexity range mapping
  const chosenPlot = profile?.plot || "any";
  const complexityRange = PLOT_TO_COMPLEXITY[chosenPlot]
    ? [PLOT_TO_COMPLEXITY[chosenPlot]![0], PLOT_TO_COMPLEXITY[chosenPlot]![1]] as [number, number]
    : null;

  // Moods: profile moods + notes moodsToAdd
  const combinedMoods = Array.from(
    new Set([...(profile?.moods || []), ...(notes.moodsToAdd || [])])
  );

  // Heat level: notes heatLevel -> profile heatLevel -> "any"
  const heatLevel = notes.heatLevel || profile?.heatLevel || "any";

  // Past reads and disliked authors
  const pastReads = profile?.pastReads || [];
  const similarTo = pastReads.filter((pr) => pr.opinion === "loved");
  const dislikedAuthors = pastReads
    .filter((pr) => pr.opinion === "disliked")
    .map((pr) => pr.author.toLowerCase().trim());

  // Exclude books: past read titles/ids + previously seen book IDs
  const pastReadIds = pastReads.map((pr) => pr.bookId).filter(Boolean) as string[];
  const allExcludeIds = Array.from(new Set([...excludeBookIds, ...pastReadIds]));

  // Overrides list
  const overrides: { field: string; from: string; to: string; cue: string }[] = [];
  if (resolution.override) {
    overrides.push(resolution.override);
  }
  if (notes.explicitOverride && notes.explicitOverride.field !== "genre") {
    overrides.push(notes.explicitOverride);
  }

  // Taste Vector Embedding blending (Section 3.4)
  let tasteVector: number[] | null = null;
  try {
    const queryParts = [
      resolution.genres.join(" "),
      notes.subGenres.join(" "),
      combinedMoods.join(" "),
      chosenPlot !== "any" ? `${chosenPlot} plot` : "",
      level,
      message,
    ]
      .filter(Boolean)
      .join(" ");

    const embeddingsModel = getEmbeddingsModel();
    const queryEmbedding = await embeddingsModel.embedQuery(queryParts);

    // If loved reads are present, blend embeddings
    if (similarTo.length > 0) {
      const lovedTexts = similarTo.map((pr) => `${pr.title} by ${pr.author}`).join(", ");
      const lovedEmbedding = await embeddingsModel.embedQuery(lovedTexts);

      // q = 0.6 * embed(queryText) + 0.4 * embed(loved reads)
      const blended: number[] = new Array(queryEmbedding.length);
      for (let i = 0; i < queryEmbedding.length; i++) {
        blended[i] = 0.6 * queryEmbedding[i] + 0.4 * (lovedEmbedding[i] || 0);
      }
      tasteVector = blended;
    } else {
      tasteVector = queryEmbedding;
    }
  } catch (err) {
    console.warn("[buildReaderContext] Embedding generation failed:", err);
  }

  return {
    genres: resolution.genres,
    genreSource: resolution.genreSource,
    genreConfidence: resolution.genreConfidence,
    level,
    length: lengthRange,
    complexityRange,
    moods: combinedMoods,
    subGenres: notes.subGenres,
    heatLevel,
    avoid: notes.avoid,
    similarTo,
    dislikedAuthors,
    excludeBookIds: allExcludeIds,
    targetBookQuery: notes.targetBookQuery,
    overrides,
    inferenceReasons: resolution.inferenceReasons,
    candidateGenres: resolution.candidateGenres,
    tasteVector,
  };
}
