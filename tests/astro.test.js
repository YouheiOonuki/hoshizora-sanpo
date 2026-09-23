'use strict';
/* 天文計算の答え合わせ。基準値は PyEphem 4.x で計算した「その日の春分点」基準の地心位置。
   実行: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const A = require('../astro.js');

// [赤経(rad), 赤緯(rad), 等級]
const REF = [
  {"date": "2026/9/23 12:00", "ms": 1790164800000, "sun": [3.149369, -0.003372, -26.8], "moon": [5.663724, -0.259513, -11.63], "mercury": [3.461798, -0.151014, -0.14], "venus": [3.704097, -0.343524, -4.47], "mars": [2.085807, 0.376601, 1.17], "jupiter": [2.457996, 0.277869, -1.7], "saturn": [0.213593, 0.040403, 0.35], "moonPhase": 89.1},
  {"date": "2024/1/15 3:00", "ms": 1705287600000, "sun": [5.172237, -0.370555, -26.8], "moon": [6.052577, -0.153703, -8.45], "mercury": [4.733321, -0.387949, -0.1], "venus": [4.52215, -0.37744, -3.88], "mars": [4.862413, -0.41696, 1.39], "jupiter": [0.594019, 0.217459, -2.34], "saturn": [5.882819, -0.19778, 0.97], "moonPhase": 18.0},
  {"date": "2027/6/1 18:30", "ms": 1811874600000, "sun": [1.212703, 0.385683, -26.8], "moon": [0.464741, 0.284218, -7.66], "mercury": [1.634151, 0.431064, 0.9], "venus": [0.867143, 0.297138, -3.8], "mars": [2.78673, 0.173076, 0.78], "jupiter": [2.499788, 0.271397, -1.79], "saturn": [0.404789, 0.125689, 0.65], "moonPhase": 12.2},
  {"date": "2030/12/24 9:00", "ms": 1924333200000, "sun": [4.761523, -0.40856, -26.8], "moon": [4.665903, -0.376743, -4.55], "mercury": [4.448178, -0.343487, 1.04], "venus": [5.065305, -0.407839, -3.78], "mars": [3.450517, -0.098665, 1.22], "jupiter": [4.405569, -0.38193, -1.61], "saturn": [1.078287, 0.328768, -0.25], "moonPhase": 0.2},
  {"date": "2020/7/4 0:00", "ms": 1593820800000, "sun": [1.807666, 0.39881, -26.8], "moon": [4.659929, -0.405488, -12.33], "mercury": [1.718858, 0.32219, 3.43], "venus": [1.145334, 0.300356, -4.48], "mars": [0.078907, -0.026806, -0.57], "jupiter": [5.158723, -0.378105, -2.59], "saturn": [5.272375, -0.355677, 0.18], "moonPhase": 98.2},
  {"date": "2045/3/10 14:00", "ms": 2372767200000, "sun": [6.129252, -0.066368, -26.8], "moon": [4.533776, -0.490282, -10.16], "mercury": [0.060646, 0.08552, 1.44], "venus": [6.105531, -0.103695, -3.79], "mars": [0.04404, 0.005931, 1.22], "jupiter": [5.742201, -0.233104, -1.84], "saturn": [4.371099, -0.354629, 0.43], "moonPhase": 49.7}
];
/** 2点の角距離（分角） */
const sep = (a1,d1,a2,d2)=>Math.acos(Math.min(1,Math.sin(d1)*Math.sin(d2)+Math.cos(d1)*Math.cos(d2)*Math.cos(a1-a2)))/A.DEG*60;

for (const r of REF) {
  test(`太陽・月・惑星の位置 ${r.date} UT`, () => {
    const P = A.precessor(r.ms);
    const s = A.sun(r.ms);
    assert.ok(sep(s.ra, s.dec, r.sun[0], r.sun[1]) < 2, 'sun');
    const m = A.moon(r.ms);
    assert.ok(sep(m.ra, m.dec, r.moon[0], r.moon[1]) < 6, 'moon');
    assert.ok(Math.abs(m.illum*100 - r.moonPhase) < 2, 'moon phase');
    for (const id of A.PLANET_IDS) {
      const p = A.planet(id, r.ms, P);
      assert.ok(sep(p.ra, p.dec, r[id][0], r[id][1]) < 10, id + ' position');
      if (id !== 'mercury') assert.ok(Math.abs(p.mag - r[id][2]) < 0.5, id + ' magnitude');
    }
  });
}

test('高度・方位: 東京で真南に来た星は高度 90−35.68+赤緯', () => {
  const lat = 35.681*A.DEG, dec = -16.716*A.DEG;          // シリウス
  const [alt, az] = A.altAz(Math.sin(dec), Math.cos(dec), 1.0, 1.0, Math.sin(lat), Math.cos(lat));
  assert.ok(Math.abs(alt/A.DEG - (90-35.681-16.716)) < 1e-6);
  assert.ok(Math.abs(A.norm(az)/A.DEG - 180) < 1e-6);
});

test('歳差: J2000 の北極星は2026年には赤緯が少し北へ', () => {
  const P = A.precessor(Date.UTC(2026,0,1));
  const [, dec] = P(2.530*15*A.DEG, 89.264*A.DEG);
  assert.ok(dec/A.DEG > 89.264 && dec/A.DEG < 89.5);
});
