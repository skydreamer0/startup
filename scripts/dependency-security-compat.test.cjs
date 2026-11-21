// Run after both canonical installs: node --test scripts/dependency-security-compat.test.cjs
// Synthetic filesystem/workbook data only; no network, database or store access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, mkdir, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const backend = createRequire(path.join(__dirname, '../systems/enterprise-admin/backend/package.json'));
const admin = createRequire(path.join(__dirname, '../systems/enterprise-admin/admin-ui/package.json'));
const pos = createRequire(path.join(__dirname, '../systems/enterprise-admin/pos-ui/package.json'));

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

test('both Axios consumers resolve the reviewed follow-redirects entry point', async () => {
  for (const req of [admin, pos]) {
    const axios = createRequire(req.resolve('axios/package.json'));
    assert.equal(axios('follow-redirects/package.json').version, '1.16.2');
    const entry = await readFile(axios.resolve('follow-redirects'));
    assert.equal(createHash('sha256').update(entry).digest('hex'),
      'c93380e360cdc3e7f97771e542f99253b1527f0650bdef32180bcf012840e1ce');
  }
});
