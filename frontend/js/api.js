// Базовый URL API: если страница открыта через сервер Express — относительный путь,
// если открыта как файл (file://) — обращаемся на localhost:3000
const API_URL = location.protocol.startsWith('http') ? '/api' : 'http://localhost:3000/api';

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
    const url = type ? `${API_URL}/places?type=${encodeURIComponent(type)}` : `${API_URL}/places`;
    return getJson(url, [], 'места').then(r => r || []);
}

// Функция для получения деталей одного места
function fetchPlaceDetails(id) {
    return getJson(`${API_URL}/places/${id}`, null, 'место');
}

// Функция для получения маршрутов (с учетом сезона)
function fetchRoutes(season = '') {
    const url = season ? `${API_URL}/routes?season=${encodeURIComponent(season)}` : `${API_URL}/routes`;
    return getJson(url, [], 'маршруты').then(r => r || []);
}

// Загружает один маршрут с точками
function fetchRouteDetails(id) {
    return getJson(`${API_URL}/routes/${id}`, null, 'маршрут');
}
