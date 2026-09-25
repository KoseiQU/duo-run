/* ============================================================================
   DUO RUN — input.js  タッチ（本番）／キーボード（開発・機械テスト用）（§4.2 改訂）
   入力は必ずこのキューを通す（人間もボットも同じ経路＝テストしやすい）。

   ■ タッチ（iPhone/iPad 専用・2026-09-21 改訂）
   - 画面を**上下に2分割**。下半分＝床を走る LUMEN、上半分＝天井を走る UMBRA。
     担当は**タッチ開始点の y だけ**で決まり、そのタッチは指を離すまでその担当のまま。
     マルチタッチ（2本同時）必須。縦持ち・横持ちのどちらでも同じ規則。
   - フリックは**スクリーン方向**のまま積み、担当キャラの足場に応じて
     「足場から離れる向き＝ジャンプ」に変換する（Input.actFromDir）。
       LUMEN（床）: 上フリック=ジャンプ / 下フリック=何も起きない
       UMBRA（天井）: 下フリック=ジャンプ / 上フリック=何も起きない
     （足場へ向かうフリックは無効 / 契約§4.2・§4.3 2026-09-27 スライディング失効）
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

  /* --- 自由飛行モード（大ジャンプの滑空 / 契約§4.5 2026-09-21 改訂） --------
     上下分割・1スワイプ1レーンの規則は**滑空中は無効**。画面のどこを触ってもよく、
     ドラッグ量に比例して DUO体が断面を連続的に動く（先に触れた指だけが有効）。
     感度: 画面幅の **1/4** のドラッグ＝断面の端から端（y は画面高さの 1/4 ＝断面の上下）。
     2026-09-22 実機評「操作性が悪い」で 1/3 → 1/4（最大速度も 4.0→10 m/s）。 */
  mode: 'lanes',        // 'lanes' | 'free'
  free: { tx: 0, ty: 2, src: null, owner: null, ox: 0, oy: 0, bx: 0, by: 0 },
  /* 自由飛行のキー割当（開発・機械テスト用。どちらの手のキーでも上下左右） */
  FREE_KEYS: {
    KeyA: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 }, KeyW: { x: 0, y: 1 }, KeyS: { x: 0, y: -1 },
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: 1 }, ArrowDown: { x: 0, y: -1 }
  },
  setMode(mode, x, y) {
    Input.mode = (mode === 'free') ? 'free' : 'lanes';
    Input.queue.length = 0;
    Input.touches = {};
    Input.free.owner = null;
    Input.free.src = null;
    if (Input.mode === 'free') {
      Input.free.tx = (x === undefined) ? 0 : x;
      Input.free.ty = (y === undefined) ? CFG.H / 2 : y;
    }
    return Input.mode;
  },
  /* 目標位置（断面座標）を直接指す。タッチ・キーボード・ボットの共通の入口。 */
  freeAim(x, y, src) {
    if (!Input.enabled) return false;
    Input.free.tx = x;
    Input.free.ty = y;
    Input.free.src = src || null;
    return true;
  },
  /* 押されているキーから軸を作る（押しっぱなしで動き続ける） */
  freeKeys() {
    let x = 0, y = 0;
    const keys = Object.keys(Input.held);
    for (let i = 0; i < keys.length; i++) {
      const m = Input.FREE_KEYS[keys[i]];
      if (!m) continue;
      x += m.x; y += m.y;
    }
    return { x: U.clamp(x, -1, 1), y: U.clamp(y, -1, 1) };
  },

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
  /* 「足場から離れる向き＝ジャンプ」への変換（§4.2）。
     足場へ向かう向きは **null＝何も起きない**（2026-09-27 スライディング失効）。 */
  actFromDir(dir, surface) {
    if (dir === 'left' || dir === 'right') return dir;
    if (dir === 'up') return (surface === 'floor') ? 'jump' : null;
    if (dir === 'down') return (surface === 'floor') ? null : 'jump';
    return (dir === 'jump') ? dir : null;   // すでに jump が来たらそのまま
  },
  /* 画面の上下 → その面を走るキャラの面 */
  surfaceOfZone(zone) { return (zone === 'top') ? 'ceil' : 'floor'; },
  drain() { const q = Input.queue; Input.queue = []; return q; },
  clear() {
    Input.queue.length = 0;
    Input.held = {};
    Input.touches = {};
    Input.mode = 'lanes';
    Input.free.owner = null;
    Input.free.src = null;
  },

  /* --- キーボード --------------------------------------------------------- */
  keyEvent(code, down) {
    /* 自由飛行中は「押されているか」だけを見る（1動作ずつのキューには積まない）。
       S/↓ は走行中は無効（スライディング失効）だが、滑空の「下へ」には使う */
    if (Input.mode === 'free') {
      if (!Input.FREE_KEYS[code]) return false;
      if (down) Input.held[code] = true; else delete Input.held[code];
      return true;
    }
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

  /* --- タッチ（上半分＝UMBRA / 下半分＝LUMEN・マルチタッチ） --------------
     **1スワイプ＝1レーン**（契約§4.2 2026-09-21 実機評）。
     1回のタッチで出せるのは原則1動作。同じ指で2回目を出すには、
     直前の動作を出した位置から **TOUCH_REPEAT_PX(64px) 以上**動かし、
     さらに **TOUCH_REPEAT_MS(220ms) 以上**経ってからにする。
     （指を止めずに大きく動かしても、端まで飛んでいかない） */
  now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); },
  _w(width) { return width || (typeof window !== 'undefined' ? window.innerWidth : 375); },
  touchStart(id, x, y, height, tMs, width) {
    if (Input.mode === 'free') {
      /* 先に触れた指だけが有効（2本目は無視 / 契約§4.5） */
      if (Input.free.owner !== null) return;
      Input.free.owner = id;
      Input.free.ox = x; Input.free.oy = y;
      Input.free.bx = FF.body.x; Input.free.by = FF.body.y;
      return;
    }
    /* 担当は開始点の y だけで決める。境界は画面のちょうど中央 */
    Input.touches[id] = { zone: (y < height / 2) ? 'top' : 'bottom', x: x, y: y,
                          fired: 0, t: (tMs === undefined ? Input.now() : tMs) };
  },
  touchMove(id, x, y, tMs, height, width) {
    if (Input.mode === 'free') {
      if (Input.free.owner !== id) return null;
      /* 画面幅の 1/4 のドラッグ＝断面の端から端（y は画面高さの 1/4 ＝断面の上下） */
      const w = Input._w(width), h = height || (typeof window !== 'undefined' ? window.innerHeight : 812);
      const sx = (FF.X1 - FF.X0) / (w / 4), sy = (FF.Y1 - FF.Y0) / (h / 4);
      Input.freeAim(U.clamp(Input.free.bx + (x - Input.free.ox) * sx, FF.X0, FF.X1),
                    U.clamp(Input.free.by - (y - Input.free.oy) * sy, FF.Y0, FF.Y1), 'touch');
      return 'free';
    }
    const t = Input.touches[id];
    if (!t) return null;
    const now = (tMs === undefined) ? Input.now() : tMs;
    const dx = x - t.x, dy = y - t.y;
    /* 1回目は通常のフリック閾値、2回目以降は「新しい原点から64px＋220ms」 */
    const need = t.fired ? CFG.TOUCH_REPEAT_PX : CFG.TOUCH_FLICK;
    if (Math.abs(dx) < need && Math.abs(dy) < need) return null;
    if (t.fired && (now - t.t) < CFG.TOUCH_REPEAT_MS) return null;
    /* 主軸で方向を決める（スクリーン基準のまま積む） */
    const dir = (Math.abs(dx) >= Math.abs(dy)) ? ((dx > 0) ? 'right' : 'left')
                                               : ((dy > 0) ? 'down' : 'up');
    t.x = x; t.y = y;                        // 次の判定はこの位置を新しい原点にする
    t.fired++; t.t = now;
    Input.pushZone(t.zone, dir);
    return dir;
  },
  touchEnd(id) {
    if (Input.free.owner === id) Input.free.owner = null;   // 離しても位置はその場（慣性なし）
    delete Input.touches[id];
  },

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
      if (CFG.KEYMAP[code] || Input.FREE_KEYS[code]) e.preventDefault();
      Input.keyEvent(code, true);
    }, { passive: false });
    window.addEventListener('keyup', function (e) { Input.keyEvent(Input.codeOf(e), false); });

    const h = () => (el.clientHeight || window.innerHeight);
    const w = () => (el.clientWidth || window.innerWidth);
    // UI（ボタン・画面パネル）上のタッチは横取りしない。ここで preventDefault すると
    // iOS Safari が click を合成しなくなり、START が押せない（実機で発生 2026-09-21）。
    const onUi = (e) => !!(e.target && e.target.closest && e.target.closest('button, .screen, a, input'));
    el.addEventListener('touchstart', function (e) {
      if (onUi(e)) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        Input.touchStart(t.identifier, t.clientX, t.clientY, h(), e.timeStamp, w());
      }
    }, { passive: false });
    el.addEventListener('touchmove', function (e) {
      if (onUi(e)) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        Input.touchMove(t.identifier, t.clientX, t.clientY, e.timeStamp, h(), w());
      }
    }, { passive: false });
    const end = function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) Input.touchEnd(e.changedTouches[i].identifier);
    };
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
  }
};
