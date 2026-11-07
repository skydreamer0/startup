# Requirements to execution and evidence map

This index preserves **235 checklist occurrences** across 13 original sources.
The complete exact text, section, line, SHA256, historical checkbox and owners
are in [requirements.json](requirements.json). Repeated historical occurrences
are retained intentionally. No checkbox, Issue or G gate is changed.
Source bodies and roadmap comments are versioned by digest in
[source-snapshot.json](source-snapshot.json), with original bodies preserved as
untrusted data in [requirements-sources.json](requirements-sources.json). The
verifier checks source body digests against the pinned snapshot, then reconstructs
and compares the entire ID/text/checkbox/line/hash set, including deleted sources. Body lines are snapshot coordinates,
not immutable GitHub line anchors; the hash identifies the reviewed text.

## Source coverage

| Source | Occurrences | Primary destination |
| --- | ---: | --- |
| [#29](https://github.com/skydreamer0/startup/issues/29) | 15 | AR-07, AR-10 |
| [#30](https://github.com/skydreamer0/startup/issues/30) | 17 | AR-05, AR-06, AR-08 |
| [#31](https://github.com/skydreamer0/startup/issues/31) | 28 | AR-19 |
| [#32](https://github.com/skydreamer0/startup/issues/32) | 12 | AR-03, AR-09, AR-10 |
| [#33](https://github.com/skydreamer0/startup/issues/33) | 10 | AR-11 |
| [#34](https://github.com/skydreamer0/startup/issues/34) | 11 | AR-14, AR-15 |
| [#35](https://github.com/skydreamer0/startup/issues/35) | 13 | AR-18 |
| [#36](https://github.com/skydreamer0/startup/issues/36) | 14 | AR-20, AR-21, AR-22 |
| [#37](https://github.com/skydreamer0/startup/issues/37) | 90 | AR-05, AR-07, AR-08, AR-09, AR-10, AR-11, AR-12, AR-14, AR-15, AR-18, AR-19, AR-20, AR-21, AR-22, AR-23 |
| [#46](https://github.com/skydreamer0/startup/issues/46) | 12 | AR-04, AR-07, AR-10 |
| [#48](https://github.com/skydreamer0/startup/issues/48) | 3 | AR-03, AR-18, AR-19 |
| [#49](https://github.com/skydreamer0/startup/issues/49) | 4 | AR-19 |
| [#137](https://github.com/skydreamer0/startup/issues/137) | 6 | AR-18 |

## Per-task acceptance and prerequisites

Each original requirement points to explicit `requiredChecks` in manifest.json.
AR checks carry the verbatim acceptance text from their child Issue. Existing
test files are indexed per source owner in source-inventory.json; they are
candidate regression inputs, not proof that a new requirement is already covered.
New full-flow/PG/device tests remain planned and NOT_RUN. An owner must narrow
the check into cases, expected output and precise test paths in each small PR.

| Task | Engineering prerequisite | Integration-only prerequisite | Required AC |
| --- | --- | --- | ---: |
| [AR-00](https://github.com/skydreamer0/startup/issues/180) | none | none | 7 |
| [AR-01](https://github.com/skydreamer0/startup/issues/181) | AR-00 | none | 4 |
| [AR-02](https://github.com/skydreamer0/startup/issues/182) | AR-01 | none | 4 |
| [AR-03](https://github.com/skydreamer0/startup/issues/183) | AR-02 | none | 4 |
| [AR-04](https://github.com/skydreamer0/startup/issues/184) | AR-03 | none | 4 |
| [AR-05](https://github.com/skydreamer0/startup/issues/185) | AR-02 | none | 4 |
| [AR-06](https://github.com/skydreamer0/startup/issues/186) | AR-02, AR-04, AR-05 | none | 5 |
| [AR-07](https://github.com/skydreamer0/startup/issues/187) | AR-03, AR-05, AR-06 | none | 5 |
| [AR-08](https://github.com/skydreamer0/startup/issues/188) | AR-05, AR-06, AR-07 | none | 5 |
| [AR-09](https://github.com/skydreamer0/startup/issues/189) | AR-06, AR-07 | AR-14 | 4 |
| [AR-10](https://github.com/skydreamer0/startup/issues/190) | AR-07, AR-08 | none | 4 |
| [AR-11](https://github.com/skydreamer0/startup/issues/191) | AR-07, AR-08 | AR-13, AR-14 | 4 |
| [AR-12](https://github.com/skydreamer0/startup/issues/192) | AR-08 | AR-10, AR-13 | 5 |
| [AR-13](https://github.com/skydreamer0/startup/issues/193) | AR-06 | none | 5 |
| [AR-14](https://github.com/skydreamer0/startup/issues/194) | AR-04, AR-13 | none | 4 |
| [AR-15](https://github.com/skydreamer0/startup/issues/195) | AR-09, AR-13, AR-14 | none | 4 |
| [AR-16](https://github.com/skydreamer0/startup/issues/196) | AR-01, AR-02, AR-04, AR-13 | none | 4 |
| [AR-17](https://github.com/skydreamer0/startup/issues/197) | AR-08, AR-13, AR-16 | none | 4 |
| [AR-18](https://github.com/skydreamer0/startup/issues/198) | AR-13, AR-16 | AR-07 | 4 |
| [AR-19](https://github.com/skydreamer0/startup/issues/199) | AR-02, AR-06 | AR-08, AR-09, AR-12, AR-16 | 4 |
| [AR-20](https://github.com/skydreamer0/startup/issues/200) | AR-01, AR-04 | none | 4 |
| [AR-21](https://github.com/skydreamer0/startup/issues/201) | AR-14, AR-20 | AR-17, AR-18 | 4 |
| [AR-22](https://github.com/skydreamer0/startup/issues/202) | AR-01, AR-06 | AR-07, AR-08, AR-13, AR-15, AR-19, AR-20 | 4 |
| [AR-23](https://github.com/skydreamer0/startup/issues/203) | AR-00, AR-01, AR-02, AR-03, AR-04, AR-05, AR-06, AR-07, AR-08, AR-09, AR-10, AR-11, AR-12, AR-13, AR-14, AR-15, AR-16, AR-17, AR-18, AR-19, AR-20, AR-21, AR-22 | none | 6 |

## Completeness and interpretation

- #32–#36 are consolidated, not cancelled or complete. Their 60 original AC also remain in #37; both source occurrences survive.
- #48/#49 original bounded software acceptance is historical evidence. Hardware, cold offline, native zoom/touch and full-workspace extensions stay open under their original sources.
- #37 G0–G7 apply to the selected activation scope. A synthetic draft demonstration is not real inventory authority or store clearance.
- Non-checkbox requirements remain in the full linked source specifications and decisions.md. The 235-row count is a completeness check for checklist occurrences, not a claim that prose has no requirements.
- All map verification fields start NOT_RUN for new AR acceptance. A historical checked source box is not reset, invalidated or asserted to pass again.
- New author/reviewer and exact source/artifact records belong to evidence.json. Existing source evidence is linked in source-inventory.md; unchanged evidence may be reused only with an explicit applicability review.
- Classification chooses an accountable primary destination and supporting checks; it does not delete the original parent responsibility or turn a generalized child AC into a complete test implementation.
