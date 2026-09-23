/* ============================================================================
   DUO RUN — zone_mirror.js  ゾーン5「鏡の世界」の装飾（契約 §5 / §6 P5a）

   ■ 契約§5「鏡の世界」
     銀・虹色。鏡面のパネルに2体の反射（**別カメラ不要＝反転コピーのメッシュ**）。
     浮遊する鏡片・プリズムの柱・光の屈折ビーム（薄い虹の帯）・万華鏡の遠景・
     結晶・水晶の花・光の粒子。壁区間（鏡の回廊）と開放区間（鏡片が浮かぶ空間）を交互に。
     霧は薄い銀白。

   ■ 擬似反射の作り方（本物の反射は禁止＝負荷 / 契約§5）
     2体の「反転コピー」を6体ぶん用意して、毎フレーム **鏡面の奥** へ置くだけ。
       床の鏡   … LUMEN を y=0 で上下反転（scale.y = -1）
       天井の鏡 … UMBRA を y=H で上下反転
       左右の壁 … 2体を x=±XW で左右反転（scale.x = -1）。壁のガラスは半透明なので、
                  その奥に置いた反転コピーが「鏡の中の自分」に見える。
     ＝ 描画は6ドローコール・レンダーターゲット0枚で「鏡の回廊」が成立する。

   ■ 輝度の作り方（契約§3 の品質ゲート / 銀は白飛びしやすい）
     - 面は **銀だが暗い**（0x78839b 前後）。白は「稜線・縁・光条」だけに限る。
     - **暗い縁と影を意図的に入れる**（黒い枠・溝・パネルの目地・台座の影）。
     - 明部は虹のビーム・結晶の稜線・光の粒子が受け持つ（面積は小さく保つ）。
   ============================================================================ */
'use strict';

