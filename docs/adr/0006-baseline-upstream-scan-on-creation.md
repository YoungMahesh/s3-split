# Baseline Upstream Scan on Bucket Creation

When linking an existing physical S3 bucket or prefix that already contains data, ignoring pre-existing objects would allow downstream applications to exceed the intended storage quota. We decided to perform an initial upstream `ListObjectsV2` crawl upon Managed Bucket creation to populate the local object registry and initialize `used_bytes` to the actual current consumption before accepting client proxy writes.
