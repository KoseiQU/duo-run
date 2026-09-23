/* ============================================================================
   DUO RUN — freeflight.js  大ジャンプの自由飛行（契約 §4.5「大ジャンプ共通仕様」
   2026-09-21 全面改訂 / P2c、2026-09-22 操作性改訂 / P2d）

   ■ 何をするモジュールか
   - 発射台で2人が手を繋いで1体になった **DUO体**（半径 R=0.45）の、
     コリドー断面（x −1.8〜+1.8 / y 0.6〜3.4）の中での自由飛行を受け持つ。
   - 空中の障害物は「断面内の矩形」。当たり判定は **円 vs 矩形**。
   - **ゾーン非依存**（S8・エンドレスのミニ版でもそのまま使う）。見た目だけ
     配色は全ステージ共通の警告色（契約§4.3 v2・ゾーン別スキンは失効）。

   ■ 唯一の出所
   - 断面・速度・半径・隙間の寸法はこのファイルの定数だけ。
     生成（build）・判定（collide）・ボット（aim）・不変条件（Fair.validateAir）・
     見た目（syncView）はすべてここを読む。
   - 隙間は「壁ごとに必ず1つ」。開いている軸（openX / openY）はその軸に動かなくてよい
     ＝ 帯状のスリットも「中心へ向かえば必ず通れる」規則1つで扱える。

   ■ 公平性（契約§4.5 の断面2D版）
     隙間の中心までの距離 ≤ V(10 m/s) × 到達までの秒数。
     生成時はさらに REACT(0.35秒) の余裕を引いた予算で隙間を置く
     （0.25秒遅れのボット＝ delay250 でも間に合う）。
     さらに **ブースト中（+20%）でも間に合う**ように、予算の秒数を 1/(1+BOOST_K)
     に縮めてから引く（加速は任意＝取った人が損をしないための安全側）。

   ■ 光の輪＝加速アイテム（契約§4.5 2026-09-22 改訂 / P2d）
   - 輪は**障害物ではない**（当たり判定なし）。中心から RING_CATCH 以内で
     くぐると BOOST_T(2.0秒) のあいだ +BOOST_K(20%)。外しても何も起きない。
   - 壁（items）とは別の配列 course.rings に持つ。隙間保証には一切関与しない。
   ============================================================================ */
'use strict';

