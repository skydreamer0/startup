# Synthetic argon2 0.44.0 → 0.45.1 compatibility

Original target: startup PR #62, head `87484a907b07d71731653e8f31fce49f052bc112`.
The integration branch combines master `772289d6c35aa3b09e1ea85c25a1c07d08be782b`
with #64 `bd513a5574dd1a3175a30b5af13ee38fd2d0f40b`, which already contains #62.
This is test-only material, not account data. The baseline and mutation scripts
never read a database or start the server/migrations. The separate HTTP check
below uses only its explicitly guarded disposable Actions service database.
Do not replace this fixture with a real password/hash.

The fixture was generated with the real argon2 0.44.0 package on Linux x64,
Node 24.19.0; it includes default argon2id, argon2i and argon2d hashes and a
public synthetic password. Regenerate into a NEW output file if required:

```
node scripts/argon2-compat/generate-legacy.cjs /absolute/path/to/argon2-0.44.0 new.synthetic.json
```

The generator checks the package version and verifies every generated hash with
0.44.0 before writing. It refuses to overwrite an existing file.

## Final container verification

From the repository root, with the intended PR checkout and an already approved
local Docker runtime:

```
docker build -t startup62-compat systems/enterprise-admin/backend
docker run --rm --network none --read-only --tmpfs /tmp \
  -v "$PWD/systems/enterprise-admin/backend/scripts/argon2-compat:/qa:ro" \
  --entrypoint node startup62-compat \
  /qa/verify-final.cjs /qa/legacy-0.44.0.synthetic.json --require-alpine
```

This uses the final existing node:22-alpine image, not the builder. Overriding
the entrypoint is essential: the normal image CMD runs Prisma migrations.
No DATABASE_URL, real credentials, network, daemon socket or host data is mounted.
`--require-alpine` rejects a host or non-Node-22 run. Do not install or expose a
new daemon merely to run this check without approval.

The verifier requires installed argon2 0.45.1, loads the actual compiled
`dist/lib/password.js`, verifies all three old hashes, rejects wrong passwords,
then executes the actual compiled AuthService login method with synthetic Prisma
and JWT boundaries. It checks successful login, wrong-password 401 with failed
attempt increment and no token issuance, original hash preservation, and new
hash verification. This is service-level login compatibility, not HTTP, real DB,
or real token-signature validation.

## Dedicated Actions verification

`.github/workflows/argon2-compat.yml` checks the exact PR head on this QA branch
using the existing final Node 22 Alpine Dockerfile. Baseline/mutation containers
have no network, a read-only root and fixture mount, and only a temporary `/tmp`
write area. Their migration/server command is replaced by `node`; no database,
account, secrets or Docker socket are passed into those containers. Existing
`ci.yml`, including all four jobs and #66 reviewed-UI evidence, is unchanged.

The job requires all 9 baseline checks and both rejected mutation controls. It
preserves source head/tree, fixture hashes, image ID/metadata and runtime logs in
a run-specific artifact, including failed-run logs. Both test stages run after a
successful build even if the baseline fails; any failed or incomplete evidence
keeps the job red. Cancellation is not successful acceptance. The workflow is a
candidate until independently reviewed, pushed and observed to finish on Actions.

## Integrated HTTP / PostgreSQL / JWT acceptance

The same `final-alpine` job also accepts the same-repository branch
`chore/argon2-master-integration`. It retains `contents: read`, ordinary
`pull_request`, the GitHub-hosted runner and the original 9 + 2 checks. It does
not use `pull_request_target`, repository secrets or a privileged Docker socket
inside the test container. The exact submitted head is checked out with
`persist-credentials: false`; historical #64 runs are not evidence for this head.

