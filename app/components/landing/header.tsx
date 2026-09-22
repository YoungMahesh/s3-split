"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Badge, Button } from "@/app/components/ui";

export function RadialSpikeMark({
  className = "h-5 w-5 text-[#141413]",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" />
    </svg>
  );
}

export function LandingHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[#e6dfd8] bg-[#faf9f5]/95 backdrop-blur-xs">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <RadialSpikeMark className="h-5 w-5 text-[#141413]" />
          <div className="flex items-center gap-2.5">
            <span className="font-serif text-xl font-medium tracking-tight text-[#141413]">
              S3-Split
            </span>
            <Badge variant="coral" size="sm">
              Storage Gateway
            </Badge>
          </div>
        </Link>

        {/* Desktop Navigation Jump Links */}
        <nav
          className="hidden md:flex items-center gap-6 text-xs font-medium text-[#6c6a64]"
          aria-label="Landing Navigation"
        >
          <a
            href="#architecture"
            className="transition-colors hover:text-[#141413]"
          >
            Architecture
          </a>
          <a
            href="#features"
            className="transition-colors hover:text-[#141413]"
          >
            Capabilities
          </a>
          <a
            href="#integration"
            className="transition-colors hover:text-[#141413]"
          >
            SDK Integration
          </a>
          <a
            href="#simulator"
            className="transition-colors hover:text-[#141413]"
          >
            Quota Simulator
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {session?.user ? (
            <Link href="/dashboard">
              <Button variant="primary" size="sm">
                Go to Dashboard →
              </Button>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs font-medium text-[#6c6a64] hover:text-[#141413] px-2 py-1 transition-colors"
              >
                Sign In
              </Link>
              <Link href="/login?mode=signup">
                <Button variant="primary" size="sm">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
