"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn, signUp, signOut } from "@/lib/auth-client";
import { UpstreamAccountsManager } from "@/app/components/upstream-accounts";
import { ManagedBucketsManager } from "@/app/components/managed-buckets";

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
      <div className="min-h-screen bg-zinc-50 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white font-black dark:bg-zinc-100 dark:text-zinc-900">
                S3
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-100">
                  S3-Split
                </span>
                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Storage Gateway
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {session.user.name || "Signed-in User"}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  {session.user.email}
                </span>
              </div>
              <button
                type="button"
                id="sign-out-btn"
                onClick={handleSignOut}
                disabled={isSubmitting}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          {/* Global Alerts */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              <p className="font-semibold">Error</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <p className="font-semibold">Success</p>
              <p className="mt-0.5">{successMessage}</p>
            </div>
          )}

          {/* Upstream Account Connection Section */}
          <section aria-labelledby="upstream-section">
            <UpstreamAccountsManager />
          </section>

          {/* Managed Buckets Section */}
          <section aria-labelledby="buckets-section">
            <ManagedBucketsManager />
          </section>

          {/* Collapsible Session & Developer Diagnostics */}
          <section className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setShowRawSession(!showRawSession)}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer"
            >
              {showRawSession
                ? "▼ Hide Session & Diagnostic Details"
                : "▶ Show Session & Diagnostic Details"}
            </button>

            {showRawSession && (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                    <span className="text-zinc-500 block">User ID</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate block mt-0.5">
                      {session.user.id}
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                    <span className="text-zinc-500 block">Session ID</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate block mt-0.5">
                      {session.session?.id}
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                    <span className="text-zinc-500 block">Expires At</span>
                    <span className="text-zinc-800 dark:text-zinc-200 block mt-0.5">
                      {session.session?.expiresAt
                        ? new Date(session.session.expiresAt).toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </div>

                <pre className="max-h-56 overflow-auto rounded-lg bg-zinc-950 p-3 text-left font-mono text-xs text-zinc-100 dark:bg-black border border-zinc-800">
                  {JSON.stringify(session, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <main className="w-full max-w-md space-y-6">
        {/* Global Notifications */}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="font-semibold">Error</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <p className="font-semibold">Success</p>
            <p className="mt-0.5">{successMessage}</p>
          </div>
        )}

        {sessionError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <p className="font-semibold">Session Warning</p>
            <p className="mt-0.5">
              {sessionError.message || "Failed to retrieve session."}
            </p>
          </div>
        )}

        {/* Card Container */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {isSessionPending ? (
            /* Loading Skeleton */
            <div className="p-8 space-y-4 animate-pulse">
              <div className="h-6 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 mx-auto" />
              <div className="h-4 w-3/4 rounded bg-zinc-100 dark:bg-zinc-850 mx-auto" />
              <div className="space-y-3 pt-4">
                <div className="h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          ) : (
            /* Logged-Out State: Tabs for Sign In & Sign Up */
            <div>
              {/* Tab Navigation */}
              <div className="grid grid-cols-2 border-b border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={`py-3.5 text-center text-sm font-medium transition cursor-pointer ${
                    mode === "signin"
                      ? "border-b-2 border-zinc-900 font-semibold text-zinc-900 dark:border-zinc-100 dark:text-zinc-50 bg-zinc-50/50 dark:bg-zinc-800/30"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={`py-3.5 text-center text-sm font-medium transition cursor-pointer ${
                    mode === "signup"
                      ? "border-b-2 border-zinc-900 font-semibold text-zinc-900 dark:border-zinc-100 dark:text-zinc-50 bg-zinc-50/50 dark:bg-zinc-800/30"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Form Content */}
              <div className="p-6 sm:p-8">
                {mode === "signin" ? (
                  /* Sign In Form */
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label
                        htmlFor="signin-email"
                        className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                      >
                        Email
                      </label>
                      <input
                        id="signin-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-300"
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label
                        htmlFor="signin-password"
                        className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                      >
                        Password
                      </label>
                      <input
                        id="signin-password"
                        type="password"
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-300"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="mt-2 flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {isSubmitting ? "Signing in..." : "Sign In"}
                    </button>

                    <p className="pt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signup")}
                        className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100 cursor-pointer"
                      >
                        Create one now
                      </button>
                    </p>
                  </form>
                ) : (
                  /* Sign Up Form */
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label
                        htmlFor="signup-name"
                        className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                      >
                        Name
                      </label>
                      <input
                        id="signup-name"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-300"
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label
                        htmlFor="signup-email"
                        className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                      >
                        Email
                      </label>
                      <input
                        id="signup-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-300"
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label
                        htmlFor="signup-password"
                        className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                      >
                        Password
                      </label>
                      <input
                        id="signup-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:ring-zinc-300"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="mt-2 flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {isSubmitting ? "Creating account..." : "Sign Up"}
                    </button>

                    <p className="pt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signin")}
                        className="font-semibold text-zinc-900 hover:underline dark:text-zinc-100 cursor-pointer"
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
