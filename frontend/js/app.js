const app = document.getElementById('app');
let mapInstance = null;
let placesLayer = null;
let routeLayer = null;
let activeRouteId = null;
let activeRouteDetail = null;
let currentMapTab = 'routes';
const catalogFilters = { category: '', season: '', duration: '' };
let mapSeason = '';
let mapPlaceType = '';
let pendingPlaceId = null;
let mapResizeObserver = null;
let routeRequest = 0;
let sidebarRequest = 0;
let mapQuery = '';
const mapQueries = { routes: '', places: '' };
let mapView = 'map';
let mapPlaces = [];
let hotelOrigin = null;
let hotelLayer = null;
let focusedPlace = null;
let homePreview = null;
let homePreviewObserver = null;
let pageVersion = 0;

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
    const distance = Number(km);
    if (!Number.isFinite(distance) || distance < 0) return '—';
    return distance < 1 && Math.round(distance * 1000) < 1000
        ? `${Math.round(distance * 1000)} м`
        : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(distance)} км`;
}

function validateCoordinates(point) {
    const pair = [point.latitude, point.longitude].map(value =>
        typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN);
    return Math.abs(pair[0]) <= 90 && Math.abs(pair[1]) <= 180
        ? { valid: true, pair }
        : { valid: false, code: 'INVALID_COORDINATES' };
}

function coordinates(point) {
    return validateCoordinates(point).pair ?? null;
}

function loadError(container, retry, error) {
    const message = error?.name === 'TimeoutError' ? 'Сервер не ответил вовремя.' : 'Не удалось загрузить данные.';
    container.innerHTML = `<div class="load-error"><p role="alert">${message}</p><button type="button" class="button">Повторить</button></div>`;
    container.querySelector('button').onclick = retry;
}

function distanceM(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function routeImage(route) {
    return route.image_url || '';
}

function excerpt(html, length = 120) {
    const text = String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return esc(text.length > length ? text.slice(0, length).trimEnd() + '…' : text);
}

function metaIcon(name) {
    const paths = {
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
        pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
        star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" fill="currentColor"/>'
    };
    return `<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${paths[name]}</svg>`;
}

function routeCard(r) {
    return `<article class="route-card">
        <a class="route-cover" href="#route/${r.id}" aria-label="${esc(r.name)}">${media(r.name, 215, routeImage(r))}</a>
        <div class="route-card-body">
            <div class="tags">${esc(r.category || r.season || 'Маршрут')}</div>
            <h3><a href="#route/${r.id}">${esc(r.name)}</a></h3>
            <p>${excerpt(r.description)}</p>
            <div class="meta">
                ${r.total_minutes ? `<span>${metaIcon('clock')} ${fmtDuration(r.total_minutes)}</span>` : ''}
                ${r.length_km ? `<span>${metaIcon('pin')} ${fmtKm(r.length_km)}</span>` : ''}
                ${r.points_count ? `<span>${metaIcon('star')} ${r.points_count} ост.</span>` : ''}
            </div>
            <a class="button route-details" href="#route/${r.id}">Подробнее о маршруте</a>
        </div>
    </article>`;
}

function mapCta() {
    return `<section class="cta"><div><h3>Хотите выбрать свой путь?</h3><p>Посмотрите все маршруты на карте города.</p></div><a class="button dark" href="#map">Открыть карту</a></section>`;
}

function uniq(list) {
    return [...new Set(list.filter(Boolean))];
}

// ---------- 1. ГЛАВНАЯ ----------
function renderHome() {
    return `<section class="hero"><div class="wrap hero-content">
        <h1>Готовы услышать,<br>что расскажет<br>Коломна?</h1>
        <p>Мы прокладываем маршрут —<br>вы делаете открытия</p>
        <a class="button dark" href="#catalog">Выбрать маршрут</a>
    </div></section>
    <div class="wrap home-content">
        <section class="hotel-welcome" id="hotel-welcome" hidden></section>
        <section class="home-routes" aria-label="Готовые прогулки"><div class="route-grid" id="home-routes"><p class="empty" role="status">Загрузка маршрутов…</p></div></section>
        <section class="section about" id="about"><div>
            <div class="eyebrow">О городе</div><h2>Коломна.<br>В своём темпе.</h2>
            <p>Старинный город на берегу Оки, где история встречается с уютом, а каждая улица хранит особенную атмосферу.</p>
        </div>${media('Вход на музейную фабрику коломенской пастилы', 350, 'media/about-1.jpg')}</section>
        <div class="city-panorama">${media('Старо-Голутвин монастырь в Коломне', 520, 'media/photos/mesto6_1.jpeg')}</div>
        <div id="home-map-preview" aria-label="Обзор карты Коломны"></div>
        ${mapCta()}
    </div>`;
}

// ---------- 2. КАТАЛОГ ----------
function renderCatalog() {
    return `<div class="wrap catalog">
        <div class="catalog-head"><div><h1>Маршруты по городу</h1><p class="intro-copy">Выберите прогулку по интересам, времени и сезону.</p></div>
            <a class="button dark" href="#map">Посмотреть на карте</a></div>
        <div class="filter-bar"><button class="filter-toggle" id="catalog-filter-toggle" aria-expanded="true" aria-controls="catalog-filters">Фильтры</button><span class="filter-found" id="catalog-found" role="status">Найдено: …</span></div>
        <div class="filter-panel open" id="catalog-filters"></div>
        <div class="route-grid" id="catalog-routes"><p class="empty" role="status">Загрузка…</p></div>
    </div>`;
}

// ---------- 3. КАРТА ----------
function renderMap() {
    mapView = 'map';
    return `<div class="map-workspace" data-view="map"><div class="map-intro"><h1>Карта Коломны</h1><div class="map-view-switch" aria-label="Вид карты"><button type="button" data-map-view="map" aria-pressed="true" onclick="setMapView('map')">Карта</button><button type="button" data-map-view="list" aria-pressed="false" onclick="setMapView('list')">Список</button></div><div class="map-tools"><button type="button" class="text-link" onclick="resetMap()">Все места</button><button class="button hotel-route-button" id="hotel-route-button" type="button" hidden>Маршрут от отеля</button><button class="map-expand" type="button" aria-pressed="false" onclick="toggleMapExpanded(this)">Скрыть список</button></div></div>
    <section class="map-page" aria-label="Интерактивная карта Коломны">
        <aside class="map-sidebar" aria-label="Выбор маршрутов и мест"><div class="side-top">
            <div class="side-tabs" role="group" aria-label="Что показать"><button class="${currentMapTab === 'routes' ? 'active' : ''}" aria-pressed="${currentMapTab === 'routes'}" onclick="switchMapTab('routes')">Маршруты</button><button class="${currentMapTab === 'places' ? 'active' : ''}" aria-pressed="${currentMapTab === 'places'}" onclick="switchMapTab('places')">Места и 3D</button></div>
            <label class="map-search"><span class="sr-only">Поиск маршрута или места</span><input id="map-search" type="search" placeholder="Название места или прогулки" autocomplete="off" value="${esc(mapQuery)}"></label>
            <div class="side-title"><h2 id="map-title">${currentMapTab === 'routes' ? 'Готовые прогулки' : 'Достопримечательности'}</h2><button class="filter-toggle" id="map-filter-toggle" aria-expanded="${Boolean(currentMapTab === 'places' ? mapPlaceType : mapSeason)}" aria-controls="map-filters">Фильтры</button></div><div class="side-filters ${(currentMapTab === 'places' ? mapPlaceType : mapSeason) ? 'open' : ''}" id="map-filters"></div><div class="side-found" id="map-found" role="status"></div></div>
            <div class="side-list" id="map-sidebar-list"><p class="empty">Загрузка…</p></div>
        </aside>
        <div class="map-main"><div class="map-canvas"><div class="map-crumb" id="map-crumb">Коломна / все места</div><div id="map" aria-label="Места и маршруты на карте"></div><div class="map-messages"><p id="map-tile-error" role="status" hidden></p><div id="map-data-error" hidden></div></div><div class="map-route-note" id="map-route-note" role="status" hidden></div></div></div>
    </section></div>`;
}

function setMapView(view) {
    mapView = view;
    const workspace = document.querySelector('.map-workspace');
    if (!workspace) return;
    workspace.dataset.view = view;
    workspace.querySelectorAll('[data-map-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mapView === view)));
    if (view === 'map') requestAnimationFrame(() => mapInstance?.invalidateSize());
}

function toggleMapExpanded(button) {
    const expanded = document.querySelector('.map-workspace').classList.toggle('map-expanded');
    button.setAttribute('aria-pressed', String(expanded));
    button.textContent = expanded ? 'Показать список' : 'Скрыть список';
    requestAnimationFrame(() => {
        if (!mapInstance) return;
        mapInstance.invalidateSize();
        if (!routeLayer) return;
        const bounds = L.latLngBounds([]);
        routeLayer.eachLayer(layer => { if (layer.getBounds) bounds.extend(layer.getBounds()); });
        if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [45, 45], maxZoom: 16, animate: false });
    });
}

async function resetMap() {
    mapQuery = ''; mapQueries.routes = ''; mapQueries.places = ''; mapSeason = ''; mapPlaceType = '';
    const input = document.getElementById('map-search');
    if (input) input.value = '';
    clearActiveRoute();
    drawAllPlacesOnMap();
    await loadMapSidebar();
}

// ---------- 4. СТРАНИЦА МАРШРУТА ----------
async function renderRoutePage(id) {
    app.innerHTML = `<div class="wrap section"><h1>Загрузка маршрута...</h1></div>`;
    const version = pageVersion;
    let route;
    try {
        route = await fetchRouteDetails(id);
    } catch (error) {
        if (version === pageVersion) loadError(app.querySelector('.section'), () => renderRoutePage(id), error);
        return;
    }
    if (version !== pageVersion || !document.body.matches('[data-page=route]') || window.location.hash.split('/')[1] !== String(id)) return;
    if (!route) { app.innerHTML = `<div class="wrap section"><h1>Маршрут не найден</h1><a class="text-button" href="#catalog">Ко всем маршрутам</a></div>`; return; }

    const points = route.points || [];
    const first = points[0], last = points[points.length - 1];

    if (!route.length_km && points.length > 1) {
        let m = 0;
        if (points.every(coordinates)) {
            for (let i = 1; i < points.length; i++) m += distanceM(points[i - 1], points[i]) * 1.2;
            route.length_km = Math.round(m / 100) / 10;
        }
    }

    const stopsHtml = points.length ? points.map((point, index) => {
        const place = point.place || {};
        const isPartner = place.is_partner === true || /партн/i.test(String(place.place_type || place.type_name || ''));
        const label = index === 0 ? 'Начало прогулки' : (index === points.length - 1 && points.length > 2 ? 'Завершение' : `Остановка ${index + 1}`);

        const time = point.stay_minutes ? `На осмотр: ${point.stay_minutes} мин` : '';

        const next = points[index + 1];
        return `
            <article class="stop">
                <div class="stop-number">${index + 1}</div>
                <div class="stop-body">
                    ${media('Фото остановки', 115, placeImage(place))}
                    <div>
                        <div class="stop-time">${esc(label)}${point.arrival_time ? ' · ' + esc(point.arrival_time.slice(0, 5)) : ''}${time ? ' · ' + esc(time) : ''}</div>
                        ${isPartner ? '<span class="badge">Партнёр</span>' : ''}
                        <h3>${esc(point.name)}</h3>${place.model_3d ? `<a class="model-badge" href="#place/${point.place_id}/3d">Смотреть в 3D</a>` : ''}

                        ${place.description ? `<div class="rich-text stop-description">${excerpt(place.description, 110)}</div>` : ''}

                        <a class="text-button" href="#place/${point.place_id}">${isPartner ? 'Посмотреть предложение' : 'Подробнее о месте'}</a>
                    </div>
                </div>
                ${next ? `<div class="walk">Пеший переход</div>` : ''}
            </article>`;
    }).join('') : '<p class="empty">В этом маршруте пока нет точек.</p>';

    const stops = points.map(coordinates);
    const yandexUrl = stops.length && stops.every(Boolean)
        ? `https://yandex.ru/maps/?rtext=${stops.join('~')}&rtt=pd`
        : '';

    app.innerHTML = `
    <div class="wrap route-detail">
        <div class="breadcrumb"><a href="#home">Главная</a> <span>/</span> <a href="#catalog">Маршруты</a> <span>/</span> <span>${esc(route.name)}</span></div>
        <section class="detail-hero">
            <div>
                <div class="eyebrow">${esc(route.category || route.season || '')} маршрут</div>
                <h1>${esc(route.name)}</h1>

                <div class="lead rich-text">${route.description || ''}</div>

                <div class="facts">
                    <div><span class="value">${fmtDuration(route.total_minutes)}</span><span class="label">Длительность</span></div>
                    <div><span class="value">${fmtKm(route.length_km)}</span><span class="label">Расстояние</span></div>
                    <div><span class="value">${points.length}</span><span class="label">Остановок</span></div>
                    <div><span class="value">${esc(route.category || route.season || '—')}</span><span class="label">Тема</span></div>
                </div>

                <div class="route-actions" role="group" aria-label="Начать прогулку">
                    <a class="button dark" href="#map" onclick="selectMapTab('routes');pendingRouteId=${Number(route.id)}">Посмотреть маршрут на карте</a>
                    ${yandexUrl ? `<a class="button" href="${yandexUrl}" target="_blank" rel="noopener">Открыть в Яндекс.Картах</a>` : ''}

                </div>
            </div>
            ${media(route.name, 360, routeImage(route))}
        </section>

        <div class="narrow">
            <section class="article-section">
                <h2>Начало и конец маршрута</h2>

                ${first && last ? `
                <div class="start-end">
                    <div><span class="field-label">Начало</span><strong>${esc(first.name)}</strong></div>
                    <div><span class="field-label">Завершение</span><strong>${esc(last.name)}</strong></div>
                </div>` : ''}
            </section>
            <section>
                <h2>Остановки маршрута</h2>
                ${stopsHtml}
            </section>
        </div>
    </div>`;
}

