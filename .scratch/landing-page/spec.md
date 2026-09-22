Status: done

# Spec: S3-Split Public Landing Page and Dashboard Route Separation

## Problem Statement

S3-Split previously lacked a dedicated public-facing presence. Navigating to `/` rendered an unauthenticated sign-in card if no session existed, or the management console if a session was present. Prospective users, developers, and evaluators had no way to explore S3-Split's drop-in S3 proxy capabilities, SigV4 SDK compatibility, virtual prefix partitioning, or real-time storage quota enforcement without first registering an account. Furthermore, authenticated users had no convenient way to share or review the landing page without signing out.

## Solution

Implement an authoritative, editorial public landing page adhering to the Claude Editorial Design System (`DESIGN.md`, `ADR 0008`, `.agents/rules/ui-design.md`) at `/`, extract the authenticated management dashboard to `/dashboard`, and relocate authentication forms to `/login`:
1. **Public Landing Page (`/`)**:
   - Header with brand wordmark (`RadialSpikeMark`), section jump anchors (`#architecture`, `#features`, `#integration`, `#simulator`), and session-aware navigation ("Sign In" / "Get Started" for guests; "Go to Dashboard" for authenticated users).
   - Hero section with Cormorant Garamond serif display headline, value proposition, primary coral CTA, secondary anchor CTA, and a dark navy `CodeWindow` demonstrating 3-line drop-in AWS SDK compatibility.
   - 3-tier architecture overview (`#architecture`) detailing Client Applications -> S3-Split Gateway Proxy -> Upstream Storage (AWS S3, Cloudflare R2, MinIO).
   - Core capabilities grid (`#features`) highlighting Storage Quota Enforcement, Virtual Prefix Buckets, Native SigV4 Proxying, and Database Object Registry.
   - Tabbed multi-language SDK showcase (`#integration`) demonstrating zero-code-change client configurations in TypeScript, Python, Go, and AWS CLI.
   - Interactive Quota Simulator (`#simulator`) with a mock 50 MB Managed Bucket, an interactive object size slider, dynamic semantic color encoding (<75% Teal, 75-99% Coral, >=100% Crimson), and real-time S3 HTTP/XML responses.
   - Bottom CTA banner and footer with documentation and status links.
2. **Authenticated Management Console (`/dashboard`)**:
   - Relocate `UpstreamAccountsManager`, `ManagedBucketsManager`, and diagnostic utilities to `/dashboard`.
   - Protect with client-side session guard that redirects unauthenticated visitors to `/login?redirect=/dashboard`.
3. **Dedicated Authentication Route (`/login`)**:
   - Dedicated page hosting the tabbed Sign In / Sign Up form.
   - Redirects authenticated users to `/dashboard`.
4. **Documentation and Governance**:
   - Record `ADR 0010: Public Landing Page and Dashboard Route Separation` and update `CONTEXT.md`.
5. **Testing**:
   - Offline unit tests in `tests/unit/landing-page.test.ts` verifying simulator math, status badge mapping, XML error generation, and SDK tab definitions.

## User Stories

- [x] 1. As a visiting developer, I want to see a public landing page at `/` explaining S3-Split's architecture, so that I understand how it partitions S3 storage and enforces byte quotas before creating an account.
- [x] 2. As an evaluator, I want to see real code examples in my preferred language (TypeScript, Python, Go, AWS CLI) on the landing page, so that I can verify that S3-Split is a drop-in replacement for standard S3 endpoints.
- [x] 3. As a developer, I want to interact with a Quota Simulator on the landing page, adjusting an upload size slider to see how the platform returns standard S3 HTTP 200 OK or HTTP 403 QuotaExceeded XML errors in real time.
- [x] 4. As an unauthenticated visitor, I want clear CTAs to "Sign In" or "Get Started" that take me to `/login` with the appropriate tab pre-selected.
- [x] 5. As an authenticated user, I want the landing page header to display "Go to Dashboard" instead of sign-in prompts, so that I can quickly jump back to my management console.
- [x] 6. As an authenticated user, I want to manage my Upstream Accounts and Managed Buckets at `/dashboard`, so that my console URL is clean and bookmarkable.
- [x] 7. As an unauthenticated visitor navigating directly to `/dashboard`, I want to be redirected to `/login?redirect=/dashboard`, so that I can authenticate and be redirected back.
- [x] 8. As a developer running tests offline, I want unit tests for the landing page and simulator to run sub-second via `pnpm test:unit` with zero database dependencies.
- [x] 9. As a platform maintainer, I want `pnpm build` to compile the public landing page, `/dashboard`, and `/login` with zero TypeScript or routing warnings.

## Implementation Decisions

- Follow light-mode governance strictly (`#faf9f5` warm canvas, `#efe9de` light cream cards, `#e6dfd8` hairline borders, and dark navy `#181715` strictly for `CodeWindow` product chrome).
- Adhere strictly to canonical glossary terms from `CONTEXT.md`: Upstream Account, Managed Bucket, Client Key, Storage Quota, Managed Object, Part Reservation.
- Modular component composition in `app/components/landing/`.

## Testing Decisions

- Unit tests in `tests/unit/landing-page.test.ts` to test simulator calculation functions and SDK configuration data structures.
- Next.js build verification via `pnpm build`.
