# 06: Storage Drift Reconciliation & Bucket Lifecycle Management

**What to build:** An on-demand "Reconcile Storage" action in the dashboard that crawls upstream S3 via `ListObjectsV2` to resynchronize the database object registry and `used_bytes` ledger against reality (recovering from out-of-band object changes or upstream lifecycle expiration rules), displays a breakdown of tracked objects, and provides clean deletion of Managed Buckets.

**Blocked by:** 04: S3 Gateway Proxy & Storage Quota Enforcement

**Status:** done

- [x] A "Reconcile Storage" button is available on the Managed Bucket detail view in the dashboard.
- [x] Clicking "Reconcile Storage" triggers a background/on-demand upstream `ListObjectsV2` crawl of the bucket/prefix.
- [x] The reconciliation process updates the `managed_objects` table, removing records for objects deleted upstream and inserting records for newly detected objects, then recalculates `used_bytes` accurately.
- [x] The bucket detail view displays a table of active tracked objects (key, size, last modified timestamp).
- [x] A user can delete a Managed Bucket, which cascades to revoke all associated Client Keys, remove object registry records, and release resources (without deleting upstream files unless explicitly requested).
- [x] Automated tests verify reconciliation against simulated upstream changes (detecting out-of-band additions and deletions) and proper cascade cleanup upon bucket deletion.
