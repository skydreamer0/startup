import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const source=process.cwd();
const {verifySeedMigrations,digest,canonical,inventoryPath,effectsPath,planDir}=await import(pathToFileURL(`${source}/scripts/architecture/verify-seed-migrations.mjs`));
const read=(b,p)=>fs.readFileSync(path.join(b,p),'utf8');
const json=(b,p)=>JSON.parse(read(b,p));
const put=(b,p,v)=>{fs.mkdirSync(path.dirname(path.join(b,p)),{recursive:true});fs.writeFileSync(path.join(b,p),v)};
const save=(b,p,v)=>put(b,p,JSON.stringify(v,null,2)+'\n');
const results=[];
function probe(name,mutate,repin=false){const base=fs.mkdtempSync(path.join(os.tmpdir(),'ar00-independent-'));try{const i=json(source,inventoryPath),e=json(source,effectsPath); const files=new Set([inventoryPath,effectsPath,`${planDir}/manifest.json`,`${planDir}/source-inventory.json`,...i.sourceFiles.map(f=>f.path),...e.testEvidence.map(t=>t.path),...e.referenceSources.map(f=>f.path)]);for(const p of files) put(base,p,read(source,p));mutate(base);if(repin){const inventory=json(base,inventoryPath);inventory.reviewedEffectsSha256=digest(canonical(json(base,effectsPath)));save(base,inventoryPath,inventory)}results.push({name,semanticPinRefreshed:repin,...verifySeedMigrations(base)});}finally{fs.rmSync(base,{recursive:true,force:true})}}
probe('untouched',()=>{});
probe('readiness source bytes drift with no pin edits',b=>{const p='systems/enterprise-admin/backend/src/lib/readiness.ts';put(b,p,read(b,p)+'\n// independent drift probe\n')});
probe('server source removed with no pin edits',b=>fs.unlinkSync(path.join(b,'systems/enterprise-admin/backend/src/server.ts')));
probe('scope runtime incorrectly promoted',b=>{const e=json(b,effectsPath);e.scope.runtime='PASS';save(b,effectsPath,e)},true);
probe('migrationLock runtime incorrectly promoted',b=>{const e=json(b,effectsPath);e.migrationLock.runtimeStatus='PASS';save(b,effectsPath,e)},true);
probe('test assertion catalogue emptied',b=>{const e=json(b,effectsPath);e.testEvidence[0].assertions=[];save(b,effectsPath,e)},true);
console.log(JSON.stringify({subject:json(source,inventoryPath).verificationSubject,toolSha256:digest(read(source,'scripts/architecture/verify-seed-migrations.mjs')),effectsSha256:digest(read(source,effectsPath)),results},null,2));
