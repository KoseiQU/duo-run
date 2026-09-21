/* ============================================================================
   DUO RUN — input.js  タッチ（本番）／キーボード（開発・機械テスト用）（§4.2 改訂）
   入力は必ずこのキューを通す（人間もボットも同じ経路＝テストしやすい）。

   ■ タッチ（iPhone/iPad 専用・2026-09-21 改訂）
   - 画面を**上下に2分割**。下半分＝床を走る LUMEN、上半分＝天井を走る UMBRA。
     担当は**タッチ開始点の y だけ**で決まり、そのタッチは指を離すまでその担当のまま。
     マルチタッチ（2本同時）必須。縦持ち・横持ちのどちらでも同じ規則。
   - フリックは**スクリーン方向**のまま積み、担当キャラの足場に応じて
     「足場から離れる向き＝ジャンプ」に変換する（Input.actFromDir）。
       LUMEN（床）: 上フリック=ジャンプ / 下フリック=スライド
       UMBRA（天井）: 下フリック=ジャンプ / 上フリック=スライド
   - キュー要素は2種類:
       { hand:'left'|'right', act:... }   … キーボード・ボット（担当は「手」で決まる）
       { zone:'bottom'|'top', dir:... }   … タッチ（担当は「画面の上下」で決まる）
   ============================================================================ */
'use strict';

const Input = {
  queue: [],            // 上の2種類が混ざる
  held: {},             // keydownのエッジ検出用
  touches: {},          // identifier -> {zone, x, y}
  enabled: true,

  push(hand, act) {
    if (!Input.enabled) return false;
    Input.queue.push({ hand: hand, act: act });
    return true;
  },
  /* タッチ: 画面の上下と、スクリーン方向のフリック */
  pushZone(zone, dir) {
    if (!Input.enabled) return false;
    Input.queue.push({ zone: zone, dir: dir });
    return true;
  },
  /* 「足場から離れる向き＝ジャンプ」への変換（§4.2） */
  actFromDir(dir, surface) {
    if (dir === 'left' || dir === 'right') return dir;
    if (dir === 'up') return (surface === 'floor') ? 'jump' : 'slide';
    if (dir === 'down') return (surface === 'floor') ? 'slide' : 'jump';
    return dir;   // すでに jump/slide が来たらそのまま
  },
  /* 画面の上下 → その面を走るキャラの面 */
  surfaceOfZone(zone) { return (zone === 'top') ? 'ceil' : 'floor'; },
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

  /* --- タッチ（上半分＝UMBRA / 下半分＝LUMEN・マルチタッチ） -------------- */
  touchStart(id, x, y, height) {
    /* 担当は開始点の y だけで決める。境界は画面のちょうど中央 */
    Input.touches[id] = { zone: (y < height / 2) ? 'top' : 'bottom', x: x, y: y };
  },
  touchMove(id, x, y) {
    const t = Input.touches[id];
    if (!t) return null;
    const dx = x - t.x, dy = y - t.y;
    if (Math.abs(dx) < CFG.TOUCH_FLICK && Math.abs(dy) < CFG.TOUCH_FLICK) return null;
    /* 主軸で方向を決める（スクリーン基準のまま積む） */
    const dir = (Math.abs(dx) >= Math.abs(dy)) ? ((dx > 0) ? 'right' : 'left')
                                               : ((dy > 0) ? 'down' : 'up');
    t.x = x; t.y = y;                        // 指を離さない連続ドラッグを許す
    Input.pushZone(t.zone, dir);
    return dir;
  },
  touchEnd(id) { delete Input.touches[id]; },

  /* テスト用の直接入力（DUO.touch）。zone は 'bottom'|'top' */
  gesture(zone, dir) { return Input.pushZone(zone, dir); },

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

    const h = () => (el.clientHeight || window.innerHeight);
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        Input.touchStart(t.identifier, t.clientX, t.clientY, h());
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
