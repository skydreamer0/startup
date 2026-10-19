import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync,readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function classify(event,changes) {
  const full={backend:true,admin:true,pos:true};
  if(event!=='pull_request'||!Array.isArray(changes)||changes.length===0)return full;
  let backend=false,admin=false,pos=false;
  for(const {status,path} of changes){
    if(status!=='M'||typeof path!=='string'||path.includes('..')||/[\r\n]/.test(path))return full;
    // Tiny whitelist only: documentation not consumed by test fixtures.
    if(['README.md','LICENSE'].includes(path))continue;
    // Receiving UI and its shared browser harness exercise the persisted draft contract.
    if(path.startsWith('systems/enterprise-admin/admin-ui/src/pages/Receiving/')||['systems/enterprise-admin/admin-ui/src/api/receivingDrafts.ts','systems/enterprise-admin/admin-ui/src/domain/receiptDraft.ts','systems/enterprise-admin/admin-ui/src/domain/receiptDraftWorkspace.ts'].includes(path)){backend=true;admin=true;continue;}
    if(path.startsWith('systems/enterprise-admin/admin-ui/src/')){admin=true;continue;}
    if(path.startsWith('systems/enterprise-admin/pos-ui/e2e/admin-margin-warning/')){backend=true;admin=true;continue;}
    if(path.startsWith('systems/enterprise-admin/pos-ui/src/')){pos=true;continue;}
    return full; // Backend, contracts, config, every other harness and unknown path.
  }
  return {backend:backend||pos,admin,pos};
}
export function parseDiff(bytes){
 const parts=bytes.split('\0');assert.equal(parts.pop(),'');const result=[];
 while(parts.length){const status=parts.shift();assert.match(status,/^[A-Z][0-9]*$/);const path=parts.shift();assert.ok(path);result.push({status,path});if(/^[RC]/.test(status)){assert.ok(parts.shift());}}
 return result;
}
export function planFromGit({cwd=process.cwd(),env=process.env}){
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024});
 if(env.GITHUB_EVENT_NAME!=='pull_request')return classify(env.GITHUB_EVENT_NAME,[]);
 try{
  const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));const head=event.pull_request?.head?.sha;
  assert.match(head??'',/^[a-f0-9]{40}$/);assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);
  assert.equal(git('rev-parse','HEAD').trim(),env.GITHUB_SHA);
  const parents=git('show','-s','--format=%P','HEAD').trim().split(' ');assert.equal(parents.length,2);assert.equal(parents[1],head);
  // Compare actual execution first parent against submitted head, not a moving base ref.
  return classify('pull_request',parseDiff(git('diff','--name-status','-z','--no-renames',parents[0],head,'--')));
 }catch{return classify('unknown',[]);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const plan=planFromGit({});console.log(JSON.stringify(plan));assert.ok(process.env.GITHUB_OUTPUT);
 for(const [key,value]of Object.entries(plan))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
}
