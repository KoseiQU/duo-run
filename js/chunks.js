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
    floor: [{ at: 16, lane: 0, type: 'GAP' }, { at: 36, lane: 1, type: 'GAP' }], ceil: [], events: [] },
  { id: 'c1_gap_c', zone: 'neon', lengthM: 50, difficulty: 1, minSpeed: 0,
    floor: [], ceil: [{ at: 16, lane: -1, type: 'GAP' }, { at: 36, lane: 0, type: 'GAP' }], events: [] },
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
    floor: [{ at: 13, lane: -1, type: 'GAP' }, { at: 40, lane: 1, type: 'PILLAR' }],
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
    ceil:  [{ at: 27, lane: 0, type: 'GAP' }], events: [] },

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
    ceil:  [{ at: 14, lane: 1, type: 'ROVER' }, { at: 29, lane: 0, type: 'GAP' }], events: [] },
  { id: 'c3_wallhole_c', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0, wallhole: 1, dense: 1,
    floor: [{ at: 14, lane: 1, type: 'GAP' }, { at: 29, lane: 0, type: 'LASER_LOW' },
            { at: 44, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 14, lane: -1, type: 'WALLHOLE' }, { at: 29, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c3_wallhole_x', zone: 'neon', lengthM: 52, difficulty: 3, minSpeed: 0, wallhole: 1, dense: 1,
    floor: [{ at: 12, lane: -1, type: 'ROVER' }, { at: 27, lane: 1, type: 'WALLHOLE' },
            { at: 44, lane: 0, type: 'GAP' }],
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
            { at: 50, lane: -1, type: 'GAP' }],
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
            { at: 48, lane: -1, type: 'GAP' }],
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
    ceil:  [{ at: 32, lane: 0, type: 'GAP' }], events: [] },
  { id: 'c3_rot_ceil', zone: 'neon', lengthM: 60, difficulty: 3, minSpeed: 0, moving: 1,
    floor: [{ at: 32, lane: 0, type: 'GAP' }, { at: 48, lane: -1, type: 'ROVER' }],
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
            { at: 33, lane: -1, type: 'GAP' }, { at: 44, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 11, lane: 1, type: 'ROVER' }, { at: 33, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'd3_duo_b', zone: 'neon', lengthM: 54, difficulty: 3, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 11, lane: 1, type: 'ROVER' },
            { at: 23, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0.5 } } },
            { at: 35, lane: 0, type: 'LASER_LOW' }, { at: 47, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 11, lane: -1, type: 'GAP' }, { at: 35, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'd3_duo_c', zone: 'neon', lengthM: 54, difficulty: 3, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 11, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.5 } } },
            { at: 23, lane: 1, type: 'PILLAR' }, { at: 35, lane: 0, type: 'ROVER' },
            { at: 47, lane: 0, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } }],
    ceil:  [{ at: 11, lane: 0, type: 'ROVER' }, { at: 35, lane: -1, type: 'LASER_LOW' },
            { at: 47, lane: 1, type: 'GAP' }], events: [] },
  { id: 'd3_duo_d', zone: 'neon', lengthM: 54, difficulty: 3, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 11, lane: 0, type: 'LASER_V', params: { blink: { onAtArrival: true } } },
            { at: 23, lane: 1, type: 'ROVER' }, { at: 35, lane: -1, type: 'GAP' },
            { at: 47, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 0, to: 1, phase: 0.25 } } }],
    ceil:  [{ at: 23, lane: -1, type: 'ROVER' }, { at: 35, lane: 0, type: 'LASER_LOW' }], events: [] },
  /* 最も密（S2 後半・エンドレス後半）: 5ウォール × 両者同時 = 10回 */
  { id: 'd3_duo_e', zone: 'neon', lengthM: 62, difficulty: 3, minSpeed: 0, dense: 2,
    floor: [{ at: 11, lane: 0, type: 'ROVER' }, { at: 22, lane: 1, type: 'PILLAR' },
            { at: 33, lane: -1, type: 'GAP' }, { at: 44, lane: 0, type: 'LASER_V' },
            { at: 55, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 11, lane: -1, type: 'LASER_LOW' }, { at: 33, lane: 1, type: 'ROVER' },
            { at: 55, lane: -1, type: 'GAP' }], events: [] },
  { id: 'd3_duo_f', zone: 'neon', lengthM: 62, difficulty: 3, minSpeed: 0, dense: 2, moving: 1,
    floor: [{ at: 11, lane: 1, type: 'GAP' },
            { at: 22, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.25 } } },
            { at: 33, lane: 0, type: 'ROVER' },
            { at: 44, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } },
            { at: 55, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 11, lane: -1, type: 'ROVER' }, { at: 33, lane: 1, type: 'LASER_LOW' },
            { at: 44, lane: 1, type: 'ROVER' }, { at: 55, lane: -1, type: 'GAP' }], events: [] },
  /* 中くらいの密度（S2 前半・S1 後半） */
  { id: 'd2_duo_a', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0, dense: 1,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 27, lane: -1, type: 'LASER_V' },
            { at: 42, lane: 1, type: 'GAP' }],
    ceil:  [{ at: 12, lane: -1, type: 'LASER_LOW' }, { at: 42, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'd2_duo_b', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0, dense: 1,
    floor: [{ at: 12, lane: 1, type: 'GAP' }, { at: 27, lane: 0, type: 'PILLAR' },
            { at: 42, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 12, lane: 0, type: 'ROVER' }, { at: 42, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 'd2_duo_c', zone: 'neon', lengthM: 50, difficulty: 2, minSpeed: 0, dense: 1, moving: 1,
    floor: [{ at: 12, lane: 1, type: 'ROVER' },
            { at: 27, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0 } } },
            { at: 42, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 12, lane: 0, type: 'GAP' }, { at: 42, lane: -1, type: 'ROVER' }], events: [] },

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
            { at: 44, lane: -1, type: 'GAP' }],
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
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 21, lane: -1, type: 'GAP' },
            { at: 45, lane: 1, type: 'LASER_LOW' }], events: [] },
  { id: 'r3_duo_b', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, moving: 1, pend: 1,
    floor: [{ at: 10, lane: 1, type: 'GAP' },
            { at: 21, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 1, phase: 0.25 } } },
            { at: 31, lane: 0, type: 'LASER_LOW' }, { at: 45, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 31, lane: 1, type: 'ROVER' },
            { at: 45, lane: 0, type: 'GAP' }], events: [] },
  { id: 'r3_duo_c', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, moving: 1,
    floor: [{ at: 10, lane: -1, type: 'LASER_ROT', params: { rot: { phase: 0.5 } } },
            { at: 21, lane: 1, type: 'PILLAR' }, { at: 32, lane: 0, type: 'ROVER' },
            { at: 46, lane: 0, type: 'LASER_ROT', params: { rot: { phase: 0.25 } } }],
    ceil:  [{ at: 10, lane: 0, type: 'ROVER' }, { at: 21, lane: -1, type: 'LASER_LOW' },
            { at: 32, lane: 1, type: 'GAP' }], events: [] },
  { id: 'r3_duo_d', zone: 'ruins', lengthM: 56, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, bridge: 1, pend: 1, moving: 1,
    floor: [{ at: 10, lane: 0, type: 'BRIDGE' }, { at: 26, lane: 1, type: 'PILLAR' },
            { at: 37, lane: -1, type: 'ROVER' },
            { at: 48, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 0, to: 1, phase: 0.5 } } }],
    ceil:  [{ at: 26, lane: -1, type: 'ROVER' }, { at: 37, lane: 0, type: 'LASER_LOW' },
            { at: 48, lane: 1, type: 'GAP' }], events: [] },
  { id: 'r3_duo_e', zone: 'ruins', lengthM: 60, difficulty: 3, minSpeed: 0, s3: 1, dense: 2,
    floor: [{ at: 10, lane: 1, type: 'ROVER' }, { at: 21, lane: 0, type: 'PILLAR' },
            { at: 32, lane: -1, type: 'GAP' }, { at: 43, lane: 1, type: 'LASER_V' },
            { at: 54, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 10, lane: -1, type: 'LASER_LOW' }, { at: 32, lane: 1, type: 'ROVER' },
            { at: 54, lane: -1, type: 'GAP' }], events: [] },
  { id: 'r3_wallhole', zone: 'ruins', lengthM: 54, difficulty: 3, minSpeed: 0, s3: 1, wallhole: 1, dense: 1,
    floor: [{ at: 14, lane: 0, type: 'WALLHOLE' }, { at: 30, lane: -1, type: 'ROVER' },
            { at: 44, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 14, lane: 1, type: 'ROVER' }, { at: 30, lane: 0, type: 'GAP' }], events: [] },
  { id: 'r3_bridge_duo', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s3: 1, dense: 1, bridge: 1,
    /* 崩れる橋を跳び越した直後に、逆側でレーン移動を要求する（§4.7 の 0.92秒を使い切る） */
    floor: [{ at: 12, lane: 1, type: 'BRIDGE' }, { at: 34, lane: 0, type: 'LASER_V' },
            { at: 48, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 12, lane: -1, type: 'GAP' }, { at: 34, lane: 1, type: 'ROVER' },
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
    floor: [{ at: 10, lane: 0, type: 'ROVER' }, { at: 18, lane: -1, type: 'GAP' },
            { at: 26, lane: 1, type: 'LASER_LOW' }, { at: 34, lane: 0, type: 'ROVER' },
            { at: 42, lane: -1, type: 'GAP' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 18, lane: 0, type: 'LASER_LOW' },
            { at: 26, lane: -1, type: 'GAP' }, { at: 34, lane: 1, type: 'ROVER' },
            { at: 42, lane: 0, type: 'LASER_LOW' }], events: [] },
  { id: 'r3_leap_b', zone: 'ruins', lengthM: 56, difficulty: 3, minSpeed: 0, s3: 1, dense: 2, bridge: 1,
    floor: [{ at: 10, lane: 1, type: 'LASER_LOW' }, { at: 18, lane: 0, type: 'ROVER' },
            { at: 28, lane: -1, type: 'BRIDGE' }, { at: 44, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 10, lane: -1, type: 'GAP' }, { at: 18, lane: 1, type: 'ROVER' },
            { at: 28, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'GAP' }], events: [] },
  { id: 'r3_pend_pair', zone: 'ruins', lengthM: 62, difficulty: 3, minSpeed: 0, s3: 1, dense: 1, moving: 1, pend: 1,
    floor: [{ at: 12, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0 } } },
            { at: 34, lane: 0, type: 'ROVER' },
            { at: 52, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0 } } }],
    ceil:  [{ at: 23, lane: 1, type: 'ROVER' }, { at: 34, lane: -1, type: 'GAP' }], events: [] },

  /* ==========================================================================
     S4「古代遺跡・内部」（契約§4.4 / §4.5 / P3b）
     ------------------------------------------------------------------------
     新ギミック:
       SYNCSW   同時スイッチ。床と天井の対のパッドを **同じ0.3秒窓内** に踏むと
                gapT 秒先に橋が架かる。踏み損ねると谷（＝迂回の1レーンだけが残る）。
                params.sync = { cl:天井パッドのレーン, safe:床の迂回レーン,
                                csafe:天井の迂回レーン, gapT:橋までの秒 }
                **パッドのレーン＝迂回レーン** にそろえる（踏んだ者はそのまま渡れる）。
       DROPCEIL 落ちる天井。1つの事象が **床＝レーン移動／天井＝ジャンプ** に割れる。
     密度は S3 よりさらに高い（6→10回/100m）。both 型（柱・火柱・落ちる天井・同時スイッチ）を
     厚く敷いて、間隔を詰めずに密度を稼ぐ。
     ========================================================================== */
  /* --- 落ちる天井を1つずつ覚える（rank3） -------------------------------- */
  { id: 'r4_drop_a', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, drop: 1, dense: 1,
    floor: [{ at: 12, lane: 0, type: 'DROPCEIL' }, { at: 30, lane: -1, type: 'PILLAR' },
            { at: 46, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 46, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_drop_b', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, drop: 1, dense: 1,
    floor: [{ at: 14, lane: 1, type: 'GAP' }, { at: 30, lane: 0, type: 'DROPCEIL' },
            { at: 48, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 14, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_drop_c', zone: 'ruins', lengthM: 56, difficulty: 3, minSpeed: 0, s4: 1, drop: 1, bridge: 1, dense: 1,
    floor: [{ at: 12, lane: -1, type: 'ROVER' }, { at: 26, lane: 1, type: 'DROPCEIL' },
            { at: 44, lane: 0, type: 'BRIDGE' }],
    ceil:  [{ at: 12, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: 1, type: 'ROVER' }], events: [] },
  /* 落ちる天井の連鎖（rank4）: 床は縫い、天井は跳び継ぎ＝1本で2体に別の譜面を配る */
  { id: 'r4_drop_chain', zone: 'ruins', lengthM: 62, difficulty: 4, minSpeed: 0, s4: 1, drop: 1, dense: 2,
    floor: [{ at: 9, lane: 0, type: 'DROPCEIL' }, { at: 17, lane: 1, type: 'DROPCEIL' },
            { at: 27, lane: -1, type: 'PILLAR' }, { at: 35, lane: 0, type: 'DROPCEIL' },
            { at: 45, lane: 1, type: 'LASER_V' }, { at: 53, lane: -1, type: 'DROPCEIL' }],
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
  { id: 'r4_sync_drop', zone: 'ruins', lengthM: 64, difficulty: 4, minSpeed: 0, s4: 1, sync: 1, drop: 1, dense: 2,
    floor: [{ at: 8, lane: 1, type: 'SYNCSW', params: { sync: { cl: -1, safe: 1, csafe: -1 } } },
            { at: 30, lane: 0, type: 'DROPCEIL' }, { at: 40, lane: -1, type: 'DROPCEIL' },
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
            { at: 30, lane: 0, type: 'ROVER' }, { at: 38, lane: -1, type: 'GAP' },
            { at: 48, lane: 1, type: 'PILLAR' }, { at: 55, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 30, lane: -1, type: 'ROVER' }, { at: 38, lane: 1, type: 'LASER_LOW' }], events: [] },

  /* --- 内部の回廊（列柱の縫い・跳び継ぎ・壁の穴） ------------------------ */
  { id: 'r4_weave', zone: 'ruins', lengthM: 60, difficulty: 4, minSpeed: 0, s4: 1, drop: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 15, lane: -1, type: 'LASER_V' },
            { at: 22, lane: 1, type: 'PILLAR' }, { at: 31, lane: 0, type: 'DROPCEIL' },
            { at: 41, lane: -1, type: 'PILLAR' }, { at: 48, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 'r4_leap', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 9, lane: 0, type: 'ROVER' }, { at: 17, lane: -1, type: 'GAP' },
            { at: 25, lane: 1, type: 'LASER_LOW' }, { at: 33, lane: 0, type: 'ROVER' },
            { at: 41, lane: -1, type: 'GAP' }, { at: 49, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 9, lane: 1, type: 'ROVER' }, { at: 17, lane: 0, type: 'LASER_LOW' },
            { at: 25, lane: -1, type: 'GAP' }, { at: 33, lane: 1, type: 'ROVER' },
            { at: 41, lane: 0, type: 'LASER_LOW' }, { at: 49, lane: -1, type: 'GAP' }], events: [] },
  { id: 'r4_wallhole', zone: 'ruins', lengthM: 58, difficulty: 3, minSpeed: 0, s4: 1, wallhole: 1, drop: 1, dense: 1,
    floor: [{ at: 12, lane: 1, type: 'WALLHOLE' }, { at: 30, lane: 0, type: 'DROPCEIL' },
            { at: 46, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 12, lane: -1, type: 'ROVER' }], events: [] },
  { id: 'r4_duo', zone: 'ruins', lengthM: 62, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    floor: [{ at: 9, lane: 1, type: 'GAP' }, { at: 19, lane: 0, type: 'PILLAR' },
            { at: 27, lane: -1, type: 'ROVER' }, { at: 37, lane: 1, type: 'LASER_V' },
            { at: 45, lane: 0, type: 'ROVER' }, { at: 55, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 9, lane: -1, type: 'ROVER' }, { at: 27, lane: 1, type: 'ROVER' },
            { at: 45, lane: -1, type: 'GAP' }], events: [] },
  /* 内部の最奥（rank4・最も密）: 列柱の縫いに落ちる天井を挟む／両者とも跳び継ぐ */
  { id: 'r4_gauntlet', zone: 'ruins', lengthM: 64, difficulty: 4, minSpeed: 0, s4: 1, drop: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 15, lane: 1, type: 'LASER_V' },
            { at: 22, lane: -1, type: 'PILLAR' }, { at: 32, lane: 0, type: 'DROPCEIL' },
            { at: 42, lane: 1, type: 'PILLAR' }, { at: 49, lane: -1, type: 'LASER_V' },
            { at: 56, lane: 0, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r4_leap2', zone: 'ruins', lengthM: 56, difficulty: 4, minSpeed: 0, s4: 1, dense: 2,
    /* 両者が 0.72秒おきに跳び継ぐ（§4.7 ジャンプ連続 0.70秒の下限ぎりぎり） */
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.2, lane: -1, type: 'GAP' },
            { at: 22.4, lane: 1, type: 'LASER_LOW' }, { at: 29.6, lane: 0, type: 'ROVER' },
            { at: 36.8, lane: -1, type: 'GAP' }, { at: 44, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.4, lane: -1, type: 'GAP' }, { at: 29.6, lane: 1, type: 'ROVER' },
            { at: 36.8, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'GAP' }], events: [] },
  /* 短い密集（つなぎ）: 大演出の手前に残る半端な距離にも入る長さにしておく。
     これが無いと終盤に 80m 級の空白ができて、契約§4.7 の密度が落ちる。 */
  { id: 'r4_fill_a', zone: 'ruins', lengthM: 26, difficulty: 3, minSpeed: 0, s4: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 12, lane: 1, type: 'LASER_V' },
            { at: 19, lane: -1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'r4_fill_b', zone: 'ruins', lengthM: 30, difficulty: 3, minSpeed: 0, s4: 1, drop: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'DROPCEIL' }, { at: 15, lane: 1, type: 'PILLAR' },
            { at: 23, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 23, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'r4_drop_duo', zone: 'ruins', lengthM: 66, difficulty: 4, minSpeed: 0, s4: 1, drop: 1, sync: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'DROPCEIL' },
            { at: 20, lane: -1, type: 'SYNCSW', params: { sync: { cl: 1, safe: -1, csafe: 1 } } },
            { at: 44, lane: 1, type: 'DROPCEIL' }, { at: 54, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 54, lane: -1, type: 'ROVER' }], events: [] },

  /* ==========================================================================
     S5「深海」（契約§4.4 / §4.5 / P4a）
     ------------------------------------------------------------------------
     新ギミック:
       CURRENT  海流ベルト。区間に入ると **1.0秒ごとに1レーンぶん** 横へ流される。
                params.cur = { dir:床の向き, cdir:天井の向き（既定 -dir）, n:押し出し回数 }
                押し出しの直前にはウォールを置けない（Fair が §4.7 の余白で弾く）ので、
                譜面は「流された先で次の壁を迎える」ように組む。
       LIFTPAD  浮上足場。到達時に浮いていれば ローバー相当（跳ぶ）、沈んでいれば通れる。
                params.lift = { upAtArrival:true/false }（点滅レーザーと同じ流儀）
       DOOR     色の扉。lane が **同色＝通れる扉**、残り2レーンは異色＝レーン移動。
                床に置けば LUMEN、天井に置けば UMBRA の判断になる。
                床と天井で別のレーンに置くと「左右で別々の判断」になる（契約§4.5）。
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
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.2, lane: -1, type: 'GAP' },
            { at: 22.4, lane: 1, type: 'LASER_LOW' }, { at: 29.6, lane: 0, type: 'ROVER' },
            { at: 36.8, lane: -1, type: 'GAP' }, { at: 44, lane: 1, type: 'ROVER' },
            { at: 51.2, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.4, lane: -1, type: 'GAP' }, { at: 29.6, lane: 1, type: 'ROVER' },
            { at: 36.8, lane: 0, type: 'LASER_LOW' }, { at: 44, lane: -1, type: 'GAP' },
            { at: 51.2, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's5_leap_b', zone: 'sea', lengthM: 60, difficulty: 4, minSpeed: 0, s5: 1, dense: 2, leap: 1, lift: 1,
    /* 浮上足場を跳び継ぎに混ぜる（沈んでいる足場は素通り＝読みの要素） */
    floor: [{ at: 8, lane: 0, type: 'ROVER' },
            { at: 15.2, lane: -1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 22.4, lane: 1, type: 'GAP' },
            { at: 29.6, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 36.8, lane: -1, type: 'ROVER' }, { at: 44, lane: 1, type: 'LASER_LOW' },
            { at: 51.2, lane: 0, type: 'GAP' }],
    ceil:  [{ at: 8, lane: 1, type: 'LASER_LOW' }, { at: 15.2, lane: 0, type: 'ROVER' },
            { at: 22.4, lane: -1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 29.6, lane: 1, type: 'GAP' }, { at: 36.8, lane: 0, type: 'LASER_LOW' },
            { at: 44, lane: -1, type: 'ROVER' }, { at: 51.2, lane: 1, type: 'GAP' }], events: [] },
  { id: 's5_leap_c', zone: 'sea', lengthM: 56, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'GAP' }, { at: 15.2, lane: 1, type: 'ROVER' },
            { at: 22.4, lane: -1, type: 'LASER_LOW' }, { at: 29.6, lane: 0, type: 'GAP' },
            { at: 36.8, lane: 1, type: 'ROVER' }, { at: 44, lane: -1, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.2, lane: 0, type: 'LASER_LOW' },
            { at: 22.4, lane: 1, type: 'ROVER' }, { at: 29.6, lane: -1, type: 'LASER_LOW' },
            { at: 36.8, lane: 0, type: 'GAP' }, { at: 44, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 浮上足場（rank3〜4） ---------------------------------------------
     到達時に浮いていれば ローバー相当（跳ぶ）、沈んでいれば通れる。
     ジャンプを要求するウォールの後は 9.2 基準m（0.92秒）空けてから横移動を要求する。 */
  { id: 's5_lift_a', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, lift: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 18, lane: 1, type: 'PILLAR' }, { at: 24, lane: -1, type: 'LASER_V' },
            { at: 30, lane: 0, type: 'PILLAR' },
            { at: 36, lane: -1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 46, lane: 1, type: 'PILLAR' }, { at: 52, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's5_lift_b', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, lift: 1, dense: 2,
    /* 到達時に沈んでいる足場＝そのまま走り抜ける（読み切れば動かなくてよい） */
    floor: [{ at: 8, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: false } } },
            { at: 14, lane: 1, type: 'PILLAR' }, { at: 20, lane: -1, type: 'LASER_V' },
            { at: 26, lane: 0, type: 'PILLAR' },
            { at: 36, lane: 1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 46, lane: -1, type: 'PILLAR' }, { at: 52, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 36, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's5_lift_duo', zone: 'sea', lengthM: 62, difficulty: 4, minSpeed: 0, s5: 1, lift: 1, dense: 2,
    /* 床と天井で別レーンの足場＝2体に別の譜面 */
    floor: [{ at: 8, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 18, lane: 1, type: 'PILLAR' }, { at: 24, lane: -1, type: 'LASER_V' },
            { at: 34, lane: 1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 44, lane: 0, type: 'PILLAR' }, { at: 50, lane: 1, type: 'LASER_V' },
            { at: 56, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 34, lane: -1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } }], events: [] },

  /* --- 色の扉（rank3〜4） -----------------------------------------------
     lane に書いたレーンだけが同色＝通れる。床に置けば LUMEN、天井に置けば UMBRA の判断。 */
  { id: 's5_door_f', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, door: 1, dense: 2,
    floor: [{ at: 8, lane: 1, type: 'DOOR' }, { at: 14, lane: 0, type: 'PILLAR' },
            { at: 20, lane: -1, type: 'LASER_V' }, { at: 26, lane: 1, type: 'PILLAR' },
            { at: 36, lane: 0, type: 'ROVER' }, { at: 46, lane: 1, type: 'LASER_V' },
            { at: 52, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 36, lane: -1, type: 'ROVER' }], events: [] },
  { id: 's5_door_c', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, door: 1, dense: 2,
    floor: [{ at: 14, lane: 0, type: 'PILLAR' }, { at: 20, lane: 1, type: 'LASER_V' },
            { at: 26, lane: -1, type: 'PILLAR' }, { at: 36, lane: 1, type: 'ROVER' },
            { at: 46, lane: 0, type: 'LASER_V' }, { at: 52, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'DOOR' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's5_door_duo', zone: 'sea', lengthM: 62, difficulty: 4, minSpeed: 0, s5: 1, door: 1, dense: 2,
    /* **床と天井で別のレーンの扉**＝左右で別々の判断（契約§4.5 の主題） */
    floor: [{ at: 8, lane: -1, type: 'DOOR' }, { at: 14, lane: 0, type: 'PILLAR' },
            { at: 20, lane: 1, type: 'LASER_V' }, { at: 30, lane: 1, type: 'DOOR' },
            { at: 36, lane: -1, type: 'PILLAR' }, { at: 42, lane: 0, type: 'LASER_V' },
            { at: 48, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'DOOR' }, { at: 30, lane: -1, type: 'DOOR' }], events: [] },
  { id: 's5_door_lift', zone: 'sea', lengthM: 64, difficulty: 4, minSpeed: 0, s5: 1, door: 1, lift: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 18, lane: 1, type: 'DOOR' }, { at: 24, lane: -1, type: 'PILLAR' },
            { at: 30, lane: 0, type: 'LASER_V' },
            { at: 40, lane: 1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 50, lane: -1, type: 'DOOR' }, { at: 56, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 18, lane: -1, type: 'DOOR' },
            { at: 40, lane: 0, type: 'ROVER' }, { at: 50, lane: 1, type: 'DOOR' }], events: [] },

  /* --- 海流ベルト（rank3〜4） -------------------------------------------
     ベルトは 1.0秒ごとに1レーンぶん流す。押し出しの直前 0.45秒にはウォールを置けない
     （Fair が弾く）ので、**押し出しと押し出しのちょうど中間** に壁を置く＝
     「流されてから 0.5秒で避ける」が譜面になる。 */
  { id: 's5_cur_a', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, cur: 1, dense: 1,
    /* 床は右へ、天井は左へ流れる＝2体が逆向きに逆らう */
    floor: [{ at: 8, lane: 0, type: 'CURRENT', params: { cur: { dir: 1, cdir: -1, n: 3 } } },
            { at: 18, lane: 0, type: 'PILLAR' }, { at: 28, lane: 1, type: 'PILLAR' },
            { at: 38, lane: -1, type: 'LASER_V' }, { at: 44, lane: 0, type: 'PILLAR' },
            { at: 50, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_cur_b', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, cur: 1, dense: 1,
    /* 床も天井も同じ向き（2人とも同じ側へ寄せられる） */
    floor: [{ at: 8, lane: 0, type: 'CURRENT', params: { cur: { dir: -1, cdir: -1, n: 3 } } },
            { at: 18, lane: 1, type: 'LASER_V' }, { at: 28, lane: 0, type: 'PILLAR' },
            { at: 38, lane: -1, type: 'LASER_V' }, { at: 44, lane: 1, type: 'PILLAR' },
            { at: 50, lane: 0, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_cur_door', zone: 'sea', lengthM: 66, difficulty: 4, minSpeed: 0, s5: 1, cur: 1, door: 1, dense: 2,
    /* 流された先に色の扉＝「流れに逆らって自分の色へ入る」 */
    floor: [{ at: 6, lane: 0, type: 'CURRENT', params: { cur: { dir: 1, cdir: -1, n: 3 } } },
            { at: 16, lane: 0, type: 'PILLAR' }, { at: 26, lane: -1, type: 'PILLAR' },
            { at: 36, lane: 1, type: 'LASER_V' }, { at: 46, lane: -1, type: 'DOOR' },
            { at: 52, lane: 0, type: 'PILLAR' }, { at: 58, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 46, lane: 1, type: 'DOOR' }], events: [] },
  { id: 's5_cur_lift', zone: 'sea', lengthM: 68, difficulty: 4, minSpeed: 0, s5: 1, cur: 1, lift: 1, dense: 2,
    floor: [{ at: 6, lane: 0, type: 'CURRENT', params: { cur: { dir: -1, cdir: 1, n: 3 } } },
            { at: 16, lane: 0, type: 'PILLAR' }, { at: 26, lane: 1, type: 'PILLAR' },
            { at: 36, lane: -1, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 46, lane: 0, type: 'PILLAR' }, { at: 52, lane: 1, type: 'LASER_V' },
            { at: 58, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 36, lane: 1, type: 'ROVER' }], events: [] },

  /* --- 深海の最奥（rank4・最も密）と、壁の穴・つなぎ -------------------- */
  { id: 's5_gauntlet', zone: 'sea', lengthM: 68, difficulty: 4, minSpeed: 0, s5: 1, door: 1, lift: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 14, lane: 1, type: 'LASER_V' },
            { at: 20, lane: -1, type: 'PILLAR' }, { at: 26, lane: 0, type: 'DOOR' },
            { at: 32, lane: 1, type: 'LASER_V' }, { at: 38, lane: -1, type: 'PILLAR' },
            { at: 48, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
            { at: 58, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 26, lane: -1, type: 'DOOR' }, { at: 48, lane: -1, type: 'ROVER' }], events: [] },
  /* 最奥の縫い（rank4・0.5秒おき＝§4.7 反応窓 0.45秒の下限ぎりぎり）。
     ランク4は進行率50%から出るので、ここが「後半ほど濃い」を作る主役になる。 */
  { id: 's5_weave_x', zone: 'sea', lengthM: 58, difficulty: 4, minSpeed: 0, s5: 1, dense: 2,
    floor: [{ at: 8, lane: 0, type: 'PILLAR' }, { at: 13, lane: 1, type: 'LASER_V' },
            { at: 18, lane: -1, type: 'PILLAR' }, { at: 23, lane: 0, type: 'LASER_V' },
            { at: 28, lane: 1, type: 'PILLAR' }, { at: 33, lane: -1, type: 'LASER_V' },
            { at: 38, lane: 0, type: 'PILLAR' }, { at: 43, lane: 1, type: 'LASER_V' }],
    ceil: [], events: [] },
  { id: 's5_door_x', zone: 'sea', lengthM: 60, difficulty: 4, minSpeed: 0, s5: 1, door: 1, dense: 2,
    floor: [{ at: 8, lane: 1, type: 'DOOR' }, { at: 13, lane: 0, type: 'PILLAR' },
            { at: 18, lane: -1, type: 'LASER_V' }, { at: 23, lane: 1, type: 'PILLAR' },
            { at: 28, lane: -1, type: 'DOOR' }, { at: 33, lane: 0, type: 'LASER_V' },
            { at: 38, lane: 1, type: 'PILLAR' }, { at: 43, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: -1, type: 'DOOR' }, { at: 28, lane: 1, type: 'DOOR' }], events: [] },
  { id: 's5_wallhole', zone: 'sea', lengthM: 60, difficulty: 3, minSpeed: 0, s5: 1, wallhole: 1, dense: 1,
    floor: [{ at: 10, lane: 1, type: 'WALLHOLE' }, { at: 20, lane: 0, type: 'PILLAR' },
            { at: 26, lane: -1, type: 'LASER_V' }, { at: 36, lane: 1, type: 'ROVER' },
            { at: 46, lane: 0, type: 'PILLAR' }, { at: 52, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: -1, type: 'ROVER' }, { at: 36, lane: 0, type: 'ROVER' }], events: [] },
  { id: 's5_fill_a', zone: 'sea', lengthM: 26, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, fill: 1,
    floor: [{ at: 5, lane: 0, type: 'PILLAR' }, { at: 11, lane: 1, type: 'LASER_V' },
            { at: 17, lane: -1, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 's5_fill_b', zone: 'sea', lengthM: 30, difficulty: 3, minSpeed: 0, s5: 1, dense: 2, fill: 1, lift: 1,
    floor: [{ at: 5, lane: 0, type: 'LIFTPAD', params: { lift: { upAtArrival: true } } },
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
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'GAP' },
            { at: 25.1, lane: 0, type: 'PILLAR' }, { at: 29.9, lane: 1, type: 'LASER_V' },
            { at: 34.7, lane: -1, type: 'PILLAR' },
            { at: 39.5, lane: 0, type: 'ROVER' }, { at: 46.9, lane: 1, type: 'LASER_LOW' },
            { at: 56.6, lane: -1, type: 'PILLAR' }, { at: 61.4, lane: 0, type: 'LASER_V' },
            { at: 66.2, lane: 1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'LASER_LOW' },
            { at: 39.5, lane: -1, type: 'ROVER' }, { at: 46.9, lane: 0, type: 'GAP' }], events: [] },
  { id: 's6_mix_b', zone: 'space', lengthM: 74, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, leap: 1, moving: 1,
    floor: [{ at: 8, lane: 1, type: 'LASER_LOW' }, { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 25.1, lane: -1, type: 'LASER_V' },
            { at: 29.9, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: 0, phase: 0.5 } } },
            { at: 34.7, lane: 1, type: 'PILLAR' },
            { at: 39.5, lane: -1, type: 'GAP' }, { at: 46.9, lane: 0, type: 'ROVER' },
            { at: 56.6, lane: 1, type: 'PILLAR' }, { at: 61.4, lane: -1, type: 'LASER_V' },
            { at: 66.2, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'GAP' },
            { at: 39.5, lane: 0, type: 'ROVER' }, { at: 46.9, lane: -1, type: 'LASER_LOW' }], events: [] },
  { id: 's6_mix_c', zone: 'space', lengthM: 74, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, net: 1,
    /* 横ビーム（床寄り＝LUMEN が跳ぶ／天井寄り＝UMBRA が跳ぶ）を跳の枠に混ぜる */
    floor: [{ at: 8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 25.1, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 1 } } },
            { at: 29.9, lane: 1, type: 'PILLAR' },
            { at: 34.7, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 39.5, lane: -1, type: 'GAP' }, { at: 46.9, lane: 1, type: 'ROVER' },
            { at: 56.6, lane: 0, type: 'LASER_V' }, { at: 61.4, lane: -1, type: 'PILLAR' },
            { at: 66.2, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 0, c0: -1 } } }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'LASER_LOW' },
            { at: 39.5, lane: 0, type: 'ROVER' }, { at: 46.9, lane: -1, type: 'GAP' }], events: [] },
  { id: 's6_mix_d', zone: 'space', lengthM: 76, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, net: 1, moving: 1,
    floor: [{ at: 8, lane: 0, type: 'GAP' }, { at: 15.4, lane: 1, type: 'ROVER' },
            { at: 25.1, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 29.9, lane: -1, type: 'PILLAR' },
            { at: 34.7, lane: 0, type: 'LASER_SCAN', params: { scan: { from: -1, to: 0, phase: 0.5 } } },
            { at: 39.5, lane: 1, type: 'ROVER' }, { at: 46.9, lane: 0, type: 'GAP' },
            { at: 56.6, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 0 } } },
            { at: 61.4, lane: 1, type: 'LASER_V' }, { at: 66.2, lane: -1, type: 'PILLAR' }],
    ceil:  [{ at: 8, lane: -1, type: 'LASER_LOW' }, { at: 15.4, lane: 0, type: 'ROVER' },
            { at: 39.5, lane: 1, type: 'GAP' }, { at: 46.9, lane: -1, type: 'ROVER' }], events: [] },

  /* 跳2・レーン2（ジャンプ比率 50%。§4.3 の比率を引き上げる役） */
  { id: 's6_mix_e', zone: 'space', lengthM: 66, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, leap: 1,
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'LASER_LOW' },
            { at: 25.1, lane: 0, type: 'PILLAR' }, { at: 29.9, lane: -1, type: 'LASER_V' },
            { at: 34.7, lane: 1, type: 'GAP' }, { at: 42.1, lane: 0, type: 'ROVER' },
            { at: 51.8, lane: -1, type: 'PILLAR' }, { at: 56.6, lane: 0, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'GAP' },
            { at: 34.7, lane: 1, type: 'ROVER' }, { at: 42.1, lane: -1, type: 'LASER_LOW' }], events: [] },
  { id: 's6_mix_f', zone: 'space', lengthM: 68, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, wallhole: 1,
    /* 壁の穴（唯一のスライディング要素）を1つだけ混ぜる。契約§4.3「1チャンクに最大1」 */
    floor: [{ at: 8, lane: 0, type: 'WALLHOLE' }, { at: 17.7, lane: 1, type: 'PILLAR' },
            { at: 22.5, lane: -1, type: 'LASER_V' }, { at: 27.3, lane: 0, type: 'ROVER' },
            { at: 34.7, lane: 1, type: 'GAP' }, { at: 44.4, lane: -1, type: 'PILLAR' },
            { at: 49.2, lane: 0, type: 'LASER_V' }, { at: 54, lane: 1, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 27.3, lane: -1, type: 'ROVER' },
            { at: 34.7, lane: 0, type: 'LASER_LOW' }, { at: 54, lane: -1, type: 'GAP' }], events: [] },

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
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'GAP' },
            { at: 22.8, lane: 1, type: 'LASER_LOW' }, { at: 30.2, lane: 0, type: 'ROVER' },
            { at: 37.6, lane: -1, type: 'GAP' }, { at: 45, lane: 1, type: 'ROVER' },
            { at: 52.4, lane: 0, type: 'LASER_LOW' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'LASER_LOW' },
            { at: 22.8, lane: -1, type: 'GAP' }, { at: 30.2, lane: 1, type: 'ROVER' },
            { at: 37.6, lane: 0, type: 'LASER_LOW' }, { at: 45, lane: -1, type: 'GAP' },
            { at: 52.4, lane: 1, type: 'ROVER' }], events: [] },
  { id: 's6_leap_b', zone: 'space', lengthM: 62, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, leap: 1, net: 1,
    /* 跳び継ぎに横ビームを混ぜる（床寄り＝LUMEN が跳ぶ／天井寄り＝UMBRA が跳ぶ） */
    floor: [{ at: 8, lane: -1, type: 'LASER_H', params: { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } } },
            { at: 15.4, lane: 0, type: 'ROVER' }, { at: 22.8, lane: 1, type: 'LASER_LOW' },
            { at: 30.2, lane: -1, type: 'GAP' }, { at: 37.6, lane: 0, type: 'ROVER' },
            { at: 45, lane: 1, type: 'ROVER' }, { at: 52.4, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 8, lane: 1, type: 'ROVER' }, { at: 15.4, lane: -1, type: 'GAP' },
            { at: 22.8, lane: 0, type: 'ROVER' }, { at: 30.2, lane: 1, type: 'LASER_LOW' },
            { at: 37.6, lane: -1, type: 'GAP' },
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
    ceil:  [{ at: 36.8, lane: -1, type: 'ROVER' }, { at: 44.2, lane: 0, type: 'GAP' }], events: [] },

  /* --- 無重力ジャンプ（契約§4.5「滞空1.5倍」。区間内は跳びの間合いが伸びる） */
  { id: 's6_zero_a', zone: 'space', lengthM: 78, difficulty: 4, minSpeed: 0, s6: 1, dense: 2, zero: 1,
    floor: [{ at: 6, lane: 0, type: 'ZEROG', params: { zero: { n: 4.0 } } },
            { at: 10, lane: 0, type: 'ROVER' }, { at: 20.3, lane: -1, type: 'ROVER' },
            { at: 32.9, lane: 0, type: 'PILLAR' }, { at: 37.7, lane: 1, type: 'LASER_V' },
            { at: 42.5, lane: -1, type: 'PILLAR' }, { at: 47.3, lane: 0, type: 'ROVER' },
            { at: 54.7, lane: 1, type: 'ROVER' }, { at: 64.4, lane: 0, type: 'PILLAR' },
            { at: 69.2, lane: -1, type: 'LASER_V' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 20.3, lane: 0, type: 'LASER_LOW' },
            { at: 47.3, lane: -1, type: 'ROVER' }, { at: 54.7, lane: 0, type: 'GAP' }], events: [] },
  { id: 's6_zero_b', zone: 'space', lengthM: 84, difficulty: 5, minSpeed: 0, s6: 1, dense: 2, zero: 1, leap: 1,
    floor: [{ at: 4, lane: 0, type: 'ZEROG', params: { zero: { n: 4.6 } } },
            { at: 10, lane: 0, type: 'ROVER' }, { at: 20.3, lane: 1, type: 'ROVER' },
            { at: 30.6, lane: -1, type: 'GAP' }, { at: 43.2, lane: 0, type: 'PILLAR' },
            { at: 48, lane: 1, type: 'LASER_V' }, { at: 52.8, lane: -1, type: 'PILLAR' },
            { at: 57.6, lane: 0, type: 'ROVER' }, { at: 65, lane: 1, type: 'LASER_LOW' },
            { at: 74.7, lane: 0, type: 'PILLAR' }],
    ceil:  [{ at: 10, lane: 1, type: 'ROVER' }, { at: 20.3, lane: 0, type: 'LASER_LOW' },
            { at: 30.6, lane: 1, type: 'ROVER' }, { at: 57.6, lane: -1, type: 'GAP' },
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
            { at: 16.6, lane: 0, type: 'ROVER' }, { at: 24, lane: -1, type: 'GAP' },
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
    floor: [{ at: 8, lane: 0, type: 'ROVER' }, { at: 15.4, lane: 1, type: 'GAP' },
            { at: 25.1, lane: 0, type: 'PILLAR' },
            { at: 29.9, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: 1, c0: -1 } } },
            { at: 34.7, lane: -1, type: 'LASER_V' },
            { at: 39.5, lane: 0, type: 'LASER_SCAN', params: { scan: { from: 1, to: -1, phase: 0.5 } } },
            { at: 44.3, lane: 0, type: 'LASER_DIAG', params: { diag: { f0: -1, c0: 0 } } },
            { at: 49.1, lane: 1, type: 'ROVER' }, { at: 56.5, lane: -1, type: 'LASER_LOW' },
            { at: 66.2, lane: 0, type: 'PILLAR' }, { at: 71, lane: 1, type: 'LASER_V' }],
    ceil:  [{ at: 8, lane: -1, type: 'ROVER' }, { at: 15.4, lane: 0, type: 'LASER_LOW' },
            { at: 49.1, lane: 0, type: 'ROVER' }, { at: 56.5, lane: 1, type: 'GAP' }], events: [] },
  { id: 's6_wallhole', zone: 'space', lengthM: 66, difficulty: 4, minSpeed: 0, s6: 1, wallhole: 1, dense: 1,
    floor: [{ at: 10, lane: 1, type: 'WALLHOLE' }, { at: 19.7, lane: 0, type: 'PILLAR' },
            { at: 24.5, lane: -1, type: 'LASER_V' }, { at: 29.3, lane: 1, type: 'PILLAR' },
            { at: 34.1, lane: 0, type: 'ROVER' }, { at: 41.5, lane: -1, type: 'GAP' },
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
    ceil: [], events: [] }
];