// ---------- 5. СТРАНИЦА МЕСТА ----------
async function renderPlacePage(id, modelOnly = false) {
    app.innerHTML = `<div class="wrap section"><h1>Загрузка…</h1></div>`;
    const version = pageVersion;
    let place;
    try {
        place = await fetchPlaceDetails(id);
    } catch (error) {
        if (version === pageVersion) loadError(app.querySelector('.section'), () => renderPlacePage(id, modelOnly), error);
        return;
    }
    if (version !== pageVersion || !document.body.matches('[data-page=place]') || window.location.hash.split('/')[1] !== String(id)) return;
    if (!place) {
        app.innerHTML = `<div class="wrap section"><h1>Место не найдено</h1><a class="text-button" href="#map">К карте</a></div>`;
        return;
    }

    const descriptionParts = (place.description || '').split('</p>');
    const firstParagraph = descriptionParts[0] ? descriptionParts[0].replace('<p>', '') : '';
    const restOfText = descriptionParts.slice(1).join('</p>');
    const hasStory = Boolean(restOfText.trim() || place.facts || place.image_2_url);

    app.innerHTML = `<div class="wrap">
        <div class="breadcrumb"><a href="#map">К карте</a><span>/</span><span>${esc(place.name)}</span></div>
        <section class="detail-hero">
            <div>
                <div class="eyebrow">${esc(place.type_name || place.place_type || 'Достопримечательность')}</div>
                <h1>${esc(place.name)}</h1>
                ${firstParagraph ? `<div class="lead rich-text">${firstParagraph}</div>` : ''}
                <p class="field-label">Адрес</p><p class="field-value">${esc(place.address || 'Адрес уточняется')}</p>
                <a href="https://yandex.ru/maps/?text=${encodeURIComponent(place.name + ', ' + (place.address || 'Коломна'))}" target="_blank" rel="noopener" class="button dark">Открыть в Яндекс.Картах</a>
            </div>
            ${media(place.name, 360, placeImage(place))}
        </section>
        ${hasStory || place.model_3d ? `<div class="place-body">
            ${hasStory ? `<section class="article-section">
                <div class="eyebrow">Знакомство с городом</div><h2>О месте</h2>
                ${place.image_2_url ? `<div class="place-photo">${media(place.name + ' — другой ракурс', 340, place.image_2_url)}</div>` : ''}
                ${restOfText.trim() ? `<div class="rich-text">${restOfText}</div>` : ''}
                ${place.facts ? `<div class="rich-text place-story">${place.facts}</div>` : ''}
            </section>` : ''}
            ${place.model_3d ? `<section class="article-section" id="place-model-section"><div class="eyebrow">Рассмотреть поближе</div><h2>3D-модель</h2>${modelBlock(place, 430)}</section>` : ''}
        </div>` : ''}
        <section class="place-end"><div><div class="eyebrow">Продолжить прогулку</div><h2>Продолжить знакомство с городом</h2><p>Посмотрите другие места и выберите следующую остановку.</p></div>
            <a class="button dark" href="#map" onclick="pendingPlaceId=${Number(place.id)};selectMapTab('places')">Вернуться к карте города</a>
        </section>
    </div>`;
    if (modelOnly && place.model_3d) {
        const section = document.getElementById('place-model-section');
        section?.scrollIntoView({ block: 'start', behavior: 'instant' });
        const widget = section?.querySelector('.model-widget');
        if (widget) openModel(widget);
    }
}

