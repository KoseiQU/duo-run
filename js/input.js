/* ============================================================================
   DUO RUN — input.js  PCキー（e.code）／スマホのマルチタッチ＋フリック（§4.2）
   入力は必ずこのキューを通す（人間もボットも同じ経路＝テストしやすい）。
   ============================================================================ */
'use strict';

const Input = {
  queue: [],            // {hand:'left'|'right', act:'left'|'right'|'jump'|'slide'}
  held: {},             // keydownのエッジ検出用
  touches: {},          // identifier -> {side, x, y}
  enabled: true,

  push(hand, act) {
    if (!Input.enabled) return false;
    Input.queue.push({ hand: hand, act: act });
    return true;
  },
  drain() { const q = Input.queue; Input.queue = []; return q; },
  clear() { Input.queue.length = 0; Input.held = {}; Input.touches = {}; },

  /* --- キーボード --------------------------------------------------------- */
  keyEvent(code, down) {
    const map = CFG.KEYMAP[code];
    if (!map) return false;
    if (down) {
      if (Input.held[code]) return false;     // オートリピートは1動作に潰す
      Input.held[code] = true;
      return Input.push(map.hand, map.act);
    }
    delete Input.held[code];
    return false;
  },

  /* --- タッチ（画面左半分＝左手 / 右半分＝右手・マルチタッチ） ------------ */
  touchStart(id, x, y, width) {
    Input.touches[id] = { side: (x < width / 2) ? 'left' : 'right', x: x, y: y };
  },
  touchMove(id, x, y) {
    const t = Input.touches[id];
    if (!t) return null;
    const dx = x - t.x, dy = y - t.y;
    if (Math.abs(dx) < CFG.TOUCH_FLICK && Math.abs(dy) < CFG.TOUCH_FLICK) return null;
    let g;
    if (Math.abs(dx) >= Math.abs(dy)) g = (dx > 0) ? 'right' : 'left';
    else g = (dy > 0) ? 'slide' : 'jump';    // 下フリック＝スライド / 上フリック＝ジャンプ
    t.x = x; t.y = y;                        // 連続ドラッグを許す
    Input.push(t.side, g);
    return g;
  },
  touchEnd(id) { delete Input.touches[id]; },

  /* テスト用の直接入力（DUO.touch） */
  gesture(side, g) { return Input.push(side, g); },

  /* e.code が本筋。空のときだけ e.key から補う（§4.2 の判定は e.code） */
  codeOf(e) {
    if (e.code) return e.code;
    const k = e.key || '';
    return CFG.KEY_ALIAS[k] || CFG.KEY_ALIAS[k.toLowerCase()] || '';
  },

  /* --- DOM への接続 ------------------------------------------------------- */
  attach(el) {
    window.addEventListener('keydown', function (e) {
      const code = Input.codeOf(e);
      if (CFG.KEYMAP[code]) e.preventDefault();
      Input.keyEvent(code, true);
    }, { passive: false });
    window.addEventListener('keyup', function (e) { Input.keyEvent(Input.codeOf(e), false); });

    const w = () => (el.clientWidth || window.innerWidth);
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        Input.touchStart(t.identifier, t.clientX, t.clientY, w());
      }
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        Input.touchMove(t.identifier, t.clientX, t.clientY);
      }
    }, { passive: false });
    const end = function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) Input.touchEnd(e.changedTouches[i].identifier);
    };
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }
};
