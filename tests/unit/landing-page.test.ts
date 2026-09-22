import { describe, it, expect } from "vitest";
import {
  simulateQuotaEvaluation,
  SDK_INTEGRATION_TABS,
} from "@/app/components/landing/simulator-utils";

describe("Landing Page Components & Simulator Utilities", () => {
  describe("simulateQuotaEvaluation", () => {
    const quotaMb = 50; // 52,428,800 bytes

    it("evaluates a healthy upload (<75% of quota) correctly", () => {
      const result = simulateQuotaEvaluation(20, quotaMb);

      expect(result.objectSizeMb).toBe(20);
      expect(result.quotaMb).toBe(50);
      expect(result.percentage).toBe(40);
      expect(result.isAllowed).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.statusText).toBe("OK");
      expect(result.quotaState.badgeVariant).toBe("teal");
      expect(result.quotaState.label).toBe("Within Quota");
      expect(result.responsePayload).toContain("HTTP/1.1 200 OK");
      expect(result.responsePayload).toContain("x-s3split-quota-status: WithinQuota");
    });

    it("evaluates an approaching quota upload (75% - 99.9%) correctly", () => {
      const result = simulateQuotaEvaluation(40, quotaMb); // 80%

      expect(result.percentage).toBe(80);
      expect(result.isAllowed).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.statusText).toBe("OK");
      expect(result.quotaState.badgeVariant).toBe("coral");
      expect(result.quotaState.label).toBe("Approaching Quota");
      expect(result.responsePayload).toContain("HTTP/1.1 200 OK");
    });

    it("evaluates a quota breach (>= 100%) returning standard S3 403 QuotaExceeded XML", () => {
      const result = simulateQuotaEvaluation(60, quotaMb); // 120%

      expect(result.percentage).toBe(120);
      expect(result.isAllowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.statusText).toBe("Forbidden");
      expect(result.quotaState.badgeVariant).toBe("crimson");
      expect(result.quotaState.label).toBe("Quota Exceeded");
      expect(result.responsePayload).toContain("HTTP/1.1 403 Forbidden");
      expect(result.responsePayload).toContain("<Code>QuotaExceeded</Code>");
      expect(result.responsePayload).toContain("<BucketName>marketing-assets</BucketName>");
    });

    it("handles boundary condition when object size equals quota exactly", () => {
      const result = simulateQuotaEvaluation(50, quotaMb); // exactly 100%

      expect(result.percentage).toBe(100);
      expect(result.isAllowed).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.quotaState.badgeVariant).toBe("crimson"); // 100% hits crimson warning threshold
      expect(result.quotaState.label).toBe("Quota Exceeded");
    });

    it("handles boundary condition when object size exceeds quota by 1 MB", () => {
      const result = simulateQuotaEvaluation(51, quotaMb); // 102%

      expect(result.percentage).toBe(102);
      expect(result.isAllowed).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(result.responsePayload).toContain("<Code>QuotaExceeded</Code>");
    });
  });

  describe("SDK_INTEGRATION_TABS", () => {
    it("provides the four canonical S3 client configurations", () => {
      const ids = SDK_INTEGRATION_TABS.map((t) => t.id);
      expect(ids).toEqual(["typescript", "python", "go", "cli"]);
    });

    it("includes valid code and domain terms in every snippet", () => {
      for (const tab of SDK_INTEGRATION_TABS) {
        expect(tab.title).toBeTruthy();
        expect(tab.label).toBeTruthy();
        expect(tab.language).toBeTruthy();
        expect(tab.code.length).toBeGreaterThan(50);
        // Canonical vocabulary check
        expect(tab.code).toMatch(/marketing-assets|s3s_ck_|endpoint/i);
      }
    });

    it("demonstrates drop-in endpoint configuration across all samples", () => {
      const ts = SDK_INTEGRATION_TABS.find((t) => t.id === "typescript");
      expect(ts?.code).toContain("@aws-sdk/client-s3");
      expect(ts?.code).toContain("endpoint");

      const py = SDK_INTEGRATION_TABS.find((t) => t.id === "python");
      expect(py?.code).toContain("boto3");
      expect(py?.code).toContain("endpoint_url");

      const go = SDK_INTEGRATION_TABS.find((t) => t.id === "go");
      expect(go?.code).toContain("aws-sdk-go-v2");

      const cli = SDK_INTEGRATION_TABS.find((t) => t.id === "cli");
      expect(cli?.code).toContain("aws s3 cp");
    });
  });
});
