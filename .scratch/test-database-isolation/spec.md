Status: done

# Spec: Isolated PostgreSQL Template Testing Architecture

## Problem Statement

Developers and automated CI pipelines running integration tests currently execute queries directly against the shared development database specified in the main environment configuration (`DATABASE_URL`). This shared database model causes severe issues:
1. **Destructive Data Conflicts & Cross-Test Interference**: Parallel test suites or concurrent CI runs mutate shared tables (such as `user`, `upstream_account`, `managed_bucket`, `client_key`, and `managed_objects`), causing intermittent test failures, race conditions, and flaky runs.
2. **Developer State Corruption**: Running integration tests locally wipes seed data and configurations needed by developers actively working on the web application or testing S3 proxy gateways locally.
3. **Slow & Inefficient Schema Provisioning**: Re-running database migrations or tearing down tables sequentially across every test file introduces unacceptable test latency.
4. **Offline Development Friction**: Developers working offline or in constrained environments cannot run any test command because the flat test structure attempts to connect to remote databases even for pure business logic and cryptographic functions.

## Solution

Implement an isolated, multi-tiered test database architecture utilizing PostgreSQL native template cloning and Vitest process-level fork isolation:
1. **Strict Test Tier Separation**: Separate offline in-memory unit tests from remote database integration tests into dedicated Vitest workspace projects (`unit` and `integration`). Developers can run offline unit tests with zero network or database dependencies.
2. **Dedicated Test Database Server**: Tests connect to a dedicated remote PostgreSQL server specified by `TEST_DATABASE_SERVER` rather than touching development or production instances.
3. **One-Time Template Provisioning via Global Setup**: Before test workers start, Vitest global setup validates server connectivity, performs a pre-flight sweep of orphaned test databases, creates a timestamped template database, applies all schema migrations once, and locks connections on the template to enable native cloning.
4. **Sub-Second Suite-Level Database Cloning**: Integration test suites execute in isolated child processes. Each suite dynamically clones an isolated database from the pre-migrated template in ~500ms using PostgreSQL's native `CREATE DATABASE ... TEMPLATE` mechanism and injects its dedicated connection string before suite execution.
5. **Deterministic Pool Draining and Drop**: At the end of each test suite, the worker gracefully drains its client connection pool sockets before the administrative connection drops the cloned database.
6. **Pre-flight & Abort Orphan Sweeper**: Global setup purges databases older than 2 hours as well as non-conforming database names. Global teardown cleans up the session template database.
7. **Strict Fail-Fast Enforcement**: If `TEST_DATABASE_SERVER` is missing or unreachable when running integration tests, execution halts immediately with actionable diagnostics and a non-zero exit code.
8. **Architectural Governance**: Record an Architectural Decision Record (ADR 0009) capturing the decision rationale, performance metrics, and trade-offs.

## User Stories

