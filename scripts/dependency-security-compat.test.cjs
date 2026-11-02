// Run after both canonical installs: node --test scripts/dependency-security-compat.test.cjs
// Synthetic filesystem/workbook/loopback data only; no database or store access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const backend = createRequire(path.join(__dirname, '../systems/enterprise-admin/backend/package.json'));
const admin = createRequire(path.join(__dirname, '../systems/enterprise-admin/admin-ui/package.json'));

test('legacy glob consumer preserves recursive, brace, dot and ignore matching', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pharmacy-glob-'));
  try {
    await mkdir(path.join(dir, 'nested'));
    for (const file of ['a.csv', '.hidden.csv', 'nested/b.xlsx', 'nested/c.txt']) {
      await writeFile(path.join(dir, file), 'synthetic');
    }
    const glob = backend('glob');
    assert.deepEqual(glob.sync('**/*.{csv,xlsx}', { cwd: dir }).sort(), ['a.csv', 'nested/b.xlsx']);
    assert.deepEqual(glob.sync('**/*.csv', { cwd: dir, dot: true }).sort(), ['.hidden.csv', 'a.csv']);
    assert.deepEqual(glob.sync('**/*', { cwd: dir, nodir: true, ignore: ['nested/**'] }), ['a.csv']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('readdir-glob retains brace matching and excludes ignored/dot entries', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pharmacy-readdir-'));
  try {
    await mkdir(path.join(dir, 'nested'));
    for (const file of ['a.csv', '.hidden.csv', 'nested/b.xlsx', 'nested/c.txt']) {
      await writeFile(path.join(dir, file), 'synthetic');
    }
    const files = await new Promise((resolve, reject) => {
      const found = [];
      backend('readdir-glob')(dir, { pattern: '**/*.{csv,xlsx}', nodir: true })
        .on('match', entry => found.push(entry.relative))
        .on('error', reject).on('end', () => resolve(found.sort()));
    });
    assert.deepEqual(files, ['a.csv', 'nested/b.xlsx']);
    const ignored = await new Promise((resolve, reject) => {
      const found = [];
      backend('readdir-glob')(dir, { pattern: '**/*', ignore: ['nested/**'], nodir: true })
        .on('match', entry => found.push(entry.relative))
        .on('error', reject).on('end', () => resolve(found.sort()));
    });
    assert.deepEqual(ignored, ['a.csv']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ExcelJS streaming ZIP writer and reader retain multilingual cell values', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pharmacy-excel-'));
  try {
    const ExcelJS = backend('exceljs');
    const filename = path.join(dir, 'synthetic.xlsx');
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename });
    const sheet = workbook.addWorksheet('合成資料');
    sheet.addRow(['SKU', '品名', '數量']).commit();
    sheet.addRow(['TEST-ONLY', '測試藥品', 3]).commit();
    await workbook.commit();
    const read = new ExcelJS.Workbook();
    await read.xlsx.readFile(filename);
    assert.deepEqual(read.getWorksheet('合成資料').getRow(2).values.slice(1), ['TEST-ONLY', '測試藥品', 3]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('actual ESLint consumers resolve patched Minimatch constructor and globstar', () => {
  for (const req of [backend, admin]) {
    const eslint = createRequire(req.resolve('eslint/package.json'));
    const minimatch = eslint('minimatch');
    assert.equal(eslint('minimatch/package.json').version, '11.0.1');
    assert.equal(new minimatch.Minimatch('**/*.{ts,tsx}').match('src/nested/example.tsx'), true);
    assert.equal(new minimatch.Minimatch('**/*.ts').match('src/example.js'), false);
  }
});

test('follow-redirects strips cross-realm custom sensitive headers but keeps harmless headers', async () => {
  const axios = createRequire(admin.resolve('axios/package.json'));
  assert.equal(axios('follow-redirects/package.json').version, '1.16.2');
  const target = http.createServer((req, res) => res.end(JSON.stringify(req.headers)));
  const source = http.createServer((req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/` }); res.end();
  });
  try {
    await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => source.listen(0, '127.0.0.1', resolve));
    const headers = await new Promise((resolve, reject) => {
      axios('follow-redirects').http.get({
        protocol: 'http:', hostname: '127.0.0.1', port: source.address().port, path: '/', timeout: 5000,
        headers: { 'X-API-Key': 'synthetic-not-a-secret', 'X-Harmless': 'retained' },
        sensitiveHeaders: vm.runInNewContext("['X-API-Key']"),
      }, res => {
        let body = ''; res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(JSON.parse(body))); res.on('error', reject);
      }).on('timeout', function () { this.destroy(new Error('Synthetic redirect probe timed out')); })
        .on('error', reject);
    });
    assert.equal(headers['x-api-key'], undefined);
    assert.equal(headers['x-harmless'], 'retained');
  } finally {
    await Promise.all([source, target].map(server => new Promise(resolve => server.close(resolve))));
  }
});
