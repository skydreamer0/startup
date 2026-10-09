import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Called only after the existing runner has proved ownership of an empty
// synthetic PostgreSQL service. No connection, reset or alternate URL path.
export function verifyIntegratedMigrations({ sql, rejectedSql, backend, save }) {
  const schema = 'pharmacy_integrated_upgrade_fixture';
  const query = statement => sql(`SET search_path TO ${schema};\n${statement}`);
  const reject = statement => rejectedSql(`SET search_path TO ${schema};\n${statement}`);
  const migrations = path.join(backend, 'prisma/migrations');
  const sequence = '20261009010000_taipei_order_sequence';
  const audit = '20261009120000_product_batch_changes';
  const migration = name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8');
  assert.equal(sql(`SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`), '0');
  sql(`CREATE SCHEMA ${schema}`);
  try {
    const prior = fs.readdirSync(migrations).filter(name => /^\d/.test(name) && name < sequence).sort();
    for (const name of prior) query(migration(name));
    query(`INSERT INTO tenants(id,name,slug) VALUES ('joint-tenant','Synthetic integration','joint-synthetic');
      INSERT INTO users(id,email,password_hash,full_name,tenant_id,updated_at)
        VALUES ('joint-actor','joint@synthetic.test','not-a-login-hash','Synthetic actor','joint-tenant',now());
      INSERT INTO customers(id,tenant_id,updated_at) VALUES ('joint-customer','joint-tenant',now());
      INSERT INTO products(id,tenant_id,sku,name,retail_price,cost_price,stock_quantity,updated_at)
        VALUES ('joint-product','joint-tenant','JOINT-SYNTHETIC','Synthetic product',100,20.1234,4,now());
      INSERT INTO product_batches(id,tenant_id,product_id,batch_number,expiry_date,quantity,cost_price,status)
        VALUES ('joint-batch','joint-tenant','joint-product','JOINT','2099-01-01',4,20.1234,'QUARANTINE');
      INSERT INTO inventory_transactions(id,tenant_id,product_id,batch_id,type,quantity,cost_price_at_receipt,notes)
        VALUES ('joint-in','joint-tenant','joint-product','joint-batch','IN',4,20.1234,'Synthetic old receipt');
      INSERT INTO orders(id,tenant_id,customer_id,total_amount,order_number,created_at,updated_at)
        VALUES ('joint-order','joint-tenant','joint-customer',100,'POS-20261008-00042','2026-10-08 20:00:00',now());`);
    const tables = ['tenants', 'users', 'customers', 'products', 'product_batches', 'inventory_transactions', 'orders'];
    const snapshot = () => Object.fromEntries(tables.map(table => [table, JSON.parse(query(
      `SELECT jsonb_agg(to_jsonb(t) - 'business_date' ORDER BY id) FROM ${table} t`))]));
    const before = snapshot();
    query(migration(sequence));
    assert.deepEqual(snapshot(), before);
    assert.equal(query('SELECT count(*) FROM orders WHERE business_date IS NOT NULL'), '0');
    const counters = query('SELECT tenant_id, business_date, last_sequence FROM order_number_counters');
    assert.equal(counters, 'joint-tenant|2026-10-08|42');
    query(migration(audit));
    assert.deepEqual(snapshot(), before);
    assert.equal(query('SELECT count(*) FROM product_batch_changes'), '0', 'No historical audit backfill');
    assert.equal(query('SELECT tenant_id, business_date, last_sequence FROM order_number_counters'), counters);
    query(`INSERT INTO product_batch_changes(id,tenant_id,product_id,batch_id,actor_id,operation,"before","after",reason)
      VALUES ('joint-audit','joint-tenant','joint-product','joint-batch','joint-actor','COST',
      '{"status":"QUARANTINE","expiryDate":"2099-01-01T00:00:00.000Z","costPrice":"20.1234"}',
      '{"status":"QUARANTINE","expiryDate":"2099-01-01T00:00:00.000Z","costPrice":"21.1234"}',
      'Synthetic append-only probe');`);
    const retained = query('SELECT to_jsonb(t) FROM product_batch_changes t');
    const rejection = {};
    for (const [operation, statement] of Object.entries({
      UPDATE: "UPDATE product_batch_changes SET reason='changed' WHERE id='joint-audit'",
      DELETE: "DELETE FROM product_batch_changes WHERE id='joint-audit'",
      TRUNCATE: 'TRUNCATE product_batch_changes',
    })) {
      rejection[operation] = reject(statement);
      assert.match(rejection[operation], /ProductBatchChange is append-only/);
      assert.equal(query('SELECT to_jsonb(t) FROM product_batch_changes t'), retained);
    }
    assert.deepEqual(snapshot(), before);
    save('integration-migrations.json', { status: 'passed', prior, applied: [sequence, audit],
      before, after: snapshot(), oldBusinessDatesRemainNull: true, counters,
      noHistoricalAuditBackfill: true, appendOnly: rejection, retainedSyntheticAudit: JSON.parse(retained) });
  } finally {
    // Keep audit protections active; remove only this freshly owned schema.
    sql(`DROP SCHEMA ${schema} CASCADE`);
    assert.equal(sql(`SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`), '0');
    save('integration-migrations-cleanup.json', { status: 'passed', ownedSchemaAbsent: true });
  }
}
