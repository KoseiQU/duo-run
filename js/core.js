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
  speed: CFG.SPEED_MIN,
  t: 0,
  dyingT: 0,
  lastCheckpoint: 0,
  killer: null,          // {runner, obstacle}
  botMode: null,         // null | 'perfect' | 'delay250'
  handSwap: false,       // 入れ替えワープのフック（§4.5）
  runners: [],
  active: [],            // 表示・判定の対象になっている障害物
  gen: null,
  genPtr: 0,
  eventLog: [],
  goalT: 0,              // ゴール演出の経過（§4.8 ゴールゲート→ポーズ→リザルト）
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
     重力反転ワープ（§4.5）で面が入れ替わっても「画面の位置＝担当」は保たれる。 */
  runnerForZone(zone) {
    const surface = Input.surfaceOfZone(zone);
    return Game.runners.filter((r) => r.surface === surface)[0] || null;
  },
  setHandSwap(on) { Game.handSwap = !!on; },
  setMirror(id, on) { Game.runners.forEach((r) => { if (r.id === id) r.mirrored = !!on; }); },
  /* 床/天井の入れ替え（重力反転ワープのフック） */
  swapSurfaces() {
    Game.runners.forEach((r) => { r.surface = (r.surface === 'floor') ? 'ceil' : 'floor'; });
  },

  /* --- 開始・再開 --------------------------------------------------------- */
  start(stageId, seed) {
    Game.stage = makeStage(stageId);
    /* ゾーンの差し替え（契約§6 P3a）。見た目を返してから切り替える＝
       前のゾーンのプール・マテリアルを取りこぼさずに捨てられる。同じゾーンなら何もしない。 */
    Game.clearWorld();
    Zones.ensure(Game.stage.zone);
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
    Game.runners.forEach((r, i) => Runners.reset(r, i === 0 ? 'floor' : 'ceil'));
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
    Game.t = 0;
    Game.dyingT = 0;
    Game.killer = null;
    Game.slowT = 0;
    Game.speed = Game.stage.speedAt(fromM);
    Game.runners.forEach((r) => Runners.reset(r));
    Input.clear();
    Game.gen = createGenerator(Game.stage, Game.seed);
    Game.gen.ensure(fromM + CFG.SPAWN_AHEAD, fromM);
    /* 再開直後の助走: 視認距離ぶんの空白を必ず確保する（§4.7 視認距離） */
    const runway = Math.max(CFG.LEAD_IN * 0.6, Game.speed * CFG.FAIR.SEE + 10);
    Game.active = Game.gen.obstacles.filter((o) => o.at >= fromM + runway);
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
      if (Game.goalT >= Game.GOAL_T) Game.onClear();
      return;
    }

    if (Game.status === 'playing' || Game.status === 'dying') {
      const scale = (Game.status === 'dying') ? CFG.DEATH_SLOW_SCALE : 1;
      const d = dt * scale;

      if (Game.status === 'playing') {
        if (Game.botMode) Bot.update(Game, d);
        Game.applyInput();
      } else {
        Input.drain();                                  // 死亡演出中の入力は捨てる
      }

      /* 減速帯（§4.4 S3「瓦礫の山」）: 越えそこねると速度が一時的に -20%。
         遅くなるぶんには §4.7 の不変条件（時間基準）は緩む方向なので公平性は壊れない。 */
      if (Game.slowT > 0) Game.slowT = Math.max(0, Game.slowT - d);
      Game.speed = Game.stage.speedAt(Game.dist) * (1 - CFG.SLOW.MUL * U.clamp(Game.slowT / CFG.SLOW.T, 0, 1));
      Game.dist += Game.speed * d;

      /* 生成と取り込み・寿命 */
      Game.gen.ensure(Game.dist + CFG.SPAWN_AHEAD, Game.dist);
      while (Game.genPtr < Game.gen.obstacles.length) Game.active.push(Game.gen.obstacles[Game.genPtr++]);
      for (let i = Game.active.length - 1; i >= 0; i--) {
        if (Game.active[i].at < Game.dist - CFG.DESPAWN_BEHIND) {
          World.dropView(Game.active[i]);
          Game.active.splice(i, 1);
        }
      }

      Game.runners.forEach((r) => Runners.update(r, d));
      Game.fireEvents();
      Setpieces.update(Game, d);
      Tutorial.update(dt);

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
    /* 滑空区間（ビル間の大ジャンプ）は空中なので **レーン移動だけ**（契約§4.4）。
       ジャンプ／スライドはここで捨てる（人間もボットも同じ経路を通るので1か所でよい）。 */
    const glide = Setpieces.glideActive();
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      if (it.zone) {
        /* タッチ: 担当は画面の上下、動作は「足場から離れる向き＝ジャンプ」で決まる */
        const r = Game.runnerForZone(it.zone);
        if (!r) continue;
        const act = Input.actFromDir(it.dir, r.surface);
        if (glide && (act === 'jump' || act === 'slide')) continue;
        Runners.input(r, act);
      } else {
        const r = Game.runnerForHand(it.hand);
        if (!r) continue;
        if (glide && (it.act === 'jump' || it.act === 'slide')) continue;
        Runners.input(r, it.act);
      }
    }
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
    /* P3以降: 鏡ゲート・入れ替え・重力反転などもここで処理する */
  },

  /* --- 当たり判定（AABB） ------------------------------------------------- */
  collide() {
    for (let i = 0; i < Game.active.length; i++) {
      const o = Game.active[i];
      if (Math.abs(o.at - Game.dist) > 4) continue;
      for (let k = 0; k < Game.runners.length; k++) {
        const r = Game.runners[k];
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
    Game.runners.forEach((r) => { r.alive = true; });   // 演出中は表示を残す（共有ライフ＝2体とも終了）
  },
  onDead() {
    Game.status = 'dead';
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
    Tutorial.hide();
  },
  onClear() {
    Game.status = 'clear';
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
    for (let i = 0; i < cps.length; i++) if (Game.dist >= cps[i] && cps[i] > Game.lastCheckpoint) Game.lastCheckpoint = cps[i];
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
  },
  pump(dt) { Game.step(dt); Game.render(); },

  /* --- rAF ループ --------------------------------------------------------- */
  _last: 0,
  loop(now) {
    const dt = Game._last ? (now - Game._last) / 1000 : 1 / 60;
    Game._last = now;
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
      rockGap: Setpieces.rockGap(),
      lookBack: +Setpieces.lookBack(Game.dist).toFixed(3),
      setpiece: Setpieces.id(),
      phase: Setpieces.state ? (Setpieces.state.phase || null) : null,
      glide: Setpieces.glideActive(),
      tip: Tutorial.current,
      goalT: Game.goalT,
      bestUpdated: Game.bestUpdated,
      drawCalls: World.drawCalls(),
      /* カメラ対称性（§4.1）: 床側/天井側の「画面上の見かけの高さ」の比。0.8〜1.25 が合格 */
      camSym: World.ready ? World.camSym() : null
    };
  }
};
