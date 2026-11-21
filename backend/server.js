
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const placesRouter = require('./routes/places');
const routesRouter = require('./routes/routes');
const { bySlug } = require('./models');
const vendorAssets = require('./vendor-assets');
const { qrPath, hotelQr } = require('./hotel-qr');

const app = express();
const PORT = process.env.PORT || 3000;

// Подключение middleware
app.use(cors());
app.use(express.json());

// API достопримечательностей
app.use('/api/places', placesRouter);

// API маршрутов
app.use('/api/routes', routesRouter);

// Проверка работы сервера
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Сервер работает'
  });
});

// Подключение Frontend
// Only approved GLBs are public. Keep the original model and review images in
// one location, without exposing .blend files or temporary preview scripts.
app.get('/media/models/:slug.glb', (req, res) => {
  const asset = bySlug.get(req.params.slug);
  if (!asset) return res.sendStatus(404);
  res.type('model/gltf-binary').sendFile(asset.file, { maxAge: '1h' });
});
app.get('/vendor/model-viewer.min.js', (req, res) => {
  res.sendFile(require.resolve('@google/model-viewer/dist/model-viewer.min.js'), { maxAge: '1d' });
});
for (const [name, file] of Object.entries(vendorAssets)) {
  app.get(`/vendor/${name}`, (req, res) => res.sendFile(file, { maxAge: '1d' }));
}
app.get(`/${qrPath}`, (req, res) => res.type('image/svg+xml').send(hotelQr()));
app.use(express.static(path.join(__dirname, '../frontend')));

// Запуск сервера
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
  });
}

module.exports = app;
