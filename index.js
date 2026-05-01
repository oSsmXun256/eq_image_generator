'use strict';

const express = require('express');
const { generateImage } = require('./imageGen');

const app = express();
const PORT = 4900;

// Valid intensity labels
const VALID_INT = new Set(['1','2','3','4','5弱','5強','6弱','6強','7']);

/**
 * Validate and parse query parameters.
 * Returns { ok: true, params } or { ok: false, error: string }
 */
function parseParams(q) {
  const { type, lat, lng, int: intensity, mag, dep, loc, serial, final: fin } = q;

  // --- required ---
  if (!type || !['eew', 'eqlist'].includes(type)) {
    return { ok: false, error: '`type` must be "eew" or "eqlist"' };
  }
  const latN = parseFloat(lat);
  if (isNaN(latN) || latN < 20 || latN > 50) {
    return { ok: false, error: '`lat` must be a number between 20 and 50' };
  }
  const lngN = parseFloat(lng);
  if (isNaN(lngN) || lngN < 120 || lngN > 160) {
    return { ok: false, error: '`lng` must be a number between 120 and 160' };
  }
  if (!intensity || !VALID_INT.has(intensity)) {
    return { ok: false, error: `\`int\` must be one of: ${[...VALID_INT].join(', ')}` };
  }
  const magN = parseFloat(mag);
  if (isNaN(magN) || magN < 0 || magN > 10) {
    return { ok: false, error: '`mag` must be a number 0–10' };
  }
  if (!dep || isNaN(parseFloat(dep))) {
    return { ok: false, error: '`dep` must be a number (km)' };
  }
  if (!loc || !loc.trim()) {
    return { ok: false, error: '`loc` is required' };
  }

  // --- optional ---
  const serialN = serial != null && serial !== '' ? parseInt(serial, 10) : undefined;
  const finalFlag = fin === '1' ? '1' : '0';

  return {
    ok: true,
    params: {
      type,
      lat: latN,
      lng: lngN,
      int: intensity,
      mag: magN,
      dep: dep.trim(),
      loc: loc.trim(),
      serial: serialN,
      final: finalFlag,
    },
  };
}

// ─────────────────────────────────────────
// GET /eqimg/
// ─────────────────────────────────────────
app.get('/eqimg/', async (req, res) => {
  const parsed = parseParams(req.query);

  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const imgBuf = await generateImage(parsed.params);

    // PNGに変更したため Content-Type を修正
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(imgBuf);
  } catch (err) {
    console.error('[eqimg] generation error:', err);
    res.status(500).json({ error: 'Image generation failed', detail: err.message });
  }
});

// ─────────────────────────────────────────
// Health check
// ─────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─────────────────────────────────────────
// 404
// ─────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`[eqimg] listening on http://localhost:${PORT}`);
  console.log(`[eqimg] example: http://localhost:${PORT}/eqimg/?type=eew&lat=35.6895&lng=139.6917&int=5%E5%BC%B1&mag=6.5&dep=10&loc=%E8%8C%A8%E5%9F%8E%E7%9C%8C%E5%8C%97%E9%83%A8&serial=3&final=0`);
});

module.exports = app;