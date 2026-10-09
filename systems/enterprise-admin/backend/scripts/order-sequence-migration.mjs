import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Called ONLY after the Actions harness proves ownership of its empty synthetic
// service. This fixed schema is created once; an existing schema is never reset.
export function verifyMigration({ sql, rejectedSql, backend, save }) {
  const schema = 'order_sequence_upgrade_fixture';
  const scoped = statement => `SET search_path TO ${schema};\n${statement}`;
  const query = statement => sql(scoped(statement));
  const reject = statement => rejectedSql(scoped(statement));
  const migrationRoot = path.join(backend, 'prisma/migrations');
  const name = '20261009010000_taipei_order_sequence';
  const migration = fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8');
  const diagnostics = fs.readFileSync(path.join(backend, 'prisma/diagnostics/preflight-order-numbers.sql'), 'utf8');
  assert.equal(sql(`SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`), '0');
  sql(`CREATE SCHEMA ${schema}`);
  try {
    for (const previous of fs.readdirSync(migrationRoot).filter(value => /^\d/.test(value) && value < name).sort()) {
      query(fs.readFileSync(path.join(migrationRoot, previous, 'migration.sql'), 'utf8'));
    }
    query(`INSERT INTO tenants(id,name,slug) VALUES ('seq-a','Synthetic A','sequence-fixture-a'), ('seq-b','Synthetic B','sequence-fixture-b');
      INSERT INTO customers(id,tenant_id,updated_at) VALUES ('customer-a','seq-a',now()),('customer-b','seq-b',now());
      INSERT INTO orders(id,tenant_id,customer_id,total_amount,order_number,created_at,updated_at) VALUES
      ('duplicate-1','seq-a','customer-a',0,'POS-20261009-00042','2026-10-08 20:00:00',now()),
      ('duplicate-2','seq-a','customer-a',0,'POS-20261009-00042','2026-10-08 20:00:00',now());`);
    const fingerprint = () => query(`SELECT md5(string_agg((to_jsonb(o)-'business_date')::text,',' ORDER BY id)) FROM orders o`);
    const duplicateBefore = fingerprint();
    const diagnosticBefore = query(diagnostics);
    assert.match(diagnosticBefore, /duplicate-1/); assert.match(diagnosticBefore, /duplicate-2/);
    assert.equal(fingerprint(), duplicateBefore, 'Diagnostic must be read-only');
    const duplicateFailure = reject(migration);
    assert.match(duplicateFailure, /Duplicate tenant\/order numbers prevent migration/);
    assert.match(duplicateFailure, /duplicate-1/); assert.match(duplicateFailure, /duplicate-2/);
    assert.equal(fingerprint(), duplicateBefore);
    assert.equal(query(`SELECT count(*) FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='orders' AND column_name='business_date'`), '0');
    assert.equal(query(`SELECT count(*) FROM pg_tables WHERE schemaname='${schema}' AND tablename='order_number_counters'`), '0');
    save('migration-duplicate.json', { status: 'passed', diagnosticBefore, duplicateFailure, oldRowsUnchanged: true, noPartialDdl: true });

    // Only our synthetic duplicate is removed to exercise the clean upgrade.
    query(`DELETE FROM orders WHERE id='duplicate-2';
      INSERT INTO orders(id,tenant_id,customer_id,total_amount,order_number,created_at,updated_at) VALUES
      ('printed-utc','seq-a','customer-a',0,'POS-20261008-00009','2026-10-08 20:00:00',now()),
      ('overflow','seq-a','customer-a',0,'POS-20261010-100000','2026-10-10 00:00:00',now()),
      ('bad-calendar','seq-a','customer-a',0,'POS-20260231-00099',now(),now()),
      ('bad-text','seq-a','customer-a',0,'POS-unparsed',now(),now()),
      ('null-a','seq-a','customer-a',0,NULL,now(),now()),
      ('null-b','seq-a','customer-a',0,NULL,now(),now()),
      ('other-tenant','seq-b','customer-b',0,'POS-20261009-00042',now(),now());`);
    const before = fingerprint();
    query(migration);
    assert.equal(fingerprint(), before, 'Migration must not change any old order field');
    assert.equal(query('SELECT count(*) FROM orders WHERE business_date IS NOT NULL'), '0');
    const counters = query(`SELECT tenant_id||'/'||business_date::text||'/'||last_sequence::text FROM order_number_counters ORDER BY tenant_id,business_date`);
    assert.equal(counters, 'seq-a/2026-10-08/9\nseq-a/2026-10-09/42\nseq-a/2026-10-10/99999\nseq-b/2026-10-09/42');
    const malformed = query(diagnostics);
    assert.match(malformed, /bad-calendar/); assert.match(malformed, /bad-text/); assert.match(malformed, /overflow/);
    assert.equal(fingerprint(), before);
    const uniqueError = reject(`INSERT INTO orders(id,tenant_id,customer_id,total_amount,order_number,updated_at) VALUES ('unique-probe','seq-a','customer-a',0,'POS-20261009-00042',now())`);
    assert.match(uniqueError, /orders_tenant_id_order_number_key/);
    const boundError = reject(`UPDATE order_number_counters SET last_sequence=100000 WHERE tenant_id='seq-a' AND business_date='2026-10-09'`);
    assert.match(boundError, /order_number_counters_sequence_check/);
    save('migration-upgrade.json', { status: 'passed', counters, malformed, oldRowsUnchanged: true, oldBusinessDatesRemainNull: true, uniqueConstraint: true, counterBounds: true });
  } finally {
    sql(`DROP SCHEMA ${schema} CASCADE`);
    assert.equal(sql(`SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`), '0');
    save('migration-cleanup.json', { status: 'passed', ownedSchemaAbsent: true });
  }
}
