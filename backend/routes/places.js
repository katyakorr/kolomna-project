
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Получить все достопримечательности
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM place
      ORDER BY id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения достопримечательностей:', error);
    res.status(500).json({
      error: 'Не удалось получить достопримечательности'
    });
  }
});

// Получить одну достопримечательность по ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM place WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Достопримечательность не найдена'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка получения достопримечательности:', error);
    res.status(500).json({
      error: 'Ошибка сервера'
    });
  }
});

module.exports = router;
