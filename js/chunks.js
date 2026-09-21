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

/* ---------------------------------------------------------------- チャンク定義 */
const CHUNK_DEFS = [
  /* --- rank1: 1種ずつ・ゆったり ------------------------------------------ */
  { id: 'c1_rover_f', zone: 'void', lengthM: 46, difficulty: 1, minSpeed: 0,
    floor: [{ at: 14, lane: 0, type: 'ROVER' }, { at: 32, lane: -1, type: 'ROVER' }], ceil: [], events: [] },
  { id: 'c1_rover_c', zone: 'void', lengthM: 46, difficulty: 1, minSpeed: 0,
    floor: [], ceil: [{ at: 14, lane: 1, type: 'ROVER' }, { at: 32, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c1_hibar_f', zone: 'void', lengthM: 44, difficulty: 1, minSpeed: 0,
    floor: [{ at: 14, lane: 0, type: 'HIBAR' }, { at: 30, lane: 1, type: 'HIBAR' }], ceil: [], events: [] },
  { id: 'c1_hibar_c', zone: 'void', lengthM: 44, difficulty: 1, minSpeed: 0,
    floor: [], ceil: [{ at: 14, lane: -1, type: 'HIBAR' }, { at: 30, lane: 0, type: 'HIBAR' }], events: [] },
  { id: 'c1_gap_f', zone: 'void', lengthM: 50, difficulty: 1, minSpeed: 0,
    floor: [{ at: 16, lane: 0, type: 'GAP' }, { at: 36, lane: 1, type: 'GAP' }], ceil: [], events: [] },
  { id: 'c1_pillar', zone: 'void', lengthM: 48, difficulty: 1, minSpeed: 0,
    floor: [{ at: 16, lane: -1, type: 'PILLAR' }, { at: 34, lane: 1, type: 'PILLAR' }], ceil: [], events: [] },

  /* --- rank2: 床と天井を交互に・少し詰める -------------------------------- */
  { id: 'c2_alt_a', zone: 'void', lengthM: 52, difficulty: 2, minSpeed: 0,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 30, lane: 1, type: 'HIBAR' }],
    ceil:  [{ at: 21, lane: -1, type: 'HIBAR' }, { at: 39, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c2_alt_b', zone: 'void', lengthM: 52, difficulty: 2, minSpeed: 0,
    floor: [{ at: 13, lane: -1, type: 'GAP' }, { at: 31, lane: 0, type: 'ROVER' }],
    ceil:  [{ at: 22, lane: 0, type: 'ROVER' }, { at: 40, lane: 1, type: 'HIBAR' }], events: [] },
  { id: 'c2_laser', zone: 'void', lengthM: 44, difficulty: 2, minSpeed: 0,
    floor: [{ at: 14, lane: 0, type: 'LASER' }, { at: 30, lane: 1, type: 'LASER' }], ceil: [], events: [] },
  { id: 'c2_weave', zone: 'void', lengthM: 54, difficulty: 2, minSpeed: 0,
    floor: [{ at: 14, lane: -1, type: 'PILLAR' }, { at: 28, lane: 1, type: 'PILLAR' }, { at: 42, lane: 0, type: 'PILLAR' }],
    ceil: [], events: [] },
  { id: 'c2_sync', zone: 'void', lengthM: 48, difficulty: 2, minSpeed: 0,
    floor: [{ at: 14, lane: 0, type: 'ROVER' }, { at: 34, lane: -1, type: 'ROVER' }],
    ceil:  [{ at: 14, lane: 0, type: 'ROVER' }, { at: 34, lane: -1, type: 'ROVER' }], events: [] },

  /* --- rank3: 2体に別々の動作を同時に要求 --------------------------------- */
  { id: 'c3_dual_a', zone: 'void', lengthM: 44, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 30, lane: 1, type: 'HIBAR' }],
    ceil:  [{ at: 12, lane: 0, type: 'HIBAR' }, { at: 30, lane: 1, type: 'ROVER' }], events: [] },
  { id: 'c3_dual_b', zone: 'void', lengthM: 46, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: -1, type: 'GAP' }, { at: 32, lane: 0, type: 'HIBAR' }],
    ceil:  [{ at: 12, lane: -1, type: 'HIBAR' }, { at: 32, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c3_wide', zone: 'void', lengthM: 56, difficulty: 3, minSpeed: 0,
    floor: [{ at: 14, lane: -1, type: 'WIDEBAR' }, { at: 42, lane: 0, type: 'WIDEBAR' }],
    ceil:  [{ at: 28, lane: 0, type: 'ROVER' }], events: [] },
  { id: 'c3_laser_weave', zone: 'void', lengthM: 52, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: -1, type: 'LASER' }, { at: 26, lane: 0, type: 'LASER' }, { at: 40, lane: 1, type: 'LASER' }],
    ceil: [], events: [] },
  { id: 'c3_mix', zone: 'void', lengthM: 56, difficulty: 3, minSpeed: 0,
    floor: [{ at: 12, lane: 0, type: 'ROVER' }, { at: 28, lane: 1, type: 'PILLAR' }, { at: 44, lane: -1, type: 'GAP' }],
    ceil:  [{ at: 12, lane: 1, type: 'HIBAR' }, { at: 44, lane: 0, type: 'ROVER' }], events: [] }
];

