import React from "react";
import { Badge, Card } from "@/app/components/ui";

export function ArchitectureSection() {
  return (
    <section id="architecture" className="scroll-mt-20 py-16 sm:py-20 border-t border-[#e6dfd8] bg-[#faf9f5]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="max-w-2xl space-y-3">
          <Badge variant="teal" size="sm">
            Architecture
          </Badge>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#141413]">
            Transparent 3-tier gateway proxy flow.
          </h2>
          <p className="text-sm sm:text-base text-[#3d3d3a] leading-relaxed">
            Downstream applications communicate with S3-Split using standard S3
            APIs. The gateway validates SigV4 signatures, verifies byte quotas
            against the PostgreSQL registry, and forwards authorized requests to
            your configured Upstream Accounts.
          </p>
        </div>

        {/* 3-Tier Architecture Diagram Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
          {/* Tier 1: Client Applications */}
          <Card className="p-6 sm:p-7 flex flex-col justify-between space-y-6 relative hover:border-[#cc785c]/40 transition-colors">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#6c6a64] uppercase tracking-wider">
                  Tier 1
                </span>
                <Badge variant="cream" size="sm">
                  Downstream Clients
                </Badge>
              </div>

              <h3 className="font-serif text-2xl font-medium text-[#141413]">
                Applications & SDKs
              </h3>

              <p className="text-xs text-[#3d3d3a] leading-relaxed">
                External microservices, web apps, data pipelines, and CLI tools
                interact through standard AWS SDKs using their assigned{" "}
                <strong className="text-[#141413]">Client Keys</strong>.
              </p>

              <ul className="space-y-2 text-xs text-[#6c6a64]">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cc785c]" />
                  <span>Standard SigV4 request headers</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cc785c]" />
                  <span>Custom endpoint: <code className="font-mono text-[#141413]">https://s3...</code></span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cc785c]" />
                  <span>Zero client code modifications</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-[#e6dfd8] bg-[#faf9f5] p-3 text-[11px] font-mono text-[#6c6a64]">
              <code>PUT /marketing-assets/doc.pdf</code>
            </div>
          </Card>

          {/* Tier 2: S3-Split Gateway Proxy (Highlighted) */}
          <Card className="p-6 sm:p-7 flex flex-col justify-between space-y-6 relative border-[#cc785c]/60 bg-[#efe9de] shadow-sm">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#cc785c] uppercase tracking-wider">
                  Tier 2 &bull; Core
                </span>
                <Badge variant="coral" size="sm">
                  S3-Split Gateway
                </Badge>
              </div>

              <h3 className="font-serif text-2xl font-medium text-[#141413]">
                Proxy & Quota Engine
              </h3>

              <p className="text-xs text-[#3d3d3a] leading-relaxed">
                Intercepts requests, validates signatures, maps{" "}
                <strong className="text-[#141413]">Managed Buckets</strong> to
                virtual prefixes, and rejects over-quota writes before touching
                storage.
              </p>

              <ul className="space-y-2 text-xs text-[#3d3d3a]">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5db8a6]" />
                  <span>Real-time byte quota verification</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5db8a6]" />
                  <span>Multipart upload part reservation</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5db8a6]" />
                  <span>PostgreSQL object registry sync</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-[#e6dfd8] bg-[#181715] p-3 text-[11px] font-mono text-[#faf9f5]">
              <span className="text-[#5db8a6]">✓ Quota Check:</span> 24MB &lt; 50MB
            </div>
          </Card>

          {/* Tier 3: Upstream Storage Providers */}
          <Card className="p-6 sm:p-7 flex flex-col justify-between space-y-6 relative hover:border-[#cc785c]/40 transition-colors">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#6c6a64] uppercase tracking-wider">
                  Tier 3
                </span>
                <Badge variant="cream" size="sm">
                  Upstream Storage
                </Badge>
              </div>

              <h3 className="font-serif text-2xl font-medium text-[#141413]">
                Upstream Accounts
              </h3>

              <p className="text-xs text-[#3d3d3a] leading-relaxed">
                Physical object storage infrastructure provided by AWS S3,
                Cloudflare R2, MinIO, or Wasabi with master credentials encrypted
                at rest.
              </p>

              <ul className="space-y-2 text-xs text-[#6c6a64]">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cc785c]" />
                  <span>AES-256-GCM encrypted credentials</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cc785c]" />
                  <span>Transparent virtual prefix routing</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#cc785c]" />
                  <span>Continuous baseline upstream scans</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-[#e6dfd8] bg-[#faf9f5] p-3 text-[11px] font-mono text-[#6c6a64]">
              <code>s3://corp-storage/tenants/t1/doc.pdf</code>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
