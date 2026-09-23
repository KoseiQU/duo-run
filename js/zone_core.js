/* ============================================================================
   DUO RUN — zone_core.js  ゾーン6「コア」の装飾（契約 §5 / §6 P5b）

   ■ 契約§5「コア」
     赤黒。**全ゾーンの断片が混ざる**。脈動する光。
     ＝ ネオンの看板・遺跡の柱・サンゴ・宇宙の構造材・鏡片が「瓦礫」として
        浮遊し、あるいは黒い結晶に半分埋まっている。床と壁には赤い光脈が走り、
        粒子は中心（核）へ吸い込まれていく。遠景には脈動する巨大な赤い球＝核。
     壁区間（黒い結晶の回廊）と開放区間（核が見える深淵）を交互に。霧は暗赤。

   ■ 脈動（心臓のような明滅）の作り方
     鼓動は **1本の関数 pulse(t)** だけが出所。点光源の強さ・光脈の明るさ・
     核の大きさ・吸い込まれる粒子の速さが、すべて同じ位相で動く
     ＝「この世界は1つの心臓で動いている」が画面で読める。

   ■ 輝度の作り方（契約§3 の品質ゲート / 赤黒は黒潰れしやすい）
     - 黒い結晶は **真っ黒にしない**（0x2a1c22 前後＝輝度 33 の中間調の底）。
     - 中間調の主役は「他ゾーンの断片」＝砂岩・銀・白い構造材・サンゴ。
       赤黒の中に**別の色の瓦礫**が混ざることが、そのまま黒潰れ対策になる。
     - 明部（3〜8%）は赤い光脈・核・脈動する灯だけ。面積を小さく保つ。
   ============================================================================ */
'use strict';

