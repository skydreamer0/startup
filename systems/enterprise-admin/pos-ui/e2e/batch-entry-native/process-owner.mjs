import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Linux CI only: a new session/group belongs solely to this child tree. Never
// search by program name or signal the wrapper's/user's existing process group.
async function liveGroup(group) {
  const members = [];
  for (const name of await readdir("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = await readFile(`/proc/${name}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (Number(fields[2]) === group && !["Z", "X"].includes(fields[0]))
        members.push(Number(name));
    } catch (error) {
      if (!["ENOENT", "ESRCH"].includes(error.code)) throw error;
    }
  }
  return members;
}
const signal = (group, name) => {
  try {
    process.kill(-group, name);
    return true;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return false;
  }
};
async function settle(group, recoverySignals) {
  if (!(await liveGroup(group)).length) return;
  if (signal(group, "SIGTERM"))
    recoverySignals.push({ source: "settle", signal: "SIGTERM" });
  for (let i = 0; i < 40; i++) {
    if (!(await liveGroup(group)).length) return;
    await delay(50);
  }
  if (signal(group, "SIGKILL"))
    recoverySignals.push({ source: "settle", signal: "SIGKILL" });
  for (let i = 0; i < 40; i++) {
    if (!(await liveGroup(group)).length) return;
    await delay(50);
  }
  throw new Error(
    "Owned process group did not become quiescent; no upload may be published",
  );
}
// Batch fixture only. Other suites retain the shared owner's two-second policy.
// 110s work + 40s cooperative shutdown fit within the existing 180s step only
// when its preparation fits too; an outer job cancellation can still preempt us.
export const fixtureBudget = Object.freeze({
  workMs: 110_000,
  shutdownMs: 40_000,
});
export function fixtureProcessOwner({
  schedule = setTimeout,
  unschedule = clearTimeout,
} = {}) {
  if (process.platform !== "linux")
    throw new Error("This runner requires Linux process-group supervision");
  let cancelled = null;
  let lastResult = null;
  let cancelChild = null;
  const onSignal = (name) => {
    if (cancelled === null) {
      cancelled = name;
      cancelChild?.();
    }
  };
  const handlers = Object.fromEntries(
    ["SIGTERM", "SIGINT"].map((name) => [name, () => onSignal(name)]),
  );
  for (const [name, handler] of Object.entries(handlers))
    process.on(name, handler);
  return {
    get cancelled() {
      return cancelled;
    },
    get lastResult() {
      return lastResult;
    },
    async run(command, args, options) {
      if (cancelled)
        return {
          exitCode: null,
          signal: cancelled,
          error: null,
          quiescent: true,
          signalCount: 0,
          recoverySignals: [],
          cancelled,
        };
      const child = spawn(command, args, { ...options, detached: true });
      let error = null;
      let escalation;
      const recoverySignals = [];
      child.once("error", () => {
        error = "Owned fixture process could not start";
      });
      cancelChild = () => {
        if (!child.pid) return;
        // Ask only the fixture leader to stop; it owns browser termination/drain.
        try {
          child.kill("SIGTERM");
          recoverySignals.push({ source: "cancel", signal: "SIGTERM" });
        } catch (problem) {
          if (problem.code !== "ESRCH") throw problem;
        }
        escalation ??= schedule(() => {
          if (signal(child.pid, "SIGKILL"))
            recoverySignals.push({ source: "cancel", signal: "SIGKILL" });
        }, fixtureBudget.shutdownMs);
      };
      const deadline = schedule(
        () => onSignal("DEADLINE"),
        fixtureBudget.workMs,
      );
      if (cancelled) cancelChild();
      const result = await new Promise((resolve) =>
        child.once("close", (exitCode, signal) =>
          resolve({ exitCode, signal }),
        ),
      );
      unschedule(deadline);
      if (escalation) unschedule(escalation);
      cancelChild = null;
      if (child.pid) await settle(child.pid, recoverySignals);
      lastResult = {
        ...result,
        error,
        quiescent: true,
        signalCount: recoverySignals.length,
        recoverySignals,
        cancelled,
      };
      return lastResult;
    },
    dispose() {
      for (const [name, handler] of Object.entries(handlers))
        process.off(name, handler);
    },
  };
}
