/* ============================================================================
   DUO RUN — zone_space.js  ゾーン4「宇宙ステーション」の装飾（契約 §5 / §6 P4b）

   ■ 契約§5「宇宙ステーション」
     白×黒の構造材の回廊。窓の外に地球（大きな青い球＋大気の縁光＋雲の帯）と
     星（点群）・太陽の斜光。警告灯の回転光（赤・橙）、パネル・ケーブル・配管・
     格納コンテナ・ロボットアーム・ホログラム端末・浮遊する工具/ボルト（無重力の
     小物がゆっくり回転）・気密扉・太陽電池パネル（外）・アンテナ。
     壁区間（気密回廊）と開放区間（ガラスチューブ＝外は宇宙と地球）を交互に。
     **霧は薄い（宇宙は透明）→ 代わりに距離で暗くなるライティング**。
   ■ 「距離で暗くなる」の作り方
     霧の色を宇宙の闇（ほぼ黒）にして far を遠くへ取る。＝ 遠いものほど闇へ沈む。
     濃い霧のように「白くかすむ」ことはなく、透明なまま暗くなる。
   ■ 作り方の方針はネオン都市・古代遺跡・深海と同じ（契約§3）
     - テクスチャ画像は一切使わない。形は ZoneKit.merge でプリミティブを彫る。
     - 小物は InstancedMesh 1つ＝1種類。スロット送りで無限に流す（同じ距離＝同じ景色）。
     - **白い構造材は明部を作りやすい**ので、白は「縁・手すり・パネル枠」に限り、
       面はグレー（0x9aa3b2 前後）に落として白飛び（≥240）を 8% 以内に抑える。
       暗部は宇宙の闇と黒い構造材が受け持つ。
   ============================================================================ */
'use strict';

