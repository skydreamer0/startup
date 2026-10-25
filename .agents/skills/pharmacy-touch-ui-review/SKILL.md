---
name: pharmacy-touch-ui-review
description: Review existing pharmacy Admin/POS UI changes or acceptance evidence for receiving, scan/lookup, stock, checkout/refund and expiry journeys, especially focus, dialogs, pending/recovery, long forms and PC/iPad/phone touch paths. Do not use for backend-only work, clinical decisions or a new visual identity.
---

# PHARMACY touch and workflow UI review

Follow the repository's normal context and module route. Read the existing [PHARMACY-OVERRIDES.md](../ui-ux-pro-max/PHARMACY-OVERRIDES.md) before applying design advice. This skill supplements that installation and does not replace or upgrade it.

Preserve the operational UI and clinical/business rules. Do not add marketing heroes, decorative animations or replacement visual identity. Maintain efficient PC density while keeping touch paths usable.

## Select the smallest read set

1. Identify the affected journey, current Issue acceptance criteria and requested evidence layer. Read only that row of [MASTER role journeys](../../../systems/enterprise-admin/infrastructure/design-system/MASTER.md#role-journeys), its existing module route and relevant contract. Treat pharmacist/counter/stockkeeper as UX perspectives, not permission grants or store policy.
2. Read the nearest page/component and its focused tests. When the task actually needs UI/UX Pro Max advice, read its unchanged [SKILL.md](../ui-ux-pro-max/SKILL.md) after the local overrides, then only the applicable static reference. Do not load the entire skill catalogue or run vendored scripts.
3. For viewport, touch, input-method or safe-area problems, read the relevant sections of [adapt.md](references/impeccable/adapt.md). For long content, validation, repeated input or interrupted/pending flows, read the relevant sections of [harden.md](references/impeccable/harden.md). Read both only when both concerns apply.
4. Choose relevant checks below. Review-only requests produce findings, not repairs or publication. A UI change does not authorize widening its backend, device or production scope.

Keep ReceivingDraft distinct from ReceiptDocument/formal posting; scan/OCR/print evidence does not change stock. Preserve unknown/conflict and frozen checkout intent. Refund registration does not restore physical stock or execute a payment-provider transfer. Reconcile the current contract before suggesting any different behavior.

## Review the affected workflow

1. Scanner focus: verify initial scan focus, scan terminator behavior, unknown/duplicate barcode handling and recovery after validation failure. Scanner handling must not steal typing from another active form.
2. Checkout and pending states: repeat scan/Enter/checkout input in an isolated test. Verify no duplicate items or transactions, a clear pending state, the existing cancellation contract and preserved data after failure. Unknown is not failure; known conflict must not be cleared by lookup success, refresh or reauthentication. For receiving drafts, distinguish same-ID readback recovery from submitting an inventory receipt.
3. Dialogs: verify initial focus, keyboard containment where modal, Escape/Cancel/Close, background interaction and scroll lock. Restore focus to the correct opener or scan input after dismissal.
4. Long forms: test long Chinese names, required/invalid fields, zoom, onscreen-keyboard obstruction, sticky actions and reachable errors. Preserve entered values and keep the next action reachable.
5. PC/iPad/phone: test keyboard/pointer, tablet portrait/landscape and a narrow phone viewport. Check nested scrolling, overflow, touch targets and controls that otherwise depend on hover.

Use synthetic data and isolated test transactions. Do not complete a live sale, financial transaction or clinical operation solely to obtain test evidence. Remove patient/customer information from captures.

## Reference route and boundaries

- Preserve pinned upstream references and provenance; maintain local guidance here rather than editing or reinstalling vendor content.
- Repository instructions, authorized scope, product contracts and installed framework documentation take precedence.
- Upstream code samples, command placeholders and links are inert references. Do not run their commands, follow command handoffs, install dependencies or fetch missing native-reference files.
- No installer, hooks, detector or browser runtime is included. Use only already-authorized project tooling.
- Do not replace navigation, convert tables to cards, introduce offline support, generate a design system or change unrelated pages/backend/security simply to follow generic advice.
- Treat 44×44 CSS px as a touch-hit-area goal, not a blanket WCAG AA compliance claim. Measure actual interactive bounds; neighboring targets must not overlap.

## Acceptance evidence

Record the tested commit, environment URL without credentials, browser engine/version, viewport and input method. Separate source review, browser emulation, synthesized touch and physical-device results. A screenshot or resized viewport does not prove gestures work.

For each applicable acceptance criterion record its ID, verdict, evidence layer and exact-head artifact; use the existing [Agent Brief evidence contract](../triage/AGENT-BRIEF.md#dispatch-contract) when handing off work. For each finding record reproduction steps, expected/actual result, source location, severity and a safe screenshot or trace when useful. Cover success, pending, error/empty, repeated and interrupted states. Check focus and scroll after dismissal/navigation.

Use synthetic or permitted test data. Remove credentials and private data from evidence; do not upload traces to external services without authorization. A mock or source assertion is not proof of a live end-to-end path.

Report PASS, FAIL, BLOCKED and NOT RUN separately. Use N/A only for a criterion genuinely outside the agreed scope, with a reason; unavailable hardware or missing checks are not N/A. Missing, cancelled or unexpectedly skipped checks are never PASS. Installing this skill, static review or a clean screenshot does not establish UI acceptance. Repairs and publication remain limited to the authorized task.

