/* ============================================================================
   tests/test_p3a.js — P3a（ゾーン切替の仕組み／古代遺跡／S3／巨岩の追跡）

     ・ゾーン切替（neon → ruins → neon）でリークしない・ドローコールが範囲内
     ・障害物の見た目と当たり判定のズレ ±10% を **スキンごと** に回す
     ・装飾が 2体の走行空間へ食い込まない
     ・崩れる橋の時刻判定（踏んで 0.3秒後は生存 / 0.5秒後は死）
     ・S3 の定義・不変条件・密度・動作比率・新ギミックの出現
     ・S3 をボットが完走する（perfect / delay250 × seed 1〜50）
     ・巨岩の追跡（発火・振り返りカットで画面に映る・減速→圧殺・中断復元）
     ・S3 の解放（S2クリアで解放）とエンドレスのプール
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const runToEnd = (limit) => {
    let g = 0;
    while ((Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 40000)) DUO.__step(1 / 60);
    return Game.status;
  };
  const advanceTo = (m, limit) => {
    let g = 0;
    while (Game.dist < m && (Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 20000)) DUO.pump(1 / 60);
    return Game.dist;
  };

  /* ==========================================================================
     1. ゾーン切替の仕組み（契約§6 P3a）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P3a: ゾーン切替（neon ⇄ ruins）でリークしない・パレットと霧が入れ替わる',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Zs = In.Zones, R = W.renderer;
      t.ok(Zs.list().indexOf('neon') >= 0 && Zs.list().indexOf('ruins') >= 0,
           '登録されているゾーン: ' + Zs.list().join(','));
      /* ゾーンの約束（インターフェース）を満たしているか */
      ['neon', 'ruins'].forEach((id) => {
        const z = Zs.get(id);
        t.eq(typeof z.build, 'function', id + ': build がある');
        t.eq(typeof z.sync, 'function', id + ': sync がある');
        t.eq(typeof z.propsAhead, 'function', id + ': propsAhead がある');
        t.ok(!!z.obstacleSkin && typeof z.obstacleSkin.build === 'function', id + ': 障害物スキンがある');
        ['road', 'roadRough', 'roadMetal', 'skirt', 'metal', 'amber', 'indigo', 'fog'].forEach((k) => {
          t.ok(z.PAL[k] !== undefined, id + ': PAL.' + k + ' がある');
        });
      });
      /* 床＝琥珀／天井＝藍 はゾーンが変わっても同じ（意味を持つ色） */
      t.eq(Zs.get('neon').PAL.amber, Zs.get('ruins').PAL.amber, '床の色（琥珀）はゾーンによらず同じ');
      t.eq(Zs.get('neon').PAL.indigo, Zs.get('ruins').PAL.indigo, '天井の色（藍）はゾーンによらず同じ');

      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(Zs.id(), 'neon', 'S2 はネオン都市');
      const neonFog = W.scene.fog.color.getHex(), neonRoad = W._roadMat.color.getHex();
      const childs0 = W.scene.children.length;

      /* 同じゾーンのステージでは作り直さない（runAll が遅くならない・見た目も飛ばない） */
      const zoneObj = Zs.active();
      DUO.start('S1', 3);
      t.eq(Zs.active(), zoneObj, '同じゾーンのステージ開始ではゾーンを作り直さない');

      /* 切替 → 色・霧・路面がまとめて入れ替わる */
      DUO.reset(); DUO.start('S3', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(Zs.id(), 'ruins', 'S3 は古代遺跡ゾーン');
      t.eq(W.scene.fog.color.getHex(), Zs.get('ruins').PAL.fog, '霧が黄土色に替わる');
      t.ok(W.scene.fog.color.getHex() !== neonFog, '霧の色がネオン都市と違う');
      t.eq(W._roadMat.color.getHex(), Zs.get('ruins').PAL.road, '路面の色が砂岩に替わる');
      t.ok(W._roadMat.roughness > 0.5, '石の路面はざらざら（roughness ' + W._roadMat.roughness + '）');
      t.eq(W._fogBase.color, Zs.get('ruins').PAL.fog, '演出から戻すときの霧の基準値も更新される');
      t.eq(In.Obstacles.skinId(), 'ruins', '障害物のスキンも遺跡になる');
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, '遺跡のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      /* 小物の種類（契約§3「小物20種以上」） */
      const kinds = {};
      Zs.active().propFields.forEach((f) => { kinds[f.name] = 1; });
      t.ok(Object.keys(kinds).length >= 20, '遺跡の小物は ' + Object.keys(kinds).length + '種（20種以上）');

      /* 戻す → ネオン都市の値に完全に戻る */
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(W.scene.fog.color.getHex(), neonFog, '霧の色がネオン都市へ戻る');
      t.eq(W._roadMat.color.getHex(), neonRoad, '路面の色が戻る');
      t.eq(W.scene.children.length, childs0, 'シーンの要素数が元通り（' + W.scene.children.length + '）');

      /* --- リーク検査: 3往復してジオメトリ数が増え続けないこと --- */
      const cycle = () => {
        Zs.switchTo('ruins');
        for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
        Zs.switchTo('neon');
        for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
        return { geo: R.info.memory.geometries, tex: R.info.memory.textures,
                 ch: W.scene.children.length, calls: W.drawCalls() };
      };
      const a = cycle(), b = cycle(), c = cycle();
      t.eq(b.geo, c.geo, 'ジオメトリ数が増え続けない（' + a.geo + ' → ' + b.geo + ' → ' + c.geo + '）');
      t.eq(b.ch, c.ch, 'シーンの要素数が増え続けない（' + b.ch + ' → ' + c.ch + '）');
      t.eq(c.tex, 0, 'テクスチャは0枚のまま（契約§3 画像を使わない）');
      t.ok(c.calls <= 300, '往復後のドローコール ' + c.calls + ' ≤ 300');
      /* 使い終わったスキンのマテリアルは残らない */
      const left = Object.keys(In.Obstacles._mat).filter((k) => k.indexOf('ruins|') === 0);
      t.eq(left.length, 0, 'ネオンへ戻したあと遺跡スキンのマテリアルは残っていない（' + left.length + '）');
      t.eq(In.Obstacles._pool.ruins, undefined, '遺跡スキンの見た目プールも捨てられている');
      /* 切替の繋ぎ（暗転）が仕込まれている */
      t.ok(!!document.getElementById('zonefade'), '切替の暗転レイヤーがある');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 見た目と当たり判定のズレ（スキンごと）／装飾が走行空間を侵さない
     ========================================================================== */
  DUO.__suites.push({
    name: 'P3a: 障害物の見た目と判定のズレ ±10%（遺跡スキン）と、装飾が走路に入らないこと',
    quick: true,
    run(t) {
      const In = I(), OBS = In.OBS, CFG = In.CFG, Zs = In.Zones;
      DUO.reset(); DUO.start('S3', 2); DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'ruins', '遺跡のスキンで測る');
      /* 例外（意図的に判定の外へ出る装飾。test_p2a と同じ考え方）:
         GAP/WALLHOLE/LASER_SCAN/LASER_ROT … ネオンと同じ理由
         BRIDGE … 板（判定の外＝乗っている間は無害）と谷が前後・下へ伸びる */
      /* P4a で足した S5 の新ギミック:
           CURRENT/CURGATE … 当たり判定を持たない（流れの矢印とゲートだけ）
           DOOR            … 同色＝通れる扉なので当たり判定を持たない
           LIFTPAD         … 土台の縁が判定の外へ少し出る（天板は判定どおり）
           FISH_TAIL       … 動く部品（bands から毎フレーム置く / LASER_SCAN と同じ理由） */
      const skip = { GAP: ['y', 'z'], WALLHOLE: ['y0'], LASER_SCAN: ['x', 'z'],
                    WARPGATE: ['x', 'y', 'z'], ZEROGATE: ['x', 'y', 'z'],
                     ZEROFIELD: ['x', 'y', 'z'], NETGATE: ['x', 'y', 'z'],
                     LASER_H: ['x', 'y', 'z'], LASER_DIAG: ['x', 'y', 'z'],
                     LASER_ROT: ['x', 'y', 'z'], BRIDGE: ['x', 'y', 'z'],
                     /* P3b の新ギミック（理由は tests/test_p2a.js の同じ表と同じ） */
                     SYNCPAD: ['x', 'y', 'z'], SYNCGAP: ['x', 'y', 'z'], DROPCEIL: ['y', 'z'],
                     CURRENT: ['x', 'y', 'z'], CURGATE: ['x', 'y', 'z'], DOOR: ['x', 'y', 'z'],
                     LIFTPAD: ['z'], FISH_TAIL: ['x', 'z'] };
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
               '遺跡 ' + OBS[type].label + ' ' + ax + edge + ': 見た目 ' + v.toFixed(2) +
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
      /* 崩れる橋の見た目は「落ちる距離」と一致する（板が消えるのは判定が穴になる所から） */
      const o = In.Obstacles.make('BRIDGE', 'floor', 0, 500, 0, { bridge: { leadM: 9.6 } });
      t.near(In.MOT.bridgeFallAt(o), 500 - OBS.BRIDGE.depth / 2, 1e-9, '落ちる位置＝穴の手前端');
      t.near(In.MOT.bridgeEntry(o), 500 - OBS.BRIDGE.depth / 2 - 9.6, 1e-9, '踏む位置＝そこから leadM 手前');
      t.eq(In.MOT.bridgeFall(o, In.MOT.bridgeEntry(o) + 1), 0, '踏んだ直後は板が落ちていない');
      t.ok(In.MOT.bridgeFall(o, In.MOT.bridgeFallAt(o) + 1) > 0, '落ちる位置を過ぎたら板が落ち始める');

      /* 装飾が 2体の通り道（|x| ≤ レーン端 + 体半幅）へ食い込まない */
      const bad = In.ZoneKit.intrudes(Zs.get('ruins'));
      t.eq(bad.length, 0, '遺跡の装飾は走行空間に入らない: ' +
           bad.map((b) => b.name + '(' + b.over + 'm)').join(', '));
      DUO.reset();
    }
  });

  /* ==========================================================================
     3. 崩れる橋の時刻判定（契約§4.4 S3）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S3: 崩れる橋（踏んで0.3秒後は生存・0.5秒後は死／抜け方はレーン移動かジャンプ）',
    quick: true,
    run(t) {
      const In = I(), MOT = In.MOT;
      /* 板に乗ってから waitSec だけ「何もせず」走り続ける */
      const stay = (waitSec) => {
        DUO.reset(); DUO.start('S3', 5); DUO.skipTo(300);
        In.clearObstacles();
        const lead = Game.speed * In.CFG.BRIDGE.LEAD_T;
        const o = In.Obstacles.make('BRIDGE', 'floor', 0, Game.dist + 60, Game.dist, { bridge: { leadM: lead } });
        Game.active.push(o);
        Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = In.CFG.LANE_T; });
        const entry = MOT.bridgeEntry(o);
        let g = 0;
        while (Game.dist < entry && g++ < 3000 && Game.status === 'playing') DUO.__step(1 / 60);
        const from = Game.dist;
        let sec = 0;
        while (sec < waitSec && g++ < 3000 && Game.status === 'playing') { DUO.__step(1 / 60); sec += 1 / 60; }
        return { alive: Game.status === 'playing', moved: Game.dist - from, killer: Game.killer };
      };
      const a = stay(0.30);
      t.eq(a.alive, true, '踏んで 0.3秒後（' + a.moved.toFixed(1) + 'm）はまだ板の上＝生存');
      const b = stay(0.50);
      t.eq(b.alive, false, '踏んで 0.5秒後はそのレーンの床が落ちている＝死');
      t.eq(b.killer && b.killer.obstacle, 'BRIDGE', '死因は崩れる橋');

      /* レーン移動で抜けられる（踏んだ直後に横へ） */
      DUO.reset(); DUO.start('S3', 5); DUO.skipTo(300);
      In.clearObstacles();
      const lead = Game.speed * In.CFG.BRIDGE.LEAD_T;
      const o = In.Obstacles.make('BRIDGE', 'floor', 0, Game.dist + 60, Game.dist, { bridge: { leadM: lead } });
      Game.active.push(o);
      Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = In.CFG.LANE_T; });
      let g = 0;
      while (Game.dist < MOT.bridgeEntry(o) && g++ < 3000) DUO.__step(1 / 60);
      DUO.touch('bottom', 'right');
      while (Game.dist < o.at + 4 && g++ < 3000 && Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(Game.status, 'playing', '踏んだ直後に横フリックすれば抜けられる');

      /* 判定の中身（GAP と同じ＝跳べば安全・立っていると死・潜っても死） */
      const oo = In.Obstacles.make('BRIDGE', 'floor', 0, 500, 0, { bridge: { leadM: 9.6 } });
      const acts = In.Obstacles.occ(oo).floor.lanes[0];
      t.eq(acts.run, false, '立ったままは落ちる');
      t.eq(acts.jump, true, '跳べば越えられる');
      t.eq(acts.slide, false, '潜っても落ちる');
      t.eq(In.Obstacles.demand(oo, 'floor'), 'jump', '要求はジャンプ（またはレーン移動）');
      t.eq(In.Obstacles.occ(oo).ceil.lanes[0].run, true, '反対の面には効かない');
      t.eq(In.Obstacles.occ(oo).floor.lanes[1].run, true, '隣のレーンは素通りできる');
      /* 速度が変わっても「0.4秒後に落ちる」は一定（生成時に実寸へ伸縮する） */
      const st = In.makeStage('S3');
      const sc = st.speedAt(600) / In.CFG.REF_SPEED;
      const p = In.scaleParams({ bridge: {} }, sc);
      t.near(p.bridge.leadM / st.speedAt(600), In.CFG.BRIDGE.LEAD_T, 1e-3,
             '落ちるまでの距離 ÷ 速度 = ' + In.CFG.BRIDGE.LEAD_T + '秒（速度によらず一定）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. S3 の定義・不変条件・密度・動作比率
     ========================================================================== */
  DUO.__suites.push({
    name: 'S3: 定義と不変条件・密度・動作比率（50シード）',
    quick: true,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S3');
      t.eq(st0.lengthM, 1200, 'S3 は 1200m');
      t.eq(st0.zone, 'ruins', 'ゾーンは古代遺跡');
      t.near(st0.speedAt(0), 22, 1e-6, '開始 22 m/s');
      t.near(st0.speedAt(1200), 26, 1e-6, '終了 26 m/s');
      t.near(st0.checkpoints[0], 400, 1e-6, 'チェックポイント1 は 400m');
      t.near(st0.checkpoints[1], 800, 1e-6, 'チェックポイント2 は 800m');
      t.eq(st0.setpiece, 'rockchase', '終盤の大演出は「巨岩の追跡」');
      t.near(st0.reactBoth, In.CFG.FAIR.REACT_BOTH_LATE, 1e-9,
             '両者同時要求の余白は S3 以降 ' + In.CFG.FAIR.REACT_BOTH_LATE + '秒（契約§4.7）');

      let bad = 0, spFound = 0, blanks = 0, bridgeSeen = 0, pendSeen = 0, tips = 0;
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      const half = { a: 0, b: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S3');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1200; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1200);
        const errs = In.Fair.validate(l, st.speedAt, { startLanes: [0], reactBoth: st.reactBoth });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        blanks += g.log.filter((c) => c.id === '(blank)').length;
        if (l.some((o) => o.type === 'BRIDGE')) bridgeSeen++;
        if (l.some((o) => o.type === 'LASER_SCAN')) pendSeen++;
        tips += g.events.filter((e) => e.type === 'tip').length;
        const c = In.Fair.countDemands(l, st.speedAt);
        agg.lane += c.lane; agg.jump += c.jump; agg.slide += c.slide; agg.total += c.total;
        In.Fair.walls(l, st.speedAt).forEach((w) => {
          const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
          if (w.at < 600) half.a += n; else half.b += n;
        });
      }
      t.eq(bad, 0, 'S3 50シードで §4.7 違反なし（大演出区間を含む）');
      t.eq(spFound, 50, '50シードすべてに巨岩の追跡が入る');
      t.eq(blanks, 0, '空白チャンク（生成の詰まり）は0回');
      t.ok(bridgeSeen >= 45, '崩れる橋はほぼ毎シード出る（' + bridgeSeen + '/50 シード）');
      t.ok(pendSeen >= 25, '振り子の刃が出る（' + pendSeen + '/50 シード）');
      t.ok(tips >= 50, '新ギミックの初出に tip が撒かれる（計' + tips + '回 / 50シード）');
      /* 密度（契約§4.7 S3 は 6→10回/100m・±25%） */
      const dens = In.STAGE_DEFS.S3.density;
      const A = half.a / 50 / 6, B = half.b / 50 / 6;
      const wantA = In.U.lerp(dens[0], dens[1], 0.25), wantB = In.U.lerp(dens[0], dens[1], 0.75);
      t.ok(A >= wantA * 0.75 && A <= wantA * 1.25,
           'S3 前半の密度 ' + A.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
      t.ok(B >= wantB * 0.75 && B <= wantB * 1.25,
           'S3 後半の密度 ' + B.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
      t.ok(B > A, 'S3 密度は後半のほうが高い（' + A.toFixed(2) + ' → ' + B.toFixed(2) + '）');
      /* 動作比率（契約§4.3） */
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'S3 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S3 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'S3 スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('S3 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' slide=' + agg.slide + ' 計' + agg.total);
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. S3: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S3: ボット完走（perfect / delay250 × seed 1〜50）',
    quick: false,
    run(t) {
      let p = 0, d = 0;
      const pf = [], df = [];
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S3', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S3', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S3 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S3 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     6. 大演出「巨岩の追跡」
     ========================================================================== */
  DUO.__suites.push({
    name: 'S3: 大演出「巨岩の追跡」（発火・画面に映る・減速帯・圧殺・中断復元）',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces, R = In.Setpieces.ROCK;
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      W.setViewport(812, 375, 1);
      DUO.reset(); DUO.start('S3', 7); DUO.bot('perfect');
      DUO.skipTo(960);
      advanceTo(1010);
      t.eq(DUO.state().setpiece, 'rockchase', '1000m で巨岩の追跡が始まる');
      t.eq(document.getElementById('cue').classList.contains('on'), true, 'HUD に予告が出る');
      t.ok(document.getElementById('cue-main').textContent.indexOf('BOULDER') >= 0, '予告の文字は「BOULDER!」');
      const start = Sp.state.startM;

      /* --- 演出区間を走り切りながら「巨岩が画面に映るか」を測る --- */
      let maxCover = 0, coverFrames = 0, frames = 0, minGap = 1e9, maxProx = 0, shadow = 0;
      let g = 0;
      while (Game.status === 'playing' && Game.dist < start + 200 && g++ < 9000) {
        DUO.pump(1 / 60);
        const c = Sp.rockOnScreen();
        frames++;
        if (c > 0.08) coverFrames++;
        if (c > maxCover) maxCover = c;
        minGap = Math.min(minGap, Sp.rockGap());
        maxProx = Math.max(maxProx, Sp.rockProx());
        shadow = Math.max(shadow, Sp.rock.shadows[0].material.opacity);
      }
      t.ok(maxCover >= 0.25, '巨岩が画面の ' + (maxCover * 100).toFixed(0) + '% を覆う瞬間がある（25%以上）');
      t.ok(coverFrames >= 40, '巨岩が大きく映っているフレームが ' + coverFrames + '（' + frames + '中・40以上）');
      t.ok(shadow > 0.2, '前方に巨岩の影が落ちる（濃さ ' + shadow.toFixed(2) + '）');
      t.ok(maxProx > 0.4, '巨岩が迫る（最接近 ' + minGap.toFixed(1) + 'm）');
      t.ok(minGap > R.DEATH, 'ミスがなければ追いつかれない（' + minGap.toFixed(1) + 'm > ' + R.DEATH + 'm）');
      t.eq(runToEnd(), 'clear', '巨岩の追跡を跨いでゴールできる');

      /* --- 振り返りカットの区間には必須動作を置かない（§4.7 を崩さない） --- */
      const def = In.Setpieces.DEFS.rockchase;
      const items = (def.floor || []).concat(def.ceil || []);
      R.LOOKBACK.forEach((w) => {
        const inside = items.filter((e) => e.at > w[0] - 2 && e.at < w[1] + 2);
        t.eq(inside.length, 0, '振り返りカット ' + w[0] + '〜' + w[1] + 'm に障害物はない');
      });
      /* カット明けから最初の障害物まで、視認距離ぶん空いている */
      const st = In.makeStage('S3');
      const spd = st.speedAt(1100);
      const first = items.map((e) => e.at).sort((a, b) => a - b)[0];
      t.ok(first - R.LOOKBACK[0][1] >= spd * In.CFG.FAIR.SEE,
           'カット明け（' + R.LOOKBACK[0][1] + 'm）から最初の障害物（' + first + 'm）まで ' +
           (first - R.LOOKBACK[0][1]).toFixed(0) + 'm ≥ 視認距離 ' + (spd * In.CFG.FAIR.SEE).toFixed(0) + 'm');
      /* 譜面そのものが §4.7 を満たす */
      const inst = In.Setpieces.build('rockchase', 1000, 0);
      const errs = In.Fair.validate(inst.items, st.speedAt, { startLanes: 'any', reactBoth: st.reactBoth });
      t.eq(errs.length, 0, '巨岩の追跡の譜面が §4.7 を満たす: ' + errs.slice(0, 2).join(' | '));

      /* --- 減速帯: 当たっても死なない・速度が -20% --- */
      DUO.reset(); DUO.start('S3', 4); DUO.skipTo(300);
      In.clearObstacles();
      const o = In.spawnOne('SLOWBAND', 'floor', 0, 40);
      Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = In.CFG.LANE_T; });
      let h = 0;
      while (Game.dist < o.at + 3 && h++ < 900 && Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(Game.status, 'playing', '瓦礫の山に当たっても死なない');
      t.ok(Game.slowT > 0, '速度が落ちている（残り ' + Game.slowT.toFixed(2) + '秒）');
      const ratio = Game.speed / Game.stage.speedAt(Game.dist);
      t.ok(Math.abs(ratio - (1 - In.CFG.SLOW.MUL)) < 0.03,
           '速度は ' + (ratio * 100).toFixed(0) + '%（-' + (In.CFG.SLOW.MUL * 100) + '% / 契約§4.4）');
      t.eq(In.OBS.SLOWBAND.harmless, true, '減速帯は無害な障害物として定義されている');
      t.eq(In.Obstacles.demand(In.Obstacles.make('SLOWBAND', 'floor', 0, 100, 0), 'floor'), 'jump',
           '跳び越す要求として §4.7 に数えられる');
      /* 速度が戻る */
      let k = 0;
      while (Game.slowT > 0 && k++ < 600) DUO.__step(1 / 60);
      t.near(Game.speed / Game.stage.speedAt(Game.dist), 1, 0.01, '時間が経つと速度が戻る');

      /* --- 減速が続くと巨岩に追いつかれて死ぬ --- */
      DUO.reset(); DUO.start('S3', 4); DUO.bot('perfect'); DUO.skipTo(960);
      let m = 0;
      while (Sp.id() !== 'rockchase' && m++ < 9000) DUO.__step(1 / 60);
      const gap0 = Sp.rockGap();
      let n = 0;
      while (Game.status === 'playing' && n++ < 4000) {
        Game.slowT = In.CFG.SLOW.T;            // 瓦礫を越え損ね続けた状態
        DUO.__step(1 / 60);
      }
      t.eq(Game.status, 'dying', '減速が続くと追いつかれる');
      t.eq(Game.killer && Game.killer.obstacle, 'BOULDER', '死因は巨岩（' + gap0.toFixed(1) + 'm → 0）');

      /* --- 中断（リトライ / タイトル）で完全復元 --- */
      DUO.reset(); DUO.start('S3', 7); DUO.bot('perfect'); DUO.skipTo(960);
      advanceTo(1030);
      t.eq(DUO.state().setpiece, 'rockchase', 'もう一度 巨岩の追跡に入る');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.eq(Sp.rock.spin.visible, false, '巨岩が消える');
      t.eq(Sp.rock.shadows[0].material.opacity, 0, '巨岩の影が消える');
      t.eq(Sp.rock.shadows[0].visible, false, '影のメッシュも隠れる');
      t.eq(Sp.emberLight.intensity, 0, '巨岩の明かりが消える');
      t.eq(Sp.dust.mat.opacity, 0, '土煙が消える');
      t.eq(Game.slowT, 0, '減速が解除される');
      t.eq(document.getElementById('cue').classList.contains('on'), false, '予告が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '霧の色が戻る');
      t.eq(W._shake, 0, 'カメラ揺れが戻る');
      for (let i = 0; i < 60; i++) DUO.pump(1 / 60);
      t.ok(Math.abs(W.camera.position.z - In.CFG.CAM.Z) < 0.5, 'カメラの位置が戻る（z=' + W.camera.position.z.toFixed(2) + '）');
      t.eq(Sp.lookBack(Game.dist), 0, '振り返りカットが解除される');
      DUO.reset(); W.resize();
    }
  });

  /* ==========================================================================
     7. S3 の解放とエンドレスのプール
     ========================================================================== */
  DUO.__suites.push({
    name: 'S3: 解放ロジック（S2クリアで解放）とエンドレスのプール',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U;
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1']);
      UI.show('stages');
      let s3 = document.querySelector('[data-ui="stage-S3"]');
      t.eq(s3 && s3.getAttribute('data-unlocked'), '0', 'S2 未クリアでは S3 はロック');
      U.lsSet('cleared', ['S1', 'S2']);
      UI.show('stages');
      s3 = document.querySelector('[data-ui="stage-S3"]');
      t.eq(s3 && s3.getAttribute('data-unlocked'), '1', 'S2 をクリアすると S3 が解放される');
      t.ok(s3 && s3.innerHTML.indexOf('準備中') < 0, 'S3 は「準備中」ではなく遊べる');
      const s4 = document.querySelector('[data-ui="stage-S4"]');
      t.eq(s4 && s4.getAttribute('data-unlocked'), '0', 'S4 はまだロック');
      s3.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S3', 'クリックで S3 が始まる');
      t.near(DUO.state().speed, 22, 0.5, 'S3 は 22 m/s から');
      t.eq(In.Zones.id(), 'ruins', 'クリックで始めるとゾーンも遺跡に替わる');

      /* エンドレス: S3 クリアで崩れる橋・振り子の刃が混ざる（契約§4.4） */
      const withS2 = In.endlessPool(['S1', 'S2']);
      const withS3 = In.endlessPool(['S1', 'S2', 'S3']);
      t.ok(withS3.pool.length > withS2.pool.length,
           'S3 クリアでプールが増える（' + withS2.pool.length + '→' + withS3.pool.length + '）');
      const has = (pool, id) => pool.filter((x) => x === id).length > 0;
      const bridgeIds = In.CHUNK_DEFS.filter((c) => c.bridge).map((c) => c.id);
      t.eq(bridgeIds.some((id) => has(withS2.pool, id)), false, 'S3 未クリアのエンドレスに崩れる橋は出ない');
      t.eq(bridgeIds.some((id) => has(withS3.pool, id)), true, 'S3 クリア後は崩れる橋が混ざる');
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     8. チュートリアル tip（新ギミックの初出）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S3: 新ギミックの初出にチュートリアル tip（崩れる橋・振り子の刃）',
    quick: true,
    run(t) {
      const In = I(), Tut = In.Tutorial;
      t.ok(!!Tut.TIPS.bridge, '崩れる橋の文言がある');
      t.ok(!!Tut.TIPS.pendulum, '振り子の刃の文言がある');
      /* 生成器が初出の手前に tip を1回だけ撒く */
      const st = In.makeStage('S3');
      const g = In.createGenerator(st, 3);
      for (let d = 0; d < 1200; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
      const tips = g.events.filter((e) => e.type === 'tip');
      const ids = tips.map((e) => e.params.id);
      t.ok(ids.indexOf('bridge') >= 0, '崩れる橋の tip が撒かれる');
      t.eq(ids.filter((x) => x === 'bridge').length, 1, '同じ tip は1回だけ');
      /* tip は障害物より手前に出る（見てから読む余裕がある） */
      const firstBridge = g.obstacles.filter((o) => o.type === 'BRIDGE').sort((a, b) => a.at - b.at)[0];
      const tipB = tips.filter((e) => e.params.id === 'bridge')[0];
      t.ok(tipB.at < firstBridge.at, 'tip は崩れる橋より手前（' + tipB.at.toFixed(0) + 'm < ' + firstBridge.at.toFixed(0) + 'm）');
      /* 実プレイで表示される */
      DUO.reset(); DUO.start('S3', 3);
      let shown = null, guard = 0;
      while (guard++ < 12000 && Game.dist < 1000) {
        DUO.pump(1 / 60);
        if (Tut.current === 'bridge' || Tut.current === 'pendulum') { shown = Tut.current; break; }
      }
      t.ok(!!shown, '走っていると新ギミックの指示が出る（' + shown + '）');
      const el = document.getElementById('tip');
      t.eq(el.classList.contains('on'), true, '吹き出しが表示状態');
      /* CSS のフェードは実時間で進むので、機械テストでは「表示状態＋大きさ」で見る */
      const rect = el.getBoundingClientRect();
      t.ok(rect.width > 40 && rect.height > 10,
           '吹き出しが実寸を持っている（' + rect.width.toFixed(0) + '×' + rect.height.toFixed(0) + '）');
      t.eq(getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden', true,
           '非表示になっていない');
      const phs = el.querySelectorAll('.ph');
      let badWrap = 0;
      phs.forEach((p) => { if (p.getClientRects().length > 1) badWrap++; });
      t.eq(badWrap, 0, '語の途中で改行していない（' + phs.length + '句）');
      DUO.reset();
    }
  });
})();
