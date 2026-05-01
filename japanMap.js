'use strict';

const japanGeo = require('./japan_geo.json'); // MultiPolygon geometry

// 高画質化のため解像度を2倍に(1600x900)
const IMG_W = 1600;
const IMG_H = 900;

/**
 * Compute a viewport centered on (cLon, cLat) with a given radius in km.
 * Returns { lonMin, lonMax, latMin, latMax } in decimal degrees.
 */
function computeViewport(cLon, cLat, radiusKm) {
  // 1° latitude ≈ 111km
  const dLat = (radiusKm / 111) * 1.15;
  // 1° longitude ≈ 111km * cos(lat)
  const dLon = (radiusKm / (111 * Math.cos((cLat * Math.PI) / 180))) * 1.15;

  let latSpan = dLat * 2;
  let lonSpan = dLon * 2;

  // Adjust to maintain 16:9 pixel aspect ratio
  const lonPerPx = lonSpan / IMG_W;
  const latPerPx = latSpan / IMG_H;
  if (lonPerPx > latPerPx) {
    latSpan = lonSpan * (IMG_H / IMG_W);
  } else {
    lonSpan = latSpan * (IMG_W / IMG_H);
  }

  return {
    lonMin: cLon - lonSpan / 2,
    lonMax: cLon + lonSpan / 2,
    latMin: cLat - latSpan / 2,
    latMax: cLat + latSpan / 2,
  };
}

/** Full Japan viewport (overview fallback). */
const JAPAN_VIEWPORT = {
  lonMin: 122.5,
  lonMax: 154.0,
  latMin: 23.5,
  latMax: 46.0,
};

/**
 * Convert geographic [lon, lat] to SVG [x, y] given a viewport.
 */
function geo2px(lon, lat, vp) {
  const x = ((lon - vp.lonMin) / (vp.lonMax - vp.lonMin)) * IMG_W;
  const y = ((vp.latMax - lat) / (vp.latMax - vp.latMin)) * IMG_H;
  return { x, y };
}

/**
 * Convert a coordinate ring to an SVG path d-string.
 * Returns '' if the ring is entirely outside the viewport.
 */
function ringToPath(ring, vp) {
  // Rough visibility check
  const margin = 1; // degrees
  const inView = ring.some(
    ([lon, lat]) =>
      lon >= vp.lonMin - margin &&
      lon <= vp.lonMax + margin &&
      lat >= vp.latMin - margin &&
      lat <= vp.latMax + margin
  );
  if (!inView) return '';

  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const { x, y } = geo2px(ring[i][0], ring[i][1], vp);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return d + 'Z';
}

/**
 * Build SVG <path> elements for Japan's land polygons.
 * @param {object} vp - { lonMin, lonMax, latMin, latMax }
 * @returns {string} SVG markup
 */
function buildMapPaths(vp) {
  const paths = [];

  for (const polygon of japanGeo.coordinates) {
    // polygon = [ outerRing, ...holes ]
    let d = '';
    for (const ring of polygon) {
      const part = ringToPath(ring, vp);
      if (part) d += part;
    }
    if (d) {
      // 線の太さも1.4に倍増
      paths.push(
        `<path d="${d}" fill="#2d5a27" stroke="#4a8c40" stroke-width="1.4" fill-rule="evenodd"/>`
      );
    }
  }

  return paths.join('\n');
}

/**
 * Build lat/lon grid lines. Step size adapts to viewport span.
 */
function buildGrid(vp) {
  let svg = '';
  const lonSpan = vp.lonMax - vp.lonMin;
  const latSpan = vp.latMax - vp.latMin;
  const lonStep = lonSpan > 20 ? 5 : lonSpan > 8 ? 2 : 1;
  const latStep = latSpan > 15 ? 5 : latSpan > 6 ? 2 : 1;

  const startLon = Math.ceil(vp.lonMin / lonStep) * lonStep;
  const startLat = Math.ceil(vp.latMin / latStep) * latStep;

  for (let lon = startLon; lon <= vp.lonMax; lon += lonStep) {
    const { x } = geo2px(lon, vp.latMin, vp);
    svg += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${IMG_H}" stroke="#ffffff" stroke-width="0.6" opacity="0.15"/>`;
    svg += `<text x="${(x + 4).toFixed(1)}" y="${IMG_H - 10}" font-size="18" fill="#ffffff" opacity="0.4" font-family="monospace">${lon}°E</text>`;
  }
  for (let lat = startLat; lat <= vp.latMax; lat += latStep) {
    const { y } = geo2px(vp.lonMin, lat, vp);
    svg += `<line x1="0" y1="${y.toFixed(1)}" x2="${IMG_W}" y2="${y.toFixed(1)}" stroke="#ffffff" stroke-width="0.6" opacity="0.15"/>`;
    svg += `<text x="6" y="${(y - 4).toFixed(1)}" font-size="18" fill="#ffffff" opacity="0.4" font-family="monospace">${lat}°N</text>`;
  }
  return svg;
}

module.exports = {
  IMG_W,
  IMG_H,
  geo2px,
  buildMapPaths,
  buildGrid,
  computeViewport,
  JAPAN_VIEWPORT,
};