"use client";

import React, { useState } from "react";
import { Badge, CodeWindow } from "@/app/components/ui";
import { SDK_INTEGRATION_TABS } from "./simulator-utils";

export function SdkShowcase() {
  const [activeTabId, setActiveTabId] = useState(SDK_INTEGRATION_TABS[0].id);

  const activeTab =
    SDK_INTEGRATION_TABS.find((t) => t.id === activeTabId) ||
    SDK_INTEGRATION_TABS[0];

  return (
    <section
      id="integration"
      className="scroll-mt-20 py-16 sm:py-20 border-t border-[#e6dfd8] bg-[#faf9f5]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Section Header */}
        <div className="max-w-2xl space-y-3">
          <Badge variant="teal" size="sm">
            SDK Integration
          </Badge>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-[#141413]">
            Works with any standard S3 client.
          </h2>
          <p className="text-sm sm:text-base text-[#3d3d3a] leading-relaxed">
            No proprietary libraries or SDK wrappers. Point standard AWS SDKs,
            Boto3, or the AWS CLI to your S3-Split gateway endpoint and supply
            your tenant Client Key.
          </p>
        </div>

        {/* Integration Code Window with Language Tabs */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            {/* Custom Tab Selector */}
            <div className="flex items-center gap-1.5 rounded-xl border border-[#e6dfd8] bg-[#efe9de] p-1 shadow-xs">
              {SDK_INTEGRATION_TABS.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#faf9f5] text-[#141413] shadow-xs font-semibold"
                        : "text-[#6c6a64] hover:text-[#141413]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[#6c6a64]">
              <span className="h-2 w-2 rounded-full bg-[#5db8a6]" />
              <span>Full SigV4 Authentication Verified</span>
            </div>
          </div>

          <CodeWindow
            title={activeTab.title}
            language={activeTab.language}
            code={activeTab.code}
            maxHeight="max-h-[440px]"
            className="shadow-lg ring-1 ring-[#e6dfd8]/60"
          />

          {/* Key Integration Takeaways */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="rounded-xl border border-[#e6dfd8] bg-[#efe9de]/60 p-4">
              <span className="text-xs font-bold text-[#141413] block">
                1. Custom Endpoint
              </span>
              <p className="text-xs text-[#6c6a64] mt-1">
                Point <code className="font-mono text-[#141413]">endpoint</code> to your S3-Split gateway URL.
              </p>
            </div>
            <div className="rounded-xl border border-[#e6dfd8] bg-[#efe9de]/60 p-4">
              <span className="text-xs font-bold text-[#141413] block">
                2. Scoped Client Keys
              </span>
              <p className="text-xs text-[#6c6a64] mt-1">
                Authenticate with generated <code className="font-mono text-[#141413]">s3s_ck_...</code> keypairs.
              </p>
            </div>
            <div className="rounded-xl border border-[#e6dfd8] bg-[#efe9de]/60 p-4">
              <span className="text-xs font-bold text-[#141413] block">
                3. Zero Code Changes
              </span>
              <p className="text-xs text-[#6c6a64] mt-1">
                Keep existing upload pipelines, multipart logic, and metadata headers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
