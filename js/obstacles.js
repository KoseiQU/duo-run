/* ============================================================================
   DUO RUN — obstacles.js  基本障害物6種（契約 §4.3）
   当たり判定の寸法は全てこの OBS テーブルが唯一の出所。
   ゲーム本体・ボット・機械テストはすべてここを読んで判断する。

   座標系:
     x … レーン方向（lane * LANE_W が中心）
     y … 高さ。床 y=0 / 天井 y=CFG.H
     z … 奥行き。2体は常に z=0、障害物は z = -(at - dist)（手前が +z）

   OBS[].y0 / y1 の意味:
     surface 型（both:false）… その面からの「距離」。天井側は H-y1 .. H-y0 に反転。
     both 型（both:true）  … 絶対 y（床にも天井にも同じ形で効く）。
   OBS[].safe … 「そのレーンに居たまま生き残れる動作」。run はどの障害物でも死ぬ。
   ============================================================================ */
'use strict';

const OBS = {
  /* ローバー（低い柵）: 高さ0.6 → ジャンプ */
  ROVER:     { span: 1, depth: 0.50, y0: 0.00, y1: 0.60,   both: false, safe: ['jump'],  label: 'ローバー' },
  /* ピラー（柱）: 1レーン全高。床・天井の両方に効く → レーン移動のみ */
  PILLAR:    { span: 1, depth: 0.50, y0: 0.00, y1: CFG.H,  both: true,  safe: [],        label: 'ピラー' },
  /* ワイド梁: 2レーンを塞ぐ。高さ2.2でジャンプでは越えられない → 空いた1レーンへ */
  WIDEBAR:   { span: 2, depth: 0.60, y0: 0.00, y1: 2.20,   both: false, safe: [],        label: 'ワイド梁' },
  /* ローレーザー: 面の近くを走る水平光線（0〜0.6を塞ぐ） → ジャンプ */
  LASER_LOW: { span: 1, depth: 0.24, y0: 0.00, y1: 0.60,   both: false, safe: ['jump'],  label: 'ローレーザー' },
  /* 縦レーザー（光柱）: 1レーン全高。両者に効く → レーン移動のみ */
  LASER_V:   { span: 1, depth: 0.30, y0: 0.00, y1: CFG.H,  both: true,  safe: [],        label: '縦レーザー' },
  /* 壁の穴（WALLHOLE / WALLSOLID）は失効（契約§4.3 2026-09-27 スライディング概念の廃止） */

  /* ------------------------------------------------------------------------
     動くレーザー（S2〜 / 契約§4.3「§4.5で横にスキャンする」・§4.4 S2の新ギミック）
     位置は params の運動（MOT）で決まる。safe は「静止した場合の」参考値で、
     実際の可否は Obstacles.occ()（到達時の占有）が唯一の出所。
     ------------------------------------------------------------------------ */
  /* 横スキャン縦光柱: 1レーン幅の光柱が1〜2レーンぶんを往復する。到達時の位置で判定 */
  LASER_SCAN: { span: 1, depth: 0.30, y0: 0.00, y1: CFG.H, both: true,  safe: [], motion: 'scan', label: '横スキャン光柱' },
  /* 回転レーザー: 面に据えた発振器から腕が首を振る。腕の下は光のカーテン（面に接地）。
     低い所はジャンプで越えられ、立っている所はレーン移動で避ける（契約§4.3の比率を守るため
     「浮いた帯」は作らない）。 */
  LASER_ROT:  { span: 1, depth: 0.34, y0: 0.00, y1: CFG.H, both: false, safe: [], motion: 'rot',  label: '回転レーザー' },

  /* ------------------------------------------------------------------------
     滑空区間の空中障害物（§4.4 S2「ビル間の大ジャンプ」）
     空中なのでジャンプは無効＝**レーン移動だけで避ける**。
     そのため全高（0〜H）を塞ぐ both 型にそろえる（§4.7 の不変条件はそのまま適用）。
     ------------------------------------------------------------------------ */
  DRONE:    { span: 1, depth: 0.62, y0: 0.00, y1: CFG.H, both: true, safe: [], label: '広告ドローン' },
  SIGNFRAG: { span: 1, depth: 0.50, y0: 0.00, y1: CFG.H, both: true, safe: [], label: '看板の破片' },
  WIRE2:    { span: 2, depth: 0.44, y0: 0.00, y1: CFG.H, both: true, safe: [], label: '電線' },
  /* 片側だけに浮かぶ広告パネル（高さ2.15＝跳んでも越えられない＝レーン移動のみ）。
     滑空中に「片方だけがよける」場面を作るための型。 */
  ADPANEL:  { span: 1, depth: 0.46, y0: 0.00, y1: 2.15, both: false, safe: [], label: '広告パネル' },

  /* ------------------------------------------------------------------------
     S3「古代遺跡・外周」の新ギミック（契約§4.4）
     ------------------------------------------------------------------------ */
  /* 崩れる橋（契約§4.5【改訂 v2】/ P7b）: 長い1レーンの区間（speed × 3.0秒）。
     踏んだ瞬間に警告 → **2.0秒後にそのレーンが崩落**（以後そのレーンに留まると死）。
     ■ 形（距離で書く。unit = その地点の 1秒ぶんの距離 = params.bridge.unitM）
         踏み口 E = at − 2.0·unit  …  崩落点 C = at  …  終わり X = at + 1.0·unit
       o.at は **崩落点 C**（＝踏み口で踏んだとき、そこまでに隣レーンへ出ている必要がある位置）。
     ■ 判定（MOT.bridgeFallAt / bands が唯一の出所）
       ・踏んだ距離 S（Bridge.update が記録。その面を走る体が足を着けて板の上に来た最初の距離）
       ・崩落 F = S + 2.0·unit。dist ≥ F の間、そのレーンは「崩落した橋」の帯（落ちた板の穴）。
       ・踏まれていなければ崩れない。**planning（occ＝生成器・ボット・不変条件）は最悪値**
         ＝ 踏み口で踏んだ（S = E → F = C）として測る。
       ・帯は穴（y −1.6〜0.04）。跳んでも滞空 0.55秒 < 残り 1.0秒 なので**必ず穴に着地する**
         ＝ pit: 跳躍は逃げ道にならない（occ が jump を落とす）。抜け方はレーン移動だけ。
     ■ long: 判定の奥行きが at の前後へ長く伸びる（lead=2.0·unit 手前・tail=1.0·unit 奥）。
       Obstacles.extent が唯一の出所。Fair・ボットは崩落の続く間（C〜X）のウォールで
       そのレーンを塞ぐ（cover）。 */
  BRIDGE:   { span: 1, depth: 0.60, y0: -1.60, y1: 0.04, both: false, safe: [],
              motion: 'bridge', long: true, pit: true, label: '崩れる橋' },
  /* 転がる丸岩（契約§4.5【新・遺跡】/ P7b）: 横から転がってレーンを横切る球。
     判定は「路面から出ている部分」＝幅 2R・高さ TOP（0.6＝跳べば越えられる）・奥行き 2R。
     位置は MOT.rollLane（到達した瞬間の位置が譜面の params.roll.lane）。
     y0 は球の埋まった下端（路面の下＝判定には効かない。見た目の外接と揃えるため） */
  ROCK:     { span: 1, depth: 2 * CFG.ROCK.R, y0: CFG.ROCK.TOP - 2 * CFG.ROCK.R, y1: CFG.ROCK.TOP,
              both: false, safe: ['jump'], motion: 'roll', hw: CFG.ROCK.R, label: '転がる丸岩' },
  /* ------------------------------------------------------------------------
     S4「古代遺跡・内部」の新ギミック（契約§4.4 / §4.5 / P3b）
     ------------------------------------------------------------------------ */
  /* 同時スイッチのパッド: 当たり判定は持たない（bands は常に空＝踏んでも死なない）。
     「踏んだ」の記録と 0.3秒窓の判定は Sync が唯一の出所。
     奥行き（z窓）は速度に比例して伸びる＝「0.36秒ぶんの長さ」が一定（zWin が pad を見る）。 */
  SYNCPAD:  { span: 1, depth: 0.60, y0: 0.00, y1: 0.08, both: false, safe: [],
              pad: true, harmless: true, label: 'スイッチのパッド' },
  /* 同時スイッチの橋: 成功すれば橋が架かって**完全に無害**、失敗すると谷になる。
     谷は「抜け落ちた床＋折れた橋脚」＝ 跳んでも越えられない（y1 = 1.60）。
     ＝ 契約§4.5 の「レーン移動で迂回路あり」が唯一の抜け方になる。
     occ（＝生成器・ボット・不変条件が読む planning の値）は **必ず失敗側**で測る
     （Obstacles.occ が grp を外して測る）ので、迂回路まで含めて §4.7 が担保される。 */
  SYNCGAP:  { span: 1, depth: 1.60, y0: -1.60, y1: 1.60, both: false, safe: [],
              motion: 'sync', label: '同時スイッチの橋' },
  /* 倒れた柱（神殿崩壊）: 3レーンを横断する低い梁（高さ0.62）→ ジャンプ */
  COLUMN:   { span: 3, depth: 0.62, y0: 0.00, y1: 0.62, both: false, safe: ['jump'],
              label: '倒れた柱' },

  /* ------------------------------------------------------------------------
     S5「深海」の新ギミック（契約§4.4 / §4.5 / P4a）
     ------------------------------------------------------------------------ */
  /* 巨大魚の部位（契約§4.4 S5 の大演出）。判定は既存の型と同じ寸法で、
     見た目は全ゾーン共通の障害物（牙＝ハードル／ヒレ・尾＝ピラー / 契約§4.3 v2）。 */
  FISH_TOOTH: { span: 1, depth: 0.50, y0: 0.00, y1: 0.60, both: false, safe: ['jump'],
                fish: true, label: '巨大魚の牙' },
  FISH_FIN:   { span: 1, depth: 0.50, y0: 0.00, y1: CFG.H, both: true, safe: [],
                fish: true, label: '巨大魚のヒレ' },
  FISH_TAIL:  { span: 1, depth: 0.40, y0: 0.00, y1: CFG.H, both: true, safe: [],
                motion: 'scan', fish: true, label: '巨大魚の尾' },

  /* サメの横断（契約§4.5【新・深海】/ P7b）: 2レーン幅の壁（全高・両者に効く）が
     横スキャンしながら迫る。位置は MOT.scanLane（到達の瞬間＝ phase。from/to は左端のレーン）。
     見た目は白×赤の縞の巨大な影（腹側が白・目は赤）。 */
  SHARK:    { span: 2, depth: 1.20, y0: 0.00, y1: CFG.H, both: true, safe: [], motion: 'scan',
              label: 'サメの横断' },
  /* 泡の噴出口（契約§4.5【新・深海】/ P7b）: 床の噴出口。**踏むと強制ジャンプ**（死なない）。
     判定は噴出口の上面の薄い帯（0〜0.08）＝足を着けて踏んだ体だけが触れる（跳んでいれば素通り）。
     触れたら Game.onVent が Runners の jump を強制発動する（harmless＝死なない）。
     占有（occ）は「そのレーンを走る＝跳ばされる」なので要求はジャンプ（踏まずに避けてもよい）。 */
  VENT:     { span: 1, depth: 1.00, y0: 0.00, y1: 0.08, both: false, safe: ['jump'],
              harmless: true, vent: true, label: '泡の噴出口' },

  /* ------------------------------------------------------------------------
     S6「宇宙ステーション」の新ギミック（契約§4.4 / §4.5 / P4b）
     ------------------------------------------------------------------------ */
  /* 重力反転ワープの黄のゲート: **当たり判定を持たない**（通るだけ）。
     面の入れ替えの規則は Warp が唯一の出所。 */
  WARPGATE: { span: 1, depth: 0.55, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, gate: true, warp: true, label: '重力反転ゲート' },
  /* 無重力区間の入口ゲートと、区間を示す青い浮遊粒子（どちらも当たり判定なし）。
     滞空が 1.5倍になる規則は Zero が唯一の出所。 */
  ZEROGATE: { span: 1, depth: 0.50, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, gate: true, zero: true, label: '無重力の入口' },
  ZEROFIELD: { span: 1, depth: 1.00, y0: 0.00, y1: 0.02, both: false, safe: [],
               ghost: true, harmless: true, zero: true, label: '無重力の粒子' },
  /* レーザーネットの区画枠（予告・当たり判定なし） */
  NETGATE: { span: 1, depth: 0.45, y0: 0.00, y1: 0.02, both: false, safe: [],
             ghost: true, harmless: true, gate: true, net: true, label: 'レーザーネットの枠' },
  /* 横ビーム（全幅・上下スキャン / 契約§4.5）。**到達時刻の高さ**で役割が変わる:
       床寄り（CFG.NET.Y_LOW）  … 床の体（走る 0〜0.90）に当たり、
                                  跳んだ体（1.30〜2.20）には当たらない → LUMEN がジャンプ
       天井寄り（CFG.NET.Y_HIGH）… 同じことが天井側で起きる → UMBRA がジャンプ
       中央（CFG.NET.Y_MID / Y_MID2）… どの姿勢にも当たらない → **どちらも無関係**
     これ以外の高さ（跳んだ体だけに当たる帯）は Fair が「跳躍帯を塞ぐ」として弾く。 */
  LASER_H: { span: 3, depth: 0.30, y0: 0.00, y1: CFG.H, both: true, safe: [],
             motion: 'hscan', net: true, label: '横ビーム' },
  /* 斜めビーム（契約§4.5「床のレーンLから天井のレーンRへ渡る」）。
     床側の柱（0〜1.66）と天井側の柱（H-1.66〜H）の2枚。
     床の跳躍（最高 2.20）は床側の柱に必ず当たり、天井の跳躍（最低 1.80）は
     床側の柱に絶対に当たらない ＝ **床と天井で避けるレーンが違う**。 */
  LASER_DIAG: { span: 1, depth: 0.34, y0: 0.00, y1: CFG.H, both: true, safe: [],
                motion: 'diag', net: true, label: '斜めビーム' },

  /* ------------------------------------------------------------------------
     S7「鏡の世界」の新ギミック（契約§4.4 / §4.5 / P5a）
     ------------------------------------------------------------------------ */
  /* 鏡ゾーンの銀の枠のゲート: **当たり判定を持たない**（通るだけ）。
     左右反転の規則は Mirror が唯一の出所。surface 型＝置かれた面のキャラに効く。 */
  MIRGATE:  { span: 1, depth: 0.55, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, gate: true, mirror: true, label: '鏡ゾーンのゲート' },
  /* 世界反転ゲート（旧・入れ替えワープ）の紫のゲート: 当たり判定なし。画面全体が 180° 回る（Swap が出所）。 */
  SWAPGATE: { span: 1, depth: 0.55, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, gate: true, swap: true, label: '世界反転ゲート' },
  /* 割れた鏡の床（飛び石 / 契約§4.4 S7 の大演出）: 全幅が抜けていて、
     **揺れる鏡片1枚ぶんの幅だけ**が足場。足場の外は GAP と同じ寸法＝跳べば越えられる。
     奥行きが深い（＝裂け目が広い）ので、Fair の「通過に要する距離」からは外す（noPass）。 */
  SHARDGAP: { span: 3, depth: 5.20, y0: -1.60, y1: 0.04, both: false, safe: ['jump'],
              motion: 'shard', noPass: true, label: '割れた鏡の床' },

  /* ------------------------------------------------------------------------
     S8「コア」の新ギミック（契約§4.4 / §4.5 / P5b）
     ------------------------------------------------------------------------ */
  /* 合体区間のゲート: **当たり判定を持たない**（通るだけ）。
     2体が中央で1体になる／出口で分離する規則は Merge が唯一の出所。 */
  MERGEGATE: { span: 1, depth: 0.55, y0: 0.00, y1: 0.02, both: false, safe: [],
               ghost: true, harmless: true, gate: true, merge: true, label: '合体ゲート' },

  /* 減速帯（瓦礫の山）: 巨岩の追跡で使う**死なない**障害物。
     ジャンプで越えなければ速度が一時的に -20%（契約§4.4 S3 の大演出）。
     公平性（§4.7）の扱いは通常のジャンプ要求と同じ＝間隔も生存経路も守られる。 */
  SLOWBAND: { span: 1, depth: 0.60, y0: 0.00, y1: 0.62, both: false, safe: ['jump'],
              harmless: true, label: '瓦礫の山' }
};

