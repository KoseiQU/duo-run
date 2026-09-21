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
  /* ギャップ（穴）: 面が抜けている。足が面に着いていると落ちる → ジャンプ */
  GAP:       { span: 1, depth: 1.60, y0: -1.60, y1: 0.04,  both: false, safe: ['jump'],  label: 'ギャップ' },
  /* ワイド梁: 2レーンを塞ぐ。高さ2.2でジャンプでは越えられない → 空いた1レーンへ */
  WIDEBAR:   { span: 2, depth: 0.60, y0: 0.00, y1: 2.20,   both: false, safe: [],        label: 'ワイド梁' },
  /* ローレーザー: 面の近くを走る水平光線（0〜0.6を塞ぐ） → ジャンプ */
  LASER_LOW: { span: 1, depth: 0.24, y0: 0.00, y1: 0.60,   both: false, safe: ['jump'],  label: 'ローレーザー' },
  /* 縦レーザー（光柱）: 1レーン全高。両者に効く → レーン移動のみ（潜れない） */
  LASER_V:   { span: 1, depth: 0.30, y0: 0.00, y1: CFG.H,  both: true,  safe: [],        label: '縦レーザー' },
  /* 壁の穴: 全幅の壁のうち「穴のあるレーン」。下端0.5の梁 → そのレーンでスライディング
     （唯一のスライディング要素 / 契約§4.3改訂）。上端 2.30 は跳んでも届かない高さ＝
     そのキャラにとっての「全高」。反対側の面は空いているので相手は上を通れる。 */
  WALLHOLE:  { span: 1, depth: 0.55, y0: 0.50, y1: 2.30,   both: false, safe: ['slide'], label: '壁の穴' },
  /* 壁（穴のないレーン）: 生成器が WALLHOLE を展開するとき自動で置く。チャンク定義には書かない */
  WALLSOLID: { span: 1, depth: 0.55, y0: 0.00, y1: 2.30,   both: false, safe: [],        label: '壁' },

  /* ------------------------------------------------------------------------
     動くレーザー（S2〜 / 契約§4.3「§4.5で横にスキャンする」・§4.4 S2の新ギミック）
     位置は params の運動（MOT）で決まる。safe は「静止した場合の」参考値で、
     実際の可否は Obstacles.occ()（到達時の占有）が唯一の出所。
     ------------------------------------------------------------------------ */
  /* 横スキャン縦光柱: 1レーン幅の光柱が1〜2レーンぶんを往復する。到達時の位置で判定 */
  LASER_SCAN: { span: 1, depth: 0.30, y0: 0.00, y1: CFG.H, both: true,  safe: [], motion: 'scan', label: '横スキャン光柱' },
  /* 回転レーザー: 面に据えた発振器から腕が首を振る。腕の下は光のカーテン（面に接地）。
     低い所はジャンプで越えられ、立っている所はレーン移動で避ける（契約§4.3の比率を守るため
     「浮いた帯（＝潜って避ける形）」は作らない）。 */
  LASER_ROT:  { span: 1, depth: 0.34, y0: 0.00, y1: CFG.H, both: false, safe: [], motion: 'rot',  label: '回転レーザー' },

  /* ------------------------------------------------------------------------
     滑空区間の空中障害物（§4.4 S2「ビル間の大ジャンプ」）
     空中なのでジャンプ／スライドは無効＝**レーン移動だけで避ける**。
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
  /* 崩れる橋: 踏むと 0.4秒後にそのレーンの床が落ちる。
     ■ 判定（契約の「踏んだ時刻+0.4秒以降は GAP 扱い」の実装）
       板の手前端 entry = at - depth/2 - leadM を踏んだ瞬間が「踏んだ時刻」。
       leadM = そこの速度 × 0.4秒（生成時に決まる実寸）なので、
       「踏んだ時刻+0.4秒」＝ 距離 entry + leadM ＝ **at - depth/2**。
       bands() はそこから先でだけ穴の帯を返す（それまでは板があるので無害）。
       ＝ 時刻の規則がそのまま bands/occ に入っていて、判定・ボット・不変条件が
         同じ1か所を読む。落ちた先は GAP と同じ寸法（跳べば越えられる）。
     ■ 抜け方: 板に乗ってから 0.4秒以内にレーン移動するか、跳び越す。 */
  BRIDGE:   { span: 1, depth: 1.60, y0: -1.60, y1: 0.04, both: false, safe: ['jump'],
              motion: 'bridge', lead: true, label: '崩れる橋' },
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
  /* 落ちる天井: **1つの事象が床と天井で別の要求になる**（契約§6 P3b）。
       床側 … 落ちてきた石のブロック（0〜1.60 ＝ 跳んでも越えられない）→ レーン移動
       天井側 … 抜けた穴（GAP と同じ寸法）→ ジャンプ
     bands() が絶対 y で2枚返す both 型。ブロックの高さ 1.60 は
     「床側は跳んでも届かない（跳躍の足元 1.30 < 1.60）」かつ
     「天井側で跳んだ体の下端 H-1.30-0.90 = 1.80 には触れない」ぎりぎりの値。 */
  DROPCEIL: { span: 1, depth: 0.70, y0: 0.00, y1: 1.60, both: true, safe: [],
              motion: 'drop', label: '落ちる天井' },
  /* 倒れた柱（神殿崩壊）: 3レーンを横断する低い梁（高さ0.62）→ ジャンプ */
  COLUMN:   { span: 3, depth: 0.62, y0: 0.00, y1: 0.62, both: false, safe: ['jump'],
              label: '倒れた柱' },

  /* ------------------------------------------------------------------------
     S5「深海」の新ギミック（契約§4.4 / §4.5 / P4a）
     ------------------------------------------------------------------------ */
  /* 海流ベルトの帯（見た目だけ・当たり判定なし）。流される規則は Current が唯一の出所。
     ghost:true ＝ bands が常に空＝完全に無害（占有もしない）。 */
  CURRENT:  { span: 3, depth: 1.0, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, belt: true, label: '海流ベルト' },
  /* 海流ベルトの入口ゲート（予告）。同じく当たり判定なし */
  CURGATE:  { span: 3, depth: 0.5, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, belt: true, label: '海流の入口' },
  /* 色の扉（契約§4.5）: 扉に色があり、**同色のキャラしか通れない**。
       DOOR  … そのキャラと同じ色の扉＝通れる（当たり判定なし）
       DOORX … 異色の扉＝通れない。跳んでも潜っても抜けられない（0〜2.30）＝レーン移動
     床側は琥珀＝LUMEN が通れる色、天井側は藍＝UMBRA が通れる色（スキンが surface で塗り分ける）。 */
  DOOR:     { span: 1, depth: 0.55, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, door: true, label: '色の扉（同色）' },
  DOORX:    { span: 1, depth: 0.55, y0: 0.00, y1: 2.30, both: false, safe: [],
              door: true, label: '色の扉（異色）' },
  /* 浮上足場（契約§4.5）: 周期的に浮き上がって高さ0.60（ローバー相当）になり、
     沈むと通れる。天井側は逆に垂れ下がる。到達時刻の高さで判定する。 */
  LIFTPAD:  { span: 1, depth: 0.55, y0: 0.00, y1: 0.60, both: false, safe: ['jump'],
              motion: 'lift', label: '浮上足場' },
  /* 巨大魚の部位（契約§4.4 S5 の大演出）。判定は既存の型と同じ寸法で、
     見た目だけ魚の牙・ヒレ・尾になる（fishKit がゾーン共通で建てる）。 */
  FISH_TOOTH: { span: 1, depth: 0.50, y0: 0.00, y1: 0.60, both: false, safe: ['jump'],
                fish: true, label: '巨大魚の牙' },
  FISH_FIN:   { span: 1, depth: 0.50, y0: 0.00, y1: CFG.H, both: true, safe: [],
                fish: true, label: '巨大魚のヒレ' },
  FISH_TAIL:  { span: 1, depth: 0.40, y0: 0.00, y1: CFG.H, both: true, safe: [],
                motion: 'scan', fish: true, label: '巨大魚の尾' },

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
       床寄り（CFG.NET.Y_LOW）  … 床の体（走る 0〜0.90／潜る 0〜0.40）に当たり、
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
  /* 入れ替えワープの紫のゲート: 当たり判定なし。上下の担当が入れ替わる（Swap が出所）。 */
  SWAPGATE: { span: 1, depth: 0.55, y0: 0.00, y1: 0.02, both: false, safe: [],
              ghost: true, harmless: true, gate: true, swap: true, label: '入れ替えワープのゲート' },
  /* 割れた鏡の床（飛び石 / 契約§4.4 S7 の大演出）: 全幅が抜けていて、
     **揺れる鏡片1枚ぶんの幅だけ**が足場。足場の外は GAP と同じ寸法＝跳べば越えられる。
     奥行きが深い（＝裂け目が広い）ので、Fair の「通過に要する距離」からは外す（noPass）。 */
  SHARDGAP: { span: 3, depth: 5.20, y0: -1.60, y1: 0.04, both: false, safe: ['jump'],
              motion: 'shard', noPass: true, label: '割れた鏡の床' },

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
  /* 崩れる橋: 板の手前端（＝踏む位置）と、落ちる位置（踏んだ時刻+0.4秒） */
  bridgeLead(o) { return (o.params && o.params.bridge && o.params.bridge.leadM) || 0; },
  bridgeEntry(o) { return o.at - OBS[o.type].depth / 2 - MOT.bridgeLead(o); },
  bridgeFallAt(o) { return o.at - OBS[o.type].depth / 2; },
  /* 落ちたか（＝踏んでから 0.4秒 経ったか）。0..1 の落下の進み具合 */
  bridgeFall(o, dist) {
    const f = MOT.bridgeFallAt(o);
    return (dist <= f) ? 0 : Math.min(1, (dist - f) / 3.2);
  },

  /* ------------------------------------------------------------------------
     落ちる天井（契約§4.4 S4）の時刻規則。**ここが唯一の出所**。
     すべて「到達（dist = o.at）の何秒手前か」で書き、生成時に実寸へ伸縮した
     unitM（＝その地点の速度×1秒）を掛けて距離にする。崩れる橋と同じ流儀。
       warnAt  … ひび・砂が落ち始める（予告）
       fallAt  … 天井から外れて落ち始める。**ここから bands が最終形を返す**
       landAt  … 床に着く（= 到達の CFG.DROP.LAND_T 秒手前 ≥ 視認距離）
     ------------------------------------------------------------------------ */
  dropUnit(o) { return (o.params && o.params.drop && o.params.drop.unitM) || CFG.REF_SPEED; },
  dropLandAt(o) { return o.at - CFG.DROP.LAND_T * MOT.dropUnit(o); },
  dropFallAt(o) { return MOT.dropLandAt(o) - CFG.DROP.FALL_T * MOT.dropUnit(o); },
  dropWarnAt(o) { return MOT.dropFallAt(o) - CFG.DROP.WARN_T * MOT.dropUnit(o); },
  /* 落下の進み具合 0..1（0 = 天井にある / 1 = 着地）。見た目も判定もこの1本から引く */
  dropFall(o, dist) {
    const a = MOT.dropFallAt(o), b = MOT.dropLandAt(o);
    return U.clamp((dist - a) / Math.max(1e-6, b - a), 0, 1);
  },
  /* 予告（ひび・砂）の強さ 0..1 */
  dropWarn(o, dist) {
    const a = MOT.dropWarnAt(o), b = MOT.dropFallAt(o);
    return U.clamp((dist - a) / Math.max(1e-6, b - a), 0, 1);
  },

  /* ------------------------------------------------------------------------
     浮上足場（契約§4.5 / §4.4 S5）の時刻規則。**ここが唯一の出所**。
     点滅レーザー（blinkOn）と同じ「到達した瞬間（dist = at）が枠の中央」という作り。
       liftK(o, dist) … 0（沈みきって通れる）〜 1（浮ききってローバー相当）
     枠の終わりの RISE だけを使って次の姿へ移る＝到達の前後は平ら（“溜め”）なので、
     通過窓（±0.6m 程度）の中で高さが変わらない＝判定が譜面どおりになる。
     ------------------------------------------------------------------------ */
  liftK(o, dist) {
    const p = o.params && o.params.lift;
    if (!p) return 1;                                     // params 無しは「浮いたまま」
    const P = p.periodM || CFG.LIFT.PERIOD;
    const x = (dist - o.at) / P + 0.5;
    const k = Math.floor(x), f = x - k;
    const even = ((k % 2) + 2) % 2 === 0;
    const upNow = even ? (p.upAtArrival !== false) : !(p.upAtArrival !== false);
    const a = upNow ? 1 : 0, b = upNow ? 0 : 1;
    const TR = CFG.LIFT.RISE;
    if (f > 1 - TR) return U.lerp(a, b, U.smooth((f - (1 - TR)) / TR));
    return a;
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
   Current — 海流ベルト（契約§4.5 / §4.4 S5）の**時刻規則の唯一の出所**

   ■ 形
     区間 [from, to] に入ると、床側と天井側がそれぞれ決まった向きへ流される。
     流れは「PUSH_T 秒ごとに1レーンぶん押し出す」という離散の押し出しで表す
     （1スワイプ＝1レーンという操作の粒度にそろえる / §4.2）。
     押し出す距離は生成時に決まった unit（＝その地点の速度×1秒）で測るので、
     速度が変わっても「1レーンぶんを1.0秒で」が一定になる。
   ■ 規則
     ・押し出しは **走行距離が pushes[i] を跨いだ瞬間** に1回だけ起きる。
       距離の関数なので、フレームレート・スロー演出・中断復元に左右されない。
     ・跳んでいても押される（水に流されるので当然）＝ 予測が常に成り立つ。
     ・流れに逆らう横入力で相殺できる（押し戻すのは普通のレーン移動）。
   ■ 誰が読むか
     判定（Game.step → Current.update）・ボット（押された結果の laneTo を見て戻す）・
     不変条件（Fair.validate が driftBetween / pushNear を読む）が同じここを読む。
   ============================================================================ */
const Current = {
  /* 譜面の1エントリ（type:'CURRENT'）を実体へ展開する。
     params.cur = { dir: 床の向き(+1=右/-1=左), cdir: 天井の向き（省略時は -dir）,
                    n: 押し出しの回数（＝区間の長さ 秒） } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.cur) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const dir = (p.dir === undefined) ? 1 : p.dir;
    const cdir = (p.cdir === undefined) ? -dir : p.cdir;
    const n = (p.n === undefined) ? 3 : p.n;
    const pushM = unit * CFG.CURRENT.PUSH_T;
    const from = at, to = at + n * pushM;
    const pushes = [];
    for (let i = 0; i < n; i++) pushes.push(from + (i + 0.5) * pushM);
    const reg = { from: from, to: to, unit: unit, n: n,
                  dir: { floor: dir, ceil: cdir }, pushes: pushes, done: [], dead: false };
    /* 入口ゲート（予告）＋ 矢印の帯（1秒ぶんずつ）。どちらも当たり判定を持たない */
    const gate = Obstacles.make('CURGATE', 'floor', 0, from, nowDist, { cur: { unitM: unit, dir: dir, cdir: cdir } });
    gate.reg = reg;
    items.push(gate);
    for (let i = 0; i < n; i++) {
      ['floor', 'ceil'].forEach((side) => {
        const o = Obstacles.make('CURRENT', side, 0, from + (i + 0.5) * pushM, nowDist,
                                 { cur: { unitM: unit, dir: (side === 'floor') ? dir : cdir } });
        o.reg = reg;
        items.push(o);
      });
    }
    if (sink) sink.push(reg);
    return reg;
  },

  /* a < 押し出し ≤ b の回数 × 向き（符号つきレーン数）。Fair とボットの共通の窓口 */
  driftBetween(list, side, a, b) {
    if (!list || !list.length) return 0;
    let d = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || r.to < a || r.from > b) continue;
      for (let k = 0; k < r.pushes.length; k++) {
        if (r.pushes[k] > a && r.pushes[k] <= b) d += r.dir[side];
      }
    }
    return d;
  },
  /* atM の直前 windowM 以内に押し出しがあるか（＝避ける余裕がないか） */
  pushNear(list, side, atM, windowM) {
    if (!list || !list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || !r.dir[side]) continue;
      for (let k = 0; k < r.pushes.length; k++) {
        if (r.pushes[k] > atM - windowM && r.pushes[k] <= atM) return true;
      }
    }
    return false;
  },
  /* 今この距離が海流の中か（HUD・見た目・ボットの参考に） */
  inBelt(list, side, m) {
    if (!list) return 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.dead && m >= r.from && m <= r.to) return r.dir[side];
    }
    return 0;
  },

  /* 毎フレーム1回（Game.step から）。prevDist → dist の間に跨いだ押し出しを実行する */
  update(game) {
    const list = (game.gen && game.gen.currents) ? game.gen.currents : null;
    if (!list || !list.length) { Current.hud(game, 0); return; }
    const a = game.prevDist, b = game.dist;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead) continue;
      for (let k = 0; k < r.pushes.length; k++) {
        const p = r.pushes[k];
        if (p <= a || p > b) continue;
        for (let j = 0; j < game.runners.length; j++) {
          const rn = game.runners[j];
          const d = r.dir[rn.surface];
          if (d) Runners.push(rn, d);
        }
      }
    }
    Current.hud(game, Current.inBelt(list, 'floor', b));
  },

  /* HUD の「CURRENT」表示（流れの向きを出す） */
  hud(game, dir) {
    if (typeof HUD === 'undefined' || !HUD.currentCue) return;
    const list = (game.gen && game.gen.currents) ? game.gen.currents : null;
    const c = Current.inBelt(list, 'ceil', game.dist);
    HUD.currentCue(dir, c);
  },

  /* 中断・チェックポイント再開で「入口は通り過ぎたのに流れだけ残る」を作らない */
  dropOrphans(list, cutM) {
    return list.filter((o) => !(o.reg && o.reg.from < cutM));
  },
  killBefore(regs, cutM) {
    if (!regs) return;
    for (let i = 0; i < regs.length; i++) if (regs[i].from < cutM) regs[i].dead = true;
  },

  /* テスト・監査の窓口 */
  snapshot(game) {
    const list = (game.gen && game.gen.currents) ? game.gen.currents : [];
    return list.filter((r) => !r.dead && Math.abs(r.from - game.dist) < 260)
               .map((r) => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(1), n: r.n,
                              dir: r.dir.floor, cdir: r.dir.ceil }));
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
   Mirror — 鏡ゾーン（契約§4.5 / §4.4 S7）の**時刻規則の唯一の出所**

   ■ 形
     銀の枠のゲートが2枚で1組（入口と出口）。**ゲートが置かれた面**（床 or 天井）を
     走るキャラの左右操作が、跨ぐたびに反転する（runner.mirrored をトグル）。
     反転そのものは Runners.input の1行（dir = -dir）が唯一の実装で、
     人間のタッチもキーボードもボットも同じ1か所を通る。

   ■ 規則（重力反転ワープと同じ流儀で、距離＝時刻として書く）
     ・反転は **走行距離がゲートを跨いだ瞬間** に1回だけ起きる（フレーム非依存）。
     ・ゲートの直後 CFG.MIRRORZ.GRACE_T 秒（1.0秒）は障害物を置かない。
     ・Fair はこの余白を検査し、さらに **生存レーンの到達可能性をリセット**する
       （左右が入れ替わった直後は、どちらへ動くかの判断がやり直しになるため）。
   ============================================================================ */
