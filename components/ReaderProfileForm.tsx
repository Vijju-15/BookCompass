"use client";

import { useState, useEffect, useRef } from "react";
import {
  Check,
  Search,
  X,
  Sparkles,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Heart,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import {
  GENRES,
  MOODS,
  type Genre,
  type Level,
  type Mood,
  type ReaderProfile,
  type PastRead,
} from "@/lib/schemas";

interface ReaderProfileFormProps {
  initialProfile?: ReaderProfile;
  initialMessage?: string;
  onSubmit: (data: { profile: ReaderProfile; message: string }) => void;
  isLoading: boolean;
  onCancelEdit?: () => void;
}

const GENRE_LABELS: Record<string, string> = {
  romance: "Romance",
  thriller: "Thriller",
  mystery: "Mystery",
  horror: "Horror",
  fantasy: "Fantasy",
  "sci-fi": "Sci-Fi",
  "action-adventure": "Action & Adventure",
  classics: "Classics",
  "non-fiction": "Non-Fiction",
  "self-help": "Self-Help",
};

const DISPLAY_GENRES: Genre[] = [
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

const EXPERIENCE_OPTIONS: { level: Level; title: string; desc: string }[] = [
  {
    level: "beginner",
    title: "Beginner",
    desc: "I read a few books a year or I'm just starting.",
  },
  {
    level: "intermediate",
    title: "Intermediate",
    desc: "I read regularly and enjoy a good plot.",
  },
  {
    level: "advanced",
    title: "Advanced",
    desc: "I read a lot and enjoy dense or layered books.",
  },
];

const LENGTH_OPTIONS = [
  { value: "short", label: "Short (<200p)" },
  { value: "medium", label: "Medium (200–350p)" },
  { value: "long", label: "Long (350–500p)" },
  { value: "epic", label: "Epic (500p+)" },
  { value: "any", label: "No preference" },
] as const;

const PLOT_OPTIONS = [
  { value: "simple", title: "Simple & Direct", desc: "Easy to follow, straightforward narrative." },
  { value: "twisty", title: "A Few Twists", desc: "Keeps you guessing with surprising turns." },
  { value: "layered", title: "Layered & Complex", desc: "Intricate subplots, deep themes and depth." },
  { value: "any", title: "No Preference", desc: "Open to any narrative style." },
] as const;

export function ReaderProfileForm({
  initialProfile,
  initialMessage = "",
  onSubmit,
  isLoading,
  onCancelEdit,
}: ReaderProfileFormProps) {
  // Q1: Genres (up to 2, or "Not sure" -> empty array)
  const [selectedGenres, setSelectedGenres] = useState<Genre[]>(
    initialProfile?.genres || []
  );
  const [isNotSureGenre, setIsNotSureGenre] = useState(
    initialProfile ? initialProfile.genres.length === 0 : false
  );

  // Q2: Experience level (required)
  const [level, setLevel] = useState<Level | undefined>(initialProfile?.level);

  // Q3: Length (required)
  const [length, setLength] = useState<"short" | "medium" | "long" | "epic" | "any">(
    initialProfile?.length || "medium"
  );

  // Q4: Plot complexity (optional)
  const [plot, setPlot] = useState<"simple" | "twisty" | "layered" | "any">(
    initialProfile?.plot || "any"
  );

  // Q5: Mood (up to 3)
  const [selectedMoods, setSelectedMoods] = useState<Mood[]>(
    initialProfile?.moods || []
  );

  // Q6: Past reads
  const [hasPastReads, setHasPastReads] = useState(
    (initialProfile?.pastReads && initialProfile.pastReads.length > 0) || false
  );
  const [pastReads, setPastReads] = useState<PastRead[]>(
    initialProfile?.pastReads || []
  );
  const [pastReadQuery, setPastReadQuery] = useState("");
  const [pastReadSuggestions, setPastReadSuggestions] = useState<
    { id: string; title: string; author: string }[]
  >([]);
  const [isSearchingBooks, setIsSearchingBooks] = useState(false);

  // Message refinement
  const [message, setMessage] = useState(initialMessage);

  // Mobile Stepper Step (1 to 6)
  const [mobileStep, setMobileStep] = useState(1);

  // Debounced search for past reads
  useEffect(() => {
    if (!hasPastReads || pastReadQuery.trim().length < 2) {
      setPastReadSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingBooks(true);
      try {
        const res = await fetch(
          `/api/books/suggest?q=${encodeURIComponent(pastReadQuery.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setPastReadSuggestions(data.books || []);
        }
      } catch (err) {
        console.warn("Past read suggestion failed:", err);
      } finally {
        setIsSearchingBooks(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [pastReadQuery, hasPastReads]);

  // Toggle genre
  const handleToggleGenre = (g: Genre) => {
    setIsNotSureGenre(false);
    if (selectedGenres.includes(g)) {
      setSelectedGenres(selectedGenres.filter((item) => item !== g));
    } else {
      if (selectedGenres.length >= 2) {
        setSelectedGenres([selectedGenres[1], g]);
      } else {
        setSelectedGenres([...selectedGenres, g]);
      }
    }
  };

  const handleSelectNotSure = () => {
    setIsNotSureGenre(true);
    setSelectedGenres([]);
  };

  // Toggle mood
  const handleToggleMood = (m: Mood) => {
    if (selectedMoods.includes(m)) {
      setSelectedMoods(selectedMoods.filter((item) => item !== m));
    } else {
      if (selectedMoods.length >= 3) {
        setSelectedMoods([...selectedMoods.slice(1), m]);
      } else {
        setSelectedMoods([...selectedMoods, m]);
      }
    }
  };

  // Add past read
  const handleAddPastRead = (item: { id: string; title: string; author: string }) => {
    if (pastReads.some((p) => p.title.toLowerCase() === item.title.toLowerCase())) {
      setPastReadQuery("");
      setPastReadSuggestions([]);
      return;
    }
    if (pastReads.length >= 5) return;

    setPastReads([
      ...pastReads,
      {
        bookId: item.id,
        title: item.title,
        author: item.author,
        opinion: "loved",
      },
    ]);
    setPastReadQuery("");
    setPastReadSuggestions([]);
  };

  const handleRemovePastRead = (index: number) => {
    setPastReads(pastReads.filter((_, i) => i !== index));
  };

  const handleSetOpinion = (
    index: number,
    opinion: "loved" | "okay" | "disliked"
  ) => {
    setPastReads(
      pastReads.map((pr, i) => (i === index ? { ...pr, opinion } : pr))
    );
  };

  // Validation: Questions 1, 2, and 3 must be answered
  const isQ1Answered = selectedGenres.length > 0 || isNotSureGenre;
  const isQ2Answered = Boolean(level);
  const isQ3Answered = Boolean(length);
  const isFormValid = isQ1Answered && isQ2Answered && isQ3Answered;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isFormValid || !level) return;

    const profile: ReaderProfile = {
      genres: isNotSureGenre ? [] : selectedGenres,
      level,
      length,
      plot,
      moods: selectedMoods,
      heatLevel: "any",
      pastReads: hasPastReads ? pastReads : [],
    };

    onSubmit({ profile, message: message.trim() });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs space-y-6 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Reader Profile Questionnaire
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Answer 3 quick questions to calibrate your personalized book recommendations.
          </p>
        </div>

        {onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border cursor-pointer transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Desktop Grid Layout (Hidden on small mobile) */}
      <div className="hidden sm:grid sm:grid-cols-2 gap-6">
        {/* Q1: Genre */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. What genre do you want? <span className="text-destructive">*</span>
            </label>
            <span className="text-[11px] text-muted-foreground font-mono">Pick up to 2</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DISPLAY_GENRES.map((g) => {
              const selected = selectedGenres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleToggleGenre(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  }`}
                >
                  {selected && <Check size={12} className="stroke-[3]" />}
                  <span>{GENRE_LABELS[g] || g}</span>
                </button>
              );
            })}

            {/* Not sure button */}
            <button
              type="button"
              onClick={handleSelectNotSure}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                isNotSureGenre
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-secondary text-secondary-foreground border-dashed border-border hover:bg-muted"
              }`}
            >
              {isNotSureGenre && <Check size={12} className="stroke-[3]" />}
              <span>Not sure, help me decide</span>
            </button>
          </div>
        </div>

        {/* Q2: Reading Experience */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            2. Reading Experience <span className="text-destructive">*</span>
          </label>

          <div className="grid grid-cols-1 gap-2">
            {EXPERIENCE_OPTIONS.map((opt) => {
              const selected = level === opt.level;
              return (
                <button
                  key={opt.level}
                  type="button"
                  onClick={() => setLevel(opt.level)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                    selected
                      ? "bg-primary/5 border-primary text-foreground ring-1 ring-primary"
                      : "bg-secondary/40 border-border text-foreground hover:bg-muted/70"
                  }`}
                >
                  <div
                    className={`size-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/60"
                    }`}
                  >
                    {selected && <div className="size-1.5 rounded-full bg-primary-foreground" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight">{opt.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {opt.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Q3: Length */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            3. Target Book Length <span className="text-destructive">*</span>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {LENGTH_OPTIONS.map((opt) => {
              const selected = length === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLength(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  }`}
                >
                  {selected && <Check size={12} className="stroke-[3]" />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Q4: Plot complexity */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            4. Plot Complexity (Optional)
          </label>

          <div className="grid grid-cols-2 gap-2">
            {PLOT_OPTIONS.map((opt) => {
              const selected = plot === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlot(opt.value)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selected
                      ? "bg-primary/5 border-primary text-foreground ring-1 ring-primary"
                      : "bg-secondary/40 border-border text-foreground hover:bg-muted/70"
                  }`}
                >
                  <p className="text-xs font-bold leading-tight">{opt.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                    {opt.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Q5: Desired Mood */}
        <div className="space-y-2.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              5. Desired Mood (Optional)
            </label>
            <span className="text-[11px] text-muted-foreground font-mono">Pick up to 3</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => {
              const selected = selectedMoods.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleToggleMood(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all cursor-pointer flex items-center gap-1.5 ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-muted"
                  }`}
                >
                  {selected && <Check size={12} className="stroke-[3]" />}
                  <span>{m.replace("-", " ")}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Q6: Past Reads */}
        <div className="space-y-3 sm:col-span-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                6. Books You&apos;ve Read (Optional)
              </label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Loved books shape your taste vector; disliked authors are penalized.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHasPastReads(false)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  !hasPastReads
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setHasPastReads(true)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  hasPastReads
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Yes
              </button>
            </div>
          </div>

          {hasPastReads && (
            <div className="space-y-3 pt-2">
              {/* Autocomplete Search Input */}
              {pastReads.length < 5 && (
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={pastReadQuery}
                    onChange={(e) => setPastReadQuery(e.target.value)}
                    placeholder="Type book title or author to search catalog..."
                    className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-card text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {isSearchingBooks && (
                    <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}

                  {/* Suggestion Dropdown */}
                  {pastReadSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {pastReadSuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddPastRead(item)}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-muted flex items-center justify-between cursor-pointer border-b border-border/40 last:border-none"
                        >
                          <div>
                            <span className="font-semibold text-foreground">{item.title}</span>
                            <span className="text-muted-foreground ml-2 text-[11px]">
                              by {item.author}
                            </span>
                          </div>
                          <span className="text-[10px] text-primary uppercase font-bold">
                            + Add
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Added Past Reads Chips */}
              {pastReads.length > 0 && (
                <div className="space-y-2">
                  {pastReads.map((pr, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border text-xs gap-2"
                    >
                      <div className="truncate">
                        <span className="font-semibold text-foreground">{pr.title}</span>
                        <span className="text-muted-foreground ml-1.5 text-[11px]">
                          ({pr.author})
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Opinion selectors */}
                        <button
                          type="button"
                          onClick={() => handleSetOpinion(idx, "loved")}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                            pr.opinion === "loved"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Loved it (adds to taste vector)"
                        >
                          <Heart size={12} className={pr.opinion === "loved" ? "fill-current" : ""} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetOpinion(idx, "okay")}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                            pr.opinion === "okay"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="It was okay"
                        >
                          <ThumbsUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetOpinion(idx, "disliked")}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                            pr.opinion === "disliked"
                              ? "bg-destructive text-destructive-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Didn't like it (author penalty)"
                        >
                          <ThumbsDown size={12} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemovePastRead(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive cursor-pointer ml-1"
                          title="Remove book"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Stepper (Visible on small screens) */}
      <div className="sm:hidden space-y-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>Question {mobileStep} of 6</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className={`size-2 rounded-full ${
                  s === mobileStep
                    ? "bg-primary"
                    : s < mobileStep
                    ? "bg-primary/50"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {mobileStep === 1 && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              1. Which genre do you want? (Pick up to 2) <span className="text-destructive">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DISPLAY_GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => handleToggleGenre(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    selectedGenres.includes(g)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border"
                  }`}
                >
                  {GENRE_LABELS[g] || g}
                </button>
              ))}
              <button
                type="button"
                onClick={handleSelectNotSure}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all cursor-pointer ${
                  isNotSureGenre
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-secondary-foreground border-border"
                }`}
              >
                Not sure, help me decide
              </button>
            </div>
          </div>
        )}

        {mobileStep === 2 && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              2. Reading Experience <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.level}
                  type="button"
                  onClick={() => setLevel(opt.level)}
                  className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    level === opt.level
                      ? "bg-primary/5 border-primary ring-1 ring-primary"
                      : "bg-secondary/40 border-border"
                  }`}
                >
                  <p className="text-xs font-bold">{opt.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {mobileStep === 3 && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              3. Book Length <span className="text-destructive">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {LENGTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLength(opt.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                    length === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mobileStep === 4 && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              4. Plot Complexity
            </label>
            <div className="space-y-2">
              {PLOT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlot(opt.value)}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    plot === opt.value
                      ? "bg-primary/5 border-primary ring-1 ring-primary"
                      : "bg-secondary/40 border-border"
                  }`}
                >
                  <p className="text-xs font-bold">{opt.title}</p>
                  <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {mobileStep === 5 && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              5. Desired Mood (Pick up to 3)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleToggleMood(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all cursor-pointer ${
                    selectedMoods.includes(m)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border"
                  }`}
                >
                  {m.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        {mobileStep === 6 && (
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              6. Books You Liked
            </label>
            <p className="text-xs text-muted-foreground">
              Add books on desktop or provide extra details below.
            </p>
          </div>
        )}

        {/* Mobile Prev / Next controls */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <button
            type="button"
            disabled={mobileStep === 1}
            onClick={() => setMobileStep((s) => Math.max(1, s - 1))}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft size={14} />
            <span>Back</span>
          </button>
          <button
            type="button"
            disabled={mobileStep === 6}
            onClick={() => setMobileStep((s) => Math.min(6, s + 1))}
            className="flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-30 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Message input & Submit Bar */}
      <div className="border-t border-border/60 pt-5 space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
          Additional Refinements (Optional)
        </label>
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything else? For example: enemies-to-lovers, witty banter, no sad endings"
            className="w-full min-h-[72px] px-4 py-3 pr-12 rounded-xl border border-border bg-card text-xs text-card-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            rows={2}
          />
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isLoading || !isFormValid}
            className="absolute bottom-2.5 right-2.5 size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-xs"
            aria-label="Get Recommendations"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>

        {!isFormValid && (
          <p className="text-[11px] text-muted-foreground text-center font-medium">
            Answer the 3 required questions (Genre, Experience, and Length) to continue.
          </p>
        )}
      </div>
    </div>
  );
}
