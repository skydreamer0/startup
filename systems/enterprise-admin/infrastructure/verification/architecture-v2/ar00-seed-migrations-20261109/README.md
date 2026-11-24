# AR-00 seed/startup-migration source coverage

Refs #180; delivered through existing Draft #205. **Bounded tooling/source review
PASS. Full AC01 and application/native acceptance remain NOT_RUN.**

## Exact source

- Application/source base: `b66e1f96447bbc5034110843b4349aef7ca44c4b`, tree `eb5d6286792df789fae0870c884980b792a3673d`.
- Tested and independently reviewed local source: `a2849bf98ad7eb26f8f037726a6cc95efa3a2300`.
- Published equivalent source: `e9bff6c8f9ba58a0d26202c3605e0ef1f746a164`.
- Both new source trees: `0c4b98cc2fd559a5a7a2fca353e4cf9f8e76c8e2`.
- [Remote source readback](source-tree-readback.json) compared all 1,321 leaf paths, modes, types and blob identities without truncation. Only 207 baseline files were materialized; this was not a full application checkout. The two expected docs changed; 205 other materialized baseline files remained byte-identical.
- The publication commit adds this evidence directory only. Its current head and exact-head hosted checks are recorded in #205; equal source trees do not transfer CI identity.

## Delivered scope

The new [mechanical inventory](../../../plans/architecture-v2/seed-migration-inventory.json)
and [curated effects map](../../../plans/architecture-v2/seed-migration-effects.json)
cover 25 literal seed call sites (22 writes, two reads, disconnect), one nested
OrderItem create site, three configured entry chains, all 16 packaged migration
SQL files, 64 FK declarations and 14 inspected test/harness sources. Domain
owners, AR check destinations, data effects and missing coverage are explicit.

The read-only verifier checks 21 implementation/config fingerprints, five
reference citations, test/harness citations, exact migration-file coverage,
seed call slices/token body, entry chains and semantic-map metadata. Commands
are inert text. Nothing imports or executes Prisma seed, migrations or the app.

## Executed evidence

- Author and independent reviewer each passed **67/67 new controls + 78/78 existing plan tests + 17/17 existing gate tests**, with zero failures/skips on Node **v24.22.1**.
- Both source verifiers, context validation, two syntax checks and whitespace checks passed. Exact commands, exit codes and logs are in [author results](author/author-results.json) and [independent review](independent-review/review.json).
- Independent checks rejected 20 unsupported lexer forms and compared all 16 SQL target-model sets/64 FK declarations against the sources. All 14 test/harness assertion bodies were inspected, not executed.
- Initial review found a real citation gap: changing readiness.ts or removing server.ts incorrectly returned PASS. [Initial probes](independent-review/initial-probes.json) preserve the failure. The corrected verifier validates the exact reference set and source bytes; [final probes](independent-review/final-probes.json) reject both. No missing historical suite log was reconstructed.
- [Structured receipt](receipt.json), [review narrative](independent-review/review.md), [all artifact hashes](SHA256SUMS).

## Reproduce from the repository root

```sh
node scripts/architecture/verify-seed-migrations.mjs
node --test scripts/architecture/seed-migrations.test.mjs
node scripts/architecture/verify-plan.mjs --check-source
node --test scripts/architecture/plan.test.mjs
node --test systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-closeout-20261108/gate-acceptance.test.mjs
./scripts/validate-agent-context.sh
node --check scripts/architecture/verify-seed-migrations.mjs
node --check scripts/architecture/seed-migrations.test.mjs
node systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-seed-migrations-20261109/independent-review/lexer-probes.mjs
node systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-seed-migrations-20261109/independent-review/probes.mjs
python systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-seed-migrations-20261109/independent-review/check-sql-map.py
git diff --check b66e1f96447bbc5034110843b4349aef7ca44c4b e9bff6c8f9ba58a0d26202c3605e0ef1f746a164
```

These are manually invoked source checks, not newly added hosted CI jobs.
The exploratory probes deliberately include a documented accepted semantic-pin
limitation; inspect their named results, not only the process exit code.

## Limits and remaining work

The seed scanner is a finite literal lexer, not a general TypeScript AST. SQL
effects are curated, not a semantic parser. Exact byte pins are intentionally
conservative. Updating all source/semantic pins still requires independent
review; a coordinated empty assertion catalogue can pass a refreshed semantic
pin and is not counted as a successful rejection control.

Source inspection records direct seed stock resets/releases, unscoped reads and
partially independent order/movement writes without endorsing them as rules.
The Docker command still performs migration before server startup. Existing
health-image checks override the entrypoint and cannot establish migration-free
restart or migration/runtime role separation. These need separate implementation
and authorized isolated runtime acceptance.

Seed, clean/populated migration, interruption recovery, app/PG/HTTP/browser,
device/store acceptance, Node22 execution of these manual suites and full AC01
were **NOT_RUN**. Historical/hosted green checks do not fill those gaps. The
remaining full-writer inventory includes print transport/worker closure and
HTTP test-to-effect gaps identified in the prior #205 audit.

No application, schema, migration, package/lock, workflow, existing verifier or
gate test, #204 source, canonical manifest/evidence, issue checkbox, decision or
activation state changed. AR-00 stays active/NOT_RUN, AR-01 blocked, D01–D09
UNAPPROVED, G0–G7 NOT_RUN and activation BLOCKED. No DB, external service,
device, user computer, merge or deployment operation occurred.
