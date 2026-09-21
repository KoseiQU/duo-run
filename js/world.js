/* ============================================================================
   DUO RUN — world.js  コリドー・カメラ・2体の造形・描画
   ・造形はプリミティブの合成のみ（テクスチャ画像なし / 契約 §3）
   ・路面／天井面は InstancedMesh 1つずつ（ドローコール削減）。ギャップは
     インスタンスを畳んで「穴」にし、判定との差は障害物側の埋め板で吸収する。
   ・ゾーンの装飾（ネオン都市の小物・遠景・雨・光）は js/zone_neon.js に分離。
   ・カメラはコリドー中央 y=H/2 に置き、床側と天井側の見え方を対称にする（§4.1）。
   ============================================================================ */
'use strict';

const World = {
  ready: false,
  TILE: 3.0,            // 路面スラブ1枚の長さ（ギャップの穴の粒度もこれで決まる）
  TILE_BEHIND: 12,      // カメラ後方に残す長さ

  init(canvas) {
    if (World.ready) return;
    const P = ZoneNeon.PAL;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setClearColor(P.fog, 1);
    World.renderer = renderer;

    const scene = new THREE.Scene();
    World.scene = scene;

    World.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    World.camera.position.set(0, CFG.CAM.Y, CFG.CAM.Z);

    /* --- ゾーン装飾（光・空・遠景・小物・雨） ------------------------------ */
    ZoneNeon.build(scene);

    /* --- 路面／天井面（濡れた高光沢のスラブ。InstancedMesh 1つ） ---------- */
    const tileGeo = new THREE.BoxGeometry(CFG.LANE_W - 0.07, 0.14, World.TILE - 0.10);
    const roadMat = new THREE.MeshStandardMaterial({
      color: P.road, roughness: 0.18, metalness: 0.46
    });
    World.nTiles = Math.ceil((CFG.VIEW_FAR + World.TILE_BEHIND) / World.TILE) + 2;
    World.tileMesh = {};
    ['floor', 'ceil'].forEach((surface) => {
      const im = new THREE.InstancedMesh(tileGeo, roadMat, World.nTiles * CFG.LANES.length);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(im);
      World.tileMesh[surface] = im;
    });
    World._dummy = new THREE.Object3D();

    /* --- 道路の厚み（スラブの側面）と縁の発光ライン ------------------------ */
    const LONG = CFG.VIEW_FAR + 60;
    const zc = -(LONG / 2) + World.TILE_BEHIND;
    const skirtMat = ZoneNeon.lam(0x252e5e);
    [-1, 1].forEach((s) => {
      [[0.02, 1], [CFG.H - 0.02, -1]].forEach((c) => {
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, LONG), skirtMat);
        skirt.position.set(s * (CFG.HALF_W + 0.06), c[0] - c[1] * 0.22, zc);
        scene.add(skirt);
      });
    });
    /* 琥珀＝床＝左手 / 藍＝天井＝右手 が一目で分かる縁のライン */
    const lineGeo = new THREE.BoxGeometry(0.07, 0.05, LONG);
    const glowGeo = new THREE.PlaneGeometry(0.42, LONG);
    [-1, 1].forEach((s) => {
      [['floor', 0.05, ZoneNeon.PAL.amber, -Math.PI / 2], ['ceil', CFG.H - 0.05, ZoneNeon.PAL.indigo, Math.PI / 2]].forEach((c) => {
        const l = new THREE.Mesh(lineGeo, ZoneNeon.bas(c[2]));
        l.position.set(s * (CFG.HALF_W - 0.05), c[1], zc);
        scene.add(l);
        const gl = new THREE.Mesh(glowGeo, ZoneNeon.add(c[2], 0.26));
        gl.position.set(s * (CFG.HALF_W - 0.28), (c[0] === 'floor') ? 0.014 : CFG.H - 0.014, zc);
        gl.rotation.x = c[3];
        gl.renderOrder = 3;
        scene.add(gl);
      });
    });

    /* --- 障害物の容れ物 ---------------------------------------------------- */
    World.obsRoot = new THREE.Group();
    scene.add(World.obsRoot);

    /* --- 2体 --------------------------------------------------------------- */
    World.runnerViews = {};
    World._t = 0;
    World._dist = 0;
    World.ready = true;
    World._fovBoost = 0;
    World.resize();
  },

  /* ==========================================================================
     2体の造形（お面方式は禁止＝顔はジオメトリで彫る / 契約 §4.1）
     LUMEN: 丸い琥珀の発光体の子ども
     UMBRA: 同じ骨格だが 角ばった耳・尖った髪・マント でシルエットが違う影の子
     ========================================================================== */
  buildRunner(id) {
    const isL = (id === 'lumen');
    const g = new THREE.Group();          // 足元が原点
    const body = new THREE.Group();       // 姿勢（前傾・スライドの倒れ）の親
    g.add(body);

    /* 2体とも「発光体の子ども」。環境光が寒色なので、自発光を主にして色を保つ */
    const skin = isL ? 0xffd089 : 0x9486f2;
    const limbC = isL ? 0xffa94d : 0x7f71e4;
    const deep = isL ? 0xd2600a : 0x3d2fb4;
    const hot = isL ? 0xfff0c8 : 0xd9d0ff;
    const matSkin = new THREE.MeshStandardMaterial({
      color: skin, emissive: isL ? 0xff8c1a : 0x4c3ad2, emissiveIntensity: 0.95,
      roughness: 0.45, metalness: 0.02
    });
    const matLimb = new THREE.MeshStandardMaterial({
      color: limbC, emissive: deep, emissiveIntensity: 0.8, roughness: 0.55, metalness: 0.02
    });
    const matDark = ZoneNeon.bas(isL ? 0x3a1a04 : 0x150c38);
    const matHot = ZoneNeon.bas(hot);
    const matCape = new THREE.MeshStandardMaterial({
      color: 0x6153cf, emissive: 0x2a1f8e, emissiveIntensity: 0.9,
      roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide
    });

    const add = (parent, geo, mat, pos, rot, scl) => {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (scl) m.scale.set(scl[0], scl[1], scl[2]);
      parent.add(m);
      return m;
    };

    /* --- 胴 ---------------------------------------------------------------- */
    const torso = add(body, new THREE.CapsuleGeometry(0.135, 0.20, 4, 10), matSkin,
                      [0, 0.50, 0], null, isL ? [1.06, 1, 0.92] : [0.94, 1.04, 0.86]);
    /* 胸の発光核（LUMEN=灯り / UMBRA=沈んだ光）。2体は -z へ走るので胸は -z 側 */
    add(body, new THREE.SphereGeometry(0.055, 10, 8), matHot, [0, 0.52, -0.12]);
    /* 腰 */
    add(body, new THREE.CapsuleGeometry(0.115, 0.06, 4, 10), matLimb, [0, 0.355, 0], null, [1.1, 1, 0.9]);

    /* --- 頭（顔はジオメトリで彫る） ---------------------------------------- */
    const head = new THREE.Group();
    head.position.set(0, 0.665, 0);
    body.add(head);
    const skull = add(head, new THREE.SphereGeometry(0.145, 16, 14), matSkin, [0, 0.12, 0],
                      null, isL ? [1, 0.98, 0.96] : [0.93, 1.02, 0.94]);
    /* 眉（庇）＝額の張り出し */
    add(head, new THREE.BoxGeometry(0.155, 0.022, 0.035), matLimb, [0, 0.186, -0.109], [-0.30, 0, 0]);
    /* 目＝窪み（暗い凹球）＋ 光点 */
    [-1, 1].forEach((s) => {
      add(head, new THREE.SphereGeometry(0.038, 10, 8), matDark,
          [s * 0.058, 0.122, -0.112], null, [1, 1.05, 0.45]);
      add(head, new THREE.SphereGeometry(0.015, 8, 6), matHot, [s * 0.063, 0.132, -0.134]);
    });
    /* 鼻＝小さな突起 */
    add(head, new THREE.ConeGeometry(0.022, 0.05, 6), matSkin, [0, 0.095, -0.142], [-Math.PI / 2, 0, 0]);
    /* 頬＝ふくらみ */
    [-1, 1].forEach((s) => {
      add(head, new THREE.SphereGeometry(0.036, 8, 6), matLimb, [s * 0.098, 0.068, -0.088], null, [1, 0.8, 0.7]);
    });
    /* 口＝彫った円弧（LUMENは笑い口、UMBRAは引き結んだ口） */
    if (isL) {
      add(head, new THREE.TorusGeometry(0.038, 0.011, 5, 10, Math.PI), matDark,
          [0, 0.045, -0.125], [-0.1, Math.PI, Math.PI]);
    } else {
      add(head, new THREE.BoxGeometry(0.06, 0.013, 0.03), matDark, [0, 0.035, -0.132]);
    }
    /* 耳／髪でシルエットを変える */
    if (isL) {
      /* LUMEN: 丸い耳＋やわらかい前髪の房 */
      [-1, 1].forEach((s) => add(head, new THREE.SphereGeometry(0.030, 8, 6), matSkin,
                                 [s * 0.142, 0.108, 0.005], null, [0.6, 1, 0.9]));
      add(head, new THREE.SphereGeometry(0.108, 12, 8), matSkin, [0, 0.215, 0.012], null, [1.1, 0.5, 1.02]);
      add(head, new THREE.TorusGeometry(0.085, 0.014, 6, 12, Math.PI), matHot, [0, 0.225, 0.01], [Math.PI / 2, 0, 0]);
    } else {
      /* UMBRA: 尖った耳＋逆立った髪＋フードの襟 */
      [-1, 1].forEach((s) => add(head, new THREE.ConeGeometry(0.036, 0.14, 5), matLimb,
                                 [s * 0.125, 0.205, 0.005], [0, 0, -s * 0.42]));
      [-0.055, 0.005, 0.065].forEach((x, i) => add(head, new THREE.ConeGeometry(0.038, 0.15 + i * 0.02, 5), matLimb,
                                                   [x, 0.20, 0.055], [1.05, 0, 0.12 - i * 0.12]));
      add(head, new THREE.SphereGeometry(0.115, 12, 8), matCape, [0, 0.135, 0.055], null, [1.02, 1.0, 0.72]);
    }
    /* 背中の見え方（2体は常に後ろ姿で走る）
       LUMEN: 背骨に沿った琥珀の光条 / UMBRA: 肩にかかる短いマント */
    let cape = null;
    if (isL) {
      add(body, new THREE.BoxGeometry(0.075, 0.26, 0.03), matHot, [0, 0.52, 0.125]);
      add(body, new THREE.SphereGeometry(0.05, 8, 6), matHot, [0, 0.655, 0.10], null, [1.4, 0.5, 0.6]);
    } else {
      cape = new THREE.Group();
      cape.position.set(0, 0.615, 0.055);
      body.add(cape);
      add(cape, new THREE.CylinderGeometry(0.135, 0.185, 0.42, 5, 1, true, -Math.PI * 0.40, Math.PI * 0.80),
          matCape, [0, -0.20, -0.035], [-0.14, 0, 0], [1.0, 1, 0.75]);
      add(cape, new THREE.BoxGeometry(0.21, 0.024, 0.02), ZoneNeon.bas(0xb0a2ff), [0, -0.40, 0.10], [-0.14, 0, 0]);
      add(cape, new THREE.BoxGeometry(0.26, 0.05, 0.09), matCape, [0, 0.005, 0.005]);
    }

    /* --- 手足（肩・股関節をピボットにして振る） ---------------------------- */
    const parts = { arms: [], legs: [], head: head, torso: torso, cape: cape };
    [-1, 1].forEach((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.155, 0.585, 0);
      body.add(sh);
      add(sh, new THREE.CapsuleGeometry(0.042, 0.16, 4, 8), matLimb, [0, -0.11, 0]);
      add(sh, new THREE.SphereGeometry(0.052, 8, 6), matSkin, [0, -0.215, 0.01]);
      parts.arms.push(sh);

      const hip = new THREE.Group();
      hip.position.set(s * 0.075, 0.34, 0);
      body.add(hip);
      add(hip, new THREE.CapsuleGeometry(0.05, 0.19, 4, 8), matLimb, [0, -0.14, 0]);
      add(hip, new THREE.BoxGeometry(0.095, 0.055, 0.15), matSkin, [0, -0.275, 0.03]);
      parts.legs.push(hip);
    });

    /* --- 面に貼りつく丸影＋自分の色の弱い点光源 ---------------------------- */
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 18),
      ZoneNeon.add(isL ? CFG.COL.LUMEN : CFG.COL.UMBRA, 0.42)
    );
    glow.renderOrder = 5;
    glow.rotation.x = -Math.PI / 2;
    const light = new THREE.PointLight(isL ? 0xffb066 : 0x7d8cff, 3.2, 8.5, 2);
    light.position.set(0, 0.55, 0);
    g.add(light);
    World.scene.add(g);
    World.scene.add(glow);
    return { group: g, body: body, parts: parts, glow: glow, light: light };
  },

  /* ==========================================================================
     毎フレームの同期
     ========================================================================== */
  syncCorridor(dist, obstacles, speed) {
    World._dist = dist;
    if (speed !== undefined) World._speed = speed;
    const T = World.TILE;
    const d = World._dummy;
    const base = Math.floor((dist - World.TILE_BEHIND) / T);
    const gaps = [];
    for (let i = 0; i < obstacles.length; i++) if (obstacles[i].type === 'GAP') gaps.push(obstacles[i]);
    ['floor', 'ceil'].forEach((surface) => {
      const im = World.tileMesh[surface];
      const y = (surface === 'floor') ? -0.07 : CFG.H + 0.07;
      let n = 0;
      for (let i = 0; i < World.nTiles; i++) {
        const atM = (base + i) * T + T / 2;
        for (let li = 0; li < CFG.LANES.length; li++) {
          const lane = CFG.LANES[li];
          let hide = false;
          for (let k = 0; k < gaps.length; k++) {
            const o = gaps[k];
            if (o.surface !== surface || o.lane !== lane) continue;
            if (Math.abs(o.at - atM) < (T + OBS.GAP.depth) / 2) { hide = true; break; }
          }
          if (hide) {
            d.position.set(0, -9999, 0);
            d.scale.set(0.0001, 0.0001, 0.0001);
          } else {
            d.position.set(lane * CFG.LANE_W, y, -(atM - dist));
            d.scale.set(1, 1, 1);
          }
          d.rotation.set(0, 0, 0);
          d.updateMatrix();
          im.setMatrixAt(n++, d.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true;
    });
  },

  syncObstacles(obstacles, dist) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const near = (o.at - dist) < CFG.VIEW_FAR;
      if (near && !o.view) { o.view = Obstacles.acquire(o.type); World.obsRoot.add(o.view); }
      if (o.view) Obstacles.place(o, dist, World._t);
    }
  },
  dropView(o) {
    if (o.view) { World.obsRoot.remove(o.view); Obstacles.release(o.type, o.view); o.view = null; }
  },

  syncRunners(runners, t) {
    World._t = t;
    runners.forEach((r) => {
      let v = World.runnerViews[r.id];
      if (!v) v = World.runnerViews[r.id] = World.buildRunner(r.id);
      const x = Runners.x(r);
      const up = (r.surface === 'floor') ? 1 : -1;
      const footY = Runners.footY(r);
      v.group.position.set(x, footY, 0);
      v.group.rotation.set(0, 0, (up === 1) ? 0 : Math.PI);
      v.group.scale.set(1, 1, 1);
      v.group.visible = r.alive;

      const sw = Math.sin(t * 15);
      const arms = v.parts.arms, legs = v.parts.legs;
      if (r.act === 'jump') {
        /* ジャンプ: 膝を抱える → 着地に向けて脚を伸ばす */
        const u = U.clamp(r.actT / CFG.JUMP_T, 0, 1);
        const tuck = Math.sin(Math.PI * Math.min(1, u * 1.25));
        v.body.rotation.x = -0.18 - 0.12 * tuck;
        legs[0].rotation.x = 1.15 * tuck + 0.1;
        legs[1].rotation.x = 0.95 * tuck + 0.1;
        arms[0].rotation.x = 1.55 * tuck; arms[1].rotation.x = 1.25 * tuck;
        arms[0].rotation.z = -0.35 * tuck; arms[1].rotation.z = 0.35 * tuck;
        v.parts.head.rotation.x = -0.12 * tuck;
      } else if (r.act === 'slide') {
        /* スライディング: 膝を畳みながら後ろへ倒す。
           倒し角1.0rad＋脚の畳みで、見た目の高さ≒0.42・奥行き≒0.75（判定 0.40 / 0.70）。
           body を z 方向に引いて、見た目の塊を判定ボックスの中心に合わせる。 */
        /* 判定（高さ SLIDE_H=0.40 / 奥行き SLIDE_D）に収まるよう、
           倒す・首をすくめる・体を少し縮める の3つで作る。 */
        const u = U.smooth(U.clamp(r.actT / 0.12, 0, 1));
        v.body.rotation.x = 1.26 * u;
        v.body.position.z = -0.31 * u;                // 判定ボックスの中心に寄せる
        v.body.scale.setScalar(1 - 0.10 * u);         // 体を丸める（一様スケール）
        v.parts.head.position.y = 0.665 - 0.19 * u;   // 首をすくめる
        legs[0].rotation.x = 0.95 + 0.2 * u; legs[1].rotation.x = 0.78;
        arms[0].rotation.x = 0.95; arms[1].rotation.x = 0.72;   // 腕は前へ（路面より下に出さない）
        arms[0].rotation.z = 0; arms[1].rotation.z = 0;
        v.parts.head.rotation.x = -0.55 * u;
      } else {
        /* 走り: 腕振り・脚の前後・体の上下揺れ */
        v.body.rotation.x = -0.12 + Math.sin(t * 30) * 0.02;
        v.body.position.y = Math.abs(Math.sin(t * 15)) * 0.028;
        v.body.rotation.y = sw * 0.10;
        legs[0].rotation.x = sw * 0.62; legs[1].rotation.x = -sw * 0.62;
        arms[0].rotation.x = -sw * 0.55; arms[1].rotation.x = sw * 0.55;
        arms[0].rotation.z = -0.12; arms[1].rotation.z = 0.12;
        v.parts.head.rotation.x = -sw * 0.05;
      }
      if (r.act !== 'run') v.body.position.y = 0;
      if (r.act !== 'slide') { v.body.position.z = 0; v.body.scale.setScalar(1); v.parts.head.position.y = 0.665; }
      if (v.parts.cape) v.parts.cape.rotation.x = -0.12 - Math.sin(t * 9) * 0.12 - (r.act === 'jump' ? 0.45 : 0);

      /* 丸影は常に面の上。跳ぶほど小さく薄く */
      v.glow.position.set(x, (r.surface === 'floor') ? 0.022 : CFG.H - 0.022, 0);
      v.glow.rotation.x = (r.surface === 'floor') ? -Math.PI / 2 : Math.PI / 2;
      const off = Runners.footOffset(r);
      v.glow.scale.setScalar(U.clamp(1 - off * 0.45, 0.35, 1));
      v.glow.visible = r.alive;
      v.light.position.set(0, (r.act === 'slide') ? 0.3 : 0.55, 0);
    });
  },

  syncCamera(runners, dyingT, speed, dt) {
    const avgX = (Runners.x(runners[0]) + Runners.x(runners[1])) / 2;
    const push = U.clamp(dyingT / CFG.DEATH_SLOW_T, 0, 1) * 1.4;
    World.camera.position.set(avgX * 0.16, CFG.CAM.Y, CFG.CAM.Z - push);
    World.camera.lookAt(avgX * 0.09, CFG.CAM.LOOK_Y, CFG.CAM.LOOK_Z);
    /* 体感速度の演出（§4.1）: 速度に応じて画角を広げる（広げる方向なので
       「2体が常に画面内」は壊れない）。急に変わらないよう時定数で追う。 */
    const u = U.clamp(((speed || CFG.SPEED_MIN) - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    const want = u * CFG.CAM.FOV_SPEED_GAIN;
    const k = U.clamp((dt === undefined ? 1 / 60 : dt) / CFG.CAM.FOV_SPEED_T, 0, 1);
    World._fovBoost += (want - World._fovBoost) * k;
    const fov = World._baseFov + World._fovBoost;
    if (Math.abs(World.camera.fov - fov) > 1e-4) {
      World.camera.fov = fov;
      World.camera.updateProjectionMatrix();
    }
  },

  /* 画面比が変わっても「2体が常に1画面に収まる」ようにfovを決める（§4.1） */
  resize() {
    if (!World.ready) return;
    const el = World.renderer.domElement;
    World.setViewport(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight,
                      Math.min(window.devicePixelRatio || 1, 2));
  },
  /* 実機の resize と同じ計算で、任意の画面サイズを当てる（監査・機械テストでも使う） */
  setViewport(w, h, pixelRatio) {
    if (!World.ready) return;
    const aspect = w / h;
    World.renderer.setPixelRatio(pixelRatio === undefined ? 1 : pixelRatio);
    World.renderer.setSize(w, h, false);
    const d = CFG.CAM.Z;
    const vByH = 2 * Math.atan(CFG.CAM.NEED_H / d);
    const vByW = 2 * Math.atan(CFG.CAM.NEED_W / (d * aspect));
    const fov = U.clamp(Math.max(vByH, vByW) * 180 / Math.PI, CFG.CAM.FOV_MIN, CFG.CAM.FOV_MAX);
    World._baseFov = fov;
    World.camera.fov = fov + (World._fovBoost || 0);
    World.camera.aspect = aspect;
    World.camera.updateProjectionMatrix();
  },

  /* --- カメラ対称性（§4.1 追記）: 2体の投影バウンディング高さの比 --------- */
  _projH(box) {
    const cam = World.camera;
    let lo = 1e9, hi = -1e9;
    const v = World._v || (World._v = new THREE.Vector3());
    for (let i = 0; i < 8; i++) {
      v.set((i & 1) ? box.x1 : box.x0, (i & 2) ? box.y1 : box.y0, (i & 4) ? box.z1 : box.z0);
      v.project(cam);
      if (v.y < lo) lo = v.y;
      if (v.y > hi) hi = v.y;
    }
    const size = new THREE.Vector2();
    World.renderer.getSize(size);
    return (hi - lo) * 0.5 * size.y;      // 画面上の高さ（px）
  },
  camSym() {
    if (!World.ready) return null;
    World.camera.updateMatrixWorld();
    const a = World._projH(Runners.boxOf('floor', 0, 'run', 0));
    const b = World._projH(Runners.boxOf('ceil', 0, 'run', 0));
    return { lumen: +a.toFixed(2), umbra: +b.toFixed(2), ratio: +(b / a).toFixed(3) };
  },

  render() {
    if (!World.ready) return;
    ZoneNeon.sync(World._dist, World._t, World._speed);
    World.renderer.render(World.scene, World.camera);
  },
  drawCalls() { return World.ready ? World.renderer.info.render.calls : 0; }
};
