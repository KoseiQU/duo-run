/* ============================================================================
   tests/test_p3b.js — P3b（S4「古代遺跡・内部」＝同時スイッチ・落ちる天井・神殿崩壊）

     ・同時スイッチ: 0.3秒窓の時刻判定（0.2秒差=成功 / 0.4秒差=失敗）、
       成功で橋が架かる／失敗でも迂回の1レーンが生存経路になる、HUD の予告と成否
     ・落ちる天井: 到達時刻の判定（床＝レーン移動 / 天井＝ジャンプ）、
       予告→落下(0.5秒)→着地のキーフレーム、天井側だけ路面が抜ける
     ・S4 の定義・不変条件・密度・動作比率（50シード）
     ・S4 をボットが完走する（perfect / delay250 × seed 1〜50）
     ・神殿崩壊（発火・倒れる柱が画面に映る・落ちる天井の連鎖・出口・中断復元）
     ・S4 の解放とエンドレスのプール、遺跡ゾーンの「内部」モード
     ・チュートリアル tip（同時スイッチ・落ちる天井の初出）
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
  /* 2体を指定レーンへ置く（補間を終わらせた状態） */
  const putLanes = (floorLane, ceilLane) => {
    Game.runners.forEach((r) => {
      const l = (r.surface === 'floor') ? floorLane : ceilLane;
      r.laneFrom = r.laneTo = r.laneVal = l;
      r.laneT = DUO.__internal.CFG.LANE_T;
      r.act = 'run'; r.actT = 0; r.laneBuf = 0;
    });
  };
  /* 同時スイッチを1つだけ、前方 aheadM に置く（他の障害物は消す） */
  const placeSync = (opt) => {
    const In = I();
    DUO.reset(); DUO.start('S4', 5); DUO.skipTo(300);
    In.clearObstacles();
    Game.gen.syncs.length = 0;
    const items = [];
    const grp = In.Sync.expand(items,
      { lane: opt.fl, type: 'SYNCSW',
        params: { sync: { cl: opt.cl, safe: opt.safe, csafe: opt.csafe, dt: opt.dt || 0,
                          gapT: (opt.gapT === undefined ? 1.3 : opt.gapT) } } },
      'floor', Game.dist + (opt.ahead || 70), Game.dist, Game.speed / In.CFG.REF_SPEED, Game.gen.syncs);
    items.forEach((o) => Game.active.push(o));
    return { grp: grp, items: items };
  };

  /* ==========================================================================
     1. 同時スイッチ — 0.3秒窓の時刻判定と、失敗時の迂回路
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 同時スイッチ（0.2秒差=成功 / 0.4秒差=失敗 / 失敗時は迂回の1レーンが生存経路）',
    quick: true,
    run(t) {
      const In = I(), Sy = In.Sync, CFG = In.CFG, Ob = In.Obstacles;

      /* --- 展開の形（パッド2枚＋橋4枚＝各面で2レーンが谷・1レーンが足場） --- */
      const items = [];
      const grp = Sy.expand(items, { lane: 0, type: 'SYNCSW', params: { sync: { cl: -1, safe: 0, csafe: -1 } } },
                            'floor', 500, 0, 2.6, null);
      t.eq(items.filter((o) => o.type === 'SYNCPAD').length, 2, '対のパッドは床と天井に1枚ずつ');
      t.eq(items.filter((o) => o.type === 'SYNCGAP' && o.surface === 'floor').length, 2,
           '床の橋は2レーンぶん（残り1レーンが迂回の足場）');
      t.eq(items.filter((o) => o.type === 'SYNCGAP' && o.surface === 'ceil').length, 2, '天井も同じ');
      t.eq(items.filter((o) => o.type === 'SYNCGAP' && o.surface === 'floor' && o.lane === 0).length, 0,
           '床の迂回レーン(0)には谷を置かない');
      t.eq(items.filter((o) => o.type === 'SYNCGAP' && o.surface === 'ceil' && o.lane === -1).length, 0,
           '天井の迂回レーン(-1)には谷を置かない');
      t.near(grp.gapAt - grp.padAt, CFG.SYNC.GAP_T * grp.unit, 1e-6,
             '橋はパッドの ' + CFG.SYNC.GAP_T + '秒先（速度によらず一定）');
      t.near(grp.unit, CFG.REF_SPEED * 2.6, 1e-9, 'unit ＝ その地点の「1秒ぶんの距離」');

      /* --- 0.3秒窓（契約§4.5）。ここが時刻規則の唯一の出所 --- */
      const win = (dtSec) => {
        const g2 = Sy.expand([], { lane: 0, type: 'SYNCSW', params: { sync: { cl: 0 } } }, 'floor', 500, 0, 2.6, null);
        g2.floor = 500;
        g2.ceil = 500 + dtSec * g2.unit;
        return Sy.settle(g2, 600);
      };
      t.eq(CFG.SYNC.WINDOW_T, 0.30, '窓は 0.30秒（契約§4.5）');
      t.eq(win(0.0), true, 'ぴったり同時 → 成功');
      t.eq(win(0.2), true, '0.2秒差 → 成功');
      t.eq(win(0.29), true, '0.29秒差 → 成功');
      t.eq(win(0.31), false, '0.31秒差 → 失敗');
      t.eq(win(0.4), false, '0.4秒差 → 失敗');
      /* 片方しか踏まなければ、パッドを通り過ぎた時点で失敗が確定する */
      const g3 = Sy.expand([], { lane: 0, type: 'SYNCSW', params: { sync: { cl: 0 } } }, 'floor', 500, 0, 2.6, null);
      g3.floor = 500;
      t.eq(Sy.settle(g3, 500.5), null, 'パッドの上ではまだ決まらない');
      t.eq(Sy.settle(g3, g3.deadM + 0.1), false, 'パッドを通り過ぎたら失敗');

      /* --- 判定: 成功なら無害／失敗なら跳んでも潜っても抜けられない（＝迂回のみ） --- */
      const gap = items.filter((o) => o.type === 'SYNCGAP' && o.surface === 'floor')[0];
      t.ok(Ob.bands(gap, gap.at, []).length > 0, '未確定のあいだは谷（＝最悪値で見える）');
      grp.ok = true;
      t.eq(Ob.bands(gap, gap.at, []).length, 0, '成功すると橋が架かって当たり判定が消える');
      t.eq(Ob.holeSpan(gap, gap.at), null, '成功すると路面の穴も消える（橋が架かる）');
      grp.ok = false;
      t.ok(Ob.bands(gap, gap.at, []).length > 0, '失敗すると谷のまま');
      t.ok(!!Ob.holeSpan(gap, gap.at), '失敗すると路面が抜ける');
      /* occ（生成器・ボット・不変条件が読む planning の値）は**常に失敗側** */
      grp.ok = true;
      const occ = Ob.occ(gap);
      t.eq(occ.floor.lanes[gap.lane].run, false, 'occ は成功していても「踏み損ねた側」で測る');
      t.eq(occ.floor.lanes[gap.lane].jump, false, '谷は跳んでも越えられない（折れた橋脚）');
      t.eq(occ.floor.lanes[gap.lane].slide, false, '潜っても抜けられない');
      t.eq(Ob.demand(gap, 'floor'), 'lane', '要求はレーン移動＝契約§4.5「レーン移動で迂回路あり」');
      t.eq(occ.floor.lanes[0].run, true, '迂回レーン(0)はそのまま走れる');
      t.eq(occ.ceil.lanes[gap.lane].run, true, '床の谷は天井には効かない');
      grp.ok = null;

      /* --- 実プレイ: 2人で踏む → 橋が架かって渡れる --- */
      const play = (opt) => {
        const s = placeSync(opt);
        putLanes(opt.startF, opt.startC);
        let g = 0;
        while (Game.dist < s.grp.gapAt + 4 && g++ < 4000 && Game.status === 'playing') DUO.__step(1 / 60);
        return { ok: s.grp.ok, alive: Game.status === 'playing', killer: Game.killer,
                 dtSec: (s.grp.floor !== null && s.grp.ceil !== null)
                        ? Math.abs(s.grp.floor - s.grp.ceil) / s.grp.unit : null };
      };
      const both = play({ fl: 1, cl: -1, safe: 1, csafe: -1, startF: 1, startC: -1 });
      t.eq(both.ok, true, '2人ともパッドを踏むと成功（ズレ ' + (both.dtSec || 0).toFixed(3) + '秒）');
      t.eq(both.alive, true, '橋が架かるのでそのまま渡れる');

      const oneOnly = play({ fl: 1, cl: -1, safe: 1, csafe: -1, startF: 1, startC: 1 });
      t.eq(oneOnly.ok, false, '片方が踏まなければ失敗');
      t.eq(oneOnly.alive, false, '失敗したのに谷のレーンに居ると落ちる');
      t.eq(oneOnly.killer && oneOnly.killer.obstacle, 'SYNCGAP', '死因は同時スイッチの橋');

      const detour = play({ fl: 1, cl: -1, safe: 1, csafe: 1, startF: 1, startC: 1 });
      t.eq(detour.ok, false, '天井が別レーンに居るので失敗する');
      t.eq(detour.alive, true, '**失敗しても迂回の細い足場が生存経路になる**（契約§4.5）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 同時スイッチ — HUD の予告と成否の演出
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 同時スイッチの HUD（SYNC! の予告 → 成功/失敗の表示）',
    quick: false,          // 実描画を伴うので runAll 側へ（runQuick ≤20秒 / 契約§7）
    run(t) {
      const In = I();
      const el = () => document.getElementById('sync');
      const run = (opt) => {
        const s = placeSync(opt);
        putLanes(opt.startF, opt.startC);
        const seen = {};
        let g = 0;
        while (Game.dist < s.grp.gapAt + 10 && g++ < 4000 && Game.status === 'playing') {
          DUO.pump(1 / 60);
          const e = el();
          if (e.classList.contains('on')) seen[In.HUD.syncState] = (seen[In.HUD.syncState] || 0) + 1;
        }
        return { seen: seen, ok: s.grp.ok };
      };
      t.ok(!!el(), 'HUD に同時スイッチの帯がある');
      const a = run({ fl: 0, cl: 0, safe: 0, csafe: 0, startF: 0, startC: 0 });
      t.ok(a.seen.cue > 0, 'パッドの手前で「SYNC!」の予告が出る（' + (a.seen.cue || 0) + 'フレーム）');
      t.ok(a.seen.ok > 0, '成功すると「橋が架かった」表示が出る（' + (a.seen.ok || 0) + 'フレーム）');
      t.eq(In.HUD.SYNC_TEXT.cue[0], 'SYNC!', '予告の文字は「SYNC!」');
      const b = run({ fl: 1, cl: -1, safe: 1, csafe: 1, startF: 1, startC: 1 });
      t.ok(b.seen.miss > 0, '失敗すると「迂回しろ」表示が出る（' + (b.seen.miss || 0) + 'フレーム）');
      /* 演出が終われば消える（中断でも必ず消える） */
      Game.retry();
      DUO.pump(1 / 60);
      t.eq(el().classList.contains('on'), false, 'リトライで帯が消える');
      DUO.reset();
    }
  });

  /* ==========================================================================
     3. 落ちる天井 — 床と天井で別の要求になる／キーフレーム
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 落ちる天井（床＝レーン移動 / 天井＝ジャンプ・予告→落下0.5秒→着地）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, MOT = In.MOT, CFG = In.CFG, R = In.Runners;
      const unit = 26;
      const o = Ob.make('DROPCEIL', 'floor', 0, 500, 0, { drop: { unitM: unit } });
      t.eq(o.surface, 'both', '落ちる天井は床にも天井にも効く（both 型）');

      /* --- 1つの事象が床と天井で別の要求になる（契約§6 P3b の要） --- */
      const occ = Ob.occ(o);
      t.eq(occ.floor.lanes[0].run, false, '床: 落ちたブロックに当たる');
      t.eq(occ.floor.lanes[0].jump, false, '床: 跳んでも越えられない（高さ ' + In.OBS.DROPCEIL.y1 + '）');
      t.eq(occ.floor.lanes[0].slide, false, '床: 潜っても抜けられない');
      t.eq(Ob.demand(o, 'floor'), 'lane', '床の要求は **レーン移動**');
      t.eq(occ.ceil.lanes[0].run, false, '天井: 穴が開いているので走っていると落ちる');
      t.eq(occ.ceil.lanes[0].jump, true, '天井: 跳べば穴を越えられる');
      t.eq(Ob.demand(o, 'ceil'), 'jump', '天井の要求は **ジャンプ**');
      t.eq(occ.floor.lanes[1].run, true, '隣のレーンは床も素通りできる');
      t.eq(occ.ceil.lanes[1].run, true, '隣のレーンは天井も素通りできる');
      /* 天井で跳んだ体が、床のブロックに引っかからない（高さの設計） */
      const apex = R.boxOf('ceil', 0, 'jump', CFG.JUMP_T / 2);
      t.ok(apex.y0 > In.OBS.DROPCEIL.y1,
           '天井キャラの最高到達（体の下端 ' + apex.y0.toFixed(2) + '）はブロックの上（' +
           In.OBS.DROPCEIL.y1 + '）より高い');

      /* --- キーフレーム（到達の何秒手前か） --- */
      t.near(MOT.dropLandAt(o), 500 - CFG.DROP.LAND_T * unit, 1e-9,
             '着地は到達の ' + CFG.DROP.LAND_T + '秒手前');
      t.ok(CFG.DROP.LAND_T >= CFG.FAIR.SEE,
           '着地(' + CFG.DROP.LAND_T + '秒) は視認距離(' + CFG.FAIR.SEE + '秒) より手前＝見てから反応できる');
      t.near(MOT.dropLandAt(o) - MOT.dropFallAt(o), CFG.DROP.FALL_T * unit, 1e-9,
             '落下は ' + CFG.DROP.FALL_T + '秒（契約§6 P3b）');
      t.ok(MOT.dropWarnAt(o) < MOT.dropFallAt(o), '予告（ひび・砂）は落下より手前');
      t.eq(MOT.dropFall(o, MOT.dropFallAt(o) - 1), 0, '落ち始める前は落下 0');
      t.eq(MOT.dropFall(o, MOT.dropLandAt(o) + 1), 1, '着地したら落下 1');
      t.near(MOT.dropFall(o, (MOT.dropFallAt(o) + MOT.dropLandAt(o)) / 2), 0.5, 1e-9, '中間は 0.5');
      /* 天井から外れるまでは無害 */
      t.eq(Ob.bands(o, MOT.dropFallAt(o) - 1, []).length, 0, '天井にはまっている間は当たり判定を持たない');
      t.eq(Ob.bands(o, 500, []).length, 2, '外れた後は「床のブロック」と「天井の穴」の2枚');
      /* 路面は天井側だけ抜ける */
      const hs = Ob.holeSpan(o, 500);
      t.eq(hs && hs.side, 'ceil', '抜けるのは**天井側**の路面だけ');
      t.eq(Ob.holeSpan(o, MOT.dropFallAt(o) - 1), null, '落ちる前は天井も抜けていない');

      /* --- occ ⇔ 当たり判定 hits の総当り一致（通過窓を 0.01m 刻みでなめる） --- */
      const probe = { run: 0, jump: CFG.OCC.JUMP_T, slide: CFG.SLIDE_T / 2 };
      const W = (In.OBS.DROPCEIL.depth + CFG.SLIDE_D) / 2 + 0.2;
      let bad = 0, over = 0;
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
      t.eq(bad, 0, '「安全」と判定した動作は1つも当たらない');
      t.eq(over, 0, '「危険」と判定した動作は必ず当たる');

      /* --- 実プレイ: 床はレーン移動・天井はジャンプで抜ける --- */
      const trial = (floorLane, ceilAct) => {
        DUO.reset(); DUO.start('S4', 9); DUO.skipTo(300);
        In.clearObstacles();
        const oo = Ob.make('DROPCEIL', 'floor', 0, Game.dist + 60, Game.dist,
                           { drop: { unitM: Game.speed } });
        Game.active.push(oo);
        putLanes(floorLane, 0);
        let g = 0;
        while (Game.dist < oo.at - Game.speed * CFG.BOT.JUMP_LEAD && g++ < 3000 && Game.status === 'playing') DUO.__step(1 / 60);
        if (ceilAct === 'jump') DUO.touch('top', 'down');
        while (Game.dist < oo.at + 3 && g++ < 3000 && Game.status === 'playing') DUO.__step(1 / 60);
        return { alive: Game.status === 'playing', killer: Game.killer };
      };
      t.eq(trial(1, 'jump').alive, true, '床は隣のレーン・天井はジャンプ → 2人とも抜けられる');
      t.eq(trial(0, 'jump').alive, false, '床が同じレーンに居ると落ちてきたブロックに当たる');
      const c = trial(1, 'run');
      t.eq(c.alive, false, '天井が跳ばないと穴に落ちる');
      t.eq(c.killer && c.killer.obstacle, 'DROPCEIL', '死因は落ちる天井');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. S4 の定義・不変条件・密度・動作比率（50シード）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 定義と不変条件・密度・動作比率（50シード）',
    quick: true,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S4');
      t.eq(st0.lengthM, 1200, 'S4 は 1200m');
      t.eq(st0.zone, 'ruins', 'ゾーンは古代遺跡');
      t.eq(st0.zoneMode, 'inner', '区間パターンは「内部」（壁区間主体 / 契約§4.4）');
      t.near(st0.speedAt(0), 24, 1e-6, '開始 24 m/s');
      t.near(st0.speedAt(1200), 28, 1e-6, '終了 28 m/s');
      t.near(st0.checkpoints[0], 400, 1e-6, 'チェックポイント1 は 400m');
      t.near(st0.checkpoints[1], 800, 1e-6, 'チェックポイント2 は 800m');
      t.eq(st0.setpiece, 'templefall', '終盤の大演出は「神殿崩壊」');
      t.near(st0.reactBoth, In.CFG.FAIR.REACT_BOTH_LATE, 1e-9, '両者同時要求の余白は 0.45秒（契約§4.7）');
      /* チャンクの追加本数（契約§6 P3b「rank3〜4 を中心に10本以上」） */
      const s4 = In.CHUNK_DEFS.filter((c) => c.s4);
      t.ok(s4.length >= 10, 'S4 のチャンクを ' + s4.length + '本 追加（10本以上）');
      t.eq(s4.filter((c) => c.difficulty < 3).length, 0, 'すべて rank3 以上');
      t.ok(s4.filter((c) => c.difficulty === 4).length >= 5,
           'rank4 が ' + s4.filter((c) => c.difficulty === 4).length + '本');
      t.ok(s4.filter((c) => c.sync).length >= 3, '同時スイッチのチャンクが ' + s4.filter((c) => c.sync).length + '本');
      t.ok(s4.filter((c) => c.drop).length >= 4, '落ちる天井のチャンクが ' + s4.filter((c) => c.drop).length + '本');

      let bad = 0, spFound = 0, blanks = 0, syncSeen = 0, dropSeen = 0, tips = 0;
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      const half = { a: 0, b: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S4');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1200; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1200);
        const errs = In.Fair.validate(l, st.speedAt, { startLanes: [0], reactBoth: st.reactBoth });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        blanks += g.log.filter((c) => c.id === '(blank)').length;
        if (l.some((o) => o.type === 'SYNCGAP')) syncSeen++;
        if (l.some((o) => o.type === 'DROPCEIL')) dropSeen++;
        tips += g.events.filter((e) => e.type === 'tip').length;
        const c = In.Fair.countDemands(l, st.speedAt);
        agg.lane += c.lane; agg.jump += c.jump; agg.slide += c.slide; agg.total += c.total;
        /* P5c（契約§4.8 tip の猶予規則）: tip の窓（表示開始〜対象通過後 speed×1.0秒）は
         規則で「対象以外は置かない」区間なので、密度はその窓を除いた区間で測る */
        const tw = In.Fair.tipWindows(g.events);
        half.xa = (half.xa || 0) + In.Fair.tipOverlap(tw, 0, 600);
        half.xb = (half.xb || 0) + In.Fair.tipOverlap(tw, 600, 1200);
        In.Fair.walls(l, st.speedAt).forEach((w) => {
          const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
          if (In.Fair.inTipWindow(tw, w.at)) return;
          if (w.at < 600) half.a += n; else half.b += n;
        });
      }
      t.eq(bad, 0, 'S4 50シードで §4.7 違反なし（大演出区間を含む）');
      t.eq(spFound, 50, '50シードすべてに神殿崩壊が入る');
      t.eq(blanks, 0, '空白チャンク（生成の詰まり）は0回');
      t.ok(syncSeen >= 40, '同時スイッチが出る（' + syncSeen + '/50 シード）');
      t.ok(dropSeen >= 45, '落ちる天井はほぼ毎シード出る（' + dropSeen + '/50 シード）');
      t.ok(tips >= 50, '新ギミックの初出に tip が撒かれる（計' + tips + '回 / 50シード）');
      /* 密度（契約§4.7 S4 は 6→10回/100m・±25%） */
      const dens = In.STAGE_DEFS.S4.density;
      t.eq(dens[0] + '-' + dens[1], '6-10', '密度の目安は 6→10回/100m');
      const A = half.a / (50 * 600 - half.xa) * 100, B = half.b / (50 * 600 - half.xb) * 100;
      const wantA = In.U.lerp(dens[0], dens[1], 0.25), wantB = In.U.lerp(dens[0], dens[1], 0.75);
      t.ok(A >= wantA * 0.75 && A <= wantA * 1.25,
           'S4 前半の密度 ' + A.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
      t.ok(B >= wantB * 0.75 && B <= wantB * 1.25,
           'S4 後半の密度 ' + B.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
      t.ok(B > A, 'S4 密度は後半のほうが高い（' + A.toFixed(2) + ' → ' + B.toFixed(2) + '）');
      /* 動作比率（契約§4.3） */
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'S4 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S4 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'S4 スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('S4 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' slide=' + agg.slide + ' 計' + agg.total);
      /* 「ジャンプ→レーン移動 0.92秒」が S4 の譜面でも効いていること（抜き打ち） */
      const st2 = In.makeStage('S4');
      const g2 = In.createGenerator(st2, 7);
      for (let d = 0; d < 1200; d += 20) g2.ensure(d + In.CFG.SPAWN_AHEAD, d);
      const ws = In.Fair.walls(g2.obstacles.filter((o) => o.at <= 1200), st2.speedAt);
      let minJumpToLane = 1e9;
      In.Fair.SIDES.forEach((side) => {
        let prev = null;
        ws.forEach((w) => {
          if (!w.demand[side]) return;
          if (prev && prev.demand[side] === 'jump' && w.demand[side] !== 'jump') {
            minJumpToLane = Math.min(minJumpToLane, (w.at - prev.atEnd) / st2.speedAt(w.at));
          }
          prev = w;
        });
      });
      t.ok(minJumpToLane >= In.CFG.FAIR.JUMP_TO_LANE - 1e-6,
           'ジャンプ→レーン移動の最小間隔 ' + minJumpToLane.toFixed(3) + '秒 ≥ ' + In.CFG.FAIR.JUMP_TO_LANE + '秒');
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. S4: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: ボット完走（perfect / delay250 × seed 1〜50）と同時スイッチの踏み分け',
    quick: false,
    run(t) {
      let p = 0, d = 0;
      const pf = [], df = [];
      const cnt = { pOk: 0, pMiss: 0, dOk: 0, dMiss: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S4', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
        Game.gen.syncs.forEach((g) => { if (g.ok === true) cnt.pOk++; else if (g.ok === false) cnt.pMiss++; });
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S4', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
        Game.gen.syncs.forEach((g) => { if (g.ok === true) cnt.dOk++; else if (g.ok === false) cnt.dMiss++; });
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S4 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S4 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
      /* 契約§6 P3b: perfect は両者同時踏みができる／delay250 は失敗しても迂回で生存する。
         perfect も「避けるほうが先」のときはパッドを見送る（生存が最優先）ので、
         100% ではなく **delay250 よりはっきり高い成功率** を合格条件にする。 */
      const pRate = cnt.pOk / Math.max(1, cnt.pOk + cnt.pMiss);
      const dRate = cnt.dOk / Math.max(1, cnt.dOk + cnt.dMiss);
      t.ok(pRate >= 0.7, 'perfect は同時スイッチを ' + (pRate * 100).toFixed(0) + '% 成功させる（70%以上）');
      t.ok(pRate > dRate + 0.05,
           'perfect のほうが踏み分けがうまい（perfect ' + (pRate * 100).toFixed(0) +
           '% > delay250 ' + (dRate * 100).toFixed(0) + '%）');
      t.ok(cnt.dMiss > 0, 'delay250 は踏み損ねることがある（失敗 ' + cnt.dMiss + '）＝迂回で生き延びている');
    }
  });

  /* ==========================================================================
     6. 大演出「神殿崩壊」
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 大演出「神殿崩壊」（発火・倒れる柱が画面に映る・落ちる天井の連鎖・出口・中断復元）',
    quick: false,          // 実描画を伴うので runAll 側へ（runQuick ≤20秒 / 契約§7）
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces, T = In.Setpieces.TEMPLE;
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      W.setViewport(812, 375, 1);
      DUO.reset(); DUO.start('S4', 7); DUO.bot('perfect');
      /* 演出の少し手前から実ステップで跨ぐ（直行するとイベントを飛ばす） */
      DUO.skipTo(940);
      advanceTo(1010);
      t.eq(DUO.state().setpiece, 'templefall', '1000m で神殿崩壊が始まる');
      t.eq(document.getElementById('cue').classList.contains('on'), true, 'HUD に予告が出る');
      t.ok(document.getElementById('cue-main').textContent.indexOf('COLLAPSE') >= 0, '予告の文字は「COLLAPSE!」');
      const start = Sp.state.startM;

      /* --- 崩壊が画面で分かるか（倒れる柱の投影矩形が画面内にある） --- */
      let frames = 0, inScreen = 0, maxCov = 0, maxToppling = 0, maxShake = 0, maxExit = 0, dustMax = 0;
      let g = 0;
      while (Game.status === 'playing' && Game.dist < start + 200 && g++ < 12000) {
        DUO.pump(1 / 60);
        frames++;
        const list = Sp.templeColumns(Game.dist);
        maxToppling = Math.max(maxToppling, list.length);
        let best = 0, rect = null;
        for (let i = 0; i < list.length; i++) {
          const c = W.projectCoverage(list[i].box);
          if (c > best) { best = c; rect = W.projectRect(list[i].box); }
        }
        if (rect && rect.right > 0 && rect.left < 812 && rect.bottom > 0 && rect.top < 375) inScreen++;
        maxCov = Math.max(maxCov, best);
        const fx = Sp.camFx();
        if (fx) maxShake = Math.max(maxShake, fx.shake);
        maxExit = Math.max(maxExit, Sp.templeExit(Game.dist));
        dustMax = Math.max(dustMax, Sp.dust.mat.opacity);
      }
      t.ok(inScreen >= frames * 0.5,
           '倒れる柱が画面の中にある ' + inScreen + '/' + frames + ' フレーム（半分以上）');
      t.ok(maxCov > 0.002, '倒れる柱が画面の ' + (maxCov * 100).toFixed(2) + '% を占める瞬間がある');
      t.ok(maxToppling >= 2, '同時に ' + maxToppling + '本が倒れている（次々に倒れる）');
      t.ok(maxShake > 0.04, 'カメラが揺れる（最大 ' + maxShake.toFixed(3) + '）');
      t.ok(dustMax > 0.15, '粉塵が舞う（最大 ' + dustMax.toFixed(2) + '）');
      t.near(maxExit, 1, 1e-6, '最後は出口の光で外へ抜ける');
      t.eq(Sp.temple.glow.visible, true, '出口の光が出ている');
      t.eq(runToEnd(), 'clear', '神殿崩壊を跨いでゴールできる');

      /* --- 譜面（落ちる天井の連鎖・倒れた柱・崩れる出口）と §4.7 --- */
      const def = In.Setpieces.DEFS.templefall;
      const all = (def.floor || []).concat(def.ceil || []);
      t.ok(all.filter((e) => e.type === 'DROPCEIL').length >= 3,
           '落ちる天井が連鎖する（' + all.filter((e) => e.type === 'DROPCEIL').length + '回）');
      t.ok(all.filter((e) => e.type === 'COLUMN').length >= 2,
           '倒れた柱が横断する（' + all.filter((e) => e.type === 'COLUMN').length + '本）');
      t.eq(all.filter((e) => e.type === 'WALLHOLE').length, 1, '最後は崩れる出口を潜り抜ける');
      const exitAt = all.filter((e) => e.type === 'WALLHOLE')[0].at;
      t.ok(exitAt > T.EXIT0, '潜り抜ける出口は「光が差し始めてから」（' + exitAt + 'm > ' + T.EXIT0 + 'm）');
      const st = In.makeStage('S4');
      const inst = In.Setpieces.build('templefall', 1000, 0, st.speedAt(1000) / In.CFG.REF_SPEED, null);
      const errs = In.Fair.validate(inst.items, st.speedAt, { startLanes: 'any', reactBoth: st.reactBoth });
      t.eq(errs.length, 0, '神殿崩壊の譜面が §4.7 を満たす: ' + errs.slice(0, 2).join(' | '));
      const dens = In.Fair.countDemands(inst.items, st.speedAt).total / def.lengthM * 100;
      t.ok(dens >= 6, '演出区間の密度 ' + dens.toFixed(1) + ' 回/100m（S4 の下限 6 以上）');

      /* --- delay250 でも演出を跨いで完走する（§4.7） --- */
      DUO.reset(); DUO.start('S4', 12); DUO.bot('delay250'); DUO.skipTo(940);
      advanceTo(1010);
      t.eq(DUO.state().setpiece, 'templefall', '0.25秒遅延のボットでも演出に入る');
      t.eq(runToEnd(), 'clear', '0.25秒遅延のボットも神殿崩壊を抜けてゴールする');

      /* --- 中断（リトライ）で完全復元 --- */
      DUO.reset(); DUO.start('S4', 7); DUO.bot('perfect'); DUO.skipTo(940);
      advanceTo(1060);
      t.eq(DUO.state().setpiece, 'templefall', 'もう一度 神殿崩壊に入る');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.eq(Sp.temple.cols.visible, false, '倒れる柱が消える');
      t.eq(Sp.temple.beams.visible, false, '落ちる梁が消える');
      t.eq(Sp.temple.glow.visible, false, '出口の光が消える');
      t.eq(Sp.temple.glowMat.opacity, 0, '出口の光の不透明度が 0');
      t.eq(Sp.templeLight.intensity, 0, '崩壊の明かりが消える');
      t.eq(Sp.dust.mat.opacity, 0, '粉塵が消える');
      t.eq(document.getElementById('cue').classList.contains('on'), false, '予告が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '霧の色が戻る');
      t.eq(W._shake, 0, 'カメラ揺れが戻る');
      t.eq(Sp.templeExit(Game.dist), 0, '出口の光の量が 0 に戻る');
      for (let i = 0; i < 60; i++) DUO.pump(1 / 60);
      t.ok(Math.abs(W.camera.position.z - In.CFG.CAM.Z) < 0.5,
           'カメラの位置が戻る（z=' + W.camera.position.z.toFixed(2) + '）');
      DUO.reset(); W.resize();
    }
  });

  /* ==========================================================================
     7. S4 の解放・エンドレスのプール・遺跡ゾーンの「内部」モード
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 解放（S3クリアで解放）・エンドレスのプール・遺跡の「内部」区間',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U, Zs = In.Zones, W = In.World;
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2']);
      UI.show('stages');
      let s4 = document.querySelector('[data-ui="stage-S4"]');
      t.eq(s4 && s4.getAttribute('data-unlocked'), '0', 'S3 未クリアでは S4 はロック');
      U.lsSet('cleared', ['S1', 'S2', 'S3']);
      UI.show('stages');
      s4 = document.querySelector('[data-ui="stage-S4"]');
      t.eq(s4 && s4.getAttribute('data-unlocked'), '1', 'S3 をクリアすると S4 が解放される');
      t.ok(s4 && s4.innerHTML.indexOf('準備中') < 0, 'S4 は「準備中」ではなく遊べる');
      const s5 = document.querySelector('[data-ui="stage-S5"]');
      t.eq(s5 && s5.getAttribute('data-unlocked'), '0', 'S5 はまだロック');
      s4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S4', 'クリックで S4 が始まる');
      t.near(DUO.state().speed, 24, 0.5, 'S4 は 24 m/s から');
      t.eq(Zs.id(), 'ruins', 'ゾーンは古代遺跡');
      t.eq(Zs.get('ruins').mode, 'inner', '区間パターンが「内部」に替わる');

      /* 内部は壁区間が主体（契約§4.4） */
      const ratio = (mode) => {
        Zs.get('ruins').setMode(mode);
        let n = 0;
        for (let m = 0; m < 1200; m += 2) if (Zs.get('ruins').isWall(m)) n++;
        return n / 600;
      };
      const inner = ratio('inner'), outer = ratio('outer');
      t.ok(inner >= 0.8, '内部は壁区間が ' + (inner * 100).toFixed(0) + '%（8割以上）');
      t.ok(outer < 0.7, '外周は壁区間が ' + (outer * 100).toFixed(0) + '%（内部より開けている）');
      t.ok(inner > outer, '内部のほうが壁が多い');
      /* S3 を始めると外周へ戻る */
      DUO.reset(); DUO.start('S3', 3); DUO.pump(1 / 60);
      t.eq(Zs.get('ruins').mode, 'outer', 'S3 に戻ると「外周」に戻る');
      DUO.reset(); DUO.start('S4', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(Zs.get('ruins').mode, 'inner', 'S4 では内部');
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, 'S4 のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      /* ゾーン往復でリークしない（S4 の新スキンを含めて） */
      const R = W.renderer;
      const cycle = () => {
        Zs.switchTo('neon');
        for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
        Zs.switchTo('ruins');
        for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
        return { geo: R.info.memory.geometries, ch: W.scene.children.length, tex: R.info.memory.textures };
      };
      cycle();
      const b = cycle(), c = cycle();
      t.eq(b.geo, c.geo, 'ジオメトリ数が増え続けない（' + b.geo + ' → ' + c.geo + '）');
      t.eq(b.ch, c.ch, 'シーンの要素数が増え続けない（' + b.ch + '）');
      t.eq(c.tex, 0, 'テクスチャは0枚のまま（契約§3）');

      /* エンドレス: S4 クリアで同時スイッチ・落ちる天井が混ざる（契約§4.4） */
      const withS3 = In.endlessPool(['S1', 'S2', 'S3']);
      const withS4 = In.endlessPool(['S1', 'S2', 'S3', 'S4']);
      t.ok(withS4.pool.length > withS3.pool.length,
           'S4 クリアでプールが増える（' + withS3.pool.length + '→' + withS4.pool.length + '）');
      t.eq(withS4.maxRank, 4, 'エンドレスのランク上限が 4 になる');
      const has = (pool, id) => pool.indexOf(id) >= 0;
      const s4ids = In.CHUNK_DEFS.filter((c) => c.s4).map((c) => c.id);
      t.eq(s4ids.some((id) => has(withS3.pool, id)), false, 'S4 未クリアのエンドレスに S4 の顔は出ない');
      t.eq(s4ids.every((id) => has(withS4.pool, id)), true, 'S4 クリア後は S4 の顔が全部混ざる');
      /* エンドレス（ネオン）でも S4 の新ギミックの見た目が壊れない */
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4']);
      DUO.reset(); DUO.start('endless', 4);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      ['SYNCPAD', 'SYNCGAP', 'DROPCEIL'].forEach((type) => {
        const v = In.Obstacles.acquire(type);
        const ud = v.userData;
        const okView = (type === 'SYNCPAD') ? !!ud.pad
                     : (type === 'SYNCGAP') ? !!ud.sync
                     : (type === 'DROPCEIL') ? !!ud.drop : !!ud.column;
        t.eq(okView, true, 'ネオンのスキンでも ' + In.OBS[type].label + ' の骨組みが建つ（ゾーン共通の保険）');
        In.Obstacles.release(type, v);
      });
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     8. チュートリアル tip（新ギミックの初出）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S4: 新ギミックの初出にチュートリアル tip（同時スイッチ・落ちる天井）',
    quick: true,
    run(t) {
      const In = I(), Tut = In.Tutorial;
      t.ok(!!Tut.TIPS.sync, '同時スイッチの文言がある');
      t.ok(!!Tut.TIPS.dropceil, '落ちる天井の文言がある');
      t.eq(In.STAGE_DEFS.S4.tipOnce.sync, 'sync', 'S4 は同時スイッチの初出で tip を出す');
      t.eq(In.STAGE_DEFS.S4.tipOnce.drop, 'dropceil', 'S4 は落ちる天井の初出で tip を出す');
      const st = In.makeStage('S4');
      const g = In.createGenerator(st, 3);
      for (let d = 0; d < 1200; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
      const tips = g.events.filter((e) => e.type === 'tip');
      const ids = tips.map((e) => e.params.id);
      t.ok(ids.indexOf('dropceil') >= 0, '落ちる天井の tip が撒かれる');
      t.eq(ids.filter((x) => x === 'dropceil').length, 1, '同じ tip は1回だけ');
      const firstDrop = g.obstacles.filter((o) => o.type === 'DROPCEIL').sort((a, b) => a.at - b.at)[0];
      const tipD = tips.filter((e) => e.params.id === 'dropceil')[0];
      t.ok(tipD.at < firstDrop.at,
           'tip は落ちる天井より手前（' + tipD.at.toFixed(0) + 'm < ' + firstDrop.at.toFixed(0) + 'm）');
      /* 実プレイで表示される */
      DUO.reset(); DUO.start('S4', 3); DUO.bot('perfect');
      let shown = null, guard = 0;
      while (guard++ < 14000 && Game.dist < 1000 && Game.status === 'playing') {
        DUO.pump(1 / 60);
        if (Tut.current === 'sync' || Tut.current === 'dropceil') { shown = Tut.current; break; }
      }
      t.ok(!!shown, '走っていると新ギミックの指示が出る（' + shown + '）');
      const el = document.getElementById('tip');
      t.eq(el.classList.contains('on'), true, '吹き出しが表示状態');
      const rect = el.getBoundingClientRect();
      t.ok(rect.width > 40 && rect.height > 10,
           '吹き出しが実寸を持っている（' + rect.width.toFixed(0) + '×' + rect.height.toFixed(0) + '）');
      const phs = el.querySelectorAll('.ph');
      let badWrap = 0;
      phs.forEach((p) => { if (p.getClientRects().length > 1) badWrap++; });
      t.eq(badWrap, 0, '語の途中で改行していない（' + phs.length + '句）');
      DUO.reset();
    }
  });
})();
