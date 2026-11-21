const express = require('express');
const router = express.Router();
const pool = require('../db');
const { placeData, queryValue } = require('../site-data');

const selectPlace = 'SELECT p.*, pt.name AS type_name FROM place p LEFT JOIN place_type pt ON pt.id = p.place_type_id';

router.get('/', async (req, res) => {
  try {
    const type = queryValue(req.query.type ?? req.query.category);
    const filter = type === 'museum' ? 'музей' : type;
    const result = await pool.query(`${selectPlace}
      WHERE $1 = '' OR lower(pt.name) = $1 OR p.place_type_id::text = $1
      ORDER BY p.id`, [filter]);
    res.json(result.rows.map(placeData));
  } catch (error) {
    console.error('Ошибка получения достопримечательностей:', error);
    res.status(500).json({ error: 'Не удалось получить достопримечательности' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`${selectPlace} WHERE p.id = $1`, [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Достопримечательность не найдена' });
    }
    res.json(placeData(result.rows[0]));
  } catch (error) {
    console.error('Ошибка получения достопримечательности:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
