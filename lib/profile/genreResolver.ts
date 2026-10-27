import { GENRES, type Genre, type ReaderProfile, type PastRead } from "@/lib/schemas";
import { GENRE_PROFILE } from "@/lib/profile/genreProfile";
import { PLOT_TO_COMPLEXITY } from "@/lib/profile/mapping";
import type { ExtractedNotes } from "@/lib/chains/extractNotes";

export interface GenreResolution {
  genres: Genre[];
  genreSource: "form" | "message" | "inferred";
  genreConfidence: number;
  inferenceReasons: string[];
  candidateGenres?: { genre: Genre; confidence: number }[];
  override?: { field: string; from: string; to: string; cue: string } | null;
}

export function resolveGenre(
  profile: ReaderProfile | null | undefined,
  notes: ExtractedNotes,
  message: string
): GenreResolution {
  // 1. Explicit contradiction in prompt takes precedence over form
  if (notes.explicitOverride && notes.explicitOverride.field === "genre") {
    const targetGenre = notes.explicitOverride.to.toLowerCase() as Genre;
    if (GENRES.includes(targetGenre)) {
      return {
        genres: [targetGenre],
        genreSource: "message",
        genreConfidence: 0.95,
        inferenceReasons: [`Using ${targetGenre} from your note instead of ${notes.explicitOverride.from}`],
        override: notes.explicitOverride,
      };
    }
  }

  // 2. Genre chosen in the form
  if (profile && profile.genres.length > 0) {
    return {
      genres: profile.genres,
      genreSource: "form",
      genreConfidence: 1.0,
      inferenceReasons: ["Selected directly in reading profile"],
    };
  }

  // 3. "Not sure" -> compute affinity(g)
  const candidateScores: { genre: Genre; score: number; reasons: string[] }[] = [];
  const lowerMsg = (message || "").toLowerCase();

  const userMoods = profile?.moods || [];
  const userPlot = profile?.plot || "any";
  const userPlotComplexity = PLOT_TO_COMPLEXITY[userPlot];
  const lovedReads = (profile?.pastReads || []).filter((pr) => pr.opinion === "loved");

  // Distinct primary genres to evaluate
  const evaluationGenres: Genre[] = [
    "romance",
    "thriller",
    "mystery",
    "horror",
    "fantasy",
    "sci-fi",
    "action-adventure",
    "classics",
    "non-fiction",
    "self-help",
  ];

  for (const g of evaluationGenres) {
    const prof = GENRE_PROFILE[g] || GENRE_PROFILE["fiction"];
    const reasons: string[] = [];

    // Mood Fit (0.35)
    let moodScore = 0.5;
    if (userMoods.length > 0) {
      const matchCount = userMoods.filter((m) => prof.moods.includes(m)).length;
      moodScore = matchCount / userMoods.length;
      if (matchCount > 0) {
        reasons.push(`${userMoods.join(", ")} mood`);
      }
    }

    // Prompt Fit (0.25)
    let promptScore = 0;
    if (notes.genreGuess?.genre === g) {
      promptScore = notes.genreGuess.confidence;
      reasons.push("your message describes this genre");
    } else if (prof.keywords.some((kw) => lowerMsg.includes(kw))) {
      promptScore = 0.8;
      reasons.push("key themes in your prompt");
    }

    // Past Read Fit (0.25)
    let pastReadScore = 0.5;
    if (lovedReads.length > 0) {
      // Heuristic match if loved books mention keywords
      const lovedMatches = lovedReads.filter((pr) =>
        prof.keywords.some(
          (kw) =>
            pr.title.toLowerCase().includes(kw) ||
            pr.author.toLowerCase().includes(kw)
        )
      );
      if (lovedMatches.length > 0) {
        pastReadScore = 0.9;
        reasons.push(`loved ${lovedMatches[0].title}`);
      } else {
        pastReadScore = 0.4;
      }
    }

    // Complexity Fit (0.15)
    let complexityScore = 0.7;
    if (userPlotComplexity) {
      const [userMin, userMax] = userPlotComplexity;
      const [typMin, typMax] = prof.typicalComplexity;
      const overlaps = Math.max(0, Math.min(userMax, typMax) - Math.max(userMin, typMin) + 1);
      complexityScore = overlaps > 0 ? 1.0 : 0.4;
      if (overlaps > 0 && userPlot !== "any") {
        reasons.push(`${userPlot} plot structure`);
      }
    }

    const affinity =
      0.35 * moodScore +
      0.25 * promptScore +
      0.25 * pastReadScore +
      0.15 * complexityScore;

    candidateScores.push({ genre: g, score: affinity, reasons });
  }

  candidateScores.sort((a, b) => b.score - a.score);

  const top = candidateScores[0];
  const second = candidateScores[1];

  // High confidence auto-selection: score >= 0.5 and lead >= 0.1
  const isConfident = top && (!second || top.score - second.score >= 0.08) && top.score >= 0.45;

  return {
    genres: [top.genre],
    genreSource: "inferred",
    genreConfidence: Math.min(1.0, Number(top.score.toFixed(2))),
    inferenceReasons: top.reasons.length > 0 ? top.reasons : ["Matches overall profile tone"],
    candidateGenres: candidateScores.slice(0, 3).map((c) => ({
      genre: c.genre,
      confidence: Number(c.score.toFixed(2)),
    })),
  };
}
