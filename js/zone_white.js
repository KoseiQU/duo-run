/* ============================================================================
   DUO RUN — zone_white.js  S1 チュートリアルの「白い無地の空間」（契約 §4.4 v2 / §5 / §6 P7c）

   ■ 契約
     §4.4 S1「白い無地の空間（造形なし・霧は白）」／§5「S1 チュートリアルは白い無地空間（薄いグリッド線のみ）」。
     ＝ 小物・遠景・粒子は置かない。見えるのは 白い霧／薄い路面／床と天井のグリッド線／2体と影／障害物 だけ。
   ■ 見え方
     - 霧と背景は白（0xffffff）。遠いものは白へ溶ける＝障害物は白の奥から現れる。
     - 路面・天井面は霧より一段暗い薄灰（無地）。他ゾーンの「無地の暗色」の規則（World.roadColor）は
       白い空間では意味を持たないので、PAL.roadRaw で素の色を使う（契約§5 の S1 例外）。
     - グリッド線は床と天井の面に貼った細い線（レーン境界に揃えた縦線＋3m おきの横線）。
       コリドーの外まで広がる＝「白い部屋の床と天井」が地平まで続く。横線だけを流して速度を出す。
     - 障害物は共通デザイン（赤/橙/白）のまま。白背景では赤と縞の暗部が浮く（輝度差は絶対値で判定）。
   ■ 描画コスト: 線2本（静止の縦線／流れる横線）＋光2つ。小物フィールドは持たない。
   ============================================================================ */
'use strict';

const ZoneWhite = {
  id: 'white',
  BEHIND: 2,

  PAL: {
    /* World が読む共通キー */
    road:      0xe4e6eb,      // 路面・天井面（霧より一段暗い薄灰・無地）
    roadRaw:   true,          // World.roadColor の「暗色に沈める」を使わない（白い空間の例外）
    roadRough: 0.9,
    roadMetal: 0.0,
    skirt:     0xc3c7d0,      // 路面の厚み（側面）
    metal:     0xb4b9c4,      // ゲート・門柱の金属
    amber:     0xffb347,      // 床＝LUMEN（ゾーンが変わっても意味は同じ）
    indigo:    0x8b9bff,      // 天井＝UMBRA
    fog:       0xffffff,
    /* 障害物の露出（Obstacles.tone）: 白い壁・白い縞・光線の白い芯が白い霧に溶けるので、
       同じ色相のまま 0.55 倍で描く＝「白背景に対して暗い/赤い」方向で輝度差 40 以上（P7c 指示）。
       実測（40m 先・812×375）: 光柱 −44 ／壁の穴 −56 ／ハードル −58 ／ワイド梁 −137 */
    obstacleTone: 0.55,
    shadowDark: true,         // 2体の丸影を暗い影にする（加算の光は白に溶ける / World.syncRunners）
    /* グリッド線 */
    grid:      0xa9aebb,
    gridFar:   0xc4c8d2
  },
  fog: { color: 0xffffff, near: 24, far: 118 },

  CELL: 3.0,                  // 横線の間隔（m）
  SPAN_X: 30,                 // グリッドの横の広がり（±m）

  build(scene) {
    const P = ZoneWhite.PAL, F = ZoneWhite.fog;
    ZoneWhite.scene = scene;
    scene.fog = new THREE.Fog(F.color, F.near, F.far);
    scene.background = new THREE.Color(F.color);
    /* 光: 影の出ない白い部屋。2体の発光体・障害物の赤が主役になるよう、全体を均一に明るく */
    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dce6, 0.62));
    const key = new THREE.DirectionalLight(0xffffff, 0.45);
    key.position.set(0.4, 0.9, 0.5);
    scene.add(key);

    const H = CFG.H, Y0 = 0.012, Y1 = H - 0.012;
    const LEN = CFG.VIEW_FAR + 30;
    /* 縦線（レーン境界に揃える: ±0.6, ±1.8, 以後 1.2 おき）— 動かない */
    const vx = [];
    for (let x = 0.6; x <= ZoneWhite.SPAN_X; x += CFG.LANE_W) { vx.push(x, -x); }
    const vp = [];
    vx.forEach((x) => {
      [Y0, Y1].forEach((y) => { vp.push(x, y, 6, x, y, -LEN); });
    });
    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    ZoneWhite.vLines = new THREE.LineSegments(vg, new THREE.LineBasicMaterial({ color: P.grid, fog: true }));
    ZoneWhite.vLines.frustumCulled = false;
    ZoneWhite.vLines.name = 'white-grid-v';
    scene.add(ZoneWhite.vLines);
    /* 横線（CELL おき）— 走行距離で流す＝速度が読める */
    const hp = [];
    const n = Math.ceil((LEN + 12) / ZoneWhite.CELL);
    for (let i = 0; i < n; i++) {
      const z = 6 - i * ZoneWhite.CELL;
      [Y0, Y1].forEach((y) => { hp.push(-ZoneWhite.SPAN_X, y, z, ZoneWhite.SPAN_X, y, z); });
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    ZoneWhite.hLines = new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: P.gridFar, fog: true }));
    ZoneWhite.hLines.frustumCulled = false;
    ZoneWhite.hLines.name = 'white-grid-h';
    scene.add(ZoneWhite.hLines);
  },

  sync(dist) {
    if (!ZoneWhite.hLines) return;
    ZoneWhite.hLines.position.z = ((dist % ZoneWhite.CELL) + ZoneWhite.CELL) % ZoneWhite.CELL;
  },
  dispose() { ZoneWhite.vLines = null; ZoneWhite.hLines = null; },
  /* 小物は置かない（契約§5 S1 白い無地空間） */
  propsAhead() { return 0; }
};

Zones.register(ZoneWhite);
