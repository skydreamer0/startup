# Scoped POS release checkpoint — 2026-10-11

This text-only checkpoint contains repository commit/check metadata and aggregate synthetic test outcomes. Local receipts, screenshots, logs, test payloads, machine paths and deployment process details are not exported. The full evidence archive remains local pending explicit export approval.

## Accepted source and merges

- PR118 original source cc01fd18e0e387912a21f8055bd5c6f594fcf41c had two reproduced same-batch confirmation regressions. Corrected source acb4661d9f62d2442b2999ac514ee0be31e6b84b, tree 832ec0464b6c25a775f9c9a275b00b5c298d3895, retained the original three-file scope. Complete remote file readback and independent source review were verified.
- PR119 unchanged source 8c66aa180faa98e0b0aa2a8a00a2cc2d4934b453, tree 3969f20863b52ae91e666560ad9434d9a1b3319b, retained its three-file scope; complete readback and independent source review were verified.
- Authorized squash order118 then119. PR118 merge 296b120b00599e816776df9a0310dac641495106, parent dff3f71afc4f3d92a580bca6d667c21cb28d6c23; PR119 merge b2d4d477ece4de9468ea0861a12dec00121cb10c, parent 296b120b00599e816776df9a0310dac641495106.
- Final master b2d4d477ece4de9468ea0861a12dec00121cb10c, tree c143d4e078f64e40012d74bde3b871f7d934454a, equals reviewed combined candidate6573b6dab8daddb0c2032954d8f12f2ce9e448f6. Exactly six scoped files changed over previous masterdff3f71afc4f3d92a580bca6d667c21cb28d6c23; prior releases remain present.

## Actual checks and acceptance

- Source118 POS CI:17 focused and409 full tests PASS. Source119:18 focused and410 full PASS. Types/build and the four core/security checks PASS at both exact source heads. Devin completion remains unverified.
- Shared category/current-browser CI remains FAIL (expected hidden, received visible); downstream stock steps SKIPPED. No overall CI PASS claim.
- Current-master integration:73 focused and427 full POS tests PASS, zero failures/skips; types/build PASS.
- Independently inspected built-browser run5: five defined editable/frozen journeys PASS, including1366/1024 editable views and pending/unknown/conflict. Native disabled controls and frozen intent preservation were verified with synthetic local HTTP. Prior attempts1–4 remain historical FAIL. No real API/DB or physical-device acceptance is claimed.
- Final-master pipeline: https://github.com/skydreamer0/startup/actions/runs/38129243209 — still pending/in progress at publication; source checks do not transfer to final-master jobs. CodeQL checks on final master completed successfully.

## Held scope and cleanup

PR109 remains OPEN/unmerged at a8a248dc5b46dd24487a9b742a6c50606c3c3063. The bounded Windows native probe failed to reach a valid visible state; original seven cases,46 captures and three genuine61-second hidden intervals were not run. No same held cloud job was rerun manually. PR120 and121 remain independent and were not integrated.

Only merged118/119 source branches were deleted, after remote head/merge and no-child-dependency checks plus a verified complete-history recovery bundle. Recoverable local source/candidate refs remain. Original user and previous acceptance worktrees are preserved.

A new local development POS frontend was deployed and its actual login-screen rendering smoke passed. Backend is unconfigured; login/transactions/full-stack/production deployment remain unverified. No backend/database, security setting, unrelated service or HPK worktree was changed.
