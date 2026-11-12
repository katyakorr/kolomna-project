// скорее всего где то пять что то не так как расчет общего времени
const app = document.getElementById('app');
let mapInstance = null;
let placesLayer = null;
let routeLayer = null;
let activeRouteId = null;
let currentMapTab = 'routes';
let catalogSeason = '';
let mapSeason = '';
let mapPlaceType = '';

// ---------- вспомогательные функции ----------
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function placeImage(place) {
    return place && (place.image_url || place.photo_url || place.image || place.photo) || '';
}

// Заглушка изображения (или реальное фото)
function media(label, height, src) {
    const img = src ? `<img src="${esc(src)}" alt="${esc(label)}" loading="lazy" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : '';
    return `<div class="media ${src ? 'has-img' : ''}" style="height:${height}px">${img}<span>${esc(label)}</span></div>`;
}

function fmtDuration(min) {
    const m = parseInt(min, 10);
    if (!m) return '—';
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60), rest = m % 60;
    return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}

function fmtKm(km) {
    if (km === null || km === undefined || km === '') return '—';
    return `${String(km).replace('.', ',')} км`;
}

function fmtTime(t) {
    return t ? String(t).slice(0, 5) : '';
}

function distanceM(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function walkText(a, b) {
    const m = Math.round(distanceM(a, b) * 1.2 / 10) * 10;
    const mins = Math.max(1, Math.round(m / 80));
    const dist = m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${m} м`;
    return `≈ ${mins} мин · ${dist}`;
}

function routeCard(r) {
    return `
        <article class="route-card">
            ${media('Обложка маршрута', 215, r.image_url)}
            <div class="tags">${esc(r.category || r.season || 'Маршрут')}</div>
            <h3><a href="#route/${r.id}">${esc(r.name)}</a></h3>
            
            <!-- Разрешаем HTML в описании маршрута на карточке, но обрезаем по словам -->
            <p>${r.description ? r.description.substring(0, 120) + '...' : ''}</p>
            
            <div class="meta">
                ${r.total_minutes ? `<span>◷ ${fmtDuration(r.total_minutes)}</span>` : ''}
                ${r.length_km ? `<span>↗ ${fmtKm(r.length_km)}</span>` : ''}${r.points_count ? `<span>● ${r.points_count} ост.</span>` : ''}
            </div>
            <a class="text-button" href="#route/${r.id}">Подробнее о маршруте ↗</a>
        </article>`;
}

function uniq(list) {
    return [...new Set(list.filter(Boolean))];
}

// ---------- 1. ГЛАВНАЯ ----------
function renderHome() {
    return `
    <div class="wrap">
        <section class="hero">
            <div>
                <div class="eyebrow">Самостоятельные прогулки по Коломне</div>
                <h1>У каждого города<br>есть свои тропы</h1>
                <p>Выберите готовую прогулку или исследуйте достопримечательности на интерактивной карте.</p>
                <a class="button dark" href="#map">Исследовать город <span class="arrow">↗</span></a>
                <div style="margin-top:20px"><a class="text-button" href="#catalog">Выбрать маршрут ↗</a></div>
            </div>
            <div>
                ${media('Главная фотография Коломны', 420, 'media/hero.jpg')}
                <div class="hero-index"><span>Атмосфера города</span><span>01 / Главная</span></div>
            </div>
        </section>

        <section class="section" id="about">
            <div class="about">
                <div><div class="eyebrow">О городе</div><h2>Коломна.<br>В своём темпе.</h2></div>
                <div>
                    <p>Здесь будет небольшой рассказ о Коломне, её атмосфере и местах, ради которых стоит отправиться на прогулку.</p>
                    <p class="small">Текст и фотографии готовит команда. Этот блок помогает заинтересовать городом и перейти к выбору прогулки.</p>
                </div>
            </div>
            <div class="about-media">
                ${media('Фотография города / архитектура', 340, 'media/about-1.jpg')}
                ${media('Деталь / атмосфера', 240, 'media/about-2.jpg')}
            </div>
        </section>

        <section class="section" id="routes">
            <div class="section-head">
                <div>
                    <div class="eyebrow">Готовые прогулки</div>
                    <h2>Какой будет ваша Коломна?</h2>
                    <p>Выберите тему и время, которое хотите провести в городе.</p>
                </div>
                <a class="button light" href="#catalog">Все маршруты <span class="arrow">↗</span></a>
            </div>
            <div class="route-grid" id="home-routes"><p class="empty">Загрузка маршрутов...</p></div>
        </section>

        <section class="cta">
            <div>
                <h3>Хотите выбрать свой путь?</h3>
                <p>Посмотрите все места на карте города.</p>
            </div>
            <a class="button dark" href="#map">Открыть карту <span class="arrow">↗</span></a>
        </section>
    </div>`;
}

