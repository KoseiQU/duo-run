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
  ADPANEL:  { span: 1, depth: 0.46, y0: 0.00, y1: 2.15, both: false, safe: [], label: '広告パネル' }
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

  /* 奥行き方向の窓（2体は常に z=0。dist が at に近いときだけ重なる） */
  zWin(o, dist) {
    const d = OBS[o.type].depth, zc = -(o.at - dist);
    return { z0: zc - d / 2, z1: zc + d / 2 };
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
     見た目（ネオン都市版 / 契約 §5）
     ・危険物は一目で分かる赤/オレンジの警告色。工事現場の設備として彫る。
     ・**見た目は必ず当たり判定の寸法に合わせる**（ズレ ±10% 以内）。
       各 _build は OBS テーブルの y0/y1/depth/span から寸法を引くこと。
     ・点滅灯は「そのビュー専用のマテリアル」を持ち、障害物の at を位相にして
       個体ごとにばらばらに明滅する（プールで使い回しても位相が飛ばない）。
     ========================================================================== */
  _mat: {},
  _pool: {},
  COL: {
    /* ネオン都市の夜景（壁 0x475393 前後）から浮くよう、障害物の本体は明るい工事色にする。
       ユーザー評「障害物が背景に比べて地味」への対応（2026-09-21）。 */
    body: 0xb9c2e4, dark: 0x515a94, steel: 0x8f99d4, deep: 0x3b4278,
    warn: 0xff8a1e, warnDim: 0x6b3a08, red: 0xff3355, amber: 0xffb347,
    cyan: 0x38e2ff, magenta: 0xff3ad0, pit: 0x151130
  },
  _material(key, color, opacity) {
    if (!Obstacles._mat[key]) {
      Obstacles._mat[key] = (opacity === undefined)
        ? new THREE.MeshLambertMaterial({ color: color, fog: true })
        : new THREE.MeshBasicMaterial({ color: color, fog: true, transparent: true, opacity: opacity, depthWrite: opacity > 0.75 });
    }
    return Obstacles._mat[key];
  },
  _emissive(key, color) {
    const k = 'E' + key;
    if (!Obstacles._mat[k]) Obstacles._mat[k] = new THREE.MeshBasicMaterial({ color: color, fog: true });
    return Obstacles._mat[k];
  },
  _build(type) {
    const t = OBS[type];
    const C = Obstacles.COL;
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
    const lamp = (r, color, x, y, z) => {
      const mat = new THREE.MeshBasicMaterial({ color: color, fog: true });
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
      m.position.set(x, y, z);
      g.add(m);
      g.userData.blink.push({ mesh: m, mat: mat, color: new THREE.Color(color) });
      return m;
    };
    /* 危険を示す斜めの縞（黄/黒）。板の上に小さな箱を並べて彫る */
    const stripes = (gw, gh, z, y, n) => {
      for (let i = 0; i < n; i++) {
        const x = -gw / 2 + gw * (i + 0.5) / n;
        box(gw / n * 0.55, gh, 0.03, Obstacles._emissive('warn', C.warn), x, y, z, [0, 0, 0.5]);
      }
    };

    if (type === 'ROVER') {
      /* 工事用バリケード（高さ 0.60 = 判定どおり）＋点滅灯 */
      const matB = Obstacles._material('roverBody', C.body);
      box(w, 0.13, D * 0.55, matB, 0, 0.53, 0);                  // 上の板
      box(w, 0.13, D * 0.55, matB, 0, 0.30, 0);                  // 下の板
      stripes(w - 0.02, 0.12, D * 0.30, 0.53, 5);
      stripes(w - 0.02, 0.12, D * 0.30, 0.30, 5);
      [-1, 1].forEach((s) => {
        box(0.09, 0.60, 0.09, Obstacles._material('roverLeg', C.steel), s * (w / 2 - 0.08), 0.30, 0);
        box(0.10, 0.10, D * 0.9, Obstacles._material('roverFoot', C.steel), s * (w / 2 - 0.08), 0.05, 0);
      });
      box(w * 0.98, 0.06, 0.06, Obstacles._emissive('roverGlow', C.red), 0, 0.575, 0);
      lamp(0.04, C.warn, -w / 2 + 0.10, 0.60, 0);
      lamp(0.04, C.warn, w / 2 - 0.10, 0.60, 0);

    } else if (type === 'WALLHOLE' || type === 'WALLSOLID') {
      /* 壁の穴（契約§4.3改訂）: コリドーを塞ぐ工事用の鉄板壁。WALLHOLE のレーンだけ
         下端に高さ 0.50 の潜り穴が空く。見た目の上端は判定の上端 y1 とぴったり同じ。 */
      const hole = (type === 'WALLHOLE');
      const y0 = hole ? t.y0 : 0;         // 穴の高さ（= 0.50）／壁は床から
      const TOP = t.y1;                   // 2.30 = 判定の上端そのもの
      const matW = Obstacles._material('holeWall', C.body);
      const matR = Obstacles._material('holeRib', C.steel);
      box(w, TOP - y0, D * 0.55, matW, 0, (TOP + y0) / 2, 0);                  // 鉄板本体
      for (let i = 0; i < 5; i++) {                                            // 波板の縦リブ
        box(0.07, TOP - y0 - 0.08, D * 0.72, matR, -w / 2 + 0.12 + (w - 0.24) * i / 4, (TOP + y0) / 2, 0);
      }
      box(w, 0.10, D * 0.82, matR, 0, TOP - 0.05, 0);                          // 上のフレーム
      box(w, 0.07, D * 0.88, Obstacles._emissive('wallEdge', C.warn), 0, TOP - 0.12, 0);
      if (hole) {
        box(w, 0.12, D * 0.86, matR, 0, y0 + 0.06, 0);                         // 穴の上の桁
        [-1, 1].forEach((s2) => box(0.09, y0, D * 0.78, matR, s2 * (w / 2 - 0.045), y0 / 2, 0));
        box(w, 0.07, D + 0.02, Obstacles._emissive('holeWarn', C.warn), 0, y0 + 0.015, 0);
        /* 穴の足元を光らせて「ここを潜れ」と示す */
        box(w * 0.86, 0.03, D + 0.02, Obstacles._emissive('holeGuide', C.cyan), 0, 0.025, 0);
        [-1, 1].forEach((s2) => box(0.05, y0 - 0.05, 0.05, Obstacles._emissive('holeGuide', C.cyan),
                                    s2 * (w / 2 - 0.10), (y0 - 0.05) / 2, D / 2 - 0.03));
        stripes(w - 0.06, 0.13, D / 2 - 0.02, y0 + 0.19, 7);
        lamp(0.05, C.warn, -w / 2 + 0.09, y0 + 0.10, D / 2 - 0.05);
        lamp(0.05, C.warn, w / 2 - 0.09, y0 + 0.10, D / 2 - 0.05);
      } else {
        /* 穴のない壁: 一目で「ここは通れない」と分かる赤い×と縞 */
        stripes(w - 0.06, 0.15, D / 2 - 0.02, 0.22, 7);
        stripes(w - 0.06, 0.15, D / 2 - 0.02, TOP - 0.30, 7);
        box(w * 0.78, 0.12, 0.05, Obstacles._emissive('wallX', C.red), 0, TOP * 0.45, D / 2 - 0.03, [0, 0, 0.72]);
        box(w * 0.78, 0.12, 0.05, Obstacles._emissive('wallX', C.red), 0, TOP * 0.45, D / 2 - 0.03, [0, 0, -0.72]);
        lamp(0.055, C.red, 0, TOP - 0.22, D / 2 - 0.04);
      }

    } else if (type === 'LASER_LOW') {
      /* ローレーザー（契約§4.3）: 面の近くを走る水平光線。0〜0.60 を塞ぐのでジャンプで越える。
         光線そのものは 0.45 付近に置き、下の 0〜0.45 は「光のカーテン」で判定どおり塞ぐ。 */
      const y1 = t.y1, beam = y1 * 0.74;
      const matDev = Obstacles._material('lowlDev', C.steel);
      [-1, 1].forEach((s2) => {
        box(0.14, y1, D, matDev, s2 * (w / 2 - 0.04), y1 / 2, 0);
        box(0.16, 0.13, D, Obstacles._emissive('lowlWarn', C.warn), s2 * (w / 2 - 0.04), beam, 0);
        box(0.16, 0.07, D, Obstacles._emissive('lowlWarn2', C.warn), s2 * (w / 2 - 0.04), y1 - 0.04, 0);
      });
      box(w, 0.11, 0.10, beamMat(Obstacles._emissive('laserCore', 0xffa0a8)), 0, beam, 0);
      box(w, 0.22, 0.18, beamMat(Obstacles._material('laserHalo', C.red, 0.40)), 0, beam, 0);
      box(w, beam, 0.04, beamMat(Obstacles._material('laserCurtain', 0xff5a4d, 0.30)), 0, beam / 2, 0);
      box(w, 0.07, D, Obstacles._emissive('lowlFloor', C.warn), 0, 0.035, 0);
      box(w, 0.05, D * 0.6, Obstacles._emissive('lowlFloor2', C.red), 0, y1 - 0.03, 0);
      lamp(0.045, C.red, -w / 2 + 0.05, y1 - 0.05, D / 2 - 0.05);
      lamp(0.045, C.red, w / 2 - 0.05, y1 - 0.05, D / 2 - 0.05);

    } else if (type === 'LASER_V') {
      /* 縦レーザー＝光柱（契約§4.3改訂）: 1レーンを全高で塞ぐ。潜れない・跳べない＝横に避ける。 */
      const y0 = t.y0, y1 = t.y1, hh = y1 - y0, yc = (y0 + y1) / 2;
      const matDev = Obstacles._material('laserDev', C.steel);
      [-1, 1].forEach((s2) => {
        box(0.11, hh, D * 0.85, matDev, s2 * (w / 2 - 0.05), yc, 0);
        [0.16, 0.5, 0.84].forEach((u) => {
          box(0.15, 0.10, D, Obstacles._emissive('laserWarn', C.warn), s2 * (w / 2 - 0.05), y0 + hh * u, 0);
        });
      });
      box(w * 0.50, hh, D * 0.8, beamMat(Obstacles._material('laserHaloV', C.red, 0.26)), 0, yc, 0);
      box(w * 0.34, hh, 0.05, beamMat(Obstacles._material('laserGlow', C.red, 0.55)), 0, yc, 0);
      box(w * 0.16, hh, 0.08, beamMat(Obstacles._emissive('laserCoreV', 0xff8e98)), 0, yc, 0);
      [[y0, 1], [y1, -1]].forEach((e) => {
        box(w * 0.70, 0.16, D, matDev, 0, e[0] + e[1] * 0.08, 0);             // 発生装置
        box(w * 0.54, 0.06, 0.09, Obstacles._emissive('laserWarn', C.warn), 0, e[0] + e[1] * 0.03, D / 2 - 0.06);
      });
      lamp(0.05, C.red, 0, y0 + 0.30, D / 2 - 0.06);
      lamp(0.05, C.red, 0, y1 - 0.30, D / 2 - 0.06);

    } else if (type === 'PILLAR') {
      /* 支柱（全高）＋縦のネオン。床天井の両方に効くので上下対称に彫る */
      const H = CFG.H;
      box(w * 0.82, H, D * 0.9, Obstacles._material('pillarBody', C.body), 0, H / 2, 0);
      [-1, 1].forEach((s) => box(0.09, H, D, Obstacles._material('pillarEdge', C.steel), s * (w / 2 - 0.05), H / 2, 0));
      box(w * 0.16, H - 0.2, 0.05, Obstacles._emissive('pillarNeon', C.magenta), 0, H / 2, D / 2 - 0.03);
      [0.35, 0.95, 1.55, 2.45, 3.05, 3.65].forEach((y) => {
        box(w * 0.7, 0.10, 0.04, Obstacles._emissive('pillarWarn', C.warn), 0, y, D / 2 - 0.03, [0, 0, 0.45]);
      });
      lamp(0.05, C.red, 0, H - 0.18, D / 2 - 0.04);
      lamp(0.05, C.red, 0, 0.18, D / 2 - 0.04);

    } else if (type === 'GAP') {
      /* 崩れた路面。穴の見た目の幅 = 判定の depth(1.6) ちょうど。
         床タイルは穴の周囲ごと消えるので、判定の外側は「埋め板」で路面に戻す。 */
      const half = D / 2;
      const matPit = Obstacles._material('gapPit', C.pit);
      box(w, 0.04, D, matPit, 0, -1.55, 0);                        // 底
      box(w * 0.8, 0.05, D * 0.7, Obstacles._emissive('gapBottom', C.red), 0, -1.50, 0);
      [-1, 1].forEach((s) => {
        box(w, 1.6, 0.05, matPit, 0, -0.8, s * half);              // 穴の前後の内壁
        box(0.05, 1.6, D, matPit, s * (w / 2), -0.8, 0);           // 左右の内壁
      });
      /* 判定の外側（タイルが消える範囲）を路面に戻す埋め板 */
      const fillMat = Obstacles._material('gapFill', 0x232b52);
      /* 穴の内側の非常灯（縁だけでなく「落ちる先」も光らせて存在を目立たせる） */
      [-1, 1].forEach((s2) => {
        [-0.18, -0.45, -0.78].forEach((y, i) => {
          box(w * 0.92, 0.07, 0.06, Obstacles._emissive(i ? 'gapInner2' : 'gapInner', i ? C.red : C.warn),
              0, y, s2 * (half - 0.05));
        });
        box(0.06, 0.9, D * 0.85, Obstacles._emissive('gapInner2', C.red), s2 * (w / 2 - 0.04), -0.6, 0);
      });
      [-1, 1].forEach((s) => box(CFG.LANE_W - 0.07, 0.14, 3.0, fillMat, 0, -0.075, s * 2.3));
      /* 穴の手前・奥の路面に描いた警告帯（判定の外だが、路面標示なので体には当たらない。
         「穴がある」と遠くからでも分かるようにするための視認性対策） */
      [-1, 1].forEach((s2) => {
        [0.22, 0.48, 0.74].forEach((dz, i) => {
          box(w * (0.96 - i * 0.12), 0.03, 0.16, Obstacles._emissive(i % 2 ? 'gapMark2' : 'gapMark', i % 2 ? C.red : C.warn),
              0, 0.02, s2 * (half + dz));
        });
      });
      /* 縁の警告灯とちぎれた鉄筋 */
      [-1, 1].forEach((s) => {
        box(w, 0.13, 0.17, Obstacles._emissive('gapRim', C.warn), 0, 0.06, s * (half - 0.08));
        box(0.10, 0.09, D, Obstacles._emissive('gapRim', C.warn), s * (w / 2 - 0.03), 0.05, 0);
        /* 四隅の工事用ビーコン（高さ0.34。ジャンプの軌道（足元1.3）には干渉しない） */
        [-1, 1].forEach((sx) => {
          const x = sx * (w / 2 - 0.10);
          box(0.09, 0.34, 0.09, Obstacles._material('gapPostBody', C.body), x, 0.17, s * (half - 0.09));
          box(0.13, 0.10, 0.13, Obstacles._emissive('gapPost', C.warn), x, 0.29, s * (half - 0.09));
          lamp(0.06, C.red, x, 0.38, s * (half - 0.09));
        });
        box(0.04, 0.26, 0.04, Obstacles._material('gapBar', C.steel), s * 0.22, -0.06, s * (half - 0.06), [0.5, 0, 0.3]);
        box(0.04, 0.22, 0.04, Obstacles._material('gapBar', C.steel), -s * 0.36, -0.10, s * (half - 0.10), [-0.4, 0, -0.2]);
      });

    } else if (type === 'WIDEBAR') {
      /* 工事用ゲート（2レーン・高さ 2.20 = 判定どおり）。空いた1レーンへ逃げる */
      const H2 = t.y1;
      const matF = Obstacles._material('wideFrame', C.body);
      box(w, 0.14, D * 0.8, matF, 0, H2 - 0.07, 0);                 // 上枠
      box(w, 0.12, D * 0.8, matF, 0, 0.06, 0);                      // 下枠
      [-1, 1].forEach((s) => box(0.12, H2, D * 0.8, matF, s * (w / 2 - 0.06), H2 / 2, 0));
      box(w - 0.3, H2 - 0.3, D * 0.25, Obstacles._material('wideNet', 0xffb347, 0.30), 0, H2 / 2, 0);
      for (let i = 0; i < 8; i++) {
        box(0.09, H2 - 0.3, 0.06, Obstacles._material('wideBarM', C.body),
            -w / 2 + 0.2 + (w - 0.4) * i / 7, H2 / 2, D * 0.16);
      }
      box(w, 0.12, D * 0.82, Obstacles._emissive('wideMid', C.warn), 0, H2 * 0.52, 0);
      stripes(w - 0.1, 0.13, D / 2 - 0.03, H2 - 0.16, 10);
      stripes(w - 0.1, 0.13, D / 2 - 0.03, 0.14, 10);
      box(w, 0.06, 0.06, Obstacles._emissive('wideGlow', C.warn), 0, H2 - 0.03, 0);
      lamp(0.05, C.warn, -w / 2 + 0.14, H2 - 0.03, 0);
      lamp(0.05, C.warn, w / 2 - 0.14, H2 - 0.03, 0);
      lamp(0.05, C.red, 0, H2 * 0.5, D / 2 - 0.06);

    } else if (type === 'LASER_SCAN') {
      /* 横スキャン縦光柱（契約§4.4 S2）: 走査ユニットごと横へ滑る光柱。
         見た目の寸法は判定（1レーン幅・全高）と同じ。位置は place() が MOT から引く。 */
      const H = CFG.H;
      const matDev = Obstacles._material('scanDev', C.steel);
      [[0.16, 1], [H - 0.16, -1]].forEach((e) => {
        box(w, 0.22, D * 1.5, matDev, 0, e[0], 0);                                  // 走査ユニット
        box(w * 0.86, 0.07, D * 1.6, Obstacles._emissive('scanWarn', C.warn), 0, e[0] + e[1] * 0.13, 0);
        box(w * 0.30, 0.10, D * 1.2, Obstacles._emissive('scanHot', 0xfff0c8), 0, e[0] - e[1] * 0.09, 0);
        [-1, 1].forEach((s2) => box(0.10, 0.30, 0.10, matDev, s2 * (w / 2 - 0.06), e[0], 0));
      });
      const hh = H - 0.32, yc = H / 2;
      box(w * 0.52, hh, D * 0.8, Obstacles._material('scanHalo', C.magenta, 0.30), 0, yc, 0);
      box(w * 0.30, hh, 0.06, Obstacles._material('scanGlow', C.magenta, 0.60), 0, yc, 0);
      box(w * 0.13, hh, 0.09, Obstacles._emissive('scanCore', 0xffc8f0), 0, yc, 0);
      lamp(0.05, C.magenta, 0, 0.42, D / 2 - 0.02);
      lamp(0.05, C.magenta, 0, H - 0.42, D / 2 - 0.02);

    } else if (type === 'LASER_V' || type === 'LASER_LOW') {
      /* 点滅レーザーが消えている間の「待機表示」。
         消えている＝通れる ことが分かりつつ、そこに装置があることも分かるように、
         暗い光の筋だけを残す（点いている時は beam 側が出る）。 */
      const isV = (type === 'LASER_V');
      const hh = isV ? (OBS[type].y1 - OBS[type].y0) : 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * (isV ? 0.30 : 0.98), isV ? hh - 0.32 : 0.05, 0.05),
                               Obstacles._material('standby', 0x7a4aa8, 0.30));
      m.position.set(0, isV ? CFG.H / 2 : 0.44, 0);
      m.visible = false;
      g.add(m);
      g.userData.standby = m;

    } else if (type === 'LASER_ROT') {
      /* 回転レーザー（契約§4.4 S2）: 面に据えた発振器から腕が首を振り、腕の下に
         光のカーテンが降りる。腕・カーテンは place() が bands() から直に置くので、
         見た目と当たり判定は定義上ずれない。 */
      const matDev = Obstacles._material('rotDev', C.steel);
      box(w * 0.92, 0.26, D * 1.3, matDev, 0, 0.13, 0);                             // 台座
      box(w * 0.54, 0.16, D * 1.1, Obstacles._material('rotHead', C.body), 0, 0.32, 0);
      box(w * 0.34, 0.09, D * 1.15, Obstacles._emissive('rotHot', 0xffb0a0), 0, 0.40, 0);
      box(w * 0.62, 0.06, D * 1.2, Obstacles._emissive('rotWarn', C.warn), 0, 0.28, 0);
      stripes(w * 0.9, 0.11, D * 0.66, 0.12, 5);
      lamp(0.05, C.red, 0, 0.44, 0);

    } else if (type === 'DRONE') {
      /* 広告ドローン（滑空区間）: 機体＋吊り下げた縦長のホログラム広告で全高を塞ぐ */
      const H = CFG.H;
      const matB = Obstacles._material('droneBody', C.body);
      box(w * 0.52, 0.22, D * 0.62, matB, 0, H - 0.42, 0);                          // 機体
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        box(0.30, 0.05, 0.30, Obstacles._material('droneArm', C.steel), sx * w * 0.30, H - 0.30, sz * D * 0.26);
        box(0.26, 0.03, 0.26, Obstacles._material('droneRotor', C.cyan, 0.5), sx * w * 0.30, H - 0.24, sz * D * 0.26);
      }));
      box(w * 0.30, 0.07, D * 0.3, Obstacles._emissive('droneWarn', C.red), 0, H - 0.55, 0);
      box(0.05, 0.36, 0.05, Obstacles._material('droneWire', C.deep), 0, H - 0.76, 0);
      box(w * 0.90, H - 1.05, 0.05, Obstacles._material('droneAd', C.magenta, 0.42), 0, (H - 1.05) / 2 + 0.06, 0);
      box(w * 0.52, H - 1.35, 0.07, Obstacles._material('droneAd2', C.cyan, 0.34), 0, (H - 1.05) / 2 + 0.06, 0.03);
      for (let i = 0; i < 5; i++) {
        box(w * 0.80, 0.09, 0.03, Obstacles._emissive('droneLine', C.cyan), 0, 0.35 + i * 0.62, -0.02);
      }
      box(w * 0.86, 0.06, D * 0.5, Obstacles._emissive('droneFoot', C.warn), 0, 0.05, 0);
      lamp(0.055, C.red, 0, H - 0.08, 0);

    } else if (type === 'SIGNFRAG') {
      /* ちぎれたネオン看板（滑空区間）: 縦長の看板の破片。全高を塞ぐ */
      const H = CFG.H;
      const matB = Obstacles._material('fragBody', C.dark);
      box(w * 0.78, H - 0.2, D * 0.92, matB, 0, H / 2, 0, [0, 0, 0.06]);
      box(w * 0.30, H - 0.5, D * 0.70, Obstacles._material('fragBody2', C.body), -w * 0.18, H / 2 + 0.1, 0.02, [0, 0, 0.06]);
      [-1, 1].forEach((s2) => box(0.09, H - 0.3, D * 0.55, Obstacles._material('fragEdge', C.steel), s2 * w * 0.37, H / 2, 0, [0, 0, 0.06]));
      for (let i = 0; i < 6; i++) {
        box(w * 0.46, 0.15, 0.04, Obstacles._emissive(i % 2 ? 'fragNeon2' : 'fragNeon', i % 2 ? C.magenta : C.cyan),
            (i % 2 ? 0.1 : -0.1) * w, 0.45 + i * 0.62, -D * 0.28, [0, 0, 0.06]);
      }
      box(w * 0.70, 0.10, D * 0.6, Obstacles._emissive('fragWarn', C.warn), 0, H - 0.12, 0);
      box(w * 0.70, 0.10, D * 0.6, Obstacles._emissive('fragWarn', C.warn), 0, 0.10, 0);
      lamp(0.05, C.red, 0, H * 0.5, -D * 0.3);

    } else if (type === 'WIRE2') {
      /* 切れた電線の束（滑空区間・2レーン幅）: ガイシと鉄塔の断片で全高を塞ぐ */
      const H = CFG.H;
      const matS = Obstacles._material('wireSteel', C.steel);
      [-1, 1].forEach((s2) => {
        box(0.16, H, D * 0.94, matS, s2 * (w / 2 - 0.10), H / 2, 0);
        for (let i = 0; i < 4; i++) box(0.34, 0.07, 0.07, matS, s2 * (w / 2 - 0.18), 0.5 + i * 1.0, 0);
      });
      [0.55, 1.5, 2.5, 3.45].forEach((y, i) => {
        box(w - 0.12, 0.075, 0.075, Obstacles._material('wireCable', C.deep), 0, y, (i % 2 ? 0.07 : -0.07), [0, 0, (i % 2 ? 0.03 : -0.03)]);
        box(w - 0.12, 0.035, 0.035, Obstacles._emissive('wireSpark', C.cyan), 0, y + 0.05, (i % 2 ? 0.07 : -0.07), [0, 0, (i % 2 ? 0.03 : -0.03)]);
      });
      [-1, 1].forEach((s2) => [0.55, 2.5].forEach((y) => {
        box(0.12, 0.18, 0.12, Obstacles._material('wireIns', C.body), s2 * w * 0.22, y + 0.12, 0);
      }));
      box(w * 0.9, 0.08, D * 0.5, Obstacles._emissive('wireWarn', C.warn), 0, H - 0.06, 0);
      box(w * 0.9, 0.08, D * 0.5, Obstacles._emissive('wireWarn', C.warn), 0, 0.06, 0);
      lamp(0.05, C.red, -w * 0.3, 1.5, 0);
      lamp(0.05, C.red, w * 0.3, 2.5, 0);

    } else if (type === 'ADPANEL') {
      /* 片側に浮かぶ広告パネル（滑空区間）: 小型ローター＋縦型ディスプレイ */
      const TOP = t.y1;
      box(w * 0.86, TOP - 0.55, 0.07, Obstacles._material('panelFace', C.cyan, 0.46), 0, (TOP - 0.55) / 2 + 0.05, 0);
      box(w * 0.86, TOP - 0.55, D * 0.90, Obstacles._material('panelBody', C.dark), 0, (TOP - 0.55) / 2 + 0.05, 0.0);
      [-1, 1].forEach((s2) => box(0.08, TOP - 0.5, D * 0.94, Obstacles._material('panelEdge', C.steel), s2 * w * 0.43, (TOP - 0.5) / 2 + 0.05, 0));
      for (let i = 0; i < 4; i++) {
        box(w * 0.60, 0.11, 0.03, Obstacles._emissive(i % 2 ? 'panelLine2' : 'panelLine', i % 2 ? C.magenta : C.cyan),
            0, 0.35 + i * 0.44, -0.04);
      }
      box(w * 0.30, 0.16, D * 0.5, Obstacles._material('panelHub', C.body), 0, TOP - 0.30, 0);
      [-1, 1].forEach((s2) => {
        box(0.34, 0.04, 0.10, Obstacles._material('panelRotor', C.cyan, 0.55), s2 * w * 0.28, TOP - 0.10, 0);
        box(0.06, 0.24, 0.06, Obstacles._material('panelEdge', C.steel), s2 * w * 0.20, TOP - 0.20, 0);
      });
      box(w * 0.7, 0.07, D * 0.5, Obstacles._emissive('panelWarn', C.warn), 0, TOP - 0.03, 0);
      box(w * 0.7, 0.06, D * 0.5, Obstacles._emissive('panelWarn', C.warn), 0, 0.04, 0);
      lamp(0.05, C.red, 0, TOP - 0.04, D * 0.2);
    }
    /* 材質ごとに融合して1メッシュにする（点滅灯だけは個別マテリアルなので別メッシュのまま） */
    const byMat = [];
    for (let i = 0; i < parts.length; i++) {
      let b = null;
      for (let k = 0; k < byMat.length; k++) if (byMat[k].mat === parts[i].mat) { b = byMat[k]; break; }
      if (!b) { b = { mat: parts[i].mat, list: [] }; byMat.push(b); }
      b.list.push({ g: parts[i].g, p: parts[i].p, r: parts[i].r });
    }
    for (let k = 0; k < byMat.length; k++) {
      const mesh = new THREE.Mesh(ZoneNeon._merge(byMat[k].list), byMat[k].mat);
      g.add(mesh);
      if (beamMats.indexOf(byMat[k].mat) >= 0) g.userData.beam.push(mesh);
      byMat[k].list.forEach((x) => x.g.dispose());
    }
    Obstacles._buildMoving(type, g, w, t);
    return g;
  },

  /* ==========================================================================
     動く部品（マージしない。place() が bands()/MOT から毎フレーム置く）
     ・回転レーザーの腕と光のカーテンは **bands() の帯そのもの** を描く。
       ＝ 見た目と当たり判定が定義上ずれない（契約§3「見た目は判定に合わせる」）。
     ・横スキャンの「予告」は到達時の位置を示す床/天井のマーカー。
     ========================================================================== */
  _buildMoving(type, g, w, t) {
    const C = Obstacles.COL;
    if (type === 'LASER_SCAN') {
      /* 到達位置の予告マーカー（床・天井）＋掃引範囲の薄い帯 */
      const mark = new THREE.Group();
      [[0.02, 1], [CFG.H - 0.02, -1]].forEach((e) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(CFG.LANE_W - 0.16, 3.4),
                                 Obstacles._material('scanMark', 0xff66d8, 0.34));
        m.rotation.x = -Math.PI / 2 * e[1];
        m.position.set(0, e[0], 0);
        m.renderOrder = 4;
        mark.add(m);
        const b = new THREE.Mesh(new THREE.BoxGeometry(CFG.LANE_W - 0.16, 0.05, 0.10),
                                 Obstacles._emissive('scanMarkLine', C.magenta));
        b.position.set(0, e[0] + e[1] * 0.03, -1.55);
        mark.add(b);
      });
      g.add(mark);
      g.userData.mark = mark;
      const range = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9),
                                   Obstacles._material('scanRange', C.cyan, 0.16));
      range.rotation.x = -Math.PI / 2;
      range.position.y = 0.012;
      range.renderOrder = 3;
      g.add(range);
      g.userData.range = range;

    } else if (type === 'LASER_V' || type === 'LASER_LOW') {
      /* 点滅レーザーが消えている間の「待機表示」。
         消えている＝通れる ことが分かりつつ、そこに装置があることも分かるように、
         暗い光の筋だけを残す（点いている時は beam 側が出る）。 */
      const isV = (type === 'LASER_V');
      const hh = isV ? (OBS[type].y1 - OBS[type].y0) : 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * (isV ? 0.30 : 0.98), isV ? hh - 0.32 : 0.05, 0.05),
                               Obstacles._material('standby', 0x7a4aa8, 0.30));
      m.position.set(0, isV ? CFG.H / 2 : 0.44, 0);
      m.visible = false;
      g.add(m);
      g.userData.standby = m;

    } else if (type === 'LASER_ROT') {
      const R = CFG.LASER.ROT_R, TH = CFG.LASER.ROT_W;
      const mkArm = (coreCol, haloOp, ghost) => {
        const arm = new THREE.Group();
        const sc = new THREE.Group();
        arm.add(sc);
        const halo = new THREE.Mesh(new THREE.BoxGeometry(1, TH, TH),
                                    Obstacles._material(ghost ? 'rotGhost' : 'rotHalo', ghost ? C.cyan : C.red, haloOp));
        halo.position.x = 0.5;
        sc.add(halo);
        if (!ghost) {
          const core = new THREE.Mesh(new THREE.BoxGeometry(1, TH * 0.34, TH * 0.34),
                                      Obstacles._emissive('rotCore', coreCol));
          core.position.x = 0.5;
          sc.add(core);
        }
        arm.userData = { sc: sc };
        g.add(arm);
        return arm;
      };
      g.userData.ghost = mkArm(0x9fe8ff, 0.22, true);      // 到達時の角度を薄く予告（水色）
      g.userData.arm = mkArm(0xffd0c0, 0.60, false);
      /* 光のカーテン: bands() の帯を1つずつ描く（InstancedMesh 1つ＝1ドローコール） */
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
                                         Obstacles._material('rotCurtain', 0xff5a4d, 0.36),
                                         CFG.LASER.ROT_SLATS + 1);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.renderOrder = 2;
      g.add(im);
      g.userData.slats = { mesh: im, dummy: new THREE.Object3D(), n: CFG.LASER.ROT_SLATS + 1 };
      g.userData.armR = R;
    }
  },
  /* プールから見た目を取り出す／返す（毎フレーム new しない） */
  acquire(type) {
    const p = Obstacles._pool[type] || (Obstacles._pool[type] = []);
    const g = p.length ? p.pop() : Obstacles._build(type);
    g.visible = true;
    return g;
  },
  release(type, g) {
    g.visible = false;
    (Obstacles._pool[type] || (Obstacles._pool[type] = [])).push(g);
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

    if (mot === 'scan' && ud.mark) {
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
