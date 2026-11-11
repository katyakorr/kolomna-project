
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const placesRouter = require('./routes/places');
const routesRouter = require('./routes/routes');

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
app.use(express.static(path.join(__dirname, '../frontend')));

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
