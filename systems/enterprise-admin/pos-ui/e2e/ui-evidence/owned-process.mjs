import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Linux CI only: a new session/group belongs solely to this child tree. Never
// search by program name or signal the wrapper's/user's existing process group.
async function liveGroup(group) {
  const members = [];
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = await readFile(`/proc/${name}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(fields[2]) === group && !['Z', 'X'].includes(fields[0])) members.push(Number(name));
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  return members;
}
const signal = (group, name) => {
  try { process.kill(-group, name); return true; } catch (error) { if (error.code !== 'ESRCH') throw error; return false; }
};
async function settle(group, recoverySignals) {
  if (!(await liveGroup(group)).length) return;
  if (signal(group, 'SIGTERM')) recoverySignals.push({ source: 'settle', signal: 'SIGTERM' });
  for (let i = 0; i < 40; i++) { if (!(await liveGroup(group)).length) return; await delay(50); }
  if (signal(group, 'SIGKILL')) recoverySignals.push({ source: 'settle', signal: 'SIGKILL' });
  for (let i = 0; i < 40; i++) { if (!(await liveGroup(group)).length) return; await delay(50); }
  throw new Error('Owned process group did not become quiescent; no upload may be published');
}
export function processOwner() {
  if (process.platform !== 'linux') throw new Error('This runner requires Linux process-group supervision');
  let cancelled = null;
  let cancelChild = null;
  const onSignal = name => { cancelled ??= name; cancelChild?.(); };
  const handlers = Object.fromEntries(['SIGTERM', 'SIGINT'].map(name => [name, () => onSignal(name)]));
  for (const [name, handler] of Object.entries(handlers)) process.on(name, handler);
  return {
    get cancelled() { return cancelled; },
    async run(command, args, options) {
      if (cancelled) return { exitCode: null, signal: cancelled, error: null, quiescent: true,
        signalCount: 0, recoverySignals: [], cancelled };
      const child = spawn(command, args, { ...options, detached: true });
      let error = null;
      let escalation;
      const recoverySignals = [];
      child.once('error', problem => { error = problem.message; });
      cancelChild = () => {
        if (!child.pid) return;
        if (signal(child.pid, 'SIGTERM')) recoverySignals.push({ source: 'cancel', signal: 'SIGTERM' });
        escalation ??= setTimeout(() => {
          if (signal(child.pid, 'SIGKILL')) recoverySignals.push({ source: 'cancel', signal: 'SIGKILL' });
        }, 2000);
      };
      if (cancelled) cancelChild();
      const result = await new Promise(resolve => child.once('close', (exitCode, signal) => resolve({ exitCode, signal })));
      if (escalation) clearTimeout(escalation);
      cancelChild = null;
      if (child.pid) await settle(child.pid, recoverySignals);
      return { ...result, error, quiescent: true, signalCount: recoverySignals.length,
        recoverySignals, cancelled };
    },
    dispose() { for (const [name, handler] of Object.entries(handlers)) process.off(name, handler); },
  };
}
