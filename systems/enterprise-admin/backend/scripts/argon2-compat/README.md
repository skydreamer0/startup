# Synthetic argon2 0.44.0 → 0.45.1 compatibility

Target: startup PR #62, head `87484a907b07d71731653e8f31fce49f052bc112`.
This is test-only material, not account data. It never reads a database or starts
the server/migrations. Do not replace this fixture with a real password/hash.

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
using the existing final Node 22 Alpine Dockerfile. Runtime containers have no
network, a read-only root and fixture mount, and only a temporary `/tmp` write
area. The migration/server command is replaced by `node`; no database, account,
secrets or Docker socket are passed into the containers. Existing CI is unchanged.

The job requires all 9 baseline checks and both rejected mutation controls. It
preserves source head/tree, fixture hashes, image ID/metadata and runtime logs in
a run-specific artifact, including failed-run logs. Both test stages run after a
successful build even if the baseline fails; any failed or incomplete evidence
keeps the job red. Cancellation is not successful acceptance. The workflow is a
candidate until independently reviewed, pushed and observed to finish on Actions.

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

