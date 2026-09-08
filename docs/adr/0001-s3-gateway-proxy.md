# S3 Gateway Proxy Architecture

S3 storage providers (such as AWS S3, Cloudflare R2, and Wasabi) do not support aggregate storage quota enforcement within IAM credential policies. We decided to implement an S3-compatible reverse proxy (gateway) that intercepts incoming S3 requests, authenticates custom client keys against our database, enforces storage quotas in real time, and streams valid requests to the upstream provider re-signed with upstream credentials. This ensures downstream client applications can use standard S3 SDKs with zero modifications while guaranteeing strict byte caps.
