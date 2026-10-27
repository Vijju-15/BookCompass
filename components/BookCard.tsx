"use client";

import { motion } from "framer-motion";
import { ExternalLink, Star } from "lucide-react";
import { BookCover } from "@/components/BookCover";
import type { Book } from "@/lib/schemas";

interface BookCardProps {
  book: Book;
  index: number;
}

const LEVEL_DOTS: Record<string, string> = {
  beginner: "•",
  intermediate: "••",
  advanced: "•••",
};

export function BookCard({ book, index }: BookCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-sm
        hover:border-foreground/30 transition-all duration-300"
    >
      <div className="flex gap-4 p-4">
        {/* Book cover with fallback */}
        <BookCover
          coverUrl={book.coverUrl}
          title={book.title}
          author={book.author}
          genre={book.genres[0]}
          size="md"
        />

        {/* Book info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-card-foreground line-clamp-2 leading-tight">
                {book.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {book.author}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground inline-flex items-center gap-1"
            >
              <span className="tracking-tighter font-bold text-xs" aria-hidden="true">
                {LEVEL_DOTS[book.level] ?? "•"}
              </span>
              <span className="capitalize">{book.level}</span>
            </span>
            {book.pageCount && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground">
                {book.pageCount} pages
              </span>
            )}
            {book.avgRating && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground flex items-center gap-1">
                <Star size={10} className="fill-foreground text-foreground" />
                {book.avgRating.toFixed(1)}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground capitalize">
              {book.pacing} pace
            </span>
          </div>

          {/* Genre tags */}
          <div className="flex flex-wrap gap-1 mt-2">
            {book.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="text-xs text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded"
              >
                {genre}
              </span>
            ))}
          </div>

          {/* Why this book / Structured explanation */}
          {book.whyItFits ? (
            <div className="mt-2.5 space-y-1.5 text-xs">
              <p className="text-foreground/90 font-medium leading-relaxed">
                {book.whyItFits}
              </p>
              {book.whyThisLevel && (
                <p className="text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground/80">Level Fit:</span> {book.whyThisLevel}
                </p>
              )}
              {book.watchOut && (
                <p className="text-foreground/70 font-medium italic">
                  Note: {book.watchOut}
                </p>
              )}
            </div>
          ) : book.whyStartHere ? (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
              {book.whyStartHere}
            </p>
          ) : null}

          {/* Amazon link */}
          {book.amazonSearchUrl && (
            <a
              href={book.amazonSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-foreground/80
                hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Find on Amazon
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>

      {/* Score indicator */}
      {book.score !== undefined && (
        <div className="px-4 pb-3">
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(book.score * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round(book.score * 100)}% match
          </p>
        </div>
      )}
    </motion.div>
  );
}

/** Skeleton loading state */
export function BookCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden p-4">
      <div className="flex gap-4">
        <div className="w-24 h-36 rounded-lg skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-3/4 rounded skeleton" />
          <div className="h-4 w-1/2 rounded skeleton" />
          <div className="flex gap-1.5 mt-2">
            <div className="h-5 w-16 rounded-full skeleton" />
            <div className="h-5 w-20 rounded-full skeleton" />
            <div className="h-5 w-12 rounded-full skeleton" />
          </div>
          <div className="h-4 w-full rounded skeleton mt-2" />
          <div className="h-4 w-2/3 rounded skeleton" />
        </div>
      </div>
    </div>
  );
}
