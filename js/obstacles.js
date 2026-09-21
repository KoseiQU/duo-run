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

  /* 路面タイルを消す区間（穴の下は空洞・崩れる橋の下は谷）。World.syncCorridor が読む。
     null なら路面はそのまま。区間は **距離 m** で返す。 */
  holeSpan(o) {
    if (o.type === 'GAP') return { from: o.at - OBS.GAP.depth / 2, to: o.at + OBS.GAP.depth / 2 };
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
  /* 今のゾーンのスキン（ゾーン未構築でも落ちないようネオンを既定にする） */
  skin() {
    const s = (typeof Zones !== 'undefined') ? Zones.skin() : null;
    return s || (typeof ZoneNeon !== 'undefined' ? ZoneNeon.obstacleSkin : null);
  },
  skinId() { const s = Obstacles.skin(); return s ? s.id : 'neon'; },
  /* 旧 Obstacles.COL の窓口（今のスキンの配色） */
  get COL() { const s = Obstacles.skin(); return s ? s.COL : {}; },

  _material(key, color, opacity) {
    const k = Obstacles.skinId() + '|' + key;
    if (!Obstacles._mat[k]) {
      Obstacles._mat[k] = (opacity === undefined)
        ? new THREE.MeshLambertMaterial({ color: color, fog: true })
        : new THREE.MeshBasicMaterial({ color: color, fog: true, transparent: true, opacity: opacity, depthWrite: opacity > 0.75 });
    }
    return Obstacles._mat[k];
  },
  _emissive(key, color) {
    const k = Obstacles.skinId() + '|E' + key;
    if (!Obstacles._mat[k]) Obstacles._mat[k] = new THREE.MeshBasicMaterial({ color: color, fog: true });
    return Obstacles._mat[k];
  },

  _build(type) {
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
    const lamp = (r, color, x, y, z) => {
      const mat = new THREE.MeshBasicMaterial({ color: color, fog: true });
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
      m.position.set(x, y, z);
      g.add(m);
      g.userData.blink.push({ mesh: m, mat: mat, color: new THREE.Color(color) });
      return m;
    };
    /* 危険を示す斜めの縞。板の上に小さな箱を並べて彫る */
    const stripes = (gw, gh, z, y, n) => {
      for (let i = 0; i < n; i++) {
        const x = -gw / 2 + gw * (i + 0.5) / n;
        box(gw / n * 0.55, gh, 0.03, Obstacles._emissive('warn', C.warn), x, y, z, [0, 0, 0.5]);
      }
    };
    const x = { t: t, C: C, g: g, w: w, D: D, box: box, solid: solid,
                lamp: lamp, stripes: stripes, beamMat: beamMat, parts: parts };
    skin.build(type, x);

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


  /* プールから見た目を取り出す／返す（毎フレーム new しない）。プールはスキンごと。 */
  _poolOf(type) {
    const id = Obstacles.skinId();
    const byType = Obstacles._pool[id] || (Obstacles._pool[id] = {});
    return byType[type] || (byType[type] = []);
  },
  acquire(type) {
    const p = Obstacles._poolOf(type);
    const g = p.length ? p.pop() : Obstacles._build(type);
    g.visible = true;
    return g;
  },
  release(type, g) {
    g.visible = false;
    Obstacles._poolOf(type).push(g);
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
