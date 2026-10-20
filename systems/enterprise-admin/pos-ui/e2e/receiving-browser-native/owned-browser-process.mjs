import { spawn } from 'node:child_process';
import { cleanupRunProcesses } from '../category-native/owned-run.mjs';

function deadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

export function runOwnedBrowser(command, args, options, {
  scope, timeoutMs = 240_000, cleanupTimeoutMs = 5_000, closeGraceMs = 2_000, killGraceMs = 2_000,
  start = spawn, cleanup = cleanupRunProcesses,
} = {}) {
  return new Promise(resolve => {
    let child;
    try { child = start(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ stdout: '', stderr: '', exitCode: null, signal: null, error: error.message, timedOut: false,
      closeTimedOut: false, forcedSignals: [], cleanup: null, cleanupError: null }); return; }

    let stdout = '', stderr = '', timedOut = false, closeTimedOut = false, closeSeen = false, settled = false, childError = null;
    let cleanupReceipt = null, cleanupError = null, timeoutTask = null, closeTimer = null;
    const forcedSignals = [];
    const operationTimer = setTimeout(() => {
      timedOut = true;
      timeoutTask = (async () => {
        try { cleanupReceipt = await deadline(Promise.resolve().then(() => cleanup(scope)), cleanupTimeoutMs, 'Owned browser cleanup deadline exceeded'); }
        catch (error) { cleanupError ??= error; }
        if (closeSeen || settled) return;
        try { child.kill('SIGTERM'); forcedSignals.push('SIGTERM'); }
        catch (error) { cleanupError ??= error; }
        closeTimer = setTimeout(() => {
          if (closeSeen || settled) return;
          // This handle is the exact child returned by this run's spawn; process-tree
          // cleanup above still uses the nonce-verified owner scope.
          try { child.kill('SIGKILL'); forcedSignals.push('SIGKILL'); }
          catch (error) { cleanupError ??= error; }
          closeTimer = setTimeout(() => {
            if (closeSeen || settled) return;
            closeTimedOut = true;
            settle({ exitCode: null, signal: null });
          }, killGraceMs);
        }, closeGraceMs);
      })();
    }, timeoutMs);

    const settle = ({ exitCode = null, signal = null, error = null } = {}) => {
      if (settled) return;
      settled = true; clearTimeout(operationTimer); clearTimeout(closeTimer);
      resolve({ stdout, stderr, exitCode, signal, error, timedOut, closeTimedOut, forcedSignals,
        cleanup: cleanupReceipt, cleanupError });
    };
    const finishWithCleanup = async (exitCode, signal, error = null) => {
      closeSeen = true; clearTimeout(operationTimer); clearTimeout(closeTimer);
      if (timeoutTask) await timeoutTask;
      else {
        try { cleanupReceipt = await deadline(Promise.resolve().then(() => cleanup(scope)), cleanupTimeoutMs, 'Owned browser cleanup deadline exceeded'); }
        catch (problem) { cleanupError ??= problem; }
      }
      settle({ exitCode, signal, error });
    };
    child.stdout?.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr?.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', error => { childError = error.message; });
    child.once('close', (exitCode, signal) => { void finishWithCleanup(exitCode, signal, childError); });
  });
}
