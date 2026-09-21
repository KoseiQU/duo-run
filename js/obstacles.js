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
  WALLSOLID: { span: 1, depth: 0.55, y0: 0.00, y1: 2.30,   both: false, safe: [],        label: '壁' }
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
      box(w, 0.11, 0.10, Obstacles._emissive('laserCore', 0xffa0a8), 0, beam, 0);
      box(w, 0.22, 0.18, Obstacles._material('laserHalo', C.red, 0.40), 0, beam, 0);
      box(w, beam, 0.04, Obstacles._material('laserCurtain', 0xff5a4d, 0.30), 0, beam / 2, 0);
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
      box(w * 0.50, hh, D * 0.8, Obstacles._material('laserHalo', C.red, 0.26), 0, yc, 0);
      box(w * 0.34, hh, 0.05, Obstacles._material('laserGlow', C.red, 0.55), 0, yc, 0);
      box(w * 0.16, hh, 0.08, Obstacles._emissive('laserCore', 0xff8e98), 0, yc, 0);
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
