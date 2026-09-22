"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, CodeWindow } from "@/app/components/ui";

const HERO_CODE_SNIPPET = `// Drop-in AWS SDK v3 configuration
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "us-east-1",
  endpoint: "https://s3.your-domain.com",       // S3-Split Gateway
  credentials: {
    accessKeyId: "s3s_ck_live_9a7d2e4f1b8c",   // Client Key
    secretAccessKey: "s3s_sec_4f1b8c9a7d2e4f", // Secret Key
  },
});

// Real-time byte quotas enforced transparently
await s3.send(new PutObjectCommand({
  Bucket: "marketing-assets", // Managed Bucket (Virtual Prefix)
  Key: "documents/q3-summary.pdf",
  Body: fileStream,
}));`;

export function LandingHero() {
  return (
    <section className="relative overflow-hidden py-12 md:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Editorial Value Proposition */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2">
              <Badge variant="coral" size="sm">
                Next-Gen Storage Proxy
              </Badge>
              <span className="text-xs font-mono text-[#6c6a64]">
                SigV4 Compatible
              </span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-[#141413] leading-[1.08]">
              Partition S3 storage with strict real-time quotas.
            </h1>

            <p className="text-base sm:text-lg text-[#3d3d3a] leading-relaxed max-w-xl">
              S3-Split sits transparently between your applications and upstream
              S3 providers. Partition physical buckets into isolated virtual
              prefixes, issue client keys, and enforce byte-accurate storage
              quotas before writing a single byte upstream.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link href="/login?mode=signup">
                <Button variant="primary" size="md">
                  Get Started Free →
                </Button>
              </Link>
              <a href="#architecture">
                <Button variant="secondary" size="md">
                  View Architecture
                </Button>
              </a>
            </div>

            {/* Trust Micro-Metrics */}
            <div className="pt-6 border-t border-[#e6dfd8] grid grid-cols-3 gap-4">
              <div>
                <p className="font-serif text-2xl font-medium text-[#141413]">
                  100%
                </p>
                <p className="text-xs text-[#6c6a64]">S3 SDK Drop-in</p>
              </div>
              <div>
                <p className="font-serif text-2xl font-medium text-[#141413]">
                  0 bytes
                </p>
                <p className="text-xs text-[#6c6a64]">Quota Leaks</p>
              </div>
              <div>
                <p className="font-serif text-2xl font-medium text-[#141413]">
                  AWS &bull; R2
                </p>
                <p className="text-xs text-[#6c6a64]">Multi-Provider</p>
              </div>
            </div>
          </div>

          {/* Right Column: Dark Navy Code Window Chrome */}
          <div className="lg:col-span-6">
            <div className="relative">
              {/* Subtle Warm Backdrop Accent */}
              <div
                className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#cc785c]/10 via-[#e8a55a]/10 to-transparent blur-md -z-10"
                aria-hidden="true"
              />
              <CodeWindow
                title="app/storage.ts - Standard AWS SDK"
                language="typescript"
                code={HERO_CODE_SNIPPET}
                maxHeight="max-h-96"
                className="shadow-xl ring-1 ring-[#e6dfd8]/50"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