// ---------- ЛОГИКА ДАННЫХ ----------
async function loadHomeRoutes() {
    const container = document.getElementById('home-routes');
    container.innerHTML = '<p class="empty" role="status">Загрузка маршрутов…</p>';
    try {
        const routes = await fetchRoutes();
        if (!container.isConnected) return;
        container.innerHTML = routes.length ? routes.slice(0, 3).map(routeCard).join('') : '<p class="empty">Маршруты пока не добавлены.</p>';
    } catch (error) {
        if (container.isConnected) loadError(container, loadHomeRoutes, error);
    }
}

async function loadHotelWelcome() {
    const slug = new URLSearchParams(location.search).get('hotel');
    if (!slug) return;
    const container = document.getElementById('hotel-welcome');
    try {
        const hotel = (await fetchPlaces()).find(place => place.hotel_slug === slug);
        if (!hotel || !container.isConnected) return;
        container.innerHTML = `<h2>${esc(hotel.name)}</h2><p>Начните прогулку от отеля.</p><div><a class="button dark" href="#map">Выбрать маршрут на карте</a><a class="text-link" href="hotel-qr/${encodeURIComponent(slug)}.svg" download>Скачать QR-код</a></div>`;
        container.hidden = false;
    } catch (error) {
        if (!container.isConnected) return;
        container.hidden = false;
        loadError(container, loadHotelWelcome, error);
    }
}