const Mirror = {
  /* 譜面の1エントリ（type:'MIRRORZ'）を実体へ展開する。
     params.mir = { side: 'floor'|'ceil'（省略時は書いた面）, backT: 出口までの秒数 } */
  expand(items, e, surface, at, nowDist, scale, sink) {
    const p = (e.params && e.params.mir) || {};
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    const backT = (p.backT === undefined) ? 6 : p.backT;
    const side = (p.side === 'ceil' || p.side === 'floor') ? p.side : surface;
    const to = at + backT * unit;
    const reg = { from: at, to: to, unit: unit, side: side, gates: [at, to], dead: false };
    reg.gates.forEach((m) => {
      const o = Obstacles.make('MIRGATE', side, e.lane || 0, m, nowDist, { mir: { unitM: unit, side: side } });
      o.reg = reg;
      items.push(o);
    });
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
  /* その距離でその面が反転しているか（区間の内側か）。HUD・監査の窓口 */
  activeAt(list, side, m) {
    if (!list) return false;
    let on = false;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dead || r.side !== side) continue;
      if (m > r.from && m <= r.to) on = !on;
    }
    return on;
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
        if (rn) rn.mirrored = !rn.mirrored;
        n++;
      }
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
               .map((r) => ({ from: +r.from.toFixed(1), to: +r.to.toFixed(1), side: r.side }));
  }
};

