import React from "react";
import { Badge, type BadgeVariant } from "./badge";

export interface QuotaProgressState {
  barColor: string;
  badgeVariant: BadgeVariant;
  status: "healthy" | "warning" | "exceeded";
  label: string;
}

export function getQuotaColor(percentage: number): QuotaProgressState {
  if (percentage >= 100) {
    return {
      barColor: "bg-[#c64545]",
      badgeVariant: "crimson",
      status: "exceeded",
      label: "Quota Exceeded",
    };
  }
  if (percentage >= 75) {
    return {
      barColor: "bg-[#cc785c]",
      badgeVariant: "coral",
      status: "warning",
      label: "Approaching Quota",
    };
  }
  return {
    barColor: "bg-[#5db8a6]",
    badgeVariant: "teal",
    status: "healthy",
    label: "Within Quota",
  };
}

export interface ProgressProps {
  percentage: number;
  usedFormatted?: string;
  quotaFormatted?: string;
  showBadge?: boolean;
  showDetails?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function Progress({
  percentage,
  usedFormatted,
  quotaFormatted,
  showBadge = true,
  showDetails = true,
  className = "",
  size = "md",
}: ProgressProps) {
  const safePercentage = Math.max(0, percentage);
  const clampedWidth = Math.min(100, safePercentage);
  const quotaState = getQuotaColor(safePercentage);

  const trackHeight = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={`w-full space-y-2 ${className}`}>
      {(showDetails || showBadge) && (
        <div className="flex items-center justify-between text-xs">
          {showDetails && (
            <div className="flex items-center gap-1.5 font-mono text-[#3d3d3a]">
              {usedFormatted && quotaFormatted ? (
                <>
                  <span className="font-semibold text-[#141413]">
                    {usedFormatted}
                  </span>
                  <span className="text-[#6c6a64]">/</span>
                  <span className="text-[#6c6a64]">{quotaFormatted}</span>
                  <span className="text-[#8e8b82]">({safePercentage.toFixed(1)}%)</span>
                </>
              ) : (
                <span className="font-semibold text-[#141413]">
                  {safePercentage.toFixed(1)}% used
                </span>
              )}
            </div>
          )}

          {showBadge && (
            <Badge variant={quotaState.badgeVariant} size="sm" dot>
              {quotaState.label}
            </Badge>
          )}
        </div>
      )}

      {/* Progress Track */}
      <div
        role="progressbar"
        aria-valuenow={safePercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Storage quota usage"
        className={`w-full rounded-full bg-[#e6dfd8] overflow-hidden ${trackHeight}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${quotaState.barColor}`}
          style={{ width: `${clampedWidth}%` }}
        />
      </div>
    </div>
  );
}