// ---------- 2. КАТАЛОГ ----------
function renderCatalog() {
    return `
    <div class="wrap catalog">
        <div class="breadcrumb"><a href="#home">Главная</a> <span>/</span> <span>Маршруты</span></div>
        <div class="catalog-head">
            <div>
                <div class="eyebrow">Коломна / готовые прогулки</div>
                <h1>Маршруты по городу</h1>
                <p class="intro-copy">Выберите прогулку по интересам, времени и сезону.</p>
            </div>
            <a class="text-button" href="#map">Посмотреть на карте ↗</a>
        </div>
        <div class="filter-bar">
            <button class="filter-toggle" id="catalog-filter-toggle">Фильтры ▾</button>
            <span class="filter-found" id="catalog-found">Найдено: …</span>
        </div>
        <div class="filter-panel" id="catalog-filters"></div>
        <div class="route-grid" id="catalog-routes"><p class="empty">Загрузка...</p></div>
    </div>`;
}

// ---------- 3. КАРТА ----------
function renderMap() {
    return `
    <section class="map-page">
        <aside class="map-sidebar">
            <div class="side-top">
                <div class="side-tabs">
                    <button class="${currentMapTab === 'routes' ? 'active' : ''}" onclick="switchMapTab('routes')">Маршруты</button>
                    <button class="${currentMapTab === 'places' ? 'active' : ''}" onclick="switchMapTab('places')">Места</button>
                </div>
                <div class="side-title">
                    <h2 id="map-title">${currentMapTab === 'routes' ? 'Выберите прогулку' : 'Места в городе'}</h2>
                    <button class="filter-toggle" id="map-filter-toggle">Фильтры ▾</button>
                </div>
                <div class="side-filters" id="map-filters"></div>
            </div>
            <div class="side-found" id="map-found"></div>
            <div class="side-list" id="map-sidebar-list"><p class="empty">Загрузка...</p></div>
        </aside>
        <div class="map-crumb" id="map-crumb">Коломна / все места</div>
        <div id="map"></div>
    </section>`;
}

