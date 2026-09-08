import { signS3Request } from "./sigv4";

export interface UpstreamCredentials {
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ProbeResult {
  ok: boolean;
  error?: string;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, "is");
  const match = xml.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Actively probes an external S3 endpoint by sending a signed ListBuckets request.
 * Verifies connectivity, endpoint existence, and credential validity.
 */
export async function probeUpstreamEndpoint(
  credentials: UpstreamCredentials,
): Promise<ProbeResult> {
  const { endpointUrl, region, accessKeyId, secretAccessKey } = credentials;

  let url: URL;
  try {
    url = new URL(endpointUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        error: "Invalid endpoint URL: Protocol must be http:// or https://",
      };
    }
  } catch {
    return {
      ok: false,
      error: "Invalid endpoint URL format. Please provide a valid URL.",
    };
  }

  // Ensure path is "/" for probing bucket listing / account level connectivity
  url.pathname = "/";
  url.search = "";

  try {
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
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { ok: true };
    }

    const responseBody = await response.text();
    const code = extractXmlTag(responseBody, "Code");
    const message = extractXmlTag(responseBody, "Message");

    if (code === "SignatureDoesNotMatch") {
      return {
        ok: false,
        error:
          "Upstream authentication failed: Signature does not match. Please verify your Secret Access Key.",
      };
    }

    if (code === "InvalidAccessKeyId") {
      return {
        ok: false,
        error:
          "Upstream authentication failed: Invalid Access Key ID. The key does not exist.",
      };
    }

    if (code === "AccessDenied") {
      return {
        ok: false,
        error: `Upstream authorization failed: Access Denied (${message || "Credentials lack permissions for this endpoint"}).`,
      };
    }

    if (code) {
      return {
        ok: false,
        error: `Upstream error (${code}): ${message || "Probe request rejected"}`,
      };
    }

    return {
      ok: false,
      error: `Upstream returned HTTP ${response.status} ${response.statusText}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (
      (err as { name?: string }).name === "TimeoutError" ||
      (err as { name?: string }).name === "AbortError"
    ) {
      return {
        ok: false,
        error: "Connection to upstream endpoint timed out after 10 seconds.",
      };
    }

    if (/ENOTFOUND|getaddrinfo/i.test(message)) {
      return {
        ok: false,
        error:
          "Endpoint host could not be resolved. Please verify the Endpoint URL.",
      };
    }

    if (/ECONNREFUSED/i.test(message)) {
      return {
        ok: false,
        error:
          "Connection refused at endpoint. Ensure the S3 service is reachable.",
      };
    }

    return {
      ok: false,
      error: `Connection probe failed: ${message}`,
    };
  }
}
