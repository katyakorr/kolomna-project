const API_URL = location.protocol.startsWith('http') ? '/api' : 'http://localhost:3000/api';
const STATIC_PREVIEW = window.SITE_CONFIG?.dataMode === 'static';
let siteSnapshotRequest = null;

function fetchSiteSnapshot() {
    if (!siteSnapshotRequest) {
        // The static snapshot carries both lists and all details in one download.
        siteSnapshotRequest = getJson('data/site.json', 20_000).then(data => {
            if (!data) throw new Error('Нет файла данных сайта');
            return data;
        }).catch(error => {
            siteSnapshotRequest = null;
            throw error;
        });
    }
    return siteSnapshotRequest;
}

async function getJson(url, timeout = 8000) {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
            if (response.status === 404) return null;
            if (response.ok) return await response.json();
            throw new RequestError(response.status);
        } catch (error) {
            if (attempt || error.name === 'TimeoutError' || (error.status && error.status < 500)) throw error;
            await new Promise(resolve => setTimeout(resolve, 400));
        }
    }
}

class RequestError extends Error {
    constructor(status) {
        super('HTTP ' + status);
        this.status = status;
    }
}

function fetchPlaces(type = '') {
    const key = String(type ?? '').trim().toLowerCase();
    const filter = key === 'museum' ? 'музей' : key;
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => data.places.filter(place =>
        !filter || place.type_name?.toLowerCase() === filter || String(place.place_type_id) === filter));
    const url = type ? `${API_URL}/places?type=${encodeURIComponent(type)}` : `${API_URL}/places`;
    return getJson(url).then(data => data || []);
}

function fetchPlaceDetails(id) {
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => {
        const place = data.places.find(item => String(item.id) === String(id));
        return place ? { ...place } : null;
    });
    return getJson(`${API_URL}/places/${encodeURIComponent(id)}`);
}

const seasonLabels = { 'Летний': 'Лето', 'Зимний': 'Зима', 'Весенний': 'Весна', 'Осенний': 'Осень' };
const seasonKeys = { summer: 'летний', winter: 'зимний', spring: 'весенний', autumn: 'осенний' };

function fetchRoutes(season = '') {
    const key = String(season ?? '').trim().toLowerCase();
    const filter = Object.hasOwn(seasonKeys, key) ? seasonKeys[key] : key;
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => data.routes.filter(route =>
        !filter || route.season?.toLowerCase() === filter));
    const url = season ? `${API_URL}/routes?season=${encodeURIComponent(season)}` : `${API_URL}/routes`;
    return getJson(url).then(data => data || []);
}

function fetchRouteDetails(id) {
    if (STATIC_PREVIEW) return fetchSiteSnapshot().then(data => {
        const route = data.routes.find(item => String(item.id) === String(id));
        return route ? { ...route, points: route.points.map(point => ({ ...point, place: { ...point.place } })) } : null;
    });
    return getJson(`${API_URL}/routes/${encodeURIComponent(id)}`);
}
