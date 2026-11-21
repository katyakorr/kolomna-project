const express = require('express');
const router = express.Router();
const pool = require('../db');
const { placeData, routeData, queryValue } = require('../site-data');

const ROUTES_TTL_MS = 10_000;
const seasonAliases = new Map([
  ['summer', 'летний'], ['winter', 'зимний'], ['spring', 'весенний'], ['autumn', 'осенний']
]);

let routeList, expiresAt = 0, pendingList;

function listRoutes() {
  if (Date.now() < expiresAt) return routeList;
  if (!pendingList) {
    pendingList = pool.query(`
      SELECT r.*, rc.name AS category,
             COUNT(rp.place_id)::int AS points_count,
             COALESCE(SUM(rp.stay_minutes), 0)::int AS total_minutes
      FROM route r
      LEFT JOIN route_category rc ON rc.id = r.route_category_id
      LEFT JOIN route_point rp ON rp.route_id = r.id
      GROUP BY r.id, rc.name
      ORDER BY r.id
    `).then(({ rows }) => {
      routeList = rows.map(routeData);
      expiresAt = Date.now() + ROUTES_TTL_MS;
      return routeList;
    }).finally(() => { pendingList = null; });
  }
  return pendingList;
}

router.get('/', async (req, res) => {
  try {
    const requested = queryValue(req.query.season);
    const season = seasonAliases.get(requested) ?? requested;
    const routes = await listRoutes();
    res.json(season ? routes.filter(route => queryValue(route.season) === season) : routes);
  } catch (error) {
    console.error('Ошибка получения маршрутов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const routeResult = await pool.query(`SELECT r.*, rc.name AS category FROM route r
      LEFT JOIN route_category rc ON rc.id = r.route_category_id WHERE r.id = $1`, [id]);
    if (!routeResult.rows.length) return res.status(404).json({ error: 'Маршрут не найден' });

    const pointsResult = await pool.query(`
      SELECT rp.order_number, rp.arrival_time, rp.stay_minutes, p.id AS place_id, p.name,
             to_jsonb(p) || jsonb_build_object('type_name', pt.name) AS place
      FROM route_point rp
      JOIN place p ON p.id = rp.place_id
      LEFT JOIN place_type pt ON pt.id = p.place_type_id
      WHERE rp.route_id = $1
      ORDER BY rp.order_number
    `, [id]);
    const points = pointsResult.rows.map(point => {
      const place = placeData(point.place);
      return { ...point, latitude: place.latitude, longitude: place.longitude, place };
    });
    res.json({
      ...routeData(routeResult.rows[0]),
      points,
      points_count: points.length,
      total_minutes: points.reduce((sum, point) => sum + (point.stay_minutes || 0), 0)
    });
  } catch (error) {
    console.error('Ошибка получения маршрута:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
