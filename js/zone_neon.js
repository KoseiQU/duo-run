/* ============================================================================
   DUO RUN — zone_neon.js  ゾーン1「ネオン都市（夜・雨上がり）」の装飾
   契約 §3 描画方針 / §5 見た目

   ■ 作り方の方針（「見た目」でなく「作り方」で満たす）
   - テクスチャ画像は一切使わない。形はプリミティブの合成（_merge）で彫る。
   - 小物は **InstancedMesh 1つ＝1種類** に集約し、毎フレーム「スロット」を
     前方へ送り出す方式で無限に流す（種類が増えてもドローコールは種類数しか増えない）。
       slot = floor((dist - behind) / spacing) + k   … 走行距離から決まる整数
       スロット番号のハッシュで位置・高さ・色味を決めるので、同じ距離では必ず同じ景色になる。
   - 壁のある区間（ビル壁面・看板・配管）と開放区間（遠景のビル群が見える）を交互に出す。
       isWall(m) … 120m 周期で 80m が壁、40m が開放。
   - 「濡れた床」は鏡面ではなく、(a) 高光沢の路面マテリアル (b) ネオンの色を床に
     引き伸ばした加算ブレンドの反射帯 (c) 水たまり で作る。
   ============================================================================ */
'use strict';

const ZoneNeon = {
  /* ---- 配色（ネオン都市） -------------------------------------------------- */
  PAL: {
    fog:      0x1e2a5e,
    skyTop:   0x1b2456,
    skyMid:   0x3d2d80,
    skyLow:   0x6d3f95,
    road:     0x2e3766,
    wall:     0x475393,
    wallDark: 0x323c72,
    metal:    0x5b66a4,
    metalDim: 0x434d87,
    magenta:  0xff3ad0,
    cyan:     0x38e2ff,
    amber:    0xffb347,
    indigo:   0x8b9bff,
    warmWin:  0xffcf7a,
    coolWin:  0x86d8ff,
    rain:     0xaecbff
  },

  /* ---- 区間パターン -------------------------------------------------------- */
  WALL_PERIOD: 120,
  WALL_LEN: 80,
  isWall(m) {
    const p = ((m % ZoneNeon.WALL_PERIOD) + ZoneNeon.WALL_PERIOD) % ZoneNeon.WALL_PERIOD;
    return p < ZoneNeon.WALL_LEN;
  },

  /* ---- スロット番号 → 疑似乱数（0..1）。同じ距離なら必ず同じ景色 ---------- */
  hash(n, salt) {
    let x = (n * 374761393 + (salt | 0) * 668265263) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x = x ^ (x >>> 16);
    return (x >>> 0) / 4294967296;
  },

  /* ---- 形を彫るための合成（BufferGeometry を1つにまとめる） --------------- */
  _merge(parts) {
    const pos = [], nor = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.p ? p.p[0] : 0, p.p ? p.p[1] : 0, p.p ? p.p[2] : 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.r ? p.r[0] : 0, p.r ? p.r[1] : 0, p.r ? p.r[2] : 0)),
        new THREE.Vector3(p.s ? p.s[0] : 1, p.s ? p.s[1] : 1, p.s ? p.s[2] : 1));
      g.applyMatrix4(m);
      const a = g.attributes.position.array;
      const b = g.attributes.normal ? g.attributes.normal.array : null;
      for (let k = 0; k < a.length; k++) pos.push(a[k]);
      if (b) for (let k = 0; k < b.length; k++) nor.push(b[k]);
      g.dispose();
      if (p.g !== g) p.g.dispose && 0;   // 呼び出し側の素材ジオメトリは使い回す
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nor.length === pos.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    else out.computeVertexNormals();
    return out;
  },

  box(w, h, d) { return new THREE.BoxGeometry(w, h, d); },
  cyl(r, h, seg) { return new THREE.CylinderGeometry(r, r, h, seg || 6); },
  lam(color, opt) { return new THREE.MeshLambertMaterial(Object.assign({ color: color }, opt || {})); },
  bas(color, opt) { return new THREE.MeshBasicMaterial(Object.assign({ color: color }, opt || {})); },
  add(color, op) {
    return new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: op, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide
    });
  },

  /* ==========================================================================
     組み立て
     ========================================================================== */
  build(scene) {
    ZoneNeon.scene = scene;
    ZoneNeon.fields = [];
    ZoneNeon.propFields = [];
    ZoneNeon._dummy = new THREE.Object3D();
    ZoneNeon._t = 0;
    scene.fog = new THREE.Fog(ZoneNeon.PAL.fog, 22, 104);
    scene.background = new THREE.Color(ZoneNeon.PAL.fog);
    ZoneNeon._lights(scene);
    ZoneNeon._sky(scene);
    ZoneNeon._skyline(scene);
    ZoneNeon._corridorProps(scene);
    ZoneNeon._rain(scene);
  },

  /* ---- 光（環境光＋弱い平行光＋路面を舐めるネオンの点光源2つ） ------------ */
  _lights(scene) {
    scene.add(new THREE.AmbientLight(0x6f7fc0, 1.05));
    scene.add(new THREE.HemisphereLight(0x8a93d8, 0x3a2f6a, 0.85));
    const dir = new THREE.DirectionalLight(0x9fb0ff, 0.55);
    dir.position.set(0.5, 1, 0.55);
    scene.add(dir);
    /* 濡れた路面に流れるハイライトを作るための、街のネオンの点光源 */
    ZoneNeon.lightM = new THREE.PointLight(ZoneNeon.PAL.magenta, 6.0, 34, 2);
    ZoneNeon.lightC = new THREE.PointLight(ZoneNeon.PAL.cyan, 5.0, 34, 2);
    scene.add(ZoneNeon.lightM, ZoneNeon.lightC);
  },

  /* ---- 空（濃紺→紫のグラデーション。頂点カラーで作る＝画像なし） --------- */
  _sky(scene) {
    const g = new THREE.PlaneGeometry(520, 300, 1, 10);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(ZoneNeon.PAL.skyTop);
    const mid = new THREE.Color(ZoneNeon.PAL.skyMid);
    const low = new THREE.Color(ZoneNeon.PAL.skyLow);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getY(i) / 300) + 0.5;           // 0(下) .. 1(上)
      if (u > 0.5) c.copy(mid).lerp(top, (u - 0.5) / 0.5);
      else c.copy(low).lerp(mid, u / 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    m.position.set(0, 2, -170);
    m.renderOrder = -10;
    scene.add(m);
  },

  /* ---- 遠景のビル群（近・遠の2層。視差で流す。窓は発光の点） -------------- */
  _skyline(scene) {
    ZoneNeon.skyLayers = [];
    const LEN = 420;
    const mk = (opt) => {
      const bodyGeo = ZoneNeon.box(1, 1, 1);
      const bodyMat = ZoneNeon.lam(opt.color);
      const n = opt.count;
      const body = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
      const winGeo = ZoneNeon.box(0.9, 0.5, 0.06);
      const winMat = ZoneNeon.bas(opt.win, { transparent: true, opacity: opt.winOp });
      const wins = new THREE.InstancedMesh(winGeo, winMat, opt.winCount);
      const d = new THREE.Object3D();
      let wi = 0;
      for (let i = 0; i < n; i++) {
        const h = ZoneNeon.hash(i, opt.salt);
        const side = (i % 2) ? 1 : -1;
        const x = side * (opt.x + ZoneNeon.hash(i, opt.salt + 7) * opt.xSpread);
        const hgt = opt.hMin + ZoneNeon.hash(i, opt.salt + 3) * opt.hSpread;
        const w = opt.wMin + h * opt.wSpread;
        const z = -LEN * 2 * (i / n) - ZoneNeon.hash(i, opt.salt + 11) * 6;
        const yBase = -14;
        d.position.set(x, yBase + hgt / 2, z);
        d.rotation.set(0, (ZoneNeon.hash(i, opt.salt + 5) - 0.5) * 0.4, 0);
        d.scale.set(w, hgt, w * 0.9);
        d.updateMatrix();
        body.setMatrixAt(i, d.matrix);
        /* 窓の点灯（ビル正面に格子状。間引いて点ける） */
        const rows = Math.min(opt.winRows, Math.floor(hgt / 3));
        for (let r = 0; r < rows && wi < opt.winCount; r++) {
          for (let cc = -1; cc <= 1; cc++) {
            if (wi >= opt.winCount) break;
            if (ZoneNeon.hash(i * 97 + r * 13 + cc + 2, opt.salt + 21) > 0.55) continue;
            d.position.set(x + cc * w * 0.3, yBase + 2 + r * 3 + ZoneNeon.hash(r + i, 5) * 0.6,
                           z + (side > 0 ? -1 : 1) * 0 + w * 0.46);
            d.rotation.set(0, 0, 0);
            d.scale.set(w * 0.22, 1 + ZoneNeon.hash(r * 3 + i, 9) * 0.8, 1);
            d.updateMatrix();
            wins.setMatrixAt(wi++, d.matrix);
            }
        }
      }
      /* 余った窓インスタンスは畳んでおく */
      d.position.set(0, -9999, 0); d.scale.set(0.0001, 0.0001, 0.0001); d.updateMatrix();
      for (; wi < opt.winCount; wi++) wins.setMatrixAt(wi, d.matrix);
      const grp = new THREE.Group();
      grp.add(body); grp.add(wins);
      grp.userData = { par: opt.par, len: LEN };
      body.frustumCulled = false; wins.frustumCulled = false;
      scene.add(grp);
      ZoneNeon.skyLayers.push(grp);
    };
    /* 近景の層（大きい・暗いシルエット） */
    mk({ count: 64, winCount: 380, salt: 101, x: 10.5, xSpread: 9, hMin: 15, hSpread: 28,
         wMin: 3.4, wSpread: 4.0, color: 0x2b3266, win: ZoneNeon.PAL.warmWin, winOp: 0.85, winRows: 7, par: 0.55 });
    /* 遠景の層（小さい・空に近い色） */
    mk({ count: 60, winCount: 300, salt: 303, x: 26, xSpread: 18, hMin: 20, hSpread: 36,
         wMin: 5, wSpread: 7, color: 0x3b4280, win: ZoneNeon.PAL.coolWin, winOp: 0.6, winRows: 8, par: 0.22 });
  },

  /* ---- 雨（1つの LineSegments。落下はオブジェクトの移動で作る） ----------- */
  _rain(scene) {
    const N = 520;
    const pos = new Float32Array(N * 6);
    ZoneNeon.RAIN_CELL = 3.2;
    for (let i = 0; i < N; i++) {
      const x = (ZoneNeon.hash(i, 71) - 0.5) * 30;
      const y = ZoneNeon.hash(i, 73) * 22 - 7;
      const z = -ZoneNeon.hash(i, 79) * 108 + 8;
      const len = 0.30 + ZoneNeon.hash(i, 83) * 0.34;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.04; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z + 0.05;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: ZoneNeon.PAL.rain, transparent: true, opacity: 0.34, depthWrite: false
    }));
    m.frustumCulled = false;
    ZoneNeon.rain = new THREE.Group();
    ZoneNeon.rain.add(m);
    scene.add(ZoneNeon.rain);
  },

  /* ==========================================================================
     小物（InstancedMesh のスロット送り）
     field: { spacing, geo, mat, place(slot, m, t) -> {x,y,dz,rx,ry,rz,sx,sy,sz} | null }
     ========================================================================== */
  _field(spec) {
    const behind = (spec.behind === undefined) ? 16 : spec.behind;
    const count = Math.ceil((CFG.VIEW_FAR + behind) / spec.spacing) + 2;
    const mesh = new THREE.InstancedMesh(spec.geo, spec.mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (spec.order !== undefined) mesh.renderOrder = spec.order;
    ZoneNeon.scene.add(mesh);
    const f = { name: spec.name, mesh: mesh, count: count, spacing: spec.spacing,
                behind: behind, place: spec.place, prop: spec.prop !== false };
    ZoneNeon.fields.push(f);
    if (f.prop) ZoneNeon.propFields.push(f);
    return f;
  },

  _corridorProps(scene) {
    const P = ZoneNeon.PAL;
    const HW = CFG.HALF_W;           // 1.8
    const H = CFG.H;                 // 4.0
    const XW = HW + 0.16;            // 壁面の位置
    const hash = ZoneNeon.hash;
    const isWall = ZoneNeon.isWall;

    /* --- 1. ビル壁面パネル（壁区間の「壁」そのもの） ---------------------- */
    {
      const fp = [
        { g: ZoneNeon.box(0.55, H + 5.4, 7.9), p: [0, 0, 0] },                 // 本体（コリドー外へ厚みを持つ）
        { g: ZoneNeon.box(0.16, 0.30, 7.9), p: [-0.34, H * 0.5 - 0.1, 0] },    // 内側の帯
        { g: ZoneNeon.box(0.22, 0.22, 7.9), p: [-0.30, -H * 0.5 + 0.35, 0] },  // 幅木
        { g: ZoneNeon.box(0.22, 0.22, 7.9), p: [-0.30, H * 0.5 - 0.35, 0] },
        { g: ZoneNeon.box(0.40, 1.0, 0.36), p: [-0.22, -0.6, -2.4] },          // 出っ張り（柱型）
        { g: ZoneNeon.box(0.40, 1.0, 0.36), p: [-0.22, 0.9, 2.1] }
      ];
      /* 縦の方立てと各階の帯（のっぺりした壁面にしない） */
      for (let i = 0; i < 8; i++) fp.push({ g: ZoneNeon.box(0.10, H + 4, 0.14), p: [-0.28, 0, -3.5 + i * 1.0] });
      [-1.2, 0.35, 1.9].forEach((y) => fp.push({ g: ZoneNeon.box(0.13, 0.13, 7.9), p: [-0.29, y, 0] }));
      /* 窓の枠（凹み） */
      [[-0.9, -2.2], [0.8, 0.4], [-0.2, 2.6]].forEach((q) => {
        fp.push({ g: ZoneNeon.box(0.09, 0.74, 0.92), p: [-0.30, q[0], q[1]] });
        fp.push({ g: ZoneNeon.box(0.16, 0.10, 1.06), p: [-0.30, q[0] - 0.42, q[1]] });
      });
      const g = ZoneNeon._merge(fp);
      ZoneNeon._field({
        name: 'facade', spacing: 4, geo: g, mat: ZoneNeon.lam(P.wall),
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.28), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 2. 壁面の窓（暖色／寒色の2種） ----------------------------------- */
    [['warm', P.warmWin, 0.80, 31], ['cool', P.coolWin, 0.62, 53]].forEach((w, wi) => {
      const g = ZoneNeon._merge([
        { g: ZoneNeon.box(0.06, 0.52, 0.42), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.06, 0.52, 0.42), p: [0, 0, 0.62] }
      ]);
      ZoneNeon._field({
        name: 'window_' + w[0], spacing: 2.4, geo: g, mat: ZoneNeon.bas(w[1], { transparent: true, opacity: w[2] }),
        place(slot, m) {
          if (!isWall(m)) return null;
          if (hash(slot, w[3]) > 0.70) return null;
          const side = (hash(slot, w[3] + 1) > 0.5) ? 1 : -1;
          const y = 0.45 + hash(slot, w[3] + 2) * (H - 0.9);
          return { x: side * (XW - 0.03), y: y, dz: hash(slot, w[3] + 4) * 2.2,
                   sy: 0.6 + hash(slot, w[3] + 5) * 0.9 };
        }
      });
    });

    /* --- 3. 室外機（本体＋ファンの枠＋脚） -------------------------------- */
    {
      const g = ZoneNeon._merge([
        { g: ZoneNeon.box(0.34, 0.40, 0.56), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.06, 0.30, 0.30), p: [-0.19, 0, 0] },            // 前面のファン枠
        { g: ZoneNeon.cyl(0.13, 0.05, 8), p: [-0.21, 0, 0], r: [0, 0, Math.PI / 2] },
        { g: ZoneNeon.box(0.26, 0.05, 0.05), p: [0, -0.22, -0.2] },
        { g: ZoneNeon.box(0.26, 0.05, 0.05), p: [0, -0.22, 0.2] },
        { g: ZoneNeon.box(0.05, 0.05, 0.42), p: [-0.10, 0.24, 0] }          // 上の配管
      ]);
      ZoneNeon._field({
        name: 'ac', spacing: 4.5, geo: g, mat: ZoneNeon.lam(P.metalDim),
        place(slot, m) {
          if (!isWall(m)) return null;
          if (hash(slot, 11) > 0.86) return null;
          const side = (slot % 2) ? 1 : -1;
          const y = 0.55 + hash(slot, 13) * (H - 1.3);
          return { x: side * (XW - 0.18), y: y, ry: side > 0 ? Math.PI : 0,
                   dz: hash(slot, 17) * 2.5, sx: 0.9 + hash(slot, 19) * 0.4 };
        }
      });
    }

    /* --- 4. 配管（壁沿いに走る3本＋ブラケット） --------------------------- */
    {
      const L = 11.6;
      const g = ZoneNeon._merge([
        { g: ZoneNeon.cyl(0.075, L, 8), p: [0, 0.16, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneNeon.cyl(0.055, L, 8), p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneNeon.cyl(0.045, L, 6), p: [0, -0.15, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneNeon.box(0.12, 0.42, 0.10), p: [0.07, 0, -3.4] },
        { g: ZoneNeon.box(0.12, 0.42, 0.10), p: [0.07, 0, 1.2] },
        { g: ZoneNeon.box(0.12, 0.42, 0.10), p: [0.07, 0, 4.8] }
      ]);
      ZoneNeon._field({
        name: 'pipe', spacing: 11, geo: g, mat: ZoneNeon.lam(P.metal),
        place(slot, m) {
          if (!isWall(m + 5)) return null;
          const side = (slot % 2) ? 1 : -1;
          const y = 0.7 + hash(slot, 23) * (H - 1.6);
          return { x: side * (XW - 0.13), y: y, ry: side > 0 ? Math.PI : 0 };
        }
      });
    }

    /* --- 5. ネオン看板（縦書き風の細長い板）＋発光縁 ---------------------- */
    {
      const board = ZoneNeon._merge([
        { g: ZoneNeon.box(0.10, 1.70, 0.44), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.14, 0.10, 0.52), p: [0, 0.88, 0] },
        { g: ZoneNeon.box(0.14, 0.10, 0.52), p: [0, -0.88, 0] },
        { g: ZoneNeon.box(0.06, 0.06, 0.30), p: [0.08, 0.3, 0] }        // 壁への腕
      ]);
      const place = (slot, m) => {
        if (!isWall(m + 2)) return null;
        if (hash(slot, 29) > 0.80) return null;
        const side = (slot % 2) ? 1 : -1;
        const y = 0.95 + hash(slot, 31) * (H - 2.0);
        return { x: side * (XW - 0.10), y: y, dz: hash(slot, 37) * 3.0,
                 sy: 0.75 + hash(slot, 41) * 0.6 };
      };
      ZoneNeon._field({ name: 'sign', spacing: 7, geo: board, mat: ZoneNeon.lam(0x2a3160), place: place });
      /* 発光する文字帯（縦に刻む＝縦書き風） */
      const glowParts = [];
      for (let i = -3; i <= 3; i++) glowParts.push({ g: ZoneNeon.box(0.035, 0.16, 0.30), p: [-0.06, i * 0.24, 0] });
      glowParts.push({ g: ZoneNeon.box(0.03, 1.66, 0.04), p: [-0.06, 0, -0.20] });
      glowParts.push({ g: ZoneNeon.box(0.03, 1.66, 0.04), p: [-0.06, 0, 0.20] });
      const glow = ZoneNeon._merge(glowParts);
      [[P.magenta, 0], [P.cyan, 1]].forEach((cc) => {
        ZoneNeon._field({
          name: 'signGlow', spacing: 7, geo: glow, mat: ZoneNeon.bas(cc[0]), prop: false,
          place(slot, m, t) {
            if ((slot & 2) >> 1 !== cc[1]) return null;
            const o = place(slot, m);
            if (!o) return null;
            /* たまに明滅する看板 */
            const fl = hash(slot, 43);
            if (fl > 0.9 && Math.sin(t * 9 + slot) > 0.55) return null;
            return o;
          }
        });
      });
      /* 濡れた路面へのネオンの映り込み（加算ブレンドの帯・床と天井の両方） */
      const refl = new THREE.PlaneGeometry(0.75, 4.2);
      [['floor', 0.016, -Math.PI / 2], ['ceil', H - 0.016, Math.PI / 2]].forEach((s) => {
        ZoneNeon._field({
          name: 'signRefl_' + s[0], spacing: 7, geo: refl, mat: ZoneNeon.add(0xc46cff, 0.30), prop: false, order: 3,
          place(slot, m) {
            const o = place(slot, m);
            if (!o) return null;
            const side = (o.x > 0) ? 1 : -1;
            return { x: side * 1.42, y: s[1], rx: s[2], dz: o.dz, sy: 1.0 + hash(slot, 47) * 0.6 };
          }
        });
      });
    }

    /* --- 5b. 壁を這う水平のネオン管 --------------------------------------- */
    {
      const L = 3.4;
      const tube = ZoneNeon._merge([
        { g: ZoneNeon.cyl(0.035, L, 6), p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneNeon.cyl(0.05, 0.06, 6), p: [0, 0, -L / 2 + 0.05], r: [Math.PI / 2, 0, 0] },
        { g: ZoneNeon.cyl(0.05, 0.06, 6), p: [0, 0, L / 2 - 0.05], r: [Math.PI / 2, 0, 0] },
        { g: ZoneNeon.box(0.04, 0.34, 0.04), p: [0.03, -0.18, -L / 2 + 0.4] }
      ]);
      [[P.magenta, 151, 0], [P.cyan, 157, 1], [P.amber, 163, 2]].forEach((cc) => {
        const placeN = (slot, m) => {
          if (!isWall(m + 1.5)) return null;
          if ((slot % 3) !== cc[2]) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW - 0.09), y: 0.5 + hash(slot, cc[1]) * (H - 1.0),
                   ry: side > 0 ? Math.PI : 0, dz: hash(slot, cc[1] + 1) * 2 };
        };
        ZoneNeon._field({ name: 'tube', spacing: 5, geo: tube, mat: ZoneNeon.bas(cc[0]), place: placeN });
        const refl = new THREE.PlaneGeometry(0.5, 3.4);
        ZoneNeon._field({
          name: 'tubeRefl', spacing: 5, geo: refl, mat: ZoneNeon.add(cc[0], 0.16), prop: false, order: 3,
          place(slot, m) {
            const o = placeN(slot, m);
            if (!o) return null;
            const side = (o.x > 0) ? 1 : -1;
            const ceil = o.y > H * 0.5;
            return { x: side * 1.55, y: ceil ? H - 0.02 : 0.02, rx: ceil ? Math.PI / 2 : -Math.PI / 2, dz: o.dz };
          }
        });
      });
    }

    /* --- 6. ホログラム広告（開放区間の空中。回転＋明滅） ------------------ */
    {
      const g = ZoneNeon._merge([
        { g: new THREE.PlaneGeometry(1.5, 2.1), p: [0, 0, 0] },
        { g: ZoneNeon.box(1.56, 0.06, 0.02), p: [0, 1.06, 0] },
        { g: ZoneNeon.box(1.56, 0.06, 0.02), p: [0, -1.06, 0] }
      ]);
      ZoneNeon._field({
        name: 'holo', spacing: 19, geo: g, mat: ZoneNeon.add(P.cyan, 0.26), order: 2,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          const fl = 0.55 + 0.45 * Math.sin(t * 5.5 + slot * 2.1);
          return { x: side * (3.4 + hash(slot, 53) * 1.6), y: 1.2 + hash(slot, 59) * 3.4,
                   ry: t * 0.8 + slot, sx: 1, sy: fl > 0.35 ? 1 : 0.02 };
        }
      });
      ZoneNeon._field({
        name: 'holo2', spacing: 23, geo: g, mat: ZoneNeon.add(P.magenta, 0.22), order: 2,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? -1 : 1;
          return { x: side * (4.6 + hash(slot, 61) * 2), y: -0.8 + hash(slot, 67) * 5.4,
                   ry: -t * 0.6 + slot, sy: 0.8 + 0.2 * Math.sin(t * 3 + slot) };
        }
      });
    }

    /* --- 7. ダクト（壁の上部を這う太い角ダクト） -------------------------- */
    {
      const L = 7.6;
      const g = ZoneNeon._merge([
        { g: ZoneNeon.box(0.42, 0.42, L), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.48, 0.48, 0.08), p: [0, 0, -L / 2 + 0.6] },
        { g: ZoneNeon.box(0.48, 0.48, 0.08), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.48, 0.48, 0.08), p: [0, 0, L / 2 - 0.6] },
        { g: ZoneNeon.box(0.10, 0.34, 0.10), p: [0.22, 0.34, -1.8] }
      ]);
      ZoneNeon._field({
        name: 'duct', spacing: 15, geo: g, mat: ZoneNeon.lam(P.metalDim),
        place(slot, m) {
          if (!isWall(m + 3)) return null;
          const side = (slot % 2) ? 1 : -1;
          const y = (hash(slot, 71) > 0.5) ? H - 0.42 : 0.42;
          return { x: side * (XW - 0.24), y: y, ry: side > 0 ? Math.PI : 0 };
        }
      });
    }

    /* --- 8. 非常階段（踏板＋手すり） -------------------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 7; i++) parts.push({ g: ZoneNeon.box(0.46, 0.04, 0.26), p: [0, -0.9 + i * 0.30, -0.9 + i * 0.26] });
      parts.push({ g: ZoneNeon.box(0.05, 0.05, 2.5), p: [0.20, 0.15, 0], r: [-0.72, 0, 0] });
      parts.push({ g: ZoneNeon.box(0.05, 0.05, 2.5), p: [-0.20, 0.15, 0], r: [-0.72, 0, 0] });
      parts.push({ g: ZoneNeon.box(0.52, 0.06, 0.06), p: [0, 1.15, 0.85] });
      parts.push({ g: ZoneNeon.box(0.52, 0.06, 0.06), p: [0, -1.05, -0.95] });
      const g = ZoneNeon._merge(parts);
      ZoneNeon._field({
        name: 'stairs', spacing: 24, geo: g, mat: ZoneNeon.lam(P.metal),
        place(slot, m) {
          if (!isWall(m + 4)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW - 0.30), y: H * 0.5 + (hash(slot, 73) - 0.5) * 0.8, ry: side > 0 ? Math.PI : 0 };
        }
      });
    }

    /* --- 9. 電線とガイシ（壁の上の方を渡る） ------------------------------ */
    {
      const L = 9.4;
      const parts = [
        { g: ZoneNeon.box(0.03, 0.03, L), p: [0, 0, 0], r: [0.02, 0, 0] },
        { g: ZoneNeon.box(0.03, 0.03, L), p: [0.10, -0.10, 0], r: [-0.015, 0, 0] },
        { g: ZoneNeon.box(0.025, 0.025, L), p: [-0.09, -0.18, 0], r: [0.03, 0, 0] },
        { g: ZoneNeon.cyl(0.05, 0.14, 6), p: [0.05, 0.10, -L / 2 + 0.4] },
        { g: ZoneNeon.cyl(0.05, 0.14, 6), p: [0.05, 0.10, L / 2 - 0.4] },
        { g: ZoneNeon.box(0.26, 0.06, 0.06), p: [0.06, 0.18, -L / 2 + 0.4] },
        { g: ZoneNeon.box(0.26, 0.06, 0.06), p: [0.06, 0.18, L / 2 - 0.4] }
      ];
      const g = ZoneNeon._merge(parts);
      ZoneNeon._field({
        name: 'wire', spacing: 9, geo: g, mat: ZoneNeon.lam(0x3a4272),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const y = (hash(slot, 79) > 0.5) ? H - 0.55 : 0.62;
          return { x: side * (XW - 0.08), y: y, ry: side > 0 ? Math.PI : 0 };
        }
      });
    }

    /* --- 10. 信号機（柱＋灯体）＋点灯 ------------------------------------- */
    {
      const body = ZoneNeon._merge([
        { g: ZoneNeon.box(0.07, 0.07, 0.62), p: [0, 0, -0.30], r: [0, 0, 0] },  // 壁からのアーム
        { g: ZoneNeon.box(0.26, 0.62, 0.20), p: [0, -0.24, -0.58] },
        { g: ZoneNeon.box(0.30, 0.06, 0.26), p: [0, 0.06, -0.58] }
      ]);
      const placeT = (slot, m) => {
        if (!isWall(m + 1)) return null;
        if (hash(slot, 83) > 0.55) return null;
        const side = (slot % 2) ? 1 : -1;
        const y = 0.8 + hash(slot, 89) * (H - 1.8);
        return { x: side * (XW - 0.06), y: y, ry: side > 0 ? 0 : Math.PI };
      };
      ZoneNeon._field({ name: 'signal', spacing: 13, geo: body, mat: ZoneNeon.lam(0x424a80), place: placeT });
      const lamp = ZoneNeon._merge([{ g: ZoneNeon.cyl(0.07, 0.04, 8), p: [0, -0.06, -0.69], r: [Math.PI / 2, 0, 0] }]);
      ZoneNeon._field({
        name: 'signalLamp', spacing: 13, geo: lamp, mat: ZoneNeon.bas(0xff5a4d), prop: false,
        place(slot, m, t) {
          const o = placeT(slot, m);
          if (!o) return null;
          if (Math.sin(t * 2.4 + slot * 1.7) < -0.5) return null;   // 点滅
          return o;
        }
      });
    }

    /* --- 11. 標識（柱＋板） ----------------------------------------------- */
    {
      const g = ZoneNeon._merge([
        { g: ZoneNeon.box(0.05, 0.05, 0.42), p: [0, 0, -0.21] },
        { g: ZoneNeon.box(0.02, 0.46, 0.62), p: [0, -0.02, -0.44], r: [0, 0.35, 0] },
        { g: ZoneNeon.box(0.03, 0.10, 0.52), p: [-0.02, 0.10, -0.44], r: [0, 0.35, 0] }
      ]);
      ZoneNeon._field({
        name: 'roadsign', spacing: 12, geo: g, mat: ZoneNeon.lam(0x5c6499),
        place(slot, m) {
          if (!isWall(m + 6)) return null;
          if (hash(slot, 97) > 0.7) return null;
          const side = (slot % 2) ? -1 : 1;
          return { x: side * (XW - 0.05), y: 0.6 + hash(slot, 101) * (H - 1.6), ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 12. マンホール（路面・天井面） ----------------------------------- */
    {
      const g = ZoneNeon._merge([
        { g: ZoneNeon.cyl(0.26, 0.03, 12), p: [0, 0, 0] },
        { g: ZoneNeon.cyl(0.20, 0.035, 12), p: [0, 0.004, 0] },
        { g: ZoneNeon.box(0.34, 0.04, 0.04), p: [0, 0.006, 0] },
        { g: ZoneNeon.box(0.04, 0.04, 0.34), p: [0, 0.006, 0] }
      ]);
      ZoneNeon._field({
        name: 'manhole', spacing: 8, geo: g, mat: ZoneNeon.lam(0x4a5288),
        place(slot, m) {
          if (hash(slot, 103) > 0.8) return null;
          const ceil = (slot % 2) === 1;
          const lane = CFG.LANES[Math.floor(hash(slot, 107) * 3)] * CFG.LANE_W;
          return { x: lane + (hash(slot, 109) - 0.5) * 0.4, y: ceil ? H - 0.015 : 0.015,
                   rx: ceil ? Math.PI : 0, dz: hash(slot, 113) * 4 };
        }
      });
    }

    /* --- 13. 水たまり（暗い鏡面＋加算のにじみ） --------------------------- */
    {
      const disc = new THREE.CircleGeometry(0.5, 14);
      const place = (slot, m) => {
        if (hash(slot, 127) > 0.72) return null;
        const ceil = (slot % 2) === 1;
        const x = (hash(slot, 131) - 0.5) * 3.0;
        return { x: x, y: ceil ? H - 0.012 : 0.012, rx: ceil ? Math.PI / 2 : -Math.PI / 2,
                 dz: hash(slot, 137) * 4.5,
                 sx: 0.7 + hash(slot, 139) * 1.5, sy: 1.1 + hash(slot, 149) * 1.9 };
      };
      ZoneNeon._field({
        name: 'puddle', spacing: 5.5, geo: disc, order: 1,
        mat: new THREE.MeshStandardMaterial({ color: 0x38437e, roughness: 0.05, metalness: 0.28 }),
        place: place
      });
      ZoneNeon._field({
        name: 'puddleGlow', spacing: 5.5, geo: disc, mat: ZoneNeon.add(0x8d7cff, 0.34), prop: false, order: 4,
        place(slot, m) {
          const o = place(slot, m);
          if (!o) return null;
          return { x: o.x, y: o.y + (o.rx > 0 ? -0.004 : 0.004), rx: o.rx, dz: o.dz,
                   sx: o.sx * 0.8, sy: o.sy * 0.75 };
        }
      });
    }

    /* --- 14. レーンの破線（路面が流れて見える） --------------------------- */
    {
      const g = ZoneNeon.box(0.07, 0.02, 1.0);
      ZoneNeon._field({
        name: 'dash', spacing: 1.6, geo: g, mat: ZoneNeon.bas(0x9fb0e8, { transparent: true, opacity: 0.5 }), prop: false,
        place(slot) {
          const k = slot & 3;
          const x = (k & 1) ? 0.6 : -0.6;
          const ceil = (k & 2) !== 0;
          return { x: x, y: ceil ? H - 0.012 : 0.012 };
        }
      });
    }

    /* --- 15. ガードレール（開放区間の縁） --------------------------------- */
    {
      const g = ZoneNeon._merge([
        { g: ZoneNeon.box(0.08, 0.52, 0.08), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.05, 0.09, 2.7), p: [0.02, 0.20, 0] },
        { g: ZoneNeon.box(0.05, 0.07, 2.7), p: [0.02, -0.02, 0] }
      ]);
      ZoneNeon._field({
        name: 'rail', spacing: 2.7, geo: g, mat: ZoneNeon.lam(0x6e78b4),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.22), y: ceil ? H - 0.26 : 0.26, ry: side > 0 ? Math.PI : 0,
                   rz: ceil ? Math.PI : 0 };
        }
      });
    }

    /* --- 16. 街灯（開放区間。琥珀の灯） ----------------------------------- */
    {
      const body = ZoneNeon._merge([
        { g: ZoneNeon.box(0.09, 2.2, 0.09), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.62, 0.08, 0.08), p: [-0.30, 1.06, 0] },
        { g: ZoneNeon.box(0.26, 0.10, 0.22), p: [-0.58, 0.98, 0] }
      ]);
      const placeL = (slot, m) => {
        if (isWall(m)) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.5), y: ceil ? H - 1.15 : 1.15, ry: side > 0 ? Math.PI : 0,
                 rz: ceil ? Math.PI : 0 };
      };
      ZoneNeon._field({ name: 'lamp', spacing: 9, geo: body, mat: ZoneNeon.lam(0x5f68a6), place: placeL });
      const bulb = ZoneNeon._merge([{ g: ZoneNeon.box(0.20, 0.05, 0.17), p: [-0.58, 0.92, 0] }]);
      ZoneNeon._field({ name: 'lampBulb', spacing: 9, geo: bulb, mat: ZoneNeon.bas(P.amber), prop: false, place: placeL });
      /* 街灯の下の濡れた路面のにじみ */
      const refl = new THREE.PlaneGeometry(1.1, 3.0);
      ZoneNeon._field({
        name: 'lampRefl', spacing: 9, geo: refl, mat: ZoneNeon.add(P.amber, 0.20), prop: false, order: 3,
        place(slot, m) {
          const o = placeL(slot, m);
          if (!o) return null;
          const ceil = ((slot >> 1) % 2) === 1;
          const side = (o.x > 0) ? 1 : -1;
          return { x: side * 1.5, y: ceil ? H - 0.018 : 0.018, rx: ceil ? Math.PI / 2 : -Math.PI / 2 };
        }
      });
    }

    /* --- 17. ガントリー（開放区間で床と天井の道をつなぐ架構） ------------- */
    {
      const g = ZoneNeon._merge([
        { g: ZoneNeon.box(0.34, H + 1.6, 0.34), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.22, 0.22, 0.9), p: [0, -H * 0.5 - 0.5, 0] },
        { g: ZoneNeon.box(0.22, 0.22, 0.9), p: [0, H * 0.5 + 0.5, 0] },
        { g: ZoneNeon.box(0.9, 0.18, 0.18), p: [-0.4, -H * 0.4, 0], r: [0, 0, 0.7] },
        { g: ZoneNeon.box(0.9, 0.18, 0.18), p: [-0.4, H * 0.4, 0], r: [0, 0, -0.7] }
      ]);
      ZoneNeon._field({
        name: 'gantry', spacing: 17, geo: g, mat: ZoneNeon.lam(0x525c9c),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (HW + 0.75), y: H * 0.5 };
        }
      });
      const stripe = ZoneNeon._merge([
        { g: ZoneNeon.box(0.06, 0.34, 0.36), p: [0, -1.1, 0] },
        { g: ZoneNeon.box(0.06, 0.34, 0.36), p: [0, 0, 0] },
        { g: ZoneNeon.box(0.06, 0.34, 0.36), p: [0, 1.1, 0] }
      ]);
      ZoneNeon._field({
        name: 'gantryGlow', spacing: 17, geo: stripe, mat: ZoneNeon.bas(P.magenta), prop: false,
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (HW + 0.75) - side * 0.19, y: H * 0.5 };
        }
      });
    }
  },

  /* ==========================================================================
     毎フレームの送り出し
     ========================================================================== */
  sync(dist, t) {
    if (!ZoneNeon.scene) return;
    ZoneNeon._t = t;
    const d = ZoneNeon._dummy;
    let ahead = 0;
    const fs = ZoneNeon.fields;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      const base = Math.floor((dist - f.behind) / f.spacing);
      for (let k = 0; k < f.count; k++) {
        const slot = base + k;
        const m = slot * f.spacing;
        const o = f.place(slot, m, t, dist);
        if (!o) {
          d.position.set(0, -9999, 0);
          d.rotation.set(0, 0, 0);
          d.scale.set(0.0001, 0.0001, 0.0001);
        } else {
          const zz = -(m + (o.dz || 0) - dist);
          d.position.set(o.x, o.y, zz);
          d.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
          d.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
          if (f.prop && -zz >= -1 && -zz <= 60) ahead++;
        }
        d.updateMatrix();
        f.mesh.setMatrixAt(k, d.matrix);
      }
      f.mesh.instanceMatrix.needsUpdate = true;
    }
    ZoneNeon.aheadCount = ahead;

    /* 遠景の2層を視差で流す（インスタンスは作り直さず、層ごと動かす） */
    for (let i = 0; i < ZoneNeon.skyLayers.length; i++) {
      const g = ZoneNeon.skyLayers[i];
      const u = g.userData;
      g.position.z = (dist * u.par) % u.len;
    }

    /* 雨（落下＝オブジェクトの移動。粒子バッファは触らない） */
    if (ZoneNeon.rain) {
      const cell = ZoneNeon.RAIN_CELL;
      ZoneNeon.rain.position.y = -((t * 17) % cell);
      ZoneNeon.rain.position.z = (dist % 7.0);
    }

    /* 街のネオンの点光源を流して、濡れた路面にハイライトを走らせる */
    if (ZoneNeon.lightM) {
      const a = 44, b = 31;
      ZoneNeon.lightM.position.set(-1.7, 0.9, -(a - (dist % a)));
      ZoneNeon.lightC.position.set(1.7, CFG.H - 0.9, -(b - (dist % b)));
    }
  },

  /* 監査用: 前方60mに見えている小物の数 */
  propsAhead() { return ZoneNeon.aheadCount || 0; }
};
