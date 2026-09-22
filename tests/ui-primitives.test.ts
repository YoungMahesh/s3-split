import { describe, it, expect } from "vitest";
import { getQuotaColor } from "@/app/components/ui/progress";
import {
  generateCurlSnippet,
  generateAllSnippets,
  type SnippetOptions,
} from "@/lib/snippets";
import fs from "node:fs";
import path from "node:path";

describe("UI Primitives & Design System", () => {
  describe("Progress Quota Encoding (getQuotaColor)", () => {
    it("returns accent teal and healthy status for quota usage below 75%", () => {
      const state0 = getQuotaColor(0);
      expect(state0.barColor).toBe("bg-[#5db8a6]");
      expect(state0.badgeVariant).toBe("teal");
      expect(state0.status).toBe("healthy");
      expect(state0.label).toBe("Within Quota");

      const state50 = getQuotaColor(50);
      expect(state50.barColor).toBe("bg-[#5db8a6]");
      expect(state50.badgeVariant).toBe("teal");
      expect(state50.status).toBe("healthy");

      const state74 = getQuotaColor(74.9);
      expect(state74.barColor).toBe("bg-[#5db8a6]");
      expect(state74.status).toBe("healthy");
    });

    it("returns warm coral and warning status for quota usage between 75% and 99.9%", () => {
      const state75 = getQuotaColor(75);
      expect(state75.barColor).toBe("bg-[#cc785c]");
      expect(state75.badgeVariant).toBe("coral");
      expect(state75.status).toBe("warning");
      expect(state75.label).toBe("Approaching Quota");

      const state90 = getQuotaColor(90);
      expect(state90.barColor).toBe("bg-[#cc785c]");
      expect(state90.status).toBe("warning");

      const state99 = getQuotaColor(99.9);
      expect(state99.barColor).toBe("bg-[#cc785c]");
      expect(state99.status).toBe("warning");
    });

    it("returns muted crimson and exceeded status for quota usage at or above 100%", () => {
      const state100 = getQuotaColor(100);
      expect(state100.barColor).toBe("bg-[#c64545]");
      expect(state100.badgeVariant).toBe("crimson");
      expect(state100.status).toBe("exceeded");
      expect(state100.label).toBe("Quota Exceeded");

      const state150 = getQuotaColor(150);
      expect(state150.barColor).toBe("bg-[#c64545]");
      expect(state150.badgeVariant).toBe("crimson");
      expect(state150.status).toBe("exceeded");
    });
  });

  describe("Integration Snippets (Curl Generator)", () => {
    const opts: SnippetOptions = {
      endpointUrl: "http://localhost:3000/api/s3",
      bucketName: "my-bucket",
      accessKeyId: "SPLIT12345EXAMPLE",
      secretAccessKey: "secret1234567890abcdef",
      region: "us-east-1",
    };

    it("generates SigV4 signed curl command for GET and PUT", () => {
      const snippet = generateCurlSnippet(opts);
      expect(snippet).toContain('curl -X GET "http://localhost:3000/api/s3/my-bucket/"');
      expect(snippet).toContain('--aws-sigv4 "aws:amz:us-east-1:s3"');
      expect(snippet).toContain('--user "SPLIT12345EXAMPLE:secret1234567890abcdef"');
      expect(snippet).toContain('curl -X PUT "http://localhost:3000/api/s3/my-bucket/example.txt"');
    });

    it("generateAllSnippets includes all formats including curl", () => {
      const all = generateAllSnippets(opts);
      expect(all.env).toBeDefined();
      expect(all.node).toBeDefined();
      expect(all.python).toBeDefined();
      expect(all.awsCli).toBeDefined();
      expect(all.curl).toBeDefined();
      expect(all.curl).toContain("--aws-sigv4");
    });
  });

  describe("Light-Mode Governance (Zero dark:* classes in app)", () => {
    function getFiles(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          getFiles(filePath, fileList);
        } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          fileList.push(filePath);
        }
      }
      return fileList;
    }

    it("ensures no dark:* Tailwind pseudo-classes exist in any app TSX/TS file", () => {
      const appDir = path.resolve(__dirname, "../app");
      const appFiles = getFiles(appDir);
      const darkRegex = /\bdark:[a-zA-Z0-9_-]+/;

      const violatingFiles: { file: string; line: number; match: string }[] = [];

      for (const file of appFiles) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");
        lines.forEach((line, index) => {
          const match = line.match(darkRegex);
          if (match) {
            violatingFiles.push({
              file: path.relative(path.resolve(__dirname, ".."), file),
              line: index + 1,
              match: match[0],
            });
          }
        });
      }

      expect(violatingFiles).toEqual([]);
    });
  });
});
