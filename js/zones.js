/* ============================================================================
   DUO RUN — zones.js  ゾーンの共通土台（契約 §3 描画方針 / §5 見た目 / §6 P3a）

   ■ ゾーンモジュールの約束（ZoneNeon / ZoneRuins が実装する）
     {
       id:   'neon' | 'ruins' | ...
       PAL:  { fog, skyTop.., road, roadRough, roadMetal, skirt, metal, amber, indigo }
             ※ amber/indigo は「床＝LUMEN／天井＝UMBRA」を示す縁のラインの色。
               ゾーンが変わっても意味が変わらないよう、どのゾーンも同じ値を持つ。
       fog:  { color, near, far }          … 距離フォグ（build で scene に載せる）
       build(scene)                         … 光・空・遠景・小物をシーンへ足す
       sync(dist, t, speed)                 … 毎フレームの送り出し
       dispose()                            … 任意。Zones が自動で後始末するので普通は不要
       propsAhead()                         … 監査用: 前方60mに見えている小物の数
       setGlide(k)                          … 任意（滑空の大演出を持つゾーンだけ）
     }

   ■ 後始末（リークを作らない）
     build の前後で scene.children の差分を取り、そのゾーンが足したものを覚える。
     切替時に remove → geometry.dispose() / material.dispose() まで辿って捨てる。
     ＝ ゾーンモジュール側は「足すだけ」でよく、消し忘れが構造的に起きない。
   ============================================================================ */
'use strict';

/* ---------------------------------------------------------------- 共通の道具
   形を彫るための合成・マテリアル・小物フィールド。ゾーンはここだけを使う。 */