const ZoneSpace = {
  id: 'space',
  /* 背後に残す長さ。**カメラ（z = CFG.CAM.Z = 8）より手前には小物を置かない** */
  BEHIND: 2,

  PAL: {
    /* World が読む共通キー */
    road:      0xb4bcc8,      // 床パネル（白×黒の構造材のうち「白」側。飛ばないグレー）
    roadRough: 0.44,
    roadMetal: 0.22,
    skirt:     0x1b1f2a,      // 床の側面（黒い構造材）
    metal:     0xb9c2d2,      // ゲート・門柱の金属
    amber:     0xffb347,      // 床＝LUMEN（ゾーンが変わっても意味は同じ）
    indigo:    0x8b9bff,      // 天井＝UMBRA
    /* 宇宙の闇。**真っ黒にはしない**（輝度 13 ≒ 黒潰れの下限 8 の上）＝
       星の海のかすかな明かりがある、という理屈で黒潰れを作らない（契約§3）。 */
    fog:       0x0a0e1a,

    /* 宇宙ステーションの配色 */
    hull:      0xbcc4d2,      // 構造材（白側）
    hullLit:   0xe4eaf4,      // 光が当たった稜線（明部の主役）
    hullDark:  0x3d4455,      // 構造材（黒側。輝度 68＝中間調に残る黒）
    ink:       0x11141c,      // 影・溝
    steel:     0x7d8798,      // 配管・フレーム
    steelDark: 0x4c5464,
    glass:     0x9fd8ff,      // ガラスチューブ
    warnRed:   0xff4a3a,      // 警告灯（赤）
    warnAmber: 0xffa428,      // 警告灯（橙）
    lamp:      0xeaf2ff,      // 照明
    holo:      0x62e8ff,      // ホログラム端末
    holo2:     0x9affd8,
    cable:     0x3a4152,
    cableHot:  0xffc14a,
    earth:     0x2f6bd8,      // 地球（海）
    earthLand: 0x3f7a4a,      // 地球（陸）
    earthCloud:0xf2f7ff,      // 雲
    earthRim:  0x7fc8ff,      // 大気の縁光
    sun:       0xfff4d8,
    star:      0xdfe8ff,
    truss:     0x7d8798,      // 外のトラス
    solar:     0x2a3f8e,      // 太陽電池パネル
    solarLit:  0x3f5ad0,
    far:       0x252c3c,      // 遠景のモジュール
    farDeep:   0x141926
  },
  /* **薄い霧**（宇宙は透明）。色は闇なので、遠いものは白まず暗くなる（契約§5） */
  fog: { color: 0x0a0e1a, near: 34, far: 96 },

  /* ---- 区間パターン（壁区間＝気密回廊／開放区間＝ガラスチューブ） ----------
     契約§5「壁区間と開放区間を交互に」。開放区間では外に宇宙・地球・太陽電池が見える。 */
  MODE: {
    outer: { period: 104, len: 46 },
    inner: { period: 118, len: 92 }
  },
  WALL_PERIOD: 104,
  WALL_LEN: 46,
  mode: 'outer',
  setMode(id) {
    const m = ZoneSpace.MODE[id] || ZoneSpace.MODE.outer;
    ZoneSpace.mode = ZoneSpace.MODE[id] ? id : 'outer';
    ZoneSpace.WALL_PERIOD = m.period;
    ZoneSpace.WALL_LEN = m.len;
    return ZoneSpace.mode;
  },
  isWall(m) {
    /* 大演出「区画爆発」（§4.4 S6）の間は開放区間にする。
       壁があるとコリドーの外で起きる爆発が隠れて「巨大さが画面で分かる」を満たせない。
       演出側の状態を読むだけ（Setpieces は照明も区間も触らない / 一方通行の参照）。 */
    if (typeof Setpieces !== 'undefined' && Setpieces.blastOpenSection &&
        Setpieces.blastOpenSection(m)) return false;
    const p = ((m % ZoneSpace.WALL_PERIOD) + ZoneSpace.WALL_PERIOD) % ZoneSpace.WALL_PERIOD;
    return p < ZoneSpace.WALL_LEN;
  },
  hash(n, salt) { return ZoneKit.hash(n, salt); },

  CULL_BEHIND: 1.2,
  _clear: 0,
  _glide: 0,
  _field(spec) {
    const place = spec.place;
    const isProp = (spec.prop !== false);
    const outside = !!spec.outside;          // 回廊の外にある物（滑空中も見えていてよい）
    spec.place = function (slot, m, t, dist) {
      if (dist !== undefined && m < dist - ZoneSpace.CULL_BEHIND) return null;
      /* 区画爆発で吹き飛ばされている間（自由飛行）は、**回廊そのものが無い**。
         外の構造物（トラス・太陽電池・アンテナ）だけを残して回廊の小物を伏せる。 */
      if (!outside && ZoneSpace._glide > 0.35) return null;
      /* 大演出「区画爆発」のカットのあいだは小物を間引く（背景を空ける / 契約§8 の決定ログ）。
         同じスロットは同じ判定になるので、点滅せず滑らかに消えていく。 */
      if (isProp && ZoneSpace._clear > 0 && ZoneKit.hash(slot, 977) < ZoneSpace._clear) return null;
      return place(slot, m, t, dist);
    };
    return ZoneKit.field(ZoneSpace, spec);
  },

  /* ==========================================================================
     組み立て
     ========================================================================== */
  build(scene) {
    ZoneSpace.scene = scene;
    ZoneSpace._t = 0;
    ZoneSpace._spd01 = 0;
    const F = ZoneSpace.fog;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    scene.background = new THREE.Color(F.color);
    ZoneSpace._lights(scene);
    ZoneSpace._sky(scene);
    ZoneSpace._far(scene);
    ZoneSpace._props(scene);
    ZoneSpace._motes(scene);
    ZoneSpace._speedFx(scene);
  },

  /* ---- 光（太陽の斜光＋地球の照り返し＋船内灯） ---------------------------
     契約§5「太陽の斜光」。強い平行光を斜め上から入れて、白い構造材に
     はっきりした陰を落とす（＝ 明部と暗部を同時に作る＝黒潰れも白飛びもしない）。 */
  _lights(scene) {
    const P = ZoneSpace.PAL;
    /* 宇宙なので環境光は弱い（影が締まる）。船内灯で持ち上げる */
    scene.add(new THREE.AmbientLight(0x2f3a50, 0.46));
    /* 上＝船内灯の白／下＝地球の照り返しの青（面の向きで色が変わる＝立体が出る） */
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a3a68, 0.64));
    /* 太陽の斜光（主光）。横から入れて構造材の稜線を光らせる */
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.06);
    sun.position.set(0.85, 0.75, 0.30);
    scene.add(sun);
    ZoneSpace.sunLight = sun;
    /* 地球からの照り返し（逆側からの弱い青）＝ 影の中が真っ黒にならない */
    const earth = new THREE.DirectionalLight(0x5f9ce8, 0.34);
    earth.position.set(-0.9, -0.5, -0.4);
    scene.add(earth);
    /* 船内灯（走行に合わせて流す）＝ 明るい溜まりが次々に来る */
    ZoneSpace.lampA = new THREE.PointLight(P.lamp, 20.0, 18, 2);
    ZoneSpace.lampB = new THREE.PointLight(0xffd7a0, 14.0, 16, 2);
    scene.add(ZoneSpace.lampA, ZoneSpace.lampB);
    /* 警告灯の回転光（赤・橙）。sync() が回しながら流す（契約§5） */
    ZoneSpace.warnA = new THREE.PointLight(P.warnRed, 0, 13, 2);
    ZoneSpace.warnB = new THREE.PointLight(P.warnAmber, 0, 12, 2);
    scene.add(ZoneSpace.warnA, ZoneSpace.warnB);
    /* 大演出「区画爆発」（§4.4 S6）で、爆発が回廊を照らす明かり。
       位置と強さは sync() が Setpieces から読むだけ（一方通行の参照）。 */
    ZoneSpace.blastKey = new THREE.PointLight(0xffb060, 0, 60, 2);
    scene.add(ZoneSpace.blastKey);
  },

  /* ---- 宇宙（星の点群・地球・太陽） ---------------------------------------
     契約§5「窓の外に地球・星」。すべて霧をかけない（fog:false）＝
     薄い霧でも遠景が沈まない。 */
  _sky(scene) {
    const P = ZoneSpace.PAL;
    const g = new THREE.Group();
    scene.add(g);
    ZoneSpace.sky = g;

    /* --- 星（点群 1つ＝1ドローコール） --- */
    const N = 720;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = ZoneKit.hash(i, 11) * Math.PI * 2;
      const b = (ZoneKit.hash(i, 13) - 0.5) * Math.PI;
      const r = 520 + ZoneKit.hash(i, 17) * 80;
      pos[i * 3] = Math.cos(b) * Math.sin(a) * r;
      pos[i * 3 + 1] = Math.sin(b) * r * 0.7 + 60;
      pos[i * 3 + 2] = -Math.abs(Math.cos(b) * Math.cos(a)) * r - 60;
      const k = 0.45 + ZoneKit.hash(i, 19) * 0.55;
      c.setHex(P.star).multiplyScalar(k);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 3.0, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.95
    }));
    stars.frustumCulled = false;
    stars.renderOrder = -12;
    g.add(stars);
    ZoneSpace.stars = stars;

    /* --- 地球（大きな青い球＋大気の縁光＋雲の帯＋陸） --- */
    const R = 150;
    const earth = new THREE.Group();
    earth.position.set(-118, -66, -430);
    g.add(earth);
    ZoneSpace.earth = earth;
    /* 地球専用の太陽（レイヤー2）。回廊の陰影を崩さずに、**カメラ側を向いた面**を
       明るくする＝ 契約§3 の明部（≥200）を「雲の帯」で作る。
       Three.js の light.layers は「照らす相手」を選ぶ仕組みなので、
       この光は地球のメッシュだけに効く（回廊の陰影はそのまま）。 */
    const esun = new THREE.DirectionalLight(0xfff6e4, 1.55);
    esun.position.set(0.55, 0.40, 1.0);
    esun.layers.set(2);
    g.add(esun);
    /* 海（太陽の斜光で明暗が割れる＝球に見える） */
    const sea = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28),
                               new THREE.MeshLambertMaterial({ color: P.earth, fog: false }));
    sea.layers.enable(2);
    earth.add(sea);
    /* 陸（緯度・経度の一部を切り出した薄い殻） */
    const land = [];
    [[0.6, 1.0, 1.1, 0.55], [2.5, 0.8, 1.6, 0.42], [4.3, 0.7, 1.9, 0.6], [5.4, 1.1, 1.25, 0.3]]
      .forEach((q) => {
        land.push({ g: new THREE.SphereGeometry(R * 1.004, 18, 12, q[0], q[1], q[2], q[3]) });
      });
    const landM = new THREE.Mesh(ZoneKit.merge(land),
                                 new THREE.MeshLambertMaterial({ color: P.earthLand, fog: false }));
    landM.layers.enable(2);
    earth.add(landM);
    /* 雲の帯（緯度の帯を数本。白いが薄いので白飛びしない） */
    const cloud = [];
    [[0, 6.28, 1.15, 0.16], [1.2, 5.0, 1.52, 0.13], [3.0, 4.2, 1.86, 0.15], [0.4, 5.6, 2.15, 0.11]]
      .forEach((q) => {
        cloud.push({ g: new THREE.SphereGeometry(R * 1.012, 24, 10, q[0], q[1], q[2], q[3]) });
      });
    const clouds = new THREE.Mesh(ZoneKit.merge(cloud), new THREE.MeshLambertMaterial({
      color: P.earthCloud, fog: false, transparent: true, opacity: 0.62, depthWrite: false
    }));
    clouds.layers.enable(2);
    earth.add(clouds);
    ZoneSpace.earthClouds = clouds;
    /* 大気の縁光（内側から見る球＝縁だけが光る） */
    const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.075, 30, 20),
                               new THREE.MeshBasicMaterial({
                                 color: P.earthRim, fog: false, transparent: true, opacity: 0.16,
                                 side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
                               }));
    earth.add(rim);
    const rim2 = new THREE.Mesh(new THREE.SphereGeometry(R * 1.026, 30, 20),
                                new THREE.MeshBasicMaterial({
                                  color: 0xbfe4ff, fog: false, transparent: true, opacity: 0.10,
                                  side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
                                }));
    earth.add(rim2);
    earth.renderOrder = -11;

    /* --- 太陽（斜光の出どころ。小さく強い光と、にじみ） --- */
    const sunG = new THREE.Group();
    sunG.position.set(196, 128, -330);
    g.add(sunG);
    sunG.add(new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12),
                            new THREE.MeshBasicMaterial({ color: P.sun, fog: false })));
    [[26, 0.20], [52, 0.10], [96, 0.05]].forEach((q) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(q[0], 24),
                               new THREE.MeshBasicMaterial({
                                 color: P.sun, fog: false, transparent: true, opacity: q[1],
                                 blending: THREE.AdditiveBlending, depthWrite: false
                               }));
      sunG.add(m);
    });
    sunG.renderOrder = -10;
    ZoneSpace.sun = sunG;
  },

  /* ---- 遠景（外に並ぶステーションのモジュール・トラス・太陽電池の翼） ------
     深海・遺跡と同じ流儀: 霧をかけない暗いシルエットにして、星空と地球（明部）との
     明暗差で輪郭を立てる。視差で流す。 */
  _far(scene) {
    ZoneSpace.farLayers = [];
    const LEN = 430;
    const P = ZoneSpace.PAL;
    const B = (w, h, d, x, y, z, rot) => ({ g: ZoneKit.box(w, h, d), p: [x, y, z], r: rot || [0, 0, 0] });

    function module(s) {                       // 円筒のモジュール（ドッキングポート付き）
      const o = [];
      o.push({ g: new THREE.CylinderGeometry(9 * s, 9 * s, 42 * s, 10), p: [0, 0, 0], r: [Math.PI / 2, 0, 0] });
      o.push({ g: new THREE.CylinderGeometry(11 * s, 11 * s, 3 * s, 10), p: [0, 0, -20 * s], r: [Math.PI / 2, 0, 0] });
      o.push({ g: new THREE.CylinderGeometry(11 * s, 11 * s, 3 * s, 10), p: [0, 0, 20 * s], r: [Math.PI / 2, 0, 0] });
      o.push(B(3 * s, 3 * s, 26 * s, 9 * s, 4 * s, 0));
      o.push(B(26 * s, 2 * s, 2 * s, 0, 10 * s, 6 * s));
      return o;
    }
    function trussArm(s, n) {                  // トラス（斜材の入った桁）
      const o = [];
      o.push(B(n * 8 * s, 1.6 * s, 1.6 * s, 0, 3 * s, 0));
      o.push(B(n * 8 * s, 1.6 * s, 1.6 * s, 0, -3 * s, 0));
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 8 * s;
        o.push(B(1.2 * s, 6.4 * s, 1.2 * s, x, 0, 0));
        o.push(B(1.1 * s, 7.6 * s, 1.1 * s, x + 4 * s, 0, 0, [0, 0, 0.62]));
      }
      return o;
    }
    function wing(s) {                         // 太陽電池の翼
      const o = [];
      for (let i = 0; i < 4; i++) {
        o.push(B(34 * s, 0.6 * s, 13 * s, 0, 0, (i - 1.5) * 14 * s));
        o.push(B(34 * s, 0.9 * s, 0.9 * s, 0, 0.5 * s, (i - 1.5) * 14 * s));
      }
      o.push(B(2 * s, 2 * s, 60 * s, 0, 0, 0));
      return o;
    }
    function dish(s) {                         // パラボラアンテナ
      const o = [];
      o.push({ g: new THREE.CylinderGeometry(12 * s, 2 * s, 5 * s, 12), p: [0, 6 * s, 0], r: [1.1, 0, 0] });
      o.push(B(1.4 * s, 12 * s, 1.4 * s, 0, 0, 0));
      return o;
    }

    const mk = (parts, color, par) => {
      const mesh = new THREE.Mesh(ZoneKit.merge(parts), ZoneKit.bas(color, { fog: false }));
      mesh.frustumCulled = false;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.userData = { par: par, len: LEN };
      scene.add(grp);
      ZoneSpace.farLayers.push(grp);
      return grp;
    };
    /* --- 近い層: となりのモジュール・トラス・太陽電池（暗いシルエット） --- */
    const near = [];
    const put = (parts, x, y, z, s) => {
      parts.forEach((q) => near.push({ g: q.g, p: [q.p[0] + x, q.p[1] + y, q.p[2] + z], r: q.r, s: [s, s, s] }));
    };
    put(module(1.0), -46, 16, -70, 1);
    put(trussArm(1.0, 5), 52, -14, -150, 1);
    put(wing(0.9), 60, -16, -150, 1);
    put(module(0.8), 54, 26, -250, 1);
    put(dish(1.0), -40, 24, -330, 1);
    put(trussArm(0.9, 6), -54, -18, -410, 1);
    put(wing(0.7), -60, -20, -410, 1);
    put(module(0.9), 48, -26, -520, 1);
    put(dish(0.8), 40, 30, -610, 1);
    put(trussArm(1.1, 4), -50, 22, -700, 1);
    mk(near, P.far, 0.34);

    /* --- 遠い層: ステーションの本体（さらに暗い） --- */
    const far = [];
    const putF = (parts, x, y, z) => parts.forEach((q) => far.push({ g: q.g, p: [q.p[0] + x, q.p[1] + y, q.p[2] + z], r: q.r }));
    putF(trussArm(2.2, 7), -120, 40, -260);
    putF(module(2.0), 130, -50, -360);
    putF(wing(1.8), -140, -44, -520);
    putF(trussArm(2.0, 6), 126, 52, -650);
    putF(module(1.8), -128, 34, -780);
    mk(far, P.farDeep, 0.12);
  },

  /* ---- 漂う粒（無重力の埃・氷の粒）と星のきらめき ------------------------- */
  _motes(scene) {
    const P = ZoneSpace.PAL;
    /* 無重力の埃（ゆっくり漂う。回転しながら） */
    ZoneSpace._field({
      name: 'dust', onTrack: true, spacing: 1.5, geo: new THREE.PlaneGeometry(0.045, 0.045),
      mat: ZoneKit.add(0xcfe0ff, 0.28), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 801), h2 = ZoneKit.hash(slot, 809), h3 = ZoneKit.hash(slot, 811);
        return { x: (h1 - 0.5) * 7.0, y: 0.2 + h2 * (CFG.H - 0.4) + Math.sin(t * 0.4 + slot) * 0.22,
                 dz: h3 * 1.2, rz: t * 0.25 + slot, sx: 0.6 + h3 * 1.3, sy: 0.6 + h3 * 1.3 };
      }
    });
    /* 氷の粒（推進剤のベント。きらっと光る） */
    ZoneSpace._field({
      name: 'ice', onTrack: true, spacing: 3.4, geo: new THREE.PlaneGeometry(0.06, 0.06),
      mat: ZoneKit.add(0xffffff, 0.42), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 821), h2 = ZoneKit.hash(slot, 823), h3 = ZoneKit.hash(slot, 827);
        const fl = 0.35 + 0.65 * Math.abs(Math.sin(t * (1.4 + h3 * 2.6) + slot * 1.9));
        return { x: (h1 - 0.5) * 7.4, y: 0.15 + h2 * (CFG.H - 0.3),
                 dz: h3 * 2.0, sx: fl, sy: fl };
      }
    });
  },

  /* ---- 体感速度の演出（契約§4.1）: 面を流れる光条と、外を流れる星の筋 ---- */
  _speedFx(scene) {
    const P = ZoneSpace.PAL, H = CFG.H;
    const streak = new THREE.PlaneGeometry(0.085, 1.0);
    ZoneSpace.speedLines = [];
    [['floor', 0.022, -Math.PI / 2, P.amber], ['ceil', H - 0.022, Math.PI / 2, P.indigo]].forEach((sfc, si) => {
      ZoneSpace.speedLines.push(ZoneSpace._field({
        name: 'speedline', roadMark: true, onTrack: true, spacing: 2.0, geo: streak, mat: ZoneKit.add(sfc[3], 0.18),
        prop: false, order: 4,
        place(slot, m) {
          if ((slot & 1) !== si) return null;
          const lane = CFG.LANES[Math.floor(ZoneKit.hash(slot, 211) * 3)];
          return { x: lane * CFG.LANE_W + (ZoneKit.hash(slot, 213) - 0.5) * 0.55, y: sfc[1], rx: sfc[2],
                   dz: ZoneKit.hash(slot, 217) * 1.8, sy: 2.4 + ZoneSpace._spd01 * 6.5 };
        }
      }));
    });
    /* 外を流れる光の筋（開放区間で速度が読める） */
    const N = 200;
    const pos = new Float32Array(N * 6);
    ZoneSpace.WIND_CELL = 26;
    for (let i = 0; i < N; i++) {
      const side = (i % 2) ? 1 : -1;
      const x = side * (2.6 + ZoneKit.hash(i, 401) * 5.0);
      const y = -1.6 + ZoneKit.hash(i, 403) * 8.0;
      const z = -ZoneKit.hash(i, 407) * ZoneSpace.WIND_CELL * 4 + 6;
      const len = 2.2 + ZoneKit.hash(i, 411) * 3.4;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z - len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ZoneSpace.windMat = new THREE.LineBasicMaterial({
      color: 0xbfd4ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const m = new THREE.LineSegments(g, ZoneSpace.windMat);
    m.frustumCulled = false;
    ZoneSpace.wind = new THREE.Group();
    ZoneSpace.wind.add(m);
    scene.add(ZoneSpace.wind);
  },

  /* ==========================================================================
     小物（20種以上・前方60mに常時40個以上 / 契約§3 ジオラマ調の規範）
     ========================================================================== */
  _props(scene) {
    const P = ZoneSpace.PAL;
    const HW = CFG.HALF_W;       // 1.8
    const H = CFG.H;             // 4.0
    const XW = HW + 0.16;        // 1.96（壁の内側）
    const hash = ZoneKit.hash;
    const isWall = ZoneSpace.isWall;
    const F = ZoneSpace._field;

    /* --- 1. 気密回廊の壁パネル（白い構造材＋黒い目地） -------------------- */
    {
      const fp = [
        { g: ZoneKit.box(0.50, H + 4.6, 7.9), p: [0, 0, 0] }
      ];
      /* パネルの割り（縦横の目地）＝ のっぺりさせない */
      for (let i = -2; i <= 2; i++) fp.push({ g: ZoneKit.box(0.10, 0.09, 7.9), p: [-0.28, i * 0.82, 0] });
      for (let i = -1; i <= 1; i++) fp.push({ g: ZoneKit.box(0.10, H + 4.4, 0.10), p: [-0.28, 0, i * 2.4] });
      /* ハンドホールド（丸い凹み）と型番の刻み */
      [-1.3, 0.2, 1.7].forEach((y, i) => {
        fp.push({ g: ZoneKit.box(0.14, 0.30, 0.30), p: [-0.22, y, (i - 1) * 1.7] });
      });
      const g = ZoneKit.merge(fp);
      F({
        name: 'wall', spacing: 4, geo: g, mat: ZoneKit.lam(P.hull),
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.46), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 2. 構造フレームのリブ（回廊をぐるりと囲む黒い骨） ----------------
       ■ **1つのフィールドの形は「片側だけ」または「走行の高さの外だけ」にする**
         （ZoneKit.intrudes は融合した形の外接箱で走路への食い込みを見るので、
          左右をまたぐ形を1つにすると、実際は当たらなくても検出に引っかかる）。
         柱（左右）と梁（上下）を別のフィールドに分け、同じ z に来るように
         spacing を半分にして dz でそろえる。 */
    {
      const parts = [{ g: ZoneKit.box(0.26, H + 0.9, 0.34), p: [0, 0, 0] }];
      parts.push({ g: ZoneKit.box(0.5, 0.5, 0.26), p: [-0.20, (H + 0.9) / 2 - 0.24, 0], r: [0, 0, Math.PI / 4] });
      parts.push({ g: ZoneKit.box(0.5, 0.5, 0.26), p: [-0.20, -((H + 0.9) / 2 - 0.24), 0], r: [0, 0, Math.PI / 4] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'rib', spacing: 3.75, geo: g, mat: ZoneKit.lam(P.hullDark),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.30), y: H / 2, dz: (slot % 2) ? 0 : 3.75, ry: side > 0 ? 0 : Math.PI };
        }
      });
      const bar = ZoneKit.merge([{ g: ZoneKit.box((XW + 0.44) * 2, 0.26, 0.34), p: [0, 0, 0] }]);
      F({
        name: 'ribBar', spacing: 3.75, geo: bar, mat: ZoneKit.lam(P.hullDark),
        place(slot, m) {
          const up = (slot % 2) === 1;
          return { x: 0, y: up ? (H + 0.34) : -0.34, dz: up ? 0 : 3.75 };
        }
      });
    }

    /* --- 3. 発光する操作パネル（壁に並ぶ画面） ---------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.10, 0.52, 0.74), p: [0, 0, 0] },
        { g: ZoneKit.box(0.04, 0.38, 0.58), p: [-0.06, 0, 0] }
      ];
      for (let i = 0; i < 3; i++) parts.push({ g: ZoneKit.box(0.03, 0.05, 0.44), p: [-0.09, 0.12 - i * 0.12, 0] });
      const g = ZoneKit.merge(parts);
      const mat = ZoneKit.bas(P.holo, { transparent: true, opacity: 0.92, fog: true });
      ZoneSpace.panelMat = mat;
      F({
        name: 'panel', spacing: 6.2, geo: g, mat: mat,
        place(slot, m) {
          if (!isWall(m)) return null;
          if (hash(slot, 131) > 0.72) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.06), y: 1.0 + hash(slot, 133) * 1.9, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 4. ケーブル束（壁ぎわを走る） ------------------------------------ */
    {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        parts.push({ g: ZoneKit.box(0.07, 0.07, 8.0), p: [(i % 2) * 0.09, i * 0.085, 0] });
      }
      parts.push({ g: ZoneKit.box(0.22, 0.14, 0.18), p: [0.04, 0.17, -2.2] });
      parts.push({ g: ZoneKit.box(0.22, 0.14, 0.18), p: [0.04, 0.17, 1.9] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'cable', spacing: 8, geo: g, mat: ZoneKit.lam(P.cable),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 0;
          return { x: side * (XW + 0.02), y: up ? (H - 0.42) : 0.42, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 5. 配管（太い管が壁を這う。継手つき） ---------------------------- */
    {
      const parts = [
        { g: ZoneKit.cyl(0.14, 8.0, 8), p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneKit.cyl(0.18, 0.26, 8), p: [0, 0, -2.6], r: [Math.PI / 2, 0, 0] },
        { g: ZoneKit.cyl(0.18, 0.26, 8), p: [0, 0, 1.4], r: [Math.PI / 2, 0, 0] },
        { g: ZoneKit.box(0.16, 0.34, 0.16), p: [0, -0.22, 3.0] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'pipe', spacing: 8, geo: g, mat: ZoneKit.lam(P.steel),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 1;
          return { x: side * (XW + 0.24), y: up ? (H - 0.66) : 0.66, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 6. ダクト（角い通風管。曲がりがある） ---------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.34, 0.30, 5.2), p: [0, 0, 0] },
        { g: ZoneKit.box(0.40, 0.36, 0.14), p: [0, 0, -2.0] },
        { g: ZoneKit.box(0.40, 0.36, 0.14), p: [0, 0, 1.2] },
        { g: ZoneKit.box(0.30, 0.66, 0.30), p: [0, -0.4, 2.3] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'duct', spacing: 11, geo: g, mat: ZoneKit.lam(P.steelDark),
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.36), y: H - 0.34, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 7. 格納コンテナ（壁ぎわに固定された箱） -------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.52, 0.62, 1.15), p: [0, 0, 0] },
        { g: ZoneKit.box(0.56, 0.08, 1.19), p: [0, 0.30, 0] },
        { g: ZoneKit.box(0.56, 0.08, 1.19), p: [0, -0.30, 0] },
        { g: ZoneKit.box(0.06, 0.40, 0.08), p: [-0.28, 0, 0.3] }
      ];
      for (let i = 0; i < 3; i++) parts.push({ g: ZoneKit.box(0.54, 0.05, 0.05), p: [0, 0.18 - i * 0.18, -0.5] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'container', spacing: 9, geo: g, mat: ZoneKit.lam(P.hullDark),
        place(slot, m) {
          if (hash(slot, 141) > 0.78) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 3) === 0;
          return { x: side * (XW + 0.46), y: up ? (H - 0.5) : 0.5, ry: side > 0 ? 0 : Math.PI,
                   rz: hash(slot, 143) * 0.05 };
        }
      });
    }

    /* --- 8. 小さな箱・工具箱（積み重ね） ---------------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.30, 0.24, 0.34), p: [0, 0, 0] },
        { g: ZoneKit.box(0.26, 0.20, 0.30), p: [0.03, 0.22, 0.06], r: [0, 0.3, 0.08] },
        { g: ZoneKit.box(0.32, 0.04, 0.36), p: [0, 0.13, 0] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'crate', spacing: 5.5, geo: g, mat: ZoneKit.lam(P.steelDark),
        place(slot, m) {
          if (hash(slot, 151) > 0.55) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 1;
          return { x: side * (XW + 0.30 + hash(slot, 153) * 0.4), y: up ? (H - 0.14) : 0.14,
                   ry: hash(slot, 157) * 3 };
        }
      });
    }

    /* --- 9. ロボットアーム（関節のある腕。ゆっくり動く） ------------------ */
    {
      const parts = [
        { g: ZoneKit.cyl(0.20, 0.22, 8), p: [0, 0.11, 0] },            // 台座
        { g: ZoneKit.box(0.16, 0.86, 0.16), p: [0, 0.60, 0] },         // 第1関節
        { g: ZoneKit.cyl(0.13, 0.22, 8), p: [0, 1.02, 0], r: [0, 0, Math.PI / 2] },
        { g: ZoneKit.box(0.14, 0.70, 0.14), p: [0.30, 1.28, 0], r: [0, 0, -0.8] },
        { g: ZoneKit.box(0.10, 0.10, 0.28), p: [0.62, 1.50, 0], r: [0, 0, -0.8] },
        { g: ZoneKit.box(0.06, 0.24, 0.06), p: [0.70, 1.56, 0.08], r: [0.3, 0, -0.8] },
        { g: ZoneKit.box(0.06, 0.24, 0.06), p: [0.70, 1.56, -0.08], r: [-0.3, 0, -0.8] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'arm', spacing: 17, geo: g, mat: ZoneKit.lam(P.hull),
        place(slot, m, t) {
          if (hash(slot, 161) > 0.62) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 1;
          return { x: side * (XW + 0.62), y: up ? H : 0, rz: up ? Math.PI : 0,
                   ry: side * (0.4 + Math.sin(t * 0.5 + slot) * 0.5) };
        }
      });
    }

    /* --- 10. ホログラム端末（宙に浮く青い図面） --------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.34, 0.02, 0.34), p: [0, 0, 0] },
        { g: ZoneKit.box(0.26, 0.26, 0.02), p: [0, 0.32, 0] },
        { g: ZoneKit.box(0.02, 0.26, 0.26), p: [0, 0.32, 0] },
        { g: ZoneKit.box(0.20, 0.02, 0.20), p: [0, 0.48, 0], r: [0, 0.6, 0] },
        { g: ZoneKit.box(0.03, 0.30, 0.03), p: [0, 0.16, 0] }
      ];
      const g = ZoneKit.merge(parts);
      const mat = ZoneKit.add(P.holo, 0.55);
      ZoneSpace.holoMat = mat;
      F({
        name: 'holo', spacing: 13, geo: g, mat: mat, order: 4,
        place(slot, m, t) {
          if (hash(slot, 171) > 0.6) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.42), y: 0.9 + hash(slot, 173) * 1.6,
                   ry: t * 0.6 + slot, sx: 1, sy: 1 + Math.sin(t * 2 + slot) * 0.04 };
        }
      });
    }

    /* --- 11. 浮遊する工具（無重力でゆっくり回る） ------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.06, 0.30, 0.06), p: [0, 0, 0] },
        { g: ZoneKit.box(0.13, 0.09, 0.09), p: [0, 0.17, 0] },
        { g: ZoneKit.box(0.09, 0.07, 0.07), p: [0, -0.16, 0] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'tool', spacing: 6.5, geo: g, mat: ZoneKit.lam(P.steel),
        place(slot, m, t) {
          if (hash(slot, 181) > 0.5) return null;
          const side = (slot % 2) ? 1 : -1;
          /* 走行空間（|x| ≤ 1.45）へは入らない。壁ぎわを漂う */
          const x = side * (1.74 + hash(slot, 183) * 1.2);
          return { x: x, y: 0.5 + hash(slot, 185) * (H - 1.0) + Math.sin(t * 0.5 + slot) * 0.16,
                   rx: t * (0.4 + hash(slot, 187) * 0.5) + slot,
                   ry: t * 0.3 + slot, rz: t * (0.2 + hash(slot, 189) * 0.4) };
        }
      });
    }

    /* --- 12. 浮遊するボルト（小さな金物。もっと速く回る） ----------------- */
    {
      const parts = [
        { g: new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6), p: [0, 0, 0] },
        { g: ZoneKit.box(0.025, 0.14, 0.025), p: [0, -0.08, 0] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'bolt', spacing: 4.2, geo: g, mat: ZoneKit.lam(P.hullLit),
        place(slot, m, t) {
          if (hash(slot, 191) > 0.55) return null;
          const side = (slot % 2) ? 1 : -1;
          const x = side * (1.70 + hash(slot, 193) * 1.5);
          return { x: x, y: 0.3 + hash(slot, 195) * (H - 0.6) + Math.sin(t * 0.7 + slot * 2) * 0.2,
                   rx: t * (1.0 + hash(slot, 197)), rz: t * (0.8 + hash(slot, 199)) };
        }
      });
    }

    /* --- 13. 気密扉（回廊を区切るハッチ）: 枠（左右）と退避した扉（上下） --- */
    {
      const post = ZoneKit.merge([
        { g: ZoneKit.box(0.30, H + 0.7, 0.30), p: [0, 0, 0] },
        { g: ZoneKit.box(0.16, 0.5, 0.36), p: [-0.10, (H + 0.7) / 2 - 0.4, 0] }
      ]);
      F({
        name: 'hatch', spacing: 13, geo: post, mat: ZoneKit.lam(P.hull),
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.34), y: H / 2, dz: (slot % 2) ? 0 : 13, ry: side > 0 ? 0 : Math.PI };
        }
      });
      /* 半開きの扉（床下・天井裏へ退避した厚い板）。走行の高さには入らない */
      const parts = [
        { g: ZoneKit.box((XW + 0.5) * 2, 0.30, 0.30), p: [0, 0, 0] },
        { g: ZoneKit.box((XW + 0.2) * 2, 0.34, 0.16), p: [0, 0, 0.20] }
      ];
      for (let i = 0; i < 4; i++) parts.push({ g: ZoneKit.box(0.22, 0.22, 0.22), p: [(i - 1.5) * 1.0, 0, 0.32] });
      const door = ZoneKit.merge(parts);
      F({
        name: 'hatchDoor', spacing: 13, geo: door, mat: ZoneKit.lam(P.hull),
        place(slot, m) {
          if (!isWall(m)) return null;
          const up = (slot % 2) === 1;
          return { x: 0, y: up ? (H + 0.30) : -0.30, dz: up ? 0 : 13 };
        }
      });
    }

    /* --- 14. 警告灯（赤・回転する灯体） ------------------------------------ */
    {
      const parts = [
        { g: ZoneKit.box(0.18, 0.10, 0.18), p: [0, 0, 0] },
        { g: new THREE.CylinderGeometry(0.10, 0.12, 0.14, 8), p: [0, 0.11, 0] },
        { g: ZoneKit.box(0.30, 0.05, 0.05), p: [0.12, 0.11, 0] }        // 回る光の羽根
      ];
      const g = ZoneKit.merge(parts);
      const mat = ZoneKit.bas(P.warnRed, { fog: true });
      ZoneSpace.warnMatA = mat;
      F({
        name: 'beacon', spacing: 14, geo: g, mat: mat,
        place(slot, m, t) {
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.1), y: H - 0.12, rz: Math.PI, ry: t * 2.6 + slot };
        }
      });
    }
    /* --- 15. 警告灯（橙・床側） ------------------------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.16, 0.09, 0.16), p: [0, 0, 0] },
        { g: new THREE.CylinderGeometry(0.09, 0.11, 0.13, 8), p: [0, 0.10, 0] },
        { g: ZoneKit.box(0.28, 0.05, 0.05), p: [0.11, 0.10, 0] }
      ];
      const g = ZoneKit.merge(parts);
      const mat = ZoneKit.bas(P.warnAmber, { fog: true });
      ZoneSpace.warnMatB = mat;
      F({
        name: 'beacon2', spacing: 14, geo: g, mat: mat,
        place(slot, m, t) {
          const side = (slot % 2) ? -1 : 1;
          return { x: side * (XW + 0.1), y: 0.1, ry: -t * 2.2 + slot };
        }
      });
    }

    /* --- 16. 手すり（グラブレール） --------------------------------------- */
    {
      const parts = [
        { g: ZoneKit.cyl(0.035, 3.4, 6), p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneKit.box(0.07, 0.16, 0.07), p: [0, -0.10, -1.6] },
        { g: ZoneKit.box(0.07, 0.16, 0.07), p: [0, -0.10, 1.6] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'rail', spacing: 4.5, geo: g, mat: ZoneKit.lam(P.hullLit),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 1;
          return { x: side * (XW + 0.14), y: up ? (H - 1.05) : 1.05, rz: up ? Math.PI : 0 };
        }
      });
    }

    /* --- 17. 照明バー（天井と床の縁を走る白い光） ------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.26, 0.09, 2.5), p: [0, 0, 0] },
        { g: ZoneKit.box(0.32, 0.13, 0.12), p: [0, 0.02, -1.25] },
        { g: ZoneKit.box(0.32, 0.13, 0.12), p: [0, 0.02, 1.25] }
      ];
      const g = ZoneKit.merge(parts);
      const mat = ZoneKit.bas(P.lamp, { transparent: true, opacity: 0.95, fog: true });
      ZoneSpace.lampMat = mat;
      F({
        name: 'light', spacing: 3.2, geo: g, mat: mat,
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 1;
          return { x: side * (XW - 0.04), y: up ? (H - 0.07) : 0.07, rz: up ? Math.PI : 0 };
        }
      });
    }

    /* --- 17b. 壁の光条（腰の高さを走る帯。白い明部の主役） ----------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.06, 0.22, 3.0), p: [0, 0, 0] },
        { g: ZoneKit.box(0.10, 0.30, 0.10), p: [0, 0, -1.5] },
        { g: ZoneKit.box(0.10, 0.30, 0.10), p: [0, 0, 1.5] }
      ];
      const g = ZoneKit.merge(parts);
      const mat = ZoneKit.bas(P.lamp, { transparent: true, opacity: 0.86, fog: true });
      ZoneSpace.stripMat = mat;
      F({
        name: 'strip', spacing: 3.4, geo: g, mat: mat,
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.04), y: H * 0.5 + ((slot >> 1) % 2 ? 0.55 : -0.55) };
        }
      });
    }

    /* --- 18. 通風口（格子） ----------------------------------------------- */
    {
      const parts = [{ g: ZoneKit.box(0.06, 0.44, 0.62), p: [0, 0, 0] }];
      for (let i = 0; i < 5; i++) parts.push({ g: ZoneKit.box(0.10, 0.04, 0.56), p: [-0.04, 0.16 - i * 0.08, 0] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'vent', spacing: 9.5, geo: g, mat: ZoneKit.lam(P.ink),
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = ((slot >> 1) % 2) === 0;
          return { x: side * (XW + 0.02), y: up ? (H - 1.5) : 1.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 19. ラック（実験装置の棚） --------------------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.44, 1.30, 0.80), p: [0, 0, 0] },
        { g: ZoneKit.box(0.48, 0.06, 0.84), p: [0, 0.45, 0] },
        { g: ZoneKit.box(0.48, 0.06, 0.84), p: [0, 0.0, 0] },
        { g: ZoneKit.box(0.48, 0.06, 0.84), p: [0, -0.45, 0] },
        { g: ZoneKit.box(0.10, 0.20, 0.20), p: [-0.24, 0.22, 0.2] },
        { g: ZoneKit.box(0.10, 0.14, 0.34), p: [-0.24, -0.22, -0.1] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'locker', spacing: 15, geo: g, mat: ZoneKit.lam(P.steelDark),
        place(slot, m) {
          if (!isWall(m)) return null;
          if (hash(slot, 201) > 0.7) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.40), y: 0.9 + hash(slot, 203) * 1.6 };
        }
      });
    }

    /* --- 20. 床の標示（区画番号・黄色のライン） ---------------------------- */
    {
      const parts = [{ g: ZoneKit.box(0.9, 0.012, 0.16), p: [0, 0, 0] }];
      for (let i = 0; i < 3; i++) parts.push({ g: ZoneKit.box(0.14, 0.012, 0.14), p: [-0.3 + i * 0.3, 0, 0.42] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'decal', onTrack: true, spacing: 6.0, geo: g,
        mat: ZoneKit.bas(P.warnAmber, { transparent: true, opacity: 0.55, fog: true }), order: 3,
        place(slot, m) {
          const up = (slot % 2) === 1;
          const lane = CFG.LANES[Math.floor(hash(slot, 205) * 3)];
          return { x: lane * CFG.LANE_W, y: up ? (H - 0.03) : 0.03 };
        }
      });
    }

    /* --- 21. ガラスチューブの輪（開放区間の骨）: 側面の弧と上下の弧を分ける -- */
    {
      const R = XW + 0.34;
      const side = [];
      for (let i = -1; i <= 1; i++) {                  // 側面の弧（走行空間 |x|≤1.45 には入らない）
        const a = i / 12 * Math.PI * 2;
        side.push({ g: ZoneKit.box(0.16, 0.86, 0.22),
                    p: [Math.cos(a) * R - R, Math.sin(a) * (H / 2 + 0.5), 0], r: [0, 0, a] });
      }
      F({
        name: 'glassRing', spacing: 3.25, geo: ZoneKit.merge(side), mat: ZoneKit.lam(P.steel),
        place(slot, m) {
          if (isWall(m)) return null;
          const sd = (slot % 2) ? 1 : -1;
          return { x: sd * R, y: H / 2, dz: (slot % 2) ? 0 : 3.25, ry: sd > 0 ? 0 : Math.PI };
        }
      });
      /* 上下の桁（走行の高さの外だけ）。弧にすると外接箱が走行の高さへ降りてくるので、
         平らな桁＋端の折れで「輪の上辺」に見せる。 */
      const cap = [
        { g: ZoneKit.box(R * 1.4, 0.16, 0.22), p: [0, 0, 0] },
        { g: ZoneKit.box(0.62, 0.16, 0.22), p: [R * 0.82, -0.12, 0], r: [0, 0, -0.55] },
        { g: ZoneKit.box(0.62, 0.16, 0.22), p: [-R * 0.82, -0.12, 0], r: [0, 0, 0.55] }
      ];
      F({
        name: 'glassCap', spacing: 3.25, geo: ZoneKit.merge(cap), mat: ZoneKit.lam(P.steel),
        place(slot, m) {
          if (isWall(m)) return null;
          const up = (slot % 2) === 1;
          return { x: 0, y: up ? (H + 0.62) : -0.62, dz: up ? 0 : 3.25, rz: up ? 0 : Math.PI };
        }
      });
    }
    /* --- 22. ガラス面（開放区間の透明な筒。薄い青の膜）: 側面と上下を分ける -- */
    {
      const pane = ZoneKit.merge([{ g: ZoneKit.box(0.05, H + 1.4, 6.4), p: [0, 0, 0] }]);
      F({
        name: 'glass', spacing: 3.25, geo: pane,
        mat: ZoneKit.add(P.glass, 0.09), order: 2,
        place(slot, m) {
          if (isWall(m)) return null;
          const sd = (slot % 2) ? 1 : -1;
          return { x: sd * (XW + 0.30), y: H / 2, dz: (slot % 2) ? 0 : 3.25 };
        }
      });
      const cap = ZoneKit.merge([{ g: ZoneKit.box((XW + 0.3) * 2, 0.05, 6.4), p: [0, 0, 0] }]);
      F({
        name: 'glassTop', spacing: 3.25, geo: cap,
        mat: ZoneKit.add(P.glass, 0.09), order: 2,
        place(slot, m) {
          if (isWall(m)) return null;
          const up = (slot % 2) === 1;
          return { x: 0, y: up ? (H + 0.68) : -0.68, dz: up ? 0 : 3.25 };
        }
      });
    }

    /* --- 23. 外のトラス（開放区間の外を並走する桁） ------------------------ */
    {
      const parts = [];
      for (let i = 0; i < 3; i++) {
        parts.push({ g: ZoneKit.box(0.22, 0.22, 9.0), p: [0, i * 0.9, 0] });
      }
      for (let i = 0; i < 6; i++) {
        parts.push({ g: ZoneKit.box(0.14, 1.9, 0.14), p: [0, 0.9, -3.6 + i * 1.5], r: [0.5, 0, 0] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'truss', outside: true, spacing: 9, geo: g, mat: ZoneKit.lam(P.truss),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (4.4 + hash(slot, 211) * 1.2), y: -0.8 + hash(slot, 213) * 3.0 };
        }
      });
    }

    /* --- 24. 太陽電池パネル（外・契約§5） --------------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 3; i++) {
        parts.push({ g: ZoneKit.box(3.6, 0.07, 1.5), p: [0, 0, (i - 1) * 1.7] });
        parts.push({ g: ZoneKit.box(3.6, 0.11, 0.09), p: [0, 0.05, (i - 1) * 1.7] });
      }
      parts.push({ g: ZoneKit.box(0.18, 0.18, 5.6), p: [0, 0, 0] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'solar', outside: true, spacing: 24, geo: g, mat: ZoneKit.lam(P.solar),
        place(slot, m, t) {
          if (isWall(m + 6)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * 8.6, y: 1.0 + hash(slot, 221) * 4.0,
                   rz: side * (0.28 + Math.sin(t * 0.12 + slot) * 0.06), ry: 0.1 };
        }
      });
    }

    /* --- 25. アンテナ（外・細い棒と皿） ------------------------------------ */
    {
      const parts = [
        { g: ZoneKit.box(0.10, 2.4, 0.10), p: [0, 1.2, 0] },
        { g: new THREE.CylinderGeometry(0.7, 0.14, 0.34, 10), p: [0, 2.5, 0], r: [1.0, 0, 0] },
        { g: ZoneKit.box(0.06, 0.06, 0.7), p: [0, 2.5, 0.3] },
        { g: ZoneKit.box(0.42, 0.10, 0.10), p: [0, 0.8, 0] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'antenna', outside: true, spacing: 21, geo: g, mat: ZoneKit.lam(P.hull),
        place(slot, m, t) {
          if (isWall(m + 4)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (5.6 + hash(slot, 231) * 1.4), y: -1.6, ry: Math.sin(t * 0.2 + slot) * 0.4 };
        }
      });
    }

    /* --- 26. 外壁のスラスター（時々ふかす小さな光） ------------------------ */
    {
      const parts = [
        { g: ZoneKit.box(0.30, 0.30, 0.34), p: [0, 0, 0] },
        { g: new THREE.CylinderGeometry(0.16, 0.10, 0.22, 8), p: [0.22, 0, 0], r: [0, 0, Math.PI / 2] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'thruster', outside: true, spacing: 19, geo: g, mat: ZoneKit.lam(P.hullDark),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.9), y: hash(slot, 241) > 0.5 ? (H + 0.5) : -0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }
  },

  /* ==========================================================================
     毎フレームの送り出し
     ========================================================================== */
  sync(dist, t, speed) {
    if (!ZoneSpace.scene) return;
    ZoneSpace._t = t;
    ZoneSpace._speed = speed || CFG.SPEED_MIN;
    ZoneSpace._spd01 = U.clamp((ZoneSpace._speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    /* 大演出「区画爆発」のカットのあいだだけ小物を間引く（演出側の割合を読むだけ） */
    ZoneSpace._clear = (typeof Setpieces !== 'undefined' && Setpieces.blastClearK)
      ? Setpieces.blastClearK(dist) : 0;
    ZoneSpace.aheadCount = ZoneKit.syncFields(ZoneSpace, dist, t, false);

    /* 遠景の層を視差で流す。**爆発の横向きカットのあいだは伏せる**
       （となりのモジュールのシルエットが火球に重なると「爆発」と読めなくなる）。 */
    const sideCut = (typeof Setpieces !== 'undefined' && Setpieces.blastSideK)
      ? Setpieces.blastSideK(dist) : 0;
    for (let i = 0; i < ZoneSpace.farLayers.length; i++) {
      const g = ZoneSpace.farLayers[i];
      g.position.z = (dist * g.userData.par) % g.userData.len;
      g.visible = (sideCut < 0.35);
    }
    /* 地球はゆっくり自転する（雲だけ少し速い＝生きている惑星に見える） */
    if (ZoneSpace.earth) {
      ZoneSpace.earth.rotation.y = t * 0.012;
      if (ZoneSpace.earthClouds) ZoneSpace.earthClouds.rotation.y = t * 0.019;
    }
    /* 星は瞬く（点群1つの opacity をゆらす＝ドローコールは増えない） */
    if (ZoneSpace.stars) ZoneSpace.stars.material.opacity = 0.82 + 0.16 * Math.sin(t * 1.7);

    /* 船内灯を流す＝白い構造材に明るい溜まりができる（黒潰れ・のっぺりの両方を防ぐ） */
    if (ZoneSpace.lampA) {
      const a = 22, b = 17;
      ZoneSpace.lampA.position.set(-1.9, CFG.H - 0.5, -(a - (dist % a)));
      ZoneSpace.lampA.intensity = 20.0 * (0.9 + 0.1 * Math.sin(t * 3.1));
      ZoneSpace.lampB.position.set(1.9, 0.5, -(b - (dist % b)));
      ZoneSpace.lampB.intensity = 14.0 * (0.9 + 0.1 * Math.sin(t * 2.3 + 1.1));
    }
    /* 警告灯の回転光（契約§5）: 灯体の回転と同じ周期で明滅させる */
    if (ZoneSpace.warnA) {
      const ka = Math.max(0, Math.sin(t * 2.6));
      const kb = Math.max(0, Math.sin(-t * 2.2 + 1.4));
      const c = 14, d = 11;
      ZoneSpace.warnA.position.set(-1.95, CFG.H - 0.2, -(c - (dist % c)));
      ZoneSpace.warnA.intensity = 9 * ka * ka;
      ZoneSpace.warnB.position.set(1.95, 0.2, -(d - (dist % d)));
      ZoneSpace.warnB.intensity = 7 * kb * kb;
      if (ZoneSpace.warnMatA) ZoneSpace.warnMatA.color.setHex(ZoneSpace.PAL.warnRed).multiplyScalar(0.35 + 0.65 * ka);
      if (ZoneSpace.warnMatB) ZoneSpace.warnMatB.color.setHex(ZoneSpace.PAL.warnAmber).multiplyScalar(0.35 + 0.65 * kb);
    }
    /* パネル・ホログラムのゆらぎ（画面が生きている） */
    if (ZoneSpace.panelMat) ZoneSpace.panelMat.opacity = 0.72 + 0.22 * Math.sin(t * 5.1);
    if (ZoneSpace.holoMat) ZoneSpace.holoMat.opacity = 0.40 + 0.22 * Math.sin(t * 3.3 + 0.7);
    if (ZoneSpace.lampMat) ZoneSpace.lampMat.opacity = 0.82 + 0.10 * Math.sin(t * 7.7);

    /* 大演出「区画爆発」（§4.4 S6）: 火球が回廊を照らす。
       強さと位置は Setpieces から読むだけ（演出側は照明を触らない）。 */
    if (ZoneSpace.blastKey) {
      const Sp = (typeof Setpieces !== 'undefined') ? Setpieces : null;
      const k = (Sp && Sp.blastLightK) ? Sp.blastLightK(dist) : 0;
      if (k > 0.001) {
        const p = Sp.blastPos(dist);
        ZoneSpace.blastKey.position.set(p.x * 0.4, CFG.H * 0.6, p.z + 6);
        ZoneSpace.blastKey.intensity = 90 * k * (0.85 + 0.15 * Math.sin(t * 18));
        ZoneSpace.blastKey.distance = 70;
      } else if (ZoneSpace.blastKey.intensity !== 0) {
        ZoneSpace.blastKey.intensity = 0;
      }
    }

    if (ZoneSpace.speedLines) {
      const op = 0.14 + ZoneSpace._spd01 * 0.32;
      ZoneSpace.speedLines.forEach((f) => { f.mesh.material.opacity = op; });
    }
    if (ZoneSpace.wind) {
      ZoneSpace.windMat.opacity = 0.06 + ZoneSpace._spd01 * 0.20;
      ZoneSpace.wind.position.z = (dist % ZoneSpace.WIND_CELL);
    }
  },

  /* 滑空（大演出の自由飛行）のあいだ、外の景色を前に出す（契約§4.5 の演出） */
  setGlide(k) {
    ZoneSpace._glide = k || 0;
    /* 回廊の縁のラインと路面は World が消す。ここは小物と星の明るさを受け持つ */
    if (ZoneSpace.stars) ZoneSpace.stars.material.opacity = 0.82 + 0.18 * (k || 0);
  },

  propsAhead() { return ZoneSpace.aheadCount || 0; }
};

/* 障害物の見た目は全ゾーン共通（js/obstacle_skin.js / 契約§4.3 v2・ゾーン別スキンは失効） */

Zones.register(ZoneSpace);
