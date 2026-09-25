/* ============================================================================
   DUO RUN — endless_units.js  エンドレスの札（契約 §4.5b【2026-09-26 新設】/ P8b）
   ・エンドレスは「ステージの札」ではなく、**この札**だけで組む（背景＝ゾーンと無関係）。
   ・1枚の札 ＝ 主ギミック1つ（eg）＋相方の要求。2〜5 ウォール・0.5〜2.5秒の短い札にして、
     1000m の中で採用ギミックが全部回るようにする（均等化は生成器 createGenerator の EX 経路）。
   ・**上下で違う動き**（§4.5b「必須動作の60%以上」）: ほとんどのウォールは
       片面だけ（床だけ跳ぶ／天井だけ跳ぶ）か、
       片面ジャンプ＋片面レーン移動（縦レーザー／柱／サメ＋片面のハードル）
     で書く。両面が同じ動作になるのは 2レーン封鎖のゲート（全高）・同時スイッチ・斜めビームだけ。
   ・**死角の禁止**（§4.5b）: 遮蔽物（ピラー・ワイド梁・壁の穴）の直後 1.0秒（10.6 基準m）には
     同じレーン（ワイド梁・壁の穴は全レーン）に何も置かない＝札の中で守り、札の継ぎ目は Fair.blind が見る。
   ・除外（§4.5b）: 鏡の反転・重力反転ワープ・合体区間は札にしない。世界反転ゲートは採用
     （区画 8.6秒・再通過で戻る・直後 1.0秒は障害物なし・1000m に最大1回 / 生成器が数える）。

   ■ 書き方（基準速度 10 m/s の距離＝ 1秒 = 10 基準m。§4.7 の下限に約5%の余裕）
       ウォール間隔 4.8 ／ 両面要求の前後 6.4（ネオンの 0.6秒）／ 同じ面のジャンプ→ジャンプ 7.4
       ジャンプ→レーン移動 9.7 ／ ゲート・遮蔽物の後 10.6 ／ 無重力: ジャンプ→ジャンプ 10.3
     w(at, ...entries) が1ウォール。f()/c() は床/天井の面の障害物、b() は両面に効く型（床の配列に書く）。
   ■ 変種: 左右の鏡写し（m）と床天井の入れ替え（s）を自動で作る（ms も）。噴出口は床だけ（入れ替えなし）。
   ============================================================================ */
'use strict';