const OBS_INSET = 0.10;   // レーン幅より少し細くして「隣接レーンの掠り死」を防ぐ

/* ============================================================================
   MOT — 動く障害物の運動（契約§4.5「動きは決定論的（区画のシードで固定）」）

   ■ 位相は「時間」ではなく **走行距離 dist** の関数にする。
     u(dist) = (dist - o.at) / periodM + phase
     こうすると **到達した瞬間（dist = o.at）の位相が必ず phase** になる。
     ＝ 譜面（チャンク定義）に書いた phase が、そのまま「当たり判定の時の位置」。
     フレームレート・スロー演出・リトライに一切左右されない。
   ■ ここが動きの唯一の出所。判定（bands/hits）・ボット・不変条件（Fair）・見た目（place）
     はすべてこの関数を読む。
   ============================================================================ */
const MOT = {
  _u(p, o, dist, defPeriod) {
    return (dist - o.at) / (p.periodM || defPeriod) + (p.phase || 0);
  },
  /* 0..1 の往復（端で速度0＝端に“溜め”ができて読みやすい） */
  _tri(u) { return 0.5 - 0.5 * Math.cos(2 * Math.PI * u); },

  /* 横スキャン: 連続レーン座標（-1..1 の実数）を返す。params が無ければ静止 */
  scanLane(o, dist) {
    const p = o.params && o.params.scan;
    if (!p) return o.lane;
    return p.from + (p.to - p.from) * MOT._tri(MOT._u(p, o, dist, CFG.LASER.SCAN_PERIOD));
  },
  /* 回転（首振り）: 腕の角度 0..π（0 = 面に沿って +x、π/2 = 面から垂直） */
  rotTheta(o, dist) {
    const p = (o.params && o.params.rot) || null;
    if (!p) return Math.PI / 2;
    return Math.PI * MOT._tri(MOT._u(p, o, dist, CFG.LASER.ROT_PERIOD));
  },
  /* 点滅: ON/OFF。到達点（dist = at）は必ず枠の**中央**なので、
     通過している途中で切り替わることがない（周期の半分 = periodM/2 だけ離れている）。 */
  blinkOn(o, dist) {
    const p = o.params && o.params.blink;
    if (!p) return true;
    const k = Math.floor((dist - o.at) / (p.periodM || CFG.LASER.BLINK_PERIOD) + 0.5);
    const even = ((k % 2) + 2) % 2 === 0;
    const onAt = (p.onAtArrival !== false);
    return even ? onAt : !onAt;
  },
  /* 崩れる橋（契約§4.5【改訂 v2】）: 距離＝時刻の規則。**ここが唯一の出所**。
       bridgeUnit  … 1秒ぶんの距離（生成時の速度で決まる）
       bridgeEntry … 踏み口 E ／ bridgeEnd … 終わり X ／ at … 崩落点 C（最悪値）
       bridgeStep  … 踏んだ距離。planning 中（Obstacles._plan）は最悪値＝踏み口。
                     実走では Bridge.update が記録した o.stepM（未踏なら null）。
       bridgeFallAt… 崩落する距離 F = S + WARN_T·unit（未踏なら Infinity） */
  bridgeUnit(o) { return (o.params && o.params.bridge && o.params.bridge.unitM) || CFG.REF_SPEED; },
  bridgeLead(o) { return MOT.bridgeUnit(o) * CFG.BRIDGE.WARN_T; },
  bridgeTail(o) { return MOT.bridgeUnit(o) * (CFG.BRIDGE.LEN_T - CFG.BRIDGE.WARN_T); },
  bridgeEntry(o) { return o.at - MOT.bridgeLead(o); },
  bridgeEnd(o) { return o.at + MOT.bridgeTail(o); },
  bridgeStep(o) {
    if (Obstacles._plan) return MOT.bridgeEntry(o);
    return (typeof o.stepM === 'number') ? o.stepM : null;
  },
  bridgeFallAt(o) {
    const s = MOT.bridgeStep(o);
    return (s === null) ? Infinity : s + MOT.bridgeLead(o);
  },
  /* 見た目: 0..1 の落下の進み具合（崩落から 0.5秒で落ちきる） */
  bridgeFall(o, dist) {
    const f = MOT.bridgeFallAt(o);
    if (!isFinite(f) || dist <= f) return 0;
    return Math.min(1, (dist - f) / (MOT.bridgeUnit(o) * 0.5));
  },

  /* ------------------------------------------------------------------------
     レーザーネット（契約§4.5 / §4.4 S6）の時刻規則。**ここが唯一の出所**。
     横スキャン（scanLane）と同じ「到達した瞬間（dist = at）の位相が phase」という作り。
       hbeamY(o, dist)    … 横ビームの高さ（絶対 y）
       diagLanes(o, dist) … 斜めビームの 床側／天井側のレーン（連続値）
     ------------------------------------------------------------------------ */
  hbeamY(o, dist) {
    const p = o.params && o.params.hbeam;
    if (!p) return CFG.NET.Y_LOW;
    const a = (p.y0 === undefined) ? CFG.NET.Y_LOW : p.y0;
    const b = (p.y1 === undefined) ? CFG.NET.Y_HIGH : p.y1;
    return a + (b - a) * MOT._tri(MOT._u(p, o, dist, CFG.NET.PERIOD));
  },
  diagLanes(o, dist) {
    const p = (o.params && o.params.diag) || null;
    if (!p) return { f: o.lane, c: -o.lane };
    const u = MOT._tri(MOT._u(p, o, dist, CFG.NET.PERIOD));
    const f0 = (p.f0 === undefined) ? o.lane : p.f0;
    const c0 = (p.c0 === undefined) ? -f0 : p.c0;
    const f1 = (p.f1 === undefined) ? f0 : p.f1;
    const c1 = (p.c1 === undefined) ? c0 : p.c1;
    return { f: f0 + (f1 - f0) * u, c: c0 + (c1 - c0) * u };
  },

  /* ------------------------------------------------------------------------
     割れた鏡の床の足場（契約§4.4 S7）の時刻規則。**ここが唯一の出所**。
     横スキャン（scanLane）と同じ「到達した瞬間（dist = at）の位相が phase」という作り。
       shardLane(o, dist) … 足場の中心（連続レーン座標 -1..1 の実数）
     譜面には phase 0（＝到達時は from の端で溜まっている）を書くので、
     通過窓（±2.6m）のあいだ足場はほとんど動かない＝判定が譜面どおりになる。
     ------------------------------------------------------------------------ */
  shardLane(o, dist) {
    const p = o.params && o.params.shard;
    if (!p) return o.lane;
    const from = (p.from === undefined) ? o.lane : p.from;
    const to = (p.to === undefined) ? -from : p.to;
    return from + (to - from) * MOT._tri(MOT._u(p, o, dist, CFG.SHARD.PERIOD));
  },

  /* 転がる丸岩（契約§4.5 新・遺跡）: 連続レーン座標（-1..1 を越えて転がり出ていく）。
     到達した瞬間（dist = at）は params.roll.lane。dir の向きへ 1レーン / periodM で転がる。
     ＝ 手前では -dir 側の壁の外から転がってきて、通り過ぎたあとは +dir 側へ抜けていく。 */
  rollLane(o, dist) {
    const p = o.params && o.params.roll;
    if (!p) return o.lane;
    const lane = (p.lane === undefined) ? o.lane : p.lane;
    return lane + (p.dir || 1) * (dist - o.at) / (p.periodM || CFG.ROCK.PERIOD);
  },

  /* 次に ON になるまでの距離（予告灯用。ON 中は 0） */
  toNextOn(o, dist) {
    const p = o.params && o.params.blink;
    if (!p) return 0;
    const P = p.periodM || CFG.LASER.BLINK_PERIOD;
    if (MOT.blinkOn(o, dist)) return 0;
    const k = Math.floor((dist - o.at) / P + 0.5);
    return ((k + 0.5) * P + o.at) - dist;       // 今の枠の終わり
  }
};

/* ============================================================================
   Sync — 同時スイッチ（契約§4.5 / §4.4 S4）の**時刻規則の唯一の出所**

   ■ 形
     パッド（床・天井の対） → その先の橋（SYNCGAP × 2レーン × 2面）。
     どの実体も同じ「グループ」 `o.grp` を指す:
       { padAt, gapAt, unit, floor, ceil, ok, okM, deadM, safe, csafe }
     floor/ceil には「踏んだ距離」が入る（未踏は null）。

   ■ 規則（崩れる橋と同じ流儀で、距離＝時刻として書く）
     ・踏んだ ＝ そのパッドの z窓の中に、その面を走る体が**足を着けて**いる
       （跳んでいる間は踏めない）。最初に重なった距離を記録する。
     ・両方踏んだら |floor - ceil| / unit ≤ CFG.SYNC.WINDOW_T(0.3秒) で **成功**。
     ・パッドを通り過ぎても片方しか踏んでいなければ **失敗**。
     ・成功なら先の橋が架かる（SYNCGAP の bands が空になる）。
       失敗なら谷のまま＝迂回の1レーンだけが生き残る（§4.7 は occ が最悪値で担保）。
   ============================================================================ */
const Sync = {
  unitOf(o) { return (o.params && o.params.sync && o.params.sync.unitM) || CFG.REF_SPEED; },

  /* 譜面の1エントリ（type:'SYNCSW'）を実体へ展開する。
     params.sync = { cl:天井パッドのレーン, dt:天井パッドのずれ(秒/テスト用),
                     gapT:橋までの距離(秒), safe:床の迂回レーン, csafe:天井の迂回レーン } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.sync) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);   // その地点の「1秒ぶんの距離」
    const cl = (p.cl === undefined) ? e.lane : p.cl;
    const dOff = (p.dt || 0) * unit;
    const gapAt = at + ((p.gapT === undefined) ? CFG.SYNC.GAP_T : p.gapT) * unit;
    const safe = (p.safe === undefined) ? 0 : p.safe;
    const csafe = (p.csafe === undefined) ? safe : p.csafe;
    const grp = {
      padAt: at, ceilPadAt: at + dOff, gapAt: gapAt, unit: unit,
      floor: null, ceil: null, ok: null, okM: 0,
      deadM: Math.max(at, at + dOff) + unit * CFG.SYNC.PAD_T / 2,
      safe: safe, csafe: csafe, cued: false
    };
    const pp = { sync: { unitM: unit } };
    const pf = Obstacles.make('SYNCPAD', 'floor', e.lane, at, nowDist, pp);
    const pc = Obstacles.make('SYNCPAD', 'ceil', cl, at + dOff, nowDist, pp);
    pf.grp = grp; pc.grp = grp;
    items.push(pf, pc);
    CFG.LANES.forEach((l) => {
      if (l !== safe) { const o = Obstacles.make('SYNCGAP', 'floor', l, gapAt, nowDist, pp); o.grp = grp; items.push(o); }
      if (l !== csafe) { const o = Obstacles.make('SYNCGAP', 'ceil', l, gapAt, nowDist, pp); o.grp = grp; items.push(o); }
    });
    if (sink) sink.push(grp);
    return grp;
  },

  /* 0.3秒窓の判定（**この1行が契約§4.5 の「同じ0.3秒窓内」**） */
  inWindow(grp) {
    if (grp.floor === null || grp.ceil === null) return false;
    return Math.abs(grp.floor - grp.ceil) / Math.max(1e-6, grp.unit) <= CFG.SYNC.WINDOW_T + 1e-9;
  },
  /* 成否を確定する（両方踏んだ瞬間 or パッドを通り過ぎた瞬間） */
  settle(grp, dist) {
    if (grp.ok !== null) return grp.ok;
    if (grp.floor !== null && grp.ceil !== null) { grp.ok = Sync.inWindow(grp); grp.okM = dist; return grp.ok; }
    if (dist > grp.deadM) { grp.ok = false; grp.okM = grp.deadM; return false; }
    return null;
  },

  /* パッドを踏んだかを見て、成否を確定する。Game.step から毎フレーム1回 */
  update(game) {
    const dist = game.dist;
    const gs = (game.gen && game.gen.syncs) ? game.gen.syncs : null;
    if (!gs || !gs.length) { Sync.hud(game, null); return; }
    for (let i = 0; i < game.active.length; i++) {
      const o = game.active[i];
      if (!OBS[o.type].pad || !o.grp || o.grp.ok !== null) continue;
      const side = o.surface;
      if (o.grp[side] !== null) continue;
      const r = game.runners.filter((x) => x.surface === side)[0];
      if (!r) continue;
      if (r.act === 'jump') continue;                       // 足が面から離れている間は踏めない
      const z = Obstacles.zWin(o, dist);
      if (!U.overlap1(-CFG.BODY_D / 2, CFG.BODY_D / 2, z.z0, z.z1)) continue;
      const rb = Runners.box(r);
      const x0 = (o.lane - 0.5) * CFG.LANE_W + OBS_INSET, x1 = (o.lane + 0.5) * CFG.LANE_W - OBS_INSET;
      if (!U.overlap1(rb.x0, rb.x1, x0, x1)) continue;
      o.grp[side] = dist;
    }
    for (let k = 0; k < gs.length; k++) Sync.settle(gs[k], dist);
    Sync.hud(game, gs);
  },

  /* HUD の「SYNC!」予告と成否の演出（契約§6 P3b）。距離の関数なので巻き戻しても壊れない */
  hud(game, gs) {
    if (typeof HUD === 'undefined' || !HUD.syncCue) return;
    if (!gs) { HUD.syncCue(null); return; }
    const dist = game.dist, sp = Math.max(1, game.speed);
    let show = null;
    for (let k = 0; k < gs.length; k++) {
      const g = gs[k];
      if (g.ok === null) {
        if (g.padAt - dist <= sp * CFG.SYNC.CUE_T && g.padAt - dist > -sp * CFG.SYNC.PAD_T) show = 'cue';
      } else if (dist - g.okM >= 0 && dist - g.okM <= sp * CFG.SYNC.RESULT_T) {
        show = g.ok ? 'ok' : 'miss';
      }
    }
    HUD.syncCue(show);
  },

  /* 中断・チェックポイント再開で「パッドは通り過ぎたのに橋だけ残る」を作らない。
     再開位置より手前にパッドがあるグループは、橋ごと取り込まない。 */
  dropOrphans(list, cutM) {
    return list.filter((o) => !(o.grp && o.grp.padAt < cutM));
  },
  /* グループの一覧そのものからも外す。**HUD（SYNC! の予告）は一覧を見ている**ので、
     実体だけ落としても「見えない踏み板の予告」が出続けてしまう
     （2026-09-22 P4b で発覚: リトライ直後に帯が点いたままになる）。 */
  killBefore(list, cutM) {
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].padAt < cutM) list.splice(i, 1);
  },

  /* テスト・監査の窓口 */
  snapshot(game) {
    const gs = (game.gen && game.gen.syncs) ? game.gen.syncs : [];
    return gs.filter((g) => Math.abs(g.padAt - game.dist) < 260)
             .map((g) => ({ padAt: +g.padAt.toFixed(1), gapAt: +g.gapAt.toFixed(1), ok: g.ok,
                            dt: (g.floor !== null && g.ceil !== null)
                                ? +(Math.abs(g.floor - g.ceil) / g.unit).toFixed(3) : null }));
  }
};

/* ============================================================================
   Warp — 重力反転ワープ（契約§4.5 / §4.4 S6）の**時刻規則の唯一の出所**

   ■ 形
     黄のゲートが2枚で1組（入口と出口）。通過するたびに
     **LUMEN と UMBRA の走る面（床/天井）が入れ替わる**（Game.swapSurfaces）。
     操作は「画面の位置＝担当」のままなので（§4.2）、ワープ後は
     下半分が UMBRA を、上半分が LUMEN を動かすことになる（HUD も面から引く）。

   ■ 規則（崩れる橋・海流ベルトと同じ流儀で、距離＝時刻として書く）
     ・入れ替えは **走行距離がゲートを跨いだ瞬間** に1回だけ起きる（フレーム非依存）。
     ・ゲートの直後 CFG.WARP.GRACE_T 秒（1.0秒）は障害物を置かない。
       ＝ 相手のレーンから走り始めることになるので、立て直す時間を必ず渡す。
     ・Fair はこの余白を検査し、さらに **生存レーンの到達可能性をリセット**する
       （面が入れ替わると、その面を走る体のレーンが変わるため）。
   ============================================================================ */
