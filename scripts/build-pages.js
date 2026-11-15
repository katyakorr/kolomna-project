const fs = require('node:fs');
const path = require('node:path');
const { parseDump } = require('./import-project-data');
const { assets, withModel } = require('../backend/models');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');

function numeric(value) { return value == null ? null : Number(value); }
function relativeMedia(value) { return value ? value.replace(/^\//, '') : null; }

function createSnapshot() {
    const tables = parseDump(fs.readFileSync(path.join(ROOT, 'kolomnabackup.sql'), 'utf8'));
    const types = new Map(tables.place_type.rows.map(row => [row.id, row.name]));
    const categories = new Map(tables.route_category.rows.map(row => [row.id, row.name]));
    const places = tables.place.rows.map(row => {
        const place = withModel(row);
        return {
            ...place, id:Number(place.id), place_type_id:numeric(place.place_type_id),
            latitude:numeric(place.latitude), longitude:numeric(place.longitude),
            type_name:types.get(row.place_type_id) || null,
            is_partner:/кафе.*партн[её]р/i.test(types.get(row.place_type_id) || ''),
            image_url:relativeMedia(place.image_url), image_2_url:relativeMedia(place.image_2_url),
            model_3d:relativeMedia(place.model_3d), model_poster:relativeMedia(place.model_poster)
        };
    }).sort((a, b) => a.id - b.id);
    const byId = new Map(places.map(place => [place.id, place]));
    const routes = tables.route.rows.map(row => {
        const points = tables.route_point.rows.filter(point => point.route_id === row.id)
            .sort((a, b) => Number(a.order_number) - Number(b.order_number))
            .map(point => {
                const place = byId.get(Number(point.place_id));
                if (!place) throw new Error(`Route ${row.id} references missing place ${point.place_id}`);
                return {
                    place_id:place.id, name:place.name, latitude:place.latitude, longitude:place.longitude,
                    order_number:Number(point.order_number), arrival_time:point.arrival_time,
                    stay_minutes:numeric(point.stay_minutes), place
                };
            });
        return {
            ...row, id:Number(row.id), route_category_id:numeric(row.route_category_id),
            category:categories.get(row.route_category_id) || null, length_km:numeric(row.length_km),
            image_url:relativeMedia(row.image_url), points, points_count:points.length,
            total_minutes:points.reduce((sum, point) => sum + (point.stay_minutes || 0), 0)
        };
    }).sort((a, b) => a.id - b.id);
    return { places, routes };
}

function buildPages(outDir = path.join(ROOT, 'dist')) {
    const snapshot = createSnapshot();
    if (snapshot.places.length !== 18 || snapshot.routes.length !== 5) throw new Error('Unexpected project dataset');
    fs.rmSync(outDir, { recursive:true, force:true });
    fs.mkdirSync(outDir, { recursive:true });
    function write(file, content) {
        const target = path.join(outDir, file);
        fs.mkdirSync(path.dirname(target), { recursive:true });
        fs.writeFileSync(target, content);
    }
    function copy(source, file) { write(file, fs.readFileSync(source)); }
    const images = new Set(['media/hero.jpg', 'media/about-1.jpg', 'media/about-2.jpg']);
    for (const place of snapshot.places) for (const image of [place.image_url, place.image_2_url]) if (image) images.add(image);
    for (const route of snapshot.routes) if (route.image_url) images.add(route.image_url);
    for (const image of images) {
        if (!image.startsWith('media/') || image.includes('..') || image.includes('\\')) throw new Error(`Invalid image path: ${image}`);
        copy(path.join(FRONTEND, image), image);
    }
    for (const file of ['css/style.css', 'js/api.js', 'js/app.js', 'js/models.js']) copy(path.join(FRONTEND, file), file);
    const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8')
        .replace('<script src="js/api.js"></script>', '<script src="js/site-config.js"></script>\n<script src="js/api.js"></script>');
    write('index.html', html);
    write('js/site-config.js', 'window.SITE_CONFIG = { dataMode: "static" };\n');
    write('data/site.json', JSON.stringify(snapshot));
    write('.nojekyll', '');
    for (const asset of assets) {
        copy(asset.file, `media/models/${asset.slug}.glb`);
        copy(asset.posterFile, `media/model-posters/${asset.slug}.webp`);
    }
    const library = fs.readFileSync(require.resolve('@google/model-viewer/dist/model-viewer.min.js'), 'utf8');
    write('vendor/model-viewer.min.js', library.replace(/^\/\/# sourceMappingURL=.*$/m, ''));
    copy(path.join(path.dirname(require.resolve('@google/model-viewer/package.json')), 'LICENSE'), 'vendor/model-viewer-LICENSE.txt');
    return { places:snapshot.places.length, routes:snapshot.routes.length, models:assets.length, images:images.size, outDir };
}

if (require.main === module) console.log('Pages build:', buildPages());
module.exports = { buildPages, createSnapshot };
