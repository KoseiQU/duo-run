/* ============================================================================
   DUO RUN — world.js  コリドー・カメラ・2体の見た目・描画（P1は仮造形）
   ・造形はプリミティブ＋発光色のみ（テクスチャ画像なし / §3）
   ・ドローコールを抑えるため、床天井タイルも障害物もプールを使い回す
   ============================================================================ */
'use strict';

const World = {
  ready: false,
  TILE: 6.0,            // 床/天井タイル1枚の長さ
  TILE_BEHIND: 12,      // カメラ後方に残す長さ
  RIB_EVERY: 16,        // 壁リブの間隔

  init(canvas) {
    if (World.ready) return;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setClearColor(CFG.COL.FOG, 1);
    World.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CFG.COL.FOG);
    scene.fog = new THREE.Fog(CFG.COL.FOG, 24, 94);
    World.scene = scene;

    World.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    World.camera.position.set(0, CFG.CAM.Y, CFG.CAM.Z);

    scene.add(new THREE.AmbientLight(0xaebcE6, 1.35));
    const dir = new THREE.DirectionalLight(0xbfd0ff, 0.7);
    dir.position.set(0.4, 1, 0.6);
    scene.add(dir);

    /* --- 床・天井タイル ---------------------------------------------------- */
    const tileGeo = new THREE.BoxGeometry(CFG.LANE_W - 0.16, 0.12, World.TILE - 0.40);
    const tileMatA = new THREE.MeshLambertMaterial({ color: CFG.COL.TILE_A });
    const tileMatB = new THREE.MeshLambertMaterial({ color: CFG.COL.TILE_B });
    World.tiles = { floor: [], ceil: [] };
    const nTiles = Math.ceil((CFG.VIEW_FAR + World.TILE_BEHIND) / World.TILE) + 1;
    ['floor', 'ceil'].forEach((surface) => {
      for (let i = 0; i < nTiles; i++) {
        for (let li = 0; li < CFG.LANES.length; li++) {
          const m = new THREE.Mesh(tileGeo, ((i + li) % 2) ? tileMatA : tileMatB);
          m.position.x = CFG.LANES[li] * CFG.LANE_W;
          m.position.y = (surface === 'floor') ? -0.06 : CFG.H + 0.06;
          scene.add(m);
          World.tiles[surface].push({ mesh: m, lane: CFG.LANES[li], idx: i });
        }
      }
    });

    /* --- 壁・リブ・エッジライン -------------------------------------------- */
    const wallGeo = new THREE.BoxGeometry(0.12, CFG.H, CFG.VIEW_FAR + 40);
    const wallMat = new THREE.MeshLambertMaterial({ color: CFG.COL.WALL });
    [-1, 1].forEach((s) => {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.set(s * (CFG.HALF_W + 0.1), CFG.H / 2, -(CFG.VIEW_FAR + 40) / 2 + World.TILE_BEHIND);
      scene.add(w);
    });
    const lineGeo = new THREE.BoxGeometry(0.06, 0.06, CFG.VIEW_FAR + 40);
    const lineMatL = new THREE.MeshBasicMaterial({ color: CFG.COL.LUMEN_DIM });
    const lineMatU = new THREE.MeshBasicMaterial({ color: CFG.COL.UMBRA_DIM });
    [-1, 1].forEach((s) => {
      [['floor', 0.02, lineMatL], ['ceil', CFG.H - 0.02, lineMatU]].forEach((c) => {
        const l = new THREE.Mesh(lineGeo, c[2]);
        l.position.set(s * (CFG.HALF_W - 0.02), c[1], -(CFG.VIEW_FAR + 40) / 2 + World.TILE_BEHIND);
        scene.add(l);
      });
    });
    const ribGeo = new THREE.BoxGeometry(0.14, CFG.H, 0.5);
    const ribMat = new THREE.MeshLambertMaterial({ color: CFG.COL.RIB });
    World.ribs = [];
    const nRibs = Math.ceil((CFG.VIEW_FAR + World.TILE_BEHIND) / World.RIB_EVERY) + 1;
    for (let i = 0; i < nRibs; i++) {
      [-1, 1].forEach((s) => {
        const m = new THREE.Mesh(ribGeo, ribMat);
        m.position.set(s * (CFG.HALF_W + 0.02), CFG.H / 2, 0);
        scene.add(m);
        World.ribs.push({ mesh: m, idx: i, side: s });
      });
    }

    /* --- 障害物の容れ物 ---------------------------------------------------- */
    World.obsRoot = new THREE.Group();
    scene.add(World.obsRoot);

    /* --- 2体 --------------------------------------------------------------- */
    World.runnerViews = {};
    World.ready = true;
    World.resize();
  },

  /* 2体の見た目（仮造形: 胴・頭・腕2・脚2 ＋ 面に落ちる丸影） */
  buildRunner(id) {
    const isL = (id === 'lumen');
    const base = isL ? CFG.COL.LUMEN : CFG.COL.UMBRA;
    const dim = isL ? CFG.COL.LUMEN_DIM : CFG.COL.UMBRA_DIM;
    const g = new THREE.Group();
    const matBody = new THREE.MeshBasicMaterial({ color: base });
    const matLimb = new THREE.MeshBasicMaterial({ color: dim });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.24), matBody);
    torso.position.y = 0.52; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), matBody);
    head.position.y = 0.80; g.add(head);
    /* 前方が分かるように「面」を1枚（顔の向き） */
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    visor.position.set(0, 0.81, 0.14); g.add(visor);
    const limbGeo = new THREE.BoxGeometry(0.10, 0.30, 0.10);
    const parts = { arms: [], legs: [] };
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(limbGeo, matLimb);
      arm.position.set(s * 0.22, 0.52, 0); g.add(arm); parts.arms.push(arm);
      const leg = new THREE.Mesh(limbGeo, matLimb);
      leg.position.set(s * 0.09, 0.16, 0); g.add(leg); parts.legs.push(leg);
    });
    /* 面に貼りつく丸影（＝どちらの面に立っているかが一目で分かる） */
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 18),
      new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.32, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    const light = new THREE.PointLight(base, 1.3, 9, 2);
    light.position.set(0, 0.6, 0);
    g.add(light);
    World.scene.add(g);
    World.scene.add(glow);
    return { group: g, parts: parts, glow: glow, light: light };
  },

  /* --- 毎フレームの同期 ---------------------------------------------------- */
  syncCorridor(dist, obstacles) {
    const T = World.TILE;
    const base = Math.floor((dist - World.TILE_BEHIND) / T) * T;
    const gaps = obstacles.filter((o) => o.type === 'GAP');
    ['floor', 'ceil'].forEach((surface) => {
      World.tiles[surface].forEach((t) => {
        const atM = base + t.idx * T;
        const zc = -(atM + T / 2 - dist);
        t.mesh.position.z = zc;
        let hide = false;
        for (let i = 0; i < gaps.length; i++) {
          const o = gaps[i];
          if (o.surface !== surface || o.lane !== t.lane) continue;
          const d = OBS.GAP.depth;
          if (Math.abs(o.at - (atM + T / 2)) < (T + d) / 2) { hide = true; break; }
        }
        t.mesh.visible = !hide;
      });
    });
    const R = World.RIB_EVERY;
    const rbase = Math.floor((dist - World.TILE_BEHIND) / R) * R;
    World.ribs.forEach((r) => { r.mesh.position.z = -(rbase + r.idx * R - dist); });
  },

  syncObstacles(obstacles, dist) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const near = (o.at - dist) < CFG.VIEW_FAR;
      if (near && !o.view) { o.view = Obstacles.acquire(o.type); World.obsRoot.add(o.view); }
      if (o.view) Obstacles.place(o, dist);
    }
  },
  dropView(o) {
    if (o.view) { World.obsRoot.remove(o.view); Obstacles.release(o.type, o.view); o.view = null; }
  },

  syncRunners(runners, t) {
    runners.forEach((r) => {
      let v = World.runnerViews[r.id];
      if (!v) v = World.runnerViews[r.id] = World.buildRunner(r.id);
      const x = Runners.x(r);
      const up = (r.surface === 'floor') ? 1 : -1;
      const footY = Runners.footY(r);
      v.group.position.set(x, footY, 0);
      v.group.rotation.x = (up === 1) ? 0 : Math.PI;
      /* スライド中は潰す（当たり判定の高さと一致させる） */
      const sq = (r.act === 'slide') ? (CFG.SLIDE_H / CFG.RUN_H) : 1;
      v.group.scale.set(1, sq, 1);
      v.group.visible = r.alive;
      /* 走行アニメ（パーツ揺動） */
      const sw = Math.sin(t * 14) * 0.45;
      v.parts.legs[0].rotation.x = sw; v.parts.legs[1].rotation.x = -sw;
      v.parts.arms[0].rotation.x = -sw; v.parts.arms[1].rotation.x = sw;
      /* 丸影は常に面の上 */
      v.glow.position.set(x, (r.surface === 'floor') ? 0.03 : CFG.H - 0.03, 0);
      v.glow.rotation.x = (r.surface === 'floor') ? -Math.PI / 2 : Math.PI / 2;
      const off = Runners.footOffset(r);
      v.glow.scale.setScalar(U.clamp(1 - off * 0.45, 0.35, 1));
      v.glow.visible = r.alive;
    });
  },

  syncCamera(runners, dyingT) {
    const avgX = (Runners.x(runners[0]) + Runners.x(runners[1])) / 2;
    const push = U.clamp(dyingT / CFG.DEATH_SLOW_T, 0, 1) * 1.4;
    World.camera.position.set(avgX * 0.18, CFG.CAM.Y, CFG.CAM.Z - push);
    World.camera.lookAt(avgX * 0.10, CFG.CAM.LOOK_Y, CFG.CAM.LOOK_Z);
  },

  /* 画面比が変わっても「2体が常に1画面に収まる」ようにfovを決める（§4.1） */
  resize() {
    if (!World.ready) return;
    const el = World.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    const aspect = w / h;
    World.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    World.renderer.setSize(w, h, false);
    const d = CFG.CAM.Z;
    const vByH = 2 * Math.atan(CFG.CAM.NEED_H / d);
    const vByW = 2 * Math.atan(CFG.CAM.NEED_W / (d * aspect));
    const fov = U.clamp(Math.max(vByH, vByW) * 180 / Math.PI, CFG.CAM.FOV_MIN, CFG.CAM.FOV_MAX);
    World.camera.fov = fov;
    World.camera.aspect = aspect;
    World.camera.updateProjectionMatrix();
  },

  render() {
    if (!World.ready) return;
    World.renderer.render(World.scene, World.camera);
  },
  drawCalls() { return World.ready ? World.renderer.info.render.calls : 0; }
};
