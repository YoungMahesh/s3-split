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
