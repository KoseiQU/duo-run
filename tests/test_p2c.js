/* ============================================================================
   tests/test_p2c.js — P2c（大ジャンプ＝DUO体の自由飛行 ／ エンドレスの加速）

     ・自由飛行の入力: ドラッグ量に比例・最大4.0m/s・断面でクランプ・先の指だけ有効
     ・空中の隙間保証（S2の空中配置 50シード）＝ Fair.validateAir
     ・当たり判定 円 vs 矩形（輪の中は生存・輪の縁は死）
     ・合体0.4秒 → 自由飛行 → 着地の強制分離（最寄りレーン）0.3秒
     ・着地後 2.0秒（speed×2.0m）は障害物なし（生成器と Fair の両方で）
     ・中断（リトライ／タイトル）で合体・入力モード・HUD・カメラが完全復元
     ・エンドレスの加速: 200m ごとに +1（上限44）とボットの生存距離
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const app = () => document.getElementById('app');
  const canSynth = (typeof window.Touch === 'function' && typeof window.TouchEvent === 'function');

  /* 実ステップで dist まで進める（skipTo で直行すると演出イベントが発火しない）。
     描画が要る検査の直前だけ pump に切り替える（描画は重いので既定は更新のみ）。 */
  const advanceTo = (m, limit) => {
    let g = 0;
    while (Game.dist < m && (Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 20000)) DUO.__step(1 / 60);
    return Game.dist;
  };
  const advanceDraw = (m, limit) => {
    let g = 0;
    while (Game.dist < m && (Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 20000)) DUO.pump(1 / 60);
    return Game.dist;
  };
  /* 大ジャンプの滑空へ入る（演出の手前から実ステップで跨ぐ）。
     clearAir=true なら空中の障害物を外して「入力だけ」を測れるようにする。 */
  function toGlide(seed, clearAir, draw) {
    DUO.reset();
    DUO.start('S2', seed === undefined ? 9 : seed);
    DUO.bot('perfect');
    DUO.skipTo(960);
    (draw ? advanceDraw : advanceTo)(1000 + I().Setpieces.BJ.LIP + 6);
    if (clearAir) I().FF.setItems([]);
    return DUO.state();
  }
  function mk(id, x, y) { return new Touch({ identifier: id, target: app(), clientX: x, clientY: y, pageX: x, pageY: y }); }
  function fire(type, touches) {
    app().dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, changedTouches: touches, touches: touches, targetTouches: touches
    }));
  }

  /* ==========================================================================
     1. 自由飛行の入力 → 位置
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: 自由飛行の入力（ドラッグ比例・最大4.0m/s・断面クランプ・先の指だけ）',
    quick: true,
    run(t) {
      const In = I(), FF = In.FF, Inp = In.Input;
      toGlide(9, true);
      DUO.bot(null);
      t.eq(DUO.state().glide, true, '滑空（自由飛行）に入っている');
      t.eq(DUO.state().inputMode, 'free', '入力が自由飛行モードになる（上下分割は無効）');
      t.eq(DUO.state().duoK, 1, '滑空中は完全に DUO体（合体度 1）');

      const w = app().clientWidth || window.innerWidth;
      const h = app().clientHeight || window.innerHeight;
      t.info('画面 ' + w + '×' + h);

      if (canSynth) {
        /* ドラッグ量に比例: 画面幅の 1/3 ＝ 断面の端から端（3.6m） */
        const x0 = FF.body.x, y0 = FF.body.y;
        fire('touchstart', [mk(11, w / 2, h / 2)]);
        fire('touchmove', [mk(11, w / 2 + w / 6, h / 2)]);
        t.near(Inp.free.tx, In.U.clamp(x0 + (FF.X1 - FF.X0) / 2, FF.X0, FF.X1), 1e-6,
               '画面幅 1/6 のドラッグ＝断面の半分（1.8m）だけ目標が動く');
        t.near(Inp.free.ty, y0, 1e-6, '横だけ動かしたら y の目標は変わらない');
        /* 上へドラッグ＝断面では上（画面の y は下向き） */
        fire('touchmove', [mk(11, w / 2 + w / 6, h / 2 - h / 6)]);
        t.near(Inp.free.ty, In.U.clamp(y0 + (FF.Y1 - FF.Y0) / 2, FF.Y0, FF.Y1), 1e-6,
               '画面高さ 1/6 の上ドラッグ＝断面の半分（1.4m）上がる');

        /* 2本目の指は無視（先に触れた指だけが有効） */
        const tx = Inp.free.tx;
        fire('touchstart', [mk(12, w * 0.2, h * 0.8)]);
        fire('touchmove', [mk(12, w * 0.2 + w / 4, h * 0.8)]);
        t.near(Inp.free.tx, tx, 1e-6, '2本目の指の動きは無視される');
        fire('touchend', [mk(12, w * 0.2, h * 0.8)]);

        /* 最大速度 4.0 m/s（各軸・慣性なし） */
        let maxStep = 0, prev = { x: FF.body.x, y: FF.body.y };
        for (let i = 0; i < 40; i++) {
          DUO.__step(1 / 60);
          maxStep = Math.max(maxStep, Math.abs(FF.body.x - prev.x) * 60, Math.abs(FF.body.y - prev.y) * 60);
          prev = { x: FF.body.x, y: FF.body.y };
        }
        t.ok(maxStep <= FF.V + 1e-6, '1フレームあたりの速さ ' + maxStep.toFixed(3) + ' m/s ≤ 4.0');
        t.near(FF.body.x, Inp.free.tx, 1e-6, '指の位置に追いついている（慣性なし）');
        t.near(FF.body.y, Inp.free.ty, 1e-6, '縦も指の位置に追いつく');

        /* 断面でクランプ（大きくドラッグしても外へ出ない） */
        fire('touchmove', [mk(11, w / 2 + w * 3, h / 2 - h * 3)]);
        for (let i = 0; i < 90; i++) DUO.__step(1 / 60);
        t.near(FF.body.x, FF.X1, 1e-6, '右へ振り切っても x は +1.8 で止まる');
        t.near(FF.body.y, FF.Y1, 1e-6, '上へ振り切っても y は +3.4 で止まる');
        fire('touchmove', [mk(11, w / 2 - w * 3, h / 2 + h * 3)]);
        for (let i = 0; i < 120; i++) DUO.__step(1 / 60);
        t.near(FF.body.x, FF.X0, 1e-6, '左へ振り切っても x は −1.8 で止まる');
        t.near(FF.body.y, FF.Y0, 1e-6, '下へ振り切っても y は +0.6 で止まる');
        fire('touchend', [mk(11, 0, 0)]);
        /* 指を離したらその場に留まる（慣性なし） */
        const held = { x: FF.body.x, y: FF.body.y };
        for (let i = 0; i < 30; i++) DUO.__step(1 / 60);
        t.near(FF.body.x, held.x, 1e-6, '指を離すとその場に留まる');
      } else {
        t.info('この環境では Touch を合成できない（キーボード経路のみ検証）');
      }

      /* キーボード（開発・機械テスト用）: どちらの手のキーでも上下左右 */
      toGlide(9, true);
      DUO.bot(null);
      const bx = FF.body.x;
      DUO.key('ArrowLeft', true);
      for (let i = 0; i < 15; i++) DUO.__step(1 / 60);
      DUO.key('ArrowLeft', false);
      t.ok(FF.body.x < bx - 0.5, '右手のキーでも左へ動く（' + FF.body.x.toFixed(2) + '）');
      const bx2 = FF.body.x;
      DUO.key('KeyD', true);
      for (let i = 0; i < 15; i++) DUO.__step(1 / 60);
      DUO.key('KeyD', false);
      t.ok(FF.body.x > bx2 + 0.5, '左手のキーでも右へ動く（' + FF.body.x.toFixed(2) + '）');
      const by = FF.body.y;
      DUO.key('KeyW', true);
      for (let i = 0; i < 12; i++) DUO.__step(1 / 60);
      DUO.key('KeyW', false);
      t.ok(FF.body.y > by + 0.4, '上キーで断面を上へ（' + FF.body.y.toFixed(2) + '）');
      const after = FF.body.y;
      for (let i = 0; i < 20; i++) DUO.__step(1 / 60);
      t.near(FF.body.y, after, 1e-6, 'キーを離すと止まる（慣性なし）');

      /* 上下分割・1スワイプ1レーンの規則は無効（ジャンプもスライドもレーン移動も起きない） */
      const snap0 = DUO.state().runners;
      DUO.touch('bottom', 'up'); DUO.touch('top', 'down'); DUO.touch('bottom', 'right');
      DUO.__step(1 / 60);
      const snap1 = DUO.state().runners;
      t.eq(snap1.lumen.act, 'run', '滑空中はフリックでジャンプしない（LUMEN）');
      t.eq(snap1.umbra.act, 'run', '滑空中はフリックでジャンプしない（UMBRA）');
      t.eq(snap1.lumen.lane, snap0.lumen.lane, '滑空中はレーン移動も起きない');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 空中の隙間保証（S2 の空中配置・シード固定・50シード）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: 空中の隙間が必ず存在し最大速度で届く（S2 50シード / Fair.validateAir）',
    quick: true,
    run(t) {
      const In = I(), FF = In.FF, Sp = In.Setpieces;
      const st = In.makeStage('S2');
      let bad = 0, walls = 0, minWalls = 99, firstErr = '';
      const kinds = {};
      for (let seed = 1; seed <= 50; seed++) {
        const c = Sp.buildAir(seed, 1000, st.speedAt);
        /* 契約§4.5 の不変条件（余裕 FF.REACT 込み＝0.25秒遅れのボットでも間に合う） */
        const errs = In.Fair.validateAir(c, st.speedAt, { margin: true });
        if (errs.length) { bad++; if (!firstErr) firstErr = 'seed' + seed + ': ' + errs[0]; }
        walls += c.items.length;
        minWalls = Math.min(minWalls, c.items.length);
        c.items.forEach((it) => { kinds[it.kind] = (kinds[it.kind] || 0) + 1; });
        /* 発射前・着地後にはみ出さない */
        c.items.forEach((it) => {
          if (it.at <= c.launchM || it.at >= c.landM) bad++;
        });
      }
      t.eq(bad, 0, '50シードとも空中の不変条件を満たす（' + firstErr + '）');
      t.ok(minWalls >= 3, '1回の滑空に空中の壁が ' + minWalls + '本以上（平均 ' + (walls / 50).toFixed(1) + '本）');
      t.ok(Object.keys(kinds).length === 4,
           '4種類すべてが出る（' + Object.keys(kinds).map((k) => k + ':' + kinds[k]).join(' ') + '）');
      t.ok((kinds.ring || 0) >= 25, '光の輪が十分な頻度で出る（' + (kinds.ring || 0) + '個/50シード）');

      /* 同じシードなら同じ譜面（シード固定） */
      const a = Sp.buildAir(7, 1000, st.speedAt), b = Sp.buildAir(7, 1000, st.speedAt);
      t.eq(JSON.stringify(a.items.map((x) => [x.at, x.kind, x.gap.x, x.gap.y])),
           JSON.stringify(b.items.map((x) => [x.at, x.kind, x.gap.x, x.gap.y])), '同じシードなら同じ空中配置');

      /* 検査そのものが働くか（わざと届かない隙間を作る） */
      const bad2 = Sp.buildAir(3, 1000, st.speedAt);
      bad2.items[0].gap.x = FF.X1;
      bad2.items[0].gap.y = FF.Y1;
      bad2.items[1].gap.x = FF.X0;
      bad2.items[1].gap.y = FF.Y0;
      bad2.items[1].gap.openX = false; bad2.items[1].gap.openY = false;
      bad2.items[1].rects = FF.rects(bad2.items[1].gap);
      t.ok(In.Fair.validateAir(bad2, st.speedAt).length > 0, '届かない隙間は検査で弾ける');

      /* ゾーン非依存（S8・エンドレスのミニ版でもそのまま使える）。
         見た目だけ Zones の obstacleSkin.aerial で差し替えられる形になっている。 */
      t.eq(FF.skin().id, 'default', 'ゾーンが空中のスキンを持たなければ既定の見た目');
      const sk = In.Zones.skin();
      sk.aerial = { id: 'test-aerial', COL: { ring: 0x00ff00 } };
      t.eq(FF.skin().id, 'test-aerial', 'ゾーンの obstacleSkin.aerial で差し替えられる');
      FF._applySkin();
      t.eq(FF.view.mat.ring.color.getHex(), 0x00ff00, '差し替えた配色が実際のマテリアルに載る');
      delete sk.aerial;
      FF._applySkin();
      t.eq(FF.view.mat.ring.color.getHex(), FF.SKIN.COL.ring, '外すと既定の配色へ戻る');
      DUO.reset();
    }
  });

  /* ==========================================================================
     3. 当たり判定（円 vs 矩形）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: 空中の当たり判定は円 vs 矩形（輪の中は生存・輪の縁は死）',
    quick: true,
    run(t) {
      const In = I(), FF = In.FF;
      const ring = (x, y) => {
        const gap = { x: x, y: y, hw: FF.HOLE, hh: FF.HOLE, openX: false, openY: false };
        return { at: 100, kind: 'ring', gap: gap, rects: FF.rects(gap) };
      };
      const it = ring(0, 2);
      t.eq(it.rects.length, 4, '輪は上下左右の4枚で断面を塞ぐ（通れるのは輪の中だけ）');
      t.eq(FF.passable(0, 2, it), true, '輪の中心は通れる');
      const edge = FF.HOLE - FF.R;             // ここまでが通れる（円がちょうど縁に触れる）
      t.eq(FF.passable(edge - 0.02, 2, it), true, '縁の内側（' + (edge - 0.02).toFixed(2) + '）は通れる');
      t.eq(FF.passable(edge + 0.05, 2, it), false, '縁に掛かると死ぬ（' + (edge + 0.05).toFixed(2) + '）');
      t.eq(FF.passable(0, 2 + edge + 0.05, it), false, '上の縁に掛かっても死ぬ');
      t.eq(FF.passable(0, 2 - edge - 0.05, it), false, '下の縁に掛かっても死ぬ');
      /* 点ではなく円で見ている証明: 中心は穴の中なのに、体の半径ぶん縁に掛かれば死ぬ */
      const inX = 0.60, inY = 2.60;
      t.ok(Math.abs(inX) < FF.HOLE && Math.abs(inY - 2) < FF.HOLE, '(0.60, 2.60) は穴の矩形の中にある点');
      t.eq(FF.passable(inX, inY, it), false, '穴の中の点でも体（半径0.45）が縁に掛かれば死ぬ＝円で見ている');
      /* 帯（電線）は開いている軸には無限に動ける */
      const slotGap = { x: 0, y: 2, hw: FF.SLOT, hh: FF.SLOT, openX: true, openY: false };
      const slot = { at: 100, kind: 'wires', gap: slotGap, rects: FF.rects(slotGap) };
      t.eq(slot.rects.length, 2, '電線の束は上下2枚（横帯が空く）');
      t.eq(FF.passable(FF.X0, 2, slot), true, '横帯は端まで通れる');
      t.eq(FF.passable(0, 2 + FF.SLOT - FF.R + 0.06, slot), false, '帯の外に出ると死ぬ');

      /* 実際の走行で「輪の中なら生存・縁なら死」になるか（実ステップで跨ぐ） */
      const run = (dx) => {
        toGlide(5, false);
        DUO.bot(null);
        const at = Game.dist + Game.speed * 1.2;
        const g = { x: 0, y: 2, hw: FF.HOLE, hh: FF.HOLE, openX: false, openY: false };
        FF.setItems([{ at: at, kind: 'ring', gap: g, rects: FF.rects(g), view: null }]);
        FF.body.x = dx; FF.body.y = 2;
        In.Input.freeAim(dx, 2, 'test');
        let guard = 0;
        while (Game.dist < at + 2 && guard++ < 600) DUO.__step(1 / 60);
        return Game.status;
      };
      t.eq(run(0), 'playing', '輪の中を通れば生き残る');
      t.ok(run(FF.HOLE + 0.2) !== 'playing', '輪の縁にぶつかると死ぬ');
      t.eq(Game.killer && Game.killer.obstacle, 'AIR_ring', '死因は空中の輪（' + (Game.killer && Game.killer.obstacle) + '）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. 合体 → 自由飛行 → 着地の強制分離 と 着地後の猶予
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: 合体0.4秒／着地で最寄りレーンへ強制分離／着地後2.0秒は障害物なし',
    quick: true,
    run(t) {
      const In = I(), FF = In.FF, Sp = In.Setpieces, B = In.Setpieces.BJ;
      /* --- 合体（発射台の手前 0.4秒で 0→1） --- */
      DUO.reset(); DUO.start('S2', 12); DUO.bot('perfect');
      DUO.skipTo(960);
      advanceTo(1000 + B.LIP - Game.speed * 0.42);
      t.eq(Sp.duoK(Game.dist) < 0.15, true, '発射台の 0.4秒手前はまだ合体していない（' + Sp.duoK(Game.dist).toFixed(2) + '）');
      t.eq(DUO.state().inputMode, 'lanes', '合体前の入力は通常モード');
      advanceTo(1000 + B.LIP - Game.speed * 0.2);
      const mid = Sp.duoK(Game.dist);
      t.ok(mid > 0.2 && mid < 0.9, '合体の途中（' + mid.toFixed(2) + '）＝0.4秒かけて1体になる');
      t.eq(DUO.state().duo.on, false, 'まだ自由飛行は始まっていない');
      advanceTo(1000 + B.LIP + 2);
      t.eq(Sp.duoK(Game.dist), 1, '発射の瞬間に完全な DUO体');
      t.eq(DUO.state().duo.on, true, '自由飛行が始まっている');
      t.eq(DUO.state().inputMode, 'free', '入力が自由飛行モードに切り替わる');
      t.eq(document.getElementById('cue').classList.contains('on'), true, '「FREE FLIGHT」の指示が出る');
      t.ok(document.getElementById('cue-main').textContent.indexOf('FREE FLIGHT') >= 0,
           '指示の文字は FREE FLIGHT（' + document.getElementById('cue-main').textContent + '）');
      t.eq(document.getElementById('touchzones').classList.contains('free'), true, '上下の枠・分割線が消える');

      /* 指示は1回だけ（少し進むと引っ込む） */
      advanceTo(1000 + B.LIP + Game.speed * 2.0);
      t.eq(document.getElementById('cue').classList.contains('on'), false, '指示は1回出したら消える');

      /* --- 着地の強制分離: DUO体の x に最も近いレーンへ --- */
      const check = (x, wantLane) => {
        toGlide(12, true);
        FF.body.x = x;
        In.Input.freeAim(x, FF.body.y, 'test');
        advanceTo(1000 + B.LAND + 4);
        const s = DUO.state();
        t.eq(s.runners.lumen.lane, wantLane, 'x=' + x + ' → LUMEN は レーン' + wantLane + '（' + s.runners.lumen.lane + '）');
        t.eq(s.runners.umbra.lane, wantLane, 'x=' + x + ' → UMBRA も同じレーン');
        t.eq(s.duo.on, false, '着地で自由飛行が終わる');
        t.eq(s.inputMode, 'lanes', '着地で入力が通常モードへ戻る');
        t.eq(document.getElementById('touchzones').classList.contains('free'), false, '着地で枠が戻る');
        t.eq(s.runners.lumen.surface, 'floor', 'LUMEN は床へ戻る');
        t.eq(s.runners.umbra.surface, 'ceil', 'UMBRA は天井へ戻る');
        return s;
      };
      check(1.5, 1);
      check(-1.4, -1);
      const s0 = check(0.2, 0);
      t.ok(s0.duoK > 0 && s0.duoK < 1, '着地直後は分離演出の途中（' + s0.duoK + '）');
      t.ok(Sp.camFx().shake > 0.02, '着地の衝撃でカメラが揺れる（' + Sp.camFx().shake.toFixed(3) + '）');
      advanceTo(Game.dist + Game.speed * 0.35);
      t.eq(Sp.duoK(Game.dist), 0, '0.3秒で分離しきる');

      /* --- 着地後 2.0秒（speed×2.0m）は障害物なし --- */
      const st = In.makeStage('S2');
      const landM = 1000 + B.LAND;
      let worst = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1200; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        worst += In.Fair.landingGrace(g.obstacles, landM, st.speedAt).length;
      }
      t.eq(worst, 0, 'S2 20シードで着地後 ' + (st.speedAt(landM) * FF.GRACE_T).toFixed(1) + 'm に障害物なし');

      /* 演出の後にまだ走る長さがあるステージでも守られる（ステージ末尾に頼らない証明） */
      const st2 = In.makeStage('S2');
      st2.lengthM = 1800;
      const spStart = st2.lengthM - In.Setpieces.DEFS.bigjump.lengthM;
      const landM2 = spStart + In.Setpieces.DEFS.bigjump.landRel;
      let bad2 = 0, after = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const g = In.createGenerator(st2, seed);
        for (let d = 0; d < 1800; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        bad2 += In.Fair.landingGrace(g.obstacles, landM2, st2.speedAt).length;
        after += g.obstacles.filter((o) => o.at > landM2 + st2.speedAt(landM2) * FF.GRACE_T).length;
      }
      t.eq(bad2, 0, '演出の先に道があるステージでも着地猶予は守られる');
      t.ok(after > 0, '猶予のあとはちゃんと障害物が再開する（' + after + '個）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. 中断（リトライ／タイトル）で完全復元
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: 中断で合体・入力モード・HUD・カメラが完全復元',
    quick: true,
    run(t) {
      const In = I(), FF = In.FF, W = In.World;
      const fogFar0 = W.scene.fog.far;
      toGlide(9, false, true);
      t.eq(DUO.state().duo.on, true, '滑空に入った');
      t.eq(FF.view.root.visible, true, '空中の障害物が描かれている');
      Game.retry();
      t.eq(DUO.state().duo.on, false, 'リトライで自由飛行が解除される');
      t.eq(DUO.state().inputMode, 'lanes', 'リトライで入力モードが戻る');
      t.eq(DUO.state().duoK, 0, 'リトライで合体が解ける');
      t.eq(FF.body.x, 0, 'DUO体の位置が中央へ戻る');
      t.eq(FF.course, null, '空中の譜面が捨てられる');
      t.eq(FF.view.root.visible, false, '空中の障害物の見た目が消える');
      t.eq(FF.view.duo.visible, false, 'DUO体の光が消える');
      t.eq(document.getElementById('touchzones').classList.contains('free'), false, '上下の枠が戻る');
      t.eq(document.getElementById('cue').classList.contains('on'), false, '指示が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧が戻る');
      /* リトライ後に通常の操作ができる */
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
      t.eq(DUO.state().runners.lumen.act, 'jump', 'リトライ後は普通にジャンプできる');

      /* タイトルへ戻しても同じ */
      toGlide(9, false, true);
      Game.toTitle();
      t.eq(DUO.state().duo.on, false, 'タイトルで自由飛行が解除される');
      t.eq(DUO.state().inputMode, 'lanes', 'タイトルで入力モードが戻る');
      t.eq(In.Input.free.owner, null, '掴んでいた指が残らない');
      for (let i = 0; i < 90; i++) DUO.pump(1 / 60);
      t.ok(Math.abs(W.camera.position.y - In.CFG.CAM.Y) < 0.3, 'カメラの高さが戻る（' + W.camera.position.y.toFixed(2) + '）');
      DUO.reset();
      t.eq(DUO.state().duoK, 0, 'reset でも合体が残らない');
    }
  });

  /* ==========================================================================
     5.5 P2c-2: 巨岩（S3）の判読性 — 振り返りカット2の構図
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c-2: 巨岩の振り返りカット2は岩の輪郭が画面に入る（占有 55〜80%）',
    quick: true,
    run(t) {
      const In = I(), Sp = In.Setpieces, W = In.World, R = Sp.ROCK;
      W.setViewport(812, 375, 1);
      t.eq(R.CUT_BACK.length, R.LOOKBACK.length, 'カットごとにカメラの引き量が定義されている');
      t.ok(R.CUT_BACK[1] > R.CUT_BACK[0], 'カット2のほうが大きく引く（岩が近いので）');
      const peak = (cut) => {
        DUO.reset(); DUO.start('S3', 7); DUO.bot('perfect'); DUO.skipTo(960);
        let g = 0, best = 0, bestLb = 0;
        /* カットの手前までは更新だけ（描画は重い）。カットに入ってから描いて測る。 */
        const from = R.LOOKBACK[cut][0] - 6;
        while (Game.status === 'playing' && g++ < 9000 &&
               (!Sp.state || Game.dist < Sp.state.startM + from)) DUO.__step(1 / 60);
        g = 0;
        while (Game.status === 'playing' && g++ < 9000) {
          DUO.pump(1 / 60);
          const i = Sp.lookBackCut(Game.dist), lb = Sp.lookBack(Game.dist);
          if (i === cut && lb > bestLb) { bestLb = lb; best = Sp.rockOnScreen(); }
          if (i < cut && bestLb > 0) break;
          if (Sp.state && Game.dist > Sp.state.startM + 200) break;
        }
        return { cover: best, lb: bestLb };
      };
      const c2 = peak(1);
      t.ok(c2.lb > 0.9, 'カット2の頂点まで到達（振り返り ' + c2.lb.toFixed(2) + '）');
      t.ok(c2.cover >= 0.55 && c2.cover <= 0.80,
           'カット2の巨岩が画面の ' + (c2.cover * 100).toFixed(0) + '%（55〜80%＝輪郭が画面に入る）');
      /* 岩の造形: 球を割って頂点を乱し、溝の帯を彫ってある（転がりが読める） */
      const geo = Sp.rock.body.geometry;
      t.ok(geo.attributes.position.count >= 1000, '岩は細かく割ってある（頂点 ' + geo.attributes.position.count + '）');
      let rMin = 1e9, rMax = 0;
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i += 7) {
        const d = Math.sqrt(p.getX(i) * p.getX(i) + p.getY(i) * p.getY(i) + p.getZ(i) * p.getZ(i));
        rMin = Math.min(rMin, d); rMax = Math.max(rMax, d);
      }
      t.ok(rMax - rMin > R.R * 0.12, '半径が ' + (rMax - rMin).toFixed(2) + 'm ぶら付く＝凹凸と溝が彫られている');
      t.ok(rMax <= R.R + 1e-6, '彫った結果が半径 ' + R.R + 'm を超えない（判定と食い違わない）');
      /* 転がりに合わせて模様が回る（走行距離の関数） */
      DUO.reset(); DUO.start('S3', 7); DUO.bot('perfect'); DUO.skipTo(960);
      let g2 = 0;
      while (Sp.id() !== 'rockchase' && g2++ < 9000) DUO.__step(1 / 60);
      const rot0 = Sp.rock.spin.rotation.x;
      for (let i = 0; i < 40; i++) DUO.pump(1 / 60);
      t.ok(Math.abs(Sp.rock.spin.rotation.x - rot0) > 0.5, '進むと岩が転がる（模様が回る）');
      /* 明かりは近景を飛ばさない強さに（カット1 < カット2） */
      t.ok(R.EMBER[0] < R.EMBER[1], 'カット1の明かりはカット2より弱い（近景が飛ばない）');
      DUO.reset(); W.resize();
    }
  });

  /* ==========================================================================
     6. エンドレスの加速（契約§4.4 2026-09-21 改訂）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: エンドレスは 200m ごとに +1 m/s（上限44）',
    quick: true,
    run(t) {
      const In = I();
      const e = In.makeStage('endless');
      t.near(e.speedAt(0), 16, 1e-6, '開始は 16 m/s');
      t.near(e.speedAt(200), 17, 1e-6, '200m で 17 m/s');
      t.near(e.speedAt(1000), 21, 1e-6, '1000m で 21 m/s');
      t.near(e.speedAt(3000), 31, 1e-6, '3000m で 31 m/s');
      t.near(e.speedAt(5600), 44, 1e-6, '5600m で上限 44 m/s');
      t.near(e.speedAt(9000), 44, 1e-6, '上限を超えない');
      for (let m = 0; m <= 5600; m += 200) {
        if (m + 200 > 5600) break;
        if (Math.abs((e.speedAt(m + 200) - e.speedAt(m)) - 1) > 1e-6) {
          t.ok(false, m + 'm→' + (m + 200) + 'm の加速が +1 ではない');
          break;
        }
      }
      t.ok(true, '全区間で 200m ごとにちょうど +1 m/s');
      /* 密度は §4.7 の規範どおり 1000m ごとに +1（上限14） */
      const g = In.createGenerator(e, 1);
      t.eq(!!g, true, 'エンドレスの生成器が作れる');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P2c: エンドレスをボットが走り切る（perfect 3000m / delay250 1500m × seed 1〜20）',
    quick: false,
    run(t) {
      const runTo = (seed, mode, goal) => {
        DUO.reset(); DUO.start('endless', seed); DUO.bot(mode);
        let g = 0;
        while (Game.status === 'playing' && Game.dist < goal && g++ < 400000) DUO.__step(1 / 60);
        return Game.dist;
      };
      let p = 0, d = 0;
      const pf = [], df = [];
      for (let seed = 1; seed <= 20; seed++) {
        const m = runTo(seed, 'perfect', 3050);
        if (m >= 3000) p++; else pf.push(seed + '@' + Math.floor(m));
      }
      for (let seed = 1; seed <= 20; seed++) {
        const m = runTo(seed, 'delay250', 1550);
        if (m >= 1500) d++; else df.push(seed + '@' + Math.floor(m));
      }
      DUO.reset();
      t.eq(p, 20, 'perfect が 3000m 以上生存 20/20（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.eq(d, 20, 'delay250 が 1500m 以上生存 20/20（落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     7. ボットが自由飛行を抜けられる（S2 の大ジャンプを跨ぐ）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2c: ボットが自由飛行を抜ける（perfect / delay250 × seed 1〜50）',
    quick: false,
    run(t) {
      const In = I(), B = In.Setpieces.BJ;
      const cross = (seed, mode) => {
        DUO.reset(); DUO.start('S2', seed); DUO.bot(mode);
        DUO.skipTo(960);
        let g = 0;
        while (Game.status === 'playing' && Game.dist < 1000 + B.END && g++ < 20000) DUO.__step(1 / 60);
        return Game.dist >= 1000 + B.LAND;
      };
      let p = 0, d = 0;
      const df = [];
      for (let seed = 1; seed <= 50; seed++) if (cross(seed, 'perfect')) p++;
      for (let seed = 1; seed <= 50; seed++) { if (cross(seed, 'delay250')) d++; else df.push(seed); }
      DUO.reset();
      t.eq(p, 50, 'perfect が 50/50 で自由飛行を抜ける');
      t.eq(d, 50, 'delay250 も 50/50 で自由飛行を抜ける（落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });
})();
