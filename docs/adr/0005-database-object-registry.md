# Object Registry in Database for Usage Accounting

Issuing upstream `HeadObject` or `ListObjectsV2` calls on every upload or deletion to check previous object sizes adds significant network latency and provider API fees. We decided to maintain an internal `managed_objects` database table indexing all active object keys, sizes, and ETags per managed bucket. This provides sub-millisecond net delta calculation on file overwrites, instantaneous quota decrements on deletions, and local caching for directory listings.
