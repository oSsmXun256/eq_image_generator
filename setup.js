#!/usr/bin/env node
'use strict';

/**
 * setup.js
 * world-atlas (npm) から日本のGeoJSONを抽出して japan_geo.json を生成します。
 * 初回セットアップ時に一度だけ実行してください。
 *
 * 使い方:
 *   npm install
 *   node setup.js
 */

const topo = require('topojson-client');
const fs = require('fs');
const path = require('path');

const topoPath = path.join(__dirname, 'node_modules/world-atlas/countries-10m.json');

if (!fs.existsSync(topoPath)) {
  console.error('❌ world-atlas が見つかりません。先に npm install を実行してください。');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(topoPath, 'utf8'));
const topo2 = require('topojson-client');
const countries = topo2.feature(data, data.objects.countries);

// Japan = ISO 3166-1 numeric 392
const japan = countries.features.find(f => f.id === '392');

if (!japan) {
  console.error('❌ 日本のデータが見つかりませんでした。');
  process.exit(1);
}

const outPath = path.join(__dirname, 'japan_geo.json');
fs.writeFileSync(outPath, JSON.stringify(japan.geometry));

console.log(`✅ japan_geo.json を生成しました (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
console.log('   node index.js でサーバーを起動できます。');