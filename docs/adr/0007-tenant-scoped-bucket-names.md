# Tenant-Scoped Bucket Names

Unlike AWS S3 which enforces a single global namespace across all accounts worldwide, we decided to scope bucket names per user tenant. Because every incoming S3 request is signed with a Client Key that is bound to a specific Managed Bucket, the gateway can resolve the target bucket unambiguously from the credential even if multiple tenants choose common bucket names (such as `uploads` or `media`).
