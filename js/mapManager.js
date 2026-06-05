import { esc } from './utils.js';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const TYPE_COLORS = {
  sightseeing: '#d97706', transport: '#475569', trekking: '#16a34a', diving: '#1d4ed8', rest: '#7c3aed',
};
const TYPE_EMOJI = {
  sightseeing: '🏛', transport: '✈', trekking: '🥾', diving: '🤿', rest: '🏨',
};

let map = null;
const markers = [];
let markerClickCb = null;

export function init(containerId) {
  map = new maplibregl.Map({
    container: containerId,
    style: STYLE_URL,
    center: [20, 20],
    zoom: 1.5,
    attributionControl: false,
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showAccuracyCircle: false,
  }), 'bottom-right');

  map.on('error', () => {
    const container = document.getElementById(containerId);
    if (!container || container.querySelector('.map-offline-msg')) return;
    const msg = document.createElement('div');
    msg.className = 'map-offline-msg';
    msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#94a3b8;font-size:14px;';
    msg.textContent = '地圖載入需要網路連線';
    container.appendChild(msg);
  });

  return map;
}

export function onMarkerClick(cb) { markerClickCb = cb; }

export function clearMap() {
  markers.forEach(m => m.remove());
  markers.length = 0;
  if (!map) return;
  ['route-line', 'route-line-halo'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource('routes')) map.removeSource('routes');
}

export function renderTrip(trip) {
  if (!map || !trip) return;

  const doRender = () => {
    clearMap();
    const features = [];
    const allPoints = [];

    for (const seg of (trip.segments || [])) {
      const color = seg.color || '#64748b';
      const segPoints = [];

      for (const day of (seg.daily || [])) {
        if (day.lat == null || day.lng == null) continue;

        const el = document.createElement('div');
        el.style.cssText = `cursor:pointer;width:28px;height:28px;border-radius:50%;background:${TYPE_COLORS[day.type] || color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:13px;`;
        el.textContent = TYPE_EMOJI[day.type] || '📍';
        el.addEventListener('click', () => { if (markerClickCb) markerClickCb(day.date, seg.id); });

        const popup = new maplibregl.Popup({ offset: 20, maxWidth: '220px' }).setHTML(`
          <div style="font-size:14px;line-height:1.5">
            <div style="font-size:12px;color:#64748b;margin-bottom:2px">${esc(day.date || '')}</div>
            <div style="font-weight:600">${TYPE_EMOJI[day.type] || '📍'} ${esc(day.title || '')}</div>
            ${day.note ? `<div style="margin-top:4px;color:#64748b;font-size:12px">${esc(day.note)}</div>` : ''}
          </div>`);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([day.lng, day.lat])
          .setPopup(popup)
          .addTo(map);
        markers.push(marker);
        segPoints.push([day.lng, day.lat]);
        allPoints.push([day.lng, day.lat]);
      }

      if (segPoints.length >= 2) {
        features.push({
          type: 'Feature',
          properties: { color },
          geometry: { type: 'LineString', coordinates: segPoints },
        });
      }
    }

    if (features.length > 0) {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'route-line', type: 'line', source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.9, 'line-dasharray': [4, 2.5] },
      });
    }

    if (allPoints.length === 1) {
      map.flyTo({ center: allPoints[0], zoom: 10 });
    } else if (allPoints.length > 1) {
      const bounds = allPoints.reduce(
        (b, pt) => b.extend(pt),
        new maplibregl.LngLatBounds(allPoints[0], allPoints[0])
      );
      map.fitBounds(bounds, { padding: 60, duration: 1000, maxZoom: 12 });
    }
  };

  if (map.isStyleLoaded()) {
    doRender();
  } else {
    map.once('load', doRender);
  }
}

export function flyToDay(lat, lng) {
  if (!map) return;
  map.flyTo({ center: [lng, lat], zoom: 12, duration: 1200 });
}
