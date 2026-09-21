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
    dark: 0x2b3466, steel: 0x6a75b4, deep: 0x1c2246,
    warn: 0xff8a1e, warnDim: 0x6b3a08, red: 0xff3355, amber: 0xffb347,
    cyan: 0x38e2ff, magenta: 0xff3ad0, pit: 0x03040c
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
    g.userData = { blink: [], spin: [] };
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
      const matB = Obstacles._material('roverBody', C.dark);
      box(w, 0.075, D * 0.55, matB, 0, 0.55, 0);                 // 上の板
      box(w, 0.075, D * 0.55, matB, 0, 0.36, 0);                 // 下の板
      stripes(w - 0.02, 0.07, D * 0.30, 0.55, 5);
      stripes(w - 0.02, 0.07, D * 0.30, 0.36, 5);
      [-1, 1].forEach((s) => {
        box(0.07, 0.60, 0.07, Obstacles._material('roverLeg', C.steel), s * (w / 2 - 0.08), 0.30, 0);
        box(0.10, 0.10, D * 0.9, Obstacles._material('roverFoot', C.steel), s * (w / 2 - 0.08), 0.05, 0);
      });
      box(w * 0.98, 0.05, 0.05, Obstacles._emissive('roverGlow', C.red), 0, 0.615, 0);
      lamp(0.055, C.warn, -w / 2 + 0.10, 0.645, 0);
      lamp(0.055, C.warn, w / 2 - 0.10, 0.645, 0);

    } else if (type === 'HIBAR') {
      /* 壁の穴（契約 §4.3 改訂）: そのレーンを塞ぐ全高の工事用鉄板壁。
         下端に高さ0.5の潜り穴が1つだけ空いていて、そこをスライディングで抜ける。
         ※ 当たり判定は現行 OBS の梁（0.50〜2.00）のまま。見た目の上端 4.00 は
            判定の上端 2.00 を超えるが、跳んでも必ず梁に当たるので抜け道は増えない
            （全高化は段階2で OBS ごと改修する）。 */
      const y0 = t.y0;                    // 0.50 = 潜り穴の高さ
      const TOP = CFG.H;                  // 見た目は全高の壁
      const matW = Obstacles._material('holeWall', C.dark);
      const matR = Obstacles._material('holeRib', C.steel);
      box(w, TOP - y0, D * 0.55, matW, 0, (TOP + y0) / 2, 0);                 // 鉄板本体
      for (let i = 0; i < 5; i++) {                                           // 波板の縦リブ
        box(0.07, TOP - y0 - 0.08, D * 0.72, matR, -w / 2 + 0.12 + (w - 0.24) * i / 4, (TOP + y0) / 2, 0);
      }
      box(w, 0.10, D * 0.82, matR, 0, TOP - 0.05, 0);                         // 上のフレーム
      box(w, 0.12, D * 0.86, matR, 0, y0 + 0.06, 0);                          // 穴の上の桁
      [-1, 1].forEach((s2) => box(0.09, y0, D * 0.78, matR, s2 * (w / 2 - 0.045), y0 / 2, 0)); // 穴の左右の柱
      box(w, 0.06, D + 0.06, Obstacles._emissive('holeWarn', C.warn), 0, y0 + 0.015, 0);      // 穴の縁の警告帯
      /* 穴の足元を光らせて「ここを潜れ」と示す（路面の誘導帯） */
      box(w * 0.86, 0.03, D + 0.16, Obstacles._emissive('holeGuide', C.cyan), 0, 0.025, 0);
      [-1, 1].forEach((s2) => box(0.05, y0 - 0.05, 0.05, Obstacles._emissive('holeGuide', C.cyan),
                                  s2 * (w / 2 - 0.10), (y0 - 0.05) / 2, D / 2 + 0.03));
      stripes(w - 0.06, 0.12, D / 2 + 0.04, y0 + 0.17, 7);
      box(w * 0.5, 0.12, 0.05, Obstacles._emissive('holeSign', C.red), 0, y0 + 0.42, D / 2 + 0.03, [0, 0, 0]);
      lamp(0.055, C.warn, -w / 2 + 0.09, y0 + 0.10, D / 2 + 0.03);
      lamp(0.055, C.warn, w / 2 - 0.09, y0 + 0.10, D / 2 + 0.03);

    } else if (type === 'PILLAR') {
      /* 支柱（全高）＋縦のネオン。床天井の両方に効くので上下対称に彫る */
      const H = CFG.H;
      box(w * 0.82, H, D * 0.9, Obstacles._material('pillarBody', C.dark), 0, H / 2, 0);
      [-1, 1].forEach((s) => box(0.09, H, D + 0.04, Obstacles._material('pillarEdge', C.steel), s * (w / 2 - 0.05), H / 2, 0));
      box(w * 0.16, H - 0.2, 0.05, Obstacles._emissive('pillarNeon', C.magenta), 0, H / 2, D / 2 + 0.01);
      [0.35, 0.95, 1.55, 2.45, 3.05, 3.65].forEach((y) => {
        box(w * 0.7, 0.10, 0.04, Obstacles._emissive('pillarWarn', C.warn), 0, y, D / 2 + 0.02, [0, 0, 0.45]);
      });
      lamp(0.06, C.red, 0, H - 0.18, D / 2 + 0.04);
      lamp(0.06, C.red, 0, 0.18, D / 2 + 0.04);

    } else if (type === 'GAP') {
      /* 崩れた路面。穴の見た目の幅 = 判定の depth(1.6) ちょうど。
         床タイルは穴の周囲ごと消えるので、判定の外側は「埋め板」で路面に戻す。 */
      const half = D / 2;
      const matPit = Obstacles._material('gapPit', C.pit);
      box(w, 0.04, D, matPit, 0, -1.55, 0);                        // 底
      [-1, 1].forEach((s) => {
        box(w, 1.6, 0.05, matPit, 0, -0.8, s * half);              // 穴の前後の内壁
        box(0.05, 1.6, D, matPit, s * (w / 2), -0.8, 0);           // 左右の内壁
      });
      /* 判定の外側（タイルが消える範囲）を路面に戻す埋め板 */
      const fillMat = Obstacles._material('gapFill', 0x232b52);
      [-1, 1].forEach((s) => box(CFG.LANE_W - 0.07, 0.14, 3.0, fillMat, 0, -0.075, s * 2.3));
      /* 縁の警告灯とちぎれた鉄筋 */
      [-1, 1].forEach((s) => {
        box(w, 0.09, 0.14, Obstacles._emissive('gapRim', C.warn), 0, 0.05, s * half);
        box(0.10, 0.09, D, Obstacles._emissive('gapRim', C.warn), s * (w / 2 - 0.03), 0.05, 0);
        lamp(0.06, C.red, -w / 2 + 0.12, 0.10, s * half);
        lamp(0.06, C.red, w / 2 - 0.12, 0.10, s * half);
        box(0.04, 0.26, 0.04, Obstacles._material('gapBar', C.steel), s * 0.22, -0.06, s * (half - 0.06), [0.5, 0, 0.3]);
        box(0.04, 0.22, 0.04, Obstacles._material('gapBar', C.steel), -s * 0.36, -0.10, s * (half - 0.10), [-0.4, 0, -0.2]);
      });

    } else if (type === 'LASER') {
      /* 縦レーザー＝光柱（契約 §4.3 改訂）: 1レーンを全高で塞ぐ赤い光柱。横に避ける物。
         判定は y 0.50〜3.50 の1レーン壁（現行 OBS のまま）。両脇の支柱だけ全高に伸ばし、
         「このレーンは通れない」と一目で分かるようにする（支柱はレーン端なので
         隣レーンの掠り死は起きない）。 */
      const y0 = t.y0, y1 = t.y1, hh = y1 - y0, yc = (y0 + y1) / 2;
      const matDev = Obstacles._material('laserDev', C.dark);
      [-1, 1].forEach((s2) => {
        box(0.10, CFG.H, D * 0.85, matDev, s2 * (w / 2 - 0.05), CFG.H / 2, 0);
        box(0.14, 0.10, D + 0.06, Obstacles._emissive('laserWarn', C.warn), s2 * (w / 2 - 0.05), y0 + 0.05, 0);
        box(0.14, 0.10, D + 0.06, Obstacles._emissive('laserWarn', C.warn), s2 * (w / 2 - 0.05), y1 - 0.05, 0);
      });
      box(w * 0.46, hh, D * 0.8, Obstacles._material('laserHalo', C.red, 0.20), 0, yc, 0);
      box(w * 0.30, hh, 0.04, Obstacles._material('laserGlow', C.red, 0.5), 0, yc, 0);
      box(w * 0.14, hh, 0.07, Obstacles._emissive('laserCore', 0xff7a88), 0, yc, 0);
      [[y0, 1], [y1, -1]].forEach((e) => {
        box(w * 0.66, 0.15, D + 0.20, matDev, 0, e[0] + e[1] * 0.08, 0);      // 発生装置
        box(w * 0.5, 0.05, 0.08, Obstacles._emissive('laserWarn', C.warn), 0, e[0] + e[1] * 0.02, D / 2 + 0.10);
      });
      lamp(0.05, C.red, 0, y0 + 0.30, D / 2 + 0.12);

    } else if (type === 'WIDEBAR') {
      /* 工事用ゲート（2レーン・高さ 2.20 = 判定どおり）。空いた1レーンへ逃げる */
      const H2 = t.y1;
      const matF = Obstacles._material('wideFrame', C.steel);
      box(w, 0.14, D * 0.8, matF, 0, H2 - 0.07, 0);                 // 上枠
      box(w, 0.12, D * 0.8, matF, 0, 0.06, 0);                      // 下枠
      [-1, 1].forEach((s) => box(0.12, H2, D * 0.8, matF, s * (w / 2 - 0.06), H2 / 2, 0));
      box(w - 0.3, H2 - 0.3, D * 0.25, Obstacles._material('wideNet', C.deep), 0, H2 / 2, 0);
      for (let i = 0; i < 6; i++) {
        box(0.06, H2 - 0.3, 0.05, Obstacles._material('wideBarM', 0x3a4680, 0.9),
            -w / 2 + 0.2 + (w - 0.4) * i / 5, H2 / 2, D * 0.16);
      }
      stripes(w - 0.1, 0.13, D / 2 + 0.05, H2 - 0.16, 10);
      stripes(w - 0.1, 0.13, D / 2 + 0.05, 0.14, 10);
      box(w, 0.05, 0.05, Obstacles._emissive('wideGlow', C.warn), 0, H2 + 0.02, 0);
      lamp(0.06, C.warn, -w / 2 + 0.14, H2 + 0.06, 0);
      lamp(0.06, C.warn, w / 2 - 0.14, H2 + 0.06, 0);
      lamp(0.05, C.red, 0, H2 * 0.5, D / 2 + 0.06);
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
      g.add(new THREE.Mesh(ZoneNeon._merge(byMat[k].list), byMat[k].mat));
      byMat[k].list.forEach((x) => x.g.dispose());
    }
    return g;
  },
  /* P2b 用の見た目プリセット（契約 §4.3 ローレーザー＝床/天井近くの水平光線・ジャンプで越える）。
     当たり判定も生成もまだ無いので、ここでは「作り方」だけ置いておく。
     段階2で OBS に LOWLASER を足したら _build から呼ぶこと。 */
  buildLowLaserPreset(height) {
    const C = Obstacles.COL;
    const y = (height === undefined) ? 0.45 : height;    // 光線の高さ（ジャンプで越える）
    const w = CFG.LANE_W - OBS_INSET * 2;
    const g = new THREE.Group();
    g.userData = { blink: [] };
    const put = (gw, gh, gd, mat, x, yy, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
      m.position.set(x, yy, z); g.add(m); return m;
    };
    [-1, 1].forEach((s) => {
      put(0.12, y + 0.22, 0.16, Obstacles._material('lowlDev', C.dark), s * (w / 2 + 0.04), (y + 0.22) / 2, 0);
      const lm = new THREE.MeshBasicMaterial({ color: C.warn, fog: true });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lm);
      b.position.set(s * (w / 2 + 0.04), y + 0.16, 0.06);
      g.add(b); g.userData.blink.push({ mesh: b, mat: lm, color: new THREE.Color(C.warn) });
    });
    put(w + 0.1, 0.05, 0.05, Obstacles._emissive('laserCore', 0xff7a88), 0, y, 0);
    put(w + 0.1, 0.13, 0.13, Obstacles._material('laserHalo', C.red, 0.20), 0, y, 0);
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
  /* 見た目を現在の距離に合わせて置く（t は点滅灯の位相に使う） */
  place(o, dist, t) {
    const g = o.view;
    if (!g) return;
    /* 警告灯の明滅。位相は障害物の位置から決めるので、個体ごとにずれる */
    const bl = g.userData && g.userData.blink;
    if (bl && bl.length) {
      const k = (Math.sin((t || 0) * 5.5 + o.at * 0.9) > 0) ? 1 : 0.16;
      for (let i = 0; i < bl.length; i++) bl[i].mat.color.copy(bl[i].color).multiplyScalar(k);
    }
    const xc = ((Obstacles.laneLo(o) + Obstacles.laneHi(o)) / 2) * CFG.LANE_W;
    g.position.set(xc, 0, -(o.at - dist));
    // 天井側は Z軸まわりに180度回す（X軸まわりだと前後が裏返り、
    // 手前に向けた警告色の面が奥を向いてしまう。負のスケールは表裏が反転するので使わない）
    if (o.surface === 'ceil') { g.position.y = CFG.H; g.rotation.set(0, 0, Math.PI); }
    else { g.position.y = 0; g.rotation.set(0, 0, 0); }
  }
};
