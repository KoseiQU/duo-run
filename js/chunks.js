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
    ceil:  [{ at: 23, lane: 1, type: 'ROVER' }, { at: 34, lane: -1, type: 'GAP' }], events: [] }
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
    chunkPool: CHUNK_DEFS.filter((c) => !c.moving && !c.s3).map((c) => c.id)
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
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2 && !c.s3).map((c) => c.id)
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
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3).map((c) => c.id))     // 動くレーザーを厚く
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.moving && !c.s3 && c.difficulty <= 2).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3).map((c) => c.id))      // 密集チャンク
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3).map((c) => c.id))
      .concat(CHUNK_DEFS.filter((c) => c.dense && !c.s3).map((c) => c.id))
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
  endless: {
    id: 'endless', name: 'エンドレス', zone: 'neon', lengthM: Infinity,
    speedFrom: 16, speedTo: 44, maxRank: 2, setpiece: null, density: [3, 14],
    /* 最初から入っているのは S1 の顔ぶれ（基本セット）だけ。
       遺跡の新ギミックは S3 をクリアして初めて混ざる（ENDLESS_UNLOCK / 契約§4.4） */
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2 && !c.moving && !c.s3).map((c) => c.id)
  }
};

/* エンドレスは「クリア済みゾーンのチャンクを混ぜて無限生成」（契約§4.4）。
   ステージをクリアすると、そのステージが持ち込んだ顔ぶれがプールに加わる。 */
