"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession, signIn, signUp } from "@/lib/auth-client";
import {
  Button,
  Input,
  Label,
  FormGroup,
} from "@/app/components/ui";

function RadialSpikeMark({ className = "h-6 w-6 text-[#141413]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" />
    </svg>
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: isSessionPending, error: sessionError } = useSession();

  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const redirectTarget = searchParams.get("redirect") || "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user is already authenticated, redirect to dashboard
  useEffect(() => {
    if (!isSessionPending && session?.user) {
      router.replace(redirectTarget);
    }
  }, [session, isSessionPending, router, redirectTarget]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const switchMode = (newMode: "signin" | "signup") => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await signIn.email({
        email,
        password,
      });

      if (error) {
        setErrorMessage(
          error.message || "Failed to sign in. Please verify your credentials.",
        );
      } else {
        setSuccessMessage("Signed in successfully!");
        resetForm();
        router.push(redirectTarget);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await signUp.email({
        name,
        email,
        password,
      });

      if (error) {
        setErrorMessage(
          error.message || "Failed to sign up. Please try again.",
        );
      } else {
        setSuccessMessage("Account created successfully!");
        resetForm();
        router.push(redirectTarget);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign up.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f5] px-4 py-12 text-[#141413]">
      <main className="w-full max-w-md space-y-6">
        {/* Back to Home Link */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6c6a64] hover:text-[#141413] transition-colors"
          >
            ← Back to S3-Split Home
          </Link>
        </div>

        {/* Global Notifications */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-4 text-sm text-[#9a2c2c] shadow-xs"
          >
            <p className="font-semibold">Error</p>
            <p className="mt-0.5 text-xs text-[#9a2c2c]">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="rounded-xl border border-[#5db8a6]/40 bg-[#5db8a6]/15 p-4 text-sm text-[#1e6155] shadow-xs"
          >
            <p className="font-semibold">Success</p>
            <p className="mt-0.5 text-xs text-[#1e6155]">{successMessage}</p>
          </div>
        )}

        {sessionError && (
          <div
            role="alert"
            className="rounded-xl border border-[#e8a55a]/40 bg-[#e8a55a]/15 p-4 text-sm text-[#855013] shadow-xs"
          >
            <p className="font-semibold">Session Warning</p>
            <p className="mt-0.5 text-xs text-[#855013]">
              {sessionError.message || "Failed to retrieve session."}
            </p>
          </div>
        )}

        {/* Authentication Card */}
        <div className="overflow-hidden rounded-2xl border border-[#e6dfd8] bg-[#efe9de] shadow-md">
          {isSessionPending ? (
            /* Loading Skeleton */
            <div className="p-8 space-y-4 animate-pulse">
              <div className="h-7 w-1/2 rounded bg-[#e6dfd8] mx-auto" />
              <div className="h-4 w-3/4 rounded bg-[#e6dfd8]/60 mx-auto" />
              <div className="space-y-3 pt-4">
                <div className="h-10 rounded-md bg-[#e6dfd8]" />
                <div className="h-10 rounded-md bg-[#e6dfd8]" />
                <div className="h-10 rounded-md bg-[#e6dfd8]" />
              </div>
            </div>
          ) : (
            <div>
              {/* Card Header & Brand Voice */}
              <div className="p-6 sm:p-8 pb-4 text-center border-b border-[#e6dfd8] bg-[#faf9f5]/50">
                <Link href="/" className="inline-flex items-center justify-center gap-2 mb-2">
                  <RadialSpikeMark className="h-6 w-6 text-[#141413]" />
                  <span className="font-serif text-2xl font-medium tracking-tight text-[#141413]">
                    S3-Split
                  </span>
                </Link>
                <p className="text-xs text-[#6c6a64] max-w-xs mx-auto">
                  Multi-tenant S3 gateway enforcing real-time storage quotas with standard SigV4 SDK compatibility.
                </p>

                {/* Tab Switcher */}
                <div className="grid grid-cols-2 gap-1 mt-6 rounded-lg bg-[#e8e0d2] p-1 border border-[#e6dfd8]">
                  <button
                    type="button"
                    onClick={() => switchMode("signin")}
                    className={`py-2 text-center text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      mode === "signin"
                        ? "bg-[#faf9f5] text-[#141413] shadow-xs"
                        : "text-[#6c6a64] hover:text-[#141413]"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className={`py-2 text-center text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      mode === "signup"
                        ? "bg-[#faf9f5] text-[#141413] shadow-xs"
                        : "text-[#6c6a64] hover:text-[#141413]"
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              </div>

              {/* Form Content */}
              <div className="p-6 sm:p-8 pt-6">
                {mode === "signin" ? (
                  /* Sign In Form */
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <FormGroup>
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </FormGroup>

                    <Button
                      id="signin-submit-btn"
                      type="submit"
                      variant="primary"
                      className="w-full justify-center"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                ) : (
                  /* Sign Up Form */
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <FormGroup>
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder="Ada Lovelace"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </FormGroup>

                    <Button
                      id="signup-submit-btn"
                      type="submit"
                      variant="primary"
                      className="w-full justify-center"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#faf9f5]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#cc785c] border-t-transparent" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
