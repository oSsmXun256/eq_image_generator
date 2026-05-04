'use strict';

const sharp = require('sharp');
const {
  geo2px,
  buildMapPaths,
  buildGrid,
  computeViewport,
  JAPAN_VIEWPORT,
  IMG_W,
  IMG_H,
} = require('./japanMap');

// ── Constants ────────────────────────────────────────────────
const INTENSITY_COLOR = {
  '1':  '#8888ff',
  '2':  '#0000ff',
  '3':  '#00aaff',
  '4':  '#ffff00',
  '5弱': '#ff9900',
  '5強': '#ff6600',
  '6弱': '#ff0000',
  '6強': '#cc0000',
  '7':  '#990000',
};

const INTENSITY_LABEL = {
  '1': '震度1', '2': '震度2', '3': '震度3', '4': '震度4',
  '5弱': '震度5弱', '5強': '震度5強',
  '6弱': '震度6弱', '6強': '震度6強',
  '7': '震度7',
};

/** Zoom radius in km centered on epicenter. */
const ZOOM_RADIUS_KM = 400;

// ── Helpers ──────────────────────────────────────────────────

/** Cross polygon SVG path (X印) */
function crossPath(cx, cy, r) {
  const w = r * 0.7;
  return `M${(cx - w).toFixed(1)},${(cy - w).toFixed(1)} L${(cx + w).toFixed(1)},${(cy + w).toFixed(1)} M${(cx + w).toFixed(1)},${(cy - w).toFixed(1)} L${(cx - w).toFixed(1)},${(cy + w).toFixed(1)}`;
}

/** Escape XML special chars. */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the info box SVG (top-left).
 */
function buildInfoBox(params, intColor) {
  const { type, lat, lng, int: intensity, mag, dep, loc, serial } = params;

  const lines = [];
  if (type === 'eew') {
    const s = serial != null ? ` 第${serial}報` : '';
    lines.push(`緊急地震速報${s}`);
  } else {
    lines.push('地震情報');
  }
  lines.push(`震源地: ${loc}`);
  lines.push(`最大震度: ${INTENSITY_LABEL[intensity] ?? intensity}`);
  lines.push(`マグニチュード: M${mag}`);
  // fix: dep は index.js で parseFloat 済みの純粋な数値文字列が渡されるため
  //      ここで km を付与しても重複しない ("10" → "深さ: 10km")
  lines.push(`深さ: ${dep}km`);
  lines.push(`緯度/経度: ${lat}, ${lng}`);

  // 解像度2倍に合わせてサイズ調整
  const lineH = 52;
  const padX = 28;
  const padY = 24;
  const boxW = 620;
  const boxH = lines.length * lineH + padY * 2;
  const bx = 32, by = 32;

  let svg = '';
  svg += `<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" rx="16" fill="#000000" fill-opacity="0.72" stroke="${intColor}" stroke-width="3"/>`;
  svg += `<rect x="${bx}" y="${by}" width="12" height="${boxH}" rx="6" fill="${intColor}"/>`;

  lines.forEach((line, i) => {
    const ty = by + padY + i * lineH + 32;
    const tx = bx + padX + 16;
    const bold = i === 0;
    const fontSize = bold ? 36 : 30;
    const fill = i === 2 ? intColor : '#ffffff';
    svg += `<text x="${tx}" y="${ty}" font-family="Noto Sans JP, Hiragino Sans, Meiryo, sans-serif" font-size="${fontSize}" font-weight="${bold ? 'bold' : 'normal'}" fill="${fill}">${esc(line)}</text>`;
  });

  return svg;
}

// ── Main export ──────────────────────────────────────────────

/**
 * Generate earthquake map image as JPEG Buffer.
 * @param {object} params - validated query params
 * @returns {Promise<Buffer>}
 */
