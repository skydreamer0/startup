# PC4070 approved handoff retries, 2026-10-11

User approved one restart of each previously canceled handoff, sequentially:
first #109 readiness, then scoped #118/#119 acceptance, local test deployment
and only the affected POS service deployment. #109 merging is not authorized.
No Production/Preview database, credentials upload, security changes or held
stock-browser rerun is authorized. Existing integration and other worktrees stay
untouched. The original 10-PR release evidence remains immutable on its own branch.

## Exact starting subjects

Remote master: dff3f71afc4f3d92a580bca6d667c21cb28d6c23;
tree 316791c407fe4ca3cc472a4681768d7df1ec2020.

- #109 a8a248dc5b46dd24487a9b742a6c50606c3c3063;
  tree 701c622087a591f7f7ff310010143769769d8a3c; 11 complete changed files.
- #118 cc01fd18e0e387912a21f8055bd5c6f594fcf41c;
  tree 269a708be34fdec979e841084ce69eeb1cc11afe; 3 complete changed files.
- #119 8c66aa180faa98e0b0aa2a8a00a2cc2d4934b453;
  tree 3969f20863b52ae91e666560ad9434d9a1b3319b; 3 complete changed files.

Each complete changed remote Git blob was read back and compared byte-for-byte
with the fetched subject. Full three-dot diffs, current comments/reviews and
check receipts are retained locally. No unread review is labeled passing.

## #109 bounded native readiness result: FAIL

Attempt 1 began 2026-10-11 approximately 09:02 UTC. Sandboxed official Chrome
self-terminated in Crashpad before exposing CDP, so no assertions ran. Its own
stalled coordinator was stopped after unique ownership was checked; no Chrome
process retained that exact owned profile, and the profile was removed.

Attempt 2 started 09:03:46.633 UTC and ended 09:03:53.411 UTC. Fresh official
Windows Chrome 155.0.8059.40, Playwright 1.63.0, connectOverCDP(noDefaults:true)
and the existing default context loaded an owned loopback HTML page, without
viewport/focus emulation. document.visibilityState began hidden and remained
hidden after bringToFront; the 5-second visible-state assertion failed.

Attempt 3 started 09:04:35.424 UTC and ended 09:04:42.135 UTC. It additionally
identified the actual target/window and restored native normal window bounds.
Actual command-line arguments contained no headless or sandbox/security bypass.
The tab still remained hidden and the same bounded assertion failed. Cleanup
for both usable probes verified normal Chrome exit (code 0, no signal), no owned
Chrome processes, removed profile and closed owned HTTP server. No further retry.

These are Windows mechanism diagnostics, not the canonical pinned Linux Chrome
154.0.8037.97/Xvfb acceptance. No real 61-second interval occurred. The seven
original application cases, all 46 captures, three hidden intervals, trusted
event/cart/search/selection and correlated API/PostgreSQL ledgers remain NOT RUN.
No API or database was started and no cloud or stock-browser job was rerun.
Assertions were not weakened, no events were synthesized and #109 is unmerged.

## #118/#119 and deployment: IN PROGRESS

Fresh exact-head receipts show all four required CI checks and applicable security
checks passed. The recurring category-browser job failed on each source; it is
retained as FAIL, not waived or relabeled. Independent review and latest-master
local acceptance are pending at this checkpoint.

ADR-011 and Compose define a separately deployable pos-ui nginx container built
with VITE_BASE=/pos/. The repository CI only builds images and does not identify
a deployment destination. Local Docker inventory stalled; its uniquely identified
read-only CLI was stopped. Port 80 is owned by httpd.exe, not an identified POS
service. The actual target has been requested; no destination is guessed and no
deployment action has happened.
