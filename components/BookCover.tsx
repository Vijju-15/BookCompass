"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";

interface BookCoverProps {
  coverUrl?: string | null;
  title: string;
  author: string;
  genre?: string;
  size?: "sm" | "md";
  className?: string;
}

// Neutral desaturated gradients for stylized fallback covers
const GENRE_GRADIENTS: Record<string, string> = {
  romance: "from-neutral-700 via-neutral-800 to-neutral-900",
  thriller: "from-neutral-800 via-neutral-900 to-black",
  horror: "from-neutral-900 via-black to-neutral-950",
  "action-adventure": "from-neutral-700 via-neutral-800 to-neutral-900",
  "action/adventure": "from-neutral-700 via-neutral-800 to-neutral-900",
  mystery: "from-neutral-800 via-neutral-900 to-black",
  "sci-fi": "from-neutral-800 via-neutral-900 to-neutral-950",
  fantasy: "from-neutral-700 via-neutral-800 to-neutral-900",
  "motivational/self-help": "from-neutral-700 via-neutral-800 to-neutral-900",
  "self-help": "from-neutral-700 via-neutral-800 to-neutral-900",
  "non-fiction": "from-neutral-800 via-neutral-800 to-neutral-900",
  classics: "from-neutral-700 via-neutral-800 to-neutral-900",
};

function normalizeCoverUrl(url?: string | null): string | null {
  if (!url) return null;
  let normalized = url.trim();
  // Force HTTPS to prevent mixed-content blocking
  if (normalized.startsWith("http://")) {
    normalized = normalized.replace("http://", "https://");
  }
  // Ensure Google Books thumbnails request higher quality & HTTPS
  if (normalized.includes("books.google.com")) {
    normalized = normalized.replace("&edge=curl", "");
  }
  return normalized;
}

export function BookCover({
  coverUrl,
  title,
  author,
  genre = "fiction",
  size = "md",
  className = "",
}: BookCoverProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const cleanUrl = normalizeCoverUrl(coverUrl);
  const gradient =
    GENRE_GRADIENTS[genre.toLowerCase()] ||
    "from-neutral-800 via-neutral-900 to-black";

  const isSmall = size === "sm";

  // Fallback stylized book cover
  if (!cleanUrl || imageFailed) {
    return (
      <div
        className={`
          flex-shrink-0 rounded-lg overflow-hidden relative shadow-sm select-none
          bg-gradient-to-br ${gradient} text-white flex flex-col justify-between p-2
          border-l-4 border-l-white/20 border border-white/10
          ${isSmall ? "w-10 h-14 p-1" : "w-24 h-36 p-2.5"}
          ${className}
        `}
        title={`${title} by ${author}`}
      >
        <div className="flex items-center justify-between opacity-80">
          <BookOpen size={isSmall ? 10 : 14} className="opacity-70 text-white/90" />
          {!isSmall && (
            <span className="text-[9px] uppercase tracking-wider font-semibold text-white/90 opacity-80 truncate max-w-[50px]">
              {genre}
            </span>
          )}
        </div>

        <div className="my-auto">
          <p
            className={`font-serif font-bold leading-tight line-clamp-3 text-white/95 ${
              isSmall ? "text-[8px] leading-2" : "text-[11px] leading-snug"
            }`}
          >
            {title}
          </p>
        </div>

        <p
          className={`truncate font-sans text-white/70 ${
            isSmall ? "text-[6px]" : "text-[9px]"
          }`}
        >
          {author}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`
        flex-shrink-0 rounded-lg overflow-hidden relative shadow-sm border border-border
        bg-muted
        ${isSmall ? "w-10 h-14" : "w-24 h-36"}
        ${className}
      `}
    >
      {!imageLoaded && (
        <div className="absolute inset-0 skeleton" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cleanUrl}
        alt={`${title} cover`}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageFailed(true)}
        className={`
          w-full h-full object-cover transition-opacity duration-300
          ${imageLoaded ? "opacity-100" : "opacity-0"}
        `}
      />
    </div>
  );
}
