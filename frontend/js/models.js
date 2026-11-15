let modelViewerLibrary = null;
let modelViewerAttempts = 0;
let activeModelWidget = null;
const modelStates = new WeakMap();
const DEFAULT_MODEL_ORBIT = '30deg 65deg 105%';

function modelBlock(place, height = 400, compact = false) {
    if (!place?.model_3d) return '';
    const label = place.model_label || place.name;
    return `<div class="model-widget ${compact ? 'model-widget-compact' : ''}"
        data-model-src="${esc(place.model_3d)}" data-model-label="${esc(label)}"
        style="--model-height:${height}px">
        <div class="model-stage">
            <span class="model-placeholder" aria-hidden="true">3D</span>
            ${place.model_poster ? `<img class="model-poster" src="${esc(place.model_poster)}" alt="${esc(label)} — превью модели" width="640" height="640" loading="lazy">` : ''}
            <p class="model-status" role="status" aria-live="polite" hidden></p>
        </div>
        <div class="model-footer">
            <button class="model-launch" type="button" data-model-action="load">Открыть 3D <span aria-hidden="true">↗</span></button>
            <div class="model-toolbar" hidden>
                <button type="button" data-model-action="rotate" aria-pressed="false">Вращение</button>
                <button type="button" data-model-action="reset">Сбросить вид</button>
            </div>
        </div>
        ${compact ? '' : '<p class="model-note">Потяните, чтобы повернуть. Приближайте колесом мыши или двумя пальцами.</p>'}
    </div>`;
}

async function loadModelViewer() {
    if (customElements.get('model-viewer')) return;
    if (!modelViewerLibrary) {
        const libraryUrl = new URL('vendor/model-viewer.min.js', document.baseURI);
        libraryUrl.searchParams.set('v', '3.5.0');
        libraryUrl.searchParams.set('attempt', String(modelViewerAttempts++));
        modelViewerLibrary = import(libraryUrl.href)
            .then(() => customElements.whenDefined('model-viewer'))
            .then(() => { customElements.get('model-viewer').modelCacheSize = 1; })
            .catch(error => { modelViewerLibrary = null; throw error; });
    }
    return modelViewerLibrary;
}

function releaseModel(widget) {
    const state = modelStates.get(widget);
    if (state) { clearTimeout(state.timer); state.viewer?.remove(); modelStates.delete(widget); }
    widget.classList.remove('is-loading', 'is-ready', 'is-error');
    widget.removeAttribute('aria-busy');
    const poster = widget.querySelector('.model-poster');
    if (poster) poster.hidden = false;
    widget.querySelector('.model-toolbar').hidden = true;
    widget.querySelector('.model-status').hidden = true;
    const launch = widget.querySelector('.model-launch');
    launch.hidden = false; launch.disabled = false; launch.textContent = 'Открыть 3D ↗';
    if (activeModelWidget === widget) activeModelWidget = null;
}

function showModelError(widget, state, message, retry = true) {
    if (modelStates.get(widget) !== state) return;
    clearTimeout(state.timer); state.failed = true; state.viewer?.remove(); state.viewer = null;
    widget.classList.remove('is-loading', 'is-ready'); widget.classList.add('is-error');
    widget.removeAttribute('aria-busy');
    const status = widget.querySelector('.model-status');
    status.textContent = message; status.hidden = false;
    const launch = widget.querySelector('.model-launch');
    launch.disabled = !retry; launch.hidden = false;
    launch.textContent = retry ? 'Повторить загрузку' : '3D недоступно';
    widget.querySelector('.model-toolbar').hidden = true;
    const poster = widget.querySelector('.model-poster');
    if (poster) poster.hidden = false;
}

function webGLAvailable() {
    try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!context) return false;
        context.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
    } catch { return false; }
}

