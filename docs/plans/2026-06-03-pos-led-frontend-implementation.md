# POS-Led Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `admin-ui` and `pos-ui` share a POS-led frontend design language while preserving their current app boundaries.

**Architecture:** Keep React components inside each frontend app and do not create `packages/ui`, per ADR-012. Update global CSS tokens and local CSS primitives so POS remains the visual source and admin becomes a POS-adjacent operations console.

**Tech Stack:** React 19, Vite 6, Tailwind CSS v4 imports, local CSS variables, TypeScript, npm package scripts.

---

## Preconditions

- Work from repo root: `C:\Users\User\OneDrive - MSFT (1)\0.專案\startup`
- Branch: `feat/pos-led-frontend-design`
- Read first:
  - `docs/plans/2026-06-03-pos-led-frontend-design.md`
  - `systems/enterprise-admin/infrastructure/adr/adr_012_shared_ui_library_decision.md`
  - `systems/enterprise-admin/admin-ui/MODULE.md`
  - `systems/enterprise-admin/pos-ui/MODULE.md`

## Task 1: Admin POS-Led Token Convergence

**Files:**
- Modify: `systems/enterprise-admin/admin-ui/src/index.css`

**Step 1: Inspect current admin token blocks**

Run:

```powershell
Get-Content -LiteralPath 'systems\enterprise-admin\admin-ui\src\index.css' -Encoding UTF8 | Select-String -Pattern 'Core Surfaces|PHARMASAAS BRAND TOKENS|ADMIN UI OPERATIONAL REFRESH|--admin-accent|--color-primary|sidebar' -Context 0,3
```

Expected: output shows cold enterprise tokens, PharmaSaaS brand tokens, and Phase 12 admin refresh overrides.

**Step 2: Update brand and admin tokens**

In `admin-ui/src/index.css`:

- Change `--color-primary` from purple to POS amber.
- Change hover/press/soft variants to amber-family values.
- Add or align warm app surface values for admin:
  - warm canvas
  - warm muted panel
  - warm hairline/border
  - warm charcoal shell
- Update `--admin-accent*` variables to use the amber values.
- Update dark mode admin accent values to amber-tinted equivalents.

Expected CSS direction:

```css
:root {
  --color-primary: #d97706;
  --color-primary-hover: #b45309;
  --color-primary-press: #92400e;
  --color-primary-soft: #fef3c7;
  --admin-shell: #2f261f;
}
```

Use exact surrounding file style and avoid introducing a shared CSS import.

**Step 3: Update admin operational shell treatment**

In `admin-ui/src/index.css`:

- Replace the cold dark sidebar gradient with warm charcoal/deep brown-black.
- Change `.admin-layout` background from radial dashboard effect to warm operational canvas.
- Keep `.main-content`, `.page-header`, `.table`, `.btn`, `.badge`, and `.card` structure intact.
- Remove hover lift from admin primary buttons if any remains.

Expected behavior: admin still has dense sidebar/table layout, but color, borders, and selected states are POS-adjacent.

**Step 4: Run admin build**

Run:

```powershell
cd systems\enterprise-admin\admin-ui
npm run build
```

Expected: build succeeds.

**Step 5: Commit task**

Run from repo root:

```powershell
git add systems\enterprise-admin\admin-ui\src\index.css
git commit -m "style(admin-ui): align admin shell with POS design"
```

## Task 2: POS Topbar And Control CSS Cleanup

**Files:**
- Modify: `systems/enterprise-admin/pos-ui/src/index.css`
- Modify: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`

**Step 1: Identify inline POS topbar styles**

Run:

```powershell
Get-Content -LiteralPath 'systems\enterprise-admin\pos-ui\src\pages\POSCheckoutPage.tsx' -Encoding UTF8 | Select-String -Pattern 'style=\{\{' -Context 0,1
```

Expected: output shows inline styles in the POS topbar and cart recommendation wrapper.

**Step 2: Add local POS primitive classes**

In `pos-ui/src/index.css`, add classes for:

- `.pos-brand`
- `.pos-brand-mark`
- `.pos-brand-title`
- `.pos-brand-subtitle`
- `.pos-shift-pill`
- `.pos-shift-dot`
- `.pos-search-input`
- `.pos-topbar-action`
- `.pos-topbar-action--danger`
- `.pos-recommendation-strip`

Class behavior should preserve current layout and visual output while centralizing POS control grammar.

Expected CSS shape:

```css
.pos-topbar-action {
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-full);
  padding: 6px 14px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}
```

**Step 3: Replace topbar inline styles**

In `POSCheckoutPage.tsx`:

- Replace the brand inline style group with `.pos-brand`, `.pos-brand-mark`, `.pos-brand-title`, and `.pos-brand-subtitle`.
- Replace the shift status inline style group with `.pos-shift-pill` and `.pos-shift-dot`.
- Replace the search input inline style with `.pos-search-input`.
- Replace order/report/customer/staff/close-shift button inline styles with `.pos-topbar-action` and `.pos-topbar-action--danger`.
- Replace recommendation wrapper inline padding with `.pos-recommendation-strip`.
- Keep existing labels, event handlers, `title`, and `data-testid` attributes unchanged.

**Step 4: Run POS build**

Run:

```powershell
cd systems\enterprise-admin\pos-ui
npm run build
```

Expected: build succeeds.

**Step 5: Commit task**

Run from repo root:

```powershell
git add systems\enterprise-admin\pos-ui\src\index.css systems\enterprise-admin\pos-ui\src\pages\POSCheckoutPage.tsx
git commit -m "style(pos-ui): consolidate POS topbar controls"
```

## Task 3: Cross-App Verification And Context Freshness

**Files:**
- Review: `docs/plans/2026-06-03-pos-led-frontend-design.md`
- Review: `systems/enterprise-admin/admin-ui/src/index.css`
- Review: `systems/enterprise-admin/pos-ui/src/index.css`
- Review: `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`

**Step 1: Run both builds**

Run:

```powershell
cd systems\enterprise-admin\admin-ui
npm run build
cd ..\pos-ui
npm run build
```

Expected: both builds succeed.

**Step 2: Inspect changed files**

Run from repo root:

```powershell
git diff --name-only master...HEAD
git diff --stat master...HEAD
```

Expected changed areas:

- `docs/plans/2026-06-03-pos-led-frontend-design.md`
- `docs/plans/2026-06-03-pos-led-frontend-implementation.md`
- `systems/enterprise-admin/admin-ui/src/index.css`
- `systems/enterprise-admin/pos-ui/src/index.css`
- `systems/enterprise-admin/pos-ui/src/pages/POSCheckoutPage.tsx`

**Step 3: Decide context freshness**

If the implementation only changes styling and local POS CSS class extraction, no `CONTEXT.md`, `MODULE.md`, ADR, or navigation update is required.

If a shared package, module boundary, or source-of-truth location is introduced, stop and update context documents. This plan should not introduce any of those.

**Step 4: Commit plan file if not already committed**

Run from repo root:

```powershell
git add docs\plans\2026-06-03-pos-led-frontend-implementation.md
git commit -m "docs(admin-ui): plan POS-led frontend implementation"
```

Skip this commit if the file is already committed.