const EndlessKit = (function () {
  /* ---- 採用ギミック（§4.5b）。basic は相方として常に出る基本障害物 ---------- */
  const GIMMICKS = ['hurdle', 'lowl', 'pillar', 'wide', 'laserv',
                    'wallhole', 'scan', 'rot', 'blink', 'net', 'sync', 'bridge', 'rock', 'shark', 'vent', 'zero', 'flip'];
  const BASIC = { hurdle: 1, lowl: 1, pillar: 1, wide: 1, laserv: 1 };
  /* 相方としてほぼ全部の札に出る基本障害物（均等化の「重い順」で後回しにしてよい） */
  const COMMON = { hurdle: 1, lowl: 1 };
  const LABEL = { hurdle: 'ハードル', lowl: 'ローレーザー', pillar: 'ピラー', wide: 'ワイド梁', laserv: '縦レーザー',
                  wallhole: '壁の穴', scan: '横スキャン（振り子）', rot: '回転レーザー', blink: '点滅レーザー',
                  net: 'レーザーネット', sync: '同時スイッチ', bridge: '崩れる橋', rock: '転がる丸岩', shark: 'サメ',
                  vent: '泡の噴出口', zero: '無重力ジャンプ', flip: '世界反転ゲート' };
  /* クリアで解放（エンドレスは「クリア済みのステージが持ち込んだギミック」だけ / 契約§4.4・§4.6） */
  const UNLOCK = { S2: ['wallhole', 'scan', 'rot', 'blink'], S3: ['sync', 'bridge', 'rock'],
                   S4: ['shark', 'vent'], S5: ['net', 'zero'], S6: ['flip'] };
  /* 世界反転の区画（秒）。契約「speed×8秒 以上」＋速度の上昇ぶんの余裕 */
  const FLIP_T = 8.6;

  /* ---- 書き方の道具 ------------------------------------------------------ */
  const f = (type, lane, params) => ({ s: 'f', type: type, lane: lane, params: params || null });
  const c = (type, lane, params) => ({ s: 'c', type: type, lane: lane, params: params || null });
  const b = (type, lane, params) => ({ s: 'f', type: type, lane: lane, params: params || null });
  const w = function (at) { return { at: at, e: Array.prototype.slice.call(arguments, 1) }; };
  const fj = function () { return Array.prototype.map.call(arguments, (l) => f('ROVER', l)); };
  const cj = function () { return Array.prototype.map.call(arguments, (l) => c('ROVER', l)); };
  const fL = function () { return Array.prototype.map.call(arguments, (l) => f('LASER_LOW', l)); };
  const cL = function () { return Array.prototype.map.call(arguments, (l) => c('LASER_LOW', l)); };
  const ON = { blink: { onAtArrival: true } }, OFF = { blink: { onAtArrival: false } };
  const fLon = function () { return Array.prototype.map.call(arguments, (l) => f('LASER_LOW', l, ON)); };
  const cLon = function () { return Array.prototype.map.call(arguments, (l) => c('LASER_LOW', l, ON)); };
  const V = (l, p) => b('LASER_V', l, p);
  const P = (l) => b('PILLAR', l);
  const S = (from, to, ph) => b('LASER_SCAN', 0, { scan: { from: from, to: to, phase: ph } });
  const SH = (from, to, ph) => b('SHARK', from, { scan: { from: from, to: to, phase: ph, periodM: 30 } });
  const fR = (l, ph) => f('LASER_ROT', l, { rot: { phase: ph } });
  const cR = (l, ph) => c('LASER_ROT', l, { rot: { phase: ph } });
  const fK = (l, dir) => f('ROCK', Math.round(l), { roll: { lane: l, dir: dir } });
  const cK = (l, dir) => c('ROCK', Math.round(l), { roll: { lane: l, dir: dir } });
  const Hlow = () => b('LASER_H', -1, { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } });
  const Hhigh = () => b('LASER_H', -1, { hbeam: { y0: CFG.NET.Y_HIGH, y1: CFG.NET.Y_LOW, phase: 0 } });
  const D = (f0, c0) => b('LASER_DIAG', 0, { diag: { f0: f0, c0: c0 } });
  const NETG = () => b('NETGATE', 0);
  const SY = (l, cl, safe, csafe) => b('SYNCSW', l, { sync: { cl: cl, safe: safe, csafe: csafe } });
  const ZG = (n) => b('ZEROG', 0, { zero: { n: n } });
  const FLIP = () => b('HANDSWAP', 0, { swp: { backT: FLIP_T } });
  const fBR = (l) => f('BRIDGE', l);
  const fW = (l) => f('WIDEBAR', l);
  const cW = (l) => c('WIDEBAR', l);
  const fH = (l) => f('WALLHOLE', l);
  const cH = (l) => c('WALLHOLE', l);
  const VENT = (l) => f('VENT', l);
  const flat = (a) => [].concat.apply([], a.map((x) => (Array.isArray(x) ? x : [x])));

  /* ---- 札（基準の向き）。eg ＝ 主ギミック。rigid ＝ 間合いを引き伸ばさない（区間の秒が決まっている） ---- */
  const BASE = [
    /* --- ハードル・ローレーザー（片面ずつ跳ぶ） --- */
    { id: 'h1', eg: 'hurdle', w: [w(0, fj(-1, 0)), w(4.8, cj(0, 1)), w(9.6, fj(0, 1))] },
    { id: 'h2', eg: 'hurdle', w: [w(0, V(0), fj(-1, 1)), w(6.4, cj(-1, 1)), w(12.8, fj(0))] },
    { id: 'l1', eg: 'lowl', w: [w(0, fL(-1, 0, 1)), w(4.8, cL(-1, 0, 1)), w(9.6, fL(0))] },
    { id: 'l2', eg: 'lowl', w: [w(0, V(1), cL(-1, 0)), w(6.4, fL(-1, 0, 1)), w(12.8, cL(0, 1))] },
    /* --- ピラー（柱のレーンは直後 1.0秒空ける）・縦レーザー --- */
    { id: 'p1', eg: 'pillar', w: [w(0, P(0), fj(-1, 1)), w(6.4, cj(1)), w(14.0, P(1), cj(-1, 0))] },
    { id: 'p2', eg: 'pillar', w: [w(0, P(-1), cL(0, 1)), w(6.4, fj(0, 1)), w(16.1, P(1), cj(-1, 0))] },
    { id: 'v1', eg: 'laserv', w: [w(0, V(-1), fj(0, 1)), w(9.7, V(1), cj(-1, 0)), w(19.4, V(0), fj(-1, 1))] },
    { id: 'v2', eg: 'laserv', w: [w(0, V(0), cL(-1, 1)), w(6.4, fL(-1, 0, 1)), w(16.1, V(1), fj(-1, 0))] },
    /* 密な縫い（片面ジャンプ＋片面レーン移動を 0.97秒おきに入れ替える＝非対称のまま密度の上限） */
    { id: 'v3', eg: 'laserv', w: [w(0, V(1), cL(-1, 0)), w(9.7, V(-1), fL(0, 1)), w(19.4, V(0), cj(-1, 1)), w(29.1, V(1), fj(-1, 0))] },
    { id: 'p3', eg: 'pillar', w: [w(0, P(-1), fj(0, 1)), w(10.6, V(0), cj(-1, 1)), w(20.3, P(1), fL(-1, 0))] },
    /* --- ワイド梁（直後 1.0秒は全レーン空ける）。w2 は全高のゲート（両面が同じ動き） --- */
    { id: 'w1', eg: 'wide', w: [w(0, fW(-1), cj(0, 1)), w(10.6, cW(0), fj(1))] },
    { id: 'w2', eg: 'wide', w: [w(0, fW(0), cW(0)), w(10.6, cL(-1, 0, 1)), w(15.4, fj(-1))] },
    /* --- 壁の穴（唯一のスライド。直後 1.0秒は全レーン空ける） --- */
    { id: 'wh1', eg: 'wallhole', wallhole: 1, w: [w(0, fH(0), cj(-1, 0, 1)), w(10.6, V(0), fj(-1, 1))] },
    { id: 'wh2', eg: 'wallhole', wallhole: 1, w: [w(0, cH(-1), fL(0, 1)), w(10.6, fj(-1, 0)), w(15.4, cj(0, 1))] },
    /* --- 動くレーザー3種（横スキャン＝振り子と同じ型・回転・点滅） --- */
    { id: 'sc1', eg: 'scan', w: [w(0, S(-1, 1, 0), fj(0, 1)), w(9.7, cj(-1, 0)), w(14.5, fj(-1))] },
    { id: 'sc2', eg: 'scan', w: [w(0, S(-1, 0, 0.5), cL(-1, 1)), w(9.7, fj(-1, 0, 1)), w(14.5, cj(0))] },
    { id: 'ro1', eg: 'rot', w: [w(0, fR(0, 0.25), cj(-1, 1)), w(9.7, cR(1, 0.25), fj(0))] },
    { id: 'ro2', eg: 'rot', w: [w(0, fR(-1, 0.5)), w(4.8, cR(1, 0)), w(9.7, fR(1, 0.25))] },
    { id: 'bl1', eg: 'blink', w: [w(0, V(0, ON), fj(-1, 1)), w(6.4, cLon(-1, 0, 1)), w(12.8, V(1, OFF), fj(-1, 0))] },
    { id: 'bl2', eg: 'blink', w: [w(0, fLon(-1, 0, 1)), w(4.8, cLon(-1, 0, 1)), w(12.2, V(0, ON), cj(-1, 1))] },
    /* --- レーザーネット（横ビーム＝片面が跳ぶ／斜め＝床と天井で別のレーン） --- */
    { id: 'ne1', eg: 'net', w: [w(-4, NETG()), w(0, Hlow()), w(4.8, Hhigh()), w(14.5, D(-1, 1))] },
    { id: 'ne2', eg: 'net', w: [w(-4, NETG()), w(0, D(1, -1)), w(6.4, Hlow()), w(11.2, Hhigh())] },
    /* --- 同時スイッチ（パッドから 1.3秒先が橋／谷） --- */
    { id: 'sy1', eg: 'sync', w: [w(0, SY(0, 0, 0, 0)), w(19.4, fj(0)), w(24.2, cj(0, 1))] },
    { id: 'sy2', eg: 'sync', w: [w(0, SY(-1, 1, -1, 1)), w(19.4, cL(1)), w(24.2, fj(-1, 0))] },
    /* --- 崩れる橋（2レーン。at＝崩落点＝踏み口の 2.0秒先。相方の面は跳び続ける） --- */
    { id: 'br1', eg: 'bridge', w: [w(20, fBR(-1), fBR(0)), w(6, cj(-1, 0, 1)), w(13.4, cL(0, 1)), w(27, cj(-1))] },
    /* --- 転がる丸岩 --- */
    { id: 'rk1', eg: 'rock', w: [w(0, fK(0, 1)), w(4.8, cK(1, -1)), w(9.6, fK(-0.5, 1))] },
    { id: 'rk2', eg: 'rock', w: [w(0, fK(1, -1), V(-1)), w(9.7, cK(0, 1)), w(14.5, fj(-1, 0))] },
    /* --- サメ（2レーンの壁が横へ動く。空いたレーンに片面だけ跳ぶ物） --- */
    { id: 'sh1', eg: 'shark', w: [w(0, SH(-1, 0, 0), fj(1)), w(9.7, cj(-1, 0, 1)), w(17.1, SH(0, -1, 0), cL(-1))] },
    { id: 'sh2', eg: 'shark', w: [w(0, SH(0, -1, 0.5), cj(1)), w(9.7, fL(-1, 0, 1)), w(14.5, cj(1))] },
    /* --- 泡の噴出口（床だけ＝入れ替えなし） --- */
    { id: 'vt1', eg: 'vent', noSwap: 1, w: [w(0, VENT(-1), VENT(1)), w(6, cj(-1, 0, 1)), w(11, VENT(0))] },
    { id: 'vt2', eg: 'vent', noSwap: 1, w: [w(0, VENT(0), V(1)), w(9.7, cj(-1, 0)), w(14.5, VENT(-1), VENT(1))] },
    /* --- 無重力ジャンプ（区間の秒が決まっている＝ rigid） --- */
    { id: 'ze1', eg: 'zero', rigid: 1, w: [w(0, ZG(3.2)), w(6, fj(-1, 0, 1)), w(12, cj(-1, 0, 1)), w(17, fL(0)), w(23, cj(1))] },
    { id: 'ze2', eg: 'zero', rigid: 1, w: [w(0, ZG(3.0)), w(6, V(0), fj(-1, 1)), w(12.4, cj(-1, 0, 1)), w(19, fj(0))] },
    /* --- 世界反転ゲート（紫の枠2枚＝入口と 8.6秒先の戻り。中身は後ろの札が埋める） --- */
    { id: 'fl1', eg: 'flip', rigid: 1, flip: 1, w: [w(0, FLIP())] },

    /* --- 組み札（1枚で2つのギミック。速い区間でも 1000m に全部を回すため） --- */
    { id: 'x1', eg: 'rock', w: [w(0, fK(0, 1)), w(4.8, cR(1, 0.25)), w(9.6, fR(-1, 0.5)), w(14.4, cK(-1, 1))] },
    { id: 'x2', eg: 'shark', w: [w(0, SH(-1, 0, 0), fLon(1)), w(9.7, cLon(-1, 0, 1)), w(17.1, V(1, ON), cj(-1, 0))] },
    { id: 'x3', eg: 'vent', noSwap: 1, w: [w(0, VENT(0), S(0, 1, 0.5)), w(9.7, cj(-1, 0)), w(14.5, VENT(-1), VENT(1))] },
    { id: 'x4', eg: 'bridge', w: [w(20, fBR(-1), fBR(0)), w(2, NETG()), w(6, Hhigh()), w(13.4, Hhigh()), w(25, cj(1))] },
    { id: 'x5', eg: 'sync', w: [w(0, SY(0, 0, 0, 0)), w(19.4, fK(0, 1)), w(24.2, cK(1, -1))] },
    { id: 'x6', eg: 'wallhole', wallhole: 1, w: [w(0, fH(1), cLon(-1, 0, 1)), w(10.6, V(0, ON), fj(-1, 1))] },
    { id: 'x7', eg: 'zero', rigid: 1, w: [w(0, ZG(2.4)), w(2, NETG()), w(4, Hlow()), w(10, Hhigh()), w(15, fj(-1, 0, 1))] },
    { id: 'x8', eg: 'shark', noSwap: 1, w: [w(0, SH(-1, 0, 0), VENT(1)), w(9.7, cj(1)), w(19.4, SH(0, -1, 0), VENT(-1))] },
    { id: 'x9', eg: 'rot', w: [w(0, fR(0, 0.25), cj(-1, 1)), w(9.7, S(-1, 1, 0), fj(0, 1))] },
    { id: 'x10', eg: 'bridge', w: [w(20, fBR(0), fBR(1)), w(6, cK(-1, 1)), w(13.4, cK(1, -1)), w(27, cj(0))] },

    /* --- 三つ組の札（1枚で3つ。速い区間でミニ大演出と同じ 1000m に入っても全部を回すため） --- */
    { id: 'y1', eg: 'rock', noSwap: 1, w: [w(0, fK(0, 1)), w(4.8, cLon(-1, 0, 1)), w(9.6, VENT(-1), VENT(1))] },
    { id: 'y2', eg: 'net', w: [w(-2, NETG()), w(0, Hlow()), w(4.8, cK(1, -1)), w(9.6, fR(-1, 0.5))] },
    { id: 'y3', eg: 'vent', noSwap: 1, w: [w(0, VENT(0)), w(4.8, Hhigh()), w(9.6, fLon(-1, 0, 1))] },
    { id: 'y5', eg: 'shark', w: [w(0, SH(-1, 0, 0), fj(1)), w(9.7, S(-1, 1, 0), cj(0, 1)), w(19.4, P(1), fj(-1, 0))] },
    { id: 'y6', eg: 'wide', w: [w(0, fW(-1), cK(1, -1)), w(10.6, S(-1, 1, 0), fj(0, 1))] },
    { id: 'y7', eg: 'wallhole', wallhole: 1, noSwap: 1, w: [w(0, fH(0), cj(-1, 0, 1)), w(10.6, SH(0, -1, 0), VENT(-1))] },
    { id: 'y8', eg: 'pillar', w: [w(0, P(0), fLon(-1, 1)), w(10.6, cR(1, 0.25), fj(0))] },
    { id: 'y9', eg: 'bridge', w: [w(20, fBR(0), fBR(1)), w(6, cK(-1, 1)), w(13.4, Hhigh()), w(27, cLon(-1, 0, 1), V(0))] },
    { id: 'y10', eg: 'sync', w: [w(0, SY(0, 0, 0, 0)), w(19.4, SH(-1, 0, 0), cj(1)), w(26, fK(0, 1))] },
    { id: 'y11', eg: 'zero', rigid: 1, noSwap: 1, w: [w(0, ZG(2.4)), w(5, VENT(-1), VENT(1)), w(11, cK(0, 1)), w(16, fLon(0))] },
    { id: 'y12', eg: 'sync', w: [w(0, SY(-1, 1, -1, 1)), w(19.4, cK(1, -1))] },
    { id: 'y13', eg: 'laserv', w: [w(0, V(-1), fj(0, 1)), w(9.7, cW(0), fj(-1)), w(20.3, D(1, -1))] },

    /* --- 四つ組の札（ミニ大演出の入った速い 1000m でも、5〜6枚で採用ギミックが一巡する） --- */
    { id: 'q2', eg: 'sync', noSwap: 1, w: [w(0, SY(0, 0, 0, 0)), w(19.4, SH(0, -1, 0), VENT(-1)), w(29.1, cR(1, 0.25))] },
    { id: 'q3', eg: 'zero', rigid: 1, w: [w(0, ZG(2.4)), w(4, fH(0), cLon(-1, 0, 1)), w(14.6, fK(0, 1)), w(20, cK(1, -1))], wallhole: 1 },
    { id: 'q4', eg: 'wide', w: [w(0, fW(-1), cK(1, -1)), w(10.6, S(-1, 1, 0), fj(0, 1)), w(20.3, P(1), cj(-1, 0)), w(30.9, fR(-1, 0.25))] },
    { id: 'q5', eg: 'shark', noSwap: 1, w: [w(0, SH(-1, 0, 0), VENT(1)), w(9.7, Hhigh()), w(14.5, fLon(-1, 0, 1))] },
    /* --- 五つ組の札（無重力の中で崩れる橋／同時スイッチ→サメ＋噴出口→壁の穴＋回転） --- */
    { id: 'z5', eg: 'zero', rigid: 1, w: [w(0, ZG(3.0)), w(2, NETG()), w(22, fBR(0), fBR(1)), w(6, cK(-1, 1)),
                                         w(16.3, cLon(-1, 0, 1)), w(28, Hhigh(), V(0))] },
    { id: 'q6', eg: 'sync', noSwap: 1, wallhole: 1, w: [w(0, SY(0, 0, 0, 0)), w(19.4, SH(0, -1, 0), VENT(-1)),
                                                       w(29.1, fH(-1), cR(-1, 0.25))] }
  ];

  /* ---- 変種（鏡写し・床天井の入れ替え） ------------------------------------ */
  function mirrorEntry(e) {
    const o = { s: e.s, type: e.type, lane: -e.lane, params: e.params ? JSON.parse(JSON.stringify(e.params)) : null };
    const p = o.params;
    if (e.type === 'WIDEBAR') o.lane = -e.lane - 1;               // lane L は L と L+1 を塞ぐ
    if (e.type === 'SHARK') { o.lane = -e.lane - 1; p.scan.from = -p.scan.from - 1; p.scan.to = -p.scan.to - 1; }
    if (e.type === 'LASER_SCAN') { o.lane = 0; p.scan.from = -p.scan.from; p.scan.to = -p.scan.to; }
    if (e.type === 'ROCK') { p.roll.lane = -p.roll.lane; p.roll.dir = -p.roll.dir; o.lane = Math.round(p.roll.lane); }
    if (e.type === 'LASER_ROT') p.rot.phase = ((0.5 - p.rot.phase) % 1 + 1) % 1;
    if (e.type === 'LASER_H') o.lane = e.lane;
    if (e.type === 'LASER_DIAG') { o.lane = 0; ['f0', 'c0', 'f1', 'c1'].forEach((k) => { if (p.diag[k] !== undefined) p.diag[k] = -p.diag[k]; }); }
    if (e.type === 'SYNCSW') { ['cl', 'safe', 'csafe'].forEach((k) => { p.sync[k] = -p.sync[k]; }); }
    if (e.type === 'NETGATE' || e.type === 'ZEROG' || e.type === 'HANDSWAP') o.lane = 0;
    if (o.lane === 0) o.lane = 0;                                   // -0 を 0 に
    return o;
  }
  function swapEntry(e) {
    const o = { s: e.s, type: e.type, lane: e.lane, params: e.params ? JSON.parse(JSON.stringify(e.params)) : null };
    const both = OBS[e.type] ? OBS[e.type].both : true;
    if (!both && ['NETGATE', 'ZEROG', 'HANDSWAP', 'SYNCSW'].indexOf(e.type) < 0) o.s = (e.s === 'f') ? 'c' : 'f';
    if (e.type === 'LASER_H') { const h = o.params.hbeam; const y0 = h.y0; h.y0 = h.y1; h.y1 = y0; }
    if (e.type === 'LASER_DIAG') { const d = o.params.diag; const t = d.f0; d.f0 = d.c0; d.c0 = t; }
    if (e.type === 'SYNCSW') {
      const s = o.params.sync; const l = o.lane;
      o.lane = s.cl; s.cl = l; const t = s.safe; s.safe = s.csafe; s.csafe = t;
    }
    return o;
  }
  /* 札 → チャンク定義（floor/ceil の配列・基準m）。at は最初のウォールが 0 になるよう詰める */
  function toDef(u, id, tf) {
    const ents = [];
    u.w.forEach((wl) => flat(wl.e).forEach((e) => ents.push({ at: wl.at, e: tf(e) })));
    let a0 = Infinity, a1 = -Infinity;
    ents.forEach((x) => { a0 = Math.min(a0, x.at); a1 = Math.max(a1, x.at); });
    const floor = [], ceil = [];
    ents.sort((x, y) => x.at - y.at).forEach((x) => {
      const ent = { at: +(x.at - a0).toFixed(2), lane: x.e.lane, type: x.e.type };
      if (x.e.params) ent.params = x.e.params;
      (x.e.s === 'c' ? ceil : floor).push(ent);
    });
    const tail = u.flip ? (FLIP_T * CFG.REF_SPEED + 11) : 6;
    const d = { id: id, zone: 'endless', lengthM: +(a1 - a0 + tail).toFixed(2), difficulty: 1, minSpeed: 0,
                ex: 1, eg: u.eg, base: u.id, floor: floor, ceil: ceil, events: [] };
    if (u.rigid) d.rigid = 1;
    if (u.flip) d.flip = 1;
    if (u.wallhole) d.wallhole = 1;
    d.gset = gimmicksOfDef(d);
    return d;
  }

  /* ---- 札・障害物 → ギミック -------------------------------------------- */
  const TYPE_G = { ROVER: ['hurdle'], LASER_LOW: ['lowl'], PILLAR: ['pillar'], WIDEBAR: ['wide'], LASER_V: ['laserv'],
                   WALLHOLE: ['wallhole'], WALLSOLID: ['wallhole'], LASER_SCAN: ['scan'], LASER_ROT: ['rot'],
                   LASER_H: ['net'], LASER_DIAG: ['net'], NETGATE: ['net'], SYNCSW: ['sync'], SYNCPAD: ['sync'],
                   BRIDGE: ['bridge'], ROCK: ['rock'], SHARK: ['shark'], VENT: ['vent'], ZEROG: ['zero'],
                   ZEROGATE: ['zero'], HANDSWAP: ['flip'], SWAPGATE: ['flip'] };
  function gOf(type, params) {
    const g = (TYPE_G[type] || []).slice();
    if (params && params.blink) g.push('blink');
    return g;
  }
  function gimmicksOfDef(d) {
    const set = {};
    (d.floor || []).concat(d.ceil || []).forEach((e) => gOf(e.type, e.params).forEach((g) => { set[g] = 1; }));
    return Object.keys(set);
  }
  /* 実体（生成済みの障害物）→ ギミックの集合。機械テスト・監査の窓口 */
  function gimmicksOfItem(o) { return gOf(o.type, o.params); }

  /* ---- 登録 ---------------------------------------------------------------- */
  const UNITS = [];
  BASE.forEach((u) => {
    const tfs = [['', (e) => e], ['_m', mirrorEntry]];
    if (!u.noSwap) tfs.push(['_s', swapEntry], ['_ms', (e) => mirrorEntry(swapEntry(e))]);
    tfs.forEach((t) => UNITS.push(toDef(u, 'e_' + u.id + t[0], t[1])));
  });
  UNITS.forEach((d) => { CHUNK_BY_ID[d.id] = d; });

  /* クリア状況 → 採用ギミック（開発中の全解放は Endless.clearedList が面倒を見る） */
  function available(cleared) {
    const set = {};
    Object.keys(BASIC).forEach((g) => { set[g] = 1; });
    (cleared || []).forEach((id) => (UNLOCK[id] || []).forEach((g) => { set[g] = 1; }));
    return GIMMICKS.filter((g) => set[g]);
  }
  function unitsFor(avail) {
    const ok = {};
    avail.forEach((g) => { ok[g] = 1; });
    return UNITS.filter((d) => d.gset.every((g) => ok[g]));
  }

  return {
    GIMMICKS: GIMMICKS, BASIC: BASIC, COMMON: COMMON, LABEL: LABEL, UNLOCK: UNLOCK, FLIP_T: FLIP_T,
    /* 密度の目安（100m あたりの必須動作）: 6 から 1000m ごとに +1、9 で頭打ち。
       §4.7「エンドレスは1000mごとに+1」を P8a までの実測（約6→9回/100m）の高さに置いたもの。
       札は速い区間の詰め方で書いてあるので、遅い区間は位置を最大 SPREAD_MAX 倍まで引き伸ばす。 */
    DENS0: 6, DENS_MAX: 9, SPREAD_MAX: 3,
    /* 札は重みで BEST_OF 枚まで引いて、いちばん早く置けるものを採る */
    BEST_OF: 2,
    /* 窓の詰まり（owed を出し切る見積り秒 ÷ 窓の残り秒）がこれを越えたら「重い順・効率優先」 */
    TIGHT: 0.5,
    /* 世界反転: 区切りまでの続いた残りが FLIP_T + これ（秒）を切ったら最優先（札1〜2枚ぶんの余裕） */
    FLIP_URGENT: 11,
    UNITS: UNITS, BASE: BASE,
    available: available, unitsFor: unitsFor,
    gimmicksOfDef: gimmicksOfDef, gimmicksOfItem: gimmicksOfItem,
    _mirror: mirrorEntry, _swap: swapEntry
  };
})();
