# 02: Managed Bucket Creation, Storage Quotas & Baseline Crawl

**What to build:** The ability for an authenticated user to create a Managed Bucket bound to a connected Upstream Account, assign a maximum Storage Quota, and select between a 1:1 physical bucket or an isolated virtual prefix bucket. When linking an existing bucket or prefix, an initial crawl scans pre-existing objects to initialize the storage ledger with accurate baseline usage.

**Blocked by:** 01: Upstream Account Connection & Credential Encryption

**Status:** done

- [x] A user can create a Managed Bucket by selecting an Upstream Account, providing a tenant-scoped bucket name, choosing between physical 1:1 bucket or virtual prefix bucket, and setting a Storage Quota (with MB, GB, or TB unit selection).
- [x] For virtual prefix buckets, a distinct key prefix is generated and assigned so that all objects reside in an isolated namespace within the shared upstream physical bucket.
- [x] On bucket creation, the system runs an initial crawl of the upstream bucket/prefix to populate the local object registry and calculate the baseline storage consumption (`used_bytes`).
- [x] If pre-existing objects already exceed the configured Storage Quota, the bucket is created with its status set to quota exceeded.
- [x] The dashboard lists all Managed Buckets owned by the user, showing their name, upstream mapping type, capacity progress bar (`used_bytes / storage_quota`), and health status.
- [x] Automated tests verify bucket creation, virtual prefix allocation, baseline crawl accuracy, and progress bar calculations.