const ZoneCore = {
  id: 'core',
  BEHIND: 2,

  PAL: {
    /* World が読む共通キー */
    road:      0x7e5750,      // 床（赤黒の岩。metalness 低め＝ぬめらない）
    roadRough: 0.62,
    roadMetal: 0.16,
    skirt:     0x3a2230,      // 床の側面（暗部の骨）
    metal:     0x9c8a8e,      // ゲート・門柱の金属（灰赤）
    amber:     0xffb347,      // 床＝LUMEN（ゾーンが変わっても意味は同じ）
    indigo:    0x8b9bff,      // 天井＝UMBRA
    /* 暗赤の霧。**真っ黒にしない**（輝度 14 ＝ 黒潰れの下限 8 の上） */
    fog:       0x44242e,

    /* コアの配色 */
    rock:      0x785049,      // 赤黒の岩（中間調の底）
    rockLit:   0x8d5f5c,      // 光の当たった稜線
    crystal:   0x5a4150,      // 黒い結晶（面。真っ黒にしない＝輝度 67 の中間調）
    crystalEdge: 0x9c7488,    // 結晶の稜線
    crystalHot: 0xff8a68,     // 結晶の芯（脈動して赤く光る）
    vein:      0xff6a4a,      // 赤い光脈（明部の主役）
    veinHot:   0xffe4d0,      // 光脈の芯（白熱）
    ember:     0xffa060,      // 脈動する灯
    magma:     0xff4a14,      // 溶けた縁
    core:      0xff4a26,      // 核（遠景の赤い球）
    coreHot:   0xffe8d2,      // 核の芯（白熱。明部の主役）
    coreRim:   0xff6a3a,      // 核の縁光
    bone:      0x9a8184,      // 骨組み（灰）

    /* --- 混ざり込んだ「他ゾーンの断片」の色（それぞれの出身が分かる色） --- */
    fNeon:     0x404a78,      // ネオン都市: 看板の板
    fNeonLit:  0xff5ad0,      //             マゼンタの管
    fNeonLit2: 0x50e0ff,      //             シアンの管
    fRuins:    0xb99a6a,      // 古代遺跡: 砂岩の柱
    fRuinsDim: 0x8c7452,
    fSea:      0x2f9e92,      // 深海: サンゴ
    fSeaLit:   0x7ef0d0,
    fSpace:    0xb4bcc8,      // 宇宙: 白い構造材
    fSpaceDark:0x5d677e,
    fMirror:   0x9aa4b8,      // 鏡の世界: 鏡片
    fMirrorLit:0xdfe8f6,

    far:       0x5c2c34,      // 深淵の遠景
    farDeep:   0x452028
  },
  /* 暗赤の霧。壁区間は締まり、開放区間では核まで見えるよう far は遠めに取る */
  fog: { color: 0x44242e, near: 30, far: 98 },

  /* ---- 区間パターン（壁区間＝黒い結晶の回廊／開放区間＝核が見える深淵） ---- */
  MODE: {
    outer: { period: 100, len: 46 },
    inner: { period: 112, len: 86 }
  },
  WALL_PERIOD: 100,
  WALL_LEN: 46,
  mode: 'outer',
  setMode(id) {
    const m = ZoneCore.MODE[id] || ZoneCore.MODE.outer;
    ZoneCore.mode = ZoneCore.MODE[id] ? id : 'outer';
    ZoneCore.WALL_PERIOD = m.period;
    ZoneCore.WALL_LEN = m.len;
    return ZoneCore.mode;
  },
  isWall(m) {
    /* 大演出「全崩壊エスケープ」（§4.4 S8）の間は開放区間にする。
       壁があると、背後から迫る崩落前線と出口の光が隠れて画面に映らない。
       演出側の状態を読むだけ（Setpieces は区間も照明も触らない＝一方通行の参照）。 */
    if (typeof Setpieces !== 'undefined' && Setpieces.fallOpenSection &&
        Setpieces.fallOpenSection(m)) return false;
    const p = ((m % ZoneCore.WALL_PERIOD) + ZoneCore.WALL_PERIOD) % ZoneCore.WALL_PERIOD;
    return p < ZoneCore.WALL_LEN;
  },
  hash(n, salt) { return ZoneKit.hash(n, salt); },

  /* ---- 鼓動（心臓のような明滅 / 契約§5「脈動する光」） --------------------
     **ここが脈動の唯一の出所**。灯・光脈・核・粒子がすべてこの1本を読む。
     ドッ・ドッ（2拍）の間に休みがある心音の形にする（ただの sin にしない）。 */
  BEAT_T: 1.15,               // 1拍の長さ（秒）
  pulse(t) {
    const u = ((t / ZoneCore.BEAT_T) % 1 + 1) % 1;
    const hit = (p, w) => Math.exp(-Math.pow((u - p) / w, 2));
    return U.clamp(hit(0.06, 0.055) + 0.62 * hit(0.26, 0.070), 0, 1);
  },

  CULL_BEHIND: 1.2,
  _clear: 0,
  _glide: 0,
  _field(spec) {
    const place = spec.place;
    const isProp = (spec.prop !== false);
    const outside = !!spec.outside;          // 回廊の外にある物（滑空中も見えていてよい）
    spec.place = function (slot, m, t, dist) {
      if (dist !== undefined && m < dist - ZoneCore.CULL_BEHIND) return null;
      /* 全崩壊で放り出されている間（自由飛行）は **回廊そのものが無い**。
         深淵の側（核・浮遊する瓦礫）だけを残して回廊の小物を伏せる。 */
      if (!outside && ZoneCore._glide > 0.35) return null;
      /* カットのあいだは小物を間引く（背景を空ける / 契約§8 の決定ログ） */
      if (isProp && ZoneCore._clear > 0 && ZoneKit.hash(slot, 977) < ZoneCore._clear) return null;
      return place(slot, m, t, dist);
    };
    return ZoneKit.field(ZoneCore, spec);
  },

  /* ==========================================================================
     組み立て
     ========================================================================== */
  build(scene) {
    ZoneCore.scene = scene;
    ZoneCore._t = 0;
    ZoneCore._spd01 = 0;
    ZoneCore._beat = 0;
    const F = ZoneCore.fog;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    scene.background = new THREE.Color(F.color);
    ZoneCore._lights(scene);
    ZoneCore._sky(scene);
    ZoneCore._far(scene);
    ZoneCore._props(scene);
    ZoneCore._motes(scene);
    ZoneCore._speedFx(scene);
  },

  /* ---- 光（核の赤い照り返し＋脈動する灯＋上からの弱い白） ------------------
     赤一色にすると顔も瓦礫も赤く潰れるので、**上からの弱い白**を必ず入れる。
     ＝ 中間調（砂岩・銀・白い構造材の断片）が赤の中で色として残る。 */
  _lights(scene) {
    const P = ZoneCore.PAL;
    scene.add(new THREE.AmbientLight(0x6b4450, 0.92));
    /* 上＝結晶越しの冷たい白／下＝核の照り返しの赤（面の向きで色が変わる＝立体が出る） */
    scene.add(new THREE.HemisphereLight(0xd6dcf2, 0xb03a22, 1.02));
    /* 主光（斜め上から）: 結晶と瓦礫の稜線を起こす */
    const key = new THREE.DirectionalLight(0xffe4d4, 1.12);
    key.position.set(0.7, 0.92, 0.35);
    scene.add(key);
    ZoneCore.keyLight = key;
    /* 核からの照り返し（前方から赤く）＝ 影の中が真っ黒にならない */
    const back = new THREE.DirectionalLight(0xff7a52, 0.62);
    back.position.set(-0.3, -0.25, -1.0);
    scene.add(back);
    ZoneCore.coreLight = back;
    /* 脈動する灯（心臓の鼓動。床側と天井側で位相を半拍ずらす） */
    ZoneCore.beatA = new THREE.PointLight(P.ember, 0, 20, 2);
    ZoneCore.beatB = new THREE.PointLight(P.vein, 0, 18, 2);
    scene.add(ZoneCore.beatA, ZoneCore.beatB);
    /* 全崩壊（§4.4 S8）で崩落前線が回廊を赤く照らす明かり（演出側の値を読むだけ） */
    ZoneCore.fallKey = new THREE.PointLight(0xff6030, 0, 60, 2);
    scene.add(ZoneCore.fallKey);
  },

  /* ---- 遠景の「核」（脈動する巨大な赤い球 / 契約§5） ----------------------
     開放区間の奥に据える。霧をかけない（fog:false）＝ 暗赤の霧でも沈まない。 */
  _sky(scene) {
    const P = ZoneCore.PAL;
    const g = new THREE.Group();
    scene.add(g);
    ZoneCore.sky = g;

    /* --- 核（本体＋内側の芯＋縁光の殻） --- */
    const R = 100;
    const core = new THREE.Group();
    core.position.set(-96, -22, -300);
    g.add(core);
    ZoneCore.core = core;
    /* 専用の光（レイヤー3）で核だけを起こす＝回廊の陰影は崩さない */
    const cs = new THREE.DirectionalLight(0xffe0c0, 1.5);
    cs.position.set(0.35, 0.5, 1.0);
    cs.layers.set(3);
    g.add(cs);
    /* 殻は **格子状の板の集まり**（隙間から白熱した芯が覗く）。
       球をそのまま塗ると赤一色の丸になって「割れかけた核」に見えない。
       隙間＝明部（契約§3 の 3〜8%）の主な出どころでもある。 */
    const plates = [];
    const PH = 11, TH = 7;
    for (let i = 0; i < PH; i++) {
      for (let j = 0; j < TH; j++) {
        const dp = Math.PI * 2 / PH, dt = Math.PI / TH;
        plates.push({ g: new THREE.SphereGeometry(R, 4, 3, i * dp + dp * 0.14, dp * 0.72,
                                                  j * dt + dt * 0.13, dt * 0.74) });
      }
    }
    const shell = new THREE.Mesh(ZoneKit.merge(plates),
                                 new THREE.MeshLambertMaterial({ color: P.core, fog: false,
                                                                 flatShading: true, side: THREE.DoubleSide }));
    plates.forEach((q) => q.g.dispose());
    shell.layers.enable(3);
    core.add(shell);
    ZoneCore.coreShell = shell;
    /* 白熱した芯（脈動で膨らむ）。殻の隙間から覗く＝ 明部の主役 */
    const heart = new THREE.Mesh(new THREE.SphereGeometry(R * 0.93, 24, 16),
                                 new THREE.MeshBasicMaterial({ color: P.coreHot, fog: false }));
    core.add(heart);
    ZoneCore.coreHeart = heart;
    /* 核を割る溝（赤い光脈が球の上を走る＝ 核も「生きている」と読める） */
    const cracks = [];
    for (let i = 0; i < 7; i++) {
      const a = ZoneKit.hash(i, 51) * Math.PI * 2;
      const b = (ZoneKit.hash(i, 53) - 0.5) * 1.6;
      cracks.push({ g: new THREE.TorusGeometry(R * 1.02, R * 0.028, 4, 30),
                    p: [0, 0, 0], r: [b, a, ZoneKit.hash(i, 57) * 2] });
    }
    const crackM = new THREE.Mesh(ZoneKit.merge(cracks),
                                  new THREE.MeshBasicMaterial({ color: P.veinHot, fog: false }));
    core.add(crackM);
    ZoneCore.coreCracks = crackM;
    /* 縁光（内側から見る球＝縁だけが光る）を2枚 */
    [[1.10, 0.26, P.coreRim], [1.30, 0.14, 0xff9a60], [1.62, 0.07, 0xffb884]].forEach((q) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R * q[0], 26, 18),
                               new THREE.MeshBasicMaterial({
                                 color: q[2], fog: false, transparent: true, opacity: q[1],
                                 side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
                               }));
      core.add(m);
    });
    core.renderOrder = -11;

    /* --- 核へ吸い込まれる大きな瓦礫の環（深淵の遠景） --- */
    const ring = new THREE.Group();
    ring.position.set(-96, -22, -300);
    g.add(ring);
    ZoneCore.coreRing = ring;
    const chunks = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + ZoneKit.hash(i, 61) * 0.3;
      const rr = R * (1.5 + ZoneKit.hash(i, 63) * 0.9);
      const s = 5 + ZoneKit.hash(i, 67) * 13;
      chunks.push({ g: ZoneKit.box(s, s * 0.6, s * 0.8),
                    p: [Math.cos(a) * rr, Math.sin(a) * rr * 0.45, (ZoneKit.hash(i, 71) - 0.5) * 90],
                    r: [ZoneKit.hash(i, 73) * 3, ZoneKit.hash(i, 79) * 3, ZoneKit.hash(i, 83) * 3] });
    }
    ring.add(new THREE.Mesh(ZoneKit.merge(chunks),
                            new THREE.MeshLambertMaterial({ color: 0x3a2024, fog: false, flatShading: true })));
    ring.renderOrder = -10;

    /* --- 遠い火の粉（点群1つ＝1ドローコール） --- */
    const N = 520;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = ZoneKit.hash(i, 11) * Math.PI * 2;
      const b = (ZoneKit.hash(i, 13) - 0.5) * Math.PI;
      const r = 300 + ZoneKit.hash(i, 17) * 180;
      pos[i * 3] = Math.cos(b) * Math.sin(a) * r;
      pos[i * 3 + 1] = Math.sin(b) * r * 0.6 + 30;
      pos[i * 3 + 2] = -Math.abs(Math.cos(b) * Math.cos(a)) * r - 70;
      const k = 0.4 + ZoneKit.hash(i, 19) * 0.6;
      c.setHex(i % 3 ? 0xff6a34 : 0xffc088).multiplyScalar(k);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 2.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.9
    }));
    sparks.frustumCulled = false;
    sparks.renderOrder = -12;
    g.add(sparks);
    ZoneCore.sparks = sparks;
  },

  /* ---- 深淵の遠景（崩れた層・他ゾーンの残骸が積み重なった崖） --------------
     霧をかけない暗いシルエットにして、核（明部）との明暗差で輪郭を立てる。 */
  _far(scene) {
    ZoneCore.farLayers = [];
    const LEN = 420;
    const P = ZoneCore.PAL;
    const B = (w, h, d, x, y, z, rot) => ({ g: ZoneKit.box(w, h, d), p: [x, y, z], r: rot || [0, 0, 0] });

    function slab(s) {                       // 崩れた床の層
      const o = [];
      o.push(B(60 * s, 5 * s, 30 * s, 0, 0, 0));
      o.push(B(46 * s, 3 * s, 24 * s, 4 * s, -5 * s, 0, [0, 0, 0.12]));
      o.push(B(9 * s, 22 * s, 9 * s, -18 * s, -14 * s, 0, [0.1, 0, -0.16]));
      o.push(B(7 * s, 17 * s, 7 * s, 16 * s, -12 * s, 5 * s, [0, 0, 0.2]));
      return o;
    }
    function spire(s) {                      // 黒い結晶の尖塔
      const o = [];
      o.push({ g: new THREE.ConeGeometry(7 * s, 46 * s, 5), p: [0, 0, 0], r: [0, 0.4, 0.06] });
      o.push({ g: new THREE.ConeGeometry(4 * s, 28 * s, 5), p: [9 * s, -8 * s, 4 * s], r: [0, 0.8, -0.18] });
      o.push({ g: new THREE.ConeGeometry(3 * s, 20 * s, 5), p: [-8 * s, -12 * s, -3 * s], r: [0, 1.2, 0.22] });
      return o;
    }
    function wreck(s) {                      // 他ゾーンの残骸が積み重なった塊
      const o = [];
      o.push(B(26 * s, 26 * s, 20 * s, 0, 0, 0, [0.2, 0.3, 0.15]));
      o.push({ g: new THREE.CylinderGeometry(5 * s, 5 * s, 34 * s, 7), p: [14 * s, 6 * s, 3 * s], r: [0.3, 0, 1.2] });
      o.push(B(30 * s, 2.5 * s, 2.5 * s, -8 * s, 14 * s, 0, [0, 0.3, 0.42]));
      o.push(B(16 * s, 16 * s, 1.5 * s, -14 * s, -9 * s, 8 * s, [0.1, 0.5, 0.3]));
      return o;
    }
    const LAYERS = [
      { par: 0.34, y: -34, z: -186, s: 2.6, dim: true },
      { par: 0.22, y: -12, z: -262, s: 3.4, dim: true },
      { par: 0.13, y: 14, z: -330, s: 4.2, dim: false }
    ];
    LAYERS.forEach((L, li) => {
      const parts = [];
      const step = 108;
      for (let i = 0; i * step < LEN + step; i++) {
        const h = ZoneKit.hash(i + li * 31, 301);
        const side = (i % 2) ? 1 : -1;
        const x = side * (76 + h * 58) * (1 + li * 0.32);
        const z = -i * step;
        if (ZoneKit.hash(i + li * 23, 311) < 0.34) continue;      // 間引いて核を覗かせる
        const kind = Math.floor(ZoneKit.hash(i + li * 17, 307) * 3);
        const src = (kind === 0) ? slab(L.s) : (kind === 1) ? spire(L.s) : wreck(L.s);
        src.forEach((p) => {
          parts.push({ g: p.g, p: [p.p[0] + x, p.p[1] + L.y, p.p[2] + z], r: p.r, s: p.s });
        });
      }
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(ZoneKit.merge(parts),
                                  new THREE.MeshLambertMaterial({
                                    color: L.dim ? P.farDeep : P.far, fog: false, flatShading: true
                                  }));
      g.add(mesh);
      /* 同じ塊をもう1つ後ろへ並べて、視差で無限に流す */
      const m2 = mesh.clone();
      m2.position.z = -LEN;
      g.add(m2);
      g.position.z = L.z;
      g.userData = { par: L.par, len: LEN };
      g.renderOrder = -9 + li;
      scene.add(g);
      ZoneCore.farLayers.push(g);
    });
  },

  /* ---- 中心へ吸い込まれる粒子・火の粉（契約§5） --------------------------- */
  _motes(scene) {
    /* 吸い込まれる塵: 手前では外側に、奥へ行くほど中心（核）へ寄る */
    ZoneCore._field({
      name: 'suck', onTrack: true, spacing: 1.3, geo: new THREE.PlaneGeometry(0.05, 0.05),
      mat: ZoneKit.add(0xff9a60, 0.34), prop: false, order: 5,
      place(slot, m, t, dist) {
        const h1 = ZoneKit.hash(slot, 801), h2 = ZoneKit.hash(slot, 809), h3 = ZoneKit.hash(slot, 811);
        /* 走行距離に沿って前へ流れる粒。前方ほど中心へ吸い寄せられる */
        const ahead = U.clamp((m - (dist === undefined ? m : dist)) / 60, 0, 1);
        const pull = U.smooth(ahead) * (0.55 + 0.35 * ZoneCore._beat);
        const x0 = (h1 - 0.5) * 7.4, y0 = 0.15 + h2 * (CFG.H - 0.3);
        return { x: U.lerp(x0, 0, pull), y: U.lerp(y0, CFG.H / 2, pull),
                 dz: h3 * 1.1, rz: t * 0.5 + slot,
                 sx: 0.6 + h3 * 1.4, sy: 0.6 + h3 * 1.4 };
      }
    });
    /* 火の粉（脈動に合わせて明滅） */
    ZoneCore._field({
      name: 'ember', onTrack: true, spacing: 2.8, geo: new THREE.PlaneGeometry(0.07, 0.07),
      mat: ZoneKit.add(0xff5030, 0.46), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 821), h2 = ZoneKit.hash(slot, 823), h3 = ZoneKit.hash(slot, 827);
        const fl = 0.30 + 0.70 * (0.35 + 0.65 * ZoneCore._beat) * Math.abs(Math.sin(t * (1.1 + h3 * 2.2) + slot * 1.7));
        return { x: (h1 - 0.5) * 7.0, y: 0.12 + h2 * (CFG.H - 0.24) + Math.sin(t * 0.8 + slot) * 0.3,
                 dz: h3 * 1.8, sx: fl, sy: fl };
      }
    });
  },

  /* ---- 体感速度の演出（契約§4.1）: 面を流れる光条と、外を流れる火の筋 ---- */
  _speedFx(scene) {
    const P = ZoneCore.PAL, H = CFG.H;
    const streak = new THREE.PlaneGeometry(0.085, 1.0);
    ZoneCore.speedLines = [];
    [['floor', 0.022, -Math.PI / 2, P.amber], ['ceil', H - 0.022, Math.PI / 2, P.indigo]].forEach((sfc, si) => {
      ZoneCore.speedLines.push(ZoneCore._field({
        name: 'speedline', roadMark: true, onTrack: true, spacing: 2.0, geo: streak, mat: ZoneKit.add(sfc[3], 0.18),
        prop: false, order: 4,
        place(slot, m) {
          if ((slot & 1) !== si) return null;
          const lane = CFG.LANES[Math.floor(ZoneKit.hash(slot, 211) * 3)];
          return { x: lane * CFG.LANE_W + (ZoneKit.hash(slot, 213) - 0.5) * 0.55, y: sfc[1], rx: sfc[2],
                   dz: ZoneKit.hash(slot, 217) * 1.8, sy: 2.4 + ZoneCore._spd01 * 6.5 };
        }
      }));
    });
    /* 外を流れる火の筋（開放区間で速度が読める） */
    const N = 190;
    const pos = new Float32Array(N * 6);
    ZoneCore.WIND_CELL = 26;
    for (let i = 0; i < N; i++) {
      const side = (i % 2) ? 1 : -1;
      const x = side * (2.5 + ZoneKit.hash(i, 401) * 5.2);
      const y = -1.8 + ZoneKit.hash(i, 403) * 8.4;
      const z = -ZoneKit.hash(i, 407) * ZoneCore.WIND_CELL * 4 + 6;
      const len = 2.0 + ZoneKit.hash(i, 411) * 3.6;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z - len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ZoneCore.windMat = new THREE.LineBasicMaterial({
      color: 0xff7a44, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const m = new THREE.LineSegments(g, ZoneCore.windMat);
    m.frustumCulled = false;
    ZoneCore.wind = new THREE.Group();
    ZoneCore.wind.add(m);
    scene.add(ZoneCore.wind);
  },

  /* ==========================================================================
     小物（20種以上・前方60mに常時40個以上 / 契約§3 ジオラマ調の規範）
     ■ 断片（frag*）は **他の5ゾーンの意匠をそのまま持ち込む**（契約§5
       「全ゾーンの断片が混ざる」）。赤黒の中に別の色が混ざるので、
       そのまま黒潰れ対策（中間調 35〜60%）にもなる。
     ========================================================================== */
  _props(scene) {
    const P = ZoneCore.PAL;
    const HW = CFG.HALF_W;       // 1.8
    const H = CFG.H;             // 4.0
    const XW = HW + 0.16;        // 1.96（壁の内側）
    const hash = ZoneKit.hash;
    const isWall = ZoneCore.isWall;
    const F = ZoneCore._field;

    /* --- 1. 黒い結晶の壁（壁区間の主役。結晶を割って面を細かくする） ------ */
    {
      const fp = [{ g: ZoneKit.box(0.52, H + 4.4, 7.8), p: [0, 0, 0] }];
      for (let i = 0; i < 16; i++) {
        const h = hash(i, 131), h2 = hash(i, 137);
        fp.push({ g: new THREE.ConeGeometry(0.11 + h * 0.13, 0.34 + h2 * 0.5, 5),
                  p: [-0.26, (h - 0.5) * (H + 2.4), (h2 - 0.5) * 7.0],
                  r: [h2 * 1.6, h * 3.0, Math.PI / 2 + (h - 0.5) * 0.9] });
      }
      F({
        name: 'wall', spacing: 4, geo: ZoneKit.merge(fp), mat: ZoneKit.lam(P.crystal, { flatShading: true }),
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.62), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 2. 壁を走る赤い光脈（明部の主役。脈動で明るさが動く） ------------ */
    {
      const fp = [];
      for (let i = 0; i < 12; i++) {
        const h = hash(i, 141), h2 = hash(i, 143);
        /* 壁の面に **寝かせる**（ry は 0）。宙に浮いた赤い棒にしない。 */
        fp.push({ g: ZoneKit.box(0.04, 0.05, 0.9 + h * 1.5),
                  p: [0, (h2 - 0.5) * (H + 1.2), (h - 0.5) * 6.6],
                  r: [0, 0, (h2 - 0.5) * 1.1] });
      }
      ZoneCore.veinMat = ZoneKit.bas(P.vein);
      F({
        name: 'vein', spacing: 4, geo: ZoneKit.merge(fp), mat: ZoneCore.veinMat, order: 3,
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.40), y: H * 0.5 };
        }
      });
    }

    /* --- 3/4. 床と天井の光脈（走行空間の上なので onTrack） ---------------- */
    [['floor', 0.020, 3], ['ceil', H - 0.020, 4]].forEach((sfc, si) => {
      const fp = [];
      for (let i = 0; i < 7; i++) {
        const h = hash(i + si * 13, 151), h2 = hash(i + si * 13, 157);
        fp.push({ g: ZoneKit.box(0.045, 0.02, 1.2 + h * 2.0),
                  p: [(h2 - 0.5) * 3.2, 0, (h - 0.5) * 5.0], r: [0, (h - 0.5) * 0.7, 0] });
      }
      const mat = ZoneKit.bas(P.vein);
      if (si === 0) ZoneCore.veinFloorMat = mat; else ZoneCore.veinCeilMat = mat;
      F({
        name: 'vein_' + sfc[0], onTrack: true, spacing: 3, geo: ZoneKit.merge(fp), mat: mat, order: 3,
        place(slot) { return { x: 0, y: sfc[1] }; }
      });
    });

    /* --- 5. 黒い結晶の群れ（床際・天井際から生える） ---------------------- */
    {
      const fp = [];
      for (let i = 0; i < 5; i++) {
        const h = hash(i, 161), h2 = hash(i, 163);
        fp.push({ g: new THREE.ConeGeometry(0.10 + h * 0.12, 0.46 + h2 * 0.9, 5),
                  p: [(h - 0.5) * 0.5, (0.35 + h2 * 0.45), (h2 - 0.5) * 0.7],
                  r: [(h2 - 0.5) * 0.4, h * 3, (h - 0.5) * 0.5] });
      }
      const geo = ZoneKit.merge(fp);
      F({
        name: 'crystal', spacing: 3.2, geo: geo, mat: ZoneKit.lam(P.crystal, { flatShading: true }),
        place(slot, m) {
          const h = hash(slot, 171);
          if (h < 0.22) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 173) < 0.45);
          return { x: side * (2.72 + hash(slot, 175) * 0.5), y: up ? 0 : H,
                   rz: up ? 0 : Math.PI, ry: h * 6, sx: 0.7 + h * 0.7, sy: 0.7 + h * 0.9, sz: 0.7 + h * 0.7 };
        }
      });
    }
    /* --- 6. 結晶の芯（脈動で赤く光る。明部を点で散らす） ------------------ */
    {
      ZoneCore.crystalHotMat = ZoneKit.bas(P.crystalHot);
      F({
        name: 'crystal_hot', spacing: 3.2, geo: new THREE.OctahedronGeometry(0.075, 0),
        mat: ZoneCore.crystalHotMat, order: 3,
        place(slot, m) {
          const h = hash(slot, 171);
          if (h < 0.22) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 173) < 0.45);
          return { x: side * (2.72 + hash(slot, 175) * 0.5), y: up ? (0.55 + h * 0.4) : (H - 0.55 - h * 0.4),
                   ry: h * 6 };
        }
      });
    }

    /* --- 7. 大きな結晶の柱（回廊を締める暗部の骨） ------------------------ */
    {
      const fp = [
        { g: new THREE.ConeGeometry(0.42, 3.2, 5), p: [0, 1.5, 0], r: [0.08, 0.6, 0.1] },
        { g: new THREE.ConeGeometry(0.26, 2.1, 5), p: [0.38, 0.9, 0.3], r: [0, 1.4, -0.22] },
        { g: new THREE.ConeGeometry(0.20, 1.5, 5), p: [-0.30, 0.6, -0.34], r: [0, 2.2, 0.28] }
      ];
      F({
        name: 'crystal_big', spacing: 11, geo: ZoneKit.merge(fp),
        mat: ZoneKit.lam(P.crystal, { flatShading: true }),
        place(slot, m) {
          if (hash(slot, 181) < 0.42) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (3.05 + hash(slot, 183) * 0.7), y: -0.1, ry: hash(slot, 185) * 6,
                   sy: 0.8 + hash(slot, 187) * 0.7 };
        }
      });
    }

    /* --- 8/9. 肋骨のようなリブ（左右の柱と、上下の梁を別のフィールドに分ける）
       ZoneKit.intrudes は融合した形の外接箱で見るので、左右をまたぐ形は作らない。 */
    {
      F({
        name: 'rib_post', spacing: 6, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.20, H + 0.5, 0.26), p: [0, 0, 0] },
          { g: ZoneKit.box(0.34, 0.24, 0.40), p: [0, H * 0.34, 0] },
          { g: ZoneKit.box(0.34, 0.24, 0.40), p: [0, -H * 0.30, 0] }
        ]), mat: ZoneKit.lam(P.bone, { flatShading: true }),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW - 0.06), y: H / 2, dz: (slot % 2) ? 0 : 0 };
        }
      });
      F({
        name: 'rib_beam', spacing: 12, geo: ZoneKit.merge([
          { g: ZoneKit.box(HW * 2 + 0.8, 0.22, 0.28), p: [0, 0, 0] },
          { g: ZoneKit.box(HW * 2 + 0.3, 0.10, 0.36), p: [0, -0.16, 0] }
        ]), mat: ZoneKit.lam(P.bone, { flatShading: true }),
        place(slot, m) {
          const up = (slot % 2) === 0;
          return { x: 0, y: up ? (H + 0.18) : -0.18 };
        }
      });
    }

    /* --- 10. 溶けた縁（床と天井の際で赤く滲む） --------------------------- */
    {
      ZoneCore.magmaMat = ZoneKit.add(P.magma, 0.30);
      F({
        name: 'magma_edge', spacing: 2.5, geo: new THREE.PlaneGeometry(0.30, 2.2),
        mat: ZoneCore.magmaMat, prop: true, order: 4,
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 191) < 0.5);
          return { x: side * (HW + 0.03), y: up ? 0.14 : (H - 0.14), ry: Math.PI / 2,
                   sy: 0.7 + hash(slot, 193) * 0.8 };
        }
      });
    }

    /* ======================================================================
       断片（契約§5「全ゾーンの断片が混ざる」）
       それぞれの出身ゾーンの意匠と色をそのまま持ち込む。瓦礫として
       半分埋まっている物と、浮遊している物の2通りで置く。
       ====================================================================== */

    /* --- 11. ネオン都市の看板の断片（板＋マゼンタ/シアンの管） ------------ */
    {
      F({
        name: 'frag_neon_board', spacing: 13, geo: ZoneKit.merge([
          { g: ZoneKit.box(1.5, 1.0, 0.09), p: [0, 0, 0] },
          { g: ZoneKit.box(1.6, 0.10, 0.14), p: [0, 0.5, 0] },
          { g: ZoneKit.box(0.10, 1.1, 0.14), p: [-0.72, 0, 0] },
          { g: ZoneKit.box(0.7, 0.55, 0.06), p: [0.5, -0.3, 0.06], r: [0, 0, 0.3] }
        ]), mat: ZoneKit.lam(P.fNeon),
        place(slot, m) {
          if (hash(slot, 201) < 0.35) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (2.6 + hash(slot, 203) * 1.1), y: 0.7 + hash(slot, 205) * 2.4,
                   rx: hash(slot, 207) * 0.8, ry: hash(slot, 209) * 2.4, rz: (hash(slot, 211) - 0.5) * 1.2,
                   dz: hash(slot, 213) * 4 };
        }
      });
      ZoneCore.neonTubeMat = ZoneKit.bas(P.fNeonLit);
      F({
        name: 'frag_neon_tube', spacing: 13, geo: ZoneKit.merge([
          { g: ZoneKit.box(1.22, 0.07, 0.05), p: [0, 0.22, 0.07] },
          { g: ZoneKit.box(0.07, 0.58, 0.05), p: [-0.44, -0.12, 0.07] },
          { g: ZoneKit.box(0.62, 0.07, 0.05), p: [0.24, -0.34, 0.07] }
        ]), mat: ZoneCore.neonTubeMat, order: 3,
        place(slot, m) {
          if (hash(slot, 201) < 0.35) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (2.6 + hash(slot, 203) * 1.1), y: 0.7 + hash(slot, 205) * 2.4,
                   rx: hash(slot, 207) * 0.8, ry: hash(slot, 209) * 2.4, rz: (hash(slot, 211) - 0.5) * 1.2,
                   dz: hash(slot, 213) * 4 };
        }
      });
      ZoneCore.neonTube2Mat = ZoneKit.bas(P.fNeonLit2);
      F({
        name: 'frag_neon_tube2', spacing: 17, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.90, 0.06, 0.05), p: [0, 0, 0.07] },
          { g: ZoneKit.box(0.06, 0.44, 0.05), p: [0.40, -0.22, 0.07] }
        ]), mat: ZoneCore.neonTube2Mat, order: 3,
        place(slot, m) {
          if (hash(slot, 221) < 0.45) return null;
          const side = (slot % 2) ? -1 : 1;
          return { x: side * (2.4 + hash(slot, 223) * 1.4), y: 0.5 + hash(slot, 225) * 2.9,
                   rx: hash(slot, 227) * 1.2, ry: hash(slot, 229) * 3.0, dz: hash(slot, 231) * 6 };
        }
      });
    }

    /* --- 12. 古代遺跡の柱の断片（砂岩の円柱・柱頭・段） -------------------- */
    {
      F({
        name: 'frag_ruins_col', spacing: 15, geo: ZoneKit.merge([
          { g: new THREE.CylinderGeometry(0.30, 0.32, 2.3, 8), p: [0, 0, 0] },
          { g: new THREE.CylinderGeometry(0.40, 0.40, 0.22, 8), p: [0, 1.20, 0] },
          { g: new THREE.CylinderGeometry(0.38, 0.42, 0.20, 8), p: [0, -1.18, 0] }
        ]), mat: ZoneKit.lam(P.fRuins, { flatShading: true }),
        place(slot, m) {
          if (hash(slot, 241) < 0.40) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (3.1 + hash(slot, 243) * 1.5), y: 0.4 + hash(slot, 245) * 2.2,
                   rx: 1.1 + hash(slot, 247) * 0.9, rz: (hash(slot, 249) - 0.5) * 1.6,
                   dz: hash(slot, 251) * 7 };
        }
      });
      F({
        name: 'frag_ruins_block', spacing: 9, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.7, 0.42, 0.6), p: [0, 0, 0] },
          { g: ZoneKit.box(0.5, 0.34, 0.44), p: [0.3, 0.3, 0.12], r: [0.2, 0.4, 0.15] },
          { g: ZoneKit.box(0.34, 0.3, 0.34), p: [-0.34, 0.22, -0.2], r: [0.5, 0.2, 0.3] }
        ]), mat: ZoneKit.lam(P.fRuinsDim, { flatShading: true }),
        place(slot, m) {
          if (hash(slot, 261) < 0.30) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 263) < 0.6);
          return { x: side * (2.55 + hash(slot, 265) * 1.3), y: up ? 0.14 : (H - 0.14),
                   ry: hash(slot, 267) * 6, rz: up ? 0 : Math.PI, dz: hash(slot, 269) * 3 };
        }
      });
    }

    /* --- 13. 深海のサンゴの断片（枝分かれした群体＋発光の先端） ------------ */
    {
      const branch = [];
      for (let i = 0; i < 9; i++) {
        const h = hash(i, 271), h2 = hash(i, 273);
        branch.push({ g: new THREE.CylinderGeometry(0.035, 0.055, 0.42 + h * 0.5, 5),
                      p: [(h - 0.5) * 0.6, 0.2 + h2 * 0.5, (h2 - 0.5) * 0.6],
                      r: [(h2 - 0.5) * 1.1, h * 3, (h - 0.5) * 1.1] });
      }
      F({
        name: 'frag_coral', spacing: 11, geo: ZoneKit.merge(branch),
        mat: ZoneKit.lam(P.fSea, { flatShading: true }),
        place(slot, m) {
          if (hash(slot, 281) < 0.34) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 283) < 0.55);
          return { x: side * (2.80 + hash(slot, 285) * 1.4), y: up ? 0 : H, rz: up ? 0 : Math.PI,
                   ry: hash(slot, 287) * 6, sx: 0.8 + hash(slot, 289) * 0.8,
                   sy: 0.8 + hash(slot, 291) * 0.9, sz: 0.8 + hash(slot, 289) * 0.8 };
        }
      });
      ZoneCore.coralTipMat = ZoneKit.bas(P.fSeaLit);
      F({
        name: 'frag_coral_tip', spacing: 11, geo: new THREE.SphereGeometry(0.05, 6, 4),
        mat: ZoneCore.coralTipMat, order: 3,
        place(slot, m) {
          if (hash(slot, 281) < 0.34) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 283) < 0.55);
          return { x: side * (2.80 + hash(slot, 285) * 1.4) + 0.12,
                   y: up ? (0.62 + hash(slot, 293) * 0.3) : (H - 0.62 - hash(slot, 293) * 0.3) };
        }
      });
    }

    /* --- 14. 宇宙ステーションの構造材の断片（白いパネル・トラス・配管） ---- */
    {
      F({
        name: 'frag_space_panel', spacing: 12, geo: ZoneKit.merge([
          { g: ZoneKit.box(1.25, 0.10, 0.85), p: [0, 0, 0] },
          { g: ZoneKit.box(1.30, 0.18, 0.10), p: [0, 0.05, 0.40] },
          { g: ZoneKit.box(0.10, 0.18, 0.88), p: [-0.60, 0.05, 0] },
          { g: ZoneKit.box(0.44, 0.24, 0.40), p: [0.42, -0.14, -0.22], r: [0.2, 0.3, 0] }
        ]), mat: ZoneKit.lam(P.fSpace),
        place(slot, m) {
          if (hash(slot, 301) < 0.38) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (2.5 + hash(slot, 303) * 1.3), y: 0.5 + hash(slot, 305) * 2.8,
                   rx: hash(slot, 307) * 1.6, ry: hash(slot, 309) * 2.2, rz: (hash(slot, 311) - 0.5) * 1.4,
                   dz: hash(slot, 313) * 5 };
        }
      });
      F({
        name: 'frag_space_truss', spacing: 16, geo: (function () {
          const o = [];
          o.push({ g: ZoneKit.box(2.4, 0.08, 0.08), p: [0, 0.22, 0] });
          o.push({ g: ZoneKit.box(2.4, 0.08, 0.08), p: [0, -0.22, 0] });
          for (let i = 0; i < 6; i++) {
            o.push({ g: ZoneKit.box(0.06, 0.52, 0.06), p: [-1.1 + i * 0.44, 0, 0],
                     r: [0, 0, (i % 2 ? 0.7 : -0.7)] });
          }
          return ZoneKit.merge(o);
        })(), mat: ZoneKit.lam(P.fSpaceDark),
        place(slot, m) {
          if (hash(slot, 321) < 0.42) return null;
          const side = (slot % 2) ? -1 : 1;
          return { x: side * (3.0 + hash(slot, 323) * 1.5), y: 0.4 + hash(slot, 325) * 3.0,
                   rx: hash(slot, 327) * 1.0, ry: hash(slot, 329) * 1.6, rz: (hash(slot, 331) - 0.5) * 1.8,
                   dz: hash(slot, 333) * 8 };
        }
      });
    }

    /* --- 15. 鏡の世界の鏡片（銀の破片。稜線が白く光る） -------------------- */
    {
      F({
        name: 'frag_mirror', spacing: 7, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.62, 0.9, 0.035), p: [0, 0, 0], r: [0, 0, 0.2] },
          { g: ZoneKit.box(0.40, 0.55, 0.03), p: [0.3, -0.35, 0.03], r: [0, 0, -0.5] }
        ]), mat: ZoneKit.lam(P.fMirror, { flatShading: true }),
        place(slot, m) {
          if (hash(slot, 341) < 0.30) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (2.62 + hash(slot, 343) * 1.6), y: 0.35 + hash(slot, 345) * 3.2,
                   rx: hash(slot, 347) * 1.4, ry: hash(slot, 349) * 3.1, rz: (hash(slot, 351) - 0.5) * 1.6,
                   dz: hash(slot, 353) * 4, sx: 0.7 + hash(slot, 355) * 0.9, sy: 0.7 + hash(slot, 355) * 0.9 };
        }
      });
      ZoneCore.mirrorEdgeMat = ZoneKit.bas(P.fMirrorLit);
      F({
        name: 'frag_mirror_edge', spacing: 7, geo: ZoneKit.box(0.64, 0.025, 0.045),
        mat: ZoneCore.mirrorEdgeMat, order: 3,
        place(slot, m) {
          if (hash(slot, 341) < 0.30) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (2.62 + hash(slot, 343) * 1.6), y: 0.35 + hash(slot, 345) * 3.2 + 0.42,
                   rx: hash(slot, 347) * 1.4, ry: hash(slot, 349) * 3.1, rz: (hash(slot, 351) - 0.5) * 1.6 + 0.2,
                   dz: hash(slot, 353) * 4 };
        }
      });
    }

    /* --- 16. 瓦礫の山（5ゾーンの破片が混ざって積み上がった塊） ------------- */
    {
      const fp = [];
      for (let i = 0; i < 10; i++) {
        const h = hash(i, 361), h2 = hash(i, 363), h3 = hash(i, 367);
        fp.push({ g: ZoneKit.box(0.22 + h * 0.5, 0.18 + h2 * 0.4, 0.22 + h3 * 0.5),
                  p: [(h - 0.5) * 1.5, 0.12 + h2 * 0.8, (h3 - 0.5) * 1.6],
                  r: [h * 2, h2 * 3, h3 * 2] });
      }
      F({
        name: 'rubble', spacing: 5.5, geo: ZoneKit.merge(fp),
        mat: ZoneKit.lam(P.rock, { flatShading: true }),
        place(slot, m) {
          if (hash(slot, 371) < 0.25) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 373) < 0.62);
          return { x: side * (3.0 + hash(slot, 375) * 1.0), y: up ? 0 : H, rz: up ? 0 : Math.PI,
                   ry: hash(slot, 377) * 6, sy: 0.7 + hash(slot, 379) * 0.8 };
        }
      });
    }

    /* --- 17. 浮遊する岩塊（核へ吸い寄せられてゆっくり回る） ---------------- */
    {
      F({
        name: 'float_rock', spacing: 10, geo: ZoneKit.merge([
          { g: new THREE.IcosahedronGeometry(0.46, 0), p: [0, 0, 0] },
          { g: new THREE.IcosahedronGeometry(0.22, 0), p: [0.46, 0.18, 0.2] },
          { g: new THREE.IcosahedronGeometry(0.16, 0), p: [-0.38, -0.22, -0.15] }
        ]), mat: ZoneKit.lam(P.rock, { flatShading: true }), outside: true,
        place(slot, m, t) {
          if (hash(slot, 381) < 0.28) return null;
          const side = (slot % 2) ? 1 : -1;
          const h = hash(slot, 383);
          return { x: side * (3.2 + h * 3.0), y: -0.6 + hash(slot, 385) * 5.6 + Math.sin(t * 0.4 + slot) * 0.2,
                   ry: t * (0.12 + h * 0.2) + slot, rx: t * 0.08 + slot,
                   sx: 0.6 + h * 1.5, sy: 0.6 + h * 1.5, sz: 0.6 + h * 1.5, dz: hash(slot, 387) * 6 };
        }
      });
    }

    /* --- 18. 脈動する灯（心臓のような明滅。契約§5「脈動する光」） ---------- */
    {
      ZoneCore.beatLampMat = ZoneKit.bas(P.ember);
      F({
        name: 'beat_lamp', spacing: 8, geo: ZoneKit.merge([
          { g: new THREE.SphereGeometry(0.085, 7, 5), p: [0, 0, 0] },
          { g: ZoneKit.box(0.05, 0.05, 0.22), p: [0, 0, -0.16] }
        ]), mat: ZoneCore.beatLampMat, order: 3,
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 391) < 0.5);
          return { x: side * (XW + 0.36), y: up ? 0.55 : (H - 0.55), dz: hash(slot, 393) * 2 };
        }
      });
      /* 灯のハロー（脈動で大きさが動く＝鼓動が画面で読める） */
      ZoneCore.haloMat = ZoneKit.add(P.magma, 0.24);
      F({
        name: 'beat_halo', spacing: 8, geo: new THREE.PlaneGeometry(0.75, 0.75),
        mat: ZoneCore.haloMat, prop: false, order: 5,
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 391) < 0.5);
          const s = 0.55 + 0.85 * ZoneCore._beat;
          return { x: side * (XW + 0.34), y: up ? 0.55 : (H - 0.55), dz: hash(slot, 393) * 2,
                   sx: s, sy: s };
        }
      });
    }

    /* --- 19. 溶けた配管（赤く滲む管が壁を這う） ---------------------------- */
    {
      F({
        name: 'pipe', spacing: 6.5, geo: ZoneKit.merge([
          { g: new THREE.CylinderGeometry(0.075, 0.075, 5.6, 6), p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
          { g: new THREE.CylinderGeometry(0.10, 0.10, 0.2, 6), p: [0, 0, 1.6], r: [Math.PI / 2, 0, 0] },
          { g: new THREE.CylinderGeometry(0.10, 0.10, 0.2, 6), p: [0, 0, -1.6], r: [Math.PI / 2, 0, 0] }
        ]), mat: ZoneKit.lam(P.bone),
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW - 0.12), y: 0.35 + hash(slot, 401) * (H - 0.7) };
        }
      });
    }

    /* --- 20. 深淵のアーチ（開放区間で外に立つ門。核の手前に重なる） -------- */
    {
      /* 脚（左右）と梁（上）は **別のフィールド**にする。ZoneKit.intrudes は
         融合した形の外接箱で走路への食い込みを見るので、走路を跨ぐ1つの形は作らない。 */
      F({
        name: 'abyss_arch_leg', spacing: 13, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.9, 13, 0.9), p: [0, 0, 0] },
          { g: ZoneKit.box(1.4, 0.8, 1.2), p: [0, -6.2, 0] }
        ]), mat: ZoneKit.lam(P.farDeep, { flatShading: true }), outside: true,
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * 6.2, y: 1.2, rz: -side * 0.1, sy: 1.0 + hash(slot, 413) * 0.4 };
        }
      });
      F({
        name: 'abyss_arch_top', spacing: 13, geo: ZoneKit.merge([
          { g: ZoneKit.box(14, 1.1, 1.1), p: [0, 0.5, 0] },
          { g: ZoneKit.box(12, 0.6, 0.7), p: [0, -0.5, 0] }
        ]), mat: ZoneKit.lam(P.farDeep, { flatShading: true }), outside: true,
        place(slot, m) {
          if (isWall(m) || (slot % 2)) return null;
          return { x: 0, y: 7.6, sx: 1.0 + hash(slot, 411) * 0.5 };
        }
      });
    }

    /* --- 21. 深淵の柱（開放区間の外に並ぶ黒い尖塔） ------------------------ */
    {
      F({
        name: 'abyss_spire', spacing: 9, geo: ZoneKit.merge([
          { g: new THREE.ConeGeometry(1.5, 18, 5), p: [0, 0, 0] },
          { g: new THREE.ConeGeometry(0.9, 11, 5), p: [1.9, -3.4, 0.8], r: [0, 0, -0.16] }
        ]), mat: ZoneKit.lam(P.farDeep, { flatShading: true }), outside: true,
        place(slot, m) {
          if (isWall(m)) return null;
          if (hash(slot, 421) < 0.35) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (9 + hash(slot, 423) * 9), y: -5 + hash(slot, 425) * 6,
                   ry: hash(slot, 427) * 6, sy: 0.7 + hash(slot, 429) * 1.0 };
        }
      });
    }

    /* --- 22. 落ちていく瓦礫の滝（開放区間の外・核へ落ちる筋） -------------- */
    {
      ZoneCore.fallStreakMat = ZoneKit.add(0xff7a44, 0.13);
      F({
        name: 'abyss_fall', spacing: 5, geo: new THREE.PlaneGeometry(0.10, 4.5),
        mat: ZoneCore.fallStreakMat, prop: true, order: 4, outside: true,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          const h = hash(slot, 431);
          if (h < 0.45) return null;
          return { x: side * (5.6 + h * 5.4), y: 6 - ((t * (2.2 + h * 3) + slot * 3) % 14),
                   sy: 0.6 + h * 1.1 };
        }
      });
    }

    /* --- 23. 割れ目から覗く赤い光（壁の底と天井際） ------------------------ */
    {
      ZoneCore.riftMat = ZoneKit.add(P.veinHot, 0.26);
      F({
        name: 'rift', spacing: 4.5, geo: new THREE.PlaneGeometry(0.16, 1.5),
        mat: ZoneCore.riftMat, order: 4,
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          const up = (hash(slot, 441) < 0.5);
          return { x: side * (XW + 0.38), y: up ? (0.30 + hash(slot, 443) * 0.5) : (H - 0.30 - hash(slot, 443) * 0.5),
                   ry: Math.PI / 2, rz: (hash(slot, 445) - 0.5) * 0.6, sy: 0.6 + hash(slot, 447) * 0.9 };
        }
      });
    }

    /* --- 24. 埋まった骨組み（大きな肋骨。回廊の外の巨大生物めいた影） ------ */
    {
      F({
        name: 'big_bone', spacing: 21, geo: ZoneKit.merge([
          { g: new THREE.TorusGeometry(3.4, 0.24, 5, 14, Math.PI * 0.85), p: [0, 0, 0], r: [0, 0, -0.4] },
          { g: new THREE.CylinderGeometry(0.28, 0.28, 2.2, 6), p: [-2.6, -1.6, 0], r: [0, 0, 0.6] }
        ]), mat: ZoneKit.lam(P.bone, { flatShading: true }), outside: true,
        place(slot, m) {
          if (hash(slot, 451) < 0.4) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (8.4 + hash(slot, 453) * 2.4), y: -0.4 + hash(slot, 455) * 3.0,
                   ry: side > 0 ? 0.4 : -0.4, rz: (hash(slot, 457) - 0.5) * 0.8 };
        }
      });
    }
  },

  /* ==========================================================================
     毎フレームの送り出し
     ========================================================================== */
  sync(dist, t, speed) {
    if (!ZoneCore.scene) return;
    ZoneCore._t = t;
    ZoneCore._speed = speed || CFG.SPEED_MIN;
    ZoneCore._spd01 = U.clamp((ZoneCore._speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    /* 鼓動（唯一の出所）。灯・光脈・核・粒子がこの1本を読む */
    const beat = ZoneCore.pulse(t);
    ZoneCore._beat = beat;
    /* 大演出のカットのあいだだけ小物を間引く（演出側の割合を読むだけ） */
    ZoneCore._clear = (typeof Setpieces !== 'undefined' && Setpieces.fallClearK)
      ? Setpieces.fallClearK(dist) : 0;
    ZoneCore.aheadCount = ZoneKit.syncFields(ZoneCore, dist, t, false);

    /* 遠景を視差で流す。振り返りカットのあいだは伏せる（背後の崩壊に重ねない） */
    const backCut = (typeof Setpieces !== 'undefined' && Setpieces.fallBackK)
      ? Setpieces.fallBackK(dist) : 0;
    for (let i = 0; i < ZoneCore.farLayers.length; i++) {
      const g = ZoneCore.farLayers[i];
      g.position.z = (dist * g.userData.par) % g.userData.len;
      g.visible = (backCut < 0.35);
    }
    /* 核は脈打ちながらゆっくり回る（芯が膨らみ、割れ目が明るくなる） */
    if (ZoneCore.core) {
      const s = 1 + 0.045 * beat;
      ZoneCore.core.scale.set(s, s, s);
      ZoneCore.core.rotation.y = t * 0.018;
      if (ZoneCore.coreHeart) {
        const hs = 0.92 + 0.14 * beat;
        ZoneCore.coreHeart.scale.set(hs, hs, hs);
      }
      if (ZoneCore.coreCracks) {
        ZoneCore.coreCracks.material.color.setHex(ZoneCore.PAL.veinHot).multiplyScalar(0.45 + 0.55 * beat);
      }
      ZoneCore.core.visible = (backCut < 0.35);
    }
    if (ZoneCore.coreRing) {
      ZoneCore.coreRing.rotation.z = t * 0.03;
      ZoneCore.coreRing.visible = (backCut < 0.35);
    }
    if (ZoneCore.sparks) ZoneCore.sparks.material.opacity = 0.70 + 0.26 * beat;

    /* 赤い光脈は鼓動で明るくなる（明部 3〜8% を作る主役） */
    const veinK = 0.58 + 0.42 * beat;
    [ZoneCore.veinMat, ZoneCore.veinFloorMat, ZoneCore.veinCeilMat].forEach((mm) => {
      if (mm) mm.color.setHex(ZoneCore.PAL.vein).multiplyScalar(veinK);
    });
    if (ZoneCore.crystalHotMat) {
      ZoneCore.crystalHotMat.color.setHex(ZoneCore.PAL.crystalHot).multiplyScalar(0.50 + 0.50 * beat);
    }
    if (ZoneCore.beatLampMat) {
      ZoneCore.beatLampMat.color.setHex(ZoneCore.PAL.ember).multiplyScalar(0.48 + 0.52 * beat);
    }
    if (ZoneCore.haloMat) ZoneCore.haloMat.opacity = 0.10 + 0.26 * beat;
    if (ZoneCore.riftMat) ZoneCore.riftMat.opacity = 0.18 + 0.28 * beat;
    if (ZoneCore.magmaMat) ZoneCore.magmaMat.opacity = 0.18 + 0.22 * beat;

    /* 脈動する点光源（心臓）。床側と天井側で半拍ずらす */
    if (ZoneCore.beatA) {
      const b2 = ZoneCore.pulse(t + ZoneCore.BEAT_T * 0.5);
      const a = 19, b = 15;
      ZoneCore.beatA.position.set(-1.9, 0.6, -(a - (dist % a)));
      ZoneCore.beatA.intensity = 12 + 30 * beat;
      ZoneCore.beatB.position.set(1.9, CFG.H - 0.6, -(b - (dist % b)));
      ZoneCore.beatB.intensity = 10 + 24 * b2;
    }
    /* 核からの照り返しも鼓動する（世界全体が1つの心臓で動いて見える） */
    if (ZoneCore.coreLight) ZoneCore.coreLight.intensity = 0.50 + 0.30 * beat;

    /* 大演出「全崩壊エスケープ」（§4.4 S8）: 崩落前線が回廊を赤く照らす */
    if (ZoneCore.fallKey) {
      const Sp = (typeof Setpieces !== 'undefined') ? Setpieces : null;
      const k = (Sp && Sp.fallLightK) ? Sp.fallLightK(dist) : 0;
      if (k > 0.001) {
        ZoneCore.fallKey.position.set(0, CFG.H * 0.6, 12);
        ZoneCore.fallKey.intensity = 70 * k * (0.85 + 0.15 * Math.sin(t * 16));
        ZoneCore.fallKey.distance = 64;
      } else if (ZoneCore.fallKey.intensity !== 0) {
        ZoneCore.fallKey.intensity = 0;
      }
    }

    if (ZoneCore.speedLines) {
      const op = 0.14 + ZoneCore._spd01 * 0.32;
      ZoneCore.speedLines.forEach((f) => { f.mesh.material.opacity = op; });
    }
    if (ZoneCore.wind) {
      ZoneCore.windMat.opacity = 0.07 + ZoneCore._spd01 * 0.22;
      ZoneCore.wind.position.z = (dist % ZoneCore.WIND_CELL);
    }
  },

  /* 滑空（大演出の自由飛行）のあいだ、深淵を前に出す（契約§4.5 の演出） */
  setGlide(k) {
    ZoneCore._glide = k || 0;
    if (ZoneCore.sparks) ZoneCore.sparks.material.opacity = 0.70 + 0.28 * (k || 0);
  },

  propsAhead() { return ZoneCore.aheadCount || 0; }
};

/* 障害物の見た目は全ゾーン共通（js/obstacle_skin.js / 契約§4.3 v2・ゾーン別スキンは失効） */

Zones.register(ZoneCore);
