# 05: Multipart Upload Quota Accounting & Part Reservations

**What to build:** Full multipart upload support (`CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, `AbortMultipartUpload`) for the S3 Gateway, with byte quota reservations per part to prevent concurrent or oversized multipart transfers from exceeding the Storage Quota before completion. Stale or abandoned multipart reservations expire after 24 hours.

**Blocked by:** 04: S3 Gateway Proxy & Storage Quota Enforcement

**Status:** done

- [x] Applications can initiate multipart uploads (`POST /:bucket/:key?uploads`) via standard S3 SDKs, receiving a valid `UploadId`.
- [x] Each incoming `UploadPart` (`PUT /:bucket/:key?uploadId=...&partNumber=...`) checks whether `used_bytes + pending_reservations + part_size <= storage_quota_bytes`.
- [x] If an incoming `UploadPart` would cause the quota to be breached, it is rejected immediately with an S3 XML `QuotaExceeded` error (HTTP 507), preventing further bandwidth consumption.
- [x] On `CompleteMultipartUpload`, part reservations are converted into permanent `used_bytes` and recorded in the local object registry.
- [x] On `AbortMultipartUpload`, upstream parts are aborted and part reservations in the database are released.
- [x] Multipart upload reservations older than 24 hours automatically expire and release reserved bytes, with an upstream abort call triggered to purge orphaned parts.
- [x] Automated tests verify part quota reservation, rejection of oversized parts, complete upload finalization, and abort cleanup.
