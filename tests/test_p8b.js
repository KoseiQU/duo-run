/* ============================================================================
   tests/test_p8b.js — P8b: エンドレス仕様（契約 §4.5b）
   ・除外（鏡・重力反転・合体）／世界反転の区画（8秒以上・戻り・1000mに最大1回・区切りに掛けない）
   ・ギミックの均等化（1000m ごとに採用ギミックが全部出る・同じ主ギミック3連続なし）
   ・上下非対称 ≥ 60%（必須動作の数で）・§4.7 の不変条件
   生成器の結果は同じシードなら決定的なので、1回の実行の中では使い回す。
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ALL = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  const L = 5000;
  function withCleared(list, fn) {
    const U = I().U;
    const snap = U.lsSnapshot();
    try { U.lsSet('cleared', list); return fn(); }
    finally { U.lsRestore(snap); }
  }
  /* seed → 生成器（全クリア・5000m）。runAll の中で何度も使うので覚えておく */
  const cache = {};
  function gen(seed) {
    if (cache[seed]) return cache[seed];
    const In = I();
    return withCleared(ALL, () => {
      const st = In.makeStage('endless');
      const g = In.createGenerator(st, seed);
      for (let d = 0; d < L + 200; d += 40) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
      cache[seed] = { st: st, g: g, list: g.obstacles.filter((o) => o.at < L) };
      return cache[seed];
    });
  }
  /* 必須動作の非対称の比（ウォール×面で数える。床と天井の動作が違う＝片面だけ・ジャンプとレーン移動 等） */
  function asym(list, st, g) {
    const walls = I().Fair.walls(list, st.speedAt, { merges: g.merges });
    let a = 0, s = 0;
    walls.forEach((w) => {
      const f = w.demand.floor, c = w.demand.ceil;
      const n = (f ? 1 : 0) + (c ? 1 : 0);
      if (f === c) s += n; else a += n;
    });
    return a / Math.max(1, a + s);
  }
  function timeOf(st, a, b) { let t = 0; for (let m = a; m < b; m += 0.5) t += 0.5 / st.speedAt(m); return t; }

  function checkGimmicks(t, seeds, full) {
    const In = I(), EK = In.EndlessKit;
    const miss = [], run3 = [], flipBad = [], asymLow = [], fair = [], zonesOf = {};
    let asymMin = 1, asymSum = 0, nFlip = 0;
    const occ = {}, mains = {};
    seeds.forEach((seed) => {
      const { st, g, list } = gen(seed);
      /* 1000m ごとに採用ギミックが全部出る（相方・ミニ大演出の障害物も数える） */
      for (let k = 0; k < L / 1000; k++) {
        const set = {};
        list.filter((o) => o.at >= k * 1000 && o.at < (k + 1) * 1000)
          .forEach((o) => EK.gimmicksOfItem(o).forEach((x) => { set[x] = 1; }));
        EK.GIMMICKS.forEach((x) => { if (!set[x]) miss.push('seed' + seed + '@' + k * 1000 + ':' + x); });
      }
      list.forEach((o) => EK.gimmicksOfItem(o).forEach((x) => {
        occ[x] = (occ[x] || 0) + 1;
        (zonesOf[x] || (zonesOf[x] = {}))[g.zoneAt(o.at)] = 1;
      }));
      /* サメはエンドレスから除外（§4.5b 2026-09-27）＝生成にも1匹も出ない */
      list.forEach((o) => { if (o.type === 'SHARK') miss.push('seed' + seed + ' SHARK@' + o.at.toFixed(0)); });
      /* 転がる丸岩もエンドレスから除外（§4.5b 2026-09-28）＝生成に1個も出ない */
      list.forEach((o) => { if (o.type === 'ROCK') miss.push('seed' + seed + ' ROCK@' + o.at.toFixed(0)); });
      /* 同じ主ギミックの札を3枚続けない */
      const units = g.log.filter((l) => l.eg && l.startM < L);
      units.forEach((u) => { mains[u.eg] = (mains[u.eg] || 0) + 1; });
      for (let i = 2; i < units.length; i++) {
        if (units[i].eg === units[i - 1].eg && units[i].eg === units[i - 2].eg) run3.push('seed' + seed + '@' + units[i].startM.toFixed(0) + ' ' + units[i].eg);
      }
      /* 世界反転: 区画 ≥ 8秒・ゲート2枚（戻る）・1000m に最大1回・切替の通路／ミニ大演出に掛けない */
      const perWin = {};
      g.swaps.filter((r) => r.from < L).forEach((r) => {
        nFlip++;
        const T = timeOf(st, r.from, r.to);
        if (!(T >= 8.0)) flipBad.push('seed' + seed + ' 区画 ' + T.toFixed(2) + '秒 @' + r.from.toFixed(0));
        if (r.gates.length !== 2) flipBad.push('seed' + seed + ' ゲート ' + r.gates.length + '枚');
        const k = Math.floor(r.from / 1000);
        perWin[k] = (perWin[k] || 0) + 1;
        g.switches.forEach((s) => { if (r.from < s.freeTo && r.to > s.freeFrom) flipBad.push('seed' + seed + ' 切替に重なる @' + r.from.toFixed(0)); });
        g.minis.forEach((m) => { if (r.from < m.freeTo && r.to > m.startM) flipBad.push('seed' + seed + ' ミニに重なる @' + r.from.toFixed(0)); });
        /* ゲートの直後 1.0秒は障害物なし（当たり判定を持つもの） */
        r.gates.forEach((G) => {
          const o = list.filter((x) => !In.OBS[x.type].ghost && x.at > G && x.at < G + st.speedAt(G) * 1.0)[0];
          if (o) flipBad.push('seed' + seed + ' ゲート直後に ' + o.type + ' @' + o.at.toFixed(1));
        });
      });
      Object.keys(perWin).forEach((k) => { if (perWin[k] > 1) flipBad.push('seed' + seed + ' ' + k + '000m台に ' + perWin[k] + '回'); });
      /* 上下非対称 */
      const r = asym(list, st, g);
      asymMin = Math.min(asymMin, r); asymSum += r;
      if (r < 0.60) asymLow.push('seed' + seed + ' ' + r.toFixed(3));
      /* §4.7（エンドレスは橋の崩落の明けも数える opt.ex） */
      if (full) {
        const e = In.Fair.validate(list, st.speedAt, { ex: true, startLanes: [0], reactBoth: g.reactBoth, zeros: g.zeros,
                                                     warps: g.warps, mirrors: g.mirrors, swaps: g.swaps, merges: g.merges });
        if (e.length) fair.push('seed' + seed + ': ' + e[0]);
      }
    });
    const n = seeds.length;
    t.eq(miss.length, 0, '1000m ごとに採用ギミック ' + EK.GIMMICKS.length + '種が全部出る（' + n + 'シード×' + L + 'm・欠け: ' + (miss.slice(0, 4).join(' / ') || 'なし') + '）');
    t.eq(run3.length, 0, '同じ主ギミックの札を3枚続けない（' + (run3.slice(0, 3).join(' / ') || 'なし') + '）');
    t.eq(flipBad.length, 0, '世界反転の区画（8秒以上・2枚・1000mに最大1回・区切りに掛けない・直後1秒空く）（' + (flipBad.slice(0, 3).join(' / ') || 'なし') + '）');
    t.ok(nFlip >= n * (L / 1000) * 0.9, '世界反転が 1000m にほぼ1回（' + (nFlip / n).toFixed(2) + '回 / ' + L + 'm）');
    t.eq(asymLow.length, 0, '上下で違う動きが必須動作の 60% 以上（最小 ' + asymMin.toFixed(3) + '・平均 ' + (asymSum / n).toFixed(3) + '）');
    /* ゾーン（背景）と無関係: ステージ固有だったギミックが 4ゾーン以上で出る */
    ['bridge', 'vent', 'sync', 'zero', 'net', 'flip'].forEach((x) => {
      const zs = Object.keys(zonesOf[x] || {});
      t.ok(zs.length >= 4, x + ' がゾーンと無関係に出る（' + zs.join(',') + '）');
    });
    if (full) t.eq(fair.length, 0, '§4.7 の不変条件（' + n + 'シード×' + L + 'm・' + (fair[0] || '違反なし') + '）');
    const per = (x) => (x / n / (L / 1000)).toFixed(2);
    t.info('主ギミック/1000m: ' + EK.GIMMICKS.map((x) => x + ' ' + per(mains[x] || 0)).join(' '));
    t.info('出現/1000m: ' + EK.GIMMICKS.map((x) => x + ' ' + per(occ[x] || 0)).join(' '));
  }

  /* ==========================================================================
     1. 除外・解放・札の健全性
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8b-1: エンドレスの札（除外＝鏡・重力反転・合体／クリアで解放／札ごとに §4.7）',
    quick: true,
    run(t) {
      const In = I(), EK = In.EndlessKit;
      const types = {};
      EK.UNITS.forEach((d) => (d.floor || []).concat(d.ceil || []).forEach((e) => { types[e.type] = 1; }));
      ['MIRRORZ', 'GRAVWARP', 'MERGE', 'SHARK', 'ROCK', 'WALLHOLE'].forEach((x) => t.ok(!types[x], '札に ' + x + ' が無い（§4.5b 除外）'));
      t.ok(EK.GIMMICKS.indexOf('shark') < 0 && EK.available(ALL).indexOf('shark') < 0, 'サメは採用ギミックに無い（2026-09-27 エンドレスから除外）');
      t.ok(EK.available(['S1', 'S2', 'S3', 'S4']).indexOf('vent') >= 0, 'S4 クリアで泡の噴出口だけが解放される（サメは入らない）');
      t.ok(EK.GIMMICKS.indexOf('rock') < 0 && EK.available(ALL).indexOf('rock') < 0, '転がる丸岩は採用ギミックに無い（2026-09-28 エンドレスから除外）');
      t.eq(EK.available(['S1', 'S2', 'S3']).filter((x) => ['sync', 'bridge'].indexOf(x) >= 0).length, 2, 'S3 クリアで同時スイッチ・崩れる橋だけが解放される（丸岩は入らない）');
      t.eq(EK.GIMMICKS.length, 14, '採用ギミックは14種（17 − 壁の穴 − サメ − 転がる丸岩）');
      t.ok(EK.UNITS.every((d) => d.gset.indexOf('rock') < 0), 'どの札にも転がる丸岩が入っていない（' + EK.UNITS.length + '枚）');
      t.ok(EK.UNITS.every((d) => d.gset.indexOf('shark') < 0), 'どの札にもサメが入っていない（' + EK.UNITS.length + '枚）');
      t.ok(!!types.HANDSWAP, '世界反転ゲートは採用（§4.5b）');
      t.eq(In.makeStage('endless').p8b, true, 'エンドレスは P8b の生成（stage.p8b）');
      t.eq(EK.available([]).join(','), 'hurdle,lowl,pillar,wide,laserv', '未クリアは基本障害物だけ');
      t.ok(EK.available(['S1', 'S2']).indexOf('scan') >= 0 && EK.available(['S1', 'S2']).indexOf('bridge') < 0, 'S2 クリアで動くレーザー');
      t.ok(EK.GIMMICKS.indexOf('wallhole') < 0, '壁の穴は採用ギミックに無い（2026-09-27 スライディング失効）');
      t.ok(EK.available(ALL.slice(0, 5)).indexOf('flip') < 0 && EK.available(ALL).indexOf('flip') >= 0, '世界反転は S6 クリアで解放');
      t.eq(EK.available(ALL).length, EK.GIMMICKS.length, '全クリアで ' + EK.GIMMICKS.length + '種');
      /* 未クリアで生成しても解放していないギミックは出ない */
      withCleared([], () => {
        const g = In.createGenerator(In.makeStage('endless'), 7);
        g.ensure(3000, 0);
        const bad = g.obstacles.filter((o) => EK.gimmicksOfItem(o).some((x) => !EK.BASIC[x]));
        t.eq(bad.length, 0, '未クリア: 基本障害物以外は出ない（' + (bad[0] ? bad[0].type : 'なし') + '）');
      });
      /* 生成でもゲートの類は出ない */
      withCleared(ALL, () => {
        let n = 0;
        for (let seed = 1; seed <= 3; seed++) {
          const g = gen(seed).g;
          n += g.mirrors.length + g.warps.length + g.merges.length;
        }
        t.eq(n, 0, '3シード×5000m: 鏡・重力反転・合体の区間 0');
        let sh = 0;
        for (let seed = 1; seed <= 3; seed++) sh += gen(seed).list.filter((o) => o.type === 'SHARK').length;
        t.eq(sh, 0, '3シード×5000m: サメは1匹も出ない');
        let rk = 0;
        for (let seed = 1; seed <= 3; seed++) rk += gen(seed).list.filter((o) => o.type === 'ROCK').length;
        t.eq(rk, 0, '3シード×5000m: 転がる丸岩は1個も出ない');
      });
    }
  });

  DUO.__suites.push({
    name: 'P8b-1: エンドレスの札を1枚ずつ §4.7＋死角の禁止で検査（16・44 m/s）',
    quick: false,
    run(t) {
      const In = I(), EK = In.EndlessKit;
      /* 札ごとに §4.7（4つの速度）＋死角の禁止 */
      const errs = [];
      EK.UNITS.forEach((d) => {
        [16, 44].forEach((sp) => {
          const speedAt = () => sp, scale = sp / 10, items = [];
          const loc = { syncs: [], zeros: [], warps: [], mirrors: [], swaps: [], merges: [] };
          const put = (e, s) => In.expandEntry(items, e, s, 100 + e.at * scale, 0, scale, loc);
          (d.floor || []).forEach((e) => put(e, 'floor'));
          (d.ceil || []).forEach((e) => put(e, 'ceil'));
          const e = In.Fair.validate(items, speedAt, { startLanes: 'any', reactBoth: 0.6, zeros: loc.zeros, swaps: loc.swaps, ex: true, blind: true });
          if (e.length) errs.push(d.id + '@' + sp + ' ' + e[0]);
        });
      });
      t.eq(errs.length, 0, '札 ' + EK.UNITS.length + '枚 × 2速度（16・44 m/s）で §4.7（' + (errs[0] || '違反なし') + '）');
    }
  });

  /* ==========================================================================
     2. 均等化・世界反転・非対称（quick は 10シード、runAll は 50シード＋§4.7）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8b-1: ギミック均等（1000mごと全種・3連続なし）・世界反転の区画・上下非対称60%（seed 1〜3 × 5000m）',
    quick: true,
    run(t) { checkGimmicks(t, [1, 2, 3], false); }
  });
  DUO.__suites.push({
    name: 'P8b-1: ギミック均等・世界反転・上下非対称60%・§4.7（seed 1〜50 × 5000m）',
    quick: false,
    run(t) {
      const s = [];
      for (let i = 1; i <= 50; i++) s.push(i);
      checkGimmicks(t, s, true);
    }
  });

  /* ==========================================================================
     3. 死角の禁止（契約§4.5b / P8b-2）: 遮蔽物の通過後 speed×1.0秒は同じレーン（ワイド梁は全レーン）に
        障害物なし。奥（1.0〜2.0秒）に障害物があれば、遮蔽物の speed×1.5秒 手前から白い予告線
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8b-2: 死角の禁止（50シード×5000m 違反0・ミニ大演出を含む）と予告線の出現条件／ステージ版は変えない',
    quick: false,
    run(t) {
      const In = I(), F = In.Fair;
      /* 規則そのもの（合成の譜面） */
      const O = In.Obstacles, sp = () => 20;
      t.eq(F.blind([O.make('PILLAR', 'both', 0, 100, 0), O.make('ROVER', 'floor', 0, 115, 0)], sp).length, 1, '柱の直後 0.75秒・同じレーンは違反');
      t.eq(F.blind([O.make('PILLAR', 'both', 0, 100, 0), O.make('ROVER', 'floor', 1, 110, 0)], sp).length, 0, '柱の直後でも別のレーンは可');
      t.eq(F.blind([O.make('WIDEBAR', 'floor', -1, 100, 0), O.make('ROVER', 'ceil', 1, 118, 0)], sp).length, 1, 'ワイド梁の直後は全レーン');
      t.eq(F.blind([O.make('PILLAR', 'both', 0, 100, 0), O.make('ROVER', 'floor', 0, 121, 0)], sp).length, 0, '1.0秒を過ぎれば可');
      const hs = F.hints([O.make('PILLAR', 'both', 0, 100, 0), O.make('ROVER', 'floor', 0, 125, 0), O.make('ROVER', 'ceil', 1, 145, 0)], sp);
      t.eq(hs.map((h) => h.side + h.lane).join(','), 'floor0', '奥 1.0〜2.0秒の同じレーンの障害物に予告線（2.0秒より奥・別のレーンは出さない）');
      t.near(hs[0].fromM, 100 - 20 * 1.5, 1e-6, '予告線は遮蔽物の speed×1.5秒 手前から');
      /* 生成（50シード×5000m・ミニ大演出を含む全体） */
      const bad = [], missH = [];
      let nh = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const { st, g, list } = gen(seed);
        const e = F.blind(list, st.speedAt);
        if (e.length) bad.push('seed' + seed + ' ' + e[0]);
        const keys = {};
        g.hints.forEach((h) => { keys[h.key] = 1; });
        F.hints(list, st.speedAt).forEach((h) => { if (h.occAt < L - 200 && !keys[h.key]) missH.push('seed' + seed + ' ' + h.key + '@' + h.occAt.toFixed(0)); });
        nh += g.hints.length;
      }
      t.eq(bad.length, 0, '死角の違反 0（' + (bad[0] || 'なし') + '）');
      t.eq(missH.length, 0, '奥に障害物のある遮蔽物には必ず予告線（' + (missH[0] || '漏れなし') + '・平均 ' + (nh / 50).toFixed(1) + '本/5000m）');
      /* ステージ版は現状のまま（規則は掛けない・予告線なし） */
      const s3 = In.makeStage('S3'), g3 = In.createGenerator(s3, 3);
      g3.ensure(s3.lengthM, 0);
      t.eq(g3.hints.length, 0, 'ステージ（S3）は予告線なし');
      t.ok(F.blind(g3.obstacles, s3.speedAt).length > 0, 'ステージ（S3）の譜面は死角の規則で変えていない（遮蔽物の直後に障害物がある）');
    }
  });
  DUO.__suites.push({
    name: 'P8b-2: 予告線の表示（遮蔽物の手前 speed×1.5秒から・該当の面とレーン・通過で消える）',
    quick: true,
    run(t) {
      const In = I(), G = In.Game, W = In.World, U = In.U;
      const snap = U.lsSnapshot();
      try {
        U.lsSet('cleared', ALL);
        const { g } = gen(2);
        const h = g.hints.filter((x) => !g.swaps.some((r) => x.occAt > r.from - 60 && x.occAt < r.to + 60))[0];
        t.ok(!!h, '予告線のある遮蔽物（世界反転の外）: ' + (h ? h.occAt.toFixed(0) + 'm ' + h.side + h.lane : 'なし'));
        if (!h) return;
        DUO.reset(); DUO.start('endless', 2); DUO.bot('perfect');
        DUO.skipTo(h.occAt - 170);
        let k = 0;
        while (G.dist < h.fromM - 12 && k++ < 20000) DUO.__step(1 / 60);
        while (G.dist < h.fromM - 3 && k++ < 20000) DUO.pump(1 / 60);
        const want = h.lane * In.CFG.LANE_W;
        const match = () => (W._hintPool || []).filter((m) => m.visible && Math.abs(m.position.x - want) < 1e-6 &&
          ((h.side === 'ceil') === (m.position.y > In.CFG.H / 2)) && Math.abs(m.position.z + (h.occAt - G.dist)) < 0.5).length;
        const before = match();
        while (G.dist < h.fromM + 2 && k++ < 20000) DUO.pump(1 / 60);
        const after = match();
        t.eq(before, 0, '遮蔽物の 1.5秒より手前ではまだ出ない');
        t.ok(after >= 1, '遮蔽物の手前 1.5秒で該当の面・レーンに線（' + h.side + ' lane ' + h.lane + '）');
        t.eq(G.status, 'playing', 'ボットは走行中');
        while (G.dist < h.occAt + 3 && k++ < 20000) DUO.pump(1 / 60);
        t.eq(match(), 0, '遮蔽物を通り過ぎたら消える');
        t.ok(G.snapshot().drawCalls <= 300, 'ドローコール ≤ 300（' + G.snapshot().drawCalls + '）');
      } finally {
        U.lsRestore(snap);
        DUO.reset();
      }
    }
  });

  /* ==========================================================================
     4. ハート3個（契約§4.5b / P8b-3）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8b-3: ハート3個（被弾→−1・0.6秒スロー・2.0秒無敵の点滅とすり抜け・噴出口は作動・3回目で終了・HUD・リザルト）',
    quick: true,
    run(t) {
      const In = I(), G = In.Game, CFG = In.CFG, U = In.U;
      const snap = U.lsSnapshot();
      const sfx0 = U.sfx, heard = [];
      U.sfx = function (id, o) { heard.push(id); return sfx0.call(U, id, o); };
      /* 本物の障害物は流さない（ボットなしで数秒走るため）: 1フレームごとに片付ける */
      const step = (sec) => {
        const n = Math.round(sec * 60);
        for (let i = 0; i < n; i++) { In.clearObstacles(); if (i < n - 1) DUO.__step(1 / 60); else DUO.pump(1 / 60); }
      };
      const lumen = () => G.runners.filter((r) => r.id === 'lumen')[0];
      /* LUMEN の目の前に柱を置いて当てる（助走の空白の中） */
      const hitNow = (frames) => {
        In.clearObstacles();
        In.spawnOne('PILLAR', 'both', lumen().laneTo, 2.5);
        let k = 0;
        const h0 = G.hitCount, s0 = G.status;
        while (G.hitCount === h0 && G.status === s0 && k++ < (frames || 120)) DUO.__step(1 / 60);
        DUO.pump(1 / 60);
      };
      try {
        U.lsSet('cleared', ALL);
        DUO.reset(); DUO.start('endless', 11);
        t.eq(G.hearts, 3, 'エンドレスはハート3個から');
        const he = document.getElementById('hud-hearts');
        step(0.1);
        t.eq(he.style.display, '', 'HUD にハート（data-ui="hearts"）');
        t.eq(he.getAttribute('data-ui'), 'hearts', 'data-ui="hearts"');
        t.eq(he.textContent, '♥♥♥', 'HUD ♥♥♥');
        /* 1回目 */
        heard.length = 0;
        hitNow();
        t.eq(G.status, 'playing', '1回目の被弾で続行');
        t.eq(G.hearts, 2, 'ハート −1（残り2）');
        t.eq(G.hitCount, 1, '被弾数 1');
        t.ok(heard.indexOf('hit') >= 0, '被弾の効果音');
        t.ok(G.invulT > 1.9 && G.hurtT > 0.5, '無敵 2.0秒・スロー 0.6秒が始まる（' + G.invulT.toFixed(2) + ' / ' + G.hurtT.toFixed(2) + '）');
        step(0.05);
        t.eq(he.textContent, '♥♥♡', 'HUD ♥♥♡');
        /* スロー: 1フレームの前進が speed×dt×SLOW_SCALE */
        const d0 = G.dist; DUO.pump(1 / 60);
        t.near((G.dist - d0) / (G.speed / 60), CFG.HEART.SLOW_SCALE, 0.02, 'スロー中の前進は ' + CFG.HEART.SLOW_SCALE + ' 倍');
        /* 点滅 */
        let off = 0, onN = 0;
        for (let i = 0; i < 24; i++) { In.clearObstacles(); DUO.pump(1 / 60); if (In.World.runnerViews.lumen.group.visible) onN++; else off++; }
        t.ok(off >= 3 && onN >= 3, '無敵中は2体が点滅（消 ' + off + ' / 見 ' + onN + '）');
        /* 無敵中はすり抜け（柱を通り過ぎる 0.4秒だけ走る） */
        hitNow(24);
        t.eq(G.hearts, 2, '無敵中は柱をすり抜ける（ハートは減らない）');
        t.eq(G.status, 'playing', '無敵中は死なない');
        /* 無敵中でも噴出口は作動（踏み系は通常どおり） */
        In.clearObstacles();
        const v = In.spawnOne('VENT', 'floor', lumen().laneTo, 2.0);
        let k = 0, jumped = false;
        while (k++ < 60 && !jumped) { DUO.__step(1 / 60); if (lumen().act === 'jump') jumped = true; }
        t.ok(G.invulT > 0 && jumped && !!v['_vent_lumen'], '無敵中でも噴出口で跳ばされる');
        /* 無敵が明けたら通常の判定 */
        step(2.2);
        t.eq(G.invulT, 0, '無敵は 2.0秒で明ける');
        t.ok(In.World.runnerViews.lumen.group.visible, '明けたら点滅しない');
        hitNow();
        t.eq(G.hearts, 1, '2回目の被弾（残り1）');
        t.eq(G.status, 'playing', '2回目でも続行');
        step(2.2);
        /* 3回目で従来の死亡 → リザルト */
        hitNow();
        t.eq(G.status, 'dying', '3回目の被弾で終了（スロー）');
        t.eq(G.hearts, 0, 'ハート 0');
        t.eq(G.hitCount, 3, '被弾数 3');
        step(0.8);
        t.eq(G.status, 'dead', 'リザルトへ');
        const dh = document.getElementById('dead-hits');
        t.ok(dh && dh.style.display !== 'none' && /被弾 3 回/.test(dh.textContent), 'リザルトに被弾数（' + (dh ? dh.textContent : '-') + '）');
        t.ok(document.getElementById('screen-dead').classList.contains('on'), 'リザルト画面');
        /* 最初から（リトライ）でハートは3個に戻る */
        G.retry(true);
        t.eq(G.hearts, 3, 'やり直しでハート3個に戻る');
        t.eq(G.hitCount, 0, '被弾数も 0 に戻る');
        /* ステージはハートなし（1発で終了のまま） */
        DUO.reset(); DUO.start('S2', 3); step(0.1);
        t.eq(G.hearts, 0, 'ステージにはハートが無い');
        t.eq(document.getElementById('hud-hearts').style.display, 'none', 'ステージの HUD にハートを出さない');
        hitNow();
        t.eq(G.status, 'dying', 'ステージは1回の被弾で終了（従来どおり）');
      } finally {
        U.sfx = sfx0;
        U.lsRestore(snap);
        DUO.reset();
      }
    }
  });
  DUO.__suites.push({
    name: 'P8b-3: ボット（perfect 5000m は被弾0・世界反転を通過／delay250 2500m は被弾≤2 × seed 1〜30）',
    quick: false,
    run(t) {
      const In = I(), G = In.Game, U = In.U;
      const snap = U.lsSnapshot();
      try {
        U.lsSet('cleared', ALL);
        [['perfect', 5000], ['delay250', 2500]].forEach((c) => {
          const bad = [];
          let hits = 0, flips = 0;
          for (let seed = 1; seed <= 30; seed++) {
            DUO.reset(); DUO.start('endless', seed); DUO.bot(c[0]);
            let k = 0, was = false;
            while (G.status === 'playing' && G.dist < c[1] && k++ < 400000) {
              DUO.__step(1 / 60);
              if (G.worldFlip && !was) flips++;
              was = G.worldFlip;
            }
            hits += G.hitCount;
            const ok = (G.status === 'playing' && G.dist >= c[1]) && (c[0] === 'perfect' ? G.hitCount === 0 : G.hitCount <= 2);
            if (!ok) bad.push(seed + '@' + Math.floor(G.dist) + ' 被弾' + G.hitCount + (G.lastHit ? '/' + G.lastHit.obstacle : ''));
          }
          t.eq(bad.length, 0, 'エンドレス ' + c[0] + ' ' + c[1] + 'm: 30/30（' + (bad.slice(0, 4).join(', ') || 'なし') + '・被弾 計' + hits + '）');
          if (c[0] === 'perfect') t.ok(flips >= 30 * 4, 'perfect: 世界反転を通過（' + flips + '回 / 30走）');
        });
      } finally {
        U.lsRestore(snap);
        DUO.reset();
      }
    }
  });
})();
