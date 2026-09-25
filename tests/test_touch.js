/* ============================================================================
   tests/test_touch.js — タッチ操作（合成 touchstart/touchmove/touchend）
   契約 §4.2 改訂: 画面を**上下に2分割**。下半分＝床のLUMEN／上半分＝天井のUMBRA。
   フリックは「足場から離れる向き＝ジャンプ」＝ LUMEN は上、UMBRA は下。
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const app = () => document.getElementById('app');

  const canSynth = (typeof window.Touch === 'function' && typeof window.TouchEvent === 'function');

  function mk(id, x, y) { return new Touch({ identifier: id, target: app(), clientX: x, clientY: y, pageX: x, pageY: y }); }
  function fire(type, touches) {
    app().dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, changedTouches: touches, touches: touches, targetTouches: touches
    }));
  }
  function flick(id, x0, y0, dx, dy) {
    fire('touchstart', [mk(id, x0, y0)]);
    fire('touchmove', [mk(id, x0 + dx, y0 + dy)]);
    fire('touchend', [mk(id, x0 + dx, y0 + dy)]);
  }
  function freshPlay() {
    DUO.reset();
    DUO.start('S0', 77);
    I().clearObstacles();
  }
  const settle = () => { for (let i = 0; i < 45; i++) DUO.pump(1 / 60); };

  DUO.__suites.push({
    name: 'タッチ経路（上下2分割・足場から離れる向きがジャンプ）',
    quick: true,
    run(t) {
      if (!canSynth) { t.info('この環境では Touch を合成できないため DUO.touch 経路のみ検証'); }
      const H = () => (app().clientHeight || window.innerHeight);
      const X = () => (app().clientWidth || window.innerWidth) / 2;
      const F = I().CFG.TOUCH_FLICK;

      freshPlay();
      if (canSynth) {
        /* 下半分の上フリック → LUMEN がジャンプ（床から離れる向き） */
        flick(1, X(), H() * 0.78, 0, -(F + 10));
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.act, 'jump', '下半分の上フリックで LUMEN がジャンプ');
        t.eq(DUO.state().runners.umbra.act, 'run', '下半分の操作は UMBRA に届かない');
        settle();

        /* 下半分の下フリック（足場へ向かう向き）→ 何も起きない（契約§4.2 2026-09-27 スライディング失効） */
        const snap = (r) => JSON.stringify({ act: r.act, actT: r.actT, lane: r.lane, box: r.box });
        const l0 = snap(DUO.state().runners.lumen), u0 = snap(DUO.state().runners.umbra);
        const q0 = I().Input.queue.length;
        flick(2, X(), H() * 0.78, 0, F + 10);
        t.eq(I().Input.queue.length, q0 + 1, '実 TouchEvent の下フリックは入力として届く（キューに1件）');
        DUO.pump(1 / 60);
        t.eq(snap(DUO.state().runners.lumen), l0, '下半分の下フリックで LUMEN の状態は変わらない（実 TouchEvent）');
        t.eq(snap(DUO.state().runners.umbra), u0, '〃 UMBRA にも届かない');
        settle();

        /* 上半分の下フリック → UMBRA がジャンプ（天井から離れる向き＝画面では下） */
        flick(3, X(), H() * 0.22, 0, F + 10);
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.act, 'jump', '上半分の下フリックで UMBRA がジャンプ');
        t.eq(DUO.state().runners.lumen.act, 'run', '上半分の操作は LUMEN に届かない');
        settle();

        /* 上半分の上フリック（足場へ向かう向き）→ 何も起きない */
        const l1 = snap(DUO.state().runners.lumen), u1 = snap(DUO.state().runners.umbra);
        flick(4, X(), H() * 0.22, 0, -(F + 10));
        DUO.pump(1 / 60);
        t.eq(snap(DUO.state().runners.umbra), u1, '上半分の上フリックで UMBRA の状態は変わらない（実 TouchEvent）');
        t.eq(snap(DUO.state().runners.lumen), l1, '〃 LUMEN にも届かない');
        settle();

        /* 横フリックはスクリーン基準（上下どちらも同じ向き） */
        flick(5, X(), H() * 0.78, -(F + 10), 0);
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, -1, '下半分の左フリックで LUMEN が左レーンへ');
        flick(6, X(), H() * 0.22, F + 10, 0);
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.lane, 1, '上半分の右フリックで UMBRA が右レーンへ');

        /* 境界は画面のちょうど中央（開始点の y だけで決まる） */
        freshPlay();
        flick(7, X(), H() / 2 - 4, 0, F + 12);          // 中央のすぐ上 → 上半分扱い
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.act, 'jump', '中央のすぐ上から始めたタッチは UMBRA 担当');
        settle();
        flick(8, X(), H() / 2 + 4, 0, -(F + 12));       // 中央のすぐ下 → 下半分扱い
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.act, 'jump', '中央のすぐ下から始めたタッチは LUMEN 担当');
        settle();

        /* 担当は開始点で決まり、指が反対側へ移っても変わらない */
        freshPlay();
        fire('touchstart', [mk(9, X(), H() * 0.80)]);
        fire('touchmove', [mk(9, X(), H() * 0.80 - (F + 10))]);   // 上半分へ入り込む
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.act, 'jump', '担当は開始点で固定（指が上半分へ入っても LUMEN のまま）');
        t.eq(DUO.state().runners.umbra.act, 'run', 'UMBRA には渡らない');
        fire('touchend', [mk(9, 0, 0)]);
        settle();

        /* 閾値未満は反応しない */
        const before = DUO.state().runners.lumen.lane;
        flick(10, X(), H() * 0.78, -(F - 6), 0);
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, before, 'フリック閾値 ' + F + 'px 未満は無視');

        /* マルチタッチ: 2本同時に別々のキャラを操作 */
        freshPlay();
        fire('touchstart', [mk(20, X() * 0.5, H() * 0.78), mk(21, X() * 1.5, H() * 0.22)]);
        fire('touchmove', [mk(20, X() * 0.5, H() * 0.78 - (F + 10)), mk(21, X() * 1.5, H() * 0.22 + (F + 10))]);
        DUO.pump(1 / 60);
        const s = DUO.state();
        t.eq(s.runners.lumen.act, 'jump', 'マルチタッチ: 下半分でジャンプ');
        t.eq(s.runners.umbra.act, 'jump', 'マルチタッチ: 同時に上半分でもジャンプ（向きは逆）');
        fire('touchend', [mk(20, 0, 0), mk(21, 0, 0)]);
        settle();

        /* 1スワイプ＝1レーン（契約§4.2 改訂 2026-09-21 実機評）。
           指を離さずそのまま戻しても、64px＋220ms を満たさない限り2回目は出ない。 */
        freshPlay();
        const x0 = X();
        fire('touchstart', [mk(30, x0, H() * 0.78)]);
        fire('touchmove', [mk(30, x0 + (F + 4), H() * 0.78)]);
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, 1, '横ドラッグ1回目で右へ');
        fire('touchmove', [mk(30, x0 + (F + 4) - 40, H() * 0.78)]);
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, 1, '同じ指で40pxだけ戻しても2回目は効かない（1スワイプ＝1レーン）');
        fire('touchend', [mk(30, 0, 0)]);
      }

      /* DUO.touch（テストフックの経路。zone は bottom/top、dir はスクリーン方向） */
      freshPlay();
      DUO.touch('bottom', 'up'); DUO.pump(1 / 60);
      t.eq(DUO.state().runners.lumen.act, 'jump', 'DUO.touch(bottom,up) で LUMEN ジャンプ');
      settle();
      DUO.touch('top', 'down'); DUO.pump(1 / 60);
      t.eq(DUO.state().runners.umbra.act, 'jump', 'DUO.touch(top,down) で UMBRA ジャンプ');
      settle();
      DUO.touch('top', 'up'); DUO.pump(1 / 60);
      t.eq(DUO.state().runners.umbra.act, 'run', 'DUO.touch(top,up) では何も起きない');
      settle();
      DUO.touch('bottom', 'down'); DUO.pump(1 / 60);
      t.eq(DUO.state().runners.lumen.act, 'run', 'DUO.touch(bottom,down) では何も起きない');
      settle();
      DUO.touch('top', 'left');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(DUO.state().runners.umbra.lane, -1, 'DUO.touch(top,left) でレーン移動');

      /* 方向変換そのもの（面が入れ替わっても規則は同じ） */
      const In = I();
      t.eq(In.Input.actFromDir('up', 'floor'), 'jump', '床: 上フリック＝ジャンプ');
      t.eq(In.Input.actFromDir('down', 'floor'), null, '床: 下フリック＝無効（null）');
      t.eq(In.Input.actFromDir('up', 'ceil'), null, '天井: 上フリック＝無効（null）');
      t.eq(In.Input.actFromDir('slide', 'floor'), null, "旧 'slide' もそのまま通さない");
      t.eq(In.Input.actFromDir('down', 'ceil'), 'jump', '天井: 下フリック＝ジャンプ');
      t.eq(In.Input.surfaceOfZone('bottom'), 'floor', '下半分＝床');
      t.eq(In.Input.surfaceOfZone('top'), 'ceil', '上半分＝天井');

      /* タッチ領域のUI（§4.8 上下2分割・常時表示） */
      const tz = document.getElementById('touchzones');
      t.ok(!!tz, 'タッチ領域の表示が存在する');
      const top = tz && tz.querySelector('.tz.top');
      const bottom = tz && tz.querySelector('.tz.bottom');
      t.ok(!!top && !!bottom, '上半分・下半分の枠がある');
      t.eq(getComputedStyle(tz).display !== 'none', true, 'タッチ領域は常時表示');
      t.eq(getComputedStyle(tz).pointerEvents, 'none', 'タッチ領域の表示はボタン操作を邪魔しない');
      t.ok(!!document.getElementById('touch-split'), '中央の分割線がある');
      DUO.reset();
    }
  });
  /* HUD の上下チップ（契約§4.3 2026-09-27: 案内は「跳ぶ」だけ。「潜る」は全廃）。
     通常・世界反転・重力反転・その重ね掛けのどれでも、下半分／上半分の足場から離れる向きの「跳ぶ」だけ */
  DUO.__suites.push({
    name: 'HUD チップの案内は「跳ぶ」だけ（通常・世界反転・重力反転）',
    quick: true,
    run(t) {
      const In = I(), Game = In.Game, CFG = In.CFG;
      const keys = (s) => document.getElementById('hand-' + s + '-keys').textContent;
      const both = () => keys('left') + ' / ' + keys('right');
      DUO.reset(); DUO.start('S0', 5); In.clearObstacles(); DUO.pump(1 / 60);
      t.eq(both(), '下半分 ↑跳ぶ / 上半分 ↓跳ぶ', '通常: 「下半分 ↑跳ぶ」「上半分 ↓跳ぶ」');
      Game.setWorldFlip(true);
      for (let i = 0; i < Math.ceil(CFG.HANDSWAP.ROLL_T * 60) + 4; i++) DUO.pump(1 / 60);
      t.eq(DUO.state().worldFlip, true, '（世界反転中）');
      t.eq(both(), '下半分 ↑跳ぶ / 上半分 ↓跳ぶ', '世界反転中も「下半分 ↑跳ぶ」「上半分 ↓跳ぶ」');
      Game.swapSurfaces(); DUO.pump(1 / 60);
      t.eq(both(), '下半分 ↑跳ぶ / 上半分 ↓跳ぶ', '世界反転＋重力反転でも同じ');
      Game.setWorldFlip(false);
      for (let i = 0; i < Math.ceil(CFG.HANDSWAP.ROLL_T * 60) + 4; i++) DUO.pump(1 / 60);
      t.eq(DUO.state().flipped, true, '（重力反転のみ）');
      t.eq(both(), '下半分 ↑跳ぶ / 上半分 ↓跳ぶ', '重力反転中も同じ');
      t.ok(both().indexOf('潜') < 0, 'チップに「潜る」は出ない');
      DUO.reset();
    }
  });
})();
