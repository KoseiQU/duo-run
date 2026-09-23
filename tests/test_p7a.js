/* ============================================================================
   tests/test_p7a.js — P7a（v2基盤: 契約 §4.3【全面改訂 v2】・§4.5【緩和】・§4.8【改訂】・§5）
     【P7a-1】障害物の共通デザイン（ゾーン別スキンは失効）
       ・全ゾーンで同じ1セット（Zones.skin() === ObstacleSkin・ゾーンは obstacleSkin を持たない）
       ・障害物の色は赤・橙・白（＋無彩色）だけ。プレイヤーの琥珀・藍は使わない
       ・ハードル＝白×赤縞の発光バー（幅レーン一杯・厚み0.3・支柱/警告バー/▲なし）
       ・輝度差: 40m 先の障害物の画素が、同じ場所の背景より +40 以上明るい（全6ゾーン）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ZONES = ['neon', 'ruins', 'sea', 'space', 'mirror', 'core'];
  /* 見た目を検査する「障害物」（ゲート・帯などの目印は障害物ではない） */
  const HAZ = ['ROVER', 'LASER_LOW', 'PILLAR', 'WIDEBAR', 'LASER_V', 'WALLHOLE', 'WALLSOLID',
               'LASER_SCAN', 'LASER_ROT', 'COLUMN', 'FISH_TOOTH', 'FISH_FIN', 'FISH_TAIL'];

  /* 色が「赤〜橙」か「無彩色（白・灰・黒）」か */
  function warnColor(hex) {
    const c = new THREE.Color(hex), hsl = {};
    c.getHSL(hsl);
    if (hsl.s < 0.2 || hsl.l > 0.93 || hsl.l < 0.08) return true;      // 白・灰・黒
    return (hsl.h * 360 <= 32 || hsl.h * 360 >= 350);                    // 赤〜橙（琥珀 36°は外れる）
  }

  DUO.__suites.push({
    name: 'P7a-1: 障害物の共通デザイン（全ゾーン同一・赤/橙/白のみ・ハードルは発光バーで支柱なし）',
    quick: true,
    run(t) {
      const In = I(), Zs = In.Zones, Ob = In.Obstacles, OBS = In.OBS, CFG = In.CFG;
      DUO.reset(); DUO.start('S1', 3); DUO.pump(1 / 60);
      ZONES.forEach((zn) => {
        t.ok(!Zs.get(zn).obstacleSkin, zn + ': ゾーン別の障害物スキンを持たない');
      });
      ['neon', 'space'].forEach((zn) => {
        Zs.switchTo(zn); DUO.pump(1 / 60);
        t.eq(Zs.skin(), ObstacleSkin, zn + ': 障害物の見た目は共通の1セット');
      });
      /* 同じ型は同じ見た目（プールはゾーンを跨いで使い回す＝同じ物が出てくる） */
      Zs.switchTo('neon'); DUO.pump(1 / 60);
      const a = Ob.acquire('PILLAR'); Ob.release('PILLAR', a);
      Zs.switchTo('sea'); DUO.pump(1 / 60);
      const b = Ob.acquire('PILLAR'); Ob.release('PILLAR', b);
      t.eq(a, b, 'ゾーンを替えても同じ見た目（同じビューを使い回す）');
      Zs.switchTo('neon'); DUO.pump(1 / 60);

      /* 色の規則（契約§4.3「赤・橙・白の警告色のみ」） */
      const bad = [];
      HAZ.forEach((ty) => {
        const v = Ob.acquire(ty);
        v.traverse((q) => {
          if (!q.isMesh || !q.material || !q.material.color) return;
          const hx = q.material.color.getHex();
          if (!warnColor(hx) || hx === CFG.COL.LUMEN || hx === CFG.COL.UMBRA) bad.push(ty + ':#' + hx.toString(16));
        });
        Ob.release(ty, v);
      });
      t.eq(bad.length, 0, '障害物の色は赤・橙・白（＋無彩色）だけ' + (bad.length ? ': ' + bad.slice(0, 6).join(' ') : ''));

      /* ハードル: 太い白×赤縞の発光バー（厚み0.3・幅レーン一杯）。支柱・警告バー・▲は失効 */
      ['ROVER', 'LASER_LOW'].forEach((ty) => {
        const v = Ob.acquire(ty);
        v.position.set(0, 0, 0); v.rotation.set(0, 0, 0); v.updateMatrixWorld(true);
        const all = new THREE.Box3().setFromObject(v);
        t.ok(all.max.y <= OBS[ty].y1 + 0.02, ty + ': 判定の高さ ' + OBS[ty].y1 + ' より上に何も出ていない（支柱・警告バー・▲なし）: ' + all.max.y.toFixed(2));
        t.ok(!v.userData.warnRig, ty + ': P5c の骨格（warnRig）は無い');
        Ob.release(ty, v);
      });
      const hv = Ob.acquire('ROVER');
      const cols = {};
      hv.position.set(0, 0, 0); hv.rotation.set(0, 0, 0); hv.updateMatrixWorld(true);
      const ub = new THREE.Box3(); ub.makeEmpty();
      hv.traverse((q) => {
        if (!q.isMesh || q.userData.deco || q.material.transparent) return;
        cols[q.material.color.getHex()] = 1;
        ub.expandByObject(q);
      });
      const barH = ub.max.y - ub.min.y, barW = ub.max.x - ub.min.x;
      t.ok(cols[0xffffff] && cols[ObstacleSkin.COL.red], 'ハードルは白×赤の縞');
      t.near(barH, 0.30, 0.02, 'ハードルのバーの厚み 0.3');
      t.ok(barW >= CFG.LANE_W - 2 * 0.10 - 0.02, 'ハードルは幅レーン一杯: ' + barW.toFixed(2));
      Ob.release('ROVER', hv);
      /* 判定は不変（OBS） */
      t.eq(OBS.ROVER.y1, 0.60, 'ハードルの判定高さは 0.6 のまま');
      t.eq(OBS.WIDEBAR.span, 2, 'ワイド梁は2レーン封鎖');
      DUO.reset();
    }
  });

  /* 40m 先の障害物の画素と、その周りの背景の輝度差（契約§5「背景より必ず明るい（+40）」） */
  DUO.__suites.push({
    name: 'P7a-1: 障害物は背景より明るい（40m 先・輝度差 +40 以上・全6ゾーン）',
    quick: false,
    run(t) {
      const In = I(), Game = In.Game, W = In.World;
      const SPEC = [['neon', 'S1'], ['ruins', 'S3'], ['sea', 'S5'], ['space', 'S6'], ['mirror', 'S7'], ['core', 'S8']];
      const TYPES = ['ROVER', 'LASER_LOW', 'PILLAR', 'WIDEBAR', 'LASER_V', 'WALLHOLE'];
      const w = 812, h = 375;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const grab = () => { Game._lastDt = 0; Game.render(); cx.drawImage(W.renderer.domElement, 0, 0, w, h); return cx.getImageData(0, 0, w, h).data; };
      const Y = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const rows = [];
      SPEC.forEach((sp) => {
        DUO.reset(); DUO.start(sp[1], 7); DUO.pump(1 / 60);
        DUO.skipTo(420);
        for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
        W.setViewport(w, h, 1);
        TYPES.forEach((ty) => {
          In.clearObstacles();
          const list = (ty === 'WALLHOLE')
            ? [-1, 0, 1].map((l) => In.spawnOne(l === 0 ? 'WALLHOLE' : 'WALLSOLID', 'floor', l, 40))
            : [In.spawnOne(ty, 'floor', ty === 'WIDEBAR' ? -1 : 0, 40)];
          const A = grab().slice();
          const B = (function () {
            /* 障害物だけを消して同じ絵を描く（syncObstacles が visible を戻すので描画の直前に消す） */
            const r0 = W.render;
            W.render = function () { list.forEach((o) => { if (o.view) o.view.visible = false; }); return r0.apply(W, arguments); };
            try { return grab().slice(); } finally { W.render = r0; }
          })();
          /* 障害物の画素 ＝ 障害物を消すと変わる画素。背景 ＝ その外接矩形を 1.6倍ずつ広げた輪の画素
             （障害物の画素を除く）。P5c の決定（投影矩形は背景が混ざるので「障害物の画素」で測る）と同じ流儀 */
          let so = 0, n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
          const mask = new Uint8Array(w * h);
          for (let i = 0, p = 0; i < A.length; i += 4, p++) {
            if (Math.abs(Y(A, i) - Y(B, i)) < 6) continue;
            mask[p] = 1; so += Y(A, i); n++;
            const x = p % w, y = (p / w) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          let sb = 0, nb = 0;
          const pw = (x1 - x0 + 1) * 1.6, ph = (y1 - y0 + 1) * 1.6;
          for (let y = Math.max(0, Math.floor(y0 - ph)); y < Math.min(h, Math.ceil(y1 + ph)); y++) {
            for (let x = Math.max(0, Math.floor(x0 - pw)); x < Math.min(w, Math.ceil(x1 + pw)); x++) {
              const p = y * w + x;
              if (mask[p]) continue;
              sb += Y(B, p * 4); nb++;
            }
          }
          const d = (n && nb) ? so / n - sb / nb : -999;
          rows.push(sp[0] + '/' + ty + ' ' + d.toFixed(0) + '(' + (so / Math.max(1, n)).toFixed(0) + '-' + (sb / Math.max(1, nb)).toFixed(0) + ')');
          t.ok(n > 20 && d >= 40, sp[0] + '/' + ty + ': 40m 先の輝度差 ' + d.toFixed(1) + ' ≥ +40（' + n + 'px）');
        });
        W.resize();
      });
      t.info(rows.join(' / '));
      DUO.reset();
    }
  });
})();
