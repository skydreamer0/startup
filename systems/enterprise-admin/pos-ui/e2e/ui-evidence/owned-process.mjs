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
  try { process.kill(-group, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
};
async function settle(group) {
  if (!(await liveGroup(group)).length) return;
  signal(group, 'SIGTERM');
  for (let i = 0; i < 40; i++) { if (!(await liveGroup(group)).length) return; await delay(50); }
  signal(group, 'SIGKILL');
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
      if (cancelled) return { exitCode: null, signal: cancelled, error: null, quiescent: true };
      const child = spawn(command, args, { ...options, detached: true });
      let error = null;
      let escalation;
      child.once('error', problem => { error = problem.message; });
      cancelChild = () => {
        if (!child.pid) return;
        signal(child.pid, 'SIGTERM');
        escalation ??= setTimeout(() => signal(child.pid, 'SIGKILL'), 2000);
      };
      if (cancelled) cancelChild();
      const result = await new Promise(resolve => child.once('close', (exitCode, signal) => resolve({ exitCode, signal })));
      if (escalation) clearTimeout(escalation);
      cancelChild = null;
      if (child.pid) await settle(child.pid);
      return { ...result, error, quiescent: true };
    },
    dispose() { for (const [name, handler] of Object.entries(handlers)) process.off(name, handler); },
  };
}
