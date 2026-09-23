/* ============================================================================
   DUO RUN — zone_ruins.js  ゾーン2「古代遺跡・外周」の装飾（契約 §5 / §6 P3a）

   ■ 契約§5「古代遺跡」
     砂岩色。柱・彫像・蔦・松明の点光。舞う埃の粒子。崩れた石段。霧は黄土色。
     壁のある区間と開放区間（外は峡谷・遠景に山と巨大遺跡のシルエット・夕暮れの空）を交互に。
   ■ 作り方の方針はネオン都市と同じ（契約§3）
     - テクスチャ画像は一切使わない。形は ZoneKit.merge でプリミティブを彫る。
     - 小物は InstancedMesh 1つ＝1種類。スロット送りで無限に流す（同じ距離＝同じ景色）。
     - 黒潰れを防ぐ光源は「松明の点光 ＋ 天窓から落ちる光の柱 ＋ 夕暮れの環境光」。
   ============================================================================ */
'use strict';

const ZoneRuins = {
  id: 'ruins',
  BEHIND: 26,            // 巨岩の追跡で後ろを振り返るので、背後にも景色を残しておく

  PAL: {
    /* World が読む共通キー */
    road:      0x574828,      // 砂岩の石畳（環境光を落としたぶん素の色は少し上げる）
    roadRough: 0.90,          // 石＝ざらざら（ネオンの濡れた路面と正反対）
    roadMetal: 0.0,
    skirt:     0x2e2617,
    metal:     0xb9a37b,      // ゲート・門柱の石
    amber:     0xffb347,      // 床＝LUMEN（ゾーンが変わっても意味は同じ）
    indigo:    0x8b9bff,      // 天井＝UMBRA
    fog:       0x2a1d0e,      // 黄土色の霧（契約§5）。暗部を残すため深く沈める

    /* 遺跡の配色（色数を増やす: 石の砂〜灰／蔦の緑／松明の橙／金／空の紫） */
    skyTop:    0x2c2454,      // 夜に近い藍
    skyMid:    0x5b2f63,      // 紫
    skyLow:    0xff9f4e,      // 地平線の橙
    skyHot:    0xffd9a0,      // 太陽まわり（明部）
    stone:     0x94804f,
    stoneLit:  0xb79c6e,
    stoneDark: 0x53442a,
    stoneCool: 0x8e8878,      // 灰がかった石（色味の幅）
    wall:      0x806c49,
    wallDark:  0x3a2e1a,
    moss:      0x6b8f45,
    vine:      0x74a04a,
    fire:      0xff8a2a,
    fireHot:   0xfff0cf,
    flame:     0xffc266,      // 炎の本体（明部として数えられる明るさ）
    ember:     0xff6a1e,
    water:     0x4a9aa0,
    gold:      0xffd870,
    cloth:     0x9c3a2e,      // 垂れ幕（深紅）
    cloth2:    0x2f6f74,      // 垂れ幕（青緑）
    mountain:  0x2f2748,
    ruinFar:   0x3d3355,
    dust:      0xe8cf9a
  },
  fog: { color: 0x2a1d0e, near: 18, far: 82 },

  /* ---- 区間パターン（壁のある区間と開放区間を交互に / 契約§5） ------------
     S3「外周」は開放区間を長く取る（峡谷・夕日・遠景が主役）。
     S4「内部」は **壁区間が主体**（契約§4.4「内部＝壁区間主体・天窓と松明・
     地下水路・祭壇の間」）＝ 同じ小物のまま、区間パターンだけ切り替える。 */
  MODE: {
    outer: { period: 110, len: 70 },
    inner: { period: 132, len: 118 }
  },
  WALL_PERIOD: 110,
  WALL_LEN: 70,
  mode: 'outer',
  /* 距離で区間パターンを替える（契約§4.4 v2 / P7c: S3 は中盤の巨岩の追跡まで「外周」、その後「内部」）。
     split = [{from, period, len, mode}]（from 昇順）。null なら WALL_PERIOD/WALL_LEN の1本だけ。 */
  split: null,
  setMode(id) {
    if (Array.isArray(id)) {
      const sp = id.map((x) => {
        const m = ZoneRuins.MODE[x.mode] || ZoneRuins.MODE.outer;
        return { from: x.from || 0, period: m.period, len: m.len, mode: ZoneRuins.MODE[x.mode] ? x.mode : 'outer' };
      }).sort((a, b) => a.from - b.from);
      ZoneRuins.setMode(sp[0] ? sp[0].mode : 'outer');
      ZoneRuins.split = (sp.length > 1) ? sp : null;
      return ZoneRuins.mode;
    }
    const m = ZoneRuins.MODE[id] || ZoneRuins.MODE.outer;
    ZoneRuins.mode = ZoneRuins.MODE[id] ? id : 'outer';
    ZoneRuins.WALL_PERIOD = m.period;
    ZoneRuins.WALL_LEN = m.len;
    ZoneRuins.split = null;
    return ZoneRuins.mode;
  },
  _seg(m) {
    const sp = ZoneRuins.split;
    let r = sp[0];
    for (let i = 1; i < sp.length; i++) if (m >= sp[i].from) r = sp[i];
    return r;
  },
  /* 距離 m の区間パターン名（監査用） */
  modeAt(m) { return ZoneRuins.split ? ZoneRuins._seg(m).mode : ZoneRuins.mode; },
  isWall(m) {
    if (ZoneRuins.split) {
      const r = ZoneRuins._seg(m);
      return ((((m - r.from) % r.period) + r.period) % r.period) < r.len;
    }
    const p = ((m % ZoneRuins.WALL_PERIOD) + ZoneRuins.WALL_PERIOD) % ZoneRuins.WALL_PERIOD;
    return p < ZoneRuins.WALL_LEN;
  },
  hash(n, salt) { return ZoneKit.hash(n, salt); },
  _field(spec) { return ZoneKit.field(ZoneRuins, spec); },

  /* ==========================================================================
     組み立て
     ========================================================================== */
  build(scene) {
    ZoneRuins.scene = scene;
    ZoneRuins._t = 0;
    ZoneRuins._spd01 = 0;
    const F = ZoneRuins.fog;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    scene.background = new THREE.Color(F.color);
    ZoneRuins._lights(scene);
    ZoneRuins._sky(scene);
    ZoneRuins._far(scene);
    ZoneRuins._props(scene);
    ZoneRuins._dust(scene);
    ZoneRuins._speedFx(scene);
  },

  /* ---- 光（夕暮れの環境光＋低い太陽＋松明の点光2つ） ----------------------
     契約§5 の「黒潰れ禁止」は、環境光を暖色で持ち上げ、松明の点光を流すことで作る。 */
  _lights(scene) {
    const P = ZoneRuins.PAL;
    /* ■ 明暗を作る（P3a-r1 差し戻し: 中間調だけの平坦な絵をやめる）
       環境光は「陰が残る」ところまで落とし、面の向きで明暗が割れるようにする。
       明部は **火・天窓から落ちる光・夕日** が受け持つ（発光マテリアル＋点光源）。 */
    scene.add(new THREE.AmbientLight(0x8a7652, 0.34));
    scene.add(new THREE.HemisphereLight(0xe0a86a, 0x2a2012, 0.36));
    /* 手前（カメラ側）から当てる主光。面がこちらを向いた所だけ明るくなる */
    const sun = new THREE.DirectionalLight(0xffc98c, 0.62);
    sun.position.set(-0.72, 0.5, 0.75);
    scene.add(sun);
    /* 奥（峡谷の夕日）からの逆光。柱や像の縁が光って輪郭が立つ＝リムライト */
    const rim = new THREE.DirectionalLight(0xffb27a, 0.46);
    rim.position.set(0.6, 0.42, -1.0);
    scene.add(rim);
    /* 松明の火（走行に合わせて流し、揺らぎをつける）。明るい溜まりを作る主役 */
    ZoneRuins.torchA = new THREE.PointLight(P.fire, 24.0, 20, 2);
    ZoneRuins.torchB = new THREE.PointLight(P.ember, 19.0, 18, 2);
    scene.add(ZoneRuins.torchA, ZoneRuins.torchB);
    /* 巨岩の追跡（§4.4 S3）で、振り返ったときに岩の輪郭が読めるようにする明かり。
       位置は sync() が Setpieces から引いて毎フレーム置く（演出側は触らない）。 */
    ZoneRuins.rockKey = new THREE.PointLight(0xffd7ad, 0, 15, 2);   // 岩の面だけを起こす主光（届く範囲を絞る）
    ZoneRuins.rockRim = new THREE.PointLight(0xffb070, 0, 13, 2);   // 縁だけを起こす逆光
    scene.add(ZoneRuins.rockKey, ZoneRuins.rockRim);
  },

  /* ---- 空（夕暮れのグラデーション。頂点カラー＝画像なし） ----------------- */
  _sky(scene) {
    const P = ZoneRuins.PAL;
    const g = new THREE.PlaneGeometry(560, 320, 1, 24);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(P.skyTop), mid = new THREE.Color(P.skyMid);
    const low = new THREE.Color(P.skyLow), hot = new THREE.Color(P.skyHot);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getY(i) / 320) + 0.5;      // 0(下) .. 1(上)
      /* 上＝藍 → 紫 → 橙 → 地平の白熱。一色にしない（P3a-r1） */
      /* 見える地平は u≈0.49。その少し上に白熱帯 → 橙 → 紫 → 藍 と積む */
      if (u > 0.66) c.copy(mid).lerp(top, U.clamp((u - 0.66) / 0.34, 0, 1));
      else if (u > 0.56) c.copy(low).lerp(mid, U.clamp((u - 0.56) / 0.10, 0, 1));
      else if (u > 0.47) c.copy(hot).lerp(low, U.clamp((u - 0.47) / 0.09, 0, 1));
      else c.copy(hot);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    m.position.set(0, 6, -178);
    m.renderOrder = -10;
    scene.add(m);
    /* 夕日そのもの（低い位置の大きな円盤＋にじみ） */
    const sun = new THREE.Mesh(new THREE.CircleGeometry(15, 26),
                               new THREE.MeshBasicMaterial({ color: 0xfff4de, fog: false, depthWrite: false }));
    sun.position.set(-26, 4, -176);
    sun.renderOrder = -9;
    scene.add(sun);
    [[30, 0.55], [58, 0.28], [96, 0.14]].forEach((q, i) => {
      const halo = new THREE.Mesh(new THREE.CircleGeometry(q[0], 24), ZoneKit.add(0xffc078, q[1]));
      halo.position.set(-26, 4, -175 + i);
      halo.renderOrder = -8 + i;
      scene.add(halo);
    });
  },

  /* ---- 遠景（峡谷の向こう側）------------------------------------------------
     P3a-r1: 「箱が浮いている」のをやめ、**読める形**を置く。
     近い層 = 崩れた塔・段々の遺跡・巨大な石像の顔・吊り橋、遠い層 = 山の稜線と滝。
     どれも下端を frame の外（y=-40）まで伸ばして地面から生えているようにし、
     色は空より暗いシルエットにして輪郭を立てる（明暗のコントラストを作る）。 */
  _far(scene) {
    const P = ZoneRuins.PAL;
    ZoneRuins.farLayers = [];
    const LEN = 420;
    const B = (w, h, d, x, y, z, rot) => ({ g: ZoneKit.box(w, h, d), p: [x, y, z], r: rot || [0, 0, 0] });

    /* --- 形の部品（原点は「地面の高さ」= y 0 とし、下へ 40 伸ばして根を張る） --- */
    function tower(s2) {                      // 崩れた塔（上が欠けている）
      const o = [];
      o.push(B(9 * s2, 80, 9 * s2, 0, -40 + 26 * s2, 0));
      o.push(B(11 * s2, 3 * s2, 11 * s2, 0, 26 * s2, 0));
      o.push(B(7 * s2, 9 * s2, 7 * s2, 0.6 * s2, 31 * s2, 0, [0, 0.4, 0.06]));
      o.push(B(4 * s2, 6 * s2, 4 * s2, -1.4 * s2, 37 * s2, 0.5 * s2, [0.05, 0.2, -0.12]));
      o.push(B(13 * s2, 2.4 * s2, 13 * s2, 0, -6 * s2, 0));
      return o;
    }
    function terrace(s2) {                    // 段々の遺跡（階段ピラミッド）
      const o = [];
      for (let k = 0; k < 5; k++) {
        o.push(B((30 - k * 5) * s2, 6 * s2, (26 - k * 4.4) * s2, 0, (3 + k * 6) * s2, 0));
      }
      o.push(B(34 * s2, 80, 30 * s2, 0, -40, 0));
      o.push(B(3 * s2, 10 * s2, 3 * s2, 0, 34 * s2, 0));
      return o;
    }
    function statueHead(s2) {                 // 砂に埋もれた巨大な石像の顔
      const o = [];
      o.push(B(16 * s2, 80, 14 * s2, 0, -40 + 5 * s2, 0));      // 埋もれた胴（地面まで）
      o.push(B(14 * s2, 16 * s2, 12 * s2, 0, 13 * s2, 0));       // 顔
      o.push(B(16 * s2, 5 * s2, 13 * s2, 0, 21 * s2, 0));        // 冠
      o.push(B(18 * s2, 3 * s2, 14 * s2, 0, 24 * s2, 0));
      o.push(B(3.4 * s2, 3.4 * s2, 2 * s2, -3.6 * s2, 15 * s2, -6 * s2));   // 目（凹み）
      o.push(B(3.4 * s2, 3.4 * s2, 2 * s2, 3.6 * s2, 15 * s2, -6 * s2));
      o.push(B(3 * s2, 6 * s2, 2.4 * s2, 0, 11 * s2, -6.4 * s2));           // 鼻
      o.push(B(8 * s2, 2 * s2, 2 * s2, 0, 6 * s2, -6.2 * s2));              // 口
      [-1, 1].forEach((sx) => o.push(B(3 * s2, 10 * s2, 6 * s2, sx * 8 * s2, 12 * s2, 0)));  // 髪飾り
      return o;
    }
    function bridge(s2) {                     // 峡谷に架かる吊り橋
      const o = [];
      [-1, 1].forEach((sx) => {
        o.push(B(4 * s2, 80, 4 * s2, sx * 26 * s2, -40 + 18 * s2, 0));      // 主塔
        o.push(B(7 * s2, 3 * s2, 6 * s2, sx * 26 * s2, 19 * s2, 0));
      });
      o.push(B(52 * s2, 1.4 * s2, 5 * s2, 0, 6 * s2, 0));                   // 桁
      for (let k = -5; k <= 5; k++) {                                       // 吊り索
        const u = Math.abs(k) / 5;
        o.push(B(0.7 * s2, (3 + u * u * 12) * s2, 0.7 * s2, k * 4.6 * s2, (7 + (3 + u * u * 12) / 2) * s2, 0));
      }
      return o;
    }
    function ridge(s2, seed) {                // 山の稜線（連なる三角）
      const o = [];
      for (let k = 0; k < 7; k++) {
        const h = (22 + ZoneKit.hash(seed + k, 71) * 30) * s2;
        const w = (26 + ZoneKit.hash(seed + k, 73) * 22) * s2;
        o.push({ g: new THREE.ConeGeometry(w / 2, h, 4), p: [(k - 3) * w * 0.72, h / 2 - 6, ZoneKit.hash(seed + k, 79) * 30],
                 r: [0, 0.6, 0] });
        o.push(B(w, 80, w, (k - 3) * w * 0.72, -40 - 6, 0));
      }
      return o;
    }
    function falls(s2) {                      // 崖と滝
      const o = [];
      o.push(B(30 * s2, 80, 16 * s2, 0, -40 + 14 * s2, 0));
      o.push(B(40 * s2, 6 * s2, 20 * s2, 0, 15 * s2, 0));
      return o;
    }

    /* --- 近い層: 崩れた塔・段々の遺跡・石像の顔・吊り橋を散らす --- */
    const mk = (parts, color, par, name) => {
      /* 遠景は陰影を付けず（basic）・霧もかけない。空（明部）との明暗差だけで
         輪郭を立てる＝距離ごとに色を変えた「層」になる（大気遠近） */
      const mesh = new THREE.Mesh(ZoneKit.merge(parts), ZoneKit.bas(color, { fog: false }));
      mesh.frustumCulled = false;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.userData = { par: par, len: LEN };
      scene.add(grp);
      ZoneRuins.farLayers.push(grp);
      return grp;
    };
    const near = [];
    const put = (parts, x, z, s2) => {
      parts.forEach((q) => {
        near.push({ g: q.g, p: [q.p[0] * 1 + x, q.p[1], q.p[2] + z], r: q.r, s: [s2, s2, s2] });
      });
    };
    /* 位置は決め打ち（同じ距離では必ず同じ景色になる）。左右に振り分ける */
    put(tower(1), -46, -40, 1);
    put(terrace(1), 54, -150, 1);
    put(statueHead(1), -58, -270, 1);
    put(bridge(0.9), 40, -380, 1);
    put(tower(0.7), 62, -500, 1);
    put(terrace(0.8), -52, -610, 1);
    put(statueHead(0.7), 56, -720, 1);
    put(bridge(0.7), -44, -820, 1);
    mk(near, 0x4f4363, 0.42, 'ruinsFar');   // 近い層＝夕日を受けてやや明るい

    /* --- 遠い層: 山の稜線と滝（さらに暗い紫） --- */
    const far = [];
    const putF = (parts, x, z) => parts.forEach((q) => far.push({ g: q.g, p: [q.p[0] + x, q.p[1], q.p[2] + z], r: q.r }));
    putF(ridge(1.1, 3), -120, -120);
    putF(ridge(1.0, 11), 130, -300);
    putF(falls(1.0), -96, -460);
    putF(ridge(1.2, 23), 118, -640);
    putF(ridge(1.0, 31), -128, -790);
    mk(far, 0x2a2340, 0.14, 'mountains');   // 遠い層＝空に抜ける暗いシルエット
  },

  /* ---- 舞う埃の粒子（契約§5）: 加算ブレンドの小さな板を漂わせる ---------- */
  _dust(scene) {
    const P = ZoneRuins.PAL;
    const geo = new THREE.PlaneGeometry(0.075, 0.075);
    ZoneRuins._field({
      name: 'dust', onTrack: true, spacing: 0.72, geo: geo, mat: ZoneKit.add(P.dust, 0.34), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 601), h2 = ZoneKit.hash(slot, 607), h3 = ZoneKit.hash(slot, 613);
        const y = 0.15 + h2 * (CFG.H - 0.3) + Math.sin(t * (0.5 + h3) + slot) * 0.32;
        return { x: (h1 - 0.5) * 6.6, y: y, dz: h3 * 0.7,
                 sx: 0.5 + h3 * 1.6, sy: 0.5 + h1 * 1.5 };
      }
    });
    /* 大きめの綿埃（ゆっくり漂う） */
    /* 舞う落ち葉（小さく・数を絞り・ゆっくり回る） */
    ZoneRuins._field({
      name: 'dustBig', onTrack: true, spacing: 6.5, geo: new THREE.PlaneGeometry(0.13, 0.10),
      mat: ZoneKit.add(0xd8bc84, 0.30), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 631), h2 = ZoneKit.hash(slot, 637);
        return { x: (h1 - 0.5) * 7.2, y: 0.3 + h2 * (CFG.H - 0.6) + Math.sin(t * 0.7 + slot) * 0.5,
                 rx: t * (0.5 + h1), ry: t * (0.7 + h2), rz: t * 0.3 + slot,
                 sx: 0.8 + h2 * 0.6, sy: 0.8 + h1 * 0.6 };
      }
    });
  },

  /* ---- 体感速度の演出（契約§4.1）: 床を流れる光条と風の砂 ---------------- */
  _speedFx(scene) {
    const P = ZoneRuins.PAL, H = CFG.H;
    const streak = new THREE.PlaneGeometry(0.09, 1.0);
    ZoneRuins.speedLines = [];
    [['floor', 0.022, -Math.PI / 2, P.amber], ['ceil', H - 0.022, Math.PI / 2, P.indigo]].forEach((sfc, si) => {
      ZoneRuins.speedLines.push(ZoneRuins._field({
        name: 'speedline', roadMark: true, onTrack: true, spacing: 2.0, geo: streak, mat: ZoneKit.add(sfc[3], 0.18), prop: false, order: 4,
        place(slot, m) {
          if ((slot & 1) !== si) return null;
          const lane = CFG.LANES[Math.floor(ZoneKit.hash(slot, 211) * 3)];
          return { x: lane * CFG.LANE_W + (ZoneKit.hash(slot, 213) - 0.5) * 0.55, y: sfc[1], rx: sfc[2],
                   dz: ZoneKit.hash(slot, 217) * 1.8, sy: 2.4 + ZoneRuins._spd01 * 6.5 };
        }
      }));
    });
    /* 風に流される砂（コリドーの外側） */
    const N = 260;
    const pos = new Float32Array(N * 6);
    ZoneRuins.WIND_CELL = 24;
    for (let i = 0; i < N; i++) {
      const side = (i % 2) ? 1 : -1;
      const x = side * (2.3 + ZoneKit.hash(i, 301) * 4.6);
      const y = -1.2 + ZoneKit.hash(i, 303) * 7.2;
      const z = -ZoneKit.hash(i, 307) * ZoneRuins.WIND_CELL * 4 + 6;
      const len = 1.6 + ZoneKit.hash(i, 311) * 2.2;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z - len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ZoneRuins.windMat = new THREE.LineBasicMaterial({
      color: 0xf0d8a8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const m = new THREE.LineSegments(g, ZoneRuins.windMat);
    m.frustumCulled = false;
    ZoneRuins.wind = new THREE.Group();
    ZoneRuins.wind.add(m);
    scene.add(ZoneRuins.wind);
  },

  /* ==========================================================================
     小物（20種以上・前方60mに常時40個以上 / 契約§3 ジオラマ調の規範）
     ========================================================================== */
  _props(scene) {
    const P = ZoneRuins.PAL;
    const HW = CFG.HALF_W;       // 1.8
    const H = CFG.H;             // 4.0
    const XW = HW + 0.16;
    const hash = ZoneKit.hash;
    const isWall = ZoneRuins.isWall;
    const F = ZoneRuins._field;

    /* --- 1. 石壁パネル（レリーフの凹凸つき / 契約§5「壁のレリーフ」） ------ */
    {
      const fp = [
        { g: ZoneKit.box(0.55, H + 5.0, 7.9), p: [0, 0, 0] },                  // 壁本体
        { g: ZoneKit.box(0.26, 0.34, 7.9), p: [-0.30, H * 0.5 - 0.5, 0] },     // 蛇腹（上）
        { g: ZoneKit.box(0.26, 0.34, 7.9), p: [-0.30, -H * 0.5 + 0.5, 0] },    // 幅木
        { g: ZoneKit.box(0.20, 0.16, 7.9), p: [-0.31, 0, 0] }                  // 中帯
      ];
      /* 石の積み目（横の目地）＝のっぺりさせない */
      for (let i = -2; i <= 2; i++) fp.push({ g: ZoneKit.box(0.06, 0.06, 7.9), p: [-0.30, i * 0.84, 0] });
      /* レリーフ（人物・渦巻き・楔形の彫り）を凹凸で作る */
      for (let i = 0; i < 2; i++) {
        const z = -2.2 + i * 4.0;
        fp.push({ g: ZoneKit.box(0.10, 0.62, 0.30), p: [-0.33, 0.55, z] });        // 胴
        fp.push({ g: ZoneKit.box(0.09, 0.17, 0.17), p: [-0.34, 0.97, z] });        // 頭
        fp.push({ g: ZoneKit.box(0.09, 0.10, 0.44), p: [-0.34, 0.72, z + 0.1] });  // 腕
        fp.push({ g: ZoneKit.box(0.08, 0.30, 0.10), p: [-0.33, 0.14, z - 0.08] }); // 脚
        fp.push({ g: ZoneKit.box(0.07, 0.26, 0.26), p: [-0.33, -0.75, z], r: [0.8, 0, 0] });  // 渦巻き
      }
      /* 崩れ（欠けた石） */
      [[-1.7, -2.6], [1.4, 1.1]].forEach((q) => {
        fp.push({ g: ZoneKit.box(0.22, 0.44, 0.50), p: [-0.18, q[0], q[1]], r: [0.2, 0.3, 0.15] });
      });
      const g = ZoneKit.merge(fp);
      F({
        name: 'wall', spacing: 4, geo: g, mat: ZoneKit.lam(P.wall),
        place(slot, m) {
          if (!isWall(m + 3.9)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 1.15), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 2. 柱（溝彫り＋柱頭。壁区間の内側に並ぶ） ------------------------- */
    {
      const parts = [
        { g: ZoneKit.cyl(0.24, H - 0.7, 10), p: [0, 0, 0] },
        { g: ZoneKit.box(0.62, 0.22, 0.62), p: [0, H * 0.5 - 0.46, 0] },       // 柱頭
        { g: ZoneKit.box(0.52, 0.14, 0.52), p: [0, H * 0.5 - 0.62, 0] },
        { g: ZoneKit.box(0.68, 0.24, 0.68), p: [0, -H * 0.5 + 0.44, 0] },      // 柱礎
        { g: ZoneKit.box(0.56, 0.14, 0.56), p: [0, -H * 0.5 + 0.62, 0] }
      ];
      for (let i = 0; i < 4; i++) {                                            // 溝彫り
        const a = i / 4 * Math.PI * 2;
        parts.push({ g: ZoneKit.box(0.06, H - 1.2, 0.06), p: [Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'column', spacing: 6.5, geo: g, mat: ZoneKit.lam(P.stone),
        place(slot, m) {
          if (!isWall(m + 2)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.14), y: H * 0.5, sy: 0.96 + hash(slot, 33) * 0.08 };
        }
      });
    }

    /* --- 3. 松明（受け金具＋柄）＋ 4. 炎 ＋ 5. 壁のにじみ ------------------ */
    {
      const body = ZoneKit.merge([
        { g: ZoneKit.box(0.10, 0.10, 0.34), p: [0, 0, -0.17] },
        { g: ZoneKit.cyl(0.055, 0.46, 6), p: [0, 0.16, -0.32], r: [0.45, 0, 0] },
        { g: ZoneKit.cyl(0.11, 0.13, 8), p: [0, 0.34, -0.40] }
      ]);
      const placeT = (slot, m) => {
        if (!isWall(m + 1)) return null;
        if (hash(slot, 83) > 0.78) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        const y = ceil ? (H - 0.95 - hash(slot, 89) * 0.7) : (0.95 + hash(slot, 89) * 0.7);
        return { x: side * (XW + 0.12), y: y, ry: side > 0 ? 0 : Math.PI, rz: ceil ? Math.PI : 0 };
      };
      F({ name: 'torch', spacing: 5.5, geo: body, mat: ZoneKit.lam(P.stoneDark), place: placeT });
      const flame = ZoneKit.merge([
        { g: ZoneKit.cone(0.22, 0.76, 10), p: [0, 0.80, -0.40] },
        { g: ZoneKit.cone(0.13, 0.40, 9), p: [0, 0.60, -0.40] }
      ]);
      F({
        name: 'torchFlame', spacing: 5.5, geo: flame, mat: ZoneKit.bas(P.flame), prop: false,
        place(slot, m, t) {
          const o = placeT(slot, m);
          if (!o) return null;
          const fl = 0.82 + 0.28 * Math.sin(t * 9.1 + slot * 2.3) + 0.12 * Math.sin(t * 23 + slot);
          o.sy = fl; o.sx = 0.9 + 0.12 * Math.sin(t * 13 + slot);
          return o;
        }
      });
      F({
        name: 'torchHot', spacing: 5.5, geo: ZoneKit.merge([{ g: ZoneKit.cone(0.12, 0.40, 9), p: [0, 0.66, -0.40] }]),
        mat: ZoneKit.bas(P.fireHot), prop: false,
        place(slot, m, t) {
          const o = placeT(slot, m);
          if (!o) return null;
          o.sy = 0.9 + 0.3 * Math.sin(t * 11 + slot);
          return o;
        }
      });
      /* 炎のまわりの光（明部をつくる。加算ブレンドの板を炎に重ねる） */
      F({
        name: 'torchHalo', spacing: 5.5, geo: new THREE.CircleGeometry(0.52, 14),
        mat: ZoneKit.add(0xffb060, 0.42), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeT(slot, m);
          if (!o) return null;
          const fl = 0.9 + 0.16 * Math.sin(t * 8.3 + slot * 1.9);
          return { x: o.x - (o.x > 0 ? 0.34 : -0.34), y: o.y + (o.rz ? -0.62 : 0.62) * 1,
                   ry: o.x > 0 ? -Math.PI / 2 : Math.PI / 2, sx: fl, sy: fl };
        }
      });
      /* 壁と床に落ちる火のにじみ */
      const blob = new THREE.CircleGeometry(0.62, 14);
      F({
        name: 'torchGlow', spacing: 5.5, geo: blob, mat: ZoneKit.add(P.fire, 0.18), prop: false, order: 3,
        place(slot, m, t) {
          const o = placeT(slot, m);
          if (!o) return null;
          const side = (o.x > 0) ? 1 : -1;
          const fl = 0.85 + 0.15 * Math.sin(t * 7.7 + slot);
          return { x: side * (XW + 0.06), y: o.y, ry: side > 0 ? Math.PI / 2 : -Math.PI / 2,
                   sx: fl, sy: fl };
        }
      });
      F({
        name: 'torchFloor', spacing: 5.5, geo: new THREE.CircleGeometry(0.95, 14),
        mat: ZoneKit.add(P.fire, 0.16), prop: false, order: 3,
        place(slot, m) {
          const o = placeT(slot, m);
          if (!o) return null;
          const side = (o.x > 0) ? 1 : -1;
          const ceil = o.y > H * 0.5;
          return { x: side * 1.3, y: ceil ? H - 0.02 : 0.02, rx: ceil ? Math.PI / 2 : -Math.PI / 2 };
        }
      });
    }

    /* --- 6. 蔦（壁から垂れる。風で揺れる） -------------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        parts.push({ g: ZoneKit.box(0.04, 0.9 + i * 0.16, 0.05), p: [0, -(0.45 + i * 0.08), -0.2 + i * 0.1] });
        parts.push({ g: ZoneKit.box(0.10, 0.10, 0.03), p: [0, -(0.5 + i * 0.3), -0.2 + i * 0.1] });
        parts.push({ g: ZoneKit.box(0.09, 0.09, 0.03), p: [0.02, -(0.9 + i * 0.22), -0.18 + i * 0.1] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'vine', spacing: 5, geo: g, mat: ZoneKit.lam(P.vine),
        place(slot, m, t) {
          if (!isWall(m + 2.5)) return null;
          if (hash(slot, 141) > 0.82) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (XW + 0.24), y: ceil ? 0.05 : H - 0.05,
                   rz: (ceil ? Math.PI : 0) + Math.sin(t * 1.2 + slot) * 0.05,
                   ry: side > 0 ? 0 : Math.PI, sy: 0.8 + hash(slot, 143) * 0.7 };
        }
      });
      /* 苔（壁の付け根） */
      F({
        name: 'moss', spacing: 3.2, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.16, 0.10, 0.5), p: [0, 0, 0] },
          { g: ZoneKit.box(0.12, 0.16, 0.3), p: [-0.02, 0.05, 0.15] }
        ]), mat: ZoneKit.lam(P.moss),
        place(slot, m) {
          if (hash(slot, 151) > 0.72) return null;
          if (!isWall(m) && hash(slot, 152) > 0.4) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.14), y: ceil ? H - 0.06 : 0.06, dz: hash(slot, 153) * 2 };
        }
      });
    }

    /* --- 7. 彫像（壁龕に立つ守護像。上半身だけ残ったものも混ぜる） --------- */
    {
      const mk = (broken) => {
        const parts = [
          { g: ZoneKit.box(0.54, 0.22, 0.54), p: [0, -0.86, 0] },                 // 台座
          { g: ZoneKit.box(0.44, 0.10, 0.44), p: [0, -0.72, 0] },
          { g: ZoneKit.cyl(0.15, 0.72, 8), p: [0, -0.32, 0] },                    // 脚
          { g: ZoneKit.box(0.34, 0.52, 0.24), p: [0, 0.22, 0] }                   // 胴
        ];
        if (!broken) {
          parts.push({ g: ZoneKit.box(0.20, 0.22, 0.20), p: [0, 0.60, 0] });      // 頭
          parts.push({ g: ZoneKit.box(0.30, 0.10, 0.26), p: [0, 0.70, 0.02] });   // 冠
          parts.push({ g: ZoneKit.box(0.10, 0.46, 0.10), p: [0.22, 0.24, -0.06], r: [0.3, 0, -0.2] });
          parts.push({ g: ZoneKit.box(0.10, 0.46, 0.10), p: [-0.22, 0.24, -0.06], r: [0.3, 0, 0.2] });
        } else {
          parts.push({ g: ZoneKit.box(0.30, 0.12, 0.22), p: [0, 0.50, 0], r: [0.1, 0, 0.06] });
        }
        return ZoneKit.merge(parts);
      };
      [[false, 0], [true, 1]].forEach((v) => {
        F({
          name: 'statue' + v[1], spacing: 13, geo: mk(v[0]), mat: ZoneKit.lam(P.stoneLit),
          place(slot, m) {
            if (!isWall(m + 5)) return null;
            if ((slot % 2) !== v[1]) return null;
            const side = (hash(slot, 161) > 0.5) ? 1 : -1;
            const ceil = ((slot >> 2) % 2) === 1;
            return { x: side * (XW + 0.58), y: ceil ? H - 0.95 : 0.95, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2,
                     rz: ceil ? Math.PI : 0, dz: hash(slot, 163) * 3 };
          }
        });
      });
    }

    /* --- 8. 祭壇（火皿つき）＋ 9. その炎 ---------------------------------- */
    {
      const alt = ZoneKit.merge([
        { g: ZoneKit.box(0.76, 0.16, 0.66), p: [0, 0.08, 0] },
        { g: ZoneKit.box(0.58, 0.42, 0.50), p: [0, 0.36, 0] },
        { g: ZoneKit.box(0.80, 0.14, 0.70), p: [0, 0.62, 0] },
        { g: ZoneKit.cyl(0.24, 0.16, 10), p: [0, 0.74, 0] }
      ]);
      const placeA = (slot, m) => {
        if (!isWall(m + 6)) return null;
        if (hash(slot, 171) > 0.5) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.46), y: ceil ? H : 0, rz: ceil ? Math.PI : 0, dz: hash(slot, 173) * 3 };
      };
      F({ name: 'altar', spacing: 17, geo: alt, mat: ZoneKit.lam(P.stoneLit), place: placeA });
      F({
        name: 'altarFire', spacing: 17, geo: ZoneKit.merge([
          { g: ZoneKit.cone(0.20, 0.52, 7), p: [0, 1.04, 0] },
          { g: ZoneKit.cone(0.12, 0.30, 6), p: [0, 0.92, 0] }
        ]), mat: ZoneKit.bas(P.flame), prop: false,
        place(slot, m, t) {
          const o = placeA(slot, m);
          if (!o) return null;
          o.sy = 0.8 + 0.34 * Math.sin(t * 6.3 + slot * 1.7);
          return o;
        }
      });
      F({
        name: 'altarGlow', spacing: 17, geo: new THREE.PlaneGeometry(2.6, 2.6),
        mat: ZoneKit.add(P.fire, 0.20), prop: false, order: 3,
        place(slot, m) {
          const o = placeA(slot, m);
          if (!o) return null;
          const ceil = o.rz !== 0;
          return { x: o.x * 0.7, y: ceil ? H - 0.02 : 0.02, rx: ceil ? Math.PI / 2 : -Math.PI / 2, dz: o.dz };
        }
      });
    }

    /* --- 9b. 火鉢（棚の上の大きな火皿。明部と暖色の主役） ------------------ */
    {
      const bowl = ZoneKit.merge([
        { g: ZoneKit.cyl(0.30, 0.10, 10), p: [0, 0.62, 0] },
        { g: ZoneKit.cyl(0.22, 0.30, 10), p: [0, 0.44, 0] },
        { g: ZoneKit.box(0.10, 0.52, 0.10), p: [0, 0.26, 0] },
        { g: ZoneKit.box(0.44, 0.10, 0.44), p: [0, 0.05, 0] }
      ]);
      const placeB = (slot, m) => {
        if (!isWall(m + 5)) return null;
        if (hash(slot, 401) > 0.62) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.78), y: ceil ? H : 0, rz: ceil ? Math.PI : 0, dz: hash(slot, 403) * 3 };
      };
      F({ name: 'brazier', spacing: 9, geo: bowl, mat: ZoneKit.lam(P.stoneDark), place: placeB });
      F({
        name: 'brazierFire', spacing: 9, geo: ZoneKit.merge([
          { g: ZoneKit.cone(0.33, 0.92, 10), p: [0, 1.12, 0] },
          { g: ZoneKit.cone(0.20, 0.46, 7), p: [0, 0.90, 0] }
        ]), mat: ZoneKit.bas(P.flame), prop: false,
        place(slot, m, t) {
          const o = placeB(slot, m);
          if (!o) return null;
          o.sy = 0.82 + 0.3 * Math.sin(t * 7.1 + slot * 2.3);
          o.sx = 0.92 + 0.12 * Math.sin(t * 12 + slot);
          return o;
        }
      });
      F({
        name: 'brazierHot', spacing: 9, geo: ZoneKit.merge([
          { g: ZoneKit.cone(0.18, 0.46, 6), p: [0, 0.94, 0] }
        ]), mat: ZoneKit.bas(P.fireHot), prop: false,
        place(slot, m, t) {
          const o = placeB(slot, m);
          if (!o) return null;
          o.sy = 0.9 + 0.25 * Math.sin(t * 9 + slot);
          return o;
        }
      });
      F({
        name: 'brazierGlow', spacing: 9, geo: new THREE.CircleGeometry(0.78, 14),
        mat: ZoneKit.add(0xffb060, 0.40), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeB(slot, m);
          if (!o) return null;
          const side = (o.x > 0) ? 1 : -1;
          const fl = 0.9 + 0.14 * Math.sin(t * 6.7 + slot);
          return { x: o.x - side * 0.2, y: (o.rz ? H - 0.95 : 0.95), dz: o.dz,
                   ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, sx: fl, sy: fl };
        }
      });
    }

    /* --- 9c. 垂れ幕（深紅と青緑の布。色数を足す / P3a-r1） ----------------- */
    {
      const cloth = ZoneKit.merge([
        { g: ZoneKit.box(0.05, 1.5, 0.66), p: [0, -0.75, 0] },
        { g: ZoneKit.box(0.09, 0.12, 0.76), p: [0, 0.02, 0] },
        { g: ZoneKit.box(0.06, 0.26, 0.30), p: [0, -1.62, 0], r: [0, 0, 0] }
      ]);
      [[P.cloth, 0, 431], [P.cloth2, 1, 433]].forEach((cc) => {
        F({
          name: 'banner', spacing: 9, geo: cloth, mat: ZoneKit.lam(cc[0]),
          place(slot, m, t) {
            if (!isWall(m + 3)) return null;
            if ((slot % 2) !== cc[1]) return null;
            if (hash(slot, cc[2]) > 0.62) return null;
            const side = (hash(slot, cc[2] + 1) > 0.5) ? 1 : -1;
            const ceil = ((slot >> 1) % 2) === 1;
            return { x: side * (XW + 0.62), y: ceil ? 0.2 : H - 0.2,
                     rz: (ceil ? Math.PI : 0) + Math.sin(t * 0.9 + slot) * 0.035,
                     sy: 0.8 + hash(slot, cc[2] + 2) * 0.5 };
          }
        });
      });
    }

    /* --- 10. 壺（割れたものも混ぜる）-------------------------------------- */
    {
      const pot = ZoneKit.merge([
        { g: ZoneKit.cyl(0.17, 0.30, 9), p: [0, 0.16, 0] },
        { g: ZoneKit.cyl(0.11, 0.12, 9), p: [0, 0.35, 0] },
        { g: ZoneKit.cyl(0.14, 0.05, 9), p: [0, 0.42, 0] },
        { g: ZoneKit.box(0.34, 0.05, 0.05), p: [0, 0.28, 0] }
      ]);
      F({
        name: 'pot', spacing: 4.6, geo: pot, mat: ZoneKit.lam(0xa07a4e),
        place(slot, m) {
          if (!isWall(m + 2)) return null;            // 棚（ledge）の上にだけ置く
          if (hash(slot, 181) > 0.55) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.34 + hash(slot, 183) * 0.5), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 185) * 3, dz: hash(slot, 187) * 3,
                   sy: 0.7 + hash(slot, 189) * 0.8 };
        }
      });
      /* 割れた壺のかけら */
      F({
        name: 'shard', spacing: 3.8, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.16, 0.04, 0.12), p: [0, 0.02, 0], r: [0, 0.4, 0.1] },
          { g: ZoneKit.box(0.11, 0.04, 0.09), p: [0.14, 0.02, 0.1], r: [0, 1.1, -0.2] }
        ]), mat: ZoneKit.lam(0x96703f),
        place(slot, m) {
          if (!isWall(m + 2)) return null;
          if (hash(slot, 191) > 0.6) return null;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: ((slot % 2) ? 1 : -1) * (HW + 0.2 + hash(slot, 193) * 1.1), y: ceil ? H - 0.02 : 0.02,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 197) * 3, dz: hash(slot, 199) * 3 };
        }
      });
    }

    /* --- 11. 宝箱（金の縁と、隙間からこぼれる光） ------------------------- */
    {
      const chest = ZoneKit.merge([
        { g: ZoneKit.box(0.52, 0.30, 0.38), p: [0, 0.15, 0] },
        { g: ZoneKit.box(0.55, 0.10, 0.41), p: [0, 0.34, 0] },
        { g: ZoneKit.box(0.09, 0.34, 0.41), p: [-0.20, 0.17, 0] },
        { g: ZoneKit.box(0.09, 0.34, 0.41), p: [0.20, 0.17, 0] },
        { g: ZoneKit.box(0.12, 0.12, 0.06), p: [0, 0.20, -0.20] }
      ]);
      const placeC = (slot, m) => {
        if (!isWall(m + 4)) return null;
        if (hash(slot, 201) > 0.42) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.40), y: ceil ? H : 0, rz: ceil ? Math.PI : 0,
                 ry: (hash(slot, 203) - 0.5) * 0.8, dz: hash(slot, 205) * 3 };
      };
      F({ name: 'chest', spacing: 21, geo: chest, mat: ZoneKit.lam(0x7a5a33), place: placeC });
      F({
        name: 'chestGold', spacing: 21, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.57, 0.04, 0.43), p: [0, 0.29, 0] },
          { g: ZoneKit.box(0.10, 0.10, 0.04), p: [0, 0.20, -0.21] }
        ]), mat: ZoneKit.bas(P.gold), prop: false, place: placeC
      });
    }

    /* --- 12. 崩れた石段（コリドーの外へ降りる階段） ----------------------- */
    {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        parts.push({ g: ZoneKit.box(0.9 - i * 0.05, 0.16, 0.5), p: [i * 0.28, -i * 0.17, 0] });
      }
      parts.push({ g: ZoneKit.box(0.4, 0.2, 0.4), p: [1.5, -0.9, 0.2], r: [0.2, 0.4, 0.1] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'steps', spacing: 19, geo: g, mat: ZoneKit.lam(P.stone),
        place(slot, m) {
          if (!isWall(m + 3)) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          /* 天井側は rz=180° で上下が返るので、ry も返して「外向き」を保つ
             （返さないと階段がコリドーの中へ張り出す＝走行空間を侵す） */
          return { x: side * (HW + 0.34), y: ceil ? H - 0.05 : 0.05,
                   ry: ((side > 0) !== ceil) ? 0 : Math.PI,
                   rz: ceil ? Math.PI : 0, dz: hash(slot, 211) * 4 };
        }
      });
    }

    /* --- 13. 瓦礫（崩れた石の山） ----------------------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.30, 0.22, 0.26), p: [0, 0.11, 0], r: [0.1, 0.4, 0.2] },
        { g: ZoneKit.box(0.22, 0.18, 0.20), p: [0.22, 0.09, 0.12], r: [0.3, 0.1, 0.4] },
        { g: ZoneKit.box(0.17, 0.14, 0.16), p: [-0.18, 0.07, -0.1], r: [0.2, 0.9, 0.1] },
        { g: ZoneKit.box(0.12, 0.10, 0.11), p: [0.05, 0.26, -0.05], r: [0.4, 0.2, 0.3] }
      ]);
      F({
        name: 'rubble', spacing: 2.8, geo: g, mat: ZoneKit.lam(P.stoneDark),
        place(slot, m) {
          if (!isWall(m + 1)) return null;
          if (hash(slot, 221) > 0.62) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.24 + hash(slot, 223) * 0.9), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 227) * 3,
                   sx: 0.7 + hash(slot, 229) * 1.1, sy: 0.7 + hash(slot, 231) * 1.0, sz: 0.8 + hash(slot, 233) * 0.8 };
        }
      });
    }

    /* --- 14. 地下水路（縁石の溝＋水面の輝き / 契約§5） -------------------- */
    {
      const L = 6.0;
      const ch = ZoneKit.merge([
        { g: ZoneKit.box(0.16, 0.22, L), p: [-0.28, 0.08, 0] },
        { g: ZoneKit.box(0.16, 0.22, L), p: [0.28, 0.08, 0] },
        { g: ZoneKit.box(0.44, 0.06, L), p: [0, -0.02, 0] }
      ]);
      const placeW = (slot, m) => {
        if (!isWall(m + 3)) return null;
        const side = (slot % 2) ? 1 : -1;
        return { x: side * (HW + 0.44), y: 0.0, dz: 0 };
      };
      F({ name: 'channel', spacing: 6, geo: ch, mat: ZoneKit.lam(P.stoneDark), place: placeW });
      F({
        name: 'water', spacing: 6, geo: new THREE.PlaneGeometry(0.5, L),
        mat: new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.06, metalness: 0.5 }),
        prop: false, order: 1,
        place(slot, m, t) {
          const o = placeW(slot, m);
          if (!o) return null;
          return { x: o.x, y: 0.10 + Math.sin(t * 2 + slot) * 0.005, rx: -Math.PI / 2 };
        }
      });
      F({
        name: 'waterGlow', spacing: 6, geo: new THREE.PlaneGeometry(0.42, L * 0.9),
        mat: ZoneKit.add(0x9fe6d0, 0.20), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeW(slot, m);
          if (!o) return null;
          return { x: o.x, y: 0.115, rx: -Math.PI / 2, sy: 0.7 + 0.3 * Math.sin(t * 1.7 + slot) };
        }
      });
    }

    /* --- 14b. 地割れの火（棚の外側を走る裂け目。明部を連続させる / P3a-r1） - */
    {
      const L = 6.0;
      const lip = ZoneKit.merge([
        { g: ZoneKit.box(0.30, 0.16, L), p: [-0.22, 0.06, 0], r: [0, 0, 0.12] },
        { g: ZoneKit.box(0.30, 0.16, L), p: [0.22, 0.06, 0], r: [0, 0, -0.12] }
      ]);
      const placeF = (slot, m) => {
        if (!isWall(m + 4)) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.92), y: ceil ? H : 0, rz: ceil ? Math.PI : 0 };
      };
      F({ name: 'fissure', spacing: 6, geo: lip, mat: ZoneKit.lam(P.stoneDark), place: placeF });
      F({
        name: 'fissureFire', spacing: 6,
        geo: ZoneKit.merge([
          { g: ZoneKit.box(0.44, 0.05, L * 0.92), p: [0, 0.03, 0] },
          { g: ZoneKit.box(0.15, 0.30, L * 0.92), p: [-0.16, 0.18, 0], r: [0, 0, 0.14] },
          { g: ZoneKit.box(0.15, 0.30, L * 0.92), p: [0.16, 0.18, 0], r: [0, 0, -0.14] }
        ]),
        mat: ZoneKit.bas(P.fireHot), prop: false, order: 3,
        place(slot, m, t) {
          const o = placeF(slot, m);
          if (!o) return null;
          return { x: o.x, y: o.rz ? H : 0, rz: o.rz, sy: 0.9 + 0.2 * Math.sin(t * 3 + slot) };
        }
      });
      F({
        name: 'fissureGlow', spacing: 6, geo: new THREE.PlaneGeometry(2.6, L),
        mat: ZoneKit.add(0xff9a48, 0.86), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeF(slot, m);
          if (!o) return null;
          const fl = 0.9 + 0.12 * Math.sin(t * 4.1 + slot);
          return { x: o.x, y: o.rz ? H - 0.03 : 0.03, rx: o.rz ? Math.PI / 2 : -Math.PI / 2, sx: fl };
        }
      });
    }

    /* --- 15. 天窓から落ちる光の柱（黒潰れ防止の主役 / 契約§5） ------------ */
    {
      const beam = ZoneKit.merge([
        { g: ZoneKit.box(1.5, CFG.H + 1.2, 1.5), p: [0, 0, 0], s: [1, 1, 1] }
      ]);
      F({
        name: 'skylight', spacing: 13, geo: beam, mat: ZoneKit.add(0xffd9a0, 0.20), prop: false, order: 2,
        place(slot, m, t) {
          if (!isWall(m + 4)) return null;
          const side = (hash(slot, 241) > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.62 + hash(slot, 243) * 0.36), y: CFG.H / 2,
                   rz: 0.12 * side, sx: 0.8 + 0.1 * Math.sin(t * 0.9 + slot) };
        }
      });
      /* 光が落ちた所の明るい溜まり（床と棚を白く焼く＝明部） */
      F({
        name: 'skypool', spacing: 13, geo: new THREE.CircleGeometry(1.5, 18),
        mat: ZoneKit.add(0xffdca8, 0.52), prop: false, order: 4,
        place(slot, m) {
          if (!isWall(m + 4)) return null;
          const side = (hash(slot, 241) > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.62 + hash(slot, 243) * 0.36), y: 0.03, rx: -Math.PI / 2 };
        }
      });
      /* 天窓そのもの（天井の抜け） */
      F({
        name: 'skyhole', spacing: 13, geo: new THREE.PlaneGeometry(1.5, 2.4),
        mat: ZoneKit.add(0xffe8c0, 0.70), prop: false, order: 2,
        place(slot, m) {
          if (!isWall(m + 4)) return null;
          const side = (hash(slot, 241) > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.62 + hash(slot, 243) * 0.36), y: CFG.H - 0.03, rx: Math.PI / 2 };
        }
      });
    }

    /* --- 16. 床の紋様（石畳に彫られた渦巻き）------------------------------ */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.62, 0.03, 0.06), p: [0, 0, -0.28] },
        { g: ZoneKit.box(0.62, 0.03, 0.06), p: [0, 0, 0.28] },
        { g: ZoneKit.box(0.06, 0.03, 0.62), p: [-0.28, 0, 0] },
        { g: ZoneKit.box(0.06, 0.03, 0.62), p: [0.28, 0, 0] },
        { g: ZoneKit.box(0.26, 0.03, 0.26), p: [0, 0, 0] }
      ]);
      F({
        name: 'carve', onTrack: true, spacing: 6.4, geo: g, mat: ZoneKit.lam(P.stoneDark),
        place(slot, m) {
          if (hash(slot, 251) > 0.72) return null;
          const ceil = (slot % 2) === 1;
          const lane = CFG.LANES[Math.floor(hash(slot, 253) * 3)] * CFG.LANE_W;
          return { x: lane, y: ceil ? H - 0.012 : 0.012, rx: ceil ? Math.PI : 0, dz: hash(slot, 257) * 4 };
        }
      });
      /* 床のひび */
      F({
        name: 'crack', onTrack: true, spacing: 3.1, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.05, 0.02, 1.1), p: [0, 0, 0], r: [0, 0.2, 0] },
          { g: ZoneKit.box(0.04, 0.02, 0.6), p: [0.14, 0, 0.4], r: [0, -0.5, 0] }
        ]), mat: ZoneKit.lam(0x5b4a2e), prop: false,
        place(slot, m) {
          if (hash(slot, 261) > 0.6) return null;
          const ceil = (slot % 2) === 1;
          return { x: (hash(slot, 263) - 0.5) * 3.2, y: ceil ? H - 0.01 : 0.01,
                   rx: ceil ? Math.PI : 0, ry: (hash(slot, 267) - 0.5) * 0.7 };
        }
      });
    }

    /* --- 17b. 外側の石床（列柱の外の通路）。小物はこの上に載る ------------ */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(1.5, 0.16, 4.0), p: [0, -0.08, 0] },
        { g: ZoneKit.box(0.22, 0.30, 4.0), p: [0.70, 0.07, 0] },
        { g: ZoneKit.box(1.5, 0.05, 0.10), p: [0, 0.01, -1.9] },
        { g: ZoneKit.box(1.5, 0.05, 0.10), p: [0, 0.01, 1.9] }
      ]);
      ZoneRuins._field({
        name: 'ledge', spacing: 4, geo: g, mat: ZoneKit.lam(P.wallDark),
        place(slot, m) {
          if (!isWall(m + 2)) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.82), y: ceil ? H : 0, ry: side > 0 ? 0 : Math.PI, rz: ceil ? Math.PI : 0 };
        }
      });
    }

    /* --- 18. アーチ（開放区間で床と天井をつなぐ架構） --------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.42, H + 1.4, 0.46), p: [0, 0, 0] },
        { g: ZoneKit.box(0.62, 0.30, 0.62), p: [0, H * 0.5 + 0.5, 0] },
        { g: ZoneKit.box(0.62, 0.30, 0.62), p: [0, -H * 0.5 - 0.5, 0] },
        { g: ZoneKit.box(1.0, 0.26, 0.34), p: [-0.45, H * 0.38, 0], r: [0, 0, -0.62] },
        { g: ZoneKit.box(1.0, 0.26, 0.34), p: [-0.45, -H * 0.38, 0], r: [0, 0, 0.62] }
      ]);
      F({
        name: 'arch', spacing: 16, geo: g, mat: ZoneKit.lam(P.stoneLit),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (HW + 0.66), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 19. 石橋の欄干（開放区間の縁） ----------------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.20, 0.44, 0.20), p: [0, 0, -1.2] },
        { g: ZoneKit.box(0.20, 0.44, 0.20), p: [0, 0, 1.2] },
        { g: ZoneKit.box(0.24, 0.12, 2.7), p: [0, 0.26, 0] },
        { g: ZoneKit.box(0.14, 0.24, 0.14), p: [0, 0.02, -0.4] },
        { g: ZoneKit.box(0.14, 0.24, 0.14), p: [0, 0.02, 0.4] }
      ]);
      F({
        name: 'rail', spacing: 2.8, geo: g, mat: ZoneKit.lam(P.stone),
        place(slot, m) {
          if (isWall(m)) return null;
          if (hash(slot, 271) > 0.86) return null;      // ところどころ崩れている
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.24), y: ceil ? H - 0.22 : 0.22, rz: ceil ? Math.PI : 0 };
        }
      });
    }

    /* --- 20. 峡谷の岩（開放区間の外・下） --------------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(1.0, 1.4, 1.0), p: [0, 0, 0], r: [0.1, 0.3, 0.12] },
        { g: ZoneKit.box(0.7, 0.9, 0.8), p: [0.6, -0.4, 0.3], r: [0.2, 0.9, 0.1] },
        { g: ZoneKit.box(0.5, 0.6, 0.5), p: [-0.5, 0.6, -0.2], r: [0.3, 0.2, 0.4] }
      ]);
      F({
        name: 'canyon', spacing: 5.5, geo: g, mat: ZoneKit.lam(0x7d6a4a),
        place(slot, m) {
          if (isWall(m + 1)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (HW + 2.8 + hash(slot, 281) * 3.2), y: -3.4 - hash(slot, 283) * 3.6,
                   ry: hash(slot, 287) * 3,
                   sx: 1 + hash(slot, 289) * 2.2, sy: 1 + hash(slot, 291) * 2.6, sz: 1 + hash(slot, 293) * 2 };
        }
      });
      /* 峡谷の底の靄（中間調を作る） */
      F({
        name: 'haze', spacing: 12, geo: new THREE.PlaneGeometry(22, 12),
        mat: ZoneKit.add(0xc9a878, 0.055), prop: false, order: 1,
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * 7, y: -5.5, rx: -Math.PI / 2 };
        }
      });
    }

    /* --- 20b. 石橋の橋脚（開放区間＝峡谷に架かる橋だと一目で分かる形） ----- */
    {
      const parts = [
        { g: ZoneKit.box(4.4, 0.34, 1.1), p: [0, -0.22, 0] },                    // 桁
        { g: ZoneKit.box(4.0, 0.22, 0.8), p: [0, -0.46, 0] },
        { g: ZoneKit.box(0.7, 2.6, 0.8), p: [-1.5, -1.8, 0], r: [0, 0, 0.12] },  // 橋脚
        { g: ZoneKit.box(0.7, 2.6, 0.8), p: [1.5, -1.8, 0], r: [0, 0, -0.12] },
        { g: ZoneKit.box(2.6, 0.5, 0.6), p: [0, -0.95, 0] },                     // アーチの要
        { g: ZoneKit.box(1.4, 0.34, 0.5), p: [0, -1.3, 0] }
      ];
      const g = ZoneKit.merge(parts);
      F({
        name: 'pier', spacing: 8, geo: g, mat: ZoneKit.lam(P.stoneDark),
        place(slot, m) {
          if (isWall(m + 2)) return null;
          const ceil = (slot % 2) === 1;
          return { x: 0, y: ceil ? H : 0, rz: ceil ? Math.PI : 0 };
        }
      });
    }

    /* --- 20c. 峡谷の崖（開放区間の左右・ずっと下まで続く岩壁） ------------- */
    {
      /* 原点＝岩壁の**上端**にしておく（どう拡大しても走行空間より下にしか伸びない） */
      const g = ZoneKit.merge([
        { g: ZoneKit.box(5, 16, 9), p: [0, -8, 0] },
        { g: ZoneKit.box(3.4, 10, 6), p: [-1.6, -4, 2], r: [0, 0.3, 0.06] },
        { g: ZoneKit.box(2.4, 7, 5), p: [1.2, -11, -2.5], r: [0, -0.2, 0.1] }
      ]);
      F({
        name: 'cliff', spacing: 13, geo: g, mat: ZoneKit.lam(0x6c5b40),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (8 + hash(slot, 351) * 5), y: -2.4 - hash(slot, 353) * 3,
                   ry: hash(slot, 357) * 0.8,
                   sx: 1 + hash(slot, 359), sy: 1 + hash(slot, 361) * 1.4, sz: 1 + hash(slot, 363) };
        }
      });
    }

    /* --- 21. 草の房（開放区間の縁） --------------------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        parts.push({ g: ZoneKit.box(0.03, 0.22 + i * 0.03, 0.03),
                     p: [(i - 2) * 0.05, 0.11 + i * 0.015, (i % 2) * 0.05], r: [0.1 * i, 0, 0.12 * (i - 2)] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'grass', spacing: 2.2, geo: g, mat: ZoneKit.lam(P.moss),
        place(slot, m) {
          if (hash(slot, 301) > 0.5) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.1 + hash(slot, 303) * 0.5), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, dz: hash(slot, 307) * 2, sy: 0.7 + hash(slot, 311) * 0.9 };
        }
      });
    }

    /* --- 22. 吊り下げランタン（天井から鎖で下がる） ------------------------ */
    {
      const body = ZoneKit.merge([
        { g: ZoneKit.box(0.03, 0.5, 0.03), p: [0, 0.25, 0] },
        { g: ZoneKit.box(0.22, 0.26, 0.22), p: [0, -0.10, 0] },
        { g: ZoneKit.box(0.26, 0.06, 0.26), p: [0, 0.04, 0] },
        { g: ZoneKit.box(0.26, 0.06, 0.26), p: [0, -0.24, 0] }
      ]);
      const placeL = (slot, m) => {
        if (!isWall(m + 7)) return null;
        if (hash(slot, 321) > 0.55) return null;
        const side = (hash(slot, 323) > 0.5) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.66 + hash(slot, 327) * 0.5), y: ceil ? 0.5 : H - 0.5, rz: ceil ? Math.PI : 0 };
      };
      F({ name: 'lantern', spacing: 11, geo: body, mat: ZoneKit.lam(0x6b5b3c), place: placeL });
      F({
        name: 'lanternFire', spacing: 11,
        geo: ZoneKit.merge([{ g: ZoneKit.box(0.16, 0.18, 0.16), p: [0, -0.10, 0] }]),
        mat: ZoneKit.bas(P.fireHot), prop: false,
        place(slot, m, t) {
          const o = placeL(slot, m);
          if (!o) return null;
          o.sx = o.sy = 0.85 + 0.2 * Math.sin(t * 5 + slot * 3);
          return o;
        }
      });
    }

    /* --- 23. 倒れた柱（床に転がる） --------------------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        parts.push({ g: ZoneKit.cyl(0.22, 0.9, 9), p: [0, 0, -1.6 + i * 0.95], r: [Math.PI / 2, 0, 0] });
      }
      parts.push({ g: ZoneKit.box(0.6, 0.6, 0.22), p: [0, 0, 2.1] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'fallen', spacing: 15, geo: g, mat: ZoneKit.lam(P.stone),
        place(slot, m) {
          if (!isWall(m + 4)) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.5 + hash(slot, 331) * 0.6), y: ceil ? H - 0.22 : 0.22,
                   ry: (hash(slot, 333) - 0.5) * 0.5, rz: ceil ? Math.PI : 0, dz: hash(slot, 337) * 5 };
        }
      });
    }

    /* --- 24. 楔形文字の石板（壁に立てかけた碑） --------------------------- */
    {
      const parts = [
        { g: ZoneKit.box(0.12, 1.1, 0.62), p: [0, 0, 0], r: [0, 0, 0.07] },
        { g: ZoneKit.box(0.16, 0.14, 0.70), p: [0, -0.56, 0] }
      ];
      for (let i = 0; i < 7; i++) {
        parts.push({ g: ZoneKit.box(0.04, 0.05, 0.36), p: [-0.08, 0.42 - i * 0.13, 0.02] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'stele', spacing: 9.5, geo: g, mat: ZoneKit.lam(P.stoneLit),
        place(slot, m) {
          if (!isWall(m + 2)) return null;
          if (hash(slot, 341) > 0.6) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.42), y: ceil ? H - 0.58 : 0.58, ry: side > 0 ? 0 : Math.PI,
                   rz: ceil ? Math.PI : 0, dz: hash(slot, 343) * 3 };
        }
      });
    }
  },

  /* ==========================================================================
     毎フレームの送り出し
     ========================================================================== */
  sync(dist, t, speed) {
    if (!ZoneRuins.scene) return;
    ZoneRuins._t = t;
    ZoneRuins._speed = speed || CFG.SPEED_MIN;
    ZoneRuins._spd01 = U.clamp((ZoneRuins._speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    ZoneRuins.aheadCount = ZoneKit.syncFields(ZoneRuins, dist, t, false);

    /* 遠景の層を視差で流す */
    for (let i = 0; i < ZoneRuins.farLayers.length; i++) {
      const g = ZoneRuins.farLayers[i];
      g.position.z = (dist * g.userData.par) % g.userData.len;
    }
    /* 松明の点光を流す（揺らぎつき）＝濡れていない石にも陰影が出る */
    if (ZoneRuins.torchA) {
      const a = 30, b = 23;
      const fa = 0.75 + 0.25 * Math.sin(t * 8.3) + 0.1 * Math.sin(t * 19);
      const fb = 0.72 + 0.28 * Math.sin(t * 6.1 + 1.4);
      ZoneRuins.torchA.position.set(-1.85, 1.1, -(a - (dist % a)));
      ZoneRuins.torchA.intensity = 24.0 * fa;
      ZoneRuins.torchB.position.set(1.85, CFG.H - 1.1, -(b - (dist % b)));
      ZoneRuins.torchB.intensity = 19.0 * fb;
    }
    /* 巨岩の追跡（§4.4 S3）: 岩が「球」だと読めるように、横からの主光と
       後ろ上からの縁光を当てる（演出側＝setpieces は触らず、ゾーンの照明だけで作る）。
       位置は Setpieces から距離を読むだけ（一方通行の参照）。 */
    if (ZoneRuins.rockKey) {
      const Sp = (typeof Setpieces !== 'undefined') ? Setpieces : null;
      const on = !!(Sp && Sp.rockActive && Sp.rockActive());
      if (on) {
        const gap = Sp.rockGap(), R = Sp.ROCK.R;
        const fl = 0.88 + 0.12 * Math.sin(t * 7.3);
        /* 主光: 斜め前・横から当てて、球の片側に明暗の境目を作る＝丸く見える */
        ZoneRuins.rockKey.position.set(1.9, CFG.H * 0.62, gap - R - 1.1);
        ZoneRuins.rockKey.intensity = 30 * fl;
        /* 縁光: 後ろ上から。silhouette の縁だけが光って輪郭が立つ */
        ZoneRuins.rockRim.position.set(-1.7, CFG.H * 1.75, gap + R * 0.55);
        ZoneRuins.rockRim.intensity = 26 * fl;
      } else if (ZoneRuins.rockKey.intensity !== 0) {
        ZoneRuins.rockKey.intensity = 0;
        ZoneRuins.rockRim.intensity = 0;
      }
    }
    if (ZoneRuins.speedLines) {
      const op = 0.16 + ZoneRuins._spd01 * 0.34;
      ZoneRuins.speedLines.forEach((f) => { f.mesh.material.opacity = op; });
    }
    if (ZoneRuins.wind) {
      ZoneRuins.windMat.opacity = 0.10 + ZoneRuins._spd01 * 0.24;
      ZoneRuins.wind.position.z = (dist % ZoneRuins.WIND_CELL);
    }
  },

  propsAhead() { return ZoneRuins.aheadCount || 0; }
};

/* 障害物の見た目は全ゾーン共通（js/obstacle_skin.js / 契約§4.3 v2・ゾーン別スキンは失効） */

Zones.register(ZoneRuins);
