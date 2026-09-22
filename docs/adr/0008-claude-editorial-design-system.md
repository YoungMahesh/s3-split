# Claude Editorial Design System & Light-Mode Platform Governance

## Context

S3-Split is a multi-tenant storage gateway that partitions upstream S3 storage into managed buckets and enforces strict real-time byte quotas. The original user interface used generic, utilitarian zinc dark/light styles with ad-hoc Tailwind classes. This created three core problems:
1. **Lack of Identity & Polish**: The platform felt like a generic starter template rather than a premium, authoritative storage infrastructure tool.
2. **Dual-Theme Inconsistencies**: Maintaining concurrent light and dark themes introduced CSS overhead, awkward contrast bugs across forms and tables, and fragmented visual development.
3. **Unstandardized Component Styles**: Without centralized UI primitives, contributors and AI agents introduced divergent padding, mismatched button styles, and inconsistent quota meters.

## Decision

We decided to adopt the warm-editorial design system defined in `DESIGN.md` across the entire application and establish strict UI governance:

1. **Light-Mode-Only Anchor**: Dark mode is completely removed from the application canvas and forms. The platform is permanently anchored on a warm cream canvas (`#faf9f5`) with light cream feature cards (`#efe9de`), subtle hairline dividers (`#e6dfd8`), and warm-ink typography (`#141413`).
2. **Curated Product Chrome**: Dark navy surfaces (`#181715` with elevated `#252320` and soft `#1f1e1b`) are strictly reserved for technical product chrome — code editor windows, SigV4 CLI and curl integration snippets, Client Key credential displays, and developer diagnostics.
3. **Refined Typography**: Display headlines run Cormorant Garamond serif (weight 500, negative tracking) for an editorial tone, paired with Inter humanist sans for running copy and form controls, and JetBrains Mono for cryptographic credentials, code snippets, and endpoints.
4. **Foundational UI Primitives**: All UI components are composed from centralized primitives in `app/components/ui/` (`Button`, `Card`, `Input`, `Select`, `Label`, `Badge`, `Modal`, `CodeWindow`, `Progress`).
5. **Harmonious Quota Encoding**: Storage quota meters use warm-tinted thresholds: soothing accent teal (`#5db8a6`) under 75%, warm coral (`#cc785c`) between 75% and 99%, and muted crimson (`#c64545`) when a quota is reached or exceeded.

## Consequences

- Consistent, calm, and distinctive user experience with zero flash of unstyled theme or OS dark mode conflicts.
- Future agents and contributors have clear constraints documented in `.agents/rules/ui-design.md` and `AGENTS.md`.
- Reduced CSS bundle size and maintenance complexity by eliminating dark mode overrides and duplicate color scales.
