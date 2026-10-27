import "server-only";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { env } from "@/lib/env";

/**
 * Gemini chat model — used for preference parsing and explanations.
 * Server-only: never import from client components.
 */
export function getChatModel(options?: {
  maxOutputTokens?: number;
  temperature?: number;
}) {
  return new ChatGoogleGenerativeAI({
    model: env.GEMINI_MODEL,
    apiKey: env.GOOGLE_API_KEY,
    maxOutputTokens: options?.maxOutputTokens ?? 2048,
    temperature: options?.temperature ?? 0.3,
  });
}

export const getLLM = getChatModel;

/**
 * Gemini embeddings model — used for semantic search.
 * Dimension MUST match the vector(768) in schema.sql.
 */
export function getEmbeddingsModel() {
  return new GoogleGenerativeAIEmbeddings({
    model: env.GEMINI_EMBEDDING_MODEL,
    apiKey: env.GOOGLE_API_KEY,
    outputDimensionality: 768,
  });
}
