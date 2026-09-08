import { signS3Request } from "./sigv4";
import type { UpstreamCredentials } from "./probe";

export interface CrawledObject {
  key: string;
  sizeBytes: number;
  etag: string | null;
  lastModified: Date | null;
}

export interface ParseListResult {
  objects: CrawledObject[];
  isTruncated: boolean;
  nextContinuationToken: string | null;
}

export interface CrawlBucketOptions {
  credentials: UpstreamCredentials;
  upstreamBucket: string;
  prefix?: string;
}

export type CrawlResult =
  | {
      ok: true;
      objects: CrawledObject[];
      totalBytes: number;
    }
  | {
      ok: false;
      error: string;
    };

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Parses an S3 ListObjectsV2 XML response into structured objects.
 * When a prefix is provided, it strips the prefix from the returned key
 * and ignores empty folder placeholder markers.
 */
export function parseListObjectsV2Response(
  xml: string,
  prefix?: string,
): ParseListResult {
  const isTruncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const nextContinuationTokenMatch = xml.match(
    /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/i,
  );
  const nextContinuationToken = nextContinuationTokenMatch
    ? nextContinuationTokenMatch[1].trim()
    : null;

  const objects: CrawledObject[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/gi;
  let match: RegExpExecArray | null;

  while ((match = contentsRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const keyMatch = itemXml.match(/<Key>([\s\S]*?)<\/Key>/i);
    const sizeMatch = itemXml.match(/<Size>(\d+)<\/Size>/i);
    const etagMatch = itemXml.match(/<ETag>([\s\S]*?)<\/ETag>/i);
    const lastModifiedMatch = itemXml.match(/<LastModified>([\s\S]*?)<\/LastModified>/i);

    if (keyMatch && sizeMatch) {
      const rawKey = keyMatch[1].trim();
      const sizeBytes = parseInt(sizeMatch[1].trim(), 10) || 0;
      const rawEtag = etagMatch
        ? etagMatch[1]
            .trim()
            .replace(/^&quot;|&quot;$/g, "")
            .replace(/^"|"$/g, "")
        : null;
      const lastModified = lastModifiedMatch
        ? new Date(lastModifiedMatch[1].trim())
        : null;

      let key = rawKey;
      if (prefix) {
        if (rawKey.startsWith(prefix)) {
          key = rawKey.slice(prefix.length);
          // If the relative key is empty (i.e. directory placeholder), skip it
          if (key.length === 0) {
            continue;
          }
        } else {
          // Object key does not match virtual prefix
          continue;
        }
      }

      objects.push({
        key,
        sizeBytes,
        etag: rawEtag,
        lastModified,
      });
    }
  }

  return { objects, isTruncated, nextContinuationToken };
}

/**
 * Crawls an upstream bucket or prefix via ListObjectsV2 across all paginated pages.
 * Populates baseline objects and calculates total used bytes.
 */
export async function crawlUpstreamBucket(
  options: CrawlBucketOptions,
): Promise<CrawlResult> {
  const { credentials, upstreamBucket, prefix } = options;
  const { endpointUrl, region, accessKeyId, secretAccessKey } = credentials;

  let baseUrl: URL;
  try {
    baseUrl = new URL(endpointUrl);
  } catch {
    return { ok: false, error: "Invalid upstream endpoint URL format." };
  }

  const allObjects: CrawledObject[] = [];
  let continuationToken: string | null = null;
  let isTruncated = true;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safeguard against runaway pagination

  try {
    while (isTruncated && pageCount < MAX_PAGES) {
      pageCount++;

      const url = new URL(baseUrl.toString());
      // Path-style: /:upstreamBucket
      url.pathname = `/${encodeURIComponent(upstreamBucket)}`;
      url.searchParams.set("list-type", "2");

      if (prefix) {
        url.searchParams.set("prefix", prefix);
      }

      if (continuationToken) {
        url.searchParams.set("continuation-token", continuationToken);
      }

      const signedHeaders = signS3Request({
        method: "GET",
        url,
        region,
        accessKeyId,
        secretAccessKey,
      });

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: signedHeaders,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        const code = extractXmlTag(bodyText, "Code");
        const message = extractXmlTag(bodyText, "Message");

        if (code === "NoSuchBucket" || response.status === 404) {
          return {
            ok: false,
            error: `Upstream bucket '${upstreamBucket}' does not exist on this provider.`,
          };
        }

        if (code === "AccessDenied" || response.status === 403) {
          return {
            ok: false,
            error: `Access denied to upstream bucket '${upstreamBucket}': ${message || "Check your credentials and permissions."}`,
          };
        }

        return {
          ok: false,
          error: `Upstream crawl failed with status ${response.status} (${code || "Error"}): ${message || bodyText.slice(0, 100)}`,
        };
      }

      const responseXml = await response.text();
      const pageResult = parseListObjectsV2Response(responseXml, prefix);

      allObjects.push(...pageResult.objects);
      isTruncated = pageResult.isTruncated;
      continuationToken = pageResult.nextContinuationToken;

      if (!continuationToken) {
        isTruncated = false;
      }
    }

    const totalBytes = allObjects.reduce((acc, obj) => acc + obj.sizeBytes, 0);

    return {
      ok: true,
      objects: allObjects,
      totalBytes,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (
      (err as { name?: string }).name === "TimeoutError" ||
      (err as { name?: string }).name === "AbortError"
    ) {
      return {
        ok: false,
        error: "Upstream storage crawl timed out after 15 seconds.",
      };
    }

    return {
      ok: false,
      error: `Failed to crawl upstream storage: ${message}`,
    };
  }
}
