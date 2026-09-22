"use client";

import React, { useState } from "react";
import { Badge, Card, CodeWindow, Progress } from "@/app/components/ui";
import { simulateQuotaEvaluation } from "./simulator-utils";

export function QuotaSimulator() {
  const [objectSizeMb, setObjectSizeMb] = useState<number>(32);
  const quotaMb = 50;

  const result = simulateQuotaEvaluation(objectSizeMb, quotaMb);

  return (
    <section
      id="simulator"
      className="scroll-mt-20 py-16 sm:py-20 border-t border-[#e6dfd8] bg-[#faf9f5]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="max-w-2xl space-y-3">
          <Badge variant="coral" size="sm">
            Interactive Demonstration
          </Badge>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#141413]">
            Experience real-time byte quota enforcement.
          </h2>
          <p className="text-sm sm:text-base text-[#3d3d3a] leading-relaxed">
            Drag the slider to simulate an S3 <code className="font-mono text-[#141413]">PutObject</code> upload
            against a mock Managed Bucket with a 50 MB Storage Quota. Notice how
            the gateway calculates byte thresholds and returns S3-compliant
            responses instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Interactive Slider Card */}
          <Card className="lg:col-span-6 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-[#6c6a64] uppercase tracking-wider block">
                  Mock Managed Bucket
                </span>
                <span className="font-serif text-xl font-medium text-[#141413]">
                  marketing-assets
                </span>
              </div>
              <Badge variant="cream" size="sm">
                Virtual Prefix Bucket
              </Badge>
            </div>

            {/* Quota Progress Meter */}
            <div className="space-y-3 rounded-xl border border-[#e6dfd8] bg-[#faf9f5] p-4">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-[#6c6a64]">Storage Quota Meter</span>
                <span className="font-mono text-[#141413]">
                  Cap: {quotaMb} MB (52,428,800 B)
                </span>
              </div>

              <Progress
                percentage={result.percentage}
                usedFormatted={`${result.objectSizeMb.toFixed(1)} MB`}
                quotaFormatted={`${quotaMb} MB`}
                showBadge
                showDetails
                size="md"
              />
            </div>

            {/* Slider Control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="object-size-slider"
                  className="font-semibold text-[#141413]"
                >
                  Object Size to Upload:
                </label>
                <span className="font-mono text-sm font-bold text-[#cc785c]">
                  {objectSizeMb} MB{" "}
                  <span className="text-xs font-normal text-[#6c6a64]">
                    ({result.objectSizeBytes.toLocaleString()} bytes)
                  </span>
                </span>
              </div>

              <input
                id="object-size-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={objectSizeMb}
                onChange={(e) => setObjectSizeMb(Number(e.target.value))}
                className="w-full accent-[#cc785c] cursor-pointer h-2 rounded-lg bg-[#e6dfd8]"
              />

              <div className="flex justify-between text-[11px] font-mono text-[#8e8b82]">
                <span>0 MB</span>
                <span>25 MB (50%)</span>
                <span>50 MB (100%)</span>
                <span>75 MB</span>
                <span>100 MB</span>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-2 pt-2 border-t border-[#e6dfd8]">
              <span className="text-xs font-medium text-[#6c6a64] block">
                Quick Presets:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setObjectSizeMb(24)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    objectSizeMb === 24
                      ? "border-[#5db8a6] bg-[#5db8a6]/15 text-[#1e6155] font-semibold"
                      : "border-[#e6dfd8] bg-[#faf9f5] text-[#3d3d3a] hover:border-[#5db8a6]/40"
                  }`}
                >
                  Healthy (24 MB &bull; 48%)
                </button>
                <button
                  type="button"
                  onClick={() => setObjectSizeMb(42)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    objectSizeMb === 42
                      ? "border-[#cc785c] bg-[#cc785c]/15 text-[#8f4730] font-semibold"
                      : "border-[#e6dfd8] bg-[#faf9f5] text-[#3d3d3a] hover:border-[#cc785c]/40"
                  }`}
                >
                  Warning (42 MB &bull; 84%)
                </button>
                <button
                  type="button"
                  onClick={() => setObjectSizeMb(68)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    objectSizeMb === 68
                      ? "border-[#c64545] bg-[#c64545]/15 text-[#9a2c2c] font-semibold"
                      : "border-[#e6dfd8] bg-[#faf9f5] text-[#3d3d3a] hover:border-[#c64545]/40"
                  }`}
                >
                  Breached (68 MB &bull; 136%)
                </button>
              </div>
            </div>
          </Card>

          {/* Right Column: Simulated Gateway Response Inspector */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#141413]">
                  Simulated Gateway Response
                </span>
                <Badge
                  variant={result.isAllowed ? "teal" : "crimson"}
                  size="sm"
                  dot
                >
                  {result.statusCode} {result.statusText}
                </Badge>
              </div>
              <span className="text-xs font-mono text-[#6c6a64]">
                Protocol: S3 REST API
              </span>
            </div>

            <CodeWindow
              title={`Gateway Proxy Response - ${result.statusCode} ${result.statusText}`}
              language="http"
              code={result.responsePayload}
              maxHeight="max-h-[380px]"
              className="shadow-lg"
            />

            <div
              className={`rounded-xl border p-4 text-xs ${
                result.isAllowed
                  ? "border-[#5db8a6]/40 bg-[#5db8a6]/10 text-[#1e6155]"
                  : "border-[#c64545]/40 bg-[#c64545]/10 text-[#9a2c2c]"
              }`}
            >
              <p className="font-semibold">
                {result.isAllowed
                  ? "✓ Upload Allowed: Within Storage Quota"
                  : "✗ Upload Rejected: Quota Exceeded"}
              </p>
              <p className="mt-1 text-xs opacity-90 leading-relaxed">
                {result.isAllowed
                  ? "The object fits within the allocated 50 MB byte quota. S3-Split proxies the payload upstream and writes an indexed Managed Object record to PostgreSQL."
                  : "The upload exceeds the 50 MB limit. S3-Split rejects the request immediately before upstream transmission, preventing runaway billing."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
