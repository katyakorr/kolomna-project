const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const express = require('express');
const { buildPages } = require('../scripts/build-pages');

let output, server, base, summary;
before(async () => {
  output = fs.mkdtempSync(path.join(os.tmpdir(), 'kolomna-pages-'));
  summary = buildPages(output);
  const app = express();
  app.use('/kolomna-project', express.static(output));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/kolomna-project/`;
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  fs.rmSync(output, { recursive:true, force:true });
});

test('Pages publishes only public assets, with every data URL valid under the repository prefix', async () => {
  assert.equal(summary.places, 18);
  assert.equal(summary.routes, 5);
  assert.equal(summary.models, 16);
  const files = fs.readdirSync(output, { recursive:true }).map(String);
  assert.ok(!files.some(file => /(^|[/\\])(?:\.env|backend|\.local-backups|node_modules)([/\\]|$)|\.(?:blend|sql)$/.test(file)));
  const html = await (await fetch(base)).text();
  assert.ok(html.indexOf('js/site-config.js') < html.indexOf('js/api.js'));
  const data = await (await fetch(new URL('data/site.json', base))).json();
  const urls = new Set(['vendor/model-viewer.min.js', 'js/site-config.js']);
  // The redesign must work when Pages serves it under a repository prefix.
  const cssUrl = new URL('css/style.css', base);
  const css = await (await fetch(cssUrl)).text();
  for (const match of css.matchAll(/url\(['"]?([^)'"]+)['"]?\)/g)) {
    const asset = new URL(match[1], cssUrl);
    assert.ok(asset.href.startsWith(base), asset.href);
    assert.equal((await fetch(asset, { method:'HEAD' })).status, 200, asset.href);
  }
  for (const item of [...data.places, ...data.routes]) {
    for (const key of ['image_url', 'image_2_url', 'model_3d', 'model_poster']) {
      if (item[key]) { assert.ok(!item[key].startsWith('/'), item[key]); urls.add(item[key]); }
    }
  }
  for (const url of urls) assert.equal((await fetch(new URL(url, base), { method:'HEAD' })).status, 200, url);
  assert.equal((await fetch(new URL('../media/models/kalachnaya.glb', base))).status, 404);
  assert.equal((await fetch(new URL('api/places', base))).status, 404);
});

test('the static client filters and opens places/routes using one snapshot and no backend', async () => {
  const requests = [];
  const context = vm.createContext({
    window:{ SITE_CONFIG:{ dataMode:'static' } }, location:{ protocol:'https:' }, console, setTimeout, AbortSignal,
    fetch: (url, options) => { requests.push(url); return fetch(new URL(url, base), options); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js/api.js'), 'utf8'), context);
  const places = await context.fetchPlaces();
  assert.equal(places.length, 18);
  assert.equal(places.filter(place => place.model_3d).length, 17);
  const filtered = await context.fetchPlaces(places[0].type_name);
  assert.ok(filtered.length > 0 && filtered.length < 18);
  assert.ok(filtered.every(place => place.type_name === places[0].type_name));
  assert.match((await context.fetchPlaceDetails('16')).model_3d, /kalachnaya/);
  assert.equal((await context.fetchPlaceDetails(17)).model_3d, null);
  assert.equal(await context.fetchPlaceDetails(999), null);
  const routes = await context.fetchRoutes();
  assert.equal(routes.length, 5);
  assert.deepEqual(Array.from(await context.fetchRoutes('summer'), route => route.id), [2]);
  assert.equal((await fetch(new URL('hotel-qr/kolomna.svg', base))).status, 200);
  const route = await context.fetchRouteDetails(routes[0].id);
  assert.ok(route.points.length > 0);
  assert.ok(route.points.every(point => point.place.name && Number.isFinite(point.latitude)));
  route.points[0].place.name = 'Client-only change';
  assert.notEqual((await context.fetchRouteDetails(route.id)).points[0].place.name, 'Client-only change');
  assert.equal(await context.fetchRouteDetails(999), null);
  assert.deepEqual(requests, ['data/site.json']);
});