/* ---------------------------------------------------------------- 導入区間（S1）
   契約 §4.4「基本障害物を1種ずつ順に紹介」/ §4.8 チュートリアル。
   ・位置は**実寸 m**（速度で伸縮させない）。1つずつ 33m 間隔で出す＝16m/s で約2秒おき。
   ・tip は障害物の 30m 手前（約1.9秒前）に出す DOM オーバーレイの合図。
   ・まず片側だけ（床→天井）→ 横に避ける → 穴 → 光線 → ワイド梁 → 最後に両側同時。 */
const INTRO_S1 = [
  { at: 60,  tip: 'jump_l', floor: [{ lane: 0, type: 'ROVER' }] },
  { at: 93,  tip: 'jump_r', ceil:  [{ lane: 0, type: 'ROVER' }] },
  { at: 126, tip: 'lane',   floor: [{ lane: 1, type: 'PILLAR' }] },          // both（2体ともレーン移動）
  { at: 159, tip: 'gap',    floor: [{ lane: -1, type: 'GAP' }] },
  { at: 192, tip: 'laser',  ceil:  [{ lane: 0, type: 'LASER_LOW' }] },
  { at: 225, tip: 'wide',   floor: [{ lane: -1, type: 'WIDEBAR' }] },
  { at: 262, tip: 'both',   floor: [{ lane: 0, type: 'ROVER' }], ceil: [{ lane: 1, type: 'ROVER' }] }
];

