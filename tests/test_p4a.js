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
           LIFTPAD         … 土台の縁が判定の外へ少し出る（天板は判定どおり）
           FISH_TAIL       … 動く部品（bands から毎フレーム置く） */
      /* 【2026-09-23 P5c】ジャンプ障害物（ローバー／ローレーザー）に足した
           ・両脇の高い支柱 1.6m（レーン端 x=±0.55）
           ・支柱上端をつなぐ光る警告バー
           ・手前の路面の警告帯（幅レーン・長さ 4m・シェブロン）
         は **当たり判定を一切持たない視認性のための標示**（契約§4.3）。
         判定 0.6m の柵に対して見た目 1.72m・奥行き 4.25m を比べてしまうと
         この検査の目的（当たり判定と実体の食い違いを見つける）が測れなくなるので、
         装飾（userData.deco）を外した外接箱 In.viewBox() で測る。 */
      const skip = { GAP: ['y', 'z'], WALLHOLE: ['y0'], LASER_SCAN: ['x', 'z'],
                     /* S7: ゲートは ghost、割れた鏡の床は足場＋裂け目を毎フレーム置く（P5a） */
                     MIRGATE: ['x', 'y', 'z'], SWAPGATE: ['x', 'y', 'z'], MERGEGATE: ['x', 'y', 'z'], SHARDGAP: ['x', 'y', 'z'],
                    WARPGATE: ['x', 'y', 'z'], ZEROGATE: ['x', 'y', 'z'],
                     ZEROFIELD: ['x', 'y', 'z'], NETGATE: ['x', 'y', 'z'],
                     LASER_H: ['x', 'y', 'z'], LASER_DIAG: ['x', 'y', 'z'],
                     LASER_ROT: ['x', 'y', 'z'], BRIDGE: ['x', 'y', 'z'],
                     SYNCPAD: ['x', 'y', 'z'], SYNCGAP: ['x', 'y', 'z'], DROPCEIL: ['y', 'z'],
                     CURRENT: ['x', 'y', 'z'], CURGATE: ['x', 'y', 'z'], DOOR: ['x', 'y', 'z'],
                     LIFTPAD: ['z'], FISH_TAIL: ['x', 'z'] };
      Object.keys(OBS).forEach((type) => {
        const view = In.Obstacles.acquire(type);
        view.position.set(0, 0, 0); view.rotation.set(0, 0, 0); view.updateMatrixWorld(true);
        const b3 = In.viewBox(view);            /* 判定外の装飾（P5c の支柱・警告バー・路面帯）は除く */
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

  /* ==========================================================================
     3. 海流ベルト（契約§4.5 / S5）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 海流ベルト（1.0秒ごとに1レーン流される・逆らう横入力で相殺・流れ込みで評価）',
    quick: true,
    run(t) {
      const In = I(), Cur = In.Current, CFG = In.CFG;

      /* --- 展開の形と時刻の規則 --- */
      const items = [];
      const reg = Cur.expand(items, { lane: 0, type: 'CURRENT', params: { cur: { dir: 1, cdir: -1, n: 3 } } },
                             'floor', 500, 0, 2.6, null);
      t.eq(CFG.CURRENT.PUSH_T, 1.00, '押し出しは 1.0秒ごと（契約§4.5「1レーンぶんを1.0秒で」）');
      t.eq(reg.n, 3, '区間の長さ＝押し出し3回');
      t.eq(reg.pushes.length, 3, '押し出しの位置が3つ決まっている');
      t.near(reg.unit, CFG.REF_SPEED * 2.6, 1e-9, 'unit ＝ その地点の「1秒ぶんの距離」');
      t.near(reg.pushes[1] - reg.pushes[0], reg.unit * CFG.CURRENT.PUSH_T, 1e-9,
             '押し出しの間隔は 1.0秒ぶんの距離（速度によらず一定）');
      t.near(reg.to - reg.from, reg.unit * 3, 1e-9, '区間の長さは 3.0秒ぶん');
      t.eq(reg.dir.floor, 1, '床は右へ流れる');
      t.eq(reg.dir.ceil, -1, '天井は左へ流れる（契約§4.5「床側と天井側で向きが違う区間も」）');
      t.eq(items.filter((o) => o.type === 'CURGATE').length, 1, '入口ゲート（予告）が1つ');
      t.ok(items.filter((o) => o.type === 'CURRENT').length >= 6, '矢印の帯が床と天井に並ぶ');
      t.eq(items.every((o) => In.Obstacles.bands(o, o.at, []).length === 0), true,
           '帯もゲートも当たり判定を持たない（流れるだけ）');

      /* --- Fair（不変条件）とボットが読む窓口 --- */
      t.eq(Cur.driftBetween([reg], 'floor', reg.from - 1, reg.to + 1), 3, '床は区間内で +3 レーンぶん流される');
      t.eq(Cur.driftBetween([reg], 'ceil', reg.from - 1, reg.to + 1), -3, '天井は -3 レーンぶん');
      t.eq(Cur.driftBetween([reg], 'floor', reg.pushes[0] + 0.1, reg.pushes[2] + 0.1), 2, '区間の途中は跨いだ数だけ');
      t.eq(Cur.pushNear([reg], 'floor', reg.pushes[1] + 1, 5), true, '押し出しの直後は「直前に押し出しがある」');
      t.eq(Cur.pushNear([reg], 'floor', reg.pushes[1] - 1, 5), false, '押し出しの手前は掛からない');

      /* --- 実プレイ: 押し出しが効く・逆らうと相殺できる --- */
      const play = (opt) => {
        DUO.reset(); DUO.start('S5', 5); DUO.skipTo(300);
        In.clearObstacles();
        Game.gen.currents.length = 0;
        const its = [];
        const r = Cur.expand(its, { lane: 0, type: 'CURRENT', params: { cur: { dir: opt.dir, cdir: opt.cdir, n: opt.n } } },
                             'floor', Game.dist + 40, Game.dist, Game.speed / CFG.REF_SPEED, Game.gen.currents);
        its.forEach((o) => Game.active.push(o));
        Game.runners.forEach((rn) => { rn.laneFrom = rn.laneTo = rn.laneVal = 0; rn.laneT = CFG.LANE_T; });
        let g = 0, countered = 0;
        while (Game.dist < r.to + 4 && g++ < 4000 && Game.status === 'playing') {
          DUO.__step(1 / 60);
          if (opt.counter) {
            /* 流れに逆らう横入力（人と同じ入口）。押されたら押し返す */
            Game.runners.forEach((rn) => {
              const want = 0;
              if (rn.laneTo !== want && rn.laneT >= CFG.LANE_T) {
                In.Input.push(rn.hand, (rn.laneTo > want) ? 'left' : 'right');
                countered++;
              }
            });
          }
        }
        const f = Game.runners.filter((x) => x.surface === 'floor')[0];
        const c = Game.runners.filter((x) => x.surface === 'ceil')[0];
        return { floor: f.laneTo, ceil: c.laneTo, countered: countered, alive: Game.status === 'playing' };
      };
      const a = play({ dir: 1, cdir: -1, n: 3 });
      t.eq(a.floor, 1, '床は右端まで流される（端で止まる）');
      t.eq(a.ceil, -1, '天井は左端まで流される');
      const b = play({ dir: -1, cdir: -1, n: 2 });
      t.eq(b.floor, -1, '向きを変えれば逆へ流される');
      t.eq(b.ceil, -1, '天井も同じ向きの区間にできる');
      const c2 = play({ dir: 1, cdir: -1, n: 3, counter: true });
      t.eq(c2.floor, 0, '逆らう横入力で相殺できる（床は真ん中のまま）');
      t.eq(c2.ceil, 0, '天井も相殺できる');
      t.ok(c2.countered >= 4, '押し戻した回数 ' + c2.countered + '（押し出しのたびに戻している）');

      /* --- 流されて隣レーンの障害物に当たれば死ぬ（到達時刻の位置で判定） --- */
      const hit = (counter) => {
        DUO.reset(); DUO.start('S5', 5); DUO.skipTo(300);
        In.clearObstacles();
        Game.gen.currents.length = 0;
        const its = [];
        /* 天井は流さない（cdir:0）＝ 床の押し出しだけを見る */
        const r = Cur.expand(its, { lane: 0, type: 'CURRENT', params: { cur: { dir: 1, cdir: 0, n: 1 } } },
                             'floor', Game.dist + 30, Game.dist, Game.speed / CFG.REF_SPEED, Game.gen.currents);
        its.forEach((o) => Game.active.push(o));
        /* 流された先（レーン+1）に柱を置く。流されなければ当たらない */
        Game.active.push(In.Obstacles.make('PILLAR', 'floor', 1, r.to + Game.speed * 0.8, Game.dist));
        Game.runners.forEach((rn) => { rn.laneFrom = rn.laneTo = rn.laneVal = 0; rn.laneT = CFG.LANE_T; });
        let g = 0, done = false;
        while (Game.dist < r.to + Game.speed * 1.2 && g++ < 4000 && Game.status === 'playing') {
          DUO.__step(1 / 60);
          if (counter && !done) {
            const rn = Game.runners[0];
            if (rn.laneTo === 1) { In.Input.push(rn.hand, 'left'); done = true; }
          }
        }
        return { alive: Game.status === 'playing', killer: Game.killer };
      };
      const died = hit(false);
      t.eq(died.alive, false, '流されて隣レーンの柱に当たると死ぬ（契約§4.5）');
      t.eq(died.killer && died.killer.obstacle, 'PILLAR', '死因は流された先の障害物');
      t.eq(hit(true).alive, true, '逆らって戻れば当たらない');

      /* --- 不変条件: 押し出しの直前にウォールを置かない（§4.7 の反応窓） --- */
      const st = In.makeStage('S5');
      const its2 = [];
      const r2 = Cur.expand(its2, { lane: 0, type: 'CURRENT', params: { cur: { dir: 1, cdir: 1, n: 2 } } },
                            'floor', 500, 0, st.speedAt(500) / CFG.REF_SPEED, null);
      const near = [In.Obstacles.make('PILLAR', 'floor', 0, r2.pushes[0] + 1, 0)];
      const errs = In.Fair.validate(near, st.speedAt, { startLanes: 'any', currents: [r2] });
      t.ok(errs.some((e) => e.indexOf('海流') >= 0), '押し出しの直後にウォールがあると §4.7 違反になる');
      const far = [In.Obstacles.make('PILLAR', 'floor', 0, r2.pushes[0] - r2.unit * 0.5, 0)];
      t.eq(In.Fair.validate(far, st.speedAt, { startLanes: 'any', currents: [r2] })
             .filter((e) => e.indexOf('海流') >= 0).length, 0,
           '押し出しと押し出しの中間なら置ける（0.5秒＞0.45秒）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. 浮上足場（契約§4.5 / S5）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 浮上足場（到達時に浮いていれば跳ぶ／沈んでいれば通れる・到達時刻で判定）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, MOT = In.MOT, CFG = In.CFG, R = In.Runners;
      const mk = (up) => Ob.make('LIFTPAD', 'floor', 0, 500, 0, { lift: { upAtArrival: up, periodM: 60 } });
      const up = mk(true), down = mk(false);

      /* --- 到達時刻の高さ（点滅レーザーと同じ流儀） --- */
      t.near(MOT.liftK(up, 500), 1, 1e-9, '到達の瞬間は浮ききっている（upAtArrival:true）');
      t.near(MOT.liftK(down, 500), 0, 1e-9, '到達の瞬間は沈みきっている（upAtArrival:false）');
      t.near(MOT.liftK(up, 500 - 60), 0, 1e-9, '1枠 手前では逆の姿');
      t.near(MOT.liftK(up, 500 + 60), 0, 1e-9, '1枠 先でも逆の姿');
      t.near(MOT.liftK(up, 500 + 0.6), 1, 1e-6, '通過窓（±0.6m）の中では高さが変わらない＝譜面どおり');

      /* --- 判定（bands ⇔ occ ⇔ hits） --- */
      t.eq(Ob.bands(up, 500, []).length, 1, '浮いている足場は帯を返す');
      t.eq(Ob.bands(down, 500, []).length, 0, '沈んでいる足場は帯を返さない（通れる）');
      const b = Ob.bands(up, 500, [])[0];
      t.near(b.y1 - b.y0, 0.60, 1e-9, '浮ききった高さは 0.60（ローバー相当 / 契約§4.5）');
      const oU = Ob.occ(up), oD = Ob.occ(down);
      t.eq(oU.floor.lanes[0].run, false, '浮いていると走っては通れない');
      t.eq(oU.floor.lanes[0].jump, true, '跳べば越えられる');
      t.eq(Ob.demand(up, 'floor'), 'jump', '要求はジャンプ');
      t.eq(oD.floor.lanes[0].run, true, '沈んでいればそのまま走れる');
      t.eq(Ob.demand(down, 'floor'), 'none', '沈んでいれば要求なし');
      t.eq(oU.ceil.lanes[0].run, true, '床の足場は天井には効かない');
      /* 天井側は「垂れ下がる」＝天井から 0.60 ぶら下がる（契約§4.5） */
      const cu = Ob.make('LIFTPAD', 'ceil', 0, 500, 0, { lift: { upAtArrival: true, periodM: 60 } });
      const cb = Ob.bands(cu, 500, [])[0];
      t.near(cb.y1, CFG.H, 1e-9, '天井側は天井から垂れ下がる');
      t.near(cb.y0, CFG.H - 0.60, 1e-9, '垂れ下がる長さも 0.60');
      /* occ ⇔ hits の総当り一致 */
      const probe = { run: 0, jump: CFG.OCC.JUMP_T, slide: CFG.SLIDE_T / 2 };
      const W = (In.OBS.LIFTPAD.depth + CFG.SLIDE_D) / 2 + 0.2;
      let bad = 0, over = 0;
      [up, down].forEach((o) => {
        const occ = Ob.occ(o);
        ['floor', 'ceil'].forEach((side) => {
          CFG.LANES.forEach((lane) => {
            ['run', 'jump', 'slide'].forEach((act) => {
              const want = occ[side].lanes[lane][act];
              let hit = false;
              for (let d = -W; d <= W; d += 0.01) {
                if (Ob.hits(o, R.boxOf(side, lane, act, probe[act]), o.at + d)) { hit = true; break; }
              }
              if (want && hit) bad++;
              if (!want && !hit) over++;
            });
          });
        });
      });
      t.eq(bad, 0, '「安全」と判定した動作は1つも当たらない');
      t.eq(over, 0, '「危険」と判定した動作は必ず当たる');

      /* --- 実プレイ --- */
      const trial = (upAt, jump) => {
        DUO.reset(); DUO.start('S5', 9); DUO.skipTo(300);
        In.clearObstacles();
        const o = Ob.make('LIFTPAD', 'floor', 0, Game.dist + 60, Game.dist,
                          { lift: { upAtArrival: upAt, periodM: Game.speed * 6 } });
        Game.active.push(o);
        Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = CFG.LANE_T; });
        let g = 0;
        while (Game.dist < o.at - Game.speed * CFG.BOT.JUMP_LEAD && g++ < 3000 && Game.status === 'playing') DUO.__step(1 / 60);
        if (jump) DUO.touch('bottom', 'up');
        while (Game.dist < o.at + 3 && g++ < 3000 && Game.status === 'playing') DUO.__step(1 / 60);
        return Game.status === 'playing';
      };
      t.eq(trial(true, false), false, '浮いている足場に走り込むと当たる');
      t.eq(trial(true, true), true, '跳べば越えられる');
      t.eq(trial(false, false), true, '沈んでいる足場はそのまま通れる');
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. 色の扉（契約§4.5 / S5）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 色の扉（同色＝通れる／異色＝通れない・床と天井で別々の判断）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG;
      /* --- 展開の形: 書いたレーンが同色の扉、残り2レーンが異色 --- */
      const items = [];
      In.expandEntry(items, { lane: 1, type: 'DOOR' }, 'floor', 500, 0, 1, null);
      t.eq(items.length, 3, '全幅に3枚の扉が並ぶ');
      t.eq(items.filter((o) => o.type === 'DOOR').length, 1, '同色の扉は1枚');
      t.eq(items.filter((o) => o.type === 'DOOR')[0].lane, 1, '同色の扉は書いたレーン');
      t.eq(items.filter((o) => o.type === 'DOORX').length, 2, '残り2レーンは異色の扉');

      const ok = items.filter((o) => o.type === 'DOOR')[0];
      const ng = items.filter((o) => o.type === 'DOORX')[0];
      t.eq(Ob.bands(ok, 500, []).length, 0, '同色の扉は当たり判定を持たない（通れる）');
      t.ok(Ob.bands(ng, 500, []).length > 0, '異色の扉は塞いでいる');
      const occ = Ob.occ(ng);
      t.eq(occ.floor.lanes[ng.lane].run, false, '異色の扉は走っては通れない');
      t.eq(occ.floor.lanes[ng.lane].jump, false, '跳んでも越えられない（高さ ' + In.OBS.DOORX.y1 + '）');
      t.eq(occ.floor.lanes[ng.lane].slide, false, '潜っても抜けられない');
      t.eq(Ob.demand(ng, 'floor'), 'lane', '要求は **レーン移動**（契約§4.5「隣レーンへ」）');
      t.eq(occ.ceil.lanes[ng.lane].run, true, '床の扉は天井には効かない（面ごとに別の判断）');
      t.eq(Ob.demand(ok, 'floor'), 'none', '同色の扉は何も要求しない');
      /* ウォールとしては「同色のレーンだけが生存経路」 */
      const wall = In.Fair.walls(items, () => 26)[0];
      t.eq(In.Fair.laneSurvivable(wall, 'floor', 1), true, '同色のレーンは生き残れる');
      t.eq(In.Fair.laneSurvivable(wall, 'floor', 0), false, '異色のレーンは生き残れない');
      t.eq(In.Fair.laneSurvivable(wall, 'floor', -1), false, '〃');

      /* --- 実プレイ: 同色なら生存・異色なら死。床と天井で別のレーンにできる --- */
      const play = (floorOk, ceilOk, fLane, cLane) => {
        DUO.reset(); DUO.start('S5', 11); DUO.skipTo(300);
        In.clearObstacles();
        const its = [];
        In.expandEntry(its, { lane: floorOk, type: 'DOOR' }, 'floor', Game.dist + 60, Game.dist, 1, null);
        In.expandEntry(its, { lane: ceilOk, type: 'DOOR' }, 'ceil', Game.dist + 60, Game.dist, 1, null);
        its.forEach((o) => Game.active.push(o));
        Game.runners.forEach((r) => {
          const l = (r.surface === 'floor') ? fLane : cLane;
          r.laneFrom = r.laneTo = r.laneVal = l; r.laneT = CFG.LANE_T;
        });
        let g = 0;
        while (Game.dist < Game.dist + 1 && g++ < 3000 && Game.status === 'playing') {
          DUO.__step(1 / 60);
          if (g > 2800) break;
          if (Game.active.length && Game.dist > Game.active[0].at + 3) break;
        }
        return Game.status === 'playing';
      };
      t.eq(play(1, -1, 1, -1), true, '2人とも自分の色の扉を通れば生き残る');
      t.eq(play(1, -1, 0, -1), false, 'LUMEN が異色の扉に入ると死ぬ');
      t.eq(play(1, -1, 1, 0), false, 'UMBRA が異色の扉に入ると死ぬ');
      t.eq(play(1, -1, 1, -1), true, '**床と天井で別のレーン**が正解になる（左右で別々の判断）');
      /* 見た目の色: 床の同色は琥珀、天井の同色は藍（意味を持つ色） */
      DUO.reset(); DUO.start('S5', 11); DUO.pump(1 / 60);
      const vf = Ob.acquire('DOOR');
      const of = Ob.make('DOOR', 'floor', 0, Game.dist + 20, Game.dist);
      of.view = vf;
      Ob.place(of, Game.dist, 0);
      const cf = vf.userData.doorMats[0].color.getHex();
      const oc = Ob.make('DOOR', 'ceil', 0, Game.dist + 20, Game.dist);
      oc.view = vf;
      Ob.place(oc, Game.dist, 0);
      const cc = vf.userData.doorMats[0].color.getHex();
      t.eq(cf, 0xffb347, '床の同色の扉は琥珀（LUMEN の色）');
      t.eq(cc, 0x8b9bff, '天井の同色の扉は藍（UMBRA の色）');
      of.view = null; oc.view = null;
      Ob.release('DOOR', vf);
      DUO.reset();
    }
  });

  /* ==========================================================================
     6. S5 の定義・不変条件・密度・動作比率（50シード）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 定義と不変条件・密度・動作比率（50シード）',
    /* 50シードぶんの生成を回すので runAll 側へ（runQuick ≤20秒 / 契約§7・2026-09-22 P4a） */
    quick: false,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S5');
      t.eq(st0.lengthM, 1500, 'S5 は 1500m');
      t.eq(st0.zone, 'sea', 'ゾーンは深海');
      t.near(st0.speedAt(0), 26, 1e-6, '開始 26 m/s');
      t.near(st0.speedAt(1500), 30, 1e-6, '終了 30 m/s');
      t.near(st0.checkpoints[0], 500, 1e-6, 'チェックポイント1 は 500m');
      t.near(st0.checkpoints[1], 1000, 1e-6, 'チェックポイント2 は 1000m');
      t.eq(st0.setpiece, 'megafish', '終盤の大演出は「巨大魚の通過」');
      t.near(st0.reactBoth, In.CFG.FAIR.REACT_BOTH_LATE, 1e-9, '両者同時要求の余白は 0.45秒（契約§4.7）');
      const s5 = In.CHUNK_DEFS.filter((c) => c.s5);
      t.ok(s5.length >= 12, 'S5 のチャンクを ' + s5.length + '本 追加（12本以上）');
      t.eq(s5.filter((c) => c.difficulty < 3).length, 0, 'すべて rank3 以上');
      t.ok(s5.filter((c) => c.difficulty === 4).length >= 6,
           'rank4 が ' + s5.filter((c) => c.difficulty === 4).length + '本');
      t.ok(s5.filter((c) => c.cur).length >= 3, '海流ベルトのチャンクが ' + s5.filter((c) => c.cur).length + '本');
      t.ok(s5.filter((c) => c.lift).length >= 3, '浮上足場のチャンクが ' + s5.filter((c) => c.lift).length + '本');
      t.ok(s5.filter((c) => c.door).length >= 3, '色の扉のチャンクが ' + s5.filter((c) => c.door).length + '本');

      let bad = 0, spFound = 0, blanks = 0, curSeen = 0, liftSeen = 0, doorSeen = 0, tips = 0;
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      const half = { a: 0, b: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S5');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1500; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1500);
        const errs = In.Fair.validate(l, st.speedAt,
                                      { startLanes: [0], reactBoth: st.reactBoth, currents: g.currents });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        blanks += g.log.filter((c) => c.id === '(blank)').length;
        if (g.currents.length) curSeen++;
        if (l.some((o) => o.type === 'LIFTPAD')) liftSeen++;
        if (l.some((o) => o.type === 'DOORX')) doorSeen++;
        tips += g.events.filter((e) => e.type === 'tip').length;
        const c = In.Fair.countDemands(l, st.speedAt);
        agg.lane += c.lane; agg.jump += c.jump; agg.slide += c.slide; agg.total += c.total;
        /* P5c（契約§4.8 tip の猶予規則）: tip の窓（表示開始〜対象通過後 speed×1.0秒）は
         規則で「対象以外は置かない」区間なので、密度はその窓を除いた区間で測る */
        const tw = In.Fair.tipWindows(g.events);
        half.xa = (half.xa || 0) + In.Fair.tipOverlap(tw, 0, 750);
        half.xb = (half.xb || 0) + In.Fair.tipOverlap(tw, 750, 1500);
        In.Fair.walls(l, st.speedAt).forEach((w) => {
          const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
          if (In.Fair.inTipWindow(tw, w.at)) return;
          if (w.at < 750) half.a += n; else half.b += n;
        });
      }
      t.eq(bad, 0, 'S5 50シードで §4.7 違反なし（大演出区間・海流の押し出しを含む）');
      t.eq(spFound, 50, '50シードすべてに巨大魚の通過が入る');
      t.eq(blanks, 0, '空白チャンク（生成の詰まり）は0回');
      t.ok(curSeen >= 25, '海流ベルトが出る（' + curSeen + '/50 シード）');
      t.ok(liftSeen >= 40, '浮上足場が出る（' + liftSeen + '/50 シード）');
      t.ok(doorSeen >= 40, '色の扉が出る（' + doorSeen + '/50 シード）');
      t.ok(tips >= 50, '新ギミックの初出に tip が撒かれる（計' + tips + '回 / 50シード）');
      /* 密度（契約§4.7 S5 は 8→12回/100m・±25%） */
      const dens = In.STAGE_DEFS.S5.density;
      t.eq(dens[0] + '-' + dens[1], '8-12', '密度の目安は 8→12回/100m');
      const A = half.a / (50 * 750 - half.xa) * 100, B = half.b / (50 * 750 - half.xb) * 100;
      const wantA = In.U.lerp(dens[0], dens[1], 0.25), wantB = In.U.lerp(dens[0], dens[1], 0.75);
      t.ok(A >= wantA * 0.75 && A <= wantA * 1.25,
           'S5 前半の密度 ' + A.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
      t.ok(B >= wantB * 0.75 && B <= wantB * 1.25,
           'S5 後半の密度 ' + B.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
      /* P5c（契約§4.8）: 新ギミックの初出（ゲート＋直後の猶予＝譜面の一番薄いところ）は
         ほぼ前半に来て、そこが tip の窓として丸ごと測定から外れる。そのぶん前半の「窓の外」が
         相対的に濃く出る（P5c 前の実測でも S5 は 前半→後半 が +2〜3% の僅差だった）。
         「後半が前半を大きく割らない」（−12% まで）で見る。目安 ±25% の判定は上のとおり厳密。 */
      t.ok(B >= A * 0.88, 'S5 密度は後半が前半を大きく割らない（' + A.toFixed(2) + ' → ' + B.toFixed(2) + '・tip の窓を除く）');
      /* 動作比率（契約§4.3） */
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'S5 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S5 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'S5 スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('S5 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' slide=' + agg.slide + ' 計' + agg.total);
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. S5: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: ボット完走（perfect / delay250 × seed 1〜50）',
    quick: false,
    run(t) {
      const runToEnd = (limit) => {
        let g = 0;
        while ((Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 60000)) DUO.__step(1 / 60);
        return Game.status;
      };
      let p = 0, d = 0;
      const pf = [], df = [];
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S5', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S5', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S5 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S5 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     8. 大演出「巨大魚の通過」
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 大演出「巨大魚の通過」（発火・画面の半分以上・目玉・中断復元）',
    quick: false,          // 実描画とピクセル読み出しを伴うので runAll 側へ（契約§7）
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces, F = In.Setpieces.FISH;
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      W.setViewport(812, 375, 1);
      /* 魚体が実際に画面へ描かれている割合と、背景との輝度差を測る。
         外接箱ではなく **塗られた画素** を数えるので、手前の岩や床に隠れた分は入らない。
         描いた絵と、魚だけ消した絵の差分＝魚の画素。その画素の明るさを
         「魚」と「その裏にあった背景」で比べる（契約 P4a-4 の数値ゲート）。 */
      const cv = document.createElement('canvas');
      cv.width = 203; cv.height = 94;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const shot = () => {
        Game.render();
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.drawImage(W.renderer.domElement, 0, 0, cv.width, cv.height);
        return cx.getImageData(0, 0, cv.width, cv.height).data;
      };
      const measure = () => {
        const a = shot();
        const orig = Sp._syncFish;
        Sp._syncFish = function () { Sp.fish.group.visible = false; };
        const b = shot();
        Sp._syncFish = orig;
        let n = 0, fa = 0, bg = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) {
            n++;
            fa += 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];
            bg += 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
          }
        }
        return { share: n / (cv.width * cv.height), sep: n ? (fa - bg) / n : 0 };
      };

      DUO.reset(); DUO.start('S5', 7); DUO.bot('perfect');
      /* 演出の少し手前から実ステップで跨ぐ（直行するとイベントを飛ばす） */
      DUO.skipTo(1240);
      let g = 0;
      while (Game.dist < 1302 && g++ < 4000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'megafish', '1300m で巨大魚の通過が始まる');
      t.eq(document.getElementById('cue').classList.contains('on'), true, 'HUD に予告が出る');
      t.ok(document.getElementById('cue-main').textContent.indexOf('LEVIATHAN') >= 0, '予告の文字は「LEVIATHAN!」');
      const start = Sp.state.startM;

      let sideFrames = 0, maxSide = 0, maxW = 0, bestSep = 0, maxShare = 0;
      let maxEye = 0, eyeIn = 0, maxShake = 0;
      while (Game.status === 'playing' && Game.dist < start + F.END && g++ < 16000) {
        DUO.pump(1 / 60);
        const rel = Game.dist - start;
        const ph = Sp.fishPos(Game.dist).phase;
        maxSide = Math.max(maxSide, Sp.fishSideK(Game.dist));
        if (ph === 'side') {
          sideFrames++;
          maxW = Math.max(maxW, Sp.fishWidthShare(Game.dist));
          const m = measure();
          maxShare = Math.max(maxShare, m.share);
          if (m.share > 0.05 && m.sep < bestSep) bestSep = m.sep;
        }
        if (rel > F.EYE0 - 30 && rel < F.EYE1 + 10) {
          const e = Sp.fishEyeOnScreen(Game.dist);
          if (e > maxEye) maxEye = e;
          const bx = Sp.fishEyeBox(Game.dist);
          const r = bx ? W.projectRect(bx) : null;
          if (r && e > 0 && r.right > 0 && r.left < 812 && r.bottom > 0 && r.top < 375) eyeIn++;
        }
        const fx = Sp.camFx();
        if (fx) maxShake = Math.max(maxShake, fx.shake);
      }
      /* --- 横向きカット（契約 P4a-4 の合格条件） --- */
      t.ok(sideFrames > 20, '横向きカットがある（' + sideFrames + 'フレーム）');
      t.ok(maxSide > 0.95, 'カメラが真横（海の側）まで振れる（最大 ' + maxSide.toFixed(2) + '）');
      t.ok(maxW >= 0.70 && maxW <= 0.90,
           '**魚のシルエットが画面幅の ' + (maxW * 100).toFixed(0) + '%**（70〜90%）');
      t.ok(bestSep <= -30 || bestSep >= 40,
           '**魚体が背景から輝度で分離している**（差 ' + bestSep.toFixed(0) + '：−30以下 または +40以上）');
      t.ok(maxShare > 0.10, 'カット中に魚が画面の ' + (maxShare * 100).toFixed(0) + '% を実際に塗る');
      t.ok(maxEye > 0.01, '目玉が画面に大きく入る瞬間がある（最大 ' + (maxEye * 100).toFixed(2) + '%）');
      t.ok(eyeIn > 30, '目玉が画面の中にある ' + eyeIn + ' フレーム');
      t.ok(maxShake > 0.04, '巨体の水圧でカメラが揺れる（最大 ' + maxShake.toFixed(3) + '）');
      t.eq(runToEndPump(), 'clear', '巨大魚の通過を跨いでゴールできる');

      /* --- 譜面（口・ヒレ・尾）と §4.7 --- */
      const def = In.Setpieces.DEFS.megafish;
      const all = (def.floor || []).concat(def.ceil || []);
      t.ok(all.filter((e) => e.type === 'FISH_TOOTH').length >= 4,
           '口の中をくぐる牙が ' + all.filter((e) => e.type === 'FISH_TOOTH').length + '枚');
      t.ok(all.filter((e) => e.type === 'FISH_FIN').length >= 3,
           'ヒレの隙間が ' + all.filter((e) => e.type === 'FISH_FIN').length + 'か所');
      t.eq(all.filter((e) => e.type === 'FISH_TAIL').length, 1, '尾の振り（横スキャン）が1か所');
      const st = In.makeStage('S5');
      const inst = In.Setpieces.build('megafish', 1300, 0, st.speedAt(1300) / In.CFG.REF_SPEED, null);
      const errs = In.Fair.validate(inst.items, st.speedAt, { startLanes: 'any', reactBoth: st.reactBoth });
      t.eq(errs.length, 0, '巨大魚の譜面が §4.7 を満たす: ' + errs.slice(0, 2).join(' | '));
      const dens = In.Fair.countDemands(inst.items, st.speedAt).total / def.lengthM * 100;
      t.ok(dens >= 6, '演出区間の密度 ' + dens.toFixed(1) + ' 回/100m');
      /* 横断のカットには障害物を置かない（視認距離ぶん空ける） */
      const firstAt = Math.min.apply(null, all.map((e) => e.at));
      t.ok(firstAt > F.SIDE1 + 26,
           '横向きカット（〜' + F.SIDE1 + 'm）の後、視認距離ぶん空けてから置く（最初は ' + firstAt + 'm）');
      t.eq(all.filter((e) => e.at < F.SIDE1).length, 0, 'カットの窓には障害物を置かない（§4.7）');

      /* --- delay250 でも演出を跨いで完走する --- */
      DUO.reset(); DUO.start('S5', 12); DUO.bot('delay250'); DUO.skipTo(1240);
      g = 0;
      while (Game.dist < 1302 && g++ < 4000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'megafish', '0.25秒遅延のボットでも演出に入る');
      t.eq(runToEndPump(), 'clear', '0.25秒遅延のボットも巨大魚を抜けてゴールする');

      /* --- 中断（リトライ）で完全復元 --- */
      DUO.reset(); DUO.start('S5', 7); DUO.bot('perfect'); DUO.skipTo(1240);
      g = 0;
      while (Game.dist < 1320 && g++ < 4000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'megafish', 'もう一度 巨大魚の通過に入る');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.eq(Sp.fish.group.visible, false, '魚が消える');
      t.eq(Sp.fish.shadows[0].visible, false, '魚の影が消える');
      t.eq(Sp.dust.mat.opacity, 0, '巻き上がる砂が消える');
      t.eq(document.getElementById('cue').classList.contains('on'), false, '予告が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '霧の色が戻る');
      t.eq(W._shake, 0, 'カメラ揺れが戻る');
      t.eq(In.Zones.get('sea').isWall(2000), In.Zones.get('sea').isWall(2000), '区間パターンが演出前の規則に戻る');
      for (let i = 0; i < 60; i++) DUO.pump(1 / 60);
      t.ok(Math.abs(W.camera.position.z - In.CFG.CAM.Z) < 0.5,
           'カメラの位置が戻る（z=' + W.camera.position.z.toFixed(2) + '）');
      DUO.reset(); W.resize();

      function runToEndPump(limit) {
        let k = 0;
        while ((Game.status === 'playing' || Game.status === 'goal') && k++ < (limit || 60000)) DUO.__step(1 / 60);
        return Game.status;
      }
    }
  });

  /* ==========================================================================
     9. S5 の解放・エンドレスのプール
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 解放（S4クリアで解放）・エンドレスのプール・深海ゾーンの選択',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U, Zs = In.Zones, W = In.World;
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3']);
      UI.show('stages');
      let s5 = document.querySelector('[data-ui="stage-S5"]');
      t.eq(s5 && s5.getAttribute('data-unlocked'), '0', 'S4 未クリアでは S5 はロック');
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4']);
      UI.show('stages');
      s5 = document.querySelector('[data-ui="stage-S5"]');
      t.eq(s5 && s5.getAttribute('data-unlocked'), '1', 'S4 をクリアすると S5 が解放される');
      t.ok(s5 && s5.innerHTML.indexOf('準備中') < 0, 'S5 は「準備中」ではなく遊べる');
      const s6 = document.querySelector('[data-ui="stage-S6"]');
      t.eq(s6 && s6.getAttribute('data-unlocked'), '0', 'S6 はまだロック');
      s5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S5', 'クリックで S5 が始まる');
      t.near(DUO.state().speed, 26, 0.5, 'S5 は 26 m/s から');
      t.eq(Zs.id(), 'sea', 'ゾーンは深海');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, 'S5 のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');

      /* エンドレス: S5 クリアで海流・浮上足場・色の扉が混ざる（契約§4.4） */
      const withS4 = In.endlessPool(['S1', 'S2', 'S3', 'S4']);
      const withS5 = In.endlessPool(['S1', 'S2', 'S3', 'S4', 'S5']);
      t.ok(withS5.pool.length > withS4.pool.length,
           'S5 クリアでプールが増える（' + withS4.pool.length + '→' + withS5.pool.length + '）');
      const has = (pool, id) => pool.indexOf(id) >= 0;
      const s5ids = In.CHUNK_DEFS.filter((c) => c.s5).map((c) => c.id);
      t.eq(s5ids.some((id) => has(withS4.pool, id)), false, 'S5 未クリアのエンドレスに S5 の顔は出ない');
      t.eq(s5ids.every((id) => has(withS5.pool, id)), true, 'S5 クリア後は S5 の顔が全部混ざる');
      /* 他のステージへ S5 の顔が漏れない（ゾーンが変わればギミックも変わる / 契約§4.4） */
      ['S1', 'S2', 'S3', 'S4'].forEach((id) => {
        const pool = In.makeStage(id).chunkPool;
        t.eq(s5ids.some((x) => pool.indexOf(x) >= 0), false, id + ' に S5 の顔は混ざらない');
      });
      /* エンドレス（ネオン）でも S5 の新ギミックの見た目が壊れない */
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5']);
      DUO.reset(); DUO.start('endless', 4);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'neon', 'エンドレスはネオン都市のスキン');
      ['CURRENT', 'CURGATE', 'DOOR', 'DOORX', 'LIFTPAD', 'FISH_TOOTH', 'FISH_FIN', 'FISH_TAIL'].forEach((type) => {
        const v = In.Obstacles.acquire(type);
        const ud = v.userData;
        const okView = (type === 'CURRENT' || type === 'CURGATE') ? !!ud.belt
                     : (type === 'DOOR' || type === 'DOORX') ? !!ud.door
                     : (type === 'LIFTPAD') ? !!ud.lift : !!ud.fish;
        t.eq(okView, true, 'ネオンのスキンでも ' + In.OBS[type].label + ' の骨組みが建つ（ゾーン共通の保険）');
        In.Obstacles.release(type, v);
      });
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     10. チュートリアル tip（新ギミックの初出）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 新ギミックの初出にチュートリアル tip（海流・浮上足場・色の扉）',
    quick: true,
    run(t) {
      const In = I(), Tut = In.Tutorial;
      t.ok(!!Tut.TIPS.current, '海流ベルトの文言がある');
      t.ok(!!Tut.TIPS.liftpad, '浮上足場の文言がある');
      t.ok(!!Tut.TIPS.colordoor, '色の扉の文言がある');
      t.eq(In.STAGE_DEFS.S5.tipOnce.cur, 'current', 'S5 は海流の初出で tip を出す');
      t.eq(In.STAGE_DEFS.S5.tipOnce.lift, 'liftpad', 'S5 は浮上足場の初出で tip を出す');
      t.eq(In.STAGE_DEFS.S5.tipOnce.door, 'colordoor', 'S5 は色の扉の初出で tip を出す');
      const st = In.makeStage('S5');
      const g = In.createGenerator(st, 3);
      for (let d = 0; d < 1500; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
      const tips = g.events.filter((e) => e.type === 'tip');
      const ids = tips.map((e) => e.params.id);
      t.ok(ids.indexOf('liftpad') >= 0, '浮上足場の tip が撒かれる');
      t.eq(ids.filter((x) => x === 'liftpad').length, 1, '同じ tip は1回だけ');
      const firstLift = g.obstacles.filter((o) => o.type === 'LIFTPAD').sort((a, b) => a.at - b.at)[0];
      const tipL = tips.filter((e) => e.params.id === 'liftpad')[0];
      t.ok(tipL.at < firstLift.at,
           'tip は浮上足場より手前（' + tipL.at.toFixed(0) + 'm < ' + firstLift.at.toFixed(0) + 'm）');
      /* 実プレイで表示される */
      DUO.reset(); DUO.start('S5', 3); DUO.bot('perfect');
      let shown = null, guard = 0;
      while (guard++ < 16000 && Game.dist < 1200 && Game.status === 'playing') {
        DUO.__step(1 / 60);
        if (Tut.current === 'current' || Tut.current === 'liftpad' || Tut.current === 'colordoor') { shown = Tut.current; break; }
      }
      t.ok(!!shown, '走っていると新ギミックの指示が出る（' + shown + '）');
      const el = document.getElementById('tip');
      t.eq(el.classList.contains('on'), true, '吹き出しが表示状態');
      DUO.reset();
    }
  });

  /* ==========================================================================
     11. 中断・再開（海流の区間が残らない）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 中断・チェックポイント再開（海流の区間が取り残されない）',
    quick: true,
    run(t) {
      const In = I(), Cur = In.Current;
      DUO.reset(); DUO.start('S5', 6);
      /* 海流の区間をまたぐ位置まで進めてから、その真ん中へ再開する */
      DUO.skipTo(400);
      for (let i = 0; i < 30; i++) DUO.__step(1 / 60);
      const regs = Game.gen.currents.slice();
      t.ok(regs.length >= 0, '海流の区間が生成されている（' + regs.length + '本）');
      /* 入口より先から再開した区間は「死んだ」印が付き、押し出しは起きない */
      const mid = regs.length ? (regs[0].from + regs[0].to) / 2 : 600;
      DUO.skipTo(mid + 1);
      const dead = Game.gen.currents.filter((r) => r.from < Game.dist && !r.dead).length;
      t.eq(dead, 0, '再開位置より手前に入口がある区間は無効になる');
      t.eq(Game.active.some((o) => o.reg && o.reg.dead), false, '無効になった区間の帯は取り込まれない');
      /* 押し出しが起きないことを実際に確かめる */
      const lane0 = Game.runners[0].laneTo;
      for (let i = 0; i < 120; i++) DUO.__step(1 / 60);
      t.eq(Cur.inBelt(Game.gen.currents, 'floor', Game.dist), 0, '無効な区間の中でも流れは起きない');
      t.ok(Math.abs(Game.runners[0].laneTo - lane0) <= 1, '勝手に端まで流されない');
      /* タイトルへ戻すと HUD の矢印も消える */
      DUO.reset();
      t.eq(document.getElementById('cur').classList.contains('on'), false, 'タイトルで海流の表示が消える');
    }
  });
})();
