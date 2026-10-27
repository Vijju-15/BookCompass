"use client";

import { Sparkles, ArrowRight } from "lucide-react";
import type { Genre } from "@/lib/schemas";

interface GenreInferenceCardProps {
  genre: string;
  confidence: number;
  reasons: string[];
  candidates?: { genre: Genre; confidence: number }[];
  onChangeGenre?: (genre: Genre) => void;
}

export function GenreInferenceCard({
  genre,
  confidence,
  reasons,
  candidates,
  onChangeGenre,
}: GenreInferenceCardProps) {
  const percent = Math.round(confidence * 100);

  return (
    <div className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Sparkles size={13} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground">
              We think <span className="capitalize font-bold">{genre.replace("-", " ")}</span> fits you ({percent}%)
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Because: {reasons.length > 0 ? reasons.join(" &bull; ") : "matches your mood and reading preferences"}
            </p>
          </div>
        </div>
      </div>

      {candidates && candidates.length > 1 && onChangeGenre && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/50 flex-wrap">
          <span className="text-[11px] text-muted-foreground">Other possibilities:</span>
          {candidates.slice(1).map((c) => (
            <button
              key={c.genre}
              type="button"
              onClick={() => onChangeGenre(c.genre)}
              className="text-[11px] px-2.5 py-1 rounded-md bg-secondary hover:bg-muted text-secondary-foreground font-medium cursor-pointer transition-colors flex items-center gap-1"
            >
              <span className="capitalize">{c.genre.replace("-", " ")}</span>
              <span className="text-muted-foreground font-mono">({Math.round(c.confidence * 100)}%)</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
