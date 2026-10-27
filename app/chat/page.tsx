"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Compass,
  BookOpen,
  PanelLeft,
  Plus,
  ArrowRight,
  AlertCircle,
  Sparkles,
  LogOut,
  User,
  Info,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/client";
import { BookCard, BookCardSkeleton } from "@/components/BookCard";
import { ReadingLadder } from "@/components/ReadingLadder";
import { ChatStream } from "@/components/ChatStream";
import { ChatSidebar, type UserChat, type ChatTurn } from "@/components/ChatSidebar";
import { ReaderProfileForm } from "@/components/ReaderProfileForm";
import { ProfileSummaryBar } from "@/components/ProfileSummaryBar";
import { GenreInferenceCard } from "@/components/GenreInferenceCard";
import type { ReaderProfile, ReaderContext } from "@/lib/schemas";
import type { Book, LadderStep, Genre, Level } from "@/lib/schemas";

function subscribeToEmail(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("bookcompass_auth_change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("bookcompass_auth_change", callback);
  };
}

function getEmailSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bookcompass_user_email");
}

function getEmailServerSnapshot(): string | null {
  return null;
}

const GENRE_OPTIONS: { value: Genre; label: string }[] = [
  { value: "sci-fi", label: "Sci-Fi" },
  { value: "thriller", label: "Thriller" },
  { value: "romance", label: "Romance" },
  { value: "fantasy", label: "Fantasy" },
  { value: "mystery", label: "Mystery" },
  { value: "horror", label: "Horror" },
  { value: "action/adventure", label: "Action & Adventure" },
  { value: "non-fiction", label: "Non-Fiction" },
  { value: "classics", label: "Classics" },
  { value: "motivational/self-help", label: "Self-Help" },
];

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const CHAT_QUICK_PROMPTS = [
  { label: "Rom-com with witty banter", query: "Delightful rom-com with witty banter and slow-burn chemistry", genre: "romance" as Genre },
  { label: "Psychological thriller twist", query: "Fast-paced psychological thriller with unreliable narrator and shocking twist", genre: "thriller" as Genre },
  { label: "Hard sci-fi & space physics", query: "Realistic hard sci-fi exploring space physics, exploration, and first contact", genre: "sci-fi" as Genre },
  { label: "Deep psychology & human nature", query: "Engaging non-fiction exploring human behavior, psychology, and decision making", genre: "non-fiction" as Genre },
  { label: "Epic immersive fantasy", query: "Immersive fantasy with rich worldbuilding and intricate magic system", genre: "fantasy" as Genre },
  { label: "Cozy rainy-day mystery", query: "Cozy murder mystery set in a small English village or bookshop", genre: "mystery" as Genre },
];

function ChatAppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<{
    message: string;
    genre?: Genre;
    level?: Level;
  } | null>(null);

  const [books, setBooks] = useState<Book[]>([]);
  const [ladder, setLadder] = useState<LadderStep[]>([]);
  const [streamText, setStreamText] = useState("");
  const [streamNotice, setStreamNotice] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supabase] = useState(() => createClient());
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);
  const userEmail = currentUser?.email ?? null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUser({ id: user.id, email: user.email });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({ id: session.user.id, email: session.user.email });
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ReaderProfile | null>(null);
  const [currentContext, setCurrentContext] = useState<ReaderContext | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [chatHistory, setChatHistory] = useState<UserChat[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [inputMessage, setInputMessage] = useState(() => searchParams.get("q") || "");
  const [selectedGenre, setSelectedGenre] = useState<Genre | undefined>(
    () => (searchParams.get("genre") as Genre) || undefined
  );
  const [selectedLevel, setSelectedLevel] = useState<Level | undefined>(
    () => (searchParams.get("level") as Level) || undefined
  );
  const [showOptions, setShowOptions] = useState(false);

  const resultsEndRef = useRef<HTMLDivElement>(null);
  const hasHandledInitialQuery = useRef(false);

  // Fetch chat history on userEmail change
  useEffect(() => {
    let ignore = false;
    if (!userEmail) return;

    fetch('/api/chats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore && data?.chats) {
          setChatHistory(data.chats);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch chats:", err);
      });

    return () => {
      ignore = true;
    };
  }, [userEmail]);

  const fetchChats = useCallback(async (email: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/chats');
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.chats || []);
      }
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // When user logs out, clear localStorage and redirect to landing page (/)
  const handleLogout = () => {
    localStorage.removeItem("bookcompass_user_email");
    window.dispatchEvent(new Event("bookcompass_auth_change"));
    setChatHistory([]);
    router.push("/");
  };

  const handleSelectChat = (chat: UserChat) => {
    setActiveChatId(chat.id);
    let loadedTurns: ChatTurn[] = [];

    if (chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0) {
      loadedTurns = chat.messages;
    } else if (chat.user_message) {
      loadedTurns = [
        {
          id: chat.id,
          userMessage: chat.user_message,
          genre: chat.genre,
          level: chat.level,
          books: chat.books || [],
          ladder: chat.ladder || [],
          explanation: chat.explanation || "",
          createdAt: chat.created_at,
        },
      ];
    }

    setTurns(loadedTurns);
    const lastTurnWithProfile = [...loadedTurns].reverse().find((t) => t.profile);
    if (lastTurnWithProfile?.profile) {
      setCurrentProfile(lastTurnWithProfile.profile);
    }
    const lastTurnWithContext = [...loadedTurns].reverse().find((t) => t.context);
    if (lastTurnWithContext?.context) {
      setCurrentContext(lastTurnWithContext.context);
    }
    setCurrentPrompt(null);
    setBooks([]);
    setLadder([]);
    setStreamText("");
    setError(null);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setTurns([]);
    setCurrentPrompt(null);
    setBooks([]);
    setLadder([]);
    setStreamText("");
    setStreamNotice(null);
    setCurrentProfile(null);
    setCurrentContext(null);
    setIsEditingProfile(false);
    setError(null);
  };

  const handleDeleteChat = async (id: string) => {
    if (!userEmail) return;
    try {
      await fetch("/api/chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setChatHistory((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        handleNewChat();
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    if (!userEmail) return;
    try {
      const res = await fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: newTitle }),
      });
      if (res.ok) {
        setChatHistory((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        );
      }
    } catch (err) {
      console.error("Failed to rename chat:", err);
    }
  };

  const handleRecommend = useCallback(
    async (payload: { message: string; genre?: Genre; level?: Level; profile?: ReaderProfile }) => {
      setIsLoading(true);
      setIsStreaming(true);
      setError(null);
      setCurrentPrompt(payload);
      setBooks([]);
      setLadder([]);
      setStreamText("");
      setStreamNotice(null);

      let latestBooks: Book[] = [];
      let latestLadder: LadderStep[] = [];
      let latestNotice: string | null = null;
      let latestContext: ReaderContext | null = null;
      let accumulatedText = "";

      try {
        const seenBookIds = Array.from(
          new Set(
            turns.flatMap((t) => (t.books ? t.books.map((b) => b.id) : []))
          )
        );

        const effectiveProfile = payload.profile || currentProfile;
        const payloadToSend = {
          message: payload.message.trim(),
          ...(effectiveProfile ? { profile: effectiveProfile } : {}),
          ...(payload.genre ? { genre: payload.genre } : {}),
          ...(payload.level ? { level: payload.level } : {}),
          ...(userEmail?.trim() ? { email: userEmail.trim().toLowerCase() } : {}),
          ...(activeChatId ? { chatId: activeChatId } : {}),
          ...(seenBookIds.length > 0 ? { excludeBookIds: seenBookIds } : {}),
        };

        const response = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadToSend),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          if (response.status === 429) {
            throw new Error(
              data.error || "Rate limit reached. Please wait a minute and try again."
            );
          }
          throw new Error(data.error || `Request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body received from server.");
        }

        setIsLoading(false);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            let eventType = "";
            let dataText = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataText = line.slice(6).trim();
              }
            }

            if (eventType && dataText) {
              try {
                const parsedData = JSON.parse(dataText);

                if (eventType === "context") {
                  latestContext = parsedData as ReaderContext;
                  setCurrentContext(latestContext);
                  if (!currentProfile && latestContext) {
                    setCurrentProfile({
                      genres: latestContext.genres.slice(0, 2),
                      level: latestContext.level,
                      length: "any",
                      plot: "any",
                      moods: latestContext.moods.slice(0, 3) as any,
                      heatLevel: latestContext.heatLevel,
                      pastReads: latestContext.similarTo,
                    });
                  }
                } else if (eventType === "books") {
                  latestBooks = parsedData as Book[];
                  setBooks(latestBooks);
                } else if (eventType === "ladder") {
                  latestLadder = parsedData as LadderStep[];
                  setLadder(latestLadder);
                } else if (eventType === "notice") {
                  latestNotice = typeof parsedData === "string" ? parsedData : String(parsedData);
                  setStreamNotice(latestNotice);
                } else if (eventType === "text") {
                  accumulatedText += parsedData;
                  setStreamText(accumulatedText);
                } else if (eventType === "chatId") {
                  setActiveChatId(parsedData);
                  if (userEmail) fetchChats(userEmail);
                } else if (eventType === "error") {
                  setError(typeof parsedData === "string" ? parsedData : "An error occurred.");
                } else if (eventType === "done") {
                  setIsStreaming(false);

                  // Keep 3 to 4+ turns in active chat history
                  const finishedTurn: ChatTurn = {
                    id: crypto.randomUUID(),
                    userMessage: payload.message.trim(),
                    genre: payload.genre,
                    level: payload.level,
                    notice: latestNotice,
                    profile: effectiveProfile,
                    context: latestContext,
                    books: latestBooks,
                    ladder: latestLadder,
                    explanation: accumulatedText,
                    createdAt: new Date().toISOString(),
                  };

                  setTurns((prev) => {
                    const updated = [...prev, finishedTurn];
                    return updated.slice(-6);
                  });

                  setCurrentPrompt(null);
                  setBooks([]);
                  setLadder([]);
                  setStreamText("");
                  setStreamNotice(null);

                  if (userEmail) fetchChats(userEmail);
                }
              } catch {
                if (eventType === "text") {
                  accumulatedText += dataText;
                  setStreamText(accumulatedText);
                }
              }
            }
          }
        }
      } catch (err: unknown) {
        console.error("Recommendation stream error:", err);
        const msg =
          err instanceof Error ? err.message : "Failed to generate recommendations. Please retry.";
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [userEmail, activeChatId, fetchChats]
  );

  // Auto-trigger if query was passed in URL from landing page
  useEffect(() => {
    if (hasHandledInitialQuery.current) return;
    const q = searchParams.get("q");
    const g = (searchParams.get("genre") as Genre) || undefined;
    const l = (searchParams.get("level") as Level) || undefined;

    if (q && q.trim()) {
      hasHandledInitialQuery.current = true;
      const timer = setTimeout(() => {
        void handleRecommend({ message: q.trim(), genre: g, level: l });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [searchParams, handleRecommend]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading || isStreaming) return;
    const msg = inputMessage.trim();
    setInputMessage("");
    handleRecommend({
      message: msg,
      genre: selectedGenre,
      level: selectedLevel,
    });
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground transition-colors duration-200">
      {/* Dynamic Left Vertical Sidebar */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chats={chatHistory}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        isLoading={isLoadingHistory}
        userEmail={userEmail}
        onOpenAuth={() => router.push("/login")}
        onLogout={handleLogout}
      />

      {/* Main Chat Workspace */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isSidebarOpen ? "md:pl-72 sm:md:pl-80" : "pl-0"
        }`}
      >
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-all cursor-pointer shadow-2xs"
                title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
                aria-label="Toggle chat sidebar"
              >
                <PanelLeft size={16} className="text-primary" />
                <span className="hidden sm:inline font-semibold">Chats</span>
                {userEmail && chatHistory.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                    {chatHistory.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleNewChat}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-all cursor-pointer"
                title="Start a new chat"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New Chat</span>
              </button>

              <Link href="/" className="flex items-center gap-2 pl-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Compass size={17} />
                </div>
                <span className="font-bold text-base tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  BookCompass
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />

              {userEmail ? (
                <div className="flex items-center gap-2">
                  <span
                    className="hidden sm:inline-block max-w-[150px] truncate text-xs text-muted-foreground font-mono"
                    title={userEmail}
                  >
                    {userEmail}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Log out and return to landing page"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-xs font-medium text-foreground transition-all cursor-pointer"
                  >
                    <LogOut size={13} />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/10 hover:bg-primary/20 text-xs font-medium text-primary transition-all cursor-pointer"
                >
                  <User size={13} />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* Chat Feed */}
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col justify-between">
          <div className="space-y-8 flex-1">
            {/* Error Notification */}
            {error && (
              <div className="p-4 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Unable to fetch recommendations</p>
                  <p className="mt-0.5 opacity-90">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-xs underline hover:opacity-80 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Active Profile Summary Bar & Edit form */}
            {currentProfile && !isEditingProfile && (
              <ProfileSummaryBar
                profile={currentProfile}
                onEdit={() => setIsEditingProfile(true)}
              />
            )}

            {isEditingProfile && (
              <div className="p-4 rounded-2xl border border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground text-sm">Edit Reading Profile</h3>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <ReaderProfileForm
                  initialProfile={currentProfile ?? undefined}
                  initialMessage={inputMessage}
                  onSubmit={({ profile, message }) => {
                    setCurrentProfile(profile);
                    setIsEditingProfile(false);
                    handleRecommend({ message, profile });
                  }}
                  isLoading={isLoading || isStreaming}
                  onCancelEdit={() => setIsEditingProfile(false)}
                />
              </div>
            )}

            {/* Empty Greeting State */}
            {turns.length === 0 && !isLoading && !isStreaming && !currentPrompt && !currentProfile && !isEditingProfile && (
              <div className="py-6 space-y-6 max-w-2xl mx-auto">
                <div className="text-center space-y-2">
                  <div className="size-10 mx-auto rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Sparkles size={20} />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Build Your Reading Profile
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Answer 3 quick questions so we can match books to your exact reading level, length, and taste.
                  </p>
                </div>

                <ReaderProfileForm
                  initialMessage={inputMessage}
                  onSubmit={({ profile, message }) => {
                    setCurrentProfile(profile);
                    setIsEditingProfile(false);
                    handleRecommend({ message, profile });
                  }}
                  isLoading={isLoading || isStreaming}
                />

                <div className="pt-2 space-y-2 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Or try a popular prompt:
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {CHAT_QUICK_PROMPTS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setInputMessage(p.query);
                          setSelectedGenre(p.genre);
                          handleRecommend({ message: p.query, genre: p.genre, level: selectedLevel });
                        }}
                        className="px-3.5 py-1.5 rounded-full border border-border bg-card/80 hover:bg-muted text-xs font-medium text-foreground transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Prior Conversation Turns (keeps 3-4+ prompts in active thread) */}
            {turns.map((turn, tIdx) => (
              <div key={turn.id || tIdx} className="space-y-6 pt-6 border-t border-border/60 first:border-0 first:pt-0">
                {/* User Prompt */}
                <div className="flex items-start justify-end">
                  <div className="max-w-2xl p-4 rounded-2xl rounded-tr-xs bg-primary text-primary-foreground shadow-xs space-y-1">
                    <div className="flex items-center justify-end gap-2 text-[11px] opacity-80 font-medium">
                      <span>Turn #{tIdx + 1}</span>
                      {turn.genre && <span>&bull; {turn.genre}</span>}
                      {turn.level && <span className="capitalize">&bull; {turn.level}</span>}
                    </div>
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-left">
                      {turn.userMessage}
                    </p>
                  </div>
                </div>

                {/* Notice Banner (honest cue, level, heat level) */}
                {turn.notice && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-secondary border border-border text-foreground text-xs">
                    <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-medium">{turn.notice}</p>
                  </div>
                )}

                {/* Genre Inference Card if inferred */}
                {turn.context?.genreSource === "inferred" && turn.context.genres[0] && (
                  <GenreInferenceCard
                    genre={turn.context.genres[0]}
                    confidence={turn.context.genreConfidence}
                    reasons={turn.context.inferenceReasons}
                    candidates={turn.context.candidateGenres}
                    onChangeGenre={(newGenre) => {
                      const updated = {
                        ...(turn.profile || currentProfile || {
                          genres: [],
                          level: "beginner" as const,
                          length: "any" as const,
                          plot: "any" as const,
                          moods: [],
                          heatLevel: "any" as const,
                          pastReads: [],
                        }),
                        genres: [newGenre],
                      };
                      setCurrentProfile(updated);
                      void handleRecommend({
                        message: turn.userMessage,
                        profile: updated,
                      });
                    }}
                  />
                )}

                {/* Assistant Explanation */}
                {turn.explanation && (
                  <ChatStream content={turn.explanation} isStreaming={false} error={null} />
                )}

                {/* Book Recommendations */}
                {turn.books && turn.books.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen size={18} className="text-primary" />
                        <h3 className="text-base font-bold text-foreground">
                          Recommended Books ({turn.books.length})
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        Deterministic Rubric
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {turn.books.map((b, bIdx) => (
                        <BookCard key={b.id || bIdx} book={b} index={bIdx} />
                      ))}
                    </div>

                    {/* Thin results relaxing action */}
                    {turn.books.length < 3 && (
                      <div className="p-3.5 rounded-xl border border-border bg-secondary/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-foreground">
                            Only {turn.books.length} {turn.books.length === 1 ? "book" : "books"} matched your strict criteria.
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            Relax your page length or plot preferences to see more titles.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const baseProfile = turn.profile || currentProfile;
                            if (baseProfile) {
                              const relaxed = { ...baseProfile, length: "any" as const, plot: "any" as const };
                              setCurrentProfile(relaxed);
                              void handleRecommend({
                                message: "Show more books with relaxed page count and complexity",
                                profile: relaxed,
                              });
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shrink-0 cursor-pointer text-center"
                        >
                          Show books up to 350+ pages
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Reading Ladder */}
                {turn.ladder && turn.ladder.length > 0 && (
                  <div className="p-5 rounded-2xl border border-border bg-card/60">
                    <ReadingLadder steps={turn.ladder} />
                  </div>
                )}
              </div>
            ))}

            {/* In-Flight Current Streaming Turn */}
            {(isLoading || isStreaming || (currentPrompt && (streamText || books.length > 0))) && (
              <div className="space-y-6 pt-6 border-t border-border/60">
                {currentPrompt && (
                  <div className="flex items-start justify-end">
                    <div className="max-w-2xl p-4 rounded-2xl rounded-tr-xs bg-primary text-primary-foreground shadow-xs space-y-1">
                      <div className="flex items-center justify-end gap-2 text-[11px] opacity-80 font-medium">
                        <span>Current Inquiry</span>
                        {currentPrompt.genre && <span>&bull; {currentPrompt.genre}</span>}
                        {currentPrompt.level && <span className="capitalize">&bull; {currentPrompt.level}</span>}
                      </div>
                      <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-left">
                        {currentPrompt.message}
                      </p>
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <BookCardSkeleton />
                      <BookCardSkeleton />
                    </div>
                  </div>
                )}

                {/* Notice Banner for streaming turn */}
                {streamNotice && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-secondary border border-border text-foreground text-xs">
                    <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-medium">{streamNotice}</p>
                  </div>
                )}

                {/* Genre Inference Card if inferred */}
                {currentContext?.genreSource === "inferred" && currentContext.genres[0] && (
                  <GenreInferenceCard
                    genre={currentContext.genres[0]}
                    confidence={currentContext.genreConfidence}
                    reasons={currentContext.inferenceReasons}
                    candidates={currentContext.candidateGenres}
                    onChangeGenre={(newGenre) => {
                      if (currentProfile) {
                        const updated = { ...currentProfile, genres: [newGenre] };
                        setCurrentProfile(updated);
                        void handleRecommend({
                          message: currentPrompt?.message || "",
                          profile: updated,
                        });
                      }
                    }}
                  />
                )}

                {streamText && (
                  <ChatStream content={streamText} isStreaming={isStreaming} error={error} />
                )}

                {books.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen size={18} className="text-primary" />
                        <h3 className="text-base font-bold text-foreground">
                          Recommended Books ({books.length})
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        Scoring & Verifying
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {books.map((b, bIdx) => (
                        <BookCard key={b.id || bIdx} book={b} index={bIdx} />
                      ))}
                    </div>

                    {/* Thin results relaxing action */}
                    {books.length < 3 && !isStreaming && (
                      <div className="p-3.5 rounded-xl border border-border bg-secondary/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-foreground">
                            Only {books.length} {books.length === 1 ? "book" : "books"} matched your strict criteria.
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            Relax your page length or plot preferences to see more titles.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentProfile) {
                              const relaxed = { ...currentProfile, length: "any" as const, plot: "any" as const };
                              setCurrentProfile(relaxed);
                              void handleRecommend({
                                message: "Show more books with relaxed page count and complexity",
                                profile: relaxed,
                              });
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shrink-0 cursor-pointer text-center"
                        >
                          Show books up to 350+ pages
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {ladder.length > 0 && (
                  <div className="p-5 rounded-2xl border border-border bg-card/60">
                    <ReadingLadder steps={ladder} />
                  </div>
                )}
              </div>
            )}

            <div ref={resultsEndRef} />
          </div>

          {/* Persistent Bottom Chat Input */}
          <div className="sticky bottom-4 pt-6 mt-8">
            <form
              onSubmit={handleSubmit}
              className="rounded-3xl border border-border/80 bg-card/95 backdrop-blur-lg p-3 shadow-xl space-y-2.5 transition-all focus-within:border-primary/50"
            >
              <div className="flex items-center gap-3 px-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask a book question or describe a premise..."
                  className="min-w-0 flex-1 bg-transparent text-sm sm:text-base text-foreground outline-none placeholder:text-muted-foreground"
                  disabled={isLoading || isStreaming}
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isLoading || isStreaming}
                  className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer shadow-md shrink-0"
                >
                  {isLoading || isStreaming ? (
                    <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              </div>

              {/* Filter toggles & active badges */}
              <div className="flex flex-wrap items-center justify-between border-t border-border/50 px-2 pt-2 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOptions((prev) => !prev)}
                    className="text-primary hover:underline font-medium cursor-pointer"
                  >
                    {showOptions ? "- Hide Filters" : "+ Genre & Depth"}
                  </button>
                  {selectedGenre && (
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                      {selectedGenre}
                    </span>
                  )}
                  {selectedLevel && (
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium capitalize">
                      {selectedLevel}
                    </span>
                  )}
                </div>

                <span className="hidden sm:inline-block text-[11px] text-muted-foreground font-mono">
                  Press Enter ↵ to send
                </span>
              </div>

              {/* Collapsible Genre / Level selector */}
              {showOptions && (
                <div className="p-2 space-y-2.5 border-t border-border/50 text-left">
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      Genre
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedGenre(undefined)}
                        className={`rounded-full px-2.5 py-0.5 text-xs transition-all cursor-pointer ${
                          !selectedGenre
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-muted text-foreground/70 hover:bg-muted/80"
                        }`}
                      >
                        Any
                      </button>
                      {GENRE_OPTIONS.map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setSelectedGenre(g.value === selectedGenre ? undefined : g.value)}
                          className={`rounded-full px-2.5 py-0.5 text-xs transition-all cursor-pointer ${
                            selectedGenre === g.value
                              ? "bg-primary text-primary-foreground font-medium"
                              : "bg-muted text-foreground/70 hover:bg-muted/80"
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      Depth
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLevel(undefined)}
                        className={`rounded-full px-2.5 py-0.5 text-xs transition-all cursor-pointer ${
                          !selectedLevel
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-muted text-foreground/70 hover:bg-muted/80"
                        }`}
                      >
                        Any
                      </button>
                      {LEVEL_OPTIONS.map((lvl) => (
                        <button
                          key={lvl.value}
                          type="button"
                          onClick={() => setSelectedLevel(lvl.value === selectedLevel ? undefined : lvl.value)}
                          className={`rounded-full px-2.5 py-0.5 text-xs transition-all cursor-pointer ${
                            selectedLevel === lvl.value
                              ? "bg-primary text-primary-foreground font-medium"
                              : "bg-muted text-foreground/70 hover:bg-muted/80"
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <ChatAppContent />
    </Suspense>
  );
}
