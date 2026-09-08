# 01: Upstream Account Connection & Credential Encryption

**What to build:** The ability for an authenticated user to connect an external S3-compatible storage provider (such as AWS S3, Cloudflare R2, Wasabi, Backblaze B2, or MinIO) to their account. The platform actively validates the credentials against the upstream endpoint before persisting them, stores all secrets encrypted at rest using authenticated cryptography, and presents connected accounts in the dashboard.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] An authenticated user can fill out an Upstream Account form with account name, endpoint URL, region, access key ID, and secret access key.
- [x] On form submission, the system actively probes the upstream S3 endpoint to verify connectivity and credential validity before saving.
- [x] If the connection probe fails (e.g. invalid signature, wrong endpoint, unreachable network), a descriptive error message is shown to the user and the record is not created.
- [x] The upstream secret access key is encrypted at rest in PostgreSQL using AES-256-GCM with an application master key before storage.
- [x] Stored Upstream Accounts are displayed in the dashboard with their name, provider endpoint, region, access key ID, and creation date.
- [x] Automated tests verify successful connection validation, probe failure handling, and AES-256-GCM encryption/decryption round-trips.