const ZoneKit = {
  /* スロット番号 → 疑似乱数（0..1）。同じ距離なら必ず同じ景色になる */
  hash(n, salt) {
    let x = (n * 374761393 + (salt | 0) * 668265263) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x = x ^ (x >>> 16);
    return (x >>> 0) / 4294967296;
  },

  /* BufferGeometry を1つにまとめる（ドローコールを種類数まで落とす） */
  merge(parts) {
    const pos = [], nor = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.p ? p.p[0] : 0, p.p ? p.p[1] : 0, p.p ? p.p[2] : 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.r ? p.r[0] : 0, p.r ? p.r[1] : 0, p.r ? p.r[2] : 0)),
        new THREE.Vector3(p.s ? p.s[0] : 1, p.s ? p.s[1] : 1, p.s ? p.s[2] : 1));
      g.applyMatrix4(m);
      const a = g.attributes.position.array;
      const b = g.attributes.normal ? g.attributes.normal.array : null;
      for (let k = 0; k < a.length; k++) pos.push(a[k]);
      if (b) for (let k = 0; k < b.length; k++) nor.push(b[k]);
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nor.length === pos.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    else out.computeVertexNormals();
    return out;
  },

  box(w, h, d) { return new THREE.BoxGeometry(w, h, d); },
  cyl(r, h, seg) { return new THREE.CylinderGeometry(r, r, h, seg || 6); },
  cone(r, h, seg) { return new THREE.ConeGeometry(r, h, seg || 6); },
  lam(color, opt) { return new THREE.MeshLambertMaterial(Object.assign({ color: color }, opt || {})); },
  bas(color, opt) { return new THREE.MeshBasicMaterial(Object.assign({ color: color }, opt || {})); },
  add(color, op) {
    return new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: op, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide
    });
  },

  /* 小物のフィールド（InstancedMesh 1つ＝1種類・スロット送り）
     field: { name, spacing, geo, mat, place(slot, m, t, dist) -> {x,y,dz,rx,ry,rz,sx,sy,sz} | null } */
  field(zone, spec) {
    const behind = (spec.behind === undefined) ? (zone.BEHIND || 16) : spec.behind;
    const count = Math.ceil((CFG.VIEW_FAR + behind) / spec.spacing) + 2;
    const mesh = new THREE.InstancedMesh(spec.geo, spec.mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (spec.order !== undefined) mesh.renderOrder = spec.order;
    zone.scene.add(mesh);
    const f = { name: spec.name, mesh: mesh, count: count, spacing: spec.spacing,
                behind: behind, place: spec.place, prop: spec.prop !== false,
                /* onTrack: 走行空間の上に置いてよい（床の意匠・粒子）。
                   これ以外の小物は 2体の通り道（|x| ≤ HALF_W + 体半幅）に入ってはいけない。
                   機械テストがこの印を見て検査する。 */
                onTrack: !!spec.onTrack, geo: spec.geo };
    zone.fields.push(f);
    if (f.prop) zone.propFields.push(f);
    return f;
  },

  /* フィールドを一括で前方へ送り出す（毎フレーム）。戻り値＝前方60mに見えている小物の数 */
  /* 小物を伏せる区間 [a, b]（エンドレスの連絡通路 / P6）。World.syncTunnel が毎フレーム入れる。
     通路の中は「無地」なので、ゾーンの小物（壁際の配管・看板・床の意匠）を出さない。 */
  mask: null,
  syncFields(zone, dist, t, hideProps) {
    const d = zone._dummy || (zone._dummy = new THREE.Object3D());
    const fs = zone.fields;
    const mk = ZoneKit.mask;
    let ahead = 0;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      const base = Math.floor((dist - f.behind) / f.spacing);
      for (let k = 0; k < f.count; k++) {
        const slot = base + k;
        const m = slot * f.spacing;
        /* f.thin（World.quality ≥ 1 の粒子）は1つおきに間引く＝奥まで均等に半分 */
        const o = (hideProps || (mk && m >= mk[0] && m <= mk[1]) || (f.thin && (slot & 1)))
          ? null : f.place(slot, m, t, dist);
        if (!o) {
          d.position.set(0, -9999, 0);
          d.rotation.set(0, 0, 0);
          d.scale.set(0.0001, 0.0001, 0.0001);
        } else {
          const zz = -(m + (o.dz || 0) - dist);
          d.position.set(o.x, o.y, zz);
          d.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
          d.scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
          if (f.prop && -zz >= -1 && -zz <= 60) ahead++;
        }
        d.updateMatrix();
        f.mesh.setMatrixAt(k, d.matrix);
      }
      f.mesh.instanceMatrix.needsUpdate = true;
    }
    return ahead;
  },

  /* 装飾が「2体の通り道」に侵入していないかを調べる（契約§4.1 の走行空間を守る）。
     各フィールドのジオメトリの外接箱に place() の位置と拡大率を掛けて、
     x 方向が走行空間（|x| ≤ HALF_W + 体半幅）と重なるものを挙げる。 */
  intrudes(zone, samples) {
    const bad = [];
    /* 2体が実際に体を置く範囲は「端のレーンの中心 ± 体半幅」= 1.45。
       コリドーの縁（HALF_W = 1.8）との間は装飾を置いてよい余白。 */
    const LIM = CFG.LANE_W + CFG.BODY_W / 2;              // 1.45
    const Y0 = 0.06, Y1 = CFG.H - 0.06;                   // 床/天井の意匠（薄板）は対象外
    const N = samples || 400;
    const v = new THREE.Vector3(), mtx = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
    for (let i = 0; i < zone.fields.length; i++) {
      const f = zone.fields[i];
      if (f.onTrack || !f.geo) continue;
      if (!f.geo.boundingBox) f.geo.computeBoundingBox();
      const bb = f.geo.boundingBox;
      let worst = 0, worstSlot = 0;
      for (let k = 0; k < N; k++) {
        const m = k * f.spacing;
        const o = f.place(k, m, 0.37, m);
        if (!o) continue;
        e.set(o.rx || 0, o.ry || 0, o.rz || 0);
        q.setFromEuler(e);
        mtx.compose(new THREE.Vector3(o.x, o.y, 0), q,
                    new THREE.Vector3(o.sx === undefined ? 1 : o.sx,
                                      o.sy === undefined ? 1 : o.sy,
                                      o.sz === undefined ? 1 : o.sz));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let c = 0; c < 8; c++) {
          v.set((c & 1) ? bb.max.x : bb.min.x, (c & 2) ? bb.max.y : bb.min.y, (c & 4) ? bb.max.z : bb.min.z);
          v.applyMatrix4(mtx);
          if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
          if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
        }
        if (y1 <= Y0 || y0 >= Y1) continue;               // 走行の高さに掛からない
        const over = Math.min(LIM - x0, x1 + LIM);        // 走行空間へのめり込み量
        if (over > worst) { worst = over; worstSlot = k; }
      }
      if (worst > 0.02) bad.push({ name: f.name, over: +worst.toFixed(3), slot: worstSlot });
    }
    return bad;
  },

  /* ジオメトリ／マテリアルまで辿って捨てる（リーク防止の唯一の出口） */
  free(obj) {
    obj.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose());
      else if (m.dispose) m.dispose();
    });
  }
};

