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
  /* 壁の穴（唯一のスライディング要素・1チャンクに1つだけ） */
  { id: 'c3_wallhole_f', zone: 'neon', lengthM: 62, difficulty: 3, minSpeed: 0, wallhole: 1,
    floor: [{ at: 18, lane: 0, type: 'WALLHOLE' }],
    ceil:  [{ at: 42, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c3_wallhole_c', zone: 'neon', lengthM: 62, difficulty: 3, minSpeed: 0, wallhole: 1,
    floor: [{ at: 42, lane: 0, type: 'GAP' }],
    ceil:  [{ at: 18, lane: -1, type: 'WALLHOLE' }], events: [] }
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
    speedFrom: 16, speedTo: 20, maxRank: 3, setpiece: null,  // setpiece スロットは P2 以降で使う
    chunkPool: CHUNK_DEFS.map((c) => c.id)
  },
  /* S1 ネオン都市・入門（契約 §4.4）: 900m / 16→20 / チェックポイント 300・600 /
     冒頭に固定の導入区間、終盤200mは「高速道路の連鎖崩落」。ランク1〜2のみ＝スライド0%。 */
  S1: {
    id: 'S1', name: 'S1 ネオン都市・入門', zone: 'neon', lengthM: 900,
    speedFrom: 16, speedTo: 20, maxRank: 2, setpiece: 'collapse',
    intro: INTRO_S1,
    /* 導入区間と終盤の崩落は「跳ぶ」要求が多めなので、ランダム区間は
       「横に避ける」チャンクを重み付け（同じidを2回入れる＝選ばれやすくする）して
       ステージ全体を契約§4.3の比率（レーン50%前後／ジャンプ35%前後）に寄せる。 */
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2).map((c) => c.id)
      .concat(['c1_pillar', 'c1_laserv', 'c1_laserv_b', 'c1_weave_a', 'c1_weave_b', 'c2_weave', 'c2_lv_weave'])
  },
  endless: {
    id: 'endless', name: 'エンドレス', zone: 'neon', lengthM: Infinity,
    speedFrom: 16, speedTo: 44, maxRank: 2, setpiece: null,
    chunkPool: CHUNK_DEFS.filter((c) => c.difficulty <= 2).map((c) => c.id)
  }
};

