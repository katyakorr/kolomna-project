const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

// Новые версии pg считают sslmode=require в ссылке за verify-full и ИГНОРИРУЮТ настройку ssl ниже —
// из-за этого Aiven даёт "self-signed certificate in certificate chain". Убираем sslmode из ссылки,
// а SSL задаём явно.
function cleanConnectionString(raw) {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'].forEach(k => url.searchParams.delete(k));
    return url.toString();
  } catch (e) {
    return raw;
  }
}

// Если скачали CA-сертификат Aiven (ca.pem) — укажите путь в .env: DB_CA_PATH=./ca.pem (проверка включится).
// Без него соединение шифруется, но сертификат не проверяется (для учебного проекта это нормально).
const ssl = process.env.DB_CA_PATH
  ? { ca: fs.readFileSync(process.env.DB_CA_PATH, 'utf8'), rejectUnauthorized: true }
  : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: cleanConnectionString(process.env.DATABASE_URL),
  ssl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // облачная БД может «просыпаться» несколько секунд
  keepAlive: true
});

// Облачные БД сами обрывают простаивающие соединения. Без этого обработчика процесс падает.
pool.on('error', err => console.error('Соединение с БД оборвано (будет создано заново):', err.message));

// Повтор запроса при временных сбоях соединения
const TRANSIENT = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', '57P01', '08006', '08001', '08003'];
const isTransient = e => TRANSIENT.includes(e.code) || /Connection terminated|timeout|ECONNRESET/i.test(e.message || '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rawQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await rawQuery(...args);
    } catch (e) {
      lastError = e;
      if (!isTransient(e)) throw e;
      console.warn(`Запрос к БД не удался (${e.message}), повтор ${attempt + 1}/3`);
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
};

// Проверка подключения к базе данных
pool.connect()
  .then(client => {
    console.log('PostgreSQL: подключение успешно!');
    client.release();
  })
  .catch(error => {
    console.error('Ошибка подключения к PostgreSQL:', error.message);
  });

module.exports = pool;
