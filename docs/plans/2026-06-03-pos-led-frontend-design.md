# POS-Led Frontend Design Language

## Goal

Unify the `admin-ui` and `pos-ui` frontend design language so both surfaces feel like one PharmaSaaS product, with the point-of-sale interface as the visual source of gravity.

## Context

The active system has two frontend surfaces:

- `systems/enterprise-admin/admin-ui/`: back-office React + Vite app for enterprise operators.
- `systems/enterprise-admin/pos-ui/`: cashier-facing React + Vite point-of-sale app.

`pos-ui` already completed the Warm Minimalist POS design system in Phase 9.5. It uses warm canvas colors, amber actions, thick touch-friendly borders, large rounded controls, pill states, and tabular numeric treatment.

`admin-ui` currently carries a colder enterprise dashboard language from its Phase 12 operational refresh. It is dense and scan-first, which is still correct for back-office workflows, but its visual tone no longer matches the POS surface.

ADR-012 explicitly rejects creating `packages/ui/` in the current phase. This design therefore unifies language, tokens, layout grammar, and control treatment without introducing a shared React component package.

## Decision

Use **POS-Led Token Convergence**.

The POS interface remains the design source. Admin moves toward a POS-adjacent "store operations console" while keeping back-office density.

Do not create `packages/ui/`.

Do not force identical React components across the two apps.

Do align:

- Surface vocabulary.
- Accent and semantic color direction.
- Border thickness and panel treatment.
- Control radius and pressed states.
- Status pill grammar.
- Money, quantity, and metric typography.
- Operational shell feel.

## Design Language

### Visual Tone

Both frontends should feel like tools used in a pharmacy branch during live operations.

`pos-ui` is the cashier counter.

`admin-ui` is the branch operations console behind the counter.

The shared tone is warm, clear, tactile, and operational. It should avoid the cold SaaS-dashboard feel of generic enterprise admin tools.

### Color

`pos-ui` keeps its current warm palette:

- App canvas: warm off-white.
- Cart/panel surface: warm muted beige.
- Primary action: amber.
- Border: warm taupe.
- Success: pharmacy green.
- Danger: strong red.
- Info: blue, used sparingly.

`admin-ui` should migrate away from purple/blue enterprise accents and adopt POS-adjacent tokens:

- App canvas: warm off-white, slightly quieter than POS.
- Sidebar shell: warm charcoal or deep brown-black, not cold slate.
- Primary action: amber.
- Accent soft/background: amber wash.
- Borders: warm taupe.
- Cards/tables: white or soft warm panels.

### Shape

`pos-ui` keeps larger touch-friendly radii for checkout objects.

`admin-ui` uses smaller but related radii:

- Admin panels: 8px.
- Admin controls: 7px or 8px.
- Admin badges/chips: 6px to 999px depending on semantic pill role.
- POS cards/controls remain more rounded where touch targets need it.

This keeps admin dense while making it visually related to POS.

### Borders And Surfaces

Use borders as the main structural device.

POS uses 1.5px to 2px borders for touch clarity.

Admin should use warm 1px borders by default, with stronger 1.5px borders for important controls, selected states, and operational summaries.

Avoid heavy glass, generic gradients, and decorative dashboard effects. Use restrained warm surfaces and clear state changes.

### Typography And Numbers

Both apps should use tabular numeric treatment for prices, quantities, KPI values, payment amounts, stock counts, and settlement figures.

Admin page headings remain compact. POS display text may be larger when used for checkout totals or cashier actions.

No viewport-scaled font sizes.

### Controls

Controls should feel physical enough for POS but efficient enough for admin.

Shared grammar:

- Primary action: amber fill.
- Secondary action: white or warm surface with warm border.
- Destructive action: red soft background or red fill depending on risk.
- Selected state: amber soft fill plus amber border.
- Disabled state: reduced opacity with no hover lift.

Admin buttons should not use lift/float hover effects. POS buttons may use stronger pressed states for touch feedback.

### Status

Status indicators should use pill or badge language with explicit semantic colors:

- Success: green.
- Warning: amber.
- Danger: red.
- Info: blue.
- Muted/neutral: warm gray/taupe.

Admin tables and POS operational chips should look related even when implemented separately.

## Architecture Boundary

Keep CSS and React components inside their current app boundaries:

- `admin-ui/src/index.css` owns admin operational primitives.
- `pos-ui/src/index.css` owns POS layout and primitive classes.
- `pos-ui/src/components/ui/*` remains local to POS.
- `packages/types` remains the only current shared package consumed by both apps.

This preserves ADR-012 and avoids CSS order coupling.

Future `packages/ui` extraction can be reconsidered only if the ADR-012 revisit threshold is met.

## Implementation Strategy

1. Update admin global tokens and operational refresh CSS to use POS-led colors, surface rules, border behavior, and control states.
2. Keep admin layout structure intact, including sidebar and dense tables.
3. Extract obvious POS topbar/control inline styles into local POS CSS classes so POS has a cleaner local design system foundation.
4. Do not change backend behavior or API contracts.
5. Verify both apps build.
6. Use visual inspection for the main admin and POS screens when a local dev server can run.

## Testing And Verification

Minimum verification:

- `cd systems/enterprise-admin/admin-ui && npm run build`
- `cd systems/enterprise-admin/pos-ui && npm run build`
- Inspect `git diff --name-only` for context freshness.
- Run agent context validation if architecture or context documents change.

Visual verification should include:

- Admin shell/sidebar/dashboard or a representative admin page.
- POS checkout screen.
- POS login or shift-open screen if CSS changes affect shared POS tokens.

## Non-Goals

- No `packages/ui` creation.
- No table/modal extraction.
- No backend or API behavior change.
- No full rewrite of admin pages.
- No attempt to make admin as large or touch-first as POS.