async function openModel(widget) {
    if (widget.classList.contains('is-loading')) return;
    if (activeModelWidget && activeModelWidget !== widget) releaseModel(activeModelWidget);
    releaseModel(widget);
    activeModelWidget = widget;
    const state = { viewer: null, timer: null, failed: false };
    modelStates.set(widget, state);
    const launch = widget.querySelector('.model-launch');
    const status = widget.querySelector('.model-status');
    launch.disabled = true; launch.textContent = 'Загрузка…';
    status.textContent = 'Загрузка 3D-просмотра…'; status.hidden = false;
    widget.classList.add('is-loading'); widget.setAttribute('aria-busy', 'true');
    state.timer = setTimeout(() => showModelError(widget, state, 'Загрузка занимает слишком много времени. Попробуйте ещё раз.'), 25000);

    if (!webGLAvailable()) {
        showModelError(widget, state, '3D-просмотр недоступен в этом браузере.', false);
        return;
    }
    try {
        await loadModelViewer();
        if (!widget.isConnected || modelStates.get(widget) !== state || state.failed) return;
        const viewer = document.createElement('model-viewer');
        state.viewer = viewer;
        viewer.innerHTML = '<span slot="progress-bar"></span>';
        viewer.setAttribute('alt', `3D-модель: ${widget.dataset.modelLabel}`);
        viewer.setAttribute('camera-controls', '');
        viewer.setAttribute('disable-pan', '');
        viewer.setAttribute('camera-orbit', DEFAULT_MODEL_ORBIT);
        viewer.setAttribute('min-camera-orbit', 'auto 10deg 30%');
        viewer.setAttribute('max-camera-orbit', 'auto 85deg 250%');
        viewer.setAttribute('field-of-view', '30deg');
        viewer.setAttribute('environment-image', 'neutral');
        viewer.setAttribute('shadow-intensity', '1');
        viewer.setAttribute('shadow-softness', '1');
        viewer.setAttribute('touch-action', 'pan-y');
        viewer.setAttribute('interaction-prompt', 'none');
        viewer.setAttribute('loading', 'eager');
        viewer.addEventListener('progress', event => {
            if (modelStates.get(widget) !== state || !widget.classList.contains('is-loading')) return;
            status.textContent = `Загрузка модели… ${Math.round((event.detail.totalProgress || 0) * 100)}%`;
        });
        viewer.addEventListener('load', () => {
            if (modelStates.get(widget) !== state || state.viewer !== viewer || state.failed) return;
            clearTimeout(state.timer);
            widget.classList.remove('is-loading'); widget.classList.add('is-ready');
            widget.removeAttribute('aria-busy');
            status.textContent = 'Модель загружена. Можно вращать и приближать.'; status.hidden = true;
            launch.hidden = true;
            const poster = widget.querySelector('.model-poster');
            if (poster) poster.hidden = true;
            widget.querySelector('.model-toolbar').hidden = false;
            const rotate = widget.querySelector('[data-model-action="rotate"]');
            rotate.setAttribute('aria-pressed', 'false'); rotate.textContent = 'Вращение';
        }, { once: true });
        viewer.addEventListener('error', () => showModelError(widget, state, 'Не удалось открыть 3D-модель. Попробуйте ещё раз.'));
        viewer.src = widget.dataset.modelSrc;
        widget.querySelector('.model-stage').append(viewer);
    } catch {
        showModelError(widget, state, 'Не удалось загрузить 3D-просмотр. Попробуйте ещё раз.');
    }
}

document.addEventListener('click', event => {
    const button = event.target.closest('[data-model-action]');
    if (!button) return;
    const widget = button.closest('.model-widget');
    if (!widget) return;
    if (button.dataset.modelAction === 'load') { openModel(widget); return; }
    const viewer = modelStates.get(widget)?.viewer;
    if (!viewer || !widget.classList.contains('is-ready')) return;
    if (button.dataset.modelAction === 'rotate') {
        viewer.autoRotate = !viewer.autoRotate;
        button.setAttribute('aria-pressed', String(viewer.autoRotate));
        button.textContent = viewer.autoRotate ? 'Остановить' : 'Вращение';
    } else if (button.dataset.modelAction === 'reset') {
        viewer.autoRotate = false;
        viewer.cameraOrbit = DEFAULT_MODEL_ORBIT;
        viewer.cameraTarget = 'auto auto auto';
        viewer.fieldOfView = '30deg';
        viewer.resetTurntableRotation(0);
        viewer.jumpCameraToGoal();
        const rotate = widget.querySelector('[data-model-action="rotate"]');
        rotate.setAttribute('aria-pressed', 'false'); rotate.textContent = 'Вращение';
    }
});

document.addEventListener('error', event => {
    if (event.target.matches?.('.model-poster')) event.target.hidden = true;
}, true);

// Navigation and closed Leaflet popups remove the widget. Release its viewer
// so hidden pages do not retain a rendering context or keep rotating.
new MutationObserver(() => {
    if (activeModelWidget && !activeModelWidget.isConnected) releaseModel(activeModelWidget);
}).observe(document.getElementById('app'), { childList: true, subtree: true });
