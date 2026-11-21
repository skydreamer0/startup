import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyManifest,loadPlan,parseArgs,integrationLockBlockers } from './verify-plan.mjs';

export function schedule(manifest,evidence=[]){
  const errors=verifyManifest(manifest,evidence);if(errors.length)throw Error(errors.join('\n'));
  const tasks=manifest.tasks, byId=new Map(tasks.map(t=>[t.id,t]));
  const active=tasks.filter(t=>t.status==='active');const held=new Set(active.flatMap(t=>t.exclusiveLocks));const ready=[],blocked=[],activation=[];
  // Stable dependency-first order includes integration ancestors. A downstream
  // task may still start a non-overlapping contract while integration is pending.
  const ordered=[],visited=new Set();
  function visit(t){if(visited.has(t.id))return;visited.add(t.id);for(const d of [...t.dependsOn,...t.integrationDependsOn])visit(byId.get(d));ordered.push(t);}
  tasks.forEach(visit);
  for(const t of ordered){
    const reasons=[];
    if(t.status==='planned'){
      const unfinished=t.dependsOn.filter(d=>byId.get(d).status!=='complete');
      if(unfinished.length)reasons.push(`DEPENDENCY:${unfinished.join(',')}`);
      const integrationLocks=integrationLockBlockers(t,tasks);if(integrationLocks.length)reasons.push(`INTEGRATION_LOCK_PREREQUISITE:${integrationLocks.join(',')}`);
      const conflicts=t.exclusiveLocks.filter(l=>held.has(l));if(conflicts.length)reasons.push(`LOCK:${conflicts.join(',')}`);
      if(!reasons.length && active.length+ready.length>=manifest.maxWorkers)reasons.push('WORKER_LIMIT');
      if(reasons.length)blocked.push({id:t.id,reasons});else{ready.push(t.id);t.exclusiveLocks.forEach(l=>held.add(l));}
    }
    const decision=t.decisionGates.filter(d=>manifest.decisions.find(v=>v.id===d).status!=='APPROVED');
    const gates=t.activationGates.filter(g=>manifest.activationGates.find(v=>v.id===g).status!=='PASS');
    const integration=t.integrationDependsOn.filter(d=>byId.get(d).status!=='complete');
    activation.push({id:t.id,status:t.activation,decisionBlocked:decision,integrationBlocked:integration,acceptanceBlocked:gates,implementation:t.status,verification:t.verification});
  }
  return {mode:'read-only',warning:'Readiness is not authorization, acceptance, automatic dispatch, merge or deployment.',active:active.map(t=>t.id),ready,blocked,activation};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=parseArgs(process.argv.slice(2));if(args.checkSource)throw Error('--check-source belongs to verify-plan.mjs');const {manifest,evidence}=loadPlan(args.manifest,args.evidence);console.log(JSON.stringify(schedule(manifest,evidence),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
