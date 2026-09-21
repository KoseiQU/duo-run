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
  ROVER:   { span: 1, depth: 0.50, y0: 0.00, y1: 0.60, both: false, safe: ['jump'],  label: 'ローバー' },
  /* ハイバー（高い梁）: 下端0.5 → スライディング */
  HIBAR:   { span: 1, depth: 0.50, y0: 0.50, y1: 2.00, both: false, safe: ['slide'], label: 'ハイバー' },
  /* ピラー（柱）: 1レーン全高。床・天井の両方に効く → レーン移動のみ */
  PILLAR:  { span: 1, depth: 0.50, y0: 0.00, y1: CFG.H, both: true,  safe: [],       label: 'ピラー' },
  /* ギャップ（穴）: 面が抜けている。足が面に着いていると落ちる → ジャンプ */
  GAP:     { span: 1, depth: 1.60, y0: -1.60, y1: 0.04, both: false, safe: ['jump'], label: 'ギャップ' },
  /* ミッドレーザー: コリドー中央帯 0.5〜H-0.5 を塞ぐ → 両者ともスライディング（またはレーン移動） */
  LASER:   { span: 1, depth: 0.20, y0: 0.50, y1: CFG.H - 0.50, both: true, safe: ['slide'], label: 'ミッドレーザー' },
  /* ワイド梁: 2レーンを塞ぐ。高さ2.2でジャンプでは越えられない → 空いた1レーンへ */
  WIDEBAR: { span: 2, depth: 0.60, y0: 0.00, y1: 2.20, both: false, safe: [],        label: 'ワイド梁' }
};

const OBS_INSET = 0.10;   // レーン幅より少し細くして「隣接レーンの掠り死」を防ぐ

const Obstacles = {
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

  /* 当たり判定ボックス（絶対座標。dist は現在の走行距離） */
  box(o, dist) {
    const t = OBS[o.type];
    const x0 = (Obstacles.laneLo(o) - 0.5) * CFG.LANE_W + OBS_INSET;
    const x1 = (Obstacles.laneHi(o) + 0.5) * CFG.LANE_W - OBS_INSET;
    let y0, y1;
    if (t.both) { y0 = t.y0; y1 = t.y1; }
    else if (o.surface === 'floor') { y0 = t.y0; y1 = t.y1; }
    else { y0 = CFG.H - t.y1; y1 = CFG.H - t.y0; }
    const zc = -(o.at - dist);
    return { x0: x0, x1: x1, y0: y0, y1: y1, z0: zc - t.depth / 2, z1: zc + t.depth / 2 };
  },

  /* この障害物はこの面を走るキャラに効くか */
  affects(o, surface) { return o.surface === 'both' || o.surface === surface; },

  /* そのレーンに居たまま生き残れる動作の一覧（[] なら必ずレーン移動） */
  safeActs(o) { return OBS[o.type].safe; },

  /* ---- 見た目（P1は仮。プリミティブ＋発光色） ---------------------------- */
  _mat: {},
  _pool: {},
  _material(key, color, opacity) {
    if (!Obstacles._mat[key]) {
      Obstacles._mat[key] = new THREE.MeshBasicMaterial({
        color: color, fog: true,
        transparent: opacity !== undefined, opacity: opacity === undefined ? 1 : opacity
      });
    }
    return Obstacles._mat[key];
  },
  _build(type) {
    const t = OBS[type];
    const g = new THREE.Group();
    const w = (t.span * CFG.LANE_W) - OBS_INSET * 2;
    const add = (gw, gh, gd, matKey, color, y, opacity) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd),
                               Obstacles._material(matKey, color, opacity));
      m.position.y = y;
      g.add(m);
      return m;
    };
    if (type === 'ROVER') {
      add(w, 0.60, t.depth, 'roverBody', 0x123a4a, 0.30);
      add(w, 0.10, t.depth + 0.04, 'roverGlow', 0x35e0ff, 0.60);
    } else if (type === 'HIBAR') {
      add(w, 1.50, t.depth, 'hibarBody', 0x143048, 1.25);
      add(w, 0.10, t.depth + 0.04, 'hibarGlow', 0x35e0ff, 0.50);
    } else if (type === 'PILLAR') {
      add(w, CFG.H, t.depth, 'pillarBody', 0x2a1740, CFG.H / 2);
      add(w + 0.06, 0.10, t.depth + 0.04, 'pillarGlow', 0xd45cff, CFG.H / 2);
    } else if (type === 'GAP') {
      add(w, 1.60, t.depth, 'gapPit', 0x000000, -0.80);
      add(w, 0.06, 0.10, 'gapRim', 0xff4d6d, 0.03).position.z = -t.depth / 2;
      add(w, 0.06, 0.10, 'gapRim', 0xff4d6d, 0.03).position.z = t.depth / 2;
    } else if (type === 'LASER') {
      add(w, CFG.H - 1.0, t.depth, 'laserBeam', 0xff2d55, CFG.H / 2, 0.35);
      add(w, 0.08, t.depth + 0.02, 'laserCore', 0xff8899, CFG.H / 2);
    } else if (type === 'WIDEBAR') {
      add(w, 2.20, t.depth, 'widebarBody', 0x3a2410, 1.10);
      add(w, 0.10, t.depth + 0.04, 'widebarGlow', 0xffa23a, 2.15);
    }
    return g;
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
  /* 見た目を現在の距離に合わせて置く */
  place(o, dist) {
    const g = o.view;
    if (!g) return;
    const xc = ((Obstacles.laneLo(o) + Obstacles.laneHi(o)) / 2) * CFG.LANE_W;
    g.position.set(xc, 0, -(o.at - dist));
    // 天井側は X軸まわりに180度回す（負のスケールだと面の表裏が反転してしまう）
    if (o.surface === 'ceil') { g.position.y = CFG.H; g.rotation.x = Math.PI; }
    else { g.position.y = 0; g.rotation.x = 0; }
  }
};
