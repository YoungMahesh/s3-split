export type StorageQuotaUnit = "MB" | "GB" | "TB";

export interface QuotaProgressResult {
  percentage: number;
  isExceeded: boolean;
  status: "active" | "quota_exceeded";
  formattedUsed: string;
  formattedQuota: string;
}

const UNIT_MULTIPLIERS: Record<StorageQuotaUnit, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

/**
 * Converts human quota input (e.g. 5, "GB") into total bytes.
 */
export function parseQuotaToBytes(value: number, unit: StorageQuotaUnit): number {
  if (value <= 0 || !Number.isFinite(value)) {
    throw new Error("Storage quota value must be greater than zero.");
  }

  const multiplier = UNIT_MULTIPLIERS[unit];
  if (!multiplier) {
    throw new Error(`Unsupported unit '${unit}'. Supported units are MB, GB, TB.`);
  }

  return Math.round(value * multiplier);
}

/**
 * Formats a byte count into a readable human format (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const clampedIndex = Math.min(i, sizes.length - 1);

  if (clampedIndex === 0) {
    return `${bytes} B`;
  }

  const val = bytes / Math.pow(k, clampedIndex);
  // If exact integer or decimals requested
  const formatted = val % 1 === 0 ? val.toString() : val.toFixed(decimals);
  return `${formatted} ${sizes[clampedIndex]}`;
}

/**
 * Calculates percentage usage, status, and display strings for a quota.
 */
export function calculateQuotaProgress(
  usedBytes: number,
  quotaBytes: number,
): QuotaProgressResult {
  const safeUsed = Math.max(0, usedBytes || 0);

  if (quotaBytes <= 0) {
    return {
      percentage: 100,
      isExceeded: true,
      status: "quota_exceeded",
      formattedUsed: formatBytes(safeUsed),
      formattedQuota: formatBytes(0),
    };
  }

  const rawPercent = (safeUsed / quotaBytes) * 100;
  // Round to at most 1 decimal place
  const percentage = Math.round(rawPercent * 10) / 10;
  const isExceeded = safeUsed > quotaBytes;
  const status: "active" | "quota_exceeded" = isExceeded ? "quota_exceeded" : "active";

  return {
    percentage,
    isExceeded,
    status,
    formattedUsed: formatBytes(safeUsed),
    formattedQuota: formatBytes(quotaBytes),
  };
}
