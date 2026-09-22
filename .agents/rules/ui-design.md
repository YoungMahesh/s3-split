# UI Design System & Component Composition Rules

All user interface development in S3-Split follows the Claude Editorial design language defined in `DESIGN.md` and governed by `docs/adr/0008-claude-editorial-design-system.md`.

## Golden Rules

1. **Light-Mode-Only**: NEVER introduce dark mode toggles, `@media (prefers-color-scheme: dark)`, or `dark:*` Tailwind classes. The platform canvas is permanently light-mode.
2. **Warm Cream Floor**: NEVER use pure white (`#ffffff`), cool gray (`#f3f4f6`), or zinc (`#f4f4f5`) for background canvas or feature cards. The base canvas is warm cream (`#faf9f5`), and feature cards are light cream (`#efe9de`).
3. **Curated Product Chrome**: Dark navy surfaces (`#181715`, `#252320`, `#1f1e1b`) are strictly reserved for developer product chrome — code editor windows, SigV4 CLI/curl integration commands, Client Key credential displays, and developer diagnostics.
4. **Always Compose from UI Primitives**: Import and compose existing primitives from `@/app/components/ui`:
   - `Button`: Primary (coral), secondary (cream hairline), secondary-on-dark, text-link, danger.
   - `Card`: Feature card containers with light cream background and hairline borders.
   - `Input`, `Select`, `Label`, `FormGroup`: Form inputs with cream backgrounds and warm coral focus rings.
   - `Badge`: Pill badges supporting `cream`, `coral`, `teal`, `amber`, `crimson`, `dark`.
   - `Modal`: Accessible dialogs with light cream styling and backdrop.
   - `CodeWindow`: Dark navy chrome container for code snippets and JSON diagnostics.
   - `Progress`: Quota meter with semantic color encoding (<75% teal, 75-99% coral, >=100% crimson).
5. **Serif Display & Humanist Sans Typography**:
   - Page headlines and card titles use Cormorant Garamond serif (`font-serif tracking-tight font-medium`).
   - Running body, labels, and buttons use Inter humanist sans (`font-sans`).
   - Credentials, code, and endpoints use JetBrains Mono (`font-mono`).
6. **Quota Meter Encoding**:
   - Usage < 75%: Accent Teal (`#5db8a6`) with "Within Quota" badge.
   - Usage 75% - 99%: Warm Coral (`#cc785c`) with "Approaching Quota" badge.
   - Usage >= 100%: Crimson (`#c64545`) with "Quota Exceeded" badge.
