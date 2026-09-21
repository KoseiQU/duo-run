/* ============================================================================
   tests/test_p4a.js — P4a（ゾーン3「深海」の造形 ／ S5「深海」）

     【P4a-1 造形】
     ・ゾーン切替（neon ⇄ ruins ⇄ sea）でリークしない・パレットと霧が入れ替わる
     ・深海スキンの見た目と当たり判定のズレ ±10%
     ・装飾が 2体の走行空間へ食い込まない／小物 20種以上・前方60mに40個以上
     ・ドローコール ≤300・三角形は S1 比 +30% 以内・sync の1フレーム ≤0.8ms
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;

  /* ==========================================================================
     1. ゾーン切替（契約§6 P4a）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P4a: ゾーン切替（neon ⇄ ruins ⇄ sea）でリークしない・深海のパレットと霧',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Zs = In.Zones, R = W.renderer;
      t.ok(Zs.list().indexOf('sea') >= 0, '深海ゾーンが登録されている: ' + Zs.list().join(','));
      const z = Zs.get('sea');
      t.eq(typeof z.build, 'function', 'sea: build がある');
      t.eq(typeof z.sync, 'function', 'sea: sync がある');
      t.eq(typeof z.propsAhead, 'function', 'sea: propsAhead がある');
      t.ok(!!z.obstacleSkin && typeof z.obstacleSkin.build === 'function', 'sea: 障害物スキンがある');
      ['road', 'roadRough', 'roadMetal', 'skirt', 'metal', 'amber', 'indigo', 'fog'].forEach((k) => {
        t.ok(z.PAL[k] !== undefined, 'sea: PAL.' + k + ' がある');
      });
      /* 床＝琥珀／天井＝藍 はゾーンが変わっても同じ（意味を持つ色） */
      t.eq(z.PAL.amber, Zs.get('neon').PAL.amber, '床の色（琥珀）はゾーンによらず同じ');
      t.eq(z.PAL.indigo, Zs.get('neon').PAL.indigo, '天井の色（藍）はゾーンによらず同じ');

      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const neonFog = W.scene.fog.color.getHex(), neonRoad = W._roadMat.color.getHex();
      const childs0 = W.scene.children.length;

      Zs.switchTo('sea');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(Zs.id(), 'sea', '深海ゾーンへ切り替わる');
      t.eq(W.scene.fog.color.getHex(), z.PAL.fog, '霧が青緑に替わる');
      t.ok(W.scene.fog.far <= 82, '霧は濃い目（far ' + W.scene.fog.far + ' ≤ 82 / 契約§5 深海の距離感）');
      t.eq(W._roadMat.color.getHex(), z.PAL.road, '路面の色が海底の岩に替わる');
      t.eq(W._fogBase.color, z.PAL.fog, '演出から戻すときの霧の基準値も更新される');
      t.eq(In.Obstacles.skinId(), 'sea', '障害物のスキンも深海になる');
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, '深海のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      const kinds = {};
      Zs.active().propFields.forEach((f) => { kinds[f.name] = 1; });
      t.ok(Object.keys(kinds).length >= 20, '深海の小物は ' + Object.keys(kinds).length + '種（20種以上）');

      /* 三角形は S1（ネオン都市）比 +30% 以内（契約§3 / P4a のジオラマ規範） */
      const tris = W.renderer.info.render.triangles;
      DUO.reset(); DUO.start('S1', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      const trisS1 = W.renderer.info.render.triangles;
      t.ok(tris <= trisS1 * 1.30,
           '深海の三角形 ' + tris + ' ≤ S1(' + trisS1 + ') の1.30倍（比 ' + (tris / trisS1).toFixed(2) + '）');

      /* 1フレームの送り出しが 0.8ms 以内（契約 P4a のジオラマ規範） */
      Zs.switchTo('sea');
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) Zs.sync(300 + i * 0.4, i * 0.016, 28);
      const ms = (performance.now() - t0) / 120;
      t.ok(ms <= 0.8, '深海の sync は1フレーム ' + ms.toFixed(3) + 'ms（≤0.8ms）');

      /* 戻す → ネオン都市の値に完全に戻る */
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(W.scene.fog.color.getHex(), neonFog, '霧の色がネオン都市へ戻る');
      t.eq(W._roadMat.color.getHex(), neonRoad, '路面の色が戻る');
      t.eq(W.scene.children.length, childs0, 'シーンの要素数が元通り（' + W.scene.children.length + '）');

      /* --- リーク検査: neon → ruins → sea を3周してもジオメトリが増え続けない --- */
      const cycle = () => {
        ['ruins', 'sea', 'neon'].forEach((id) => {
          Zs.switchTo(id);
          for (let i = 0; i < 5; i++) DUO.pump(1 / 60);
        });
        return { geo: R.info.memory.geometries, tex: R.info.memory.textures,
                 ch: W.scene.children.length, calls: W.drawCalls() };
      };
      const a = cycle(), b = cycle(), c = cycle();
      t.eq(b.geo, c.geo, 'ジオメトリ数が増え続けない（' + a.geo + ' → ' + b.geo + ' → ' + c.geo + '）');
      t.eq(b.ch, c.ch, 'シーンの要素数が増え続けない（' + b.ch + ' → ' + c.ch + '）');
      t.eq(c.tex, 0, 'テクスチャは0枚のまま（契約§3 画像を使わない）');
      t.ok(c.calls <= 300, '往復後のドローコール ' + c.calls + ' ≤ 300');
      const left = Object.keys(In.Obstacles._mat).filter((k) => k.indexOf('sea|') === 0);
      t.eq(left.length, 0, 'ネオンへ戻したあと深海スキンのマテリアルは残っていない（' + left.length + '）');
      t.eq(In.Obstacles._pool.sea, undefined, '深海スキンの見た目プールも捨てられている');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 深海スキンの見た目と判定／装飾が走路に入らない
     ========================================================================== */
  DUO.__suites.push({
    name: 'P4a: 深海スキンの見た目と判定のズレ ±10%・装飾が走路に入らない',
    quick: true,
    run(t) {
      const In = I(), OBS = In.OBS, CFG = In.CFG, Zs = In.Zones;
      DUO.reset(); DUO.start('S2', 2);
      Zs.switchTo('sea');
      DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'sea', '深海のスキンで測る');
      /* 例外（意図的に判定の外へ出る装飾。理由は tests/test_p2a.js の同じ表と同じ）
         ＋ P4a の新ギミック:
           CURRENT/CURGATE … 当たり判定を持たない（流れの矢印だけ）
           DOOR            … 同色＝通れる扉なので当たり判定を持たない
           LIFTPAD         … 沈んだ姿（判定なし）まで含めて彫るので外接箱では測れない
           FISH_TAIL       … 動く部品（bands から毎フレーム置く） */
      const skip = { GAP: ['y', 'z'], WALLHOLE: ['y0'], LASER_SCAN: ['x', 'z'],
                     LASER_ROT: ['x', 'y', 'z'], BRIDGE: ['x', 'y', 'z'],
                     SYNCPAD: ['x', 'y', 'z'], SYNCGAP: ['x', 'y', 'z'], DROPCEIL: ['y', 'z'],
                     CURRENT: ['x', 'y', 'z'], CURGATE: ['x', 'y', 'z'], DOOR: ['x', 'y', 'z'],
                     LIFTPAD: ['y', 'z'], FISH_TAIL: ['x', 'z'] };
      Object.keys(OBS).forEach((type) => {
        const view = In.Obstacles.acquire(type);
        view.position.set(0, 0, 0); view.rotation.set(0, 0, 0); view.updateMatrixWorld(true);
        const b3 = new THREE.Box3().setFromObject(view);
        const o = In.Obstacles.make(type, 'floor', 0, 0, 0, type === 'BRIDGE' ? { bridge: { leadM: 9 } } : null);
        const hb = In.Obstacles.box(o, 0);
        const xc = ((In.Obstacles.laneLo(o) + In.Obstacles.laneHi(o)) / 2) * CFG.LANE_W;
        const ex = skip[type] || [];
        const cmp = (ax, edge, v, h, size) => {
          if (ex.indexOf(ax) >= 0 || ex.indexOf(ax + edge) >= 0) return;
          const tol = Math.max(Math.abs(size) * 0.10, 0.07);
          t.ok(Math.abs(v - h) <= tol,
               '深海 ' + OBS[type].label + ' ' + ax + edge + ': 見た目 ' + v.toFixed(2) +
               ' / 判定 ' + h.toFixed(2) + '（許容±' + tol.toFixed(2) + '）');
        };
        cmp('x', 0, b3.min.x + xc, hb.x0, hb.x1 - hb.x0);
        cmp('x', 1, b3.max.x + xc, hb.x1, hb.x1 - hb.x0);
        cmp('y', 0, b3.min.y, hb.y0, hb.y1 - hb.y0);
        cmp('y', 1, b3.max.y, hb.y1, hb.y1 - hb.y0);
        cmp('z', 0, b3.min.z, hb.z0, hb.z1 - hb.z0);
        cmp('z', 1, b3.max.z, hb.z1, hb.z1 - hb.z0);
        In.Obstacles.release(type, view);
      });
      /* 装飾が 2体の通り道（|x| ≤ レーン端 + 体半幅）へ食い込まない */
      const bad = In.ZoneKit.intrudes(Zs.get('sea'));
      t.eq(bad.length, 0, '深海の装飾は走行空間に入らない: ' +
           bad.map((b) => b.name + '(' + b.over + 'm)').join(', '));
      /* 壁区間と開放区間が交互に来る（契約§5） */
      const zs = Zs.get('sea');
      let wall = 0;
      for (let m = 0; m < 1200; m += 2) if (zs.isWall(m)) wall++;
      const ratio = wall / 600;
      t.ok(ratio > 0.3 && ratio < 0.8, '壁区間は ' + (ratio * 100).toFixed(0) + '%（開放区間と交互）');
      DUO.reset();
    }
  });
})();
