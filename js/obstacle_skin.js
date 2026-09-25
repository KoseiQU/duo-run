/* ============================================================================
   DUO RUN — obstacle_skin.js  障害物の共通デザイン（契約 §4.3【全面改訂 v2】）

   ■ 方針（2026-09-24 ユーザー実機評）
     ・**同じ仕組みは全ステージで同じ見た目**（ゾーン差し替えのスキンは失効）。
     ・障害物の色は **赤・橙・白の警告色のみ**（プレイヤーの琥珀・藍は使わない）。
       例外はレーザーネットの帯の色分け（床＝琥珀／天井＝藍／無関係＝白）だけ。
     ・光る部分は霧を掛けない（Obstacles._glow）＝暗い無地の道から障害物だけが浮く。

     ハードル（ROVER）        太い白×赤縞の発光バー（幅レーン一杯・厚み0.3。下は薄い赤の幕）
     ローレーザー            赤い水平光線＋両端の小さな発生装置
     ピラー                  赤黒の縞の柱（全高）
     ワイド梁                赤黒の縞のゲート（判定どおりの高さ。床＋天井の対で全高）
     縦レーザー（光柱）      赤い光柱＋床天井の発生装置
     動くレーザー            上記レーザーの色・形のまま動く（予告線は白）

   ■ 判定（OBS）は一切変えない。寸法はすべて OBS の y0/y1/depth/span から引く
     （見た目と判定のズレ ±10% / tests/test_p2a.js）。判定の外の標示を足すときは
     x.deco() で印を付け、ズレ検査から外す。
   ============================================================================ */
'use strict';

