/* ============================================================================
   tests/test_p8a.js — P8a（契約§4.5 2026-09-25 改訂）
     【P8a-1 鏡ゾーンの固定反転】
     ・S6: 銀のゲートは2枚だけ（1枚目＝床・2枚目＝天井）。1枚目の後は床側だけ、2枚目の後は両方が反転し、
       ゴールまで戻らない。tip は初出（1枚目）のみ
     ・S7（コア）の鏡札も戻さない／エンドレスは区画内で戻さずゾーン切替で解除
     ・中断復元: 最初から・タイトルで解除、チェックポイント再開は「くぐったゲート」を掛け直す
     ・S6 perfect / delay250 seed 1〜30 完走
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const vis = (el) => {
    if (!el) return false;
    if (+getComputedStyle(el).opacity === 0) return false;
    let e = el;
    while (e && e !== document.body) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      e = e.parentElement;
    }
    return true;
  };
  const frame = (z) => document.querySelector('[data-ui="mirror-' + z + '"]');
  const mir = () => ({ L: Game.runners[0].mirrored, U: Game.runners[1].mirrored });
  /* S6 のその種の2枚のゲート（床・天井） */
  function s6Gates(seed) {
    const In = I();
    const g = In.createGenerator(In.makeStage('S6'), seed);
    for (let d = 0; d < 1600; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
    return { g: g, list: g.mirrors.filter((r) => r.from < 1600) };
  }

  /* ==========================================================================
     1. 生成: S6 の2枚（床→天井）・tip は初出のみ・Fair
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-1: S6 の鏡ゲートは2枚（1枚目＝床・2枚目＝天井）・出口ゲートなし・tip は初出のみ（50シード）',
    quick: true,
    run(t) {
      const In = I(), Mirror = In.Mirror;
      /* 単体: ゲートは1枚・トグルしない */
      const items = [];
      const reg = Mirror.expand(items, { at: 0, lane: 0, params: { mir: { side: 'floor', backT: 5 } } },
                                'floor', 100, 0, 3, null);
      t.eq(items.length, 1, '鏡ゾーンのゲートは1枚（出口ゲートは失効）');
      t.eq(reg.gates.length, 1, 'ゲートの距離は1つ');
      t.eq(Mirror.activeAt([reg], 'floor', 99), false, 'ゲートの手前は通常');
      t.eq(Mirror.activeAt([reg], 'floor', 5000), true, 'ゲートの先はどこまでも反転（固定）');
      t.eq(Mirror.activeAt([reg], 'ceil', 5000), false, '別の面には効かない');
      const fake = { gen: { mirrors: [reg, Mirror.expand([], { at: 0, lane: 0 }, 'floor', 200, 0, 3, null)] },
                     prevDist: 0, dist: 0, runners: [{ surface: 'floor', mirrored: false }, { surface: 'ceil', mirrored: false }] };
      fake.prevDist = 90; fake.dist = 110; Mirror.update(fake);
      t.eq(fake.runners[0].mirrored, true, '1枚目で床側が反転');
      fake.prevDist = 190; fake.dist = 210; Mirror.update(fake);
      t.eq(fake.runners[0].mirrored, true, '同じ面のゲートをもう一度くぐっても戻らない（トグルしない）');

      let bad = 0, fair = 0, tipBad = 0, first = 1e9, firstMax = 0, second = 1e9, secondMax = 0, swapAfter = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const r = s6Gates(seed), l = r.list, g = r.g;
        const st = In.makeStage('S6');
        if (l.length !== 2 || l[0].side !== 'floor' || l[1].side !== 'ceil' || !(l[0].from < l[1].from) ||
            l[1].from >= st.setpieces[0].start) {
          bad++; if (bad === 1) t.info('seed' + seed + ': ' + l.map((q) => q.side + '@' + q.from.toFixed(0)).join(','));
          continue;
        }
        first = Math.min(first, l[0].from); firstMax = Math.max(firstMax, l[0].from);
        second = Math.min(second, l[1].from); secondMax = Math.max(secondMax, l[1].from);
        const tips = g.events.filter((e) => e.type === 'tip' && e.params.id === 'mirrorzone');
        if (tips.length !== 1 || Math.abs(tips[0].params.targetAt - l[0].from) > 1) tipBad++;
        const obs = g.obstacles.filter((o) => o.at <= 1600);
        if (In.Fair.validate(obs, st.speedAt, { startLanes: [0], reactBoth: st.reactBoth, zeros: g.zeros,
                                                warps: g.warps, mirrors: g.mirrors, swaps: g.swaps }).length) fair++;
        if (g.swaps.some((w) => w.from > l[0].from && w.from < st.setpieces[0].start)) swapAfter++;
      }
      t.eq(bad, 0, '50シードすべて: 鏡ゲートは2枚・1枚目が床・2枚目が天井・大演出より手前');
      t.info('1枚目（床）' + first.toFixed(0) + '〜' + firstMax.toFixed(0) + 'm ／ 2枚目（天井）' +
             second.toFixed(0) + '〜' + secondMax.toFixed(0) + 'm');
      t.ok(first >= 200 && firstMax <= 650, '1枚目は前半（' + first.toFixed(0) + '〜' + firstMax.toFixed(0) + 'm）');
      t.ok(second >= 800 && secondMax <= 1300, '2枚目は後半（' + second.toFixed(0) + '〜' + secondMax.toFixed(0) + 'm）');
      t.eq(tipBad, 0, 'tip（mirrorzone）は初出の1枚目にだけ出る');
      t.eq(fair, 0, '§4.7 違反なし（ゲートの猶予 1.0秒を含む）');
      t.eq(swapAfter, 50, '1枚目の後に世界反転（紫）が必ず1回以上ある＝鏡との重ね掛けが必ず起きる');
      /* 鏡の札はランダムには引かない（S6 の鏡の顔ぶれは強制だけ） */
      const st = In.makeStage('S6');
      t.eq((st.exclusive || []).join(','), 'mirF,mirC', 'S6 の鏡の札は強制（forceAt）のときだけ');
      In.CHUNK_DEFS.filter((c) => c.s7 && c.mir).forEach((c) => {
        const e = (c.floor || []).concat(c.ceil || []).filter((q) => q.type === 'MIRRORZ')[0];
        t.eq(!!c[e.params.mir.side === 'floor' ? 'mirF' : 'mirC'], true, c.id + ': 面の印（mirF/mirC）がゲートの面と一致');
      });
    }
  });

  /* ==========================================================================
     2. 走行: 1枚目後は床側のみ・2枚目後は両方・ゴールまで戻らない（実ステップ）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-1: 走行（1枚目後は床側だけ縞・2枚目後は両方・ゴールまで戻らない・HUD）',
    quick: true,
    run(t) {
      const seed = 3;
      const l = s6Gates(seed).list;
      DUO.reset(); DUO.start('S6', seed); DUO.bot('perfect');
      DUO.skipTo(Math.max(0, l[0].from - 90));
      let g = 0;
      while (Game.dist < l[0].from - 1 && g++ < 9000 && Game.status === 'playing') DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', '1枚目の手前: どちらも通常');
      t.eq(vis(document.getElementById('flag-mirror')), false, '1枚目の手前: MIRROR なし');
      while (Game.dist < l[0].from + 4 && g++ < 9000 && Game.status === 'playing') DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":true,"U":false}', '1枚目の後: 床側（LUMEN）だけ反転');
      t.eq(vis(document.getElementById('flag-mirror')), true, 'MIRROR が出る');
      t.eq(vis(frame('bottom')) && !vis(frame('top')), true, '縞枠は下半分だけ');
      /* 2枚目まで一度も戻らない */
      let flips = 0, last = JSON.stringify(mir());
      while (Game.dist < l[1].from - 1 && g++ < 30000 && Game.status === 'playing') {
        DUO.__step(1 / 60);
        const now = JSON.stringify(mir());
        if (now !== last) { flips++; last = now; }
      }
      t.eq(flips, 0, '1枚目〜2枚目の間に反転の状態は変わらない（出口ゲートなし）');
      t.eq(Game.status, 'playing', 'ボットが2枚目の手前まで走る');
      while (Game.dist < l[1].from + 4 && g++ < 9000 && Game.status === 'playing') DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":true,"U":true}', '2枚目の後: 天井側（UMBRA）も反転＝両方逆');
      t.eq(vis(frame('bottom')) && vis(frame('top')), true, '縞枠は両方の半分');
      flips = 0; last = JSON.stringify(mir());
      while ((Game.status === 'playing' || Game.status === 'goal') && g++ < 60000) {
        DUO.__step(1 / 60);
        if (Game.status !== 'playing') break;
        const now = JSON.stringify(mir());
        if (now !== last) { flips++; last = now; }
      }
      t.eq(flips, 0, '2枚目〜ゴールまで戻らない');
      t.ok(Game.status === 'goal' || Game.status === 'clear', 'ゴールまで走りきる（' + Game.status + '）');
      DUO.reset();
      t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', 'タイトルへ戻ると解除');
    }
  });

  /* ==========================================================================
     3. 中断復元: 最初から＝解除／チェックポイント再開＝くぐったゲートを掛け直す
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-1: 中断復元（最初から・タイトルで解除／チェックポイント再開はくぐったゲートの反転を掛け直す）',
    quick: true,
    run(t) {
      const seed = 5;
      const l = s6Gates(seed).list;
      DUO.reset(); DUO.start('S6', seed); DUO.bot('perfect');
      DUO.skipTo(Math.max(0, l[0].from - 90));
      let g = 0;
      while (Game.dist < l[0].from + 6 && g++ < 9000) DUO.__step(1 / 60);
      t.eq(mir().L, true, '1枚目の後');
      Game.retry(true); DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', '最初からやり直すと解除');
      t.eq(vis(document.getElementById('flag-mirror')) || vis(frame('bottom')), false, 'HUD の MIRROR・縞枠も消える');
      /* チェックポイント（1枚目と2枚目の間）から再開 → 床側だけ反転で再開 */
      Game.lastCheckpoint = Math.ceil(l[0].from + 30);
      Game.retry(); DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":true,"U":false}', '1枚目の先から再開: 床側だけ反転のまま（ステージ終了まで戻らない）');
      t.eq(vis(frame('bottom')) && !vis(frame('top')), true, '再開直後から下半分に縞枠');
      t.eq(Game.gen.mirrors.filter((r) => !r.dead && r.from < Game.dist).length, 0, '掛け直したゲートはもう跨がない（手前に生きたゲートなし）');
      g = 0;
      while (Game.dist < l[1].from + 6 && g++ < 30000 && Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":true,"U":true}', '再開後も2枚目で天井側が反転する');
      /* 2枚目の先から再開 → 両方反転で再開 */
      Game.lastCheckpoint = Math.ceil(l[1].from + 30);
      Game.retry(); DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":true,"U":true}', '2枚目の先から再開: 両方反転のまま');
      /* 1枚目の手前から再開 → 通常 */
      Game.lastCheckpoint = Math.max(0, Math.floor(l[0].from - 150));
      Game.retry(); DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', '1枚目の手前から再開: 通常');
      t.eq(Game.gen.mirrors.filter((r) => !r.dead && r.from > Game.dist).length >= 1, true, '1枚目はこれから跨ぐ');
      Game.toTitle(); DUO.pump(1 / 60);
      t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', 'タイトルで解除');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. S7（コア）・エンドレス
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-1: S7 の鏡札も戻さない／エンドレスは区画内で戻さずゾーン切替で解除',
    quick: true,
    run(t) {
      const In = I(), U = In.U;
      /* S7: 鏡札（1枚）の後、ゴールまでその面のキャラの反転が戻らない */
      let found = null;
      for (let seed = 1; seed <= 30 && !found; seed++) {
        const g = In.createGenerator(In.makeStage('S7'), seed);
        for (let d = 0; d < 1800; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const r = g.mirrors.filter((q) => q.from > 200 && q.from < 1300)[0];
        if (r) found = { seed: seed, reg: r };
      }
      t.ok(!!found, 'S7 に鏡札がある（seed ' + (found && found.seed) + ' @' + (found && found.reg.from.toFixed(0)) + 'm）');
      if (found) {
        t.eq(found.reg.gates.length, 1, 'S7 の鏡札もゲートは1枚');
        DUO.reset(); DUO.start('S7', found.seed); DUO.bot('perfect');
        DUO.skipTo(Math.max(0, found.reg.from - 90));
        let g = 0;
        while (Game.dist < found.reg.from + 4 && g++ < 9000 && Game.status === 'playing') DUO.__step(1 / 60);
        const who = Game.runners.filter((r) => r.mirrored);
        t.ok(who.length >= 1, 'ゲートの後に反転しているキャラがいる（' + who.map((r) => r.id).join(',') + '）');
        let back = 0;
        while (Game.status === 'playing' && g++ < 60000) {
          DUO.__step(1 / 60);
          if (Game.status === 'playing' && who.some((r) => !r.mirrored)) back++;
        }
        t.eq(back, 0, 'S7: ゴール（または終了）まで反転が戻らない');
        t.ok(Game.status !== 'dead' && Game.status !== 'dying', 'S7 をボットが走りきる（' + Game.status + '）');
      }
      /* エンドレス: 鏡ゾーンで反転 → 区画内は戻らない → ゾーン切替で解除 */
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
      let ok = false;
      for (let seed = 1; seed <= 12 && !ok; seed++) {
        const ge = In.createGenerator(In.makeStage('endless'), seed);
        ge.ensure(6500, 0);
        const sw = ge.switches.filter((s) => s.to === 'core')[0];
        const r = ge.mirrors.filter((q) => ge.zoneAt(q.from) === 'mirror' && sw && q.from < sw.swapAt - 60)[0];
        if (!r || !sw) continue;
        ok = true;
        DUO.reset(); DUO.start('endless', seed); DUO.bot('perfect');
        DUO.skipTo(Math.max(0, r.from - 90));
        let g = 0;
        while (Game.dist < r.from + 4 && g++ < 9000 && Game.status === 'playing') DUO.__step(1 / 60);
        t.eq(In.Zones.id(), 'mirror', 'エンドレス: 鏡の世界ゾーン');
        const rn = Game.runners.filter((x) => x.mirrored);
        t.ok(rn.length >= 1, 'エンドレス: 鏡ゲートで反転（seed ' + seed + ' @' + r.from.toFixed(0) + 'm）');
        let back = 0;
        while (Game.dist < sw.swapAt - 1 && g++ < 60000 && Game.status === 'playing') {
          DUO.__step(1 / 60);
          if (rn.some((x) => !x.mirrored)) back++;
        }
        t.eq(back, 0, 'エンドレス: 区画（ゾーン）の中では戻らない');
        t.eq(Game.status, 'playing', 'ゾーン切替の手前までボットが走る');
        while (Game.dist < sw.swapAt + 2 && g++ < 9000 && Game.status === 'playing') DUO.__step(1 / 60);
        t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', 'エンドレス: ゾーン切替で解除');
        t.eq(In.Zones.id(), 'core', '次のゾーン（コア）へ');
        /* 再開（skipTo）でゾーンをまたいだ反転は掛け直さない */
        DUO.skipTo(sw.swapAt + 40);
        t.eq(JSON.stringify(mir()), '{"L":false,"U":false}', 'エンドレス: 別のゾーンの鏡は再開で掛け直さない');
      }
      t.ok(ok, 'エンドレスの鏡ゾーンに鏡ゲートがある種を見つけた');
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. S6 完走（perfect / delay250 × seed 1〜30）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a: S6 完走（perfect / delay250 × seed 1〜30）',
    quick: false,
    run(t) {
      ['perfect', 'delay250'].forEach((mode) => {
        let ok = 0; const bad = [];
        for (let seed = 1; seed <= 30; seed++) {
          DUO.reset(); DUO.start('S6', seed); DUO.bot(mode);
          let g = 0;
          while (Game.status === 'playing' && g++ < 60 * 200) DUO.__step(1 / 60);
          if (Game.status === 'goal' || Game.status === 'clear') ok++;
          else bad.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
        }
        t.eq(ok, 30, 'S6 ' + mode + ' 30/30 完走（落ちた種: ' + bad.slice(0, 5).join(',') + '）');
      });
      DUO.reset();
    }
  });
})();