const ZoneMirror = {
  id: 'mirror',
  BEHIND: 2,

  PAL: {
    /* World が読む共通キー */
    road:      0x66718a,      // 鏡の床（銀。metalness を上げて暗く締める）
    roadRough: 0.26,
    roadMetal: 0.55,
    skirt:     0x10141d,      // 床の側面（暗い縁＝白飛びを抑える骨）
    metal:     0xc3ccdd,      // ゲート・門柱の金属（銀）
    amber:     0xffb347,      // 床＝LUMEN（ゾーンが変わっても意味は同じ）
    indigo:    0x8b9bff,      // 天井＝UMBRA
    fog:       0x1d2433,      // 銀白の霧（薄い＝far を遠くに取る。深い銀＝暗部を作る）

    /* 鏡の世界の配色 */
    silver:    0x7d8799,      // 鏡面（面）
    silverLit: 0xdde6f4,      // 稜線・縁（明部の主役。面積を小さく保つ）
    silverDim: 0x323b50,      // 影の側の銀
    frame:     0x0c0f16,      // 黒い枠・目地（暗部の主役）
    glass:     0xa9c0dc,      // 鏡のガラス（半透明）
    crystal:   0xbfe4ef,      // 結晶
    crystalHot:0xeafcff,
    petal:     0xffd8f2,      // 水晶の花
    prism:     0xd8e4ff,      // プリズム
    rose:      0xff6a9c,      // 虹（6色）
    amberR:    0xffb02e,
    lime:      0x7ef08a,
    cyan:      0x4fd8ff,
    blue:      0x6a7cff,
    violet:    0xc07aff,
    far:       0x39415a,      // 遠景の鏡の層
    farDeep:   0x232a3e,
    kale:      0x6f7cb8       // 万華鏡の基調
  },
  /* 薄い銀白の霧（契約§5）。近景は締まり、遠景は銀へ溶ける */
  fog: { color: 0x1d2433, near: 24, far: 84 },

  /* 壁の鏡の「奥行きの詰め方」（1 = 本物の反射 / 0.5 = 半分。理由は _syncDoubles） */
  MIRROR_DEPTH: 0.5,

  /* 虹の6色（帯・縁光・万華鏡が同じ配列を読む＝色の意味がぶれない） */
  RAINBOW: [0xff6a9c, 0xffb02e, 0x7ef08a, 0x4fd8ff, 0x6a7cff, 0xc07aff],

  /* ---- 区間パターン（壁区間＝鏡の回廊／開放区間＝鏡片が浮かぶ空間） -------- */
  MODE: {
    outer: { period: 96, len: 44 },
    inner: { period: 110, len: 84 }
  },
  WALL_PERIOD: 96,
  WALL_LEN: 44,
  mode: 'outer',
  setMode(id) {
    const m = ZoneMirror.MODE[id] || ZoneMirror.MODE.outer;
    ZoneMirror.mode = ZoneMirror.MODE[id] ? id : 'outer';
    ZoneMirror.WALL_PERIOD = m.period;
    ZoneMirror.WALL_LEN = m.len;
    return ZoneMirror.mode;
  },
  isWall(m) {
    /* 大演出「鏡の砕け散り」（§4.4 S7）の間は開放区間にする
       （壁があると、砕けて浮かぶ鏡片と出口の大鏡が隠れてしまう）。
       演出側の状態を読むだけ（Setpieces は区間も照明も触らない＝一方通行の参照）。 */
    if (typeof Setpieces !== 'undefined' && Setpieces.shatterOpenSection &&
        Setpieces.shatterOpenSection(m)) return false;
    const p = ((m % ZoneMirror.WALL_PERIOD) + ZoneMirror.WALL_PERIOD) % ZoneMirror.WALL_PERIOD;
    return p < ZoneMirror.WALL_LEN;
  },
  hash(n, salt) { return ZoneKit.hash(n, salt); },

  CULL_BEHIND: 1.2,
  _clear: 0,
  _glide: 0,
  _field(spec) {
    const place = spec.place;
    const isProp = (spec.prop !== false);
    const outside = !!spec.outside;
    spec.place = function (slot, m, t, dist) {
      if (dist !== undefined && m < dist - ZoneMirror.CULL_BEHIND) return null;
      if (!outside && ZoneMirror._glide > 0.35) return null;
      if (isProp && ZoneMirror._clear > 0 && ZoneKit.hash(slot, 977) < ZoneMirror._clear) return null;
      return place(slot, m, t, dist);
    };
    return ZoneKit.field(ZoneMirror, spec);
  },

  /* ==========================================================================
     組み立て
     ========================================================================== */
  build(scene) {
    ZoneMirror.scene = scene;
    ZoneMirror._t = 0;
    ZoneMirror._spd01 = 0;
    const F = ZoneMirror.fog;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    scene.background = new THREE.Color(F.color);
    ZoneMirror._lights(scene);
    ZoneMirror._sky(scene);
    ZoneMirror._far(scene);
    ZoneMirror._props(scene);
    ZoneMirror._doubles(scene);
    ZoneMirror._motes(scene);
    ZoneMirror._speedFx(scene);
  },

  /* ---- 光 -----------------------------------------------------------------
     鏡の世界は「白い面が多い」ので、環境光は低く、方向光で稜線だけを起こす。
     ＝ 面は中間調に落ち、明部は稜線と虹の帯だけになる（契約§3）。 */
  _lights(scene) {
    const P = ZoneMirror.PAL;
    scene.add(new THREE.AmbientLight(0x232a3c, 0.30));
    /* 上＝銀白／下＝影の藍（面の向きで色が変わる＝銀が立体に見える） */
    scene.add(new THREE.HemisphereLight(0xdfe8fb, 0x141a29, 0.44));
    const key = new THREE.DirectionalLight(0xfdf6ff, 1.10);
    key.position.set(0.80, 0.70, 0.35);
    scene.add(key);
    ZoneMirror.keyLight = key;
    /* 逆側からの虹の弱い光（影の中が真っ黒にならない） */
    const fill = new THREE.DirectionalLight(0x7f8cff, 0.30);
    fill.position.set(-0.85, -0.45, -0.35);
    scene.add(fill);
    /* 走行に合わせて流す虹の点光（明るい溜まりが次々に来る） */
    ZoneMirror.lampA = new THREE.PointLight(P.cyan, 14.0, 17, 2);
    ZoneMirror.lampB = new THREE.PointLight(P.rose, 11.0, 15, 2);
    scene.add(ZoneMirror.lampA, ZoneMirror.lampB);
    /* 大演出「鏡の砕け散り」で、砕けた鏡片と出口の大鏡が回廊を照らす明かり */
    ZoneMirror.shatterKey = new THREE.PointLight(0xdfe8ff, 0, 60, 2);
    scene.add(ZoneMirror.shatterKey);
  },

  /* ---- 万華鏡の遠景（契約§5「放射状の対称パターンが回る」） ----------------
     12回対称の楔を虹の6色で組み、2枚の層を逆向きにゆっくり回す。
     霧をかけない（fog:false）＝薄い霧でも遠景が沈まない。 */
  _sky(scene) {
    const P = ZoneMirror.PAL;
    const g = new THREE.Group();
    g.position.set(0, CFG.H / 2, -168);
    scene.add(g);
    ZoneMirror.sky = g;
    ZoneMirror.kaleLayers = [];

    const wedge = (r0, r1, half) => {
      const s = new THREE.Shape();
      s.moveTo(Math.cos(-half) * r0, Math.sin(-half) * r0);
      s.lineTo(Math.cos(-half) * r1, Math.sin(-half) * r1);
      s.lineTo(Math.cos(half) * r1, Math.sin(half) * r1);
      s.lineTo(Math.cos(half) * r0, Math.sin(half) * r0);
      s.closePath();
      return new THREE.ShapeGeometry(s);
    };
    /* 1層＝12回対称。色ごとに1メッシュへ融合する（6ドローコール／層） */
    const layer = (rings, spin, op, z) => {
      const grp = new THREE.Group();
      grp.position.z = z;
      grp.userData = { spin: spin };
      g.add(grp);
      const byColor = [];
      const N = 16;
      rings.forEach((rg, ri) => {
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const ci = (i + ri) % 6;
          let b = byColor[ci];
          if (!b) b = byColor[ci] = [];
          /* 一つ置きに欠けを作る＝「割れた鏡の万華鏡」に見える */
          if ((i + ri) % 3 === 2) continue;
          b.push({ g: wedge(rg[0], rg[1], rg[2]), r: [0, 0, a] });
        }
      });
      for (let ci = 0; ci < 6; ci++) {
        if (!byColor[ci] || !byColor[ci].length) continue;
        const mesh = new THREE.Mesh(ZoneKit.merge(byColor[ci]),
          new THREE.MeshBasicMaterial({ color: ZoneMirror.RAINBOW[ci], transparent: true,
                                        opacity: op, depthWrite: false, fog: false,
                                        side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        mesh.frustumCulled = false;
        mesh.renderOrder = -12;
        byColor[ci].forEach((q) => q.g.dispose());
        grp.add(mesh);
      }
      ZoneMirror.kaleLayers.push(grp);
      return grp;
    };
    layer([[20, 32, 0.090], [34, 44, 0.060]], 0.030, 0.95, 0);
    layer([[14, 26, 0.075], [28, 38, 0.045]], -0.021, 0.70, -44);
    /* 中心の芯（対称の中心が分かる） */
    const core = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20),
      new THREE.MeshBasicMaterial({ color: P.silverLit, transparent: true, opacity: 0.22,
                                    depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    core.renderOrder = -12;
    core.material.opacity = 0.5;
    g.add(core);
  },

  /* ---- 遠景の層（鏡のオベリスク・割れた鏡の山） --------------------------- */
  _far(scene) {
    ZoneMirror.farLayers = [];
    const LEN = 420;
    const P = ZoneMirror.PAL;
    const B = (w, h, d, x, y, z, rot) => ({ g: ZoneKit.box(w, h, d), p: [x, y, z], r: rot || [0, 0, 0] });

    function obelisk(s) {                     // 鏡のオベリスク（先の尖った板）
      const o = [];
      o.push(B(7 * s, 46 * s, 7 * s, 0, 23 * s, 0));
      o.push({ g: new THREE.ConeGeometry(5.4 * s, 13 * s, 4), p: [0, 52 * s, 0], r: [0, 0.78, 0] });
      o.push(B(11 * s, 3 * s, 11 * s, 0, 1.4 * s, 0));
      return o;
    }
    function crag(s) {                        // 割れた鏡の岩塊（斜めの板が刺さる）
      const o = [];
      for (let i = 0; i < 5; i++) {
        const h = (12 + i * 7) * s;
        o.push(B(4.4 * s, h, 3.2 * s, (i - 2) * 7 * s, h / 2, (i % 2 ? 4 : -4) * s,
                 [0, 0.4 * i, (i - 2) * 0.13]));
      }
      return o;
    }
    function arcTower(s) {                    // 鏡の輪が積み上がった塔
      const o = [];
      for (let i = 0; i < 4; i++) {
        o.push({ g: new THREE.TorusGeometry(9 * s - i * 1.4 * s, 0.9 * s, 4, 12),
                 p: [0, (8 + i * 12) * s, 0], r: [Math.PI / 2, 0, 0] });
      }
      o.push(B(2.4 * s, 56 * s, 2.4 * s, 0, 28 * s, 0));
      return o;
    }

    const mk = (parts, color, par) => {
      const mesh = new THREE.Mesh(ZoneKit.merge(parts), ZoneKit.bas(color, { fog: false }));
      mesh.frustumCulled = false;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.userData = { par: par, len: LEN };
      scene.add(grp);
      ZoneMirror.farLayers.push(grp);
      return grp;
    };
    const near = [];
    const put = (parts, x, y, z, s) => {
      parts.forEach((q) => near.push({ g: q.g, p: [q.p[0] + x, q.p[1] + y, q.p[2] + z], r: q.r, s: [s, s, s] }));
    };
    put(obelisk(1.0), -30, -12, -70, 1);
    put(crag(1.0), 36, -18, -130, 1);
    put(arcTower(0.8), -44, -16, -200, 1);
    put(obelisk(0.8), 40, -14, -270, 1);
    put(crag(1.2), -48, -20, -340, 1);
    put(arcTower(1.0), 46, -18, -400, 1);
    mk(near, P.far, 0.30);

    const far = [];
    const putF = (parts, x, y, z) => parts.forEach((q) => far.push({ g: q.g, p: [q.p[0] + x, q.p[1] + y, q.p[2] + z] }));
    putF(obelisk(2.2), -110, -40, -230);
    putF(crag(2.6), 120, -50, -320);
    putF(arcTower(2.0), -130, -46, -470);
    putF(obelisk(2.4), 128, -44, -620);
    mk(far, P.farDeep, 0.11);
  },

  /* ==========================================================================
     擬似反射（契約§5「鏡面のパネルに2体の反射。反転コピーのメッシュでよい」）
     ・床の鏡 / 天井の鏡 / 左右の壁の鏡 ＝ 6体ぶんの反転コピー。
     ・形は「2体のシルエット」を1メッシュへ融合したもの（1体1ドローコール）。
     ・位置と姿勢は毎フレーム Game.runners から引く（判定には一切触らない）。
     ========================================================================== */
  _doubles(scene) {
    const mk = (id) => {
      const isL = (id === 'lumen');
      const parts = [
        /* 胴・頭・腰・手足のシルエット（判定より少し細い＝鏡の中の影） */
        { g: new THREE.CapsuleGeometry(0.135, 0.20, 3, 8), p: [0, 0.50, 0] },
        { g: new THREE.SphereGeometry(0.145, 10, 8), p: [0, 0.785, 0] },
        { g: new THREE.CapsuleGeometry(0.115, 0.06, 3, 8), p: [0, 0.355, 0] },
        { g: new THREE.CapsuleGeometry(0.042, 0.16, 3, 6), p: [-0.155, 0.47, 0] },
        { g: new THREE.CapsuleGeometry(0.042, 0.16, 3, 6), p: [0.155, 0.47, 0] },
        { g: new THREE.CapsuleGeometry(0.05, 0.19, 3, 6), p: [-0.075, 0.20, 0] },
        { g: new THREE.CapsuleGeometry(0.05, 0.19, 3, 6), p: [0.075, 0.20, 0] }
      ];
      if (isL) parts.push({ g: new THREE.SphereGeometry(0.108, 8, 6), p: [0, 0.88, 0.012] });
      else {
        parts.push({ g: new THREE.ConeGeometry(0.036, 0.14, 4), p: [-0.125, 0.87, 0], r: [0, 0, 0.42] });
        parts.push({ g: new THREE.ConeGeometry(0.036, 0.14, 4), p: [0.125, 0.87, 0], r: [0, 0, -0.42] });
        parts.push({ g: new THREE.SphereGeometry(0.115, 8, 6), p: [0, 0.75, 0.055], s: [1, 1, 0.72] });
      }
      const geo = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      return geo;
    };
    const geoL = mk('lumen'), geoU = mk('umbra');
    const matOf = (isL, op) => new THREE.MeshBasicMaterial({
      color: isL ? 0xd88a2a : 0x5a5ec8, transparent: true, opacity: op,
      depthWrite: false, fog: true
    });
    ZoneMirror.doubles = [];
    /* plane: 'floor' | 'ceil' | 'wall'（wall は side で左右） */
    const add = (id, plane, side, op) => {
      const geo = (id === 'lumen') ? geoL : geoU;
      const m = new THREE.Mesh(geo, matOf(id === 'lumen', op));
      m.frustumCulled = false;
      m.renderOrder = 1;
      m.visible = false;
      scene.add(m);
      ZoneMirror.doubles.push({ id: id, plane: plane, side: side || 0, mesh: m });
      return m;
    };
    add('lumen', 'floor', 0, 0.44);
    add('umbra', 'ceil', 0, 0.44);
    add('lumen', 'wall', -1, 0.50);
    add('umbra', 'wall', -1, 0.50);
    add('lumen', 'wall', 1, 0.50);
    add('umbra', 'wall', 1, 0.50);
    ZoneMirror._doubleGeo = [geoL, geoU];
  },

  /* 反転コピーを鏡面の奥へ置く（毎フレーム。判定には触らない） */
  _syncDoubles(dist, t) {
    const ds = ZoneMirror.doubles;
    if (!ds || typeof Game === 'undefined' || !Game.runners || !Game.runners.length) return;
    const XW = CFG.HALF_W + 0.16;
    const wall = ZoneMirror.isWall(dist);
    const hide = (ZoneMirror._glide > 0.2);
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      const r = Game.runners.filter((x) => x.id === d.id)[0];
      if (!r || !r.alive || hide) { d.mesh.visible = false; continue; }
      const off = Runners.footOffset(r);
      const x = Runners.x(r);
      const up = (r.surface === 'floor');
      if (d.plane === 'floor') {
        /* 床の鏡は「床を走っている方」だけを映す（天井の体は遠すぎて映らない） */
        if (!up) { d.mesh.visible = false; continue; }
        d.mesh.visible = true;
        d.mesh.position.set(x, -off, 0);
        d.mesh.rotation.set(0, 0, 0);
        d.mesh.scale.set(1, -1, 1);
      } else if (d.plane === 'ceil') {
        if (up) { d.mesh.visible = false; continue; }
        d.mesh.visible = true;
        d.mesh.position.set(x, CFG.H + off, 0);
        d.mesh.rotation.set(0, 0, 0);
        d.mesh.scale.set(1, 1, 1);
      } else {
        /* 壁の鏡（壁区間だけ）。x を壁面で折り返し、左右を反転する。
           ■ 奥行きは **半分に詰める**（MIRROR_DEPTH）。本物の反射（x' = 2·XW − x）だと
             鏡像が回廊のずっと外に立ち、画面では「壁の外に浮かぶ人」に見えてしまう。
             半分に詰めると鏡像が鏡面パネルの中に収まり、「鏡に映った自分」として読める。
             本物の反射は禁止（負荷 / 契約§5）なので、ここは見え方を優先する。 */
        d.mesh.visible = wall;
        if (!wall) continue;
        const px = d.side * XW + (d.side * XW - x) * ZoneMirror.MIRROR_DEPTH;
        d.mesh.position.set(px, up ? off : (CFG.H - off), 0);
        d.mesh.rotation.set(0, 0, up ? 0 : Math.PI);
        d.mesh.scale.set(-1, up ? 1 : -1, 1);
      }
    }
  },

  /* ---- 光の粒子（契約§5）と漂う鏡の粉 ------------------------------------ */
  _motes(scene) {
    ZoneMirror._field({
      name: 'mote', onTrack: true, spacing: 1.2, geo: new THREE.PlaneGeometry(0.075, 0.075),
      mat: ZoneKit.add(0xeaf4ff, 0.55), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 801), h2 = ZoneKit.hash(slot, 809), h3 = ZoneKit.hash(slot, 811);
        return { x: (h1 - 0.5) * 7.2, y: 0.2 + h2 * (CFG.H - 0.4) + Math.sin(t * 0.5 + slot) * 0.24,
                 dz: h3 * 1.1, rz: t * 0.3 + slot, sx: 0.6 + h3 * 1.4, sy: 0.6 + h3 * 1.4 };
      }
    });
    /* 虹に光る細かい鏡の粉（きらっと明滅する＝明部を点で作る） */
    ZoneMirror._field({
      name: 'glint', onTrack: true, spacing: 2.4, geo: new THREE.PlaneGeometry(0.11, 0.11),
      mat: ZoneKit.add(0xffffff, 0.85), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 821), h2 = ZoneKit.hash(slot, 823), h3 = ZoneKit.hash(slot, 827);
        const fl = 0.25 + 0.75 * Math.abs(Math.sin(t * (1.6 + h3 * 2.8) + slot * 2.1));
        return { x: (h1 - 0.5) * 7.6, y: 0.15 + h2 * (CFG.H - 0.3), dz: h3 * 1.8, sx: fl, sy: fl };
      }
    });
  },

  /* ---- 体感速度の演出（契約§4.1） ---------------------------------------- */
  _speedFx(scene) {
    const P = ZoneMirror.PAL, H = CFG.H;
    const streak = new THREE.PlaneGeometry(0.08, 1.0);
    ZoneMirror.speedLines = [];
    [['floor', 0.022, -Math.PI / 2, P.amber], ['ceil', H - 0.022, Math.PI / 2, P.indigo]].forEach((sfc, si) => {
      ZoneMirror.speedLines.push(ZoneMirror._field({
        name: 'speedline', roadMark: true, onTrack: true, spacing: 2.0, geo: streak, mat: ZoneKit.add(sfc[3], 0.16),
        prop: false, order: 4,
        place(slot, m) {
          if ((slot & 1) !== si) return null;
          const lane = CFG.LANES[Math.floor(ZoneKit.hash(slot, 211) * 3)];
          return { x: lane * CFG.LANE_W + (ZoneKit.hash(slot, 213) - 0.5) * 0.55, y: sfc[1], rx: sfc[2],
                   dz: ZoneKit.hash(slot, 217) * 1.8, sy: 2.2 + ZoneMirror._spd01 * 6.5 };
        }
      }));
    });
    /* 外を流れる虹の筋（開放区間で速度が読める） */
    const N = 190;
    const pos = new Float32Array(N * 6);
    const col = new Float32Array(N * 6);
    const c = new THREE.Color();
    ZoneMirror.WIND_CELL = 24;
    for (let i = 0; i < N; i++) {
      const side = (i % 2) ? 1 : -1;
      const x = side * (2.7 + ZoneKit.hash(i, 401) * 5.2);
      const y = -1.6 + ZoneKit.hash(i, 403) * 8.2;
      const z = -ZoneKit.hash(i, 407) * ZoneMirror.WIND_CELL * 4 + 6;
      const len = 2.0 + ZoneKit.hash(i, 411) * 3.6;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z - len;
      c.setHex(ZoneMirror.RAINBOW[i % 6]);
      for (let k = 0; k < 2; k++) { col[i * 6 + k * 3] = c.r; col[i * 6 + k * 3 + 1] = c.g; col[i * 6 + k * 3 + 2] = c.b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ZoneMirror.windMat = new THREE.LineBasicMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.0,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const m = new THREE.LineSegments(g, ZoneMirror.windMat);
    m.frustumCulled = false;
    ZoneMirror.wind = new THREE.Group();
    ZoneMirror.wind.add(m);
    scene.add(ZoneMirror.wind);
  },

  /* ==========================================================================
     小物（20種以上・前方60mに常時40個以上 / 契約§3 ジオラマ調の規範）
     ========================================================================== */
  _props(scene) {
    const P = ZoneMirror.PAL;
    const HW = CFG.HALF_W;          // 1.8
    const H = CFG.H;                // 4.0
    const XW = HW + 0.16;           // 1.96（壁の内側）
    const hash = ZoneKit.hash;
    const isWall = ZoneMirror.isWall;
    const F = ZoneMirror._field;
    const RB = ZoneMirror.RAINBOW;

    /* 共通の材質（虹の帯は加算・鏡面は半透明のガラス） */
    const matGlass = new THREE.MeshBasicMaterial({ color: P.glass, transparent: true, opacity: 0.42,
                                                   depthWrite: false, fog: true, side: THREE.DoubleSide });
    ZoneMirror.glassMat = matGlass;
    const matSilver = ZoneKit.lam(P.silver);
    const matDim = ZoneKit.lam(P.silverDim);
    const matFrame = ZoneKit.lam(P.frame);
    const matLit = ZoneKit.bas(P.silverLit);
    const matCry = ZoneKit.lam(P.crystal);
    const matPrism = ZoneKit.lam(P.prism);

    /* --- 1. 鏡の回廊のガラス（半透明＝奥の反転コピーが透ける） ------------- */
    {
      const g = ZoneKit.merge([{ g: ZoneKit.box(0.06, H + 1.2, 7.9), p: [0, 0, 0] }]);
      F({
        name: 'glass', spacing: 4, geo: g, mat: matGlass, order: 2,
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * XW, y: H * 0.5 };
        }
      });
    }
    /* --- 2. 鏡の裏板（暗い銀。反転コピーの背景＝鏡の奥行きを作る） --------- */
    {
      const fp = [{ g: ZoneKit.box(0.30, H + 1.2, 7.9), p: [0, 0, 0] }];
      for (let i = -2; i <= 2; i++) fp.push({ g: ZoneKit.box(0.06, 0.07, 7.9), p: [-0.17, i * 0.86, 0] });
      const g = ZoneKit.merge(fp);
      F({
        name: 'wallback', spacing: 4, geo: g, mat: matDim,
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 2.62), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }
    /* --- 3. 鏡の枠（黒い縦の枠＝暗部の骨。白飛びを割る） ------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.26, H + 1.3, 0.26), p: [0, 0, 0] },
        { g: ZoneKit.box(0.34, 0.30, 0.34), p: [0, (H + 1.3) / 2 - 0.15, 0] },
        { g: ZoneKit.box(0.34, 0.30, 0.34), p: [0, -(H + 1.3) / 2 + 0.15, 0] }
      ]);
      F({
        name: 'frame', spacing: 4, geo: g, mat: matFrame,
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.14), y: H * 0.5, dz: (slot % 2) ? 0 : 2 };
        }
      });
    }
    /* --- 4. 枠の縁を走る虹の光条（明部を線で作る） ------------------------- */
    {
      const g = ZoneKit.merge([{ g: ZoneKit.box(0.10, H + 0.9, 0.10), p: [0, 0, 0] }]);
      F({
        name: 'frameglow', spacing: 4, geo: g, mat: ZoneKit.add(0xffffff, 0.95),
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW - 0.02), y: H * 0.5, dz: (slot % 2) ? 0 : 2 };
        }
      });
    }
    /* --- 5. 天井の梁（走行の高さの外・回廊をまたぐ） ----------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(HW * 2 + 0.9, 0.22, 0.30), p: [0, 0, 0] },
        { g: ZoneKit.box(HW * 2 + 0.5, 0.08, 0.14), p: [0, -0.15, 0] }
      ]);
      F({
        name: 'beamTop', spacing: 8, geo: g, mat: matFrame,
        place(slot, m) {
          if (!isWall(m)) return null;
          return { x: 0, y: H + 0.22 };
        }
      });
    }
    /* --- 6. 床の梁（走行の高さの外） --------------------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(HW * 2 + 0.9, 0.22, 0.30), p: [0, 0, 0] },
        { g: ZoneKit.box(HW * 2 + 0.5, 0.08, 0.14), p: [0, 0.15, 0] }
      ]);
      F({
        name: 'beamBot', spacing: 8, geo: g, mat: matFrame,
        place(slot, m) {
          if (!isWall(m)) return null;
          return { x: 0, y: -0.22, dz: 4 };
        }
      });
    }
    /* --- 7. プリズムの柱（契約§5）: 三角柱が虹に割れる ------------------- */
    {
      const g = ZoneKit.merge([
        { g: new THREE.CylinderGeometry(0.30, 0.34, H * 0.9, 3), p: [0, H * 0.45, 0] },
        { g: new THREE.CylinderGeometry(0.34, 0.38, 0.14, 3), p: [0, 0.07, 0] },
        { g: new THREE.CylinderGeometry(0.34, 0.30, 0.14, 3), p: [0, H * 0.9 - 0.07, 0] }
      ]);
      F({
        name: 'prism', spacing: 11, geo: g, mat: matPrism,
        place(slot, m, t) {
          const side = (hash(slot, 31) > 0.5) ? 1 : -1;
          return { x: side * (XW + 0.46 + hash(slot, 37) * 0.5), y: 0.06,
                   ry: t * 0.22 + slot, dz: hash(slot, 41) * 5 };
        }
      });
    }
    /* --- 8. プリズムが散らす虹の帯（契約§5「光の屈折ビーム」） ------------
       ■ **走行空間（|x| ≤ 1.45）には絶対に入れない**（ZoneKit.intrudes が検査する）。
         回廊を横切る光の帯は「ローレーザー（跳んで越える障害物）」と紛らわしいので、
         帯はコリドーの **外側** だけに置き、開放区間でだけ見せる。 */
    {
      const g = ZoneKit.merge([{ g: new THREE.PlaneGeometry(2.4, 0.14) }]);
      const f = F({
        name: 'refract', spacing: 11, geo: g, mat: ZoneKit.add(0xffffff, 0.22), order: 4, outside: true,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const side = (hash(slot, 31) > 0.5) ? 1 : -1;
          return { x: side * 3.9, y: 0.3 + hash(slot, 43) * (H + 0.6),
                   rz: 0.10 * Math.sin(t * 0.6 + slot), ry: 0.25 * side,
                   dz: hash(slot, 41) * 5 + 0.6, sx: 0.8 + 0.3 * Math.sin(t * 0.9 + slot) };
        }
      });
      ZoneMirror.refractMat = f.mesh.material;
    }
    /* --- 9. 薄い虹の帯（縦に降りる屈折光。コリドーの外の左右） -------------- */
    {
      const parts = [];
      for (let i = 0; i < 6; i++) parts.push({ g: new THREE.PlaneGeometry(0.16, 6.4), p: [(i - 2.5) * 0.19, 0, 0] });
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'rainbowfall', spacing: 17, geo: g, mat: ZoneKit.add(0xcfe0ff, 0.22), order: 4, outside: true,
        place(slot, m, t) {
          const side = (hash(slot, 51) > 0.5) ? 1 : -1;
          return { x: side * 2.95, y: H * 0.55,
                   ry: 0.35 * side + 0.08 * Math.sin(t * 0.4 + slot), dz: hash(slot, 53) * 8 };
        }
      });
    }
    /* --- 10. 浮遊する鏡片（契約§5「ゆっくり回転・虹色の縁光」） ------------ */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.56, 0.02, 0.40), p: [0, 0, 0], r: [0, 0, 0] },
        { g: ZoneKit.box(0.30, 0.02, 0.46), p: [0.20, 0, 0.10], r: [0, 0.5, 0] }
      ]);
      F({
        name: 'shard', spacing: 3.4, geo: g, mat: matSilver,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const h1 = hash(slot, 61), h2 = hash(slot, 67), h3 = hash(slot, 71);
          const side = (h1 > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.55 + h2 * 3.4), y: 0.3 + h3 * (H + 1.4),
                   rx: t * (0.16 + h1 * 0.2) + slot, ry: t * (0.12 + h2 * 0.18),
                   rz: t * 0.1 + h3 * 3, dz: h2 * 3.2, sx: 0.7 + h3 * 1.5,
                   sy: 1, sz: 0.7 + h1 * 1.5 };
        }
      });
    }
    /* --- 11. 鏡片の虹の縁光 ------------------------------------------------ */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.60, 0.05, 0.05), p: [0, 0, 0.21] },
        { g: ZoneKit.box(0.60, 0.05, 0.05), p: [0, 0, -0.21] },
        { g: ZoneKit.box(0.05, 0.05, 0.44), p: [0.29, 0, 0] }
      ]);
      F({
        name: 'shardrim', spacing: 3.4, geo: g, mat: ZoneKit.add(0xbfe4ff, 0.9), order: 4,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const h1 = hash(slot, 61), h2 = hash(slot, 67), h3 = hash(slot, 71);
          const side = (h1 > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.55 + h2 * 3.4), y: 0.3 + h3 * (H + 1.4),
                   rx: t * (0.16 + h1 * 0.2) + slot, ry: t * (0.12 + h2 * 0.18),
                   rz: t * 0.1 + h3 * 3, dz: h2 * 3.2, sx: 0.7 + h3 * 1.5,
                   sy: 1, sz: 0.7 + h1 * 1.5 };
        }
      });
    }
    /* --- 12. 大きな鏡片（開放区間の遠め・ゆっくり回る） -------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(2.6, 0.06, 1.8), p: [0, 0, 0] },
        { g: ZoneKit.box(1.4, 0.06, 2.2), p: [0.9, 0, 0.5], r: [0, 0.6, 0] }
      ]);
      F({
        name: 'shardbig', spacing: 15, geo: g, mat: matDim, outside: true,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const h1 = hash(slot, 81), h2 = hash(slot, 83), h3 = hash(slot, 89);
          const side = (h1 > 0.5) ? 1 : -1;
          return { x: side * (5.0 + h2 * 5.5), y: -1.5 + h3 * 10,
                   rx: t * 0.08 + slot, ry: t * 0.11 + h2 * 4, rz: h3 * 2,
                   dz: h2 * 9, sx: 1 + h1, sy: 1, sz: 1 + h3 };
        }
      });
    }
    /* --- 13. 結晶（床際の群れ / 契約§5） ---------------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        parts.push({ g: new THREE.ConeGeometry(0.11 + i * 0.02, 0.5 + i * 0.16, 5),
                     p: [(i - 1.5) * 0.22, (0.5 + i * 0.16) / 2, (i % 2) * 0.16],
                     r: [0, 0, (i - 1.5) * 0.13] });
      }
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'crystal', spacing: 5.5, geo: g, mat: matCry,
        place(slot, m) {
          const side = (hash(slot, 101) > 0.5) ? 1 : -1;
          return { x: side * (XW + 0.62 + hash(slot, 103) * 0.7), y: 0.02,
                   ry: hash(slot, 107) * 3, dz: hash(slot, 109) * 3,
                   sx: 0.7 + hash(slot, 113) * 0.8, sy: 0.7 + hash(slot, 113) * 0.9, sz: 0.8 };
        }
      });
    }
    /* --- 14. 結晶（天井際の群れ） ------------------------------------------ */
    {
      const parts = [];
      for (let i = 0; i < 3; i++) {
        parts.push({ g: new THREE.ConeGeometry(0.10 + i * 0.02, 0.44 + i * 0.18, 5),
                     p: [(i - 1) * 0.24, -(0.44 + i * 0.18) / 2, (i % 2) * 0.14],
                     r: [Math.PI, 0, (i - 1) * 0.14] });
      }
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'crystalC', spacing: 5.5, geo: g, mat: matCry,
        place(slot, m) {
          const side = (hash(slot, 121) > 0.5) ? 1 : -1;
          return { x: side * (XW + 0.62 + hash(slot, 127) * 0.7), y: H - 0.02,
                   ry: hash(slot, 131) * 3, dz: 2.8 + hash(slot, 137) * 3,
                   sx: 0.7 + hash(slot, 139) * 0.8, sy: 0.7 + hash(slot, 139) * 0.9, sz: 0.8 };
        }
      });
    }
    /* --- 15. 結晶の稜線の光（明部を細い線で） ------------------------------ */
    {
      const g = ZoneKit.merge([{ g: ZoneKit.box(0.03, 0.46, 0.03), p: [0, 0.23, 0] }]);
      F({
        name: 'crystaledge', spacing: 5.5, geo: g, mat: ZoneKit.add(0xeafcff, 0.95),
        place(slot, m) {
          const side = (hash(slot, 101) > 0.5) ? 1 : -1;
          return { x: side * (XW + 0.62 + hash(slot, 103) * 0.7), y: 0.06,
                   dz: hash(slot, 109) * 3, sy: 0.7 + hash(slot, 113) * 0.9 };
        }
      });
    }
    /* --- 16. 水晶の花（契約§5） ------------------------------------------- */
    {
      const parts = [{ g: new THREE.SphereGeometry(0.10, 8, 6), p: [0, 0.34, 0] },
                     { g: ZoneKit.box(0.05, 0.34, 0.05), p: [0, 0.17, 0] }];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        parts.push({ g: new THREE.ConeGeometry(0.075, 0.26, 4),
                     p: [Math.cos(a) * 0.15, 0.40, Math.sin(a) * 0.15],
                     r: [Math.sin(a) * 0.9, -a, -Math.cos(a) * 0.9] });
      }
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'flower', spacing: 9, geo: g, mat: ZoneKit.lam(P.petal),
        place(slot, m, t) {
          const side = (hash(slot, 151) > 0.5) ? 1 : -1;
          const up = hash(slot, 157) > 0.45;
          return { x: side * (XW + 0.58 + hash(slot, 163) * 0.6), y: up ? 0.02 : H - 0.02,
                   rz: up ? 0 : Math.PI, ry: t * 0.3 + slot,
                   dz: hash(slot, 167) * 4, sx: 0.8 + hash(slot, 173) * 0.7,
                   sy: 0.8 + hash(slot, 173) * 0.7, sz: 0.8 + hash(slot, 173) * 0.7 };
        }
      });
    }
    /* --- 17. 台座（結晶と花の下の黒い影＝暗部を作る） ---------------------- */
    {
      const g = ZoneKit.merge([
        { g: new THREE.CylinderGeometry(0.42, 0.50, 0.12, 6), p: [0, 0.06, 0] },
        { g: new THREE.CylinderGeometry(0.34, 0.42, 0.06, 6), p: [0, 0.15, 0] }
      ]);
      F({
        name: 'pedestal', spacing: 9, geo: g, mat: matFrame,
        place(slot, m) {
          const side = (hash(slot, 151) > 0.5) ? 1 : -1;
          const up = hash(slot, 157) > 0.45;
          return { x: side * (XW + 0.58 + hash(slot, 163) * 0.6), y: up ? 0 : H,
                   rz: up ? 0 : Math.PI, dz: hash(slot, 167) * 4 };
        }
      });
    }
    /* --- 18/19. 鏡の輪（開放区間・コリドーの外を囲む） ---------------------
       ■ 輪をそのまま1つの形にすると、外接箱が走行空間をまたいでしまう
         （ZoneKit.intrudes は融合した形の外接箱で見る / 決定ログ P4b）。
         **左右の弧** と **上下の弧** に割り、同じ z に来るよう spacing を
         半分にして dz でそろえる。左右の弧は x が走行空間の外、
         上下の弧は y が走行の高さの外に収まる＝検査を素直に通る。 */
    {
      const arc = (r, tube, from) => {
        const t2 = new THREE.TorusGeometry(r, tube, 4, 8, Math.PI / 2);
        t2.rotateZ(from);
        return t2;
      };
      const SP = 6.5;
      /* 左右の弧（-45°〜45° と その反対）＝ x は必ず |x| ≥ 2.2 */
      const side = ZoneKit.merge([{ g: arc(3.3, 0.10, -Math.PI / 4) },
                                  { g: arc(3.62, 0.045, -Math.PI / 4) }]);
      F({
        name: 'ringside', spacing: SP, geo: side, mat: matSilver, outside: true,
        place(slot, m) {
          const even = (slot % 2) === 0;
          if (isWall(m - (even ? 0 : SP))) return null;
          return { x: 0, y: H / 2, rz: even ? 0 : Math.PI, dz: even ? 0 : -SP };
        }
      });
      /* 上下の弧（45°〜135° と その反対）＝ y は必ず走行の高さ（0.06〜3.94）の外 */
      const cap = ZoneKit.merge([{ g: arc(3.3, 0.10, Math.PI / 4) },
                                 { g: arc(3.62, 0.045, Math.PI / 4) }]);
      F({
        name: 'ringcap', spacing: SP, geo: cap, mat: matSilver, outside: true,
        place(slot, m) {
          const even = (slot % 2) === 0;
          if (isWall(m - (even ? 0 : SP))) return null;
          return { x: 0, y: H / 2, rz: even ? 0 : Math.PI, dz: even ? 0 : -SP };
        }
      });
      /* 輪の虹の縁光（同じ割り方。色は sync() が虹を巡らせる） */
      const sideG = ZoneKit.merge([{ g: arc(3.45, 0.075, -Math.PI / 4) }]);
      const f = F({
        name: 'ringglow', spacing: SP, geo: sideG, mat: ZoneKit.add(0x9fd0ff, 0.85), outside: true, order: 4,
        place(slot, m) {
          const even = (slot % 2) === 0;
          if (isWall(m - (even ? 0 : SP))) return null;
          return { x: 0, y: H / 2, rz: even ? 0 : Math.PI, dz: even ? 0 : -SP };
        }
      });
      ZoneMirror.ringGlowMat = f.mesh.material;
      const capG = ZoneKit.merge([{ g: arc(3.45, 0.075, Math.PI / 4) }]);
      F({
        name: 'ringcapglow', spacing: SP, geo: capG, mat: f.mesh.material, outside: true, order: 4,
        place(slot, m) {
          const even = (slot % 2) === 0;
          if (isWall(m - (even ? 0 : SP))) return null;
          return { x: 0, y: H / 2, rz: even ? 0 : Math.PI, dz: even ? 0 : -SP };
        }
      });
    }
    /* --- 20. 鏡のオベリスク（開放区間の近景・両脇に立つ） ------------------ */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.7, 5.4, 0.7), p: [0, 2.7, 0] },
        { g: new THREE.ConeGeometry(0.52, 1.5, 4), p: [0, 6.1, 0], r: [0, 0.78, 0] },
        { g: ZoneKit.box(1.0, 0.22, 1.0), p: [0, 0.11, 0] }
      ]);
      F({
        name: 'obelisk', spacing: 19, geo: g, mat: matDim, outside: true,
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (hash(slot, 191) > 0.5) ? 1 : -1;
          return { x: side * (3.4 + hash(slot, 193) * 1.6), y: -1.4,
                   ry: hash(slot, 197) * 3, dz: hash(slot, 199) * 8 };
        }
      });
    }
    /* --- 21. 反射する球（鏡の玉。ゆっくり漂う） ---------------------------- */
    {
      const g = ZoneKit.merge([
        { g: new THREE.IcosahedronGeometry(0.30, 1), p: [0, 0, 0] }
      ]);
      F({
        name: 'orb', spacing: 7.5, geo: g, mat: matSilver,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const h1 = hash(slot, 211), h2 = hash(slot, 223);
          const side = (h1 > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.9 + h2 * 2.2), y: 0.4 + hash(slot, 227) * (H - 0.6) +
                                                       Math.sin(t * 0.5 + slot) * 0.3,
                   ry: t * 0.4, dz: h2 * 4, sx: 0.6 + h2 * 0.9, sy: 0.6 + h2 * 0.9, sz: 0.6 + h2 * 0.9 };
        }
      });
    }
    /* --- 22. 床の鏡の意匠（走行空間の上・薄板） ---------------------------- */
    {
      const parts = [];
      CFG.LANES.forEach((l) => {
        parts.push({ g: ZoneKit.box(CFG.LANE_W - 0.20, 0.012, 0.20), p: [l * CFG.LANE_W, 0, 0] });
      });
      parts.push({ g: ZoneKit.box(0.09, 0.012, 3.0), p: [-CFG.LANE_W / 2, 0, 0] });
      parts.push({ g: ZoneKit.box(0.09, 0.012, 3.0), p: [CFG.LANE_W / 2, 0, 0] });
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'inlayF', onTrack: true, spacing: 3.4, geo: g, mat: ZoneKit.add(P.amber, 0.62), order: 3,
        place(slot, m) { return { x: 0, y: 0.018, dz: 0 }; }
      });
    }
    /* --- 23. 天井の鏡の意匠 ------------------------------------------------ */
    {
      const parts = [];
      CFG.LANES.forEach((l) => {
        parts.push({ g: ZoneKit.box(CFG.LANE_W - 0.20, 0.012, 0.20), p: [l * CFG.LANE_W, 0, 0] });
      });
      parts.push({ g: ZoneKit.box(0.09, 0.012, 3.0), p: [-CFG.LANE_W / 2, 0, 0] });
      parts.push({ g: ZoneKit.box(0.09, 0.012, 3.0), p: [CFG.LANE_W / 2, 0, 0] });
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'inlayC', onTrack: true, spacing: 3.4, geo: g, mat: ZoneKit.add(P.indigo, 0.62), order: 3,
        place(slot, m) { return { x: 0, y: H - 0.018, dz: 1.7 }; }
      });
    }
    /* --- 23b. 鏡の継ぎ目（レーンの境を走る白い光の筋）---------------------
       銀の鏡の床はレーンが読みにくいので、境目に白い継ぎ目を通す。
       遠近で長く伸びるので「明部（≥200）」の面積を素直に稼げる（契約§3）。 */
    {
      const parts = [];
      [-1.5, -0.5, 0.5, 1.5].forEach((b) => {
        parts.push({ g: ZoneKit.box(0.075, 0.012, 3.2), p: [b * CFG.LANE_W, 0, 0] });
      });
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      ['floor', 'ceil'].forEach((sfc, si) => {
        F({
          name: 'seam' + (si ? 'C' : 'F'), onTrack: true, spacing: 3.4, geo: g,
          mat: ZoneKit.add(0xfff4e0, 0.9), prop: false, order: 4,
          place(slot, m) { return { x: 0, y: si ? (H - 0.02) : 0.02, dz: si ? 1.7 : 0 }; }
        });
      });
    }
    /* --- 24. 壁際の光条（虹が縦に流れる） --------------------------------- */
    {
      const g = ZoneKit.merge([{ g: new THREE.PlaneGeometry(0.55, 3.4) }]);
      const f = F({
        name: 'wallglow', spacing: 6, geo: g, mat: ZoneKit.add(0xffffff, 0.85), order: 4,
        place(slot, m, t) {
          if (!isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW - 0.06), y: H / 2 + Math.sin(t * 0.5 + slot) * 0.5,
                   ry: Math.PI / 2, dz: hash(slot, 233) * 3 };
        }
      });
      ZoneMirror.wallGlowMat = f.mesh.material;
    }
    /* --- 26. 縁を走る虹の光の帯（壁区間の明部。面積を稼ぐ主役） ---------- */
    {
      const g = ZoneKit.merge([{ g: new THREE.PlaneGeometry(0.40, 7.9) }]);
      const f = F({
        name: 'edgebar', spacing: 8, geo: g, mat: ZoneKit.add(0xdfeaff, 0.85), order: 4,
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          const low = (slot % 4) < 2;
          return { x: side * (XW - 0.09), y: low ? 0.34 : H - 0.34, rx: Math.PI / 2, ry: Math.PI / 2 };
        }
      });
      ZoneMirror.edgeBarMat = f.mesh.material;
    }
    /* --- 25. 割れ目の線（鏡の回廊のひび。暗い線＝銀を割る） ---------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.02, 1.4, 0.03), p: [0, 0.7, 0], r: [0, 0, 0.22] },
        { g: ZoneKit.box(0.02, 0.9, 0.03), p: [0.16, 1.7, 0.1], r: [0, 0, -0.4] },
        { g: ZoneKit.box(0.02, 0.6, 0.03), p: [-0.1, 0.3, -0.1], r: [0, 0, 0.5] }
      ];
      const g = ZoneKit.merge(parts);
      parts.forEach((q) => q.g.dispose());
      F({
        name: 'crack', spacing: 10, geo: g, mat: ZoneKit.bas(0x0a0d14),
        place(slot, m) {
          if (!isWall(m)) return null;
          const side = (hash(slot, 241) > 0.5) ? 1 : -1;
          return { x: side * (XW - 0.05), y: 0.6 + hash(slot, 251) * 1.6,
                   dz: hash(slot, 257) * 3, sy: 0.7 + hash(slot, 263) * 0.8 };
        }
      });
    }
  },

  /* ==========================================================================
     毎フレーム
     ========================================================================== */
  sync(dist, t, speed) {
    if (!ZoneMirror.scene) return;
    ZoneMirror._t = t;
    ZoneMirror._speed = speed || CFG.SPEED_MIN;
    ZoneMirror._spd01 = U.clamp((ZoneMirror._speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    const Sp = (typeof Setpieces !== 'undefined') ? Setpieces : null;
    /* 大演出「鏡の砕け散り」の鏡カットのあいだは小物を間引く（背景を空ける） */
    ZoneMirror._clear = (Sp && Sp.shatterClearK) ? Sp.shatterClearK(dist) : 0;
    ZoneMirror.aheadCount = ZoneKit.syncFields(ZoneMirror, dist, t, false);
    ZoneMirror._syncDoubles(dist, t);

    /* 遠景の層を視差で流す */
    for (let i = 0; i < ZoneMirror.farLayers.length; i++) {
      const g = ZoneMirror.farLayers[i];
      g.position.z = (dist * g.userData.par) % g.userData.len;
    }
    /* 万華鏡の遠景（放射状の対称パターンが回る / 契約§5） */
    for (let i = 0; i < ZoneMirror.kaleLayers.length; i++) {
      ZoneMirror.kaleLayers[i].rotation.z = t * ZoneMirror.kaleLayers[i].userData.spin;
    }
    if (ZoneMirror.sky) ZoneMirror.sky.position.z = -168 + (dist * 0.04) % 40;

    /* 虹の点光を流す＝銀の面に色の溜まりができる（のっぺりを防ぐ） */
    if (ZoneMirror.lampA) {
      const a = 21, b = 16;
      const k = Math.floor(dist / a);
      ZoneMirror.lampA.color.setHex(ZoneMirror.RAINBOW[((k % 6) + 6) % 6]);
      ZoneMirror.lampA.position.set(-1.9, CFG.H - 0.6, -(a - (dist % a)));
      ZoneMirror.lampA.intensity = 14.0 * (0.85 + 0.15 * Math.sin(t * 3.1));
      const k2 = Math.floor(dist / b);
      ZoneMirror.lampB.color.setHex(ZoneMirror.RAINBOW[((k2 % 6) + 6) % 6]);
      ZoneMirror.lampB.position.set(1.9, 0.6, -(b - (dist % b)));
      ZoneMirror.lampB.intensity = 11.0 * (0.85 + 0.15 * Math.sin(t * 2.3 + 1.1));
    }
    /* 虹の帯・縁光のゆらぎ（画面が生きている） */
    const hue = (mat, base, spd) => {
      if (!mat) return;
      const k = ((t * spd) % 6);
      const i0 = Math.floor(k), i1 = (i0 + 1) % 6;
      mat.color.setHex(ZoneMirror.RAINBOW[i0]).lerp(new THREE.Color(ZoneMirror.RAINBOW[i1]), k - i0);
      mat.opacity = base * (0.75 + 0.25 * Math.sin(t * 2.2));
    };
    hue(ZoneMirror.refractMat, 0.22, 0.32);
    hue(ZoneMirror.ringGlowMat, 0.85, 0.21);
    hue(ZoneMirror.wallGlowMat, 0.85, 0.17);
    hue(ZoneMirror.edgeBarMat, 0.85, 0.13);
    if (ZoneMirror.glassMat) ZoneMirror.glassMat.opacity = 0.38 + 0.08 * Math.sin(t * 1.3);

    /* 大演出「鏡の砕け散り」（§4.4 S7）: 砕けた鏡片と大鏡が回廊を照らす */
    if (ZoneMirror.shatterKey) {
      const k = (Sp && Sp.shatterLightK) ? Sp.shatterLightK(dist) : 0;
      if (k > 0.001) {
        ZoneMirror.shatterKey.position.set(0, CFG.H * 0.6, -18);
        ZoneMirror.shatterKey.intensity = 70 * k * (0.85 + 0.15 * Math.sin(t * 9));
        ZoneMirror.shatterKey.distance = 70;
      } else if (ZoneMirror.shatterKey.intensity !== 0) {
        ZoneMirror.shatterKey.intensity = 0;
      }
    }

    if (ZoneMirror.speedLines) {
      const op = 0.12 + ZoneMirror._spd01 * 0.30;
      ZoneMirror.speedLines.forEach((f) => { f.mesh.material.opacity = op; });
    }
    if (ZoneMirror.wind) {
      ZoneMirror.windMat.opacity = 0.05 + ZoneMirror._spd01 * 0.22;
      ZoneMirror.wind.position.z = (dist % ZoneMirror.WIND_CELL);
    }
  },

  setGlide(k) { ZoneMirror._glide = k || 0; },

  propsAhead() { return ZoneMirror.aheadCount || 0; },

  dispose() {
    /* 反転コピーのジオメトリは scene の外にも参照があるので明示的に捨てる */
    if (ZoneMirror.doubles) {
      ZoneMirror.doubles.forEach((d) => { if (d.mesh.material) d.mesh.material.dispose(); });
      ZoneMirror.doubles = null;
    }
    if (ZoneMirror._doubleGeo) {
      ZoneMirror._doubleGeo.forEach((g) => g.dispose());
      ZoneMirror._doubleGeo = null;
    }
  }
};

/* 障害物の見た目は全ゾーン共通（js/obstacle_skin.js / 契約§4.3 v2・ゾーン別スキンは失効） */

Zones.register(ZoneMirror);
