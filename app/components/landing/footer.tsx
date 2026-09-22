import React from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/app/components/ui";
import { RadialSpikeMark } from "./header";

export function LandingFooter() {
  return (
    <footer className="border-t border-[#e6dfd8] bg-[#faf9f5] pt-16 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Pre-Footer CTA Banner Card */}
        <Card className="p-8 sm:p-12 text-center space-y-6 border-[#cc785c]/40 bg-[#efe9de] shadow-sm relative overflow-hidden">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#141413]">
              Start partitioning S3 storage with hard quotas today.
            </h2>
            <p className="text-sm sm:text-base text-[#3d3d3a] leading-relaxed">
              Connect your existing AWS S3, Cloudflare R2, or MinIO account in
              seconds. Generate scoped Client Keys and enforce strict byte
              allocations across all your tenants.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link href="/login?mode=signup">
              <Button variant="primary" size="md">
                Get Started Free →
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" size="md">
                Sign In to Console
              </Button>
            </Link>
          </div>
        </Card>

        {/* Footer Meta & Navigation */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-6 border-t border-[#e6dfd8]">
          <div className="flex items-center gap-3">
            <RadialSpikeMark className="h-5 w-5 text-[#141413]" />
            <span className="font-serif text-lg font-medium text-[#141413]">
              S3-Split
            </span>
            <span className="text-xs text-[#6c6a64]">&bull;</span>
            <span className="text-xs text-[#6c6a64]">
              Multi-Tenant Storage Gateway
            </span>
          </div>

          {/* Quick Anchor Links */}
          <div className="flex flex-wrap items-center gap-6 text-xs text-[#6c6a64]">
            <a
              href="#architecture"
              className="hover:text-[#141413] transition-colors"
            >
              Architecture
            </a>
            <a
              href="#features"
              className="hover:text-[#141413] transition-colors"
            >
              Capabilities
            </a>
            <a
              href="#integration"
              className="hover:text-[#141413] transition-colors"
            >
              SDK Integration
            </a>
            <a
              href="#simulator"
              className="hover:text-[#141413] transition-colors"
            >
              Quota Simulator
            </a>
          </div>

          {/* Operational Status */}
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#5db8a6]" />
            <span className="text-xs font-mono text-[#6c6a64]">
              Gateway Proxy Operational
            </span>
          </div>
        </div>

        <div className="text-center text-xs text-[#8e8b82]">
          &copy; {new Date().getFullYear()} S3-Split. Built on the Claude Editorial Design System.
        </div>
      </div>
    </footer>
  );
}
