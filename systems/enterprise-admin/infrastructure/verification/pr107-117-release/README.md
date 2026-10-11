# PC4070 released batch: partial merge checkpoint, 2026-10-11

A29 owns these local integrations, exact remote verification and Issue/PR records.
The parent owns the batch decision. User/parent released individual PRs in order
117→107→108→110→112→111→113→114→115→116, holding109 separately.

## Confirmed merges

| PR | Squash commit | Tree | Actual changed files | Fresh integrated verification |
| --- | --- | --- | ---: | --- |
|117|`8385bb4c96e299d913061b2d8b7083e785b0aa8b`|`9cbd9e837ca9fa6a2955b8667a9268d30c24c5ff`|2|Windows21/21; exact Draft Linux9+21+38+5; prior combined Windows372/0/81|
|107|`42bd00d0ca833cd452d76f1e51dd1b7ecb847f82`|`809b93aea9ca0b98dda062da7a9dd1514a24d31f`|3|batch trace30/30|
|108|`20b422e4a121b71e59b594bc64bc0ab4bfd6dd58`|`a3e78f7167f142403b120f64902fb43b72474c7a`|5|batch trace30/30; Windows-applicable evidence controls9/9|
|110|`130340682f6d51dec900842ec0f62f8d13568e1a`|`f51907de3959b64eee012b65daeef92590798de9`|5|ownership guards14/14; fresh real HTTP/owned PG trace8/8|
|112|`40c3d752ef64ddabb8c06613b57b791a5e53d8ab`|`05820cc2ced503ab3ab22e6756b116df15bc5362`|11|combined Admin trace/navigation/pagination/layout/suppliers112/112|

Every squash has the expected single actual master parent and exactly the tested
candidate tree. All26 complete changed files were read back from remote Git blobs
and matched source bytes; no source conflict or author-branch rewrite occurred.
108 and110 were retargeted after their parents' squash merges, then their complete
new PR diffs, final actual deltas and integrated tests were checked. Four active
required statuses passed on every reviewed PR head; normal merge commands used
exact-head guards, with no administrator bypass or branch-protection changes.

## Cancellation pause and remaining source

**Further merges are paused.** PR110's automatically triggered master
[CI run38121605463](https://github.com/skydreamer0/startup/actions/runs/38121605463)
was cancelled while pending (no jobs) in the shared master concurrency queue.
The workflow uses a shared master-ref group. GitHub's documented default
[single pending-run policy](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
cancels an older pending run when a newer pending run arrives, independently
of cancel-in-progress. The observed order is consistent with this replacement;
the API receipt does not identify the actor or reason for cancellation.
No cancelled run is PASS; no workflow dispatch/retry was requested. The parent
instructed stopping on cancellation, so this checkpoint requests its continuation
decision before more merges. The cancellation does not establish a source defect.

111 is still unmerged/Draft. Its preserved current-master integration candidate
`31605d39f4ddb027a387a1a2bf1717ffc10b3998`, tree
`93fd8f24888184e8df30227b93126bddc2ab9f18`, passed20 focused and11 real
HTTP/owned PostgreSQL split-payment cases. All five cleanup checks are true.
No refund/date/net/cash policy is thereby approved. 113,114,115,116 are also
unmerged; their historical exact-head/integration evidence remains separate.
The next released sequence is111→113→114→115→116 after the parent handles the
cancellation. Keep parents until all children no longer depend on them.

109 remains open/Draft at `a8a248dc5b46dd24487a9b742a6c50606c3c3063`.
Its changed11files never entered any merged or prepared release candidate;
the actual file entries stay identical to master83a1b15, including absence of
109's added files. No cloud/local109 retry occurred. The previous aggregate
feature containing109 was never merged. No branches were deleted.

## Missing acceptance and records

Updated/read-back Issue bodies [29](https://github.com/skydreamer0/startup/issues/29),
[30](https://github.com/skydreamer0/startup/issues/30),
[31](https://github.com/skydreamer0/startup/issues/31),
[37](https://github.com/skydreamer0/startup/issues/37),
[49](https://github.com/skydreamer0/startup/issues/49) and PR bodies117,107,108,110,
112,111,113,114,115,116. Original body text/checklists/history are preserved;
Issues remain open. Records distinguish actual merged implementation from
unmerged candidates, failures, cancellations and missing acceptance.

Detailed setup/steps/pass criteria cover built Admin→real isolated API/PG
navigation/trace/order/error/read-only journeys plus actual touch/Safari/200% zoom;
unapproved refund/date/net/cash rules, tolerated differences and numeric limits;
real built POS Taipei midnight, modal close/reopen, native sleep/background/resume,
late old-day/tenant/shift responses and failed refetch with retained rows;
and genuine Linux exact-source crash/rollback/UNKNOWN/replay with ownership cleanup.
All require new exclusively owned synthetic fixtures, exact final SHA, correlated
request/DB receipts, actual screenshots and independent review. No Production,
Preview, ambient DB, security/access change or policy invention is permitted.

109's seven category cases/46captures/three real61second hidden intervals and
cleanup remain held. Shared category FAIL and later stock-browser skipped stay
recorded. #116 native midnight/device and combined Linux f6ae1dd remain NOT RUN.
WSL E_ACCESSDENIED was stopped without retry. Old371/1/81 backend FAIL is retained.

## Automatic workflows, deployment and preservation

Adjacent automatic-outcomes.json records each merge's own automatic workflow
states independently, including FAIL/CANCELLED/pending rather than relabelling
them as passes. GitHub exposes no deployment records for these commits; external
production deployment is not verified. No manual deployment or Production DB
action occurred. ADR011 describes Docker Compose topology, but that is not
permission to invoke production compose or proof of an external webhook outcome.

Every candidate has a verified before-merge bundle, and original heads/remote
files plus full diffs are retained locally. Original PC4070 checkout stays clean
at `a8de423346cbff2b015832dccbf47ac6808335de`; HPK is untouched. No uncommitted or
unpushed CartPanel changes were found in either accessible PC4070 checkout;
the new native worker's independent CartPanel fix does not overlap this batch.

The report feature also preserves the **unmerged111 candidate**; it is an
evidence/recovery checkpoint, not an aggregate PR or an instruction to merge it.
No raw logs, synthetic command environment values or credentials are published.
Source/runtime/test/cleanup receipts are sanitized; raw local evidence is
represented by SHA256 identities. Prior failed attempts remain: candidate107's
absent-file verifier error (fixed by ls-tree presence comparison), premature108
test launch before its candidate existed (no tests started), and110's bare Node
TS import-loader failure (no guard assertions ran; locked tsx retry14/14 passed).
