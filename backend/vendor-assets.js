const path = require('node:path');

const leaflet = path.join(path.dirname(require.resolve('leaflet/package.json')), 'dist');
const cluster = path.join(path.dirname(require.resolve('leaflet.markercluster/package.json')), 'dist');

module.exports = {
  'leaflet/leaflet.js': path.join(leaflet, 'leaflet.js'),
  'leaflet/leaflet.css': path.join(leaflet, 'leaflet.css'),
  'leaflet/LICENSE': path.join(leaflet, '../LICENSE'),
  'leaflet/images/layers.png': path.join(leaflet, 'images/layers.png'),
  'leaflet/images/layers-2x.png': path.join(leaflet, 'images/layers-2x.png'),
  'leaflet/images/marker-icon.png': path.join(leaflet, 'images/marker-icon.png'),
  'leaflet/images/marker-icon-2x.png': path.join(leaflet, 'images/marker-icon-2x.png'),
  'leaflet/images/marker-shadow.png': path.join(leaflet, 'images/marker-shadow.png'),
  'leaflet.markercluster/leaflet.markercluster.js': path.join(cluster, 'leaflet.markercluster.js'),
  'leaflet.markercluster/MarkerCluster.css': path.join(cluster, 'MarkerCluster.css'),
  'leaflet.markercluster/MarkerCluster.Default.css': path.join(cluster, 'MarkerCluster.Default.css'),
  'leaflet.markercluster/LICENSE': path.join(cluster, '../MIT-LICENCE.txt')
};
