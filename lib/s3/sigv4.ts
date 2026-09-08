import crypto from "node:crypto";

export interface SignS3RequestOptions {
  method: string;
  url: URL;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  body?: string | Buffer;
  headers?: Record<string, string>;
  date?: Date;
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/**
 * Signs an HTTP request directed at an S3 endpoint using AWS Signature Version 4 (SigV4).
 */
export function signS3Request(options: SignS3RequestOptions): Record<string, string> {
  const {
    method,
    url,
    region,
    service = "s3",
    accessKeyId,
    secretAccessKey,
    body = "",
    date = new Date(),
  } = options;

  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256(body);

  const normalizedHeaders: Record<string, string> = {
    host: url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };

  if (options.headers) {
    for (const [key, val] of Object.entries(options.headers)) {
      normalizedHeaders[key.toLowerCase()] = val.trim();
    }
  }

  const sortedHeaderKeys = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders =
    sortedHeaderKeys
      .map((k) => `${k}:${normalizedHeaders[k]}\n`)
      .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalUri = url.pathname.length > 0 ? url.pathname : "/";

  // Build canonical query string (sorted key-values)
  const searchParams = new URLSearchParams(url.search);
  const sortedParams = Array.from(searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const canonicalQueryString = sortedParams
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
    )
    .join("&");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...normalizedHeaders,
    authorization,
  };
}

export interface ParsedSigV4Auth {
  algorithm: string;
  accessKeyId: string;
  dateStamp: string;
  region: string;
  service: string;
  signedHeaders: string[];
  signature: string;
}

const SIGV4_AUTH_REGEX =
  /^AWS4-HMAC-SHA256\s+Credential=([^,\s]+),\s*SignedHeaders=([^,\s]+),\s*Signature=([a-fA-F0-9]+)$/;

/**
 * Parses an AWS SigV4 Authorization header string.
 */
export function parseSigV4AuthHeader(authHeader: string | null): ParsedSigV4Auth | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(SIGV4_AUTH_REGEX);
  if (!match) {
    return null;
  }

  const [, credentialPart, signedHeadersPart, signaturePart] = match;
  const credentialParts = credentialPart.split("/");
  if (credentialParts.length !== 5 || credentialParts[4] !== "aws4_request") {
    return null;
  }

  const [accessKeyId, dateStamp, region, service] = credentialParts;
  const signedHeaders = signedHeadersPart
    .split(";")
    .map((h) => h.toLowerCase().trim())
    .filter(Boolean);

  return {
    algorithm: "AWS4-HMAC-SHA256",
    accessKeyId,
    dateStamp,
    region,
    service,
    signedHeaders,
    signature: signaturePart.toLowerCase().trim(),
  };
}

export interface VerifySigV4Options {
  method: string;
  url: URL;
  headers: Headers | Record<string, string>;
  body?: string | Buffer;
  secretAccessKey: string;
  auth: ParsedSigV4Auth;
}

export interface SigV4VerificationResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function getHeaderValue(
  headers: Headers | Record<string, string>,
  name: string,
): string | null {
  const lower = name.toLowerCase();
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) || headers.get(lower);
  }
  const rec = headers as Record<string, string>;
  return rec[name] ?? rec[lower] ?? null;
}

/**
 * Verifies the AWS Signature Version 4 on an incoming HTTP request.
 */
