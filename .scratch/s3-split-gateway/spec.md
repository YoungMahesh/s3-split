Status: ready-for-agent

# S3-Split: S3 Gateway with Storage Quotas

## Problem Statement

Developers and teams can easily obtain inexpensive or free-tier S3-compatible cloud object storage (e.g., Cloudflare R2, Wasabi, Backblaze B2, AWS S3, MinIO). However, these providers do not offer a native way to restrict the maximum total byte storage allocated to generated credentials or IAM keys. When sharing storage credentials with external applications, microservices, or staging environments, there is an ever-present risk of runaway writes, accidental data explosions, and unpredictable cloud billing without any hard ceiling.

## Solution

S3-Split provides a multi-tenant platform and S3-compatible gateway proxy. Users connect their Upstream Accounts, configure Managed Buckets with strictly enforced Storage Quotas, and receive custom Client Keys. Applications point their standard S3 client configurations (boto3, @aws-sdk/client-s3, AWS CLI) directly to the S3-Split gateway. The gateway transparently authenticates requests using AWS SigV4, checks byte quotas in real time, streams valid requests upstream, and strictly blocks writes when the Storage Quota is reached while preserving read and delete access.

## User Stories

1. As a developer, I want to authenticate into the S3-Split dashboard, so that I can securely manage my upstream connections, buckets, and client credentials.
2. As a platform user, I want to add an Upstream Account by providing my provider's endpoint URL, region, access key ID, and secret access key, so that S3-Split can connect to my external storage.
3. As a platform user, I want the system to actively test the connection to my Upstream Account upon submission, so that I am immediately alerted if my credentials or endpoint are incorrect.
4. As a platform user, I want my upstream secret access keys to be strongly encrypted at rest, so that database backups do not expose sensitive cloud access credentials.
5. As a platform user, I want to create a Managed Bucket linked to an Upstream Account and define a Storage Quota (in MB, GB, or TB), so that I can prevent storage from exceeding my budget.
6. As a platform user with restricted credentials for a single upstream bucket, I want to create a Managed Bucket that isolates storage using a virtual prefix, so that I can partition a single physical bucket into multiple independent, capped virtual buckets.
7. As a platform user, I want an existing physical bucket or virtual prefix to undergo a baseline scan upon creation, so that pre-existing data is accurately accounted for against the Storage Quota from day one.
8. As a platform user, I want to generate one or more Client Keys for each Managed Bucket, so that I can give dedicated credentials to different services or rotate keys without downtime.
9. As a platform user, I want to view the secret access key of a newly generated Client Key in a one-time reveal modal, so that I can safely store it in my application's environment.
10. As a developer, I want pre-formatted, copy-pasteable configuration snippets (for `.env`, Node.js AWS SDK v3, Python Boto3, and AWS CLI) when generating a Client Key, so that I can integrate S3-Split into my app within seconds.
11. As a platform user, I want to create a Read-Only Client Key, so that I can distribute download credentials that are cryptographically prevented from writing or deleting objects.
12. As a platform user, I want to revoke individual Client Keys at any time, so that compromised or retired credentials immediately lose access to my Managed Bucket.
13. As an application developer, I want to use standard, unmodified S3 SDKs and CLI tools with my Client Key, so that I do not need custom libraries or proprietary upload protocols.
14. As an application developer, I want `PutObject` requests to succeed transparently when my Managed Bucket is within its Storage Quota, so that my app functions normally without added overhead.
15. As an application developer, I want `PutObject` requests that would breach the Storage Quota to fail immediately with an S3-compliant `QuotaExceeded` error (HTTP 507 Insufficient Storage), so that my application logic recognizes the storage cap.
16. As an application developer, I want `GetObject` and `HeadObject` requests to continue functioning even when the Storage Quota is exceeded, so that my users can still read and download existing data.
17. As an application developer, I want `DeleteObject` requests to succeed even when the Storage Quota is exceeded, so that my application can purge unwanted files and restore available quota.
18. As an application developer, I want file overwrites to adjust the used storage by the net delta (`new_size - old_size`), so that re-uploading an existing key does not falsely consume double the quota.
19. As an application developer, I want multipart uploads (`CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`) to be supported, so that large files (>5MB) uploaded via standard SDKs work reliably.
20. As a platform user, I want pending multipart upload parts to reserve byte quota during upload, so that concurrent or large multipart transfers cannot overshoot the Storage Quota before completion.
21. As a platform user, I want orphaned or abandoned multipart upload reservations to automatically expire after 24 hours, so that crashed client uploads do not permanently consume quota.
22. As an application developer, I want `ListObjectsV2` queries to return clean object keys without internal virtual prefixes, so that the virtual bucket feels like a true root-level bucket to the client.
23. As a platform user, I want to see real-time visual progress bars of current storage consumption versus the Storage Quota for each Managed Bucket, so that I can monitor usage at a glance.
24. As a platform user, I want to trigger an on-demand "Reconcile Storage" action from the dashboard, so that any drift caused by out-of-band upstream modifications or lifecycle rules is synchronized with the local database.
25. As a platform user, I want to delete a Managed Bucket and have all associated Client Keys and local object tracking cleanly removed, so that my account remains organized.