// ---------- 4. СТРАНИЦА МАРШРУТА ----------
async function renderRoutePage(id) {
    app.innerHTML = `<div class="wrap section"><h1>Загрузка маршрута...</h1></div>`;
    const route = await fetchRouteDetails(id);
    if (!route) { app.innerHTML = `<div class="wrap section"><h1>Маршрут не найден</h1><a class="text-button" href="#catalog">Ко всем маршрутам ↗</a></div>`; return; }

    const points = route.points || [];
    const first = points[0], last = points[points.length - 1];
    if (!route.length_km && points.length > 1) {
        let m = 0;
        for (let i = 1; i < points.length; i++) m += distanceM(points[i - 1], points[i]) * 1.2;
        route.length_km = (Math.round(m / 100) / 10);
    }

    const stopsHtml = points.length ? points.map((point, index) => {
        const place = point.place || {};
        const isPartner = place.is_partner === true || /партн/i.test(String(place.place_type || place.type_name || ''));
        const label = index === 0 ? 'Начало прогулки' : (index === points.length - 1 && points.length > 2 ? 'Завершение' : `Остановка ${index + 1}`);
        const time = [fmtTime(point.arrival_time) && `прибытие ${fmtTime(point.arrival_time)}`, point.stay_minutes && `${point.stay_minutes} мин`].filter(Boolean).join(' · ');
        const next = points[index + 1];
        return `
            <article class="stop">
                <div class="stop-number">${index + 1}</div>
                <div class="stop-body">
                    ${media('Фото остановки', 115, placeImage(place))}
                    <div>
                        <div class="stop-time">${esc(label)}${time ? ' · ' + esc(time) : ''}</div>
                        ${isPartner ? '<span class="badge">Партнёр</span>' : ''}
                        <h3>${esc(point.name)}</h3>
                        
                        <!-- Разрешаем HTML в описании остановки, обрезаем для краткости -->
                        ${place.description ? `<div class="rich-text" style="font-size:14px; color:#5b7063;">${place.description.substring(0, 110)}...</div>` : ''}
                        
                        <a class="text-button" href="#place/${point.place_id}">${isPartner ? 'Посмотреть предложение' : 'Подробнее о месте'} ↗</a>
                    </div>
                </div>
                ${next ? `<div class="walk">↓ Пеший переход · ${walkText(point, next)}</div>` : ''}
            </article>`;
    }).join('') : '<p class="empty">В этом маршруте пока нет точек.</p>';

    const yandexUrl = points.length
        ? `https://yandex.ru/maps/?rtext=${points.map(p => `${p.latitude},${p.longitude}`).join('~')}&rtt=pd`
        : '';

    app.innerHTML = `
    <div class="wrap">
        <div class="breadcrumb"><a href="#home">Главная</a> <span>/</span> <a href="#catalog">Маршруты</a> <span>/</span> <span>${esc(route.name)}</span></div>
        <section class="detail-hero">
            <div>
                <div class="eyebrow">${esc(route.category || route.season || 'Маршрут')} / Маршрут</div>
                <h1>${esc(route.name)}</h1>
                
                <!-- HTML в кратком описании маршрута -->
                <div class="lead rich-text">${route.description || ''}</div>
                
                <div class="facts">
                    <div><span class="value">${fmtDuration(route.total_minutes)}</span><span class="label">Длительность</span></div>
                    <div><span class="value">${fmtKm(route.length_km)}</span><span class="label">Расстояние</span></div>
                    <div><span class="value">${points.length}</span><span class="label">Остановок</span></div>
                    <div><span class="value">${esc(route.category || route.season || '—')}</span><span class="label">Тема</span></div>
                </div>
                ${yandexUrl ? `<a class="button dark" href="${yandexUrl}" target="_blank" rel="noopener">Открыть прогулку в Яндекс.Картах <span class="arrow">↗</span></a>
                <p class="hero-note">Пеший маршрут через остановки.</p>` : ''}
            </div>
            ${media('Обложка маршрута', 360, route.image_url)}
        </section>

        <div class="narrow">
            <section class="article-section">
                <div class="eyebrow">Перед прогулкой</div>
                <h2>О маршруте</h2>
                
                <!-- Полный HTML-текст маршрута -->
                <div class="rich-text">
                    ${route.description || 'Подробное описание прогулки появится позже.'}
                </div>
                
                ${first && last ? `
                <div class="start-end">
                    <div><span class="field-label">Начало</span><strong>${esc(first.name)}</strong></div>
                    <div><span class="field-label">Завершение</span><strong>${esc(last.name)}</strong></div>
                </div>` : ''}
            </section>
            <section>
                <div class="eyebrow">Шаг за шагом</div>
                <h2>Что вас ждёт по пути</h2>
                ${stopsHtml}
            </section>
            <div class="route-end">
                <a href="#map" class="button dark" onclick="currentMapTab='routes';pendingRouteId=${Number(route.id)}">Посмотреть на карте города <span class="arrow">↗</span></a>
            </div>
        </div>

        <div class="soft-bar">
            <span>Хотите выбрать другую прогулку?</span>
            <a class="text-button" href="#catalog">Все маршруты ↗</a>
        </div>
    </div>`;
}