- [x] 1. As a developer running unit tests offline (`pnpm test:unit`), I want tests for cryptographic utilities and UI state to execute in milliseconds without attempting to connect to any database or network, so that I can develop freely without internet access.
- [x] 2. As a developer running integration tests (`pnpm test:integration`), I want my tests to run against a dedicated remote PostgreSQL server rather than my local development database, so that my local application state and seed data are never wiped or corrupted.
- [x] 3. As an engineer running the full test suite (`pnpm test`), I want Vitest to run both unit and integration suites in a single command, so that I have a unified verification workflow before pushing code.
- [x] 4. As a developer running integration tests without configuring `TEST_DATABASE_SERVER`, I want the test command to fail fast immediately with a clear explanation, so that I don't wait for silent network timeouts or confusing database errors.
- [x] 5. As a developer running integration tests, I want schema migrations to execute once into a template database at the start of the test run, so that individual test suites do not waste time applying migrations repeatedly.
- [x] 6. As an automated CI runner executing parallel jobs, I want each test suite to execute against an isolated database cloned from the template, so that concurrent test suites cannot read or mutate each other's database records.
- [x] 7. As a test suite author writing tests for Upstream Accounts and Managed Buckets, I want a fresh database with full schema definitions ready when my test starts, so that I can insert test users and accounts without colliding with other test files.
- [x] 8. As a test suite author testing concurrent multipart uploads and part reservations, I want real PostgreSQL constraints and foreign keys enforced, so that integration tests mirror production behavior rather than emulated SQLite or mock limitations.
- [x] 9. As a developer running Vitest in watch mode (`pnpm test:watch`), I want the template database to remain active across file saves, so that re-running tests remains sub-second without re-migrating the schema every time.
- [x] 10. As a developer aborting a test run with Ctrl+C (`SIGINT`), I want workers to make a best-effort cleanup of their cloned databases, so that remote server resources are not unnecessarily consumed.
- [x] 11. As a platform maintainer, I want global setup to automatically sweep and drop any orphaned test databases older than 2 hours, so that aborted or killed CI runs never accumulate disk space indefinitely on the test server.
- [x] 12. As a platform maintainer, I want global setup to purge any unparseable or non-conforming database matching the test prefix, so that malformed test databases are never left stranded.
- [x] 13. As a developer reviewing test logs, I want client database connection pools to be gracefully drained before databases are dropped, so that terminal logs remain clean and free of connection reset or socket hangup warnings.
- [x] 14. As a developer writing new unit tests, I want a clear directory boundary distinguishing unit tests from integration tests, so that I never accidentally import database clients into offline test suites.
- [x] 15. As a future maintainer or AI agent reading the repository documentation, I want an Architectural Decision Record (ADR 0009) explaining why PostgreSQL template cloning was chosen over Docker or transactional rollbacks, so that I understand the system design trade-offs.

## Implementation Decisions

- **Test Suite Tiering**: Partition the test directory into dedicated tiers: in-memory unit tests in a unit directory and database integration tests in an integration directory. Configure Vitest workspace projects for each tier.
- **Database Client Lifecycle**: Refactor the database client module to export the shared connection pool alongside a clean connection draining function, allowing workers to drain active sockets prior to dropping databases.
- **Process Isolation**: Configure the integration project with process-level child forks and suite isolation, ensuring environment variables and module caches are cleanly separated across test suites.
- **Suite-Level Provisioning**: Execute database cloning during suite setup prior to test module evaluation, dynamically assigning the suite's database URL to the environment before application routes and database singletons evaluate.
- **Administrative Database Connection**: Establish an administrative client connected to the maintenance database (`postgres`) on the test server to manage database creation, access restriction, and force drops.
- **Template Locking**: Once schema migrations complete on the template database, terminate active sessions and disallow connections so that PostgreSQL allows fast template cloning without connection lock conflicts.
- **Orphan Sweeping**: Implement a pre-flight sweeper that queries the database catalog, dropping any test database with a timestamp older than 2 hours and purging non-conforming test databases matching the prefix.
- **Package Scripts**: Expose explicit npm scripts for offline unit testing, integration testing, and the combined default test command.
- **Documentation**: Document the architecture, constraints, and alternatives in ADR 0009.

## Testing Decisions

- **Test Quality Invariants**: Tests must verify externally observable behavior — verifying successful migrations, isolation across processes, proper failure exit codes, and zero orphaned databases — rather than asserting on internal function calls.
- **Tested Modules**:
  - Offline unit suites (cryptographic secret encryption/decryption, UI color and state primitives).
  - Integration suites (Upstream Accounts API, Managed Buckets API, Client Keys API, S3 Gateway, Quota enforcement, Multipart uploads, Reconciliation).
  - Database administrative helpers (template creation, cloning, pool draining, orphan sweeping).
- **Prior Art**: Existing integration tests in the repository that currently execute against the primary development database.

## Out of Scope

- Running local Docker or Testcontainers instances (the architecture explicitly relies on the remote PostgreSQL test server).
- In-memory SQLite or PGLite emulation (the platform requires native PostgreSQL 18+ features).
- Modifying S3 gateway proxy logic or storage quota business rules.

## Further Notes

- The test server environment variable provides the host, port, and credentials; when no database name is included in the URL path, the admin connection defaults to the standard maintenance database.
- Database cloning via PostgreSQL native template mechanism takes approximately 500ms, making suite-level isolation extremely fast without transactional limitations.