const Warp = {
  /* 譜面の1エントリ（type:'GRAVWARP'）を実体へ展開する。
     params.warp = { backT: 戻りのゲートまでの距離（秒。省略時 6秒） } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.warp) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const backT = (p.backT === undefined) ? 6 : p.backT;
    const to = at + backT * unit;
    const reg = { from: at, to: to, unit: unit, gates: [at, to], done: [], dead: false };
    reg.gates.forEach((m) => {
      const o = Obstacles.make('WARPGATE', 'floor', 0, m, nowDist, { warp: { unitM: unit } });
      o.reg = reg;
      items.push(o);
    });
    if (sink) sink.push(reg);
    return reg;
  },

  /* a < ゲート ≤ b を跨いだ回数（奇数なら面が入れ替わっている） */
  crossed(list, a, b) {
    if (!list || !list.length) return 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      for (let k = 0; k < r.gates.length; k++) if (r.gates[k] > a && r.gates[k] <= b) n++;
    }
    return n;
  },
  /* atM の直前 windowM 以内にゲートがあるか（＝立て直す余裕がないか） */
  gateNear(list, atM, windowM) {
    if (!list || !list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      for (let k = 0; k < r.gates.length; k++) {
        if (r.gates[k] > atM - windowM && r.gates[k] <= atM) return true;
      }
    }
    return false;
  },
  /* 次のゲートまでの距離（予告の見た目に使う。無ければ Infinity） */
  nextGate(list, m) {
    let best = Infinity;
    if (!list) return best;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      for (let k = 0; k < r.gates.length; k++) if (r.gates[k] >= m && r.gates[k] - m < best) best = r.gates[k] - m;
    }
    return best;
  },

  /* 毎フレーム1回（Game.step から）。prevDist → dist の間に跨いだゲートを実行する */
  update(game) {
    const list = (game.gen && game.gen.warps) ? game.gen.warps : null;
    if (!list || !list.length) return 0;
    const n = Warp.crossed(list, game.prevDist, game.dist);
    for (let i = 0; i < n; i++) game.flip();
    return n;
  },

  /* 中断・チェックポイント再開で「片道だけ通った状態」を作らない。
     入口が再開位置より手前にある組は、戻りのゲートごと取り込まない。 */
  dropOrphans(list, cutM) { return list.filter((o) => !(o.reg && o.reg.from < cutM)); },
  killBefore(regs, cutM) {
    if (!regs) return;
    for (let i = 0; i < regs.length; i++) if (regs[i].from < cutM) regs[i].dead = true;
  },
  snapshot(game) {
    const list = (game.gen && game.gen.warps) ? game.gen.warps : [];
    return list.filter((r) => !r.dead && Math.abs(r.from - game.dist) < 260)
               .map((r) => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(1) }));
  }
};

/* ============================================================================
   Zero — 無重力ジャンプ（契約§4.5 / §4.4 S6）の**滞空係数の唯一の出所**

   区間の中で踏み切ったジャンプは滞空が CFG.ZEROG.MUL 倍（0.55 → 0.83秒）になる。
   **高さは変えない**ので、通過の瞬間の姿勢（位相 u = 経過/滞空）は通常と同じ
   ＝ 占有（occ）の表は無重力でも書き換わらない。変わるのは「時間」だけ:
     ・体      … Runners が踏切の瞬間に r.jumpT へ焼き付ける
     ・ボット  … 踏切の距離 speed × JUMP_LEAD × 係数
     ・不変条件… ジャンプ連続 / ジャンプ→レーン移動（Fair が同じ係数を掛ける）
   ============================================================================ */
const Zero = {
  /* 今この瞬間の倍率（踏切のときだけ読む）。Game.step が毎フレーム更新する */
  cur: 1,

  /* 譜面の1エントリ（type:'ZEROG'）を実体へ展開する。
     params.zero = { n: 区間の長さ（秒。省略時 4秒） } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.zero) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const n = (p.n === undefined) ? 4 : p.n;
    const reg = { from: at, to: at + n * unit, unit: unit, n: n, dead: false };
    const gate = Obstacles.make('ZEROGATE', 'floor', 0, at, nowDist, { zero: { unitM: unit } });
    gate.reg = reg;
    items.push(gate);
    /* 青い浮遊粒子（予告・当たり判定なし）。1秒ぶんずつ床と天井に敷く */
    for (let i = 0; i < n; i++) {
      ['floor', 'ceil'].forEach((side) => {
        const o = Obstacles.make('ZEROFIELD', side, 0, at + (i + 0.5) * unit * CFG.ZEROG.SEG_T,
                                 nowDist, { zero: { unitM: unit } });
        o.reg = reg;
        items.push(o);
      });
    }
    if (sink) sink.push(reg);
    return reg;
  },

  /* その距離の滞空倍率（1 = 通常 / CFG.ZEROG.MUL = 無重力） */
  kAt(list, m) {
    if (!list || !list.length) return 1;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.dead && m >= r.from && m <= r.to) return CFG.ZEROG.MUL;
    }
    return 1;
  },
  /* その距離での滞空時間（秒）。判定・ボット・不変条件はここだけを読む */
  jumpT(list, m) { return CFG.JUMP_T * Zero.kAt(list, m); },
  inZone(list, m) { return Zero.kAt(list, m) > 1; },

  /* 毎フレーム1回（Game.step から）。踏切に使う倍率を現在地から決める */
  update(game) {
    const list = (game.gen && game.gen.zeros) ? game.gen.zeros : null;
    Zero.cur = Zero.kAt(list, game.dist);
    return Zero.cur;
  },

  dropOrphans(list, cutM) { return list.filter((o) => !(o.reg && o.reg.from < cutM)); },
  killBefore(regs, cutM) {
    if (!regs) return;
    for (let i = 0; i < regs.length; i++) if (regs[i].from < cutM) regs[i].dead = true;
  },
  snapshot(game) {
    const list = (game.gen && game.gen.zeros) ? game.gen.zeros : [];
    return list.filter((r) => !r.dead && Math.abs(r.from - game.dist) < 260)
               .map((r) => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(1), n: r.n }));
  }
};

/* ============================================================================
   Mirror — 鏡ゾーン（契約§4.5【2026-09-25 改訂: 固定反転】/ P8a）の**時刻規則の唯一の出所**

   ■ 形
     銀の枠のゲートが **1枚**（出口ゲートは失効）。**ゲートが置かれた面**（床 or 天井）を
     走るキャラの左右操作が反転し、**以後戻らない**（runner.mirrored = true。トグルしない＝
     同じ面のゲートをもう一度くぐっても反転のまま）。
     反転そのものは Runners.input の1行（dir = -dir）が唯一の実装で、
     人間のタッチもキーボードもボットも同じ1か所を通る。
   ■ いつ戻るか（＝ mirrored が false に戻るのはここに挙げる場合だけ）
     ・ステージの終わり／最初からやり直す／タイトルへ戻る（Runners.reset）
     ・エンドレスのゾーン切替（Mirror.clearAll / 区画内では戻さない）
     ・チェックポイント再開は「再開位置までにくぐったゲート」を Mirror.restore が掛け直す
       （＝ステージの途中から再開しても、そのステージの反転の状態は変わらない）
   ■ 規則（重力反転ワープと同じ流儀で、距離＝時刻として書く）
     ・反転は **走行距離がゲートを跨いだ瞬間** に1回だけ起きる（フレーム非依存）。
     ・ゲートの直後 CFG.MIRRORZ.GRACE_T 秒（1.0秒）は障害物を置かない。
     ・Fair はこの余白を検査し、さらに **生存レーンの到達可能性をリセット**する
       （左右が入れ替わった直後は、どちらへ動くかの判断がやり直しになるため）。
   ============================================================================ */
const Mirror = {
  /* 譜面の1エントリ（type:'MIRRORZ'）を実体へ展開する。
     params.mir = { side: 'floor'|'ceil'（省略時は書いた面） }（旧 backT＝出口までの秒数は失効・無視） */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.mir) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const side = (p.side === 'ceil' || p.side === 'floor') ? p.side : surface;
    /* to は「最後のゲート」（＝ from。生成器の regionEnd がゲート型の終わりとして読む）。
       効き目は固定反転なので to を過ぎても続く（activeAt は from だけを見る） */
    const reg = { from: at, to: at, unit: unit, side: side, gates: [at], fixed: true, dead: false };
    const o = Obstacles.make('MIRGATE', side, e.lane || 0, at, nowDist, { mir: { unitM: unit, side: side } });
    o.reg = reg;
    items.push(o);
    if (sink) sink.push(reg);
    return reg;
  },

  /* a < ゲート ≤ b を跨いだ回数（side を指定すればその面だけ） */
  crossed(list, a, b, side) {
    if (!list || !list.length) return 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || (side && r.side !== side)) continue;
      for (let k = 0; k < r.gates.length; k++) if (r.gates[k] > a && r.gates[k] <= b) n++;
    }
    return n;
  },
  /* atM の直前 windowM 以内にゲートがあるか（＝立て直す余裕がないか） */
  gateNear(list, atM, windowM, side) {
    if (!list || !list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || (side && r.side !== side)) continue;
      for (let k = 0; k < r.gates.length; k++) {
        if (r.gates[k] > atM - windowM && r.gates[k] <= atM) return true;
      }
    }
    return false;
  },
  /* その距離でその面が反転しているか（固定反転: その面のゲートを1枚でもくぐったか）。監査の窓口 */
  activeAt(list, side, m) {
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || r.side !== side) continue;
      if (m > r.from) return true;
    }
    return false;
  },

  /* 毎フレーム1回（Game.step から）。prevDist → dist の間に跨いだゲートを実行する */
  update(game) {
    const list = (game.gen && game.gen.mirrors) ? game.gen.mirrors : null;
    if (!list || !list.length) return 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      for (let k = 0; k < r.gates.length; k++) {
        if (r.gates[k] <= game.prevDist || r.gates[k] > game.dist) continue;
        const rn = game.runners.filter((x) => x.surface === r.side)[0];
        if (rn) rn.mirrored = true;                 // 固定反転: 戻さない（トグルしない）
        n++;
      }
    }
    return n;
  },
  /* エンドレスのゾーン切替（契約§4.5「ゾーン切替で解除」）: 2体とも通常へ戻す */
  clearAll(game) {
    let n = 0;
    game.runners.forEach((r) => { if (r.mirrored) { r.mirrored = false; n++; } });
    return n;
  },
  /* チェックポイント再開（Game.resetRun）: cutM より手前でくぐったゲートを掛け直す。
     面は再開時に既定（LUMEN=床 / UMBRA=天井）へ戻っているので、ゲートの面＝既定のキャラ。
     エンドレスは「cutM と同じゾーンの中のゲート」だけ（ゾーン切替で解除される規則と同じ）。
     掛け直したゲートは dead にする（もう跨がない・監査の snapshot にも出さない）。 */
  restore(game, cutM, zoneAt) {
    const list = (game.gen && game.gen.mirrors) ? game.gen.mirrors : null;
    if (!list) return 0;
    const zNow = zoneAt ? zoneAt(cutM) : null;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || r.from >= cutM) continue;
      r.dead = true;
      if (zoneAt && zoneAt(r.from) !== zNow) continue;
      const rn = game.runners.filter((x) => x.surface === r.side)[0];
      if (rn) { rn.mirrored = true; n++; }
    }
    return n;
  },

  /* 中断・チェックポイント再開で「片道だけ通った状態」を作らない */
  dropOrphans(list, cutM) { return list.filter((o) => !(o.reg && o.reg.from < cutM)); },
  killBefore(regs, cutM) {
    if (!regs) return;
    for (let i = 0; i < regs.length; i++) if (regs[i].from < cutM) regs[i].dead = true;
  },
  snapshot(game) {
    const list = (game.gen && game.gen.mirrors) ? game.gen.mirrors : [];
    return list.filter((r) => !r.dead && Math.abs(r.from - game.dist) < 260)
               .map((r) => ({ from: +r.from.toFixed(1), side: r.side }));
  }
};

/* ============================================================================
   Swap — 世界反転ゲート（旧・入れ替えワープ / 契約§4.5【2026-09-25 全面改訂】/ P8a）の
   **時刻規則の唯一の出所**

   ■ 形
     紫のゲートが2枚で1組。跨ぐたびに **世界が 180° 回る**（Game.setWorldFlip をトグル）。
     論理（担当・フリックの読み）は跨いだ瞬間に切り替わり、カメラは 0.5秒かけて回る
     （回転の間は入力を受け付けない）。2枚目で逆回転して戻る。
     「画面の位置＝担当」（§4.2）は不変: 画面の下半分＝画面の下に見えているキャラ
     （Game.runnerForZone / worldZone が唯一の変換）。旧「担当だけ入れ替わる」は失効。
   ■ 規則
     ・反転は **走行距離がゲートを跨いだ瞬間** に1回だけ（フレーム非依存）。
     ・ゲートの直後 CFG.HANDSWAP.GRACE_T 秒（1.0秒）は障害物を置かない。
     ・Fair は余白を検査し、生存レーンの到達可能性を **両面ともリセット**する。
   ============================================================================ */
const Swap = {
  /* 譜面の1エントリ（type:'HANDSWAP'）を実体へ展開する。
     params.swp = { backT: 戻りのゲートまでの秒数 } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.swp) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const backT = (p.backT === undefined) ? 6 : p.backT;
    const to = at + backT * unit;
    const reg = { from: at, to: to, unit: unit, gates: [at, to], dead: false };
    reg.gates.forEach((m) => {
      const o = Obstacles.make('SWAPGATE', 'floor', 0, m, nowDist, { swp: { unitM: unit } });
      o.reg = reg;
      items.push(o);
    });
    if (sink) sink.push(reg);
    return reg;
  },

  crossed(list, a, b) { return Mirror.crossed(list, a, b, null); },
  gateNear(list, atM, windowM) { return Mirror.gateNear(list, atM, windowM, null); },
  activeAt(list, m) {
    if (!list) return false;
    let on = false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      if (m > r.from && m <= r.to) on = !on;
    }
    return on;
  },

  update(game) {
    const list = (game.gen && game.gen.swaps) ? game.gen.swaps : null;
    if (!list || !list.length) return 0;
    const n = Swap.crossed(list, game.prevDist, game.dist);
    for (let i = 0; i < n; i++) game.setWorldFlip(!game.worldFlip);
    return n;
  },

  dropOrphans(list, cutM) { return list.filter((o) => !(o.reg && o.reg.from < cutM)); },
  killBefore(regs, cutM) { Mirror.killBefore(regs, cutM); },
  snapshot(game) {
    const list = (game.gen && game.gen.swaps) ? game.gen.swaps : [];
    return list.filter((r) => !r.dead && Math.abs(r.from - game.dist) < 260)
               .map((r) => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(1) }));
  }
};

/* ============================================================================
   Merge — 合体区間（契約§4.5「合体区間」/ §4.4 S8）の**時刻規則の唯一の出所**

   ■ 形
     専用ゲートが2枚で1組（入口 from ／ 出口 to）。区間の中では2体が中央で
     **1体（合体体）**になり、床を走る。区間の長さは「秒」で書く。

   ■ 操作（契約§4.5 を本作の上下タッチ規則（§4.2）で読んだ形）
       下半分の横フリック  → レーン移動
       上半分の上フリック  → ジャンプ（下フリックは無効＝スライディング失効 2026-09-27）
       キーボード（開発・テスト用）は 左手 A/D＝移動・右手 ↑
     ＝ 読み手は Game.applyInput の1か所だけ（人間もキーもボットも同じ経路）。

   ■ 判定
     合体体は **床を走っている方**（重力反転中なら UMBRA）1体ぶん。
     天井側の障害物には当たらない（誰も天井に居ないため）。
     Fair は合体区間の中の **天井の要求を落とす**（＝譜面も同じ前提で書ける）。

   ■ 規則（重力反転ワープ・入れ替えワープと同じ流儀で、距離＝時刻として書く）
     ・合体／分離は **走行距離がゲートを跨いだ瞬間**に起きる（フレーム非依存）。
     ・ゲートの直後 CFG.MERGE.GRACE_T 秒（1.0秒）は **両面とも**障害物を置かない。
     ・出口では合体体のレーン（＝最寄りレーン）へ2体が戻る。
   ============================================================================ */
const Merge = {
  /* 譜面の1エントリ（type:'MERGE'）を実体へ展開する。
     params.mrg = { n: 区間の長さ（秒。省略時 CFG.MERGE.N_T） } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.mrg) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const n = (p.n === undefined) ? CFG.MERGE.N_T : p.n;
    const to = at + n * unit;
    const reg = { from: at, to: to, unit: unit, n: n, gates: [at, to], dead: false };
    reg.gates.forEach((m, i) => {
      const o = Obstacles.make('MERGEGATE', 'floor', e.lane || 0, m, nowDist,
                               { mrg: { unitM: unit, exit: i === 1 } });
      o.reg = reg;
      items.push(o);
    });
    if (sink) sink.push(reg);
    return reg;
  },

  /* その距離が合体区間の中か（＝1体になっているか）。判定・入力・ボットの窓口 */
  activeAt(list, m) {
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.dead && m > r.from && m <= r.to) return true;
    }
    return false;
  },
  /* 合体の度合い 0..1（見た目だけ）。入口の手前 JOIN_T 秒で 0→1、
     出口のあと SPLIT_T 秒で 1→0。DUO体（大ジャンプ）の duoK と同じ形。 */
  kAt(list, m, speed) {
    if (!list) return 0;
    const sp = Math.max(4, speed || CFG.REF_SPEED);
    let k = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      if (m > r.from && m <= r.to) return 1;
      if (m <= r.from) k = Math.max(k, U.clamp(1 - (r.from - m) / (sp * CFG.MERGE.JOIN_T), 0, 1));
      else k = Math.max(k, U.clamp(1 - (m - r.to) / (sp * CFG.MERGE.SPLIT_T), 0, 1));
    }
    return k;
  },
  crossed(list, a, b) { return Mirror.crossed(list, a, b, null); },
  gateNear(list, atM, windowM) { return Mirror.gateNear(list, atM, windowM, null); },
  /* 区間が a〜b に少しでも掛かるか（Fair が天井の要求を落とす判断に使う） */
  overlaps(list, a, b) {
    if (!list) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.dead && b > r.from && a < r.to) return true;
    }
    return false;
  },

  /* 毎フレーム1回（Game.step から）。prevDist → dist の間に跨いだゲートを実行する */
  update(game) {
    const list = (game.gen && game.gen.merges) ? game.gen.merges : null;
    const was = game.merged;
    game.merged = Merge.activeAt(list, game.dist);
    if (game.merged === was) return 0;
    game.onMergeChange(game.merged);
    return 1;
  },

  dropOrphans(list, cutM) { return list.filter((o) => !(o.reg && o.reg.from < cutM)); },
  killBefore(regs, cutM) { Mirror.killBefore(regs, cutM); },
  snapshot(game) {
    const list = (game.gen && game.gen.merges) ? game.gen.merges : [];
    return list.filter((r) => !r.dead && Math.abs(r.from - game.dist) < 300)
               .map((r) => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(1),
                              lenM: +(r.to - r.from).toFixed(1) }));
  }
};

