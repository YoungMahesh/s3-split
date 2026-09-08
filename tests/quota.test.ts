import { describe, it, expect } from "vitest";
import {
  parseQuotaToBytes,
  formatBytes,
  calculateQuotaProgress,
  type StorageQuotaUnit,
} from "@/lib/quota";

describe("Quota Utilities", () => {
  describe("parseQuotaToBytes", () => {
    it("converts MB to bytes correctly", () => {
      expect(parseQuotaToBytes(1, "MB")).toBe(1024 * 1024);
      expect(parseQuotaToBytes(500, "MB")).toBe(500 * 1024 * 1024);
    });

    it("converts GB to bytes correctly", () => {
      expect(parseQuotaToBytes(1, "GB")).toBe(1024 * 1024 * 1024);
      expect(parseQuotaToBytes(5, "GB")).toBe(5 * 1024 * 1024 * 1024);
    });

    it("converts TB to bytes correctly", () => {
      expect(parseQuotaToBytes(1, "TB")).toBe(1024 * 1024 * 1024 * 1024);
      expect(parseQuotaToBytes(2, "TB")).toBe(2 * 1024 * 1024 * 1024 * 1024);
    });

    it("throws error on negative or zero quota values", () => {
      expect(() => parseQuotaToBytes(0, "GB")).toThrow(/greater than zero/i);
      expect(() => parseQuotaToBytes(-10, "MB")).toThrow(/greater than zero/i);
    });

    it("throws error on unsupported unit", () => {
      expect(() => parseQuotaToBytes(10, "KB" as StorageQuotaUnit)).toThrow(/unsupported unit/i);
    });
  });

  describe("formatBytes", () => {
    it("formats 0 bytes as 0 B", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("formats bytes, KB, MB, GB, TB with sensible precision", () => {
      expect(formatBytes(500)).toBe("500 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1048576)).toBe("1 MB");
      expect(formatBytes(1073741824)).toBe("1 GB");
      expect(formatBytes(1099511627776)).toBe("1 TB");
    });
  });

  describe("calculateQuotaProgress", () => {
    it("returns 0% when usedBytes is 0", () => {
      const quota = 100 * 1024 * 1024; // 100 MB
      const result = calculateQuotaProgress(0, quota);
      expect(result.percentage).toBe(0);
      expect(result.isExceeded).toBe(false);
      expect(result.status).toBe("active");
      expect(result.formattedUsed).toBe("0 B");
      expect(result.formattedQuota).toBe("100 MB");
    });

    it("calculates accurate percentage when within quota", () => {
      const quota = 1000;
      const used = 450;
      const result = calculateQuotaProgress(used, quota);
      expect(result.percentage).toBe(45);
      expect(result.isExceeded).toBe(false);
      expect(result.status).toBe("active");
    });

    it("identifies boundary at exact quota (100%)", () => {
      const quota = 1000;
      const used = 1000;
      const result = calculateQuotaProgress(used, quota);
      expect(result.percentage).toBe(100);
      expect(result.isExceeded).toBe(false);
      expect(result.status).toBe("active");
    });

    it("identifies quota exceeded when usedBytes exceeds quotaBytes", () => {
      const quota = 1000;
      const used = 1001;
      const result = calculateQuotaProgress(used, quota);
      expect(result.percentage).toBe(100.1);
      expect(result.isExceeded).toBe(true);
      expect(result.status).toBe("quota_exceeded");
    });

    it("handles zero or negative quota safely", () => {
      const result = calculateQuotaProgress(500, 0);
      expect(result.percentage).toBe(100);
      expect(result.isExceeded).toBe(true);
      expect(result.status).toBe("quota_exceeded");
    });
  });
});
