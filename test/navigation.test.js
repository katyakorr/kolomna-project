const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const app = { innerHTML: '' };
  const crumb = { textContent: '' };
  const document = {
    body: { matches: () => true },
    getElementById: id => id === 'app' ? app : id === 'map-crumb' ? crumb : null,
    addEventListener() {}
  };
  const context = vm.createContext({ document, window: { location: { hash: '#place/1' }, addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js/app.js'), 'utf8'), context);
  return { context, app, crumb };
}

for (const [kind, render, fetchName] of [
  ['place', 'renderPlacePage', 'fetchPlaceDetails'],
  ['route', 'renderRoutePage', 'fetchRouteDetails']
]) {
  test(`a slow missing ${kind} cannot replace a page opened in the meantime`, async () => {
    const h = harness(), request = deferred();
    h.context.window.location.hash = `#${kind}/1`;
    h.context[fetchName] = () => request.promise;
    const rendering = h.context[render]('1');
    h.context.window.location.hash = '#home';
    h.app.innerHTML = 'Current home page';
    request.resolve(null);
    await rendering;
    assert.equal(h.app.innerHTML, 'Current home page');
  });
}

test('a late route response cannot overwrite a more recent map selection', async () => {
  const h = harness(), first = deferred(), second = deferred();
  vm.runInContext('mapInstance = {}', h.context);
  h.context.fetchRouteDetails = id => id === 1 ? first.promise : second.promise;
  const oldSelection = h.context.showRouteOnMap(1);
  const latestSelection = h.context.showRouteOnMap(2);
  first.resolve({ points: [] });
  await oldSelection;
  assert.equal(h.crumb.textContent, '');
  second.resolve({ points: [] });
  await latestSelection;
  assert.match(h.crumb.textContent, /нет точек/);
});

test('map coordinates reject missing and out-of-range values, and short distances use meters', () => {
  const { context } = harness();
  const valid = context.validateCoordinates({ latitude: '55.1', longitude: 38.76 });
  assert.equal(valid.valid, true);
  assert.deepEqual(Array.from(valid.pair), [55.1, 38.76]);

  for (const latitude of [null, '', ' ', 91, Infinity]) {
    const result = context.validateCoordinates({ latitude, longitude: 38.76 });
    assert.equal(result.valid, false);
    assert.equal(result.code, 'INVALID_COORDINATES');
  }
  assert.equal(context.validateCoordinates({ latitude: 55, longitude: 181 }).valid, false);
  assert.deepEqual([3.5, 0.5, 10].map(context.fmtKm), ['3,5 км', '500 м', '10 км']);
});
