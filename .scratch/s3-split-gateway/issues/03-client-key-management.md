# 03: Client Key Management, Scopes & Code Snippet Generator

**What to build:** The ability for an authenticated user to issue custom Client Keys (access key ID and secret access key) for any Managed Bucket with an optional Read-Only scope. The user can view the generated secret in a one-time reveal modal, copy pre-configured integration snippets for multiple languages and tools, and revoke active keys.

**Blocked by:** 02: Managed Bucket Creation, Storage Quotas & Baseline Crawl

**Status:** done

- [x] A user can generate a new Client Key for a Managed Bucket, providing a friendly name and selecting a permission level (`read_write` or `read_only`).
- [x] The generated secret access key is displayed in a one-time reveal dialog with clear instructions to save it immediately, and stored encrypted at rest with AES-256-GCM.
- [x] The key generation modal presents copy-paste configuration snippets containing the custom endpoint URL, bucket name, access key ID, and secret access key for:
  - Environment variables (`.env`)
  - Node.js (`@aws-sdk/client-s3`)
  - Python (`boto3`)
  - AWS CLI (`aws configure`)
- [x] The user can view a list of all active Client Keys bound to a Managed Bucket, showing key name, access key ID, permission scope, creation date, and last used timestamp.
- [x] A user can immediately revoke an active Client Key, preventing it from authenticating against the gateway.
- [x] Automated tests verify key generation, secret encryption round-trip, one-time reveal state, and revocation gating.