const CHUNK_BY_ID = {};
CHUNK_DEFS.forEach((c) => { CHUNK_BY_ID[c.id] = c; });

/* ---------------------------------------------------------------- ステージ定義 */
const STAGE_DEFS = {
  /* P1の仮ステージ（無地のコリドー・ゾーン装飾なし） */
  S0: {
    id: 'S0', name: '仮ステージ S0', zone: 'neon', lengthM: 900,
    speedFrom: 16, speedTo: 20, maxRank: 3, setpiece: null, density: [3, 5],
    chunkPool: CHUNK_DEFS.filter((c) => !c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id)
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
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2 && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id)
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
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id))     // 動くレーザーを厚く
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6 && c.difficulty <= 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id))      // 密集チャンク
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id))
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
    tipOnce: { sync: 'sync', drop: 'dropceil' },
    /* 顔ぶれ: S4 の新チャンクを主役に、S3 で覚えた遺跡の形（崩れる橋・振り子・列柱）を混ぜる */
    chunkPool: CHUNK_DEFS.filter((c) => c.s4).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.sync).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.sync).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s4 && c.drop).map((c) => c.id))
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
    tipOnce: { cur: 'current', lift: 'liftpad', door: 'colordoor' },
    /* 顔ぶれ: S5 の新チャンクが主役。基本形（柱・光線・跳び継ぎ）は深海スキンで顔が変わる。
       他ゾーン専用のギミック（崩れる橋・同時スイッチ・落ちる天井）は混ぜない（契約§4.4）。 */
    /* 跳び継ぎ（leap）を厚く入れて §4.3 の比率（レーン50%前後／ジャンプ35%前後）に寄せる。
       深海の顔ぶれは both 型（岩柱・放電柱・触手）が主役でレーン移動に偏るため。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.s5).map((c) => c.id)
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.dense === 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.cur).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.cur).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.door).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.s5 && c.lift).map((c) => c.id))
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
    ratioPull: 9,
    mix: { lane: 0.49, jump: 0.47, slide: 0.04 },
    /* 新ギミック（重力反転・無重力・レーザーネット）を1回の走行で必ず顔出しさせる */
    tipBoost: true,
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
  endless: {
    id: 'endless', name: 'エンドレス', zone: 'neon', lengthM: Infinity,
    speedFrom: 16, speedTo: 44, maxRank: 2, setpiece: null, density: [3, 14],
    /* 最初から入っているのは S1 の顔ぶれ（基本セット）だけ。
       遺跡の新ギミックは S3 をクリアして初めて混ざる（ENDLESS_UNLOCK / 契約§4.4） */
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2 && !c.moving && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id)
  }
};