// ---------- 5. СТРАНИЦА МЕСТА ----------
async function renderPlacePage(id) {
    app.innerHTML = `<div class="wrap section"><h1>Загрузка...</h1></div>`;
    const place = await fetchPlaceDetails(id);
    if (!place) { app.innerHTML = `<div class="wrap section"><h1>Место не найдено</h1><a class="text-button" href="#map">К карте ↗</a></div>`; return; }

    app.innerHTML = `
    <div class="wrap">
        <div class="breadcrumb"><a href="#map">← К карте</a> <span>/</span> <span>${esc(place.name)}</span></div>
        <section class="detail-hero">
            <div>
                <div class="eyebrow">${esc(place.type_name || place.place_type || 'Достопримечательность')}</div>
                <h1>${esc(place.name)}</h1>
                
                <!-- HTML в кратком описании -->
                <div class="lead rich-text">${place.description || 'Описание пока не добавлено.'}</div>
                
                <p class="field-label">Адрес</p>
                <p class="field-value">${esc(place.address || 'Адрес уточняется')}</p>
                <a href="https://yandex.ru/maps/?text=${encodeURIComponent(place.name + ' Коломна')}" target="_blank" rel="noopener" class="button">Открыть в Яндекс.Картах <span class="arrow">↗</span></a>
            </div>
            ${media('Главная фотография места', 360, placeImage(place))}
        </section>

        <div class="place-body">
            <section class="article-section">
                <div class="eyebrow">Знакомство с местом</div>
                <h2>История и особенности</h2>
                
                <!-- Полный HTML-текст описания места -->
                <div class="rich-text">
                    ${place.description || 'Здесь будет полный текст о выбранном месте.'}
                </div>
                
                <div class="photo-pair">
                    ${media('Фотография / общий план', 190, place.image_2_url)}
                    <div class="fact-card" style="background:var(--green-100); padding:24px; border:1px solid var(--line); display:flex; flex-direction:column; justify-content:center;">
                        <div class="eyebrow" style="margin-bottom:10px;">Интересный факт</div>
                        <div class="rich-text" style="font-size:15px; margin:0; color:var(--green-900); line-height:1.5;">
                            ${place.facts || 'Здесь будет размещен интересный факт об этом месте.'}
                        </div>
                    </div>
                </div>
            </section>

            <section class="article-section">
                <div class="eyebrow">Рассмотреть поближе</div>
                <h2>3D-модель</h2>
                ${place.model_3d ? modelBlock(place.model_3d, 350) : `<div class="model-large">
                    <div>
                        <div class="model-symbol">3D</div>
                        <small>Место для модели достопримечательности</small>
                    </div>
                    <div class="model-actions">
                        <button type="button">Вращение</button>
                        <button type="button">Сбросить вид</button>
                    </div>
                </div>`}
                <p class="model-note">${place.model_3d ? 'Вращайте модель и приближайте её жестами или колесом мыши.' : 'Заглушка модели. В готовой версии: вращение и приближение.'}</p>
            </section>
        </div>

        <section class="place-end">
            <div>
                <div class="eyebrow" style="margin-bottom:12px">Продолжить прогулку</div>
                <h2>Продолжить знакомство с городом</h2>
                <p>Посмотрите другие места и выберите следующую остановку.</p>
            </div>
            <a class="button dark" href="#map">Вернуться к карте города <span class="arrow">↗</span></a>
        </section>
    </div>`;
}

// ---------- ЛОГИКА ДАННЫХ ----------
async function loadHomeRoutes() {
    const routes = await fetchRoutes();
    const container = document.getElementById('home-routes');
    if (!container) return;
    container.innerHTML = routes.length ? routes.slice(0, 3).map(routeCard).join('') : '<p class="empty">Маршруты пока не добавлены.</p>';
}

async function loadCatalogRoutes() {
    const routes = await fetchRoutes();
    const container = document.getElementById('catalog-routes');
    if (!container) return;
    const panel = document.getElementById('catalog-filters');
    const seasons = uniq(routes.map(r => r.category || r.season));

    const draw = () => {
        const list = catalogSeason ? routes.filter(r => (r.category || r.season) === catalogSeason) : routes;
        document.getElementById('catalog-found').textContent = `Найдено: ${list.length}`;
        container.innerHTML = list.length ? list.map(routeCard).join('') : '<p class="empty">По выбранным фильтрам ничего не найдено.</p>';
        panel.innerHTML = [['', 'Все'], ...seasons.map(s => [s, s])]
            .map(([v, label]) => `<button class="chip ${catalogSeason === v ? 'active' : ''}" data-season="${esc(v)}">${esc(label)}</button>`).join('');
        panel.querySelectorAll('.chip').forEach(btn => btn.onclick = () => { catalogSeason = btn.dataset.season; draw(); });
    };
    document.getElementById('catalog-filter-toggle').onclick = () => panel.classList.toggle('open');
    if (catalogSeason) panel.classList.add('open');
    draw();
}

// ---------- ЛОГИКА КАРТЫ ----------
let pendingRouteId = null;

window.switchMapTab = function (tab) {
    currentMapTab = tab;
    document.querySelectorAll('.side-tabs button').forEach((btn, i) => {
        btn.classList.toggle('active', (i === 0 && tab === 'routes') || (i === 1 && tab === 'places'));
    });
    document.getElementById('map-title').textContent = tab === 'routes' ? 'Выберите прогулку' : 'Места в городе';
    clearActiveRoute();
    loadMapSidebar();
};

