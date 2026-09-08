import { describe, it, expect, vi, afterEach } from "vitest";
import { probeUpstreamEndpoint } from "@/lib/s3/probe";
import { signS3Request } from "@/lib/s3/sigv4";

describe("S3 SigV4 Signer", () => {
  it("generates correct SigV4 headers for an S3 request", () => {
    const url = new URL("https://s3.us-east-1.amazonaws.com/");
    const date = new Date("2026-09-08T12:00:00.000Z");

    const signedHeaders = signS3Request({
      method: "GET",
      url,
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      date,
    });

    expect(signedHeaders["x-amz-date"]).toBe("20260908T120000Z");
    expect(signedHeaders["x-amz-content-sha256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(signedHeaders["authorization"]).toContain(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260908/us-east-1/s3/aws4_request",
    );
    expect(signedHeaders["authorization"]).toContain("Signature=");
  });
});

describe("S3 Upstream Endpoint Probe", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const validParams = {
    endpointUrl: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  };

  it("returns ok: true when upstream S3 responds with 200 OK", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<ListAllMyBucketsResult><Buckets></Buckets></ListAllMyBucketsResult>",
    } as unknown as Response);

    const result = await probeUpstreamEndpoint(validParams);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns descriptive error when signature does not match (invalid secret)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => `
        <Error>
          <Code>SignatureDoesNotMatch</Code>
          <Message>The request signature we calculated does not match the signature you provided.</Message>
        </Error>
      `,
    } as unknown as Response);

    const result = await probeUpstreamEndpoint(validParams);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signature does not match/i);
  });

  it("returns descriptive error when access key ID is invalid", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => `
        <Error>
          <Code>InvalidAccessKeyId</Code>
          <Message>The AWS Access Key Id you provided does not exist in our records.</Message>
        </Error>
      `,
    } as unknown as Response);

    const result = await probeUpstreamEndpoint(validParams);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid access key id/i);
  });

  it("returns descriptive error when network is unreachable (ENOTFOUND)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: getaddrinfo ENOTFOUND non-existent-endpoint.com"));

    const result = await probeUpstreamEndpoint({
      ...validParams,
      endpointUrl: "https://non-existent-endpoint.com",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/endpoint host could not be resolved/i);
  });

  it("returns descriptive error when connection is refused (ECONNREFUSED)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));

    const result = await probeUpstreamEndpoint({
      ...validParams,
      endpointUrl: "http://127.0.0.1:9000",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/connection refused/i);
  });

  it("returns descriptive error on invalid URL format", async () => {
    const result = await probeUpstreamEndpoint({
      ...validParams,
      endpointUrl: "not-a-valid-url",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid endpoint url/i);
  });
});
