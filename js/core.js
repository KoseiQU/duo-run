/* ============================================================================
   DUO RUN — core.js  ゲーム本体（状態機械・ループ・当たり判定・死亡/再開）
   更新順は step() の1か所だけ。DUO.pump も rAF ループも必ずここを通る。
   ============================================================================ */
'use strict';

const Game = {
  /* --- 状態 --------------------------------------------------------------- */
  status: 'idle',        // 'idle' | 'playing' | 'dying' | 'dead' | 'goal' | 'clear'
  stage: null,
  seed: 1,
  dist: 0,
  prevDist: 0,
  speed: CFG.SPEED_MIN,
  t: 0,
  dyingT: 0,
  lastCheckpoint: 0,
  killer: null,          // {runner, obstacle}
  botMode: null,         // null | 'perfect' | 'delay250'
  handSwap: false,       // 入れ替えワープのフック（§4.5）
  merged: false,         // 合体区間の中か（§4.5 / S8）。Merge（距離の関数）が唯一の出所
  flipT: 0,              // 重力反転の回転演出の残り（秒・見た目だけ / §4.5 S6）
  flipN: 0,              // この走行で面が入れ替わった回数（偶数＝既定の向き）
  runners: [],
  active: [],            // 表示・判定の対象になっている障害物
  gen: null,
  genPtr: 0,
  eventLog: [],
  goalT: 0,              // ゴール演出の経過（§4.8 ゴールゲート→ポーズ→リザルト）
  allClearT: 0,          // 全クリア演出の経過（S8 クリア＝全8ステージ制覇 / §6 P5b）
  ALLCLEAR_T: 2.2,       // 全クリア演出の長さ（秒）
  slowT: 0,              // 減速帯（§4.4 S3）の残り時間。速度が一時的に落ちる
  bestUpdated: false,    // 直近のリザルトでベスト更新したか
  stats: { frames: 0 },
  GOAL_T: 1.3,           // ゴール演出の長さ（秒）

  /* --- 初期化 ------------------------------------------------------------- */
  init(canvas) {
    Game.runners = [
      Runners.create('lumen', 'floor', 'left'),
      Runners.create('umbra', 'ceil', 'right')
    ];
    if (canvas) { World.init(canvas); Input.attach(canvas.parentNode || canvas); }
    HUD.init();
    Tutorial.init();
    Game.stage = makeStage('S0');
    Game.speed = Game.stage.speedAt(0);
    Game.status = 'idle';
    UI.show('title');
  },

  /* --- 手 ↔ キャラ（入れ替えワープのフック） ------------------------------ */
  runnerForHand(hand) {
    const want = Game.handSwap ? (hand === 'left' ? 'right' : 'left') : hand;
    return Game.runners.filter((r) => r.hand === want)[0] || null;
  },
  /* タッチ: 画面の下半分＝床を走るキャラ / 上半分＝天井を走るキャラ（§4.2 改訂）。
     重力反転ワープ（§4.5）で面が入れ替わっても「画面の位置＝担当」は保たれる。
     **入れ替えワープ（§4.5 / S7）のときだけ、その対応が入れ替わる**:
       下半分＝天井を走る方（UMBRA）／上半分＝床を走る方（LUMEN）。
     handSwap の読み手はここと runnerForHand（キーボード・ボット）の2か所だけ。 */
  runnerForZone(zone) {
    let surface = Input.surfaceOfZone(zone);
    if (Game.handSwap) surface = (surface === 'floor') ? 'ceil' : 'floor';
    return Game.runners.filter((r) => r.surface === surface)[0] || null;
  },
  /* 画面の上下 → いま担当しているキャラの面（HUD・監査の窓口） */
  surfaceForZone(zone) {
    const s = Input.surfaceOfZone(zone);
    return Game.handSwap ? ((s === 'floor') ? 'ceil' : 'floor') : s;
  },
  setHandSwap(on) { Game.handSwap = !!on; },
  setMirror(id, on) { Game.runners.forEach((r) => { if (r.id === id) r.mirrored = !!on; }); },
  /* 床/天井の入れ替え（重力反転ワープのフック） */
  swapSurfaces() {
    Game.runners.forEach((r) => { r.surface = (r.surface === 'floor') ? 'ceil' : 'floor'; });
  },
  /* 重力反転ワープ（契約§4.5 / S6）: 面を入れ替え、0.4秒の回転演出を始める。
     **操作は「画面の位置＝担当」のまま**（§4.2）＝ 下半分は常に「床を走っている方」。
     HUD の手アイコンも面から引いているので、そのまま入れ替わる。
     入れ替えの「いつ」は Warp（距離の関数）が唯一の出所で、ここは受け取るだけ。 */
  flip() {
    Game.swapSurfaces();
    Game.flipT = CFG.WARP.SPIN_T;
    Game.flipN++;
    if (typeof HUD !== 'undefined' && HUD.gravCue) HUD.gravCue(Game.flipN % 2 === 1);
    return Game.flipN;
  },
  /* 面が既定（LUMEN=床 / UMBRA=天井）から入れ替わっているか */
  flipped() { return Game.runners[0].surface !== 'floor'; },

  /* --- 合体区間（契約§4.5 / §4.4 S8 / P5b） --------------------------------
     区間の中では2体が1体になる。**合体体＝床を走っている方**（lead）で、
     もう1体（passenger）は毎フレーム lead の姿をそのまま写す。
     判定・入力・ボットはすべて lead だけを見る（＝天井側の障害物に当たらない）。 */
  mergeLead() { return Game.runners.filter((r) => r.surface === 'floor')[0] || Game.runners[0]; },
  mergePassenger() { const l = Game.mergeLead(); return Game.runners.filter((r) => r !== l)[0] || null; },
  /* 合体の度合い 0..1（見た目だけ。World が読む） */
  mergeK(m) {
    if (!Game.gen || !Game.gen.merges) return 0;
    return Merge.kAt(Game.gen.merges, (m === undefined) ? Game.dist : m, Game.speed);
  },
  /* 入口で合体／出口で分離（Merge が跨ぎを検出して呼ぶ）。
     出口では **合体体のレーン（＝最寄りレーン）** へ2体が戻る（契約§6 P5b）。 */
  onMergeChange(on) {
    const lead = Game.mergeLead(), other = Game.mergePassenger();
    const lane = lead.laneTo;
    Game.runners.forEach((r) => {
      r.laneFrom = lane; r.laneTo = lane; r.laneVal = lane; r.laneT = CFG.LANE_T;
      r.laneBuf = 0;
    });
    if (!on && other) { other.act = 'run'; other.actT = 0; }
    if (typeof HUD !== 'undefined' && HUD.mergeCue) HUD.mergeCue(on);
    return lane;
  },
  /* 合体中は passenger が lead の姿をそのまま写す（判定は lead だけ） */
  syncMerged() {
    if (!Game.merged) return false;
    const lead = Game.mergeLead(), other = Game.mergePassenger();
    if (!other) return false;
    other.laneFrom = lead.laneFrom; other.laneTo = lead.laneTo;
    other.laneVal = lead.laneVal; other.laneT = lead.laneT;
    other.act = lead.act; other.actT = lead.actT; other.jumpT = lead.jumpT;
    other.laneBuf = lead.laneBuf;
    return true;
  },

  /* --- 開始・再開 --------------------------------------------------------- */
  start(stageId, seed) {
    Game.stage = makeStage(stageId);
    /* ゾーンの差し替え（契約§6 P3a）。見た目を返してから切り替える＝
       前のゾーンのプール・マテリアルを取りこぼさずに捨てられる。同じゾーンなら何もしない。 */
    Game.clearWorld();
    Zones.ensure(Game.stage.zone);
    /* 同じゾーンでも区間パターンを替える（古代遺跡の 外周 ⇄ 内部 / 契約§4.4 S4） */
    Zones.mode(Game.stage.zoneMode);
    Game.seed = (seed === undefined) ? ((Math.random() * 1e9) | 0) : seed;
    Game.handSwap = false;
    Game.lastCheckpoint = 0;
    Game.eventLog.length = 0;
    Game.resetRun(0);
    Game.status = 'playing';
    UI.show('play');
    return Game.stage;
  },
  /* fromStart=true は「もう一度（最初から）」 */
  retry(fromStart) {
    if (!Game.stage) return;
    const from = (Game.stage.endless || fromStart) ? 0 : Game.lastCheckpoint;
    if (fromStart) Game.lastCheckpoint = 0;
    if (typeof UI !== 'undefined' && UI.allClearHide) UI.allClearHide();
    Game.resetRun(from);
    Game.status = 'playing';
    UI.show('play');
  },
  toTitle() {
    Game.status = 'idle';
    Setpieces.reset();
    Tutorial.reset();
    Game.clearWorld();
    Game.dist = 0;
    Game.killer = null;
    Game.flipT = 0;
    Game.flipN = 0;
    Game.merged = false;
    Zero.cur = 1;
    Game.runners.forEach((r, i) => Runners.reset(r, i === 0 ? 'floor' : 'ceil'));
    if (typeof HUD !== 'undefined' && HUD.gravCue) HUD.gravCue(false);
    if (typeof HUD !== 'undefined' && HUD.mergeCue) HUD.mergeCue(false);
    if (typeof HUD !== 'undefined' && HUD.bridgeCue) HUD.bridgeCue(null);
    if (typeof UI !== 'undefined' && UI.allClearHide) UI.allClearHide();
    UI.show('title');
  },

  clearWorld() {
    Game.active.forEach((o) => World.dropView(o));
    Game.active.length = 0;
    Game.gen = null;
    Game.genPtr = 0;
  },

  /* 指定距離から走り直す（チェックポイント再開・skipTo で使う） */
  resetRun(fromM) {
    Setpieces.reset();
    Tutorial.reset();
    Game.goalT = 0;
    Game.clearWorld();
    Game.dist = fromM;
    Game.prevDist = fromM;
    Game.t = 0;
    Game.dyingT = 0;
    Game.killer = null;
    Game.slowT = 0;
    Game.flipT = 0;
    Game.flipN = 0;
    Zero.cur = 1;
    /* 鏡ゾーン・入れ替えワープ（§4.5 / S7）も必ず既定へ戻す
       （左右の反転は Runners.reset が、担当の入れ替えはここが受け持つ）。 */
    Game.handSwap = false;
    /* 合体区間（§4.5 / S8）も必ず既定（2体）へ戻す */
    Game.merged = false;
    if (typeof HUD !== 'undefined' && HUD.mergeCue) HUD.mergeCue(false);
    if (typeof HUD !== 'undefined' && HUD.bridgeCue) HUD.bridgeCue(null);
    Game.speed = Game.stage.speedAt(fromM);
    /* 重力反転（§4.5 / S6）: 面は必ず既定（LUMEN=床 / UMBRA=天井）から始める */
    Game.runners.forEach((r, i) => Runners.reset(r, i === 0 ? 'floor' : 'ceil'));
    if (typeof HUD !== 'undefined' && HUD.gravCue) HUD.gravCue(false);
    Input.clear();
    Game.gen = createGenerator(Game.stage, Game.seed);
    Game.gen.ensure(fromM + CFG.SPAWN_AHEAD, fromM);
    /* エンドレス（P6）: 再開位置のゾーンに合わせる（最初から＝ネオン、skipTo なら途中のゾーン） */
    Endless.reset();
    if (Game.stage.endless && Game.gen.zoneAt) {
      const z = Game.gen.zoneAt(fromM);
      if (Zones.id() !== z) { Zones.switchTo(z, true); Zones.mode(null); }
    }
    /* 再開直後の助走: 視認距離ぶんの空白を必ず確保する（§4.7 視認距離） */
    const runway = Math.max(CFG.LEAD_IN * 0.6, Game.speed * CFG.FAIR.SEE + 10);
    /* 同時スイッチは「パッドは通り過ぎたのに橋だけ残る」を作らない（P3b）＝
       助走の中にパッドがあるグループは橋ごと取り込まない。 */
    Sync.killBefore(Game.gen.syncs, fromM + runway);
    /* 重力反転ワープ・無重力も同じ（片道だけ通った状態・区間の途中から始まる状態を作らない） */
    Warp.killBefore(Game.gen.warps, fromM + runway);
    Zero.killBefore(Game.gen.zeros, fromM + runway);
    /* 鏡ゾーン・入れ替えワープも同じ（片道だけ通った状態を作らない / P5a） */
    Mirror.killBefore(Game.gen.mirrors, fromM + runway);
    Swap.killBefore(Game.gen.swaps, fromM + runway);
    /* 合体区間も同じ（入口を通り過ぎたのに1体のまま、を作らない / P5b） */
    Merge.killBefore(Game.gen.merges, fromM + runway);
    Game.active = Merge.dropOrphans(Swap.dropOrphans(Mirror.dropOrphans(Warp.dropOrphans(Zero.dropOrphans(
      Sync.dropOrphans(Game.gen.obstacles.filter((o) => o.at >= fromM + runway), fromM + runway),
      fromM + runway), fromM + runway), fromM + runway), fromM + runway), fromM + runway);
    Game.active.forEach((o) => { o.spawnDist = fromM; });
    Game.genPtr = Game.gen.obstacles.length;
    /* 再開位置より手前のイベントだけ「済み」にする。
       助走ぶん先にあるイベント（チュートリアルの合図・大演出の開始）は
       そこへ到達した時にちゃんと発火させる。 */
    Game.gen.events.forEach((e) => { e.done = (e.at < fromM); });
    Game.lastCheckpoint = Game.stage.checkpoints.filter((c) => c <= fromM).pop() || 0;
  },

  /* --- 1フレーム（ロジックのみ） ------------------------------------------ */
  step(dt) {
    dt = U.clamp(dt || 0, 0, 0.05);
    Game._lastDt = dt;
    Game.stats.frames++;
    Game.t += dt;

    if (Game.status === 'goal') {
      /* ゴール演出: 減速しながら少し進み、2体がポーズしてリザルトへ */
      Game.goalT += dt;
      const u = U.clamp(Game.goalT / Game.GOAL_T, 0, 1);
      Game.dist += Game.speed * (1 - U.smooth(u)) * dt;
      Game.runners.forEach((r) => Runners.update(r, dt * (1 - u)));
      if (Game.goalT >= Game.GOAL_T) Game.afterGoal();
      return;
    }

    /* 全クリア演出（S8 ＝ 最終ステージ / 契約§6 P5b）: 2体が並んでポーズしたまま、
       全ゾーンの色が流れる。終わったら通常のリザルトへ。 */
    if (Game.status === 'allclear') {
      Game.allClearT += dt;
      Game.runners.forEach((r) => Runners.update(r, 0));
      if (Game.allClearT >= Game.ALLCLEAR_T) Game.onClear();
      return;
    }

    if (Game.status === 'playing' || Game.status === 'dying') {
      const scale = (Game.status === 'dying') ? CFG.DEATH_SLOW_SCALE : 1;
      const d = dt * scale;

      /* 無重力（契約§4.5 / S6）: **踏み切る瞬間の倍率**を現在地から決める。
         入力より先に置く＝このフレームのジャンプが正しい滞空で始まる。 */
      Zero.update(Game);

      if (Game.status === 'playing') {
        if (Game.botMode) Bot.update(Game, d);
        Game.applyInput();
      } else {
        Input.drain();                                  // 死亡演出中の入力は捨てる
      }

      /* 減速帯（§4.4 S3「瓦礫の山」）: 越えそこねると速度が一時的に -20%。
         遅くなるぶんには §4.7 の不変条件（時間基準）は緩む方向なので公平性は壊れない。 */
      if (Game.slowT > 0) Game.slowT = Math.max(0, Game.slowT - d);
      /* 光の輪のブースト（契約§4.5 2026-09-22）は **速度そのもの** に乗せる。
         ＝ HUD の m/s 表示もボットの判断も、実際に走っている速さと一致する。
         （FF 側の「距離を上乗せする」暫定処理は二重加速になるので止めてある） */
      const boost = (typeof FF !== 'undefined' && FF.boostK) ? FF.boostK() : 1;
      Game.speed = Game.stage.speedAt(Game.dist) * (1 - CFG.SLOW.MUL * U.clamp(Game.slowT / CFG.SLOW.T, 0, 1)) * boost;
      Game.prevDist = Game.dist;                        // 自由飛行の当たり判定（跨ぎ）に使う
      Game.dist += Game.speed * d;

      /* 生成と取り込み・寿命 */
      Game.gen.ensure(Game.dist + CFG.SPAWN_AHEAD, Game.dist);
      while (Game.genPtr < Game.gen.obstacles.length) Game.active.push(Game.gen.obstacles[Game.genPtr++]);
      for (let i = Game.active.length - 1; i >= 0; i--) {
        /* 奥行きの長い型（崩れる橋）は、その終わりを過ぎてから消す（Obstacles.extent） */
        if (Game.active[i].at + Obstacles.extent(Game.active[i]).fwd < Game.dist - CFG.DESPAWN_BEHIND) {
          World.dropView(Game.active[i]);
          Game.active.splice(i, 1);
        }
      }

      Game.runners.forEach((r) => Runners.update(r, d));
      /* 同時スイッチ（契約§4.5 / P3b）: パッドを踏んだかを見て 0.3秒窓の成否を決める。
         判定（bands）より先に置く＝その場で橋が架かる／崩れる。 */
      Sync.update(Game);
      /* 崩れる橋（契約§4.5 改訂 v2）: 踏んだ距離を記録し、崩落までの警告を出す（判定より先） */
      Bridge.update(Game);
      /* 重力反転ワープ（契約§4.5 / S6）: prevDist → dist の間に跨いだゲートを実行する。
         判定（collide）より先に置く＝入れ替わった面で当たり判定される。 */
      if (Warp.update(Game)) U.sfx('gate_grav');
      /* 鏡ゾーン（§4.5 / S7）: 跨いだ面のキャラの左右を反転する。
         入力の適用（applyInput）より後・判定より前に置くと、そのフレームの入力が
         古い向きで処理されてしまう。**入力より先**に置くのが正しい…が、
         ゲートは距離で跨ぐので prevDist→dist の更新後でなければ判定できない。
         直後 1.0秒は障害物が無いため、1フレームのズレは公平性に影響しない。 */
      if (Mirror.update(Game)) U.sfx('gate_mirror');
      /* 入れ替えワープ（§4.5 / S7）: 上下の担当を入れ替える */
      if (Swap.update(Game)) U.sfx('gate_swap');
      /* 合体区間（§4.5 / S8）: 跨いだゲートで合体／分離する。
         判定（collide）より先に置く＝そのフレームから「1体ぶんの判定」になる。 */
      if (Merge.update(Game)) U.sfx('gate_merge');
      Game.syncMerged();
      if (Game.flipT > 0) Game.flipT = Math.max(0, Game.flipT - dt);
      Game.fireEvents();
      if (Game.stage.endless) Endless.update(Game);
      Setpieces.update(Game, d);
      Tutorial.update(dt, Game.dist);

      if (Game.status === 'playing') {
        Game.collide();
        Game.updateCheckpoint();
        if (!Game.stage.endless && Game.dist >= Game.stage.lengthM) Game.onGoal();
      } else {
        Game.dyingT += dt;
        if (Game.dyingT >= CFG.DEATH_SLOW_T) Game.onDead();
      }
    } else if (Game.status === 'idle') {
      /* タイトル: 障害物なしでコリドーだけ流す */
      Game.speed = CFG.SPEED_MIN;
      Game.dist += Game.speed * dt;
      Game.runners.forEach((r) => Runners.update(r, dt));
    }
  },

  applyInput() {
    const q = Input.drain();
    /* 合体〜自由飛行〜分離の間（契約§4.5 改訂）は、2体は1体（DUO体）になっている。
       レーン移動もジャンプ／スライドも無く、操作は Input の自由飛行モードが受ける。
       ＝ ここへ流れてきた1動作ずつの入力は捨てる（人間もボットも同じ1か所）。 */
    if (Setpieces.duoLocked()) return;
    /* 合体区間（契約§4.5 / S8）: 2体は1体（合体体）。**両手で1体を動かす**。
       本作のタッチは「画面の上下＝担当」（§4.2）なので、契約の
       「左手=移動・右手=ジャンプ/スライド」を上下へ読み替える:
         下半分の横フリック → レーン移動（上下フリックは効かない）
         上半分の上フリック → ジャンプ ／ 上半分の下フリック → スライディング
       キーボード（開発・テスト用・ボット）は契約のまま
         左手 A/D = 移動 ／ 右手 ↑ = ジャンプ・↓ = スライド。
       入れ替えワープ（handSwap）はこの区間では効かない（担当が1体しかない）。 */
    if (Game.merged) {
      const r = Game.mergeLead();
      for (let i = 0; i < q.length; i++) {
        const it = q[i];
        let act = null;
        if (it.zone) {
          if (it.zone === 'bottom') act = (it.dir === 'left' || it.dir === 'right') ? it.dir : null;
          else act = (it.dir === 'up') ? 'jump' : (it.dir === 'down') ? 'slide' : null;
        } else {
          if (it.hand === 'left') act = (it.act === 'left' || it.act === 'right') ? it.act : null;
          else act = (it.act === 'jump' || it.act === 'slide') ? it.act : null;
        }
        if (act && Runners.input(r, act)) Game.sfxAct(r, act);
      }
      Game.syncMerged();
      return;
    }
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      if (it.zone) {
        /* タッチ: 担当は画面の上下、動作は「足場から離れる向き＝ジャンプ」で決まる */
        const r = Game.runnerForZone(it.zone);
        if (!r) continue;
        const act = Input.actFromDir(it.dir, r.surface);
        if (Runners.input(r, act)) Game.sfxAct(r, act);
      } else {
        const r = Game.runnerForHand(it.hand);
        if (!r) continue;
        if (Runners.input(r, it.act)) Game.sfxAct(r, it.act);
      }
    }
  },
  /* 受け付けた動作の効果音（§3 音 / P6）。人間もボットも同じ1か所を通る */
  sfxAct(r, act) {
    return U.sfx((act === 'jump') ? 'jump' : (act === 'slide') ? 'slide' : 'lane', { who: r.id });
  },

  /* チャンクの events（P2以降のギミック用フック。P1は記録するだけ） */
  fireEvents() {
    if (!Game.gen) return;
    const evs = Game.gen.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (!e.done && e.at <= Game.dist) { e.done = true; Game.eventLog.push(e); Game.onEvent(e); }
    }
  },
  onEvent(e) {
    /* チュートリアルの吹き出しと、大演出の開始/終了 */
    Tutorial.onEvent(e);
    Setpieces.onEvent(e);
    /* エンドレスのゾーン切替（トンネル抜け / P6） */
    if (e.type === 'zone.switch' || e.type === 'zone.gate') Endless.onEvent(e, Game);
    /* P3以降: 鏡ゲート・入れ替え・重力反転などもここで処理する */
  },

  /* --- 当たり判定（AABB） ------------------------------------------------- */
  collide() {
    /* 自由飛行中（契約§4.5）は2体ではなく DUO体（円）が、空中の矩形と当たる。
       レーンの障害物は滑空区間に1つも無いので、ここで完全に道が分かれる。 */
    if (FF.active()) {
      const hit = FF.collide(Game.prevDist, Game.dist);
      if (hit) Game.onHit(Game.runners[0], { type: 'AIR_' + hit.kind, lane: 0, at: hit.at });
      return;
    }
    /* 合体区間（契約§4.5 / S8）: 判定は **床を走っている1体ぶん**だけ。
       天井側には誰も居ないので、天井側の障害物には当たらない。 */
    const lead = Game.merged ? Game.mergeLead() : null;
    for (let i = 0; i < Game.active.length; i++) {
      const o = Game.active[i];
      if (!Obstacles.near(o, Game.dist, 4)) continue;
      for (let k = 0; k < Game.runners.length; k++) {
        const r = Game.runners[k];
        if (lead && r !== lead) continue;
        if (!Obstacles.affects(o, r.surface)) continue;
        /* 当たり判定は Obstacles.hits だけを通す（動く／点滅する障害物も同じ道） */
        if (!Obstacles.hits(o, Runners.box(r), Game.dist)) continue;
        /* 無害な障害物（減速帯）は死なせず、速度だけ落とす（1個につき1回） */
        if (OBS[o.type].harmless) { Game.onSlow(r, o); continue; }
        Game.onHit(r, o);
        return;
      }
    }
  },

  /* 減速帯に触れた（§4.4 S3）。死なない。同じ障害物では1回だけ効く */
  onSlow(runner, o) {
    if (o._slowed) return false;
    o._slowed = true;
    Game.slowT = CFG.SLOW.T;
    return true;
  },
  /* 巨岩に追いつかれた（§4.4 S3）。通常の死と同じ扱い */
  onCrush() {
    if (Game.status !== 'playing') return;
    Game.onHit(Game.runners[0], { type: 'BOULDER', lane: 0, at: Game.dist });
  },

  onHit(runner, obstacle) {
    if (Game.status !== 'playing') return;
    Game.status = 'dying';                 // スロー0.6秒（§4.8）
    Game.dyingT = 0;
    Game.killer = { runner: runner.id, obstacle: obstacle.type, lane: obstacle.lane, at: obstacle.at };
    U.sfx('hit');
    Game.runners.forEach((r) => { r.alive = true; });   // 演出中は表示を残す（共有ライフ＝2体とも終了）
  },
  onDead() {
    Game.status = 'dead';
    if (typeof HUD !== 'undefined' && HUD.bridgeCue) HUD.bridgeCue(null);
    Game.bestUpdated = Game.saveBest();
    Setpieces.reset();
    Tutorial.hide();
    const db = document.getElementById('dead-best');
    if (db) db.textContent = Game.bestUpdated ? '★ 自己ベスト更新' : '';
    const dd = document.getElementById('dead-dist');
    if (dd) dd.textContent = Math.floor(Game.dist) + ' m';
    const cp = document.getElementById('dead-cp');
    if (cp) cp.textContent = Game.stage.endless ? 'エンドレス' : ('チェックポイント ' + Math.floor(Game.lastCheckpoint) + ' m から再開');
    const btn = document.getElementById('btn-retry');
    if (btn) btn.style.display = Game.stage.endless ? 'none' : '';
    UI.show('dead');
  },
  /* ゴール到達 → 短い演出 → リザルト */
  onGoal() {
    if (Game.status !== 'playing') return;
    Game.status = 'goal';
    Game.goalT = 0;
    U.sfx('goal');
    Tutorial.hide();
  },
  /* ゴール演出のあと。最終ステージ（S8）なら **全クリア演出**を挟む（§6 P5b） */
  afterGoal() {
    if (Game.stage && Game.stage.id === 'S8') { Game.startAllClear(); return; }
    Game.onClear();
  },
  /* 全クリア（8ステージすべて）: localStorage に印を残し、短い演出へ */
  startAllClear() {
    Game.status = 'allclear';
    Game.allClearT = 0;
    U.lsSet('allclear', true);
    if (typeof UI !== 'undefined' && UI.allClearShow) UI.allClearShow();
    return true;
  },
  allClearK() {
    return (Game.status === 'allclear') ? U.clamp(Game.allClearT / Game.ALLCLEAR_T, 0, 1) : 0;
  },
  onClear() {
    Game.status = 'clear';
    if (typeof UI !== 'undefined' && UI.allClearHide) UI.allClearHide();
    Game.bestUpdated = Game.saveBest(true);
    const cd = document.getElementById('clear-dist');
    if (cd) cd.textContent = Math.floor(Game.stage.lengthM) + ' m 完走 ／ ' + Game.stage.name;
    const cb = document.getElementById('clear-best');
    if (cb) cb.textContent = Game.bestUpdated ? '★ ベスト更新！' : '';
    Setpieces.reset();
    UI.show('clear');
  },
  updateCheckpoint() {
    const cps = Game.stage.checkpoints;
    for (let i = 0; i < cps.length; i++) {
      if (Game.dist >= cps[i] && cps[i] > Game.lastCheckpoint) { Game.lastCheckpoint = cps[i]; U.sfx('checkpoint'); }
    }
  },
  /* 戻り値: ベストを更新したか */
  saveBest(cleared) {
    if (!Game.stage) return false;
    let updated = false;
    if (Game.stage.endless) {
      const best = U.lsGet('best.endless', 0);
      if (Game.dist > best) { U.lsSet('best.endless', Math.floor(Game.dist)); updated = true; }
    } else {
      const key = 'best.' + Game.stage.id;
      const best = U.lsGet(key, 0);
      if (Game.dist > best) { U.lsSet(key, Math.floor(Game.dist)); updated = true; }
      if (cleared) {
        const list = U.lsGet('cleared', []);
        if (list.indexOf(Game.stage.id) < 0) { list.push(Game.stage.id); U.lsSet('cleared', list); updated = true; }
      }
    }
    return updated;
  },

  /* --- 描画（更新とワンセットで呼ぶ） ------------------------------------- */
  render() {
    if (!World.ready) return;
    World.syncCorridor(Game.dist, Game.active, Game.speed);
    World.syncObstacles(Game.active, Game.dist);
    World.syncGoal(Game.dist, Game.stage);
    World.syncRunners(Game.runners, Game.t);
    World.syncCamera(Game.runners, Game.status === 'dying' ? Game.dyingT : 0, Game.speed, Game._lastDt);
    World.render();
    HUD.update(Game);
    if (typeof Audio !== 'undefined' && Audio.update && Audio.SE) Audio.update(Game);
  },
  pump(dt) { Game.step(dt); Game.render(); },

  /* --- rAF ループ --------------------------------------------------------- */
  _last: 0,
  loop(now) {
    const dt = Game._last ? (now - Game._last) / 1000 : 1 / 60;
    Game._last = now;
    /* 実機の重さを測って描画品質を自動で下げる（走行中だけ / P6） */
    if (Game.status === 'playing') World.perfSample(dt * 1000);
    Game.pump(dt);
    requestAnimationFrame(Game.loop);
  },
  run() { requestAnimationFrame(function (t) { Game._last = t; requestAnimationFrame(Game.loop); }); },

  /* --- テスト用の観測 ----------------------------------------------------- */
  snapshot() {
    const rs = {};
    Game.runners.forEach((r) => {
      rs[r.id] = {
        lane: r.laneTo, laneVal: r.laneVal, x: Runners.x(r),
        surface: r.surface, act: r.act, actT: r.actT,
        foot: Runners.footY(r), offset: Runners.footOffset(r),
        mirrored: r.mirrored, hand: Game.handSwap ? (r.hand === 'left' ? 'right' : 'left') : r.hand,
        box: Runners.box(r)
      };
    });
    return {
      status: Game.status,
      stage: Game.stage ? Game.stage.id : null,
      seed: Game.seed,
      dist: Game.dist,
      speed: Game.speed,
      alive: (Game.status === 'playing'),
      handSwap: Game.handSwap,
      bot: Game.botMode,
      checkpoint: Game.lastCheckpoint,
      killer: Game.killer,
      runners: rs,
      chunk: Game.gen ? (Game.gen.log.filter((c) => c.startM <= Game.dist).pop() || null) : null,
      obstacles: Game.active.length,
      slowT: +Game.slowT.toFixed(3),
      /* 同時スイッチ（§4.5 / P3b）と神殿崩壊（§4.4 S4）の観測窓口 */
      sync: Sync.snapshot(Game),
      /* 無重力ジャンプ（§4.5 / S6）: 今この瞬間の滞空倍率と区間 */
      zeroK: Zero.cur,
      zeros: Zero.snapshot(Game),
      /* 重力反転ワープ（§4.5 / S6）: 面が入れ替わっているか・回転演出の残り */
      flipped: Game.flipped(),
      flipN: Game.flipN,
      flipT: +Game.flipT.toFixed(3),
      warps: Warp.snapshot(Game),
      /* 鏡ゾーン・入れ替えワープ（§4.5 / S7） */
      mirrors: Mirror.snapshot(Game),
      swaps: Swap.snapshot(Game),
      /* 合体区間（§4.5 / S8）: 1体になっているか・合体の度合い・区間 */
      merged: Game.merged,
      mergeK: +Game.mergeK().toFixed(3),
      merges: Merge.snapshot(Game),
      mergeLead: Game.merged ? Game.mergeLead().id : null,
      allClearK: +Game.allClearK().toFixed(3),
      /* 画面の上下が今どちらのキャラを担当しているか（§4.2 / 入れ替えワープ） */
      zoneOwner: { bottom: (Game.runnerForZone('bottom') || {}).id || null,
                   top: (Game.runnerForZone('top') || {}).id || null },
      /* 巨大魚の通過（§4.4 S5）: 画面占有と目玉 */
      fish: Setpieces.fishActive()
        ? { phase: Setpieces.fishPos(Game.dist).phase,
            cover: +Setpieces.fishOnScreen(Game.dist).toFixed(4),
            eye: +Setpieces.fishEyeOnScreen(Game.dist).toFixed(4) }
        : null,
      templeExit: +Setpieces.templeExit(Game.dist).toFixed(3),
      rockGap: Setpieces.rockGap(),
      lookBack: +Setpieces.lookBack(Game.dist).toFixed(3),
      setpiece: Setpieces.id(),
      mini: (Setpieces.state && Setpieces.state.mini) || null,
      /* エンドレス（§4.4 / P6）: いまのゾーンと、生成済みのゾーン切替・ミニ大演出 */
      zone: Zones.id(),
      switches: (Game.gen && Game.gen.switches) ? Game.gen.switches.length : 0,
      minis: (Game.gen && Game.gen.minis) ? Game.gen.minis.length : 0,
      phase: Setpieces.state ? (Setpieces.state.phase || null) : null,
      glide: Setpieces.glideActive(),
      /* 大ジャンプの DUO体（契約§4.5 改訂）: 合体の度合いと断面での位置 */
      duoK: +Setpieces.duoK(Game.dist).toFixed(3),
      duo: FF.snapshot(),
      inputMode: Input.mode,
      tip: Tutorial.current,
      goalT: Game.goalT,
      bestUpdated: Game.bestUpdated,
      drawCalls: World.drawCalls(),
      /* カメラ対称性（§4.1）: 床側/天井側の「画面上の見かけの高さ」の比。0.8〜1.25 が合格 */
      camSym: World.ready ? World.camSym() : null
    };
  }
};