function pinIcon(label, number) {
    return L.divIcon({
        className: 'custom-pin',
        html: `<div class="pin"><div class="pin-dot ${number ? 'num' : ''}">${number || ''}</div>${label ? `<div class="pin-label">${esc(label)}</div>` : ''}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13]
    });
}

function modelBlock(modelSrc, height) {
    if (modelSrc) {
        return `<model-viewer src="${esc(modelSrc)}" camera-controls auto-rotate touch-action="pan-y" style="width:100%;height:${height}px;background:#f4f4f2"></model-viewer>`;
    }
    return `<div class="popup-3d" style="height:${height}px"><b>3D</b><span>Модель появится позже</span></div>`;
}

function popupHtml(name, id, modelSrc) {
    return `<div class="popup-title">${esc(name)}</div>
        ${modelBlock(modelSrc, 120)}
        <a class="popup-link" href="#place/${id}">Подробнее о месте ↗</a>`;
}

function setCrumb(text) {
    const el = document.getElementById('map-crumb');
    if (el) el.textContent = text;
}

function clearActiveRoute() {
    activeRouteId = null;
    if (routeLayer && mapInstance) { mapInstance.removeLayer(routeLayer); routeLayer = null; }
    if (placesLayer && mapInstance && !mapInstance.hasLayer(placesLayer)) placesLayer.addTo(mapInstance);
    setCrumb('Коломна / все места');
}

async function initMap() {
    mapInstance = L.map('map').setView([55.08, 38.78], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance);
    await drawAllPlacesOnMap();
    await loadMapSidebar();
    if (pendingRouteId) { const id = pendingRouteId; pendingRouteId = null; await showRouteOnMap(id); }
}

async function drawAllPlacesOnMap() {
    const map = mapInstance;
    const places = await fetchPlaces();
    if (!map || map !== mapInstance) return;
    placesLayer = L.layerGroup();
    const bounds = [];
    places.filter(p => p.latitude != null && p.longitude != null).forEach(place => {
        const ll = [Number(place.latitude), Number(place.longitude)];
        L.marker(ll, { icon: pinIcon(place.name) }).bindPopup(popupHtml(place.name, place.id, place.model_3d), { minWidth: 240 }).addTo(placesLayer);
        bounds.push(ll);
    });
    placesLayer.addTo(map);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    else if (bounds.length === 1) map.setView(bounds[0], 15);
}

const walkCache = {};
async function getWalkPath(latlngs) {
    if (latlngs.length < 2) return null;
    const coords = latlngs.map(p => `${p[1]},${p[0]}`).join(';');
    if (walkCache[coords]) return walkCache[coords];
    try {
        const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`);
        if (!res.ok) return null;
        const data = await res.json();
        const geometry = data.routes && data.routes[0] && data.routes[0].geometry;
        if (!geometry) return null;
        return (walkCache[coords] = geometry.coordinates.map(c => [c[1], c[0]]));
    } catch (e) {
        return null;
    }
}

async function showRouteOnMap(routeId) {
    const detail = await fetchRouteDetails(routeId);
    if (!mapInstance) return;
    if (!detail || !detail.points || !detail.points.length) {
        setCrumb('Коломна / в этом маршруте пока нет точек');
        return;
    }
    clearActiveRoute();
    activeRouteId = routeId;
    if (placesLayer) mapInstance.removeLayer(placesLayer);
    routeLayer = L.layerGroup();
    const latlngs = detail.points.map(p => [Number(p.latitude), Number(p.longitude)]);
    const line = L.polyline(latlngs, { color: '#252525', weight: 3, dashArray: '8, 8', opacity: .9 }).addTo(routeLayer);
    const thisLayer = routeLayer;
    getWalkPath(latlngs).then(path => {
        if (path && routeLayer === thisLayer && mapInstance) {
            line.setLatLngs(path);
            mapInstance.fitBounds(L.latLngBounds(path), { padding: [70, 70], maxZoom: 16 });
        }
    });
    detail.points.forEach((p, i) => {
        L.marker(latlngs[i], { icon: pinIcon(p.name, i + 1) }).bindPopup(popupHtml(p.name, p.place_id, p.place && p.place.model_3d), { minWidth: 240 }).addTo(routeLayer);
    });
    routeLayer.addTo(mapInstance);
    mapInstance.fitBounds(latlngs, { padding: [70, 70], maxZoom: 16 });
    setCrumb(`Коломна / ${detail.name}`);
    document.querySelectorAll('.side-card[data-route]').forEach(c => c.classList.toggle('active', c.dataset.route == routeId));
}

