"use client";

import { Edit3, BookOpen } from "lucide-react";
import type { ReaderProfile } from "@/lib/schemas";

interface ProfileSummaryBarProps {
  profile: ReaderProfile;
  onEdit: () => void;
}

const LENGTH_LABELS: Record<string, string> = {
  short: "Under 200p",
  medium: "200–350p",
  long: "350–500p",
  epic: "500p+",
  any: "Any length",
};

const PLOT_LABELS: Record<string, string> = {
  simple: "Simple plot",
  twisty: "A few twists",
  layered: "Complex plot",
  any: "",
};

export function ProfileSummaryBar({ profile, onEdit }: ProfileSummaryBarProps) {
  const genreText =
    profile.genres.length > 0
      ? profile.genres.map((g) => g.replace("-", " ")).join(", ")
      : "Inferred genre";

  const parts: string[] = [
    genreText.charAt(0).toUpperCase() + genreText.slice(1),
    profile.level.charAt(0).toUpperCase() + profile.level.slice(1),
  ];

  if (profile.length && profile.length !== "any") {
    parts.push(LENGTH_LABELS[profile.length] || profile.length);
  }

  if (profile.plot && profile.plot !== "any" && PLOT_LABELS[profile.plot]) {
    parts.push(PLOT_LABELS[profile.plot]);
  }

  if (profile.moods && profile.moods.length > 0) {
    parts.push(profile.moods.slice(0, 2).join(", "));
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-border bg-card shadow-xs text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <div className="size-6 rounded-md bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
          <BookOpen size={12} />
        </div>
        <div className="truncate text-foreground font-medium flex items-center gap-1.5 flex-wrap">
          {parts.map((part, index) => (
            <span key={index} className="inline-flex items-center gap-1.5">
              <span>{part}</span>
              {index < parts.length - 1 && (
                <span className="text-muted-foreground">&bull;</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-secondary hover:bg-muted text-secondary-foreground text-xs font-semibold cursor-pointer transition-colors shrink-0"
        title="Edit reader profile"
      >
        <Edit3 size={11} />
        <span>Edit</span>
      </button>
    </div>
  );
}