const CHUNK_BY_ID = {};
CHUNK_DEFS.forEach((c) => { CHUNK_BY_ID[c.id] = c; });

/* ---------------------------------------------------------------- ステージ定義 */
const STAGE_DEFS = {
  /* P1の仮ステージ（無地のコリドー・ゾーン装飾なし） */
  S0: {
    id: 'S0', name: '仮ステージ S0', zone: 'void', lengthM: 900,
    speedFrom: 8, speedTo: 10, maxRank: 3, setpiece: null,   // setpiece スロットは P2 以降で使う
    chunkPool: CHUNK_DEFS.map((c) => c.id)
  },
  endless: {
    id: 'endless', name: '仮エンドレス', zone: 'void', lengthM: Infinity,
    speedFrom: 8, speedTo: 22, maxRank: 3, setpiece: null,
    chunkPool: CHUNK_DEFS.map((c) => c.id)
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
        const steps = Math.max(1, Math.floor((w.at - prevAt) / (sp * CFG.LANE_T)));
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
    if (!c.length) c = pool.filter((d) => d.difficulty === 1);
    return c;
  }
  /* 定義 → 実体（基準速度からの伸縮つき） */
  function instantiate(def, startM, nowDist) {
    const scale = stage.speedAt(startM) / CFG.REF_SPEED;
    const items = [];
    (def.floor || []).forEach((e) => items.push(Obstacles.make(e.type, 'floor', e.lane, startM + e.at * scale, nowDist, e.params)));
    (def.ceil || []).forEach((e) => items.push(Obstacles.make(e.type, 'ceil', e.lane, startM + e.at * scale, nowDist, e.params)));
    items.sort((a, b) => a.at - b.at);
    const evs = (def.events || []).map((e) => ({ at: startM + e.at * scale, type: e.type, params: e.params || null, done: false }));
    return { items: items, events: evs, lengthM: def.lengthM * scale, startM: startM, id: def.id };
  }

  function appendOne(nowDist) {
    const cands = candidates(cursor);
    const tail = out.slice(-8);
    for (let tryI = 0; tryI < 10; tryI++) {
      const def = cands[Math.floor(rng() * cands.length) % cands.length];
      for (let pad = 0; pad <= 24; pad += 4) {
        const inst = instantiate(def, cursor + pad, nowDist);
        const errs = Fair.validate(tail.concat(inst.items), stage.speedAt, { startLanes: 'any' });
        if (!errs.length) {
          inst.items.forEach((o) => out.push(o));
          inst.events.forEach((e) => events.push(e));
          log.push({ id: inst.id, startM: inst.startM, lengthM: inst.lengthM });
          cursor = inst.startM + inst.lengthM;
          return true;
        }
      }
    }
    /* どうしても入らない時は空白を置いて先へ（“理不尽な配置”より空白を選ぶ） */
    cursor += 40;
    log.push({ id: '(blank)', startM: cursor - 40, lengthM: 40 });
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
