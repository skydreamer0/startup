# Installation provenance and verification

This is a repository-local, static-source installation. Upstream content and local
rules are separate so reviewers can compare the original files without filtering
an embedded project patch. No upstream script was executed.

## Pinned source

- Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Commit: `1a2c459b35f26116fd165b0a0f30597f252749ff`
- Repository tree: `86f816ee22a549e5f84882f30cda88766f88c879`
- Source directory: `.claude/skills/ui-ux-pro-max/`
- Source subtree: `0b6619c11598d7ce32041044cb2e6fc6adea1efc`
- Copy all 47 files outside `scripts/tests/` (3,324,634 bytes), plus the root
  `LICENSE` (1,075 bytes). Exclude the 26 upstream test/fixture files explicitly
  listed in `SOURCE.lock.json`. Retain all five Python source files without running them.
- No upstream CLI/plugin config, other skills, workflows, font/icon asset packages
  or floating-version content is installed.
- Upstream `SKILL.md` is unchanged: 15,969 bytes; SHA256
  `ea087c341bfb5b23195c7302027268ede86da802554c18a5c4896a6017b439f9`.
- `LICENSE` is MIT, copyright (c) 2024 Next Level Builder. Its notice is retained
  unchanged; catalogues also retain their upstream provenance/license metadata.
  Metadata is not a blanket license or authorization to download its referenced assets.

## Local files and discovery

All additions are under `.agents/skills/`. Start at its `AGENTS.md` and `README.md`,
which route to `ui-ux-pro-max/PHARMACY-OVERRIDES.md`, then unchanged `SKILL.md`.
The root repository read order and relevant Admin/POS `MODULE.md` still apply.
This installation adds no application code or changes to root guidance, workflows,
package dependencies, databases or PR #85. The scoped `AGENTS.md` provides the
context update within the authorized directory. Agents applying this skill must
explicitly read its local overrides; this PR does not prove automatic activation
on any other machine or existing session.

## Static verification and limits

- Read each selected GitHub Git blob completely, decode base64, and compare its
  declared size and Git blob SHA1 with the pinned recursive tree. Calculate SHA256
  on exact bytes. All 48 copied files match; all use Git mode `100644`, strict
  UTF-8 and LF without CRLF. There are no selected symlinks or executable-mode files.
- Parse all JSON and 35 CSV files with standard-library readers; CSV row widths
  match their headers. Parse all five Python files with `ast.parse`, without
  executing/importing them. These are format/source checks, not runtime tests.
- Static import/call review found local CSV reads in `core.py` and explicit
  persistence in `design_system.py`: directory creation, temporary-file writes,
  hard-link publication, replacement with force, and temporary-file cleanup.
  `--output-dir` selects the base path; its default is the current directory.
  No network-request or process-launch call was identified in these five copied
  Python files. `urllib.parse` in `validate_data.py` parses URLs only. This review
  does not establish runtime safety or correctness and is not permission to execute.
- The original plugin paths, new-page generator workflow and generic industry
  suggestions in `SKILL.md` are superseded locally by `PHARMACY-OVERRIDES.md`.
  Script execution is not authorized by installation; persist requires explicit
  destination/content authorization, and force overwrite requires confirmation.
- Full `git diff --check` reports 46 inherited trailing-whitespace lines in
  the unchanged upstream `scripts/design_system.py` (exit 2). Preserve these
  bytes to retain the pinned source hashes; this is a disclosed source-format
  limitation, not a passing full-diff check. Local Markdown/manifest whitespace
  checks pass. No formatter, workflow or check is disabled to hide the warnings.
- Run the repository-owned `./scripts/validate-agent-context.sh` and
  `node scripts/validate-dependency-locks.mjs`. Leave CI intact and require the
  normal passing PR checks before any parent-led merge. No upstream validation
  script, third-party test, generator, asset downloader or package installer is run.
- Deployment gate: tracked workflows contain CI/tests/builds and no production
  deployment step was identified. GitHub deployments returned an empty list.
  Repository webhook listing returned integration HTTP 403; external deployment
  triggers remain unconfirmed. This task creates a Draft PR and does not merge.
  Do not bypass that access restriction.

## Manifest verification

`SOURCE.lock.json` hashes every copied file and all four local Markdown documents.
It excludes its own hash to avoid a circular definition. Its SHA256 and Git blob
identity are checked separately during remote readback and reported with the PR.
The installation has 53 files including the manifest; 48 are byte-identical
upstream copies and five are local documents/manifest.

To verify without executing upstream code: parse the manifest with a trusted
standard-library JSON reader; compare the exact file set, byte sizes, Git blob
SHA1 and SHA256 of its 52 entries; then verify the manifest itself against the
PR commit tree and readback evidence. Read every full remote Git blob at the PR
head SHA, rather than trusting a truncated diff or line-limited contents response.
The handoff records the head commit, root tree, installed subtree, full manifest
hash and per-file readback. It does not claim that remote storage activates skills.

## Complete old 49-file candidate mapping