const ENDLESS_UNLOCK = {
  S1: [],                                      // S1 の顔ぶれ＝最初から入っている基本セット
  S2: CHUNK_DEFS.filter((c) => (c.moving || c.wallhole || c.dense) && !c.s3).map((c) => c.id),
  S3: CHUNK_DEFS.filter((c) => c.s3).map((c) => c.id)        // 崩れる橋・振り子の刃
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

  /* ウォールに束ねる */
  walls(list, speedAt) {
    const sorted = list.slice().sort((a, b) => a.at - b.at);
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
    /* どちらの面にも何も要求しないウォール（点滅OFFで通れるレーザーだけ 等）は
       「壁」ではないので数えない＝反応窓や動作比率を汚さない */
    return out.filter((w) => w.demand.floor || w.demand.ceil);
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
    const walls = Fair.walls(list, speedAt);

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
          if (w.demand[side] === 'jump' && gap < sp * CFG.FAIR.JUMP_CHAIN - 1e-6) {
            errs.push('ジャンプ連続(' + side + '): ' + gap.toFixed(2) + 'm < ' + (sp * CFG.FAIR.JUMP_CHAIN).toFixed(2) + 'm @' + w.at.toFixed(1));
          }
          /* 着地してからでないとレーンを変えられない（契約§4.7 2026-09-21） */
          if (w.demand[side] !== 'jump' && gap < sp * CFG.FAIR.JUMP_TO_LANE - 1e-6) {
            errs.push('ジャンプ→横移動(' + side + '): ' + gap.toFixed(2) + 'm < ' + (sp * CFG.FAIR.JUMP_TO_LANE).toFixed(2) + 'm @' + w.at.toFixed(1));
          }
        }
        prev = w;
      });
    });

    /* 生存経路（各ウォールで生存レーンが1つ以上＋前ウォールから到達可能） */
    Fair.SIDES.forEach((side) => {
      let reach = opt.startLanes === 'any' ? CFG.LANES.slice() : (opt.startLanes || [0]).slice();
      let prevAt = opt.startAt !== undefined ? opt.startAt : (walls.length ? walls[0].at - 100 : 0);
      walls.forEach((w) => {
        if (!w.demand[side]) return;
        const sp = speedAt(w.at);
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
  bridge: { key: 'leadM',   def() { return CFG.REF_SPEED * CFG.BRIDGE.LEAD_T; } }
};
/* 崩れる橋は必ず bridge パラメータを持つ（leadM＝踏んでから落ちるまでの距離）。
   書き忘れても生成時に既定値が入るようにしておく。 */
function normParams(type, p) {
  if (type !== 'BRIDGE') return p;
  if (p && p.bridge) return p;
  return Object.assign({}, p || {}, { bridge: {} });
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
function chunkStats(def) {
  if (def._stats) return def._stats;
  const items = [];
  const push = (e, surface) => {
    const pr = scaleParams(normParams(e.type, e.params), 1);
    if (e.type === 'WALLHOLE') {
      CFG.LANES.forEach((l) => items.push(Obstacles.make(l === e.lane ? 'WALLHOLE' : 'WALLSOLID', surface, l, e.at, 0, pr)));
    } else items.push(Obstacles.make(e.type, surface, e.lane, e.at, 0, pr));
  };
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
    const sp0 = Setpieces.build(stage.setpiece, spStart, 0);
    if (sp0) { seedMix = Fair.countDemands(sp0.items, stage.speedAt);
               got.lane += seedMix.lane; got.jump += seedMix.jump; got.slide += seedMix.slide; got.total += seedMix.total; }
  }
  function noteDemands(items) {
    const c = Fair.countDemands(items, stage.speedAt);
    got.lane += c.lane; got.jump += c.jump; got.slide += c.slide; got.total += c.total;
    placed.total += c.total;
  }
  const MIX = { lane: 0.52, jump: 0.40, slide: 0.08 };   // 契約§4.3 の比率（スライドは上限15%）

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
        r += (MIX[k] - share) * mine * 3.2;
      });
      wt *= Math.max(0.12, r);
      w.push(wt); sum += wt;
    }
    let x = rng() * sum;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }
  /* 定義 → 実体（基準速度からの伸縮つき）
     WALLHOLE は「穴のレーン + 残り2レーンの壁」へ展開する（＝全幅の壁に穴が1つ）。 */
  function put(items, e, surface, at, nowDist, scale) {
    const params = scaleParams(normParams(e.type, e.params), scale === undefined ? 1 : scale);
    if (e.type === 'WALLHOLE') {
      CFG.LANES.forEach((l) => {
        items.push(Obstacles.make(l === e.lane ? 'WALLHOLE' : 'WALLSOLID', surface, l, at, nowDist, params));
      });
    } else {
      items.push(Obstacles.make(e.type, surface, e.lane, at, nowDist, params));
    }
  }
  function instantiate(def, startM, nowDist) {
    const scale = stage.speedAt(startM) / CFG.REF_SPEED;
    const items = [];
    (def.floor || []).forEach((e) => put(items, e, 'floor', startM + e.at * scale, nowDist, scale));
    (def.ceil || []).forEach((e) => put(items, e, 'ceil', startM + e.at * scale, nowDist, scale));
    items.sort((a, b) => a.at - b.at);
    const evs = (def.events || []).map((e) => ({ at: startM + e.at * scale, type: e.type, params: e.params || null, done: false }));
    return { items: items, events: evs, lengthM: def.lengthM * scale, startM: startM, id: def.id };
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
    const inst = Setpieces.build(stage.setpiece, spStart, nowDist);
    if (!inst) { setpieceDone = true; return false; }
    const tail = out.slice(-8);
    const errs = Fair.validate(tail.concat(inst.items), stage.speedAt, { startLanes: 'any', reactBoth: stage.reactBoth });
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
        const errs = Fair.validate(tail.concat(inst.items), stage.speedAt, { startLanes: 'any', reactBoth: stage.reactBoth });
        if (!errs.length) {
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
    events: events,
    log: log,
    /* untilM まで生成しておく。nowDist は視認距離の記録用 */
    ensure(untilM, nowDist) {
      let guard = 0;
      while (cursor < untilM && guard++ < 200) appendOne(nowDist === undefined ? Math.max(0, untilM - CFG.SPAWN_AHEAD) : nowDist);
    }
  };
}
