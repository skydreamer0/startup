import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fixtureProcessOwner } from "./process-owner.mjs";
import { fixtureBudget } from "./process-owner.mjs";
import { fixtureLifecycle, finalizeBatchFixture } from "./lifecycle.mjs";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { drainHttp } from "../recovery-native/fixture.mjs";
import { completionOutcome } from "../category-native/contract.mjs";
import { buildFixture, seedFixture, models } from "./fixture.mjs";
import { randomUUID } from "node:crypto";
import { assertEvidence } from "./contract.mjs";
import { goodEvidence } from "./test-support.mjs";
import { spawn } from "node:child_process";

test("batch cancellation waits for owned cleanup beyond two seconds and remains cancelled", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-cancel-"));
  const ready = path.join(root, "ready"),
    receipt = path.join(root, "cleanup");
  const owner = fixtureProcessOwner();
  let cancel;
  try {
    const running = owner.run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import fs from 'node:fs';
      import { fixtureLifecycle, finalizeBatchFixture } from ${JSON.stringify(new URL("./lifecycle.mjs", import.meta.url).href)};
      const lifecycle = fixtureLifecycle();
      const hold = setInterval(() => {}, 100);
      let cleaning = false;
      process.on('SIGTERM', async () => {
        if (cleaning) return;
        cleaning = true;
        let failure;
        try { lifecycle.checkpoint(); } catch (error) { failure = error; }
        await finalizeBatchFixture({
          stopBrowser: async () => true,
          drainHttp: async () => { await new Promise(resolve => setTimeout(resolve, 2500)); return true; },
          afterSnapshot: async () => {},
          cleanupRows: async () => { fs.writeFileSync(process.argv[2], 'clean'); },
          disconnect: async () => { fs.appendFileSync(process.argv[2], ':disconnected'); },
          purgePrivate: async () => { fs.appendFileSync(process.argv[2], ':purged'); },
          writeLedger: async () => {}, writeReceipt: async () => {}, dispose: () => lifecycle.dispose(),
        }, error => { failure ??= error; });
        clearInterval(hold); process.exitCode = failure ? 1 : 0;
      });
      fs.writeFileSync(process.argv[1], 'ready');
    `,
        ready,
        receipt,
      ],
      { env: {}, stdio: "ignore" },
    );
    cancel = setInterval(() => {
      if (fs.existsSync(ready)) {
        clearInterval(cancel);
        process.emit("SIGTERM");
      }
    }, 10);
    const result = await running;
    assert.equal(
      fs.existsSync(receipt),
      true,
      "graceful owned cleanup must finish",
    );
    assert.equal(fs.readFileSync(receipt, "utf8"), "clean:disconnected:purged");
    assert.equal(result.exitCode, 1, "fixture cancellation remains a failure");
    assert.equal(result.cancelled, "SIGTERM");
    assert.equal(result.quiescent, true);
    assert.equal(result.signal, null);
    assert.deepEqual(
      result.recoverySignals.map((row) => row.signal),
      ["SIGTERM"],
    );
  } finally {
    clearInterval(cancel);
    owner.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real HTTP cancellation fence prevents further handler work", async () => {
  const events = new EventEmitter(),
    lifecycle = fixtureLifecycle(events);
  let requests = 0;
  const server = createServer((req, res) => {
    res.setHeader("connection", "close");
    lifecycle.requestFence(req, res, () => {
      requests++;
      res.end("synthetic");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const initial = await fetch(url);
    assert.equal(initial.status, 200);
    await initial.text();
    events.emit("SIGTERM");
    const stopped = await fetch(url);
    assert.equal(stopped.status, 503);
    await stopped.text();
    assert.equal(requests, 1);
  } finally {
    lifecycle.dispose();
    await drainHttp(server, new Set(), 2000);
  }
});

test("first cancellation fences later work and cannot become acceptance after clean shutdown", () => {
  const events = new EventEmitter(),
    lifecycle = fixtureLifecycle(events);
  lifecycle.checkpoint();
  events.emit("SIGINT");
  events.emit("SIGTERM");
  assert.equal(lifecycle.stopped, "SIGINT");
  assert.throws(() => lifecycle.checkpoint(), { code: "BATCH_CANCELLED" });
  assert.equal(completionOutcome(null, lifecycle.stopped).status, "failed");
  lifecycle.dispose();
  assert.equal(events.listenerCount("SIGINT"), 0);
  assert.equal(events.listenerCount("SIGTERM"), 0);
});

test("actual seeder checks cancellation before the next write after an in-flight write settles", async () => {
  const events = new EventEmitter(),
    lifecycle = fixtureLifecycle(events),
    writes = [];
  const fixture = buildFixture(randomUUID());
  const db = Object.fromEntries(
    models.map((model) => [
      model,
      {
        count: async () => 0,
        createMany: async () => {
          writes.push(model);
          events.emit("SIGTERM");
        },
      },
    ]),
  );
  try {
    await assert.rejects(
      seedFixture(db, fixture, () => lifecycle.checkpoint()),
      { code: "BATCH_CANCELLED" },
    );
    assert.deepEqual(writes, ["tenant"]);
    assert.equal(fixture.ownershipProven, true);
  } finally {
    lifecycle.dispose();
  }
});

for (const state of [false, undefined])
  test(`acceptance rejects browser quiescence ${state}`, () => {
    const e = goodEvidence();
    e.database.browserQuiescent = state;
    assert.throws(() => assertEvidence(e.database, e.browsers, e.api));
  });

function terminalActions(overrides = {}) {
  const calls = [],
    failures = [],
    receipts = [];
  const actions = Object.fromEntries(
    [
      "stopBrowser",
      "drainHttp",
      "afterSnapshot",
      "cleanupRows",
      "disconnect",
      "purgePrivate",
      "writeLedger",
      "dispose",
    ].map((name) => [
      name,
      async () => {
        calls.push(name);
        return true;
      },
    ]),
  );
  actions.writeReceipt = async (value) => {
    calls.push("writeReceipt");
    receipts.push(value);
  };
  return {
    calls,
    failures,
    receipts,
    actions: { ...actions, ...overrides },
    fail: (error, stage) => failures.push({ error, stage }),
  };
}

test("real HTTP completes before snapshots, deletion, disconnect and token removal", async () => {
  let started, release;
  const observed = new Promise((resolve) => {
    started = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const server = createServer(async (_req, res) => {
    started();
    await held;
    res.setHeader("connection", "close");
    res.end("synthetic");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const response = fetch(`http://127.0.0.1:${server.address().port}/`).then(
    (res) => res.text(),
  );
  await observed;
  const t = terminalActions();
  t.actions.drainHttp = async () => {
    t.calls.push("drainHttp");
    return drainHttp(server, new Set(), 2000);
  };
  try {
    const ending = finalizeBatchFixture(t.actions, t.fail);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(t.calls, ["stopBrowser", "drainHttp"]);
    release();
    assert.equal(await response, "synthetic");
    await ending;
    assert.deepEqual(t.failures, []);
    assert.deepEqual(t.calls, [
      "stopBrowser",
      "drainHttp",
      "afterSnapshot",
      "cleanupRows",
      "disconnect",
      "purgePrivate",
      "writeLedger",
      "writeReceipt",
      "dispose",
    ]);
    assert.deepEqual(t.receipts, [
      { browserQuiescent: true, httpDrained: true },
    ]);
  } finally {
    release();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const target of ["stopBrowser", "drainHttp"]) {
  for (const failure of ["false", "unknown", "throw"])
    test(`${target} ${failure} refuses snapshots and deletion but attempts disconnect/purge`, async () => {
      const t = terminalActions({
        [target]: async () => {
          if (failure === "throw") throw new Error("unknown");
          return failure === "false" ? false : undefined;
        },
      });
      await finalizeBatchFixture(t.actions, t.fail);
      assert.equal(t.calls.includes("afterSnapshot"), false);
      assert.equal(t.calls.includes("cleanupRows"), false);
      assert.ok(t.calls.includes("disconnect"));
      assert.ok(t.calls.includes("purgePrivate"));
      assert.equal(t.calls.at(-1), "dispose");
      assert.ok(t.failures.length >= 3);
    });
}

test("an unresolved real drain cannot authorize deletion or report zero rows", async () => {
  let release;
  const pending = new Set([
    new Promise((resolve) => {
      release = resolve;
    }),
  ]);
  const t = terminalActions({
    drainHttp: () => drainHttp(undefined, pending, 20),
  });
  try {
    await finalizeBatchFixture(t.actions, t.fail);
    assert.equal(t.calls.includes("cleanupRows"), false);
    assert.deepEqual(t.receipts, [
      { browserQuiescent: true, httpDrained: false },
    ]);
    assert.equal(t.failures[0].stage, "owned-http-drain");
  } finally {
    pending.clear();
    release();
  }
});

test("cleanup and disconnect errors preserve the earlier failure and still purge private data", async () => {
  const primary = new Error("initial cancellation");
  let retained = primary;
  const t = terminalActions({
    cleanupRows: async () => {
      throw new Error("rows remain");
    },
    disconnect: async () => {
      throw new Error("disconnect");
    },
  });
  await finalizeBatchFixture(t.actions, (error, stage) => {
    retained ??= error;
    t.fail(error, stage);
  });
  assert.equal(retained, primary);
  assert.deepEqual(
    t.failures.map((row) => row.stage),
    ["exact-fixture-cleanup", "database-disconnect"],
  );
  assert.ok(t.calls.includes("purgePrivate"));
  assert.ok(t.calls.includes("writeReceipt"));
  assert.equal(t.calls.at(-1), "dispose");
});

test("cancellation before launch refuses all new child work", async () => {
  const owner = fixtureProcessOwner();
  try {
    process.emit("SIGINT");
    process.emit("SIGTERM");
    const result = await owner.run("/must-not-launch", [], { env: {} });
    assert.equal(result.cancelled, "SIGINT");
    assert.equal(result.exitCode, null);
    assert.equal(result.signalCount, 0);
  } finally {
    owner.dispose();
  }
});

test("work deadline and stubborn fixture have a bounded forced stop that stays failed", async () => {
  const sentinel = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 100)"],
    { detached: true, env: {}, stdio: "ignore" },
  );
  const sentinelClosed = new Promise((resolve) =>
    sentinel.once("close", resolve),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-hard-stop-"));
  const ready = path.join(root, "ready");
  let deadline, cancel;
  const scheduled = [];
  const owner = fixtureProcessOwner({
    schedule: (fn, ms) => {
      scheduled.push(ms);
      if (ms === fixtureBudget.workMs) {
        deadline = fn;
        return undefined;
      }
      assert.equal(ms, fixtureBudget.shutdownMs);
      return setTimeout(fn, 40); // Timer adapter only; real child, signals and /proc proof.
    },
  });
  try {
    const running = owner.run(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import fs from 'node:fs';
      process.on('SIGTERM', () => {});
      fs.writeFileSync(process.argv[1], 'ready'); setInterval(() => {}, 100);
    `,
        ready,
      ],
      { env: {}, stdio: "ignore" },
    );
    cancel = setInterval(() => {
      if (fs.existsSync(ready)) {
        clearInterval(cancel);
        deadline();
      }
    }, 10);
    const result = await running;
    assert.deepEqual(scheduled, [110_000, 40_000]);
    assert.equal(result.cancelled, "DEADLINE");
    assert.equal(result.signal, "SIGKILL");
    assert.equal(result.quiescent, true);
    assert.deepEqual(
      result.recoverySignals.map((row) => row.signal),
      ["SIGTERM", "SIGKILL"],
    );
    assert.notEqual(completionOutcome(null, result.cancelled).status, "passed");
    assert.deepEqual(owner.lastResult, result);
    assert.equal(
      process.kill(sentinel.pid, 0),
      true,
      "unrelated sentinel must survive owned group recovery",
    );
  } finally {
    clearInterval(cancel);
    owner.dispose();
    sentinel.kill("SIGTERM");
    await sentinelClosed;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("spawn errors remain failed and do not expose command arguments", async () => {
  const owner = fixtureProcessOwner();
  try {
    const result = await owner.run(
      "/missing-synthetic-executable",
      ["synthetic-private-marker"],
      { env: {} },
    );
    assert.equal(result.error, "Owned fixture process could not start");
    assert.notEqual(result.exitCode, 0);
    assert.equal(
      JSON.stringify(result).includes("synthetic-private-marker"),
      false,
    );
    assert.equal(
      JSON.stringify(result).includes("/missing-synthetic-executable"),
      false,
    );
  } finally {
    owner.dispose();
  }
});