The parent independently verified the old candidate and explained its two local
`SKILL.md` adaptations: a pharmacy scope section and replacement of the Claude
plugin prefix with a repository-root placeholder. The parent confirmed the other
vendored files matched upstream. This environment did not read that other workspace
or the old manifest. The table maps all 49 old candidate paths; old hashes are
parent-attested where indicated, not reconstructed bytes.

The old package total was 3,353,322 bytes: 3,324,634 upstream bytes + 1,075 license
bytes + 25,513 manifest bytes + 2,100 local `SKILL.md` adaptation bytes. Its adapted
`SKILL.md` was 18,069 bytes with SHA256
`d94ab4f3725df28c360f8b9e411b660e926ba253f8b4a1043488faaf136a83e3`.
The new layout is deliberately different: unchanged upstream `SKILL.md`, separate
local overrides/guidance and a newly generated manifest. Its counts and hashes
must not be presented as equal to the old 49-file package.

| Old candidate path | New bytes | New SHA256 | Comparison |
| --- | ---: | --- | --- |
| `LICENSE` | 1075 | `738f69dfa83db5c347c678fb9d90e560877059f0de93a327c39001bff92dc014` | Unchanged upstream bytes; parent attested old match |
| `SKILL.md` | 15969 | `ea087c341bfb5b23195c7302027268ede86da802554c18a5c4896a6017b439f9` | Restored upstream original; old adaptations moved to local rules |
| `data/app-interface.csv` | 11046 | `331e7cf2c0b222d80c566c5f255c63cb339f65bfd02e471a720f28e4864a9f08` | Unchanged upstream bytes; parent attested old match |
| `data/catalog-summary.json` | 2392 | `6638da97231c07fb5cef3cd9d3ce483ca7b2f9748980f8c27490eb03968d8894` | Unchanged upstream bytes; parent attested old match |
| `data/charts.csv` | 23365 | `4115cf1120680f2cedef0676cb648f30c7ef4699e2a947535d4113e71ed3b12a` | Unchanged upstream bytes; parent attested old match |
| `data/colors.csv` | 37940 | `8162429222bce22df62b564085946a30d07cc9722c58d0a3a494bd0d1d00841c` | Unchanged upstream bytes; parent attested old match |
| `data/data-provenance.json` | 36686 | `e82fb33ed49375a300e93d9c11ccd1c1493c999e84ee7ee295e527634786e2e0` | Unchanged upstream bytes; parent attested old match |
| `data/google-font-licenses.json` | 433127 | `35688523f2955795caa1a47c53b83099e60c1708461476f9cc3a050cf3b0148a` | Unchanged upstream bytes; parent attested old match |
| `data/google-fonts.csv` | 747241 | `1c8c3b2ea1faf6a1012da463756def8b3889db33f2226f0343bb4daa80307d03` | Unchanged upstream bytes; parent attested old match |
| `data/icons.csv` | 57945 | `50816c6012030178195a16ee481ebf58b47bd985d70e8ec58886cc83f6eddafc` | Unchanged upstream bytes; parent attested old match |
| `data/landing.csv` | 25449 | `9a2edd3bb676c2a58f00ade7a062e285222d4297bfd847c8d5b056f0dbbf52d0` | Unchanged upstream bytes; parent attested old match |
| `data/motion.csv` | 14679 | `381affe8df8ea1f66fbbda2598827f9f54299107bbe6a1b4e9b68f6b62091ceb` | Unchanged upstream bytes; parent attested old match |
| `data/phosphor-icons-upstream.json` | 823933 | `2399325233b277b5c97a80e6a5e8941154f5d057beee4e7613db87c87d700236` | Unchanged upstream bytes; parent attested old match |
| `data/products.csv` | 75623 | `42473f75e8dde5987bdf89ce55d8c168091b80a356cae691dd60247d80720b70` | Unchanged upstream bytes; parent attested old match |
| `data/react-performance.csv` | 15080 | `3d925802539abac5afeb63ae8aa1960b7229ad271b3a47caed40ab2d97ad0734` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/angular.csv` | 19863 | `704be83f2bad30c7e6de01afb113ffa01e0c458762f48b7102f31ba2367b5553` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/astro.csv` | 14591 | `2c2f55fadaafc05e04cc321c8194a1a28b656e6757fe2ba316f41b16428299c6` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/avalonia.csv` | 27327 | `442fca14675a020683473e7e49f08abb27b9df0765c80efe54aef61f1a4ac258` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/flutter.csv` | 14192 | `64dba0ac17349f28bce517a0f5f48c54d9ed2e487ec0c0258303463b382f41a0` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/html-tailwind.csv` | 16551 | `d05a581d20af57b8ca0104a6d31d90a07c437d500662a96c3029fc2f9a4678ee` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/javafx.csv` | 33577 | `2e819b8d5abdd23ad4dae0991650fdb57af497aabd68b37463aa9c442944c869` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/jetpack-compose.csv` | 12295 | `699de218b286948eaec7d15767b6e1350ee299167e49bf476d82e3ff58724e0a` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/laravel.csv` | 20163 | `854ea4daa5fc61292d22235ad33b49ba3fe22423c3de8d3cb03758ffed3b59f9` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/nextjs.csv` | 18687 | `ecd2c27b2ea0127d203ae726060efcdd7335b5e83f96b99e4f3befbbfeebd5a4` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/nuxt-ui.csv` | 28700 | `fce682a338cfcdbf35d318d20e5befbe7b5d81b05abc37f87677a6d9cde84dc6` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/nuxtjs.csv` | 23014 | `3d9b54ed2d151bd9c86e9e5609b8a6f88a00c4c52fa601a30af96c49b2c4d176` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/react-native.csv` | 14049 | `ba31dd9c0c04da6bc02a74448bf121f9c0728ae5ba3b4d47b487778b0a1135b5` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/react.csv` | 21166 | `4dd176a9787e5c6306b5df94158d75955adcdc6edab41ce5286641a5842303c1` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/shadcn.csv` | 23184 | `e56cfde5b74907836ac3582a4779d5b7f3d206a702ab81b8669a1b668c3eeb51` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/svelte.csv` | 15078 | `f6e379ba802941ba26b01d4ffbe3cd39120f2587659a1d93851c707f66bc13db` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/swiftui.csv` | 15323 | `bdd9231ff3ad658f4e7c063e1eb49df2fd09ac8d90631a86df899b39833b9623` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/threejs.csv` | 46769 | `155d583b9c64da0df4b6c6cb060c02eab222505e0734d6353da02c9e2b5d982b` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/uno.csv` | 30091 | `a0474363e4225b5367214d5675fd3e075f137026f9500f0d04357882ef4f6d48` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/uwp.csv` | 24692 | `c409f08c1fbba1f1029f1acaa554e7b4471cc85517a5751c9f2e62465badcd5c` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/vue.csv` | 12813 | `b655f1ebb9dff2652d15981f31b1784c8a6d4759efd2815a14f3088257569f95` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/winui.csv` | 27890 | `e676dc1c13ee6c205c40b0746f1335150a346c7a49a0616d2545bc3d2c930c85` | Unchanged upstream bytes; parent attested old match |
| `data/stacks/wpf.csv` | 24158 | `9781a9950b20333637b30a02e498b7efca21b618a3eeb8665836f3ac6e974da7` | Unchanged upstream bytes; parent attested old match |
| `data/styles.csv` | 149478 | `a93a4d9d7025856575d7b7583bda020be9043013432c5af7c58af9dbdfb206b7` | Unchanged upstream bytes; parent attested old match |
| `data/typography.csv` | 49997 | `321fc446e89024488ebae96dda93efc4d2307bd8bddb240857ad51364f6782c8` | Unchanged upstream bytes; parent attested old match |
| `data/ui-reasoning.csv` | 77360 | `f0774dd741cecdad5eec842034bd6d5e9ea50e9f220a1910069748daa0bb8e9a` | Unchanged upstream bytes; parent attested old match |
| `data/ux-guidelines.csv` | 27516 | `ff81ec613f70ba9fc3fcce52dbe4ae35d44b2079dbe6dc066d2d6e38c28facd5` | Unchanged upstream bytes; parent attested old match |
| `references/pro-rules.md` | 10909 | `d28442d61c310b49c054a4ea736f89fb3008beebdbbc38c4b3a540b8f7fadf23` | Unchanged upstream bytes; parent attested old match |
| `references/quick-reference.md` | 24526 | `0609bc7c89dacb40472465d8fc14257b56b2c43439660fc8d6fa3b8c022e1876` | Unchanged upstream bytes; parent attested old match |
| `scripts/core.py` | 41236 | `c3be4b23e7150e6b45095213158cfa3c8ad96502f01dde3f6ffff9de64a4f481` | Unchanged upstream bytes; parent attested old match |
| `scripts/design_system.py` | 71537 | `e7d1c94c4b2eada17c5551157668362659ccf9626d34dbd58e68142410f90103` | Unchanged upstream bytes; parent attested old match |
| `scripts/reasoning_contract.py` | 5824 | `b8bac1af82aa280d3e06f00aabaeac4337e632996b07fed874e2b6ee6e9c5913` | Unchanged upstream bytes; parent attested old match |
| `scripts/search.py` | 9373 | `d54e648fe0ec2932cac66684220cc17be4bd4b4eba1d23d3195d509d398db374` | Unchanged upstream bytes; parent attested old match |
| `scripts/validate_data.py` | 52230 | `a599aa256049cf30954d1f164721b99e453eb7e4cb8241bcab2d5573e6cf58b8` | Unchanged upstream bytes; parent attested old match |
| `SOURCE.lock.json` | Generated anew | Recorded separately in handoff | Replaced; old hash unavailable here |

New-only files: `../AGENTS.md`, `../README.md`, `PHARMACY-OVERRIDES.md` and this
`INSTALLATION.md`. The machine-readable 49-entry mapping is also in the manifest.
