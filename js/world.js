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

  init(canvas, zoneId) {
    if (World.ready) return;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    World.renderer = renderer;

    const scene = new THREE.Scene();
    World.scene = scene;

    World.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    World.camera.position.set(0, CFG.CAM.Y, CFG.CAM.Z);

    /* --- ゾーン装飾（光・空・遠景・小物・粒子）＝ 差し替え可能（契約§6 P3a） -- */
    Zones.build(scene, zoneId || 'neon');
    const P = Zones.pal();
    renderer.setClearColor(P.fog, 1);

    /* --- 路面／天井面（InstancedMesh 1つ。材質の色・質感はゾーンで替わる） -- */
    const tileGeo = new THREE.BoxGeometry(CFG.LANE_W - 0.07, 0.14, World.TILE - 0.10);
    const roadMat = new THREE.MeshStandardMaterial({
      color: P.road, roughness: P.roadRough, metalness: P.roadMetal
    });
    World._roadMat = roadMat;
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

    /* --- 道路の厚み（スラブの側面）と縁の発光ライン ------------------------
       まとめて1つの群にしておく（大演出で持ち上げる／消すため） */
    const LONG = CFG.VIEW_FAR + 60;
    const zc = -(LONG / 2) + World.TILE_BEHIND;
    const skirtMat = ZoneKit.lam(P.skirt);
    World._skirtMat = skirtMat;
    World.trim = new THREE.Group();
    scene.add(World.trim);
    const trim = World.trim;
    [-1, 1].forEach((s) => {
      [[0.02, 1], [CFG.H - 0.02, -1]].forEach((c) => {
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, LONG), skirtMat);
        skirt.position.set(s * (CFG.HALF_W + 0.06), c[0] - c[1] * 0.22, zc);
        trim.add(skirt);
      });
    });
    /* 琥珀＝床＝左手 / 藍＝天井＝右手 が一目で分かる縁のライン */
    const lineGeo = new THREE.BoxGeometry(0.07, 0.05, LONG);
    const glowGeo = new THREE.PlaneGeometry(0.42, LONG);
    [-1, 1].forEach((s) => {
      [['floor', 0.05, P.amber, -Math.PI / 2], ['ceil', CFG.H - 0.05, P.indigo, Math.PI / 2]].forEach((c) => {
        const l = new THREE.Mesh(lineGeo, ZoneKit.bas(c[2]));
        l.position.set(s * (CFG.HALF_W - 0.05), c[1], zc);
        trim.add(l);
        const gl = new THREE.Mesh(glowGeo, ZoneKit.add(c[2], 0.26));
        gl.position.set(s * (CFG.HALF_W - 0.28), (c[0] === 'floor') ? 0.014 : CFG.H - 0.014, zc);
        gl.rotation.x = c[3];
        gl.renderOrder = 3;
        trim.add(gl);
      });
    });

    /* --- 障害物の容れ物 ---------------------------------------------------- */
    World.obsRoot = new THREE.Group();
    scene.add(World.obsRoot);

    /* --- 発射台の点滅ライン（§4.4 大ジャンプの予告） ---------------------- */
    World.rampCue = World._buildRampCue();
    World.rampCue.visible = false;
    scene.add(World.rampCue);

    /* --- ゴールゲート（§4.8 ゴール演出） ---------------------------------- */
    World.goal = World._buildGoalGate();
    World.goal.visible = false;
    scene.add(World.goal);

    /* --- 大演出（崩落）の粉塵と、元に戻すための基準値 ---------------------- */
    Setpieces.initView(scene);
    World._fogBase = { near: scene.fog.near, far: scene.fog.far, color: scene.fog.color.getHex() };
    World._shake = 0;
    World._fxFov = 0;

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
    const matDark = ZoneKit.bas(isL ? 0x3a1a04 : 0x150c38);
    const matHot = ZoneKit.bas(hot);
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
      add(cape, new THREE.BoxGeometry(0.21, 0.024, 0.02), ZoneKit.bas(0xb0a2ff), [0, -0.40, 0.10], [-0.14, 0, 0]);
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
      ZoneKit.add(isL ? CFG.COL.LUMEN : CFG.COL.UMBRA, 0.42)
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
    /* 路面に穴が空く障害物（ギャップ・崩れる橋）。区間は Obstacles.holeSpan が唯一の出所 */
    const gaps = [];
    for (let i = 0; i < obstacles.length; i++) {
      /* 穴の区間は Obstacles.holeSpan が唯一の出所。
         side を返す型（落ちる天井＝天井側だけ抜ける / P3b）はそちらを優先する。 */
      const sp = Obstacles.holeSpan(obstacles[i], dist);
      if (sp) gaps.push({ o: obstacles[i], from: sp.from, to: sp.to, side: sp.side || obstacles[i].surface });
    }
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
            if (gaps[k].side !== surface || gaps[k].o.lane !== lane) continue;
            if (atM > gaps[k].from - T / 2 && atM < gaps[k].to + T / 2) { hide = true; break; }
          }
          const fall = Setpieces.tileFall(atM, surface, lane);
          if (Setpieces.tileHidden(atM)) hide = true;          // 滑空区間＝ビルとビルの間（道がない）
          const lift = Setpieces.viewLift(atM);                // 発射台の勾配・着地の沈み込み
          if (hide || fall >= 1) {
            d.position.set(0, -9999, 0);
            d.scale.set(0.0001, 0.0001, 0.0001);
            d.rotation.set(0, 0, 0);
          } else if (fall > 0) {
            /* 崩落: 傾きながら落ちていく（前線より後ろだけ） */
            const sgn = (lane + (surface === 'ceil' ? 1 : 0)) % 2 ? 1 : -1;
            const drop = fall * fall * 5;
            d.position.set(lane * CFG.LANE_W + sgn * fall * 0.5,
                           y + lift + (surface === 'floor' ? -drop : drop),
                           -(atM - dist) + fall * 1.2);
            d.rotation.set(sgn * fall * 0.9, fall * 0.4, sgn * fall * 1.1);
            d.scale.set(1, 1, 1);
          } else {
            /* 崩落が迫ると前方の路面も揺れる（落とさないので公平性には影響しない） */
            const sh = Setpieces.tileShake(atM, dist);
            d.position.set(lane * CFG.LANE_W, y + sh + lift, -(atM - dist));
            d.scale.set(1, 1, 1);
            d.rotation.set(sh * 2.2, 0, sh * 3.0);
          }
          d.updateMatrix();
          im.setMatrixAt(n++, d.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true;
    });
  },

  syncObstacles(obstacles, dist) {
    /* カメラより手前（＝通り過ぎた直後）の障害物は消す。
       大演出でカメラを引くと、通過した全高の障害物が目の前に居座って視界を塞ぐため。 */
    const camZ = World.camera.position.z - 2.2;
    /* 振り返りカットの間は後ろを見ているので、通り過ぎた障害物も描く */
    const back = Setpieces.lookBack(dist) > 0.02;
    /* 霧に完全に沈む距離より先は**建てない・描かない**（見えないものにドローコールを払わない）。
       フォグの far のすこし手前で切る。§4.7 の視認距離（speed × 1.4秒 ＝ 最大62m）より
       ずっと遠いので、判定・反応には影響しない。 */
    const fogFar = (World.scene.fog ? World.scene.fog.far : CFG.VIEW_FAR);
    const far = Math.min(CFG.VIEW_FAR, Math.max(70, fogFar * 0.92));
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const rel = o.at - dist;
      if (rel < far && !o.view) { o.view = Obstacles.acquire(o.type); World.obsRoot.add(o.view); }
      if (o.view) {
        Obstacles.place(o, dist, World._t);
        o.view.visible = (rel < far) && (back || (-rel < camZ));
      }
    }
  },
  dropView(o) {
    if (o.view) { World.obsRoot.remove(o.view); Obstacles.release(o.type, o.view); o.view = null; }
  },

  /* ゲート・門柱の金属（ゾーンで色が替わるので材質を覚えておく） */
  _frame() {
    const m = ZoneKit.lam(Zones.pal().metal);
    (World._frameMats || (World._frameMats = [])).push(m);
    return m;
  },

  /* 発射台の点滅ライン（§4.4 大ジャンプの予告）: 路面に引いた矢羽根と門柱 */
  _buildRampCue() {
    const g = new THREE.Group();
    const neon = ZoneKit.bas(0xffd479);
    const neon2 = ZoneKit.bas(0x38e2ff);
    for (let i = 0; i < 9; i++) {
      const z = -i * 2.4;
      [-1, 1].forEach((sfc) => {
        const y = (sfc > 0) ? 0.03 : CFG.H - 0.03;
        const m = new THREE.Mesh(new THREE.BoxGeometry(CFG.HALF_W * 1.7, 0.05, 0.36), (i % 2) ? neon2 : neon);
        m.position.set(0, y, z);
        g.add(m);
      });
    }
    [-1, 1].forEach((sx) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, CFG.H, 0.18), World._frame());
      p.position.set(sx * (CFG.HALF_W + 0.14), CFG.H / 2, -20.5);
      g.add(p);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.10, CFG.H * 0.9, 0.10), neon);
      l.position.set(sx * (CFG.HALF_W + 0.02), CFG.H / 2, -20.5);
      g.add(l);
    });
    return g;
  },
  /* 発射台ラインの明滅と位置（大ジャンプの間だけ出す） */
  syncRampCue(dist) {
    const c = World.rampCue;
    if (!c) return;
    const k = Setpieces.rampCue(dist);
    if (k <= 0) { c.visible = false; return; }
    const s = Setpieces.state;
    const lipM = s.startM + Setpieces.BJ.RAMP1;
    c.visible = true;
    c.position.set(0, Setpieces.viewLift(lipM), -(lipM - dist));
    const blink = (Math.sin(World._t * 9 + dist * 0.35) > -0.2) ? 1 : 0.25;
    c.children.forEach((m) => { if (m.material) m.material.opacity = 1; });
    c.scale.set(1, 1, 1);
    c.traverse((m) => { if (m.isMesh) m.visible = (blink > 0.5) || m.geometry.parameters.width < 0.3; });
  },

  /* ゴールゲートを置く（有限ステージのみ。視界に入ったら出す） */
  syncGoal(dist, stage) {
    World.syncRampCue(dist);
    if (!World.goal) return;
    if (!stage || stage.endless) { World.goal.visible = false; return; }
    const rel = stage.lengthM - dist;
    const vis = rel < CFG.VIEW_FAR && rel > -8;
    World.goal.visible = vis;
    if (vis) World.goal.position.set(0, Setpieces.viewLift(stage.lengthM), -rel);
  },

  syncRunners(runners, t) {
    World._t = t;
    runners.forEach((r) => {
      let v = World.runnerViews[r.id];
      if (!v) v = World.runnerViews[r.id] = World.buildRunner(r.id);
      const x = Runners.x(r);
      const up = (r.surface === 'floor') ? 1 : -1;
      const lift = Setpieces.viewLift(World._dist);          // 発射台／滑空／着地の持ち上がり
      const footY = Runners.footY(r) + lift;
      /* DUO体（契約§4.5 改訂）: 発射台で2人が寄って手を繋ぎ、1体として断面を飛ぶ。
         着地で元の面（床＝LUMEN / 天井＝UMBRA）へ戻る。0→1→0 で滑らかに入れ替える。 */
      const duoK = Setpieces.duoK(World._dist);
      const dk = U.smooth(duoK);
      const side = (r.id === 'lumen') ? -1 : 1;
      let px = x, py = footY, rz = (up === 1) ? 0 : Math.PI;
      /* 重力反転ワープ（契約§4.5 / S6「0.4秒の回転演出」）: 体ごと上下が入れ替わる。
         判定はゲートを跨いだ瞬間に切り替わっている（直後 1.0秒は障害物なし）ので、
         ここは **見た目が追いつくだけ**。距離ではなく時間で回すのは演出だから。 */
      const fk = (typeof Game !== 'undefined' && Game.flipT > 0)
        ? U.smooth(1 - Game.flipT / CFG.WARP.SPIN_T) : 1;
      if (fk < 1) {
        const off0 = Runners.footOffset(r);
        const prevY = ((r.surface === 'floor') ? (CFG.H - off0) : off0) + lift;
        py = U.lerp(prevY, footY, fk);
        rz = U.lerp((up === 1) ? Math.PI : 0, rz, fk);
      }
      if (duoK > 0.001) {
        px = U.lerp(x, FF.body.x + side * FF.PAIR_DX, dk);
        py = U.lerp(footY, FF.body.y + lift - 0.45, dk);     // 体の中心を断面の y に合わせる
        rz = U.lerp(rz, 0, dk);                              // 天井側は起き上がって向き合う
      }
      v.group.position.set(px, py, 0);
      v.group.rotation.set(0, 0, rz);
      v.group.scale.set(1, 1, 1);
      v.group.visible = r.alive;

      const sw = Math.sin(t * 15);
      const arms = v.parts.arms, legs = v.parts.legs;
      if (duoK > 0.001) {
        /* DUO体の姿勢: 内側の腕を水平に伸ばして手を繋ぎ、外側の腕は広げる */
        const fl = Math.sin(t * 2.2) * 0.06;
        const inner = (side < 0) ? 1 : 0;                    // 相手の側にある腕
        v.body.rotation.set(U.lerp(-0.12, -0.34 + fl, dk), 0, 0);
        v.body.position.set(0, Math.sin(t * 2.6) * 0.05 * dk, 0);
        v.body.scale.setScalar(1);
        v.parts.head.position.y = 0.665;
        v.parts.head.rotation.x = U.lerp(0, 0.18, dk);
        arms.forEach((a, i) => {
          const want = (i === inner) ? -side * 1.5 : side * (1.12 + fl);
          a.rotation.set(U.lerp(-sw * 0.55, 0.06, dk), 0, U.lerp(i ? 0.12 : -0.12, want, dk));
        });
        legs[0].rotation.x = U.lerp(sw * 0.62, -0.28 + fl, dk);
        legs[1].rotation.x = U.lerp(-sw * 0.62, -0.14 - fl, dk);
      } else if (typeof Game !== 'undefined' && Game.status === 'goal') {
        /* ゴール演出: 両手を挙げてポーズ */
        const u = U.clamp(Game.goalT / 0.35, 0, 1);
        v.body.rotation.set(0, 0, 0);
        v.body.position.set(0, Math.abs(Math.sin(t * 6)) * 0.05 * u, 0);
        v.body.scale.setScalar(1);
        v.parts.head.position.y = 0.665;
        v.parts.head.rotation.x = -0.12 * u;
        arms[0].rotation.set(2.5 * u, 0, -0.35 * u);
        arms[1].rotation.set(2.5 * u, 0, 0.35 * u);
        legs[0].rotation.x = 0.15 * u; legs[1].rotation.x = -0.15 * u;
      } else if (r.act === 'jump') {
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

      /* 丸影は常に面の上。跳ぶほど小さく薄く（DUO体の間は足場が無いので消す） */
      const gy = (r.surface === 'floor') ? 0.022 : CFG.H - 0.022;
      v.glow.position.set(x, U.lerp(CFG.H - gy, gy, fk) + lift, 0);
      v.glow.rotation.x = (r.surface === 'floor') ? -Math.PI / 2 : Math.PI / 2;
      const off = Runners.footOffset(r);
      v.glow.scale.setScalar(U.clamp(1 - off * 0.45, 0.35, 1));
      v.glow.visible = r.alive && duoK < 0.02;
      v.light.position.set(0, (r.act === 'slide') ? 0.3 : 0.55, 0);
    });
  },

  syncCamera(runners, dyingT, speed, dt) {
    /* DUO体（自由飛行）の間はカメラも1体を追う（契約§4.5） */
    const duoK = Setpieces.duoK(World._dist);
    const avgX = (duoK > 0.001)
      ? U.lerp((Runners.x(runners[0]) + Runners.x(runners[1])) / 2, FF.body.x, U.smooth(duoK))
      : (Runners.x(runners[0]) + Runners.x(runners[1])) / 2;
    const push = U.clamp(dyingT / CFG.DEATH_SLOW_T, 0, 1) * 1.4;
    /* 大演出（崩落）のカメラ揺れ・画角・霧 */
    const fx = Setpieces.camFx();
    let sx = 0, sy = 0, back = 0, camUp = 0, lookUp = 0;
    if (fx) {
      back = fx.camBack || 0;
      camUp = fx.camUp || 0;
      lookUp = (fx.lookUp === undefined) ? camUp : fx.lookUp;
      World._shake = fx.shake;
      World._fxFov = fx.fovAdd;
      sx = Math.sin(World._t * 37.1) * fx.shake;
      sy = Math.sin(World._t * 29.7 + 1.3) * fx.shake;
      if (World.scene.fog) {
        World.scene.fog.far = fx.fogFar;
        World.scene.fog.color.setHex(fx.fogColor);
        World.scene.background.setHex(fx.fogColor);
      }
    } else if (World._shake) {
      World.clearSetpieceFx();
    }
    /* 振り返りカット（§4.4 S3「巨岩の追跡」）: その場で 180度 首を振り、
       少し前へ出て高さを上げる。迫る巨岩（2体の後ろ＝+z）が正面に来る。
       演出の中でも障害物を置かない区間だけで起きる（§4.7 は崩さない）。 */
    /* 横向きカット（§4.4 S5「巨大魚の通過」/ P4a-4）: その場で首を **左（海の側）** へ振る。
       前進は止めない。カットの窓には障害物を置かないので §4.7 は崩れない
       （巨岩の振り返りカットと同じ仕組み・同じ約束）。 */
    const lsd = (fx && fx.lookSide) ? fx.lookSide : 0;
    const lb = (fx && fx.lookBack) ? fx.lookBack : 0;
    if (lsd > 0.001) {
      const k = U.smooth(lsd);
      World.camera.position.set(avgX * 0.10 + sx, CFG.CAM.Y + sy + camUp, CFG.CAM.Z - push);
      World.camera.lookAt(U.lerp(avgX * 0.09 + sx * 0.5, -70, k),
                          CFG.CAM.LOOK_Y + sy * 0.5 + lookUp,
                          U.lerp(CFG.CAM.LOOK_Z, -2, k));
    } else if (lb > 0.001) {
      const k = U.smooth(lb);
      /* カットごとに引く量が違う（近いカット2ほど前へ出て、岩の輪郭を画面に収める） */
      const cut = (fx.lookBackCut === undefined) ? 0 : fx.lookBackCut;
      const back = Setpieces.ROCK.CUT_BACK[Math.max(0, cut)] || Setpieces.ROCK.CUT_BACK[0];
      World.camera.position.set(avgX * 0.10 + sx, CFG.CAM.Y + 0.9 * k + sy + camUp, CFG.CAM.Z - back * k - push);
      World.camera.lookAt(sx * 0.5, CFG.CAM.LOOK_Y + 0.45 * k + sy * 0.5 + lookUp,
                          U.lerp(CFG.CAM.LOOK_Z, 26, k));
    } else {
      World.camera.position.set(avgX * 0.16 + sx, CFG.CAM.Y + sy + camUp, CFG.CAM.Z - push + back);
      World.camera.lookAt(avgX * 0.09 + sx * 0.5, CFG.CAM.LOOK_Y + sy * 0.5 + lookUp, CFG.CAM.LOOK_Z);
    }
    /* 路面の縁（厚み・発光ライン）は大演出で一緒に持ち上げ、滑空中は消す */
    if (World.trim) {
      World.trim.position.y = Setpieces.viewLift(World._dist);
      World.trim.visible = !Setpieces.glideActive();
    }
    /* 体感速度の演出（§4.1）: 速度に応じて画角を広げる（広げる方向なので
       「2体が常に画面内」は壊れない）。急に変わらないよう時定数で追う。 */
    const u = U.clamp(((speed || CFG.SPEED_MIN) - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    const want = u * CFG.CAM.FOV_SPEED_GAIN + (World._fxFov || 0);
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
  /* ゴールゲート: ネオンの門。2体がここを抜けるとクリア演出に入る */
  _buildGoalGate() {
    const g = new THREE.Group();
    const frame = World._frame();
    const neon = ZoneKit.bas(Zones.pal().amber);
    const neon2 = ZoneKit.bas(Zones.pal().indigo);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    [-1, 1].forEach((s2) => {
      add(new THREE.BoxGeometry(0.28, CFG.H + 0.6, 0.6), frame, s2 * (CFG.HALF_W + 0.22), CFG.H / 2, 0);
      add(new THREE.BoxGeometry(0.10, CFG.H, 0.08), neon, s2 * (CFG.HALF_W + 0.06), CFG.H / 2, 0.32);
    });
    add(new THREE.BoxGeometry(CFG.HALF_W * 2 + 0.9, 0.42, 0.6), frame, 0, CFG.H + 0.2, 0);
    add(new THREE.BoxGeometry(CFG.HALF_W * 2 + 0.9, 0.42, 0.6), frame, 0, -0.2, 0);
    add(new THREE.BoxGeometry(CFG.HALF_W * 2, 0.10, 0.08), neon2, 0, CFG.H + 0.02, 0.32);
    add(new THREE.BoxGeometry(CFG.HALF_W * 2, 0.10, 0.08), neon, 0, -0.02, 0.32);
    /* 門をくぐる帯（通過が分かるように光の膜を薄く張る） */
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF_W * 2, CFG.H),
                                ZoneKit.add(0xfff0c8, 0.16));
    veil.position.set(0, CFG.H / 2, 0);
    veil.renderOrder = 4;
    g.add(veil);
    return g;
  },

  /* ゾーンが変わったときに、World 側が持っている材質・霧の基準を合わせる（契約§6 P3a）。
     ＝ 路面の色と質感・路肩・ゲートの枠・背景色・霧の基準値。
     縁の発光ライン（琥珀＝床／藍＝天井）は**意味を持つ色**なので、どのゾーンでも変えない。 */
  applyZone() {
    if (!World.ready) return false;
    const P = Zones.pal();
    if (!P) return false;
    if (World._roadMat) {
      World._roadMat.color.setHex(P.road);
      World._roadMat.roughness = P.roadRough;
      World._roadMat.metalness = P.roadMetal;
      World._roadMat.needsUpdate = true;
    }
    if (World._skirtMat) World._skirtMat.color.setHex(P.skirt);
    (World._frameMats || []).forEach((m) => m.color.setHex(P.metal));
    World.renderer.setClearColor(P.fog, 1);
    const f = World.scene.fog;
    if (f) World._fogBase = { near: f.near, far: f.far, color: f.color.getHex() };
    return true;
  },

  /* 大演出の後始末（リトライ・タイトルで必ず通る） */
  clearSetpieceFx() {
    World._shake = 0;
    World._fxFov = 0;
    if (World.trim) { World.trim.position.y = 0; World.trim.visible = true; }
    if (World.rampCue) World.rampCue.visible = false;
    if (World.scene && World.scene.fog && World._fogBase) {
      World.scene.fog.near = World._fogBase.near;
      World.scene.fog.far = World._fogBase.far;
      World.scene.fog.color.setHex(World._fogBase.color);
      World.scene.background.setHex(World._fogBase.color);
    }
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
  /* 判定ボックスの画面上の矩形（CSS px）。UIの重なり監査に使う（§4.8 tip の位置） */
  projectRect(box) {
    if (!World.ready) return null;
    const cam = World.camera;
    cam.updateMatrixWorld();
    const v = World._v2 || (World._v2 = new THREE.Vector3());
    const size = new THREE.Vector2();
    World.renderer.getSize(size);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      v.set((i & 1) ? box.x1 : box.x0, (i & 2) ? box.y1 : box.y0, (i & 4) ? box.z1 : box.z0);
      v.project(cam);
      const px = (v.x * 0.5 + 0.5) * size.x, py = (-v.y * 0.5 + 0.5) * size.y;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    return { left: x0, right: x1, top: y0, bottom: y1 };
  },
  runnerRect(r) { return World.projectRect(Runners.boxOf(r.surface, r.laneVal, r.act, r.actT)); },

  /* 箱が画面をどれだけ覆っているか（0〜1）。**カメラの後ろにあるものは 0**。
     （projectRect は視線の後ろだと符号が反転して巨大な矩形になるので、監査には使えない）
     巨岩の追跡（§4.4 S3）で「迫っているのが画面で分かる」ことを測るのに使う。 */
  projectCoverage(box) {
    if (!World.ready || !box) return 0;
    const cam = World.camera;
    cam.updateMatrixWorld();
    const v = World._v3 || (World._v3 = new THREE.Vector3());
    const size = new THREE.Vector2();
    World.renderer.getSize(size);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
    for (let i = 0; i < 8; i++) {
      v.set((i & 1) ? box.x1 : box.x0, (i & 2) ? box.y1 : box.y0, (i & 4) ? box.z1 : box.z0);
      v.applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -cam.near) continue;                 // カメラの後ろ（映らない）
      v.applyMatrix4(cam.projectionMatrix);
      const px = (v.x * 0.5 + 0.5) * size.x, py = (-v.y * 0.5 + 0.5) * size.y;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      n++;
    }
    if (!n) return 0;
    const w = Math.max(0, Math.min(size.x, x1) - Math.max(0, x0));
    const h = Math.max(0, Math.min(size.y, y1) - Math.max(0, y0));
    return (w * h) / (size.x * size.y);
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
    Zones.sync(World._dist, World._t, World._speed);
    Setpieces.syncView(World._dist, World._t);
    World.renderer.render(World.scene, World.camera);
  },
  drawCalls() { return World.ready ? World.renderer.info.render.calls : 0; }
};
