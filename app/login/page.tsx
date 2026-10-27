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
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
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

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (signInError) {
        setError(signInError.message);
        setIsGoogleLoading(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to Google sign in");
      setIsGoogleLoading(false);
    }
  };

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
              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                className="w-full rounded-xl py-3 px-4 text-sm font-medium border border-border bg-card hover:bg-muted text-card-foreground transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                {isGoogleLoading ? (
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                ) : (
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center justify-center py-2">
                <div className="w-full border-t border-border" />
                <span className="absolute bg-card px-3 text-xs text-muted-foreground uppercase font-mono tracking-wider">
                  or
                </span>
              </div>

              {/* Email Magic Link Form */}
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
                  disabled={isLoading || isGoogleLoading}
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
        <p>&copy; {new Date().getFullYear()} BookCompass AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
