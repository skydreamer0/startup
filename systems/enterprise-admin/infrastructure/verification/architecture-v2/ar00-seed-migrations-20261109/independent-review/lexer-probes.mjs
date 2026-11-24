import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const {scanSeed,digest}=await import(pathToFileURL(`${root}/scripts/architecture/verify-seed-migrations.mjs`));
const base=fs.readFileSync(`${root}/systems/enterprise-admin/backend/prisma/seed.ts`,'utf8');
const result=[];
for(const [name,source] of [
 ['unterminated comment',base+'\n/*'],
 ['unterminated string',base+'\nconst x="unfinished'],
 ['multiline quoted string',base+'\nconst x="line\nline";'],
 ['regex literal',base+'\nconst r=/x/;'],
 ['division expression',base+'\nconst n=4/2;'],
 ['escaped identifier',base+'\nconst pr\\u0069sma=0;'],
 ['nonascii identifier',base+'\nconst 計數=0;'],
 ['raw tagged template',base+'\nprisma.$executeRaw`SELECT 1`;'],
 ['model tagged template',base+'\nprisma.product.create`anything`;'],
 ['computed method',base.replace('prisma.tenant.upsert',"prisma.tenant['upsert']")],
 ['optional operation',base.replace('prisma.tenant.upsert','prisma.tenant?.upsert')],
 ['destructure client',base+'\nconst { product } = prisma;'],
 ['client return alias',base+'\nconst getClient=()=>prisma;'],
 ['unknown operation',base+'\nprisma.product.deleteMany({});'],
 ['disconnect args',base.replace('prisma.$disconnect()','prisma.$disconnect(1)')],
 ['unbalanced call',base+'\nprisma.product.create({]);'],
 ['unterminated call',base+'\nprisma.product.create({'],
 ['complex template',base+'\nconst x=`${value + 1}`;'],
 ['template client property',base+'\nconst x=`${prisma.product}`;'],
 ['extra client',base+'\nconst other=new PrismaClient();'],
]){let error;try{scanSeed(source)}catch(e){error=e.message}assert.ok(error,name);result.push({name,result:'REJECTED',error})}
console.log(JSON.stringify({toolSha256:digest(fs.readFileSync(`${root}/scripts/architecture/verify-seed-migrations.mjs`)),result:'PASS',scope:'20 independent syntax rejection probes only; not general TypeScript parsing or source execution',probes:result},null,2));
