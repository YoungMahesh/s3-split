Status: done

# Spec: Claude Editorial Design System & Light-Mode UI Governance

## Problem Statement

The current S3-Split user interface uses generic, utilitarian dark/light zinc styles with ad-hoc Tailwind classes. This creates three problems:
1. **Lack of Identity & Visual Polish**: S3-Split is a sophisticated multi-tenant S3 gateway enforcing real-time storage quotas, but its UI feels like a generic starter template rather than a thoughtful, premium product.
2. **Inconsistent UI Evolution**: Without centralized design tokens and reusable UI primitives, future agents and contributors introduce disparate styling choices, inconsistent padding, random button styles, and mismatched progress indicators.
3. **Cluttered Theme Management**: Dual light/dark mode support adds unnecessary CSS overhead, maintenance complexity, and visual bugs across form controls and tables, when the target aesthetic (inspired by Claude.com) is built around a distinct light-mode warm cream canvas.

## Solution

Adopt the warm-editorial design system defined in `DESIGN.md` across the entire application and establish strict governance for future UI development:
1. **Light-Mode-Only Anchor**: Completely remove dark mode and anchor the entire platform on a warm cream canvas (`#faf9f5`) with light cream cards (`#efe9de`), subtle hairline dividers (`#e6dfd8`), and dark warm-ink text (`#141413`).
2. **Curated Product Chrome**: Reserve dark navy surfaces (`#181715`) specifically for technical product chrome — code editor windows, SigV4 CLI/curl integration commands, Client Key credential displays, and developer diagnostics.
3. **Refined Typography**: Integrate serif display typography (`Cormorant Garamond` at weight 500 with negative tracking) for headlines, paired with humanist sans (`Inter`) for body/form controls and monospace (`JetBrains Mono`) for code and keys.
4. **Reusable UI Component Primitives**: Build a foundational library of UI primitives (`Button`, `Card`, `Input`, `Badge`, `Modal`, `CodeWindow`, `Progress`) that encapsulate tokens and interactive states.
5. **Harmonious Quota Encoding**: Replace generic progress meters with warm-tinted indicators (`accent-teal` under 75%, warm `coral` between 75% and 99%, and muted `crimson` when a Storage Quota is exceeded).
6. **Permanent Agent & Contributor Governance**: Record an Architectural Decision Record (`docs/adr/0008-claude-editorial-design-system.md`), configure Tailwind tokens, and establish an agent rule in `.agents/rules/ui-design.md` (linked in `AGENTS.md`) mandating that all future UI work compose with these primitives and respect the light-mode-only rule.

## User Stories

1. As a platform user visiting the unauthenticated homepage, I want to see a clean, warm-cream authentication card with serif display headlines and a coral primary button, so that I experience an inviting and premium first impression.
2. As a platform user, I want the website to be permanently in a clean light mode with no jarring dark mode switches or OS dark mode conflicts, so that the visual presentation is consistently calm and readable.
3. As a platform user submitting the sign-in or sign-up form, I want the form inputs to have subtle hairline borders that highlight with a warm coral focus ring, so that my active input focus is immediately clear.
4. As an authenticated user viewing the top navigation, I want to see a refined 4-spoke radial glyph alongside the serif "S3-Split" wordmark and a "Storage Gateway" pill badge, so that the platform identity feels polished and authoritative.
5. As an authenticated user, I want the top navigation to display my user name and email in clean humanist sans typography with an editorial hairline divider, so that my session state is immediately legible without dominating the header.
6. As an authenticated user managing Upstream Accounts, I want each account to be presented in a warm-cream feature card with clear provider presets and region information, so that I can quickly scan my connected cloud providers.
7. As an authenticated user connecting a new Upstream Account, I want interactive provider preset chips (AWS S3, Cloudflare R2, Wasabi, MinIO) that automatically fill endpoint and region defaults, so that connecting storage is effortless.
8. As an authenticated user testing Upstream Account credentials, I want probe status feedback (testing, verified, failed) rendered in semantic tinted badges rather than harsh alert boxes, so that verification status is evident and elegant.
9. As an authenticated user managing Managed Buckets, I want each bucket card to clearly distinguish between physical buckets and virtual prefix partitions using semantic badges, so that I understand bucket isolation models at a glance.
10. As an authenticated user with active Managed Buckets, I want the Storage Quota progress meter to display a soothing teal bar when usage is below 75%, so that healthy storage levels are immediately reassuring.
11. As an authenticated user whose Managed Bucket usage exceeds 75%, I want the Storage Quota progress meter to transition to warm coral, so that I am gently warned before reaching the quota cap.
12. As an authenticated user whose Managed Bucket reaches or exceeds 100% of its Storage Quota, I want the progress meter to turn crimson and display a "Quota Exceeded" badge, so that I clearly understand why subsequent PutObject operations will be rejected by the S3 gateway.
13. As an authenticated user creating a new Managed Bucket, I want a clean light-cream modal dialog with clear fields for bucket name, upstream target, prefix path, and byte quota, so that bucket configuration is intuitive.
14. As an authenticated user managing Client Keys for a Managed Bucket, I want to open a modal that displays generated credentials inside a dark navy product chrome card, so that cryptographic keys and endpoints visually contrast with administrative forms.
15. As a downstream application developer, I want the Client Key modal to provide copyable SigV4 AWS CLI and curl integration snippets inside a dark navy code window, so that I can immediately configure my application SDK against the S3 gateway proxy.
16. As an authenticated user inspecting system diagnostics or session tokens, I want the collapsible developer panel to format raw JSON in a dark code window with monospace typography, so that technical debug logs remain readable without breaking the light cream aesthetic.
17. As an AI coding agent implementing a future feature, I want clear design system rules in `.agents/rules/ui-design.md` and `AGENTS.md`, so that I never introduce conflicting dark-mode classes or unapproved color palettes.
18. As a frontend maintainer, I want all core components to import shared primitives from `app/components/ui/`, so that updating padding, border radius, or button styles propagates across the entire application simultaneously.

