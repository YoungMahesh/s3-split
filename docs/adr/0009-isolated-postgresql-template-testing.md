# Isolated PostgreSQL Template Testing Architecture & Test Suite Tiering

## Context

Running integration tests against the shared development database (`DATABASE_URL`) led to cross-test data conflicts, flaky parallel CI runs, developer state corruption, slow migrations, and the inability to run unit tests offline. Emulating PostgreSQL with SQLite or PGLite was unacceptable because the platform relies on native PostgreSQL schema definitions, foreign keys, transaction semantics, and constraints. Local Docker or Testcontainers were ruled out due to environment constraints and the availability of a dedicated remote test server.

## Decision

We adopted an isolated, multi-tiered test database architecture utilizing native PostgreSQL template database cloning and Vitest process-level fork isolation:

1. **Test Tier Separation**: Test suites are partitioned into dedicated tiers:
   - `tests/unit/`: In-memory offline unit tests (cryptographic encryption/decryption, UI primitives, quota calculations, SigV4 signing, S3 parsing). Executable offline via `pnpm test:unit` with zero network or database dependencies.
   - `tests/integration/`: Integration suites connecting to a dedicated remote PostgreSQL instance configured by `TEST_DATABASE_SERVER`. Executable via `pnpm test:integration`.
   - Unified `pnpm test` runs both tiers in a single command.
2. **Dedicated Test Database Server & Fail-Fast Enforcement**: Integration tests connect to `TEST_DATABASE_SERVER`. If `TEST_DATABASE_SERVER` is missing or unreachable, execution halts immediately with actionable diagnostics and a non-zero exit code.
3. **One-Time Template Provisioning via Global Setup**: Vitest global setup (`tests/integration/global-setup.ts`) connects to the maintenance database (`postgres`), performs a pre-flight sweep of orphaned test databases, creates a timestamped template database (`test_s3_split_tpl_<timestamp>_<rand>`), applies Drizzle schema migrations once, terminates active sessions, and marks `ALLOW_CONNECTIONS = false`.
4. **Sub-Second Suite-Level Database Cloning**: Integration suites execute in isolated child processes (`pool: 'forks'`). Each suite's `setup.ts` dynamically clones an isolated database (`test_s3_split_<timestamp>_<rand>`) from the template in ~200-500ms using PostgreSQL's native `CREATE DATABASE ... TEMPLATE` mechanism and injects its dedicated connection string into `process.env.DATABASE_URL` prior to test module evaluation.
5. **Deterministic Pool Draining & Force Drop**: `@/db` exports `closeDb()` alongside the lazy connection pool. At the end of each test suite (`afterAll`), the worker gracefully drains active client sockets via `await closeDb()` before the administrative connection executes `DROP DATABASE ... WITH (FORCE)`.
6. **Automated Pre-Flight & Abort Orphan Sweeper**: Global setup queries `pg_database` for `test_s3_split_%` databases, dropping any with a timestamp older than 2 hours as well as unparseable non-conforming test databases. Worker signal handlers (`SIGINT`, `SIGTERM`) ensure best-effort cleanup on aborted runs.

## Consequences

- **Sub-Second Test Isolation**: Test suites clone a complete, migrated database in ~200-500ms, eliminating migration overhead per test file while preserving true PostgreSQL isolation.
- **Zero Cross-Test Interference**: Parallel CI runs and concurrent test files never mutate each other's tables or corrupt local developer data.
- **Offline Friction Eliminated**: Developers can execute `pnpm test:unit` freely without network connectivity or remote database access.
- **Zero Socket Resets & Connection Leaks**: Graceful connection draining before forced database drops keeps terminal logs clean.
- **Automated Resource Hygiene**: The 2-hour TTL pre-flight sweeper prevents accumulation of orphaned databases on the test server.