`verify-http.cjs` runs in the exact final image already used by both original
checks. Its only database URL is the public synthetic value
`postgresql://test:test@postgres:5432/argon2_integration_ci`, on this job's fresh
`postgres:15-alpine` service network. No database or API port is published on the
host. The container joins only that job-created network; unlike the baseline,
this is a database-connected check, not a `--network none` claim. It retains a
read-only root and QA mount, `/tmp` tmpfs, dropped capabilities and no-new-privileges.
The workflow does not create a new persistent environment or change permissions.

The script fails before application writes unless Node 22/Alpine, argon2 0.45.1,
the explicit synthetic opt-in, fixed connection, actual database name/user and
PostgreSQL 15 identity match. It also requires an empty public schema. Only then
does it explicitly run the repository migrations against that disposable DB.
It does not use the image's default migration-starting CMD, `.env`, normal seed,
database reset/drop or any production connection. Synthetic users, roles, stock,
batch and shift are created in one transaction. The real compiled Express app
then listens on an owned ephemeral loopback port with real Prisma and JWT modules;
no app, database result, password or JWT boundary is mocked.

Fourteen named scenarios require:

- All three real 0.44.0 hashes: wrong-password HTTP 401 with persisted failed count
  and no login audit/token response; successful HTTP login resets that count,
  retains the old hash, records the login and issues verifiable access/refresh JWTs
- Real refresh exchange and protected `/auth/me` acceptance for each legacy user;
  a newly generated 0.45.1 hash also supports HTTP login
- Rejection of forged signatures, expired access and access/refresh token mixups;
  authenticated POS context and rejection of an account lacking `manage:pos`
- HTTP checkout reduces both product and released batch from 5 to 3 and persists
  one payment, OUT movement, durable allocation and checkout command
- Same-command replay preserves the exact response without extra writes; changed
  intent returns 409; insufficient stock rolls back without a stranded command
- HTTP refund registers money-only status and preserves stock, payment records,
  OUT movement and allocation; a duplicate refund cannot rewrite the first reason;
  checkout replay after refund still returns the original completed-order result

The artifact records head/tree/parents, unchanged CI blob, QA/workflow/lockfile
input hashes, final image ID, Postgres image/network identity, logs and all step
outcomes. Acceptance requires the exact 14 scenario names, runtime identity,
head/tree/image equality, stock results 5/3/3, all original 9 + 2 results and
unchanged input hashes. Cleanup closes the owned HTTP server and Prisma clients;
Actions removes its service database. No external payment is executed, and no
production account, real-store reconciliation, physical return or full G0–G7
acceptance is claimed. The ordinary four-job CI remains separately required.

This new integrated HTTP check has not been executed locally: this authoring
environment has host Node 24 and no Docker/Podman/PostgreSQL. Syntax/static checks
and complete Git-tree verification do not replace a successful run at the newly
reviewed integration head. Run and artifact identities are reported only after
that run finishes and its complete evidence is independently reviewed.

## Evidence boundaries

Host partial run: 9 checks passed on Linux x64 Node 24.19.0 with argon2 0.45.1.
Host compiled modules were transpiled from the exact #62 source. This does not
prove Node 22, musl, the final image, or HTTP login. No Docker/Podman/nerdctl binary
or standard local daemon socket was available, so the final Alpine command was
not run. Existing Alpine build and Prisma CLI smoke evidence remains separate
and is not invalidated by this missing compatibility step.

## Harness mutation controls

The synthetic persistence mock applies update fields to its in-memory user, so a
passwordHash overwrite is observable. Both access and refresh token issuance are
recorded; rejected credentials must not add either token.

Run `node /qa/mutation-controls.cjs /qa/legacy-0.44.0.synthetic.json --require-alpine`
in the same final container/cwd, with the same read-only mount and `/tmp` tmpfs.
It creates and removes only temporary compiled-module copies, injects a hash
overwrite and refresh-token-before-401, and requires the verifier to reject both
with assertion failures (not a missing module, timeout or signal). The untouched
verifier must pass first. Host controls rejected both mutations; Alpine remains
not run. These are QA blind spots corrected, not evidence of product bugs in #62.
