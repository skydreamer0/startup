import assert from "node:assert/strict";
import { finalizeFixture } from "../recovery-native/fixture.mjs";

// A cancellation fence for normal work, never for cleanup. Preserve the first
// signal and remove handlers only after disconnect and private-token removal.
export function fixtureLifecycle(events = process) {
  let stopped = null;
  const stop = (reason) => {
    stopped ??= reason;
  };
  const handlers = Object.fromEntries(
    ["SIGINT", "SIGTERM"].map((name) => [name, () => stop(name)]),
  );
  for (const [name, handler] of Object.entries(handlers))
    events.on(name, handler);
  return {
    get stopped() {
      return stopped;
    },
    checkpoint() {
      if (stopped)
        throw Object.assign(new Error("Batch fixture cancelled"), {
          code: "BATCH_CANCELLED",
        });
    },
    requestFence(_req, res, next) {
      if (stopped) {
        res.statusCode = 503;
        res.end();
        return;
      }
      next();
    },
    dispose() {
      for (const [name, handler] of Object.entries(handlers))
        events.off(name, handler);
    },
  };
}

// No racing a DB operation against a timer: an unresolved query cannot grant
// deletion authority. The outer fixture owner bounds the entire shutdown.
export async function finalizeBatchFixture(actions, fail) {
  let browserQuiescent = false,
    httpDrained = false;
  const requireStopped = () => {
    assert.equal(
      browserQuiescent,
      true,
      "Owned browser must be quiescent before data cleanup",
    );
    assert.equal(
      httpDrained,
      true,
      "Owned HTTP must drain before data cleanup",
    );
  };
  await finalizeFixture(
    {
      "owned-browser-stop": async () => {
        browserQuiescent = await actions.stopBrowser();
        assert.equal(browserQuiescent, true);
      },
      "owned-http-drain": async () => {
        httpDrained = await actions.drainHttp();
        assert.equal(httpDrained, true);
      },
      "after-snapshot": async () => {
        requireStopped();
        await actions.afterSnapshot();
      },
      "exact-fixture-cleanup": async () => {
        requireStopped();
        await actions.cleanupRows();
      },
      "database-disconnect": actions.disconnect,
      "private-bootstrap-removal": actions.purgePrivate,
      "api-ledger-write": actions.writeLedger,
      "database-receipt-write": () =>
        actions.writeReceipt({ browserQuiescent, httpDrained }),
      "signal-disposal": actions.dispose,
    },
    fail,
  );
}
