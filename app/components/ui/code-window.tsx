"use client";

import React, { useState } from "react";

export interface CodeTab {
  id: string;
  label: string;
  code: string;
}

export interface CodeWindowProps {
  title?: string;
  code?: string;
  tabs?: CodeTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  language?: string;
  className?: string;
  maxHeight?: string;
}

export function CodeWindow({
  title,
  code,
  tabs,
  activeTabId,
  onTabChange,
  language,
  className = "",
  maxHeight = "max-h-72",
}: CodeWindowProps) {
  const [internalTabId, setInternalTabId] = useState(tabs?.[0]?.id || "");
  const [copied, setCopied] = useState(false);

  const currentTabId = activeTabId !== undefined ? activeTabId : internalTabId;
  const currentCode = tabs
    ? tabs.find((t) => t.id === currentTabId)?.code || ""
    : code || "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleTabClick = (tabId: string) => {
    if (onTabChange) {
      onTabChange(tabId);
    } else {
      setInternalTabId(tabId);
    }
  };

  return (
    <div
      className={`rounded-xl border border-[#252320] bg-[#181715] text-[#faf9f5] overflow-hidden shadow-md font-mono ${className}`}
    >
      {/* Chrome Top Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#252320] bg-[#181715] px-4 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          {/* Subtle Window Dots */}
          <div className="flex items-center gap-1.5 mr-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#383530]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#383530]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#383530]" />
          </div>

          {title && (
            <span className="text-xs font-semibold text-[#a09d96]">
              {title}
            </span>
          )}

          {/* Tabs */}
          {tabs && tabs.length > 0 && (
            <div className="flex items-center gap-1 bg-[#252320] p-0.5 rounded-lg">
              {tabs.map((tab) => {
                const isActive = tab.id === currentTabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabClick(tab.id)}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#cc785c] text-white font-semibold"
                        : "text-[#a09d96] hover:text-[#faf9f5]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {language && (
            <span className="text-[11px] text-[#6c6a64] uppercase tracking-wider font-semibold">
              {language}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#cc785c] hover:text-[#e8a55a] transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Display Area */}
      <pre
        className={`bg-[#1f1e1b] p-4 text-xs font-mono text-[#faf9f5] overflow-x-auto whitespace-pre leading-relaxed select-all ${maxHeight}`}
      >
        <code>{currentCode}</code>
      </pre>
    </div>
  );
}
