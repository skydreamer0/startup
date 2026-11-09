# Independent print review: reproducibility addendum

The sealed `systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-print-20261109/independent-review.json` is unchanged. Its SHA-256 is
`ddd2dbee7ccaea3b327d0f5b753248d77e85fee63da138bb788dc2f14f515078`.

`replay_print_review.py` packages the exact probe and audit operations previously
run inline, with six-file source pins, new-directory-only fixture writes, and
repository-relative arguments/results. It does not modify the application,
canonical acceptance files, or the sealed review. A new run is supplemental
evidence, not a replacement for the historical observations.

From the repository root, reproduce both private-directory observations, four
metadata mutations, and two guard mutations:

```sh
PYTHONDONTWRITEBYTECODE=1 python systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-print-20261109/independent-probes/replay_print_review.py \
  --root . --output-dir verification-output/print-review-new
```

The historical verifier is reconstructed in memory and its exact original
SHA-256 is checked before execution. Both private files contain only the fixed
non-secret synthetic sentinel and exist only in disposable fixture directories.
The fixed verifier is observed with read, copy and directory-traversal spies.

To additionally reproduce the previously executed 52-test audit:

```sh
PYTHONDONTWRITEBYTECODE=1 python systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-print-20261109/independent-probes/replay_print_review.py \
  --root . --output-dir verification-output/print-review-audit-new --audit-suite
```

The audit prohibits socket bind/connect/sendto and process-launch audit events;
`Thread.start` is separately prohibited. Internal AF_UNIX/SOCK_STREAM event-loop
socketpairs are observed, not misreported as external network access. The guards
cover the reviewed pinned source, not arbitrary future Python code. Existing
output directories are refused, so choose a fresh relative path for each rerun.
Archived results remain under `systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-print-20261109/independent-probes/probes-run/`; reruns must not overwrite them.
The optional 52-test audit has not been re-executed merely to prepare this addendum.
