const fs = require('node:fs');
const path = require('node:path');

const TABLES = ['place_type', 'route_category', 'place', 'route', 'promotion', 'route_point'];
const quote = name => '"' + name.replace(/"/g, '""') + '"';

function copyValue(value) {
  if (value === '\\N') return null;
  const escapes = { b:'\b', f:'\f', n:'\n', r:'\r', t:'\t', v:'\v', '\\':'\\' };
  return value.replace(/\\([0-7]{1,3}|x[\da-f]{1,2}|.)/gi, (_, code) => {
    if (/^[0-7]+$/.test(code)) return String.fromCharCode(parseInt(code, 8));
    if (/^x[\da-f]+$/i.test(code)) return String.fromCharCode(parseInt(code.slice(1), 16));
    return escapes[code] ?? code;
  });
}

function parseDump(text) {
  const tables = {};
  for (const match of text.replace(/\r\n/g, '\n').matchAll(/^COPY public\.(\w+) \(([^)]+)\) FROM stdin;\n([\s\S]*?)^\\\.\s*$/gm)) {
    const [, name, fields, body] = match;
    if (!TABLES.includes(name)) continue;
    const columns = fields.split(',').map(value => value.trim());
    const lines = body.endsWith('\n') ? body.slice(0, -1).split('\n') : body.split('\n');
    const rows = body ? lines.map(line => {
      const values = line.split('\t').map(copyValue);
      if (values.length !== columns.length) throw new Error(`Invalid COPY row in ${name}`);
      return Object.fromEntries(columns.map((key, i) => [key, values[i]]));
    }) : [];
    tables[name] = { columns, rows };
  }
  for (const name of TABLES) if (!tables[name]) throw new Error(`Missing table ${name} in project dump`);
  return tables;
}

async function replaceRows(client, tables) {
  for (const name of [...TABLES].reverse()) await client.query(`DELETE FROM public.${quote(name)}`);
  for (const name of TABLES) {
    const { columns, rows } = tables[name];
    if (!rows.length) continue;
    const values = [];
    const tuples = rows.map(row => '(' + columns.map(column => {
      values.push(row[column]); return '$' + values.length;
    }).join(',') + ')');
    await client.query(`INSERT INTO public.${quote(name)} (${columns.map(quote).join(',')}) VALUES ${tuples.join(',')}`, values);
  }
}

async function main() {
  const restoring = process.argv[2] === '--restore';
  const applying = process.argv[2] === '--apply';
  const dump = parseDump(fs.readFileSync(path.join(__dirname, '../kolomnabackup.sql'), 'utf8'));
  if (!restoring && !applying) {
    console.log('Project data:', Object.fromEntries(TABLES.map(name => [name, dump[name].rows.length])));
    console.log('Use --apply to import transactionally, or --restore <backup.json> to restore a snapshot.');
    return;
  }
  const snapshot = restoring ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
  const incoming = snapshot?.tables || dump;
  for (const name of TABLES) if (!incoming[name]) throw new Error(`Missing backup table ${name}`);
  if (!restoring && dump.place.rows.length !== 18) throw new Error('Expected 18 project places');

  const pool = require('../backend/db');
  let client;
  let transaction = false;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { client = await pool.connect(); break; }
      catch (error) {
        if (attempt === 2 || !/connection|timeout|ECONN|ETIMEDOUT/i.test(error.message)) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    await client.query('BEGIN'); transaction = true;
    await client.query("SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '30s'");
    await client.query(`LOCK TABLE ${TABLES.map(name => 'public.' + quote(name)).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    const foreignKeys = await client.query(`SELECT conrelid::regclass::text AS child FROM pg_constraint
      WHERE contype='f' AND confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1))`, [TABLES]);
    if (foreignKeys.rows.some(row => !TABLES.includes(row.child.replace(/^public\./, '')))) {
      throw new Error('An unrelated table references project data; import stopped before changes');
    }

    const backup = { createdAt:new Date().toISOString(), tables:{}, sequences:{} };
    for (const name of TABLES) {
      const columns = (await client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [name])).rows.map(row => row.column_name);
      const rows = (await client.query(`SELECT to_jsonb(t) AS row FROM public.${quote(name)} t ORDER BY id`)).rows.map(row => row.row);
      backup.tables[name] = { columns, rows };
      const sequence = (await client.query('SELECT pg_get_serial_sequence($1, $2) AS name', ['public.' + name, 'id'])).rows[0].name;
      if (sequence) {
        const identifier = sequence.split('.').map(quote).join('.');
        const state = (await client.query(`SELECT last_value, is_called FROM ${identifier}`)).rows[0];
        backup.sequences[name] = { name:sequence, next:Number(state.last_value) + (state.is_called ? 1 : 0) };
      }
    }
    const backupRoot = path.join(__dirname, '../.local-backups');
    fs.mkdirSync(backupRoot, { recursive:true, mode:0o700 });
    const backupDirectory = fs.mkdtempSync(path.join(backupRoot, 'project-data-'));
    const backupFile = path.join(backupDirectory, 'backup.json');
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), { mode:0o600 });
    console.log('Backup saved:', backupFile);

    // These nullable image columns are in the approved dump but absent from
    // the older database. Do not change owners, extensions, or other schemas.
    await client.query(`ALTER TABLE public.place ADD COLUMN IF NOT EXISTS image_url varchar(255),
      ADD COLUMN IF NOT EXISTS image_2_url varchar(500)`);
    await client.query('ALTER TABLE public.route ADD COLUMN IF NOT EXISTS image_url varchar(500)');
    await replaceRows(client, incoming);

    for (const name of TABLES) {
      const sequence = backup.sequences[name]?.name;
      if (!sequence) continue;
      const next = restoring ? snapshot.sequences[name]?.next : Math.max(0, ...incoming[name].rows.map(row => Number(row.id))) + 1;
      if (!Number.isSafeInteger(next) || next < 1) throw new Error(`Invalid sequence value for ${name}`);
      // ALTER SEQUENCE RESTART is transactional, unlike setval().
      await client.query(`ALTER SEQUENCE ${sequence.split('.').map(quote).join('.')} RESTART WITH ${next}`);
    }
    const counts = {};
    for (const name of TABLES) {
      counts[name] = Number((await client.query(`SELECT count(*) AS count FROM public.${quote(name)}`)).rows[0].count);
      if (counts[name] !== incoming[name].rows.length) throw new Error(`Row count mismatch for ${name}`);
    }
    await client.query('COMMIT'); transaction = false;
    console.log(restoring ? 'Snapshot restored:' : 'Project data imported:', counts);
    console.log('Undo with: node scripts/import-project-data.js --restore ' + backupFile);
  } catch (error) {
    if (transaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    client?.release(); await pool.end();
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseDump, copyValue };
