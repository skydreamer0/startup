// NEW portable path adapter for the original reviewer probe, not the original artifact.
// Mocked controller/service argument forwarding only. No app, HTTP, ORM or PG.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

// Invoke with node (node:test runs these tests automatically), not with a package install.
// Example: node expense-dataflow-replay.portable.cjs --root /path/to/repo
// Optional: --typescript /path/to/an/already-installed/typescript/package
function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help') {
      console.log('Usage: node expense-dataflow-replay.portable.cjs --root REPOSITORY [--typescript INSTALLED_MODULE_PATH]');
      process.exit(0);
    }
    if (!['--root', '--typescript'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || Object.hasOwn(result, key)) {
      throw new Error('Expected --root REPOSITORY and optional --typescript INSTALLED_MODULE_PATH, each at most once');
    }
    result[key] = argv[++i];
  }
  if (!result['--root']) throw new Error('--root REPOSITORY is required');
  return result;
}
const args = options(process.argv.slice(2));
const root = fs.realpathSync(path.resolve(args['--root']));
if (!fs.statSync(root).isDirectory()) throw new Error('--root must be a repository directory');
const typescriptPath = args['--typescript']
  ? require.resolve(path.resolve(args['--typescript']))
  : require.resolve('typescript', { paths: [path.join(root, 'systems/enterprise-admin/backend'), root] });
const ts = require(typescriptPath);
if (typeof ts.transpileModule !== 'function') throw new Error('Resolved module is not TypeScript');

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
