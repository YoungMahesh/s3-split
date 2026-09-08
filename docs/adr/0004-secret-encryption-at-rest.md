# Reversible Secret Encryption at Rest via AES-256-GCM

S3 gateway authentication requires comparing incoming AWS SigV4 signatures against raw client secrets and computing new HMAC-SHA256 signatures using upstream S3 secret access keys, making one-way password hashing impossible. We decided to encrypt both client secrets and upstream credentials at rest using application-level AES-256-GCM with a secret master key (`DATA_ENCRYPTION_KEY`). This protects credentials in database backups while avoiding hard dependencies on cloud-specific KMS providers.
