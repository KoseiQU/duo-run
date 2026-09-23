/* ============================================================================
   DUO RUN — chunks.js  チャンク定義・ステージ定義・生成器・公平性検証（§4.6 / §4.7）

   ■ 認識しておくこと
   - チャンク内の `at` は **基準速度 CFG.REF_SPEED(10m/s) での距離** として書く。
     生成時に「その地点の速度 / 10」を掛けて伸縮するので、速度が上がっても
     プレイヤーに与えられる“時間”は変わらない＝§4.7の時間ベースの不変条件を自然に満たす。
   - PILLAR / LASER は床天井の両方に効く（OBS.both）。配列は floor 側に書いておけば
     生成時に surface:'both' になる（契約§4.6のデータ形は floor/ceil/events のまま）。
   ============================================================================ */
'use strict';

/* ---------------------------------------------------------------- チャンク定義
   契約 §4.3 改訂（2026-09-21）に合わせた構成。
   ・回避の主役は「横に避ける（lane）」と「飛び越える（jump）」。
   ・スライディングは WALLHOLE（壁の穴）だけ。rank3 以上・1チャンクに最大1・連続禁止。
   ・PILLAR / LASER_V は床天井の両方に効く（OBS.both）。floor 配列に書けば生成時に
     surface:'both' になる（1つで「両者にレーン移動を要求するウォール」になる）。
   ・WALLHOLE は生成時に「穴のレーン=WALLHOLE / 残り2レーン=WALLSOLID」へ展開される。
   ------------------------------------------------------------------------- */
