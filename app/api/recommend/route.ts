import { NextRequest } from "next/server";
import { RecommendRequestSchema } from "@/lib/schemas";
import { parsePreferences } from "@/lib/chains/parsePreferences";
import { generateStructuredExplanation } from "@/lib/chains/explainRecommendations";
import { buildReaderContext, type ReaderContext } from "@/lib/profile/context";
import { buildMatchFacts } from "@/lib/scoring/matchFacts";
import { searchCatalog, getDynamicReadingLadder } from "@/lib/retrieval/catalog";
import {
  scoreBookDetailed,
  cosineSimilarity,
  maximalMarginalRelevance,
  type ScoringInput,
} from "@/lib/scoring/score";
import { getEmbeddingsModel } from "@/lib/llm";
import { checkRateLimit } from "@/lib/ratelimit";
import { formatSSE } from "@/lib/utils";
import { supabase } from "@/lib/db/supabase";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import type { Book } from "@/lib/schemas";
import type { RetrievalStats } from "@/lib/retrieval/catalog";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const isDebug = request.nextUrl.searchParams.get("debug") === "1" && process.env.NODE_ENV !== "production";
  const debugStages: {
    stage1_rawRequest: Record<string, unknown>;
    stage2_parsedPreferences: Record<string, unknown> | null;
    stage3_finalMergedPreferences: Record<string, unknown> | null;
    stage4_candidateRetrieval: RetrievalStats | null;
    stage5_scoreBreakdown: Record<string, unknown>[];
    stage6_finalBookIds: string[];
  } = {
    stage1_rawRequest: {},
    stage2_parsedPreferences: null,
    stage3_finalMergedPreferences: null,
    stage4_candidateRetrieval: null,
    stage5_scoreBreakdown: [],
    stage6_finalBookIds: [],
  };
  try {
    // Get client IP for rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anonymous";

    // Authenticate user via Supabase server client
    const serverSupabase = await createServerSupabase();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    const targetUserId = user?.id || null;

    // Check rate limit
    const rateLimitKey = targetUserId ? `user:${targetUserId}` : ip;
    const rateLimit = await checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error:
            "Too many requests. Please wait a moment before trying again.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.retryAfter ?? 60),
          },
        }
      );
    }

    // Parse and validate request body
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(
        JSON.stringify({ error: "Malformed request body. JSON object expected." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsed = RecommendRequestSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError =
        Object.entries(fieldErrors).map(([field, errs]) => `${field}: ${errs?.join(", ")}`)[0] ||
        "Invalid request parameters";

      return new Response(
        JSON.stringify({
          error: firstError,
          details: fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { profile, message, genre, level, email, chatId, excludeBookIds = [] } = parsed.data;
    const targetEmail = user?.email || (email ? email.toLowerCase().trim() : null);

    // Stage 1: Raw request
    debugStages.stage1_rawRequest = { profile, message, genre, level, email, chatId, excludeBookIds };
    console.log("[STAGE 1: Raw Request]", debugStages.stage1_rawRequest);

    // Start SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stage 2 & 3: Build ReaderContext from questionnaire profile + user prompt (Workstream B)
          const effectiveProfile = profile || {
            genres: genre ? [genre] : [],
            level: level || "beginner",
            length: "any" as const,
            plot: "any" as const,
            moods: [],
            heatLevel: "any" as const,
            pastReads: [],
          };

          const readerContext = await buildReaderContext(effectiveProfile, message, excludeBookIds);

          // Stream context immediately so UI gets inference and overrides
          controller.enqueue(encoder.encode(formatSSE("context", readerContext)));

          const preferences = {
            genres: readerContext.genres,
            subGenres: readerContext.subGenres,
            level: readerContext.level,
            heatLevel: readerContext.heatLevel !== "any" ? readerContext.heatLevel : null,
            maxPages: readerContext.length ? readerContext.length.max : null,
            mood: readerContext.moods,
            similarTo: readerContext.similarTo.map((pr) => pr.title),
            avoid: readerContext.avoid,
            targetBookQuery: readerContext.targetBookQuery || undefined,
          };

          let notice: string | null = null;
          if (readerContext.overrides.length > 0) {
            notice = readerContext.overrides
              .map((o) => `Using ${o.to} from your message instead of ${o.from}.`)
              .join(" ");
          }

          debugStages.stage2_parsedPreferences = {
            readerContext,
            preferences,
          };
          debugStages.stage3_finalMergedPreferences = { ...preferences };
          console.log("[STAGE 2: Reader Context]", debugStages.stage2_parsedPreferences);
          console.log("[STAGE 3: Merged Preferences]", debugStages.stage3_finalMergedPreferences);

          // Stage 4: Candidate retrieval
          const statsCollector: RetrievalStats = {
            sqlCount: 0,
            vectorCount: 0,
            googleBooksCount: 0,
            total: 0,
            errors: [],
          };

          const candidates = await searchCatalog(preferences, 15, message, statsCollector);
          debugStages.stage4_candidateRetrieval = statsCollector;
          console.log("[STAGE 4: Candidate Retrieval]", statsCollector);

          if (candidates.length === 0) {
            controller.enqueue(
              encoder.encode(
                formatSSE("error", "No books found matching your preferences. Try broadening your search!")
              )
            );
            if (isDebug) {
              controller.enqueue(encoder.encode(formatSSE("debug", debugStages)));
            }
            controller.enqueue(encoder.encode(formatSSE("done", null)));
            controller.close();
            return;
          }

          // Stage 5: Per-candidate score breakdown with real semantic similarity & MMR diversity
          let queryEmbedding: number[] | null = readerContext.tasteVector ?? null;
          if (!queryEmbedding) {
            try {
              const embeddings = getEmbeddingsModel();
              const queryParts = [
                message,
                preferences.genres.join(" "),
                (preferences.subGenres || []).join(" "),
                (preferences.mood || []).join(" "),
                (preferences.similarTo || []).join(" "),
              ].filter(Boolean);
              queryEmbedding = await embeddings.embedQuery(queryParts.join(" "));
            } catch (embedErr) {
              console.warn("[STAGE 5: Query embedding failed, using fallback similarity]", embedErr);
            }
          }

          const scoredCandidates: Book[] = candidates.map((book) => {
            let semanticSimilarity = 0.5;
            if (queryEmbedding && book.embedding && book.embedding.length > 0) {
              semanticSimilarity = Math.max(0, cosineSimilarity(queryEmbedding, book.embedding));
            } else if (preferences.mood.length > 0 || (preferences.subGenres && preferences.subGenres.length > 0)) {
              // Heuristic when vector embedding not available
              const matchesMood = (book.tone || []).some((t) =>
                preferences.mood.concat(preferences.subGenres || []).some((m) =>
                  t.toLowerCase().includes(m.toLowerCase())
                )
              );
              semanticSimilarity = matchesMood ? 0.75 : 0.45;
            }

            const isExcluded = excludeBookIds.includes(book.id);
            const isDislikedAuthor = Boolean(
              book.author && readerContext.dislikedAuthors.includes(book.author.toLowerCase().trim())
            );
            const isConfirmedBothSources = Boolean(
              book.sources?.includes("google") && book.sources?.includes("openlibrary")
            );

            const input: ScoringInput = {
              bookLevel: book.level,
              bookGenres: book.genres,
              bookPageCount: book.pageCount,
              bookAvgRating: book.avgRating,
              bookTone: book.tone,
              bookComplexity: book.complexity,
              semanticSimilarity,
              targetLevel: readerContext.level,
              targetGenres: readerContext.genres,
              avoidList: readerContext.avoid,
              targetSubGenres: readerContext.subGenres,
              targetMood: readerContext.moods,
              targetComplexityRange: readerContext.complexityRange,
              targetLengthRange: readerContext.length,
              heatLevel: readerContext.heatLevel,
              isExcluded,
              isDislikedAuthor,
              isConfirmedBothSources,
            };
            const breakdown = scoreBookDetailed(input);
            let score = breakdown.total;

            // If the user was asking specifically about this book title, prioritize it to the top!
            if (
              preferences.targetBookQuery &&
              book.title.toLowerCase().includes(preferences.targetBookQuery.toLowerCase())
            ) {
              score = Math.max(score, 0.98);
            }

            debugStages.stage5_scoreBreakdown.push({
              bookId: book.id,
              title: book.title,
              breakdown,
              finalScore: score,
            });

            const matchFacts = buildMatchFacts(book, readerContext);
            return { ...book, score, matchFacts };
          });

          // Sort by score descending and take top 15 candidates
          const topCandidates = [...scoredCandidates]
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
            .slice(0, 15);

          // Apply MMR (lambda = 0.7) for diverse selection of 3-5 books
          const targetCount = Math.min(5, Math.max(3, topCandidates.length));
          const scoredBooks: Book[] = maximalMarginalRelevance(topCandidates, targetCount, 0.7);

          // Stage 6: Final list of book IDs
          debugStages.stage6_finalBookIds = scoredBooks.map((b) => b.id);
          console.log("[STAGE 5: Score Breakdown Count]", debugStages.stage5_scoreBreakdown.length);
          console.log("[STAGE 6: Final Book IDs]", debugStages.stage6_finalBookIds);

          if (isDebug) {
            controller.enqueue(encoder.encode(formatSSE("debug", debugStages)));
          }

          // [4] Get dynamic reading ladder (Task 6)
          const primaryGenre = preferences.genres[0] || "fiction";
          let ladderSteps: { step: number; book: Book; note: string }[] = [];
          try {
            ladderSteps = await getDynamicReadingLadder(candidates, preferences.level, primaryGenre);
            if (ladderSteps.length > 0) {
              controller.enqueue(encoder.encode(formatSSE("ladder", ladderSteps)));
            }
          } catch (ladderErr) {
            console.warn("[STAGE 4: Dynamic ladder error]", ladderErr);
          }

          // Send honest notice banner (Task 2 & 5)
          let fullNotice: string | null = notice;
          if (preferences.heatLevel === "steamy") {
            const hasSteamy = scoredBooks.some(
              (b) => (b.tone || []).includes("steamy") || (b.tone || []).includes("spicy")
            );
            if (!hasSteamy) {
              const steamyNote = "No steamy books found in the current selection, showing the closest romance matches.";
              fullNotice = fullNotice ? `${fullNotice} ${steamyNote}` : steamyNote;
            }
          }

          if (fullNotice) {
            controller.enqueue(encoder.encode(formatSSE("notice", fullNotice)));
          }

          // [5] Generate structured explanations & stream clean prose (Task 5)
          const structuredExplanation = await generateStructuredExplanation(
            scoredBooks,
            preferences,
            message,
            fullNotice
          );

          // Enrich books with structured whyItFits & whyThisLevel
          const explanationMap = new Map((structuredExplanation.books || []).map((eb) => [eb.bookId, eb]));
          const enrichedBooks: Book[] = scoredBooks.map((b) => {
            const eb = explanationMap.get(b.id);
            if (eb) {
              return {
                ...b,
                whyItFits: eb.whyItFits,
                whyThisLevel: eb.whyThisLevel,
                watchOut: eb.watchOut,
              };
            }
            return b;
          });

          // Send book cards with rich structured explanations
          controller.enqueue(encoder.encode(formatSSE("books", enrichedBooks)));

          // Stream clean summary text without raw markdown asterisks
          let fullExplanation = "";
          const summaryWords = structuredExplanation.summary.split(" ");
          for (let i = 0; i < summaryWords.length; i += 4) {
            const chunk = summaryWords.slice(i, i + 4).join(" ") + (i + 4 < summaryWords.length ? " " : "");
            fullExplanation += chunk;
            controller.enqueue(encoder.encode(formatSSE("text", chunk)));
          }

          // Save chat session if user is logged in
          if (targetEmail || targetUserId) {
            try {
              const chatTitle =
                preferences.targetBookQuery
                  ? `About "${preferences.targetBookQuery}"`
                  : message.length > 40
                  ? message.slice(0, 37) + "..."
                  : message || `${primaryGenre.replace("-", " ")} recommendations`;

              const currentTurn = {
                id: crypto.randomUUID(),
                userMessage: message,
                genre: primaryGenre,
                level: preferences.level,
                profile: effectiveProfile,
                context: readerContext,
                books: scoredBooks,
                ladder: ladderSteps,
                explanation: fullExplanation,
                createdAt: new Date().toISOString(),
              };

              if (chatId) {
                // Fetch previous turns to extend the conversation rather than overwriting
                let query = supabase
                  .from("user_chats")
                  .select("messages, user_message, books, ladder, explanation, created_at, genre, level")
                  .eq("id", chatId);
                if (targetUserId) {
                  query = query.eq("user_id", targetUserId);
                } else if (targetEmail) {
                  query = query.eq("email", targetEmail.toLowerCase().trim());
                }
                const { data: existingChat } = await query.single();

                let turns: Record<string, unknown>[] = [];
                if (
                  existingChat?.messages &&
                  Array.isArray(existingChat.messages) &&
                  existingChat.messages.length > 0
                ) {
                  turns = [...(existingChat.messages as Record<string, unknown>[])];
                } else if (existingChat?.user_message) {
                  turns = [
                    {
                      id: crypto.randomUUID(),
                      userMessage: existingChat.user_message,
                      genre: existingChat.genre,
                      level: existingChat.level,
                      books: existingChat.books || [],
                      ladder: existingChat.ladder || [],
                      explanation: existingChat.explanation || "",
                      createdAt: existingChat.created_at || new Date().toISOString(),
                    },
                  ];
                }

                turns.push(currentTurn);

                // Keep the last 6 turns (preserves 3-4+ prompts in each chat)
                if (turns.length > 6) {
                  turns = turns.slice(-6);
                }

                let updateQuery = supabase
                  .from("user_chats")
                  .update({
                    user_message: message,
                    books: scoredBooks,
                    ladder: ladderSteps,
                    explanation: fullExplanation,
                    messages: turns,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", chatId);
                if (targetUserId) {
                  updateQuery = updateQuery.eq("user_id", targetUserId);
                } else if (targetEmail) {
                  updateQuery = updateQuery.eq("email", targetEmail.toLowerCase().trim());
                }
                const { error: updateError } = await updateQuery;

                if (updateError) {
                  // Fallback without messages column if schema not yet migrated
                  let fallbackUpdate = supabase
                    .from("user_chats")
                    .update({
                      user_message: message,
                      books: scoredBooks,
                      ladder: ladderSteps,
                      explanation: fullExplanation,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", chatId);
                  if (targetUserId) {
                    fallbackUpdate = fallbackUpdate.eq("user_id", targetUserId);
                  } else if (targetEmail) {
                    fallbackUpdate = fallbackUpdate.eq("email", targetEmail.toLowerCase().trim());
                  }
                  await fallbackUpdate;
                }
              } else {
                const { data: savedChat, error: insertError } = await supabase
                  .from("user_chats")
                  .insert({
                    email: targetEmail ? targetEmail.toLowerCase().trim() : null,
                    user_id: targetUserId || null,
                    title: chatTitle,
                    genre: primaryGenre,
                    level: preferences.level,
                    user_message: message,
                    books: scoredBooks,
                    ladder: ladderSteps,
                    explanation: fullExplanation,
                    messages: [currentTurn],
                  })
                  .select("id")
                  .single();

                let activeId = savedChat?.id;

                if (insertError) {
                  // Fallback without messages column if schema not yet migrated
                  const { data: fallbackChat } = await supabase
                    .from("user_chats")
                    .insert({
                      email: targetEmail ? targetEmail.toLowerCase().trim() : null,
                      user_id: targetUserId || null,
                      title: chatTitle,
                      genre: primaryGenre,
                      level: preferences.level,
                      user_message: message,
                      books: scoredBooks,
                      ladder: ladderSteps,
                      explanation: fullExplanation,
                    })
                    .select("id")
                    .single();

                  activeId = fallbackChat?.id;
                }

                if (activeId) {
                  controller.enqueue(
                    encoder.encode(formatSSE("chatId", activeId))
                  );
                }
              }
            } catch (err) {
              console.error("Failed to persist user chat:", err);
            }
          }

          // Log query (no personal data)
          await supabase.from("queries_log").insert({
            genre: primaryGenre,
            level: preferences.level,
          });

          controller.enqueue(encoder.encode(formatSSE("done", null)));
          controller.close();
        } catch (error) {
          console.error("Pipeline error:", error);
          controller.enqueue(
            encoder.encode(
              formatSSE(
                "error",
                "Something went wrong generating your recommendations. Please try again."
              )
            )
          );
          controller.enqueue(encoder.encode(formatSSE("done", null)));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-RateLimit-Remaining": String(rateLimit.remaining ?? "unknown"),
      },
    });
  } catch (error) {
    console.error("Request error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
