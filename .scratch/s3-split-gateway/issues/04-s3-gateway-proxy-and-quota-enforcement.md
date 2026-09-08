# 04: S3 Gateway Proxy & Storage Quota Enforcement

**What to build:** An S3-compatible HTTP reverse proxy running within the unified web application runtime at `/api/s3/[...path]`. The proxy authenticates downstream requests using standard AWS SigV4, verifies Storage Quota limits in real time, streams approved uploads upstream re-signed with upstream credentials, and strictly rejects writes with S3-compliant `QuotaExceeded` XML (HTTP 507) when full, while keeping reads and deletes operational.

**Blocked by:** 03: Client Key Management, Scopes & Code Snippet Generator

**Status:** ready-for-agent

- [ ] Downstream applications can target the gateway endpoint using standard S3 SDKs with path-style addressing (`/api/s3/:bucketName/:objectKey`).
- [ ] Incoming requests are authenticated against stored Client Keys using AWS Signature Version 4 (SigV4) header verification.
- [ ] On `PutObject`, if `used_bytes + incoming_size <= storage_quota_bytes`, the request is re-signed with the Upstream Account credentials and streamed upstream. The local object registry and `used_bytes` are updated atomically.
- [ ] On `PutObject`, if `used_bytes + incoming_size > storage_quota_bytes`, the write is rejected immediately with an S3 XML error (`QuotaExceeded` / HTTP 507 Insufficient Storage) without streaming upstream.
- [ ] Overwrites of existing objects adjust `used_bytes` by the net delta (`new_size - old_size`).
- [ ] `GetObject`, `HeadObject`, and `ListObjectsV2` succeed even when the bucket's Storage Quota is exceeded.
- [ ] `DeleteObject` succeeds even when the bucket's Storage Quota is exceeded, removing the object from the registry and decrementing `used_bytes` accordingly.
- [ ] For virtual prefix buckets, key prefixes are prepended when proxying upstream, and stripped from `ListObjectsV2` XML responses.
- [ ] Client Keys with `read_only` permission fail with `AccessDenied` (HTTP 403) on mutating operations (`PutObject`, `DeleteObject`).
- [ ] Comprehensive automated tests at the HTTP gateway seam verify SigV4 authentication, write rejection at quota threshold, read/delete survival at quota, and overwrite delta calculation.
