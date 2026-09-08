import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseListObjectsV2Response,
  crawlUpstreamBucket,
} from "@/lib/s3/crawl";

describe("S3 Crawler & Parser", () => {
  describe("parseListObjectsV2Response", () => {
    it("parses an empty bucket listing response", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>my-bucket</Name>
    <Prefix></Prefix>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <KeyCount>0</KeyCount>
</ListBucketResult>`;

      const result = parseListObjectsV2Response(xml);
      expect(result.objects).toEqual([]);
      expect(result.isTruncated).toBe(false);
      expect(result.nextContinuationToken).toBeNull();
    });

    it("parses multiple objects with keys, sizes, etags, and dates", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>my-bucket</Name>
    <Prefix></Prefix>
    <MaxKeys>1000</MaxKeys>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>folder/photo.jpg</Key>
        <LastModified>2026-09-08T14:30:00.000Z</LastModified>
        <ETag>&quot;9badd5b217f4439644d5d9edd48c34ec&quot;</ETag>
        <Size>204800</Size>
        <StorageClass>STANDARD</StorageClass>
    </Contents>
    <Contents>
        <Key>notes.txt</Key>
        <LastModified>2026-09-08T15:00:00.000Z</LastModified>
        <ETag>"c81e728d9d4c2f636f067f89cc14862c"</ETag>
        <Size>512</Size>
        <StorageClass>STANDARD</StorageClass>
    </Contents>
</ListBucketResult>`;

      const result = parseListObjectsV2Response(xml);
      expect(result.objects).toHaveLength(2);
      expect(result.objects[0]).toEqual({
        key: "folder/photo.jpg",
        sizeBytes: 204800,
        etag: "9badd5b217f4439644d5d9edd48c34ec",
        lastModified: new Date("2026-09-08T14:30:00.000Z"),
      });
      expect(result.objects[1]).toEqual({
        key: "notes.txt",
        sizeBytes: 512,
        etag: "c81e728d9d4c2f636f067f89cc14862c",
        lastModified: new Date("2026-09-08T15:00:00.000Z"),
      });
      expect(result.isTruncated).toBe(false);
      expect(result.nextContinuationToken).toBeNull();
    });

    it("strips prefix and ignores folder markers when virtual prefix is supplied", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>shared-bucket</Name>
    <Prefix>split/mb-test-123/</Prefix>
    <Contents>
        <Key>split/mb-test-123/</Key>
        <LastModified>2026-09-08T12:00:00.000Z</LastModified>
        <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
        <Size>0</Size>
    </Contents>
    <Contents>
        <Key>split/mb-test-123/data/records.csv</Key>
        <LastModified>2026-09-08T12:10:00.000Z</LastModified>
        <ETag>"e3b0c44298fc1c149afbf4c8996fb924"</ETag>
        <Size>4096</Size>
    </Contents>
</ListBucketResult>`;

      const result = parseListObjectsV2Response(xml, "split/mb-test-123/");
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0].key).toBe("data/records.csv");
      expect(result.objects[0].sizeBytes).toBe(4096);
    });

    it("parses pagination details (isTruncated and NextContinuationToken)", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>huge-bucket</Name>
    <Prefix></Prefix>
    <IsTruncated>true</IsTruncated>
    <NextContinuationToken>token-page-2-xyz</NextContinuationToken>
    <Contents>
        <Key>file1.bin</Key>
        <Size>1000</Size>
    </Contents>
</ListBucketResult>`;

      const result = parseListObjectsV2Response(xml);
      expect(result.isTruncated).toBe(true);
      expect(result.nextContinuationToken).toBe("token-page-2-xyz");
      expect(result.objects).toHaveLength(1);
    });
  });

  describe("crawlUpstreamBucket", () => {
    const testCreds = {
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "TESTKEY123",
      secretAccessKey: "TESTSECRET456",
    };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("crawls an upstream bucket and computes totalBytes accurately", async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>my-bucket</Name>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>item1.dat</Key>
        <Size>3000</Size>
        <ETag>"tag1"</ETag>
        <LastModified>2026-09-08T10:00:00.000Z</LastModified>
    </Contents>
    <Contents>
        <Key>item2.dat</Key>
        <Size>7000</Size>
        <ETag>"tag2"</ETag>
        <LastModified>2026-09-08T10:05:00.000Z</LastModified>
    </Contents>
</ListBucketResult>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => mockXml,
      } as unknown as Response);

      const res = await crawlUpstreamBucket({
        credentials: testCreds,
        upstreamBucket: "my-bucket",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.objects).toHaveLength(2);
        expect(res.totalBytes).toBe(10000);
      }
    });

    it("handles multi-page pagination with continuation tokens", async () => {
      const page1Xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>my-bucket</Name>
    <IsTruncated>true</IsTruncated>
    <NextContinuationToken>token-2</NextContinuationToken>
    <Contents>
        <Key>part1.bin</Key>
        <Size>5000</Size>
    </Contents>
</ListBucketResult>`;

      const page2Xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Name>my-bucket</Name>
    <IsTruncated>false</IsTruncated>
    <Contents>
        <Key>part2.bin</Key>
        <Size>3500</Size>
    </Contents>
</ListBucketResult>`;

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => page1Xml,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => page2Xml,
        } as unknown as Response);

      global.fetch = fetchMock;

      const res = await crawlUpstreamBucket({
        credentials: testCreds,
        upstreamBucket: "my-bucket",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(res.objects).toHaveLength(2);
        expect(res.totalBytes).toBe(8500);
      }
    });

    it("returns descriptive error when upstream bucket is not found (NoSuchBucket)", async () => {
      const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>NoSuchBucket</Code>
    <Message>The specified bucket does not exist</Message>
    <BucketName>non-existent-bucket</BucketName>
</Error>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => errorXml,
      } as unknown as Response);

      const res = await crawlUpstreamBucket({
        credentials: testCreds,
        upstreamBucket: "non-existent-bucket",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/does not exist/i);
      }
    });

    it("returns descriptive error on upstream AccessDenied", async () => {
      const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
    <Code>AccessDenied</Code>
    <Message>Access Denied</Message>
</Error>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => errorXml,
      } as unknown as Response);

      const res = await crawlUpstreamBucket({
        credentials: testCreds,
        upstreamBucket: "forbidden-bucket",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/access denied/i);
      }
    });
  });
});
