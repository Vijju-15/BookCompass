"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, ArrowRight, ArrowLeft, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // If already logged in, redirect straight to /chat
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/chat");
      }
    });
  }, [supabase, router]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (otpError) {
        setError(otpError.message);
      } else {
        setIsSubmitted(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to send login link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col justify-between bg-background text-foreground px-4 py-8 overflow-hidden">
      {/* Top Header */}
      <header className="relative z-10 max-w-5xl mx-auto w-full flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border bg-card/60 transition-all"
        >
          <ArrowLeft size={14} />
          <span>Back to Home</span>
        </Link>

        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Compass size={18} />
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground">BookCompass</span>
        </Link>
      </header>

      {/* Center Auth Card */}
      <main className="relative z-10 max-w-md w-full mx-auto my-auto py-10">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Compass size={22} />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-card-foreground">
              Welcome to BookCompass
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Sign in to get book picks that fit your reading level.
            </p>
          </div>

          {isSubmitted ? (
            <div className="p-6 rounded-xl border border-border bg-secondary text-center space-y-3">
              <div className="flex justify-center">
                <CheckCircle2 size={36} className="text-primary" />
              </div>
              <h3 className="font-semibold text-base text-foreground">Check your email</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We sent a secure magic sign-in link to{" "}
                <span className="font-semibold text-foreground">{email}</span>. Click the link in the email to sign in.
              </p>
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="mt-2 text-xs text-primary underline underline-offset-4 hover:opacity-80 cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Email Login Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div className="space-y-1.5 text-left">
                  <label htmlFor="login-email" className="text-xs font-medium text-muted-foreground">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-border transition-all"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="text-xs text-destructive font-medium pt-1">
                      {error}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-xl py-3 px-4 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <span>Continue with email</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-md mx-auto w-full text-center text-xs text-muted-foreground space-y-2">
        <div className="flex items-center justify-center gap-4">
          <Link href="/" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <span>&bull;</span>
          <Link href="/" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </div>
        <p>&copy; 2026 BookCompass AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
