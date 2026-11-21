// Reviewer-only mocked controller/service dataflow. No app start, HTTP, ORM or PG.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('/workspace/scratch/a973af1f593f/hpk-main-73f0987/node_modules/typescript');
const root = path.join(__dirname, 'source');
const moduleRoot = 'systems/enterprise-admin/backend/src/modules/expenses/';
function load(relative, imports) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const sandbox = { exports: module.exports, module, require(name) {
    if (!Object.hasOwn(imports, name)) throw new Error('Unexpected dependency: ' + name);
    return imports[name];
  }};
  vm.runInNewContext(compiled, sandbox, { filename: relative, timeout:1000 });
  return module.exports;
}
async function forwarded(body) {
  let captured, payload;
  class AppError extends Error { constructor(status,message) { super(message); this.status=status; } }
  const service=load(moduleRoot+'expenses.service.ts', {
    '../../lib/prisma': { prisma:{expense:{findUnique: async()=>({id:'synthetic-expense'}), update:async args=>{ captured=args; return {id:'synthetic-expense'}; }}} },
    '../../lib/errors': {AppError},
    '../../lib/tenant-persistence': {tenantPersistence:()=>{throw new Error('not expected in update');}},
  });
  const controller=load(moduleRoot+'expenses.controller.ts', {'./expenses.service':service});
  await controller.ExpensesController.updateExpense(
    {params:{id:'synthetic-expense'},body},
    {json:value=>{payload=value;}},
    error=>{throw error;},
  );
  assert.equal(payload.success,true);
  assert.equal(captured.data,body,'raw request body retains object identity through controller and service');
  return captured;
}
test('existing expense update forwards a nested tenant update object to the Prisma call', async()=>{
  const body={tenant:{update:{name:'SYNTHETIC_REVIEW_ONLY'}}};
  const captured=await forwarded(body);
  assert.equal(captured.data.tenant.update.name,'SYNTHETIC_REVIEW_ONLY');
});
test('existing expense update forwards tenantId, not only documented expense fields',async()=>{
  const body={tenantId:'synthetic-other-tenant'};
  assert.equal((await forwarded(body)).data.tenantId,'synthetic-other-tenant');
});
test('existing expense update forwards Prisma amount-operation objects, not only numeric values',async()=>{
  const body={amount:{increment:7}};
  assert.equal((await forwarded(body)).data.amount.increment,7);
});
