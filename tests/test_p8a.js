/* ============================================================================
   tests/test_p8a.js — P8a（契約§4.5 2026-09-25 改訂）
     【P8a-1 鏡ゾーンの固定反転】
     ・S6: 銀のゲートは2枚だけ（1枚目＝床・2枚目＝天井）。1枚目の後は床側だけ、2枚目の後は両方が反転し、
       ゴールまで戻らない。tip は初出（1枚目）のみ
     ・S7（コア）の鏡札も戻さない／エンドレスは区画内で戻さずゾーン切替で解除
     ・中断復元: 最初から・タイトルで解除、チェックポイント再開は「くぐったゲート」を掛け直す
     ・S6 perfect / delay250 seed 1〜30 完走
     【P8a-2 世界反転ゲート（旧・入れ替えワープの全面改訂）】
     ・紫のゲートで画面全体が 0.5秒で 180° 回る（カメラのロール 0→π、再通過で π→0 の逆回転）
     ・回転中の入力は無視／回転後は「画面の下半分＝画面の下に見えているキャラ（UMBRA）」
     ・フリックは画面基準: 横は画面の左右へ、足場から離れる向き（画面で見て）＝ジャンプ（投影座標で検証）
     ・HUD: 上下チップ（名前・色・案内）と上下の枠の色は画面位置に従う／WORLD FLIP
     ・重力反転（S5）との重ね掛け: 表示・担当ともに「画面上の位置」だけで決まる
     ・中断復元／S6・S7 perfect/delay250 seed 1〜30 完走／エンドレス（鏡・コアのゾーン）3000m
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
      /* エンドレス【P8b 契約§4.5b】: 鏡の反転はエンドレスから除外（ゾーン切替での解除の仕組みは残る） */
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
      let nMir = 0, nSw = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const ge = In.createGenerator(In.makeStage('endless'), seed);
        ge.ensure(6500, 0);
        nMir += ge.mirrors.length + ge.warps.length + ge.merges.length;
        nSw += ge.switches.filter((s) => s.to === 'core').length;
      }
      const ok = (nMir === 0 && nSw > 0);
      t.ok(ok, 'エンドレス（§4.5b）: 鏡・重力反転・合体のゲートは 4シード×6500m で 0（鏡の世界ゾーンは通る）');
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

  /* ---- P8a-2 の共通 ---- */
  const app = () => document.getElementById('app');
  const canSynth = (typeof window.Touch === 'function' && typeof window.TouchEvent === 'function');
  function mkT(id, x, y) { return new Touch({ identifier: id, target: app(), clientX: x, clientY: y, pageX: x, pageY: y }); }
  function fire(type, touches) {
    app().dispatchEvent(new TouchEvent(type, {
      changedTouches: touches, touches: (type === 'touchend' || type === 'touchcancel') ? [] : touches,
      bubbles: true, cancelable: true
    }));
  }
  /* 実入力経路のフリック（zone: 'bottom'|'top'、dx/dy は px） */
  function flick(id, zone, dx, dy) {
    const el = app();
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    const x0 = w * 0.5, y0 = (zone === 'top') ? h * 0.25 : h * 0.75;
    fire('touchstart', [mkT(id, x0, y0)]);
    fire('touchmove', [mkT(id, x0 + dx, y0 + dy)]);
    fire('touchend', [mkT(id, x0 + dx, y0 + dy)]);
  }
  const rect = (id) => I().World.runnerRect(Game.runners.filter((r) => r.id === id)[0]);
  const cx = (rc) => (rc.left + rc.right) / 2, cy = (rc) => (rc.top + rc.bottom) / 2;
  const screenH = () => { const v = new THREE.Vector2(); I().World.renderer.getSize(v); return v.y; };
  const handName = (s) => document.getElementById('hand-' + s + '-name').textContent;
  const handKeys = (s) => document.getElementById('hand-' + s + '-keys').textContent;
  const pumpN = (n) => { for (let i = 0; i < n; i++) DUO.pump(1 / 60); };
  const ROLLN = () => Math.ceil(I().CFG.HANDSWAP.ROLL_T * 60) + 1;
  /* 障害物のない所で走らせる（単体の検証用） */
  function quiet(stage) {
    DUO.reset(); DUO.start(stage || 'S6', 3); DUO.skipTo(200);
    I().clearObstacles();
    Game.gen.obstacles.length = 0; Game.genPtr = 0;
    Game.gen.ensure = function () {};
    Game.gen.swaps.length = 0; Game.gen.mirrors.length = 0; Game.gen.warps.length = 0;
    pumpN(2);
  }
  function resetLanes() {
    Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = I().CFG.LANE_T; r.act = 'run'; r.actT = 0; });
  }

  /* ==========================================================================
     6. ロール角の遷移・回転中の入力無視・担当・フリック方向（実タッチ・投影座標）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-2: 世界反転（ロール 0→π を 0.5秒・回転中は入力無視・下半分＝画面の下の UMBRA・フリックは画面基準）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG;
      quiet('S6');
      const H = screenH();
      t.ok(cy(rect('lumen')) > H / 2 && cy(rect('umbra')) < H / 2, '通常: LUMEN は画面の下・UMBRA は画面の上');
      /* ロール角の遷移（0 → π、単調・0.5秒） */
      Game.setWorldFlip(true);
      const rolls = [];
      let mono = true, prev = -1, tDone = null;
      for (let i = 1; i <= 45; i++) {
        DUO.pump(1 / 60);
        rolls.push(Game.roll);
        if (Game.roll < prev - 1e-9) mono = false;
        prev = Game.roll;
        if (tDone === null && Game.rollT === 0) tDone = i / 60;
      }
      t.eq(mono, true, 'ロール角は 0→π へ単調に増える');
      t.near(rolls[14], Math.PI / 2, 0.25, '0.25秒で約 90°（' + (rolls[14] * 180 / Math.PI).toFixed(0) + '°）');
      t.near(Game.roll, Math.PI, 1e-6, '回り終わると π（180°）');
      t.ok(tDone !== null && Math.abs(tDone - CFG.HANDSWAP.ROLL_T) <= 1 / 60 + 1e-6,
           '回転は ' + CFG.HANDSWAP.ROLL_T + '秒（実測 ' + (tDone || 0).toFixed(3) + '秒）');
      t.near(In.World.camera.up.y, 1, 1e-6, 'カメラの up は触らず、視線の軸まわりにロールする（lookAt の後に rotateZ）');
      t.ok(cy(rect('lumen')) < H / 2 && cy(rect('umbra')) > H / 2, '反転後: LUMEN（床）は画面の上・UMBRA（天井）は画面の下');
      t.eq(Game.runners[0].surface, 'floor', 'キャラは自分の足場のまま（LUMEN は床）');
      t.eq(DUO.state().zoneOwner.bottom, 'umbra', '下半分＝画面の下に見えている UMBRA');
      t.eq(DUO.state().zoneOwner.top, 'lumen', '上半分＝画面の上に見えている LUMEN');

      /* 回転中は入力を受け付けない（タッチもキーも） */
      Game.setWorldFlip(false);
      resetLanes();
      DUO.touch('bottom', 'right'); DUO.key('KeyD', true); DUO.pump(1 / 60); DUO.key('KeyD', false);
      DUO.touch('top', 'down'); pumpN(3);
      t.ok(Game.rollT > 0, '（回転中）');
      t.eq(Game.runners.every((r) => r.laneTo === 0 && r.act === 'run'), true, '回転中のフリック・キーは無視される');
      /* 戻り（逆回転 π → 0） */
      prev = 99; mono = true;
      for (let i = 0; i < 40; i++) { DUO.pump(1 / 60); if (Game.roll > prev + 1e-9) mono = false; prev = Game.roll; }
      t.eq(mono, true, '再通過は逆回転（π→0 へ単調に減る）');
      t.near(Game.roll, 0, 1e-6, '戻り終わると 0');
      t.eq(DUO.state().zoneOwner.bottom, 'lumen', '戻ると下半分は LUMEN');
      t.eq(Game.runners.every((r) => r.laneTo === 0 && r.act === 'run'), true, '回転中の入力は後から効いたりしない');

      /* 反転後の実タッチ（合成 TouchEvent）: 下半分の横フリック → UMBRA が画面の右へ */
      Game.setWorldFlip(true); pumpN(ROLLN());
      resetLanes(); pumpN(1);
      if (canSynth) {
        const u0 = cx(rect('umbra')), l0 = cx(rect('lumen'));
        flick(71, 'bottom', 90, 0);
        pumpN(Math.ceil(CFG.LANE_T * 60) + 2);
        t.eq(Game.runners[1].laneTo !== 0 && Game.runners[0].laneTo === 0, true, '実タッチ: 反転後に下半分の横フリック → UMBRA が動く（LUMEN は動かない）');
        t.ok(cx(rect('umbra')) > u0 + 20, '実タッチ: 右フリック → UMBRA は **画面の右** へ（x ' + u0.toFixed(0) + ' → ' + cx(rect('umbra')).toFixed(0) + '）');
        t.eq(Game.runners[1].laneTo, -1, '（世界ではレーン −1＝画面が 180° 回っているため）');
        t.near(cx(rect('lumen')), l0, 10, 'LUMEN は画面上でほぼ動かない（カメラが2体の中点を少し追う分だけ）');
        /* 上半分の左フリック → LUMEN が画面の左へ */
        flick(72, 'top', -90, 0);
        pumpN(Math.ceil(CFG.LANE_T * 60) + 2);
        t.ok(cx(rect('lumen')) < l0 - 20, '実タッチ: 上半分の左フリック → LUMEN は画面の左へ（x ' + l0.toFixed(0) + ' → ' + cx(rect('lumen')).toFixed(0) + '）');
        /* ジャンプ: 画面で見て「足場から離れる向き」 */
        resetLanes(); pumpN(Math.ceil(CFG.LANE_T * 60) + 2);
        const uy = cy(rect('umbra')), ly = cy(rect('lumen'));
        flick(73, 'bottom', 0, -90);           // 下半分の上フリック
        pumpN(Math.round(CFG.JUMP_T * 30));    // 滞空の半ば
        t.eq(Game.runners[1].act, 'jump', '実タッチ: 下半分の上フリック → UMBRA がジャンプ（画面の下の足場から上へ離れる）');
        t.ok(cy(rect('umbra')) < uy - 10, 'UMBRA は画面の上へ跳ぶ（y ' + uy.toFixed(0) + ' → ' + cy(rect('umbra')).toFixed(0) + '）');
        pumpN(Math.round(CFG.JUMP_T * 60));
        flick(74, 'top', 0, 90);               // 上半分の下フリック
        pumpN(Math.round(CFG.JUMP_T * 30));
        t.eq(Game.runners[0].act, 'jump', '実タッチ: 上半分の下フリック → LUMEN がジャンプ（画面の上の足場から下へ離れる）');
        t.ok(cy(rect('lumen')) > ly + 10, 'LUMEN は画面の下へ跳ぶ（y ' + ly.toFixed(0) + ' → ' + cy(rect('lumen')).toFixed(0) + '）');
        pumpN(Math.round(CFG.JUMP_T * 60));
        flick(75, 'bottom', 0, 90);            // 下半分の下フリック（足場へ向かう向き）＝何も起きない
        pumpN(1);
        t.eq(Game.runners[1].act, 'run', '実タッチ: 世界反転中の下半分の下フリック → UMBRA は何もしない（スライディング失効）');
        t.eq(Game.runners[0].act, 'run', '〃 LUMEN にも届かない');
      } else {
        t.info('この環境では TouchEvent を合成できないので実タッチ経路は省略');
      }
      /* キーボード（開発用）も画面基準: 左手（WASD）＝画面の下のキャラ、D＝画面の右 */
      resetLanes(); pumpN(Math.ceil(CFG.JUMP_T * 60) + 2); resetLanes();
      const u1 = cx(rect('umbra'));
      DUO.key('KeyD', true); DUO.pump(1 / 60); DUO.key('KeyD', false);
      pumpN(Math.ceil(CFG.LANE_T * 60) + 2);
      t.ok(cx(rect('umbra')) > u1 + 20, 'キー: 反転中の D → 画面の下の UMBRA が画面の右へ');
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. HUD（チップ・枠の色・WORLD FLIP）と重力反転との重ね掛け
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-2: HUD（チップ・枠の色・WORLD FLIP）と重力反転との重ね掛け（画面の位置だけで決まる）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG;
      const tz = () => document.getElementById('touchzones');
      const wflip = () => getComputedStyle(document.getElementById('flag-wflip')).display !== 'none';
      /* 枠の色＝box-shadow の最初の色（rgb 部分だけ） */
      const colorOf = (sel) => (getComputedStyle(document.querySelector(sel)).boxShadow.match(/rgba?\((\d+), (\d+), (\d+)/) || []).slice(1, 4).join(',');
      quiet('S6');
      const topColor0 = colorOf('#touchzones .tz.top'), botColor0 = colorOf('#touchzones .tz.bottom');
      t.eq(wflip(), false, '通常: WORLD FLIP は出ない');
      t.eq(handName('left') + '/' + handName('right'), 'LUMEN/UMBRA', '通常: 下半分のチップ LUMEN／上半分 UMBRA');
      Game.setWorldFlip(true);
      pumpN(8);
      t.eq(handName('left'), 'LUMEN', '回転の前半（90°未満）はまだ入れ替わらない');
      pumpN(ROLLN());
      t.eq(wflip(), true, '反転後: WORLD FLIP が出る');
      t.eq(handName('left') + '/' + handName('right'), 'UMBRA/LUMEN', '反転後: 下半分のチップ UMBRA／上半分 LUMEN');
      t.eq(document.getElementById('hand-left').getAttribute('data-char'), 'umbra', 'チップの色（data-char）も入れ替わる');
      t.ok(handKeys('left').indexOf('↑跳ぶ') >= 0 && handKeys('right').indexOf('↓跳ぶ') >= 0,
           '案内: 下半分（UMBRA）↑跳ぶ／上半分（LUMEN）↓跳ぶ（画面で見て足場から離れる向き）');
      t.eq(tz().classList.contains('top-lumen'), true, '上下の枠: 上半分に LUMEN が見えている印');
      t.eq(colorOf('#touchzones .tz.top'), botColor0, '上半分の枠は琥珀（そこにいる LUMEN の色）');
      t.eq(colorOf('#touchzones .tz.bottom'), topColor0, '下半分の枠は藍（そこにいる UMBRA の色）');

      /* 重力反転（S5 の Warp＝キャラが面を飛び移る）を重ねる: LUMEN が天井へ → 天井は画面の下 → LUMEN は画面の下 */
      Game.swapSurfaces();
      pumpN(2);
      const H = screenH();
      t.eq(DUO.state().flipped && DUO.state().worldFlip, true, '（重力反転 × 世界反転）');
      t.ok(cy(rect('lumen')) > H / 2 && cy(rect('umbra')) < H / 2, '重ね掛け: LUMEN（天井）は画面の下・UMBRA（床）は画面の上');
      t.eq(DUO.state().zoneOwner.bottom, 'lumen', '重ね掛け: 下半分＝画面の下に見えている LUMEN');
      t.eq(handName('left'), 'LUMEN', '重ね掛け: 下半分のチップは LUMEN');
      t.ok(handKeys('left').indexOf('↑跳ぶ') >= 0, '重ね掛け: 下半分の案内は ↑跳ぶ（足場が画面の下）');
      t.eq(tz().classList.contains('top-lumen'), false, '重ね掛け: 上半分の枠は藍（UMBRA）');
      resetLanes(); pumpN(1);
      const ly = cy(rect('lumen')), lx = cx(rect('lumen'));
      DUO.touch('bottom', 'up'); pumpN(Math.round(CFG.JUMP_T * 30));
      t.eq(Game.runners[0].act, 'jump', '重ね掛け: 下半分の上フリック → LUMEN がジャンプ');
      t.ok(cy(rect('lumen')) < ly - 10, '重ね掛け: 画面の上へ跳ぶ（足場から離れる向き）');
      pumpN(Math.round(CFG.JUMP_T * 60));
      DUO.touch('bottom', 'right'); pumpN(Math.ceil(CFG.LANE_T * 60) + 2);
      t.ok(cx(rect('lumen')) > lx + 20, '重ね掛け: 下半分の右フリック → LUMEN は画面の右へ');
      /* さらに鏡（LUMEN が反転）: 縞枠は画面で LUMEN が見えている下半分 */
      Game.runners[0].mirrored = true; pumpN(1);
      t.eq(tz().classList.contains('mir-bottom') && !tz().classList.contains('mir-top'), true,
           '三重（重力反転×世界反転×鏡）: 縞枠は LUMEN が見えている下半分');
      Game.runners[0].mirrored = false;
      /* 世界反転だけ戻す → 重力反転のみ（S5 と同じ見え方）: LUMEN は天井＝画面の上 */
      Game.setWorldFlip(false); pumpN(ROLLN());
      t.ok(cy(rect('lumen')) < H / 2, '世界反転を戻す: 重力反転のみ（LUMEN は天井＝画面の上）');
      t.eq(DUO.state().zoneOwner.top, 'lumen', '重力反転のみ: 上半分＝LUMEN（S5 の規則のまま）');
      t.eq(wflip(), false, 'WORLD FLIP が消える');
      DUO.reset(); DUO.pump(1 / 60);
      t.eq(tz().classList.contains('top-lumen'), false, 'タイトルへ戻ると枠の色も既定');

      /* 実走の S7（コア）: 世界反転・重力反転が起きても、毎フレーム「下半分の担当＝画面の下に見えるキャラ」 */
      let checked = 0, bad = 0, both = 0;
      for (let seed = 1; seed <= 12 && checked < 400; seed++) {
        const g = In.createGenerator(In.makeStage('S7'), seed);
        for (let d = 0; d < 1800; d += 20) g.ensure(d + CFG.SPAWN_AHEAD, d);
        const sw = g.swaps.filter((r) => r.from > 150 && r.to < 1500)[0];
        if (!sw) continue;
        DUO.reset(); DUO.start('S7', seed); DUO.bot('perfect');
        DUO.skipTo(Math.max(0, sw.from - 80));
        let k = 0;
        while (Game.status === 'playing' && Game.dist < sw.to + 60 && k++ < 3000) {
          DUO.pump(1 / 60);
          if (Game.rollT > 0 || Game.merged || Game.flipT > 0 || (k % 3)) continue;
          const H2 = screenH();
          const b = Game.runnerForZone('bottom'), tp = Game.runnerForZone('top');
          checked++;
          if (Game.worldFlip && Game.flipped()) both++;
          if (!(cy(In.World.runnerRect(b)) > H2 / 2 && cy(In.World.runnerRect(tp)) < H2 / 2)) bad++;
        }
      }
      t.ok(checked >= 100, 'S7 の世界反転の前後を ' + checked + ' フレーム検査（重力反転と同時 ' + both + '）');
      t.eq(bad, 0, 'S7: 下半分の担当は常に画面の下に見えているキャラ（表示と担当が一致）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     8. 中断復元（回転の途中・反転中のリトライ／タイトル）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a-2: 中断復元（回転の途中・反転中にリトライ／チェックポイント／タイトル → 即座に既定）',
    quick: true,
    run(t) {
      const In = I();
      const clean = (why) => {
        const s = DUO.state();
        t.eq(s.worldFlip === false && s.roll === 0 && s.rollT === 0, true, why + ': 世界反転・ロールが既定');
        t.eq(s.zoneOwner.bottom, 'lumen', why + ': 下半分は LUMEN');
        t.eq(getComputedStyle(document.getElementById('flag-wflip')).display, 'none', why + ': WORLD FLIP なし');
        t.near(In.World.camera.up.y, 1, 1e-6, why + ': カメラの up は既定');
      };
      quiet('S6');
      Game.setWorldFlip(true); pumpN(10);
      t.ok(Game.rollT > 0 && Game.roll > 0.3, '回転の途中');
      Game.retry(true); DUO.pump(1 / 60);
      clean('回転の途中で最初から');
      /* 実際の譜面: 反転中にチェックポイントから */
      const g = In.createGenerator(In.makeStage('S6'), 4);
      g.ensure(1400, 0);
      const sw = g.swaps.filter((r) => r.from > 200)[0];
      DUO.reset(); DUO.start('S6', 4); DUO.bot('perfect');
      DUO.skipTo(sw.from - 90);
      let k = 0;
      while (Game.dist < sw.from + 30 && k++ < 3000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().worldFlip, true, '反転中');
      /* 画面の回り具合もカメラの行列で確かめる（上下逆＝カメラの上方向が世界の下向き） */
      In.World.camera.updateMatrixWorld();
      const upW = new THREE.Vector3(0, 1, 0).applyQuaternion(In.World.camera.quaternion);
      t.ok(upW.y < -0.9, '反転中のカメラの上方向は世界の下向き（' + upW.y.toFixed(2) + '）');
      Game.lastCheckpoint = Math.ceil(sw.from + 10);
      Game.retry(); DUO.pump(1 / 60);
      clean('反転区間の中のチェックポイントから');
      In.World.camera.updateMatrixWorld();
      const up2 = new THREE.Vector3(0, 1, 0).applyQuaternion(In.World.camera.quaternion);
      t.ok(up2.y > 0.9, '再開後のカメラは正立（' + up2.y.toFixed(2) + '）');
      t.eq(Game.gen.swaps.filter((r) => !r.dead && r.from < Game.dist).length, 0, '再開位置より手前の紫のゲート（戻りだけ）は残らない');
      Game.setWorldFlip(true); pumpN(40);
      Game.toTitle(); DUO.pump(1 / 60);
      clean('タイトル');
      DUO.reset();
    }
  });

  /* ==========================================================================
     9. 完走: S7 perfect / delay250 × seed 1〜30、エンドレス（鏡・コアのゾーン）3000m
     ========================================================================== */
  DUO.__suites.push({
    name: 'P8a: S7 完走（perfect / delay250 × seed 1〜30）・エンドレス 3000m（鏡→コアのゾーンを含む）',
    quick: false,
    run(t) {
      const In = I(), U = In.U;
      ['perfect', 'delay250'].forEach((mode) => {
        let ok = 0; const bad = [];
        for (let seed = 1; seed <= 30; seed++) {
          DUO.reset(); DUO.start('S7', seed); DUO.bot(mode);
          let g = 0;
          while (Game.status === 'playing' && g++ < 60 * 200) DUO.__step(1 / 60);
          if (Game.status === 'goal' || Game.status === 'clear' || Game.status === 'allclear') ok++;
          else bad.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
        }
        t.eq(ok, 30, 'S7 ' + mode + ' 30/30 完走（落ちた種: ' + bad.slice(0, 5).join(',') + '）');
      });
      /* エンドレス: 全クリア時、鏡の世界ゾーン（4000m〜）の手前から 3000m（鏡→コア→ネオン） */
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
      /* 鏡の世界ゾーンに世界反転（紫）がある種を3つ選ぶ（顔ぶれはシード次第） */
      const seeds = [];
      for (let seed = 1; seed <= 30 && seeds.length < 3; seed++) {
        const ge = In.createGenerator(In.makeStage('endless'), seed);
        ge.ensure(6900, 0);
        /* P8b（契約§4.5b）: 鏡はエンドレスから除外。世界反転は 1000m ごとに1回 */
        if (ge.swaps.some((r) => r.from > 3900 && r.to < 6900) && !ge.mirrors.length) seeds.push(seed);
      }
      t.eq(seeds.length, 3, 'エンドレスの鏡の世界ゾーン付近に世界反転がある（鏡は無い）種: ' + seeds.join(','));
      ['perfect', 'delay250'].forEach((mode) => {
        const bad = []; let flips = 0;
        seeds.forEach((seed) => {
          DUO.reset(); DUO.start('endless', seed); DUO.bot(mode);
          DUO.skipTo(3900);
          let g = 0, was = false;
          while (Game.status === 'playing' && Game.dist < 6900 && g++ < 400000) {
            DUO.__step(1 / 60);
            if (Game.worldFlip && !was) flips++;
            was = Game.worldFlip;
          }
          if (Game.dist < 6900) bad.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
        });
        t.ok(flips >= 3, 'エンドレス ' + mode + ': 走行中に世界反転を ' + flips + '回 通過');
        t.eq(bad.length, 0, 'エンドレス ' + mode + ': 3900→6900m（鏡・コアのゾーン）を 3/3 走りきる（' + (bad.join(',') || 'なし') + '・世界反転 ' + flips + '回）');
      });
      U.lsRestore(snap);
      DUO.reset();
    }
  });
})();
