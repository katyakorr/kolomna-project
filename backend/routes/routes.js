const express = require('express');
const router = express.Router();
const pool = require('../db');

// Получить все маршруты
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM route');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить один маршрут с точками и ВЫЧИСЛЕННЫМ общим временем
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Получаем маршрут
    const routeResult = await pool.query('SELECT * FROM route WHERE id = $1', [id]);
    if (routeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Маршрут не найден' });
    }

    // 2. Получаем точки маршрута
    const pointsResult = await pool.query(`
      SELECT rp.order_number, rp.arrival_time, rp.stay_minutes, 
             p.id as place_id, p.name, p.latitude, p.longitude
      FROM route_point rp
      JOIN place p ON rp.place_id = p.id
      WHERE rp.route_id = $1
      ORDER BY rp.order_number ASC
    `, [id]);

    const route = routeResult.rows[0];
    route.points = pointsResult.rows;

    // 3. СЧИТАЕМ ОБЩЕЕ ВРЕМЯ: суммируем все stay_minutes
    let total = 0;
    route.points.forEach(point => {
        if (point.stay_minutes) total += parseInt(point.stay_minutes);
    });
    
    route.total_minutes = total; // Добавляем это поле в ответ

    res.json(route);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;