function initHomePreview() {
    if (typeof L === 'undefined') return;
    const preview = document.getElementById('home-map-preview');
    homePreviewObserver = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting || !preview.isConnected) return;
        homePreviewObserver.disconnect();
        homePreview = L.map(preview, {
            zoomControl: false, dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false
        }).setView([55.104, 38.765], 13);
        mapTiles().addTo(homePreview);
    });
    homePreviewObserver.observe(preview);
}

function matchesCatalogFilters(route) {
    return (!catalogFilters.category || route.category === catalogFilters.category)
        && (!catalogFilters.season || route.season === catalogFilters.season)
        && (!catalogFilters.duration || (route.total_minutes > 0 &&
            (catalogFilters.duration === 'short' ? route.total_minutes < 120 : route.total_minutes >= 120)));
}

async function loadCatalogRoutes() {
    const container = document.getElementById('catalog-routes');
    const panel = document.getElementById('catalog-filters');
    const found = document.getElementById('catalog-found');
    document.getElementById('catalog-filter-toggle').onclick = event => {
        const open = panel.classList.toggle('open');
        event.currentTarget.setAttribute('aria-expanded', String(open));
    };
    container.innerHTML = '<p class="empty" role="status">Загрузка…</p>';
    found.textContent = 'Найдено: …';
    let routes;
    try {
        routes = await fetchRoutes();
    } catch (error) {
        if (container.isConnected) {
            found.textContent = '';
            loadError(container, loadCatalogRoutes, error);
        }
        return;
    }
    if (!container.isConnected) return;

    const groups = [
        ['category', 'Категория', uniq(routes.map(r => r.category)).map(value => [value, value])],
        ['season', 'Сезон', uniq(routes.map(r => r.season)).map(value => [value, seasonLabels[value] || value])],
        ['duration', 'Длительность', [['short', 'До 2 часов'], ['long', 'От 2 часов']]]
    ];
    panel.innerHTML = groups.map(([key, label, options]) => options.length
        ? `<div class="catalog-filter-group" role="group" aria-label="${label}"><span>${label}</span><div>${options.map(([value, name]) =>
            `<button type="button" class="chip" data-filter="${key}" data-value="${esc(value)}">${esc(name)}</button>`
        ).join('')}</div></div>` : '').join('') + '<button type="button" class="chip catalog-reset">Сбросить</button>';
    const draw = () => {
        const list = routes.filter(matchesCatalogFilters);
        found.textContent = `Найдено: ${list.length}`;
        container.innerHTML = list.length ? list.map(routeCard).join('')
            : `<p class="empty">${routes.length ? 'По выбранным фильтрам ничего не найдено.' : 'Маршруты не найдены.'}</p>`;
        panel.querySelectorAll('[data-filter]').forEach(button => {
            const selected = catalogFilters[button.dataset.filter] === button.dataset.value;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    };
    panel.onclick = event => {
        const button = event.target.closest('button');
        if (!button) return;
        const { filter, value } = button.dataset;
        if (filter) catalogFilters[filter] = catalogFilters[filter] === value ? '' : value;
        else Object.keys(catalogFilters).forEach(key => { catalogFilters[key] = ''; });
        draw();
    };
    draw();
}

// ---------- ЛОГИКА КАРТЫ ----------
let pendingRouteId = null;

function selectMapTab(tab) {
    mapQueries[currentMapTab] = mapQuery;
    currentMapTab = tab;
    mapQuery = mapQueries[tab];
}

window.switchMapTab = function (tab) {
    selectMapTab(tab);
    document.getElementById('map-search').value = mapQuery;
    document.querySelectorAll('.side-tabs button').forEach((btn, i) => {
        const active = (i === 0 && tab === 'routes') || (i === 1 && tab === 'places');
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('map-title').textContent = tab === 'routes' ? 'Готовые прогулки' : 'Достопримечательности';
    clearActiveRoute();
    drawAllPlacesOnMap(mapPlaces, false);
    loadMapSidebar();
};

// Обычный маркер (круглый)
function pinIcon(label, number) {
    return L.divIcon({
        className: 'custom-pin',
        html: `<div class="pin"><div class="pin-dot ${number ? 'num' : ''}">${number || ''}</div>${label ? `<div class="pin-label">${esc(label)}</div>` : ''}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15]
    });
}

// Маркер гостиницы (квадратный, темный)
function hotelIcon(label) {
    return L.divIcon({
        className: 'custom-pin',
        html: `<div class="pin"><div class="pin-dot" style="border-radius:0; background:#252525; border-color:#fff; width:24px; height:24px; display:flex; align-items:center; justify-content:center;"><span style="color:white; font-weight:bold; font-size:14px;">H</span></div>${label ? `<div class="pin-label" style="background:#252525; color:#fff;">${esc(label)}</div>` : ''}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12]
    });
}

function popupHtml(name, id, place) {
    const photo = placeImage(place);
    return `<div class="popup-title">${esc(name)}</div>
        ${photo ? media(name, 110, photo) : ''}
        ${place?.description ? `<p class="popup-description">${excerpt(place.description, 145)}</p>` : ''}
        <a class="button dark place-details popup-details" href="#place/${id}">Подробнее о месте</a>
        ${place?.model_3d ? `<span class="popup-model-label">Рассмотреть в 3D</span>${modelBlock(place, 190, true)}<a class="text-link" href="#place/${id}/3d">Большой 3D-просмотр</a>` : ''}`;
}

function popupOptions() {
    return { minWidth: 200, maxWidth: 300,
        maxHeight: Math.max(90, Math.min(420, mapInstance.getSize().y - 96)),
        autoPanPaddingTopLeft: [16, 24], autoPanPaddingBottomRight: [16, 26] };
}

function revealMap() {
    if (window.matchMedia('(max-width: 760px)').matches) setMapView('map');
}

function setRouteNote(text) {
    const note = document.getElementById('map-route-note');
    if (note) { note.textContent = text; note.hidden = !text; }
}

function setCrumb(text) {
    const el = document.getElementById('map-crumb');
    if (el) el.textContent = text;
}

function clearActiveRoute() {
    activeRouteId = null;
    activeRouteDetail = null;
    routeRequest++;
    setRouteNote('');
    if (routeLayer && mapInstance) { mapInstance.removeLayer(routeLayer); routeLayer = null; }
    hotelLayer = null;
    const button = document.getElementById('hotel-route-button');
    if (button) { button.hidden = true; button.onclick = null; }
    document.querySelectorAll('.selected-route-summary').forEach(summary => summary.remove());
    if (placesLayer && mapInstance && !mapInstance.hasLayer(placesLayer)) placesLayer.addTo(mapInstance);
    setCrumb('Коломна / все места');
    document.querySelectorAll('.side-card.active').forEach(card => card.classList.remove('active'));
}

function mapTiles() {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 });
}

async function initMap() {
    // A delayed zoom update can move a marker back into a cluster while its popup opens.
    const map = L.map('map', { zoomControl: false, scrollWheelZoom: true, zoomAnimation: false }).setView([55.104, 38.765], 15);
    mapInstance = map;
    const notice = document.getElementById('map-tile-error');
    let failedTiles = 0;
    mapTiles().on('loading', () => { failedTiles = 0; }).on('tileerror', () => {
        failedTiles++;
        notice.textContent = 'Не удалось загрузить подложку карты. Маркеры и маршруты доступны.';
        notice.hidden = false;
    }).on('load', () => { notice.hidden = failedTiles === 0; }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapResizeObserver = new ResizeObserver(() => { if (map === mapInstance) map.invalidateSize(); });
    mapResizeObserver.observe(document.querySelector('.map-canvas'));
    await loadMapPlaces(map);
    if (map !== mapInstance) return;
    await loadMapSidebar();
    if (map !== mapInstance) return;
    if (pendingRouteId) { const id = pendingRouteId; pendingRouteId = null; await showRouteOnMap(id); }
    if (map !== mapInstance) return;
    if (pendingPlaceId) {
        const id = pendingPlaceId; pendingPlaceId = null;
        const place = mapPlaces.find(item => Number(item.id) === id);
        if (place) locatePlace(place);
    }
}

async function loadMapPlaces(map) {
    const notice = document.getElementById('map-data-error');
    notice.hidden = true;
    try {
        const places = await fetchPlaces();
        if (map !== mapInstance) return;
        mapPlaces = places;
        const slug = new URLSearchParams(location.search).get('hotel');
        hotelOrigin = places.find(p => p.hotel_slug && (!slug || p.hotel_slug === slug) && coordinates(p)) || null;
        drawAllPlacesOnMap(places);
    } catch (error) {
        if (map !== mapInstance) return;
        notice.hidden = false;
        loadError(notice, async () => {
            await loadMapPlaces(map);
            if (map === mapInstance) await loadMapSidebar();
        }, error);
    }
}

function placeMarker(place, pair, number) {
    const icon = !number && (place.hotel_slug || /гостиница/i.test(place.name))
        ? hotelIcon(place.name) : pinIcon(place.name, number);
    return L.marker(pair, { icon, title: place.name, alt: place.name, placeId: Number(place.id) })
        .bindPopup(popupHtml(place.name, place.id, place), popupOptions());
}

function drawAllPlacesOnMap(visiblePlaces = mapPlaces, fit = true) {
    const map = mapInstance;
    if (!map) return;
    if (placesLayer) map.removeLayer(placesLayer);
    if (focusedPlace) { map.removeLayer(focusedPlace); focusedPlace = null; }
    placesLayer = L.markerClusterGroup({ disableClusteringAtZoom: 17, showCoverageOnHover: false, animate: false });
    const markers = [];
    for (const place of visiblePlaces) {
        const pair = coordinates(place);
        if (pair) markers.push(placeMarker(place, pair));
    }
    placesLayer.addLayers(markers);
    placesLayer.addTo(map);
    if (fit && markers.length > 1) map.fitBounds(placesLayer.getBounds(), { padding: [45, 45], maxZoom: 15, animate: false });
    else if (fit && markers.length === 1) map.setView(markers[0].getLatLng(), 16, { animate: false });
}

function locatePlace(place) {
    const pair = coordinates(place);
    if (!mapInstance || !pair) return;
    revealMap();
    mapInstance.invalidateSize();
    mapInstance.setView(pair, 17, { animate: false });
    let marker = placesLayer?.getLayers().find(marker => marker.options.placeId === Number(place.id));
    if (focusedPlace) { mapInstance.removeLayer(focusedPlace); focusedPlace = null; }
    if (!marker) {
        marker = placeMarker(place, pair).addTo(mapInstance);
        focusedPlace = marker;
    }
    marker.openPopup();
    setCrumb(`Коломна / ${place.name}`);
    document.querySelectorAll('.side-card[data-place]').forEach(card => card.classList.toggle('active', card.dataset.place === String(place.id)));
}

const walkCache = {};
async function getWalkPath(latlngs) {
    if (latlngs.length < 2) return null;
    const coords = latlngs.map(p => `${p[1]},${p[0]}`).join(';');
    if (walkCache[coords]) return walkCache[coords];
    try {
        const res = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        const geometry = data.routes && data.routes[0] && data.routes[0].geometry;
        if (!geometry) return null;
        return (walkCache[coords] = geometry.coordinates.map(c => [c[1], c[0]]));
    } catch (e) {
        return null;
    }
}

function renderSelectedRoute(detail) {
    document.querySelectorAll('.side-card[data-route]').forEach(card => {
        const selected = card.dataset.route === String(detail.id);
        card.classList.toggle('active', selected);
        if (!selected) return;
        const summary = document.createElement('div');
        summary.className = 'selected-route-summary';
        summary.innerHTML = `<p>${excerpt(detail.description, 230)}</p><ol>${detail.points.map(p => `<li>${esc(p.name)}</li>`).join('')}</ol>`;
        card.lastElementChild.append(summary);
    });
    const button = document.getElementById('hotel-route-button');
    button.hidden = !hotelOrigin;
    button.onclick = () => showHotelRoute(detail.points[0]);
}

async function showRouteOnMap(routeId) {
    const map = mapInstance;
    const request = ++routeRequest;
    let detail;
    try {
        detail = await fetchRouteDetails(routeId);
    } catch (error) {
        if (map && map === mapInstance && request === routeRequest) {
            const notice = document.getElementById('map-route-note');
            notice.hidden = false;
            loadError(notice, () => showRouteOnMap(routeId), error);
        }
        return;
    }
    if (!map || map !== mapInstance || request !== routeRequest) return;
    if (!detail?.points?.length) {
        setCrumb('Коломна / в этом маршруте пока нет точек');
        return;
    }
    const latlngs = detail.points.map(coordinates);
    if (latlngs.some(pair => !pair)) {
        setRouteNote('В маршруте есть остановки с неверными координатами.');
        return;
    }
    clearActiveRoute();
    activeRouteId = routeId;
    activeRouteDetail = detail;
    if (placesLayer) map.removeLayer(placesLayer);
    if (focusedPlace) { map.removeLayer(focusedPlace); focusedPlace = null; }
    const currentLayer = L.layerGroup().addTo(map);
    routeLayer = currentLayer;
    const stops = new Set(detail.points.map(p => Number(p.place_id)));
    for (const place of mapPlaces) {
        const pair = coordinates(place);
        if (pair && !stops.has(Number(place.id))) {
            L.circleMarker(pair, { radius: 4, stroke: false, fillColor: '#5f4b3c', fillOpacity: .32,
                interactive: false, className: 'muted-place' }).addTo(currentLayer);
        }
    }
    const line = L.polyline(latlngs, { color: '#704a32', weight: 4, dashArray: '7, 8',
        opacity: .9, className: 'walking-route' }).addTo(currentLayer);
    detail.points.forEach((p, i) => {
        placeMarker({ ...p.place, id: p.place_id, name: p.name }, latlngs[i], i + 1).addTo(currentLayer);
    });
    revealMap();
    map.invalidateSize();
    map.fitBounds(latlngs, { padding: [55, 55], maxZoom: 16, animate: false });
    setCrumb(`Коломна / ${detail.name}`);
    renderSelectedRoute(detail);
    setRouteNote('Уточняем пешеходный путь между остановками…');
    const path = await getWalkPath(latlngs);
    if (routeLayer !== currentLayer || map !== mapInstance) return;
    if (path) {
        line.setLatLngs(path);
        if (!hotelLayer) map.fitBounds(L.latLngBounds(path), { padding: [45, 45], maxZoom: 16, animate: false });
    }
    if (!hotelLayer) setRouteNote(path ? 'Пешеходный маршрут · номера обозначают остановки'
        : 'Схема остановок. Пеший путь можно открыть в Яндекс.Картах на странице маршрута.');
}

async function showHotelRoute(firstStop) {
    const map = mapInstance;
    const route = routeLayer;
    if (!map || !route || !hotelOrigin) return;
    const start = coordinates(hotelOrigin), end = coordinates(firstStop);
    if (!start || !end) return;
    if (hotelLayer) route.removeLayer(hotelLayer);
    const pair = [start, end];
    const layer = L.layerGroup().addTo(route);
    hotelLayer = layer;
    const line = L.polyline(pair, { color: '#285567', weight: 5, dashArray: '4, 7',
        className: 'hotel-route-line' }).addTo(layer);
    placeMarker(hotelOrigin, start).addTo(layer);
    setRouteNote(`Уточняем путь от отеля до остановки «${firstStop.name}»…`);
    const routeLine = route.getLayers().find(item => item.options?.className === 'walking-route');
    map.fitBounds(line.getBounds().extend(routeLine.getBounds()), { padding: [45, 45], maxZoom: 16, animate: false });
    const path = await getWalkPath(pair);
    if (hotelLayer !== layer || mapInstance !== map || routeLayer !== route) return;
    if (path) {
        line.setLatLngs(path);
        map.fitBounds(line.getBounds().extend(routeLine.getBounds()), { padding: [45, 45], maxZoom: 16, animate: false });
    }
    setRouteNote(path ? `Путь от отеля до остановки «${firstStop.name}» показан синим.`
        : `Схема пути от отеля до остановки «${firstStop.name}». Пешеходный сервис недоступен.`);
}

async function loadMapSidebar() {
    const listContainer = document.getElementById('map-sidebar-list');
    if (!listContainer) return;
    const request = ++sidebarRequest;
    listContainer.innerHTML = '<p class="empty" role="status">Загрузка…</p>';
    const filtersBox = document.getElementById('map-filters');
    document.getElementById('map-filter-toggle').onclick = event => {
        const open = filtersBox.classList.toggle('open');
        event.currentTarget.setAttribute('aria-expanded', String(open));
    };
    const isPlaces = currentMapTab === 'places';
    let items;
    try {
        items = isPlaces ? await fetchPlaces() : await fetchRoutes();
    } catch (error) {
        if (listContainer.isConnected && request === sidebarRequest) loadError(listContainer, loadMapSidebar, error);
        return;
    }
    if (!listContainer.isConnected || request !== sidebarRequest) return;
    const keyOf = item => isPlaces ? (item.type_name || item.place_type) : (item.category || item.season);
    const options = uniq(items.map(keyOf));
    const selected = isPlaces ? mapPlaceType : mapSeason;
    filtersBox.innerHTML = [['', 'Все'], ...options.map(option => [option, option])]
        .map(([value, label]) => `<button class="chip ${selected === value ? 'active' : ''}" aria-pressed="${selected === value}" data-v="${esc(value)}">${esc(label)}</button>`).join('');
    filtersBox.querySelectorAll('.chip').forEach(button => button.onclick = () => {
        if (isPlaces) mapPlaceType = button.dataset.v; else mapSeason = button.dataset.v;
        loadMapSidebar();
    });
    const draw = () => {
        const query = mapQuery.trim().toLocaleLowerCase('ru');
        const list = items.filter(item => (!selected || keyOf(item) === selected) && (!query || item.name.toLocaleLowerCase('ru').includes(query)));
        document.getElementById('map-found').textContent = isPlaces ? `Мест: ${list.length} · с 3D-моделью: ${list.filter(p => p.model_3d).length}` : `Маршрутов: ${list.length}`;
        if (isPlaces) { clearActiveRoute(); drawAllPlacesOnMap(list, false); setCrumb(query || selected ? `Коломна / найдено мест: ${list.length}` : 'Коломна / все места'); }
        listContainer.innerHTML = list.length ? list.map(item => `<article class="side-card ${!isPlaces && String(item.id) === String(activeRouteId) ? 'active' : ''}" ${isPlaces ? 'data-place' : 'data-route'}="${Number(item.id)}">
            ${media(item.name, 88, isPlaces ? placeImage(item) : routeImage(item))}<div><h3>${esc(item.name)}</h3><p>${isPlaces ? esc(keyOf(item) || 'Место') : [item.total_minutes ? fmtDuration(item.total_minutes) : '', fmtKm(item.length_km)].filter(value => value && value !== '—').join(' · ')}</p>
            <div class="side-actions"><button class="map-locate" type="button" data-locate="${Number(item.id)}" ${isPlaces && !coordinates(item) ? 'disabled' : ''}>${metaIcon('pin')} На карте</button><a class="text-link" href="#${isPlaces ? 'place' : 'route'}/${Number(item.id)}">Подробнее</a>${isPlaces && item.model_3d ? `<a class="model-badge" href="#place/${Number(item.id)}/3d">3D-модель</a>` : ''}</div></div></article>`).join('') : '<p class="empty">Ничего не найдено. Измените запрос или фильтр.</p>';
        listContainer.querySelectorAll('[data-locate]').forEach(button => button.onclick = () => {
            const item = list.find(entry => String(entry.id) === button.dataset.locate);
            if (isPlaces) locatePlace(item); else showRouteOnMap(item.id);
        });
        if (!isPlaces && activeRouteDetail) renderSelectedRoute(activeRouteDetail);
    };
    document.getElementById('map-search').oninput = event => { mapQuery = event.target.value; draw(); };
    draw();
}

// ---------- РОУТИНГ ----------
function setActiveNav(name) {
    document.querySelectorAll('#site-nav a').forEach(a => {
        const active = a.dataset.nav === name;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
}

function router() {
    const hash = window.location.hash || '#home';
    pageVersion++;
    routeRequest++; sidebarRequest++;
    homePreviewObserver?.disconnect(); homePreviewObserver = null;
    homePreview?.remove(); homePreview = null;
    mapResizeObserver?.disconnect(); mapResizeObserver = null;
    if (mapInstance) {
        mapInstance.remove(); mapInstance = null; placesLayer = null; routeLayer = null; activeRouteId = null;
        activeRouteDetail = null; focusedPlace = null; hotelOrigin = null; hotelLayer = null; mapPlaces = [];
    }
    const page = hash.startsWith('#place/') ? 'place' : hash.startsWith('#route/') ? 'route' : hash === '#map' ? 'map' : hash === '#catalog' ? 'catalog' : 'home';
    document.body.dataset.page = page;
    document.body.classList.toggle('is-map', page === 'map');

    if (hash.startsWith('#place/')) {
        setActiveNav('map');
        renderPlacePage(hash.split('/')[1], hash.split('/')[2] === '3d');
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (hash.startsWith('#route/')) {
        setActiveNav('catalog');
        renderRoutePage(hash.split('/')[1]);
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (hash === '#map') {
        setActiveNav('map');
        app.innerHTML = renderMap();
        if (typeof L !== 'undefined' && L.markerClusterGroup) initMap();
        else {
            const notice = document.getElementById('map-data-error');
            notice.hidden = false;
            loadError(notice, () => location.reload());
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (hash === '#catalog') {
        setActiveNav('catalog');
        app.innerHTML = renderCatalog();
        loadCatalogRoutes();
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
        const toAbout = hash === '#about' || hash === '#home/about';
        setActiveNav(toAbout ? 'about' : '');
        app.innerHTML = renderHome();
        loadHomeRoutes();
        loadHotelWelcome();
        initHomePreview();
        if (toAbout) document.getElementById('about').scrollIntoView(); else window.scrollTo({ top: 0, behavior: 'instant' });
    }
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);
