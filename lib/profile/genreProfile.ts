import type { Genre } from "@/lib/schemas";

export interface GenreProfileInfo {
  moods: string[];
  typicalComplexity: [number, number];
  keywords: string[];
}

export const GENRE_PROFILE: Record<string, GenreProfileInfo> = {
  romance: {
    moods: ["light-hearted", "emotional", "funny"],
    typicalComplexity: [1, 3],
    keywords: ["love", "romance", "dating", "couple", "banter", "chemistry", "heart"],
  },
  thriller: {
    moods: ["suspenseful", "dark"],
    typicalComplexity: [2, 4],
    keywords: ["suspense", "danger", "investigation", "crime", "killer", "hunt", "twist"],
  },
  mystery: {
    moods: ["suspenseful", "thought-provoking"],
    typicalComplexity: [2, 4],
    keywords: ["whodunit", "detective", "clue", "murder", "puzzle", "secrets"],
  },
  horror: {
    moods: ["dark", "suspenseful"],
    typicalComplexity: [1, 4],
    keywords: ["scary", "ghost", "spooky", "monsters", "fear", "dread", "haunted"],
  },
  fantasy: {
    moods: ["inspiring", "thought-provoking"],
    typicalComplexity: [2, 5],
    keywords: ["magic", "kingdom", "dragons", "quest", "epic", "lore", "swords"],
  },
  "sci-fi": {
    moods: ["thought-provoking", "inspiring"],
    typicalComplexity: [3, 5],
    keywords: ["space", "future", "aliens", "technology", "physics", "galaxy", "time"],
  },
  "action-adventure": {
    moods: ["suspenseful", "inspiring"],
    typicalComplexity: [1, 3],
    keywords: ["action", "adventure", "journey", "survival", "peril", "treasure"],
  },
  "action/adventure": {
    moods: ["suspenseful", "inspiring"],
    typicalComplexity: [1, 3],
    keywords: ["action", "adventure", "journey", "survival", "peril", "treasure"],
  },
  classics: {
    moods: ["thought-provoking", "emotional"],
    typicalComplexity: [3, 5],
    keywords: ["literature", "period", "19th century", "heritage", "timeless", "classic"],
  },
  "non-fiction": {
    moods: ["thought-provoking", "inspiring"],
    typicalComplexity: [2, 4],
    keywords: ["history", "biography", "science", "facts", "true story", "society"],
  },
  "self-help": {
    moods: ["inspiring"],
    typicalComplexity: [1, 2],
    keywords: ["habits", "productivity", "mindset", "discipline", "growth", "success"],
  },
  "motivational/self-help": {
    moods: ["inspiring"],
    typicalComplexity: [1, 2],
    keywords: ["habits", "productivity", "mindset", "discipline", "growth", "success"],
  },
};
