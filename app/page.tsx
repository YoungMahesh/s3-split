"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signUp, signOut } from "@/lib/auth-client";
import { UpstreamAccountsManager } from "@/app/components/upstream-accounts";
import { ManagedBucketsManager } from "@/app/components/managed-buckets";
import {
  Button,
  Badge,
  Input,
  Label,
  FormGroup,
  CodeWindow,
} from "@/app/components/ui";

function RadialSpikeMark({ className = "h-5 w-5 text-[#141413]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* 4-spoke radial spike glyph */}
      <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const {
    data: session,
    isPending: isSessionPending,
    error: sessionError,
  } = useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRawSession, setShowRawSession] = useState(false);

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

  const handleSignOut = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            setSuccessMessage("Signed out successfully.");
            router.refresh();
          },
          onError: (ctx) => {
            setErrorMessage(ctx.error.message || "Failed to sign out.");
          },
        },
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to sign out.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (session?.user) {
    return (
      <div className="min-h-screen bg-[#faf9f5] text-[#141413]">
        {/* Top Navigation Bar (64px fixed height with warm cream canvas & bottom hairline border) */}
        <header className="sticky top-0 z-30 h-16 border-b border-[#e6dfd8] bg-[#faf9f5]/95 backdrop-blur-xs">
          <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Brand Logo & Wordmark */}
            <div className="flex items-center gap-3">
              <RadialSpikeMark className="h-5 w-5 text-[#141413]" />
              <div className="flex items-center gap-2.5">
                <span className="font-serif text-xl font-medium tracking-tight text-[#141413]">
                  S3-Split
                </span>
                <Badge variant="coral" size="sm">
                  Storage Gateway
                </Badge>
              </div>
            </div>

            {/* Session Info & Actions */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-[#141413]">
                  {session.user.name || "Signed-in User"}
                </span>
                <span className="text-xs text-[#6c6a64] font-mono">
                  {session.user.email}
                </span>
              </div>

              <div className="hidden sm:block h-6 w-px bg-[#e6dfd8]" aria-hidden="true" />

              <Button
                id="sign-out-btn"
                variant="secondary"
                size="sm"
                onClick={handleSignOut}
                disabled={isSubmitting}
                className="text-[#c64545] border-[#e6dfd8] hover:border-[#c64545]/30 hover:bg-[#c64545]/5"
              >
                {isSubmitting ? "Signing out..." : "Sign Out"}
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
          {/* Global Alerts */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-[#c64545]/30 bg-[#c64545]/10 p-4 text-sm text-[#9a2c2c] shadow-xs"
            >
              <div className="flex items-start gap-2.5">
                <svg className="h-5 w-5 shrink-0 text-[#c64545] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Error</p>
                  <p className="mt-0.5 text-xs text-[#9a2c2c] leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-xl border border-[#5db8a6]/40 bg-[#5db8a6]/15 p-4 text-sm text-[#1e6155] shadow-xs"
            >
              <div className="flex items-start gap-2.5">
                <svg className="h-5 w-5 shrink-0 text-[#2b7264] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="font-semibold">Success</p>
                  <p className="mt-0.5 text-xs text-[#1e6155] leading-relaxed">{successMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Upstream Accounts Section */}
          <section aria-labelledby="upstream-section">
            <UpstreamAccountsManager />
          </section>

          {/* Managed Buckets Section */}
          <section aria-labelledby="buckets-section">
            <ManagedBucketsManager />
          </section>

          {/* Collapsible Session & Developer Diagnostics */}
          <section className="pt-6 border-t border-[#e6dfd8]">
            <button
              type="button"
              onClick={() => setShowRawSession(!showRawSession)}
              className="inline-flex items-center gap-2 text-xs font-medium text-[#6c6a64] hover:text-[#141413] transition-colors cursor-pointer"
            >
              <span>{showRawSession ? "▼" : "▶"}</span>
              <span>{showRawSession ? "Hide Session & Diagnostic Details" : "Show Session & Diagnostic Details"}</span>
            </button>

            {showRawSession && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg border border-[#e6dfd8] bg-[#efe9de] p-3">
                    <span className="text-[#6c6a64] block font-medium">User ID</span>
                    <span className="font-mono text-[#141413] truncate block mt-1">
                      {session.user.id}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[#e6dfd8] bg-[#efe9de] p-3">
                    <span className="text-[#6c6a64] block font-medium">Session ID</span>
                    <span className="font-mono text-[#141413] truncate block mt-1">
                      {session.session?.id}
                    </span>
                  </div>
                  <div className="rounded-lg border border-[#e6dfd8] bg-[#efe9de] p-3">
                    <span className="text-[#6c6a64] block font-medium">Expires At</span>
                    <span className="text-[#141413] block mt-1">
                      {session.session?.expiresAt
                        ? new Date(session.session.expiresAt).toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </div>

                <CodeWindow
                  title="Session Diagnostic Payload"
                  language="json"
                  code={JSON.stringify(session, null, 2)}
                />
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf9f5] px-4 py-12 text-[#141413]">
      <main className="w-full max-w-md space-y-6">
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

        {/* Unauthenticated Authentication Card */}
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
                <div className="flex items-center justify-center gap-2 mb-2">
                  <RadialSpikeMark className="h-6 w-6 text-[#141413]" />
                  <span className="font-serif text-2xl font-medium tracking-tight text-[#141413]">
                    S3-Split
                  </span>
                </div>
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
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={isSubmitting}
                      className="w-full mt-2"
                    >
                      Sign In
                    </Button>

                    <p className="pt-2 text-center text-xs text-[#6c6a64]">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signup")}
                        className="font-semibold text-[#cc785c] hover:underline cursor-pointer"
                      >
                        Create one now
                      </button>
                    </p>
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
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={isSubmitting}
                      className="w-full mt-2"
                    >
                      Create Account
                    </Button>

                    <p className="pt-2 text-center text-xs text-[#6c6a64]">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signin")}
                        className="font-semibold text-[#cc785c] hover:underline cursor-pointer"
                      >
                        Sign in
                      </button>
                    </p>
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
