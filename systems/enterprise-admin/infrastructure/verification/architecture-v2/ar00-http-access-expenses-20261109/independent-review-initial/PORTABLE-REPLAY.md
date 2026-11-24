# Portable replay of the original mocked forwarding probes

## Evidence identity

`expense-dataflow-probe.cjs` is the byte-exact historical reviewer probe. It retains its original environment-specific compiler/root paths and must not be mistaken for the portable entry point.

`expense-dataflow-replay.portable.cjs` is a **new path-adapted artifact**, not the original probe and not a rewritten original receipt. Only repository-root/compiler selection and invocation help were adapted. From the `const moduleRoot = ...` declaration onward, its source-loading helper, VM import allowlist, synthetic stubs, three payloads and assertions are byte-identical to the original. `portable-adapter.diff` and `portable-replay-receipt.json` record that relationship.

Original probe SHA256:
`f1be7781c7adc38d03aaf1ccaba3c10320b44c5ade356f7d45fe347a3f6291df`

Original initial-review receipt SHA256:
`52b403bc321f7138dd3fbeb34b1fbb934122e098301974499816d1a88593b287`

The original R1 finding and evidence remain historical. The separate `../independent-review-r1/` receipt resolves the mapping correction only; it does not resolve the application risk.

## Run without installing anything

Use an existing approved checkout and already-installed TypeScript. The successful replay recorded here used Node24.22.1 and TypeScript5.9.3; no Node22 execution is claimed.

If TypeScript resolves normally from the checkout's backend package or repository root:

```sh
node --test-reporter=tap expense-dataflow-replay.portable.cjs --root /path/to/checkout
```

Otherwise explicitly select an already-installed compiler package or its module entry:

```sh
node --test-reporter=tap expense-dataflow-replay.portable.cjs --root /path/to/checkout --typescript /path/to/installed/typescript
```

Do not use `node --test` with these positional options; invoke the script as above. Its `node:test` declarations run automatically. It does not install packages or load ambient application configuration. Missing root, unknown/duplicate options and unavailable compiler paths fail rather than silently choosing another environment.

Before interpreting a replay as equivalent evidence, compare the two selected expense source-file hashes with `portable-replay-receipt.json`. The recorded source is from application baseline `5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e`, preserved unchanged in freeze `7fc1ae6a50108988676fa03a38d54207f12eea7c`. A new source version needs a separately identified run and review.

## What the new replay establishes

Both explicit compiler selection and normal backend-package resolution were independently replayed with3/3 passing probes. The normal-resolution check used a reviewer-owned fixture containing the same two source files and an already-installed compiler available at backend/node_modules; it did not execute the whole application.

The probes transpile the actual controller/service source, then run it with an explicit allowlist of in-memory dependency stubs. They only characterize raw update argument forwarding for tenant.update, tenantId and amount.increment. No real Prisma client, server, HTTP, database, provider or device is used. This is not evidence of Prisma accepting those payloads, persisted modification, tenant escape, successful auth/RBAC, or a create-path execution.

`portable-replay.log`, `portable-default-resolution.log`, and `portable-path-controls.json` are **new adapter-validation evidence**, separate from `expense-dataflow-probe.log`. Do not relabel them as the original run or add them to the76 source-map checks.

## Preservation

`original-artifacts.json` lists historical files copied byte-for-byte. `SHA256SUMS.publication` seals originals and the separately named new adapter materials. It is not a replacement for the original reviewer receipt or original artifact hashes.