const FF = {
  /* ---- 断面と体（契約§4.5） --------------------------------------------- */
  X0: -1.8, X1: 1.8, Y0: 0.6, Y1: 3.4,
  R: 0.45,              // DUO体の半径
  V: 10.0,              // 最大速度（x,y 各軸 m/s）慣性なし（2026-09-22 実機評で 4.0→10）
  DEPTH: 0.6,           // 空中の障害物の奥行き（m）
  HOLE: 0.85,           // 輪・看板の「穴」の半径（R + 0.40 の余裕）
  SLOT: 0.95,           // 帯状スリットの半幅（R + 0.50 の余裕）
  REACT: 0.35,          // 生成時に見込む反応の余裕（秒）
  MARGIN: 6,            // 塞ぐ板を断面の外へ伸ばす長さ（体は断面内にしか居ない）
  VIEW_FAR: 90,         // 空中の壁を描き始める距離（m）＝ 速度24で3.7秒ぶん先まで見える
  EDGE: 0.35,           // 隙間の中心を断面の縁からこれだけ内側に置く

  /* ---- 譜面の間合い（秒。速度で伸縮する＝§4.7 と同じ考え方） ------------- */
  FIRST_T: 0.90,        // 発射から最初の壁まで
  LAST_T: 0.70,         // 最後の壁から着地まで
  /* 壁と壁の間（秒）。速度が 4→10 になったぶん詰めて、同じ密度感（1回の滑空で
     平均5.6本 → 7本）にする。これ以上詰めると REACT(0.35秒) が効いて予算が枯れる。 */
  GAP_T0: 0.58, GAP_T1: 0.75,

  /* ---- 演出の長さ（契約§4.5） ------------------------------------------- */
  MERGE_T: 0.40,        // 合体演出（秒）
  SPLIT_T: 0.30,        // 分離演出（秒）
  GRACE_T: 2.00,        // 着地後 障害物なし（秒）
  PAIR_DX: 0.36,        // DUO体の2人の間隔（手が中央で触れる）

  /* 空中の障害物は4種（契約§4.5 2026-09-22: 光の輪は障害物から外れた） */
  KINDS: ['drones', 'wires', 'sign', 'debris'],

  /* ---- 光の輪＝加速アイテム（契約§4.5 2026-09-22 改訂） ------------------ */
  BOOST_K: 0.20,        // くぐると +20%
  BOOST_T: 2.00,        // 効いている長さ（秒）
  /* ブーストは Game.speed に乗る（core.js）。true にすると旧来の「距離を上乗せ」に戻る */
  BOOST_DIST_FALLBACK: false,
  RING_CATCH: 0.85,     // 輪の中心からこの距離以内を通れば取得（HOLE 相当）
  RING_VIEW: 1.00,      // 輪の見た目の半径（判定より少し大きく見せる）
  RING_N0: 1, RING_N1: 2,   // 壁と壁の間に置く個数
  RING_OFF0: 0.70, RING_OFF1: 1.60,  // 通り道からどれだけ外すか（寄り道させる）

  /* ---- ランタイム -------------------------------------------------------- */
  course: null,         // { items:[...], rings:[...], launchM, landM, entry:{x,y} }
  on: false,            // 自由飛行中か
  body: { x: 0, y: 2.0 },
  hit: null,            // 直近に当たった壁（テスト用）
  boostT: 0,            // ブーストの残り（秒）
  boostN: 0,            // この滑空で取った輪の数（テスト・演出用）
  fx: null,             // ブーストの DOM（滑空中だけ存在する）

  cxDefault() { return 0; },
  cyDefault() { return (FF.Y0 + FF.Y1) / 2; },
  clampX(v) { return U.clamp(v, FF.X0, FF.X1); },
  clampY(v) { return U.clamp(v, FF.Y0, FF.Y1); },
  active() { return FF.on; },
  /* ブーストの倍率（1.0 / 1.2）。速度経路を持つ側が読むための唯一の窓口。 */
  boostK() { return FF.boostT > 0 ? (1 + FF.BOOST_K) : 1; },
  boosting() { return FF.boostT > 0; },
  /* 見た目だけの決定論的な擬似乱数（瓦礫の散らし方などに使う。状態を持たない） */
  _h(i, s) { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); },

  /* ==========================================================================
     生成（シード固定）
     ========================================================================== */
  /* 1軸ぶんの隙間の位置を決める。前の隙間から budget 以内・断面の内側。
     小さすぎる移動は「動かなくてよい壁」になって退屈なので少し押し出す。 */
  _pick(rng, prev, budget, lo, hi) {
    const a = Math.max(lo, prev - budget), b = Math.min(hi, prev + budget);
    if (b <= a) return U.clamp(prev, lo, hi);
    let v = a + rng() * (b - a);
    if (Math.abs(v - prev) < 0.55) {
      const push = 0.55 + rng() * 0.5;
      const up = Math.min(b, prev + push), dn = Math.max(a, prev - push);
      v = ((up - prev) > (prev - dn)) ? up : dn;
    }
    return v;
  },

  /* 壁ひとつ分の「塞ぐ矩形」。隙間の周りを埋めるだけ＝隙間は必ず1つ残る。 */
  rects(gap) {
    const M = FF.MARGIN;
    const X0 = FF.X0 - M, X1 = FF.X1 + M, Y0 = FF.Y0 - M, Y1 = FF.Y1 + M;
    const out = [];
    if (!gap.openX) {
      out.push({ x0: X0, x1: gap.x - gap.hw, y0: Y0, y1: Y1, side: 'left' });
      out.push({ x0: gap.x + gap.hw, x1: X1, y0: Y0, y1: Y1, side: 'right' });
    }
    if (!gap.openY) {
      const bx0 = gap.openX ? X0 : gap.x - gap.hw;
      const bx1 = gap.openX ? X1 : gap.x + gap.hw;
      out.push({ x0: bx0, x1: bx1, y0: gap.y + gap.hh, y1: Y1, side: 'top' });
      out.push({ x0: bx0, x1: bx1, y0: Y0, y1: gap.y - gap.hh, side: 'bottom' });
    }
    return out;
  },

  /* 空中の譜面を作る。launchM〜landM は走行距離（m）。speedAt はステージの速度。 */
  build(seed, launchM, landM, speedAt) {
    const rng = U.mulberry32((seed >>> 0) || 1);
    const sp = (m) => (typeof speedAt === 'function' ? speedAt(m) : speedAt);
    const items = [];
    const entry = { x: FF.cxDefault(), y: FF.cyDefault() };
    const rx0 = FF.X0 + FF.EDGE, rx1 = FF.X1 - FF.EDGE;
    const ry0 = FF.Y0 + FF.EDGE, ry1 = FF.Y1 - FF.EDGE;
    let prev = { x: entry.x, y: entry.y };
    let prevAt = launchM;
    let at = launchM + sp(launchM) * FF.FIRST_T;
    const last = landM - sp(landM) * FF.LAST_T;
    let guard = 0;
    while (at <= last && guard++ < 40) {
      const s = sp(at);
      /* ブースト（+20%）を取っていても間に合う秒数で予算を組む（安全側 / P2d） */
      const dt = (at - prevAt) / (s * (1 + FF.BOOST_K));
      const budget = Math.max(0.25, FF.V * (dt - FF.REACT));
      const kind = FF.KINDS[(rng() * FF.KINDS.length) | 0];
      const openX = (kind === 'wires');     // 横帯＝上下だけ動く
      const openY = (kind === 'drones');    // 縦帯＝左右だけ動く
      const gap = {
        x: openX ? U.clamp(prev.x, rx0, rx1) : FF._pick(rng, prev.x, budget, rx0, rx1),
        y: openY ? U.clamp(prev.y, ry0, ry1) : FF._pick(rng, prev.y, budget, ry0, ry1),
        hw: openX ? FF.SLOT : (openY ? FF.SLOT : FF.HOLE),
        hh: openY ? FF.SLOT : (openX ? FF.SLOT : FF.HOLE),
        openX: openX, openY: openY
      };
      const it = { at: at, kind: kind, gap: gap, rects: FF.rects(gap), view: null };
      items.push(it);
      prev = { x: openX ? prev.x : gap.x, y: openY ? prev.y : gap.y };
      prevAt = at;
      at += s * (FF.GAP_T0 + rng() * (FF.GAP_T1 - FF.GAP_T0));
    }
    const rings = FF._rings(rng, items, entry);
    return { items: items, rings: rings, launchM: launchM, landM: landM, entry: entry, seed: seed };
  },

  /* 光の輪（加速アイテム）を壁と壁の間に 1〜2個。
     隙間の保証とは無関係（避ける必要がない＝当たり判定を持たない）。
     通り道（前の隙間→次の隙間）から少し外して置く＝寄り道すると速くなる。 */
  _rings(rng, items, entry) {
    const out = [];
    const rx0 = FF.X0 + FF.EDGE, rx1 = FF.X1 - FF.EDGE;
    const ry0 = FF.Y0 + FF.EDGE, ry1 = FF.Y1 - FF.EDGE;
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1], b = items[i];
      const ax = a.gap.openX ? entry.x : a.gap.x, ay = a.gap.openY ? entry.y : a.gap.y;
      const bx = b.gap.openX ? ax : b.gap.x, by = b.gap.openY ? ay : b.gap.y;
      const n = FF.RING_N0 + ((rng() < 0.5) ? 0 : (FF.RING_N1 - FF.RING_N0));
      for (let k = 0; k < n; k++) {
        const u = (k + 1) / (n + 1);
        const ang = rng() * Math.PI * 2;
        const off = FF.RING_OFF0 + rng() * (FF.RING_OFF1 - FF.RING_OFF0);
        out.push({
          at: a.at + (b.at - a.at) * u,
          x: U.clamp(ax + (bx - ax) * u + Math.cos(ang) * off, rx0, rx1),
          y: U.clamp(ay + (by - ay) * u + Math.sin(ang) * off, ry0, ry1),
          kind: '_ring', taken: false, missed: false, view: null
        });
      }
    }
    return out;
  },

  /* ==========================================================================
     判定（円 vs 矩形）— 契約§4.5
     ========================================================================== */
  hitsRect(x, y, r, rc) {
    const cx = U.clamp(x, rc.x0, rc.x1), cy = U.clamp(y, rc.y0, rc.y1);
    const dx = x - cx, dy = y - cy;
    return (dx * dx + dy * dy) < r * r;
  },
  /* その位置に DUO体（半径 R）を置いたら通れるか */
  passable(x, y, item) {
    for (let i = 0; i < item.rects.length; i++) if (FF.hitsRect(x, y, FF.R, item.rects[i])) return false;
    return true;
  },
  /* 壁ごとの「狙う点」（開いている軸は今の位置のまま） */
  target(item, x, y) {
    return { x: item.gap.openX ? x : item.gap.x, y: item.gap.openY ? y : item.gap.y };
  },

  /* ==========================================================================
     実行（Setpieces から呼ばれる）
     ========================================================================== */
  begin(course, x, y) {
    FF._hideView();                 // 前の譜面の見た目を必ず回収してから差し替える
    FF.course = course;
    FF.on = true;
    FF.hit = null;
    FF.boostT = 0;
    FF.boostN = 0;
    FF.body.x = (x === undefined) ? FF.cxDefault() : FF.clampX(x);
    FF.body.y = (y === undefined) ? FF.cyDefault() : FF.clampY(y);
    FF._fxEnsure();
    Input.setMode('free', FF.body.x, FF.body.y);
    return true;
  },
  end() {
    FF.on = false;
    FF.boostT = 0;
    FF._fxDestroy();                // ブーストの DOM は滑空中だけ存在する
    Input.setMode('lanes');
    return true;
  },
  reset() {
    FF.on = false;
    FF._hideView();                 // 先に見た目をプールへ返す（course を参照するため）
    FF.course = null;
    FF.hit = null;
    FF.boostT = 0;
    FF.boostN = 0;
    FF._fxDestroy();
    FF.body.x = FF.cxDefault();
    FF.body.y = FF.cyDefault();
    if (typeof Input !== 'undefined') Input.setMode('lanes');
  },

  /* 指（またはキーボード／ボット）の目標へ、最大速度で追従する（慣性なし） */
  update(dt) {
    if (!FF.on) return;
    const k = Input.freeKeys();
    if (k.x || k.y) {
      /* キーボード（開発・機械テスト用）: 押しっぱなしで最大速度 */
      Input.freeAim(FF.clampX(FF.body.x + k.x * 2), FF.clampY(FF.body.y + k.y * 2), 'key');
    } else if (Input.free.src === 'key') {
      Input.freeAim(FF.body.x, FF.body.y, null);
    }
    const m = FF.V * dt;
    FF.body.x = FF.clampX(FF.body.x + U.clamp(Input.free.tx - FF.body.x, -m, m));
    FF.body.y = FF.clampY(FF.body.y + U.clamp(Input.free.ty - FF.body.y, -m, m));
    FF._boostStep(dt);
  },

  /* ---- ブースト（光の輪をくぐった 2秒間 +20% / 契約§4.5 2026-09-22） -------
     【既知の妥協点】core.js / setpieces.js は並行レーンの担当で触れないため、
     Game.speed そのものには乗せていない。効果は「滑空中の前進距離を +20%」＝
     この関数が Game.dist を上乗せする形で出している（見た目・体感は同じ。
     HUD の m/s 表示とボットの判断は素の速度のまま）。速度経路を持つ側が
     `FF.boostK()` を 1行掛けるだけで本来の形へ寄せられる。 */
  _boostStep(dt) {
    if (FF.boostT <= 0) { FF._fxSync(); return; }
    const used = Math.min(dt, FF.boostT);
    FF.boostT = Math.max(0, FF.boostT - dt);
    /* 【2026-09-22 P3b】速度経路（core.js の Game.speed）に FF.boostK() を掛けたので、
       ここでの距離の上乗せは**二重加速**になる。既定で止める（歴史のため残す）。 */
    if (FF.BOOST_DIST_FALLBACK && typeof Game !== 'undefined' && Game.status === 'playing') {
      Game.dist += Game.speed * used * FF.BOOST_K;
    }
    FF._fxSync();
  },
  boost() {
    FF.boostT = FF.BOOST_T;
    FF.boostN++;
    U.sfx('boost');
    FF._fxPop();
    return FF.boostT;
  },
  /* prevDist〜dist の間に跨いだ輪を取る（当たり判定は持たない＝外しても何も起きない） */
  catchRings(prevDist, dist) {
    const rs = FF.course && FF.course.rings;
    if (!rs || !rs.length) return null;
    let got = null;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (r.taken || r.missed) continue;
      if (dist < r.at || prevDist > r.at) continue;      // まだ／もう跨いだ
      const dx = FF.body.x - r.x, dy = FF.body.y - r.y;
      if (dx * dx + dy * dy <= FF.RING_CATCH * FF.RING_CATCH) {
        r.taken = true; got = r; FF.boost();
      } else {
        r.missed = true;                                  // 外した＝何も起きない
      }
    }
    return got;
  },

  /* prevDist〜dist の間に跨いだ壁だけを見る（高速でも擦り抜けない） */
  collide(prevDist, dist) {
    if (!FF.on || !FF.course) return null;
    FF.catchRings(prevDist, dist);
    const D = FF.DEPTH / 2;
    const items = FF.course.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (prevDist > it.at + D || dist < it.at - D) continue;
      if (!FF.passable(FF.body.x, FF.body.y, it)) { FF.hit = it; return it; }
    }
    return null;
  },

  /* ボットの狙い（delayM = 反応遅れぶんの距離）。
     契約の「最も近い隙間の中心へ最大速度で移動」そのもの。 */
  aim(dist, delayM) {
    if (!FF.course) return { x: FF.body.x, y: FF.body.y };
    const d0 = dist - (delayM || 0);
    const items = FF.course.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].at + FF.DEPTH / 2 > d0) return FF.target(items[i], FF.body.x, FF.body.y);
    }
    return { x: FF.body.x, y: FF.body.y };
  },

  /* 着地で戻るレーン（DUO体の x に最も近いレーン / 契約§4.5） */
  landingLane() {
    return U.clamp(Math.round(FF.body.x / CFG.LANE_W), -1, 1);
  },

  /* 次の壁までの距離（HUD・テスト用） */
  nextWall(dist) {
    if (!FF.course) return null;
    for (let i = 0; i < FF.course.items.length; i++) {
      if (FF.course.items[i].at > dist) return FF.course.items[i];
    }
    return null;
  },

  /* テスト・監査用の観測 */
  snapshot() {
    return {
      on: FF.on,
      x: +FF.body.x.toFixed(3), y: +FF.body.y.toFixed(3),
      tx: +Input.free.tx.toFixed(3), ty: +Input.free.ty.toFixed(3),
      walls: FF.course ? FF.course.items.length : 0,
      rings: FF.course && FF.course.rings ? FF.course.rings.length : 0,
      boost: +FF.boostT.toFixed(3), boostN: FF.boostN
    };
  },

  /* ==========================================================================
     ブーストの画面演出（このファイルだけで作って壊す＝hud.js / index.html に触れない）
     ========================================================================== */
  FX_CSS:
    '#ff-boost{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;' +
      'opacity:0;z-index:9;}' +   /* 濃さは毎フレーム JS で決める（transition は使わない） */
    '#ff-boost i{position:absolute;display:block;}' +
    '#ff-boost .l{left:0;top:0;bottom:0;width:22%;' +
      'background:linear-gradient(90deg,rgba(255,206,110,.42),rgba(255,206,110,0));}' +
    '#ff-boost .r{right:0;top:0;bottom:0;width:22%;' +
      'background:linear-gradient(270deg,rgba(255,206,110,.42),rgba(255,206,110,0));}' +
    '#ff-boost .t{left:0;right:0;top:0;height:14%;' +
      'background:linear-gradient(180deg,rgba(120,228,255,.32),rgba(120,228,255,0));}' +
    '#ff-boost .b{left:0;right:0;bottom:0;height:14%;' +
      'background:linear-gradient(0deg,rgba(120,228,255,.32),rgba(120,228,255,0));}' +
    '#ff-boost .w{position:absolute;left:50%;top:70%;transform:translate(-50%,-50%);' +
      'font-size:clamp(24px,min(8vw,10vh),52px);font-weight:900;letter-spacing:.22em;' +
      'color:#ffeec4;text-shadow:0 0 18px rgba(255,190,90,.9),0 0 48px rgba(255,140,40,.6);}' +
    '#ff-boost.pop .w{animation:ffbPop .55s ease-out;}' +
    '@keyframes ffbPop{from{transform:translate(-50%,-50%) scale(.55);opacity:0;}' +
      '35%{opacity:1;}to{transform:translate(-50%,-50%) scale(1.14);opacity:1;}}',

  _fxEnsure() {
    if (FF.fx || typeof document === 'undefined' || !document.body) return FF.fx;
    const host = document.getElementById('app') || document.body;
    const style = document.createElement('style');
    style.id = 'ff-boost-style';
    style.textContent = FF.FX_CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'ff-boost';
    root.innerHTML = '<i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i>' +
                     '<div class="w">BOOST!</div>';
    host.appendChild(root);
    FF.fx = { root: root, style: style };
    return FF.fx;
  },
  _fxDestroy() {
    if (!FF.fx) return false;
    if (FF.fx.root.parentNode) FF.fx.root.parentNode.removeChild(FF.fx.root);
    if (FF.fx.style.parentNode) FF.fx.style.parentNode.removeChild(FF.fx.style);
    FF.fx = null;
    return true;
  },
  _fxPop() {
    const fx = FF._fxEnsure();
    if (!fx) return;
    fx.root.classList.remove('pop');
    void fx.root.offsetWidth;          // アニメを取り直す
    fx.root.classList.add('pop');
  },
  _fxSync() {
    const fx = FF.fx;
    if (!fx) return;
    /* 残り時間で濃さを決める（切れる 0.35秒前から抜ける）＋軽い明滅 */
    const u = U.clamp(FF.boostT / 0.35, 0, 1);
    const flick = 0.86 + 0.14 * Math.sin(FF.boostT * 26);
    fx.root.style.opacity = (u * flick).toFixed(3);
    if (FF.boostT <= 0) fx.root.classList.remove('pop');
  },

  /* ==========================================================================
     見た目（全ステージ共通 / 契約§4.3 v2）
     ========================================================================== */
  skin() { return FF.SKIN; },
  /* 空中の障害物の配色（契約§4.3 v2: 全ステージ共通・赤／橙／白の警告色。ゾーン別は失効）。
     光の輪は障害物ではない（加速アイテム）ので金色のまま。 */
  SKIN: {
    id: 'common',
    COL: { field: 0xff3a26, ring: 0xffd479, ring2: 0xffe9b0, board: 0x2b1010,
           edge: 0xff8a1e, cable: 0x2b2e35, spark: 0xff3a26, drone: 0xe8ecf2, ad: 0xff3a26,
           rock: 0x8a2a1c }
  },

  initView(scene) {
    if (FF.view) return FF.view;
    const C = FF.skin().COL;
    const mat = {
      field: new THREE.MeshBasicMaterial({ color: C.field, transparent: true, opacity: 0.12,
                                           depthWrite: false, blending: THREE.AdditiveBlending,
                                           side: THREE.DoubleSide, fog: true }),
      board: new THREE.MeshLambertMaterial({ color: C.board, fog: true }),
      edge: new THREE.MeshBasicMaterial({ color: C.edge, fog: true }),
      ring: new THREE.MeshBasicMaterial({ color: C.ring, fog: true }),
      ring2: new THREE.MeshBasicMaterial({ color: C.ring2, transparent: true, opacity: 0.55,
                                          depthWrite: false, blending: THREE.AdditiveBlending, fog: true }),
      cable: new THREE.MeshLambertMaterial({ color: C.cable, fog: true }),
      spark: new THREE.MeshBasicMaterial({ color: C.spark, fog: true }),
      drone: new THREE.MeshLambertMaterial({ color: C.drone, fog: true }),
      ad: new THREE.MeshBasicMaterial({ color: C.ad, transparent: true, opacity: 0.45,
                                        depthWrite: false, fog: true }),
      /* 瓦礫の塊（debris）と、光の輪の内側の薄い光 */
      rock: new THREE.MeshLambertMaterial({ color: (C.rock === undefined) ? 0x6e74a0 : C.rock, fog: true }),
      ringFill: new THREE.MeshBasicMaterial({ color: C.ring, transparent: true, opacity: 0.13,
                                              depthWrite: false, blending: THREE.AdditiveBlending,
                                              side: THREE.DoubleSide, fog: true })
    };
    const root = new THREE.Group();
    root.visible = false;
    scene.add(root);
    /* DUO体の繭（2人を包む光）と、繋いだ手の輝き */
    const duo = new THREE.Group();
    duo.visible = false;
    const cocoon = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10),
                                  new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true,
                                                                opacity: 0.16, depthWrite: false,
                                                                blending: THREE.AdditiveBlending, fog: true }));
    cocoon.scale.set(1.35, 1.0, 0.9);
    duo.add(cocoon);
    const hands = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10),
                                 new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
                                                               opacity: 0.9, depthWrite: false,
                                                               blending: THREE.AdditiveBlending, fog: true }));
    duo.add(hands);
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.10),
                                 new THREE.MeshBasicMaterial({ color: 0xbcd2ff, transparent: true,
                                                               opacity: 0.35, depthWrite: false,
                                                               blending: THREE.AdditiveBlending,
                                                               side: THREE.DoubleSide, fog: true }));
    trail.position.z = 0.8;
    duo.add(trail);
    duo.renderOrder = 6;
    scene.add(duo);
    FF.view = { root: root, mat: mat, pool: {}, duo: duo, cocoon: cocoon, hands: hands, trail: trail,
                skinId: FF.skin().id };
    return FF.view;
  },

  _mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); return m; },

  /* 壁ひとつの見た目を組む（種類ごとにプールする） */
  _buildWall(kind) {
    const v = FF.view, M = v.mat;
    const g = new THREE.Group();
    const ud = { blocks: [], props: [], cables: null, ring: null, kind: kind };
    /* 塞いでいる所を示す薄い光の膜（どの種類にも付ける＝「通れない」が一目で分かる） */
    const solid = (kind === 'sign') ? M.board : (kind === 'debris') ? M.rock : M.field;
    for (let i = 0; i < 4; i++) {
      const m = FF._mesh(new THREE.BoxGeometry(1, 1, 1), solid);
      m.visible = false;
      if (kind !== 'sign' && kind !== 'debris') m.renderOrder = 4;
      g.add(m);
      ud.blocks.push(m);
    }
    if (kind === 'debris') {
      /* 瓦礫の塊: 穴のまわりに割れた塊が積もっている（1種類＝1ドローコール） */
      const rock = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.rock, 18);
      rock.frustumCulled = false;
      rock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(rock);
      const lip = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 0.07), M.edge, 8);
      lip.frustumCulled = false;
      lip.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      lip.renderOrder = 5;
      g.add(lip);
      ud.debris = { rock: rock, n: 18, lip: lip, ln: 8, dummy: new THREE.Object3D() };
    } else if (kind === 'wires') {
      const c = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.075, 0.075), M.cable, 14);
      c.frustumCulled = false;
      c.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(c);
      const s = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.035, 0.035), M.spark, 14);
      s.frustumCulled = false;
      s.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.renderOrder = 5;
      g.add(s);
      ud.cables = { cable: c, spark: s, n: 14, dummy: new THREE.Object3D() };
      [-1, 1].forEach(() => {
        const p = FF._mesh(new THREE.BoxGeometry(0.22, 1, 0.22), M.drone);
        g.add(p); ud.props.push(p);
      });
    } else if (kind === 'drones') {
      /* 広告ドローンは4機とも InstancedMesh（1種類＝1ドローコール / 契約§3 の300以下） */
      const inst = (geo, mat, n, order) => {
        const m = new THREE.InstancedMesh(geo, mat, n);
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (order !== undefined) m.renderOrder = order;
        g.add(m);
        return m;
      };
      ud.drones = {
        n: 4,
        body: inst(new THREE.BoxGeometry(0.52, 0.20, 0.42), M.drone, 4),
        rotor: inst(new THREE.BoxGeometry(0.30, 0.04, 0.30), M.ring2, 8, 5),
        ad: inst(new THREE.BoxGeometry(0.66, 0.9, 0.04), M.ad, 4, 4),
        lamp: inst(new THREE.BoxGeometry(0.16, 0.05, 0.05), M.edge, 4, 5),
        dummy: new THREE.Object3D()
      };
    } else {
      /* sign: ちぎれた看板。縁にネオンの線を走らせる */
      for (let i = 0; i < 4; i++) {
        const e = FF._mesh(new THREE.BoxGeometry(1, 0.08, 0.08), M.edge);
        g.add(e); ud.props.push(e);
      }
      const r2 = FF._mesh(new THREE.TorusGeometry(1, 0.06, 5, 16), M.ring2);
      g.add(r2);
      ud.ring = [r2];
    }
    g.userData = ud;
    return g;
  },

  /* 光の輪（加速アイテム）。塞ぐ板は持たない＝くぐるための的。 */
  _buildRing() {
    const M = FF.view.mat;
    const g = new THREE.Group();
    const r = FF._mesh(new THREE.TorusGeometry(1, 0.080, 8, 30), M.ring);
    const halo = FF._mesh(new THREE.TorusGeometry(1, 0.24, 6, 24), M.ring2);
    halo.renderOrder = 5;
    const core = FF._mesh(new THREE.CircleGeometry(1, 26), M.ringFill);
    core.renderOrder = 3;
    g.add(core); g.add(r); g.add(halo);
    g.userData = { kind: '_ring', ring: r, halo: halo, core: core };
    return g;
  },

  _acquire(kind) {
    const p = FF.view.pool[kind] || (FF.view.pool[kind] = []);
    const g = p.length ? p.pop() : ((kind === '_ring') ? FF._buildRing() : FF._buildWall(kind));
    g.visible = true;
    FF.view.root.add(g);
    return g;
  },
  _release(it) {
    if (!it.view) return;
    FF.view.root.remove(it.view);
    it.view.visible = false;
    (FF.view.pool[it.kind] || (FF.view.pool[it.kind] = [])).push(it.view);
    it.view = null;
  },
  _hideView() {
    if (!FF.view) return;
    if (FF.course) {
      FF.course.items.forEach((it) => FF._release(it));
      (FF.course.rings || []).forEach((r) => FF._release(r));
    }
    /* 取りこぼし（譜面を差し替えた・途中で中断した）も必ずプールへ返す＝溜まらない */
    const root = FF.view.root;
    for (let i = root.children.length - 1; i >= 0; i--) {
      const g = root.children[i];
      root.remove(g);
      g.visible = false;
      const k = g.userData && g.userData.kind;
      if (k) (FF.view.pool[k] || (FF.view.pool[k] = [])).push(g);
    }
    root.visible = false;
    FF.view.duo.visible = false;
  },
  /* 空中の壁と光の輪を入れ替える（見た目を必ず回収する）。機械テストが使う窓口。
     rings を省くと輪は空になる（＝譜面まるごとの差し替え）。 */
  setItems(items, rings) {
    if (!FF.course) return null;
    FF.course.items.forEach((it) => FF._release(it));
    (FF.course.rings || []).forEach((r) => FF._release(r));
    FF.course.items = items || [];
    FF.course.rings = rings || [];
    return FF.course;
  },

  /* 矩形を「見える帯」に切り詰める（±6m の板をそのまま描かない） */
  _clip(rc) {
    const x0 = Math.max(rc.x0, FF.X0 - 1.1), x1 = Math.min(rc.x1, FF.X1 + 1.1);
    const y0 = Math.max(rc.y0, FF.Y0 - 1.1), y1 = Math.min(rc.y1, FF.Y1 + 1.1);
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return null;
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  },

  _placeWall(it, dist, lift, t) {
    const g = it.view, ud = g.userData, M = FF.view.mat;
    g.position.set(0, lift, -(it.at - dist));
    /* 塞いでいる矩形 */
    for (let i = 0; i < ud.blocks.length; i++) {
      const rc = it.rects[i] ? FF._clip(it.rects[i]) : null;
      const m = ud.blocks[i];
      if (!rc) { m.visible = false; continue; }
      m.visible = true;
      m.position.set((rc.x0 + rc.x1) / 2, (rc.y0 + rc.y1) / 2, 0);
      m.scale.set(rc.x1 - rc.x0, rc.y1 - rc.y0, (ud.kind === 'sign') ? FF.DEPTH * 0.5 : FF.DEPTH * 0.35);
    }
    const gp = it.gap;
    if (ud.kind === 'debris') {
      /* 瓦礫の塊: 穴のまわりに割れた塊を積む＋穴の縁に光の線（通れる所が読める） */
      const D = ud.debris, d = D.dummy;
      const seed = it.at;
      for (let i = 0; i < D.n; i++) {
        const ang = (i / D.n) * Math.PI * 2 + FF._h(i, seed) * 0.5;
        const rad = gp.hw + 0.50 + FF._h(i, seed + 1) * 1.15;
        const px = U.clamp(gp.x + Math.cos(ang) * rad, FF.X0 - 0.9, FF.X1 + 0.9);
        const py = U.clamp(gp.y + Math.sin(ang) * rad, FF.Y0 - 0.9, FF.Y1 + 0.9);
        const sz = 0.34 + FF._h(i, seed + 2) * 0.52;
        d.position.set(px, py, (FF._h(i, seed + 3) - 0.5) * FF.DEPTH * 0.6);
        d.rotation.set(FF._h(i, seed + 4) * 3.1, FF._h(i, seed + 5) * 3.1,
                       FF._h(i, seed + 6) * 3.1 + Math.sin(t * 0.7 + i) * 0.05);
        d.scale.set(sz, sz * (0.62 + FF._h(i, seed + 7) * 0.7), sz * 0.8);
        d.updateMatrix();
        D.rock.setMatrixAt(i, d.matrix);
      }
      D.rock.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < D.ln; i++) {
        const horiz = (i % 2) === 0, up = (i < 2 || (i >= 4 && i < 6));
        const k = (i < 4) ? 1 : 1.22;      // 二重の縁（外側にもう1本）＝穴が広く読める
        if (horiz) {
          d.position.set(gp.x, gp.y + (up ? gp.hh : -gp.hh) * k, FF.DEPTH * 0.34);
          d.rotation.set(0, 0, 0);
          d.scale.set(gp.hw * 2 * k, 1, 1);
        } else {
          d.position.set(gp.x + (up ? gp.hw : -gp.hw) * k, gp.y, FF.DEPTH * 0.34);
          d.rotation.set(0, 0, Math.PI / 2);
          d.scale.set(gp.hh * 2 * k, 1, 1);
        }
        d.updateMatrix();
        D.lip.setMatrixAt(i, d.matrix);
      }
      D.lip.instanceMatrix.needsUpdate = true;
    } else if (ud.kind === 'wires') {
      /* 電線の束: 塞いでいる帯を 0.34m 刻みのケーブルで埋める */
      const c = ud.cables, d = c.dummy;
      let n = 0;
      const put = (y, jitter) => {
        if (n >= c.n) return;
        d.position.set(0, y, (n % 2 ? 0.08 : -0.08) + jitter * 0.02);
        d.rotation.set(0, 0, (n % 2 ? 0.02 : -0.02));
        d.scale.set(FF.X1 * 2 + 1.6, 1, 1);
        d.updateMatrix();
        c.cable.setMatrixAt(n, d.matrix);
        d.position.y = y + 0.055;
        d.updateMatrix();
        c.spark.setMatrixAt(n, d.matrix);
        n++;
      };
      for (let y = gp.y + gp.hh + 0.12; y <= FF.Y1 + 0.9 && n < c.n; y += 0.34) put(y, n);
      for (let y = gp.y - gp.hh - 0.12; y >= FF.Y0 - 0.9 && n < c.n; y -= 0.34) put(y, n);
      d.position.set(0, -9999, 0); d.scale.set(0.0001, 0.0001, 0.0001); d.updateMatrix();
      for (; n < c.n; n++) { c.cable.setMatrixAt(n, d.matrix); c.spark.setMatrixAt(n, d.matrix); }
      c.cable.instanceMatrix.needsUpdate = true;
      c.spark.instanceMatrix.needsUpdate = true;
      ud.props.forEach((p, i) => {
        p.position.set((i ? 1 : -1) * (FF.X1 + 0.55), (FF.Y0 + FF.Y1) / 2, 0);
        p.scale.set(1, FF.Y1 - FF.Y0 + 2.4, 1);
        p.visible = true;
      });
    } else if (ud.kind === 'drones') {
      /* 広告ドローン: 塞いでいる左右の柱に、上下2機ずつ浮かべる */
      const dr = ud.drones, d = dr.dummy, cy = (FF.Y0 + FF.Y1) / 2;
      const hide = (o) => { o.position.set(0, -9999, 0); o.scale.set(0.0001, 0.0001, 0.0001); o.rotation.set(0, 0, 0); };
      for (let i = 0; i < dr.n; i++) {
        const sx = (i < 2) ? -1 : 1;
        const edge = gp.x + sx * gp.hw;
        const room = (sx < 0) ? (edge - (FF.X0 - 0.8)) : ((FF.X1 + 0.8) - edge);
        const ok = room >= 0.45;
        const px = edge - sx * Math.min(0.55, room / 2);
        const py = cy + ((i % 2) ? 0.95 : -0.95);
        const tilt = Math.sin(t * 1.6 + i) * 0.08;
        if (ok) { d.position.set(px, py, 0); d.rotation.set(0, 0, tilt); d.scale.set(1, 1, 1); } else hide(d);
        d.updateMatrix(); dr.body.setMatrixAt(i, d.matrix);
        if (ok) { d.position.set(px, py - 0.58, 0); } else hide(d);
        d.updateMatrix(); dr.ad.setMatrixAt(i, d.matrix);
        if (ok) { d.position.set(px, py - 0.13, -0.2); } else hide(d);
        d.updateMatrix(); dr.lamp.setMatrixAt(i, d.matrix);
        [-1, 1].forEach((s2, k) => {
          if (ok) { d.position.set(px + s2 * 0.28, py + 0.14, 0); } else hide(d);
          d.updateMatrix();
          dr.rotor.setMatrixAt(i * 2 + k, d.matrix);
        });
      }
      dr.body.instanceMatrix.needsUpdate = true;
      dr.ad.instanceMatrix.needsUpdate = true;
      dr.lamp.instanceMatrix.needsUpdate = true;
      dr.rotor.instanceMatrix.needsUpdate = true;
    } else {
      /* 看板の破片: 穴の縁にネオンの線 */
      ud.props.forEach((e, i) => {
        const horiz = (i < 2);
        if (horiz) {
          e.position.set(gp.x, gp.y + (i ? gp.hh : -gp.hh), FF.DEPTH * 0.3);
          e.scale.set(gp.hw * 2, 1, 1);
          e.rotation.z = 0;
        } else {
          e.position.set(gp.x + ((i === 3) ? gp.hw : -gp.hw), gp.y, FF.DEPTH * 0.3);
          e.scale.set(gp.hh * 2, 1, 1);
          e.rotation.z = Math.PI / 2;
        }
      });
      ud.ring[0].position.set(gp.x, gp.y, FF.DEPTH * 0.3);
      ud.ring[0].scale.set(gp.hw * 1.02, gp.hh * 1.02, 1);
    }
  },

  /* 光の輪（加速アイテム）ひとつの見た目。取った輪は消える。 */
  _placeRing(r, dist, lift, t) {
    const g = r.view, ud = g.userData;
    const s = FF.RING_VIEW * (r.taken ? 1.5 : 1);
    g.position.set(r.x, r.y + lift, -(r.at - dist));
    g.visible = !r.taken;
    const pulse = 1 + 0.045 * Math.sin(t * 4.2 + r.at);
    ud.ring.scale.set(s * pulse, s * pulse, 1);
    ud.ring.rotation.z = t * 0.9;
    ud.halo.scale.set(s * 1.05 * pulse, s * 1.05 * pulse, 1);
    ud.halo.rotation.z = -t * 0.6;
    ud.core.scale.set(s * 0.96, s * 0.96, 1);
  },

  /* 配色を差し替える（テストが FF.SKIN を差し替えた時のため）。
     形は共通（ゾーン非依存）で、色だけゾーンに従う＝ S8・エンドレスでもそのまま使える。 */
  _applySkin() {
    const v = FF.view;
    if (!v) return false;
    const s = FF.skin();
    if (v.skinId === s.id) return false;
    const C = s.COL || {};
    ['field', 'board', 'edge', 'ring', 'ring2', 'cable', 'spark', 'drone', 'ad', 'rock'].forEach((k) => {
      if (v.mat[k] && C[k] !== undefined) v.mat[k].color.setHex(C[k]);
    });
    /* 輪の内側の光は輪と同じ色（ゾーンが ring だけ持っていれば付いてくる） */
    if (v.mat.ringFill && C.ring !== undefined) v.mat.ringFill.color.setHex(C.ring);
    v.skinId = s.id;
    return true;
  },

  /* 毎フレーム（Setpieces.syncView から） */
  syncView(dist, t, lift, duoK) {
    const v = FF.view;
    if (!v) return;
    FF._applySkin();
    /* 空中の障害物 */
    if (FF.course) {
      v.root.visible = true;
      const items = FF.course.items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const rel = it.at - dist;
        const near = rel < FF.VIEW_FAR && rel > -6;
        if (near && !it.view) it.view = FF._acquire(it.kind);
        else if (!near && it.view) FF._release(it);
        if (it.view) FF._placeWall(it, dist, lift, t);
      }
      /* 光の輪（加速アイテム）。取った輪・過ぎた輪は見た目をプールへ返す。 */
      const rings = FF.course.rings || [];
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        const rel = r.at - dist;
        const near = rel < FF.VIEW_FAR && rel > -6 && !r.taken;
        if (near && !r.view) r.view = FF._acquire('_ring');
        else if (!near && r.view) FF._release(r);
        if (r.view) FF._placeRing(r, dist, lift, t);
      }
    } else if (v.root.visible) {
      v.root.visible = false;
    }
    /* DUO体の繭と繋いだ手 */
    const k = duoK || 0;
    if (k > 0.01) {
      /* ブースト中は光の尾が伸びて明るくなる（契約§4.5「光の尾」） */
      const bk = U.clamp(FF.boostT / 0.35, 0, 1);
      v.duo.visible = true;
      v.duo.position.set(FF.body.x, FF.body.y + lift, 0);
      v.cocoon.material.opacity = (0.20 + 0.10 * bk) * k;
      v.cocoon.scale.set(1.45, 1.0 + 0.04 * Math.sin(t * 3.1), 0.9);
      v.hands.position.set(0, 0.11, -0.02);
      v.hands.material.opacity = 0.92 * k;
      v.hands.scale.setScalar(1 + 0.12 * Math.sin(t * 7.3) + 0.18 * bk);
      /* 光の尾: ブースト中は後ろへ長く伸ばす（太らせない＝体が潰れて見えない） */
      v.trail.material.opacity = (0.30 + 0.32 * bk) * k;
      v.trail.scale.set(1 + 0.35 * bk, 1, 1);
      v.trail.position.set(0, 0.05, 0.85 + 1.6 * bk);
    } else if (v.duo.visible) {
      v.duo.visible = false;
    }
  }
};
