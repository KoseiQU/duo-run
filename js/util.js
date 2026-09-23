/* ============================================================================
   DUO RUN — util.js  小道具（数学・乱数・AABB・localStorage）
   ============================================================================ */
'use strict';

const U = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  /* 0..1 を滑らかに（レーン移動の補間曲線） */
  smooth(t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },

  /* 決定論的な擬似乱数（シード固定＝テストで同じ地形が出る） */
  mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  /* 軸平行ボックスの重なり（各軸 [lo,hi]） */
  overlap1(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; },
  overlapBox(a, b) {
    return U.overlap1(a.x0, a.x1, b.x0, b.x1) &&
           U.overlap1(a.y0, a.y1, b.y0, b.y1) &&
           U.overlap1(a.z0, a.z1, b.z0, b.z1);
  },

  /* 効果音（audio.js / P6）。読み込み前・無音環境でも落ちない窓口。
     window.Audio（HTMLAudioElement）と取り違えないよう、SE 表を持つ方だけを呼ぶ。 */
  sfx(name, o) {
    if (typeof Audio === 'undefined' || !Audio || !Audio.SE || !Audio.play) return false;
    return Audio.play(name, o);
  },

  /* localStorage（file:// で例外が出る環境もあるので必ず包む） */
  lsGet(key, fallback) {
    try {
      const v = window.localStorage.getItem(CFG.LS_PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  lsSet(key, val) {
    try { window.localStorage.setItem(CFG.LS_PREFIX + key, JSON.stringify(val)); }
    catch (e) { /* 保存できない環境でもゲームは続行する */ }
  },
  /* duorun.* のスナップショット／復元（runAll の初期状態復帰に使う） */
  lsSnapshot() {
    const snap = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(CFG.LS_PREFIX) === 0) snap[k] = window.localStorage.getItem(k);
      }
    } catch (e) { /* noop */ }
    return snap;
  },
  lsRestore(snap) {
    try {
      const del = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(CFG.LS_PREFIX) === 0 && !(k in snap)) del.push(k);
      }
      del.forEach((k) => window.localStorage.removeItem(k));
      Object.keys(snap).forEach((k) => window.localStorage.setItem(k, snap[k]));
    } catch (e) { /* noop */ }
  }
};
