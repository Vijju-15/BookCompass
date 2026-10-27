import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "BookCompass — AI Book Recommendations",
  description:
    "Discover your next great read. BookCompass uses AI to recommend the best books based on your genre, reading level, and mood.",
  keywords: [
    "book recommendations",
    "AI",
    "reading",
    "books",
    "genre",
    "beginner books",
  ],
  openGraph: {
    title: "BookCompass — AI Book Recommendations",
    description:
      "Discover your next great read with AI-powered personalized book recommendations.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen font-sans bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