## Implementation Decisions

### 1. Reverse Proxy Gateway Architecture
- The gateway acts as an S3-compatible HTTP reverse proxy running within the unified web application runtime.
- The proxy intercepts incoming requests targeted at path-style endpoints (`/api/s3/:bucketName/*`), authenticates the caller via AWS Signature Version 4 (SigV4), verifies quota constraints, and streams approved payloads upstream re-signed with the Upstream Account credentials.
- All errors returned by the gateway conform to standard S3 XML error schemas (with `<Error><Code>...</Code><Message>...</Message></Error>`) and RFC-compliant HTTP status codes (`HTTP 507 Insufficient Storage`, `HTTP 403 Forbidden`, `HTTP 404 NoSuchKey`).

### 2. Virtual Prefix Isolation
- Managed Buckets support two modes:
  1. Virtual Prefix Bucket: Maps the logical bucket root to an isolated key prefix (e.g. `split/bucket-id/`) inside a single shared upstream physical bucket. All incoming object keys are prepended with this prefix when streaming upstream, and the prefix is stripped from upstream listings before sending responses back to the client.
  2. Physical 1:1 Bucket: Maps directly to an upstream bucket name without key prefix manipulation.

### 3. Application-Level Secret Encryption
- S3 SigV4 verification and upstream re-signing require plaintext secrets in memory during request execution.
- All upstream secret access keys and client secret access keys are stored encrypted at rest in PostgreSQL using AES-256-GCM authenticated encryption with a dedicated master key from environment variables.

### 4. Real-Time Quota Ledger and Database Object Registry
- Storage usage is tracked synchronously in PostgreSQL via an atomic `used_bytes` counter on each Managed Bucket.
- A local `managed_objects` database table indexes active object keys, sizes, and ETags per Managed Bucket.
  - On `PutObject`: If the key already exists, the ledger is updated by `new_size - old_size`. If it is a new key, `new_size` is added.
  - On `DeleteObject`: The object record is removed and its `size_bytes` is decremented from `used_bytes`.
- A `part_reservations` table tracks byte reservations for active multipart upload parts. Incoming `UploadPart` calls fail immediately if `used_bytes + pending_reservations + part_size > storageQuotaBytes`.
- On bucket creation, a baseline crawl queries the upstream provider via `ListObjectsV2` to populate the initial object registry and `used_bytes`.

### 5. Multi-Key Support and Tenant-Scoped Namespaces
- Each Managed Bucket can have multiple Client Keys.
- Client Keys support a permission flag (`read_write` or `read_only`). Read-only keys reject mutating operations (`PutObject`, `DeleteObject`, `CreateMultipartUpload`) with `AccessDenied` (HTTP 403).
- Bucket names are scoped per tenant; the gateway resolves the target Managed Bucket using the Client Key's access key ID from the SigV4 signature, preventing cross-tenant name collisions.

## Testing Decisions

### What Makes a Good Test
- Tests must verify external observable behavior (HTTP status codes, S3 XML payloads, payload streaming, quota boundaries), rather than internal mock states or private function signatures.
- S3 Gateway tests should interact with the route handler using realistic S3 client requests (SigV4 headers, canonical query strings, streaming request bodies).

### Modules and Seams to Test
- **Primary Seam: S3 Gateway HTTP API (`/api/s3/[...path]`)**:
  - Full request-response cycle for `PutObject`, `GetObject`, `DeleteObject`, `HeadObject`, and `ListObjectsV2`.
  - Storage Quota boundary tests: verify successful write at `quota - 1`, rejection with `QuotaExceeded` at `quota + 1`, and survival of `GetObject`/`DeleteObject` when at `quota`.
  - Overwrite delta tests: verify that replacing an object with a larger or smaller payload updates `used_bytes` accurately by the difference.
  - Multipart upload sequence: `CreateMultipartUpload` -> `UploadPart` (reservation) -> `CompleteMultipartUpload` (finalization).
  - Virtual prefix isolation: verify that keys returned in listings do not leak upstream prefixes.
- **Secondary Seam: Cryptography & SigV4 Verification**:
  - Round-trip encryption and decryption using AES-256-GCM.
  - SigV4 canonical request creation and HMAC verification against known test vectors.
- **Tertiary Seam: Management Server Actions**:
  - Upstream account registration and active probe validation.
  - Bucket creation, baseline scanning, and client key generation/revocation.

### Prior Art
- Existing smoke tests in `tests/smoke.test.ts`. All test suites will be run with Vitest via `pnpm run test`.

## Out of Scope

- Upstream S3 object versioning (unversioned bucket semantics are assumed).
- S3 Object Lock, Legal Hold, and retention compliance policies.
- S3 Lifecycle expiration rules (though drift can be resynchronized via the "Reconcile Storage" button).
- Public anonymous unauthenticated bucket hosting.
- S3 Website endpoints and CORS routing rules.
- S3 Select and Object Lambda transformations.

## Further Notes

- The platform utilizes Better Auth for user session management and Drizzle ORM on PostgreSQL for data persistence.
- Database migrations will be generated with `pnpm run db-generate` and applied with `pnpm run db-migrate`.
