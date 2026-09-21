/* ============================================================================
   tests/test_touch.js — スマホ操作（合成 touchstart/touchmove/touchend でフリック）
   ・左半分＝LUMEN専用 / 右半分＝UMBRA専用、マルチタッチ（§4.2）
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
  /* 実イベントでのフリック1回 */
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

  DUO.__suites.push({
    name: 'タッチ経路（合成イベントでフリックが認識される）',
    quick: true,
    run(t) {
      if (!canSynth) { t.info('この環境では Touch を合成できないため DUO.touch 経路のみ検証'); }
      const W = () => (app().clientWidth || window.innerWidth);
      const F = I().CFG.TOUCH_FLICK;

      freshPlay();
      if (canSynth) {
        /* 左半分の上フリック → LUMEN がジャンプ */
        flick(1, W() * 0.25, 600, 0, -(F + 10));
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.act, 'jump', '左半分の上フリックで LUMEN がジャンプ');
        t.eq(DUO.state().runners.umbra.act, 'run', '左半分の操作は UMBRA に届かない');
        for (let i = 0; i < 40; i++) DUO.pump(1 / 60);

        /* 右半分の下フリック → UMBRA がスライド */
        flick(2, W() * 0.75, 600, 0, F + 10);
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.act, 'slide', '右半分の下フリックで UMBRA がスライド');
        for (let i = 0; i < 40; i++) DUO.pump(1 / 60);

        /* 横フリック */
        flick(3, W() * 0.25, 600, -(F + 10), 0);
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, -1, '左半分の左フリックで LUMEN が左レーンへ');
        flick(4, W() * 0.75, 600, F + 10, 0);
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.lane, 1, '右半分の右フリックで UMBRA が右レーンへ');

        /* 閾値未満は反応しない */
        const before = DUO.state().runners.lumen.lane;
        flick(5, W() * 0.25, 600, -(F - 6), 0);
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, before, 'フリック閾値 ' + F + 'px 未満は無視');

        /* マルチタッチ: 2本同時に別々のキャラを操作 */
        freshPlay();
        fire('touchstart', [mk(10, W() * 0.25, 600), mk(11, W() * 0.75, 600)]);
        fire('touchmove', [mk(10, W() * 0.25, 600 - (F + 10)), mk(11, W() * 0.75, 600 + (F + 10))]);
        DUO.pump(1 / 60);
        let s = DUO.state();
        t.eq(s.runners.lumen.act, 'jump', 'マルチタッチ: 左手でジャンプ');
        t.eq(s.runners.umbra.act, 'slide', 'マルチタッチ: 同時に右手でスライド');
        fire('touchend', [mk(10, 0, 0), mk(11, 0, 0)]);

        /* 同じ指のドラッグ継続で2回目のジェスチャが取れる */
        freshPlay();
        const x0 = W() * 0.25;
        fire('touchstart', [mk(20, x0, 600)]);
        fire('touchmove', [mk(20, x0 + (F + 4), 600)]);       // 1回目: 右へ
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, 1, '横ドラッグ1回目で右へ');
        fire('touchmove', [mk(20, x0, 600)]);                 // 2回目: 指を離さず左へ
        for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, 0, '指を離さない継続ドラッグで2回目のジェスチャも効く');
        fire('touchend', [mk(20, 0, 0)]);
      }

      /* DUO.touch（テストフックの経路） */
      freshPlay();
      DUO.touch('left', 'up'); DUO.pump(1 / 60);
      t.eq(DUO.state().runners.lumen.act, 'jump', 'DUO.touch(left,up) でジャンプ');
      DUO.touch('right', 'down'); DUO.pump(1 / 60);
      t.eq(DUO.state().runners.umbra.act, 'slide', 'DUO.touch(right,down) でスライド');
      DUO.touch('right', 'left');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(DUO.state().runners.umbra.lane, -1, 'DUO.touch(right,left) でレーン移動');

      /* タッチ領域のUIが用意されている（§4.8 画面下1/3の左右色分け） */
      const tz = document.getElementById('touchzones');
      t.ok(!!tz && tz.children.length === 2, '画面下のタッチ領域（左右）が存在する');
    }
  });
})();
