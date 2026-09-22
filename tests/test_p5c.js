/* ============================================================================
   tests/test_p5c.js — P5c（実機評の全ステージ適用）
     【P5c-1】ジャンプ障害物（ローバー／ローレーザー）の視認性の骨格（契約§4.3）
       ・全6ゾーンで: 支柱 1.6m（x=±0.55・判定外）・警告バー・路面の警告帯 4m・「▲」アイコン
       ・骨格は userData.deco（判定の外）／判定 OBS は不変
       ・床＝琥珀／天井＝藍、明滅、▲は近づくと縮めて消す、バーは通過直前に畳む
       ・横に避ける障害物は警告枠（全高）＋縞
     ※ 40m 先の投影高さ・輝度差は描画の計測（_audit/p5c/measure.js）で監査する。
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ZONES = ['neon', 'ruins', 'sea', 'space', 'mirror', 'core'];

  DUO.__suites.push({
    name: 'P5c: ジャンプ障害物の視認性の骨格（全6ゾーン・判定外・色・明滅・▲・バー畳み）',
    quick: true,
    run(t) {
      const In = I(), Zs = In.Zones, OBS = In.OBS;
      t.eq(OBS.ROVER.y1, 0.60, 'ローバーの判定高さは 0.6 のまま');
      t.eq(OBS.LASER_LOW.y1, 0.60, 'ローレーザーの判定高さは 0.6 のまま');
      ZONES.forEach((zn) => {
        Zs.switchTo(zn);
        DUO.pump(1 / 60);
        ['ROVER', 'LASER_LOW'].forEach((ty) => {
          const o = In.Obstacles.make(ty, 'floor', 0, 30, 0);
          const v = In.Obstacles.acquire(ty, In.Obstacles.variantOf(o));
          o.view = v;
          const wr = v.userData.warnRig;
          if (!t.ok(!!wr && !!wr.icon && !!wr.bar, zn + '/' + ty + ': 骨格（警告バー・▲）がある')) { In.Obstacles.release(ty, v); return; }
          v.position.set(0, 0, 0); v.rotation.set(0, 0, 0); v.updateMatrixWorld(true);
          /* 判定外の装飾の外接箱（支柱の高さ・位置・路面帯の長さ） */
          const bd = new THREE.Box3(); bd.makeEmpty();
          v.traverse((q) => { if (q.isMesh && q.userData.deco && q !== wr.icon) bd.expandByObject(q); });
          t.near(bd.max.y, 1.67 + 0.075, 0.03, zn + '/' + ty + ': 支柱＋上端の灯の高さ（支柱 1.6m）');
          t.ok(bd.max.z >= 4.0, zn + '/' + ty + ': 手前の路面に警告帯（4m）: ' + (bd.max.z).toFixed(2));
          t.ok(Math.abs(bd.max.x - 0.55 - 0.085 - 0.04) < 0.08, zn + '/' + ty + ': 支柱はレーン端 x=±0.55: ' + bd.max.x.toFixed(2));
          /* 判定の外: 見た目の外接箱（装飾を除く）は判定の高さ付近に収まる */
          const vb = In.viewBox(v);
          t.ok(vb.max.y < 1.0, zn + '/' + ty + ': 装飾を除いた見た目は低い（' + vb.max.y.toFixed(2) + 'm）＝支柱は判定外');
          /* 色（床=琥珀／天井=藍）・明滅・▲・バー */
          const T = [];
          for (let k = 0; k < 40; k++) {
            In.Obstacles.place(o, 0, k * 0.05);
            T.push(wr.mat.color.getHex());
          }
          const uniq = T.filter((c, i) => T.indexOf(c) === i);
          t.ok(uniq.length === 2, zn + '/' + ty + ': 警告バーが明滅する（2段）');
          const c0 = new THREE.Color(0xffcf6a);
          t.ok(uniq.some((c) => c === c0.getHex()), zn + '/' + ty + ': 床は琥珀');
          o.surface = 'ceil';
          In.Obstacles.place(o, 0, 0.0);
          const cc = new THREE.Color(wr.mat.color.getHex());
          t.ok(cc.b > cc.r, zn + '/' + ty + ': 天井は藍');
          o.surface = 'floor';
          In.Obstacles.place(o, 30 - 40, 0);                           // 40m 先
          t.ok(wr.icon.visible && wr.icon.scale.x > 0.99 && wr.bar.scale.y > 0.99, zn + '/' + ty + ': 40m 先で▲とバーが出ている');
          In.Obstacles.place(o, 30 - 5, 0);                            // 5m 先
          t.ok(!wr.icon.visible, zn + '/' + ty + ': 5m 先で▲は消えている（相方の跳躍帯に居座らない）');
          In.Obstacles.place(o, 30 - 1.5, 0);                          // 通過直前
          t.ok(!wr.bar.visible, zn + '/' + ty + ': 通過直前にバーを畳む（跳んだ体が貫通して見えない）');
          o.view = null;
          In.Obstacles.release(ty, v);
        });
        /* 横に避ける障害物の警告枠（全高） */
        ['PILLAR', 'WIDEBAR', 'WALLHOLE', 'LASER_V'].forEach((ty) => {
          const o = In.Obstacles.make(ty, 'floor', 0, 30, 0);
          const v = In.Obstacles.acquire(ty, In.Obstacles.variantOf(o));
          let glow = 0;
          v.traverse((q) => { if (q.isMesh && q.material && q.material.fog === false && !q.userData.deco) glow++; });
          t.ok(glow >= 1, zn + '/' + ty + ': 霧なしの警告枠がある');
          In.Obstacles.release(ty, v);
        });
      });
      Zs.switchTo('neon');
      DUO.pump(1 / 60);
    }
  });
})();
