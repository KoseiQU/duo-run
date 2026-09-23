/* ============================================================================
   tests/test_p4a.js — P4a（ゾーン3「深海」の造形 ／ S4「深海」）

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
      t.ok(!z.obstacleSkin, 'sea: ゾーン別の障害物スキンは持たない（契約§4.3 v2）');
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
      t.eq(W._roadMat.color.getHex(), W.roadColor(z.PAL.road), '路面の色が海底の岩に替わる（無地の暗色へ沈めた色 / 契約§5 v2）');
      t.eq(W._fogBase.color, z.PAL.fog, '演出から戻すときの霧の基準値も更新される');
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, '深海のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      const kinds = {};
      Zs.active().propFields.forEach((f) => { kinds[f.name] = 1; });
      t.ok(Object.keys(kinds).length >= 20, '深海の小物は ' + Object.keys(kinds).length + '種（20種以上）');

      /* 三角形は S1（ネオン都市）比 +30% 以内（契約§3 / P4a のジオラマ規範） */
      const tris = W.renderer.info.render.triangles;
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      const trisS1 = W.renderer.info.render.triangles;
      t.ok(tris <= trisS1 * 1.30,
           '深海の三角形 ' + tris + ' ≤ ネオン(S2)(' + trisS1 + ') の1.30倍（比 ' + (tris / trisS1).toFixed(2) + '）');

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
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
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
                     /* S6: ゲートは ghost、割れた鏡の床は足場＋裂け目を毎フレーム置く（P5a） */
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
     3. 海流ベルト（契約§4.5 / S4）
     ========================================================================== */
  /* （S4: 海流ベルト（… は契約 v2 で失効したギミックの検査のため削除） */
  /* （S4: 浮上足場（… は契約 v2 で失効したギミックの検査のため削除） */
  /* （S4: 色の扉（… は契約 v2 で失効したギミックの検査のため削除） */
  DUO.__suites.push({
    name: 'S4: 定義と不変条件・密度・動作比率（50シード）',
    /* 50シードぶんの生成を回すので runAll 側へ（runQuick ≤20秒 / 契約§7・2026-09-22 P4a） */
    quick: false,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S4');
      t.eq(st0.lengthM, 1600, 'S4 は 1600m（契約§4.4 v2）');
      t.eq(st0.zone, 'sea', 'ゾーンは深海');
      t.near(st0.speedAt(0), 26, 1e-6, '開始 26 m/s');
      t.near(st0.speedAt(1600), 30, 1e-6, '終了 30 m/s');
      t.near(st0.checkpoints[0], 1600 / 3, 1e-6, 'チェックポイント1 は 1/3 地点');
      t.near(st0.checkpoints[1], 3200 / 3, 1e-6, 'チェックポイント2 は 2/3 地点');
      t.eq(st0.setpieces.map((x) => x.id + '@' + x.start).join(','), 'megafish@1400', '終盤の大演出は「巨大魚の通過」（1400m〜）');
      t.near(st0.reactBoth, In.CFG.FAIR.REACT_BOTH_LATE, 1e-9, '両者同時要求の余白は 0.45秒（契約§4.7）');
      const s5 = In.CHUNK_DEFS.filter((c) => c.s5);
      t.ok(s5.length >= 12, 'S4 のチャンクを ' + s5.length + '本 追加（12本以上）');
      t.eq(s5.filter((c) => c.difficulty < 3).length, 0, 'すべて rank3 以上');
      t.ok(s5.filter((c) => c.difficulty === 4).length >= 6,
           'rank4 が ' + s5.filter((c) => c.difficulty === 4).length + '本');
      t.eq(s5.filter((c) => c.cur || c.lift || c.door).length, 0, '海流・浮上足場・色の扉は失効（契約 v2）');

      let bad = 0, spFound = 0, blanks = 0, tips = 0;
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      const half = { a: 0, b: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S4');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1600; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1600);
        const errs = In.Fair.validate(l, st.speedAt,
                                      { startLanes: [0], reactBoth: st.reactBoth });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        blanks += g.log.filter((c) => c.id === '(blank)').length;
        /* P7b: S4 の tip はサメの横断・泡の噴出口の初出だけ（各1回まで） */
        const tp = g.events.filter((e) => e.type === 'tip');
        if (tp.some((e) => ['shark', 'vent'].indexOf(e.params.id) < 0) ||
            tp.filter((e) => e.params.id === 'shark').length > 1 || tp.filter((e) => e.params.id === 'vent').length > 1) tips++;
        const c = In.Fair.countDemands(l, st.speedAt);
        agg.lane += c.lane; agg.jump += c.jump; agg.slide += c.slide; agg.total += c.total;
        /* P5c（契約§4.8 tip の猶予規則）: tip の窓（表示開始〜対象通過後 speed×1.0秒）は
         規則で「対象以外は置かない」区間なので、密度はその窓を除いた区間で測る */
        const tw = In.Fair.tipWindows(g.events);
        half.xa = (half.xa || 0) + In.Fair.tipOverlap(tw, 0, 800);
        half.xb = (half.xb || 0) + In.Fair.tipOverlap(tw, 800, 1600);
        In.Fair.walls(l, st.speedAt).forEach((w) => {
          const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
          if (In.Fair.inTipWindow(tw, w.at)) return;
          if (w.at < 800) half.a += n; else half.b += n;
        });
      }
      t.eq(bad, 0, 'S4 50シードで §4.7 違反なし（大演出区間を含む）');
      t.eq(spFound, 50, '50シードすべてに巨大魚の通過が入る');
      t.eq(blanks, 0, '空白チャンク（生成の詰まり）は0回');
      t.eq(tips, 0, 'S4 の tip はサメ・泡の初出だけ（各1回まで。海流・浮上足場・色の扉は失効）');
      /* 密度（契約§4.7 S4 は 8→12回/100m・±25%） */
      const dens = In.STAGE_DEFS.S4.density;
      t.eq(dens[0] + '-' + dens[1], '8-12', '密度の目安は 8→12回/100m');
      const A = half.a / (50 * 800 - half.xa) * 100, B = half.b / (50 * 800 - half.xb) * 100;
      const wantA = In.U.lerp(dens[0], dens[1], 0.25), wantB = In.U.lerp(dens[0], dens[1], 0.75);
      t.ok(A >= wantA * 0.75 && A <= wantA * 1.25,
           'S4 前半の密度 ' + A.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
      t.ok(B >= wantB * 0.75 && B <= wantB * 1.25,
           'S4 後半の密度 ' + B.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
      /* P5c（契約§4.8）: 新ギミックの初出（ゲート＋直後の猶予＝譜面の一番薄いところ）は
         ほぼ前半に来て、そこが tip の窓として丸ごと測定から外れる。そのぶん前半の「窓の外」が
         相対的に濃く出る（P5c 前の実測でも S4 は 前半→後半 が +2〜3% の僅差だった）。
         「後半が前半を大きく割らない」（−12% まで）で見る。目安 ±25% の判定は上のとおり厳密。 */
      t.ok(B >= A * 0.88, 'S4 密度は後半が前半を大きく割らない（' + A.toFixed(2) + ' → ' + B.toFixed(2) + '・tip の窓を除く）');
      /* 動作比率（契約§4.3） */
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'S4 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S4 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'S4 スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('S4 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' slide=' + agg.slide + ' 計' + agg.total);
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. S4: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: ボット完走（perfect / delay250 × seed 1〜50）',
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
        DUO.reset(); DUO.start('S4', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S4', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S4 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S4 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     8. 大演出「巨大魚の通過」
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 大演出「巨大魚の通過」（発火・画面の半分以上・目玉・中断復元）',
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

      DUO.reset(); DUO.start('S4', 7); DUO.bot('perfect');
      /* 演出の少し手前から実ステップで跨ぐ（直行するとイベントを飛ばす） */
      DUO.skipTo(1340);
      let g = 0;
      while (Game.dist < 1402 && g++ < 4000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'megafish', '1400m で巨大魚の通過が始まる');
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
      const st = In.makeStage('S4');
      const inst = In.Setpieces.build('megafish', 1400, 0, st.speedAt(1400) / In.CFG.REF_SPEED, null);
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
      DUO.reset(); DUO.start('S4', 12); DUO.bot('delay250'); DUO.skipTo(1340);
      g = 0;
      while (Game.dist < 1402 && g++ < 4000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'megafish', '0.25秒遅延のボットでも演出に入る');
      t.eq(runToEndPump(), 'clear', '0.25秒遅延のボットも巨大魚を抜けてゴールする');

      /* --- 中断（リトライ）で完全復元 --- */
      DUO.reset(); DUO.start('S4', 7); DUO.bot('perfect'); DUO.skipTo(1340);
      g = 0;
      while (Game.dist < 1420 && g++ < 4000 && Game.status === 'playing') DUO.pump(1 / 60);
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
     9. S4 の解放・エンドレスのプール
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 解放（S3クリアで解放）・エンドレスのプール・深海ゾーンの選択',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U, Zs = In.Zones, W = In.World;
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2']);
      UI.show('stages');
      let s5 = document.querySelector('[data-ui="stage-S4"]');
      t.eq(s5 && s5.getAttribute('data-unlocked'), '0', 'S3 未クリアでは S4 はロック');
      U.lsSet('cleared', ['S1', 'S2', 'S3']);
      UI.show('stages');
      s5 = document.querySelector('[data-ui="stage-S4"]');
      t.eq(s5 && s5.getAttribute('data-unlocked'), '1', 'S3 をクリアすると S4 が解放される');
      t.ok(s5 && s5.innerHTML.indexOf('準備中') < 0, 'S4 は「準備中」ではなく遊べる');
      const s6 = document.querySelector('[data-ui="stage-S5"]');
      t.eq(s6 && s6.getAttribute('data-unlocked'), '0', 'S5 はまだロック');
      s5.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S4', 'クリックで S4 が始まる');
      t.near(DUO.state().speed, 26, 0.5, 'S4 は 26 m/s から');
      t.eq(Zs.id(), 'sea', 'ゾーンは深海');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, 'S4 のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');

      /* エンドレス: S4 クリアで海流・浮上足場・色の扉が混ざる（契約§4.4） */
      const withS4 = In.endlessPool(['S1', 'S2', 'S3']);   // 旧S4（遺跡・内部）は S3 へ統合
      const withS5 = In.endlessPool(['S1', 'S2', 'S3', 'S4']);
      t.ok(withS5.pool.length > withS4.pool.length,
           'S4 クリアでプールが増える（' + withS4.pool.length + '→' + withS5.pool.length + '）');
      const has = (pool, id) => pool.indexOf(id) >= 0;
      const s5ids = In.CHUNK_DEFS.filter((c) => c.s5).map((c) => c.id);
      t.eq(s5ids.some((id) => has(withS4.pool, id)), false, 'S4 未クリアのエンドレスに S4 の顔は出ない');
      t.eq(s5ids.every((id) => has(withS5.pool, id)), true, 'S4 クリア後は S4 の顔が全部混ざる');
      /* 他のステージへ S4 の顔が漏れない（ゾーンが変わればギミックも変わる / 契約§4.4） */
      ['S1', 'S2', 'S3'].forEach((id) => {
        const pool = In.makeStage(id).chunkPool;
        t.eq(s5ids.some((x) => pool.indexOf(x) >= 0), false, id + ' に S4 の顔は混ざらない');
      });
      /* エンドレス（ネオン）でも S4 の新ギミックの見た目が壊れない */
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4']);
      DUO.reset(); DUO.start('endless', 4);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      ['GAP', 'DROPCEIL', 'CURRENT', 'CURGATE', 'DOOR', 'DOORX', 'LIFTPAD'].forEach((type) => {
        t.eq(In.OBS[type], undefined, type + ' は契約 v2 で失効（判定の型ごと無い）');
      });
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     10. チュートリアル tip（新ギミックの初出）
     ========================================================================== */
  /* （S4: 新ギミックの初出にチュートリアル tip（海流… は契約 v2 で失効したギミックの検査のため削除） */
  /* （S4: 中断・チェックポイント再開（海流… は契約 v2 で失効したギミックの検査のため削除） */
})();
