/* ============================================================================
   DUO RUN — zone_sea.js  ゾーン3「深海」の装飾（契約 §5 / §6 P4a）

   ■ 契約§5「深海」
     青緑。気泡粒子・光の帯（コースティクス風のストライプ）・サンゴ・沈没船の梁・
     魚群（点の群れ）。さらに P4a の指定で 海藻（揺れる）・クラゲ（発光・ゆっくり上下）・
     岩礁・遺跡の柱（海没）・宝箱。壁区間（海溝・洞窟）と開放区間（外に沈没船・
     巨大な岩礁・遠景に深い青のグラデと光の柱）を交互に。霧は青緑で濃い目。
   ■ 作り方の方針はネオン都市・古代遺跡と同じ（契約§3）
     - テクスチャ画像は一切使わない。形は ZoneKit.merge でプリミティブを彫る。
     - 小物は InstancedMesh 1つ＝1種類。スロット送りで無限に流す（同じ距離＝同じ景色）。
     - 黒潰れを防ぐ明部は「水面からの光の柱 ＋ 光の帯 ＋ 発光生物（クラゲ・プランクトン）」。
       暗部は霧と岩陰が受け持つ（青緑の中間調で塗り潰さない）。
   ============================================================================ */
'use strict';

const ZoneSea = {
  id: 'sea',
  /* 背後に残す長さ。**カメラ（z = CFG.CAM.Z = 8）より手前には小物を置かない**
     ＝ 粒子や発光板がレンズの直前に来て画面を覆う事故を構造的に防ぐ。 */
  BEHIND: 2,

  PAL: {
    /* World が読む共通キー */
    road:      0x39717c,      // 海底の岩盤（青緑に寄せた石）
    roadRough: 0.62,          // 水を含んだ岩＝少し濡れている
    roadMetal: 0.10,
    skirt:     0x12333c,
    metal:     0x8fc0c4,      // ゲート・門柱の金属（錆びた真鍮＋青緑）
    amber:     0xffb347,      // 床＝LUMEN（ゾーンが変わっても意味は同じ）
    indigo:    0x8b9bff,      // 天井＝UMBRA
    fog:       0x052430,      // 青緑の濃い霧（契約§5）。暗部を残すため深く沈める

    /* 深海の配色（岩の青緑／サンゴの暖色／発光生物の水色／沈没船の錆） */
    skyTop:    0x02121c,      // 見上げた水の深み
    skyMid:    0x06394b,
    skyLow:    0x0d7285,
    skyHot:    0x4fd8dc,      // 水面（明部）
    rock:      0x3d6b73,
    rockLit:   0x5b8f94,
    rockDark:  0x1c3a44,
    rockCool:  0x46707e,
    sand:      0x86937f,      // 海底の砂（緑がかった灰）
    wall:      0x3d6b76,
    wallDark:  0x18333b,
    coralA:    0xff7a6a,      // 枝サンゴ（赤）
    coralB:    0xffb45c,      // テーブルサンゴ（橙）
    coralC:    0xc274e0,      // 扇サンゴ（紫）
    coralHot:  0xffd9c0,
    kelp:      0x3f7f4a,      // 海藻
    kelpLit:   0x67ab5e,
    jelly:     0x8fd8ff,      // クラゲ（発光）
    jellyHot:  0xe6faff,
    plankton:  0x9fffd8,
    caustic:   0xa8f2ff,      // 光の帯・光の柱
    wreck:     0x4a3a2c,      // 沈没船の木
    wreckLit:  0x6d573f,
    rust:      0x9a5a30,
    gold:      0xffd870,
    shell:     0xe8d9bd,
    ridge:     0x0a2c3c,      // 遠景の崖
    ridgeFar:  0x07202e,
    bubble:    0xcdf4ff
  },
  fog: { color: 0x052430, near: 15, far: 76 },

  /* ---- 区間パターン（壁区間＝海溝・洞窟／開放区間＝外に沈没船と岩礁） ------
     S5「深海」は開放区間をしっかり取る（沈没船・岩礁・光の柱が主役）。
     inner は将来の「洞窟」用（壁区間主体）。 */
  MODE: {
    outer: { period: 118, len: 62 },
    inner: { period: 130, len: 112 }
  },
  WALL_PERIOD: 118,
  WALL_LEN: 62,
  mode: 'outer',
  setMode(id) {
    const m = ZoneSea.MODE[id] || ZoneSea.MODE.outer;
    ZoneSea.mode = ZoneSea.MODE[id] ? id : 'outer';
    ZoneSea.WALL_PERIOD = m.period;
    ZoneSea.WALL_LEN = m.len;
    return ZoneSea.mode;
  },
  isWall(m) {
    /* 大演出「巨大魚の通過」（§4.4 S5）の間は開放区間にする。
       壁があるとコリドーの外を泳ぐ巨体が隠れて「巨大さが画面で分かる」を満たせない。
       演出側の状態を読むだけ（Setpieces は照明も区間も触らない / 一方通行の参照）。 */
    if (typeof Setpieces !== 'undefined' && Setpieces.fishOpenSection && Setpieces.fishOpenSection(m)) return false;
    const p = ((m % ZoneSea.WALL_PERIOD) + ZoneSea.WALL_PERIOD) % ZoneSea.WALL_PERIOD;
    return p < ZoneSea.WALL_LEN;
  },
  hash(n, salt) { return ZoneKit.hash(n, salt); },
  /* カメラ（z = CFG.CAM.Z = 8）とこの距離まで近づいた小物は描かない。
     スロットは spacing の格子なので BEHIND だけでは足りない（格子の切り上げで
     最大 spacing ぶん手前に寄る）＝ 気泡やクラゲがレンズの直前に来て画面を覆う。
     ここで「2体より CULL_BEHIND m 以上うしろ」を一括で落とす。 */
  CULL_BEHIND: 1.2,
  _clear: 0,
  _field(spec) {
    const place = spec.place;
    const isProp = (spec.prop !== false);
    spec.place = function (slot, m, t, dist) {
      if (dist !== undefined && m < dist - ZoneSea.CULL_BEHIND) return null;
      /* 大演出「巨大魚の通過」の遠景カットのあいだは小物を間引く（§4.4 S5 / P4a-r1）。
         巨体の輪郭を見せるための背景を空ける。割合は演出側が決め、ゾーンは読むだけ。
         同じスロットは同じ判定になるので、点滅せず滑らかに消えていく。 */
      if (isProp && ZoneSea._clear > 0 && ZoneKit.hash(slot, 977) < ZoneSea._clear) return null;
      return place(slot, m, t, dist);
    };
    return ZoneKit.field(ZoneSea, spec);
  },

  /* ==========================================================================
     組み立て
     ========================================================================== */
  build(scene) {
    ZoneSea.scene = scene;
    ZoneSea._t = 0;
    ZoneSea._spd01 = 0;
    const F = ZoneSea.fog;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    scene.background = new THREE.Color(F.color);
    ZoneSea._lights(scene);
    ZoneSea._sky(scene);
    ZoneSea._far(scene);
    ZoneSea._props(scene);
    ZoneSea._motes(scene);
    ZoneSea._speedFx(scene);
  },

  /* ---- 光（水面からの降り注ぎ＋発光生物の点光） ---------------------------
     契約§5 の「黒潰れ禁止」は、上からの半球光で面の向きに明暗を作り、
     明部を「光の柱・光の帯・クラゲ・プランクトン」の発光マテリアルで作る。 */
  _lights(scene) {
    const P = ZoneSea.PAL;
    /* 環境光は低め（深海なので陰が濃い）。上向きの面だけを水色で起こす */
    scene.add(new THREE.AmbientLight(0x2c6270, 0.42));
    scene.add(new THREE.HemisphereLight(0x63d2e2, 0x061f29, 0.60));
    /* 水面から斜めに差す主光。上を向いた面が明るく、下面は落ちる＝立体が出る */
    const sun = new THREE.DirectionalLight(0xaef0ff, 0.76);
    sun.position.set(-0.55, 1.0, 0.45);
    scene.add(sun);
    /* 奥からの逆光（遠くの光の柱）。岩とサンゴの縁が光って輪郭が立つ */
    const rim = new THREE.DirectionalLight(0x4fb6c8, 0.42);
    rim.position.set(0.7, 0.3, -1.0);
    scene.add(rim);
    /* 発光生物の点光（走行に合わせて流す）。明るい溜まりを作る主役 */
    ZoneSea.glowA = new THREE.PointLight(P.jelly, 22.0, 19, 2);
    ZoneSea.glowB = new THREE.PointLight(P.plankton, 15.0, 16, 2);
    scene.add(ZoneSea.glowA, ZoneSea.glowB);
    /* 大演出「巨大魚の通過」（§4.4 S5）で、魚体の面を起こす明かり。
       位置は sync() が Setpieces から距離を読んで置く（一方通行の参照）。 */
    ZoneSea.fishKey = new THREE.PointLight(0xbdf0ff, 0, 46, 2);
    ZoneSea.fishRim = new THREE.PointLight(0x62d8ff, 0, 40, 2);
    scene.add(ZoneSea.fishKey, ZoneSea.fishRim);
  },

  /* ---- 見上げた水（深い青のグラデーション＋水面の揺らぎ） ----------------- */
  _sky(scene) {
    const P = ZoneSea.PAL;
    const g = new THREE.PlaneGeometry(560, 320, 1, 24);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(P.skyHot), mid = new THREE.Color(P.skyLow);
    const low = new THREE.Color(P.skyMid), deep = new THREE.Color(P.skyTop);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getY(i) / 320) + 0.5;      // 0(下) .. 1(上)
      /* 上＝水面の明るい水色 → 青 → 藍 → 下は深淵の闇（明暗を上下で割る） */
      if (u > 0.74) c.copy(mid).lerp(top, U.clamp((u - 0.74) / 0.26, 0, 1));
      else if (u > 0.54) c.copy(low).lerp(mid, U.clamp((u - 0.54) / 0.20, 0, 1));
      else if (u > 0.42) c.copy(deep).lerp(low, U.clamp((u - 0.42) / 0.12, 0, 1));
      else c.copy(deep);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
    m.position.set(0, 10, -178);
    m.renderOrder = -10;
    scene.add(m);
    /* 遠景の光の柱（水面から落ちる太い光。明部と奥行きを同時に作る） */
    ZoneSea.farShafts = new THREE.Group();
    [[-58, 34, 0.30], [-14, 22, 0.20], [26, 40, 0.26], [72, 26, 0.16]].forEach((q, i) => {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(q[1], 250), ZoneKit.add(P.caustic, q[2]));
      sh.position.set(q[0], 42, -170 + i);
      sh.rotation.z = (i % 2 ? 0.10 : -0.08);
      sh.renderOrder = -9 + i;
      sh.material.fog = false;
      ZoneSea.farShafts.add(sh);
    });
    scene.add(ZoneSea.farShafts);
    /* 水面そのもの（頭上のきらめき） */
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(520, 120),
                                ZoneKit.add(0x7fe8f0, 0.20));
    surf.position.set(0, 96, -168);
    surf.material.fog = false;
    surf.renderOrder = -6;
    scene.add(surf);
  },

  /* ---- 遠景（海底の崖・巨大な岩礁・沈んだ船と神殿） -----------------------
     古代遺跡と同じ流儀: 下端を大きく下へ伸ばして「生えている」ようにし、
     霧をかけない暗いシルエットにして空（明部）との明暗差で輪郭を立てる。 */
  _far(scene) {
    ZoneSea.farLayers = [];
    const LEN = 420;
    const B = (w, h, d, x, y, z, rot) => ({ g: ZoneKit.box(w, h, d), p: [x, y, z], r: rot || [0, 0, 0] });

    function spire(s2, seed) {                  // 岩礁の尖塔（連なる円錐）
      const o = [];
      for (let k = 0; k < 4; k++) {
        const h = (26 + ZoneKit.hash(seed + k, 61) * 34) * s2;
        const w = (12 + ZoneKit.hash(seed + k, 67) * 11) * s2;
        o.push({ g: new THREE.ConeGeometry(w / 2, h, 5), p: [(k - 1.5) * w * 0.86, h / 2 - 8, ZoneKit.hash(seed + k, 71) * 26],
                 r: [0, 0.5, (ZoneKit.hash(seed + k, 73) - 0.5) * 0.24] });
        o.push(B(w, 90, w, (k - 1.5) * w * 0.86, -46, 0));
      }
      return o;
    }
    function wreckShip(s2) {                    // 沈没船（船体・マスト・折れた甲板）
      const o = [];
      o.push(B(54 * s2, 13 * s2, 15 * s2, 0, 4 * s2, 0, [0, 0, 0.16]));         // 船体
      o.push(B(46 * s2, 4 * s2, 17 * s2, 1 * s2, 11 * s2, 0, [0, 0, 0.16]));    // 甲板
      o.push(B(16 * s2, 9 * s2, 14 * s2, -17 * s2, 14 * s2, 0, [0, 0, 0.16]));  // 船尾楼
      o.push(B(2.4 * s2, 34 * s2, 2.4 * s2, 4 * s2, 26 * s2, 0, [0, 0, 0.30])); // 主マスト
      o.push(B(20 * s2, 1.6 * s2, 1.6 * s2, 2 * s2, 34 * s2, 0, [0, 0, 0.30])); // 帆桁
      o.push(B(2.0 * s2, 22 * s2, 2.0 * s2, -12 * s2, 22 * s2, 0, [0, 0, 0.36]));
      o.push(B(30 * s2, 90, 16 * s2, 0, -44, 0));                               // 埋もれた下半分
      for (let k = 0; k < 5; k++) o.push(B(3 * s2, 6 * s2, 1.2 * s2, (k - 2) * 9 * s2, 8 * s2, 8 * s2));  // 肋材
      return o;
    }
    function sunkenTemple(s2) {                 // 海没した神殿（柱列と屋根）
      const o = [];
      for (let k = 0; k < 6; k++) {
        const h = (20 + (k % 3) * 6) * s2;
        o.push({ g: new THREE.CylinderGeometry(2.6 * s2, 3.0 * s2, h, 7), p: [(k - 2.5) * 8 * s2, h / 2, 0] });
      }
      o.push(B(52 * s2, 3.4 * s2, 14 * s2, 0, 27 * s2, 0));
      o.push(B(56 * s2, 2.2 * s2, 16 * s2, 0, 1.2 * s2, 0));
      o.push(B(56 * s2, 90, 16 * s2, 0, -45, 0));
      return o;
    }
    function trench(s2, seed) {                 // 海溝の崖（段になった岩壁）
      const o = [];
      for (let k = 0; k < 5; k++) {
        const w = (30 + ZoneKit.hash(seed + k, 81) * 26) * s2;
        o.push(B(w, (18 + ZoneKit.hash(seed + k, 83) * 26) * s2, 18 * s2,
                 (k - 2) * w * 0.8, (4 + ZoneKit.hash(seed + k, 87) * 12) * s2, ZoneKit.hash(seed + k, 89) * 22));
        o.push(B(w, 90, 18 * s2, (k - 2) * w * 0.8, -46, 0));
      }
      return o;
    }

    const mk = (parts, color, par) => {
      const mesh = new THREE.Mesh(ZoneKit.merge(parts), ZoneKit.bas(color, { fog: false }));
      mesh.frustumCulled = false;
      const grp = new THREE.Group();
      grp.add(mesh);
      grp.userData = { par: par, len: LEN };
      scene.add(grp);
      ZoneSea.farLayers.push(grp);
      return grp;
    };
    /* --- 近い層: 沈没船・岩礁の尖塔・海没した神殿（青緑のシルエット） --- */
    const near = [];
    const put = (parts, x, z, s2) => {
      parts.forEach((q) => near.push({ g: q.g, p: [q.p[0] + x, q.p[1], q.p[2] + z], r: q.r, s: [s2, s2, s2] }));
    };
    put(wreckShip(1), -52, -46, 1);
    put(spire(1.0, 5), 56, -150, 1);
    put(sunkenTemple(0.9), -60, -268, 1);
    put(spire(0.8, 17), 46, -372, 1);
    put(wreckShip(0.7), 62, -492, 1);
    put(spire(1.1, 29), -56, -604, 1);
    put(sunkenTemple(0.7), 58, -716, 1);
    put(spire(0.9, 41), -48, -818, 1);
    mk(near, ZoneSea.PAL.ridge, 0.40);

    /* --- 遠い層: 海溝の崖（さらに暗い藍） --- */
    const far = [];
    const putF = (parts, x, z) => parts.forEach((q) => far.push({ g: q.g, p: [q.p[0] + x, q.p[1], q.p[2] + z], r: q.r }));
    putF(trench(1.2, 3), -128, -130);
    putF(trench(1.0, 11), 136, -310);
    putF(trench(1.3, 23), -120, -470);
    putF(trench(1.0, 31), 126, -650);
    putF(trench(1.1, 43), -132, -800);
    mk(far, ZoneSea.PAL.ridgeFar, 0.13);
  },

  /* ---- 気泡・プランクトン・漂う粒（契約§5「気泡粒子」） ------------------ */
  _motes(scene) {
    const P = ZoneSea.PAL;
    /* 上昇する気泡（床から湧いて天井へ。走行距離ではなく時間で上がる） */
    ZoneSea._field({
      name: 'bubble', onTrack: true, spacing: 0.80, geo: new THREE.CircleGeometry(0.045, 6),
      mat: ZoneKit.add(P.bubble, 0.40), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 701), h2 = ZoneKit.hash(slot, 709), h3 = ZoneKit.hash(slot, 719);
        const u = (h2 + t * (0.16 + h3 * 0.12)) % 1;             // 0(床) → 1(天井)
        return { x: (h1 - 0.5) * 6.8, y: 0.06 + u * (CFG.H - 0.12),
                 dz: h3 * 0.8, sx: 0.5 + h3 * 1.5, sy: 0.5 + h3 * 1.5 };
      }
    });
    /* 大きい気泡（ゆっくり・ゆらぎながら上がる） */
    ZoneSea._field({
      name: 'bubbleBig', onTrack: true, spacing: 5.2, geo: new THREE.SphereGeometry(0.10, 5, 3),
      mat: ZoneKit.add(P.bubble, 0.26), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 727), h2 = ZoneKit.hash(slot, 733);
        const u = (h2 + t * 0.10) % 1;
        return { x: (h1 - 0.5) * 7.4 + Math.sin(t * 1.3 + slot) * 0.25,
                 y: 0.1 + u * (CFG.H - 0.2), sx: 0.7 + h1 * 0.9, sy: 0.7 + h1 * 0.9, sz: 0.7 + h1 * 0.9 };
      }
    });
    /* 発光プランクトン（明部の粒。ゆっくり漂う） */
    ZoneSea._field({
      name: 'plankton', onTrack: true, spacing: 1.6, geo: new THREE.PlaneGeometry(0.055, 0.055),
      mat: ZoneKit.add(P.plankton, 0.52), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 741), h2 = ZoneKit.hash(slot, 743), h3 = ZoneKit.hash(slot, 751);
        const fl = 0.55 + 0.45 * Math.sin(t * (1.6 + h3 * 2.4) + slot * 1.7);
        return { x: (h1 - 0.5) * 7.6, y: 0.2 + h2 * (CFG.H - 0.4) + Math.sin(t * 0.6 + slot) * 0.28,
                 dz: h3 * 1.2, sx: 0.6 + fl, sy: 0.6 + fl };
      }
    });
    /* 漂う砂・デトリタス（中間調のざらつき） */
    ZoneSea._field({
      name: 'detritus', onTrack: true, spacing: 2.6, geo: new THREE.PlaneGeometry(0.075, 0.05),
      mat: ZoneKit.add(0xa9c4c0, 0.20), prop: false, order: 5,
      place(slot, m, t) {
        const h1 = ZoneKit.hash(slot, 761), h2 = ZoneKit.hash(slot, 769);
        return { x: (h1 - 0.5) * 7.2, y: 0.15 + h2 * (CFG.H - 0.3) - ((t * 0.08) % 1) * 0.6,
                 rz: t * 0.3 + slot, sx: 0.7 + h2, sy: 0.7 + h1 };
      }
    });
    /* 魚群（契約§5「点の群れが流れる」）: 小さな板が群れで横に流れる */
    ZoneSea._field({
      name: 'school', onTrack: true, spacing: 0.55, geo: new THREE.PlaneGeometry(0.10, 0.045),
      mat: ZoneKit.add(0xbfe8ef, 0.42), prop: false, order: 5,
      place(slot, m, t) {
        const g = Math.floor(slot / 22);                        // 22匹で1群
        const i = slot % 22;
        if (ZoneKit.hash(g, 771) > 0.42) return null;
        const side = (g % 2) ? 1 : -1;
        const hx = ZoneKit.hash(slot, 773), hy = ZoneKit.hash(slot, 779);
        /* 群れ全体が左右へゆっくり泳ぐ（同じ距離なら同じ形） */
        const sway = Math.sin(t * 0.7 + g * 1.9) * 1.5;
        const cx = side * (2.6 + ZoneKit.hash(g, 787) * 3.4) + sway;
        const cy = 0.5 + ZoneKit.hash(g, 791) * (CFG.H - 1.0);
        return { x: cx + (hx - 0.5) * 1.5, y: cy + (hy - 0.5) * 1.0 + Math.sin(t * 3 + i) * 0.05,
                 dz: (i % 6) * 0.22, rz: Math.sin(t * 4 + i) * 0.22, sx: 0.8 + hx * 0.6, sy: 0.8 + hy * 0.5 };
      }
    });
  },

  /* ---- 体感速度の演出（契約§4.1）: 床を流れる光条と水流の筋 -------------- */
  _speedFx(scene) {
    const P = ZoneSea.PAL, H = CFG.H;
    const streak = new THREE.PlaneGeometry(0.09, 1.0);
    ZoneSea.speedLines = [];
    [['floor', 0.022, -Math.PI / 2, P.amber], ['ceil', H - 0.022, Math.PI / 2, P.indigo]].forEach((sfc, si) => {
      ZoneSea.speedLines.push(ZoneSea._field({
        name: 'speedline', onTrack: true, spacing: 2.0, geo: streak, mat: ZoneKit.add(sfc[3], 0.18), prop: false, order: 4,
        place(slot, m) {
          if ((slot & 1) !== si) return null;
          const lane = CFG.LANES[Math.floor(ZoneKit.hash(slot, 211) * 3)];
          return { x: lane * CFG.LANE_W + (ZoneKit.hash(slot, 213) - 0.5) * 0.55, y: sfc[1], rx: sfc[2],
                   dz: ZoneKit.hash(slot, 217) * 1.8, sy: 2.4 + ZoneSea._spd01 * 6.5 };
        }
      }));
    });
    /* 流れていく水の筋（コリドーの外側） */
    const N = 240;
    const pos = new Float32Array(N * 6);
    ZoneSea.WIND_CELL = 24;
    for (let i = 0; i < N; i++) {
      const side = (i % 2) ? 1 : -1;
      const x = side * (2.3 + ZoneKit.hash(i, 301) * 4.4);
      const y = -1.0 + ZoneKit.hash(i, 303) * 7.0;
      const z = -ZoneKit.hash(i, 307) * ZoneSea.WIND_CELL * 4 + 6;
      const len = 1.8 + ZoneKit.hash(i, 311) * 2.6;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z - len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ZoneSea.windMat = new THREE.LineBasicMaterial({
      color: 0xbfeaf2, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const m = new THREE.LineSegments(g, ZoneSea.windMat);
    m.frustumCulled = false;
    ZoneSea.wind = new THREE.Group();
    ZoneSea.wind.add(m);
    scene.add(ZoneSea.wind);
  },

  /* ==========================================================================
     小物（20種以上・前方60mに常時40個以上 / 契約§3 ジオラマ調の規範）
     ========================================================================== */
  _props(scene) {
    const P = ZoneSea.PAL;
    const HW = CFG.HALF_W;       // 1.8
    const H = CFG.H;             // 4.0
    const XW = HW + 0.16;
    const hash = ZoneKit.hash;
    const isWall = ZoneSea.isWall;
    const F = ZoneSea._field;

    /* --- 1. 岩壁パネル（海溝の壁。層になった岩と貝の付着） ---------------- */
    {
      const fp = [
        { g: ZoneKit.box(0.55, H + 5.0, 7.9), p: [0, 0, 0] },
        { g: ZoneKit.box(0.26, 0.40, 7.9), p: [-0.30, H * 0.5 - 0.6, 0] },
        { g: ZoneKit.box(0.26, 0.34, 7.9), p: [-0.30, -H * 0.5 + 0.5, 0] }
      ];
      /* 堆積の層（横の筋）＝のっぺりさせない */
      for (let i = -2; i <= 2; i++) {
        fp.push({ g: ZoneKit.box(0.08, 0.07, 7.9), p: [-0.30, i * 0.88, 0], r: [0, 0, 0.01 * i] });
      }
      /* 岩棚の張り出しと、抉れた穴 */
      [[-1.5, -2.4], [0.9, 1.4]].forEach((q, i) => {
        fp.push({ g: ZoneKit.box(0.26, 0.20, 1.1 + i * 0.3), p: [-0.22, q[0], q[1]], r: [0.1, 0, 0.12] });
      });
      fp.push({ g: ZoneKit.box(0.18, 0.5, 0.7), p: [-0.10, 1.2, -1.8], r: [0.2, 0.3, 0.15] });
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

    /* --- 2. 岩柱（壁区間の内側に並ぶ、ねじれた岩の柱） -------------------- */
    {
      const parts = [
        { g: ZoneKit.cyl(0.26, H - 0.6, 7), p: [0, 0, 0] },
        { g: ZoneKit.box(0.62, 0.26, 0.62), p: [0, H * 0.5 - 0.42, 0], r: [0, 0.4, 0] },
        { g: ZoneKit.box(0.70, 0.30, 0.70), p: [0, -H * 0.5 + 0.44, 0], r: [0, 0.2, 0] }
      ];
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        parts.push({ g: ZoneKit.box(0.10, H - 1.4, 0.10), p: [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24],
                     r: [0, 0, 0.05] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'column', spacing: 6.5, geo: g, mat: ZoneKit.lam(P.rock),
        place(slot, m) {
          if (!isWall(m + 2)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.14), y: H * 0.5, ry: hash(slot, 33) * 3,
                   sy: 0.94 + hash(slot, 35) * 0.10 };
        }
      });
    }

    /* --- 3. 枝サンゴ（赤。棚の上に群生） ---------------------------------- */
    {
      const parts = [];
      const branch = (x, y, z, len, ang, w) => {
        parts.push({ g: ZoneKit.box(w, len, w), p: [x, y + len / 2, z], r: [0, 0, ang] });
      };
      branch(0, 0, 0, 0.40, 0, 0.075);
      branch(-0.10, 0.28, 0.02, 0.32, 0.5, 0.058);
      branch(0.12, 0.30, -0.04, 0.34, -0.45, 0.058);
      branch(-0.22, 0.52, 0.06, 0.24, 0.8, 0.045);
      branch(0.24, 0.55, -0.02, 0.22, -0.75, 0.045);
      branch(0.02, 0.56, 0.10, 0.26, 0.1, 0.05);
      parts.push({ g: ZoneKit.box(0.30, 0.09, 0.28), p: [0, 0.04, 0] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'coralBranch', spacing: 3.8, geo: g, mat: ZoneKit.lam(P.coralA),
        place(slot, m, t) {
          if (hash(slot, 101) > 0.68) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.28 + hash(slot, 103) * 0.9), y: ceil ? H : 0,
                   rz: (ceil ? Math.PI : 0) + Math.sin(t * 0.8 + slot) * 0.02,
                   ry: hash(slot, 107) * 3, dz: hash(slot, 109) * 2.4,
                   sx: 0.7 + hash(slot, 111) * 0.8, sy: 0.7 + hash(slot, 113) * 0.9,
                   sz: 0.7 + hash(slot, 117) * 0.8 };
        }
      });
    }

    /* --- 4. テーブルサンゴ（橙。平たい傘） -------------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.cyl(0.42, 0.06, 9), p: [0, 0.34, 0] },
        { g: ZoneKit.cyl(0.32, 0.05, 9), p: [0.10, 0.42, 0.06] },
        { g: ZoneKit.box(0.10, 0.34, 0.10), p: [0, 0.17, 0] },
        { g: ZoneKit.box(0.22, 0.08, 0.22), p: [0, 0.04, 0] }
      ]);
      F({
        name: 'coralTable', spacing: 7.5, geo: g, mat: ZoneKit.lam(P.coralB),
        place(slot, m) {
          if (hash(slot, 121) > 0.62) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.52 + hash(slot, 123) * 0.7), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 127) * 3, dz: hash(slot, 129) * 3,
                   sx: 0.8 + hash(slot, 131) * 0.7, sy: 0.8 + hash(slot, 133) * 0.5, sz: 0.8 + hash(slot, 137) * 0.7 };
        }
      });
    }

    /* --- 5. 扇サンゴ（紫。水流で揺れる） ---------------------------------- */
    {
      const parts = [{ g: ZoneKit.box(0.06, 0.18, 0.06), p: [0, 0.09, 0] }];
      for (let i = 0; i < 5; i++) {
        const a = (i / 4 - 0.5) * 1.5;
        parts.push({ g: ZoneKit.box(0.035, 0.52 - Math.abs(a) * 0.22, 0.035),
                     p: [Math.sin(a) * 0.30, 0.20 + (0.52 - Math.abs(a) * 0.22) / 2, 0], r: [0, 0, -a * 0.6] });
      }
      parts.push({ g: ZoneKit.box(0.58, 0.28, 0.025), p: [0, 0.42, 0] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'coralFan', spacing: 7.0, geo: g, mat: ZoneKit.lam(P.coralC),
        place(slot, m, t) {
          if (hash(slot, 141) > 0.58) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.34 + hash(slot, 143) * 0.8), y: ceil ? H : 0,
                   rz: (ceil ? Math.PI : 0) + Math.sin(t * 1.1 + slot * 1.7) * 0.09,
                   ry: (side > 0 ? 0 : Math.PI) + (hash(slot, 147) - 0.5) * 0.7,
                   dz: hash(slot, 149) * 3, sy: 0.8 + hash(slot, 151) * 0.8 };
        }
      });
    }

    /* --- 6. 海藻（長い葉。ゆっくり大きく揺れる / 契約§5「海藻（揺れる）」） */
    {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const y = 0.26 + i * 0.36;
        parts.push({ g: ZoneKit.box(0.10, 0.40, 0.03), p: [Math.sin(i * 0.9) * 0.08, y, 0],
                     r: [0, 0, Math.sin(i * 0.9) * 0.18] });
        if (i % 2 === 0) parts.push({ g: ZoneKit.box(0.16, 0.10, 0.025), p: [Math.sin(i) * 0.14, y + 0.08, 0.02] });
      }
      parts.push({ g: ZoneKit.box(0.18, 0.08, 0.18), p: [0, 0.04, 0] });
      const g = ZoneKit.merge(parts);
      F({
        name: 'kelp', spacing: 3.2, geo: g, mat: ZoneKit.lam(P.kelp),
        place(slot, m, t) {
          if (hash(slot, 161) > 0.62) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          const sw = Math.sin(t * 1.25 + slot * 0.8) * 0.16;
          return { x: side * (HW + 0.22 + hash(slot, 163) * 1.0), y: ceil ? H : 0,
                   rz: (ceil ? Math.PI : 0) + sw, ry: hash(slot, 167) * 3,
                   dz: hash(slot, 169) * 2, sy: 0.7 + hash(slot, 171) * 1.1 };
        }
      });
      /* 短い海草の房（明るい緑。色の幅を出す） */
      F({
        name: 'weed', spacing: 2.6, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.035, 0.26, 0.03), p: [-0.06, 0.13, 0], r: [0, 0, 0.22] },
          { g: ZoneKit.box(0.035, 0.32, 0.03), p: [0, 0.16, 0.03], r: [0, 0, -0.06] },
          { g: ZoneKit.box(0.035, 0.22, 0.03), p: [0.07, 0.11, -0.02], r: [0, 0, -0.3] }
        ]), mat: ZoneKit.lam(P.kelpLit),
        place(slot, m, t) {
          if (hash(slot, 181) > 0.55) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.16 + hash(slot, 183) * 1.3), y: ceil ? H : 0,
                   rz: (ceil ? Math.PI : 0) + Math.sin(t * 1.8 + slot) * 0.12,
                   ry: hash(slot, 187) * 3, dz: hash(slot, 189) * 1.8, sy: 0.7 + hash(slot, 191) * 0.8 };
        }
      });
    }

    /* --- 7. 沈没船の梁（契約§5）: 苔むした木の梁と鉄の帯 ------------------ */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.30, 0.30, 3.2), p: [0, 0, 0] },
        { g: ZoneKit.box(0.34, 0.10, 0.22), p: [0, 0.16, -1.1] },
        { g: ZoneKit.box(0.34, 0.10, 0.22), p: [0, 0.16, 0.4] },
        { g: ZoneKit.box(0.22, 0.22, 0.9), p: [0.18, 0.06, 1.6], r: [0, 0.22, 0.1] }
      ]);
      F({
        name: 'wreckBeam', spacing: 9.5, geo: g, mat: ZoneKit.lam(P.wreck),
        place(slot, m) {
          if (hash(slot, 201) > 0.6) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.78 + hash(slot, 203) * 0.5), y: ceil ? H - 0.16 : 0.16,
                   rz: ceil ? Math.PI : 0, ry: (hash(slot, 207) - 0.5) * 0.6, dz: hash(slot, 209) * 4 };
        }
      });
      /* 船の肋材（並んだ骨組み）＝「船だ」と一目で分かる形 */
      const rib = ZoneKit.merge([
        { g: ZoneKit.box(0.16, 1.5, 0.16), p: [0, 0.75, 0], r: [0, 0, 0.16] },
        { g: ZoneKit.box(0.16, 0.9, 0.16), p: [0.30, 1.9, 0], r: [0, 0, 0.55] },
        { g: ZoneKit.box(0.22, 0.14, 0.4), p: [0, 0.06, 0] }
      ]);
      F({
        name: 'wreckRib', spacing: 3.0, geo: rib, mat: ZoneKit.lam(P.wreckLit),
        place(slot, m) {
          if (isWall(m)) return null;                  // 開放区間の外に転がる船
          if (hash(slot, 211) > 0.7) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 1.2 + hash(slot, 213) * 1.2), y: ceil ? H : 0,
                   rz: (ceil ? Math.PI : 0) + (side > 0 ? -0.12 : 0.12),
                   ry: side > 0 ? 0 : Math.PI, sy: 0.7 + hash(slot, 217) * 0.8 };
        }
      });
    }

    /* --- 8. 沈没船の船体（開放区間の外に横たわる大きな影） ---------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(2.6, 1.5, 7.0), p: [0, -0.75, 0], r: [0, 0, 0.2] },
        { g: ZoneKit.box(2.2, 0.28, 6.4), p: [0.2, 0.04, 0], r: [0, 0, 0.2] },
        { g: ZoneKit.box(1.2, 0.9, 1.6), p: [-0.5, 0.5, -1.8], r: [0, 0, 0.2] },
        { g: ZoneKit.box(0.22, 3.4, 0.22), p: [0.3, 1.9, 0.6], r: [0, 0, 0.42] },
        { g: ZoneKit.box(1.8, 0.14, 0.14), p: [0.9, 3.2, 0.6], r: [0, 0, 0.42] }
      ]);
      F({
        name: 'wreckHull', spacing: 26, geo: g, mat: ZoneKit.lam(P.wreck),
        place(slot, m) {
          if (isWall(m + 6)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (9.0 + hash(slot, 221) * 2.6), y: -4.6 - hash(slot, 223) * 1.2,
                   ry: (hash(slot, 227) - 0.5) * 1.2, sx: 1 + hash(slot, 229) * 0.8,
                   sy: 1 + hash(slot, 231) * 0.6, sz: 1 + hash(slot, 233) * 0.9 };
        }
      });
    }

    /* --- 9. クラゲ（発光・ゆっくり上下 / 契約§5） ------------------------- */
    {
      const bell = ZoneKit.merge([
        { g: new THREE.SphereGeometry(0.22, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.62), p: [0, 0, 0] },
        { g: ZoneKit.cyl(0.20, 0.06, 6), p: [0, -0.10, 0] }
      ]);
      const placeJ = (slot, m, t) => {
        if (hash(slot, 241) > 0.52) return null;
        const side = (hash(slot, 243) > 0.5) ? 1 : -1;
        const bob = Math.sin(t * 0.85 + slot * 1.3) * 0.42;
        return { x: side * (HW + 0.7 + hash(slot, 247) * 1.6),
                 y: 0.9 + hash(slot, 249) * (CFG.H - 1.6) + bob,
                 dz: hash(slot, 251) * 4,
                 sx: 0.8 + hash(slot, 253) * 0.7, sy: 0.9 + 0.14 * Math.sin(t * 2.2 + slot),
                 sz: 0.8 + hash(slot, 253) * 0.7 };
      };
      F({ name: 'jelly', spacing: 8.0, geo: bell, mat: ZoneKit.lam(P.jelly), place: placeJ });
      /* 触手 */
      const tent = ZoneKit.merge([
        { g: ZoneKit.box(0.022, 0.62, 0.022), p: [-0.09, -0.40, 0.02] },
        { g: ZoneKit.box(0.022, 0.78, 0.022), p: [0.01, -0.48, -0.03] },
        { g: ZoneKit.box(0.022, 0.54, 0.022), p: [0.09, -0.36, 0.04] },
        { g: ZoneKit.box(0.022, 0.70, 0.022), p: [-0.02, -0.44, 0.08] }
      ]);
      F({
        name: 'jellyTent', spacing: 8.0, geo: tent, mat: ZoneKit.bas(P.jelly, { transparent: true, opacity: 0.55 }),
        prop: false, order: 3,
        place(slot, m, t) {
          const o = placeJ(slot, m, t);
          if (!o) return null;
          o.rz = Math.sin(t * 1.4 + slot) * 0.16;
          return o;
        }
      });
      /* 傘の発光（明部の主役。ゆっくり明滅する） */
      F({
        name: 'jellyGlow', spacing: 8.0, geo: new THREE.CircleGeometry(0.46, 14),
        mat: ZoneKit.add(P.jellyHot, 0.62), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeJ(slot, m, t);
          if (!o) return null;
          const fl = 0.8 + 0.3 * Math.sin(t * 1.9 + slot * 2.1);
          return { x: o.x, y: o.y, dz: o.dz, ry: (o.x > 0) ? -Math.PI / 2 : Math.PI / 2, sx: fl, sy: fl };
        }
      });
      /* 小さい発光クラゲの群れ（数で明部を散らす） */
      F({
        name: 'jellySmall', spacing: 3.2,
        geo: ZoneKit.merge([{ g: new THREE.SphereGeometry(0.115, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.65), p: [0, 0, 0] },
                            { g: ZoneKit.box(0.014, 0.26, 0.014), p: [0, -0.15, 0] }]),
        mat: ZoneKit.bas(P.jellyHot),
        place(slot, m, t) {
          if (hash(slot, 261) > 0.5) return null;
          const side = (hash(slot, 263) > 0.5) ? 1 : -1;
          return { x: side * (HW + 0.45 + hash(slot, 267) * 2.2),
                   y: 0.6 + hash(slot, 269) * (CFG.H - 1.2) + Math.sin(t * 1.1 + slot * 2) * 0.3,
                   dz: hash(slot, 271) * 3, sy: 0.9 + 0.2 * Math.sin(t * 3 + slot) };
        }
      });
    }

    /* --- 10. 岩礁（ごつごつした岩の塊） ----------------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.52, 0.42, 0.46), p: [0, 0.21, 0], r: [0.1, 0.4, 0.14] },
        { g: ZoneKit.box(0.36, 0.30, 0.34), p: [0.32, 0.15, 0.16], r: [0.3, 0.1, 0.4] },
        { g: ZoneKit.box(0.28, 0.24, 0.26), p: [-0.28, 0.12, -0.14], r: [0.2, 0.9, 0.1] },
        { g: ZoneKit.box(0.20, 0.18, 0.18), p: [0.06, 0.48, -0.06], r: [0.4, 0.2, 0.3] }
      ]);
      F({
        name: 'reef', spacing: 3.5, geo: g, mat: ZoneKit.lam(P.rockDark),
        place(slot, m) {
          if (hash(slot, 281) > 0.6) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.72 + hash(slot, 283) * 1.0), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 287) * 3,
                   sx: 0.7 + hash(slot, 289) * 0.7, sy: 0.7 + hash(slot, 291) * 1.0, sz: 0.8 + hash(slot, 293) * 0.6 };
        }
      });
      /* 明るい岩（上面が光を受ける。中間調を作る） */
      F({
        name: 'boulder', spacing: 5.6, geo: ZoneKit.merge([
          { g: new THREE.IcosahedronGeometry(0.42, 0), p: [0, 0.34, 0] },
          { g: ZoneKit.box(0.5, 0.14, 0.5), p: [0, 0.06, 0] }
        ]), mat: ZoneKit.lam(P.rockLit),
        place(slot, m) {
          if (hash(slot, 301) > 0.52) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.6 + hash(slot, 303) * 1.0), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 307) * 3, dz: hash(slot, 309) * 4,
                   sx: 0.8 + hash(slot, 311), sy: 0.7 + hash(slot, 313) * 0.8, sz: 0.8 + hash(slot, 317) };
        }
      });
    }

    /* --- 11. 遺跡の柱（海没した神殿の列柱 / 契約§5） ---------------------- */
    {
      const parts = [
        { g: ZoneKit.cyl(0.22, 2.2, 9), p: [0, 1.1, 0] },
        { g: ZoneKit.box(0.58, 0.18, 0.58), p: [0, 2.24, 0] },
        { g: ZoneKit.box(0.66, 0.22, 0.66), p: [0, 0.11, 0] },
        { g: ZoneKit.box(0.50, 0.14, 0.50), p: [0, 0.28, 0] }
      ];
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2;
        parts.push({ g: ZoneKit.box(0.05, 1.9, 0.05), p: [Math.cos(a) * 0.21, 1.1, Math.sin(a) * 0.21] });
      }
      const g = ZoneKit.merge(parts);
      F({
        name: 'ruinCol', spacing: 11, geo: g, mat: ZoneKit.lam(P.rockCool),
        place(slot, m) {
          if (hash(slot, 321) > 0.62) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.72 + hash(slot, 323) * 0.6), y: ceil ? H : 0,
                   rz: (ceil ? Math.PI : 0) + (hash(slot, 327) - 0.5) * 0.24,
                   dz: hash(slot, 329) * 4, sy: 0.6 + hash(slot, 331) * 0.7 };
        }
      });
      /* 倒れた柱（砂に埋もれて転がる） */
      F({
        name: 'ruinFallen', spacing: 16, geo: ZoneKit.merge([
          { g: ZoneKit.cyl(0.21, 0.8, 8), p: [0, 0, -1.2], r: [Math.PI / 2, 0, 0] },
          { g: ZoneKit.cyl(0.21, 0.8, 8), p: [0, 0, -0.3], r: [Math.PI / 2, 0, 0] },
          { g: ZoneKit.cyl(0.21, 0.7, 8), p: [0.04, 0, 0.6], r: [Math.PI / 2, 0, 0.06] },
          { g: ZoneKit.box(0.54, 0.54, 0.2), p: [0.06, 0, 1.15] }
        ]), mat: ZoneKit.lam(P.rockCool),
        place(slot, m) {
          if (hash(slot, 341) > 0.6) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.66 + hash(slot, 343) * 0.7), y: ceil ? H - 0.2 : 0.2,
                   rz: ceil ? Math.PI : 0, ry: (hash(slot, 347) - 0.5) * 0.8, dz: hash(slot, 349) * 5 };
        }
      });
    }

    /* --- 12. 宝箱（金の縁と、隙間からこぼれる光 / 契約§5） ---------------- */
    {
      const chest = ZoneKit.merge([
        { g: ZoneKit.box(0.52, 0.30, 0.38), p: [0, 0.15, 0] },
        { g: ZoneKit.box(0.55, 0.10, 0.41), p: [0, 0.34, 0] },
        { g: ZoneKit.box(0.09, 0.34, 0.41), p: [-0.20, 0.17, 0] },
        { g: ZoneKit.box(0.09, 0.34, 0.41), p: [0.20, 0.17, 0] },
        { g: ZoneKit.box(0.12, 0.12, 0.06), p: [0, 0.20, -0.20] }
      ]);
      const placeC = (slot, m) => {
        if (hash(slot, 361) > 0.45) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.42), y: ceil ? H : 0, rz: ceil ? Math.PI : 0,
                 ry: (hash(slot, 363) - 0.5) * 0.9, dz: hash(slot, 367) * 3 };
      };
      F({ name: 'chest', spacing: 19, geo: chest, mat: ZoneKit.lam(0x5c4630), place: placeC });
      F({
        name: 'chestGold', spacing: 19, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.57, 0.04, 0.43), p: [0, 0.29, 0] },
          { g: ZoneKit.box(0.10, 0.10, 0.04), p: [0, 0.20, -0.21] },
          { g: ZoneKit.box(0.30, 0.03, 0.24), p: [0, 0.40, 0] }
        ]), mat: ZoneKit.bas(P.gold), prop: false, place: placeC
      });
      F({
        name: 'chestGlow', spacing: 19, geo: new THREE.CircleGeometry(0.62, 12),
        mat: ZoneKit.add(P.gold, 0.30), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeC(slot, m);
          if (!o) return null;
          const fl = 0.85 + 0.2 * Math.sin(t * 2.6 + slot);
          return { x: o.x, y: (o.rz ? H - 0.35 : 0.35), dz: o.dz,
                   ry: (o.x > 0) ? -Math.PI / 2 : Math.PI / 2, sx: fl, sy: fl };
        }
      });
    }

    /* --- 13. 貝（大きな二枚貝）＋ 14. ヒトデ ------------------------------ */
    {
      F({
        name: 'shell', spacing: 5.4, geo: ZoneKit.merge([
          { g: new THREE.SphereGeometry(0.22, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), p: [0, 0.02, 0], s: [1, 0.7, 1] },
          { g: ZoneKit.box(0.40, 0.05, 0.30), p: [0, 0.03, 0] },
          { g: new THREE.SphereGeometry(0.20, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), p: [0.04, 0.10, 0.06],
            r: [0.5, 0, 0], s: [1, 0.55, 1] }
        ]), mat: ZoneKit.lam(P.shell),
        place(slot, m) {
          if (hash(slot, 381) > 0.5) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.3 + hash(slot, 383) * 1.0), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 387) * 3, dz: hash(slot, 389) * 3,
                   sx: 0.7 + hash(slot, 391) * 0.8, sy: 0.7 + hash(slot, 393) * 0.6, sz: 0.7 + hash(slot, 397) * 0.8 };
        }
      });
      const star = [];
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        star.push({ g: ZoneKit.box(0.09, 0.035, 0.24), p: [Math.sin(a) * 0.11, 0, Math.cos(a) * 0.11], r: [0, a, 0] });
      }
      star.push({ g: ZoneKit.box(0.14, 0.04, 0.14), p: [0, 0.005, 0] });
      F({
        name: 'starfish', spacing: 4.6, geo: ZoneKit.merge(star), mat: ZoneKit.lam(0xff9a6a),
        place(slot, m) {
          if (hash(slot, 401) > 0.42) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.2 + hash(slot, 403) * 1.3), y: ceil ? H - 0.02 : 0.02,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 407) * 3, dz: hash(slot, 409) * 3 };
        }
      });
      /* ウニ（棘の球。小さな暗い点で密度を上げる） */
      const urchin = [{ g: new THREE.IcosahedronGeometry(0.10, 0), p: [0, 0.10, 0] }];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        urchin.push({ g: ZoneKit.box(0.02, 0.16, 0.02), p: [Math.cos(a) * 0.10, 0.14, Math.sin(a) * 0.10],
                      r: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] });
      }
      F({
        name: 'urchin', spacing: 3.6, geo: ZoneKit.merge(urchin), mat: ZoneKit.lam(0x3a2a4a),
        place(slot, m) {
          if (hash(slot, 411) > 0.45) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.2 + hash(slot, 413) * 1.2), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, dz: hash(slot, 417) * 2,
                   sx: 0.7 + hash(slot, 419) * 0.8, sy: 0.7 + hash(slot, 419) * 0.8, sz: 0.7 + hash(slot, 419) * 0.8 };
        }
      });
    }

    /* --- 15. 錨と鎖（沈没船の名残） --------------------------------------- */
    {
      const anchor = ZoneKit.merge([
        { g: ZoneKit.box(0.09, 1.0, 0.09), p: [0, 0.5, 0] },
        { g: ZoneKit.box(0.62, 0.10, 0.10), p: [0, 0.86, 0] },
        { g: ZoneKit.box(0.14, 0.34, 0.10), p: [-0.26, 0.16, 0], r: [0, 0, -0.5] },
        { g: ZoneKit.box(0.14, 0.34, 0.10), p: [0.26, 0.16, 0], r: [0, 0, 0.5] },
        { g: ZoneKit.box(0.20, 0.05, 0.05), p: [0, 1.04, 0] },
        { g: ZoneKit.box(0.05, 0.05, 0.16), p: [0, 1.04, 0] }
      ]);
      F({
        name: 'anchor', spacing: 24, geo: anchor, mat: ZoneKit.lam(P.rust),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.56), y: ceil ? H : 0, rz: (ceil ? Math.PI : 0) + (side > 0 ? 0.2 : -0.2),
                   ry: side > 0 ? 0.3 : -0.3, dz: hash(slot, 421) * 4 };
        }
      });
      const chain = [];
      for (let i = 0; i < 6; i++) {                     // 鎖の輪は箱で表す（三角形の予算 / 契約§3）
        chain.push({ g: ZoneKit.box(0.13, 0.03, 0.05), p: [0, 0.07, -0.5 + i * 0.2],
                     r: [0, (i % 2) * Math.PI / 2, 0] });
      }
      F({
        name: 'chain', spacing: 8.5, geo: ZoneKit.merge(chain), mat: ZoneKit.lam(P.rust),
        place(slot, m) {
          if (hash(slot, 431) > 0.52) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.3 + hash(slot, 433) * 0.9), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: (hash(slot, 437) - 0.5) * 1.4, dz: hash(slot, 439) * 3 };
        }
      });
    }

    /* --- 16. 船の破片（板・樽・舷窓） ------------------------------------- */
    {
      F({
        name: 'debris', spacing: 3.2, geo: ZoneKit.merge([
          { g: ZoneKit.box(0.44, 0.06, 0.22), p: [0, 0.03, 0], r: [0, 0.3, 0.06] },
          { g: ZoneKit.box(0.30, 0.05, 0.16), p: [0.20, 0.08, 0.10], r: [0.1, 1.0, -0.2] }
        ]), mat: ZoneKit.lam(P.wreckLit),
        place(slot, m) {
          if (hash(slot, 441) > 0.55) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.2 + hash(slot, 443) * 1.3), y: ceil ? H - 0.02 : 0.02,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 447) * 3, dz: hash(slot, 449) * 3 };
        }
      });
      const barrel = ZoneKit.merge([
        { g: ZoneKit.cyl(0.17, 0.42, 7), p: [0, 0.17, 0], r: [Math.PI / 2, 0, 0] },
        { g: ZoneKit.cyl(0.18, 0.04, 7), p: [0, 0.17, -0.14], r: [Math.PI / 2, 0, 0] },
        { g: ZoneKit.cyl(0.18, 0.04, 7), p: [0, 0.17, 0.14], r: [Math.PI / 2, 0, 0] }
      ]);
      F({
        name: 'barrel', spacing: 8.5, geo: barrel, mat: ZoneKit.lam(P.wreck),
        place(slot, m) {
          if (hash(slot, 451) > 0.5) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.42 + hash(slot, 453) * 0.8), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: (hash(slot, 457) - 0.5) * 1.6, dz: hash(slot, 459) * 4 };
        }
      });
    }

    /* --- 17. 外側の岩棚（列柱の外の通路。小物はこの上に載る） ------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(1.5, 0.16, 4.0), p: [0, -0.08, 0] },
        { g: ZoneKit.box(0.22, 0.26, 4.0), p: [0.70, 0.05, 0] },
        { g: ZoneKit.box(1.5, 0.05, 0.10), p: [0, 0.01, -1.9] },
        { g: ZoneKit.box(1.5, 0.05, 0.10), p: [0, 0.01, 1.9] }
      ]);
      F({
        name: 'ledge', spacing: 4, geo: g, mat: ZoneKit.lam(P.wallDark),
        place(slot, m) {
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.82), y: ceil ? H : 0, ry: side > 0 ? 0 : Math.PI, rz: ceil ? Math.PI : 0 };
        }
      });
    }

    /* --- 18. 海底の砂紋（床と天井の意匠 / onTrack） ----------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(1.0, 0.02, 0.10), p: [0, 0, -0.3], r: [0, 0.06, 0] },
        { g: ZoneKit.box(1.0, 0.02, 0.10), p: [0, 0, 0], r: [0, -0.04, 0] },
        { g: ZoneKit.box(1.0, 0.02, 0.10), p: [0, 0, 0.3], r: [0, 0.08, 0] }
      ]);
      F({
        name: 'ripple', onTrack: true, spacing: 3.1, geo: g, mat: ZoneKit.lam(P.sand),
        place(slot, m) {
          if (hash(slot, 461) > 0.62) return null;
          const ceil = (slot % 2) === 1;
          const lane = CFG.LANES[Math.floor(hash(slot, 463) * 3)] * CFG.LANE_W;
          return { x: lane, y: ceil ? H - 0.012 : 0.012, rx: ceil ? Math.PI : 0, dz: hash(slot, 467) * 3 };
        }
      });
    }

    /* --- 19. 光の帯（コースティクス風のストライプ / 契約§5） --------------
       水面の揺らぎが床と天井に落ちる薄い発光板。明部と「水の中」らしさの主役。 */
    {
      const g = new THREE.PlaneGeometry(0.60, 5.2);
      const gHot = new THREE.PlaneGeometry(0.30, 5.0);
      [['floor', 0.028, -Math.PI / 2], ['ceil', CFG.H - 0.028, Math.PI / 2]].forEach((sfc, si) => {
        const placeC = (slot, m, t) => {
          if ((slot & 1) !== si) return null;
          const h1 = hash(slot, 471), h2 = hash(slot, 473);
          const sway = Math.sin(t * 0.9 + slot * 0.7) * 0.5;
          return { x: (h1 - 0.5) * 5.4 + sway, y: sfc[1], rx: sfc[2],
                   rz: (h2 - 0.5) * 0.5, sx: 0.6 + 0.6 * Math.abs(Math.sin(t * 1.3 + slot)),
                   sy: 0.8 + h2 * 0.8 };
        };
        F({ name: 'caustic', onTrack: true, spacing: 2.0, geo: g, mat: ZoneKit.add(P.caustic, 0.56),
            prop: false, order: 4, place: placeC });
        /* 帯の芯（白く焼ける筋）。halo と重なって初めて明部（200以上）になる。
           契約§3 の輝度基準「明部 3〜8%」を作る主役。 */
        F({
          name: 'causticHot', onTrack: true, spacing: 2.0, geo: gHot,
          mat: ZoneKit.add(0xf2ffff, 0.86), prop: false, order: 4,
          place(slot, m, t) {
            const o = placeC(slot, m, t);
            if (!o) return null;
            o.y = (si === 0) ? 0.034 : CFG.H - 0.034;
            return o;
          }
        });
      });
      /* 壁に映る帯（壁区間で奥行きが出る） */
      F({
        name: 'causticWall', spacing: 3.4, geo: new THREE.PlaneGeometry(4.6, 0.36),
        mat: ZoneKit.add(P.caustic, 0.42), prop: false, order: 4,
        place(slot, m, t) {
          if (!isWall(m + 2)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (XW + 0.55), y: 0.5 + hash(slot, 481) * (CFG.H - 1.0) + Math.sin(t + slot) * 0.3,
                   ry: side > 0 ? -Math.PI / 2 : Math.PI / 2,
                   sy: 0.7 + 0.5 * Math.abs(Math.sin(t * 1.1 + slot)) };
        }
      });
    }

    /* --- 19b. 壁の発光群体（壁区間の明部。契約§3 の輝度基準 明部3〜8%を作る） */
    {
      const placeG = (slot, m) => {
        if (!isWall(m + 2)) return null;
        if (hash(slot, 601) > 0.60) return null;
        const side = (slot % 2) ? 1 : -1;
        return { x: side * (XW + 0.50), y: 0.4 + hash(slot, 603) * (CFG.H - 0.8),
                 ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, dz: hash(slot, 607) * 3 };
      };
      F({
        name: 'glowPatch', spacing: 3.2, geo: new THREE.CircleGeometry(0.46, 10),
        mat: ZoneKit.bas(P.jellyHot), place: placeG
      });
      F({
        name: 'glowHalo', spacing: 3.2, geo: new THREE.CircleGeometry(0.96, 12),
        mat: ZoneKit.add(P.caustic, 0.44), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeG(slot, m);
          if (!o) return null;
          const fl = 0.8 + 0.25 * Math.sin(t * 1.7 + slot * 2.3);
          o.sx = fl; o.sy = fl;
          return o;
        }
      });
    }

    /* --- 20. 水面から落ちる光の柱（開放区間・黒潰れ防止の主役） ----------- */
    {
      const beam = ZoneKit.merge([{ g: ZoneKit.box(2.1, CFG.H + 7.0, 2.1), p: [0, 0, 0] }]);
      const placeS = (slot, m, t) => {
        if (isWall(m)) return null;
        const side = (hash(slot, 491) > 0.5) ? 1 : -1;
        return { x: side * (HW + 1.45 + hash(slot, 493) * 1.4), y: CFG.H / 2 + 1.6,
                 rz: 0.10 * side, sx: 0.8 + 0.12 * Math.sin(t * 0.8 + slot) };
      };
      F({ name: 'shaft', spacing: 12, geo: beam, mat: ZoneKit.add(P.caustic, 0.26), prop: false, order: 2,
          place: placeS });
      /* 芯（水面からまっすぐ届く強い光）。重ねて明部を作る（契約§3 の輝度基準） */
      F({
        name: 'shaftCore', spacing: 12, geo: new THREE.PlaneGeometry(0.72, CFG.H + 7.0),
        mat: ZoneKit.add(0xdcfbff, 0.50), prop: false, order: 3,
        place(slot, m, t) {
          const o = placeS(slot, m, t);
          if (!o) return null;
          o.ry = (o.x > 0) ? -Math.PI / 2 : Math.PI / 2;
          o.sx = 0.7 + 0.25 * Math.sin(t * 1.4 + slot);
          return o;
        }
      });
      /* 光が落ちた所の明るい溜まり */
      F({
        name: 'shaftPool', spacing: 12, geo: new THREE.CircleGeometry(1.7, 16),
        mat: ZoneKit.add(0xcaf6ff, 0.62), prop: false, order: 4,
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (hash(slot, 491) > 0.5) ? 1 : -1;
          return { x: side * (HW + 1.45 + hash(slot, 493) * 1.4), y: 0.03, rx: -Math.PI / 2 };
        }
      });
      F({
        name: 'shaftPoolHot', spacing: 12, geo: new THREE.CircleGeometry(0.92, 14),
        mat: ZoneKit.add(0xe8fdff, 0.48), prop: false, order: 4,
        place(slot, m, t) {
          if (isWall(m)) return null;
          const side = (hash(slot, 491) > 0.5) ? 1 : -1;
          return { x: side * (HW + 1.45 + hash(slot, 493) * 1.4), y: 0.045, rx: -Math.PI / 2,
                   sx: 0.85 + 0.15 * Math.sin(t * 1.2 + slot), sy: 0.85 + 0.15 * Math.sin(t * 1.6 + slot) };
        }
      });
    }

    /* --- 21. 泡の噴出孔（海底から立ち上る泡の柱） ------------------------- */
    {
      const vent = ZoneKit.merge([
        { g: ZoneKit.cyl(0.18, 0.22, 8), p: [0, 0.11, 0] },
        { g: ZoneKit.cyl(0.11, 0.16, 8), p: [0, 0.28, 0] }
      ]);
      const placeV = (slot, m) => {
        if (hash(slot, 501) > 0.4) return null;
        const side = (slot % 2) ? 1 : -1;
        const ceil = ((slot >> 1) % 2) === 1;
        return { x: side * (HW + 0.38 + hash(slot, 503) * 0.8), y: ceil ? H : 0,
                 rz: ceil ? Math.PI : 0, dz: hash(slot, 507) * 3 };
      };
      F({ name: 'vent', spacing: 10, geo: vent, mat: ZoneKit.lam(P.rockDark), place: placeV });
      F({
        name: 'ventPlume', spacing: 10, geo: new THREE.PlaneGeometry(0.34, 2.6),
        mat: ZoneKit.add(P.bubble, 0.24), prop: false, order: 4,
        place(slot, m, t) {
          const o = placeV(slot, m);
          if (!o) return null;
          return { x: o.x, y: (o.rz ? CFG.H - 1.5 : 1.5), dz: o.dz,
                   ry: (o.x > 0) ? -Math.PI / 2 : Math.PI / 2,
                   sx: 0.7 + 0.35 * Math.sin(t * 2.4 + slot), sy: 1 };
        }
      });
    }

    /* --- 22. チューブワーム（赤い管虫の群れ） ----------------------------- */
    {
      const parts = [];
      for (let i = 0; i < 5; i++) {
        const h2 = 0.24 + ZoneKit.hash(i, 511) * 0.32;
        parts.push({ g: ZoneKit.box(0.06, h2, 0.06), p: [(i - 2) * 0.09, h2 / 2, (i % 2) * 0.07],
                     r: [0, 0, (i - 2) * 0.08] });
        parts.push({ g: ZoneKit.box(0.09, 0.09, 0.09), p: [(i - 2) * 0.09, h2, (i % 2) * 0.07] });
      }
      F({
        name: 'tubeworm', spacing: 6.5, geo: ZoneKit.merge(parts), mat: ZoneKit.lam(0xd8503f),
        place(slot, m) {
          if (hash(slot, 513) > 0.48) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.26 + hash(slot, 517) * 1.0), y: ceil ? H : 0,
                   rz: ceil ? Math.PI : 0, ry: hash(slot, 519) * 3, dz: hash(slot, 521) * 3,
                   sy: 0.7 + hash(slot, 523) * 0.8 };
        }
      });
    }

    /* --- 23. アーチ状の岩（開放区間で床と天井をつなぐ） ------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.46, H + 1.4, 0.50), p: [0, 0, 0], r: [0, 0, 0.03] },
        { g: ZoneKit.box(0.70, 0.34, 0.70), p: [0, H * 0.5 + 0.5, 0] },
        { g: ZoneKit.box(0.76, 0.34, 0.76), p: [0, -H * 0.5 - 0.5, 0] },
        { g: ZoneKit.box(1.1, 0.30, 0.40), p: [-0.48, H * 0.36, 0], r: [0, 0, -0.66] },
        { g: ZoneKit.box(1.1, 0.30, 0.40), p: [-0.48, -H * 0.36, 0], r: [0, 0, 0.66] }
      ]);
      F({
        name: 'arch', spacing: 17, geo: g, mat: ZoneKit.lam(P.rock),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (HW + 0.70), y: H * 0.5, ry: side > 0 ? 0 : Math.PI };
        }
      });
    }

    /* --- 24. 縁の岩（開放区間の縁を縫う小さな岩） ------------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(0.22, 0.44, 0.22), p: [0, 0.22, -1.1], r: [0, 0.3, 0.06] },
        { g: ZoneKit.box(0.20, 0.34, 0.20), p: [0.02, 0.17, 1.1], r: [0, 0.7, -0.05] },
        { g: ZoneKit.box(0.26, 0.14, 2.6), p: [0, 0.07, 0] }
      ]);
      F({
        name: 'rimrock', spacing: 3.6, geo: g, mat: ZoneKit.lam(P.rockDark),
        place(slot, m) {
          if (isWall(m)) return null;
          if (hash(slot, 531) > 0.84) return null;
          const side = (slot % 2) ? 1 : -1;
          const ceil = ((slot >> 1) % 2) === 1;
          return { x: side * (HW + 0.24), y: ceil ? H - 0.18 : 0.18, rz: ceil ? Math.PI : 0 };
        }
      });
    }

    /* --- 25. 深みの岩（開放区間の外・下へ落ち込む海溝） ------------------- */
    {
      const g = ZoneKit.merge([
        { g: ZoneKit.box(5, 16, 9), p: [0, -8, 0] },
        { g: ZoneKit.box(3.4, 10, 6), p: [-1.6, -4, 2], r: [0, 0.3, 0.06] },
        { g: ZoneKit.box(2.4, 7, 5), p: [1.2, -11, -2.5], r: [0, -0.2, 0.1] }
      ]);
      F({
        name: 'cliff', spacing: 13, geo: g, mat: ZoneKit.lam(0x2c5158),
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * (11.5 + hash(slot, 541) * 5), y: -5.2 - hash(slot, 543) * 3,
                   ry: hash(slot, 547) * 0.8,
                   sx: 1 + hash(slot, 549), sy: 1 + hash(slot, 551) * 1.4, sz: 1 + hash(slot, 553) };
        }
      });
      /* 海溝の底の靄（中間調を作る） */
      F({
        name: 'haze', spacing: 12, geo: new THREE.PlaneGeometry(22, 12),
        mat: ZoneKit.add(0x5fa8b8, 0.05), prop: false, order: 1,
        place(slot, m) {
          if (isWall(m)) return null;
          const side = (slot % 2) ? 1 : -1;
          return { x: side * 7, y: -5.5, rx: -Math.PI / 2 };
        }
      });
    }
  },

  /* ==========================================================================
     毎フレームの送り出し
     ========================================================================== */
  sync(dist, t, speed) {
    if (!ZoneSea.scene) return;
    ZoneSea._t = t;
    ZoneSea._speed = speed || CFG.SPEED_MIN;
    ZoneSea._spd01 = U.clamp((ZoneSea._speed - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
    /* 巨大魚の遠景カットのあいだだけ小物を間引く（演出側の割合を読むだけ） */
    ZoneSea._clear = (typeof Setpieces !== 'undefined' && Setpieces.fishClearK)
      ? Setpieces.fishClearK(dist) : 0;
    ZoneSea.aheadCount = ZoneKit.syncFields(ZoneSea, dist, t, false);

    /* 遠景の層を視差で流す。**巨大魚の横向きカットのあいだは伏せる**
       （沈没船や岩礁のシルエットが巨体に重なると「生き物」と読めなくなる。
       背景は深い青のグラデと光の柱だけにする / 契約 P4a-4）。 */
    const sideCut = (typeof Setpieces !== 'undefined' && Setpieces.fishSideK)
      ? Setpieces.fishSideK(dist) : 0;
    for (let i = 0; i < ZoneSea.farLayers.length; i++) {
      const g = ZoneSea.farLayers[i];
      g.position.z = (dist * g.userData.par) % g.userData.len;
      g.visible = (sideCut < 0.12);
    }
    /* 遠景の光の柱をゆっくり揺らす（水面の揺らぎ） */
    if (ZoneSea.farShafts) {
      const ch = ZoneSea.farShafts.children;
      for (let i = 0; i < ch.length; i++) {
        ch[i].material.opacity = (0.14 + 0.10 * i * 0.3) * (0.7 + 0.3 * Math.sin(t * 0.6 + i * 1.7));
      }
    }
    /* 発光生物の点光を流す（揺らぎつき）＝濡れた岩に明るい溜まりができる */
    if (ZoneSea.glowA) {
      const a = 28, b = 21;
      const fa = 0.72 + 0.28 * Math.sin(t * 1.9) + 0.08 * Math.sin(t * 5.3);
      const fb = 0.70 + 0.30 * Math.sin(t * 1.4 + 1.2);
      ZoneSea.glowA.position.set(-1.95, 1.3, -(a - (dist % a)));
      ZoneSea.glowA.intensity = 22.0 * fa;
      ZoneSea.glowB.position.set(1.95, CFG.H - 1.2, -(b - (dist % b)));
      ZoneSea.glowB.intensity = 15.0 * fb;
    }
    /* 大演出「巨大魚の通過」（§4.4 S5）: 魚体の面を起こす明かりと、縁を光らせる逆光。
       位置は Setpieces から距離を読むだけ（演出側＝setpieces は照明を触らない）。 */
    if (ZoneSea.fishKey) {
      const Sp = (typeof Setpieces !== 'undefined') ? Setpieces : null;
      const on = !!(Sp && Sp.fishActive && Sp.fishActive());
      if (on) {
        const m = Sp.state.dist || Sp.state.startM;
        const p = Sp.fishPos(m);
        const fl = 0.86 + 0.14 * Math.sin(t * 2.6);
        /* 遠景のシルエットでは弱く（輪郭だけ抜く）、至近では強く面を起こす。
           強さの決め方は演出側（Setpieces.fishLightK）から読むだけ。 */
        const k = Sp.fishLightK ? Sp.fishLightK(m) : 1;
        ZoneSea.fishKey.position.set(p.x * 0.35, CFG.H * 0.9, p.z + 6);
        ZoneSea.fishKey.intensity = 34 * fl * k;
        ZoneSea.fishKey.distance = 46 + 40 * (1 - k);
        ZoneSea.fishRim.position.set(-p.x * 0.3, CFG.H * 1.9, p.z - 10);
        ZoneSea.fishRim.intensity = 26 * fl * (0.4 + 0.6 * k);
      } else if (ZoneSea.fishKey.intensity !== 0) {
        ZoneSea.fishKey.intensity = 0;
        ZoneSea.fishRim.intensity = 0;
      }
    }
    if (ZoneSea.speedLines) {
      const op = 0.16 + ZoneSea._spd01 * 0.34;
      ZoneSea.speedLines.forEach((f) => { f.mesh.material.opacity = op; });
    }
    if (ZoneSea.wind) {
      ZoneSea.windMat.opacity = 0.08 + ZoneSea._spd01 * 0.22;
      ZoneSea.wind.position.z = (dist % ZoneSea.WIND_CELL);
    }
  },

  propsAhead() { return ZoneSea.aheadCount || 0; }
};

/* ============================================================================
   障害物の見た目（深海のスキン / 契約§4.3 の指定・§5）
   判定（OBS）はネオン都市・古代遺跡と完全に同じ。ここは珊瑚・沈没船・電気生物に
   置き換えるだけ。
     ローバー     → サンゴの枝の柵／沈没船の残骸
     ピラー       → 海藻の柱（岩柱）
     ギャップ     → 海溝の裂け目
     ローレーザー → **電気クラゲの触手**（横に伸びる光）
     縦レーザー   → **電気ウナギの放電柱**
     ワイド梁     → 沈没船の帆桁
     壁の穴       → 沈没船の船壁の穴
     横スキャン   → 触手のスキャン
     回転         → 回転する発光クラゲ
   ============================================================================ */
ZoneSea.obstacleSkin = {
  id: 'sea',
  COL: {
    /* 背景（青緑 0x3d6b73 前後）から浮くよう、危険物は「濃い影＋電光／暖色のサンゴ」で作る */
    body: 0xb9cfd2, dark: 0x1e3c44, steel: 0x6d8f96, deep: 0x0b2029,
    warn: 0xffd15a, warnDim: 0x7a5a10, red: 0xff5540, amber: 0xffd27a,
    cyan: 0x7ff2e0, magenta: 0xff7ad0, pit: 0x03151d,
    fire: 0x62e8ff, fireHot: 0xe8fbff, blade: 0xd6ecef, bladeEdge: 0xffffff,
    gold: 0xffd870, moss: 0x4e8a55, coral: 0xff7a6a, coral2: 0xffb45c,
    jelly: 0x9fe4ff, wreck: 0x4a3a2c
  },

  build(type, x) {
    const t = x.t, C = x.C, g = x.g, w = x.w, D = x.D;
    const box = x.box, solid = x.solid, lamp = x.lamp, beamMat = x.beamMat;
    /* 岩の欠け・貝の付着（縁の不ぞろい） */
    const chips = (gw, y, z, n, mat, scale) => {
      for (let i = 0; i < n; i++) {
        const s = 0.07 + ZoneKit.hash(i, 71) * 0.09;
        box(s * (scale || 1), s, s, mat, -gw / 2 + gw * (i + 0.5) / n, y, z,
            [ZoneKit.hash(i, 73) * 2, ZoneKit.hash(i, 79) * 2, ZoneKit.hash(i, 83) * 2]);
      }
    };

    if (type === 'ROVER') {
      /* サンゴの枝の柵（高さ 0.60 = 判定どおり）: 岩の土台に枝サンゴが並ぶ */
      const matB = Obstacles._material('rvRock', C.dark);
      const matC = Obstacles._material('rvCoral', C.coral);
      box(w, 0.20, D * 0.86, matB, 0, 0.10, 0);
      box(w, 0.07, D, Obstacles._material('rvLip', C.steel), 0, 0.235, 0);
      for (let i = 0; i < 5; i++) {
        const px = -w / 2 + w * (i + 0.5) / 5;
        solid(new THREE.ConeGeometry(0.10, 0.32, 5), matC, px, 0.41, 0, [0, 0, (i - 2) * 0.06]);
        box(0.10, 0.10, 0.10, Obstacles._material('rvCoral2', C.coral2), px + 0.04, 0.50, 0.04);
      }
      box(w, 0.13, D * 1.05, Obstacles._emissive('rvEdge', C.warn), 0, 0.545, 0);
      box(w, 0.09, D * 0.62, Obstacles._emissive('rvEdge2', C.red), 0, 0.30, 0);
      box(w * 0.98, 0.06, D + 0.10, Obstacles._emissive('rvFoot', C.fire), 0, 0.03, 0);
      lamp(0.045, C.fire, -w / 2 + 0.09, 0.58, 0);
      lamp(0.045, C.fire, w / 2 - 0.09, 0.58, 0);

    } else if (type === 'WALLHOLE' || type === 'WALLSOLID') {
      /* 沈没船の船壁の穴: 板張りの船壁のうち、このレーンだけ下に低い穴が空く */
      const hole = (type === 'WALLHOLE');
      const y0 = hole ? t.y0 : 0;
      const TOP = t.y1;
      const matW = Obstacles._material('whHull', C.wreck);
      const matR = Obstacles._material('whRib', C.steel);
      box(w, TOP - y0, D * 0.6, matW, 0, (TOP + y0) / 2, 0);
      for (let i = 0; i < 4; i++) {                               // 板の継ぎ目
        box(w - 0.04, 0.05, D * 0.72, matR, 0, y0 + (TOP - y0) * (i + 1) / 5, 0);
      }
      box(w, 0.14, D * 0.86, matR, 0, TOP - 0.07, 0);
      box(w, 0.06, D * 0.92, Obstacles._emissive('whTop', C.warn), 0, TOP - 0.16, 0);
      if (hole) {
        box(w, 0.14, D * 0.9, matR, 0, y0 + 0.07, 0);             // 割れ口の縁
        [-1, 1].forEach((s) => box(0.10, y0, D * 0.8, matR, s * (w / 2 - 0.05), y0 / 2, 0));
        box(w, 0.10, D + 0.06, Obstacles._emissive('whWarn', C.fire), 0, y0 + 0.02, 0);
        box(w * 0.86, 0.03, D + 0.02, Obstacles._emissive('whGuide', C.cyan), 0, 0.025, 0);
        [-1, 1].forEach((s) => box(0.05, y0 - 0.06, 0.05, Obstacles._emissive('whGuide', C.cyan),
                                   s * (w / 2 - 0.10), (y0 - 0.06) / 2, D / 2 - 0.03));
        lamp(0.05, C.fire, -w / 2 + 0.09, y0 + 0.12, D / 2 - 0.05);
        lamp(0.05, C.fire, w / 2 - 0.09, y0 + 0.12, D / 2 - 0.05);
      } else {
        /* 通れない面: 塞がれた舷窓と藻 */
        box(w * 0.5, 0.5, 0.06, Obstacles._emissive('whX', C.red), 0, TOP * 0.45, D / 2 - 0.03);
        box(w * 0.74, 0.12, 0.06, Obstacles._material('whMoss', C.moss), 0, TOP * 0.78, D / 2 - 0.03);
        lamp(0.055, C.red, 0, TOP - 0.24, D / 2 - 0.04);
      }

    } else if (type === 'LASER_LOW') {
      /* **電気クラゲの触手**（契約§4.3 P4a）: 0〜0.60 を横に走る光＝ジャンプで越える */
      const y1 = t.y1, beam = y1 * 0.5;
      const matDev = Obstacles._material('elNode', C.steel);
      [-1, 1].forEach((s) => {
        box(0.20, 0.30, D * 1.2, matDev, s * (w / 2 - 0.03), 0.15, 0);       // 両端の発電節
        box(0.22, 0.07, D * 1.25, Obstacles._emissive('elLip', C.warn), s * (w / 2 - 0.03), 0.32, 0);
        solid(new THREE.SphereGeometry(0.11, 8, 6), Obstacles._emissive('elBulb', C.jelly),
              s * (w / 2 - 0.03), 0.40, 0);
      });
      box(w, 0.09, D * 0.7, Obstacles._material('elSlot', C.pit), 0, 0.045, 0);
      /* 触手そのもの（点滅の対象＝消えている間は通れる） */
      box(w, y1 * 0.92, 0.26, beamMat(Obstacles._material('elArc', C.fire, 0.80)), 0, beam, 0);
      box(w * 0.96, y1 * 0.58, 0.15, beamMat(Obstacles._emissive('elHot', C.fireHot)), 0, beam * 0.9, 0);
      box(w, 0.09, D, beamMat(Obstacles._emissive('elBase', C.red)), 0, 0.045, 0);
      lamp(0.045, C.fire, -w / 2 + 0.05, y1 - 0.06, D / 2 - 0.05);
      lamp(0.045, C.fire, w / 2 - 0.05, y1 - 0.06, D / 2 - 0.05);

    } else if (type === 'LASER_V') {
      /* **電気ウナギの放電柱**（契約§4.3 P4a）: 1レーン全高＝横に避ける */
      const y0 = t.y0, y1 = t.y1, hh = y1 - y0, yc = (y0 + y1) / 2;
      const matDev = Obstacles._material('eeNode', C.steel);
      [[y0, 1], [y1, -1]].forEach((e) => {
        box(w * 0.86, 0.22, D * 1.1, matDev, 0, e[0] + e[1] * 0.11, 0);        // 放電極
        box(w * 0.62, 0.08, D * 1.16, Obstacles._emissive('eeLip', C.warn), 0, e[0] + e[1] * 0.24, 0);
      });
      box(w * 0.66, hh, D * 0.7, beamMat(Obstacles._material('eeHalo', C.fire, 0.30)), 0, yc, 0);
      box(w * 0.40, hh, 0.10, beamMat(Obstacles._material('eeGlow', C.fire, 0.62)), 0, yc, 0);
      box(w * 0.22, hh, 0.14, beamMat(Obstacles._emissive('eeCore', C.fireHot)), 0, yc, 0);
      /* うねる電流（軸をずらした細い柱を重ねる＝放電に見える） */
      [-1, 1].forEach((s) => {
        box(w * 0.10, hh * 0.9, 0.08, beamMat(Obstacles._emissive('eeArc', C.jelly)),
            s * w * 0.18, yc, 0, [0, 0, s * 0.05]);
      });
      lamp(0.05, C.fire, 0, y0 + 0.34, D / 2 - 0.06);
      lamp(0.05, C.fire, 0, y1 - 0.34, D / 2 - 0.06);

    } else if (type === 'PILLAR') {
      /* 海藻の柱／岩柱（全高）: 床天井の両方に効くので上下対称に彫る */
      const H = CFG.H;
      const matB = Obstacles._material('plRock', C.dark);
      const zk = (D * 0.98) / (2 * w * 0.34);
      solid(new THREE.CylinderGeometry(w * 0.32, w * 0.32, H, 9), matB, 0, H / 2, 0, null, [1, 1, zk]);
      /* まとわりつく海藻（色を足して背景から分ける） */
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        box(0.10, H - 0.6, 0.10, Obstacles._material('plKelp', C.moss),
            Math.cos(a) * w * 0.33, H / 2, Math.sin(a) * w * 0.33 * zk, [0, 0, 0.04 * (i - 3)]);
      }
      [[0.22, 1], [H - 0.22, -1]].forEach((e) => {
        box(w * 0.94, 0.26, D * 1.2, matB, 0, e[0], 0);
        box(w * 0.78, 0.14, D * 1.05, Obstacles._material('plCap', C.steel), 0, e[0] + e[1] * 0.2, 0);
        box(w * 0.86, 0.10, D * 1.15, Obstacles._emissive('plWarn', C.warn), 0, e[0] + e[1] * 0.30, 0);
      });
      box(w * 0.28, H - 1.0, 0.07, Obstacles._emissive('plVein', C.fire), 0, H / 2, D / 2 - 0.02);
      lamp(0.05, C.fire, 0, H - 0.5, D / 2 - 0.04);
      lamp(0.05, C.fire, 0, 0.5, D / 2 - 0.04);

    } else if (type === 'GAP') {
      /* 海溝の裂け目: 海底が割れて下の闇が見える。縁は岩の欠けと発光の目印 */
      const half = D / 2;
      const matPit = Obstacles._material('gpPit', C.pit);
      box(w, 0.04, D, matPit, 0, -1.55, 0);
      box(w * 0.8, 0.05, D * 0.7, Obstacles._emissive('gpBottom', C.red), 0, -1.50, 0);
      [-1, 1].forEach((s) => {
        box(w, 1.6, 0.05, matPit, 0, -0.8, s * half);
        box(0.05, 1.6, D, matPit, s * (w / 2), -0.8, 0);
      });
      const fillMat = Obstacles._material('gpFill', 0x2f5f68);
      [-1, 1].forEach((s2) => {
        [-0.20, -0.52, -0.86].forEach((y, i) => {
          box(w * 0.92, 0.07, 0.06, Obstacles._emissive(i ? 'gpRed' : 'gpWarn', i ? C.red : C.warn),
              0, y, s2 * (half - 0.05));
        });
        box(0.06, 0.9, D * 0.85, Obstacles._emissive('gpRed', C.red), s2 * (w / 2 - 0.04), -0.6, 0);
      });
      [-1, 1].forEach((s) => box(CFG.LANE_W - 0.07, 0.14, 3.0, fillMat, 0, -0.075, s * 2.3));
      [-1, 1].forEach((s2) => {
        [0.22, 0.48, 0.74].forEach((dz, i) => {
          box(w * (0.96 - i * 0.12), 0.03, 0.16, Obstacles._emissive(i % 2 ? 'gpRed' : 'gpWarn', i % 2 ? C.red : C.warn),
              0, 0.02, s2 * (half + dz));
        });
        box(w, 0.13, 0.17, Obstacles._emissive('gpWarn', C.warn), 0, 0.06, s2 * (half - 0.08));
        chips(w, 0.14, s2 * (half - 0.04), 5, Obstacles._material('gpChip', C.body));
        /* 縁の発光クラゲ（高さ0.34。ジャンプの軌道には干渉しない） */
        [-1, 1].forEach((sx) => {
          const px = sx * (w / 2 - 0.10);
          box(0.11, 0.28, 0.11, Obstacles._material('gpPost', C.dark), px, 0.14, s2 * (half - 0.09));
          solid(new THREE.SphereGeometry(0.09, 7, 5), Obstacles._emissive('gpBulb', C.jelly),
                px, 0.30, s2 * (half - 0.09));
          lamp(0.055, C.fire, px, 0.38, s2 * (half - 0.09));
        });
      });

    } else if (type === 'WIDEBAR') {
      /* 沈没船の帆桁（2レーン・高さ 2.20 = 判定どおり）: 斜めに刺さった帆桁と帆 */
      const H2 = t.y1;
      const matF = Obstacles._material('wbSpar', C.wreck);
      box(w, 0.28, D * 0.9, matF, 0, H2 - 0.14, 0);                      // 帆桁
      box(w, 0.22, D * 0.9, matF, 0, 0.11, 0);                           // 埋もれた下端
      [-1, 1].forEach((s) => box(0.26, H2, D * 0.8, matF, s * (w / 2 - 0.13), H2 / 2, 0));
      /* 破れた帆（ところどころ抜けている） */
      for (let i = 0; i < 6; i++) {
        const px = -w / 2 + 0.3 + (w - 0.6) * i / 5;
        if (i === 2) continue;
        box(0.26, H2 - 0.7, 0.26, Obstacles._material('wbSail', C.body, 0.72), px, H2 / 2, D * 0.1,
            [0, 0, (i - 2.5) * 0.04]);
      }
      box(w, 0.16, D * 1.02, Obstacles._emissive('wbTop', C.warn), 0, H2 - 0.32, 0);
      box(w, 0.14, D * 1.02, Obstacles._emissive('wbBot', C.red), 0, 0.26, 0);
      chips(w, H2 - 0.02, 0, 6, Obstacles._material('wbChip', C.steel));
      lamp(0.05, C.fire, -w / 2 + 0.14, H2 - 0.05, 0);
      lamp(0.05, C.fire, w / 2 - 0.14, H2 - 0.05, 0);

    } else if (type === 'LASER_SCAN') {
      /* **触手のスキャン**（契約§4.3 P4a）: 天井と床の発電節から伸びた触手が横へ振れる。
         見た目の寸法は判定（1レーン幅・全高）と同じ。 */
      const H = CFG.H;
      const matM = Obstacles._material('tsMount', C.steel);
      [[0.14, 1], [H - 0.14, -1]].forEach((e) => {
        box(w * 1.1, 0.24, D * 1.6, matM, 0, e[0], 0);
        box(w * 0.9, 0.07, D * 1.7, Obstacles._emissive('tsLip', C.warn), 0, e[0] + e[1] * 0.14, 0);
      });
      const hh = H - 0.3;
      box(w * 0.46, hh, 0.12, Obstacles._material('tsTent', C.jelly, 0.86), 0, H / 2, 0);
      box(w * 0.86, hh * 0.70, 0.07, Obstacles._material('tsTent2', C.jelly, 0.62), 0, H / 2, 0.02);
      box(w * 0.70, hh * 0.38, 0.07, Obstacles._material('tsTent3', C.blade, 0.50), 0, H / 2, -0.03);
      box(w * 0.14, hh, 0.14, Obstacles._emissive('tsEdge', C.bladeEdge), -w * 0.42, H / 2, -0.05);
      box(w * 0.14, hh, 0.14, Obstacles._emissive('tsEdge', C.bladeEdge), w * 0.42, H / 2, -0.05);
      box(w * 0.9, 0.10, 0.16, Obstacles._emissive('tsEdge2', C.warn), 0, H / 2, -0.06);
      for (let i = 0; i < 5; i++) {
        box(0.10, 0.10, 0.10, Obstacles._emissive('tsBead', C.fireHot), 0, 0.5 + i * 0.75, 0.12);
      }
      box(w * 0.70, hh, D * 0.6, Obstacles._material('tsAura', C.jelly, 0.16), 0, H / 2, 0);
      lamp(0.05, C.fire, 0, 0.42, D / 2 - 0.02);
      lamp(0.05, C.fire, 0, H - 0.42, D / 2 - 0.02);

    } else if (type === 'LASER_ROT') {
      /* **回転する発光クラゲ**（契約§4.3 P4a）: 面に居座るクラゲから触手の腕が振れる。
         腕と触手のカーテンは place() が bands() から直に置く＝見た目と判定がずれない。 */
      const matDev = Obstacles._material('rjBase', C.dark);
      box(w * 0.94, 0.26, D * 1.3, matDev, 0, 0.13, 0);
      solid(new THREE.SphereGeometry(w * 0.30, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.6),
            Obstacles._material('rjBell', C.jelly, 0.9), 0, 0.30, 0);
      box(w * 0.36, 0.10, D * 1.15, Obstacles._emissive('rjHot', C.fireHot), 0, 0.42, 0);
      box(w * 0.64, 0.06, D * 1.2, Obstacles._emissive('rjWarn', C.warn), 0, 0.28, 0);
      lamp(0.05, C.fire, 0, 0.46, 0);

    } else if (type === 'BRIDGE') {
      /* 崩れる橋（S3 の顔。エンドレスで深海に混ざることがある）: 朽ちた桟橋 */
      x.bridge({
        pit: Obstacles._material('bgPit', C.pit),
        deep: Obstacles._emissive('bgDeep', C.red),
        slab: Obstacles._material('bgSlab', C.wreck),
        beam: Obstacles._material('bgBeam', C.steel),
        edge: Obstacles._material('bgEdge', C.dark),
        post: Obstacles._material('bgPost', C.steel),
        mark: Obstacles._emissive('bgMark', C.warn)
      });

    } else if (type === 'SYNCPAD') {
      x.padKit({ stone: Obstacles._material('spRock', C.dark) });

    } else if (type === 'SYNCGAP') {
      x.syncKit({ stone: Obstacles._material('sgRock', C.body),
                  pit: Obstacles._material('sgPit', C.pit) });

    } else if (type === 'DROPCEIL') {
      x.dropKit({ stone: Obstacles._material('dcRock', C.body),
                  warn: Obstacles._emissive('dcWarn', C.warn) });

    } else if (type === 'COLUMN') {
      x.columnKit({ stone: Obstacles._material('coRock', C.body),
                    rib: Obstacles._material('coRib', C.dark),
                    warn: Obstacles._emissive('coWarn', C.warn),
                    hot: Obstacles._emissive('coHot', C.fire) });

    } else if (OBS[type].belt) {
      /* 海流ベルト（契約§4.5 / S5）: 流れの矢印と入口ゲート。当たり判定は持たない */
      x.beltKit({ arrow: C.cyan, line: C.jelly,
                  frame: Obstacles._material('cgFrame', C.dark) });

    } else if (OBS[type].door) {
      /* 色の扉（契約§4.5 / S5）: 珊瑚の門。色は place() が面と型から決める */
      x.doorKit({ frame: Obstacles._material('drFrame', C.dark) });

    } else if (type === 'LIFTPAD') {
      /* 浮上足場（契約§4.5 / S5）: 海底から迫り上がる岩の台 */
      x.liftKit({ base: Obstacles._material('lpBase', C.dark),
                  body: Obstacles._material('lpBody', C.steel) });

    } else if (OBS[type].fish) {
      /* 巨大魚の部位（契約§4.4 S5 の大演出） */
      x.fishKit({ flesh: Obstacles._material('fsFlesh', 0x3c7784),
                  bone: Obstacles._material('fsBone', 0xdcd6bf),
                  hotCol: C.warn });

    } else if (type === 'SLOWBAND') {
      /* 減速帯（砂の山）: 死なないが越えないと速度が落ちる */
      const TOP = t.y1;
      box(w, TOP * 0.55, D * 0.86, Obstacles._material('sbSand', C.steel), 0, TOP * 0.27, 0);
      box(w * 0.78, TOP * 0.88, D * 0.66, Obstacles._material('sbSand2', C.body), 0, TOP * 0.44, 0);
      for (let i = 0; i < 5; i++) {
        const px = -w / 2 + w * (i + 0.5) / 5;
        box(0.17 + (i % 2) * 0.06, 0.17, 0.17, Obstacles._material('sbRock', C.dark),
            px, TOP * (0.52 + (i % 3) * 0.07), (i % 2 ? 0.08 : -0.08), [0.3 * i, 0.5 * i, 0.2 * i]);
      }
      box(w, 0.07, D + 0.05, Obstacles._emissive('sbMark', C.cyan), 0, 0.03, 0);
      box(w * 0.92, 0.06, 0.06, Obstacles._emissive('sbTop', C.cyan), 0, TOP - 0.03, 0);

    } else {
      /* 滑空区間の空中障害物（S2 専用。深海では出ないが、スキンは全型を持つ）:
         漂う瓦礫として、判定どおりの寸法で置く */
      const TOP = t.y1;
      const matB = Obstacles._material('genRock', C.body);
      box(w * 0.86, TOP - 0.3, D * 0.8, matB, 0, TOP / 2, 0);
      box(w, 0.16, D * 0.9, Obstacles._material('genCap', C.steel), 0, TOP - 0.08, 0);
      box(w, 0.14, D * 0.9, Obstacles._material('genCap', C.steel), 0, 0.07, 0);
      box(w * 0.8, 0.07, D * 0.5, Obstacles._emissive('genWarn', C.warn), 0, TOP - 0.2, 0);
      lamp(0.05, C.fire, 0, TOP * 0.5, D * 0.3);
    }
  },

  /* 動く部品（place() が bands()/MOT から毎フレーム置く。userData の約束はゾーン共通） */
  buildMoving(type, g, w, t, x) {
    const C = x.C;
    if (type === 'LASER_SCAN') {
      /* 触手が「到達したときに居る位置」を床と天井に刻む（予告） */
      const mark = new THREE.Group();
      [[0.02, 1], [CFG.H - 0.02, -1]].forEach((e) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(CFG.LANE_W - 0.16, 3.4),
                                 Obstacles._material('tsMark', C.jelly, 0.28));
        m.rotation.x = -Math.PI / 2 * e[1];
        m.position.set(0, e[0], 0);
        m.renderOrder = 4;
        mark.add(m);
        const b = new THREE.Mesh(new THREE.BoxGeometry(CFG.LANE_W - 0.16, 0.05, 0.10),
                                 Obstacles._emissive('tsMarkLine', C.warn));
        b.position.set(0, e[0] + e[1] * 0.03, -1.55);
        mark.add(b);
      });
      g.add(mark);
      g.userData.mark = mark;
      const range = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9),
                                   Obstacles._material('tsRange', C.blade, 0.12));
      range.rotation.x = -Math.PI / 2;
      range.position.y = 0.012;
      range.renderOrder = 3;
      g.add(range);
      g.userData.range = range;

    } else if (type === 'LASER_V' || type === 'LASER_LOW') {
      /* 放電が消えている間の「待機表示」＝ くすぶる火花と細い光 */
      const isV = (type === 'LASER_V');
      const hh = isV ? (OBS[type].y1 - OBS[type].y0) : 0.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * (isV ? 0.30 : 0.98), isV ? hh - 0.4 : 0.05, 0.06),
                               Obstacles._material('elWait', 0x2f7a8a, 0.30));
      m.position.set(0, isV ? CFG.H / 2 : 0.40, 0);
      m.visible = false;
      g.add(m);
      g.userData.standby = m;

    } else if (type === 'LASER_ROT') {
      const R = CFG.LASER.ROT_R, TH = CFG.LASER.ROT_W;
      const mkArm = (coreCol, haloOp, ghost) => {
        const arm = new THREE.Group();
        const sc = new THREE.Group();
        arm.add(sc);
        const halo = new THREE.Mesh(new THREE.BoxGeometry(1, TH * 1.15, TH * 1.15),
                                    Obstacles._material(ghost ? 'rjGhost' : 'rjHalo', ghost ? C.cyan : C.jelly, haloOp));
        halo.position.x = 0.5;
        sc.add(halo);
        if (!ghost) {
          const core = new THREE.Mesh(new THREE.BoxGeometry(1, TH * 0.4, TH * 0.4),
                                      Obstacles._emissive('rjCore', C.fireHot));
          core.position.x = 0.5;
          sc.add(core);
        }
        arm.userData = { sc: sc };
        g.add(arm);
        return arm;
      };
      g.userData.ghost = mkArm(C.fireHot, 0.18, true);
      g.userData.arm = mkArm(C.fireHot, 0.60, false);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
                                         Obstacles._material('rjCurtain', C.jelly, 0.36),
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

Zones.register(ZoneSea);