const CHUNK_DEFS = [
  /* --- rank1: 1種ずつ・ゆったり（S1相当。スライディングは一切出さない） ---- */
  { id: 'c1_rover_f', zone: 'neon', lengthM: 46, difficulty: 1, minSpeed: 0,
    floor: [{ at: 14, lane: 0, type: 'ROVER' }, { at: 32, lane: -1, type: 'ROVER' }], ceil: [], events: [] },
  { id: 'c1_rover_c', zone: 'neon', lengthM: 46, difficulty: 1, minSpeed: 0,
    floor: [], ceil: [{ at: 14, lane: 1, type: 'ROVER' }, { at: 32, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c1_gap_f', zone: 'neon', lengthM: 50, difficulty: 1, minSpeed: 0,
    floor: [{ at: 16, lane: 0, type: 'ROVER' }, { at: 36, lane: 1, type: 'ROVER' }], ceil: [], events: [] },
  { id: 'c1_gap_c', zone: 'neon', lengthM: 50, difficulty: 1, minSpeed: 0,
    floor: [], ceil: [{ at: 16, lane: -1, type: 'ROVER' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c1_lowl_f', zone: 'neon', lengthM: 46, difficulty: 1, minSpeed: 0,
    floor: [{ at: 14, lane: 1, type: 'LASER_LOW' }, { at: 32, lane: 0, type: 'LASER_LOW' }], ceil: [], events: [] },
  { id: 'c1_lowl_c', zone: 'neon', lengthM: 46, difficulty: 1, minSpeed: 0,
    floor: [], ceil: [{ at: 14, lane: 0, type: 'LASER_LOW' }, { at: 32, lane: -1, type: 'LASER_LOW' }], events: [] },
  { id: 'c1_pillar', zone: 'neon', lengthM: 48, difficulty: 1, minSpeed: 0,
    floor: [{ at: 16, lane: -1, type: 'PILLAR' }, { at: 34, lane: 1, type: 'PILLAR' }], ceil: [], events: [] },
  { id: 'c1_laserv', zone: 'neon', lengthM: 48, difficulty: 1, minSpeed: 0,
    floor: [{ at: 16, lane: 1, type: 'LASER_V' }, { at: 34, lane: -1, type: 'LASER_V' }], ceil: [], events: [] },
  { id: 'c1_weave_a', zone: 'neon', lengthM: 48, difficulty: 1, minSpeed: 0,
    floor: [{ at: 15, lane: -1, type: 'PILLAR' }, { at: 33, lane: 1, type: 'LASER_V' }], ceil: [], events: [] },
  { id: 'c1_weave_b', zone: 'neon', lengthM: 48, difficulty: 1, minSpeed: 0,
    floor: [{ at: 15, lane: 0, type: 'LASER_V' }, { at: 33, lane: -1, type: 'PILLAR' }], ceil: [], events: [] },
  { id: 'c1_laserv_b', zone: 'neon', lengthM: 48, difficulty: 1, minSpeed: 0,
    floor: [{ at: 16, lane: 0, type: 'LASER_V' }, { at: 34, lane: 1, type: 'LASER_V' }], ceil: [], events: [] },

  /* --- rank2: 床と天井を交互に・少し詰める -------------------------------- */
  { id: 'c2_alt_a', zone: 'neon', lengthM: 54, difficulty: 2, minSpeed: 0,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 34, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 23, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'c2_alt_b', zone: 'neon', lengthM: 54, difficulty: 2, minSpeed: 0,
    floor: [{ at: 13, lane: -1, type: 'ROVER' }, { at: 40, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 25, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'c2_sync', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0,
    floor: [{ at: 14, lane: 0, type: 'ROVER' }, { at: 34, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 14, lane: 0, type: 'ROVER' }, { at: 34, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'c2_weave', zone: 'neon', lengthM: 52, difficulty: 2, minSpeed: 0,
    floor: [{ at: 14, lane: -1, type: 'PILLAR' }, { at: 32, lane: 1, type: 'PILLAR' }], ceil: [], events: [] },
  { id: 'c2_lv_weave', zone: 'neon', lengthM: 52, difficulty: 2, minSpeed: 0,
    floor: [{ at: 14, lane: 1, type: 'LASER_V' }, { at: 32, lane: 0, type: 'LASER_V' }], ceil: [], events: [] },
  { id: 'c2_mix', zone: 'neon', lengthM: 56, difficulty: 2, minSpeed: 0,
    floor: [{ at: 12, lane: 1, type: 'ROVER' }, { at: 42, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 27, lane: 0, type: 'ROVER' }], events: [] },

  /* --- rank3: 2体に別々の動作を同時に要求／ワイド梁／壁の穴 --------------- */
  { id: 'c3_dual_a', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 34, lane: -1, type: 'WIDEBAR' }],
    ceil:  [{ at: 12, lane: 0, type: 'WIDEBAR' }, { at: 34, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c3_wide', zone: 'neon', lengthM: 58, difficulty: 3, minSpeed: 0,
    floor: [{ at: 14, lane: -1, type: 'WIDEBAR' }, { at: 46, lane: 0, type: 'WIDEBAR' }],
    ceil:  [{ at: 30, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c3_mix', zone: 'neon', lengthM: 58, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 28, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 44, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'c3_gauntlet', zone: 'neon', lengthM: 60, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: -1, type: 'LASER_V' }, { at: 30, lane: 0, type: 'ROVER' }, { at: 46, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  /* 壁の穴（唯一のスライディング要素・1チャンクに1つだけ・連続禁止）。
     密度の規範（§4.7）に乗るよう、前後に両者同時のウォールを持たせる。 */
  { id: 'c3_wallhole_f', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0, wallhole: 1, dense: 1,
    floor: [{ at: 14, lane: 0, type: 'WALLHOLE' }, { at: 29, lane: -1, type: 'ROVER' },
            { at: 44, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 14, lane: 1, type: 'ROVER' }, { at: 29, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c3_wallhole_c', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0, wallhole: 1, dense: 1,
    floor: [{ at: 14, lane: 1, type: 'ROVER' }, { at: 29, lane: 0, type: 'LASER_LOW' },
            { at: 44, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 14, lane: -1, type: 'WALLHOLE' }, { at: 29, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c3_wallhole_x', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0, wallhole: 1, dense: 1,
    floor: [{ at: 12, lane: -1, type: 'ROVER' }, { at: 27, lane: 1, type: 'WALLHOLE' },
            { at: 44, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 12, lane: 0, type: 'LASER_LOW' }, { at: 27, lane: -1, type: 'PILLAR' },
            { at: 44, lane: 1, type: 'ROVER' }], events: [] },

  /* ==========================================================================
     S2「ネオン都市・夜」の動くレーザー（契約§4.4 / §4.5）
     ------------------------------------------------------------------------
     params の書き方（運動は MOT が唯一の出所）:
       scan:  { from, to, phase }  横スキャン縦光柱。phase = **到達した瞬間の位相**
                                   0 → from の端（溜め）／0.5 → to の端／0.25 → 真ん中を全速で通過
       rot:   { phase }            回転レーザー。phase 0.25 = 腕が真上（1レーン全高）
                                   0 / 0.5 = 腕が寝ている（＝低いのでジャンプで越える）
       blink: { onAtArrival }      点滅。false なら**到達時は消えている＝そのまま走り抜ける**
     periodM（往復の長さ）は書かなければ CFG.LASER の既定値。生成時に速度でスケールされる
     ので、速度が上がっても「1往復の秒数」は変わらない。
     ========================================================================== */
  /* --- rank2: 動くレーザーを1本ずつ覚える --------------------------------
     どのチャンクも「横に避ける」と「飛び越える」が同じくらい出るように組む
     （契約§4.3 の動作比率。LASER_SCAN / LASER_V は both＝2体ともレーン移動なので
     1本で“レーン2回ぶん”の要求になる。跳ぶ要求を同数入れて釣り合わせる）。 */
  { id: 'c2_scan_end', zone: 'neon', lengthM: 62, difficulty: 2, minSpeed: 0, moving: 1,
    floor: [{ at: 14, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 32, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 50, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c2_scan_far', zone: 'neon', lengthM: 62, difficulty: 2, minSpeed: 0, moving: 1,
    floor: [{ at: 14, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.5 } } },
            { at: 50, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 32, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c2_scan_mid', zone: 'neon', lengthM: 62, difficulty: 2, minSpeed: 0, moving: 1,
    /* 到達時は 0.5 レーン＝レーン0と1の両方を塞ぐ。空いているのは左だけ */
    floor: [{ at: 14, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 0, to: 1, phase: 0.25 } } },
            { at: 32, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 50, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 'c2_blink_v', zone: 'neon', lengthM: 64, difficulty: 2, minSpeed: 0, moving: 1,
    /* 1本目は到達時に点いている（避ける）／2本目は消えている（そのまま通れる） */
    floor: [{ at: 14, lane: 1, type: 'LASER_V', params: { blink: { onAtArrival: true } } },
            { at: 34, lane: 0, type: 'LASER_V', params: { blink: { onAtArrival: false } } },
            { at: 52, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 34, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'c2_blink_low', zone: 'neon', lengthM: 58, difficulty: 2, minSpeed: 0, moving: 1,
    floor: [{ at: 32, lane: 0, type: 'LASER_LOW', params: { blink: { onAtArrival: false } } },
            { at: 48, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 14, lane: -1, type: 'LASER_LOW', params: { blink: { onAtArrival: true } } }], events: [] },

  /* 回転レーザーの入門2本は rank2（S2 の前半から顔を出す） */
  { id: 'c2_rot_up', zone: 'neon', lengthM: 60, difficulty: 2, minSpeed: 0, moving: 1,
    /* 到達時に腕が真上＝そのレーンだけ全高で塞がる（レーン移動） */
    floor: [{ at: 16, lane: 0, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } },
            { at: 48, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 32, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c2_rot_low', zone: 'neon', lengthM: 62, difficulty: 2, minSpeed: 0, moving: 1,
    /* 到達時に腕が寝ている＝低いのでジャンプで越える */
    floor: [{ at: 16, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.5 } } },
            { at: 50, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 33, lane: 0, type: 'ROVER' }], events: [] },
  /* --- rank3: 斜めの腕・組み合わせ ---------------------------------------- */
  { id: 'c3_rot_lean', zone: 'neon', lengthM: 60, difficulty: 3, minSpeed: 0, moving: 1,
    /* 斜め＝根元は跳べる／先は立っている。レーンで要求が変わる */
    floor: [{ at: 16, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.18 } } },
            { at: 48, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 32, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c3_rot_ceil', zone: 'neon', lengthM: 60, difficulty: 3, minSpeed: 0, moving: 1,
    floor: [{ at: 32, lane: 0, type: 'ROVER' }, { at: 48, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 16, lane: 1, type: 'LASER_ROT', params: { rot: { phase: 0.72 } } }], events: [] },
  { id: 'c3_rot_pair', zone: 'neon', lengthM: 64, difficulty: 3, minSpeed: 0, moving: 1,
    /* 床と天井で通過タイミングがずれる（契約§4.4「床側と天井側で通過タイミングが変わる」） */
    floor: [{ at: 16, lane: 1, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } },
            { at: 50, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 33, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.5 } } }], events: [] },
  { id: 'c3_scan_rot', zone: 'neon', lengthM: 64, difficulty: 3, minSpeed: 0, moving: 1,
    floor: [{ at: 16, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 50, lane: 0, type: 'LASER_ROT', params: { rot: { phase: 0.125 } } }],
    ceil:  [{ at: 33, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c3_blink_scan', zone: 'neon', lengthM: 64, difficulty: 3, minSpeed: 0, moving: 1,
    floor: [{ at: 16, lane: -1, type: 'LASER_LOW', params: { blink: { onAtArrival: true } } },
            { at: 50, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } }],
    ceil:  [{ at: 33, lane: 0, type: 'ROVER' }], events: [] },
  /* ==========================================================================
     密集チャンク（契約§4.7「密度の規範」2026-09-21）
     密度は**間隔を詰める**のではなく**両者同時要求を増やす**ことで稼ぐ
     （1つのウォールで床と天井の両方に動作を要求する＝本作の主題そのもの）。
     ウォール間隔は 12〜14 基準m＝1.2〜1.4秒で、反応窓(0.45)・同時要求(0.6)・
     ジャンプ連続(0.70)・ジャンプ→横移動(0.92) のすべてを満たす。
     ========================================================================== */
  { id: 'd3_duo_a', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0, dense: 1,
    floor: [{ at: 11, lane: 0, type: 'ROVER' }, { at: 22, lane: 1, type: 'LASER_V' },
            { at: 33, lane: -1, type: 'ROVER' }, { at: 44, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 11, lane: 1, type: 'ROVER' }, { at: 33, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'd3_duo_b', zone: 'neon', lengthM: 54, difficulty: 3, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 11, lane: 1, type: 'ROVER' },
            { at: 23, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0.5 } } },
            { at: 35, lane: 0, type: 'LASER_LOW' }, { at: 47, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 11, lane: -1, type: 'ROVER' }, { at: 35, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'd3_duo_c', zone: 'neon', lengthM: 54, difficulty: 3, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 11, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.5 } } },
            { at: 23, lane: 1, type: 'PILLAR' }, { at: 35, lane: 0, type: 'ROVER' },
            { at: 47, lane: 0, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } }],
    ceil:  [{ at: 11, lane: 0, type: 'ROVER' }, { at: 35, lane: -1, type: 'LASER_LOW' },
            { at: 47, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'd3_duo_d', zone: 'neon', lengthM: 54, difficulty: 3, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 11, lane: 0, type: 'LASER_V', params: { blink: { onAtArrival: true } } },
            { at: 23, lane: 1, type: 'ROVER' }, { at: 35, lane: -1, type: 'ROVER' },
            { at: 47, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 0, to: 1, phase: 0.25 } } }],
    ceil:  [{ at: 23, lane: -1, type: 'ROVER' }, { at: 35, lane: 0, type: 'LASER_LOW' }], events: [] },
  /* 最も密（S2 後半・エンドレス後半）: 5ウォール × 両者同時 = 10回 */
  { id: 'd3_duo_e', zone: 'neon', lengthM: 62, difficulty: 3, minSpeed: 0, dense: 2,
    floor: [{ at: 11, lane: 0, type: 'ROVER' }, { at: 22, lane: 1, type: 'PILLAR' },
            { at: 33, lane: -1, type: 'ROVER' }, { at: 44, lane: 0, type: 'LASER_V' },
            { at: 55, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 11, lane: -1, type: 'LASER_LOW' }, { at: 33, lane: 1, type: 'ROVER' },
            { at: 55, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'd3_duo_f', zone: 'neon', lengthM: 62, difficulty: 3, minSpeed: 0, dense: 2, moving: 1,
    floor: [{ at: 11, lane: 1, type: 'ROVER' },
            { at: 22, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.25 } } },
            { at: 33, lane: 0, type: 'ROVER' },
            { at: 44, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } },
            { at: 55, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 11, lane: -1, type: 'ROVER' }, { at: 33, lane: 1, type: 'LASER_LOW' },
            { at: 44, lane: 1, type: 'ROVER' }, { at: 55, lane: -1, type: 'ROVER' }], events: [] },
  /* 中くらいの密度（S2 前半・S1 後半） */
  { id: 'd2_duo_a', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0, dense: 1,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 27, lane: -1, type: 'LASER_V' },
            { at: 42, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 12, lane: -1, type: 'LASER_LOW' }, { at: 42, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'd2_duo_b', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0, dense: 1,
    floor: [{ at: 12, lane: 1, type: 'ROVER' }, { at: 27, lane: 0, type: 'PILLAR' },
            { at: 42, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 12, lane: 0, type: 'ROVER' }, { at: 42, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 'd2_duo_c', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 12, lane: 1, type: 'ROVER' },
            { at: 27, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 42, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 12, lane: 0, type: 'ROVER' }, { at: 42, lane: -1, type: 'ROVER' }], events: [] },

  { id: 'c3_scan_dual', zone: 'neon', lengthM: 66, difficulty: 3, minSpeed: 0, moving: 1,
    floor: [{ at: 16, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.25 } } },
            { at: 34, lane: 1, type: 'ROVER' },
            { at: 52, lane: 1, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0 } } }],
    ceil:  [{ at: 34, lane: -1, type: 'ROVER' }], events: [] },

  /* ==========================================================================
     S3「古代遺跡・外周」（契約§4.4）
     ------------------------------------------------------------------------
     新ギミック:
       BRIDGE      崩れる橋。踏んで 0.4秒後にそのレーンの床が落ちる。
                   抜け方は「レーン移動」か「跳び越す」（判定は occ が jump のみ安全と出す）。
       LASER_SCAN  遺跡スキンでは **振り子の刃**（大型化）。動きの定義はネオンと同じ。
     密度は S2 より高い（6→10回/100m）ので、両者同時要求のウォールを厚く敷く。
     §4.7 の「両者同時要求の余白」は S3 以降 0.45秒（stage.reactBoth）。
     ========================================================================== */
  /* --- rank2: 新ギミックを1つずつ覚える ---------------------------------- */
  { id: 'r2_bridge_f', zone: 'ruins', lengthM: 56, difficulty: 2, minSpeed: 0, s3: 1, bridge: 1,
    floor: [{ at: 14, lane: 0, type: 'BRIDGE' }, { at: 34, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 24, lane: -1, type: 'ROVER' }, { at: 44, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'r2_bridge_c', zone: 'ruins', lengthM: 56, difficulty: 2, minSpeed: 0, s3: 1, bridge: 1,
    floor: [{ at: 24, lane: 1, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 14, lane: -1, type: 'BRIDGE' }, { at: 34, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'r2_bridge_x', zone: 'ruins', lengthM: 60, difficulty: 2, minSpeed: 0, s3: 1, bridge: 1,
    /* 床と天井で別のレーンの橋が落ちる（2体が別々に抜ける） */
    floor: [{ at: 14, lane: -1, type: 'BRIDGE' }, { at: 38, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 14, lane: 1, type: 'BRIDGE' }, { at: 50, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r2_pend_a', zone: 'ruins', lengthM: 58, difficulty: 2, minSpeed: 0, s3: 1, moving: 1, pend: 1,
    /* 振り子の刃: 到達時は端で溜まっている（＝空いているレーンが読める） */
    floor: [{ at: 16, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 44, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 30, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'r2_pend_b', zone: 'ruins', lengthM: 58, difficulty: 2, minSpeed: 0, s3: 1, moving: 1, pend: 1,
    floor: [{ at: 16, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0.5 } } },
            { at: 44, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 30, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 'r2_fire', zone: 'ruins', lengthM: 54, difficulty: 2, minSpeed: 0, s3: 1, moving: 1,
    /* 噴き出す炎（点滅）: 到達時に消えている方はそのまま走り抜ける */
    floor: [{ at: 14, lane: 1, type: 'LASER_V', params: { blink: { onAtArrival: true } } },
            { at: 32, lane: 0, type: 'LASER_LOW', params: { blink: { onAtArrival: false } } },
            { at: 46, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 32, lane: -1, type: 'ROVER' }], events: [] },

  /* --- rank3: 密（両者同時要求を厚く。契約§4.7 の 6→10回/100m を作る） ---- */
  { id: 'r3_duo_a', zone: 'ruins', lengthM: 52, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, bridge: 1,
    floor: [{ at: 10, lane: 0, type: 'ROVER' }, { at: 21, lane: 1, type: 'LASER_V' },
            { at: 31, lane: -1, type: 'BRIDGE' }, { at: 45, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 21, lane: -1, type: 'ROVER' },
            { at: 45, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 'r3_duo_b', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, moving: 1, pend: 1,
    floor: [{ at: 10, lane: 1, type: 'ROVER' },
            { at: 21, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.25 } } },
            { at: 31, lane: 0, type: 'LASER_LOW' }, { at: 45, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 31, lane: 1, type: 'ROVER' },
            { at: 45, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'r3_duo_c', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, moving: 1,
    floor: [{ at: 10, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.5 } } },
            { at: 21, lane: 1, type: 'PILLAR' }, { at: 32, lane: 0, type: 'ROVER' },
            { at: 46, lane: 0, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } }],
    ceil:  [{ at: 10, lane: 0, type: 'ROVER' }, { at: 21, lane: -1, type: 'LASER_LOW' },
            { at: 32, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'r3_duo_d', zone: 'ruins', lengthM: 56, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, bridge: 1, pend: 1, moving: 1,
    floor: [{ at: 10, lane: 0, type: 'BRIDGE' }, { at: 26, lane: 1, type: 'PILLAR' },
            { at: 37, lane: -1, type: 'ROVER' },
            { at: 48, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 0, to: 1, phase: 0.5 } } }],
    ceil:  [{ at: 26, lane: -1, type: 'ROVER' }, { at: 37, lane: 0, type: 'LASER_LOW' },
            { at: 48, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'r3_duo_e', zone: 'ruins', lengthM: 60, difficulty: 3, minSpeed: 0, s3: 1, dense: 2,
    floor: [{ at: 10, lane: 1, type: 'ROVER' }, { at: 21, lane: 0, type: 'PILLAR' },
            { at: 32, lane: -1, type: 'ROVER' }, { at: 43, lane: 1, type: 'LASER_V' },
            { at: 54, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 10, lane: -1, type: 'LASER_LOW' }, { at: 32, lane: 1, type: 'ROVER' },
            { at: 54, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r3_wallhole', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, wallhole: 1, dense: 1,
    floor: [{ at: 14, lane: 0, type: 'WALLHOLE' }, { at: 30, lane: -1, type: 'ROVER' },
            { at: 44, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 14, lane: 1, type: 'ROVER' }, { at: 30, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'r3_bridge_duo', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s3: 1, dense: 1, bridge: 1,
    /* 崩れる橋を跳び越した直後に、逆側でレーン移動を要求する（§4.7 の 0.92秒を使い切る） */
    floor: [{ at: 12, lane: 1, type: 'BRIDGE' }, { at: 34, lane: 0, type: 'LASER_V' },
            { at: 48, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 12, lane: -1, type: 'ROVER' }, { at: 34, lane: 1, type: 'ROVER' },
            { at: 48, lane: 0, type: 'LASER_LOW' }], events: [] },
  /* --- 列柱の縫い（両者にレーン移動を要求するウォールを連ねる） ------------
     PILLAR / LASER_V / LASER_SCAN は both 型＝1本で床と天井の両方に要求が出る。
     ウォール間隔 6〜8 基準m（0.6〜0.8秒）で §4.7（反応窓0.45・同時要求0.45）を満たしつつ、
     契約§4.7 の密度（S3 は 6→10回/100m）と §4.3 の比率（レーン50%前後）を作る主役。 */
  { id: 'r2_weave', zone: 'ruins', lengthM: 56, difficulty: 2, minSpeed: 0, s3: 1, dense: 1,
    floor: [{ at: 10, lane: -1, type: 'PILLAR' }, { at: 18, lane: 1, type: 'LASER_V' },
            { at: 26, lane: 0, type: 'PILLAR' }, { at: 34, lane: -1, type: 'LASER_V' },
            { at: 42, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r3_weave_a', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s3: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 14, lane: -1, type: 'LASER_V' },
            { at: 20, lane: 1, type: 'PILLAR' }, { at: 26, lane: 0, type: 'LASER_V' },
            { at: 32, lane: -1, type: 'PILLAR' }, { at: 38, lane: 1, type: 'LASER_V' },
            { at: 44, lane: 0, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r3_weave_b', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, moving: 1, pend: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_V' },
            { at: 15, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 22, lane: -1, type: 'PILLAR' }, { at: 29, lane: 1, type: 'LASER_V' },
            { at: 36, lane: 0, type: 'PILLAR' },
            { at: 43, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0 } } }],
    ceil: [], events: [] },
  { id: 'r3_weave_c', zone: 'ruins', lengthM: 60, difficulty: 3, minSpeed: 0, s3: 1, dense: 2,
    /* 縫いのあいだに跳ぶ要求を1つだけ挟む（ジャンプ→レーン移動は 0.92秒空ける） */
    floor: [{ at: 8, lane: -1, type: 'PILLAR' }, { at: 15, lane: 1, type: 'LASER_V' },
            { at: 22, lane: 0, type: 'PILLAR' }, { at: 32, lane: 1, type: 'ROVER' },
            { at: 42, lane: -1, type: 'LASER_V' }, { at: 49, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 32, lane: -1, type: 'ROVER' }], events: [] },
  /* --- 跳び継ぎ（両者が同時に跳ぶウォールを連ねる） ----------------------
     ジャンプ連続の下限（着地+0.15秒＝0.70秒）を守った 8基準m 間隔。
     列柱の縫い（レーン移動）と釣り合わせて §4.3 の比率を作る。 */
  { id: 'r3_leap_a', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, dense: 2,
    floor: [{ at: 10, lane: 0, type: 'ROVER' }, { at: 18, lane: -1, type: 'ROVER' },
            { at: 26, lane: 1, type: 'LASER_LOW' }, { at: 34, lane: 0, type: 'ROVER' },
            { at: 42, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 18, lane: 0, type: 'LASER_LOW' },
            { at: 26, lane: -1, type: 'ROVER' }, { at: 34, lane: 1, type: 'ROVER' },
            { at: 42, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'r3_leap_b', zone: 'ruins', lengthM: 56, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, bridge: 1,
    floor: [{ at: 10, lane: 1, type: 'LASER_LOW' }, { at: 18, lane: 0, type: 'ROVER' },
            { at: 28, lane: -1, type: 'BRIDGE' }, { at: 44, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 18, lane: 1, type: 'ROVER' },
            { at: 28, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r3_pend_pair', zone: 'ruins', lengthM: 62, difficulty: 3, minSpeed: 0, s3: 1, dense: 1, moving: 1, pend: 1,
    floor: [{ at: 12, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0 } } },
            { at: 34, lane: 0, type: 'ROVER' },
            { at: 52, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0 } } }],
    ceil:  [{ at: 23, lane: 1, type: 'ROVER' }, { at: 34, lane: -1, type: 'ROVER' }], events: [] },

  /* ==========================================================================
     S4「古代遺跡・内部」（契約§4.4 / §4.5 / P3b）
     ------------------------------------------------------------------------
     新ギミック:
       SYNCSW   同時スイッチ。床と天井の対のパッドを **同じ0.3秒窓内** に踏むと
                gapT 秒先に橋が架かる。踏み損ねると谷（＝迂回の1レーンだけが残る）。
                params.sync = { cl:天井パッドのレーン, safe:床の迂回レーン,
                                csafe:天井の迂回レーン, gapT:橋までの秒 }
                **パッドのレーン＝迂回レーン** にそろえる（踏んだ者はそのまま渡れる）。
       （落ちる天井 DROPCEIL は契約 v2 で失効。譜面の位置は縦レーザー LASER_V に置き換えた）
     密度は S3 よりさらに高い（6→10回/100m）。both 型（柱・火柱・落ちる天井・同時スイッチ）を
     厚く敷いて、間隔を詰めずに密度を稼ぐ。
     ========================================================================== */
  /* --- 落ちる天井を1つずつ覚える（rank3） -------------------------------- */
  { id: 'r4_drop_a', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, dense: 1,
    floor: [{ at: 12, lane: 0, type: 'LASER_V' }, { at: 30, lane: -1, type: 'PILLAR' },
            { at: 46, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 46, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_drop_b', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, dense: 1,
    floor: [{ at: 14, lane: 1, type: 'ROVER' }, { at: 30, lane: 0, type: 'LASER_V' },
            { at: 48, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 14, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_drop_c', zone: 'ruins', lengthM: 56, difficulty: 3, minSpeed: 0, s4: 1, bridge: 1, dense: 1,
    floor: [{ at: 12, lane: -1, type: 'ROVER' }, { at: 26, lane: 1, type: 'LASER_V' },
            { at: 44, lane: 0, type: 'BRIDGE' }],
    ceil:  [{ at: 12, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: 1, type: 'ROVER' }], events: [] },
  /* 落ちる天井の連鎖（rank4）: 床は縫い、天井は跳び継ぎ＝1本で2体に別の譜面を配る */
  { id: 'r4_drop_chain', zone: 'ruins', lengthM: 62, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 9, lane: 0, type: 'LASER_V' }, { at: 17, lane: 1, type: 'LASER_V' },
            { at: 27, lane: -1, type: 'PILLAR' }, { at: 35, lane: 0, type: 'LASER_V' },
            { at: 45, lane: 1, type: 'LASER_V' }, { at: 53, lane: -1, type: 'LASER_V' }],
    ceil: [], events: [] },

  /* --- 同時スイッチ（rank3〜4） ------------------------------------------ */
  { id: 'r4_sync_a', zone: 'ruins', lengthM: 60, difficulty: 3, minSpeed: 0, s4: 1, sync: 1, dense: 1,
    /* 入門: 対のパッドは同じレーン＝2人が同じ側で踏む。迂回も同じレーン */
    floor: [{ at: 8, lane: 0, type: 'SYNCSW', params: { sync: { cl: 0, safe: 0, csafe: 0 } } },
            { at: 32, lane: -1, type: 'ROVER' }, { at: 46, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 32, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'r4_sync_b', zone: 'ruins', lengthM: 62, difficulty: 3, minSpeed: 0, s4: 1, sync: 1, dense: 2,
    /* 対のパッドが別レーン＝2人が別々の位置取りをそろえる（本題） */
    floor: [{ at: 8, lane: -1, type: 'SYNCSW', params: { sync: { cl: 1, safe: -1, csafe: 1 } } },
            { at: 30, lane: 0, type: 'ROVER' }, { at: 40, lane: 1, type: 'PILLAR' },
            { at: 50, lane: -1, type: 'LASER_LOW' }],
    ceil:  [{ at: 30, lane: -1, type: 'ROVER' }, { at: 50, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'r4_sync_drop', zone: 'ruins', lengthM: 64, difficulty: 4, minSpeed: 0, s4: 1, sync: 1, dense: 2,
    floor: [{ at: 8, lane: 1, type: 'SYNCSW', params: { sync: { cl: -1, safe: 1, csafe: -1 } } },
            { at: 30, lane: 0, type: 'LASER_V' }, { at: 40, lane: -1, type: 'LASER_V' },
            { at: 52, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r4_sync_weave', zone: 'ruins', lengthM: 64, difficulty: 4, minSpeed: 0, s4: 1, sync: 1, dense: 2,
    floor: [{ at: 6, lane: 0, type: 'SYNCSW', params: { sync: { cl: 0, safe: 0, csafe: 0 } } },
            { at: 26, lane: -1, type: 'PILLAR' }, { at: 33, lane: 1, type: 'LASER_V' },
            { at: 40, lane: 0, type: 'PILLAR' }, { at: 47, lane: -1, type: 'LASER_V' },
            { at: 54, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r4_sync_leap', zone: 'ruins', lengthM: 64, difficulty: 4, minSpeed: 0, s4: 1, sync: 1, dense: 2,
    floor: [{ at: 8, lane: 1, type: 'SYNCSW', params: { sync: { cl: -1, safe: 1, csafe: -1 } } },
            { at: 30, lane: 0, type: 'ROVER' }, { at: 38, lane: -1, type: 'ROVER' },
            { at: 48, lane: 1, type: 'PILLAR' }, { at: 55, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 30, lane: -1, type: 'ROVER' }, { at: 38, lane: 1, type: 'LASER_LOW' }], events: [] },

  /* --- 内部の回廊（列柱の縫い・跳び継ぎ・壁の穴） ------------------------ */
  { id: 'r4_weave', zone: 'ruins', lengthM: 60, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 15, lane: -1, type: 'LASER_V' },
            { at: 22, lane: 1, type: 'PILLAR' }, { at: 31, lane: 0, type: 'LASER_V' },
            { at: 41, lane: -1, type: 'PILLAR' }, { at: 48, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 'r4_leap', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 9, lane: 0, type: 'ROVER' }, { at: 17, lane: -1, type: 'ROVER' },
            { at: 25, lane: 1, type: 'LASER_LOW' }, { at: 33, lane: 0, type: 'ROVER' },
            { at: 41, lane: -1, type: 'ROVER' }, { at: 49, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 9, lane: 1, type: 'ROVER' }, { at: 17, lane: 0, type: 'LASER_LOW' },
            { at: 25, lane: -1, type: 'ROVER' }, { at: 33, lane: 1, type: 'ROVER' },
            { at: 41, lane: 0, type: 'LASER_LOW' }, { at: 49, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_wallhole', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, wallhole: 1, dense: 1,
    floor: [{ at: 12, lane: 1, type: 'WALLHOLE' }, { at: 30, lane: 0, type: 'LASER_V' },
            { at: 46, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 12, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_duo', zone: 'ruins', lengthM: 62, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 9, lane: 1, type: 'ROVER' }, { at: 19, lane: 0, type: 'PILLAR' },
            { at: 27, lane: -1, type: 'ROVER' }, { at: 37, lane: 1, type: 'LASER_V' },
            { at: 45, lane: 0, type: 'ROVER' }, { at: 55, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 9, lane: -1, type: 'ROVER' }, { at: 27, lane: 1, type: 'ROVER' },
            { at: 45, lane: -1, type: 'ROVER' }], events: [] },
  /* 内部の最奥（rank4・最も密）: 列柱の縫いに落ちる天井を挟む／両者とも跳び継ぐ */
  { id: 'r4_gauntlet', zone: 'ruins', lengthM: 64, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 15, lane: 1, type: 'LASER_V' },
            { at: 22, lane: -1, type: 'PILLAR' }, { at: 32, lane: 0, type: 'LASER_V' },
            { at: 42, lane: 1, type: 'PILLAR' }, { at: 49, lane: -1, type: 'LASER_V' },
            { at: 56, lane: 0, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r4_leap2', zone: 'ruins', lengthM: 56, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    /* 両者が 0.72秒おきに跳び継ぐ（§4.7 ジャンプ連続 0.70秒の下限ぎりぎり） */
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.2, lane: -1, type: 'ROVER' },
            { at: 22.4, lane: 1, type: 'LASER_LOW' }, { at: 29.6, lane: 0, type: 'ROVER' },
            { at: 36.8, lane: -1, type: 'ROVER' }, { at: 44, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.4, lane: -1, type: 'ROVER' }, { at: 29.6, lane: 1, type: 'ROVER' },
            { at: 36.8, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'ROVER' }], events: [] },
  /* 短い密集（つなぎ）: 大演出の手前に残る半端な距離にも入る長さにしておく。
     これが無いと終盤に 80m 級の空白ができて、契約§4.7 の密度が落ちる。 */
  { id: 'r4_fill_a', zone: 'ruins', lengthM: 26, difficulty: 3, minSpeed: 0, s4: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 12, lane: 1, type: 'LASER_V' },
            { at: 19, lane: -1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r4_fill_b', zone: 'ruins', lengthM: 30, difficulty: 3, minSpeed: 0, s4: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'LASER_V' }, { at: 15, lane: 1, type: 'PILLAR' },
            { at: 23, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 23, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'r4_drop_duo', zone: 'ruins', lengthM: 66, difficulty: 4, minSpeed: 0, s4: 1, sync: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'LASER_V' },
            { at: 20, lane: -1, type: 'SYNCSW', params: { sync: { cl: 1, safe: -1, csafe: 1 } } },
            { at: 44, lane: 1, type: 'LASER_V' }, { at: 54, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 54, lane: -1, type: 'ROVER' }], events: [] },

  /* ==========================================================================
     S5「深海」（契約§4.4 / §4.5 / P4a）
     ------------------------------------------------------------------------
     新ギミック:
       （海流ベルト・浮上足場・色の扉は契約 v2 で失効。浮上足場は ローレーザー、
        色の扉は「空いた1レーンへ」のワイド梁に置き換えた。海流の区間は外した）
     密度は 8→12回/100m（契約§4.7）。both 型（柱・放電柱・触手）を厚く敷いて、
     間隔を詰めずに密度を稼ぐ。§4.7 の両者同時要求の余白は 0.45秒。
     ========================================================================== */
  /* --- 列柱の縫い（密度の主役）: both 型を 6 基準m おきに連ねる ------------
     PILLAR / LASER_V / LASER_SCAN は both＝1本で床と天井の両方に要求が出る。
     6 基準m = 0.6秒 で §4.7（反応窓0.45・両者同時0.45）を満たしつつ、
     契約§4.7 の密度（S5 は 8→12回/100m）を作る。 */
  { id: 's5_weave_a', zone: 'sea', lengthM: 58, difficulty: 3, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 14, lane: 1, type: 'LASER_V' },
            { at: 20, lane: -1, type: 'PILLAR' }, { at: 26, lane: 0, type: 'LASER_V' },
            { at: 32, lane: 1, type: 'PILLAR' }, { at: 38, lane: -1, type: 'LASER_V' },
            { at: 44, lane: 0, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 's5_weave_b', zone: 'sea', lengthM: 60, difficulty: 4, minSpeed: 0, s5: 1, dense: 2, moving: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_V' },
            { at: 14, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 20, lane: 1, type: 'PILLAR' }, { at: 26, lane: -1, type: 'LASER_V' },
            { at: 32, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0.5 } } },
            { at: 38, lane: -1, type: 'PILLAR' }, { at: 44, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_scan', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, moving: 1,
    floor: [{ at: 8, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 14, lane: 1, type: 'PILLAR' }, { at: 20, lane: -1, type: 'LASER_V' },
            { at: 26, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0.5 } } },
            { at: 32, lane: 0, type: 'PILLAR' }, { at: 38, lane: 1, type: 'LASER_V' },
            { at: 44, lane: -1, type: 'PILLAR' }],
    ceil: [], events: [] },
  /* --- 跳び継ぎ（両者が 0.72秒おきに跳ぶ。§4.7 ジャンプ連続 0.70秒の下限ぎりぎり） -- */
  { id: 's5_leap', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.2, lane: -1, type: 'ROVER' },
            { at: 22.4, lane: 1, type: 'LASER_LOW' }, { at: 29.6, lane: 0, type: 'ROVER' },
            { at: 36.8, lane: -1, type: 'ROVER' }, { at: 44, lane: 1, type: 'ROVER' },
            { at: 51.2, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.4, lane: -1, type: 'ROVER' }, { at: 29.6, lane: 1, type: 'ROVER' },
            { at: 36.8, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'ROVER' },
            { at: 51.2, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's5_leap_b', zone: 'sea', lengthM: 60, difficulty: 4, minSpeed: 0, s5: 1, dense: 2, leap: 1,
    /* 浮上足場を跳び継ぎに混ぜる（沈んでいる足場は素通り＝読みの要素） */
    floor: [{ at: 8, lane: 0, type: 'ROVER' },
            { at: 15.2, lane: -1, type: 'LASER_LOW' },
            { at: 22.4, lane: 1, type: 'ROVER' },
            { at: 29.6, lane: 0, type: 'LASER_LOW' },
            { at: 36.8, lane: -1, type: 'ROVER' }, { at: 44, lane: 1, type: 'LASER_LOW' },
            { at: 51.2, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'LASER_LOW' }, { at: 15.2, lane: 0, type: 'ROVER' },
            { at: 22.4, lane: -1, type: 'LASER_LOW' },
            { at: 29.6, lane: 1, type: 'ROVER' }, { at: 36.8, lane: 0, type: 'LASER_LOW' },
            { at: 44, lane: -1, type: 'ROVER' }, { at: 51.2, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's5_leap_c', zone: 'sea', lengthM: 56, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.2, lane: 1, type: 'ROVER' },
            { at: 22.4, lane: -1, type: 'LASER_LOW' }, { at: 29.6, lane: 0, type: 'ROVER' },
            { at: 36.8, lane: 1, type: 'ROVER' }, { at: 44, lane: -1, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.4, lane: 1, type: 'ROVER' }, { at: 29.6, lane: -1, type: 'LASER_LOW' },
            { at: 36.8, lane: 0, type: 'ROVER' }, { at: 44, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 浮上足場（rank3〜4） ---------------------------------------------
     到達時に浮いていれば ローバー相当（跳ぶ）、沈んでいれば通れる。
     ジャンプを要求するウォールの後は 9.2 基準m（0.92秒）空けてから横移動を要求する。 */
  { id: 's5_lift_a', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'LASER_LOW' },
            { at: 18, lane: 1, type: 'PILLAR' }, { at: 24, lane: -1, type: 'LASER_V' },
            { at: 30, lane: 0, type: 'PILLAR' },
            { at: 36, lane: -1, type: 'LASER_LOW' },
            { at: 46, lane: 1, type: 'PILLAR' }, { at: 52, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's5_lift_b', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 2,
    /* 到達時に沈んでいる足場＝そのまま走り抜ける（読み切れば動かなくてよい） */
    floor: [{ at: 14, lane: 1, type: 'PILLAR' }, { at: 20, lane: -1, type: 'LASER_V' },
            { at: 26, lane: 0, type: 'PILLAR' },
            { at: 36, lane: 1, type: 'LASER_LOW' },
            { at: 46, lane: -1, type: 'PILLAR' }, { at: 52, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 36, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's5_lift_duo', zone: 'sea', lengthM: 62, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    /* 床と天井で別レーンの足場＝2体に別の譜面 */
    floor: [{ at: 8, lane: 0, type: 'LASER_LOW' },
            { at: 18, lane: 1, type: 'PILLAR' }, { at: 24, lane: -1, type: 'LASER_V' },
            { at: 34, lane: 1, type: 'LASER_LOW' },
            { at: 44, lane: 0, type: 'PILLAR' }, { at: 50, lane: 1, type: 'LASER_V' },
            { at: 56, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'LASER_LOW' },
            { at: 34, lane: -1, type: 'LASER_LOW' }], events: [] },

  /* --- 色の扉（rank3〜4） -----------------------------------------------
     lane に書いたレーンだけが同色＝通れる。床に置けば LUMEN、天井に置けば UMBRA の判断。 */
  { id: 's5_door_f', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: -1, type: 'WIDEBAR' }, { at: 14, lane: 0, type: 'PILLAR' },
            { at: 20, lane: -1, type: 'LASER_V' }, { at: 26, lane: 1, type: 'PILLAR' },
            { at: 36, lane: 0, type: 'ROVER' }, { at: 46, lane: 1, type: 'LASER_V' },
            { at: 52, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 36, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's5_door_c', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 14, lane: 0, type: 'PILLAR' }, { at: 20, lane: 1, type: 'LASER_V' },
            { at: 26, lane: -1, type: 'PILLAR' }, { at: 36, lane: 1, type: 'ROVER' },
            { at: 46, lane: 0, type: 'LASER_V' }, { at: 52, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 0, type: 'WIDEBAR' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's5_door_duo', zone: 'sea', lengthM: 62, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    /* **床と天井で別のレーンの扉**＝左右で別々の判断（契約§4.5 の主題） */
    floor: [{ at: 8, lane: 0, type: 'WIDEBAR' }, { at: 14, lane: 0, type: 'PILLAR' },
            { at: 20, lane: 1, type: 'LASER_V' }, { at: 30, lane: -1, type: 'WIDEBAR' },
            { at: 36, lane: -1, type: 'PILLAR' }, { at: 42, lane: 0, type: 'LASER_V' },
            { at: 48, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'WIDEBAR' }, { at: 30, lane: 0, type: 'WIDEBAR' }], events: [] },
  { id: 's5_door_lift', zone: 'sea', lengthM: 64, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'LASER_LOW' },
            { at: 18, lane: -1, type: 'WIDEBAR' }, { at: 24, lane: -1, type: 'PILLAR' },
            { at: 30, lane: 0, type: 'LASER_V' },
            { at: 40, lane: 1, type: 'LASER_LOW' },
            { at: 50, lane: 0, type: 'WIDEBAR' }, { at: 56, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 18, lane: 0, type: 'WIDEBAR' },
            { at: 40, lane: 0, type: 'ROVER' }, { at: 50, lane: -1, type: 'WIDEBAR' }], events: [] },

  /* --- 海流ベルト（rank3〜4） -------------------------------------------
     ベルトは 1.0秒ごとに1レーンぶん流す。押し出しの直前 0.45秒にはウォールを置けない
     （Fair が弾く）ので、**押し出しと押し出しのちょうど中間** に壁を置く＝
     「流されてから 0.5秒で避ける」が譜面になる。 */
  { id: 's5_cur_a', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 1,
    /* 床は右へ、天井は左へ流れる＝2体が逆向きに逆らう */
    floor: [{ at: 18, lane: 0, type: 'PILLAR' }, { at: 28, lane: 1, type: 'PILLAR' },
            { at: 38, lane: -1, type: 'LASER_V' }, { at: 44, lane: 0, type: 'PILLAR' },
            { at: 50, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_cur_b', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, dense: 1,
    /* 床も天井も同じ向き（2人とも同じ側へ寄せられる） */
    floor: [{ at: 18, lane: 1, type: 'LASER_V' }, { at: 28, lane: 0, type: 'PILLAR' },
            { at: 38, lane: -1, type: 'LASER_V' }, { at: 44, lane: 1, type: 'PILLAR' },
            { at: 50, lane: 0, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_cur_door', zone: 'sea', lengthM: 66, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    /* 流された先に色の扉＝「流れに逆らって自分の色へ入る」 */
    floor: [{ at: 16, lane: 0, type: 'PILLAR' }, { at: 26, lane: -1, type: 'PILLAR' },
            { at: 36, lane: 1, type: 'LASER_V' }, { at: 46, lane: 0, type: 'WIDEBAR' },
            { at: 52, lane: 0, type: 'PILLAR' }, { at: 58, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 46, lane: -1, type: 'WIDEBAR' }], events: [] },
  { id: 's5_cur_lift', zone: 'sea', lengthM: 68, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 16, lane: 0, type: 'PILLAR' }, { at: 26, lane: 1, type: 'PILLAR' },
            { at: 36, lane: -1, type: 'LASER_LOW' },
            { at: 46, lane: 0, type: 'PILLAR' }, { at: 52, lane: 1, type: 'LASER_V' },
            { at: 58, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 36, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 深海の最奥（rank4・最も密）と、壁の穴・つなぎ -------------------- */
  { id: 's5_gauntlet', zone: 'sea', lengthM: 68, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 14, lane: 1, type: 'LASER_V' },
            { at: 20, lane: -1, type: 'PILLAR' }, { at: 26, lane: -1, type: 'ADPANEL' }, { at: 26, lane: 1, type: 'ADPANEL' },
            { at: 32, lane: 1, type: 'LASER_V' }, { at: 38, lane: -1, type: 'PILLAR' },
            { at: 48, lane: 0, type: 'LASER_LOW' },
            { at: 58, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 26, lane: 0, type: 'WIDEBAR' }, { at: 48, lane: -1, type: 'ROVER' }], events: [] },
  /* 最奥の縫い（rank4・0.5秒おき＝§4.7 反応窓 0.45秒の下限ぎりぎり）。
     ランク4は進行率50%から出るので、ここが「後半ほど濃い」を作る主役になる。 */
  { id: 's5_weave_x', zone: 'sea', lengthM: 58, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 13, lane: 1, type: 'LASER_V' },
            { at: 18, lane: -1, type: 'PILLAR' }, { at: 23, lane: 0, type: 'LASER_V' },
            { at: 28, lane: 1, type: 'PILLAR' }, { at: 33, lane: -1, type: 'LASER_V' },
            { at: 38, lane: 0, type: 'PILLAR' }, { at: 43, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_door_x', zone: 'sea', lengthM: 60, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: -1, type: 'WIDEBAR' }, { at: 13, lane: 0, type: 'PILLAR' },
            { at: 18, lane: -1, type: 'LASER_V' }, { at: 23, lane: 1, type: 'PILLAR' },
            { at: 28, lane: 0, type: 'WIDEBAR' }, { at: 33, lane: 0, type: 'LASER_V' },
            { at: 38, lane: 1, type: 'PILLAR' }, { at: 43, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: 0, type: 'WIDEBAR' }, { at: 28, lane: -1, type: 'WIDEBAR' }], events: [] },
  { id: 's5_wallhole', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, wallhole: 1, dense: 1,
    floor: [{ at: 10, lane: 1, type: 'WALLHOLE' }, { at: 20, lane: 0, type: 'PILLAR' },
            { at: 26, lane: -1, type: 'LASER_V' }, { at: 36, lane: 1, type: 'ROVER' },
            { at: 46, lane: 0, type: 'PILLAR' }, { at: 52, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's5_fill_a', zone: 'sea', lengthM: 26, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 11, lane: 1, type: 'LASER_V' },
            { at: 17, lane: -1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 's5_fill_b', zone: 'sea', lengthM: 30, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'LASER_LOW' },
            { at: 15, lane: 1, type: 'PILLAR' }, { at: 21, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 5, lane: 1, type: 'ROVER' }], events: [] },

  /* ==========================================================================
     S6「宇宙ステーション」（契約§4.4 / §4.5 / P4b）
     ------------------------------------------------------------------------
     新ギミック:
       GRAVWARP   重力反転ワープ。黄のゲート2枚で1組。通るたびに LUMEN と UMBRA の
                  走る面（床/天井）が入れ替わる。**操作は「画面の位置＝担当」のまま**。
                  params.warp = { backT: 戻りのゲートまでの秒数 }
                  ゲートの直後 1.0秒（= 10 基準m）はウォールを置けない（Fair が弾く）。
       ZEROG      無重力区間。区間の中で踏み切ったジャンプの滞空が 1.5倍になる。
                  params.zero = { n: 区間の長さ（秒） }
                  区間内は「ジャンプ連続 9.75 基準m」「ジャンプ→レーン 11.95 基準m」。
       LASER_H    レーザーネットの横ビーム（全幅・上下スキャン / lane は必ず -1）。
                  params.hbeam = { y0, y1, phase } … 到達時の高さが役割を決める:
                    CFG.NET.Y_LOW(0.20)  床の体に当たる → LUMEN がジャンプ
                    CFG.NET.Y_HIGH(3.80) 天井の体に当たる → UMBRA がジャンプ
                    CFG.NET.Y_MID(1.00)  どちらにも当たらない（緊張だけ）
       LASER_DIAG レーザーネットの斜めビーム（lane は必ず 0・位置は params で書く）。
                  params.diag = { f0: 床側のレーン, c0: 天井側のレーン, f1/c1: 振れ先 }
                  **床と天井で避けるレーンが違う**（契約§4.5 の主題）。
       NETGATE    レーザーネットの区画枠（予告・当たり判定なし）。
     密度は 8→12回/100m（契約§4.7）。両者同時要求の余白は 0.45秒。
     S6 では1区画あたりのビームは 3〜4本（S7/S8・エンドレス後半で増やす前提）。
     ========================================================================== */
  /* ------------------------------------------------------------------------
     ■ 間合いの決まり（基準速度＝1秒 = 10 基準m。§4.7 の下限に **+5%の余裕**を足した値）
       ステージ内で速度が上がる（28→34）ので、チャンクの中でも後ろのウォールほど
       必要な距離が伸びる。下限ちょうどで書くと後半で弾かれるため必ず余裕を足す。
         ウォール間隔（レーン→なんでも）      0.45秒 → 4.8 基準m
         ジャンプ → ジャンプ（同じ面）        0.70秒 → 7.4
         ジャンプ → レーン移動（同じ面）      0.92秒 → 9.7
         無重力区間のジャンプ → ジャンプ      1.05秒 → 10.3
         無重力区間のジャンプ → レーン移動    1.27秒 → 12.6
         重力反転ゲート → 次のウォール        1.00秒 → 10.6
     ■ 密度（契約§4.7 の 8→12回/100m）と比率（§4.3 のレーン50%/ジャンプ35%）の両立
       跳ぶ要求は「0.70秒より詰められない」ので、跳びだけでは 9回/100m が上限になる。
       そこで **跳2・レーン3 の繰り返し**（J J L L L）を density の主役に据える。
       ＝ 20要求 / 58 基準m → 速度32で 約10回/100m、ジャンプ比率 40%。
     ------------------------------------------------------------------------ */
  /* --- 主役: 跳2・レーン3 の繰り返し（密度と比率を同時に作る） -------------- */
  { id: 's6_mix_a', zone: 'space', lengthM: 74, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'ROVER' },
            { at: 25.1, lane: 0, type: 'PILLAR' }, { at: 29.9, lane: 1, type: 'LASER_V' },
            { at: 34.7, lane: -1, type: 'PILLAR' },
            { at: 39.5, lane: 0, type: 'ROVER' }, { at: 46.9, lane: 1, type: 'LASER_LOW' },
            { at: 56.6, lane: -1, type: 'PILLAR' }, { at: 61.4, lane: 0, type: 'LASER_V' },
            { at: 66.2, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'LASER_LOW' },
            { at: 39.5, lane: -1, type: 'ROVER' }, { at: 46.9, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's6_mix_b', zone: 'space', lengthM: 74, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, leap: 1, moving: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_LOW' }, { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 25.1, lane: -1, type: 'LASER_V' },
            { at: 29.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0.5 } } },
            { at: 34.7, lane: 1, type: 'PILLAR' },
            { at: 39.5, lane: -1, type: 'ROVER' }, { at: 46.9, lane: 0, type: 'ROVER' },
            { at: 56.6, lane: 1, type: 'PILLAR' }, { at: 61.4, lane: -1, type: 'LASER_V' },
            { at: 66.2, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'ROVER' },
            { at: 39.5, lane: 0, type: 'ROVER' }, { at: 46.9, lane: -1, type: 'LASER_LOW' }], events: [] },
  { id: 's6_mix_c', zone: 'space', lengthM: 74, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, net: 1,
    /* 横ビーム（床寄り＝LUMEN が跳ぶ／天井寄り＝UMBRA が跳ぶ）を跳の枠に混ぜる */
    floor: [{ at: 8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 25.1, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 29.9, lane: 1, type: 'PILLAR' },
            { at: 34.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 39.5, lane: -1, type: 'ROVER' }, { at: 46.9, lane: 1, type: 'ROVER' },
            { at: 56.6, lane: 0, type: 'LASER_V' }, { at: 61.4, lane: -1, type: 'PILLAR' },
            { at: 66.2, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: -1 } } }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'LASER_LOW' },
            { at: 39.5, lane: 0, type: 'ROVER' }, { at: 46.9, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's6_mix_d', zone: 'space', lengthM: 76, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, net: 1, moving: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'ROVER' },
            { at: 25.1, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 29.9, lane: -1, type: 'PILLAR' },
            { at: 34.7, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 39.5, lane: 1, type: 'ROVER' }, { at: 46.9, lane: 0, type: 'ROVER' },
            { at: 56.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 0 } } },
            { at: 61.4, lane: 1, type: 'LASER_V' }, { at: 66.2, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'LASER_LOW' }, { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 39.5, lane: 1, type: 'ROVER' }, { at: 46.9, lane: -1, type: 'ROVER' }], events: [] },

  /* 跳2・レーン2（ジャンプ比率 50%。§4.3 の比率を引き上げる役） */
  { id: 's6_mix_e', zone: 'space', lengthM: 66, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'LASER_LOW' },
            { at: 25.1, lane: 0, type: 'PILLAR' }, { at: 29.9, lane: -1, type: 'LASER_V' },
            { at: 34.7, lane: 1, type: 'ROVER' }, { at: 42.1, lane: 0, type: 'ROVER' },
            { at: 51.8, lane: -1, type: 'PILLAR' }, { at: 56.6, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 34.7, lane: 1, type: 'ROVER' }, { at: 42.1, lane: -1, type: 'LASER_LOW' }], events: [] },
  { id: 's6_mix_f', zone: 'space', lengthM: 68, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, wallhole: 1,
    /* 壁の穴（唯一のスライディング要素）を1つだけ混ぜる。契約§4.3「1チャンクに最大1」 */
    floor: [{ at: 8, lane: 0, type: 'WALLHOLE' }, { at: 17.7, lane: 1, type: 'PILLAR' },
            { at: 22.5, lane: -1, type: 'LASER_V' }, { at: 27.3, lane: 0, type: 'ROVER' },
            { at: 34.7, lane: 1, type: 'ROVER' }, { at: 44.4, lane: -1, type: 'PILLAR' },
            { at: 49.2, lane: 0, type: 'LASER_V' }, { at: 54, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 27.3, lane: -1, type: 'ROVER' },
            { at: 34.7, lane: 0, type: 'LASER_LOW' }, { at: 54, lane: -1, type: 'ROVER' }], events: [] },

  /* --- 支柱の縫い（レーン移動だけを 4.8 基準m おきに連ねる＝密度の上限） ---- */
  { id: 's6_weave_a', zone: 'space', lengthM: 68, difficulty: 4, minSpeed: 0, s6: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 12.8, lane: 1, type: 'LASER_V' },
            { at: 17.6, lane: -1, type: 'PILLAR' }, { at: 22.4, lane: 0, type: 'LASER_V' },
            { at: 27.2, lane: 1, type: 'PILLAR' }, { at: 32, lane: -1, type: 'LASER_V' },
            { at: 36.8, lane: 0, type: 'PILLAR' }, { at: 41.6, lane: 1, type: 'LASER_V' },
            { at: 46.4, lane: -1, type: 'PILLAR' }, { at: 51.2, lane: 0, type: 'LASER_V' },
            { at: 56, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 's6_weave_b', zone: 'space', lengthM: 68, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, moving: 1, net: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_V' },
            { at: 12.8, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 17.6, lane: 1, type: 'PILLAR' },
            { at: 22.4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 27.2, lane: -1, type: 'LASER_V' },
            { at: 32, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0.5 } } },
            { at: 36.8, lane: -1, type: 'PILLAR' },
            { at: 41.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 46.4, lane: 1, type: 'LASER_V' }, { at: 51.2, lane: 0, type: 'PILLAR' },
            { at: 56, lane: -1, type: 'LASER_V' }],
    ceil: [], events: [] },

  /* --- 跳び継ぎ（両者が 0.74秒おきに跳ぶ。§4.7 ジャンプ連続 0.70秒の下限） -- */
  { id: 's6_leap', zone: 'space', lengthM: 62, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'ROVER' },
            { at: 22.8, lane: 1, type: 'LASER_LOW' }, { at: 30.2, lane: 0, type: 'ROVER' },
            { at: 37.6, lane: -1, type: 'ROVER' }, { at: 45, lane: 1, type: 'ROVER' },
            { at: 52.4, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'LASER_LOW' },
            { at: 22.8, lane: -1, type: 'ROVER' }, { at: 30.2, lane: 1, type: 'ROVER' },
            { at: 37.6, lane: 0, type: 'LASER_LOW' }, { at: 45, lane: -1, type: 'ROVER' },
            { at: 52.4, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's6_leap_b', zone: 'space', lengthM: 62, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, net: 1,
    /* 跳び継ぎに横ビームを混ぜる（床寄り＝LUMEN が跳ぶ／天井寄り＝UMBRA が跳ぶ） */
    floor: [{ at: 8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 15.4, lane: 0, type: 'ROVER' }, { at: 22.8, lane: 1, type: 'LASER_LOW' },
            { at: 30.2, lane: -1, type: 'ROVER' }, { at: 37.6, lane: 0, type: 'ROVER' },
            { at: 45, lane: 1, type: 'ROVER' }, { at: 52.4, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'ROVER' },
            { at: 22.8, lane: 0, type: 'ROVER' }, { at: 30.2, lane: 1, type: 'LASER_LOW' },
            { at: 37.6, lane: -1, type: 'ROVER' },
            { at: 45, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_HIGH, y1: CFG.NET.Y_LOW, phase: 0 } } },
            { at: 52.4, lane: 1, type: 'ROVER' }], events: [] },

  /* --- レーザーネット（契約§4.5。1区画に 3〜4本＝S6 は控えめ） ------------- */
  { id: 's6_net_a', zone: 'space', lengthM: 68, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, net: 1, moving: 1,
    floor: [{ at: 6, lane: 0, type: 'NETGATE' },
            { at: 12, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 21.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 26.5, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 31.3, lane: 1, type: 'PILLAR' },
            { at: 36.1, lane: 0, type: 'ROVER' },
            { at: 45.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 50.6, lane: -1, type: 'LASER_V' }, { at: 55.4, lane: 0, type: 'PILLAR' },
            { at: 60.2, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } }],
    ceil:  [{ at: 12, lane: 1, type: 'ROVER' },
            { at: 36.1, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_HIGH, y1: CFG.NET.Y_LOW, phase: 0 } } }], events: [] },
  { id: 's6_net_b', zone: 'space', lengthM: 66, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, net: 1, moving: 1,
    floor: [{ at: 4, lane: 0, type: 'NETGATE' },
            { at: 10, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            /* 中央の横ビーム＝どちらも無関係（網の緊張だけを足す / 契約§4.5） */
            { at: 14.8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_MID, y1: CFG.NET.Y_MID2, phase: 0 } } },
            { at: 14.8, lane: 1, type: 'PILLAR' },
            { at: 19.6, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 24.4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 29.2, lane: 1, type: 'LASER_V' },
            { at: 34, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 43.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: 0 } } },
            { at: 48.5, lane: -1, type: 'PILLAR' },
            { at: 53.3, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: -1 } } },
            { at: 58.1, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 34, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's6_net_c', zone: 'space', lengthM: 72, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, net: 1, leap: 1, moving: 1,
    floor: [{ at: 8, lane: -1, type: 'PILLAR' },
            { at: 12.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 17.6, lane: 0, type: 'LASER_V' },
            { at: 22.4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 27.2, lane: 1, type: 'PILLAR' },
            { at: 32, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.5 } } },
            { at: 36.8, lane: 1, type: 'ROVER' }, { at: 44.2, lane: -1, type: 'LASER_LOW' },
            { at: 53.9, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: 0 } } },
            { at: 58.7, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 36.8, lane: -1, type: 'ROVER' }, { at: 44.2, lane: 0, type: 'ROVER' }], events: [] },

  /* --- 無重力ジャンプ（契約§4.5「滞空1.5倍」。区間内は跳びの間合いが伸びる） */
  { id: 's6_zero_a', zone: 'space', lengthM: 78, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, zero: 1,
    floor: [{ at: 6, lane: 0, type: 'ZEROG', params: { zero: { n: 4.0 } } },
            { at: 10, lane: 0, type: 'ROVER' }, { at: 20.3, lane: -1, type: 'ROVER' },
            { at: 32.9, lane: 0, type: 'PILLAR' }, { at: 37.7, lane: 1, type: 'LASER_V' },
            { at: 42.5, lane: -1, type: 'PILLAR' }, { at: 47.3, lane: 0, type: 'ROVER' },
            { at: 54.7, lane: 1, type: 'ROVER' }, { at: 64.4, lane: 0, type: 'PILLAR' },
            { at: 69.2, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 20.3, lane: 0, type: 'LASER_LOW' },
            { at: 47.3, lane: -1, type: 'ROVER' }, { at: 54.7, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's6_zero_b', zone: 'space', lengthM: 84, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, zero: 1, leap: 1,
    floor: [{ at: 4, lane: 0, type: 'ZEROG', params: { zero: { n: 4.6 } } },
            { at: 10, lane: 0, type: 'ROVER' }, { at: 20.3, lane: 1, type: 'ROVER' },
            { at: 30.6, lane: -1, type: 'ROVER' }, { at: 43.2, lane: 0, type: 'PILLAR' },
            { at: 48, lane: 1, type: 'LASER_V' }, { at: 52.8, lane: -1, type: 'PILLAR' },
            { at: 57.6, lane: 0, type: 'ROVER' }, { at: 65, lane: 1, type: 'LASER_LOW' },
            { at: 74.7, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 20.3, lane: 0, type: 'LASER_LOW' },
            { at: 30.6, lane: 1, type: 'ROVER' }, { at: 57.6, lane: -1, type: 'ROVER' },
            { at: 65, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's6_zero_net', zone: 'space', lengthM: 70, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, zero: 1, net: 1,
    floor: [{ at: 4, lane: 0, type: 'ZEROG', params: { zero: { n: 4.5 } } },
            { at: 10, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 14.8, lane: 1, type: 'LASER_V' },
            { at: 19.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 24.4, lane: -1, type: 'PILLAR' },
            { at: 29.2, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 41.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } },
            { at: 46.6, lane: 1, type: 'PILLAR' }, { at: 51.4, lane: 0, type: 'LASER_V' },
            { at: 56.2, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 0 } } },
            { at: 61, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 29.2, lane: 0, type: 'ROVER' }], events: [] },

  /* --- 重力反転ワープ（契約§4.5。ゲートの直後 1.0秒＝10.6基準m は必ず空ける） */
  { id: 's6_warp_a', zone: 'space', lengthM: 78, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, warp: 1,
    floor: [{ at: 6, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 4.0 } } },
            { at: 16.6, lane: 0, type: 'PILLAR' }, { at: 21.4, lane: 1, type: 'LASER_V' },
            { at: 26.2, lane: -1, type: 'PILLAR' }, { at: 31, lane: 0, type: 'ROVER' },
            { at: 38.4, lane: 1, type: 'ROVER' },
            { at: 56.6, lane: -1, type: 'PILLAR' }, { at: 61.4, lane: 0, type: 'LASER_V' },
            { at: 66.2, lane: 1, type: 'PILLAR' }, { at: 71, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 31, lane: -1, type: 'ROVER' }, { at: 38.4, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's6_warp_b', zone: 'space', lengthM: 84, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, warp: 1, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 4.4 } } },
            { at: 16.6, lane: 0, type: 'ROVER' }, { at: 24, lane: -1, type: 'ROVER' },
            { at: 33.7, lane: 1, type: 'PILLAR' }, { at: 38.5, lane: 0, type: 'LASER_V' },
            { at: 43.3, lane: -1, type: 'PILLAR' },
            { at: 60.6, lane: 0, type: 'PILLAR' }, { at: 65.4, lane: 1, type: 'LASER_V' },
            { at: 70.2, lane: -1, type: 'PILLAR' }, { at: 75, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 16.6, lane: 1, type: 'ROVER' }, { at: 24, lane: 0, type: 'LASER_LOW' },
            { at: 75, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's6_warp_net', zone: 'space', lengthM: 82, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, warp: 1, net: 1,
    floor: [{ at: 6, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 4.6 } } },
            { at: 16.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 21.4, lane: 1, type: 'PILLAR' },
            { at: 26.2, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 35.9, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 40.7, lane: -1, type: 'LASER_V' }, { at: 45.5, lane: 0, type: 'PILLAR' },
            { at: 62.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: -1 } } },
            { at: 67.4, lane: 1, type: 'PILLAR' }, { at: 72.2, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 26.2, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 最奥（rank5・最も密）と、壁の穴・つなぎ ---------------------------- */
  { id: 's6_gauntlet', zone: 'space', lengthM: 78, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, net: 1, leap: 1, moving: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'ROVER' },
            { at: 25.1, lane: 0, type: 'PILLAR' },
            { at: 29.9, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 34.7, lane: -1, type: 'LASER_V' },
            { at: 39.5, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0.5 } } },
            { at: 44.3, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 0 } } },
            { at: 49.1, lane: 1, type: 'ROVER' }, { at: 56.5, lane: -1, type: 'LASER_LOW' },
            { at: 66.2, lane: 0, type: 'PILLAR' }, { at: 71, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'LASER_LOW' },
            { at: 49.1, lane: 0, type: 'ROVER' }, { at: 56.5, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's6_wallhole', zone: 'space', lengthM: 66, difficulty: 4, minSpeed: 0, s6: 1, wallhole: 1, dense: 1,
    floor: [{ at: 10, lane: 1, type: 'WALLHOLE' }, { at: 19.7, lane: 0, type: 'PILLAR' },
            { at: 24.5, lane: -1, type: 'LASER_V' }, { at: 29.3, lane: 1, type: 'PILLAR' },
            { at: 34.1, lane: 0, type: 'ROVER' }, { at: 41.5, lane: -1, type: 'ROVER' },
            { at: 51.2, lane: 1, type: 'PILLAR' }, { at: 56, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 34.1, lane: 1, type: 'ROVER' },
            { at: 41.5, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's6_fill_a', zone: 'space', lengthM: 26, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 9.8, lane: 1, type: 'LASER_V' },
            { at: 14.6, lane: -1, type: 'PILLAR' }, { at: 19.4, lane: 0, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's6_fill_b', zone: 'space', lengthM: 32, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, fill: 1, net: 1,
    floor: [{ at: 5, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } },
            { at: 9.8, lane: 1, type: 'PILLAR' }, { at: 14.6, lane: -1, type: 'LASER_V' },
            { at: 19.4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 24.2, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },

  /* ==========================================================================
     S7「鏡の世界」（契約§4.4 / §4.5 / P5a）
     ------------------------------------------------------------------------
     新ギミック:
       MIRRORZ   鏡ゾーン。銀の枠2枚で1組。**ゲートが置かれた面**を走るキャラの
                 左右操作が反転する（右フリック＝画面左へ）。出口ゲートで戻る。
                 params.mir = { side:'floor'|'ceil', backT: 出口までの秒数 }
                 ゲートの直後 1.0秒（= 10.9 基準m）はその面にウォールを置けない。
       HANDSWAP  入れ替えワープ。紫の枠2枚で1組。**上下の担当が入れ替わる**
                 （下半分＝天井の UMBRA／上半分＝床の LUMEN）。再通過で戻る。
                 params.swp = { backT: 戻りまでの秒数 }
                 ゲートの直後 1.0秒は **両面とも** ウォールを置けない。
       レーザーネットの密度アップ（契約§4.4 S7）: 1区画あたり 4〜5本。
     ------------------------------------------------------------------------
     ■ 間合いの決まり（基準速度＝1秒 = 10 基準m。§4.7 の下限に **+9%の余裕**）
       速度が 30→38 と大きく上がるので、S6 よりさらに余裕を取る。
         ウォール間隔（レーン→なんでも）   0.45秒 → 4.9 基準m
         ジャンプ → ジャンプ（同じ面）     0.70秒 → 7.7
         ジャンプ → レーン移動（同じ面）   0.92秒 → 10.0
         鏡ゲート／入れ替えゲート → 次     1.00秒 → 10.9
     ■ 密度（決定ログの実質上限 約10回/100m）と比率（レーン≤62%）の両立
       跳2・レーン3 の繰り返し（J J L L L）を主役に据える
       ＝ 20要求 / 59.9 基準m → 速度34で 約9.8回/100m、ジャンプ比率 40%。
     ========================================================================== */
  /* --- 主役: 跳2・レーン3 の繰り返し（密度と比率を同時に作る） -------------- */
  { id: 's7_mix_a', zone: 'mirror', lengthM: 74, difficulty: 4, minSpeed: 0, s7: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.7, lane: -1, type: 'ROVER' },
            { at: 25.7, lane: 0, type: 'PILLAR' }, { at: 30.6, lane: 1, type: 'LASER_V' },
            { at: 35.5, lane: -1, type: 'PILLAR' },
            { at: 40.4, lane: 0, type: 'ROVER' }, { at: 48.1, lane: 1, type: 'LASER_LOW' },
            { at: 58.1, lane: -1, type: 'PILLAR' }, { at: 63, lane: 0, type: 'LASER_V' },
            { at: 67.9, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.7, lane: 0, type: 'LASER_LOW' },
            { at: 40.4, lane: -1, type: 'ROVER' }, { at: 48.1, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's7_mix_b', zone: 'mirror', lengthM: 74, difficulty: 5, minSpeed: 0, s7: 1, dense: 2, leap: 1, net: 1, moving: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_LOW' }, { at: 15.7, lane: 0, type: 'ROVER' },
            { at: 25.7, lane: -1, type: 'LASER_V' },
            { at: 30.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 35.5, lane: 1, type: 'PILLAR' },
            { at: 40.4, lane: -1, type: 'ROVER' }, { at: 48.1, lane: 0, type: 'ROVER' },
            { at: 58.1, lane: 1, type: 'PILLAR' }, { at: 63, lane: -1, type: 'LASER_V' },
            { at: 67.9, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.7, lane: 1, type: 'ROVER' },
            { at: 40.4, lane: 0, type: 'ROVER' }, { at: 48.1, lane: -1, type: 'LASER_LOW' }], events: [] },
  { id: 's7_mix_c', zone: 'mirror', lengthM: 74, difficulty: 5, minSpeed: 0, s7: 1, dense: 2, leap: 1, net: 1,
    /* 横ビーム（床寄り＝LUMEN が跳ぶ／天井寄り＝UMBRA が跳ぶ）を跳の枠に混ぜる */
    floor: [{ at: 8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 15.7, lane: 0, type: 'ROVER' },
            { at: 25.7, lane: 1, type: 'PILLAR' }, { at: 30.6, lane: -1, type: 'LASER_V' },
            { at: 35.5, lane: 0, type: 'PILLAR' },
            { at: 40.4, lane: 1, type: 'ROVER' }, { at: 48.1, lane: 0, type: 'ROVER' },
            { at: 58.1, lane: -1, type: 'LASER_V' }, { at: 63, lane: 1, type: 'PILLAR' },
            { at: 67.9, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.7, lane: -1, type: 'LASER_LOW' },
            { at: 40.4, lane: 0, type: 'ROVER' },
            { at: 48.1, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_HIGH, y1: CFG.NET.Y_LOW, phase: 0 } } }],
    events: [] },

  /* --- 鏡の柱の縫い（レーン移動だけを 4.9 基準m おきに連ねる＝密度の上限） --- */
  { id: 's7_weave_a', zone: 'mirror', lengthM: 68, difficulty: 4, minSpeed: 0, s7: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 12.9, lane: 1, type: 'LASER_V' },
            { at: 17.8, lane: -1, type: 'PILLAR' }, { at: 22.7, lane: 0, type: 'LASER_V' },
            { at: 27.6, lane: 1, type: 'PILLAR' }, { at: 32.5, lane: -1, type: 'LASER_V' },
            { at: 37.4, lane: 0, type: 'PILLAR' }, { at: 42.3, lane: 1, type: 'LASER_V' },
            { at: 47.2, lane: -1, type: 'PILLAR' }, { at: 52.1, lane: 0, type: 'LASER_V' },
            { at: 57, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 's7_weave_b', zone: 'mirror', lengthM: 68, difficulty: 5, minSpeed: 0, s7: 1, dense: 2, moving: 1, net: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_V' },
            { at: 12.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 17.8, lane: 1, type: 'PILLAR' },
            { at: 22.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 27.6, lane: -1, type: 'LASER_V' },
            { at: 32.5, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0.5 } } },
            { at: 37.4, lane: -1, type: 'PILLAR' },
            { at: 42.3, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 47.2, lane: 1, type: 'LASER_V' }, { at: 52.1, lane: 0, type: 'PILLAR' },
            { at: 57, lane: -1, type: 'LASER_V' }],
    ceil: [], events: [] },

  /* --- 跳び継ぎ（両者が 0.77秒おきに跳ぶ。§4.7 ジャンプ連続 0.70秒の下限） -- */
  { id: 's7_leap', zone: 'mirror', lengthM: 64, difficulty: 4, minSpeed: 0, s7: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.7, lane: -1, type: 'ROVER' },
            { at: 23.4, lane: 1, type: 'LASER_LOW' }, { at: 31.1, lane: 0, type: 'ROVER' },
            { at: 38.8, lane: -1, type: 'ROVER' }, { at: 46.5, lane: 1, type: 'ROVER' },
            { at: 54.2, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.7, lane: 0, type: 'LASER_LOW' },
            { at: 23.4, lane: -1, type: 'ROVER' }, { at: 31.1, lane: 1, type: 'ROVER' },
            { at: 38.8, lane: 0, type: 'LASER_LOW' }, { at: 46.5, lane: -1, type: 'ROVER' },
            { at: 54.2, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's7_leap_b', zone: 'mirror', lengthM: 64, difficulty: 5, minSpeed: 0, s7: 1, dense: 2, leap: 1, net: 1,
    floor: [{ at: 8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 15.7, lane: 0, type: 'ROVER' }, { at: 23.4, lane: 1, type: 'LASER_LOW' },
            { at: 31.1, lane: -1, type: 'ROVER' }, { at: 38.8, lane: 0, type: 'ROVER' },
            { at: 46.5, lane: 1, type: 'ROVER' }, { at: 54.2, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.7, lane: -1, type: 'ROVER' },
            { at: 23.4, lane: 0, type: 'ROVER' }, { at: 31.1, lane: 1, type: 'LASER_LOW' },
            { at: 38.8, lane: -1, type: 'ROVER' },
            { at: 46.5, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_HIGH, y1: CFG.NET.Y_LOW, phase: 0 } } },
            { at: 54.2, lane: 1, type: 'ROVER' }], events: [] },

  /* --- レーザーネット（契約§4.4 S7「密度アップ」＝1区画に 4〜5本） --------- */
  { id: 's7_net_a', zone: 'mirror', lengthM: 70, difficulty: 4, minSpeed: 0, s7: 1, dense: 2, net: 1, moving: 1,
    /* 区画の中に 4本（横ビーム1・斜め2・縦光柱1） */
    floor: [{ at: 5, lane: 0, type: 'NETGATE' },
            { at: 12, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 22, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 26.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 31.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 36.7, lane: 1, type: 'PILLAR' },
            { at: 41.6, lane: 0, type: 'ROVER' },
            { at: 51.6, lane: -1, type: 'LASER_V' }, { at: 56.5, lane: 0, type: 'PILLAR' },
            { at: 61.4, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 12, lane: 1, type: 'ROVER' }, { at: 41.6, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's7_net_b', zone: 'mirror', lengthM: 70, difficulty: 5, minSpeed: 0, s7: 1, dense: 2, net: 1, moving: 1,
    /* 区画（ゲート＋30基準m）の中に **5本**（横ビーム2・斜め2・縦光柱1）
       ＝契約§4.4 S7 の「レーザーネットの密度アップ」 */
    floor: [{ at: 4, lane: 0, type: 'NETGATE' },
            { at: 10, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 14.9, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_MID, y1: CFG.NET.Y_MID2, phase: 0 } } },
            { at: 14.9, lane: 1, type: 'PILLAR' },
            { at: 19.8, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 24.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 29.6, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 39.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: 0 } } },
            { at: 44.5, lane: -1, type: 'PILLAR' },
            { at: 49.4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: -1 } } },
            { at: 54.3, lane: 1, type: 'LASER_V' }, { at: 59.2, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 29.6, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's7_net_c', zone: 'mirror', lengthM: 76, difficulty: 5, minSpeed: 0, s7: 1, dense: 2, net: 1, leap: 1, moving: 1,
    /* 区画の中に **5本**（斜め3・横ビーム1・縦光柱1）＋ そのあと跳び継ぎ */
    floor: [{ at: 4, lane: 0, type: 'NETGATE' },
            { at: 10, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 14.9, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_MID, y1: CFG.NET.Y_MID2, phase: 0 } } },
            { at: 14.9, lane: 1, type: 'PILLAR' },
            { at: 19.8, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.5 } } },
            { at: 24.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 29.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } },
            { at: 34.5, lane: 1, type: 'ROVER' }, { at: 42.2, lane: -1, type: 'ROVER' },
            { at: 52.2, lane: 0, type: 'PILLAR' }, { at: 57.1, lane: 1, type: 'LASER_V' },
            { at: 62, lane: -1, type: 'PILLAR' }, { at: 66.9, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 34.5, lane: -1, type: 'ROVER' }, { at: 42.2, lane: 0, type: 'LASER_LOW' }], events: [] },

  /* --- 鏡ゾーン（契約§4.5「通った側のキャラの左右が反転」） ----------------
     ゲートの前後 1.0秒（10.9 基準m）はその面にウォールを置けないので、
     その空きぶんだけ密度が落ちる。譜面は主役と同じ「跳2・レーン3」を保って
     §4.3 の比率（ジャンプ 35%前後）を崩さないようにする。 */
  { id: 's7_mir_a', zone: 'mirror', lengthM: 92, difficulty: 4, minSpeed: 0, s7: 1, dense: 1, mir: 1, leap: 1,
    /* 床側が反転する（下半分の左右が逆になる） */
    floor: [{ at: 6, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'floor', backT: 5.2 } } },
            { at: 17, lane: 0, type: 'ROVER' }, { at: 24.7, lane: -1, type: 'ROVER' },
            { at: 34.7, lane: 0, type: 'PILLAR' }, { at: 39.6, lane: 1, type: 'LASER_V' },
            { at: 44.5, lane: -1, type: 'PILLAR' },
            { at: 49.4, lane: 0, type: 'ROVER' }, { at: 57.1, lane: 1, type: 'LASER_LOW' },
            { at: 69, lane: -1, type: 'PILLAR' }, { at: 73.9, lane: 0, type: 'LASER_V' },
            { at: 78.8, lane: 1, type: 'PILLAR' }, { at: 83.7, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 17, lane: 1, type: 'ROVER' }, { at: 24.7, lane: 0, type: 'LASER_LOW' },
            { at: 49.4, lane: -1, type: 'ROVER' }, { at: 57.1, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's7_mir_b', zone: 'mirror', lengthM: 92, difficulty: 5, minSpeed: 0, s7: 1, dense: 1, mir: 1, net: 1, leap: 1,
    /* 天井側が反転する（上半分の左右が逆になる）＋ 斜めビーム */
    floor: [{ at: 6, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'ceil', backT: 5.2 } } },
            { at: 17, lane: 1, type: 'ROVER' }, { at: 24.7, lane: 0, type: 'ROVER' },
            { at: 34.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 39.6, lane: -1, type: 'PILLAR' },
            { at: 44.5, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 49.4, lane: -1, type: 'ROVER' }, { at: 57.1, lane: 0, type: 'LASER_LOW' },
            { at: 69, lane: 1, type: 'PILLAR' }, { at: 73.9, lane: -1, type: 'LASER_V' },
            { at: 78.8, lane: 0, type: 'PILLAR' }, { at: 83.7, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 17, lane: -1, type: 'ROVER' }, { at: 24.7, lane: 1, type: 'LASER_LOW' },
            { at: 49.4, lane: 1, type: 'ROVER' }, { at: 57.1, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's7_mir_c', zone: 'mirror', lengthM: 92, difficulty: 5, minSpeed: 0, s7: 1, dense: 1, mir: 1, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'floor', backT: 5.2 } } },
            { at: 17, lane: -1, type: 'LASER_LOW' }, { at: 24.7, lane: 0, type: 'ROVER' },
            { at: 34.7, lane: 1, type: 'PILLAR' }, { at: 39.6, lane: -1, type: 'LASER_V' },
            { at: 44.5, lane: 0, type: 'PILLAR' },
            { at: 49.4, lane: 1, type: 'ROVER' }, { at: 57.1, lane: 0, type: 'ROVER' },
            { at: 69, lane: 1, type: 'LASER_V' }, { at: 73.9, lane: -1, type: 'PILLAR' },
            { at: 78.8, lane: 0, type: 'LASER_V' }, { at: 83.7, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 17, lane: 0, type: 'ROVER' }, { at: 24.7, lane: 1, type: 'ROVER' },
            { at: 49.4, lane: -1, type: 'ROVER' }, { at: 57.1, lane: 1, type: 'LASER_LOW' }], events: [] },

  /* --- 入れ替えワープ（契約§4.5「担当が入れ替わる」＝上下の担当） -----------
     入れ替えは **両面**に効くので、ゲートの前後はどちらの面にも置けない。 */
  { id: 's7_swap_a', zone: 'mirror', lengthM: 92, difficulty: 4, minSpeed: 0, s7: 1, dense: 1, swap: 1, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 5.2 } } },
            { at: 17, lane: 0, type: 'ROVER' }, { at: 24.7, lane: 1, type: 'ROVER' },
            { at: 34.7, lane: 0, type: 'PILLAR' }, { at: 39.6, lane: -1, type: 'LASER_V' },
            { at: 44.5, lane: 1, type: 'PILLAR' },
            { at: 49.4, lane: 0, type: 'ROVER' }, { at: 57.1, lane: -1, type: 'LASER_LOW' },
            { at: 69, lane: 1, type: 'PILLAR' }, { at: 73.9, lane: 0, type: 'LASER_V' },
            { at: 78.8, lane: -1, type: 'PILLAR' }, { at: 83.7, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 17, lane: -1, type: 'ROVER' }, { at: 24.7, lane: 0, type: 'LASER_LOW' },
            { at: 49.4, lane: 1, type: 'ROVER' }, { at: 57.1, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's7_swap_b', zone: 'mirror', lengthM: 92, difficulty: 5, minSpeed: 0, s7: 1, dense: 1, swap: 1, net: 1, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 5.2 } } },
            { at: 17, lane: 1, type: 'LASER_LOW' }, { at: 24.7, lane: -1, type: 'ROVER' },
            { at: 34.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 39.6, lane: 1, type: 'PILLAR' },
            { at: 44.5, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 49.4, lane: 1, type: 'ROVER' }, { at: 57.1, lane: 0, type: 'ROVER' },
            { at: 69, lane: -1, type: 'PILLAR' }, { at: 73.9, lane: 1, type: 'LASER_V' },
            { at: 78.8, lane: 0, type: 'PILLAR' }, { at: 83.7, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 17, lane: -1, type: 'ROVER' }, { at: 24.7, lane: 1, type: 'ROVER' },
            { at: 49.4, lane: -1, type: 'ROVER' }, { at: 57.1, lane: 1, type: 'LASER_LOW' }], events: [] },

  /* --- 重ね掛け（契約§6 P5a「S7後半＝脳の負荷の最高点」） -------------------
     鏡ゾーンの中で入れ替えワープを1回だけ通す。**両方同時に効くのは1区画に1回**で、
     必ず先に入れ替えを解除し、そのあと鏡を解除してからチャンクを終える。
     minSpeed 34 ＝ 速度が 34 を超える後半（約750m以降）でしか置かれない。
     ゲートが4枚ぶん（＝43.6 基準m）空くので密度は下がる＝既知の妥協点。 */
  { id: 's7_both_a', zone: 'mirror', lengthM: 102, difficulty: 5, minSpeed: 34, s7: 1, dense: 1, mir: 1, swap: 1, dual: 1, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'floor', backT: 6.8 } } },
            { at: 17, lane: 0, type: 'ROVER' },
            { at: 22, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 3.4 } } },
            { at: 33, lane: 1, type: 'LASER_V' }, { at: 37.9, lane: -1, type: 'PILLAR' },
            { at: 42.8, lane: 0, type: 'LASER_V' }, { at: 47.7, lane: 1, type: 'PILLAR' },
            { at: 52.6, lane: -1, type: 'ROVER' }, { at: 67, lane: 0, type: 'ROVER' },
            { at: 85, lane: 1, type: 'PILLAR' }, { at: 89.9, lane: -1, type: 'LASER_V' },
            { at: 94.8, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 17, lane: 1, type: 'ROVER' }, { at: 52.6, lane: 0, type: 'ROVER' },
            { at: 67, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 's7_both_b', zone: 'mirror', lengthM: 102, difficulty: 5, minSpeed: 34, s7: 1, dense: 1, mir: 1, swap: 1, dual: 1, net: 1, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 6.8 } } },
            { at: 17, lane: 1, type: 'ROVER' },
            { at: 22, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'ceil', backT: 3.4 } } },
            { at: 33, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 37.9, lane: 1, type: 'PILLAR' },
            { at: 42.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 47.7, lane: -1, type: 'PILLAR' }, { at: 52.6, lane: 0, type: 'ROVER' },
            { at: 67, lane: 1, type: 'ROVER' },
            { at: 85, lane: 0, type: 'PILLAR' }, { at: 89.9, lane: 1, type: 'LASER_V' },
            { at: 94.8, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 17, lane: -1, type: 'ROVER' }, { at: 52.6, lane: 1, type: 'ROVER' },
            { at: 67, lane: -1, type: 'LASER_LOW' }], events: [] },

  /* --- 壁の穴・つなぎ ------------------------------------------------------ */
  { id: 's7_wallhole', zone: 'mirror', lengthM: 68, difficulty: 4, minSpeed: 0, s7: 1, wallhole: 1, dense: 1,
    floor: [{ at: 10, lane: 1, type: 'WALLHOLE' }, { at: 20, lane: 0, type: 'PILLAR' },
            { at: 24.9, lane: -1, type: 'LASER_V' }, { at: 29.8, lane: 1, type: 'PILLAR' },
            { at: 34.7, lane: 0, type: 'ROVER' }, { at: 42.4, lane: -1, type: 'ROVER' },
            { at: 52.4, lane: 1, type: 'PILLAR' }, { at: 57.3, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 34.7, lane: 1, type: 'ROVER' },
            { at: 42.4, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's7_fill_a', zone: 'mirror', lengthM: 28, difficulty: 4, minSpeed: 0, s7: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 9.9, lane: 1, type: 'LASER_V' },
            { at: 14.8, lane: -1, type: 'PILLAR' }, { at: 19.7, lane: 0, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's7_fill_b', zone: 'mirror', lengthM: 32, difficulty: 4, minSpeed: 0, s7: 1, dense: 2, fill: 1, net: 1,
    floor: [{ at: 5, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } },
            { at: 9.9, lane: 1, type: 'PILLAR' }, { at: 14.8, lane: -1, type: 'LASER_V' },
            { at: 19.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 24.6, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },

  /* ==========================================================================
     S8「コア」（契約§4.4 / §4.5 / P5b）＝ **全部混在**
     ------------------------------------------------------------------------
     新ギミック:
       MERGE     合体区間。専用ゲート2枚で1組。区間の中では2体が中央で
                 **1体（合体体）**になり、床を走る。
                 操作（契約§4.5 を本作の上下タッチ規則（§4.2）で読んだ形）:
                   下半分の横フリック → レーン移動
                   上半分の上フリック → ジャンプ ／ 下フリック → スライディング
                 判定は床の1体ぶん＝天井側の障害物には当たらない
                 （Fair が合体区間の天井の要求を落とす）。
                 params.mrg = { n: 区間の長さ（秒） }。ゲートの直後 1.0秒は
                 **両面とも**ウォールを置けない。S8 では必ず2回出る（forceAt）。
     顔ぶれ: S3〜S7 の全ギミックが同居する。1本のチャンクに **2つ以上**の
     ギミックを重ねて入れ、短く（30〜54 基準m）刻む。速度 32〜44 では
     チャンク1本が 110〜215 実mに伸びるので、短くしないと1回の走行で
     顔ぶれが出そろわない。
     ------------------------------------------------------------------------
     ■ 間合いの決まり（基準速度＝1秒 = 10 基準m。§4.7 の下限に +9%の余裕）
         ウォール間隔（レーン→なんでも）   0.45秒 → 4.9 基準m
         ジャンプ → ジャンプ（同じ面）     0.70秒 → 7.7
         ジャンプ → レーン移動（同じ面）   0.92秒 → 10.0
         各種ゲート → 次のウォール         1.00秒 → 10.9
     ========================================================================== */

  /* --- 主役: 跳2・レーン3 の繰り返し（密度と §4.3 の比率を同時に作る） ------
     ■ **札は短く刻む**（span 20〜30 基準m）。速度 32〜44 ではチャンク1本が
       span × 3.2〜4.4 実mに伸びるので、長い札だと1回の走行に 5本しか入らず
       「全部混在」が成立しない（P5b 実測）。 */
  { id: 's8_mix_a', zone: 'core', lengthM: 40, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'ROVER' }, { at: 13.7, lane: -1, type: 'ROVER' },
            { at: 23.7, lane: 0, type: 'PILLAR' }, { at: 28.6, lane: 1, type: 'LASER_V' },
            { at: 33.5, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 6, lane: 1, type: 'ROVER' }, { at: 13.7, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_mix_b', zone: 'core', lengthM: 40, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, leap: 1, net: 1, moving: 1,
    floor: [{ at: 6, lane: 1, type: 'LASER_LOW' }, { at: 13.7, lane: 0, type: 'ROVER' },
            { at: 23.7, lane: -1, type: 'LASER_V' },
            { at: 28.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 33.5, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 6, lane: -1, type: 'ROVER' }, { at: 13.7, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's8_mix_c', zone: 'core', lengthM: 40, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, moving: 1,
    /* 点滅（消えている方を走り抜ける）＋ ワイド梁（空いた1レーンへ）。
       天井の跳びは「床が both 型でない場所」に置き、次の天井要求まで 10.0 空ける。 */
    floor: [{ at: 6, lane: 1, type: 'LASER_V', params: { blink: { onAtArrival: true } } },
            { at: 10.9, lane: -1, type: 'WIDEBAR' }, { at: 20.9, lane: 0, type: 'PILLAR' },
            { at: 25.8, lane: 1, type: 'LASER_V', params: { blink: { onAtArrival: false } } },
            { at: 30.7, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 10.9, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 密度の工兵: both 型（柱・光柱）の縫い。1エントリで両面に要求が出る ---
     4.9 基準m おき ＝ §4.7 の反応窓ちょうど。速度 37 で 約11回/100m。 */
  { id: 's8_weave_a', zone: 'core', lengthM: 40, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 9.9, lane: 1, type: 'LASER_V' },
            { at: 14.8, lane: -1, type: 'PILLAR' }, { at: 19.7, lane: 0, type: 'LASER_V' },
            { at: 24.6, lane: 1, type: 'PILLAR' }, { at: 29.5, lane: -1, type: 'LASER_V' },
            { at: 34.4, lane: 0, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 's8_weave_b', zone: 'core', lengthM: 40, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, net: 1, moving: 1,
    floor: [{ at: 5, lane: 1, type: 'LASER_V' },
            { at: 9.9, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 14.8, lane: 1, type: 'PILLAR' },
            { at: 19.7, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 24.6, lane: -1, type: 'LASER_V' },
            { at: 29.5, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 34.4, lane: 1, type: 'PILLAR' }],
    ceil: [], events: [] },
  /* --- 比率の工兵: 両面が 7.7 基準m おきに跳ぶ（§4.7 ジャンプ連続の下限） --- */
  { id: 's8_leap_a', zone: 'core', lengthM: 42, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, leap: 1,
    floor: [{ at: 6, lane: 0, type: 'ROVER' }, { at: 13.7, lane: -1, type: 'ROVER' },
            { at: 21.4, lane: 1, type: 'LASER_LOW' }, { at: 29.1, lane: 0, type: 'ROVER' },
            { at: 36.8, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 6, lane: 1, type: 'ROVER' }, { at: 13.7, lane: 0, type: 'LASER_LOW' },
            { at: 21.4, lane: -1, type: 'ROVER' }, { at: 29.1, lane: 1, type: 'ROVER' },
            { at: 36.8, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_leap_b', zone: 'core', lengthM: 42, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, leap: 1, net: 1,
    floor: [{ at: 6, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 13.7, lane: 0, type: 'ROVER' }, { at: 21.4, lane: 1, type: 'ROVER' },
            { at: 29.1, lane: -1, type: 'ROVER' }, { at: 36.8, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 13.7, lane: 1, type: 'ROVER' }, { at: 21.4, lane: -1, type: 'ROVER' },
            { at: 29.1, lane: 0, type: 'LASER_LOW' }, { at: 36.8, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 崩れる橋＋振り子の刃（S3 の顔ぶれ / 契約§4.4） ---------------------- */
  { id: 's8_bridge', zone: 'core', lengthM: 50, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    bridge: 1, pend: 1, moving: 1,
    floor: [{ at: 6, lane: 0, type: 'BRIDGE' }, { at: 13.7, lane: -1, type: 'ROVER' },
            { at: 23.7, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 28.6, lane: 1, type: 'PILLAR' }, { at: 33.5, lane: -1, type: 'LASER_V' },
            { at: 38.4, lane: 0, type: 'PILLAR' }, { at: 43.3, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 6, lane: 1, type: 'ROVER' }, { at: 13.7, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_bridge_b', zone: 'core', lengthM: 48, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    bridge: 1, leap: 1,
    floor: [{ at: 6, lane: 1, type: 'LASER_LOW' },
            { at: 13.7, lane: 0, type: 'BRIDGE' }, { at: 21.4, lane: -1, type: 'ROVER' },
            { at: 31.4, lane: 1, type: 'PILLAR' }, { at: 36.3, lane: -1, type: 'LASER_V' },
            { at: 41.2, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 6, lane: -1, type: 'ROVER' }, { at: 13.7, lane: 1, type: 'ROVER' },
            { at: 21.4, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's8_pend', zone: 'core', lengthM: 48, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    pend: 1, moving: 1,
    floor: [{ at: 6, lane: -1, type: 'WIDEBAR' },
            { at: 12.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 17.8, lane: -1, type: 'PILLAR' },
            { at: 22.7, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 27.6, lane: 1, type: 'LASER_V' }, { at: 37.6, lane: -1, type: 'PILLAR' },
            { at: 42.5, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 27.6, lane: -1, type: 'ROVER' }], events: [] },

  /* --- 同時スイッチ＋落ちる天井／無重力（S4・S6 の顔ぶれ） ----------------- */
  { id: 's8_sync', zone: 'core', lengthM: 50, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, sync: 1,
    floor: [{ at: 6, lane: -1, type: 'SYNCSW', params: { sync: { cl: 1, safe: -1, csafe: 1 } } },
            { at: 34.9, lane: 1, type: 'PILLAR' },
            { at: 39.8, lane: -1, type: 'LASER_V' }, { at: 44.7, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 25, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_sync_b', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, sync: 1, zero: 1,
    floor: [{ at: 3, lane: 0, type: 'ZEROG', params: { zero: { n: 3.4 } } },
            { at: 7, lane: 0, type: 'SYNCSW', params: { sync: { cl: 0, safe: 0, csafe: 0 } } },
            { at: 26, lane: 1, type: 'ROVER' }, { at: 38.4, lane: -1, type: 'PILLAR' },
            { at: 43.3, lane: 0, type: 'LASER_V' }, { at: 48.2, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 26, lane: -1, type: 'ROVER' }], events: [] },

  /* --- 落ちる天井の連鎖（床＝レーン移動／天井＝ジャンプ） ------------------- */
  { id: 's8_drop', zone: 'core', lengthM: 48, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    floor: [{ at: 32.1, lane: 0, type: 'PILLAR' },
            { at: 37, lane: 1, type: 'LASER_V' }, { at: 41.9, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 22, lane: -1, type: 'LASER_LOW' }, { at: 14, lane: 1, type: 'LASER_LOW' }, { at: 6, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_drop_door', zone: 'core', lengthM: 46, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    floor: [{ at: 6, lane: -1, type: 'WIDEBAR' }, { at: 10.9, lane: 0, type: 'PILLAR' },
            { at: 30.9, lane: 1, type: 'LASER_V' },
            { at: 35.8, lane: 0, type: 'PILLAR' }, { at: 40.7, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 20.9, lane: -1, type: 'LASER_LOW' }, { at: 10.9, lane: -1, type: 'ROVER' }], events: [] },

  /* --- 海流ベルト＋浮上足場／色の扉（S5 の顔ぶれ） ------------------------- */
  { id: 's8_cur', zone: 'core', lengthM: 50, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    /* 押し出しは 9・19・29 基準m。ウォールはその 5.0 あとに置く（§4.7 の 0.45秒） */
    floor: [{ at: 14, lane: 0, type: 'LASER_LOW' },
            { at: 24, lane: 1, type: 'PILLAR' }, { at: 34, lane: -1, type: 'LASER_V' },
            { at: 38.9, lane: 0, type: 'PILLAR' }, { at: 43.8, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 14, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's8_cur_door', zone: 'core', lengthM: 52, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    floor: [{ at: 14, lane: -1, type: 'WIDEBAR' }, { at: 24, lane: 0, type: 'PILLAR' },
            { at: 34, lane: -1, type: 'LASER_V' }, { at: 44, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 44, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's8_lift', zone: 'core', lengthM: 36, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, pend: 1, moving: 1,
    floor: [{ at: 6, lane: 0, type: 'LASER_LOW' },
            { at: 13.7, lane: -1, type: 'LASER_LOW' },
            { at: 23.7, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 28.6, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 6, lane: 1, type: 'ROVER' }, { at: 13.7, lane: 0, type: 'ROVER' }], events: [] },

  /* --- 重力反転ワープ／無重力（S6 の顔ぶれ） -------------------------------
     ゲートの前後 1.0秒（10.9 基準m）はウォールを置けないので、区間は短く取る。 */
  { id: 's8_warp', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, warp: 1, net: 1,
    floor: [{ at: 4, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 2.0 } } },
            { at: 15.2, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 20.1, lane: 1, type: 'PILLAR' },
            { at: 35, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 39.9, lane: -1, type: 'PILLAR' }, { at: 44.8, lane: 0, type: 'LASER_V' },
            { at: 49.7, lane: 1, type: 'PILLAR' }],
    ceil:  [], events: [] },
  { id: 's8_warp_b', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, warp: 1,
    floor: [{ at: 4, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 2.0 } } },
            { at: 15.2, lane: 1, type: 'PILLAR' }, { at: 20.1, lane: -1, type: 'LASER_V' },
            { at: 45, lane: 1, type: 'PILLAR' },
            { at: 49.9, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 35, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_zero', zone: 'core', lengthM: 52, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, zero: 1, leap: 1, net: 1,
    /* 無重力の中は滞空が 1.5倍＝「跳→跳」9.8／「跳→横」12.2 基準m が要る */
    floor: [{ at: 3, lane: 0, type: 'ZEROG', params: { zero: { n: 3.6 } } },
            { at: 6, lane: 0, type: 'ROVER' }, { at: 18.5, lane: -1, type: 'ROVER' },
            { at: 31, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 35.9, lane: 1, type: 'PILLAR' }, { at: 40.8, lane: -1, type: 'LASER_V' },
            { at: 45.7, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 6, lane: 1, type: 'ROVER' }, { at: 18.5, lane: 0, type: 'LASER_LOW' }], events: [] },

  /* --- レーザーネット（契約§4.5「S8 は密度アップ」＝1区画に 5〜6本） ------ */
  { id: 's8_net_a', zone: 'core', lengthM: 40, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, net: 1, moving: 1,
    /* 区画（ゲート＋26基準m）の中に **5本**（斜め2・横ビーム2・縦光柱1） */
    floor: [{ at: 3, lane: 0, type: 'NETGATE' },
            { at: 8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 12.9, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_MID, y1: CFG.NET.Y_MID2, phase: 0 } } },
            { at: 12.9, lane: 1, type: 'PILLAR' },
            { at: 17.8, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 22.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 27.6, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } }],
    ceil:  [{ at: 27.6, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's8_net_b', zone: 'core', lengthM: 44, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, net: 1, moving: 1, pend: 1,
    /* 区画の中に **6本**（斜め3・横ビーム1・縦光柱2）＝ 契約§4.5 の上限 */
    floor: [{ at: 3, lane: 0, type: 'NETGATE' },
            { at: 8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 12.9, lane: 1, type: 'LASER_V' },
            { at: 17.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } },
            { at: 22.7, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_MID2, y1: CFG.NET.Y_MID, phase: 0 } } },
            { at: 22.7, lane: 1, type: 'PILLAR' },
            { at: 27.6, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 32.5, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: 0 } } },
            { at: 37.4, lane: -1, type: 'LASER_V' }],
    ceil:  [], events: [] },

  /* --- 鏡ゾーン／入れ替えワープ（S7 の顔ぶれ） ----------------------------- */
  { id: 's8_mir', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 1, mir: 1, bridge: 1,
    floor: [{ at: 4, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'floor', backT: 2.2 } } },
            { at: 15.2, lane: 0, type: 'BRIDGE' }, { at: 22.9, lane: 1, type: 'ROVER' },
            { at: 37.9, lane: -1, type: 'PILLAR' }, { at: 42.8, lane: 0, type: 'LASER_V' },
            { at: 47.7, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 15.2, lane: -1, type: 'ROVER' }, { at: 22.9, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_mir_b', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 1, mir: 1, net: 1,
    floor: [{ at: 4, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'ceil', backT: 2.2 } } },
            { at: 15.2, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 20.1, lane: -1, type: 'PILLAR' },
            { at: 25, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 37.9, lane: 1, type: 'PILLAR' }, { at: 42.8, lane: -1, type: 'LASER_V' },
            { at: 47.7, lane: 0, type: 'PILLAR' }],
    ceil:  [], events: [] },
  { id: 's8_swap', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 1, swap: 1,
    floor: [{ at: 4, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 2.2 } } },
            { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.9, lane: 1, type: 'ROVER' }, { at: 37.9, lane: 0, type: 'PILLAR' },
            { at: 42.8, lane: -1, type: 'LASER_V' }, { at: 47.7, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 15.2, lane: -1, type: 'ROVER' }, { at: 22.9, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_swap_b', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 1,
    swap: 1, pend: 1, moving: 1,
    /* 入れ替えの出口ゲートは at 26。その直後 10.9 はウォールを置けない */
    floor: [{ at: 4, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 2.2 } } },
            { at: 15.2, lane: 1, type: 'PILLAR' },
            { at: 20.1, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } },
            { at: 25, lane: -1, type: 'LASER_V' },
            { at: 37.9, lane: 0, type: 'PILLAR' }, { at: 42.8, lane: 1, type: 'LASER_V' },
            { at: 47.7, lane: -1, type: 'PILLAR' }],
    ceil:  [], events: [] },

  /* ==========================================================================
     「全部混在」の網羅札（契約§4.4 S8）— **1本で3〜4ギミック**
     ------------------------------------------------------------------------
     速度 32〜44 では 1本のチャンクが基準mの 3.2〜4.4倍に伸びる。合体区間が
     必ず2回（1回あたり 52基準m ≒ 220実m）入るので、**ランダム区間に置ける札は
     3〜4本しかない**。12種のギミックをその中で顔出しさせるため、
     顔ぶれを4組に割って「組ごとに1本」で覆う:
       fam_net   レーザーネット ＋ 色の扉 ＋ 浮上足場 ＋ 落ちる天井
       fam_cur   海流ベルト ＋ 振り子の刃 ＋ 同時スイッチ
       fam_zero  無重力 ＋ 鏡ゾーン ＋ 崩れる橋
       fam_warp  重力反転ワープ ＋ 入れ替えワープ ＋ 落ちる天井
     どの3組を出すかは **シードで回す**（STAGE_DEFS.S8.forcePlan）。
     ------------------------------------------------------------------------
     ■ 間合いの決まり（基準速度＝1秒 = 10 基準m。§4.7 の下限に +7%の余裕）
         ウォール間隔（レーン→なんでも）   0.45秒 → 4.9 基準m
         ジャンプ → ジャンプ（同じ面）     0.70秒 → 7.7
         ジャンプ → レーン移動（同じ面）   0.92秒 → 10.0
         無重力の中（滞空1.5倍）           跳→跳 10.5 ／ 跳→横 13.2
         各種ゲート → 次のウォール         1.00秒 → 10.9
     ■ 旧「落ちる天井」の位置は契約 v2 で縦レーザー（両面のレーン移動）に置き換えた。
     ========================================================================== */

  /* --- ネット＋扉＋浮上足場＋落ちる天井（ゲート無し＝いちばん濃い 7.1回/100m） */
  { id: 's8_cov_net_a', zone: 'core', lengthM: 46, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    net: 1, moving: 1, cover: 1, fam_net: 1,
    floor: [{ at: 1, lane: 0, type: 'NETGATE' },
            { at: 3, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 7.9, lane: 1, type: 'LASER_V' },
            { at: 12.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 17.7, lane: -1, type: 'WIDEBAR' },
            { at: 22.6, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 40.3, lane: 1, type: 'LASER_LOW' }, { at: 32.6, lane: -1, type: 'LASER_LOW' }, { at: 17.7, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's8_cov_net_b', zone: 'core', lengthM: 46, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    net: 1, moving: 1, cover: 1, fam_net: 1,
    floor: [{ at: 1, lane: 0, type: 'NETGATE' },
            { at: 3, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_MID, y1: CFG.NET.Y_MID2, phase: 0 } } },
            { at: 3, lane: 1, type: 'PILLAR' },
            { at: 7.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 12.8, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: 0 } } },
            { at: 17.7, lane: 0, type: 'WIDEBAR' },
            { at: 22.6, lane: 1, type: 'LASER_LOW' }],
    ceil:  [{ at: 40.3, lane: -1, type: 'LASER_LOW' }, { at: 32.6, lane: 0, type: 'LASER_LOW' }, { at: 17.7, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 海流ベルト＋振り子の刃＋同時スイッチ（4.8回/100m・跳び4割） ---------
     押し出しは 9・19・29 基準m。ウォールはその 1.0 あと（押し出しの直前
     0.45秒には置けない＝ Fair が弾く）。**流されながら跳ぶ**のがこの札の主題。
     同時スイッチのパッド(35)と橋(48)の間にも 1枚だけ置ける（6 ／ 7 基準m）。 */
  { id: 's8_cov_cur_a', zone: 'core', lengthM: 52, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    pend: 1, sync: 1, moving: 1, leap: 1, cover: 1, fam_cur: 1,
    floor: [{ at: 10, lane: 0, type: 'ROVER' }, { at: 20, lane: -1, type: 'ROVER' },
            { at: 30, lane: 1, type: 'PILLAR' },
            { at: 35, lane: 0, type: 'SYNCSW', params: { sync: { cl: 0, safe: 0, csafe: 0 } } },
            { at: 41, lane: -1, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 20, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_cov_cur_b', zone: 'core', lengthM: 52, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    pend: 1, sync: 1, moving: 1, leap: 1, cover: 1, fam_cur: 1,
    floor: [{ at: 10, lane: 1, type: 'ROVER' }, { at: 20, lane: 0, type: 'ROVER' },
            { at: 30, lane: -1, type: 'PILLAR' },
            { at: 35, lane: -1, type: 'SYNCSW', params: { sync: { cl: 1, safe: -1, csafe: 1 } } },
            { at: 41, lane: 1, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0 } } }],
    ceil:  [{ at: 10, lane: -1, type: 'LASER_LOW' }, { at: 20, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 無重力＋鏡ゾーン＋崩れる橋（跳ぶ要求が 8割＝§4.3 の比率を作る札） ---
     無重力の中は滞空 1.5倍。§4.7 の下限は 跳→跳 9.8／跳→横 12.0 基準m だが、
     **チャンクの中でも速度は上がり続ける**ので下限ちょうどでは弾かれる
     （P5b 実測: 37.81m < 38.00m でこの札が一度も選ばれなかった）。10.5／13.2 を使う。 */
  { id: 's8_cov_zero_a', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    zero: 1, mir: 1, bridge: 1, leap: 1, cover: 1, fam_zero: 1,
    floor: [{ at: 0, lane: 0, type: 'ZEROG', params: { zero: { n: 2.0 } } },
            { at: 3, lane: 0, type: 'ROVER' }, { at: 13.5, lane: -1, type: 'ROVER' },
            { at: 26.7, lane: 1, type: 'PILLAR' },
            { at: 30, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'floor', backT: 2.0 } } },
            { at: 41, lane: 0, type: 'BRIDGE' }, { at: 48.7, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 3, lane: 1, type: 'ROVER' }, { at: 13.5, lane: 0, type: 'LASER_LOW' },
            { at: 41, lane: -1, type: 'ROVER' }, { at: 48.7, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_cov_zero_b', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 2,
    zero: 1, mir: 1, bridge: 1, leap: 1, cover: 1, fam_zero: 1,
    floor: [{ at: 0, lane: 0, type: 'ZEROG', params: { zero: { n: 2.0 } } },
            { at: 3, lane: 1, type: 'LASER_LOW' }, { at: 13.5, lane: 0, type: 'ROVER' },
            { at: 26.7, lane: -1, type: 'PILLAR' },
            { at: 30, lane: 0, type: 'MIRRORZ', params: { mir: { side: 'ceil', backT: 2.0 } } },
            { at: 41, lane: 1, type: 'BRIDGE' }, { at: 48.7, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 3, lane: -1, type: 'ROVER' }, { at: 13.5, lane: 1, type: 'ROVER' },
            { at: 41, lane: 0, type: 'LASER_LOW' }, { at: 48.7, lane: -1, type: 'ROVER' }], events: [] },

  /* --- 入れ替えワープ＋重力反転ワープ＋落ちる天井（ゲート2組＝いちばん薄い）
     ゲートの直後 1.0秒（10.9 基準m）は両面ともウォールを置けないので、
     **区間の中に詰めて置く**（区間の長さ backT を 2.6 に取って2枚ぶん稼ぐ）。 */
  { id: 's8_cov_warp_a', zone: 'core', lengthM: 56, difficulty: 5, minSpeed: 0, s8: 1, dense: 1,
    swap: 1, warp: 1, cover: 1, fam_warp: 1,
    floor: [{ at: 0, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 2.6 } } },
            { at: 27, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 2.6 } } },
            { at: 38.2, lane: 0, type: 'PILLAR' }, { at: 43.1, lane: -1, type: 'LASER_V' },
            { at: 48, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 18.9, lane: 1, type: 'LASER_LOW' }, { at: 11.2, lane: -1, type: 'LASER_LOW' }, { at: 48, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's8_cov_warp_b', zone: 'core', lengthM: 56, difficulty: 5, minSpeed: 0, s8: 1, dense: 1,
    swap: 1, warp: 1, cover: 1, fam_warp: 1,
    floor: [{ at: 0, lane: 0, type: 'GRAVWARP', params: { warp: { backT: 2.6 } } },
            { at: 27, lane: 0, type: 'HANDSWAP', params: { swp: { backT: 2.6 } } },
            { at: 38.2, lane: 1, type: 'PILLAR' }, { at: 43.1, lane: 0, type: 'LASER_V' },
            { at: 48, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 18.9, lane: -1, type: 'LASER_LOW' }, { at: 11.2, lane: 1, type: 'LASER_LOW' }, { at: 48, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 合体区間（契約§4.4 S8「合体区間」/ §4.5）: S8 で必ず2回 ------------
     区間は 3.2秒 ＝ 速度 32〜44 で 102〜141m（契約「100〜150m」）。
     区間の中は **床だけ**（天井には誰も居ない）＝ 要求は1体ぶんしか置けず、
     どうしても薄くなる（**既知の妥協点**）。ゲートの直後 1.0秒（10.9 基準m）は
     両面ともウォールを置けないので、入口と出口でさらに 21.8 が空く。
     そのぶん **区間の中は詰められるだけ詰め、出口の猶予明けに濃い尾を付ける**。 */
  { id: 's8_merge_a', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 1,
    merge: 1, leap: 1,
    floor: [{ at: 0, lane: 0, type: 'PILLAR' },
            { at: 4, lane: 0, type: 'MERGE', params: { mrg: { n: 3.2 } } },
            /* --- ここから合体体（1体）: 跳ぶ→跳ぶ→横へ --- */
            { at: 15, lane: 0, type: 'ROVER' }, { at: 22.7, lane: -1, type: 'ROVER' },
            { at: 32.7, lane: 1, type: 'PILLAR' },
            /* --- 出口ゲートは at 36。猶予（10.9）の明けから2体ぶんの尾 --- */
            { at: 47, lane: 0, type: 'PILLAR' }, { at: 51.9, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 51.9, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's8_merge_b', zone: 'core', lengthM: 54, difficulty: 5, minSpeed: 0, s8: 1, dense: 1,
    merge: 1, net: 1, moving: 1,
    floor: [{ at: 0, lane: 0, type: 'LASER_V' },
            { at: 4, lane: 0, type: 'MERGE', params: { mrg: { n: 3.2 } } },
            { at: 15, lane: 1, type: 'PILLAR' },
            { at: 19.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 24.8, lane: -1, type: 'LASER_V' }, { at: 29.7, lane: 1, type: 'PILLAR' },
            { at: 47, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 51.9, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 51.9, lane: 0, type: 'LASER_LOW' }], events: [] },
  /* --- 壁の穴・つなぎ ------------------------------------------------------ */
  { id: 's8_wallhole', zone: 'core', lengthM: 34, difficulty: 5, minSpeed: 0, s8: 1, wallhole: 1, dense: 1,
    floor: [{ at: 8, lane: 1, type: 'WALLHOLE' }, { at: 18, lane: 0, type: 'PILLAR' },
            { at: 22.9, lane: -1, type: 'LASER_V' }, { at: 27.8, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's8_fill_a', zone: 'core', lengthM: 24, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, fill: 1,
    floor: [{ at: 4, lane: 0, type: 'PILLAR' }, { at: 8.9, lane: 1, type: 'LASER_V' },
            { at: 13.8, lane: -1, type: 'PILLAR' }, { at: 18.7, lane: 0, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's8_fill_b', zone: 'core', lengthM: 26, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, fill: 1, net: 1,
    floor: [{ at: 4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: 1 } } },
            { at: 8.9, lane: 1, type: 'PILLAR' }, { at: 13.8, lane: -1, type: 'LASER_V' },
            { at: 18.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } }],
    ceil: [], events: [] },
  /* --- 落ちる天井の縫い（密度と §4.3 の比率を同時に作る主力の短い札） ------
     1エントリで 床＝レーン移動／天井＝ジャンプ。7.7 基準m おき（跳→跳の下限）に
     並べると 7.7 あたり2要求＝速度40で 約6.5回/100m・ジャンプ 50%。 */
  { id: 's8_fill_c', zone: 'core', lengthM: 32, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, fill: 1,
    floor: [{ at: 4, lane: 0, type: 'PILLAR' }, { at: 8.9, lane: 1, type: 'LASER_V' },
            { at: 13.8, lane: -1, type: 'PILLAR' }],
    ceil: [{ at: 26.4, lane: 1, type: 'LASER_LOW' }, { at: 18.7, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 's8_fill_d', zone: 'core', lengthM: 32, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, fill: 1, net: 1,
    floor: [{ at: 4, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 8.9, lane: -1, type: 'PILLAR' }, { at: 13.8, lane: 1, type: 'LASER_V' }],
    ceil: [{ at: 26.4, lane: 0, type: 'LASER_LOW' }, { at: 18.7, lane: -1, type: 'LASER_LOW' }], events: [] },
  /* --- 両面が跳ぶ短い札（ジャンプ比率の工兵） ------------------------------ */
  { id: 's8_fill_e', zone: 'core', lengthM: 32, difficulty: 5, minSpeed: 0, s8: 1, dense: 2, fill: 1, leap: 1,
    floor: [{ at: 4, lane: 0, type: 'ROVER' }, { at: 11.7, lane: -1, type: 'ROVER' },
            { at: 19.4, lane: 1, type: 'LASER_LOW' }, { at: 27.1, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 4, lane: 1, type: 'ROVER' }, { at: 11.7, lane: 0, type: 'LASER_LOW' },
            { at: 19.4, lane: -1, type: 'ROVER' }, { at: 27.1, lane: 1, type: 'ROVER' }], events: [] }
];

/* ---------------------------------------------------------------- 導入区間（S1）
   契約 §4.4「基本障害物を1種ずつ順に紹介」/ §4.8 チュートリアル。
   ・位置は**実寸 m**（速度で伸縮させない）。1つずつ 33m 間隔で出す＝16m/s で約2秒おき。
   ・tip は障害物の 30m 手前（約1.9秒前）に出す DOM オーバーレイの合図。
   ・まず片側だけ（床→天井）→ 横に避ける → 光線 → ワイド梁 → 最後に両側同時（穴は契約 v2 で失効）。 */
const INTRO_S1 = [
  { at: 60,  tip: 'jump_l', floor: [{ lane: 0, type: 'ROVER' }] },
  { at: 93,  tip: 'jump_r', ceil:  [{ lane: 0, type: 'ROVER' }] },
  { at: 126, tip: 'lane',   floor: [{ lane: 1, type: 'PILLAR' }] },          // both（2体ともレーン移動）
  { at: 192, tip: 'laser',  ceil:  [{ lane: 0, type: 'LASER_LOW' }] },
  { at: 225, tip: 'wide',   floor: [{ lane: -1, type: 'WIDEBAR' }] },
  { at: 262, tip: 'both',   floor: [{ lane: 0, type: 'ROVER' }], ceil: [{ lane: 1, type: 'ROVER' }] }
];

/* ---------------------------------------------------------------- tip の対象（契約§4.8）
   新ギミックの初出 tip が「何を」説明するか。チャンクの中で、この型のエントリの
   **最初の1つ**を対象にする（型は並び順が優先順位。見つかった最初の型を使う）。
   ・ゲートで始まる区間（無重力・重力反転・鏡・入れ替え・合体）は **入口の通過** が
     「対象の通過」（区間の全長を窓にすると区間の中身が全部消えてしまうため）。
   ・レーザー網は枠（NETGATE）ではなく最初のビームを対象にする（跳ぶ／よけるのが本題）。 */
const TIP_TARGET = {
  bridge: ['BRIDGE'], pend: ['LASER_SCAN'], sync: ['SYNCSW'],
  warp: ['GRAVWARP'], zero: ['ZEROG'], net: ['LASER_H', 'LASER_DIAG', 'NETGATE'],
  mir: ['MIRRORZ'], swap: ['HANDSWAP'], dual: ['HANDSWAP'], merge: ['MERGE']
};
const TIP_ENTRY_ONLY = { ZEROG: 1, GRAVWARP: 1, MIRRORZ: 1, HANDSWAP: 1, MERGE: 1 };

const CHUNK_BY_ID = {};
CHUNK_DEFS.forEach((c) => { CHUNK_BY_ID[c.id] = c; });

/* ---------------------------------------------------------------- ステージ定義 */
const STAGE_DEFS = {
  /* P1の仮ステージ（無地のコリドー・ゾーン装飾なし） */
  S0: {
    id: 'S0', name: '仮ステージ S0', zone: 'neon', lengthM: 900,
    speedFrom: 16, speedTo: 20, maxRank: 3, setpiece: null, density: [3, 5],
    chunkPool: CHUNK_DEFS.filter((c) => !c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7 && !c.s8).map((c) => c.id)
  },
  /* S1 ネオン都市・入門（契約 §4.4）: 900m / 16→20 / チェックポイント 300・600 /
     冒頭に固定の導入区間、終盤200mは「高速道路の連鎖崩落」。ランク1〜2のみ＝スライド0%。 */
  S1: {
    id: 'S1', name: 'S1 ネオン都市・入門', zone: 'neon', lengthM: 900,
    speedFrom: 16, speedTo: 20, maxRank: 2, setpiece: 'collapse',
    density: [3, 6],                       // 100mあたりの必須動作（契約§4.7）
    intro: INTRO_S1,
    /* 導入区間と終盤の崩落は「跳ぶ」要求が多めなので、ランダム区間は
       「横に避ける」チャンクを重み付け（同じidを2回入れる＝選ばれやすくする）して
       ステージ全体を契約§4.3の比率（レーン50%前後／ジャンプ35%前後）に寄せる。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2 && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7 && !c.s8).map((c) => c.id)
      .concat(['c1_pillar', 'c1_laserv', 'c1_laserv_b', 'c1_weave_a', 'c1_weave_b', 'c2_weave', 'c2_lv_weave'])
      .concat(['d2_duo_a', 'd2_duo_b', 'd2_duo_a', 'd2_duo_b'])
  },
  /* S2 ネオン都市・夜（契約 §4.4）: 1200m / 20→24 / チェックポイント 400・800 /
     新ギミック＝動くレーザー（横スキャン・回転・点滅）、ここから壁の穴が登場。
     終盤200mは「ビル間の大ジャンプ」。ランク1〜3。 */
  S2: {
    id: 'S2', name: 'S2 ネオン都市・夜', zone: 'neon', lengthM: 1200,
    speedFrom: 20, speedTo: 24, minRank: 2, maxRank: 3, setpiece: 'bigjump',
    density: [5, 8],                       // 100mあたりの必須動作（契約§4.7）
    /* 動くレーザーのチャンクを厚めに（同じidを2回入れる＝選ばれやすくする）。
       レーン移動に寄りすぎないよう、跳ぶ系（ローバー/ギャップ/ローレーザー）も残す。 */
    /* 顔ぶれ: 動くレーザー（厚め）＋壁の穴＋跳ぶ系。
       S1 で使った「柱/縦レーザーだけ」の rank1 チャンク（＝レーン移動しか要求しない）は
       S2 では外す。動くレーザー自体が両者にレーン移動を要求するので、そのままだと
       レーン移動に偏って §4.3 の比率（レーン50%前後／ジャンプ35%前後）を外れるため。 */
    /* 【2026-09-21 P2c】大ジャンプが自由飛行になり、演出区間がレーン移動の要求を
       持たなくなった（§4.5 改訂）。その分をランダム区間で取り戻さないと
       §4.3 の比率（レーン50%前後）を割るので、横に避けるだけのチャンクを厚めに戻す。 */
    chunkPool: ['c1_pillar', 'c1_weave_a', 'c1_weave_b', 'c2_weave', 'c2_lv_weave',
                'c1_pillar', 'c1_weave_a', 'c1_weave_b', 'c2_weave', 'c2_lv_weave',
                'c1_pillar', 'c1_weave_a', 'c1_weave_b', 'c2_weave', 'c2_lv_weave',
                'c1_rover_f', 'c1_rover_c', 'c1_gap_f', 'c1_gap_c', 'c1_lowl_f', 'c1_lowl_c',
                'c1_laserv',
                'c2_alt_a', 'c2_alt_b', 'c2_sync', 'c2_mix',
                'c3_dual_a', 'c3_wide', 'c3_mix', 'c3_gauntlet',
                /* 壁の穴は S2 から登場する顔なので厚めに（連続禁止は生成器が見る） */
                'c3_wallhole_f', 'c3_wallhole_c', 'c3_wallhole_x',
                'c3_wallhole_f', 'c3_wallhole_c', 'c3_wallhole_x',
                'c3_wallhole_f', 'c3_wallhole_c', 'c3_wallhole_x']
      /* S3 の顔ぶれ（!c.s3）は混ぜない。ゾーンが変わればギミックも変わる（契約§4.4） */
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7).map((c) => c.id))     // 動くレーザーを厚く
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7 && c.difficulty <= 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7).map((c) => c.id))      // 密集チャンク
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7).map((c) => c.id))
      /* 横に避けるチャンクを厚くしたぶん、点滅レーザーが薄まらないよう補う（P2c） */
      .concat(['c2_blink_v', 'c2_blink_low', 'c3_blink_scan',
               'c2_blink_v', 'c2_blink_low', 'c3_blink_scan'])
  },
  /* S3 古代遺跡・外周（契約 §4.4）: 1200m / 22→26 / チェックポイント 400・800 /
     新ギミック＝崩れる橋・振り子の刃。終盤200mは「巨岩の追跡」。
     §4.7 の「両者同時要求の余白」は S3 以降 0.45秒。密度は 6→10回/100m。 */
  S3: {
    id: 'S3', name: 'S3 古代遺跡・外周', zone: 'ruins', lengthM: 1200,
    speedFrom: 22, speedTo: 26, minRank: 2, maxRank: 3, setpiece: 'rockchase',
    density: [6, 10],
    reactBoth: CFG.FAIR.REACT_BOTH_LATE,
    /* 新ギミックの初出で短い指示を出す（契約§4.8 チュートリアル） */
    tipOnce: { bridge: 'bridge', pend: 'pendulum' },
    /* 顔ぶれ: 遺跡の新チャンクを主役に、ネオンで覚えた基本形（密集・動くレーザー）を混ぜる。
       遺跡スキンでは動くレーザー＝振り子の刃・火の輪・噴き出す炎に見える（判定は共通）。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.s3).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s3 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s3 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s3 && c.bridge).map((c) => c.id))
      .concat(['c3_dual_a', 'c3_wide', 'c3_mix', 'c3_gauntlet',
               'd3_duo_a', 'd3_duo_c', 'd3_duo_e', 'd3_duo_f',
               'c2_alt_a', 'c2_alt_b', 'c2_sync', 'c2_mix',
               'c3_rot_lean', 'c3_rot_ceil', 'c3_rot_pair', 'c3_scan_rot'])
  },
  /* S4 古代遺跡・内部（契約 §4.4）: 1200m / 24→28 / チェックポイント 400・800 /
     新ギミック＝同時スイッチ・落ちる天井。終盤200mは「神殿崩壊」。
     ゾーンは遺跡のまま、区間パターンだけ **内部（壁区間主体）** に替える（zoneMode）。 */
  S4: {
    id: 'S4', name: 'S4 古代遺跡・内部', zone: 'ruins', zoneMode: 'inner', lengthM: 1200,
    speedFrom: 24, speedTo: 28, minRank: 3, maxRank: 4, setpiece: 'templefall',
    density: [6, 10],
    reactBoth: CFG.FAIR.REACT_BOTH_LATE,
    tipOnce: { sync: 'sync' },
    /* 顔ぶれ: S4 の新チャンクを主役に、S3 で覚えた遺跡の形（崩れる橋・振り子・列柱）を混ぜる */
    chunkPool: CHUNK_DEFS.filter((c) => c.s4).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.sync).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.sync).map((c) => c.id))
      .concat(['r3_weave_a', 'r3_weave_b', 'r3_weave_c', 'r3_leap_a', 'r3_leap_b',
               'r3_duo_a', 'r3_duo_c', 'r3_duo_e', 'r3_bridge_duo', 'r3_wallhole'])
  },
  /* S5 深海（契約 §4.4）: 1500m / 26→30 / チェックポイント 500・1000 /
     新ギミック＝海流ベルト・浮上足場・色の扉。終盤200mは「巨大魚の通過」。
     密度は 8→12回/100m（契約§4.7）。両者同時要求の余白は 0.45秒。 */
  S5: {
    id: 'S5', name: 'S5 深海', zone: 'sea', lengthM: 1500,
    speedFrom: 26, speedTo: 30, minRank: 3, maxRank: 4, setpiece: 'megafish',
    density: [8, 12],
    reactBoth: CFG.FAIR.REACT_BOTH_LATE,
    /* 海流ベルト・浮上足場・色の扉は契約 v2（2026-09-24）で失効。新ギミック（サメ・泡）は P7b */
    /* 顔ぶれ: S5 の新チャンクが主役。基本形（柱・光線・跳び継ぎ）は深海スキンで顔が変わる。
       他ゾーン専用のギミック（崩れる橋・同時スイッチ・落ちる天井）は混ぜない（契約§4.4）。 */
    /* 跳び継ぎ（leap）を厚く入れて §4.3 の比率（レーン50%前後／ジャンプ35%前後）に寄せる。
       深海の顔ぶれは both 型（岩柱・放電柱・触手）が主役でレーン移動に偏るため。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.s5).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.leap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.leap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.leap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.leap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.leap).map((c) => c.id))
  },
  /* S6 宇宙ステーション（契約 §4.4）: 1500m / 28→34 / チェックポイント 500・1000 /
     新ギミック＝重力反転ワープ・無重力ジャンプ・レーザーネット。
     終盤200mは「区画爆発」。密度は 8→12回/100m（契約§4.7）。ランク4〜5。 */
  S6: {
    id: 'S6', name: 'S6 宇宙ステーション', zone: 'space', lengthM: 1500,
    speedFrom: 28, speedTo: 34, minRank: 4, maxRank: 5, setpiece: 'blastout',
    density: [8, 12],
    reactBoth: CFG.FAIR.REACT_BOTH_LATE,
    /* 28→34 m/s では「跳ぶ譜面」が密度で不利になる（ジャンプ連続は 0.70秒より詰められない）。
       比率の引きを強め、出せないスライドぶんをジャンプへ振り直す（§4.3 のレーン50%前後）。 */
    /* P5c: tip の窓で初出チャンクの頭（跳びを含む）を外すぶんレーン寄りになるので 9 → 13 */
    ratioPull: 13,
    mix: { lane: 0.49, jump: 0.47, slide: 0.04 },
    /* 新ギミック（重力反転・無重力・レーザーネット）を1回の走行で必ず顔出しさせる */
    tipBoost: true,
    /* P5c（契約§4.8）: 初出は tip の窓（speed×3.5秒）ぶん場所を取るので、顔出しの率を保つよう強める */
    tipMul: 9,
    tipOnce: { warp: 'gravwarp', zero: 'zerog', net: 'lasernet' },
    /* 顔ぶれ: S6 の新チャンクだけ。他ゾーン専用のギミック（崩れる橋・同時スイッチ・
       落ちる天井・海流・色の扉）は混ぜない（契約§4.4）。
       跳び継ぎ（leap）を厚く入れて §4.3 の比率に寄せる（宇宙の顔ぶれは both 型
       ＝支柱・防護フィールド・斜めビームが主役でレーン移動に偏るため）。 */
    /* 新ギミックのチャンク（無重力・重力反転）は間合いが伸びるぶん密度が下がるので、
       そのままだと密度の重みに負けて出てこない。厚めに積んで顔を出させる。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.s6).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.id.indexOf('s6_weave') !== 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.id.indexOf('s6_mix') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.id.indexOf('s6_mix') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.warp).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.warp).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.zero).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.zero).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.net).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.leap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.leap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s6 && c.wallhole).map((c) => c.id))
  },
  /* S7 鏡の世界（契約 §4.4）: 1500m / 30→38 / チェックポイント 500・1000 /
     新ギミック＝鏡ゾーン（片方の左右が反転）・入れ替えワープ（上下の担当が入れ替わる）＋
     レーザーネットの密度アップ（1区画 4〜5本）。終盤200mは「鏡の砕け散り」。ランク4〜5。
     ■ 密度: 契約§4.7 の目安は 10→14回/100m だが、30〜38 m/s では
       「ジャンプ連続 0.70秒」「ウォール間隔 0.45秒」の下限から
       **約11.7回/100m（全部レーン移動）が理論上限**で、§4.3 の比率
       （ジャンプ 35%前後）と両立する実質上限は決定ログどおり **約10回/100m**。
       そこでステージの目安を 9→11 に置く（契約§4.7 との差は既知の妥協点）。 */
  S7: {
    id: 'S7', name: 'S7 鏡の世界', zone: 'mirror', lengthM: 1500,
    speedFrom: 30, speedTo: 38, minRank: 4, maxRank: 5, setpiece: 'shatter',
    density: [8, 10],
    reactBoth: CFG.FAIR.REACT_BOTH_LATE,
    ratioPull: 10,
    mix: { lane: 0.52, jump: 0.45, slide: 0.03 },
    /* 新ギミック（鏡ゾーン・入れ替えワープ）を1回の走行で必ず顔出しさせる */
    tipBoost: true,
    /* ゲートのチャンクは猶予のぶん密度が低く、密度の重みに強く負けるので
       S6（×3）より強く引き上げる。まだ出していないギミックだけに掛かる。 */
    /* P5c（契約§4.8）: tip の窓のぶん初出が遅れ、重ね掛け（鏡と入れ替えの両方が出てから）
       まで届かない走行が増えたので 9 → 40 に強める（tip 出現率を従来並みに保つ） */
    tipMul: 40,
    /* 重ね掛け（dual）も「新ギミック」として1回の走行で必ず顔を出させる
       ＝ 契約§6 P5a「S7後半＝脳の負荷の最高点」 */
    tipOnce: { mir: 'mirrorzone', swap: 'handswap', dual: 'dualzone' },
    /* 顔ぶれ: S7 の新チャンクだけ。他ゾーン専用のギミックは混ぜない（契約§4.4）。
       主役（跳2・レーン3 の s7_mix / ネットの s7_net）を厚く積む。
       ゲートを持つチャンク（鏡・入れ替え）は猶予のぶん密度が落ちるので、
       **1本ずつだけ** 積み増す（顔出しは tipBoost が受け持つ）。
       重ね掛け（mir かつ swap）はさらに空くので積み増さない。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.s7).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.id.indexOf('s7_mix') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.id.indexOf('s7_mix') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.id.indexOf('s7_mix') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.net && !c.mir && !c.swap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.net && !c.mir && !c.swap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.leap && !c.mir && !c.swap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.leap && !c.mir && !c.swap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.mir && !c.swap).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.swap && !c.mir).map((c) => c.id))
      /* 重ね掛け（S7後半の山場）は長くて密度も低いので、置ける機会そのものが少ない。
         後半にしか候補にならない（minSpeed 34）ぶん、厚めに積む。 */
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.dual).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.dual).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.dual).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s7 && c.wallhole).map((c) => c.id))
  },
  /* S8 コア（契約 §4.4）: 1500m / 32→44 / チェックポイント 500・1000 /
     **全部混在**（S3〜S7 の全ギミック）＋ 新ギミック＝合体区間（必ず2回）。
     終盤は大演出「全崩壊エスケープ」。ランク4〜5。
     ■ 密度: 契約§4.7 の目安は 10→14回/100m だが、32〜44 m/s では
       「ウォール間隔 0.45秒」の下限から **理論上限が 2/(44×0.45)×100 ＝ 10.1回/100m**
       （全部レーン移動・両面同時要求）で、§4.3 の比率（ジャンプ 35%前後）と
       両立する実質上限は決定ログどおり **約10回/100m**。速度が S7 より上がるぶん
       さらに薄くなるので、ステージの目安は 8→9 に置く（既知の妥協点）。
     ■ 顔ぶれ: 1回の走行に入るチャンクは 7本前後しかない（速度で 130〜260実mに伸びる）。
       そのうち2本は合体区間（契約どおり必ず2回・exclusive ＋ forcePlan）に取られるので、
       残り4〜5本で12種を顔出しさせる必要がある。**1本で3〜4ギミックを持つ
       「網羅札」（cov_*）を4本で12種ちょうどを覆う**形にし、coverFlags の重みで
       互いを選び合わせる。 */
  S8: {
    id: 'S8', name: 'S8 コア', zone: 'core', lengthM: 1500,
    /* S8 の新チャンクはすべて rank5。minRank 4 にすると前半に S8 の札が
       1枚も候補に入らない（maxRankAt が前半で 4 に留まる）ので 5 で固定する。 */
    speedFrom: 32, speedTo: 44, minRank: 5, maxRank: 5, setpiece: 'collapseall',
    /* density ＝ **生成器の狙い**（継ぎ目をどこまで詰めるか）。§4.7 の下限まで
       詰めさせたいので高いまま置く。ただし S8 は契約が要求する構造そのもの
       （合体区間2回＝1体ぶんの要求しか置けない／12種のギミックのうち5種が
       ゲート・区間型で直後 1.0秒の猶予が要る）のせいで、この狙いには届かない。
       機械テストは実測できる帯 densityReal で判定する（**既知の妥協点**）。 */
    density: [8, 9],
    densityReal: [5, 5],
    reactBoth: CFG.FAIR.REACT_BOTH_LATE,
    ratioPull: 10,
    mix: { lane: 0.55, jump: 0.42, slide: 0.03 },
    tipBoost: true,
    tipMul: 9,
    tipOnce: { merge: 'mergerun' },
    /* 合体区間は「強制されたときだけ」候補に入る＝回数がぶれない（必ず2回） */
    exclusive: ['merge'],
    /* 走行の骨格（契約§4.4 S8）: **網羅札 → 合体 → 網羅札 → 合体 → 網羅札**。
       ・合体区間は必ず2回（契約§4.4）。
       ・ランダム区間に置ける札は 3〜4本しかないので、12種のギミックは
         4組の網羅札（fam_*）で覆い、**どの3組を出すかをシードで回す**
         （= どの組も 3/4 = 75% のシードで顔を出す）。
       ・at は「そこまで来たら次は必ずこの顔ぶれ」の敷居。前の札が終わった
         時点の cursor より小さく取ってあるので、順に消化されていく。 */
    forcePlan(rng) {
      /* 4組を**シードで混ぜて**先頭3組を使う。mulberry32 の**出だしは偏る**
         （seed 1〜50 の1発目を4分割すると 11/9/22/8）ので、4回空引きして暖める。 */
      const f = ['fam_net', 'fam_cur', 'fam_zero', 'fam_warp'];
      if (rng) { rng(); rng(); rng(); rng(); }
      for (let i = f.length - 1; i > 0; i--) {
        const j = Math.floor((rng ? rng() : 0) * (i + 1));
        const t = f[i]; f[i] = f[j]; f[j] = t;
      }
      return [{ at: 90, flag: f[0] }, { at: 150, flag: 'merge' },
              { at: 400, flag: f[1] }, { at: 500, flag: 'merge' },
              { at: 800, flag: f[2] }];
    },
    /* 「全部混在」（契約§4.4 S8）: まだ出していないギミックを持つ札を強く引く。
       網羅札（cov_*）は1本で3〜4種を持つので、この重みで4本が互いを選び合う。
       合体は forcePlan が受け持つのでここには入れない。 */
    coverFlags: ['bridge', 'pend', 'sync', 'warp', 'zero', 'net', 'mir', 'swap'],
    coverMul: 6,
    /* 顔ぶれ: S8 の新チャンク（網羅札＋短い工兵札）＋
       先行ステージの rank4〜5 のチャンク（ゾーン依存のスキンはコアの混在スキンが
       障害物ごとに寄り親を選ぶので、そのまま混ぜられる / 契約§5）。
       **長い先行チャンクは入れない**（1本で 250実m を超えると網羅の枠を潰す）。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.s8).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s8 && c.cover).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s8 && c.fill).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s8 && c.id.indexOf('s8_mix') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s8 && c.id.indexOf('s8_weave') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s8 && c.id.indexOf('s8_leap') === 0).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => !c.s8 && c.difficulty >= 4 && !c.fill && !c.dual && c.lengthM <= 58).map((c) => c.id))
  },
  endless: {
    id: 'endless', name: 'エンドレス', zone: 'neon', lengthM: Infinity,
    speedFrom: 16, speedTo: 44, maxRank: 2, setpiece: null, density: [3, 14],
    /* 最初から入っているのは S1 の顔ぶれ（基本セット）だけ。
       遺跡の新ギミックは S3 をクリアして初めて混ざる（ENDLESS_UNLOCK / 契約§4.4） */
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2 && !c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7 && !c.s8).map((c) => c.id)
  }
};

/* エンドレスは「クリア済みゾーンのチャンクを混ぜて無限生成」（契約§4.4）。
   ステージをクリアすると、そのステージが持ち込んだ顔ぶれがプールに加わる。 */
const ENDLESS_UNLOCK = {
  S1: [],                                      // S1 の顔ぶれ＝最初から入っている基本セット
  S2: CHUNK_DEFS.filter((c) => (c.moving || c.wallhole || c.dense) && !c.s3 && !c.s4 && !c.s5 && !c.s6 && !c.s7 && !c.s8).map((c) => c.id),
  S3: CHUNK_DEFS.filter((c) => c.s3).map((c) => c.id),       // 崩れる橋・振り子の刃
  S4: CHUNK_DEFS.filter((c) => c.s4).map((c) => c.id),       // 同時スイッチ（落ちる天井は失効）
  S5: CHUNK_DEFS.filter((c) => c.s5).map((c) => c.id),       // 深海の顔ぶれ（旧 海流・浮上足場・色の扉は失効）
  S6: CHUNK_DEFS.filter((c) => c.s6).map((c) => c.id),       // 重力反転・無重力・レーザーネット
  S7: CHUNK_DEFS.filter((c) => c.s7).map((c) => c.id),       // 鏡ゾーン・入れ替えワープ
  /* S8 の顔ぶれ（全部混在）。合体区間は S8 専用の演出なのでエンドレスには持ち込まない
     （区間の途中で 1000m ごとのゾーン切替に当たると「1体のまま景色が変わる」ため）。 */
  S8: CHUNK_DEFS.filter((c) => c.s8 && !c.merge).map((c) => c.id)
};
function endlessPool(cleared) {
  let pool = STAGE_DEFS.endless.chunkPool.slice();
  let rank = STAGE_DEFS.endless.maxRank;
  (cleared || []).forEach((id) => {
    const add = ENDLESS_UNLOCK[id];
    if (!add) return;
    pool = pool.concat(add);
    add.forEach((cid) => { if (CHUNK_BY_ID[cid]) rank = Math.max(rank, CHUNK_BY_ID[cid].difficulty); });
  });
  return { pool: pool, maxRank: rank };
}

function makeStage(id) {
  const d = STAGE_DEFS[id];
  if (!d) throw new Error('unknown stage: ' + id);
  const s = Object.assign({}, d);
  if (id === 'endless') {
    const e = endlessPool(U.lsGet('cleared', []) || []);
    s.chunkPool = e.pool;
    s.maxRank = e.maxRank;
  }
  s.endless = !isFinite(d.lengthM);
  /* エンドレスの加速（契約§4.4 2026-09-21 実機評「加速が弱い」で強化）:
     16 m/s から **200m ごとに +1**（上限44 ＝ 5600m で到達）。
     段差にすると 200m の切れ目で体感速度が跳ねるので、同じ勾配の連続な直線で表す
     （200m 進むごとにちょうど +1。旧「1000mごと+1」は失効）。 */
  s.speedAt = s.endless
    ? function (m) { return Math.min(CFG.SPEED_MAX, d.speedFrom + m / CFG.SPEED_STEP_M); }
    : function (m) { return U.lerp(d.speedFrom, d.speedTo, U.clamp(m / d.lengthM, 0, 1)); };
  /* チェックポイントは 1/3・2/3 地点（§4.4） */
  s.checkpoints = s.endless ? [] : [d.lengthM / 3, d.lengthM * 2 / 3];
  return s;
}

/* ============================================================================
   公平性の不変条件（§4.7）の検証
   ------------------------------------------------------------------------
   「ウォール」= ほぼ同時（speed*FAIR.SIMUL 以内）に到達する障害物のまとまり。
   ・連続するウォールの間隔          ≥ speed * FAIR.REACT
   ・両者同時要求ウォールの前後      ≥ speed * FAIR.REACT_BOTH
   ・同じキャラのジャンプ→ジャンプ   ≥ speed * FAIR.JUMP_CHAIN
   ・各ウォールで各キャラに生存レーンが1つ以上あり、前のウォールから到達できる
   ・視認距離は生成器側で担保（at - spawnDist ≥ speed * FAIR.SEE）。checkVisibility で検査。
   ============================================================================ */
const Fair = {
  SIDES: Obstacles.SIDES,

  /* 障害物の最大奥行き（通過に要する距離の見積りに使う） */
  _maxDepth: 0,
  maxDepth() {
    if (!Fair._maxDepth) {
      /* noPass（割れた鏡の床＝裂け目そのもの）は「通り抜けに時間が要る実体」ではないので
         外す。ここを伸ばすと **全ステージ**の到達可能性の見積りが縮むため（P5a）。 */
      Object.keys(OBS).forEach((k) => {
        if (OBS[k].noPass) return;
        Fair._maxDepth = Math.max(Fair._maxDepth, OBS[k].depth);
      });
    }
    return Fair._maxDepth;
  },

  /* ウォールに束ねる（**要求のないウォールも残した全部**）。
     「跳躍帯を塞ぐだけの帯」（レーザーネットの横ビームが中央に来た場合など）は
     demand が付かないので walls() から落ちる。それを検査するためにここを分けている。 */
  wallsAll(list, speedAt, opt) {
    /* **当たり判定を持たない実体（ghost）はウォールに数えない**。
       ワープのゲート・無重力の粒子・ネットの枠は
       通り抜けるだけなので、これが混ざるとウォールの位置（at / atEnd）が
       実際の危険より前後に広がり、ありもしない「間隔違反」を作ってしまう
       （2026-09-22 P4b: 無重力の粒子がウォールに吸い込まれていた）。 */
    const sorted = list.filter((o) => !OBS[o.type].ghost).sort((a, b) => a.at - b.at);
    const out = [];
    for (const o of sorted) {
      const sp = speedAt(o.at);
      const w = out[out.length - 1];
      if (w && (o.at - w.at) <= sp * CFG.FAIR.SIMUL) { w.items.push(o); w.atEnd = o.at; }
      else out.push({ at: o.at, atEnd: o.at, items: [o] });
    }
    /* 合体区間（契約§4.5 / S8）: 2体は1体になって **床だけ**を走る。
       天井側には誰も居ないので、その区間の天井の要求は最初から存在しない。
       ＝ 譜面・ボット・不変条件・動作比率がすべて同じ前提で会話する。 */
    const merges = (opt && opt.merges && opt.merges.length) ? opt.merges : null;
    out.forEach((w) => {
      const inMerge = merges ? Merge.activeAt(merges, w.at) : false;
      w.inMerge = inMerge;
      w.demand = {};
      Fair.SIDES.forEach((s) => {
        if (inMerge && s === 'ceil') { w.demand[s] = null; return; }
        /* 要求する動作は Obstacles.demand（＝到達時の占有 occ）から引く。
           点滅 OFF で通れる障害物はここで 'none' になり、要求に数えられない。 */
        const kinds = w.items.map((o) => Obstacles.demand(o, s)).filter((k) => k !== 'none');
        if (!kinds.length) { w.demand[s] = null; return; }
        let kind = 'lane';
        if (kinds.indexOf('jump') >= 0) kind = 'jump';
        else if (kinds.indexOf('slide') >= 0) kind = 'slide';
        w.demand[s] = kind;
      });
      w.both = !!(w.demand.floor && w.demand.ceil);
    });
    return out;
  },
  /* どちらの面にも何も要求しないウォール（点滅OFFで通れるレーザーだけ 等）は
     「壁」ではないので数えない＝反応窓や動作比率を汚さない */
  walls(list, speedAt, opt) {
    return Fair.wallsAll(list, speedAt, opt).filter((w) => w.demand.floor || w.demand.ceil);
  },

  /* そのウォール・その面で、各レーンに残る安全な動作（到達時の占有から） */
  laneActs(wall, side) {
    const res = {};
    for (const lane of CFG.LANES) {
      const acts = { run: true, jump: true, slide: true };
      for (const o of wall.items) {
        if (!Obstacles.affects(o, side)) continue;
        const a = Obstacles.laneActs(o, side, lane);
        if (!a.run) acts.run = false;
        if (!a.jump) acts.jump = false;
        if (!a.slide) acts.slide = false;
      }
      res[lane] = acts;
    }
    return res;
  },
  laneSurvivable(wall, side, lane) {
    const a = Fair.laneActs(wall, side)[lane];
    return a.run || a.jump || a.slide;
  },

  /* 本体。違反メッセージの配列を返す（空なら合格） */
  validate(list, speedAt, opt) {
    opt = opt || {};
    const errs = [];
    const all = Fair.wallsAll(list, speedAt, opt);
    const walls = all.filter((w) => w.demand.floor || w.demand.ceil);

    /* **跳躍帯を塞ぐだけの帯を作らない**（契約§4.5 レーザーネットの「中央」/ P4b）。
       何も要求しない（走れば通れる）のに、跳んだ体だけが当たる帯は
       「隣のウォールのために跳んだ人」を理不尽に殺す。
       走れて かつ 跳べるレーンが1つも無いウォールを違反とする。 */
    all.forEach((w) => {
      Fair.SIDES.forEach((side) => {
        if (w.inMerge && side === 'ceil') return;         // 合体区間の天井には誰も居ない
        if (w.demand[side]) return;                       // 何かを要求するウォールは対象外
        const acts = Fair.laneActs(w, side);
        if (!CFG.LANES.some((l) => acts[l].run)) return;   // 走れない＝別の違反で拾われる
        if (CFG.LANES.some((l) => acts[l].run && acts[l].jump)) return;
        errs.push('跳躍帯を塞ぐ(' + side + ') @' + w.at.toFixed(1) +
                  '（走れば通れるのに跳ぶと当たる帯は置けない）');
      });
    });

    for (let i = 1; i < walls.length; i++) {
      const a = walls[i - 1], b = walls[i];
      const sp = speedAt(b.at);
      const gap = b.at - a.atEnd;
      if (gap < sp * CFG.FAIR.REACT - 1e-6) {
        errs.push('反応窓: ウォール間 ' + gap.toFixed(2) + 'm < ' + (sp * CFG.FAIR.REACT).toFixed(2) + 'm @' + b.at.toFixed(1));
      }
      /* 両者同時要求の前後の余白。S1〜S2 は 0.6秒、S3 以降は 0.45秒（契約§4.7） */
      /* エンドレス（P6）はゾーンで値が変わるので、距離の関数も受け付ける */
      const rb = (opt.reactBoth === undefined) ? CFG.FAIR.REACT_BOTH
               : (typeof opt.reactBoth === 'function') ? opt.reactBoth(b.at) : opt.reactBoth;
      if ((a.both || b.both) && gap < sp * rb - 1e-6) {
        errs.push('同時要求の余白: ' + gap.toFixed(2) + 'm < ' + (sp * rb).toFixed(2) + 'm @' + b.at.toFixed(1));
      }
    }

    /* 同じキャラのジャンプ連続 ／ ジャンプ→レーン移動（空中で横に動けないぶんの猶予） */
    Fair.SIDES.forEach((side) => {
      let prev = null;
      walls.forEach((w) => {
        if (!w.demand[side]) return;
        if (prev && prev.demand[side] === 'jump') {
          const sp = speedAt(w.at);
          const gap = w.at - prev.atEnd;
          /* 無重力区間（契約§4.5 / S6）では滞空が伸びるぶん、下限も伸びる。
             倍率は Zero が唯一の出所（判定・ボットと同じ1か所）。
             区間の境目では **両端の大きいほう** を採る（踏切が区間の中なら滞空は伸びる）。 */
          const zk = opt.zeros
            ? Math.max(Zero.kAt(opt.zeros, prev.at), Zero.kAt(opt.zeros, w.at)) : 1;
          const chain = CFG.JUMP_T * zk + (CFG.FAIR.JUMP_CHAIN - CFG.JUMP_T);
          const toLane = CFG.JUMP_T * zk + (CFG.FAIR.JUMP_TO_LANE - CFG.JUMP_T);
          if (w.demand[side] === 'jump' && gap < sp * chain - 1e-6) {
            errs.push('ジャンプ連続(' + side + '): ' + gap.toFixed(2) + 'm < ' + (sp * chain).toFixed(2) + 'm @' + w.at.toFixed(1));
          }
          /* 着地してからでないとレーンを変えられない（契約§4.7 2026-09-21） */
          if (w.demand[side] !== 'jump' && gap < sp * toLane - 1e-6) {
            errs.push('ジャンプ→横移動(' + side + '): ' + gap.toFixed(2) + 'm < ' + (sp * toLane).toFixed(2) + 'm @' + w.at.toFixed(1));
          }
        }
        prev = w;
      });
    });

    /* 重力反転ワープ（契約§4.5 / S6）: **ゲートの直後 1.0秒は障害物を置かない**。
       面が入れ替わって相手のレーンから走り始めるので、立て直す時間が要る。 */
    if (opt.warps && opt.warps.length) {
      walls.forEach((w) => {
        const sp = speedAt(w.at);
        if (Warp.gateNear(opt.warps, w.at, sp * CFG.WARP.GRACE_T)) {
          errs.push('重力反転の直後にウォール @' + w.at.toFixed(1) +
                    '（' + CFG.WARP.GRACE_T + '秒の猶予が要る）');
        }
      });
    }

    /* 鏡ゾーン（契約§4.5 / S7）: **ゲートの直後 1.0秒は障害物を置かない**。
       左右が入れ替わった直後は、どちらへ動くかの判断がやり直しになるため。 */
    if (opt.mirrors && opt.mirrors.length) {
      Fair.SIDES.forEach((side) => {
        walls.forEach((w) => {
          if (!w.demand[side]) return;
          const sp = speedAt(w.at);
          if (Mirror.gateNear(opt.mirrors, w.at, sp * CFG.MIRRORZ.GRACE_T, side)) {
            errs.push('鏡ゲートの直後にウォール(' + side + ') @' + w.at.toFixed(1) +
                      '（' + CFG.MIRRORZ.GRACE_T + '秒の猶予が要る）');
          }
        });
      });
    }
    /* 入れ替えワープ（契約§4.5 / S7）: 担当そのものが入れ替わるので **両面**に効く */
    if (opt.swaps && opt.swaps.length) {
      walls.forEach((w) => {
        const sp = speedAt(w.at);
        if (Swap.gateNear(opt.swaps, w.at, sp * CFG.HANDSWAP.GRACE_T)) {
          errs.push('入れ替えの直後にウォール @' + w.at.toFixed(1) +
                    '（' + CFG.HANDSWAP.GRACE_T + '秒の猶予が要る）');
        }
      });
    }

    /* 合体区間（契約§4.5 / S8）: **入口・出口のゲートの直後 1.0秒は障害物を置かない**。
       1体になる／2体に戻る瞬間は、手の割当ごと切り替わるので立て直す時間が要る。
       入れ替えワープと同じく **両面**に効く。 */
    if (opt.merges && opt.merges.length) {
      walls.forEach((w) => {
        const sp = speedAt(w.at);
        if (Merge.gateNear(opt.merges, w.at, sp * CFG.MERGE.GRACE_T)) {
          errs.push('合体ゲートの直後にウォール @' + w.at.toFixed(1) +
                    '（' + CFG.MERGE.GRACE_T + '秒の猶予が要る）');
        }
      });
    }

    /* 生存経路（各ウォールで生存レーンが1つ以上＋前ウォールから到達可能） */
    Fair.SIDES.forEach((side) => {
      let reach = opt.startLanes === 'any' ? CFG.LANES.slice() : (opt.startLanes || [0]).slice();
      let prevAt = opt.startAt !== undefined ? opt.startAt : (walls.length ? walls[0].at - 100 : 0);
      walls.forEach((w) => {
        if (!w.demand[side]) return;
        const sp = speedAt(w.at);
        /* 重力反転ワープ（§4.5 / S6）: 面が入れ替わると、その面を走る体が
           **相手のレーン**から始まる。どこから来るか分からないので到達可能性を
           リセットする（直後 1.0秒は障害物なしなので、どのレーンへも動ける）。 */
        if (opt.warps && Warp.crossed(opt.warps, prevAt, w.at)) reach = CFG.LANES.slice();
        /* 鏡ゾーン・入れ替えワープ（§4.5 / S7）でも同じ（直後 1.0秒は障害物なしなので
           どのレーンへも動ける）。判断がやり直しになる区切りで到達可能性を戻す。 */
        if (opt.mirrors && Mirror.crossed(opt.mirrors, prevAt, w.at, side)) reach = CFG.LANES.slice();
        if (opt.swaps && Swap.crossed(opt.swaps, prevAt, w.at)) reach = CFG.LANES.slice();
        /* 合体／分離でも同じ（直後 1.0秒は障害物なしなのでどのレーンへも動ける） */
        if (opt.merges && Merge.crossed(opt.merges, prevAt, w.at)) reach = CFG.LANES.slice();
        /* 前のウォールを「通り抜けきる」までは横に動けない（動くと真横の障害物に刺さる）。
           その通過距離を引いた残りで何レーンぶん動けるかを数える。 */
        const passM = Fair.maxDepth() + Math.max(CFG.BODY_D, CFG.SLIDE_D);
        const usable = Math.max(0, (w.at - prevAt) - passM);
        const steps = Math.floor(usable / (sp * CFG.LANE_T));
        const cand = CFG.LANES.filter((l) => reach.some((r) => Math.abs(l - r) <= steps));
        const ok = cand.filter((l) => Fair.laneSurvivable(w, side, l));
        const anySafe = CFG.LANES.filter((l) => Fair.laneSurvivable(w, side, l));
        if (!anySafe.length) errs.push('生存経路なし(' + side + ') @' + w.at.toFixed(1));
        else if (!ok.length) errs.push('生存レーンに到達不能(' + side + ') @' + w.at.toFixed(1));
        reach = ok.length ? ok : anySafe;
        prevAt = w.atEnd;
      });
    });

    return errs;
  },

  /* tip の猶予規則（契約§4.8 2026-09-23）の検査。違反メッセージの配列を返す。
     ・tip は対象の speed × LEAD_T 秒以上手前に出る
     ・表示開始〜対象の通過後 speed × AFTER_T 秒の窓の中の必須動作は **対象のものだけ**
     stats を渡すと、窓の中の「対象の必須動作（ウォール数）」を stats.nTarget に積む。 */
  tipCheck(list, events, speedAt, opt, stats) {
    const errs = [];
    const walls = Fair.walls(list, speedAt, opt);
    (events || []).filter((e) => e.type === 'tip').forEach((ev) => {
      const p = ev.params || {};
      if (p.targetAt === undefined || !p.target) { errs.push('tip ' + p.id + ' に対象の記録がない'); return; }
      const want = speedAt(p.targetAt) * CFG.TIP.LEAD_T;
      if (p.targetAt - ev.at < want - 0.01) {
        errs.push('tip ' + p.id + ' の先行 ' + (p.targetAt - ev.at).toFixed(1) + 'm < ' + want.toFixed(1) + 'm');
      }
      const endWant = p.untilM + speedAt(p.untilM) * CFG.TIP.AFTER_T;
      if (p.winEnd < endWant - 0.01) errs.push('tip ' + p.id + ' の窓が短い');
      const tset = {};
      p.target.forEach((u) => { tset[u] = true; });
      let nT = 0;
      walls.forEach((w) => {
        if (w.atEnd < ev.at - 1e-6 || w.at > p.winEnd + 1e-6) return;
        const other = w.items.filter((o) => !tset[o.uid] &&
          (Obstacles.demand(o, 'floor') !== 'none' || Obstacles.demand(o, 'ceil') !== 'none'));
        if (other.length) {
          errs.push('tip ' + p.id + ' の窓に対象以外の必須動作 @' + w.at.toFixed(1) + '（' +
                    other.map((o) => o.type).join(',') + '・窓 ' + ev.at.toFixed(1) + '〜' + p.winEnd.toFixed(1) + '）');
        } else nT++;
      });
      if (stats) { stats.nTarget = stats.nTarget || []; stats.nTarget.push(nT); }
    });
    return errs;
  },

  /* tip の窓（契約§4.8）: [表示開始, 対象通過後 speed×1.0秒]。密度の検査はこの窓を除いて測る */
  tipWindows(events) {
    return (events || []).filter((e) => e.type === 'tip' && e.params && e.params.winEnd !== undefined)
      .map((e) => [e.at, e.params.winEnd]);
  },
  inTipWindow(wins, at) { return wins.some((w) => at >= w[0] && at <= w[1]); },
  tipOverlap(wins, a, b) {
    /* 窓どうしが重なる（導入区間は前の窓の終わりと次の tip が重なる）ので、併合してから測る */
    const ws = wins.map((w) => [Math.max(a, w[0]), Math.min(b, w[1])]).filter((w) => w[1] > w[0])
      .sort((x, y) => x[0] - y[0]);
    let s = 0, cur = null;
    ws.forEach((w) => {
      if (cur && w[0] <= cur[1]) cur[1] = Math.max(cur[1], w[1]);
      else { if (cur) s += cur[1] - cur[0]; cur = [w[0], w[1]]; }
    });
    if (cur) s += cur[1] - cur[0];
    return s;
  },

  /* 必須動作の集計（契約§4.3 の動作比率。ウォール×面ごとに1動作と数える） */
  countDemands(list, speedAt, opt) {
    const res = { lane: 0, jump: 0, slide: 0, total: 0 };
    Fair.walls(list, speedAt, opt).forEach((w) => {
      Fair.SIDES.forEach((s) => {
        const k = w.demand[s];
        if (!k) return;
        res[k]++; res.total++;
      });
    });
    res.pct = {
      lane: res.total ? res.lane / res.total * 100 : 0,
      jump: res.total ? res.jump / res.total * 100 : 0,
      slide: res.total ? res.slide / res.total * 100 : 0
    };
    return res;
  },

  /* ==========================================================================
     自由飛行（大ジャンプ）の不変条件 — 契約§4.5 を**断面2D**で適用（P2c）
     ・常に DUO体（半径 FF.R）が通れる隙間が1つある
     ・隙間の中心までの距離 ≤ FF.V × 到達までの秒数
       （開いている軸＝その軸には動かなくてよいので数えない）
     ・生成器はさらに FF.REACT 秒の余裕を見る（0.25秒遅れのボットでも間に合う）
     ========================================================================== */
  validateAir(course, speedAt, opt) {
    const errs = [];
    if (!course || !course.items) return ['空中の譜面がない'];
    opt = opt || {};
    const margin = opt.margin ? FF.REACT : 0;      // 余裕まで見るか（生成器の自己検査）
    let prev = { x: course.entry.x, y: course.entry.y };
    let prevAt = course.launchM;
    course.items.forEach((it) => {
      const g = it.gap;
      const sp = speedAt(it.at);
      const dt = (it.at - prevAt) / sp;
      const dx = g.openX ? 0 : Math.abs(g.x - prev.x);
      const dy = g.openY ? 0 : Math.abs(g.y - prev.y);
      const need = Math.max(dx, dy) / FF.V;        // 各軸 FF.V m/s（同時に動ける）
      if (need > dt - margin + 1e-9) {
        errs.push('空中の隙間へ到達不能: ' + need.toFixed(2) + '秒 > ' + (dt - margin).toFixed(2) +
                  '秒 @' + it.at.toFixed(1));
      }
      /* 隙間の寸法（DUO体が通れるか）と、中心が断面の中にあるか */
      const half = Math.min(g.openX ? 99 : g.hw, g.openY ? 99 : g.hh);
      if (half < FF.R + 0.05) errs.push('隙間が狭い: 半径 ' + half.toFixed(2) + ' @' + it.at.toFixed(1));
      if (g.x < FF.X0 - 1e-9 || g.x > FF.X1 + 1e-9 || g.y < FF.Y0 - 1e-9 || g.y > FF.Y1 + 1e-9) {
        errs.push('隙間の中心が断面の外 @' + it.at.toFixed(1));
      }
      /* 実際に円 vs 矩形で通れることを確かめる（判定と同じ関数で） */
      if (!FF.passable(g.x, g.y, it)) errs.push('隙間の中心が塞がれている @' + it.at.toFixed(1));
      prev = { x: g.openX ? prev.x : g.x, y: g.openY ? prev.y : g.y };
      prevAt = it.at;
    });
    /* 着地までの猶予（最後の壁を抜けてから着地するまで） */
    if (course.items.length) {
      const lastIt = course.items[course.items.length - 1];
      const sp = speedAt(course.landM);
      if ((course.landM - lastIt.at) / sp < 0.3) errs.push('最後の壁と着地が近すぎる');
    }
    return errs;
  },

  /* 着地後 FF.GRACE_T 秒（= speed × 2.0 m）は障害物なし（契約§4.5） */
  landingGrace(list, landM, speedAt) {
    const errs = [];
    const until = landM + speedAt(landM) * FF.GRACE_T;
    list.forEach((o) => {
      /* **当たり判定を持たない実体（ghost）は障害物ではない**（ゲート・帯・粒子）。
         wallsAll がウォールに数えないのと同じ扱い（2026-09-22 P4b の決定）。 */
      if (OBS[o.type].ghost) return;
      if (o.at >= landM && o.at < until - 1e-6) {
        errs.push('着地猶予の中に障害物: ' + o.type + ' @' + o.at.toFixed(1) +
                  '（' + landM.toFixed(1) + '〜' + until.toFixed(1) + 'm は空ける）');
      }
    });
    return errs;
  },

  /* 視認距離（生成された瞬間の距離との差） */
  checkVisibility(list, speedAt) {
    const errs = [];
    list.forEach((o) => {
      const sp = speedAt(Math.max(0, o.spawnDist));
      const margin = o.at - o.spawnDist;
      if (margin < sp * CFG.FAIR.SEE - 1e-6) {
        errs.push('視認距離: ' + margin.toFixed(2) + 'm < ' + (sp * CFG.FAIR.SEE).toFixed(2) + 'm (at=' + o.at.toFixed(1) + ')');
      }
    });
    return errs;
  }
};

/* ============================================================================
   生成器
   ============================================================================ */
/* 動くレーザーの周期は「基準速度 REF_SPEED での距離」で書く。チャンクを速度で
   伸縮するのと同じ倍率をかけて、**1往復にかかる秒数を速度によらず一定**にする
   （§4.7 の不変条件が時間基準なのと同じ考え方）。 */
/* 速度で伸縮するパラメータ（キー → その中で伸縮する項目と既定値）。
   崩れる橋の leadM（踏んでから落ちるまでの距離）も同じ仕組みに乗せる＝
   「0.4秒後に落ちる」が速度によらず一定になる（§4.4 S3 / §4.7）。 */
const MOTION_SCALE = {
  scan:   { key: 'periodM', def() { return CFG.LASER.SCAN_PERIOD; } },
  rot:    { key: 'periodM', def() { return CFG.LASER.ROT_PERIOD; } },
  blink:  { key: 'periodM', def() { return CFG.LASER.BLINK_PERIOD; } },
  bridge: { key: 'leadM',   def() { return CFG.REF_SPEED * CFG.BRIDGE.LEAD_T; } },
  /* レーザーネット（S6）の横ビーム・斜めビームも同じ（1往復の秒数が一定） */
  hbeam:  { key: 'periodM', def() { return CFG.NET.PERIOD; } },
  diag:   { key: 'periodM', def() { return CFG.NET.PERIOD; } },
  /* 割れた鏡の床（S7）の足場の揺れも同じ（1往復の秒数が速度によらず一定） */
  shard:  { key: 'periodM', def() { return CFG.SHARD.PERIOD; } }
};
/* 崩れる橋は必ず bridge パラメータを持つ。
   書き忘れても生成時に既定値が入るようにしておく（＝位相の規則が常に効く）。 */
function normParams(type, p) {
  if (type === 'BRIDGE') return (p && p.bridge) ? p : Object.assign({}, p || {}, { bridge: {} });
  return p;
}
function scaleParams(p, scale) {
  if (!p) return null;
  const out = {};
  Object.keys(p).forEach((k) => {
    const v = p[k];
    const sc = MOTION_SCALE[k];
    if (v && typeof v === 'object' && sc) {
      const c = {};
      Object.keys(v).forEach((k2) => { c[k2] = v[k2]; });
      c[sc.key] = +(((v[sc.key] || sc.def()) * scale).toFixed(3));
      out[k] = c;
    } else out[k] = v;
  });
  return out;
}

/* チャンク定義の素性（必須動作の回数と、最初〜最後の障害物の広がり）。
   密度（契約§4.7）を見ながらチャンクを選ぶために使う。1定義につき1回だけ測る。 */
/* 譜面の1エントリ → 実体。**展開の規則はここだけ**（生成器・素性の計測・大演出が共用する）。
     WALLHOLE … 穴のレーン + 残り2レーンの壁（＝全幅の壁に穴が1つ）
     SYNCSW   … 床と天井の対のパッド + その先の橋（失敗なら谷になる2レーン） / 契約§4.5
   syncs に展開したグループを積む（Sync がそこを見て 0.3秒窓を判定する）。 */
function expandEntry(items, e, surface, at, nowDist, scale, sink) {
  const params = scaleParams(normParams(e.type, e.params), scale === undefined ? 1 : scale);
  if (e.type === 'WALLHOLE') {
    CFG.LANES.forEach((l) => {
      items.push(Obstacles.make(l === e.lane ? 'WALLHOLE' : 'WALLSOLID', surface, l, at, nowDist, params));
    });
    return;
  }
  if (e.type === 'SYNCSW') { Sync.expand(items, e, surface, at, nowDist, scale, sink && sink.syncs); return; }
  /* 無重力区間（契約§4.5 / S6）: 区間の中で踏み切ったジャンプの滞空が 1.5倍になる */
  if (e.type === 'ZEROG') { Zero.expand(items, e, surface, at, nowDist, scale, sink && sink.zeros); return; }
  /* 重力反転ワープ（契約§4.5 / S6）: 入口と戻りの2枚のゲート。通るたびに面が入れ替わる */
  if (e.type === 'GRAVWARP') { Warp.expand(items, e, surface, at, nowDist, scale, sink && sink.warps); return; }
  /* 鏡ゾーン（契約§4.5 / S7）: 銀の枠2枚。通った面のキャラの左右が反転する */
  if (e.type === 'MIRRORZ') { Mirror.expand(items, e, surface, at, nowDist, scale, sink && sink.mirrors); return; }
  /* 入れ替えワープ（契約§4.5 / S7）: 紫の枠2枚。上下の担当が入れ替わる */
  if (e.type === 'HANDSWAP') { Swap.expand(items, e, surface, at, nowDist, scale, sink && sink.swaps); return; }
  /* 合体区間（契約§4.5 / S8）: 専用ゲート2枚。区間の中は2体が1体になって床を走る */
  if (e.type === 'MERGE') { Merge.expand(items, e, surface, at, nowDist, scale, sink && sink.merges); return; }
  items.push(Obstacles.make(e.type, surface, e.lane, at, nowDist, params));
}

function chunkStats(def) {
  if (def._stats) return def._stats;
  const items = [];
  const push = (e, surface) => expandEntry(items, e, surface, e.at, 0, 1, null);
  (def.floor || []).forEach((e) => push(e, 'floor'));
  (def.ceil || []).forEach((e) => push(e, 'ceil'));
  items.sort((a, b) => a.at - b.at);
  const c = Fair.countDemands(items, () => CFG.REF_SPEED);
  const first = items.length ? items[0].at : 0;
  const last = items.length ? items[items.length - 1].at : 0;
  def._stats = { demands: c.total, lane: c.lane, jump: c.jump, slide: c.slide,
                 firstAt: first, lastAt: last, span: last - first, tail: def.lengthM - last };
  return def._stats;
}

function createGenerator(stage, seed) {
  const rng = U.mulberry32((seed >>> 0) || 1);
  let cursor = CFG.LEAD_IN;     // 次のチャンクを置く距離
  let lastWallhole = false;     // 直前のチャンクが「壁の穴」を含んでいたか（連続禁止）
  let introPtr = 0;             // 導入区間の何番目まで置いたか
  const tipDone = {};           // 新ギミックの初出 tip を出したか（契約§4.8）
  /* tip の窓の終わり（契約§4.8）。ここまでは対象以外の障害物を置かない */
  let noDemandUntil = -1e9;
  /* tip の窓の合計の長さ（重なりは併合）。密度の制御は窓を除いた距離で測る
     （窓は規則で空けている区間なので、そこを「薄い」と数えて後ろを詰め込まない） */
  let tipSpan = 0, tipSpanEnd = -1e9;
  function noteTipWindow(a, b) {
    const a2 = Math.max(a, tipSpanEnd);
    if (b > a2) tipSpan += b - a2;
    tipSpanEnd = Math.max(tipSpanEnd, b);
  }
  /* 「この走行でまだ出していないギミック」を覚えておく（契約§4.4 S8「全部混在」）。
     1回の走行に入るチャンクは 7本前後しかないので、重みで貪欲に網羅させないと
     顔ぶれが偏る。tipBoost と同じ仕組みで、こちらは**毎回**効く。 */
  const covered = {};
  let setpieceDone = false;     // 終盤の大演出を置いたか
  /* 「決まった回数・決まった場所に必ず出す」顔ぶれ（契約§4.4 S8「合体区間は2回」）。
     stage.forceAt = [{at, flag}] の順に、cursor がその距離を越えたら
     そのフラグを持つチャンクだけを候補にする。置けたら次へ進む。
     stage.exclusive に挙げたフラグは、**強制されたときしか**候補に入らない
     ＝ 回数がぶれない（何度も出たり一度も出なかったりしない）。 */
  let forcePtr = 0;
  const forcePlan = (typeof stage.forcePlan === 'function') ? stage.forcePlan(rng) : (stage.forceAt || null);
  /* 大演出の始まり。エンドレス（P6）では「次の区切り」（ゾーン切替の通路の手前／ミニ大演出）が
     ここに入り、置くたびに先へ進む（＝有限ステージの大演出と同じ仕組みで手前を詰める）。 */
  let spStart = (stage.setpiece && Setpieces.DEFS[stage.setpiece])
    ? stage.lengthM - Setpieces.DEFS[stage.setpiece].lengthM : Infinity;
  /* ---- エンドレス（契約§4.4 / P6）: 1000m ごとのゾーン切替・1500m ごとのミニ大演出 ----
     EP = { zones:[順], pools:{zone:{pool,minRank,maxRank,reactBoth}} }（Endless.plan）。
     どのゾーンのチャンクを置くかは「いま生成しているゾーン」（zi）で決まる。 */
  const EP = stage.endless ? (stage.endlessPlan || Endless.plan(Endless.clearedList())) : null;
  const switches = [];          // {t0（通路の入口）, at（光のゲート）, swapAt, from, to, idx, delay}
  const minis = [];             // {id, startM, endM, k}
  let zi = 0;                   // EP.zones の何番目を生成中か（ループで増え続ける）
  let zoneStart = 0;            // 生成中のゾーンが始まった距離
  let nextSwitch = (EP && EP.zones.length > 1) ? Endless.SWITCH_M : Infinity;
  let nextMini = EP ? Endless.MINI_M : Infinity;
  let barrier = null;           // 'switch' | 'mini'
  function zoneNow() { return EP ? EP.zones[zi % EP.zones.length] : stage.zone; }
  function endlessLoop() { return EP ? Math.floor(zi / EP.zones.length) : 0; }
  /* 2周目以降（速度はほぼ上限）は、序盤ゾーンの素朴な札だけでは密度（§4.7 エンドレス 1000mごと+1）に
     届かない（44 m/s では同じ譜面が 4.4倍に伸びる）。いちばん奥のゾーン（全クリアならコア＝全部混在）の
     顔ぶれを混ぜて、後半の密度を保つ。 */
  function endlessPoolNow() {
    const zp = EP.pools[zoneNow()];
    if (endlessLoop() < 1 || EP.zones.length < 2) return zp.pool;
    /* 2周目以降は、そのゾーンの素朴な札（ランク上限−1 より下）を外す */
    const lo = Math.max(1, zp.maxRank - 1);
    const own = zp.pool.filter((id) => CHUNK_BY_ID[id] && CHUNK_BY_ID[id].difficulty >= lo);
    return (own.length ? own : zp.pool).concat(EP.pools[EP.zones[EP.zones.length - 1]].pool);
  }
  function zoneAt(m) {
    if (!EP) return stage.zone;
    let z = EP.zones[0];
    for (let i = 0; i < switches.length; i++) if (switches[i].swapAt <= m) z = switches[i].to;
    return z;
  }
  /* 両者同時要求の余白（§4.7）はゾーンで変わる（ネオン 0.6秒／遺跡以降 0.45秒）。
     2周目以降はどのゾーンも S3 以降の値（速度はほぼ上限＝後半の難しさ）。 */
  const RB = EP ? function (m) {
    let rb = EP.pools[EP.zones[0]].reactBoth;
    for (let i = 0; i < switches.length; i++) if (switches[i].swapAt <= m) rb = switches[i].rb;
    return rb;
  } : stage.reactBoth;
  const out = [];               // 生成済み障害物（at 昇順）
  const syncs = [];             // 同時スイッチのグループ（Sync が 0.3秒窓を判定する / P3b）
  const zeros = [];             // 無重力の区間（Zero が滞空倍率を出す / P4b）
  const warps = [];             // 重力反転ワープの組（Warp が面の入れ替えを判定する / P4b）
  const mirrors = [];           // 鏡ゾーンの組（Mirror が左右反転を判定する / P5a）
  const swaps = [];             // 入れ替えワープの組（Swap が担当の入れ替えを判定する / P5a）
  const merges = [];            // 合体区間（Merge が合体／分離を判定する / P5b）
  const sink = { syncs: syncs, zeros: zeros, warps: warps,
                 mirrors: mirrors, swaps: swaps, merges: merges };
  const events = [];            // チャンクの events（P2以降のフック）
  const log = [];               // {id, startM, lengthM}
  let seedMix = null;           // 大演出が持ち込む必須動作の内訳（比率の是正に使う）

  function progress(m) {
    return stage.endless ? U.clamp((m % 1500) / 1500, 0, 1) : U.clamp(m / stage.lengthM, 0, 1);
  }
  /* 密度の目安（契約§4.7）: 100m あたりの必須動作回数。進行率に比例して上げる。
     エンドレスは 1000m ごとに +1（上限 14）。 */
  function wantDensity(m) {
    const d = stage.density || [3, 5];
    if (stage.endless) return Math.min(CFG.DENSITY.ENDLESS_MAX, d[0] + Math.floor(m / 1000) * CFG.DENSITY.ENDLESS_STEP);
    return U.lerp(d[0], d[1], U.clamp(m / stage.lengthM, 0, 1));
  }
  /* チャンクの継ぎ目に空けてよい空白（契約§4.7「≤ speed × 0.6秒」） */
  function seamFor(m) { return stage.speedAt(m) * CFG.DENSITY.SEAM; }
  /* 難易度の上げ方: 進行率で minRank → maxRank まで上げる
     （チャンクは速度でおよそ2倍に伸びるので、1本のステージに入るチャンクは10本前後。
       S2 のように「最初から rank2」のステージは minRank を指定する） */
  function maxRankAt(m) {
    if (EP) {
      /* エンドレス: ゾーンごとの顔ぶれの範囲で、そのゾーンに入ってからの距離で上げる。
         2周目以降は最初から上限（速度も上限近い） */
      const zp = EP.pools[zoneNow()];
      if (endlessLoop() >= 1) return Math.max(zp.maxRank, EP.pools[EP.zones[EP.zones.length - 1]].maxRank);
      const pz = U.clamp((m - zoneStart) / Endless.SWITCH_M, 0, 1);
      return U.clamp(zp.minRank + Math.floor(pz * (zp.maxRank - zp.minRank + 1)), zp.minRank, zp.maxRank);
    }
    const p = progress(m);
    const lo = stage.minRank || 1;
    return U.clamp(lo + Math.floor(p * (stage.maxRank - lo + 1)), lo, stage.maxRank);
  }
  function candidates(m) {
    const rank = maxRankAt(m);
    const sp = stage.speedAt(m);
    const pool = (EP ? endlessPoolNow() : stage.chunkPool).map((id) => CHUNK_BY_ID[id]).filter(Boolean);
    let c = pool.filter((d) => d.difficulty <= rank && sp >= (d.minSpeed || 0));
    /* 回数を決めてある顔ぶれ（合体区間）は、強制のときしか出さない */
    if (stage.exclusive && stage.exclusive.length) {
      c = c.filter((d) => !stage.exclusive.some((f) => d[f]));
    }
    /* 壁の穴（唯一のスライディング要素）は連続させない（契約§4.3） */
    if (lastWallhole) {
      const c2 = c.filter((d) => !d.wallhole);
      if (c2.length) c = c2;
    }
    if (!c.length) c = pool.filter((d) => d.difficulty === 1);
    /* エンドレスのゾーンの顔ぶれが速度・ランクで尽きたら、速度の条件を満たす札 → 基本セットの順で埋める */
    if (!c.length && EP) {
      c = pool.filter((d) => sp >= (d.minSpeed || 0) && !d.wallhole);
      if (!c.length) c = STAGE_DEFS.endless.chunkPool.map((id) => CHUNK_BY_ID[id]).filter(Boolean);
    }
    return c;
  }

  /* これまでに置いた必須動作の内訳（比率の是正に使う）。
     終盤の大演出ぶんは最初から数に入れておく＝ランダム区間がその偏りを打ち消す。 */
  const got = { lane: 0, jump: 0, slide: 0, total: 0 };
  /* 大演出の頭の障害物（大演出の手前に置くチャンクとの間隔を §4.7 で検査するのに使う / P5c） */
  let spHead = [];
  let spPillars = 0, spWides = 0;
  const placed = { total: 0 };          // ランダム区間だけの実測（密度の制御に使う）
  if (stage.setpiece && Setpieces.DEFS[stage.setpiece]) {
    const sp0 = Setpieces.build(stage.setpiece, spStart, 0, stage.speedAt(spStart) / CFG.REF_SPEED, null);
    if (sp0) spHead = sp0.items.filter((o) => o.at < spStart + 80);
    /* ワイド梁の比（§4.3 v2）: 大演出の柱は置き換えないので、最初から数に入れておく
       （gates は下で宣言＝ここでは数だけ控えて、宣言のあとで足す） */
    if (sp0) {
      spPillars = sp0.items.filter((o) => o.type === 'PILLAR').length;
      const ws = {};
      sp0.items.forEach((o) => { if (o.type === 'WIDEBAR') ws[o.at.toFixed(2) + '|' + o.lane] = 1; });
      spWides = Object.keys(ws).length;
    }
    if (sp0) { seedMix = Fair.countDemands(sp0.items, stage.speedAt);
               got.lane += seedMix.lane; got.jump += seedMix.jump; got.slide += seedMix.slide; got.total += seedMix.total; }
  }
  function noteDemands(items, local) {
    const c = Fair.countDemands(items, stage.speedAt,
                                { merges: merges.concat((local && local.merges) || []) });
    got.lane += c.lane; got.jump += c.jump; got.slide += c.slide; got.total += c.total;
    placed.total += c.total;
  }
  /* 契約§4.3 の比率。スライドは「壁の穴」だけ＝1チャンクに最大1・連続禁止（§4.3）なので、
     実際には 2〜3% までしか出せない。その余りは放っておくと**全部レーン移動に流れ込む**
     （レーンは 0.45秒間隔で詰められるぶん密度の重みでも有利）。
     そこで速いステージでは stage.mix でジャンプ側へ振り直す。 */
  const MIX = stage.mix || { lane: 0.52, jump: 0.40, slide: 0.08 };
  /* 比率の引き（§4.3）と密度の引き（§4.7）は取り合いになる。既定（3.2）は密度が優位。
     **速いステージほど跳びの譜面が薄くなる**（ジャンプ連続は 0.70秒より詰められないので、
     跳びだけでは 9回/100m が上限＝密度の重みに勝てない）ので、そこでは比率の引きを強める。
     stage.ratioPull で上書きする（S6 = 9）。 */
  const PULL = stage.ratioPull || 3.2;

  /* チャンクを選ぶ: **密度の目安（§4.7）**と**動作比率（§4.3）**の両方を見て重みを付け、
     シード固定の乱数で引く。どちらも「近いものを重くする」だけなので、顔ぶれは偏らない。 */
  function pick(cands, m) {
    /* 実測が目安に届いていなければ、その差ぶんだけ目安を上げて選ぶ（簡単な制御）。
       チャンクは速度で伸びるので、同じ顔ぶれでも後半ほど薄くなる。それを押し返す。 */
    /* ※ この局所変数は「これまでに走った距離」。**外側の covered（顔ぶれの既出表）を
       隠さない名前にする**（P5b: 隠していたため coverFlags が一度も既出にならず、
       同じ網羅札ばかり引かれていた）。 */
    const spanSoFar = Math.max(lastItemAt - CFG.LEAD_IN - tipSpan, 60);
    /* 走った距離（tip の窓を除く）が短いうちは実測が当てにならない（0件/60m で「薄い」と
       判定して詰め込む）ので、目安どおりとみなす（P5c: 導入区間の窓を除くようにしたため） */
    const real = (spanSoFar >= 120) ? placed.total / spanSoFar * 100 : wantDensity(m);
    const want = wantDensity(m) + U.clamp(wantDensity(m) - real, -2, 4);
    const scale = stage.speedAt(m) / CFG.REF_SPEED;
    const seam = seamFor(m);
    const w = [];
    let sum = 0;
    for (let i = 0; i < cands.length; i++) {
      const st = chunkStats(cands[i]);
      const dens = st.demands / Math.max(st.span * scale + seam, 1) * 100;
      /* 目安より**薄い**ほうを強く嫌う（濃いぶんは継ぎ目で調整できる） */
      const err = dens - want;
      let wt = (err >= 0) ? 1 / (1 + 0.32 * err) : 1 / (1 + 2.4 * (-err));
      let r = 1;
      ['lane', 'jump', 'slide'].forEach((k) => {
        const share = got.total ? got[k] / got.total : MIX[k];
        const mine = st.demands ? st[k] / st.demands : 0;
        r += (MIX[k] - share) * mine * PULL;
      });
      wt *= Math.max(0.12, r);
      /* **新ギミックは1回の走行で必ず顔を出す**（契約§4.8 の初出チュートリアル）。
         1500m に入るチャンクは10本前後しかないので、まだ出していないギミックを
         持つチャンクを重くしないと「一度も見ないままゴール」が起きる。
         既に封緘したステージの譜面を動かさないよう、stage.tipBoost を立てた
         ステージだけに効かせる（S6 から）。 */
      /* まだ出していないギミックを持つ札を重くする（S8 の「全部混在」） */
      if (stage.coverFlags) {
        let nNew = 0;
        for (let k = 0; k < stage.coverFlags.length; k++) {
          const f = stage.coverFlags[k];
          if (cands[i][f] && !covered[f]) nNew++;
        }
        if (nNew) {
          /* ゲートを持つ札（鏡・入れ替え・重力反転・海流）は猶予のぶん密度が低く、
             密度の重みでは必ず負ける。**密度の重みごと上書き**したうえで、
             まだ出していないギミックを**多く抱える札ほど強く**引く。 */
          wt = Math.max(wt, 0.9) * Math.pow(stage.coverMul || 6, Math.min(nNew, 3));
        }
      }
      /* 未出のギミックを2つ以上抱える札は tip の窓が重なって置けない（契約§4.8）ので引かない */
      if (stage.tipOnce) {
        let np = 0;
        const ks0 = Object.keys(stage.tipOnce);
        for (let k = 0; k < ks0.length; k++) if (cands[i][ks0[k]] && !tipDone[ks0[k]]) np++;
        if (np >= 2) wt *= 0.02;
      }
      if (stage.tipOnce && stage.tipBoost) {
        const ks = Object.keys(stage.tipOnce);
        for (let k = 0; k < ks.length; k++) {
          if (cands[i][ks[k]] && !tipDone[ks[k]]) { wt *= (stage.tipMul || 3); break; }
        }
      }
      w.push(wt); sum += wt;
    }
    let x = rng() * sum;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }
  /* 定義 → 実体（基準速度からの伸縮つき）
     WALLHOLE は「穴のレーン + 残り2レーンの壁」へ展開する（＝全幅の壁に穴が1つ）。 */
  function put(items, e, surface, at, nowDist, scale, dst) {
    expandEntry(items, e, surface, at, nowDist, scale, dst || sink);
  }
  /* 置けるかどうか分からないうちは、同時スイッチ・ゲート型ギミックの「区間」を
     本物の入れ物へ入れない（試し置きの残骸が走行中に効いてしまう）。
     ＝ 各試行はその場限りの local に積み、§4.7 を満たした時だけ移す。 */
  function instantiate(def, startM, nowDist, drop, wide) {
    const scale = stage.speedAt(startM) / CFG.REF_SPEED;
    const items = [];
    const keyOf = new Map();      // 障害物 → 由来のエントリ（'f3' / 'c1'）。tip の窓の検査に使う
    const local = { syncs: [], zeros: [], warps: [], mirrors: [], swaps: [], merges: [] };
    const putAll = (list, surface, pre) => (list || []).forEach((e, i) => {
      const key = pre + i;
      if (drop && drop[key]) return;
      const n0 = items.length;
      if (wide && wide[key] !== undefined && e.type === 'PILLAR') {
        /* ワイド梁の通常出現（契約§4.3 v2）: 柱を「2レーン封鎖のゲート（床＋天井の対＝全高）」に */
        const at = startM + e.at * scale, we = { at: e.at, lane: wide[key], type: 'WIDEBAR' };
        put(items, we, 'floor', at, nowDist, scale, local);
        put(items, we, 'ceil', at, nowDist, scale, local);
      } else {
        put(items, e, surface, startM + e.at * scale, nowDist, scale, local);
      }
      for (let k = n0; k < items.length; k++) keyOf.set(items[k], key);
    });
    putAll(def.floor, 'floor', 'f');
    putAll(def.ceil, 'ceil', 'c');
    items.sort((a, b) => a.at - b.at);
    const evs = (def.events || []).map((e) => ({ at: startM + e.at * scale, type: e.type, params: e.params || null, done: false }));
    return { items: items, events: evs, lengthM: def.lengthM * scale, startM: startM, id: def.id, local: local,
             keyOf: keyOf };
  }

  /* ------------------------------------------------------------------------
     tip つきの置き方（契約§4.8 tip の猶予規則）
       ・tip は対象の speed × LEAD_T 秒手前に出す
       ・表示開始〜対象の通過後 speed × AFTER_T 秒は、対象以外の必須動作を置かない（両面）
     チャンクの中で窓に入る「対象以外の必須動作」は **エントリごと外す**（初出の1回だけ
     譜面が軽くなる）。ゲート・海流など当たり判定を持たないエントリは残す。
     置けなければ null（呼び出し側は別のチャンクを選ぶ）。
     ------------------------------------------------------------------------ */
  function placeTipped(def, flag, nowDist, tail) {
    const types = TIP_TARGET[flag] || [];
    const ents = [];
    (def.floor || []).forEach((e, i) => ents.push({ key: 'f' + i, e: e }));
    (def.ceil || []).forEach((e, i) => ents.push({ key: 'c' + i, e: e }));
    let tgt = null;
    for (let k = 0; k < types.length && !tgt; k++) {
      ents.forEach((x) => { if (x.e.type === types[k] && (!tgt || x.e.at < tgt.e.at)) tgt = x; });
    }
    if (!tgt) return null;
    const scale = stage.speedAt(cursor) / CFG.REF_SPEED;
    const tOff = tgt.e.at * scale;
    /* 窓の始まり（tip の表示開始）は、それまでに置いた障害物（＝前の tip の対象も含む）より後ろ。
       対象そのものは前の tip の窓（対象通過後 speed×1.0秒）が明けてから。 */
    const base = lastItemAt + 1.0;
    const leadAt = (m) => m - stage.speedAt(m) * CFG.TIP.LEAD_T;
    /* 対象の位置 T を「leadAt(T) ≥ base」になる最小へ（速度は位置で変わるので2回回す） */
    let T = base + stage.speedAt(base) * CFG.TIP.LEAD_T;
    T = Math.max(base + stage.speedAt(T) * CFG.TIP.LEAD_T, noDemandUntil + 0.5);
    /* ワイド梁の通常出現（契約§4.3 v2）: tip つきの初出チャンクも柱をゲートへ置き換えて試す */
    const variants = wideVariants(def);
    for (let vi = 0; vi < variants.length; vi++) {
      const wide = variants[vi];
      for (let pad = 0; pad <= 30; pad += 3) {
        const startM = Math.max(cursor, T + pad - tOff);
        let drop = {}, inst = null, win = null;
        for (let it = 0; it < 4; it++) {
          inst = instantiate(def, startM, nowDist, drop, wide);
          const tItems = inst.items.filter((o) => inst.keyOf.get(o) === tgt.key);
          if (!tItems.length) { inst = null; break; }
          const tFirst = Math.min.apply(null, tItems.map((o) => o.at));
          const tLast = TIP_ENTRY_ONLY[tgt.e.type] ? tFirst : Math.max.apply(null, tItems.map((o) => o.at));
          win = { tipAt: leadAt(tFirst), tFirst: tFirst, tLast: tLast,
                  end: tLast + stage.speedAt(tLast) * CFG.TIP.AFTER_T,
                  uids: tItems.map((o) => o.uid) };
          /* 窓に入る（または対象より手前の）「対象以外の必須動作」を持つエントリを外す */
          let added = false;
          Fair.walls(inst.items, stage.speedAt, { merges: merges.concat(inst.local.merges) }).forEach((w) => {
            /* 窓の中だけでなく **対象より手前** も外す（前のチャンクとの間に割り込ませない） */
            if (w.at > win.end + 0.5) return;
            w.items.forEach((o) => {
              const k = inst.keyOf.get(o);
              if (k === tgt.key || drop[k]) return;
              if (Obstacles.demand(o, 'floor') === 'none' && Obstacles.demand(o, 'ceil') === 'none') return;
              drop[k] = true; added = true;
            });
          });
          if (!added) break;
        }
        if (!inst || !win) return null;
        if (win.tipAt < base - 1e-6) continue;
        /* 大演出にはみ出すなら置かない（起点を後ろへずらした分を含めて見る） */
        if (!setpieceDone && isFinite(spStart) && startM + chunkStats(def).lastAt * scale > spStart) return null;
        /* 大演出の手前に窓がはみ出すなら置かない */
        if (!setpieceDone && isFinite(spStart) && win.end > spStart - 1) return null;
        const errs = Fair.validate(tail.concat(inst.items).concat(setpieceDone ? [] : spHead), stage.speedAt,
                                   { startLanes: 'any', reactBoth: RB,
                                     zeros: zeros.concat(inst.local.zeros),
                                     warps: warps.concat(inst.local.warps),
                                     mirrors: mirrors.concat(inst.local.mirrors),
                                     swaps: swaps.concat(inst.local.swaps),
                                     merges: merges.concat(inst.local.merges) });
        if (errs.length) continue;
        return { inst: inst, win: win, dropped: Object.keys(drop).length };
      }
    }
    return null;
  }
  /* 試行が通った時だけ、区間を本物の入れ物へ移す */
  function commit(inst) {
    if (!inst.local) return;
    inst.local.syncs.forEach((g) => syncs.push(g));
    inst.local.zeros.forEach((z) => zeros.push(z));
    inst.local.warps.forEach((wp) => warps.push(wp));
    inst.local.mirrors.forEach((mr) => mirrors.push(mr));
    inst.local.swaps.forEach((sw) => swaps.push(sw));
    inst.local.merges.forEach((mg) => merges.push(mg));
    inst.local = null;
  }

  /* 直近に置いた障害物の位置（継ぎ目＝この後ろに speed*0.6秒 以内で次を置く） */
  let lastItemAt = -1e9;
  function noteItems(items) {
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      if (o.at > lastItemAt) lastItemAt = o.at;
      if (o.type === 'PILLAR') gates.pillar++;
      else if (o.type === 'WIDEBAR') {
        const k = o.at.toFixed(2) + '|' + o.lane;
        if (!gates.seen[k]) { gates.seen[k] = 1; gates.wide++; }
      }
    }
  }
  /* ---- ワイド梁の通常出現（契約§4.3 v2「ピラーとの出現比 6:4」） -----------------
     譜面の柱（PILLAR）を、これまでの出現数を見ながら「2レーン封鎖のゲート」へ置き換える。
     ワイド梁の割合が CFG.WIDE_SHARE に届くまで置き換える（貪欲＝走行のどこでも比が揃う）。
     置き換えた形で §4.7 を満たせなければ、同じ起点で元の柱のまま試す（空白を作らない）。
     空くレーン: 左の柱→左2レーン封鎖（右が空く）／右の柱→右2レーン／中央→左右どちらかをシードで。 */
  const gates = { pillar: spPillars, wide: spWides, seen: {} };
  function wideVariants(def) {
    const map = {}, keys = [];
    let p = gates.pillar, w = gates.wide;
    (def.floor || []).forEach((e, i) => {
      if (e.type !== 'PILLAR') return;
      if ((w + 1) / (p + w + 1) <= CFG.WIDE_SHARE + 0.04) {
        map['f' + i] = (e.lane < 0) ? -1 : (e.lane > 0) ? 0 : ((rng() < 0.5) ? -1 : 0);
        keys.push('f' + i);
        w++;
      } else p++;
    });
    if (!keys.length) return [null];
    /* 試す順: 全部置き換え → 空く側を逆に → 1本ずつ（両側）→ 置き換えなし。
       ゲートは柱のレーンを含まなくてよい（新しい障害物＝どちらの端を空けても §4.7 は Fair が見る） */
    const other = (l) => (l === -1 ? 0 : -1);
    const flip = {};
    keys.forEach((k) => { flip[k] = other(map[k]); });
    const out = [map, flip];
    if (keys.length > 1) {
      keys.forEach((k) => {
        const a = {}, b = {};
        a[k] = map[k]; b[k] = other(map[k]);
        out.push(a, b);
      });
    }
    out.push(null);
    return out;
  }

  /* 導入区間（実寸・固定） */
  /* 導入区間の位置は **tip の猶予規則（契約§4.8）** から決める:
     前の対象の窓（通過後 speed×1.0秒）が明けてから、次の tip を speed×2.5秒 手前に出す。
     INTRO の at は「これより手前には置かない」下限（最初の1つ＝60m）。 */
  function appendIntro(nowDist) {
    const it = stage.intro[introPtr++];
    /* 次の tip は前の対象の通過（＋体の奥行きぶん）の後に出す＝吹き出しが重ならない。
       対象は前の窓（通過後 speed×1.0秒）が明けてから。 */
    const base = lastItemAt + 1.0;
    let at = it.at;
    if (it.tip) {
      let T = base + stage.speedAt(base) * CFG.TIP.LEAD_T;
      T = Math.max(base + stage.speedAt(T) * CFG.TIP.LEAD_T, noDemandUntil + 0.5);
      at = Math.max(at, Math.ceil(T * 2) / 2);
    }
    const items = [];
    (it.floor || []).forEach((e) => put(items, e, 'floor', at, nowDist));
    (it.ceil || []).forEach((e) => put(items, e, 'ceil', at, nowDist));
    items.sort((a, b) => a.at - b.at);
    items.forEach((o) => out.push(o));
    noteItems(items);
    if (it.tip) {
      const winEnd = at + stage.speedAt(at) * CFG.TIP.AFTER_T;
      events.push({ at: Math.max(2, at - stage.speedAt(at) * CFG.TIP.LEAD_T), type: 'tip',
                    params: { id: it.tip, untilM: at, targetAt: at, winEnd: winEnd,
                              target: items.map((o) => o.uid) }, done: false });
      noDemandUntil = Math.max(noDemandUntil, winEnd);
      noteTipWindow(Math.max(2, at - stage.speedAt(at) * CFG.TIP.LEAD_T), winEnd);
    }
    log.push({ id: 'intro:' + it.tip, startM: at - 8, lengthM: 16, intro: true });
    cursor = at + ((introPtr < stage.intro.length) ? 8 : 40);
    return true;
  }

  /* 終盤の大演出（実寸・固定。§4.7 は通常どおり検査する） */
  function appendSetpiece(nowDist) {
    if (EP) return (barrier === 'mini') ? placeMini(nowDist) : placeSwitch(nowDist);
    if (setpieceDone) return false;             // 二度置かない（置いたら二度と戻らない）
    const inst = Setpieces.build(stage.setpiece, spStart, nowDist, stage.speedAt(spStart) / CFG.REF_SPEED, sink);
    if (!inst) { setpieceDone = true; return false; }
    const tail = out.slice(-8);
    const errs = Fair.validate(tail.concat(inst.items), stage.speedAt,
                               { startLanes: 'any', reactBoth: RB,
                                 zeros: zeros, warps: warps, mirrors: mirrors, swaps: swaps,
                                 merges: merges });
    if (errs.length) log.push({ id: '(setpiece-unfair)', startM: spStart, lengthM: 0, errs: errs });
    inst.items.forEach((o) => out.push(o));
    noteItems(inst.items);
    inst.events.forEach((e) => events.push(e));
    log.push({ id: 'setpiece:' + inst.id, startM: inst.startM, lengthM: inst.lengthM, setpiece: true });
    cursor = inst.startM + inst.lengthM;
    /* 自由飛行の着地の後 FF.GRACE_T 秒（= speed × 2.0 m）は障害物を置かない（契約§4.5）。
       演出が 200m で終わっても、猶予がその先まで伸びるならそこまで空ける。 */
    const def = Setpieces.DEFS[stage.setpiece];
    if (def && def.air && def.landRel !== undefined) {
      const landM = inst.startM + def.landRel;
      const until = landM + stage.speedAt(landM) * FF.GRACE_T;
      if (until > cursor) {
        cursor = until;
        log.push({ id: '(landing-grace)', startM: landM, lengthM: until - landM, grace: true });
      }
      lastItemAt = Math.max(lastItemAt, cursor - seamFor(cursor));
    }
    setpieceDone = true;
    lastWallhole = false;
    return true;
  }

  /* ------------------------------------------------------------------------
     エンドレスの区切り（契約§4.4 / P6）
       ・ゾーン切替: 通路の入口 t0 ＝ ゲート G − 40m。[t0 − speed×1.0秒, G + speed×1.0秒] は障害物なし。
         G は 1000m の倍数が基本。手前のチャンク（ゲート型ギミックの区間を含む）が
         食い込んでいたら、その終わり＋猶予まで **遅らせる**（区間の途中で切り替えない）。
       ・ミニ大演出: 1500m の倍数から。次の切替の手前に収まらなければ切替の後へ回す。
     どちらも「次の区切り」を spStart に入れておくと、有限ステージの大演出と同じ仕組みで
     手前のチャンクが収まるものから選ばれ、はみ出すなら区切りを先に置く。
     ------------------------------------------------------------------------ */
  function miniRoom(m) {
    /* ミニ大演出が占める長さの見積り（最長のもの＋着地猶予＋余白） */
    const sp = stage.speedAt(m);
    let len = 0;
    Endless.MINIS.forEach((id) => {
      const d = Setpieces.DEFS[id];
      if (!d) return;
      const k = Math.max(1, sp / (d.vd || 24));
      len = Math.max(len, d.lengthM * k + (d.air ? sp * FF.GRACE_T : 0));
    });
    return len + sp * 2.0;
  }
  function refreshBarrier() {
    if (!EP) return;
    const swFree = isFinite(nextSwitch)
      ? nextSwitch - Endless.TUNNEL_M - stage.speedAt(nextSwitch) * Endless.GRACE_T : Infinity;
    const mAt = Math.max(nextMini, cursor);
    if (mAt < swFree && mAt + miniRoom(mAt) <= swFree) { barrier = 'mini'; spStart = mAt; }
    else { barrier = 'switch'; spStart = swFree; }
  }
  function regionEnd() {
    let e = -1e9;
    [zeros, warps, mirrors, swaps, merges].forEach((l) => l.forEach((r) => {
      if (typeof r.to === 'number') e = Math.max(e, r.to);
    }));
    syncs.forEach((g) => { e = Math.max(e, g.gapAt || 0); });
    return e;
  }
  function placeSwitch(nowDist) {
    const from = zoneNow();
    const to = EP.zones[(zi + 1) % EP.zones.length];
    const G0 = nextSwitch;
    const sp0 = stage.speedAt(G0);
    /* 前のチャンク・ゲート型ギミックの区間・tip の窓が明けてから、猶予＋通路 */
    const clear = Math.max(cursor, lastItemAt, regionEnd(), noDemandUntil);
    const G = Math.max(G0, clear + sp0 * Endless.GRACE_T + Endless.TUNNEL_M);
    const t0 = G - Endless.TUNNEL_M;
    const spG = stage.speedAt(G);
    const sw = { t0: t0, at: G, swapAt: G - Endless.SWAP_BEFORE, from: from, to: to,
                 idx: switches.length + 1, delay: +(G - G0).toFixed(2),
                 freeFrom: t0 - stage.speedAt(t0) * Endless.GRACE_T, freeTo: G + spG * Endless.GRACE_T,
                 rb: (Math.floor((zi + 1) / EP.zones.length) >= 1) ? CFG.FAIR.REACT_BOTH_LATE : EP.pools[to].reactBoth };
    switches.push(sw);
    events.push({ at: sw.swapAt, type: 'zone.switch', params: { zone: to, from: from, idx: sw.idx }, done: false });
    events.push({ at: G, type: 'zone.gate', params: { zone: to, from: from, idx: sw.idx }, done: false });
    /* 通路とその前後は「規則で空けている区間」なので、密度の実測から外す */
    noteTipWindow(sw.freeFrom, sw.freeTo);
    noDemandUntil = Math.max(noDemandUntil, sw.freeTo);
    lastItemAt = Math.max(lastItemAt, G);
    cursor = Math.max(cursor, sw.freeTo);
    log.push({ id: 'zone:' + from + '>' + to, startM: t0, lengthM: Endless.TUNNEL_M, zone: true });
    zi++;
    zoneStart = G;
    nextSwitch += Endless.SWITCH_M;
    while (nextSwitch - Endless.TUNNEL_M - stage.speedAt(nextSwitch) * Endless.GRACE_T < cursor + 60) nextSwitch += Endless.SWITCH_M;
    lastWallhole = false;
    /* 切替の直後にミニ大演出が来るなら、ゾーン名の表示と重ならないよう少しだけ空ける */
    if (nextMini <= cursor + spG * 1.0) nextMini = Math.max(nextMini, cursor + spG * 1.0);
    refreshBarrier();
    return true;
  }
  function placeMini(nowDist) {
    const id = Endless.MINIS[Math.min(Endless.MINIS.length - 1, (rng() * Endless.MINIS.length) | 0)];
    const tail = out.slice(-10);
    const sp0 = stage.speedAt(cursor);
    let inst = null, errs = null;
    const base = Math.max(cursor, lastItemAt + sp0 * CFG.FAIR.REACT, noDemandUntil + 0.5);
    for (let pad = 0; pad <= 60; pad += 4) {
      inst = Setpieces.buildMini(id, base + pad, nowDist, stage.speedAt);
      errs = Fair.validate(tail.concat(inst.items), stage.speedAt,
                           { startLanes: 'any', reactBoth: RB, zeros: zeros,
                             warps: warps, mirrors: mirrors, swaps: swaps, merges: merges });
      if (!errs.length) break;
    }
    if (errs.length) log.push({ id: '(mini-unfair)', startM: inst.startM, lengthM: 0, errs: errs });
    inst.items.forEach((o) => out.push(o));
    noteItems(inst.items);
    noteDemands(inst.items);
    inst.events.forEach((e) => events.push(e));
    const endM = inst.startM + inst.lengthM;
    let until = endM;
    if (inst.landM !== null) until = Math.max(until, inst.landM + stage.speedAt(inst.landM) * FF.GRACE_T);
    minis.push({ id: id, startM: inst.startM, endM: endM, k: inst.k, landM: inst.landM, freeTo: until });
    log.push({ id: 'mini:' + id, startM: inst.startM, lengthM: inst.lengthM, setpiece: true, mini: true });
    /* ミニ大演出は規則で薄い区間なので、密度の実測から外す（後ろを詰め込ませない） */
    noteTipWindow(inst.startM, until);
    if (until > endM) {
      noDemandUntil = Math.max(noDemandUntil, until);
      log.push({ id: '(landing-grace)', startM: inst.landM, lengthM: until - inst.landM, grace: true });
    }
    cursor = Math.max(cursor, until);
    lastItemAt = Math.max(lastItemAt, cursor - seamFor(cursor));
    lastWallhole = false;
    nextMini += Endless.MINI_M;
    while (nextMini < cursor) nextMini += Endless.MINI_M;
    refreshBarrier();
    return true;
  }

  function appendOne(nowDist) {
    if (stage.intro && introPtr < stage.intro.length) return appendIntro(nowDist);
    if (!setpieceDone && cursor >= spStart) return appendSetpiece(nowDist);
    let cands = candidates(cursor);
    /* 決まった場所で必ず出す顔ぶれ（S8 の合体区間＝2回 / 契約§4.4） */
    let forced = null;
    if (forcePlan && forcePtr < forcePlan.length && cursor >= forcePlan[forcePtr].at) {
      const flag = forcePlan[forcePtr].flag;
      const sp0 = stage.speedAt(cursor);
      const only = stage.chunkPool.map((id) => CHUNK_BY_ID[id]).filter(Boolean)
        .filter((d) => d[flag] && sp0 >= (d.minSpeed || 0));
      if (only.length) { cands = only; forced = flag; }
    }
    const tail = out.slice(-10);
    const seam = seamFor(cursor);
    /* 大演出の手前に大きな空白を作らない: 残りに収まるチャンクがあればそれを使う */
    if (!setpieceDone && isFinite(spStart)) {
      const room = spStart - cursor, sc = stage.speedAt(cursor) / CFG.REF_SPEED;
      const fit = cands.filter((d) => d.lengthM * sc <= room);
      if (fit.length) cands = fit;
    }
    for (let tryI = 0; tryI < 12; tryI++) {
      const def = pick(cands, cursor);
      const scale = stage.speedAt(cursor) / CFG.REF_SPEED;
      const st = chunkStats(def);
      /* 大演出の手前ははみ出さないよう空白で詰める（演出を置く前だけ） */
      if (!setpieceDone && cursor + def.lengthM * scale > spStart) {
        /* エンドレスの区切りの手前は、収まる札が残っていればそちらを試す（空白を短く） */
        if (EP) { cands = cands.filter((d) => d !== def && d.lengthM * scale <= spStart - cursor); if (cands.length) continue; }
        log.push({ id: '(pre-setpiece)', startM: cursor, lengthM: spStart - cursor });
        cursor = spStart;
        return appendSetpiece(nowDist);
      }
      /* **継ぎ目を詰める**（契約§4.7 密度）: チャンクの「最初の障害物」が
         直前の障害物から seam（= speed*0.6秒）だけ後ろに来るように起点を決める。
         そこから §4.7 を満たすまで少しずつ後ろへずらす。 */
      /* 継ぎ目は「このチャンクを置いたときに密度の目安どおりになる長さ」。
         詰めすぎても §4.7 の反応窓で弾かれるので、下限は speed*0.2秒 で切る。 */
      /* 新ギミックの初出は tip つきで置く（契約§4.8）。置けなければ別のチャンクを選ぶ
         （tip なしで初出させない＝「説明なしの初見」を作らない）。
         1本に未出のギミックが2つ以上あると、tip の窓が重なって規則を満たせないので後回し。 */
      /* ゴールの先（大演出の後ろ）は走らないので tip は要らない */
      const pend = (stage.tipOnce && !setpieceDone)
        ? Object.keys(stage.tipOnce).filter((f) => def[f] && !tipDone[f]) : [];
      if (pend.length) {
        const r = (pend.length === 1) ? placeTipped(def, pend[0], nowDist, tail) : null;
        if (!r) {
          cands = cands.filter((d) => d !== def);
          /* 候補が尽きたら「未出のギミックを持たない札」で埋める（空白を作らない） */
          if (!cands.length) {
            cands = candidates(cursor).filter((d) => !Object.keys(stage.tipOnce).some((f) => d[f] && !tipDone[f]));
            if (!setpieceDone && isFinite(spStart)) {
              const sc2 = stage.speedAt(cursor) / CFG.REF_SPEED;
              const fit2 = cands.filter((d) => d.lengthM * sc2 <= spStart - cursor);
              if (fit2.length) cands = fit2;
            }
          }
          if (!cands.length) break;
          continue;
        }
        const inst = r.inst;
        commit(inst);
        inst.items.forEach((o) => out.push(o));
        noteItems(inst.items);
        noteDemands(inst.items);
        inst.events.forEach((e) => events.push(e));
        tipDone[pend[0]] = true;
        events.push({ at: Math.max(2, r.win.tipAt), type: 'tip',
                      params: { id: stage.tipOnce[pend[0]], untilM: r.win.tLast, targetAt: r.win.tFirst,
                                winEnd: r.win.end, target: r.win.uids }, done: false });
        noDemandUntil = Math.max(noDemandUntil, r.win.end);
        noteTipWindow(Math.max(2, r.win.tipAt), r.win.end);
        if (forced && def[forced]) forcePtr++;
        if (stage.coverFlags) stage.coverFlags.forEach((f) => { if (def[f]) covered[f] = true; });
        log.push({ id: inst.id, startM: inst.startM, lengthM: inst.lengthM, tip: pend[0],
                   tipAt: r.win.tipAt, winEnd: r.win.end, dropped: r.dropped,
                   firstAt: inst.startM + st.firstAt * scale, lastAt: inst.startM + st.lastAt * scale });
        cursor = Math.max(cursor, inst.startM + st.lastAt * scale);
        lastWallhole = !!def.wallhole;
        return true;
      }
      const need = st.demands / Math.max(wantDensity(cursor), 0.5) * 100 - st.span * scale;
      const gap = U.clamp(need, stage.speedAt(cursor) * 0.18, seam);
      const wantFirst = (lastItemAt > -1e9) ? (lastItemAt + gap) : (cursor + st.firstAt * scale);
      let tooLong = false;
      const variants = wideVariants(def);
      for (let pad = 0; pad <= 40; pad += 3) {
        /* tip の窓（契約§4.8）が明けるまでは次のチャンクを始めない */
        const startM = Math.max(cursor - st.firstAt * scale, wantFirst + pad - st.firstAt * scale,
                                noDemandUntil + 0.5 - st.firstAt * scale);
        /* 起点が cursor より後ろへずれた分で大演出にはみ出すなら、このチャンクはやめる
           （tip の窓明けを待つと起点が後ろへずれる / P5c） */
        if (!setpieceDone && isFinite(spStart) && startM + st.lastAt * scale > spStart) {
          if (EP) { tooLong = true; break; }    // エンドレス: 別の札を試す（下で候補から外す）
          log.push({ id: '(pre-setpiece)', startM: cursor, lengthM: spStart - cursor });
          cursor = spStart;
          return appendSetpiece(nowDist);
        }
        for (let vi = 0; vi < variants.length; vi++) {
          const inst = instantiate(def, startM, nowDist, null, variants[vi]);
          /* 大演出の頭との間隔も §4.7 で見る（起点が後ろへずれると大演出に詰まる / P5c） */
          const errs = Fair.validate(tail.concat(inst.items).concat(setpieceDone ? [] : spHead), stage.speedAt,
                                     { startLanes: 'any', reactBoth: RB,
                                       zeros: zeros.concat(inst.local.zeros),
                                       warps: warps.concat(inst.local.warps),
                                       mirrors: mirrors.concat(inst.local.mirrors),
                                       swaps: swaps.concat(inst.local.swaps),
                                       merges: merges.concat(inst.local.merges) });
          if (!errs.length) {
            commit(inst);
            inst.items.forEach((o) => out.push(o));
            noteItems(inst.items);
            noteDemands(inst.items);
            inst.events.forEach((e) => events.push(e));
            if (forced && def[forced]) forcePtr++;
            if (stage.coverFlags) stage.coverFlags.forEach((f) => { if (def[f]) covered[f] = true; });
            log.push({ id: inst.id, startM: inst.startM, lengthM: inst.lengthM,
                       firstAt: inst.startM + st.firstAt * scale, lastAt: inst.startM + st.lastAt * scale });
            cursor = Math.max(cursor, inst.startM + st.lastAt * scale);
            lastWallhole = !!def.wallhole;
            return true;
          }
        }
      }
      if (tooLong) {
        cands = cands.filter((d) => d !== def);
        if (!cands.length) {
          log.push({ id: '(pre-setpiece)', startM: cursor, lengthM: spStart - cursor });
          cursor = spStart;
          return appendSetpiece(nowDist);
        }
      }
    }
    /* エンドレスの区切りが近ければ、空白の代わりに区切りを置く */
    if (EP && isFinite(spStart) && cursor + 40 >= spStart) {
      log.push({ id: '(pre-setpiece)', startM: cursor, lengthM: Math.max(0, spStart - cursor) });
      cursor = Math.max(cursor, spStart);
      return appendSetpiece(nowDist);
    }
    /* どうしても入らない時は空白を置いて先へ（“理不尽な配置”より空白を選ぶ） */
    cursor += 40;
    log.push({ id: '(blank)', startM: cursor - 40, lengthM: 40 });
    lastItemAt = Math.max(lastItemAt, cursor - 6);
    lastWallhole = false;
    return false;
  }

  refreshBarrier();

  return {
    stage: stage,
    seed: seed,
    get cursor() { return cursor; },
    /* エンドレス（P6）: ゾーン切替・ミニ大演出・その距離のゾーン・同時要求の余白 */
    switches: switches,
    minis: minis,
    plan: EP,
    zoneAt: zoneAt,
    reactBoth: RB,
    obstacles: out,
    syncs: syncs,
    zeros: zeros,
    warps: warps,
    mirrors: mirrors,
    swaps: swaps,
    merges: merges,
    events: events,
    log: log,
    /* untilM まで生成しておく。nowDist は視認距離の記録用 */
    ensure(untilM, nowDist) {
      let guard = 0;
      while (cursor < untilM && guard++ < 200) appendOne(nowDist === undefined ? Math.max(0, untilM - CFG.SPAWN_AHEAD) : nowDist);
    }
  };
}
