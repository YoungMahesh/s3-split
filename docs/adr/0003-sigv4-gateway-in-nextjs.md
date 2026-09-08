# SigV4 S3 Gateway in Unified Next.js Route Handler

To maintain 100% compatibility with standard S3 SDKs and CLI tools without introducing multi-process deployment overhead, we decided to implement the S3 reverse proxy within Next.js App Router route handlers (`/api/s3/[...path]`) using the Node.js runtime. The gateway verifies incoming AWS Signature Version 4 (SigV4) headers against custom client keys, performs real-time quota validation, and re-signs outgoing streaming requests to the upstream S3 provider.