function makeStage(id) {
  const d = STAGE_DEFS[id];
  if (!d) throw new Error('unknown stage: ' + id);
  const s = Object.assign({}, d);
  s.endless = !isFinite(d.lengthM);
  s.speedAt = s.endless
    ? function (m) { return Math.min(CFG.SPEED_MAX, d.speedFrom + m / 1000); }
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
  SIDES: ['floor', 'ceil'],

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
        const mine = w.items.filter((o) => Obstacles.affects(o, s));
        if (!mine.length) { w.demand[s] = null; return; }
        let kind = 'lane';
        if (mine.some((o) => OBS[o.type].safe.length === 1 && OBS[o.type].safe[0] === 'jump')) kind = 'jump';
        else if (mine.some((o) => OBS[o.type].safe.indexOf('slide') >= 0)) kind = 'slide';
        w.demand[s] = kind;
      });
      w.both = !!(w.demand.floor && w.demand.ceil);
    });
    return out;
  },

  /* そのウォール・その面で、各レーンに残る安全な動作 */
  laneActs(wall, side) {
    const res = {};
    for (const lane of CFG.LANES) {
      let acts = { run: true, jump: true, slide: true };
      for (const o of wall.items) {
        if (!Obstacles.affects(o, side)) continue;
        if (!Obstacles.laneCovers(o, lane)) continue;
        const safe = OBS[o.type].safe;
        acts.run = false;                                   // 直立はどの障害物でも当たる
        if (safe.indexOf('jump') < 0) acts.jump = false;
        if (safe.indexOf('slide') < 0) acts.slide = false;
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
      if ((a.both || b.both) && gap < sp * CFG.FAIR.REACT_BOTH - 1e-6) {
        errs.push('同時要求の余白: ' + gap.toFixed(2) + 'm < ' + (sp * CFG.FAIR.REACT_BOTH).toFixed(2) + 'm @' + b.at.toFixed(1));
      }
    }

    /* 同じキャラのジャンプ連続 */
    Fair.SIDES.forEach((side) => {
      let prev = null;
      walls.forEach((w) => {
        if (!w.demand[side]) return;
        if (prev && prev.demand[side] === 'jump' && w.demand[side] === 'jump') {
          const sp = speedAt(w.at);
          const gap = w.at - prev.atEnd;
          if (gap < sp * CFG.FAIR.JUMP_CHAIN - 1e-6) {
            errs.push('ジャンプ連続(' + side + '): ' + gap.toFixed(2) + 'm < ' + (sp * CFG.FAIR.JUMP_CHAIN).toFixed(2) + 'm @' + w.at.toFixed(1));
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
function createGenerator(stage, seed) {
  const rng = U.mulberry32((seed >>> 0) || 1);
  let cursor = CFG.LEAD_IN;     // 次のチャンクを置く距離
  let lastWallhole = false;     // 直前のチャンクが「壁の穴」を含んでいたか（連続禁止）
  let introPtr = 0;             // 導入区間の何番目まで置いたか
  let setpieceDone = false;     // 終盤の大演出を置いたか
  const spStart = (stage.setpiece && Setpieces.DEFS[stage.setpiece])
    ? stage.lengthM - Setpieces.DEFS[stage.setpiece].lengthM : Infinity;
  const out = [];               // 生成済み障害物（at 昇順）
  const events = [];            // チャンクの events（P2以降のフック）
  const log = [];               // {id, startM, lengthM}

  function progress(m) {
    return stage.endless ? U.clamp((m % 1500) / 1500, 0, 1) : U.clamp(m / stage.lengthM, 0, 1);
  }
  function maxRankAt(m) {
    const p = progress(m);
    return U.clamp(1 + Math.floor(p * stage.maxRank), 1, stage.maxRank);
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
  /* 定義 → 実体（基準速度からの伸縮つき）
     WALLHOLE は「穴のレーン + 残り2レーンの壁」へ展開する（＝全幅の壁に穴が1つ）。 */
  function put(items, e, surface, at, nowDist) {
    if (e.type === 'WALLHOLE') {
      CFG.LANES.forEach((l) => {
        items.push(Obstacles.make(l === e.lane ? 'WALLHOLE' : 'WALLSOLID', surface, l, at, nowDist, e.params));
      });
    } else {
      items.push(Obstacles.make(e.type, surface, e.lane, at, nowDist, e.params));
    }
  }
  function instantiate(def, startM, nowDist) {
    const scale = stage.speedAt(startM) / CFG.REF_SPEED;
    const items = [];
    (def.floor || []).forEach((e) => put(items, e, 'floor', startM + e.at * scale, nowDist));
    (def.ceil || []).forEach((e) => put(items, e, 'ceil', startM + e.at * scale, nowDist));
    items.sort((a, b) => a.at - b.at);
    const evs = (def.events || []).map((e) => ({ at: startM + e.at * scale, type: e.type, params: e.params || null, done: false }));
    return { items: items, events: evs, lengthM: def.lengthM * scale, startM: startM, id: def.id };
  }

  /* 導入区間（実寸・固定） */
  function appendIntro(nowDist) {
    const it = stage.intro[introPtr++];
    const items = [];
    (it.floor || []).forEach((e) => put(items, e, 'floor', it.at, nowDist));
    (it.ceil || []).forEach((e) => put(items, e, 'ceil', it.at, nowDist));
    items.sort((a, b) => a.at - b.at);
    items.forEach((o) => out.push(o));
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
    const errs = Fair.validate(tail.concat(inst.items), stage.speedAt, { startLanes: 'any' });
    if (errs.length) log.push({ id: '(setpiece-unfair)', startM: spStart, lengthM: 0, errs: errs });
    inst.items.forEach((o) => out.push(o));
    inst.events.forEach((e) => events.push(e));
    log.push({ id: 'setpiece:' + inst.id, startM: inst.startM, lengthM: inst.lengthM, setpiece: true });
    cursor = inst.startM + inst.lengthM;
    setpieceDone = true;
    lastWallhole = false;
    return true;
  }

  function appendOne(nowDist) {
    if (stage.intro && introPtr < stage.intro.length) return appendIntro(nowDist);
    if (!setpieceDone && cursor >= spStart) return appendSetpiece(nowDist);
    const cands = candidates(cursor);
    const tail = out.slice(-8);
    for (let tryI = 0; tryI < 10; tryI++) {
      const def = cands[Math.floor(rng() * cands.length) % cands.length];
      /* 大演出の手前ははみ出さないよう空白で詰める（演出を置く前だけ） */
      if (!setpieceDone && cursor + def.lengthM * (stage.speedAt(cursor) / CFG.REF_SPEED) > spStart) {
        log.push({ id: '(pre-setpiece)', startM: cursor, lengthM: spStart - cursor });
        cursor = spStart;
        return appendSetpiece(nowDist);
      }
      for (let pad = 0; pad <= 24; pad += 4) {
        const inst = instantiate(def, cursor + pad, nowDist);
        const errs = Fair.validate(tail.concat(inst.items), stage.speedAt, { startLanes: 'any' });
        if (!errs.length) {
          inst.items.forEach((o) => out.push(o));
          inst.events.forEach((e) => events.push(e));
          log.push({ id: inst.id, startM: inst.startM, lengthM: inst.lengthM });
          cursor = inst.startM + inst.lengthM;
          lastWallhole = !!def.wallhole;
          return true;
        }
      }
    }
    /* どうしても入らない時は空白を置いて先へ（“理不尽な配置”より空白を選ぶ） */
    cursor += 40;
    log.push({ id: '(blank)', startM: cursor - 40, lengthM: 40 });
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