/* ---------------------------------------------------------------- レジストリ */
const Zones = {
  _reg: {},
  _cur: null,
  _owned: [],          // 現在のゾーンが scene に足したもの
  scene: null,

  register(mod) { Zones._reg[mod.id] = mod; return mod; },
  get(id) { return Zones._reg[id] || null; },
  id() { return Zones._cur; },
  active() { return Zones._cur ? Zones._reg[Zones._cur] : null; },
  list() { return Object.keys(Zones._reg); },
  pal() { const z = Zones.active(); return z ? z.PAL : null; },

  /* 最初の構築（World.init から1回だけ） */
  build(scene, id) {
    Zones.scene = scene;
    Zones._cur = null;
    Zones._owned = [];
    Zones._mount(id);
  },
  /* そのゾーンでなければ切り替える（同じなら何もしない＝ステージ開始のたびに作り直さない） */
  ensure(id) {
    if (!id || !Zones._reg[id]) return false;
    if (Zones._cur === id) return false;
    return Zones.switchTo(id);
  },
  /* ゾーン切替（契約§6 P3a「切替APIはここで用意」）。
     前のゾーンのメッシュ／ライト／粒子とマテリアルを確実に捨ててから次を建てる。 */
  /* quiet=true は暗転なし（エンドレスのトンネル抜け / P6 は通路と光のゲートで繋ぐ） */
  switchTo(id, quiet) {
    const next = Zones._reg[id];
    if (!next || !Zones.scene) return false;
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    Zones.unmount();
    Zones._mount(id);
    if (!quiet) Zones.flash();
    Zones.lastSwitchMs = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
    return true;
  },
  lastSwitchMs: 0,
  _mount(id) {
    const z = Zones._reg[id];
    if (!z) throw new Error('unknown zone: ' + id);
    const scene = Zones.scene;
    const before = scene.children.slice();
    z.scene = scene;
    z.fields = [];
    z.propFields = [];
    z._dummy = new THREE.Object3D();
    z.build(scene);
    /* build が足したものだけを覚える（消し忘れが構造的に起きない） */
    Zones._owned = scene.children.filter((c) => before.indexOf(c) < 0);
    Zones._cur = id;
    if (typeof World !== 'undefined' && World.ready) World.applyZone();
    return z;
  },
  unmount() {
    const z = Zones.active();
    const scene = Zones.scene;
    /* 走行中に切り替えても取りこぼさないよう、出ている障害物の見た目をプールへ返す
       （ビューはゾーンと無関係＝プールへ返して使い回す） */
    if (typeof Game !== 'undefined' && Game.active && typeof World !== 'undefined' && World.ready) {
      for (let i = 0; i < Game.active.length; i++) World.dropView(Game.active[i]);
    }
    if (z && z.dispose) z.dispose();
    for (let i = 0; i < Zones._owned.length; i++) {
      const o = Zones._owned[i];
      scene.remove(o);
      ZoneKit.free(o);
    }
    Zones._owned = [];
    if (z) { z.fields = []; z.propFields = []; }
    /* 障害物の見た目は全ゾーン共通（契約§4.3 v2）＝プールはゾーンを跨いで使い回す */
    Zones._cur = null;
  },

  /* 切替の繋ぎ（簡易演出）: 画面を一瞬だけ暗転させる。CSS のクラスだけで完結する。 */
  flash() {
    const e = document.getElementById('zonefade');
    if (!e) return false;
    e.classList.remove('on');
    void e.offsetWidth;                 // アニメーションを確実に再生させる
    e.classList.add('on');
    return true;
  },

  /* ---- 毎フレーム・問い合わせの窓口（World / Setpieces はここだけを呼ぶ） ---- */
  /* ゾーンの中の区間パターンを切り替える（例: 古代遺跡の「外周」と「内部」/ 契約§4.4）。
     ゾーンを持たない指定・持たないモジュールでは何もしない。 */
  mode(id) {
    const z = Zones.active();
    if (!z || !z.setMode) return null;
    return z.setMode(id || 'outer');
  },
  sync(dist, t, speed) { const z = Zones.active(); if (z && z.sync) z.sync(dist, t, speed); },
  setGlide(k) { const z = Zones.active(); if (z && z.setGlide) z.setGlide(k); },
  propsAhead() { const z = Zones.active(); return (z && z.propsAhead) ? z.propsAhead() : 0; },
  /* 障害物の見た目は全ゾーン共通の1セット（契約§4.3 v2 / js/obstacle_skin.js） */
  skin() { return (typeof ObstacleSkin !== 'undefined') ? ObstacleSkin : null; }
};
