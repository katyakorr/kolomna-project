const QRCode = require('qrcode');
const { hotel } = require('./site-data');

const qrPath = `hotel-qr/${hotel.slug}.svg`;

function hotelQr(siteUrl = process.env.SITE_URL || 'https://katyakorr.github.io/kolomna-project/') {
  const url = new URL(siteUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('SITE_URL must be a public HTTP(S) site URL');
  }
  url.searchParams.set('hotel', hotel.slug);
  url.hash = 'home';
  const { modules } = QRCode.create(url.href, { errorCorrectionLevel: 'M' });
  const size = modules.size + 8;
  let blocks = '';
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) blocks += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><title>QR-код гостиницы «Коломна»</title><rect width="${size}" height="${size}" fill="white"/><path d="${blocks}"/></svg>`;
}

module.exports = { qrPath, hotelQr };