/* エンドレスは「クリア済みゾーンのチャンクを混ぜて無限生成」（契約§4.4）。
   ステージをクリアすると、そのステージが持ち込んだ顔ぶれがプールに加わる。 */
const ENDLESS_UNLOCK = {
  S1: [],                                      // S1 の顔ぶれ＝最初から入っている基本セット
  S2: CHUNK_DEFS.filter((c) => (c.moving || c.wallhole || c.dense) && !c.s3 && !c.s4 && !c.s5 && !c.s6).map((c) => c.id),
  S3: CHUNK_DEFS.filter((c) => c.s3).map((c) => c.id),       // 崩れる橋・振り子の刃
  S4: CHUNK_DEFS.filter((c) => c.s4).map((c) => c.id),       // 同時スイッチ・落ちる天井
  S5: CHUNK_DEFS.filter((c) => c.s5).map((c) => c.id),       // 海流ベルト・浮上足場・色の扉
  S6: CHUNK_DEFS.filter((c) => c.s6).map((c) => c.id)        // 重力反転・無重力・レーザーネット
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
      Object.keys(OBS).forEach((k) => { Fair._maxDepth = Math.max(Fair._maxDepth, OBS[k].depth); });
    }
    return Fair._maxDepth;
  },

  /* ウォールに束ねる（**要求のないウォールも残した全部**）。
     「跳躍帯を塞ぐだけの帯」（レーザーネットの横ビームが中央に来た場合など）は
     demand が付かないので walls() から落ちる。それを検査するためにここを分けている。 */
  wallsAll(list, speedAt) {
    /* **当たり判定を持たない実体（ghost）はウォールに数えない**。
       海流の帯・色の扉（同色）・ワープのゲート・無重力の粒子・ネットの枠は
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
    out.forEach((w) => {
      w.demand = {};
      Fair.SIDES.forEach((s) => {
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
  walls(list, speedAt) {
    return Fair.wallsAll(list, speedAt).filter((w) => w.demand.floor || w.demand.ceil);
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
    const all = Fair.wallsAll(list, speedAt);
    const walls = all.filter((w) => w.demand.floor || w.demand.ceil);

    /* **跳躍帯を塞ぐだけの帯を作らない**（契約§4.5 レーザーネットの「中央」/ P4b）。
       何も要求しない（走れば通れる）のに、跳んだ体だけが当たる帯は
       「隣のウォールのために跳んだ人」を理不尽に殺す。
       走れて かつ 跳べるレーンが1つも無いウォールを違反とする。 */
    all.forEach((w) => {
      Fair.SIDES.forEach((side) => {
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
      const rb = (opt.reactBoth === undefined) ? CFG.FAIR.REACT_BOTH : opt.reactBoth;
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

    /* 海流ベルト（契約§4.5 / S5）: **押し出しの直前にウォールを置かない**。
       流されてから避けるまでに、少なくとも反応窓ぶんの余白が要る。 */
    if (opt.currents && opt.currents.length) {
      Fair.SIDES.forEach((side) => {
        walls.forEach((w) => {
          if (!w.demand[side]) return;
          const sp = speedAt(w.at);
          if (Current.pushNear(opt.currents, side, w.at, sp * CFG.CURRENT.SAFE_T)) {
            errs.push('海流の押し出しがウォール直前(' + side + ') @' + w.at.toFixed(1) +
                      '（' + CFG.CURRENT.SAFE_T + '秒の余白が要る）');
          }
        });
      });
    }

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
        /* 前のウォールを「通り抜けきる」までは横に動けない（動くと真横の障害物に刺さる）。
           その通過距離を引いた残りで何レーンぶん動けるかを数える。 */
        const passM = Fair.maxDepth() + Math.max(CFG.BODY_D, CFG.SLIDE_D);
        const usable = Math.max(0, (w.at - prevAt) - passM);
        const steps = Math.floor(usable / (sp * CFG.LANE_T));
        /* 海流で流された分を織り込む（契約§4.5「ボット・Fair は流れ込みで評価」）。
           押し出しは決定論的なので、前のウォールの生存レーンから
           **押された先** を起点にして、そこから steps 回だけ動ける、と数える。
           逆らう横入力で戻すのも同じ「1回の移動」なので steps を分け合う。 */
        const drift = opt.currents
          ? Current.driftBetween(opt.currents, side, prevAt, w.at) : 0;
        if (drift) reach = reach.map((l) => U.clamp(l + drift, -1, 1));
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

  /* 必須動作の集計（契約§4.3 の動作比率。ウォール×面ごとに1動作と数える） */
  countDemands(list, speedAt) {
    const res = { lane: 0, jump: 0, slide: 0, total: 0 };
    Fair.walls(list, speedAt).forEach((w) => {
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
  /* 浮上足場（S5）も同じ仕組みに乗せる＝「浮上→沈むの1周期の秒数」が速度によらず一定 */
  lift:   { key: 'periodM', def() { return CFG.LIFT.PERIOD; } },
  /* レーザーネット（S6）の横ビーム・斜めビームも同じ（1往復の秒数が一定） */
  hbeam:  { key: 'periodM', def() { return CFG.NET.PERIOD; } },
  diag:   { key: 'periodM', def() { return CFG.NET.PERIOD; } }
};
/* 崩れる橋は必ず bridge パラメータを、浮上足場は必ず lift パラメータを持つ。
   書き忘れても生成時に既定値が入るようにしておく（＝位相の規則が常に効く）。 */
function normParams(type, p) {
  if (type === 'BRIDGE') return (p && p.bridge) ? p : Object.assign({}, p || {}, { bridge: {} });
  if (type === 'LIFTPAD') return (p && p.lift) ? p : Object.assign({}, p || {}, { lift: {} });
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
  /* 色の扉（契約§4.5 / S5）: lane に書いたレーンだけが **同色＝通れる扉**、
     残りの2レーンは異色の扉になる（＝そのレーンへ移らないと抜けられない）。
     壁の穴と同じ「1エントリ＝全幅に展開」の流儀。 */
  if (e.type === 'DOOR') {
    CFG.LANES.forEach((l) => {
      items.push(Obstacles.make(l === e.lane ? 'DOOR' : 'DOORX', surface, l, at, nowDist, params));
    });
    return;
  }
  if (e.type === 'CURRENT') {
    Current.expand(items, e, surface, at, nowDist, scale, sink && sink.currents);
    return;
  }
  if (e.type === 'SYNCSW') { Sync.expand(items, e, surface, at, nowDist, scale, sink && sink.syncs); return; }
  /* 無重力区間（契約§4.5 / S6）: 区間の中で踏み切ったジャンプの滞空が 1.5倍になる */
  if (e.type === 'ZEROG') { Zero.expand(items, e, surface, at, nowDist, scale, sink && sink.zeros); return; }
  /* 重力反転ワープ（契約§4.5 / S6）: 入口と戻りの2枚のゲート。通るたびに面が入れ替わる */
  if (e.type === 'GRAVWARP') { Warp.expand(items, e, surface, at, nowDist, scale, sink && sink.warps); return; }
  if (e.type === 'DROPCEIL') {
    /* 落ちる天井の時刻規則（予告→落下→着地）は「その地点の1秒ぶんの距離」で持つ */
    const unit = CFG.REF_SPEED * (scale === undefined ? 1 : scale);
    items.push(Obstacles.make(e.type, surface, e.lane, at, nowDist,
                              Object.assign({}, params || {}, { drop: { unitM: unit } })));
    return;
  }
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
  let setpieceDone = false;     // 終盤の大演出を置いたか
  const spStart = (stage.setpiece && Setpieces.DEFS[stage.setpiece])
    ? stage.lengthM - Setpieces.DEFS[stage.setpiece].lengthM : Infinity;
  const out = [];               // 生成済み障害物（at 昇順）
  const syncs = [];             // 同時スイッチのグループ（Sync が 0.3秒窓を判定する / P3b）
  const currents = [];          // 海流ベルトの区間（Current が押し出しを判定する / P4a）
  const zeros = [];             // 無重力の区間（Zero が滞空倍率を出す / P4b）
  const warps = [];             // 重力反転ワープの組（Warp が面の入れ替えを判定する / P4b）
  const sink = { syncs: syncs, currents: currents, zeros: zeros, warps: warps };
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
    const p = progress(m);
    const lo = stage.minRank || 1;
    return U.clamp(lo + Math.floor(p * (stage.maxRank - lo + 1)), lo, stage.maxRank);
  }
  function candidates(m) {
    const rank = maxRankAt(m);
    const sp = stage.speedAt(m);
    const pool = stage.chunkPool.map((id) => CHUNK_BY_ID[id]).filter(Boolean);
    let c = pool.filter((d) => d.difficulty <= rank && sp >= (d.minSpeed || 0));
    /* 壁の穴（唯一のスライディング要素）は連続させない（契約§4.3） */
    if (lastWallhole) {
      const c2 = c.filter((d) => !d.wallhole);
      if (c2.length) c = c2;
    }
    if (!c.length) c = pool.filter((d) => d.difficulty === 1);
    return c;
  }

  /* これまでに置いた必須動作の内訳（比率の是正に使う）。
     終盤の大演出ぶんは最初から数に入れておく＝ランダム区間がその偏りを打ち消す。 */
  const got = { lane: 0, jump: 0, slide: 0, total: 0 };
  const placed = { total: 0 };          // ランダム区間だけの実測（密度の制御に使う）
  if (stage.setpiece && Setpieces.DEFS[stage.setpiece]) {
    const sp0 = Setpieces.build(stage.setpiece, spStart, 0, stage.speedAt(spStart) / CFG.REF_SPEED, null);
    if (sp0) { seedMix = Fair.countDemands(sp0.items, stage.speedAt);
               got.lane += seedMix.lane; got.jump += seedMix.jump; got.slide += seedMix.slide; got.total += seedMix.total; }
  }
  function noteDemands(items) {
    const c = Fair.countDemands(items, stage.speedAt);
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
    const covered = Math.max(lastItemAt - CFG.LEAD_IN, 60);
    const real = placed.total / covered * 100;
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
      if (stage.tipOnce && stage.tipBoost) {
        const ks = Object.keys(stage.tipOnce);
        for (let k = 0; k < ks.length; k++) {
          if (cands[i][ks[k]] && !tipDone[ks[k]]) { wt *= 3; break; }
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
  /* 置けるかどうか分からないうちは、同時スイッチ・海流ベルトの「区間」を
     本物の入れ物へ入れない（試し置きの残骸が走行中に効いてしまう）。
     ＝ 各試行はその場限りの local に積み、§4.7 を満たした時だけ移す。 */
  function instantiate(def, startM, nowDist) {
    const scale = stage.speedAt(startM) / CFG.REF_SPEED;
    const items = [];
    const local = { syncs: [], currents: [], zeros: [], warps: [] };
    (def.floor || []).forEach((e) => put(items, e, 'floor', startM + e.at * scale, nowDist, scale, local));
    (def.ceil || []).forEach((e) => put(items, e, 'ceil', startM + e.at * scale, nowDist, scale, local));
    items.sort((a, b) => a.at - b.at);
    const evs = (def.events || []).map((e) => ({ at: startM + e.at * scale, type: e.type, params: e.params || null, done: false }));
    return { items: items, events: evs, lengthM: def.lengthM * scale, startM: startM, id: def.id, local: local };
  }
  /* 試行が通った時だけ、区間を本物の入れ物へ移す */
  function commit(inst) {
    if (!inst.local) return;
    inst.local.syncs.forEach((g) => syncs.push(g));
    inst.local.currents.forEach((c) => currents.push(c));
    inst.local.zeros.forEach((z) => zeros.push(z));
    inst.local.warps.forEach((wp) => warps.push(wp));
    inst.local = null;
  }

  /* 直近に置いた障害物の位置（継ぎ目＝この後ろに speed*0.6秒 以内で次を置く） */
  let lastItemAt = -1e9;
  function noteItems(items) {
    for (let i = 0; i < items.length; i++) if (items[i].at > lastItemAt) lastItemAt = items[i].at;
  }

  /* 導入区間（実寸・固定） */
  function appendIntro(nowDist) {
    const it = stage.intro[introPtr++];
    const items = [];
    (it.floor || []).forEach((e) => put(items, e, 'floor', it.at, nowDist));
    (it.ceil || []).forEach((e) => put(items, e, 'ceil', it.at, nowDist));
    items.sort((a, b) => a.at - b.at);
    items.forEach((o) => out.push(o));
    noteItems(items);
    if (it.tip) events.push({ at: Math.max(2, it.at - 30), type: 'tip', params: { id: it.tip }, done: false });
    log.push({ id: 'intro:' + it.tip, startM: it.at - 8, lengthM: 16, intro: true });
    cursor = it.at + ((introPtr < stage.intro.length) ? 8 : 40);
    return true;
  }

  /* 終盤の大演出（実寸・固定。§4.7 は通常どおり検査する） */
  function appendSetpiece(nowDist) {
    if (setpieceDone) return false;             // 二度置かない（置いたら二度と戻らない）
    const inst = Setpieces.build(stage.setpiece, spStart, nowDist, stage.speedAt(spStart) / CFG.REF_SPEED, sink);
    if (!inst) { setpieceDone = true; return false; }
    const tail = out.slice(-8);
    const errs = Fair.validate(tail.concat(inst.items), stage.speedAt,
                               { startLanes: 'any', reactBoth: stage.reactBoth, currents: currents,
                                 zeros: zeros, warps: warps });
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

  function appendOne(nowDist) {
    if (stage.intro && introPtr < stage.intro.length) return appendIntro(nowDist);
    if (!setpieceDone && cursor >= spStart) return appendSetpiece(nowDist);
    let cands = candidates(cursor);
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
        log.push({ id: '(pre-setpiece)', startM: cursor, lengthM: spStart - cursor });
        cursor = spStart;
        return appendSetpiece(nowDist);
      }
      /* **継ぎ目を詰める**（契約§4.7 密度）: チャンクの「最初の障害物」が
         直前の障害物から seam（= speed*0.6秒）だけ後ろに来るように起点を決める。
         そこから §4.7 を満たすまで少しずつ後ろへずらす。 */
      /* 継ぎ目は「このチャンクを置いたときに密度の目安どおりになる長さ」。
         詰めすぎても §4.7 の反応窓で弾かれるので、下限は speed*0.2秒 で切る。 */
      const need = st.demands / Math.max(wantDensity(cursor), 0.5) * 100 - st.span * scale;
      const gap = U.clamp(need, stage.speedAt(cursor) * 0.18, seam);
      const wantFirst = (lastItemAt > -1e9) ? (lastItemAt + gap) : (cursor + st.firstAt * scale);
      for (let pad = 0; pad <= 40; pad += 3) {
        const startM = Math.max(cursor - st.firstAt * scale, wantFirst + pad - st.firstAt * scale);
        const inst = instantiate(def, startM, nowDist);
        const errs = Fair.validate(tail.concat(inst.items), stage.speedAt,
                                   { startLanes: 'any', reactBoth: stage.reactBoth,
                                     currents: currents.concat(inst.local.currents),
                                     zeros: zeros.concat(inst.local.zeros),
                                     warps: warps.concat(inst.local.warps) });
        if (!errs.length) {
          commit(inst);
          inst.items.forEach((o) => out.push(o));
          noteItems(inst.items);
          noteDemands(inst.items);
          inst.events.forEach((e) => events.push(e));
          /* 新ギミックの初出に短い指示（契約§4.8）。最初の障害物の 1.8秒手前に出す */
          if (stage.tipOnce) {
            Object.keys(stage.tipOnce).forEach((flag) => {
              if (!def[flag] || tipDone[flag]) return;
              tipDone[flag] = true;
              const firstAt = inst.startM + st.firstAt * scale;
              events.push({ at: Math.max(2, firstAt - stage.speedAt(firstAt) * 1.8),
                            type: 'tip', params: { id: stage.tipOnce[flag] }, done: false });
            });
          }
          log.push({ id: inst.id, startM: inst.startM, lengthM: inst.lengthM,
                     firstAt: inst.startM + st.firstAt * scale, lastAt: inst.startM + st.lastAt * scale });
          cursor = Math.max(cursor, inst.startM + st.lastAt * scale);
          lastWallhole = !!def.wallhole;
          return true;
        }
      }
    }
    /* どうしても入らない時は空白を置いて先へ（“理不尽な配置”より空白を選ぶ） */
    cursor += 40;
    log.push({ id: '(blank)', startM: cursor - 40, lengthM: 40 });
    lastItemAt = Math.max(lastItemAt, cursor - 6);
    lastWallhole = false;
    return false;
  }

  return {
    stage: stage,
    seed: seed,
    get cursor() { return cursor; },
    obstacles: out,
    syncs: syncs,
    currents: currents,
    zeros: zeros,
    warps: warps,
    events: events,
    log: log,
    /* untilM まで生成しておく。nowDist は視認距離の記録用 */
    ensure(untilM, nowDist) {
      let guard = 0;
      while (cursor < untilM && guard++ < 200) appendOne(nowDist === undefined ? Math.max(0, untilM - CFG.SPAWN_AHEAD) : nowDist);
    }
  };
}
