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
    /* 道の簡素化（契約§5 v2）: 路面・天井面は **無地の暗色**（継ぎ目・光沢・模様なし）。
       ゾーンの色味は路肩のラインと壁・遠景で出すので、路面はゾーンの色をごく暗く沈めた1色。 */
    const tileGeo = new THREE.BoxGeometry(CFG.LANE_W + 0.002, 0.14, World.TILE + 0.002);
    const roadMat = new THREE.MeshBasicMaterial({ color: P.roadRaw ? P.road : World.roadColor(P.road), fog: true });
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
    /* 死角の予告線（P8b）の器は最初に作っておく（走行中にジオメトリを増やさない） */
    World._initHints();

    /* --- 発射台の点滅ライン（§4.4 大ジャンプの予告） ---------------------- */
    World.rampCue = World._buildRampCue();
    World.rampCue.visible = false;
    scene.add(World.rampCue);

    /* --- エンドレスの連絡通路＋光のゲート（§4.4 ゾーン切替 / P6） -------- */
    World.tunnel = World._buildTunnel();
    World.tunnel.visible = false;
    scene.add(World.tunnel);

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
    /* 鏡ゾーン（契約§4.5【表示改訂】/ P7b）: 左右が反転している間、体のまわりを銀の粒が舞う（鏡の光）。
       体の外接箱（見た目と判定の検査）に混ざらないよう、体のグループとは別にシーンへ置いて追従させる。 */
    const SN = 16;
    const sparkle = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.055, 0),
                                            ZoneKit.add(0xe6ecff, 0.95), SN);
    sparkle.frustumCulled = false;
    sparkle.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sparkle.renderOrder = 6;
    sparkle.visible = false;
    World.scene.add(sparkle);
    return { group: g, body: body, parts: parts, glow: glow, light: light,
             sparkle: sparkle, sparkN: SN, sparkDummy: new THREE.Object3D() };
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
      if (sp) gaps.push({ o: obstacles[i], from: sp.from, to: sp.to,
                          side: sp.side || obstacles[i].surface, lanes: sp.lanes || null });
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
            if (gaps[k].side !== surface) continue;
            /* lanes を返す型（割れた鏡の床＝3レーンとも抜ける / P5a）はそちらを見る */
            const ls = gaps[k].lanes;
            if (ls ? (ls.indexOf(lane) < 0) : (gaps[k].o.lane !== lane)) continue;
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
            /* 鏡の砕け散り（§4.4 S7）: 路面が「浮いた鏡片」になる（見た目だけ）。
               判定を持つ裂け目は SHARDGAP の holeSpan が別に路面を消す。 */
            const sd = Setpieces.tileShard(atM, surface, lane);
            if (sd) {
              d.position.set(lane * CFG.LANE_W + sd.dx, y + sh + lift + sd.dy, -(atM - dist));
              d.rotation.set(sh * 2.2 + sd.rx, 0, sh * 3.0 + sd.rz);
            } else {
              d.position.set(lane * CFG.LANE_W, y + sh + lift, -(atM - dist));
              d.rotation.set(sh * 2.2, 0, sh * 3.0);
            }
            d.scale.set(1, 1, 1);
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
      /* 見た目の変種（コアの「全ゾーン混在」/ P5b）はスキンが障害物ごとに決める。
         変種はプールの鍵にも入るので、使い回しで別ゾーンの姿に化けない。 */
      /* 奥行きの長い型（崩れる橋）は、手前端（踏み口）が霧から出た時に建て、
         奥の端を通り過ぎるまで描く（Obstacles.extent が唯一の出所） */
      const ex = Obstacles.extent(o);
      const relNear = rel - ex.back, relFar = rel + ex.fwd;
      if (relNear < far && !o.view) {
        o.view = Obstacles.acquire(o.type, Obstacles.variantOf(o));
        World.obsRoot.add(o.view);
      }
      if (o.view) {
        Obstacles.place(o, dist, World._t);
        o.view.visible = (relNear < far) && (back || (-relFar < camZ));
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
    const lipM = s.startM + (Setpieces.keys(s) || Setpieces.BJ).RAMP1;
    c.visible = true;
    c.position.set(0, Setpieces.viewLift(lipM), -(lipM - dist));
    const blink = (Math.sin(World._t * 9 + dist * 0.35) > -0.2) ? 1 : 0.25;
    c.children.forEach((m) => { if (m.material) m.material.opacity = 1; });
    c.scale.set(1, 1, 1);
    c.traverse((m) => { if (m.isMesh) m.visible = (blink > 0.5) || m.geometry.parameters.width < 0.3; });
  },

  /* ==========================================================================
     エンドレスの連絡通路（契約§4.4「1000mごとにゾーン切替演出」/ P6）
     無地の通路 40m（壁・天井裏・床下の板＋入口の額縁）と、出口の **光のゲート**。
     入口 z=0 → ゲート z=-L のローカル座標で組み、走行距離で送り出す。
     ・通路の中は壁と板で外が見えない。出口は光の膜でふさがっているので、
       カメラが奥に入った瞬間にゾーンを差し替えても画面に出ない（Endless.SWAP_BEFORE）。
     ・どのゾーンの霧にも馴染むよう、材質は霧つきの Basic（ライトに依存しない）。
     ・ゾーンの持ち物ではない（切替で捨てられない）＝ World が持つ。ドローコール 7。
     ========================================================================== */
  _buildTunnel() {
    const L = Endless.TUNNEL_M, H = CFG.H, HW = CFG.HALF_W;
    const g = new THREE.Group();
    const merged = (list, mat) => { const m = new THREE.Mesh(ZoneKit.merge(list), mat); g.add(m); return m; };
    const WX = HW + 0.42;                                     // 壁の中心（内面 x=±1.92）
    merged([
      { g: ZoneKit.box(0.6, H + 1.4, L), p: [-WX, H / 2, -L / 2] },
      { g: ZoneKit.box(0.6, H + 1.4, L), p: [WX, H / 2, -L / 2] },
      { g: ZoneKit.box(HW * 2 + 1.4, 0.5, L), p: [0, H + 0.45, -L / 2] },
      { g: ZoneKit.box(HW * 2 + 1.4, 0.5, L), p: [0, -0.45, -L / 2] }
    ], new THREE.MeshBasicMaterial({ color: 0x2b3346, fog: true }));
    /* 入口の額縁（通路の外の景色を半分ほど隠し、「トンネルに入る」と読ませる） */
    const OX = WX + 0.3, OY0 = -0.7, OY1 = H + 0.7;
    merged([
      { g: ZoneKit.box(9, 16, 0.9), p: [-(OX + 4.5), H / 2 + 1, 0.2] },
      { g: ZoneKit.box(9, 16, 0.9), p: [OX + 4.5, H / 2 + 1, 0.2] },
      { g: ZoneKit.box(OX * 2, 6, 0.9), p: [0, OY1 + 3, 0.2] },
      { g: ZoneKit.box(OX * 2, 3, 0.9), p: [0, OY0 - 1.5, 0.2] }
    ], new THREE.MeshBasicMaterial({ color: 0x1b2130, fog: true }));
    /* 額縁の縁の発光（開口の輪郭）と、通路の中の光の輪（5m おき） */
    const rim = [];
    [[-OX, 0], [OX, 0]].forEach((q) => rim.push({ g: ZoneKit.box(0.12, OY1 - OY0, 0.12), p: [q[0], H / 2, -0.3] }));
    rim.push({ g: ZoneKit.box(OX * 2, 0.12, 0.12), p: [0, OY1, -0.3] });
    merged(rim, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, fog: true }));
    const rings = [];
    for (let z = 5; z < L; z += 5) {
      [-1, 1].forEach((sx) => rings.push({ g: ZoneKit.box(0.05, H + 0.2, 0.18), p: [sx * (WX - 0.33), H / 2, -z] }));
      rings.push({ g: ZoneKit.box(HW * 2 + 0.2, 0.05, 0.18), p: [0, H + 0.19, -z] });
      [-1, 1].forEach((sx) => rings.push({ g: ZoneKit.box(0.3, 0.05, 0.18), p: [sx * (HW + 0.02), 0.01, -z] }));
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff, fog: true });
    merged(rings, ringMat);
    /* 出口の光のゲート: 枠＋光の膜（通常合成＝向こうを隠す）＋外へ広がる光輪（加算） */
    const gate = new THREE.Group();
    gate.position.z = -L;
    g.add(gate);
    const gm = new THREE.Mesh(ZoneKit.merge([
      { g: ZoneKit.box(0.3, H + 0.6, 0.3), p: [-(HW + 0.1), H / 2, 0] },
      { g: ZoneKit.box(0.3, H + 0.6, 0.3), p: [HW + 0.1, H / 2, 0] },
      { g: ZoneKit.box(HW * 2 + 0.5, 0.3, 0.3), p: [0, H + 0.15, 0] },
      { g: ZoneKit.box(HW * 2 + 0.5, 0.3, 0.3), p: [0, -0.15, 0] }
    ]), new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false }));
    gate.add(gm);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 0.2, H + 0.3),
      new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    veil.position.set(0, H / 2, 0.05);
    veil.renderOrder = 6;
    gate.add(veil);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(14, 11),
      new THREE.MeshBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.4, depthWrite: false,
                                    blending: THREE.AdditiveBlending, fog: false }));
    halo.position.set(0, H / 2, -0.4);
    halo.renderOrder = 5;
    gate.add(halo);
    World._tun = { group: g, gate: gate, veil: veil, halo: halo, ringMat: ringMat };
    return g;
  },
  /* 通路の送り出し（毎フレーム）。見えている通路が無ければ隠し、小物の伏せも外す */
  syncTunnel(dist) {
    const T = World._tun;
    if (!T) return null;
    const s = (typeof Game !== 'undefined' && Game.stage && Game.stage.endless) ? Endless.tunnelNear(dist) : null;
    if (!s) {
      if (T.group.visible) T.group.visible = false;
      ZoneKit.mask = null;
      return null;
    }
    T.group.visible = true;
    T.group.position.set(0, 0, -(s.t0 - dist));
    ZoneKit.mask = [s.t0 - 1.5, s.at + 1.5];
    /* 光の膜: 近づくほど明るく、くぐったら一気に抜ける */
    const toGate = s.at - dist;
    const near = U.clamp(1 - toGate / 70, 0, 1);
    const pass = U.clamp(1 + toGate / 7, 0, 1);            // ゲートを越えて 7m で消える
    const pulse = 0.94 + 0.06 * Math.sin(World._t * 7.5);
    T.veil.material.opacity = (0.72 + 0.26 * near) * pass;
    T.veil.visible = pass > 0.01;
    T.halo.material.opacity = (0.22 + 0.5 * near) * pulse * pass;
    T.ringMat.color.setHSL(0.58, 0.55, 0.72 + 0.12 * near);
    return s;
  },

  /* ==========================================================================
     死角の予告線（契約§4.5b / P8b・エンドレスだけ）
     遮蔽物（ピラー・ワイド梁・壁の穴）の奥（通過後 1.0〜2.0秒）に障害物がある時、
     遮蔽物の speed×1.5秒 手前から、その面・レーンの路面に **細い白の線＋小さな矢印**を出す。
     線は遮蔽物の手前 0.8〜10.8m に寝かせる（遮蔽物の後ろに引くと隠れて見えないため）。矢印は奥向き。
     Game.gen.hints（生成器が Fair.hints で作る）を読むだけ。1本 = 1ドローコール、最大 HINT_MAX 本。
     ========================================================================== */
  HINT_MAX: 8,
  HINT_LEN: 10.0,
  _hintPool: null,
  _hintGeo: null,
  _initHints() {
    if (World._hintPool || !World.scene) return;
    World._hintPool = [];
    for (let i = 0; i < World.HINT_MAX; i++) { const m = World._buildHint(); World.scene.add(m); World._hintPool.push(m); }
  },
  _buildHint() {
    const L = World.HINT_LEN, z0 = 0.8;
    const parts = [{ g: ZoneKit.box(0.16, 0.02, L), p: [0, 0, z0 + L / 2] }];
    /* 矢印（奥＝ -z 向きの「く」の字）を線の上に3つ（寝た線は視線に対して潰れるので腕は長め） */
    [z0 + 0.3, z0 + 3.3, z0 + 6.3].forEach((z) => {
      [-1, 1].forEach((sx) => parts.push({ g: ZoneKit.box(0.13, 0.02, 0.85), p: [sx * 0.23, 0, z + 0.34], r: [0, -sx * 0.62, 0] }));
    });
    /* 霧に沈めない（遮蔽物の 1.5秒手前＝最大 66m 先から読めること） */
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    if (!World._hintGeo) World._hintGeo = ZoneKit.merge(parts);      // 8本で1つのジオメトリを共有
    const m = new THREE.Mesh(World._hintGeo, mat);
    m.renderOrder = 3;
    m.visible = false;
    m.userData.hint = true;
    return m;
  },
  syncHints(dist) {
    const hs = (typeof Game !== 'undefined' && Game.gen && Game.gen.hints) ? Game.gen.hints : null;
    if (!World._hintPool) World._initHints();
    if (!World._hintPool) return 0;
    const pool = World._hintPool;
    let n = 0;
    if (hs) {
      /* 表示中＝遮蔽物の speed×1.5秒 手前から、遮蔽物を通り過ぎるまで */
      for (let i = hs.length - 1; i >= 0 && n < pool.length; i--) {
        const h = hs[i];
        if (h.occAt < dist - 150) break;
        if (h.occAt < dist - 2 || dist < h.fromM) continue;
        const m = pool[n++];
        m.visible = true;
        const lift = (typeof Setpieces !== 'undefined' && Setpieces.viewLift) ? Setpieces.viewLift(h.occAt) : 0;
        m.position.set(h.lane * CFG.LANE_W, (h.side === 'ceil') ? CFG.H - 0.025 + lift : 0.025 + lift, -(h.occAt - dist));
        m.material.opacity = 0.75 + 0.25 * Math.sin(World._t * 10 + i);
      }
    }
    for (let k = n; k < pool.length; k++) pool[k].visible = false;
    World.hintsOn = n;
    return n;
  },

  /* ゴールゲートを置く（有限ステージのみ。視界に入ったら出す） */
  syncGoal(dist, stage) {
    World.syncRampCue(dist);
    World.syncTunnel(dist);
    World.syncHints(dist);
    if (!World.goal) return;
    if (!stage || stage.endless) { World.goal.visible = false; return; }
    const rel = stage.lengthM - dist;
    const vis = rel < CFG.VIEW_FAR && rel > -8;
    World.goal.visible = vis;
    if (vis) World.goal.position.set(0, Setpieces.viewLift(stage.lengthM), -rel);
  },

  blinkOff() {
    if (typeof Game === 'undefined' || !(Game.invulT > 0)) return false;
    return Math.floor(Game.invulT * CFG.HEART.BLINK_HZ) % 2 === 1;
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
      /* 合体区間（契約§4.5 / S8）: 2体が **床の上で** 手を繋いで1体になって走る
         （床と天井の中間ではない）。位置は「床を走っている方」から引くので、
         見た目と判定（合体体＝床の1体）が必ず一致する。 */
      const mk = (typeof Game !== 'undefined' && Game.mergeK) ? Game.mergeK(World._dist) : 0;
      /* 全クリア演出（契約§6 P5b「2体が並んでポーズ」/ S8 クリア）: 天井側も床へ降りて
         **横に並ぶ**。寄り方は合体区間と同じ仕組み（床を走っている方が基準）だが、
         姿勢は手を繋ぐのではなく **ゴールの万歳ポーズ** のまま。 */
      const ak = (typeof Game !== 'undefined' && Game.status === 'allclear' && Game.allClearK)
        ? U.clamp(Game.allClearK() / 0.16, 0, 1) : 0;
      const standK = Math.max(mk, ak);      // 床の上で横に並ぶ度合い
      const pairK = Math.max(duoK, mk);     // 手を繋いだ DUO体の姿勢を取る度合い
      const dk = U.smooth(Math.max(duoK, standK));
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
      } else if (standK > 0.001 && typeof Game !== 'undefined' && Game.mergeLead) {
        const lead = Game.mergeLead();
        px = U.lerp(x, Runners.x(lead) + side * FF.PAIR_DX, dk);
        py = U.lerp(footY, Runners.footOffset(lead) + lift, dk);
        rz = U.lerp(rz, 0, dk);                              // 天井側は床へ降りて起き上がる
      }
      v.group.position.set(px, py, 0);
      v.group.rotation.set(0, 0, rz);
      v.group.scale.set(1, 1, 1);
      /* 無敵中（ハートの被弾直後 / §4.5b）は2体とも点滅 */
      v.group.visible = r.alive && !World.blinkOff();

      const sw = Math.sin(t * 15);
      const arms = v.parts.arms, legs = v.parts.legs;
      if (pairK > 0.001) {
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
      } else if (typeof Game !== 'undefined' && (Game.status === 'goal' || Game.status === 'allclear')) {
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
      /* 白い空間（S1 / P7c）: 加算の光る丸は白に溶けるので、自分の色の暗い影（通常合成）にする */
      const darkSh = !!(Zones.pal() && Zones.pal().shadowDark);
      if (v._darkSh !== darkSh) {
        v._darkSh = darkSh;
        const gm = v.glow.material, base = (r.id === 'lumen') ? CFG.COL.LUMEN : CFG.COL.UMBRA;
        gm.blending = darkSh ? THREE.NormalBlending : THREE.AdditiveBlending;
        gm.color.setHex(base);
        if (darkSh) gm.color.multiplyScalar(0.45);
        gm.opacity = darkSh ? 0.5 : 0.42;
        gm.needsUpdate = true;
      }
      v.light.position.set(0, (r.act === 'slide') ? 0.3 : 0.55, 0);

      /* 鏡の光（銀の粒）: 反転している間だけ、体のまわりを螺旋に舞う（体の上下の向きに従う） */
      const mir = !!r.mirrored && r.alive && duoK < 0.02;
      v.sparkle.visible = mir;
      if (mir) {
        const dm = v.sparkDummy;
        const cy = Math.cos(rz), sy = Math.sin(rz);
        for (let i = 0; i < v.sparkN; i++) {
          const h = ZoneKit.hash(i, 91), h2 = ZoneKit.hash(i, 97);
          const ph = ((t * (0.45 + h * 0.4)) + h2) % 1;
          const a = h * Math.PI * 2 + t * (2.2 + h2 * 1.6);
          const rad = 0.40 + 0.12 * Math.sin(t * 3 + i);
          const lx0 = Math.cos(a) * rad, ly0 = 0.05 + ph * 1.05;
          dm.position.set(px + lx0 * cy - ly0 * sy, py + lx0 * sy + ly0 * cy, Math.sin(a) * rad);
          dm.rotation.set(t * 3 + i, t * 2 + h * 5, 0);
          dm.scale.setScalar((0.55 + h2 * 0.9) * (0.35 + 0.65 * Math.abs(Math.sin(t * 7 + i * 1.9))));
          dm.updateMatrix();
          v.sparkle.setMatrixAt(i, dm.matrix);
        }
        v.sparkle.instanceMatrix.needsUpdate = true;
      }
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
    /* 鏡へ向くカット（§4.4 S7「鏡の砕け散り」/ P5a）: 出口の大鏡を正面に据え、
       少し前へ出て視線を鏡の中心へ合わせる。カットの窓には障害物を置かないので
       §4.7 は崩れない（巨岩の振り返り・巨大魚の横向きと同じ仕組み・同じ約束）。 */
    const lmr = (fx && fx.lookMirror) ? fx.lookMirror : 0;
    if (lmr > 0.001) {
      const k = U.smooth(lmr);
      const mb = Setpieces.mirrorBox(World._dist);
      const mz = mb ? (mb.z0 + mb.z1) / 2 : CFG.CAM.LOOK_Z;
      /* 前へ出る量（2026-09-23 P5c）: 3.2 では出口の大鏡が画角の 17% にしかならず、
         §4.4 S7 の「鏡が主役のカット」に届かなかった（P5a 封緘時の既知の不合格）。
         5.6 まで寄せる。寄りだけでは横持ち（812×375）で 11% に留まるので、画角も絞る
         （Setpieces の fovAdd がカットで −13°）。構図はそのまま・寄りだけを強める。 */
      World.camera.position.set(avgX * 0.10 * (1 - k) + sx, CFG.CAM.Y + sy + camUp,
                                CFG.CAM.Z - 5.6 * k - push);
      World.camera.lookAt(sx * 0.5, CFG.H / 2 + sy * 0.5 + lookUp * 0.4,
                          U.lerp(CFG.CAM.LOOK_Z, mz, k));
    } else if (lsd > 0.001) {
      const k = U.smooth(lsd);
      World.camera.position.set(avgX * 0.10 + sx, CFG.CAM.Y + sy + camUp, CFG.CAM.Z - push);
      World.camera.lookAt(U.lerp(avgX * 0.09 + sx * 0.5, -70, k),
                          CFG.CAM.LOOK_Y + sy * 0.5 + lookUp,
                          U.lerp(CFG.CAM.LOOK_Z, -2, k));
    } else if (lb > 0.001) {
      const k = U.smooth(lb);
      /* カットごとに引く量が違う（近いカット2ほど前へ出て、岩の輪郭を画面に収める） */
      const cut = (fx.lookBackCut === undefined) ? 0 : fx.lookBackCut;
      /* 演出ごとに「どれだけ前へ出るか」は違う（fx.lookBackDist が優先） */
      const back = (fx.lookBackDist !== undefined) ? fx.lookBackDist
                 : (Setpieces.ROCK.CUT_BACK[Math.max(0, cut)] || Setpieces.ROCK.CUT_BACK[0]);
      World.camera.position.set(avgX * 0.10 + sx, CFG.CAM.Y + 0.9 * k + sy + camUp, CFG.CAM.Z - back * k - push);
      World.camera.lookAt(sx * 0.5, CFG.CAM.LOOK_Y + 0.45 * k + sy * 0.5 + lookUp,
                          U.lerp(CFG.CAM.LOOK_Z, 26, k));
    } else {
      World.camera.position.set(avgX * 0.16 + sx, CFG.CAM.Y + sy + camUp, CFG.CAM.Z - push + back);
      World.camera.lookAt(avgX * 0.09 + sx * 0.5, CFG.CAM.LOOK_Y + sy * 0.5 + lookUp, CFG.CAM.LOOK_Z);
    }
    /* 世界反転ゲート（契約§4.5【2026-09-25】/ P8a）: カメラを視線の軸まわりにロールする＝
       画面の中心を軸に画像全体（コリドー・霧・粒子・障害物）が回る。角度は Game.roll が唯一の出所
       （0＝通常 / π＝床が画面の上。0.5秒で回り、再通過で逆回転）。lookAt の後に掛ける。 */
    const roll = (typeof Game !== 'undefined' && Game.roll) ? Game.roll : 0;
    if (Math.abs(roll) > 1e-6) World.camera.rotateZ(roll);
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
                      World.pixelRatio());
  },

  /* ==========================================================================
     描画品質（§2「スマホで30fps以上」/ P6 スマホ実機最適化）
       0 = 通常（devicePixelRatio は上限 2）
       1 = 粒子を半分（ゾーンの粒子フィールドを1つおきに間引き、Points/LineSegments は描画範囲を半分）
       2 = 1 ＋ 解像度の上限を 1.5
     フレーム時間（指数平均）が 20ms を超えた状態が 3秒続いたら1段下げる（上げ直しはしない）。
     GPU テクスチャは使わない（0 枚のまま / 契約§3）。
     ========================================================================== */
  quality: 0,
  QUALITY_MAX: 2,
  PARTICLE_FIELDS: { dust: 1, dustBig: 1, bubble: 1, bubbleBig: 1, plankton: 1, detritus: 1, school: 1,
                     mote: 1, glint: 1, suck: 1, ember: 1, ice: 1, speedline: 1 },
  perf: { ema: 16.7, slowT: 0, downs: 0, SLOW_MS: 20, HOLD_S: 3 },
  pixelRatio() {
    const cap = (World.quality >= 2) ? 1.5 : 2;
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
  },
  setQuality(q) {
    World.quality = U.clamp(q | 0, 0, World.QUALITY_MAX);
    World.applyQuality();
    World.resize();
    return World.quality;
  },
  applyQuality() {
    if (!World.ready) return 0;
    const thin = World.quality >= 1;
    let n = 0;
    const z = Zones.active();
    if (z && z.fields) {
      z.fields.forEach((f) => { f.thin = thin && !!World.PARTICLE_FIELDS[f.name]; if (f.thin) n++; });
    }
    World.scene.traverse((o) => {
      if (!(o.isPoints || o.isLineSegments) || !o.geometry || !o.geometry.attributes.position) return;
      const c = o.geometry.attributes.position.count;
      const half = o.isLineSegments ? 2 * Math.floor(c / 4) : Math.floor(c / 2);
      o.geometry.setDrawRange(0, thin ? half : Infinity);
      if (thin) n++;
    });
    return n;
  },
  /* rAF の1フレームぶんの実時間（ms）。止まっていた後の大きな値（タブ復帰など）は数えない */
  perfSample(ms) {
    const P = World.perf;
    if (!(ms > 0) || ms > 250) return World.quality;
    P.ema += (ms - P.ema) * 0.1;
    if (P.ema > P.SLOW_MS) P.slowT += ms / 1000; else P.slowT = 0;
    if (P.slowT >= P.HOLD_S && World.quality < World.QUALITY_MAX) {
      P.slowT = 0; P.downs++;
      World.setQuality(World.quality + 1);
    }
    return World.quality;
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

  /* 路面の無地の暗色（契約§5 v2）: ゾーンの路面色の色相だけを残し、明るさを沈める */
  ROAD_L: 0.085,         // sRGB の明度（≈ 22/255）
  roadColor(hex) {
    const c = new THREE.Color(hex), hsl = {};
    c.getHSL(hsl, THREE.SRGBColorSpace);
    c.setHSL(hsl.h, Math.min(0.35, hsl.s), Math.min(hsl.l, World.ROAD_L), THREE.SRGBColorSpace);
    return c.getHex();
  },

  /* ゾーンが変わったときに、World 側が持っている材質・霧の基準を合わせる（契約§6 P3a）。
     ＝ 路面の色と質感・路肩・ゲートの枠・背景色・霧の基準値。
     縁の発光ライン（琥珀＝床／藍＝天井）は**意味を持つ色**なので、どのゾーンでも変えない。 */
  applyZone() {
    if (!World.ready) return false;
    const P = Zones.pal();
    if (!P) return false;
    if (World._roadMat) World._roadMat.color.setHex(P.roadRaw ? P.road : World.roadColor(P.road));   // 白い空間（S1）は素の色
    if (World._skirtMat) World._skirtMat.color.setHex(P.skirt);
    (World._frameMats || []).forEach((m) => m.color.setHex(P.metal));
    World.renderer.setClearColor(P.fog, 1);
    const f = World.scene.fog;
    if (f) World._fogBase = { near: f.near, far: f.far, color: f.color.getHex() };
    /* 品質（粒子の間引き）は建て直したゾーンにも掛け直す */
    World.applyQuality();
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
