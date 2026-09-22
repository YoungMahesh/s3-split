# Public Landing Page and Dashboard Route Separation

## Context

Originally, `app/page.tsx` handled two distinct responsibilities conditionally within the root URL (`/`):
1. An unauthenticated view rendering an inline Sign In / Sign Up form card.
2. An authenticated view rendering the tenant management dashboard (`UpstreamAccountsManager`, `ManagedBucketsManager`, and diagnostic views).

This structure suffered from several limitations:
- **No Public Product Discovery**: External visitors and prospective developers could not explore S3-Split's capabilities, architecture, or SDK code snippets without creating an account first.
- **Conflated Navigation**: Logged-in users could not easily share or view the public platform overview without signing out.
- **Fragmented Authentication Flows**: Lack of dedicated `/login` URLs prevented deep-linking, query-parameter-based redirects (`?redirect=/dashboard`), and clean auth bookmarking.

## Decision

We separate the root application into dedicated, modular route boundaries adhering to the Claude Editorial Design System:

1. **Public Marketing Landing Page (`/`)**:
   - Anchored on warm cream (`#faf9f5`), displaying Cormorant Garamond serif headlines, architecture diagrams, core capability cards, a tabbed multi-language SDK `CodeWindow`, and an interactive Quota Simulator.
   - Dynamic session-aware header: displays "Sign In" and "Get Started" for unauthenticated visitors, or "Go to Dashboard" when a session is detected.
2. **Authenticated Tenant Console (`/dashboard`)**:
   - Dedicated route hosting the tenant management console (`UpstreamAccountsManager`, `ManagedBucketsManager`, and diagnostic utilities).
   - Protected by a client-side auth guard that smoothly redirects unauthenticated visitors to `/login?redirect=/dashboard`.
3. **Dedicated Authentication Page (`/login`)**:
   - Houses the tabbed Sign In / Sign Up card on the light cream canvas with support for `?mode=signup` or `?redirect=...`.
   - Automatically redirects authenticated visitors to `/dashboard`.

## Consequences

- Prospective developers can explore S3-Split's drop-in S3 proxy architecture, SigV4 compatibility, and interactive quota enforcement without authentication friction.
- Clean routing boundaries provide standard URL semantics for dashboard bookmarks and login redirects.
- Establishes a permanent public showcase for S3-Split governed by the Claude Editorial Design System.