export function verifySigV4Signature(
  options: VerifySigV4Options,
): SigV4VerificationResult {
  const { method, url, headers, body = "", secretAccessKey, auth } = options;

  const amzDateHeader = getHeaderValue(headers, "x-amz-date");
  const dateHeader = getHeaderValue(headers, "date");
  const amzDate = amzDateHeader || dateHeader;

  if (!amzDate) {
    return {
      ok: false,
      code: "AccessDenied",
      message: "AWS request date header (x-amz-date or date) is required.",
    };
  }

  // Check date stamp matches credential date stamp
  const cleanAmzDate = amzDate.replace(/[:-]|\.\d{3}/g, "");
  if (!cleanAmzDate.startsWith(auth.dateStamp)) {
    return {
      ok: false,
      code: "SignatureDoesNotMatch",
      message: "Request date does not match credential date stamp.",
    };
  }

  // Build canonical headers
  let canonicalHeaders = "";
  for (const headerName of auth.signedHeaders) {
    const val = getHeaderValue(headers, headerName);
    if (val === null || val === undefined) {
      return {
        ok: false,
        code: "InvalidRequest",
        message: `Signed header '${headerName}' not present in request.`,
      };
    }
    // Collapse consecutive whitespace
    const normalizedVal = val.trim().replace(/\s+/g, " ");
    canonicalHeaders += `${headerName}:${normalizedVal}\n`;
  }
  const signedHeadersString = auth.signedHeaders.join(";");

  // Canonical URI
  const canonicalUri = url.pathname.length > 0 ? url.pathname : "/";

  // Canonical Query String
  const searchParams = new URLSearchParams(url.search);
  const sortedParams = Array.from(searchParams.entries()).sort(([aKey, aVal], [bKey, bVal]) => {
    const keyComp = aKey.localeCompare(bKey);
    if (keyComp !== 0) return keyComp;
    return aVal.localeCompare(bVal);
  });
  const canonicalQueryString = sortedParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  // Hashed Payload
  const contentSha256Header = getHeaderValue(headers, "x-amz-content-sha256");
  let payloadHash: string;

  if (contentSha256Header) {
    const trimmed = contentSha256Header.trim();
    if (
      trimmed === "UNSIGNED-PAYLOAD" ||
      trimmed === "STREAMING-AWS4-HMAC-SHA256-PAYLOAD"
    ) {
      payloadHash = trimmed;
    } else {
      if (body !== undefined && body !== null) {
        const computed = sha256(body);
        if (computed.toLowerCase() !== trimmed.toLowerCase()) {
          return {
            ok: false,
            code: "XAmzContentSHA256Mismatch",
            message:
              "The provided 'x-amz-content-sha256' does not match the computed payload hash.",
          };
        }
      }
      payloadHash = trimmed;
    }
  } else {
    payloadHash = sha256(body);
  }

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersString,
    payloadHash,
  ].join("\n");

  const credentialScope = `${auth.dateStamp}/${auth.region}/${auth.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    cleanAmzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, auth.dateStamp);
  const kRegion = hmac(kDate, auth.region);
  const kService = hmac(kRegion, auth.service);
  const kSigning = hmac(kService, "aws4_request");
  const expectedSignature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  try {
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    const providedBuf = Buffer.from(auth.signature, "hex");

    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      return {
        ok: false,
        code: "SignatureDoesNotMatch",
        message:
          "The request signature we calculated does not match the signature you provided.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "SignatureDoesNotMatch",
      message: "Invalid signature format.",
    };
  }

  return { ok: true };
}

/**
 * Generates an S3-compliant XML error payload and corresponding HTTP status code.
 */
export function buildS3XmlError(
  code: string,
  message: string,
  resource?: string,
  extra?: Record<string, string>,
): { body: string; status: number; headers: Record<string, string> } {
  let status = 400;
  switch (code) {
    case "AccessDenied":
    case "InvalidAccessKeyId":
    case "SignatureDoesNotMatch":
      status = 403;
      break;
    case "NoSuchKey":
    case "NoSuchBucket":
    case "NoSuchUpload":
      status = 404;
      break;
    case "MethodNotAllowed":
      status = 405;
      break;
    case "QuotaExceeded":
      status = 507; // RFC 4918 / WebDAV / S3 quota exceeded
      break;
    case "InternalError":
    case "BadGateway":
      status = code === "BadGateway" ? 502 : 500;
      break;
    default:
      status = 400;
  }

  const resourceTag = resource ? `  <Resource>${resource}</Resource>\n` : "";
  const extraTags = extra
    ? Object.entries(extra)
        .map(([k, v]) => `  <${k}>${v}</${k}>\n`)
        .join("")
    : "";

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>${code}</Code>
  <Message>${message}</Message>
${resourceTag}${extraTags}</Error>`;

  return {
    body,
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  };
}

