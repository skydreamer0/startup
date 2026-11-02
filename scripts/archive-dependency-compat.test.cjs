// Synthetic compatibility checks for the two scoped ExcelJS archive overrides.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { once } = require('node:events');
const { tmpdir } = require('node:os');
const path = require('node:path');
const backend = createRequire(path.join(__dirname, '../systems/enterprise-admin/backend/package.json'));
const excel = createRequire(backend.resolve('exceljs/package.json'));

test('actual archive-utils consumers preserve inclusion, exclusion and file filtering', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pharmacy-archive-glob-'));
  try {
    await mkdir(path.join(dir, 'nested'));
    for (const file of ['a.csv', '.hidden.csv', 'nested/b.xlsx', 'nested/c.txt']) {
      await writeFile(path.join(dir, file), 'synthetic');
    }
    const archive = createRequire(excel.resolve('archiver/package.json'));
    const zip = createRequire(archive.resolve('zip-stream/package.json'));
    for (const req of [archive, zip]) {
      const utils = req('archiver-utils');
      const owner = createRequire(req.resolve('archiver-utils/package.json'));
      assert.equal(owner('glob/package.json').version, '14.0.3');
      assert.deepEqual(utils.file.expand({ cwd: dir, filter: 'isFile' }, ['**/*.{csv,xlsx}', '!nested/**']), ['a.csv']);
      assert.deepEqual(utils.file.expand({ cwd: dir, dot: true, filter: 'isFile' }, '**/*.csv').sort(), ['.hidden.csv', 'a.csv']);
      assert.deepEqual(utils.file.expand({ cwd: dir, filter: 'isFile' }, 'missing/**'), []);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unchanged ExcelJS streams multiple worksheets and shared strings through new unzipper', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pharmacy-archive-xlsx-'));
  try {
    const ExcelJS = backend('exceljs');
    assert.equal(backend('exceljs/package.json').version, '4.4.0');
    assert.equal(excel('archiver/package.json').version, '5.3.2');
    assert.equal(excel('unzipper/package.json').version, '0.12.3');
    const filename = path.join(dir, 'synthetic.xlsx');
    const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useSharedStrings: true, useStyles: true });
    writer.addWorksheet('合成甲').addRow(['TEST-ONLY', '測試藥品', 3, true]).commit();
    writer.addWorksheet('合成乙').addRow(['TEST-ONLY', '測試藥品', 0, false]).commit();
    await writer.commit();
    const rows = [];
    for await (const sheet of new ExcelJS.stream.xlsx.WorkbookReader(filename)) {
      for await (const row of sheet) rows.push(row.values.slice(1));
    }
    assert.deepEqual(rows, [['TEST-ONLY', '測試藥品', 3, true], ['TEST-ONLY', '測試藥品', 0, false]]);
    const normal = new ExcelJS.Workbook();
    await normal.xlsx.readFile(filename);
    assert.equal(normal.worksheets.length, 2);
    assert.deepEqual(normal.getWorksheet('合成乙').getRow(1).values.slice(1), rows[1]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unchanged archiver directory flow creates only selected files readable by unzipper', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pharmacy-archive-zip-'));
  try {
    await mkdir(path.join(dir, 'input'));
    await writeFile(path.join(dir, 'input', 'keep.csv'), 'SKU,qty\nSYNTHETIC,3\n');
    await writeFile(path.join(dir, 'input', 'omit.txt'), 'not selected');
    const filename = path.join(dir, 'fixture.zip');
    const output = createWriteStream(filename);
    const finished = once(output, 'close');
    const archive = excel('archiver')('zip');
    archive.on('error', error => output.destroy(error));
    archive.pipe(output);
    archive.glob('**/*.csv', { cwd: path.join(dir, 'input') });
    await archive.finalize();
    await finished;
    const zip = await excel('unzipper').Open.file(filename);
    assert.deepEqual(zip.files.map(file => file.path), ['keep.csv']);
    assert.equal((await zip.files[0].buffer()).toString(), 'SKU,qty\nSYNTHETIC,3\n');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('new unzipper rejects a malformed archive instead of yielding successful contents', async () => {
  await assert.rejects(excel('unzipper').Open.buffer(Buffer.from('synthetic not a zip archive')));
});