## Implementation Decisions

### Design Foundations & Tokens
- Standardize color tokens in the global stylesheet:
  - Canvas floor: Warm cream (`#faf9f5`)
  - Feature cards: Light cream (`#efe9de`)
  - Elevated product surfaces: Dark navy (`#181715`) with elevated variants (`#252320`, `#1f1e1b`)
  - Primary accent: Warm coral (`#cc785c`) with pressed active (`#a9583e`) and disabled (`#e6dfd8`)
  - Text: Warm ink (`#141413`), body (`#3d3d3a`), muted (`#6c6a64`)
  - Borders: Hairline (`#e6dfd8`), soft hairline (`#ebe6df`)
  - Semantics: Success/teal (`#5db8a6`), warning/amber (`#e8a55a`), error/crimson (`#c64545`)
- Remove all dark mode styles, media queries, and `dark:*` class references.
- Configure Google Fonts in the root Next.js layout:
  - Display Serif: `Cormorant Garamond` (weight 500, tight tracking)
  - UI Sans: `Inter` (weight 400, 500)
  - Code Monospace: `JetBrains Mono` (weight 400)

### UI Component Primitives
- Create reusable primitive components in a dedicated UI directory:
  - `Button`: Primary (coral), secondary (cream hairline), secondary-on-dark (elevated dark), text-link, and danger variants.
  - `Card`: Feature card container with light cream background, hairline border, standard radius (12px), and header/body/footer sub-components.
  - `Input`: Form text input and select components with cream background, hairline border, and coral focus ring.
  - `Badge`: Pill badges supporting cream, coral, teal, and crimson semantic states.
  - `Modal`: Dialog backdrop and centered card container with accessible close button.
  - `CodeWindow`: Dark navy container mimicking product chrome, with monospace code, copy action, and optional header.
  - `Progress`: Quota progress meter with dynamic color transition based on byte percentage (< 75% teal, 75-99% coral, >= 100% crimson).

### Application Shell & Page Overhaul
- Restyle the root layout and top navigation:
  - 64px fixed height with warm cream canvas and bottom hairline border.
  - Radial glyph and serif "S3-Split" wordmark.
  - Coral pill badge for "Storage Gateway".
  - Clean user account dropdown/details and sign-out button.
- Refactor the unauthenticated state into a centered, distraction-free authentication card with tabbed sign-in / sign-up mode switching.
- Refactor developer diagnostics into an expandable dark code window.

### Domain Managers Overhaul
- **Upstream Accounts Manager**:
  - Restyle account list into responsive feature cards with provider icons and status badges.
  - Restyle creation modal and provider quick-preset selector.
  - Restyle deletion confirmation with refined modal and danger button.
- **Managed Buckets Manager**:
  - Restyle bucket cards with storage quota meters using the new progress primitive.
  - Display physical vs virtual prefix indicators using semantic badges.
  - Restyle object explorer table and quota warning banners.
- **Client Keys Modal**:
  - Present generated access key ID and secret access key in a dark navy code window with one-click copy.
  - Present ready-to-use AWS CLI and curl configuration snippets in tabbed dark code windows.

### Architecture Documentation & Agent Rules
- Record `docs/adr/0008-claude-editorial-design-system.md` detailing the architectural choice of Claude's design language, the trade-off against cloud dashboard norms, and the light-mode-only rule.
- Create `.agents/rules/ui-design.md` detailing component composition rules, prohibited patterns (no `dark:*`, no pure white/cool gray), and token definitions.
- Update `AGENTS.md` instructions to mandate compliance with the UI design rule file.

## Testing Decisions

### What Makes a Good Test
- Tests should verify user-observable behavior, accessibility, and visual contract compliance rather than internal Tailwind class permutations.
- Ensure all forms, modal dialogs, and interactive flows continue to function without JavaScript or TypeScript compilation errors.
- Ensure zero dark mode CSS or media queries remain in the bundle.
- Ensure responsive layout behaves properly on mobile, tablet, and desktop viewports.

### Modules Tested
- Component primitives library (`Button`, `Card`, `Input`, `Badge`, `Progress`, `CodeWindow`, `Modal`).
- Page-level rendering for unauthenticated and authenticated sessions.
- Full TypeScript typecheck and Next.js production build.
- Visual inspection and interaction testing via the browser subagent.

### Prior Art
- Existing automated test suite runs via Vitest (`pnpm test`) covering API endpoints and gateway logic.
- Typecheck (`pnpm run typecheck`) and Next.js build (`pnpm run build`) enforce compilation integrity.

## Out of Scope

- Changing backend database schemas or Drizzle migrations.
- Altering S3 gateway proxy logic, SigV4 signature verification, or quota calculation algorithms.
- Adding third-party OAuth providers (Google, GitHub) to Better Auth.
- Re-introducing dark mode toggles or dark mode color schemes.
- Custom raster illustrations or heavy icon libraries.

## Further Notes

- All colors and typography correspond directly to the token tables in `DESIGN.md`.
- Future agents will automatically discover and enforce these design constraints through `.agents/rules/ui-design.md` and `AGENTS.md`.
