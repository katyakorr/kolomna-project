const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { assets, withModel } = require('../backend/models');
const { parseDump, copyValue } = require('../scripts/import-project-data');

const dump = fs.readFileSync(path.join(__dirname, '../kolomnabackup.sql'), 'utf8');
const rows = dump.split('COPY public.place (')[1].split('\n').slice(1);
const places = [];
for (const line of rows) {
  if (line === '\\.') break;
  const [id, name, description, facts, address, latitude, longitude, model_3d, place_type_id, image_url, image_2_url] = line.split('\t');
  places.push({ id: Number(id), name, description, facts, address, latitude, longitude, model_3d, place_type_id, image_url, image_2_url });
}

// Test HTTP routes against the checked-in data, never a developer's cloud DB.
const fakePool = { query: async (sql, params) => {
  if (sql.includes('FROM route_point')) return { rows: places.slice(0, 3).map((place, i) => ({ place_id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, order_number: i + 1, stay_minutes: 10, place })) };
  if (sql.includes('FROM route')) return { rows: params && Number(params[0]) !== 1 ? [] : [{ id: 1, name: 'Тестовая прогулка' }] };
  return { rows: params ? places.filter(place => place.id === Number(params[0])) : places };
} };
const dbFile = require.resolve('../backend/db');
require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: fakePool };
const app = require('../backend/server');
let server, origin;
before(async () => {
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('the importer reads all related tables and decodes COPY text without executing SQL', () => {
  const tables = parseDump(dump);
  assert.equal(tables.place.rows.length, 18); assert.equal(tables.route.rows.length, 5);
  assert.equal(tables.route_point.rows.length, 16); assert.equal(tables.promotion.rows.length, 3);
  assert.equal(copyValue('\\N'), null);
  assert.equal(copyValue('line\\nwith\\ttab\\\\path'), 'line\nwith\ttab\\path');
  assert.throws(() => parseDump('CREATE TABLE something;'), /Missing table/);
});

test('the 18 project places map to 16 assets, with a shared cafe and an omitted cafe', () => {
  assert.equal(places.length, 18); assert.equal(assets.length, 16);
  const expected = { 1:'kolomenskaya-pastila',2:'pastila-factory',3:'marinkina-tower',4:'kalachnaya',5:'kuznechnaya-sloboda',6:'staro-golutvin',7:'toy-museum',8:'flood-scale',9:'dom-samovara',10:'artkommunalka',11:'organic-culture',12:'kolomensky-patefon',13:'lazhechnikov-estate',14:'dushistye-radosti',15:'rulki-vverh',16:'kalachnaya',17:null,18:'kolomna-hotel' };
  for (const place of places) {
    const mapped = withModel(place);
    assert.equal(mapped.model_3d?.split('/').pop().split('.glb')[0] || null, expected[place.id], place.name);
    assert.equal(Boolean(mapped.model_3d), Boolean(mapped.model_poster));
  }
});

test('legacy IDs cannot attach the wrong building, and names normalize punctuation', () => {
  assert.match(withModel({ id:17, name:'Музей "Калачная"' }).model_3d, /kalachnaya/);
  assert.equal(withModel({ id:4, name:'Успенский кафедральный собор', model_3d:'/old.glb' }).model_3d, null);
  assert.equal(withModel({ id:6, name:'Свято-Троицкий Ново-Голутвин монастырь' }).model_3d, null);
  assert.match(withModel({ name:'Ресторан-пивное бистро «Рульки вверх»' }).model_3d, /rulki-vverh/);
});

test('all HTTP place endpoints and route stops include matching model metadata', async () => {
  const list = await (await fetch(`${origin}/api/places`)).json();
  assert.equal(list.filter(place => place.model_3d).length, 17);
  for (const place of list) {
    const detail = await (await fetch(`${origin}/api/places/${place.id}`)).json();
    assert.equal(detail.model_3d, place.model_3d); assert.equal(detail.model_poster, place.model_poster);
  }
  const route = await (await fetch(`${origin}/api/routes/1`)).json();
  assert.equal(route.points.length, 3); assert.equal(route.total_minutes, 30);
  for (const stop of route.points) assert.equal(stop.place.model_3d, withModel(stop.place).model_3d);
  assert.equal((await fetch(`${origin}/api/places/999`)).status, 404);
});

test('all models and compact posters are served, with GLB type, ranges and cache revalidation', async () => {
  for (const asset of assets) {
    const model = await fetch(origin + asset.src);
    assert.equal(model.status, 200, asset.slug);
    assert.match(model.headers.get('content-type'), /model\/gltf-binary/);
    const bytes = Buffer.from(await model.arrayBuffer());
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.length, asset.bytes);
    const poster = await fetch(origin + asset.poster);
    assert.equal(poster.status, 200); assert.match(poster.headers.get('content-type'), /image\/webp/);
    assert.ok((await poster.arrayBuffer()).byteLength < 25000);
    const range = await fetch(origin + asset.src, { headers: { range:'bytes=0-11' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 12);
    const cached = await fetch(origin + asset.src, { cache:'no-cache', headers: { 'if-none-match':model.headers.get('etag') } });
    assert.equal(cached.status, 304);
  }
  assert.equal((await fetch(`${origin}/media/models/not-approved.glb`)).status, 404);
  assert.equal((await fetch(`${origin}/media/models/marinkina-tower.blend`)).status, 404);
  const viewer = await fetch(`${origin}/vendor/model-viewer.min.js`);
  assert.equal(viewer.status, 200); assert.match(viewer.headers.get('content-type'), /javascript/);
});