/* ============================================================================
   Bridge — 崩れる橋（契約§4.5【改訂 v2】/ P7b）の「踏んだ」の記録と警告。
   崩落の時刻規則は MOT.bridge* と bands() が唯一の出所で、ここは
     ・踏んだ距離 o.stepM を記録する（その面を走る体が**足を着けて**橋の板に乗った最初の距離）
     ・HUD の大きな警告「崩れる！離れろ」を出す（踏んでから崩落まで、橋のレーンに居る間）
   だけを受け持つ（同時スイッチの Sync と同じ流儀）。
   ============================================================================ */
const Bridge = {
  /* その体がこの橋の板の上に（足を着けて）いるか */
  onPlanks(o, r, dist) {
    if (r.surface !== o.surface || r.act === 'jump') return false;
    const half = CFG.BODY_D / 2;
    if (dist < MOT.bridgeEntry(o) - half || dist > MOT.bridgeEnd(o) + half) return false;
    const rb = Runners.box(r);
    const x0 = (o.lane - 0.5) * CFG.LANE_W + OBS_INSET, x1 = (o.lane + 0.5) * CFG.LANE_W - OBS_INSET;
    return U.overlap1(rb.x0, rb.x1, x0, x1);
  },
  /* 毎フレーム1回（Game.step から・判定より先）。返り値: いま警告を出すべき橋（無ければ null） */
  update(game) {
    const dist = game.dist;
    let cue = null, cueR = null;
    for (let i = 0; i < game.active.length; i++) {
      const o = game.active[i];
      if (o.type !== 'BRIDGE') continue;
      for (let k = 0; k < game.runners.length; k++) {
        const r = game.runners[k];
        if (game.merged && game.mergeLead && r !== game.mergeLead()) continue;
        if (!Bridge.onPlanks(o, r, dist)) continue;
        if (typeof o.stepM !== 'number') {
          o.stepM = dist;
          o.stepBy = r.id;
          U.sfx('warn', { who: r.id });          // 警告音（大演出の予告と同じ）
        }
        /* 崩落の前で、まだ橋のレーンに居る＝警告 */
        if (dist < MOT.bridgeFallAt(o)) { cue = o; cueR = r; }
      }
    }
    let zone = null;
    if (cueR && game.runnerForZone) {
      zone = (game.runnerForZone('bottom') === cueR) ? 'bottom' : (game.runnerForZone('top') === cueR) ? 'top' : null;
    }
    Bridge.hud(cue, dist, zone);
    return cue;
  },
  hud(o, dist, zone) {
    if (typeof HUD === 'undefined' || !HUD.bridgeCue) return;
    if (!o) { HUD.bridgeCue(null); return; }
    const left = Math.max(0, (MOT.bridgeFallAt(o) - dist) / MOT.bridgeUnit(o));
    /* 世界反転中（P8a）は画面が 180° 回っている＝橋の面もレーンも画面では上下・左右が逆に見える */
    const fl = (typeof Game !== 'undefined' && Game.screenFlipped) ? Game.screenFlipped() : false;
    const vs = fl ? ((o.surface === 'floor') ? 'ceil' : 'floor') : o.surface;
    HUD.bridgeCue({ left: left, surface: vs, zone: zone, lane: fl ? -o.lane : o.lane });
  },
  /* テスト・監査の窓口 */
  snapshot(game) {
    return game.active.filter((o) => o.type === 'BRIDGE').map((o) => ({
      at: +o.at.toFixed(1), lane: o.lane, surface: o.surface,
      entry: +MOT.bridgeEntry(o).toFixed(1), end: +MOT.bridgeEnd(o).toFixed(1),
      stepM: (typeof o.stepM === 'number') ? +o.stepM.toFixed(2) : null,
      fallAt: isFinite(MOT.bridgeFallAt(o)) ? +MOT.bridgeFallAt(o).toFixed(2) : null
    }));
  }
};

/* ============================================================================
   Rock — 転がる丸岩（契約§4.5【新・遺跡】/ P7b）の予告の音。
   位置と判定は MOT.rollLane / bands が唯一の出所。ここは「転がってくる音」を
   到達の CFG.ROCK.CUE_T 秒前に1回だけ鳴らす（音は演出・判定には無関係）。
   ============================================================================ */
const Rock = {
  update(game) {
    const sp = Math.max(4, game.speed || CFG.SPEED_MIN);
    for (let i = 0; i < game.active.length; i++) {
      const o = game.active[i];
      if (o.type !== 'ROCK' || o._cued) continue;
      const rel = o.at - game.dist;
      if (rel > 0 && rel <= sp * CFG.ROCK.CUE_T) { o._cued = true; U.sfx('rock'); }
    }
  }
};