/* ============================================================================
   Swap — 入れ替えワープ（契約§4.5 / §4.4 S7）の**時刻規則の唯一の出所**

   ■ 形
     紫のゲートが2枚で1組。跨ぐたびに **担当が入れ替わる**（Game.handSwap をトグル）。
     本作のタッチは「画面の上下＝担当」（§4.2）なので、契約の
     「左手/右手の担当が入れ替わる」は **上下の担当が入れ替わる** と読む:
       通常   下半分＝床を走る方（LUMEN） ／ 上半分＝天井を走る方（UMBRA）
       入替後 下半分＝天井を走る方（UMBRA）／ 上半分＝床を走る方（LUMEN）
     ＝ Game.runnerForZone が面を反転し、キーボード／ボットは
        Game.runnerForHand が手を反転する（どちらも handSwap の1か所を読む）。
   ■ 規則
     ・入れ替えは **走行距離がゲートを跨いだ瞬間** に1回だけ（フレーム非依存）。
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
    for (let i = 0; i < n; i++) game.setHandSwap(!game.handSwap);
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

    if (t.pad || t.ghost) return out;                      // 踏み板・海流の帯・同色の扉は当たらない

    if (t.motion === 'lift') {
      /* 浮上足場（契約§4.5）: 到達時刻の高さがそのまま判定になる。
         沈みきっている間は帯を返さない＝通れることが判定でも見た目でも同じ。 */
      const k = MOT.liftK(o, dist);
      if (k <= CFG.LIFT.EPS) return out;
      put((o.lane - 0.5) * CFG.LANE_W + OBS_INSET, (o.lane + 0.5) * CFG.LANE_W - OBS_INSET,
          t.y0, t.y0 + (t.y1 - t.y0) * k);
      return out;
    }

    if (t.motion === 'sync') {
      /* 同時スイッチの橋（契約§4.5）: 成功していれば橋が架かっている＝完全に無害。
         成否が決まる前・失敗したあとは谷（抜けた床＋折れた橋脚）。
         ＝ 成否の規則は Sync の1か所だけで、ここはその結果を読むだけ。 */
      if (o.grp && o.grp.ok === true) return out;
      put((o.lane - 0.5) * CFG.LANE_W + OBS_INSET, (o.lane + 0.5) * CFG.LANE_W - OBS_INSET, t.y0, t.y1);
      return out;
    }

    if (t.motion === 'drop') {
      /* 落ちる天井（契約§4.4 S4）: 天井から外れる（dropFallAt）より手前では
         まだ天井にはまっているので無害。外れた後は **床のブロック** と
         **天井の穴** の2枚を絶対 y で返す＝床と天井で別の要求になる。 */
      if (dist < MOT.dropFallAt(o) - 1e-9) return out;
      const x0 = (o.lane - 0.5) * CFG.LANE_W + OBS_INSET, x1 = (o.lane + 0.5) * CFG.LANE_W - OBS_INSET;
      out.push({ x0: x0, x1: x1, y0: t.y0, y1: t.y1 });                             // 落ちたブロック（床側）
      out.push({ x0: x0, x1: x1, y0: CFG.H - OBS.GAP.y1, y1: CFG.H - OBS.GAP.y0 }); // 抜けた天井（天井側）
      return out;
    }

    if (t.motion === 'bridge') {
      /* 崩れる橋（契約§4.4 S3）: 「踏んだ時刻+0.4秒」より手前では板があるので無害。
         そこから先は GAP と同じ穴になる。時刻の規則はこの2行がすべて。 */
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
    if (t.motion === 'scan') { const c = MOT.scanLane(o, dist); lo = c; hi = c; }
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
    const lead = t.lead ? MOT.bridgeLead(o) : 0;
    return { z0: zc - t.depth / 2, z1: zc + t.depth / 2 + lead };
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
    if (o.type === 'GAP') return { from: o.at - OBS.GAP.depth / 2, to: o.at + OBS.GAP.depth / 2 };
    if (o.type === 'BRIDGE') {
      return { from: MOT.bridgeEntry(o) - 0.7, to: o.at + OBS.BRIDGE.depth / 2 + 0.7 };
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
    /* 落ちる天井: 天井から外れたら、その**天井側**の路面が抜ける（床側は抜けない） */
    if (o.type === 'DROPCEIL') {
      if (dist !== undefined && dist < MOT.dropFallAt(o)) return null;
      return { from: o.at - OBS.DROPCEIL.depth / 2, to: o.at + OBS.DROPCEIL.depth / 2, side: 'ceil' };
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
    const grp = o.grp;
    o.grp = null;
    try { return Obstacles._occCalc(o, key); } finally { o.grp = grp; }
  },
  _occCalc(o, key) {
    const t = OBS[o.type];
    const moving = !!(t.motion || (o.params && o.params.blink));
    const K = moving ? CFG.OCC.SAMPLES : 1;
    const W = (t.depth + CFG.SLIDE_D) / 2 + CFG.OCC.PAD;
    const ACTS = [['run', 0], ['jump', CFG.OCC.JUMP_T], ['slide', CFG.SLIDE_T / 2]];
    const res = {};
    Obstacles.SIDES.forEach((side) => {
      const lanes = {};
      CFG.LANES.forEach((l) => { lanes[l] = { run: true, jump: true, slide: true }; });
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
            const bodyD = (a === 'slide') ? CFG.SLIDE_D : CFG.BODY_D;
            if (K > 1 && Math.abs(dz) >= (t.depth + bodyD) / 2) continue;
            const rb = Runners.boxOf(side, lane, a, ACTS[ai][1]);
            for (let bi = 0; bi < bands.length; bi++) {
              const b = bands[bi];
              if (U.overlap1(rb.x0, rb.x1, b.x0, b.x1) && U.overlap1(rb.y0, rb.y1, b.y0, b.y1)) { acts[a] = false; break; }
            }
          }
        }
      }
    }
    Obstacles.SIDES.forEach((side) => {
      const r = res[side];
      CFG.LANES.forEach((l) => {
        const a = r.lanes[l];
        if (!a.run) {
          r.any = true;
          if (a.jump && r.safe.indexOf('jump') < 0) r.safe.push('jump');
          if (a.slide && r.safe.indexOf('slide') < 0) r.safe.push('slide');
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
  /* この面に対して要求する動作。'none' | 'jump' | 'slide' | 'lane' */
  demand(o, side) {
    if (!Obstacles.affects(o, side)) return 'none';
    const r = Obstacles.occ(o)[side];
    if (!r.any) return 'none';
    if (r.safe.indexOf('jump') >= 0) return 'jump';
    if (r.safe.indexOf('slide') >= 0) return 'slide';
    return 'lane';
  },
  /* そのレーンに居たまま生き残れる動作の一覧（[] なら必ずレーン移動） */
  safeActs(o) { return OBS[o.type].safe; },

  /* ==========================================================================
     見た目（ゾーンごとの「スキン」/ 契約 §5・§6 P3a）
     ・**当たり判定（OBS）は全ゾーン共通・不変**。ここが受け持つのは見え方だけ。
     ・寸法は必ず OBS テーブルの y0/y1/depth/span から引く（ズレ ±10% 以内）。
     ・箱を積む → 同じ材質どうしを1つのジオメトリへ融合する、という足場はここに置き、
       ゾーンのスキンは build(type, x) / buildMoving(type, g, w, t, x) を書くだけでよい。
     ・マテリアルとプールは**スキンごと**に分ける（ゾーンを切り替えたら一緒に捨てる）。
     ・点滅灯は「そのビュー専用のマテリアル」を持ち、障害物の at を位相にして
       個体ごとにばらばらに明滅する（プールで使い回しても位相が飛ばない）。
     ========================================================================== */
  _mat: {},
  _pool: {},
  /* 材質キーの名前空間（コアのスキンが「他ゾーンのビルダー」を呼ぶ間だけ立てる / P5b）。
     キーは `skinId + '|' + ns + key` になるので、disposeSkin の前方一致はそのまま効く。
     ＝ 同じ key 名（'rvBody' など）を別ゾーンの色で作っても取り違えない。 */
  _matNS: '',
  /* 今のゾーンのスキン（ゾーン未構築でも落ちないようネオンを既定にする） */
  skin() {
    const s = (typeof Zones !== 'undefined') ? Zones.skin() : null;
    return s || (typeof ZoneNeon !== 'undefined' ? ZoneNeon.obstacleSkin : null);
  },
  skinId() { const s = Obstacles.skin(); return s ? s.id : 'neon'; },
  /* 旧 Obstacles.COL の窓口（今のスキンの配色） */
  get COL() { const s = Obstacles.skin(); return s ? s.COL : {}; },

  _material(key, color, opacity) {
    const k = Obstacles.skinId() + '|' + Obstacles._matNS + key;
    if (!Obstacles._mat[k]) {
      Obstacles._mat[k] = (opacity === undefined)
        ? new THREE.MeshLambertMaterial({ color: color, fog: true })
        : new THREE.MeshBasicMaterial({ color: color, fog: true, transparent: true, opacity: opacity, depthWrite: opacity > 0.75 });
    }
    return Obstacles._mat[k];
  },
  _emissive(key, color) {
    const k = Obstacles.skinId() + '|E' + Obstacles._matNS + key;
    if (!Obstacles._mat[k]) Obstacles._mat[k] = new THREE.MeshBasicMaterial({ color: color, fog: true });
    return Obstacles._mat[k];
  },

  /* この障害物をどの「見た目の変種」で建てるか（スキンが決める。既定は変種なし）。
     コアのスキン（P5b）だけが、障害物ごとに寄り親のゾーンを返す。 */
  variantOf(o) {
    const s = Obstacles.skin();
    return (s && s.variant) ? (s.variant(o) || '') : '';
  },

  _build(type, variant) {
    const skin = Obstacles.skin();
    const t = OBS[type];
    const C = skin.COL;
    const g = new THREE.Group();
    g.userData = { blink: [], spin: [], beam: [], mark: null, arm: null, slats: null };
    /* 点滅レーザーで「消える」部分の材質。マージ後に該当メッシュを userData.beam に拾う */
    const beamMats = [];
    const beamMat = (m) => { if (beamMats.indexOf(m) < 0) beamMats.push(m); return m; };
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
    /* 崩れる橋の骨組み（ゾーン共通。色だけスキンが決める）。
       板の実寸（leadM = そこの速度×0.4秒）と落下は place() が動かすので、
       ここでは **z方向の長さ1の部品** を並べておく（プールで使い回すため）。 */
    const bridge = (mats) => {
      const n = 10;
      /* 谷（板の下）。材質ごとに1メッシュへ融合する（ドローコール削減 / 契約§3 の300以下） */
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
      g.add(pit);
      /* 板は10枚が別々に傾いて落ちる＝**材質ごとの InstancedMesh** にして、
         1枚あたり4メッシュ（＝40ドローコール）だったものを3ドローコールにする。
         板ごとの姿勢は place() が1つの行列を作り、3つのインスタンスへ同じ行列を書く。 */
      const plankIMs = [];
      const addIM = (geo, mat) => {
        if (!mat) return;
        const im = new THREE.InstancedMesh(geo, mat, n);
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        g.add(im);
        plankIMs.push(im);
      };
      addIM(ZoneKit.merge([{ g: new THREE.BoxGeometry(w, 0.15, 1), p: [0, -0.075, 0] }]), mats.slab);
      addIM(ZoneKit.merge([{ g: new THREE.BoxGeometry(w * 0.24, 0.10, 1), p: [0, -0.18, 0] }]), mats.beam);
      if (mats.edge) {
        addIM(ZoneKit.merge([
          { g: new THREE.BoxGeometry(0.07, 0.26, 1), p: [-(w / 2 - 0.03), 0.10, 0] },
          { g: new THREE.BoxGeometry(0.07, 0.26, 1), p: [w / 2 - 0.03, 0.10, 0] }
        ]), mats.edge);
      }
      /* 板の「踏み口」を示す標示（ここを踏んだら 0.4秒で落ちる、と一目で分かる）。
         判定の外なので体には当たらない（見た目と判定のズレ検査でも BRIDGE は x/y/z 例外）。 */
      const mark = new THREE.Group();
      const markMat = mats.mark || mats.edge || mats.beam;
      mark.add(new THREE.Mesh(ZoneKit.merge([
        { g: new THREE.BoxGeometry(w + 0.18, 0.09, 0.34), p: [0, 0.05, 0] },
        { g: new THREE.BoxGeometry(0.18, 0.12, 0.18), p: [-(w / 2 + 0.06), 0.64, 0] },
        { g: new THREE.BoxGeometry(0.18, 0.12, 0.18), p: [w / 2 + 0.06, 0.64, 0] }
      ]), markMat));
      mark.add(new THREE.Mesh(ZoneKit.merge([
        { g: new THREE.BoxGeometry(0.13, 0.62, 0.13), p: [-(w / 2 + 0.06), 0.31, 0] },
        { g: new THREE.BoxGeometry(0.13, 0.62, 0.13), p: [w / 2 + 0.06, 0.31, 0] }
      ]), mats.post || mats.beam));
      g.add(mark);
      g.userData.bridge = { pit: pit, ims: plankIMs, mark: mark, n: n,
                            dummy: new THREE.Object3D() };
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
    /* 落ちる天井: 予告のひび → 落ちるブロック → 天井に開いた穴 */
    const dropKit = (mats) => {
      mats = mats || {};
      const stone = mats.stone || Obstacles._material('dcStone', C.body);
      const TOP = t.y1;                              // 1.60（判定どおり）
      /* ブロック（下端 y=0 で作る。place() が天井から床まで動かす） */
      const block = new THREE.Group();
      block.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, TOP - 0.26, D * 0.9), p: [0, (TOP - 0.26) / 2, 0] },
        { g: ZoneKit.box(w, 0.20, D), p: [0, TOP - 0.10, 0] },
        { g: ZoneKit.box(w * 0.92, 0.14, D * 0.96), p: [0, 0.07, 0] },
        { g: ZoneKit.box(w * 0.30, 0.30, 0.30), p: [-(w * 0.26), TOP * 0.42, D * 0.32], r: [0.4, 0.2, 0.3] },
        { g: ZoneKit.box(w * 0.24, 0.24, 0.24), p: [w * 0.28, TOP * 0.70, -D * 0.30], r: [0.2, 0.5, 0.1] }
      ]), stone));
      const bm = mats.warn || Obstacles._emissive('dcWarn', C.warn);
      block.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.10, D + 0.04), p: [0, TOP - 0.24, 0] },
        { g: ZoneKit.box(w * 0.86, 0.07, D * 0.4), p: [0, 0.16, 0] }
      ]), bm));
      g.add(block);
      /* 天井の穴（抜けた先の闇）＋欠けた縁 */
      const own = [];
      const hm = new THREE.MeshBasicMaterial({ color: C.pit, transparent: true, opacity: 0,
                                               depthWrite: false, side: THREE.DoubleSide, fog: true });
      own.push(hm);
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(w, D), hm);
      hole.rotation.x = Math.PI / 2;
      hole.position.y = CFG.H - 0.02;
      hole.renderOrder = 2;
      g.add(hole);
      const rim = new THREE.Group();
      rim.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.14, 0.12), p: [0, CFG.H - 0.07, -(D / 2)] },
        { g: ZoneKit.box(w, 0.14, 0.12), p: [0, CFG.H - 0.07, D / 2] },
        { g: ZoneKit.box(0.10, 0.14, D), p: [-(w / 2 - 0.05), CFG.H - 0.07, 0] },
        { g: ZoneKit.box(0.10, 0.14, D), p: [w / 2 - 0.05, CFG.H - 0.07, 0] }
      ]), stone));
      /* 穴の縁を光らせる（天井側は「ここが抜けている＝跳べ」の合図） */
      rim.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.06, 0.06), p: [0, CFG.H - 0.17, -(D / 2)] },
        { g: ZoneKit.box(w, 0.06, 0.06), p: [0, CFG.H - 0.17, D / 2] },
        { g: ZoneKit.box(0.06, 0.06, D), p: [-(w / 2 - 0.04), CFG.H - 0.17, 0] },
        { g: ZoneKit.box(0.06, 0.06, D), p: [w / 2 - 0.04, CFG.H - 0.17, 0] }
      ]), mats.warn || Obstacles._emissive('dcRim', C.warn)));
      g.add(rim);
      /* 予告のひび（落ちる前の天井）と、落ちる砂／着地後の土煙の筋。
         どちらも1メッシュずつに抑える（ドローコール / 契約§3 の300以下） */
      const cm = new THREE.MeshBasicMaterial({ color: C.warn, transparent: true, opacity: 0.85,
                                               depthWrite: false, side: THREE.DoubleSide, fog: true });
      own.push(cm);
      const crack = new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w * 0.9, 0.02, 0.05), p: [0, 0, 0] },
        { g: ZoneKit.box(0.05, 0.02, D * 0.7), p: [-w * 0.2, 0, 0.1] },
        { g: ZoneKit.box(0.05, 0.02, D * 0.6), p: [w * 0.24, 0, -0.1] }
      ]), cm);
      crack.position.y = CFG.H - 0.05;
      g.add(crack);
      const sm2 = new THREE.MeshBasicMaterial({ color: mats.dust || C.warn, transparent: true, opacity: 0,
                                                depthWrite: false, fog: true });
      own.push(sm2);
      const sand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 1.4, D * 0.62), sm2);
      sand.renderOrder = 3;
      g.add(sand);
      g.userData.drop = { block: block, hole: hole, rim: rim, crack: crack, sand: sand };
      g.userData.dropMats = own;
    };

    /* 倒れた柱（神殿崩壊）: 3レーンを横断する低い梁。判定どおりの寸法で置く */
    const columnKit = (mats) => {
      mats = mats || {};
      const stone = mats.stone || Obstacles._material('coStone', C.body);
      const r = t.y1 / 2;                            // 0.31（高さ・奥行きとも判定どおり）
      solid(new THREE.CylinderGeometry(r, r, w * 0.86, 12), stone, 0, r, 0, [0, 0, Math.PI / 2]);
      for (let i = 0; i < 5; i++) {                  // 柱の溝（節）
        box(0.05, r * 1.9, r * 1.9, mats.rib || Obstacles._material('coRib', C.dark),
            -w * 0.34 + w * 0.68 * i / 4, r, 0);
      }
      [-1, 1].forEach((s) => {                       // 折れた柱頭
        box(0.26, 0.58, 0.58, stone, s * (w * 0.45), r, 0);
        box(0.14, 0.50, 0.50, mats.rib || Obstacles._material('coRib', C.dark), s * (w * 0.49), r, 0);
      });
      box(w, 0.10, D + 0.04, mats.warn || Obstacles._emissive('coWarn', C.warn), 0, t.y1 - 0.05, 0);
      box(w * 0.98, 0.07, D * 0.5, mats.hot || Obstacles._emissive('coHot', C.red), 0, 0.05, 0);
      g.userData.column = true;
    };

    /* ------------------------------------------------------------------------
       S5 の新ギミックの骨組み（ゾーン共通・2026-09-22 P4a）
       同時スイッチ・落ちる天井と同じ考え方。スキンは色（mats）を渡すだけでよく、
       スキンが知らないゾーンへ混ざっても見た目と判定がずれない。
       ------------------------------------------------------------------------ */
    /* 海流ベルト: 流れの向きを示す矢印の帯。長さ1で作り、place() が「1秒ぶん」へ伸ばす。
       床と天井の両方に敷く（帯そのものは当たり判定を持たない）。 */
    const beltKit = (mats) => {
      mats = mats || {};
      const own = [];
      const emis = (col, op) => {
        const m = new THREE.MeshBasicMaterial({ color: col, fog: true, transparent: true,
                                                opacity: op, depthWrite: false });
        own.push(m);
        return m;
      };
      const grp = new THREE.Group();
      const isGate = (type === 'CURGATE');
      /* 矢印の色は place() が面から決める（床＝琥珀＝LUMEN／天井＝藍＝UMBRA）。
         ゾーンの青緑から確実に浮く色で、HUD の矢印とも意味が揃う。 */
      const arrowMat = emis(mats.arrow || C.cyan, 0.95);
      g.userData.beltArrowMat = arrowMat;
      if (isGate) {
        /* 入口ゲート: コリドーを跨ぐ門と、大きな矢印。「ここから流される」の予告 */
        const frame = mats.frame || Obstacles._material('cgFrame', C.dark);
        grp.add(new THREE.Mesh(ZoneKit.merge([
          { g: ZoneKit.box(0.22, CFG.H + 0.5, 0.22), p: [-(CFG.HALF_W + 0.12), CFG.H / 2, 0] },
          { g: ZoneKit.box(0.22, CFG.H + 0.5, 0.22), p: [CFG.HALF_W + 0.12, CFG.H / 2, 0] },
          { g: ZoneKit.box(CFG.HALF_W * 2 + 0.5, 0.22, 0.22), p: [0, CFG.H + 0.12, 0] },
          { g: ZoneKit.box(CFG.HALF_W * 2 + 0.5, 0.22, 0.22), p: [0, -0.12, 0] }
        ]), frame));
        const big = [];
        [0.55, CFG.H - 0.55].forEach((y) => {
          big.push({ g: ZoneKit.box(0.9, 0.16, 0.16), p: [0, y, 0] });
          big.push({ g: ZoneKit.box(0.30, 0.30, 0.16), p: [0.45, y, 0], r: [0, 0, Math.PI / 4] });
        });
        const arrows = new THREE.Mesh(ZoneKit.merge(big), arrowMat);
        grp.add(arrows);
        g.userData.beltArrows = arrows;
      } else {
        /* 矢印の帯（粒）: 面に並ぶ小さな矢羽根。流れの向きへ animated に流れる */
        const parts = [];
        for (let i = 0; i < 4; i++) {
          const z = -0.36 + i * 0.24;
          /* 矢羽根（軸＋斜めの羽）。遠くからでも向きが読めるよう太めに彫る */
          parts.push({ g: ZoneKit.box(0.60, 0.05, 0.14), p: [0, 0.035, z] });
          parts.push({ g: ZoneKit.box(0.26, 0.05, 0.14), p: [0.22, 0.035, z - 0.13], r: [0, -0.7, 0] });
          parts.push({ g: ZoneKit.box(0.26, 0.05, 0.14), p: [0.22, 0.035, z + 0.13], r: [0, 0.7, 0] });
        }
        const lanes = new THREE.Group();
        CFG.LANES.forEach((l) => {
          const m = new THREE.Mesh(ZoneKit.merge(parts), arrowMat);
          m.position.x = l * CFG.LANE_W;
          m.renderOrder = 4;
          lanes.add(m);
        });
        grp.add(lanes);
        g.userData.beltArrows = lanes;
        /* 流れの筋（面のすぐ上を走る光） */
        const lineMat = emis(mats.line || C.cyan, 0.34);
        const line = new THREE.Mesh(new THREE.BoxGeometry(CFG.HALF_W * 2 - 0.1, 0.02, 1), lineMat);
        line.position.y = 0.05;
        grp.add(line);
      }
      g.add(grp);
      g.userData.belt = grp;
      g.userData.beltLen = 1;
      g.userData.beltMats = own;
    };
    /* 色の扉（契約§4.5）: 琥珀＝LUMEN／藍＝UMBRA。同色は枠だけ（通れる）、
       異色は 0〜2.30 を塞ぐ板（跳んでも潜っても抜けられない＝レーン移動）。
       色は place() が o.surface と型から決めるので、ここでは形だけ作る。 */
    const doorKit = (mats) => {
      mats = mats || {};
      const own = [];
      const pane = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, transparent: true,
                                                 opacity: 0.55, depthWrite: false });
      own.push(pane);
      const edge = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
      own.push(edge);
      const TOP = (type === 'DOORX') ? OBS.DOORX.y1 : 2.30;
      const frameMat = mats.frame || Obstacles._material('drFrame', C.dark);
      /* 枠（同色・異色とも同じ形。どちらの扉かは色で見せる） */
      g.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.10, TOP, D * 0.9), p: [-(w / 2 - 0.05), TOP / 2, 0] },
        { g: ZoneKit.box(0.10, TOP, D * 0.9), p: [w / 2 - 0.05, TOP / 2, 0] },
        { g: ZoneKit.box(w, 0.16, D * 0.9), p: [0, TOP - 0.08, 0] },
        { g: ZoneKit.box(w, 0.12, D * 0.9), p: [0, 0.06, 0] }
      ]), frameMat));
      /* 枠の内側を走る色の光（遠くから色が読める） */
      const rim = new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(0.07, TOP, D * 0.95), p: [-(w / 2 - 0.035), TOP / 2, 0] },
        { g: ZoneKit.box(0.07, TOP, D * 0.95), p: [w / 2 - 0.035, TOP / 2, 0] },
        { g: ZoneKit.box(w, 0.07, D * 0.95), p: [0, TOP - 0.03, 0] }
      ]), edge);
      g.add(rim);
      if (type === 'DOORX') {
        /* 異色の扉は「膜」で塞がっている（通れないことが一目で分かる） */
        const mem = new THREE.Mesh(new THREE.BoxGeometry(w, TOP - 0.1, D * 0.35), pane);
        mem.position.y = TOP / 2;
        mem.renderOrder = 3;
        g.add(mem);
        const barsMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, transparent: true,
                                                      opacity: 0.9, depthWrite: false });
        own.push(barsMat);
        const bars = [];
        for (let i = 0; i < 4; i++) bars.push({ g: ZoneKit.box(w * 0.94, 0.05, D * 0.4), p: [0, 0.4 + i * 0.55, 0] });
        const bm = new THREE.Mesh(ZoneKit.merge(bars), barsMat);
        bm.renderOrder = 3;
        g.add(bm);
        g.userData.doorBars = bm;
      }
      g.userData.door = { rim: rim, mats: own };
      g.userData.doorMats = own;
    };
    /* 浮上足場（契約§4.5）: 沈んだ土台（判定の外）と、浮き上がる天板。
       天板の高さは place() が MOT.liftK から引く＝ **見た目＝判定**。 */
    const liftKit = (mats) => {
      mats = mats || {};
      const own = [];
      const TOP = OBS.LIFTPAD.y1;                      // 0.60（判定どおり）
      const base = mats.base || Obstacles._material('lpBase', C.dark);
      /* 土台（面に埋まっている部分＝判定の外。沈んだときはここだけが見える） */
      g.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.06, D + 0.12), p: [0, 0.03, 0] },
        { g: ZoneKit.box(w, 0.04, 0.10), p: [0, 0.02, -(D / 2 + 0.06)] },
        { g: ZoneKit.box(w, 0.04, 0.10), p: [0, 0.02, D / 2 + 0.06] }
      ]), base));
      const warnMat = new THREE.MeshBasicMaterial({ color: C.warn, fog: true });
      own.push(warnMat);
      g.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, 0.03, 0.07), p: [0, 0.055, -(D / 2 - 0.03)] },
        { g: ZoneKit.box(w, 0.03, 0.07), p: [0, 0.055, D / 2 - 0.03] }
      ]), warnMat));
      /* 天板（**浮ききった姿＝判定どおりの 0〜0.60** で作り、place() が liftK で縦に潰す）。
         ＝ 見た目と判定が同じ寸法から出る（ズレ検査もそのまま通る）。 */
      const top = new THREE.Group();
      top.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, TOP * 0.86, D * 0.92), p: [0, TOP * 0.43, 0] },
        { g: ZoneKit.box(w, TOP * 0.14, D), p: [0, TOP * 0.93, 0] }
      ]), mats.body || Obstacles._material('lpBody', C.body)));
      const hotMat = new THREE.MeshBasicMaterial({ color: C.red, fog: true });
      own.push(hotMat);
      top.add(new THREE.Mesh(ZoneKit.merge([
        { g: ZoneKit.box(w, TOP * 0.07, D), p: [0, TOP * 0.985, 0] },
        { g: ZoneKit.box(w * 0.9, TOP * 0.05, D * 0.5), p: [0, TOP * 0.55, 0] }
      ]), hotMat));
      g.add(top);
      g.userData.lift = { top: top, mats: own };
      g.userData.liftMats = own;
    };
    /* 巨大魚の部位（契約§4.4 S5）: 牙・ヒレ・尾。判定どおりの寸法で彫る */
    const fishKit = (mats) => {
      mats = mats || {};
      const flesh = mats.flesh || Obstacles._material('fsFlesh', C.body);
      const bone = mats.bone || Obstacles._material('fsBone', C.steel);
      const own = [];
      const hot = new THREE.MeshBasicMaterial({ color: mats.hotCol || C.warn, fog: true });
      own.push(hot);
      if (type === 'FISH_TOOTH') {
        const TOP = t.y1;
        box(w, 0.16, D * 0.9, flesh, 0, 0.08, 0);                       // 歯肉
        for (let i = 0; i < 4; i++) {
          const px = -w / 2 + w * (i + 0.5) / 4;
          solid(new THREE.ConeGeometry(0.11, TOP - 0.14, 5), bone, px, 0.16 + (TOP - 0.14) / 2, 0);
        }
        box(w, 0.10, D * 1.02, hot, 0, TOP - 0.05, 0);
      } else if (type === 'FISH_FIN') {
        /* ヒレ: 床から天井まで貫く膜と骨（1レーン全高＝レーン移動で避ける） */
        const H = CFG.H;
        box(w * 0.80, H, D * 0.5, flesh, 0, H / 2, 0);
        for (let i = 0; i < 4; i++) {
          box(0.10, H - 0.2, D * 0.62, bone, -w * 0.32 + w * 0.64 * i / 3, H / 2, 0, [0, 0, 0.02 * (i - 1.5)]);
        }
        box(w, 0.12, D * 0.9, hot, 0, 0.06, 0);
        box(w, 0.12, D * 0.9, hot, 0, H - 0.06, 0);
      } else {
        /* 尾: 横へ薙ぐ（動きは LASER_SCAN と同じ規則）。1レーン幅・全高 */
        const H = CFG.H;
        box(w * 0.66, H, D * 0.55, flesh, 0, H / 2, 0);
        box(w * 0.94, H * 0.72, D * 0.35, flesh, 0, H / 2, 0.02);
        for (let i = 0; i < 3; i++) box(0.09, H - 0.3, D * 0.5, bone, (i - 1) * w * 0.3, H / 2, 0);
        box(w * 0.98, 0.10, D * 0.9, hot, 0, 0.05, 0);
        box(w * 0.98, 0.10, D * 0.9, hot, 0, H - 0.05, 0);
      }
      g.userData.fish = true;
      g.userData.fishMats = own;
      /* 発光部は materials をビュー専用に持つので、捨てるときに一緒に開放する */
      const add = (list) => { list.forEach((m) => { if (own.indexOf(m) < 0) own.push(m); }); };
      add([hot]);
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

    const x = { t: t, C: C, g: g, w: w, D: D, box: box, solid: solid, bridge: bridge,
                lamp: lamp, stripes: stripes, beamMat: beamMat, parts: parts,
                padKit: padKit, syncKit: syncKit, dropKit: dropKit, columnKit: columnKit,
                beltKit: beltKit, doorKit: doorKit, liftKit: liftKit, fishKit: fishKit,
                gateKit: gateKit, zeroFieldKit: zeroFieldKit, netKit: netKit,
                shardKit: shardKit, variant: variant || '' };
    const childs0 = g.children.length, blink0 = g.userData.blink.length, parts0 = parts.length;
    const lamps0 = lampParts.length;
    skin.build(type, x);
    /* スキンが S4 の新ギミック（P3b）を知らないゾーンでも必ず動く形にする。
       汎用の当て板を捨ててから共通の骨組みを建てる＝見た目と判定がずれない。 */
    const needKit = (t.pad && !g.userData.pad) || (type === 'SYNCGAP' && !g.userData.sync) ||
                    (type === 'DROPCEIL' && !g.userData.drop) || (type === 'COLUMN' && !g.userData.column) ||
                    (t.belt && !g.userData.belt) || (t.door && !g.userData.door) ||
                    (type === 'LIFTPAD' && !g.userData.lift) || (t.fish && !g.userData.fish) ||
                    (t.gate && !g.userData.gate) || (t.net && !t.gate && !g.userData.net) ||
                    (type === 'ZEROFIELD' && !g.userData.zfield) ||
                    (type === 'SHARDGAP' && !g.userData.shard);
    if (needKit) {
      for (let i = g.children.length - 1; i >= childs0; i--) { const c = g.children[i]; g.remove(c); ZoneKit.free(c); }
      g.userData.blink.length = blink0;
      lampParts.length = lamps0;
      for (let i = parts.length - 1; i >= parts0; i--) if (parts[i].g.dispose) parts[i].g.dispose();
      parts.length = parts0;
      if (t.gate) gateKit(null);
      else if (type === 'SHARDGAP') shardKit(null);
      else if (t.net) netKit(null);
      else if (type === 'ZEROFIELD') zeroFieldKit(null);
      else if (t.pad) padKit(null);
      else if (type === 'SYNCGAP') syncKit(null);
      else if (type === 'DROPCEIL') dropKit(null);
      else if (t.belt) beltKit(null);
      else if (t.door) doorKit(null);
      else if (type === 'LIFTPAD') liftKit(null);
      else if (t.fish) fishKit(null);
      else columnKit(null);
    }
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
    const xc = (mot === 'scan') ? (MOT.scanLane(o, dist) * CFG.LANE_W)
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

    /* 海流ベルト（契約§4.5 / S5）: 矢印の帯は「1秒ぶん」の長さに伸ばし、
       流れの向きへ滑らせる。帯そのものは当たり判定を持たない。 */
    if (OBS[o.type].belt && ud.belt) {
      const cur = (o.params && o.params.cur) || {};
      const unit = cur.unitM || CFG.REF_SPEED;
      /* 天井側のビューは Z軸まわりに180度回っているので、ローカルの +x は世界の -x。
         画面上の流れの向きと矢印の向きを一致させるため、天井側は符号を返す。 */
      const dir = (cur.dir || 1) * ((o.surface === 'ceil') ? -1 : 1);
      if (o.type === 'CURRENT') {
        ud.belt.scale.z = (unit * CFG.CURRENT.SEG_T) / (ud.beltLen || 1);
        const a = ud.beltArrows;
        if (a) {
          /* 流れの向きへ矢羽根を向け、距離に比例して横へ送る */
          a.rotation.y = (dir > 0) ? 0 : Math.PI;
          const slide = ((dist * 0.35) % CFG.LANE_W) * (dir > 0 ? 1 : -1);
          a.position.x = slide - (dir > 0 ? CFG.LANE_W / 2 : -CFG.LANE_W / 2);
        }
      } else if (ud.beltArrows) {
        ud.beltArrows.rotation.y = (dir > 0) ? 0 : Math.PI;
      }
      if (ud.beltMats) {
        const fl = 0.72 + 0.28 * Math.sin(dist * 0.9 + (t || 0) * 5);
        ud.beltMats.forEach((m) => { m.opacity = (m.__base || (m.__base = m.opacity)) * fl; });
      }
      if (ud.beltArrowMat) {
        ud.beltArrowMat.color.setHex((o.surface === 'ceil') ? 0x8b9bff : 0xffb347);
      }

    } else if (OBS[o.type].door && ud.door) {
      /* 色の扉（契約§4.5）: 床＝琥珀が自分の色（LUMEN）／天井＝藍が自分の色（UMBRA）。
         同色の扉（DOOR）は自分の色、異色の扉（DOORX）は相手の色で光る。 */
      const mine = (o.surface === 'ceil') ? 0x8b9bff : 0xffb347;
      const other = (o.surface === 'ceil') ? 0xffb347 : 0x8b9bff;
      const col = (o.type === 'DOOR') ? mine : other;
      if (ud.doorMats) ud.doorMats.forEach((m) => { m.color.setHex(col); });
      if (ud.doorBars) ud.doorBars.position.z = Math.sin(dist * 0.6 + (t || 0) * 2) * 0.03;

    } else if (mot === 'lift' && ud.lift) {
      /* 浮上足場（契約§4.5）: 天板の高さは **判定と同じ MOT.liftK** から引く。
         沈みきったら天板を消す＝「今は通れる」が目で分かる。 */
      const k = MOT.liftK(o, dist);
      const s = ud.lift.top;
      s.scale.y = Math.max(0.0001, k);
      s.visible = (k > CFG.LIFT.EPS);
      if (ud.liftMats) ud.liftMats.forEach((m) => { m.color.setHex(k > 0.5 ? 0xff5540 : 0xffd15a); });

    } else if (mot === 'sync' && ud.sync) {
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

    } else if (mot === 'drop' && ud.drop) {
      /* 落ちる天井: 予告（ひび・砂）→ 落下(0.5秒) → 着地。すべて MOT の距離規則から引く */
      const f = MOT.dropFall(o, dist), wr = MOT.dropWarn(o, dist);
      const d = ud.drop;
      const topY = CFG.H - OBS.DROPCEIL.y1;              // 天井にはまっているときのブロック下端
      const e = f * f;                                    // 落下は加速する
      d.block.position.y = U.lerp(topY, 0, e);
      d.block.position.x = (f > 0 && f < 1) ? Math.sin(f * 9) * 0.05 : 0;
      d.block.rotation.z = (f >= 1) ? 0.012 : (f * 0.06);
      d.hole.visible = (f > 0);                           // 抜けた天井（穴）
      d.hole.material.opacity = 0.9 * U.clamp(f * 3, 0, 1);
      if (d.crack) { d.crack.visible = (f <= 0 && wr > 0); d.crack.scale.setScalar(0.4 + 0.6 * wr); }
      if (d.rim) d.rim.visible = (f > 0);
      if (d.sand) {
        /* 落ちる砂＝**天井の穴から落ちたブロックまでを結ぶ土煙の筋**。
           落下中は濃く、着地後も薄く残る。40m 先でも「天井が落ちた」と分かる合図。 */
        d.sand.visible = (wr > 0);
        const top = CFG.H - 0.05;
        const bot = (f < 1) ? (d.block.position.y + OBS.DROPCEIL.y1) : OBS.DROPCEIL.y1;
        const hh = Math.max(0.25, top - bot);
        d.sand.position.y = (top + bot) / 2;
        d.sand.scale.y = hh / 1.4;
        d.sand.material.opacity = (f <= 0) ? 0.30 * wr : (f < 1 ? 0.55 : 0.18);
      }

    } else if (mot === 'bridge' && ud.bridge) {
      /* 崩れる橋（契約§4.4 S3）: 板は判定の外（乗っている間は無害）。
         「踏んだ時刻+0.4秒」＝ MOT.bridgeFallAt(o) を越えた瞬間から、
         板が1枚ずつ傾いて落ちていく＝ bands() が穴を返し始めるのと同じ距離。 */
      const b = ud.bridge, lead = MOT.bridgeLead(o), D = OBS[o.type].depth;
      const L = lead + D;                       // 板全体の長さ（実寸）
      const zFar = -D / 2, zNear = D / 2 + lead;
      b.pit.scale.z = L + 2.2;
      b.pit.position.z = (zFar + zNear) / 2;
      if (b.mark) {
        b.mark.position.z = zNear;                 // 板の手前端＝踏み口
        b.mark.visible = (dist < MOT.bridgeFallAt(o) + 2);
      }
      const fallAt = MOT.bridgeFallAt(o);
      const slabLen = L / b.n;
      const dm = b.dummy;
      for (let i = 0; i < b.n; i++) {
        const hz = ZoneKit.hash(i, 17);
        const f = U.clamp((dist - fallAt - hz * 1.1) / 2.6, 0, 1);
        const sgn = (i % 2) ? 1 : -1;
        if (f >= 1) {                                   // 落ちきった板は畳んで消す
          dm.position.set(0, -9999, 0);
          dm.rotation.set(0, 0, 0);
          dm.scale.set(0.0001, 0.0001, 0.0001);
        } else {
          dm.scale.set(1, 1, slabLen * 0.92);
          dm.position.set(sgn * f * 0.5, -f * f * 5.5, zFar + (i + 0.5) * slabLen + f * 1.1);
          dm.rotation.set(sgn * f * 0.9, f * 0.35, sgn * f * 1.1);
        }
        dm.updateMatrix();
        for (let k = 0; k < b.ims.length; k++) b.ims[k].setMatrixAt(i, dm.matrix);
      }
      for (let k = 0; k < b.ims.length; k++) b.ims[k].instanceMatrix.needsUpdate = true;

    } else if (mot === 'scan' && ud.mark) {
      /* 予告: 到達した瞬間の位置に床/天井のマーカーを出す */
      const mx = MOT.scanLane(o, o.at) * CFG.LANE_W;
      ud.mark.position.x = lx(mx);
      if (ud.range) {
        const p = o.params.scan;
        const a = Math.min(p.from, p.to) * CFG.LANE_W, b = Math.max(p.from, p.to) * CFG.LANE_W;
        ud.range.position.x = lx((a + b) / 2);
        ud.range.scale.x = (b - a) + CFG.LANE_W;
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
