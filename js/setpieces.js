/* ============================================================================
   DUO RUN — setpieces.js  大演出（契約 §4.4 / §4.6）
   各ステージ終盤200mの「スクリプト化された固定区間」。

   ■ 作り方
   - 障害物は通常のチャンクと同じ形（floor/ceil/events）で書き、生成器が同じ
     Fair.validate を通す。**演出でも §4.7 の不変条件は一切ゆるめない**。
   - 見た目（崩落するタイル・粉塵・カメラ揺れ・画角・霧）は「距離の関数」として
     ここに閉じ込める。World は Setpieces.tileFall() と Setpieces.camFx() を読むだけ。
   - 中断（リトライ／タイトル）で必ず Setpieces.reset() が呼ばれ、
     カメラ・画角・霧・崩落タイルが元に戻る（機械テストあり）。

   ■ S1「高速道路の連鎖崩落」
     後方から路面と天井が次々に落ちる。崩落前線はプレイヤーの 18〜32m 後ろを
     上下しながら追ってくる（演出なので**絶対に追いつかない**）。
     危険は「崩落済みの穴(GAP)」「落ちてきた瓦礫(ROVER)」「落下する看板(天井のROVER)」
     として通常の不変条件で配置する。
   ============================================================================ */
'use strict';

const Setpieces = {
  /* ---- 定義（at は演出開始からの相対 m。速度で伸縮しない実寸） ------------ */
  DEFS: {
    collapse: {
      id: 'collapse',
      lengthM: 200,
      /* 危険物の配置（§4.7 の反応窓・ジャンプ連続に余裕をもたせた固定譜面）。
         崩落済みの穴(GAP)・落ちた瓦礫(ROVER)だけだと「跳ぶ」に偏るので、
         倒れた支柱(PILLAR)・落ちた看板(WIDEBAR)・切れた送電線(LASER_V)で
         「横に避ける」も混ぜて §4.3 の動作比率に収める。 */
      floor: [
        { at: 26, lane: 0, type: 'GAP' },
        { at: 80, lane: 1, type: 'PILLAR' },
        { at: 110, lane: -1, type: 'GAP' },
        { at: 140, lane: 0, type: 'ROVER' },
        { at: 170, lane: -1, type: 'WIDEBAR' },
        { at: 190, lane: 1, type: 'LASER_V' }
      ],
      ceil: [
        { at: 53, lane: -1, type: 'ROVER' },
        { at: 140, lane: 0, type: 'WIDEBAR' }
      ],
      events: [
        { at: 0, type: 'collapse.start' },
        { at: 200, type: 'collapse.end' }
      ]
    },

    /* ====================================================================
       S2「ビル間の大ジャンプ」（契約§4.4）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0    予告（HUD「JUMP!」＋発射台の点滅ライン）／路面が上り勾配になり始める
         6〜46 上り勾配（コリドーごと RAMP_H まで持ち上がる）
         46〜52 ジャンプ台の先端（蹴り上げ）
         52   **発射** → 滑空区間へ（ジャンプ／スライド入力は無効。レーン移動だけ）
         52〜192 滑空 140m ＝ 速度 23〜24 m/s で約6.0秒（契約「約6〜8秒相当」）
         192  隣のビルの屋上へ**着地**（衝撃・カメラ揺れ）
         192〜200 走り抜けてゴール
       空中の障害物は全て「跳べない／潜れない」型（§4.7 の生存経路はレーン移動で満たす）。
       ==================================================================== */
    bigjump: {
      id: 'bigjump',
      lengthM: 200,
      /* 片側だけの ADPANEL を多めにして「2体が別々によける」場面を作る。
         全部が both（2体とも同じレーンへ）だと、レーン移動の要求数が増えすぎて
         §4.3 の動作比率（レーン50%前後）を押し上げてしまうため。 */
      floor: [
        { at: 66,  lane: 1,  type: 'ADPANEL' },     // 床側だけ（LUMEN のみ動く）
        { at: 88,  lane: -1, type: 'WIRE2' },       // -1,0 を塞ぐ → 右へ（2体とも）
        { at: 132, lane: 0,  type: 'DRONE' },
        { at: 154, lane: -1, type: 'ADPANEL' },
        { at: 176, lane: 0,  type: 'SIGNFRAG' }
      ],
      ceil: [
        { at: 110, lane: 1,  type: 'ADPANEL' },     // 天井側だけ（UMBRA のみ動く）
        { at: 154, lane: 1,  type: 'ADPANEL' }      // 同じ地点で床と天井が別レーン
      ],
      events: [
        { at: 0,   type: 'bigjump.start' },
        { at: 52,  type: 'bigjump.launch' },
        { at: 192, type: 'bigjump.land' },
        { at: 200, type: 'bigjump.end' }
      ]
    }
  },

  /* ---- 大ジャンプのキーフレーム（距離 m。すべてここから引く） ------------- */
  BJ: {
    RAMP0: 6, RAMP1: 46, LIP: 52, LAND: 192, END: 200,
    RAMP_H: 2.6,          // 発射台の高さ
    KICK: 0.55,           // 先端の蹴り上げ
    ARC: 3.4,             // 滑空の山（発射高さからさらにこれだけ上がる）
    ARC_PEAK: 0.34,       // 山の位置（滑空区間の割合）
    SETTLE: 9,            // 着地の沈み込みが収まるまでの距離
    SETTLE_D: 0.55        // 沈み込み量
  },

  /* ---- 生成（createGenerator から呼ばれる） ------------------------------- */
  build(id, startM, nowDist) {
    const d = Setpieces.DEFS[id];
    if (!d) return null;
    const items = [];
    (d.floor || []).forEach((e) => items.push(Obstacles.make(e.type, 'floor', e.lane, startM + e.at, nowDist, e.params)));
    (d.ceil || []).forEach((e) => items.push(Obstacles.make(e.type, 'ceil', e.lane, startM + e.at, nowDist, e.params)));
    items.sort((a, b) => a.at - b.at);
    const events = (d.events || []).map((e) => ({ at: startM + e.at, type: e.type, params: e.params || null, done: false }));
    return { id: id, items: items, events: events, lengthM: d.lengthM, startM: startM };
  },

  /* ---- ランタイム状態 ----------------------------------------------------- */
  state: null,          // { id, startM, t, front }
  FALL_M: 22,           // 崩落前線からこの距離で完全に落ちきる（ゆっくり傾いて落ちる）
  /* 崩落前線とプレイヤーの距離。カメラを後ろへ引くので、この範囲なら
     「自分のすぐ後ろで路面が落ちていく」のが画面に映る（が、追いつきはしない）。 */
  GAP_MIN: 7,
  GAP_MAX: 16,
  CAM_BACK: 2.8,        // 演出中にカメラを後ろへ引く量（崩落を画面に入れるため）

  active() { return !!Setpieces.state; },
  id() { return Setpieces.state ? Setpieces.state.id : null; },

  /* イベント（Game.onEvent から） */
  onEvent(e) {
    if (e.type === 'collapse.start') {
      Setpieces.state = { id: 'collapse', startM: e.at, t: 0, front: e.at - 40 };
    } else if (e.type === 'collapse.end') {
      /* 終わってもゴールまで崩落は続く（前線は走り続ける） */
      if (Setpieces.state) Setpieces.state.ending = true;
    } else if (e.type === 'bigjump.start') {
      Setpieces.state = { id: 'bigjump', startM: e.at, t: 0, phase: 'ramp', land: 0 };
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('JUMP!', 'ビルの間を跳ぶ ／ 空中は左右だけ');
    } else if (e.type === 'bigjump.launch') {
      if (Setpieces.state) Setpieces.state.phase = 'glide';
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'bigjump.land') {
      if (Setpieces.state) { Setpieces.state.phase = 'land'; Setpieces.state.land = 0; }
    } else if (e.type === 'bigjump.end') {
      if (Setpieces.state) Setpieces.state.phase = 'done';
    }
  },

  /* ---- 大ジャンプの状態（距離の関数。フレームに依存しない） --------------- */
  /* 演出開始からの相対距離 */
  _rel(m) {
    const s = Setpieces.state;
    return (s && s.id === 'bigjump') ? (m - s.startM) : null;
  },
  /* 滑空中か（＝ジャンプ／スライド入力が無効になる区間・契約§4.4） */
  glideActive() {
    const s = Setpieces.state;
    return !!(s && s.id === 'bigjump' && s.phase === 'glide');
  },
  /* コリドー（路面・天井面・障害物・2体・カメラ）の持ち上がり量。見た目だけ。
     **同じ距離には必ず同じ値**なので、2体と障害物のズレは生まれない。 */
  viewLift(m) {
    const rel = Setpieces._rel(m);
    if (rel === null) return 0;
    const B = Setpieces.BJ;
    if (rel <= B.RAMP0) return 0;
    if (rel <= B.RAMP1) return B.RAMP_H * U.smooth((rel - B.RAMP0) / (B.RAMP1 - B.RAMP0));
    if (rel <= B.LIP) return B.RAMP_H + B.KICK * (rel - B.RAMP1) / (B.LIP - B.RAMP1);
    if (rel <= B.LAND) {
      const u = (rel - B.LIP) / (B.LAND - B.LIP);
      const h0 = B.RAMP_H + B.KICK, top = h0 + B.ARC, p = B.ARC_PEAK;
      return (u < p) ? U.lerp(h0, top, U.smooth(u / p))
                     : top * (1 - U.smooth((u - p) / (1 - p)));
    }
    if (rel <= B.LAND + B.SETTLE) {
      const k = (rel - B.LAND) / B.SETTLE;                 // 着地の沈み込み→戻り
      return -B.SETTLE_D * Math.sin(Math.PI * k) * Math.exp(-2.2 * k);
    }
    return 0;
  },
  /* その距離に路面／天井面があるか（滑空区間はビルとビルの間＝何もない） */
  tileHidden(m) {
    const rel = Setpieces._rel(m);
    if (rel === null) return false;
    return rel > Setpieces.BJ.LIP && rel < Setpieces.BJ.LAND;
  },
  /* 発射台の点滅ライン（予告）の強さ 0..1 */
  rampCue(m) {
    const rel = Setpieces._rel(m);
    if (rel === null) return 0;
    const B = Setpieces.BJ;
    if (rel < -6 || rel > B.LIP) return 0;
    return U.clamp(1 - Math.abs(rel - B.RAMP1) / 46, 0, 1);
  },

  /* 毎フレーム（Game.step の中から。dt は演出時間） */
  update(game, dt) {
    const s = Setpieces.state;
    if (!s) return;
    s.t += dt;
    s.dist = game.dist;                       // 距離基準の判定に使う（glideActive など）
    if (s.id === 'bigjump') {
      const rel = game.dist - s.startM;
      s.phase = (rel < Setpieces.BJ.LIP) ? 'ramp'
              : (rel < Setpieces.BJ.LAND) ? 'glide'
              : (rel < Setpieces.BJ.END) ? 'land' : 'done';
      if (s.phase === 'land') s.land = rel - Setpieces.BJ.LAND;
      return;
    }
    /* 崩落前線はプレイヤーの後ろを上下しながら追う（演出＝絶対に追いつかない） */
    const amp = (Setpieces.GAP_MAX - Setpieces.GAP_MIN) / 2;
    const mid = (Setpieces.GAP_MAX + Setpieces.GAP_MIN) / 2;
    const want = game.dist - (mid + amp * Math.cos(s.t * 0.9));
    /* 後退はさせない（崩れた路面が戻るのはおかしい） */
    s.front = Math.max(s.front, want);
  },

  /* 前方の路面の「揺れ」（崩落が迫っている感じ。落とさない＝公平性に影響しない） */
  tileShake(atM, dist) {
    const s = Setpieces.state;
    if (s && s.id === 'bigjump') {
      /* 発射台に近づくと路面が震える＋着地の瞬間に強く揺れる */
      const rel = atM - s.startM, B = Setpieces.BJ;
      if (rel > B.RAMP0 - 20 && rel < B.LIP) return 0.03 * Math.sin(s.t * 30 + atM * 1.9);
      if (s.phase === 'land' && s.land < B.SETTLE) {
        return 0.09 * (1 - s.land / B.SETTLE) * Math.sin(s.t * 42 + atM * 2.4);
      }
      return 0;
    }
    if (!s || s.id !== 'collapse' || atM < s.front) return 0;
    const ahead = atM - dist;
    if (ahead < -2 || ahead > 46) return 0;
    const k = 1 - U.clamp(ahead / 46, 0, 1);
    return k * 0.035 * Math.sin(s.t * 26 + atM * 1.7);
  },

  /* 路面タイルの落下量 0..1（World.syncCorridor から。1 で消える） */
  tileFall(atM, surface, lane) {
    const s = Setpieces.state;
    if (!s || s.id !== 'collapse') return 0;
    if (atM >= s.front) return 0;
    /* タイルごとに少しずつ落ち始めをずらす（一斉に落ちると板っぽい） */
    const h = Math.abs(Math.sin(atM * 12.9898 + lane * 4.1414 + (surface === 'ceil' ? 2.7 : 0))) % 1;
    const d = (s.front - atM) - h * 5;
    if (d <= 0) return 0;
    return U.clamp(d / Setpieces.FALL_M, 0, 1);
  },

  /* カメラ・霧の演出量（World から読む） */
  camFx() {
    const s = Setpieces.state;
    if (!s) return null;
    if (s.id === 'bigjump') {
      const B = Setpieces.BJ, rel = (s.dist || s.startM) - s.startM;
      const lift = Setpieces.viewLift(s.dist || s.startM);
      /* 滑空の強さ 0..1（発射で立ち上がり、着地で落とす） */
      const g = (s.phase === 'glide')
        ? U.clamp((rel - B.LIP) / 14, 0, 1) * U.clamp((B.LAND - rel) / 10, 0, 1)
        : 0;
      const impact = (s.phase === 'land') ? Math.max(0, 1 - s.land / B.SETTLE) : 0;
      return {
        shake: 0.16 * impact * (0.6 + 0.4 * Math.sin(s.t * 41)) + 0.012 * g,
        fovAdd: 8 * g + 3 * impact,                       // 契約§4.4「FOV+8°」
        camBack: 1.6 * g,
        /* 眼下に街を広げるため、カメラを少し上げて視線を下げる（俯角） */
        camUp: lift + 0.62 * g,
        lookUp: lift - 0.95 * g,
        fogFar: U.lerp(104, 210, g),                      // 遠くまで見える＝高さが出る
        fogColor: g > 0.02 ? 0x2b3a86 : 0x1e2a5e,
        glide: g
      };
    }
    const ramp = U.clamp(s.t / 1.2, 0, 1);              // 立ち上がり
    return {
      shake: 0.055 * ramp * (0.7 + 0.3 * Math.sin(s.t * 23.3)),
      fovAdd: 6 * ramp,
      camBack: Setpieces.CAM_BACK * ramp,
      fogFar: U.lerp(104, 76, ramp),
      fogColor: 0x2a1c3e,
      glide: 0
    };
  },

  /* ---- 粉塵（崩落前線から飛んでくる破片）／後方の火柱の照り返し ---------- */
  initView(scene) {
    if (Setpieces.dust) return;
    /* 崩落前線の明かり: カメラの後ろに置き、前方の壁や小物を赤く照らす */
    Setpieces.emberLight = new THREE.PointLight(0xff5a2a, 0, 42, 2);
    Setpieces.emberLight.position.set(0, CFG.H / 2, 14);
    scene.add(Setpieces.emberLight);
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9b86c8, transparent: true, opacity: 0.0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true
    });
    const N = 120;
    const im = new THREE.InstancedMesh(geo, mat, N);
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.renderOrder = 6;
    scene.add(im);
    Setpieces.dust = { mesh: im, mat: mat, count: N, dummy: new THREE.Object3D() };
  },

  /* 粉塵と「落ちていく瓦礫板」の更新（World.render から） */
  syncView(dist, t) {
    const d = Setpieces.dust;
    if (!d) return;
    const s = Setpieces.state;
    /* 滑空: 眼下の街と雲の層を出す（ゾーン側が持つ演出） */
    {
      const fx = Setpieces.camFx();
      Zones.setGlide(fx && fx.glide ? fx.glide : 0);
    }
    if (s && s.id === 'bigjump') {
      if (d.mat.opacity !== 0) d.mat.opacity = 0;
      if (Setpieces.emberLight) Setpieces.emberLight.intensity = 0;
      return;
    }
    if (!s) {
      if (d.mat.opacity !== 0) { d.mat.opacity = 0; }
      if (Setpieces.emberLight) Setpieces.emberLight.intensity = 0;
      return;
    }
    if (Setpieces.emberLight) {
      Setpieces.emberLight.intensity = 26 * (0.75 + 0.25 * Math.sin(s.t * 7.3));
      Setpieces.emberLight.position.z = 10;
    }
    d.mat.opacity = 0.34;
    const o = d.dummy;
    for (let i = 0; i < d.count; i++) {
      const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
      const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
      const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
      /* 崩落前線から前方へ流れて、プレイヤーを追い越していく瓦礫と粉塵。
         （カメラは前を向いているので、前線そのものではなく「飛んでくる破片」で見せる） */
      const span = (dist + 26) - s.front;
      const u = (h1 + (t * 0.18 + i * 0.013)) % 1;
      const zM = s.front + u * Math.max(span, 1);
      const age = U.clamp(u * 1.25, 0, 1);
      const x = (h2 - 0.5) * 6.2;
      const y = (h3 < 0.5 ? 0.25 : CFG.H - 0.25) + (h3 - 0.5) * 2.6 + Math.sin(t * 2 + i) * 0.5 * age;
      o.position.set(x, y, -(zM - dist));
      o.rotation.set(t * (0.6 + h1) + i, t * 0.4 + i, t * (0.3 + h2));
      o.scale.setScalar((0.45 + h3 * 1.5) * (1 - age * 0.35));
      o.updateMatrix();
      d.mesh.setMatrixAt(i, o.matrix);
    }
    d.mesh.instanceMatrix.needsUpdate = true;
  },

  /* ---- 後始末（リトライ・タイトル・テストの復帰で必ず呼ぶ） -------------- */
  reset() {
    Setpieces.state = null;
    if (Setpieces.dust) Setpieces.dust.mat.opacity = 0;
    if (Setpieces.emberLight) Setpieces.emberLight.intensity = 0;
    Zones.setGlide(0);
    if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    if (typeof World !== 'undefined' && World.ready) World.clearSetpieceFx();
  }
};