const Obstacles = {
  SIDES: ['floor', 'ceil'],
  /* 障害物インスタンスを作る（at = 障害物の中心距離 m） */
  make(type, surface, lane, at, spawnDist, params) {
    const t = OBS[type];
    return {
      uid: (Obstacles._uid = (Obstacles._uid || 0) + 1),
      type: type,
      surface: t.both ? 'both' : surface,   // 'floor' | 'ceil' | 'both'
      lane: lane,
      span: t.span,
      at: at,
      spawnDist: spawnDist,                 // 生成した瞬間の走行距離（視認距離テスト用）
      params: params || null,
      view: null
    };
  },

  /* そのレーン範囲 [lo,hi] */
  laneLo(o) { return o.lane; },
  laneHi(o) { return o.lane + o.span - 1; },
  laneCovers(o, lane) { return lane >= Obstacles.laneLo(o) && lane <= Obstacles.laneHi(o); },

  /* --------------------------------------------------------------------------
     塞いでいる帯（x区間 × y区間）の配列。**判定・見た目・ボットの唯一の出所**。
     静止した障害物は1枚、回転レーザーは腕の下の「光のカーテン」を刻んだ複数枚。
     点滅が OFF の間は空配列＝完全に無害（通り抜けられる）。
     -------------------------------------------------------------------------- */
  _bb: [],
  bands(o, dist, out) {
    out = out || [];
    out.length = 0;
    const t = OBS[o.type];
    if (!MOT.blinkOn(o, dist)) return out;                 // 点滅 OFF
    const ceil = (o.surface === 'ceil');
    const put = (x0, x1, y0, y1) => {
      if (x1 - x0 <= 1e-6) return;
      out.push(ceil ? { x0: x0, x1: x1, y0: CFG.H - y1, y1: CFG.H - y0 }
                    : { x0: x0, x1: x1, y0: y0, y1: y1 });
    };

    if (t.pad || t.ghost) return out;                      // 踏み板・ゲート・粒子は当たらない

    if (t.motion === 'sync') {
      /* 同時スイッチの橋（契約§4.5）: 成功していれば橋が架かっている＝完全に無害。
         成否が決まる前・失敗したあとは谷（抜けた床＋折れた橋脚）。
         ＝ 成否の規則は Sync の1か所だけで、ここはその結果を読むだけ。 */
      if (o.grp && o.grp.ok === true) return out;
      put((o.lane - 0.5) * CFG.LANE_W + OBS_INSET, (o.lane + 0.5) * CFG.LANE_W - OBS_INSET, t.y0, t.y1);
      return out;
    }

    if (t.motion === 'bridge') {
      /* 崩れる橋（契約§4.5 改訂 v2）: 崩落（踏んだ距離 + 2.0秒ぶん）より手前では板があるので
         無害。そこから先は「崩落した橋」の帯（落ちた板の穴）。時刻の規則はこの2行がすべて。
         帯の奥行きは zWin（踏み口〜終わり）が受け持つ＝崩落後に橋の上に居れば死ぬ。 */
      if (dist < MOT.bridgeFallAt(o) - 1e-9) return out;
      put((o.lane - 0.5) * CFG.LANE_W + OBS_INSET, (o.lane + 0.5) * CFG.LANE_W - OBS_INSET, t.y0, t.y1);
      return out;
    }

    if (t.motion === 'shard') {
      /* 割れた鏡の床（契約§4.4 S7）: 全幅が抜けていて、**揺れる鏡片1枚ぶんの幅だけ**が
         足場。足場の外は GAP と同じ寸法の穴＝跳べば越えられる。
         足場の位置は到達時刻の位置（MOT.shardLane）＝譜面に書いたレーン。 */
      const sx = MOT.shardLane(o, dist) * CFG.LANE_W, hw = CFG.SHARD.HW;
      const lim = CFG.HALF_W;
      put(-lim, Math.min(lim, sx - hw), t.y0, t.y1);
      put(Math.max(-lim, sx + hw), lim, t.y0, t.y1);
      return out;
    }

    if (t.motion === 'roll') {
      /* 転がる丸岩（契約§4.5 新・遺跡）: 今この距離の球の位置に、幅 2R の帯を1枚。
         コリドーの外（壁の向こう）に居る間は当たらない。 */
      const x = MOT.rollLane(o, dist) * CFG.LANE_W, hw = t.hw;
      const lim = CFG.HALF_W;
      const x0 = Math.max(-lim, x - hw), x1 = Math.min(lim, x + hw);
      if (x1 > x0) put(x0, x1, t.y0, t.y1);
      return out;
    }

    if (t.motion === 'hscan') {
      /* 横ビーム（契約§4.5 / S6）: 到達時刻の高さに全幅の帯を1枚。
         絶対 y なので床と天井の両方に同じ1枚が効く（both 型）。 */
      const y = MOT.hbeamY(o, dist), hh = CFG.NET.BEAM_HH;
      const lo = Obstacles.laneLo(o), hi = Obstacles.laneHi(o);
      put((lo - 0.5) * CFG.LANE_W + OBS_INSET, (hi + 0.5) * CFG.LANE_W - OBS_INSET, y - hh, y + hh);
      return out;
    }

    if (t.motion === 'diag') {
      /* 斜めビーム（契約§4.5 / S6）: 床側の柱と天井側の柱の2枚。
         **面ごとに別のレーンが塞がる**（床は f、天井は c）。 */
      const d = MOT.diagLanes(o, dist), hw = CFG.NET.BEAM_HW, E = CFG.NET.DIAG_END;
      const fx = d.f * CFG.LANE_W, cx = d.c * CFG.LANE_W;
      const lim = CFG.HALF_W - 0.02;
      const clip = (x0, x1) => ({ a: Math.max(x0, -lim), b: Math.min(x1, lim) });
      const f = clip(fx - hw, fx + hw), c = clip(cx - hw, cx + hw);
      if (f.b > f.a) out.push({ x0: f.a, x1: f.b, y0: -0.02, y1: E });
      if (c.b > c.a) out.push({ x0: c.a, x1: c.b, y0: CFG.H - E, y1: CFG.H + 0.02 });
      return out;
    }

    if (t.motion === 'rot') {
      /* 面に据えた発振器（hub）から伸びる腕。腕の下は面まで届く光のカーテン。
         ＝ どのレーンでも「面から yhi まで」が塞がる（浮いた帯は作らない）。 */
      const R = CFG.LASER.ROT_R, half = CFG.LASER.ROT_W / 2;
      const th = MOT.rotTheta(o, dist);
      const hubX = o.lane * CFG.LANE_W;
      const ex = hubX + R * Math.cos(th), ey = R * Math.sin(th);
      const lim = CFG.HALF_W - OBS_INSET;
      let xa = Math.min(hubX, ex), xb = Math.max(hubX, ex);
      xa = Math.max(xa, -lim); xb = Math.min(xb, lim);
      const yAt = (x) => {
        if (Math.abs(ex - hubX) < 1e-6) return ey;
        return U.clamp(ey * (x - hubX) / (ex - hubX), 0, CFG.H);
      };
      if (xb - xa < CFG.LASER.ROT_W) {                     // ほぼ真上＝1レーンを全高で塞ぐ
        const c = U.clamp((xa + xb) / 2, -lim + half, lim - half);
        put(c - half, c + half, -0.02, Math.min(CFG.H, ey + half));
        return out;
      }
      const n = CFG.LASER.ROT_SLATS;
      for (let i = 0; i < n; i++) {
        const x0 = xa + (xb - xa) * i / n, x1 = xa + (xb - xa) * (i + 1) / n;
        const yh = Math.min(CFG.H, Math.max(yAt(x0), yAt(x1)) + half);
        put(x0, x1, -0.02, yh);
      }
      return out;
    }

    /* 1枚もの（静止 / 横スキャン） */
    let lo, hi;
    if (t.motion === 'scan') { const c = MOT.scanLane(o, dist); lo = c; hi = c + t.span - 1; }   // サメは2レーン幅
    else { lo = Obstacles.laneLo(o); hi = Obstacles.laneHi(o); }
    put((lo - 0.5) * CFG.LANE_W + OBS_INSET, (hi + 0.5) * CFG.LANE_W - OBS_INSET, t.y0, t.y1);
    return out;
  },

  /* 奥行き方向の窓（2体は常に z=0。dist が at に近いときだけ重なる）。
     lead 型（崩れる橋）は板のぶんだけ手前（＝+z 側）へ窓を伸ばす。
     ＝ 板に乗っている間も「この障害物の中にいる」とみなせるので、
        踏んだ瞬間から落ちる瞬間までを1つの実体で扱える。 */
  zWin(o, dist) {
    const t = OBS[o.type], zc = -(o.at - dist);
    /* スイッチのパッドだけは「秒」で長さが決まる（速度が上がっても踏む時間は同じ） */
    if (t.pad) {
      const d = Sync.unitOf(o) * CFG.SYNC.PAD_T;
      return { z0: zc - d / 2, z1: zc + d / 2 };
    }
    const ex = Obstacles.extent(o);
    return { z0: zc - t.depth / 2 - ex.fwd, z1: zc + t.depth / 2 + ex.back };
  },
  /* 判定の奥行きが at の前後へ伸びる距離（long 型＝崩れる橋）。**ここが唯一の出所**。
     back … at より手前（踏み口まで）／ fwd … at より奥（橋の終わりまで）。
     判定の近傍の絞り込み（Game.collide・ボット）・寿命・見た目の出し入れがここを読む。 */
  _ex0: { back: 0, fwd: 0 },
  extent(o) {
    if (!OBS[o.type].long) return Obstacles._ex0;
    return { back: MOT.bridgeLead(o), fwd: MOT.bridgeTail(o) };
  },
  /* dist が「この障害物の判定に触れうる距離」か（pad = 体の奥行きなどの余裕） */
  near(o, dist, pad) {
    const ex = Obstacles.extent(o);
    return (o.at - dist <= pad + ex.back) && (dist - o.at <= pad + ex.fwd);
  },

  /* 当たり判定ボックス（bands の外接。見た目監査・デバッグ用の互換窓口） */
  box(o, dist) {
    const bs = Obstacles.bands(o, dist, Obstacles._bb);
    const z = Obstacles.zWin(o, dist);
    if (!bs.length) return { x0: 0, x1: 0, y0: -999, y1: -999, z0: z.z0, z1: z.z1 };
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < bs.length; i++) {
      if (bs[i].x0 < x0) x0 = bs[i].x0;
      if (bs[i].x1 > x1) x1 = bs[i].x1;
      if (bs[i].y0 < y0) y0 = bs[i].y0;
      if (bs[i].y1 > y1) y1 = bs[i].y1;
    }
    return { x0: x0, x1: x1, y0: y0, y1: y1, z0: z.z0, z1: z.z1 };
  },

  /* 体（AABB）が今この障害物に当たっているか。**当たり判定はここだけ** */
  hits(o, rbox, dist) {
    const z = Obstacles.zWin(o, dist);
    if (!U.overlap1(rbox.z0, rbox.z1, z.z0, z.z1)) return false;
    const bs = Obstacles.bands(o, dist, Obstacles._bb);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (U.overlap1(rbox.x0, rbox.x1, b.x0, b.x1) && U.overlap1(rbox.y0, rbox.y1, b.y0, b.y1)) return true;
    }
    return false;
  },

  /* この障害物はこの面を走るキャラに効くか */
  affects(o, surface) { return o.surface === 'both' || o.surface === surface; },

  /* 路面タイルを消す区間（穴の下は空洞・崩れる橋の下は谷）。World.syncCorridor が読む。
     null なら路面はそのまま。区間は **距離 m** で返す。 */
  holeSpan(o, dist) {
    if (o.type === 'BRIDGE') {
      /* 橋の区間（踏み口〜終わり）は路面の代わりに橋の板を渡す */
      return { from: MOT.bridgeEntry(o) - 0.5, to: MOT.bridgeEnd(o) + 0.5 };
    }
    /* 同時スイッチ: 成功していれば橋が架かるので路面はそのまま。失敗なら谷 */
    if (o.type === 'SYNCGAP') {
      if (o.grp && o.grp.ok === true) return null;
      return { from: o.at - OBS.SYNCGAP.depth / 2, to: o.at + OBS.SYNCGAP.depth / 2 };
    }
    /* 割れた鏡の床（契約§4.4 S7）: その面の路面が **3レーンとも** 抜ける。
       足場（揺れる鏡片）は障害物のビューが描くので、路面は残さない。 */
    if (o.type === 'SHARDGAP') {
      return { from: o.at - OBS.SHARDGAP.depth / 2, to: o.at + OBS.SHARDGAP.depth / 2,
               side: o.surface, lanes: CFG.LANES };
    }
    return null;
  },

  /* --------------------------------------------------------------------------
     occ — **到達時（dist = o.at）の占有**。契約§4.5「ボットは到達時刻の位置で判断」。
     判定（hits）と同じ bands を、通過窓の全域でなめて
     「そのレーンでその動作をしたら生き残れるか」を面ごと・レーンごとに出す。
     Fair（不変条件）・Bot（自動プレイヤー）・動作比率がこの1か所を読む。

     ・ジャンプの“届く高さ”は CFG.OCC.JUMP_T（ボットの実際の踏切）で測る。
     ・運動は at からの相対距離だけで決まるので、結果は at に依存しない
       → 型・面・レーン・params をキーにして使い回せる（生成器が何度も試すため）。
     -------------------------------------------------------------------------- */
  _occCache: {},
  _occKey(o) {
    return o.type + '|' + o.surface + '|' + o.lane + '|' + (o.params ? JSON.stringify(o.params) : '');
  },
  occ(o) {
    const key = Obstacles._occKey(o);
    const hit = Obstacles._occCache[key];
    if (hit) return hit;
    /* 同時スイッチの橋は **必ず「踏み損ねた側」** で測る（planning は最悪値で見る）。
       ＝ 生成器・ボット・不変条件は「橋が架からなかったとき」でも通れる道を要求する。 */
    /* 崩れる橋も **最悪値**（踏み口で踏んだ）で測る（Obstacles._plan → MOT.bridgeStep）。 */
    const grp = o.grp;
    o.grp = null;
    const plan0 = Obstacles._plan;
    Obstacles._plan = true;
    try { return Obstacles._occCalc(o, key); } finally { o.grp = grp; Obstacles._plan = plan0; }
  },
  /* planning（最悪値で測る）中か。occ の間だけ true */
  _plan: false,
  _occCalc(o, key) {
    const t = OBS[o.type];
    const moving = !!(t.motion || (o.params && o.params.blink));
    const K = moving ? CFG.OCC.SAMPLES : 1;
    const W = (t.depth + CFG.BODY_D) / 2 + CFG.OCC.PAD;
    const ACTS = [['run', 0], ['jump', CFG.OCC.JUMP_T]];
    const res = {};
    Obstacles.SIDES.forEach((side) => {
      const lanes = {};
      CFG.LANES.forEach((l) => { lanes[l] = { run: true, jump: true }; });
      res[side] = { lanes: lanes, any: false, safe: [] };
    });
    const bands = [];
    for (let i = 0; i < K; i++) {
      const dd = o.at + (K === 1 ? 0 : (-W + 2 * W * i / (K - 1)));
      Obstacles.bands(o, dd, bands);
      if (!bands.length) continue;
      const dz = dd - o.at;
      for (let si = 0; si < Obstacles.SIDES.length; si++) {
        const side = Obstacles.SIDES[si];
        for (let li = 0; li < CFG.LANES.length; li++) {
          const lane = CFG.LANES[li];
          const acts = res[side].lanes[lane];
          for (let ai = 0; ai < ACTS.length; ai++) {
            const a = ACTS[ai][0];
            if (!acts[a]) continue;
            /* その動作の体の奥行きで、通過窓の中かどうかを正確に見る */
            if (K > 1 && Math.abs(dz) >= (t.depth + CFG.BODY_D) / 2) continue;
            const rb = Runners.boxOf(side, lane, a, ACTS[ai][1]);
            for (let bi = 0; bi < bands.length; bi++) {
              const b = bands[bi];
              if (U.overlap1(rb.x0, rb.x1, b.x0, b.x1) && U.overlap1(rb.y0, rb.y1, b.y0, b.y1)) { acts[a] = false; break; }
            }
          }
        }
      }
    }
    /* pit 型（崩れる橋）: 帯は穴で、跳んでも穴の中へ着地する（崩落は 1.0秒続く）。
       ＝ 跳躍は逃げ道にならない（通過の瞬間だけ見ると跳べば当たらないが、それは錯覚） */
    if (t.pit) {
      Obstacles.SIDES.forEach((side) => {
        CFG.LANES.forEach((l) => {
          const a = res[side].lanes[l];
          if (!a.run) a.jump = false;
        });
      });
    }
    Obstacles.SIDES.forEach((side) => {
      const r = res[side];
      CFG.LANES.forEach((l) => {
        const a = r.lanes[l];
        if (!a.run) {
          r.any = true;
          if (a.jump && r.safe.indexOf('jump') < 0) r.safe.push('jump');
        }
      });
    });
    Obstacles._occCache[key] = res;
    return res;
  },
  /* そのレーンに居たまま生き残れる動作（到達時） */
  laneActs(o, side, lane) { return Obstacles.occ(o)[side].lanes[lane]; },
  /* そのレーンを塞いでいるか（到達時） */
  blocksLane(o, side, lane) { return !Obstacles.occ(o)[side].lanes[lane].run; },
  /* この面に対して要求する動作。'none' | 'jump' | 'lane' */
  demand(o, side) {
    if (!Obstacles.affects(o, side)) return 'none';
    const r = Obstacles.occ(o)[side];
    if (!r.any) return 'none';
    if (r.safe.indexOf('jump') >= 0) return 'jump';
    return 'lane';
  },
  /* そのレーンに居たまま生き残れる動作の一覧（[] なら必ずレーン移動） */
  safeActs(o) { return OBS[o.type].safe; },

  /* ==========================================================================
     見た目（契約§4.3 v2「同じ仕組みは全ステージで同じ見た目」）
     ・**当たり判定（OBS）は不変**。見た目は js/obstacle_skin.js の共通1セットだけ
       （ゾーン別スキンは 2026-09-24 に失効）。
     ・寸法は必ず OBS テーブルの y0/y1/depth/span から引く（ズレ ±10% 以内）。
     ・箱を積む → 同じ材質どうしを1つのジオメトリへ融合する、という足場はここに置き、
       スキンは build(type, x) / buildMoving(type, g, w, t, x) を書くだけでよい。
     ・点滅灯は「そのビュー専用のマテリアル」を持ち、障害物の at を位相にして
       個体ごとにばらばらに明滅する（プールで使い回しても位相が飛ばない）。
     ========================================================================== */
  _mat: {},
  _pool: {},
  _matNS: '',
  skin() { return ObstacleSkin; },
  skinId() { return ObstacleSkin.id; },
  get COL() { return ObstacleSkin.COL; },

  _material(key, color, opacity) {
    const k = Obstacles.skinId() + '|' + Obstacles._matNS + key;
    if (!Obstacles._mat[k]) {
      Obstacles._mat[k] = (opacity === undefined)
        ? new THREE.MeshLambertMaterial({ color: color, fog: true })
        : new THREE.MeshBasicMaterial({ color: color, fog: true, transparent: true, opacity: opacity, depthWrite: opacity > 0.75 });
    }
    return Obstacles._mat[k];
  },
  /* 光る警告色（霧を掛けない＝遠くからでも背景より明るく浮く / 契約§5「輝度差 +40」）。
     P5c の実測: 霧を掛けると 48m で輝度差が半分に潰れた。 */
  /* 露出（ゾーンの PAL.obstacleTone / P7c）: 白い空間（S1）では白い壁・白い縞が背景に溶けるので、
     障害物の光る部分を同じ色相のまま一段暗く描く（形・配色は共通デザインのまま＝ゾーン別スキンではない）。
     Zones._mount が切替のたびに入れる。プールはゾーン切替で空になるので、次に建てる見た目から効く。 */
  tone: 1,
  _glow(key, color, opacity) {
    const tn = Obstacles.tone || 1;
    const k = Obstacles.skinId() + '|G' + (tn !== 1 ? 't' + tn + ':' : '') + key;
    if (!Obstacles._mat[k]) {
      const col = (tn !== 1) ? new THREE.Color(color).multiplyScalar(tn).getHex() : color;
      Obstacles._mat[k] = (opacity === undefined)
        ? new THREE.MeshBasicMaterial({ color: col, fog: false })
        : new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: true, opacity: opacity,
                                        depthWrite: false });
    }
    return Obstacles._mat[k];
  },
  _emissive(key, color) {
    const k = Obstacles.skinId() + '|E' + Obstacles._matNS + key;
    if (!Obstacles._mat[k]) Obstacles._mat[k] = new THREE.MeshBasicMaterial({ color: color, fog: true });
    return Obstacles._mat[k];
  },

  /* 見た目の変種（旧コアの寄り親）は失効。プールの鍵の互換のために残す */
  variantOf(o) { return ''; },

  _build(type, variant) {
    const skin = Obstacles.skin();
    const t = OBS[type];
    const C = skin.COL;
    const g = new THREE.Group();
    g.userData = { blink: [], spin: [], beam: [], mark: null, arm: null, slats: null };
    /* 点滅レーザーで「消える」部分の材質。マージ後に該当メッシュを userData.beam に拾う */
    const beamMats = [];
    const beamMat = (m) => { if (beamMats.indexOf(m) < 0) beamMats.push(m); return m; };
    /* 判定の外の装飾に使う材質（P5c の視認性の骨格）。融合後のメッシュに
       userData.deco を立て、見た目と判定のズレ検査から外せるようにする。 */
    const decoMats = [];
    const w = (t.span * CFG.LANE_W) - OBS_INSET * 2;     // 判定と同じ幅
    const D = t.depth;                                    // 判定と同じ奥行き
    /* 箱を置く小道具（x,y,z は障害物ローカル。床面 y=0 が基準）。
       ここでは積むだけで、最後に **同じマテリアルの箱を1つのジオメトリへ融合** する
       （1障害物あたりのドローコールを「使った材質の数」まで落とす / 契約 §3 の300以下）。 */
    const parts = [];
    const box = (gw, gh, gd, mat, x, y, z, rot) => {
      parts.push({ mat: mat, g: new THREE.BoxGeometry(gw, gh, gd),
                   p: [x || 0, y || 0, z || 0],
                   r: rot ? [rot[0] || 0, rot[1] || 0, rot[2] || 0] : [0, 0, 0] });
    };
    /* 箱以外の素材を積む（円柱・円錐など。遺跡の柱や壺に使う） */
    const solid = (geo, mat, x, y, z, rot, scl) => {
      parts.push({ mat: mat, g: geo, p: [x || 0, y || 0, z || 0],
                   r: rot ? [rot[0] || 0, rot[1] || 0, rot[2] || 0] : [0, 0, 0],
                   s: scl ? [scl[0], scl[1], scl[2]] : [1, 1, 1] });
    };
    /* 警告灯。**同じ色の灯は1メッシュに融合する**（明滅の位相は1障害物で共通なので
       色ごとに1つの材質で足りる）。1障害物あたり2〜4ドローコールを1〜2へ落とす
       （契約§3 ドローコール300以下 / 2026-09-22 P3b）。 */
    const lampParts = [];
    const lamp = (r, color, x, y, z) => {
      lampParts.push({ r: r, color: color, p: [x || 0, y || 0, z || 0] });
      return null;
    };
    const buildLamps = () => {
      const byColor = [];
      for (let i = 0; i < lampParts.length; i++) {
        const p = lampParts[i];
        let b = null;
        for (let k = 0; k < byColor.length; k++) if (byColor[k].color === p.color) { b = byColor[k]; break; }
        if (!b) { b = { color: p.color, list: [] }; byColor.push(b); }
        b.list.push({ g: new THREE.SphereGeometry(p.r, 6, 4), p: p.p });
      }
      for (let k = 0; k < byColor.length; k++) {
        const mat = new THREE.MeshBasicMaterial({ color: byColor[k].color, fog: true });
        const m = new THREE.Mesh(ZoneKit.merge(byColor[k].list), mat);
        byColor[k].list.forEach((q) => q.g.dispose());
        g.add(m);
        g.userData.blink.push({ mesh: m, mat: mat, color: new THREE.Color(byColor[k].color) });
      }
      lampParts.length = 0;
    };
    /* 危険を示す斜めの縞。板の上に小さな箱を並べて彫る */
    const stripes = (gw, gh, z, y, n) => {
      for (let i = 0; i < n; i++) {
        const x = -gw / 2 + gw * (i + 0.5) / n;
        box(gw / n * 0.55, gh, 0.03, Obstacles._emissive('warn', C.warn), x, y, z, [0, 0, 0.5]);
      }
    };
    /* 崩れる橋の骨組み（契約§4.5【改訂 v2】・§4.3 の色＝赤/橙/白）。
       板・谷・縁は **z方向の長さ1の部品** で作り、place() が実寸（踏み口〜終わり＝3.0秒ぶん）へ
       伸ばす（プールで使い回すため）。板は N 枚が別々に震えて落ちる＝材質ごとの InstancedMesh。
       縁（手すり）はビュー専用の材質: 未踏＝橙 → 踏んだ＝赤の点滅 → 崩落＝赤。 */
    const bridge = (mats) => {
      const n = 12;
      const own = [];
      const pit = new THREE.Group();
      pit.add(new THREE.Mesh(ZoneKit.merge([
        { g: new THREE.BoxGeometry(w + 0.5, 0.06, 1), p: [0, -1.62, 0] },
        { g: new THREE.BoxGeometry(0.06, 1.7, 1), p: [-(w / 2 + 0.24), -0.8, 0] },
        { g: new THREE.BoxGeometry(0.06, 1.7, 1), p: [w / 2 + 0.24, -0.8, 0] }
      ]), mats.pit));
      if (mats.deep) {
        const gl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.05, 1), mats.deep);
        gl.position.y = -1.56;
        pit.add(gl);
      }
      /* 崩落した後の「赤い縁」（穴の両脇の縁が赤く光る＝ここは落ちる） */
      const rimMat = new THREE.MeshBasicMaterial({ color: C.red, fog: false });
      own.push(rimMat);
      const rim = new THREE.Mesh(ZoneKit.merge([
        { g: new THREE.BoxGeometry(0.10, 0.05, 1), p: [-(w / 2 + 0.12), 0.03, 0] },
        { g: new THREE.BoxGeometry(0.10, 0.05, 1), p: [w / 2 + 0.12, 0.03, 0] }
      ]), rimMat);
      rim.visible = false;
      pit.add(rim);
      g.add(pit);
      const plankIMs = [];
      const addIM = (geo, mat) => {
        if (!mat) return null;
        const im = new THREE.InstancedMesh(geo, mat, n);
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        g.add(im);
        plankIMs.push(im);
        return im;
      };
      /* 板（白い石板）＋板の下の梁（暗色）＋板の両端の縁（ビュー専用の橙→赤） */
      addIM(ZoneKit.merge([{ g: new THREE.BoxGeometry(w, 0.14, 1), p: [0, -0.07, 0] }]), mats.slab);
      addIM(ZoneKit.merge([{ g: new THREE.BoxGeometry(w * 0.30, 0.12, 1), p: [0, -0.20, 0] }]), mats.beam);
      const edgeMat = new THREE.MeshBasicMaterial({ color: C.orange, fog: false });
      own.push(edgeMat);
      addIM(ZoneKit.merge([
        { g: new THREE.BoxGeometry(0.08, 0.10, 1), p: [-(w / 2 - 0.04), 0.03, 0] },
        { g: new THREE.BoxGeometry(0.08, 0.10, 1), p: [w / 2 - 0.04, 0.03, 0] }
      ]), edgeMat);
      /* 踏み口の標示（判定の外＝体には当たらない / 見た目と判定のズレ検査でも BRIDGE は例外） */
      const mark = new THREE.Group();
      mark.add(new THREE.Mesh(ZoneKit.merge([
        { g: new THREE.BoxGeometry(w + 0.18, 0.08, 0.30), p: [0, 0.04, 0] }
      ]), edgeMat));
      mark.add(new THREE.Mesh(ZoneKit.merge([
        { g: new THREE.BoxGeometry(0.12, 0.50, 0.12), p: [-(w / 2 + 0.08), 0.25, 0] },
        { g: new THREE.BoxGeometry(0.12, 0.50, 0.12), p: [w / 2 + 0.08, 0.25, 0] }
      ]), mats.post || mats.beam));
      g.add(mark);
      g.userData.bridge = { pit: pit, rim: rim, ims: plankIMs, mark: mark, n: n,
                            edge: edgeMat, mats: own, dummy: new THREE.Object3D() };
      g.userData.bridgeMats = own;
    };
    /* ------------------------------------------------------------------------
       S4 の新ギミックの骨組み（ゾーン共通・2026-09-22 P3b）
       崩れる橋 bridge() と同じ考え方。**動く部分は必ずここで作る**ので、
       スキンが用意していないゾーン（エンドレスでネオンに混ざる等）でも
       見た目と判定がずれない。スキンは色（mats）を渡すだけでよい。
       ------------------------------------------------------------------------ */
    /* 同時スイッチのパッド: 長さ1で作り、place() が「0.36秒ぶん」へ z を伸ばす */
    const padKit = (mats) => {
      mats = mats || {};
      const own = [];
      const emis = (col) => { const m = new THREE.MeshBasicMaterial({ color: col, fog: true }); own.push(m); return m; };
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.05, 1), p: [0, 0.025, 0] },
        { g: ZoneKit.box(w + 0.16, 0.08, 0.10), p: [0, 0.04, -0.5] },
        { g: ZoneKit.box(w + 0.16, 0.08, 0.10), p: [0, 0.04, 0.5] }
      ]), mats.stone || Obstacles._material('spStone', C.dark)));
      const litMat = emis(C.warn);
      grp.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w * 0.74, 0.03, 0.86), p: [0, 0.062, 0] },
        { g: ZoneKit.box(w * 0.22, 0.05, 0.22), p: [0, 0.085, 0] },
        { g: ZoneKit.box(0.07, 0.07, 1.0), p: [-(w / 2 - 0.05), 0.06, 0] },
        { g: ZoneKit.box(0.07, 0.07, 1.0), p: [w / 2 - 0.05, 0.06, 0] }
      ]), litMat));
      g.add(grp);
      g.userData.pad = grp;
      g.userData.padLen = 1;
      g.userData.padMats = own;
    };
    /* 同時スイッチの橋: 架かった橋(span) / 予告の輪郭(ghost) / 崩れた谷(wreck) */
    const syncKit = (mats) => {
      mats = mats || {};
      const stone = mats.stone || Obstacles._material('sgStone', C.body);
      const pitM = mats.pit || Obstacles._material('sgPit', C.pit);
      const L = D;                                   // 判定の奥行き（1.60）
      const own = [];
      /* 谷＋折れた橋脚（失敗＝跳んでも越えられない 0〜1.60 をここで見せる） */
      const wreck = new THREE.Group();
      wreck.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w + 0.4, 0.06, L + 0.8), p: [0, -1.56, 0] },
        { g: ZoneKit.box(0.06, 1.6, L + 0.8), p: [-(w / 2 + 0.2), -0.8, 0] },
        { g: ZoneKit.box(0.06, 1.6, L + 0.8), p: [w / 2 + 0.2, -0.8, 0] }
      ]), pitM));
      /* 折れた橋脚（判定 0〜1.60 をそのまま塞ぐ）＝「跳べない・潜れない」が目で分かる形 */
      wreck.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w * 0.94, 1.50, 0.26), p: [0, 0.74, -L * 0.26], r: [0.18, 0, 0.05] },
        { g: ZoneKit.box(w * 0.70, 1.20, 0.24), p: [0.08, 0.58, L * 0.24], r: [-0.26, 0, -0.08] },
        { g: ZoneKit.box(0.24, 1.40, 0.24), p: [-(w / 2 - 0.13), 0.70, L * 0.30], r: [0, 0, 0.16] },
        { g: ZoneKit.box(0.24, 1.10, 0.24), p: [w / 2 - 0.13, 0.55, -L * 0.34], r: [0, 0, -0.12] },
        { g: ZoneKit.box(w * 0.5, 0.30, 0.5), p: [-0.1, 0.16, 0], r: [0.3, 0.4, 0.2] }
      ]), stone));
      const wm = new THREE.MeshBasicMaterial({ color: C.red, fog: true });
      own.push(wm);
      wreck.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w * 0.98, 0.11, 0.14), p: [0, 1.52, -L * 0.26] },
        { g: ZoneKit.box(w * 0.72, 0.09, 0.12), p: [0.08, 1.16, L * 0.24] },
        { g: ZoneKit.box(w, 0.09, 0.12), p: [0, 0.05, -(L / 2 + 0.2)] }
      ]), wm));
      g.add(wreck);
      /* 架かった橋（成功）: 石畳が渡り、縁が光る */
      const span = new THREE.Group();
      span.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.16, L + 0.9), p: [0, -0.08, 0] },
        { g: ZoneKit.box(w + 0.18, 0.10, 0.22), p: [0, 0.02, -(L / 2 + 0.4)] },
        { g: ZoneKit.box(w + 0.18, 0.10, 0.22), p: [0, 0.02, L / 2 + 0.4] }
      ]), stone));
      const sm = new THREE.MeshBasicMaterial({ color: C.cyan, fog: true });
      own.push(sm);
      span.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.07, 0.05, L + 0.8), p: [-(w / 2 - 0.05), 0.03, 0] },
        { g: ZoneKit.box(0.07, 0.05, L + 0.8), p: [w / 2 - 0.05, 0.03, 0] }
      ]), sm));
      g.add(span);
      /* 予告（まだ成否が決まっていない）: 架かるはずの橋の輪郭 */
      const gm = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.26,
                                               depthWrite: false, fog: true });
      own.push(gm);
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.05, L + 0.8), gm);
      ghost.position.y = 0.02;
      ghost.renderOrder = 3;
      g.add(ghost);
      g.userData.sync = { span: span, ghost: ghost, wreck: wreck, ghostMat: gm };
      g.userData.syncMats = own;
    };
    /* ------------------------------------------------------------------------
       S6 の新ギミックの骨組み（ゾーン共通・2026-09-22 P4b）
       ここまでと同じ考え方。スキンは色（mats）を渡すだけでよく、
       スキンが知らないゾーン（エンドレスでネオンに混ざる等）へ出ても壊れない。
       ------------------------------------------------------------------------ */
    /* ゲート（重力反転・無重力・レーザーネットの枠）: コリドーを跨ぐ門。
       当たり判定は持たない＝通るだけ。色で意味を分ける（黄＝重力反転／青＝無重力）。 */
    const gateKit = (mats) => {
      mats = mats || {};
      const own = [];
      const col = (mats.col === undefined) ? C.warn : mats.col;
      const lit = new THREE.MeshBasicMaterial({ color: col, fog: true });
      own.push(lit);
      const frame = mats.frame || Obstacles._material('gtFrame', C.dark);
      const HW = CFG.HALF_W, H = CFG.H;
      g.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.20, H + 0.44, 0.24), p: [-(HW + 0.12), H / 2, 0] },
        { g: ZoneKit.box(0.20, H + 0.44, 0.24), p: [HW + 0.12, H / 2, 0] },
        { g: ZoneKit.box(HW * 2 + 0.44, 0.20, 0.24), p: [0, H + 0.10, 0] },
        { g: ZoneKit.box(HW * 2 + 0.44, 0.20, 0.24), p: [0, -0.10, 0] }
      ]), frame));
      /* 枠の内側を走る色の光（遠くから「何のゲートか」が読める） */
      const ring = new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.08, H + 0.1, 0.28), p: [-(HW + 0.02), H / 2, 0] },
        { g: ZoneKit.box(0.08, H + 0.1, 0.28), p: [HW + 0.02, H / 2, 0] },
        { g: ZoneKit.box(HW * 2, 0.08, 0.28), p: [0, H + 0.01, 0] },
        { g: ZoneKit.box(HW * 2, 0.08, 0.28), p: [0, -0.01, 0] }
      ]), lit);
      g.add(ring);
      /* 記号（重力反転＝上下の矢印／無重力＝浮く輪／ネット＝格子） */
      const mk = [];
      if (type === 'WARPGATE') {
        [[0.62, 1], [H - 0.62, -1]].forEach((q) => {
          mk.push({ g: ZoneKit.box(0.16, 0.66, 0.14), p: [0, q[0], 0.1] });
          mk.push({ g: ZoneKit.box(0.34, 0.34, 0.14), p: [0, q[0] + q[1] * 0.40, 0.1], r: [0, 0, Math.PI / 4] });
        });
      } else if (type === 'ZEROGATE') {
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          mk.push({ g: ZoneKit.box(0.12, 0.12, 0.12), p: [Math.cos(a) * 0.5, H / 2 + Math.sin(a) * 0.5, 0.1] });
        }
      } else if (type === 'MIRGATE') {
        /* 鏡ゾーン（契約§4.5 / S7）: **効くのは置かれた面だけ**なので、
           記号はその面の側（ローカルの下半分）にだけ彫る。天井側のビューは
           place() が Z軸まわりに180度回すので、画面では天井側に出る。
           記号は「左右が入れ替わる」＝向かい合う2本の矢印。 */
        [-1, 1].forEach((s2) => {
          mk.push({ g: ZoneKit.box(0.52, 0.13, 0.12), p: [s2 * 0.34, 0.95, 0.1] });
          mk.push({ g: ZoneKit.box(0.26, 0.26, 0.12), p: [s2 * 0.60, 0.95, 0.1], r: [0, 0, Math.PI / 4] });
        });
        mk.push({ g: ZoneKit.box(0.10, 0.90, 0.12), p: [0, 0.95, 0.1] });
        /* その面を横切る銀の敷居（どちらの面のゲートかが一目で分かる） */
        mk.push({ g: ZoneKit.box(HW * 2, 0.10, 0.22), p: [0, 0.07, 0.08] });
      } else if (type === 'SWAPGATE') {
        /* 入れ替えワープ（契約§4.5 / S7）: 上下が入れ替わる＝交差する2本の矢印 */
        [[0.85, 1], [H - 0.85, -1]].forEach((q) => {
          mk.push({ g: ZoneKit.box(0.14, 0.70, 0.12), p: [q[1] * 0.42, q[0], 0.1], r: [0, 0, q[1] * 0.42] });
          mk.push({ g: ZoneKit.box(0.30, 0.30, 0.12), p: [q[1] * 0.42 + q[1] * 0.28, q[0] - q[1] * 0.34, 0.1],
                    r: [0, 0, Math.PI / 4] });
        });
        mk.push({ g: ZoneKit.box(HW * 2, 0.10, 0.22), p: [0, 0.07, 0.08] });
        mk.push({ g: ZoneKit.box(HW * 2, 0.10, 0.22), p: [0, H - 0.07, 0.08] });
      } else {
        /* レーザーネットの枠: **記号は小さく**（回廊を塞いでいるように見せない）。
           左右の柱に「網」の意匠を貼るだけにする。 */
        [-1, 1].forEach((sx) => {
          for (let i = 0; i < 3; i++) mk.push({ g: ZoneKit.box(0.30, 0.04, 0.12), p: [sx * (HW - 0.18), H * 0.5 + (i - 1) * 0.22, 0.12] });
          for (let i = 0; i < 3; i++) mk.push({ g: ZoneKit.box(0.04, 0.48, 0.12), p: [sx * (HW - 0.18) + (i - 1) * 0.12, H * 0.5, 0.12] });
        });
      }
      const mark = new THREE.Mesh(ZoneKit.merge(mk), lit);
      mark.renderOrder = 3;
      g.add(mark);
      g.userData.gate = { lit: lit, ring: ring, mark: mark, mats: own };
      g.userData.gateMats = own;
    };
    /* 無重力の青い浮遊粒子（契約§4.5「予告は青い浮遊粒子」）。当たり判定なし。
       長さ1で作り、place() が「1秒ぶん」へ伸ばす（海流の帯と同じ流儀）。 */
    const zeroFieldKit = (mats) => {
      mats = mats || {};
      const own = [];
      const m = new THREE.MeshBasicMaterial({ color: mats.col || C.cyan, fog: true,
                                              transparent: true, opacity: 0.8, depthWrite: false });
      own.push(m);
      const N = 14;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), m, N);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.renderOrder = 5;
      g.add(im);
      g.userData.zfield = { mesh: im, n: N, dummy: new THREE.Object3D(), mats: own };
      g.userData.zeroMats = own;
    };
    /* レーザーネットのビーム（横ビーム・斜めビーム）。
       **形は bands() から毎フレーム引く**ので、見た目と判定が構造的にずれない。
       ・beam/halo … 今この瞬間の帯
       ・ghost     … 到達した瞬間（dist = at）の帯＝契約§4.5「薄い予告線」
       ・link      … 斜めビームの床側と天井側をつなぐ光の筋（見た目だけ） */
    const netKit = (mats) => {
      mats = mats || {};
      const own = [];
      /* 材質は白。**帯ごとの色はインスタンスに載せる**（setColorAt）＝
         床の体に当たる帯は琥珀（LUMEN の色）、天井の体に当たる帯は藍（UMBRA の色）、
         どちらにも当たらない帯は白。「誰がよけるのか」が色だけで読める。 */
      const hot = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
      const halo = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true,
                                                 transparent: true, opacity: 0.34, depthWrite: false });
      const ghost = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true,
                                                  transparent: true, opacity: 0.16, depthWrite: false });
      own.push(hot, halo, ghost);
      const N = (type === 'LASER_DIAG') ? 2 : 1;
      const inst = (mat, n, order) => {
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (order !== undefined) im.renderOrder = order;
        g.add(im);
        return im;
      };
      const link = (type === 'LASER_DIAG') ? inst(halo, CFG.NET.SLATS, 3) : null;
      const node = [];
      if (type === 'LASER_DIAG') {
        /* 発振器（床と天井の口金） */
        node.push({ g: ZoneKit.box(0.34, 0.12, 0.42), p: [0, 0.06, 0] });
        node.push({ g: ZoneKit.box(0.34, 0.12, 0.42), p: [0, CFG.H - 0.06, 0] });
      } else {
        node.push({ g: ZoneKit.box(0.16, 0.34, 0.42), p: [-(CFG.HALF_W - 0.06), 0, 0] });
        node.push({ g: ZoneKit.box(0.16, 0.34, 0.42), p: [CFG.HALF_W - 0.06, 0, 0] });
      }
      const nodes = new THREE.Mesh(ZoneKit.merge(node), mats.node || Obstacles._material('ntNode', C.steel));
      g.add(nodes);
      g.userData.net = { beam: inst(hot, N, 4), halo: inst(halo, N, 3), ghost: inst(ghost, N, 2),
                         link: link, n: N, nodes: nodes, dummy: new THREE.Object3D(),
                         col: new THREE.Color(), mats: own };
      g.userData.netMats = own;
    };

    /* ------------------------------------------------------------------------
       S7 の新ギミックの骨組み（ゾーン共通・2026-09-22 P5a）
       ------------------------------------------------------------------------ */
    /* 割れた鏡の床（飛び石）: 裂け目（虚空）と、**揺れる鏡片の足場**。
       足場の位置と幅は place() が bands() から引く＝ 見た目＝判定。
       予告（ghost）は「到達した瞬間の足場」＝譜面に書いた位置。 */
    const shardKit = (mats) => {
      mats = mats || {};
      const own = [];
      const HW = CFG.HALF_W, L = t.depth;
      const pitM = mats.pit || Obstacles._material('sdPit', C.pit);
      const bodyM = mats.body || Obstacles._material('sdBody', C.body);
      const darkM = mats.dark || Obstacles._material('sdDark', C.dark);
      /* 裂け目の底と側面（下は虚空） */
      const pit = new THREE.Group();
      pit.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(HW * 2 + 0.6, 0.06, L + 0.6), p: [0, -1.58, 0] },
        { g: ZoneKit.box(0.06, 1.7, L + 0.6), p: [-(HW + 0.28), -0.8, 0] },
        { g: ZoneKit.box(0.06, 1.7, L + 0.6), p: [HW + 0.28, -0.8, 0] }
      ]), pitM));
      /* 裂け目の縁（割れた鏡の歯） */
      const teeth = [];
      for (let i = 0; i < 12; i++) {
        const px = -HW + (HW * 2) * (i + 0.5) / 12;
        [-1, 1].forEach((s2) => {
          teeth.push({ g: ZoneKit.box(HW * 2 / 12 * 0.8, 0.05, 0.34),
                       p: [px, 0.02 + (i % 3) * 0.03, s2 * (L / 2 - 0.16)],
                       r: [s2 * 0.4, (i % 2 ? 0.2 : -0.2), 0] });
        });
      }
      pit.add(new THREE.Mesh(ZoneKit.merge(teeth), bodyM));
      teeth.forEach((q) => q.g.dispose());
      const edge = new THREE.MeshBasicMaterial({ color: C.warn, fog: true });
      own.push(edge);
      pit.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(HW * 2, 0.06, 0.09), p: [0, 0.03, -(L / 2 - 0.03)] },
        { g: ZoneKit.box(HW * 2, 0.06, 0.09), p: [0, 0.03, L / 2 - 0.03] }
      ]), edge));
      g.add(pit);
      /* 足場（揺れる鏡片）。幅1で作り、place() が CFG.SHARD.HW*2 へ伸ばす */
      const pad = new THREE.Group();
      pad.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(1, 0.10, L + 0.5), p: [0, -0.05, 0] },
        { g: ZoneKit.box(1, 0.05, 0.20), p: [0, 0.02, -(L / 2 + 0.2)] },
        { g: ZoneKit.box(1, 0.05, 0.20), p: [0, 0.02, L / 2 + 0.2] }
      ]), bodyM));
      const rim = new THREE.MeshBasicMaterial({ color: C.cyan, fog: true });
      own.push(rim);
      pad.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.10, 0.045, L + 0.4), p: [-0.45, 0.03, 0] },
        { g: ZoneKit.box(0.10, 0.045, L + 0.4), p: [0.45, 0.03, 0] },
        { g: ZoneKit.box(1, 0.03, L * 0.3), p: [0, 0.03, 0] }
      ]), rim));
      /* 足場の下の支え（浮いていることが分かる） */
      pad.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.7, 0.24, 0.24), p: [0, -0.22, -L * 0.3], r: [0, 0.4, 0.2] },
        { g: ZoneKit.box(0.6, 0.20, 0.20), p: [0, -0.26, L * 0.3], r: [0, -0.3, -0.2] }
      ]), darkM));
      g.add(pad);
      /* 予告: 到達した瞬間の足場の位置（薄い輪郭） */
      const gm = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.22,
                                               depthWrite: false, fog: true });
      own.push(gm);
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, L + 0.6), gm);
      ghost.position.y = 0.16;
      ghost.renderOrder = 3;
      g.add(ghost);
      g.userData.shard = { pad: pad, ghost: ghost, pit: pit, mats: own };
      g.userData.shardMats = own;
    };

    /* 転がる丸岩（契約§4.5 新・遺跡 / P7b）: 赤茶の球＋白いひび（球ごと転がる）。
       予告＝ **転がる影**（コリドーを横切る暗い筋＝通り道と、球の下の影）と **土煙**。
       球の位置・回転は place() が MOT.rollLane から置く（判定と同じ数値）。
       影・筋・土煙は判定の外（deco）。 */
    const rockKit = (mats) => {
      const R = CFG.ROCK.R, yc = CFG.ROCK.TOP - R;
      const ball = new THREE.Group();
      ball.position.y = yc;
      ball.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), mats.body));
      /* 白いひび: 球面に沿った細い筋（球と一緒に回る） */
      const cr = [];
      const up = new THREE.Vector3(0, 0, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      const segs = [[0.3, 0.4, 0.2], [0.9, 1.7, -0.6], [2.1, 0.8, 0.9], [2.8, 2.3, 0.3], [4.0, 1.3, -1.0],
                    [4.9, 2.0, 0.5], [5.6, 0.6, -0.2], [1.5, 2.6, 1.2]];
      segs.forEach((sg, i) => {
        const th = sg[0], ph = sg[1];
        const n = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        /* 接線（法線に直交する向き）へ筋を寝かせる */
        const tg = new THREE.Vector3(-n.z, 0, n.x).normalize().applyAxisAngle(n, sg[2]);
        q.setFromUnitVectors(up, tg);
        const geo = new THREE.BoxGeometry(0.035, 0.035, 0.20 + (i % 3) * 0.07);
        m4.compose(n.clone().multiplyScalar(R * 1.005), q, new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(m4);
        cr.push({ g: geo, p: [0, 0, 0] });
      });
      ball.add(new THREE.Mesh(ZoneKit.merge(cr), mats.crack));
      cr.forEach((c) => c.g.dispose());
      g.add(ball);
      /* 転がる影: 通り道の暗い筋（コリドーの全幅）と、球の下の影 */
      const path = new THREE.Mesh(new THREE.BoxGeometry(CFG.HALF_W * 2, 0.012, D * 0.9), mats.shade);
      path.position.y = 0.008;
      path.userData.deco = true;
      path.renderOrder = 2;
      g.add(path);
      const shadow = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.01, 18), mats.shadow);
      shadow.position.y = 0.014;
      shadow.userData.deco = true;
      shadow.renderOrder = 3;
      g.add(shadow);
      /* 土煙（転がってきた側に巻き上がる。白っぽい粒） */
      const N = 12;
      const dust = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mats.dust, N);
      dust.frustumCulled = false;
      dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      dust.userData.deco = true;
      dust.renderOrder = 4;
      g.add(dust);
      g.userData.rock = { ball: ball, shadow: shadow, path: path, dust: dust, n: N, dummy: new THREE.Object3D() };
    };

    const x = { t: t, C: C, g: g, w: w, D: D, box: box, solid: solid, bridge: bridge, rockKit: rockKit,
                lamp: lamp, stripes: stripes, beamMat: beamMat, parts: parts,
                padKit: padKit, syncKit: syncKit,
                deco: (m) => { if (decoMats.indexOf(m) < 0) decoMats.push(m); return m; },
                gateKit: gateKit, zeroFieldKit: zeroFieldKit, netKit: netKit,
                shardKit: shardKit, variant: variant || '' };
    skin.build(type, x);
    buildLamps();

    /* 材質ごとに融合して1メッシュにする（点滅灯だけは個別マテリアルなので別メッシュのまま） */
    const byMat = [];
    for (let i = 0; i < parts.length; i++) {
      let b = null;
      for (let k = 0; k < byMat.length; k++) if (byMat[k].mat === parts[i].mat) { b = byMat[k]; break; }
      if (!b) { b = { mat: parts[i].mat, list: [] }; byMat.push(b); }
      b.list.push({ g: parts[i].g, p: parts[i].p, r: parts[i].r, s: parts[i].s });
    }
    for (let k = 0; k < byMat.length; k++) {
      const mesh = new THREE.Mesh(ZoneKit.merge(byMat[k].list), byMat[k].mat);
      g.add(mesh);
      if (decoMats.indexOf(byMat[k].mat) >= 0) mesh.userData.deco = true;
      if (beamMats.indexOf(byMat[k].mat) >= 0) g.userData.beam.push(mesh);
      byMat[k].list.forEach((p) => p.g.dispose());
    }
    if (skin.buildMoving) skin.buildMoving(type, g, w, t, x);
    return g;
  },

  /* ゾーンを切り替えるときに、そのスキンの見た目（プール・マテリアル）を全部捨てる。
     判定側（_occCache）はゾーンに依存しないので残す。 */
  disposeSkin(id) {
    const pool = Obstacles._pool[id];
    if (pool) {
      Object.keys(pool).forEach((type) => {
        pool[type].forEach((g) => { if (g.parent) g.parent.remove(g); ZoneKit.free(g); });
      });
      delete Obstacles._pool[id];
    }
    const pre = id + '|';
    Object.keys(Obstacles._mat).forEach((k) => {
      if (k.indexOf(pre) === 0) { Obstacles._mat[k].dispose(); delete Obstacles._mat[k]; }
    });
  },


  /* プールから見た目を取り出す／返す（毎フレーム new しない）。プールはスキンごと。
     **変種（コアの寄り親ゾーン）もプールの鍵に含める**＝使い回しで
     「さっきと違うゾーンの柱」に化けることが構造的に起きない（P5b）。 */
  _poolOf(type, variant) {
    const id = Obstacles.skinId();
    const byType = Obstacles._pool[id] || (Obstacles._pool[id] = {});
    const k = variant ? (type + '#' + variant) : type;
    return byType[k] || (byType[k] = []);
  },
  acquire(type, variant) {
    const v = variant || '';
    const p = Obstacles._poolOf(type, v);
    const g = p.length ? p.pop() : Obstacles._build(type, v);
    g.visible = true;
    g.userData._vk = v;
    return g;
  },
  release(type, g) {
    g.visible = false;
    Obstacles._poolOf(type, (g.userData && g.userData._vk) || '').push(g);
  },
  /* 見た目を現在の距離に合わせて置く（t は点滅灯の位相に使う）。
     **動くもの・点滅するものは必ず MOT / bands() から引く**（判定と同じ数値で描く） */
  place(o, dist, t) {
    const g = o.view;
    if (!g) return;
    const ud = g.userData || {};
    const mot = OBS[o.type].motion;
    const blinkP = o.params && o.params.blink;

    /* 警告灯の明滅。位相は障害物の位置から決めるので、個体ごとにずれる。
       点滅レーザーの予告灯だけは「次に点くまで」で速さが変わる（契約§4.5 予告灯） */
    const bl = ud.blink;
    if (bl && bl.length) {
      let k;
      if (blinkP) {
        const rem = MOT.toNextOn(o, dist);
        k = MOT.blinkOn(o, dist) ? 1
          : (Math.sin(dist * (0.55 + 6 / Math.max(2, rem))) > 0 ? 0.95 : 0.10);
      } else {
        k = (Math.sin((t || 0) * 5.5 + o.at * 0.9) > 0) ? 1 : 0.16;
      }
      for (let i = 0; i < bl.length; i++) bl[i].mat.color.copy(bl[i].color).multiplyScalar(k);
    }
    /* 点滅 OFF の間は光線そのものを消す（＝通り抜けられることが目で分かる） */
    if (blinkP && ud.beam && ud.beam.length) {
      const on = MOT.blinkOn(o, dist);
      for (let i = 0; i < ud.beam.length; i++) ud.beam[i].visible = on;
      if (ud.standby) ud.standby.visible = !on;
    } else if (ud.beam && ud.beam.length) {
      /* プールの使い回しで「消えたまま」にならないよう、点滅しない個体は必ず戻す */
      for (let i = 0; i < ud.beam.length; i++) if (!ud.beam[i].visible) ud.beam[i].visible = true;
      if (ud.standby && ud.standby.visible) ud.standby.visible = false;
    }

    /* 横スキャンは光柱ごと横へ滑る（帯の中心＝ここ） */
    /* 横スキャン（2レーン幅のサメも）は帯の中心、転がる丸岩はコリドーの中心（球は内側で動かす） */
    const xc = (mot === 'scan') ? ((MOT.scanLane(o, dist) + (OBS[o.type].span - 1) / 2) * CFG.LANE_W)
             : (mot === 'roll') ? 0
             : (((Obstacles.laneLo(o) + Obstacles.laneHi(o)) / 2) * CFG.LANE_W);
    g.position.set(xc, 0, -(o.at - dist));
    // 天井側は Z軸まわりに180度回す（X軸まわりだと前後が裏返り、
    // 手前に向けた警告色の面が奥を向いてしまう。負のスケールは表裏が反転するので使わない）
    const ceil = (o.surface === 'ceil');
    /* 大演出（発射台〜滑空）でコリドーごと持ち上がるぶん（見た目だけ・§4.7 に影響なし。
       到達する瞬間は 2体の持ち上がり量と一致するので、判定とのズレは生まれない） */
    const lift = (typeof Setpieces !== 'undefined') ? Setpieces.viewLift(o.at) : 0;
    if (ceil) { g.position.y = CFG.H + lift; g.rotation.set(0, 0, Math.PI); }
    else { g.position.y = lift; g.rotation.set(0, 0, 0); }
    /* ローカル座標への変換（天井側は Z 180度ぶん x が反転する） */
    const lx = (wx) => (ceil ? (xc - wx) : (wx - xc));

    if (OBS[o.type].pad && ud.pad) {
      /* スイッチのパッド: 長さは z窓（＝0.36秒ぶん）と同じにする。
         未踏＝点滅、踏んだ＝点灯、失敗が確定＝赤。相方の状態も縁の色で見せる。 */
      const gp = o.grp, unit = Sync.unitOf(o);
      const L = unit * CFG.SYNC.PAD_T;
      ud.pad.scale.z = L / (ud.padLen || 1);
      const mine = gp ? gp[o.surface] : null;
      const both = gp ? (gp.floor !== null && gp.ceil !== null) : false;
      const col = (gp && gp.ok === false && !both) ? 0xff4a14
                : (mine !== null ? (gp && gp.ok === false ? 0xff7a2a : 0x8fe6c8) : 0xffc14a);
      const blink = (mine !== null) ? 1 : (Math.sin(dist * 0.9 + (t || 0) * 7) > -0.2 ? 1 : 0.28);
      if (ud.padMats) ud.padMats.forEach((m) => { m.color.setHex(col).multiplyScalar(blink); });
    }

    /* ゲート（重力反転・無重力・レーザーネットの枠 / 契約§4.5 S6）:
       当たり判定は持たない。近づくほど速く明滅して「くぐる」ことを予告する。 */
    if (ud.gate) {
      const rem = Math.max(0, o.at - dist);
      const sp = Math.max(4, (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN);
      const near = U.clamp(1 - rem / (sp * CFG.WARP.CUE_T), 0, 1);
      const k = 0.62 + 0.38 * Math.sin(dist * (0.7 + near * 2.2) + (t || 0) * (5 + near * 9));
      const m = ud.gate.lit;
      if (m.__base === undefined) m.__base = m.color.getHex();
      m.color.setHex(m.__base).multiplyScalar(0.55 + 0.45 * k);
      ud.gate.mark.rotation.z = (o.type === 'ZEROGATE') ? (t || 0) * 0.6 : 0;
    }

    /* 無重力の青い浮遊粒子（契約§4.5 / S6）: 面のそばをゆっくり漂う。
       長さは「1秒ぶん」＝海流の帯と同じ流儀。当たり判定は持たない。 */
    if (ud.zfield) {
      const zf = ud.zfield, d2 = zf.dummy;
      const unit = (o.params && o.params.zero && o.params.zero.unitM) || CFG.REF_SPEED;
      const L = unit * CFG.ZEROG.SEG_T;
      for (let i = 0; i < zf.n; i++) {
        const h1 = ZoneKit.hash(i, 601), h2 = ZoneKit.hash(i, 607), h3 = ZoneKit.hash(i, 613);
        const drift = Math.sin((t || 0) * (0.5 + h3) + i * 1.7) * 0.22;
        d2.position.set((h1 - 0.5) * (CFG.HALF_W * 2 - 0.3),
                        0.18 + h2 * 1.1 + drift,
                        (h3 - 0.5) * L);
        d2.rotation.set((t || 0) * (0.3 + h1), (t || 0) * (0.2 + h2), 0);
        d2.scale.setScalar(0.6 + h2 * 1.1);
        d2.updateMatrix();
        zf.mesh.setMatrixAt(i, d2.matrix);
      }
      zf.mesh.instanceMatrix.needsUpdate = true;
    }

    /* レーザーネットのビーム（契約§4.5 / S6）: **bands() の帯をそのまま描く**。
       予告線（ghost）は「到達した瞬間の帯」＝ 譜面に書いた位置そのもの。 */
    if ((mot === 'hscan' || mot === 'diag') && ud.net) {
      const nt = ud.net, dm = nt.dummy;
      const now = Obstacles.bands(o, dist, Obstacles._bb).slice();
      const at = Obstacles.bands(o, o.at, []);
      /* 帯の色＝「誰に当たるか」。走る体（床 0〜0.90 / 天井 3.10〜4.00）に触れるかで決める
         ＝ 判定と同じ数字から引いているので、色と危険が食い違わない。 */
      const hue = (b) => (b.y0 < 0.90 ? 0xffb347 : (b.y1 > CFG.H - 0.90 ? 0x8b9bff : 0xffffff));
      const setAll = (mesh, list, thick) => {
        for (let i = 0; i < nt.n; i++) {
          const b = list[i];
          if (!b) { dm.position.set(0, -9999, 0); dm.scale.set(0.0001, 0.0001, 0.0001); }
          else {
            dm.position.set(lx((b.x0 + b.x1) / 2), (b.y0 + b.y1) / 2, 0);
            dm.scale.set(Math.max(0.02, b.x1 - b.x0), Math.max(0.02, b.y1 - b.y0), thick);
            mesh.setColorAt(i, nt.col.setHex(hue(b)));
          }
          dm.rotation.set(0, 0, 0);
          dm.updateMatrix();
          mesh.setMatrixAt(i, dm.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      };
      setAll(nt.beam, now, OBS[o.type].depth * 0.45);
      setAll(nt.halo, now, OBS[o.type].depth * 1.05);
      setAll(nt.ghost, at, OBS[o.type].depth * 0.22);
      if (nt.link && now.length >= 2) {
        /* 斜めビームの「渡り」: 床側の柱の上端 → 天井側の柱の下端をつなぐ光の筋 */
        const a = now[0], b = now[1];
        const ax = (a.x0 + a.x1) / 2, bx = (b.x0 + b.x1) / 2;
        const n = CFG.NET.SLATS;
        for (let i = 0; i < n; i++) {
          const u0 = i / n, u1 = (i + 1) / n;
          const y0 = U.lerp(a.y1, b.y0, u0), y1 = U.lerp(a.y1, b.y0, u1);
          const xc2 = U.lerp(ax, bx, (u0 + u1) / 2);
          dm.position.set(lx(xc2), (y0 + y1) / 2, 0);
          dm.rotation.set(0, 0, 0);
          dm.scale.set(Math.abs(bx - ax) / n + CFG.NET.BEAM_HW, Math.max(0.02, y1 - y0), OBS[o.type].depth * 0.5);
          dm.updateMatrix();
          nt.link.setMatrixAt(i, dm.matrix);
          /* 渡りは床側の琥珀 → 天井側の藍へ移る（どちらの持ち場かが繋がって見える） */
          nt.link.setColorAt(i, nt.col.setHex(0xffb347).lerp(new THREE.Color(0x8b9bff), (u0 + u1) / 2));
        }
        nt.link.instanceMatrix.needsUpdate = true;
        if (nt.link.instanceColor) nt.link.instanceColor.needsUpdate = true;
      }
    }

    /* 割れた鏡の床（契約§4.4 S7）: 足場は **判定と同じ MOT.shardLane** の位置へ。
       予告（ghost）は「到達した瞬間の足場」＝譜面に書いた位置。 */
    if (mot === 'shard' && ud.shard) {
      const sd = ud.shard, W2 = CFG.SHARD.HW * 2;
      const now = MOT.shardLane(o, dist) * CFG.LANE_W;
      const at2 = MOT.shardLane(o, o.at) * CFG.LANE_W;
      sd.pad.position.x = lx(now);
      sd.pad.scale.x = W2;
      sd.ghost.position.x = lx(at2);
      sd.ghost.scale.x = W2 + 0.12;
      if (sd.mats) sd.mats.forEach((m) => {
        if (m.__base === undefined) m.__base = m.opacity;
        if (m.transparent) m.opacity = m.__base * (0.7 + 0.3 * Math.sin(dist * 0.7 + (t || 0) * 4));
      });
    }

    if (mot === 'sync' && ud.sync) {
      /* 同時スイッチの橋: 成否が決まると「橋が架かる／崩れ落ちる」。
         見た目の進み具合も **距離の関数**（成否が決まった距離 okM から SHOW_T 秒） */
      const gp = o.grp, unit = Sync.unitOf(o);
      const k = (gp && gp.ok !== null)
        ? U.clamp((dist - gp.okM) / Math.max(1e-6, unit * CFG.SYNC.SHOW_T), 0, 1) : 0;
      const built = !!(gp && gp.ok === true);
      const s = ud.sync;
      /* 成功: 橋が下からせり上がって架かる。失敗/未確定: 折れた橋脚の谷のまま */
      s.span.visible = built;
      s.span.position.y = built ? U.lerp(-1.5, 0, U.smooth(k)) : -1.5;
      s.wreck.visible = !built;
      /* 未確定のあいだは「ここに架かるはず」の輪郭を薄く出す（予告）。
         失敗が決まったら消える＝橋が崩れたことが目で分かる。 */
      s.ghost.visible = !built && (gp === undefined || !gp || gp.ok === null || k < 1);
      if (s.ghostMat) {
        s.ghostMat.opacity = (!gp || gp.ok === null)
          ? 0.16 + 0.14 * (Math.sin(dist * 0.55) > 0 ? 1 : 0)
          : 0.26 * (1 - k);
        s.ghostMat.color.setHex((gp && gp.ok === false) ? 0xff4a14 : 0x8fe6c8);
      }

    } else if (mot === 'bridge' && ud.bridge) {
      /* 崩れる橋（契約§4.5 改訂 v2）: 板は判定の外（乗っている間は無害）。
         未踏＝静か／踏んだ＝縁が赤く点滅し、崩落の SHAKE_T 秒前から板が震える／
         崩落（MOT.bridgeFallAt ＝ bands() が穴を返し始める距離）＝板が1枚ずつ谷へ落ち、縁が赤く残る。 */
      const b = ud.bridge, D = OBS[o.type].depth;
      const lead = MOT.bridgeLead(o), tail = MOT.bridgeTail(o), unit = MOT.bridgeUnit(o);
      const zNear = D / 2 + lead, zFar = -(D / 2 + tail);
      const L = zNear - zFar;
      b.pit.scale.z = L + 1.0;
      b.pit.position.z = (zFar + zNear) / 2;
      b.mark.position.z = zNear;
      const fallAt = MOT.bridgeFallAt(o), stepped = isFinite(fallAt);
      const fallen = stepped && dist >= fallAt;
      b.rim.visible = fallen;
      b.edge.color.setHex(!stepped ? ObstacleSkin.COL.orange
        : (fallen ? ObstacleSkin.COL.red
           : ((Math.sin(dist * 1.3 + (t || 0) * 16) > 0) ? ObstacleSkin.COL.red : 0xffffff)));
      const slabLen = L / b.n;
      const dm = b.dummy;
      for (let i = 0; i < b.n; i++) {
        const hz = ZoneKit.hash(i, 17);
        const sgn = (i % 2) ? 1 : -1;
        const zc2 = zFar + (i + 0.5) * slabLen;
        dm.scale.set(1, 1, slabLen * 0.94);
        if (fallen) {
          /* 板が谷へ落ちて、傾いたまま底に残る（落ちた板） */
          const f = U.clamp((dist - fallAt - hz * unit * 0.2) / (unit * 0.45), 0, 1);
          const e = f * f;
          dm.position.set(sgn * e * 0.22, -e * 1.42, zc2);
          dm.rotation.set(sgn * e * 0.25, 0, sgn * e * 0.95);
        } else if (stepped && dist > fallAt - unit * CFG.BRIDGE.SHAKE_T) {
          const k = 1 - (fallAt - dist) / (unit * CFG.BRIDGE.SHAKE_T);
          const j = Math.sin((t || 0) * 55 + i * 2.1) * 0.035 * k;
          dm.position.set(j, j * 0.6 - k * 0.04, zc2);
          dm.rotation.set(0, 0, j * 1.6);
        } else {
          dm.position.set(0, 0, zc2);
          dm.rotation.set(0, 0, 0);
        }
        dm.updateMatrix();
        for (let k = 0; k < b.ims.length; k++) b.ims[k].setMatrixAt(i, dm.matrix);
      }
      for (let k = 0; k < b.ims.length; k++) b.ims[k].instanceMatrix.needsUpdate = true;

    } else if (ud.vent) {
      /* 泡の噴出口: 泡が立ちのぼる。跳ばされた直後（o.ventM から VENT_BURST_T 秒）は高く速く噴き上げる */
      const vt = ud.vent, dm = vt.dummy;
      const sp = Math.max(4, (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN);
      const burst = (typeof o.ventM === 'number')
        ? U.clamp(1 - (dist - o.ventM) / (sp * CFG.SEA.VENT_BURST_T), 0, 1) : 0;
      for (let i = 0; i < vt.n; i++) {
        const h1 = ZoneKit.hash(i, 81), h2 = ZoneKit.hash(i, 83), h3 = ZoneKit.hash(i, 87);
        const ph = ((t || 0) * (0.8 + h1 * 0.6 + burst * 2.2) + h2) % 1;
        const rr = 0.08 + h3 * 0.26 + burst * ph * 0.3;
        const a = h1 * Math.PI * 2 + ph * 2.5;
        dm.position.set(Math.cos(a) * rr, 0.05 + ph * (1.3 + burst * 1.6), Math.sin(a) * rr);
        dm.scale.setScalar((0.6 + h2 * 0.9) * (1 - ph * 0.3) * (1 + burst * 0.8));
        dm.updateMatrix();
        vt.bubbles.setMatrixAt(i, dm.matrix);
      }
      vt.bubbles.instanceMatrix.needsUpdate = true;

    } else if (mot === 'roll' && ud.rock) {
      /* 転がる丸岩: 球は判定と同じ MOT.rollLane の位置へ。転がった距離ぶん回す（滑らない転がり）。
         壁の外（|x| > 半幅＋2.6）に居る間は球を伏せ、影の筋（通り道）だけを見せる＝予告。 */
      const rk = ud.rock, R = CFG.ROCK.R;
      const wx = MOT.rollLane(o, dist) * CFG.LANE_W;
      const x0 = lx(wx);
      const inside = Math.abs(wx) < CFG.HALF_W + 2.6;
      rk.ball.visible = inside;
      rk.ball.position.x = x0;
      rk.ball.rotation.set(0, 0, -x0 / R);
      rk.shadow.visible = inside;
      rk.shadow.position.x = x0;
      const p = (o.params && o.params.roll) || {};
      const dirL = (ceil ? -1 : 1) * (p.dir || 1);         // ローカルでの転がる向き
      const dm = rk.dummy;
      for (let i = 0; i < rk.n; i++) {
        const h = ZoneKit.hash(i, 71);
        const ph = ((t || 0) * 1.6 + h) % 1;
        if (!inside) { dm.position.set(0, -9999, 0); dm.scale.setScalar(0.0001); }
        else {
          dm.position.set(x0 - dirL * (0.35 + ph * 1.5), 0.06 + ph * (0.35 + h * 0.3),
                          (ZoneKit.hash(i, 73) - 0.5) * 0.9);
          dm.scale.setScalar(0.5 + ph * 1.6);
        }
        dm.rotation.set(ph * 3, h * 5, 0);
        dm.updateMatrix();
        rk.dust.setMatrixAt(i, dm.matrix);
      }
      rk.dust.instanceMatrix.needsUpdate = true;

    } else if (mot === 'scan' && ud.mark) {
      /* 予告: 到達した瞬間の位置に床/天井のマーカーを出す */
      const half = (OBS[o.type].span - 1) / 2;         // サメは2レーン幅（帯の中心は左端＋0.5レーン）
      const mx = (MOT.scanLane(o, o.at) + half) * CFG.LANE_W;
      ud.mark.position.x = lx(mx);
      if (ud.range && o.params && o.params.scan) {
        const p = o.params.scan;
        const a = (Math.min(p.from, p.to) + half) * CFG.LANE_W, b = (Math.max(p.from, p.to) + half) * CFG.LANE_W;
        ud.range.position.x = lx((a + b) / 2);
        ud.range.scale.x = (b - a) + CFG.LANE_W * OBS[o.type].span;
      }
    } else if (mot === 'rot' && ud.arm) {
      const R = ud.armR;
      const th = MOT.rotTheta(o, dist);
      /* 腕（＝光線）: コリドーの外へはみ出さない長さに切る */
      const lim = CFG.HALF_W - OBS_INSET, hubX = o.lane * CFG.LANE_W;
      const armLen = (x) => {
        const cx = Math.cos(x), sy = Math.sin(x);
        let L = R;
        if (Math.abs(cx) > 1e-4) L = Math.min(L, ((cx > 0 ? lim : -lim) - hubX) / cx);
        if (sy > 1e-4) L = Math.min(L, CFG.H / sy);
        return Math.max(0.2, L);
      };
      const set = (grp, angle) => {
        grp.rotation.z = ceil ? (Math.PI - angle) : angle;
        grp.userData.sc.scale.x = armLen(angle);
      };
      set(ud.arm, th);
      set(ud.ghost, MOT.rotTheta(o, o.at));
      /* 光のカーテン: bands() の帯をそのまま描く（判定＝見た目） */
      const sl = ud.slats;
      const bs = Obstacles.bands(o, dist, Obstacles._bb);
      const d = sl.dummy;
      for (let i = 0; i < sl.n; i++) {
        const b = bs[i];
        if (!b) { d.position.set(0, -9999, 0); d.scale.set(0.0001, 0.0001, 0.0001); }
        else {
          /* 天井側の帯は絶対 y なので、ローカル（面からの高さ）へ戻す */
          const y0 = ceil ? CFG.H - b.y1 : b.y0, y1 = ceil ? CFG.H - b.y0 : b.y1;
          d.position.set(lx((b.x0 + b.x1) / 2), (y0 + y1) / 2, 0);
          d.scale.set(Math.max(0.02, b.x1 - b.x0), Math.max(0.02, y1 - y0), OBS[o.type].depth * 0.8);
        }
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        sl.mesh.setMatrixAt(i, d.matrix);
      }
      sl.mesh.instanceMatrix.needsUpdate = true;
    }
  }
};
