// Базовый URL API: если страница открыта через сервер Express — относительный путь,
// если открыта как файл (file://) — обращаемся на localhost:3000
const API_URL = location.protocol.startsWith('http') ? '/api' : 'http://localhost:3000/api';
const STATIC_PREVIEW = window.SITE_CONFIG?.dataMode === 'static';
let siteSnapshotRequest = null;

function fetchSiteSnapshot() {
    if (!siteSnapshotRequest) {
        siteSnapshotRequest = getJson('data/site.json', null, 'данные сайта').then(data => {
            if (!data) siteSnapshotRequest = null;
            return data;
        });
    }
    return siteSnapshotRequest;
}

// Загрузка JSON с повторами: облачная БД иногда отвечает не с первого раза.
// 404 — это «нет такого», его не повторяем. При полном провале возвращаем fallback.
async function getJson(url, fallback, label) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const response = await fetch(url);
            if (response.status === 404) return null;
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return await response.json();
        } catch (error) {
            lastError = error;
            await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
    }
    console.error(`Ошибка при загрузке (${label}):`, lastError);
    return fallback;
}

// Функция для получения всех мест (с учетом фильтра)
function fetchPlaces(type = '') {
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => (data?.places || [])
        .filter(place => !type || place.type_name === type || String(place.place_type_id) === String(type)));
    const url = type ? `${API_URL}/places?type=${encodeURIComponent(type)}` : `${API_URL}/places`;
    return getJson(url, [], 'места').then(r => r || []);
}

// Функция для получения деталей одного места
function fetchPlaceDetails(id) {
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => {
        const place = data?.places.find(item => String(item.id) === String(id));
        return place ? { ...place } : null;
    });
    return getJson(`${API_URL}/places/${id}`, null, 'место');
}

// Функция для получения маршрутов (с учетом сезона)
function fetchRoutes(season = '') {
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => (data?.routes || [])
        .filter(route => !season || route.season === season || route.category === season));
    const url = season ? `${API_URL}/routes?season=${encodeURIComponent(season)}` : `${API_URL}/routes`;
    return getJson(url, [], 'маршруты').then(r => r || []);
}

// Загружает один маршрут с точками
function fetchRouteDetails(id) {
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => {
        const route = data?.routes.find(item => String(item.id) === String(id));
        return route ? { ...route, points:route.points.map(point => ({ ...point, place:{ ...point.place } })) } : null;
    });
    return getJson(`${API_URL}/routes/${id}`, null, 'маршрут');
}
