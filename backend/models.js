const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Match names rather than database IDs: the project dump and older databases
// use different IDs for the same places. The cafe shares the Kalachnaya asset.
const definitions = [
  ['kolomenskaya-pastila', 'Музей «Коломенская пастила»', ['Музей «Коломенская пастила»']],
  ['pastila-factory', 'Музейная фабрика пастилы', ['Музейная фабрика «Коломенская пастила»', 'Музейная фабрика пастилы']],
  ['marinkina-tower', 'Маринкина башня и стена кремля', ['Коломенский кремль', 'Стены Коломенского кремля', 'Маринкина (Коломенская) башня', 'Маринкина башня'], 'marinkina-tower-v2', 'preview.png'],
  ['kalachnaya', 'Музей «Калачная»', ['Музей «Калачная»', 'Кофейня при музее «Калачная»']],
  ['kuznechnaya-sloboda', 'Музей «Кузнечная слобода»', ['Музей «Кузнечная слобода»']],
  ['staro-golutvin', 'Старо-Голутвин монастырь', ['Старо-Голутвин монастырь', 'Богоявленский Старо-Голутвин монастырь']],
  ['toy-museum', 'Музей любимой игрушки', ['Музей любимой игрушки']],
  ['flood-scale', 'Шкала уровней паводковых вод', ['Шкала уровней паводковых вод']],
  ['dom-samovara', 'Музей «Дом самовара»', ['Музей «Дом самовара»']],
  ['artkommunalka', 'Музей-резиденция «Арткоммуналка»', ['Музей-резиденция «Арткоммуналка»']],
  ['organic-culture', 'Музей органической культуры', ['Музей органической культуры']],
  ['kolomensky-patefon', 'Музей «Коломенский патефон»', ['Музей «Коломенский патефон»']],
  ['lazhechnikov-estate', 'Усадьба купцов Лажечниковых', ['Усадьба купцов Лажечниковых']],
  ['dushistye-radosti', 'Музей мыла «Душистыя радости»', ['Музей мыла «Душистыя радости»', 'Музей «Душистыя радости»']],
  ['rulki-vverh', 'Бистро «Рульки вверх»', ['Бистро «Рульки вверх»', 'Ресторан-пивное бистро «Рульки вверх»']],
  ['kolomna-hotel', 'Гостиница «Коломна»', ['Гостиница «Коломна»']]
];

function normalizeName(name) {
  return String(name || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const root = path.join(__dirname, '../artifacts/3d');
const posterRoot = path.join(__dirname, '../frontend/media/model-posters');
const assets = definitions.map(([slug, label, names, directory = slug, poster = 'view-1.png']) => {
  const file = path.join(root, directory, `${slug}.glb`);
  const version = createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  return {
    slug, label, names, file, version,
    bytes: fs.statSync(file).size,
    posterSource: path.join(root, directory, poster),
    posterFile: path.join(posterRoot, `${slug}.webp`),
    src: `/media/models/${slug}.glb?v=${version}`,
    poster: `/media/model-posters/${slug}.webp?v=${version}`
  };
});
const bySlug = new Map(assets.map(asset => [asset.slug, asset]));
const byName = new Map(assets.flatMap(asset => asset.names.map(name => [normalizeName(name), asset])));

function withModel(place) {
  const asset = byName.get(normalizeName(place.name));
  return {
    ...place,
    model_3d: asset?.src || null,
    model_poster: asset?.poster || null,
    model_label: asset?.label || null,
    model_bytes: asset?.bytes || null
  };
}

module.exports = { assets, bySlug, withModel };