async function loadMapSidebar() {
    const listContainer = document.getElementById('map-sidebar-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<p class="empty">Загрузка...</p>';
    const filtersBox = document.getElementById('map-filters');
    document.getElementById('map-filter-toggle').onclick = () => filtersBox.classList.toggle('open');

    const isPlaces = currentMapTab === 'places';
    const items = isPlaces ? await fetchPlaces() : await fetchRoutes();
    if (!document.getElementById('map-sidebar-list')) return;

    const keyOf = i => isPlaces ? (i.type_name || i.place_type) : (i.category || i.season);
    const options = uniq(items.map(keyOf));
    const selected = isPlaces ? mapPlaceType : mapSeason;

    filtersBox.innerHTML = options.length
        ? [['', 'Все'], ...options.map(o => [o, o])].map(([v, l]) => `<button class="chip ${selected === v ? 'active' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')
        : '';
    filtersBox.querySelectorAll('.chip').forEach(btn => btn.onclick = () => {
        if (isPlaces) mapPlaceType = btn.dataset.v; else mapSeason = btn.dataset.v;
        loadMapSidebar();
    });

    const list = selected ? items.filter(i => keyOf(i) === selected) : items;
    document.getElementById('map-found').textContent = isPlaces ? `Найдено мест: ${list.length}` : `Найдено маршрутов: ${list.length}`;
    listContainer.innerHTML = '';
    if (!list.length) { listContainer.innerHTML = '<p class="empty">Ничего не найдено.</p>'; return; }

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'side-card';
        if (isPlaces) {
            card.innerHTML = `
                ${media('Фото', 68, placeImage(item))}
                <div>
                    <h3>${esc(item.name)}</h3>
                    <p>${esc(item.type_name || item.place_type || 'Место')}</p>
                    <a class="text-button" href="#place/${item.id}">Подробнее о месте ↗</a>
                </div>`;
            card.onclick = (e) => {
                if (e.target.closest('a')) return;
                if (item.latitude != null) mapInstance.flyTo([Number(item.latitude), Number(item.longitude)], 16);
            };
        } else {
            card.dataset.route = item.id;
            if (String(item.id) === String(activeRouteId)) card.classList.add('active');
            card.innerHTML = `
                ${media('Обложка', 68, item.image_url)}
                <div>
                    <h3>${esc(item.name)}</h3>
                    <p>${[item.total_minutes ? fmtDuration(item.total_minutes) : '', fmtKm(item.length_km)].filter(x => x && x !== '—').join(' · ') || esc(item.season || '')}</p>
                    <button class="text-button" type="button">Показать на карте ↗</button>
                    <a class="text-button" href="#route/${item.id}" style="margin-left:12px">Подробнее ↗</a>
                </div>`;
            card.onclick = async (e) => {
                if (e.target.closest('a')) return;
                document.querySelectorAll('.side-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                await showRouteOnMap(item.id);
            };
        }
        listContainer.appendChild(card);
    });
}

// ---------- РОУТИНГ ----------
function setActiveNav(name) {
    document.querySelectorAll('#site-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
}

function router() {
    const hash = window.location.hash || '#home';
    if (mapInstance) { mapInstance.remove(); mapInstance = null; placesLayer = null; routeLayer = null; activeRouteId = null; }
    document.body.classList.toggle('is-map', hash === '#map');

    if (hash.startsWith('#place/')) {
        setActiveNav('map');
        renderPlacePage(hash.split('/')[1]);
        window.scrollTo(0, 0);
    } else if (hash.startsWith('#route/')) {
        setActiveNav('catalog');
        renderRoutePage(hash.split('/')[1]);
        window.scrollTo(0, 0);
    } else if (hash === '#map') {
        setActiveNav('map');
        app.innerHTML = renderMap();
        initMap();
        window.scrollTo(0, 0);
    } else if (hash === '#catalog') {
        setActiveNav('catalog');
        app.innerHTML = renderCatalog();
        loadCatalogRoutes();
        window.scrollTo(0, 0);
    } else {
        const toAbout = hash === '#about' || hash === '#home/about';
        setActiveNav(toAbout ? 'about' : '');
        app.innerHTML = renderHome();
        loadHomeRoutes();
        if (toAbout) document.getElementById('about').scrollIntoView(); else window.scrollTo(0, 0);
    }
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);
