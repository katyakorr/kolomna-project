const { withModel } = require('./models');

const hotel = { slug: 'kolomna', name: 'Гостиница «Коломна»' };

function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function placeData(place) {
  return {
    ...withModel(place),
    latitude: numberOrNull(place.latitude),
    longitude: numberOrNull(place.longitude),
    place_type_id: numberOrNull(place.place_type_id),
    is_partner: /кафе.*партн[её]р/i.test(place.type_name || ''),
    ...(place.name === hotel.name ? { hotel_slug: hotel.slug } : {})
  };
}

function routeData(route) {
  return { ...route, length_km: numberOrNull(route.length_km) };
}

function queryValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

module.exports = { hotel, numberOrNull, placeData, routeData, queryValue };
