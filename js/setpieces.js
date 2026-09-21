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
      /* 【2026-09-21 全面改訂 / P2c】滑空はレーンも床/天井も無い**自由飛行**（§4.5）。
         レーンの障害物は1つも置かない。空中の障害物は FF（freeflight.js）が
         シード固定で組み、当たり判定は円 vs 矩形・公平性は Fair.validateAir で見る。
         旧「空中も ADPANEL/DRONE をレーンで避ける」は失効。 */
      floor: [],
      ceil: [],
      air: true,                     // 自由飛行の区間を持つ演出
      landRel: 192,                  // 着地（＝この後 GRACE_T 秒は障害物なし）
      events: [
        { at: 0,   type: 'bigjump.start' },
        { at: 52,  type: 'bigjump.launch' },
        { at: 192, type: 'bigjump.land' },
        { at: 200, type: 'bigjump.end' }
      ]
    },

    /* ====================================================================
       S3「巨岩の追跡」（契約§4.4）
       キーフレーム（演出開始からの相対 m。速度で伸縮しない実寸）:
         0     予告（HUD「BOULDER!」）＋ 背後の遺跡が砕けて巨岩が転がり出す
         6〜26 **振り返りカット1**（カメラが振り返り、迫る巨岩が画面いっぱいに映る）
               ※ この区間には障害物を置かない。カット明け後も視認距離ぶん空ける
         64〜152 瓦礫の山（SLOWBAND＝死なないが越えないと -20%）と通常の障害物
         168〜186 **振り返りカット2**（巨岩はもっと近い）
         200   通過してゴールへ
       ミスの代わりに「減速」で詰められ、詰まりきると押し潰される（= 死）。
       完璧反応／0.25秒遅延のどちらのボットも跳び越すので、演出を跨いで完走できる。
       ==================================================================== */
    rockchase: {
      id: 'rockchase',
      lengthM: 200,
      /* 譜面の置ける窓は「振り返りカットの後、視認距離ぶん空けてから」＝ 62〜168m。
         倒れた石柱（PILLAR）・火柱（LASER_V）は both 型なので1本で2体に要求が出る＝
         §4.7 の密度（S3 は 6→10回/100m）を演出区間でも落とさない。 */
      floor: [
        { at: 64,  lane: 0,  type: 'SLOWBAND' },
        { at: 90,  lane: 0,  type: 'PILLAR' },
        { at: 104, lane: -1, type: 'LASER_V' },
        { at: 118, lane: 1,  type: 'SLOWBAND' },
        { at: 144, lane: 1,  type: 'PILLAR' },
        { at: 158, lane: -1, type: 'SLOWBAND' }
      ],
      ceil: [
        { at: 64,  lane: 1,  type: 'ROVER' },
        { at: 118, lane: 0,  type: 'SLOWBAND' },
        { at: 158, lane: 0,  type: 'ROVER' }
      ],
      events: [
        { at: 0,   type: 'rock.start' },
        { at: 34,  type: 'rock.cue' },       // 予告を引っ込める（振り返りカット1のあと）
        { at: 200, type: 'rock.end' }
      ]
    }
  },

  /* ---- 巨岩の追跡のキーフレーム（距離 m。すべてここから引く） ------------- */
  ROCK: {
    R: 6.4,               // 巨岩の半径（コリドー 3.6×4.0 より大きい＝遺跡ごと砕いて来る）
    GAP0: 21,             // 追跡開始時の距離
    GAP1: 11,             // 迫りきったときの距離
    CLOSE_M: 70,          // この距離をかけて GAP0 → GAP1 まで詰める
    SWAY: 1.1,            // 距離のゆらぎ（生き物らしさ）
    DEATH: 1.7,           // ここまで詰まると押し潰される（＝死）
    RECOVER: 0.55,        // 遅れの回復（m/秒）。1回の被弾（約8m）は取り返せない
    LOOKBACK: [[6, 26], [168, 186]],  // 振り返りカットの区間（障害物を置かない）
    /* 振り返りカットでカメラを前へ出す量（2体の前から振り返る＝岩の輪郭が画面に入る）。
       カット2は岩が近い（gap 11m）ので大きく引く。2026-09-22 実機評「茶色の塊に見える」 */
    CUT_BACK: [6.4, 13.5],
    /* 岩を照らす明かり（カット1は近景が飛ぶので弱く、カット2は輪郭を起こすので強く） */
    EMBER: [30, 60],
    EMBER_D: 24         // 明かりの届く距離（手前の遺跡を飛ばさない）
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
    const pr = (e) => scaleParams(normParams(e.type, e.params), 1);
    (d.floor || []).forEach((e) => items.push(Obstacles.make(e.type, 'floor', e.lane, startM + e.at, nowDist, pr(e))));
    (d.ceil || []).forEach((e) => items.push(Obstacles.make(e.type, 'ceil', e.lane, startM + e.at, nowDist, pr(e))));
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
      Setpieces.state = { id: 'bigjump', startM: e.at, t: 0, phase: 'ramp', land: 0,
                          speed: (typeof Game !== 'undefined' && Game.speed) ? Game.speed : CFG.SPEED_MIN,
                          course: null, split: -1 };
      Setpieces.makeAir(e.at);
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('JUMP!', '手を繋いで跳ぶ', 'high');
    } else if (e.type === 'bigjump.launch') {
      /* 実際の切替は update()（距離の関数）が行う。イベントは合図だけ。 */
    } else if (e.type === 'bigjump.land') {
      /* 〃 */
    } else if (e.type === 'bigjump.end') {
      if (Setpieces.state) Setpieces.state.phase = 'done';
    } else if (e.type === 'rock.start') {
      Setpieces.state = { id: 'rockchase', startM: e.at, t: 0, penalty: 0,
                          gap: Setpieces.ROCK.GAP0, rockM: e.at - Setpieces.ROCK.GAP0, caught: false };
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue('BOULDER!', '巨岩が来る ／ 瓦礫は跳び越えろ');
    } else if (e.type === 'rock.cue') {
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    } else if (e.type === 'rock.end') {
      if (Setpieces.state) Setpieces.state.ending = true;
      if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    }
  },

  /* ---- 巨岩の追跡（距離の関数。フレームに依存しない） --------------------- */
  rockActive() { const s = Setpieces.state; return !!(s && s.id === 'rockchase'); },
  /* 振り返りカットの強さ 0..1（0→1→0 で振り返って戻る）。World.syncCamera が読む */
  lookBack(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return 0;
    const rel = m - s.startM;
    let k = 0;
    for (let i = 0; i < Setpieces.ROCK.LOOKBACK.length; i++) {
      const w = Setpieces.ROCK.LOOKBACK[i];
      if (rel > w[0] && rel < w[1]) k = Math.max(k, Math.sin(Math.PI * (rel - w[0]) / (w[1] - w[0])));
    }
    return k;
  },
  /* 今どちらの振り返りカットか（-1 = カット外）。カットごとに構図を変える */
  lookBackCut(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return -1;
    const rel = m - s.startM;
    for (let i = 0; i < Setpieces.ROCK.LOOKBACK.length; i++) {
      const w = Setpieces.ROCK.LOOKBACK[i];
      if (rel > w[0] && rel < w[1]) return i;
    }
    return -1;
  },
  /* 巨岩との距離（m）。詰まりきると押し潰される */
  rockGap() { const s = Setpieces.state; return (s && s.id === 'rockchase') ? s.gap : Infinity; },
  /* 迫られている度合い 0..1（カメラ揺れ・影・霧に使う） */
  rockProx() {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return 0;
    const R = Setpieces.ROCK;
    return U.clamp(1 - (s.gap - R.DEATH) / (R.GAP0 - R.DEATH), 0, 1);
  },

  /* ---- 大ジャンプの状態（距離の関数。フレームに依存しない） --------------- */
  /* 演出開始からの相対距離 */
  _rel(m) {
    const s = Setpieces.state;
    return (s && s.id === 'bigjump') ? (m - s.startM) : null;
  },
  /* 滑空中か（＝レーンも床/天井も無い自由飛行の区間・契約§4.5 改訂） */
  glideActive() {
    const s = Setpieces.state;
    return !!(s && s.id === 'bigjump' && s.phase === 'glide');
  },

  /* ---- DUO体（2人が手を繋いだ1体 / 契約§4.5 2026-09-21 改訂） ------------
     0 = 別々の2体 ／ 1 = 完全に合体。発射台の手前 0.4秒で 0→1、着地後 0.3秒で 1→0。 */
  duoK(m) {
    const s = Setpieces.state;
    if (!s || s.id !== 'bigjump') return 0;
    const B = Setpieces.BJ, rel = m - s.startM, sp = Math.max(4, s.speed || CFG.SPEED_MIN);
    if (rel < B.LIP) return U.clamp(1 - (B.LIP - rel) / (sp * FF.MERGE_T), 0, 1);
    if (rel < B.LAND) return 1;
    return U.clamp(1 - (rel - B.LAND) / (sp * FF.SPLIT_T), 0, 1);
  },
  /* 合体〜分離の間は通常の操作を受け付けない（演出中） */
  duoLocked() {
    return Setpieces.duoK((typeof Game !== 'undefined') ? Game.dist : 0) > 0.001;
  },

  /* ---- 自由飛行の譜面（シード固定・ゾーン非依存） ------------------------ */
  buildAir(seed, startM, speedAt) {
    const B = Setpieces.BJ;
    return FF.build(seed, startM + B.LIP, startM + B.LAND, speedAt);
  },
  makeAir(startM) {
    const st = (typeof Game !== 'undefined' && Game.stage) ? Game.stage : null;
    const speedAt = st ? st.speedAt : function () { return CFG.SPEED_MIN; };
    const base = (typeof Game !== 'undefined' ? (Game.seed >>> 0) : 1);
    const seed = ((base ^ Math.imul(Math.round(startM) + 1, 2654435761)) >>> 0) || 1;
    const c = Setpieces.buildAir(seed, startM, speedAt);
    if (Setpieces.state) Setpieces.state.course = c;
    return c;
  },
  /* 着地の強制分離（契約§4.5「DUO体の x に最も近いレーンへ2人が戻る」） */
  landing(game) {
    const lane = FF.landingLane();
    FF.end();
    game.runners.forEach((r) => {
      r.laneFrom = lane; r.laneTo = lane; r.laneVal = lane; r.laneT = CFG.LANE_T;
      r.act = 'run'; r.actT = 0; r.laneBuf = 0;
    });
    if (Setpieces.state) Setpieces.state.landLane = lane;
    if (typeof HUD !== 'undefined') {
      if (HUD.cueHide) HUD.cueHide();
      if (HUD.freeFlight) HUD.freeFlight(false);
    }
    return lane;
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
      const B = Setpieces.BJ;
      const rel = game.dist - s.startM;
      s.speed = game.speed;
      const prev = s.phase;
      s.phase = (rel < B.LIP) ? 'ramp'
              : (rel < B.LAND) ? 'glide'
              : (rel < B.END) ? 'land' : 'done';
      if (s.phase === 'glide' && prev !== 'glide') {
        /* 発射: DUO体の自由飛行へ（入力モードもここで切り替わる） */
        if (!s.course) Setpieces.makeAir(s.startM);
        FF.begin(s.course, 0, CFG.H / 2);
        if (typeof HUD !== 'undefined') {
          if (HUD.cue) HUD.cue('FREE FLIGHT', '画面をドラッグ', 'high');
          if (HUD.freeFlight) HUD.freeFlight(true);
        }
        s.cueOff = rel + Math.max(12, game.speed * 1.6);
      }
      if (s.phase === 'glide') {
        FF.update(dt);
        if (s.cueOff && rel > s.cueOff) { s.cueOff = 0; if (typeof HUD !== 'undefined') HUD.cueHide(); }
      } else if (prev === 'glide') {
        Setpieces.landing(game);                  // 着地で強制分離（契約§4.5）
      }
      if (s.phase === 'land') s.land = rel - B.LAND;
      return;
    }
    if (s.id === 'rockchase') {
      const R = Setpieces.ROCK;
      const rel = game.dist - s.startM;
      /* 基本の距離（近づいてくる）＋ゆらぎ */
      const base = U.lerp(R.GAP0, R.GAP1, U.smooth(U.clamp(rel / R.CLOSE_M, 0, 1)))
                 + R.SWAY * Math.sin(s.t * 1.25);
      /* 減速帯で失った距離を「遅れ」として貯める（ゆっくりだけ回復する） */
      const nominal = game.stage.speedAt(game.dist);
      s.penalty += Math.max(0, nominal - game.speed) * dt;
      s.penalty = Math.max(0, s.penalty - R.RECOVER * dt);
      s.gap = Math.max(0, base - s.penalty);
      s.rockM = game.dist - s.gap;                 // 巨岩の位置（走行距離の座標系）
      if (s.gap <= R.DEATH && !s.caught) {
        s.caught = true;
        if (game.onCrush) game.onCrush();
      }
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
    if (s && s.id === 'rockchase') {
      /* 巨岩が近いほど前方の石畳まで震える（落とさないので公平性には影響しない） */
      const p = Setpieces.rockProx();
      const ahead = atM - dist;
      if (ahead < -4 || ahead > 40) return 0;
      return (0.012 + 0.05 * p) * (1 - U.clamp(ahead / 40, 0, 1)) * Math.sin(s.t * 31 + atM * 2.1);
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
    if (s.id === 'rockchase') {
      const p = Setpieces.rockProx();
      const lb = Setpieces.lookBack(s.dist || s.startM);
      return {
        shake: 0.018 + 0.075 * p * (0.7 + 0.3 * Math.sin(s.t * 27)),
        fovAdd: 3 + 5 * p,
        camBack: 0,
        /* 前寄り・やや俯角（遺跡の奥行きを見せつつ、振り返りで巨岩を正面に入れる） */
        camUp: 0.35 + 0.25 * p,
        lookUp: -0.25 - 0.2 * p,
        fogFar: U.lerp(92, 70, p),
        fogColor: 0x6a4a22,                               // 舞い上がる土煙
        glide: 0,
        lookBack: lb,
        lookBackCut: Setpieces.lookBackCut(s.dist || s.startM),
        prox: p
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
    FF.initView(scene);
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
    Setpieces.dust = { mesh: im, mat: mat, count: N, dummy: new THREE.Object3D(),
                       base: new THREE.Color(0x9b86c8) };
    Setpieces._buildRock(scene);
  },

  /* ---- 巨岩（S3「巨岩の追跡」）の造形 ------------------------------------
     ・コリドーより大きい石球。遺跡ごと砕きながら転がって来る。
     ・普段は画面の後ろにいるので描画コストはほぼ0（視錐台の外）。
       **振り返りカット**のあいだだけ画面に入る（契約§4.4 の合格条件）。
     ・前方の床と天井には「巨岩の影」が落ちる＝振り返らなくても迫っているのが分かる。 */
  _buildRock(scene) {
    const R = Setpieces.ROCK.R;
    const g = new THREE.Group();
    g.visible = false;
    /* 岩肌: 正20面体を細かく割り、**頂点を乱して凹凸を彫る**（テクスチャ画像は使わない / 契約§3）。
       ・大きなうねり（塊感）＋ 細かいざらつき（岩肌）
       ・**帯状の溝**を3本（軸違い）彫る＝球の緯線に見えるので、転がりが目で追える
       2026-09-22 実機評「茶色の塊に見えて球と読めない」への対応。 */
    const geo = new THREE.IcosahedronGeometry(R, 4);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    /* 溝の軸（この軸まわりの緯線を凹ませる） */
    const axes = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0.35, 0).normalize(),
                  new THREE.Vector3(0.2, -0.4, 1).normalize()];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();
      const big = Math.sin(n.x * 2.1 + n.y * 1.7) * Math.cos(n.z * 2.4 - n.y * 1.1);   // うねり
      const fine = Math.abs(Math.sin(n.x * 11.3 + n.y * 17.1 + n.z * 13.7)) % 1;       // ざらつき
      let k = 0.90 + big * 0.055 + fine * 0.045;   // 最大 1.0（判定の半径を超えない）
      /* 帯状の溝: 軸からの角度が帯に近いところを深く削る */
      for (let a = 0; a < axes.length; a++) {
        const c = n.dot(axes[a]);
        const band = Math.exp(-Math.pow((Math.abs(c) - 0.42) / 0.10, 2));
        k -= 0.105 * band;
      }
      v.copy(n).multiplyScalar(R * k);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    /* 転がるのは岩体だけ（破片は別の群にしておく） */
    const spin = new THREE.Group();
    g.add(spin);
    const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6b5734, flatShading: true }));
    spin.add(body);
    /* 溝に沿って走る色の違う帯（転がりが一目で分かる） */
    axes.forEach((ax, i) => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 0.90, R * 0.085, 5, 24),
                                  new THREE.MeshLambertMaterial({ color: i ? 0xa78d58 : 0x3a2d1b, flatShading: true }));
      /* トーラスは xy 平面にできるので、その法線(z)を溝の軸に向ける */
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
      spin.add(band);
    });
    /* 抉れた面（色違いの岩塊）と、えぐれたクレーター（暗い凹み） */
    [[0.6, 0.5, 0.4], [-0.5, -0.4, 0.6], [0.2, -0.7, -0.5]].forEach((q, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(R * 0.6, R * 0.5, R * 0.55),
                               new THREE.MeshLambertMaterial({ color: i ? 0xa38c5e : 0x76613c, flatShading: true }));
      c.position.set(q[0] * R * 0.8, q[1] * R * 0.8, q[2] * R * 0.8);
      c.rotation.set(q[0] * 2, q[1] * 2, q[2] * 2);
      spin.add(c);
    });
    [[0.9, 0.2, 0.35], [-0.3, 0.85, -0.4], [0.35, -0.6, 0.72], [-0.8, -0.2, -0.55]].forEach((q, i) => {
      const n2 = new THREE.Vector3(q[0], q[1], q[2]).normalize();
      const cr = new THREE.Mesh(new THREE.SphereGeometry(R * (0.20 + 0.06 * (i % 2)), 10, 8),
                                new THREE.MeshLambertMaterial({ color: 0x3f3220, flatShading: true }));
      cr.position.copy(n2).multiplyScalar(R * 0.90);
      cr.scale.set(1, 1, 0.55);
      cr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n2);
      spin.add(cr);
    });
    /* 砕けた石が周りに舞う（巨岩と一緒に転がってくる破片） */
    const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
                                        new THREE.MeshLambertMaterial({ color: 0x6d5a3a, flatShading: true }), 26);
    deb.frustumCulled = false;
    deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(deb);
    scene.add(g);
    /* 巨岩の影（前方の床と天井を覆う暗い帯。近づくほど濃く・手前まで伸びる） */
    const shadows = [];
    [['floor', 0.03, -Math.PI / 2], ['ceil', CFG.H - 0.03, Math.PI / 2]].forEach((c) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CFG.HALF_W * 2 + 1.2, 30),
                               new THREE.MeshBasicMaterial({ color: 0x120c04, transparent: true,
                                                             opacity: 0, depthWrite: false, fog: true }));
      m.rotation.x = c[2];
      m.position.set(0, c[1], 0);
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      shadows.push(m);
    });
    Setpieces.rock = { group: g, spin: spin, body: body, deb: deb, dummy: new THREE.Object3D(),
                       shadows: shadows, n: 26 };
  },

  /* 巨岩が画面をどれだけ覆っているか 0..1（描いていないときは 0）。
     契約§4.4 S3「巨岩が迫っている恐怖が画面で分かる」の合格条件を測る窓口。 */
  rockOnScreen() {
    const r = Setpieces.rock;
    if (!r || !r.spin.visible) return 0;
    if (typeof World === 'undefined' || !World.ready) return 0;
    return World.projectCoverage(Setpieces.rockBox());
  },

  /* 巨岩の判定用ボックス（監査: 画面内に映っているかを測る） */
  rockBox() {
    const s = Setpieces.state;
    if (!s || s.id !== 'rockchase') return null;
    const R = Setpieces.ROCK.R, z = s.gap;
    return { x0: -R, x1: R, y0: CFG.H / 2 - R, y1: CFG.H / 2 + R, z0: z - R, z1: z + R };
  },

  /* 粉塵と「落ちていく瓦礫板」の更新（World.render から） */
  syncView(dist, t) {
    const d = Setpieces.dust;
    if (!d) return;
    const s = Setpieces.state;
    /* 滑空: 眼下の街と雲の層を出す（ゾーン側が持つ演出）＋ 自由飛行の空中障害物と DUO体 */
    {
      const fx = Setpieces.camFx();
      Zones.setGlide(fx && fx.glide ? fx.glide : 0);
      FF.syncView(dist, t, Setpieces.viewLift(dist), Setpieces.duoK(dist));
    }
    if (s && s.id === 'rockchase') { Setpieces._syncRock(dist, t); return; }
    Setpieces._hideRock();
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
    d.mat.color.copy(d.base);
    if (Setpieces.emberLight) {
      Setpieces.emberLight.intensity = 26 * (0.75 + 0.25 * Math.sin(s.t * 7.3));
      Setpieces.emberLight.distance = 42;
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

  _hideRock() {
    const r = Setpieces.rock;
    if (!r || !r.group.visible) return;
    r.group.visible = false;
    r.shadows.forEach((m) => { m.visible = false; m.material.opacity = 0; });
  },
  /* 巨岩・その影・舞う破片の更新（距離の関数。フレームに依存しない） */
  _syncRock(dist, t) {
    const s = Setpieces.state, r = Setpieces.rock, d = Setpieces.dust;
    if (!r) return;
    const R = Setpieces.ROCK;
    const p = Setpieces.rockProx();
    /* 巨岩は 2体の **後ろ** gap m。転がりは走行距離に比例（フレームに依存しない）。
       ■ 岩体を描くのは「振り返りカットの間」と「押し潰される瞬間」だけ。
         前向きのカメラ（z=+8）より手前に岩の前面が来るので、ふだん描くと
         画面を岩で塞いでしまう（後ろにいるものは前向きのカメラには映らない）。
         ふだんは **影・地響き・飛んでくる破片・土煙** で迫っているのを見せる。 */
    r.group.visible = true;
    r.spin.visible = (Setpieces.lookBack(dist) > 0.02) || !!s.caught;
    r.group.position.set(0, CFG.H / 2 - 0.35, s.gap);
    r.spin.rotation.x = -(s.rockM || 0) / R.R;      // 走行距離に比例して転がる
    /* 周りに舞う破片 */
    const o = r.dummy;
    for (let i = 0; i < r.n; i++) {
      const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
      const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
      const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
      const u = (h1 + t * 0.4 + i * 0.017) % 1;
      /* 破片は巨岩から前へ飛び出して2体を追い越す（ローカル座標＝群の原点から見た位置） */
      const zz = -R.R * 0.6 - u * (s.gap + 6);
      o.position.set((h2 - 0.5) * 6.4, (h3 < 0.5 ? 0.4 : CFG.H - 0.4) + (h3 - 0.5) * 2.2, zz);
      o.rotation.set(t * (1.2 + h1) + i, t * 0.8 + i, t * (0.6 + h2));
      o.scale.setScalar((0.5 + h3 * 1.5) * (1 - u * 0.5));
      o.updateMatrix();
      r.deb.setMatrixAt(i, o.matrix);
    }
    r.deb.instanceMatrix.needsUpdate = true;
    /* 影: 巨岩の手前から前方へ伸びる。近いほど濃く、遠くまで届く */
    r.shadows.forEach((m) => {
      m.visible = true;
      m.material.opacity = 0.10 + 0.42 * p;
      m.position.z = s.gap - 15 - 14 * (1 - p);
    });
    /* 土煙（既存の粉塵を茶色に染めて使い回す） */
    if (d) {
      d.mat.color.setHex(0xc9a878);
      d.mat.opacity = 0.16 + 0.22 * p;
      const o2 = d.dummy;
      for (let i = 0; i < d.count; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898)) % 1;
        const h2 = Math.abs(Math.sin(i * 78.233)) % 1;
        const h3 = Math.abs(Math.sin(i * 39.425)) % 1;
        const u = (h1 + (t * 0.3 + i * 0.013)) % 1;
        const zM = s.gap - u * (s.gap + 30);
        o2.position.set((h2 - 0.5) * 6.6, (h3 < 0.5 ? 0.3 : CFG.H - 0.3) + (h3 - 0.5) * 2.8, zM);
        o2.rotation.set(t * (0.6 + h1) + i, t * 0.4 + i, t * (0.3 + h2));
        o2.scale.setScalar((0.4 + h3 * 1.4) * (1 - u * 0.3));
        o2.updateMatrix();
        d.mesh.setMatrixAt(i, o2.matrix);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
    /* 巨岩を照らす明かり（岩の手前に置いて面を起こす＝振り返ったときに形が読める） */
    if (Setpieces.emberLight) {
      /* カット1は手前の遺跡が飛ぶので弱く、カット2は岩の輪郭を起こすので強く（2026-09-22） */
      const cut = Setpieces.lookBackCut(dist);
      const base = Setpieces.ROCK.EMBER[cut < 0 ? 0 : cut];
      Setpieces.emberLight.color.setHex(0xffb066);
      Setpieces.emberLight.intensity = base * (0.85 + 0.15 * Math.sin(s.t * 9.1));
      /* 岩のすぐ手前に置き、届く距離を絞る＝岩の面だけを起こし、手前の遺跡は飛ばさない */
      Setpieces.emberLight.distance = Setpieces.ROCK.EMBER_D;
      Setpieces.emberLight.position.set(0, CFG.H / 2, s.gap - Setpieces.ROCK.R - 1.4);
    }
  },

  /* ---- 後始末（リトライ・タイトル・テストの復帰で必ず呼ぶ） -------------- */
  reset() {
    Setpieces.state = null;
    FF.reset();
    if (typeof HUD !== 'undefined' && HUD.freeFlight) HUD.freeFlight(false);
    Setpieces._hideRock();
    if (Setpieces.dust) { Setpieces.dust.mat.opacity = 0; Setpieces.dust.mat.color.copy(Setpieces.dust.base); }
    if (Setpieces.emberLight) {
      Setpieces.emberLight.intensity = 0;
      Setpieces.emberLight.color.setHex(0xff5a2a);
      Setpieces.emberLight.distance = 42;
      Setpieces.emberLight.position.set(0, CFG.H / 2, 14);
    }
    Zones.setGlide(0);
    if (typeof HUD !== 'undefined' && HUD.cueHide) HUD.cueHide();
    if (typeof World !== 'undefined' && World.ready) World.clearSetpieceFx();
  }
};