async function generateImage(params) {
  const { lat, lng, int: intensity, final: isFinal } = params;
  const intColor = INTENSITY_COLOR[intensity] ?? '#ffffff';
  const cLat = parseFloat(lat);
  const cLon = parseFloat(lng);

  // ── Viewport: 400km zoom centered on epicenter ──
  // fix: 震源が日本の端（小笠原・沖縄南端など）でビューポートが海ばかりに
  //      なるケースへのフォールバックとして JAPAN_VIEWPORT を使用する
  let vp = computeViewport(cLon, cLat, ZOOM_RADIUS_KM);
  const isInJapanBounds = (
    cLat >= JAPAN_VIEWPORT.latMin && cLat <= JAPAN_VIEWPORT.latMax &&
    cLon >= JAPAN_VIEWPORT.lonMin && cLon <= JAPAN_VIEWPORT.lonMax
  );
  if (!isInJapanBounds) {
    vp = JAPAN_VIEWPORT;
  }

  // ── Map ──
  const mapPaths = buildMapPaths(vp);
  const grid = buildGrid(vp);

  // ── Epicenter pixel position ──
  const ep = geo2px(cLon, cLat, vp);

  // ── Cross marker (X印) ──
  const crossR = 28;
  const crossD = crossPath(ep.x, ep.y, crossR);

  // ── Pulse rings ──
  // 注意: sharp でラスタライズするため SVG アニメーションは静止画として描画される。
  // 最初のフレーム (opacity=0.85, r=crossR+8) が表示される。
  const pulseRings = [0, 0.4, 0.8].map((delay, i) => {
    // 静止画として見栄えよく、最初のリングだけ表示し残りはopacity=0にする
    const opacity = i === 0 ? '0.6' : '0';
    return `<circle cx="${ep.x.toFixed(1)}" cy="${ep.y.toFixed(1)}" r="${(crossR + 20 + i * 18).toFixed(1)}" fill="none" stroke="${intColor}" stroke-width="3" opacity="${opacity}"/>`;
  }).join('');

  // ── Info box ──
  const infoBox = buildInfoBox(params, intColor);

  // ── Final badge ──
  let finalBadge = '';
  if (String(isFinal) === '1') {
    finalBadge = `
      <rect x="${IMG_W - 224}" y="28" width="196" height="64" rx="12" fill="${intColor}" fill-opacity="0.9"/>
      <text x="${IMG_W - 126}" y="70" text-anchor="middle" font-family="Noto Sans JP, Hiragino Sans, Meiryo, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">最終報</text>`;
  }

  // ── Zoom indicator (bottom-right) ──
  const zoomLabel = `
    <text x="${IMG_W - 16}" y="${IMG_H - 36}" text-anchor="end"
          font-family="monospace" font-size="20" fill="#ffffff" opacity="0.5">
      ±${ZOOM_RADIUS_KM}km view
    </text>`;

  // ── Watermark ──
  const watermark = `
    <text x="${IMG_W - 16}" y="${IMG_H - 10}" text-anchor="end"
          font-family="monospace" font-size="20" fill="#ffffff" opacity="0.3">eqimg v1.0</text>`;

  // ── Assemble SVG ──
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${IMG_W}" height="${IMG_H}" viewBox="0 0 ${IMG_W} ${IMG_H}">
  <defs>
    <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0d1b2a"/>
      <stop offset="100%" stop-color="#060e17"/>
    </radialGradient>
    <filter id="starGlow">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${IMG_W}" height="${IMG_H}" fill="url(#oceanGrad)"/>

  ${grid}

  <g id="japan">${mapPaths}</g>

  ${pulseRings}

  <g filter="url(#starGlow)">
    <path d="${crossD}" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>
    <path d="${crossD}" fill="none" stroke="${intColor}" stroke-width="8" stroke-linecap="round"/>
  </g>

  ${infoBox}

  ${finalBadge}

  ${zoomLabel}
  ${watermark}
</svg>`;

  // fix: 仕様書に合わせて JPEG で出力する
  return sharp(Buffer.from(svg))
    .jpeg({ quality: 92 })
    .toBuffer();
}

module.exports = { generateImage };