const ObstacleSkin = {
  id: 'common',
  /* 共通の配色（ここ以外に障害物の色を書かない） */
  COL: {
    red: 0xff4a30,        // 警告の赤（縞・光線）。純赤は輝度が低い（Y≈54）ので少し橙へ寄せる
    redSide: 0xd8301c,    // 側面の赤（面の向きが読めるよう少し暗く）
    black: 0x1c0707,      // 縞の黒
    white: 0xffffff,      // 白（ハードルの縞・縁取り）
    orange: 0xff8a1e,     // 橙
    dev: 0x2b2e35,        // 回転レーザーの台座など（無彩色の暗色）
    emit: 0xd9dde3,       // レーザーの発生装置（明るい無彩色＝暗い道で装置の位置が読める）
    core: 0xffe2dc,       // 光線の芯（白に近い赤）
    /* ギミックの骨組み（obstacles.js の kit）が読む互換の名前 */
    body: 0xc9ced6, dark: 0x2b2e35, steel: 0x7d848f, deep: 0x16181c,
    warn: 0xff8a1e, red2: 0xff3a26, cyan: 0xffffff, pit: 0x07070a, amber: 0xffb347
  },
  /* ゲート（当たり判定なし＝障害物ではない目印）の色。意味で分ける（§8 P4b/P5a/P5b） */
  GATE_COL: { WARPGATE: 0xffd45e, ZEROGATE: 0x8fe4ff, MIRGATE: 0xdfe8ff,
              SWAPGATE: 0xc07aff, MERGEGATE: 0xff9a3a, NETGATE: 0xd8e4f2 },

  /* 斜めの縞（45度）。矩形 [x0,x1]×[y0,y1] を切り抜いた平行四辺形の Shape の配列。
     sw = 縞の幅・pitch = 間隔（どちらも縞に直交する向きの m）。 */
  stripeShapes(x0, x1, y0, y1, sw, pitch) {
    const out = [];
    const clip = (poly, f) => {
      const r = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const fa = f(a), fb = f(b);
        if (fa >= 0) r.push(a);
        if ((fa >= 0) !== (fb >= 0)) {
          const k = fa / (fa - fb);
          r.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
        }
      }
      return r;
    };
    const SW = sw * Math.SQRT2, P = pitch * Math.SQRT2;
    const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let c = (y0 - x1) - P; c < (y1 - x0); c += P) {
      let poly = clip(rect, (q) => (q[1] - q[0]) - c);
      poly = clip(poly, (q) => (c + SW) - (q[1] - q[0]));
      if (poly.length < 3) continue;
      const sh = new THREE.Shape();
      sh.moveTo(poly[0][0], poly[0][1]);
      for (let k = 1; k < poly.length; k++) sh.lineTo(poly[k][0], poly[k][1]);
      sh.closePath();
      out.push(sh);
    }
    return out;
  },

  /* 赤黒の縞のブロック（ピラー・ワイド梁・空中の柱）。
     x0..x1 × y0..y1 × z0..z1 を判定どおりに塞ぐ。正面と両側面に黒の縞、正面の縦の縁は白。 */
  stripedBlock(x, x0, x1, y0, y1, z0, z1, opt) {
    const S = ObstacleSkin, C = S.COL, G = Obstacles._glow;
    opt = opt || {};
    const red = G('red', C.red), side = G('redSide', C.redSide), blk = G('black', C.black), wht = G('white', C.white);
    const W = x1 - x0, Hh = y1 - y0, D = z1 - z0, xc = (x0 + x1) / 2, yc = (y0 + y1) / 2, zc = (z0 + z1) / 2;
    x.box(W, Hh, D, red, xc, yc, zc);
    /* 側面（少し暗い赤）＋縞 */
    [-1, 1].forEach((s) => {
      const sx = (s < 0) ? x0 - 0.004 : x1 + 0.004;
      x.box(0.006, Hh, D, side, sx, yc, zc);
      S.stripeShapes(z0, z1, y0, y1, 0.17, 0.50).forEach((sh) => {
        x.solid(new THREE.ShapeGeometry(sh), blk, sx + s * 0.005, 0, 0, [0, s * Math.PI / 2, 0]);
      });
    });
    /* 正面の縞 */
    S.stripeShapes(x0, x1, y0, y1, 0.17, 0.50).forEach((sh) => {
      x.solid(new THREE.ShapeGeometry(sh), blk, 0, 0, z1 + 0.004);
    });
    /* 縁の白い光（正面の縦の縁＋上下）。判定の内側に収める */
    const E = opt.edge || 0.08;
    [-1, 1].forEach((s) => x.box(E, Hh, 0.03, wht, (s < 0) ? x0 + E / 2 : x1 - E / 2, yc, z1 + 0.012));
    if (opt.topEdge !== false) x.box(W, E, 0.03, wht, xc, y1 - E / 2, z1 + 0.012);
    if (opt.bottomEdge) x.box(W, E, 0.03, wht, xc, y0 + E / 2, z1 + 0.012);
  },

  /* 白×赤縞の発光バー（ハードル・倒れた柱・牙）。高さ top の判定を持つ跳ぶ障害物。
     バーは上端から 0.30（厚み）。その下は薄い赤の幕で「跳べ」を示す。 */
  hurdle(x, w, D, top, colA, colB, n) {
    const G = Obstacles._glow, C = ObstacleSkin.COL;
    const TH = 0.30, BD = D * 0.9;
    const a = G('hA' + colA.toString(16), colA), b = G('hB' + colB.toString(16), colB);
    n = n || Math.max(4, Math.round(w / 0.2));
    if (n % 2) n++;
    for (let i = 0; i < n; i++) {
      x.box(w / n, TH, BD, (i % 2) ? b : a, -w / 2 + w * (i + 0.5) / n, top - TH / 2, 0);
    }
    /* 下の幕（判定 0〜top を塞いでいることを見せる。薄い＝道の暗さは残す） */
    x.box(w, top - TH, 0.05, G('hCurtain', C.red, 0.22), 0, (top - TH) / 2, 0);
    /* 手前の路面の赤い帯（契約§4.3「可」）は置かない: 40m 先で帯の暗い赤が障害物の平均輝度を
       下げ、背景との差（+40）を割った（実測 コア +35）。路面は無地のまま */
  },

  build(type, x) {
    const S = ObstacleSkin, C = S.COL, G = Obstacles._glow;
    const t = x.t, w = x.w, D = x.D, beamMat = x.beamMat;
    const H = CFG.H;
    if (type === 'ROVER' || type === 'FISH_TOOTH') {
      S.hurdle(x, w, D, t.y1, C.white, C.red);

    } else if (type === 'COLUMN') {
      S.hurdle(x, w, D, t.y1, C.white, C.red);

    } else if (type === 'SLOWBAND') {
      /* 減速帯（死なない）: 危険物と取り違えないよう白×橙 */
      S.hurdle(x, w, D, t.y1, C.white, C.orange);

    } else if (type === 'PILLAR' || type === 'DRONE' || type === 'SIGNFRAG' ||
               type === 'FISH_FIN' || type === 'FISH_TAIL' || type === 'WIRE2') {
      /* 赤黒の縞の柱（全高・床天井の両方に効く） */
      S.stripedBlock(x, -w / 2, w / 2, 0, t.y1, -D * 0.45, D * 0.45, { bottomEdge: true });

    } else if (type === 'WIDEBAR' || type === 'ADPANEL') {
      /* 赤黒の縞のゲート（2レーン）。判定どおりの高さ（2.2）＝ 床と天井の対で全高になる */
      S.stripedBlock(x, -w / 2, w / 2, 0, t.y1, -D * 0.45, D * 0.45, { bottomEdge: true, edge: 0.12 });

    } else if (type === 'LASER_LOW') {
      /* 赤い水平光線＋両端の小さな発生装置 */
      const y1 = t.y1, beam = y1 * 0.72;
      const dev = G('emit', C.emit);
      [-1, 1].forEach((s) => {
        x.box(0.12, y1, D, dev, s * (w / 2 - 0.06), y1 / 2, 0);
        x.box(0.13, 0.08, D + 0.02, G('red', C.red), s * (w / 2 - 0.06), beam, 0);
      });
      x.box(w - 0.2, 0.14, 0.10, beamMat(G('core', C.core)), 0, beam, 0);
      x.box(w - 0.2, 0.28, 0.18, beamMat(G('halo', C.red, 0.70)), 0, beam, 0);

    } else if (type === 'LASER_V' || type === 'LASER_SCAN') {
      /* 赤い光柱＋床天井の発生装置（横スキャンも同じ形のまま横へ動く） */
      const dev = G('emit', C.emit);
      [[0.08, 1], [H - 0.08, -1]].forEach((e) => {
        x.box(w, 0.16, D, dev, 0, e[0], 0);
        x.box(w * 0.7, 0.05, D + 0.02, G('red', C.red), 0, e[0] + e[1] * 0.10, 0);
      });
      const hh = H - 0.32, yc = H / 2;
      x.box(w * 0.62, hh, D * 0.8, beamMat(G('haloV', C.red, 0.22)), 0, yc, 0);
      x.box(w * 0.40, hh, 0.06, beamMat(G('glowV', C.red, 0.70)), 0, yc, 0);
      x.box(w * 0.18, hh, 0.08, beamMat(G('core', C.core)), 0, yc, 0);

    } else if (type === 'LASER_ROT') {
      /* 回転レーザーの発振器（腕・カーテンは buildMoving／place が bands から置く） */
      const dev = G('dev', C.dev);
      x.box(w * 0.92, 0.26, D * 1.3, dev, 0, 0.13, 0);
      x.box(w * 0.5, 0.10, D * 1.15, G('red', C.red), 0, 0.30, 0);

    } else if (type === 'BRIDGE') {
      /* 崩れる橋（契約§4.5 改訂 v2）: 白い石板・暗い梁・橙の縁（踏むと赤）・谷の底は赤く光る */
      x.bridge({
        pit: G('pit', C.pit),
        deep: G('red', C.red),
        slab: G('brgSlab', 0xaeb4be),          // 暗い道から浮く明るい石板（霧を掛けない）
        beam: G('dev', C.dev),
        post: G('dev', C.dev)
      });

    } else if (type === 'ROCK') {
      /* 転がる丸岩（契約§4.5 新・遺跡）: 赤茶の球＋白いひび（§4.3 の赤/橙/白の系統）。
         球は陰影で転がりが読めるよう Lambert（霧は掛けない＋自発光で暗い道から浮かせる） */
      const body = Obstacles._mat['common|rockBody'] || (Obstacles._mat['common|rockBody'] =
        new THREE.MeshLambertMaterial({ color: 0xd2603a, emissive: 0x6e2412, fog: false }));
      x.rockKit({
        body: body,
        crack: G('white', C.white),
        shade: G('rockPath', 0x000000, 0.45),
        shadow: G('rockShadow', 0x000000, 0.55),
        dust: G('rockDust', 0xecebe9, 0.55)
      });

    } else if (type === 'SHARK') {
      /* サメの横断（契約§4.5 新・深海）: 正面から迫る巨大な影。2レーン幅×全高の判定を体で埋める。
         白×赤の縞（胴の輪）・腹側が白・目は赤（白目の中に赤い瞳）・口に白い歯。
         胴の後ろへ伸びる尾は判定の外（deco）。見た目は横スキャン光柱と同じく丸ごと横へ滑る。 */
      const red = G('red', C.red), wht = G('white', C.white), blk = G('black', C.black);
      const eye = G('sharkEye', 0xff2a14);
      const hw = w / 2, hd = D / 2, yc = 2.0, ry = 1.78, rx = hw * 0.98;
      x.solid(new THREE.SphereGeometry(1, 20, 14), red, 0, yc, 0, null, [rx, ry, hd]);
      /* 腹（下 40%）は白 */
      x.solid(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, Math.PI * 0.60, Math.PI * 0.40), wht,
              0, yc, 0, null, [rx * 1.02, ry * 1.02, hd * 1.05]);
      /* 白の縞（胴の上半分を巻く輪） */
      [0.30, 0.56, 0.80].forEach((u) => {
        const yy = yc + ry * u;
        const k = Math.sqrt(Math.max(0, 1 - u * u));
        x.solid(new THREE.TorusGeometry(1, 0.07, 5, 30), wht, 0, yy, 0, [Math.PI / 2, 0, 0],
                [rx * k * 1.01, hd * k * 1.03, 1]);
      });
      const zf = (ex, ey) => hd * Math.sqrt(Math.max(0.04, 1 - Math.pow(ex / rx, 2) - Math.pow((ey - yc) / ry, 2)));
      /* 目: 白目＋赤い瞳（胴の縞の間・左右の高い所） */
      [-1, 1].forEach((s) => {
        const ex = s * rx * 0.50, ey = yc + ry * 0.43;
        const ez = zf(ex, ey);
        x.solid(new THREE.SphereGeometry(0.27, 12, 8), wht, ex, ey, ez - 0.06, null, [1, 1, 0.45]);
        x.solid(new THREE.SphereGeometry(0.16, 12, 8), eye, ex, ey, ez + 0.02, null, [1, 1, 0.45]);
      });
      /* 大きく開いた口（暗い裂け目）に上下の白い歯 */
      const my = yc - ry * 0.10, mh = 0.46, mz = zf(0, my);
      x.box(rx * 1.30, mh, 0.08, blk, 0, my, mz - 0.01);
      for (let i = 0; i < 9; i++) {
        const tx = -rx * 0.60 + rx * 1.20 * i / 8;
        x.solid(new THREE.ConeGeometry(0.075, 0.20, 4), wht, tx, my + mh / 2 - 0.09, mz + 0.03, [Math.PI, 0, 0]);
        if (i % 2 === 0) x.solid(new THREE.ConeGeometry(0.07, 0.17, 4), wht, tx + rx * 0.07, my - mh / 2 + 0.08, mz + 0.03);
      }
      /* 胸びれ（2レーンの端まで・下向き）と背びれ（天井まで） */
      [-1, 1].forEach((s) => {
        x.box(hw * 0.70, 0.14, hd * 1.3, red, s * (hw - hw * 0.35), yc - ry * 0.55, -0.02, [0, 0, s * -0.38]);
      });
      x.solid(new THREE.ConeGeometry(0.40, CFG.H - (yc + ry) + 0.45, 4), red, 0, (CFG.H + yc + ry - 0.45) / 2, -0.08,
              null, [0.35, 1, 1]);
      /* 尾（判定の外＝後ろへ伸びる影） */
      const tr = x.deco(G('sharkTail', C.red)), tw = x.deco(G('sharkTailW', C.white));
      x.solid(new THREE.ConeGeometry(1, 2.6, 10), tr, 0, yc, -hd - 1.25, [-Math.PI / 2, 0, 0], [rx * 0.7, 1, ry * 0.55]);
      x.box(0.10, ry * 1.5, 0.5, tw, 0, yc + 0.1, -hd - 2.6);

    } else if (type === 'VENT') {
      /* 泡の噴出口（契約§4.5 新・深海）: 床の白い円＋立ちのぼる泡の粒。踏むと跳ばされる（死なない） */
      const wht = G('white', C.white);
      x.solid(new THREE.TorusGeometry(0.42, 0.06, 6, 24), wht, 0, 0.03, 0, [Math.PI / 2, 0, 0]);
      x.solid(new THREE.CylinderGeometry(0.40, 0.44, 0.04, 20), G('dev', C.dev), 0, 0.02, 0);
      x.solid(new THREE.TorusGeometry(0.22, 0.035, 5, 18), wht, 0, 0.045, 0, [Math.PI / 2, 0, 0]);

    } else if (OBS[type].gate) {
      x.gateKit({ col: S.GATE_COL[type] || 0xd8e4f2, frame: G('dev', C.dev) });
    } else if (type === 'ZEROFIELD') {
      x.zeroFieldKit({ col: 0x8fe4ff });
    } else if (OBS[type].net) {
      x.netKit({ node: G('dev', C.dev) });
    } else if (type === 'SHARDGAP') {
      x.shardKit({ pit: G('pit', C.pit), body: Obstacles._material('sdBody', 0xc9d2de), dark: G('dev', C.dev) });
    } else if (OBS[type].pad) {
      x.padKit({ stone: G('dev', C.dev) });
    } else if (type === 'SYNCGAP') {
      x.syncKit({ stone: Obstacles._material('sgStone', 0x9aa0a8), pit: G('pit', C.pit) });
    }
  },

  /* 動く部品（マージしない。place() が bands()/MOT から毎フレーム置く） */
  buildMoving(type, g, w, t, x) {
    const C = ObstacleSkin.COL, G = Obstacles._glow;
    if (type === 'LASER_SCAN' || type === 'SHARK') {
      /* 到達位置の予告（白）＋掃引範囲の薄い白帯（サメは2レーン幅） */
      const MW = OBS[type].span * CFG.LANE_W - 0.16;
      const mark = new THREE.Group();
      [[0.02, 1], [CFG.H - 0.02, -1]].forEach((e) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(MW, 3.4), G('scanMark', C.white, 0.26));
        m.rotation.x = -Math.PI / 2 * e[1];
        m.position.set(0, e[0], 0);
        m.renderOrder = 4;
        mark.add(m);
        const b = new THREE.Mesh(new THREE.BoxGeometry(MW, 0.05, 0.10), G('white', C.white));
        b.position.set(0, e[0] + e[1] * 0.03, -1.55);
        mark.add(b);
      });
      g.add(mark);
      g.userData.mark = mark;
      const range = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9), G('scanRange', C.white, 0.10));
      range.rotation.x = -Math.PI / 2;
      range.position.y = 0.012;
      range.renderOrder = 3;
      /* 予告は判定の外（見た目と判定のズレ検査から外す） */
      mark.traverse((q) => { if (q.isMesh) q.userData.deco = true; });
      range.userData.deco = true;
      g.add(range);
      g.userData.range = range;

    } else if (type === 'VENT') {
      /* 泡の粒（判定の外）。place() が噴出口の上に立ちのぼらせ、跳ばされた直後は噴き上げる */
      const N = 16;
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), G('bubble', 0xf4f4f4, 0.62), N);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.userData.deco = true;
      im.renderOrder = 4;
      g.add(im);
      g.userData.vent = { bubbles: im, n: N, dummy: new THREE.Object3D() };

    } else if (type === 'LASER_V' || type === 'LASER_LOW') {
      /* 点滅レーザーが消えている間の「待機表示」（暗い白の筋＝装置はそこにある） */
      const isV = (type === 'LASER_V');
      const hh = isV ? (OBS[type].y1 - OBS[type].y0) : 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * (isV ? 0.30 : 0.8), isV ? hh - 0.32 : 0.05, 0.05),
                               G('standby', C.white, 0.18));
      m.position.set(0, isV ? CFG.H / 2 : 0.43, 0);
      m.visible = false;
      g.add(m);
      g.userData.standby = m;

    } else if (type === 'LASER_ROT') {
      const R = CFG.LASER.ROT_R, TH = CFG.LASER.ROT_W;
      const mkArm = (ghost) => {
        const arm = new THREE.Group();
        const sc = new THREE.Group();
        arm.add(sc);
        const halo = new THREE.Mesh(new THREE.BoxGeometry(1, TH, TH),
                                    ghost ? G('rotGhost', C.white, 0.20) : G('rotHalo', C.red, 0.60));
        halo.position.x = 0.5;
        sc.add(halo);
        if (!ghost) {
          const core = new THREE.Mesh(new THREE.BoxGeometry(1, TH * 0.34, TH * 0.34), G('core', C.core));
          core.position.x = 0.5;
          sc.add(core);
        }
        arm.userData = { sc: sc };
        g.add(arm);
        return arm;
      };
      g.userData.ghost = mkArm(true);       // 到達時の角度の予告（白）
      g.userData.arm = mkArm(false);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), G('rotCurtain', C.red, 0.32),
                                         CFG.LASER.ROT_SLATS + 1);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.renderOrder = 2;
      g.add(im);
      g.userData.slats = { mesh: im, dummy: new THREE.Object3D(), n: CFG.LASER.ROT_SLATS + 1 };
      g.userData.armR = R;
    }
  }
};
