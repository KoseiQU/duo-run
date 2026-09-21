/* ============================================================================
   DUO RUN — core.js  ゲーム本体（状態機械・ループ・当たり判定・死亡/再開）
   更新順は step() の1か所だけ。DUO.pump も rAF ループも必ずここを通る。
   ============================================================================ */
'use strict';

const Game = {
  /* --- 状態 --------------------------------------------------------------- */
  status: 'idle',        // 'idle' | 'playing' | 'dying' | 'dead' | 'clear'
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
  stats: { frames: 0 },

  /* --- 初期化 ------------------------------------------------------------- */
  init(canvas) {
    Game.runners = [
      Runners.create('lumen', 'floor', 'left'),
      Runners.create('umbra', 'ceil', 'right')
    ];
    if (canvas) { World.init(canvas); Input.attach(canvas.parentNode || canvas); }
    HUD.init();
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
  setHandSwap(on) { Game.handSwap = !!on; },
  setMirror(id, on) { Game.runners.forEach((r) => { if (r.id === id) r.mirrored = !!on; }); },
  /* 床/天井の入れ替え（重力反転ワープのフック） */
  swapSurfaces() {
    Game.runners.forEach((r) => { r.surface = (r.surface === 'floor') ? 'ceil' : 'floor'; });
  },

  /* --- 開始・再開 --------------------------------------------------------- */
  start(stageId, seed) {
    Game.stage = makeStage(stageId);
    Game.seed = (seed === undefined) ? ((Math.random() * 1e9) | 0) : seed;
    Game.handSwap = false;
    Game.lastCheckpoint = 0;
    Game.eventLog.length = 0;
    Game.resetRun(0);
    Game.status = 'playing';
    UI.show('play');
    return Game.stage;
  },
  retry() {
    if (!Game.stage) return;
    Game.resetRun(Game.stage.endless ? 0 : Game.lastCheckpoint);
    Game.status = 'playing';
    UI.show('play');
  },
  toTitle() {
    Game.status = 'idle';
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
    Game.clearWorld();
    Game.dist = fromM;
    Game.t = 0;
    Game.dyingT = 0;
    Game.killer = null;
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
    Game.gen.events.forEach((e) => { e.done = (e.at < fromM + runway); });
    Game.lastCheckpoint = Game.stage.checkpoints.filter((c) => c <= fromM).pop() || 0;
  },

  /* --- 1フレーム（ロジックのみ） ------------------------------------------ */
  step(dt) {
    dt = U.clamp(dt || 0, 0, 0.05);
    Game.stats.frames++;
    Game.t += dt;

    if (Game.status === 'playing' || Game.status === 'dying') {
      const scale = (Game.status === 'dying') ? CFG.DEATH_SLOW_SCALE : 1;
      const d = dt * scale;

      if (Game.status === 'playing') {
        if (Game.botMode) Bot.update(Game, d);
        Game.applyInput();
      } else {
        Input.drain();                                  // 死亡演出中の入力は捨てる
      }

      Game.speed = Game.stage.speedAt(Game.dist);
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

      if (Game.status === 'playing') {
        Game.collide();
        Game.updateCheckpoint();
        if (!Game.stage.endless && Game.dist >= Game.stage.lengthM) Game.onClear();
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
    for (let i = 0; i < q.length; i++) {
      const r = Game.runnerForHand(q[i].hand);
      if (r) Runners.input(r, q[i].act);
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
  onEvent(/* e */) { /* P2以降: 鏡ゲート・入れ替え・重力反転などをここで処理する */ },

  /* --- 当たり判定（AABB） ------------------------------------------------- */
  collide() {
    for (let i = 0; i < Game.active.length; i++) {
      const o = Game.active[i];
      if (Math.abs(o.at - Game.dist) > 4) continue;
      const ob = Obstacles.box(o, Game.dist);
      for (let k = 0; k < Game.runners.length; k++) {
        const r = Game.runners[k];
        if (!Obstacles.affects(o, r.surface)) continue;
        if (U.overlapBox(Runners.box(r), ob)) { Game.onHit(r, o); return; }
      }
    }
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
    Game.saveBest();
    const dd = document.getElementById('dead-dist');
    if (dd) dd.textContent = Math.floor(Game.dist) + ' m';
    const cp = document.getElementById('dead-cp');
    if (cp) cp.textContent = Game.stage.endless ? 'エンドレス' : ('チェックポイント ' + Math.floor(Game.lastCheckpoint) + ' m から再開');
    const btn = document.getElementById('btn-retry');
    if (btn) btn.style.display = Game.stage.endless ? 'none' : '';
    UI.show('dead');
  },
  onClear() {
    Game.status = 'clear';
    Game.saveBest(true);
    const cd = document.getElementById('clear-dist');
    if (cd) cd.textContent = Math.floor(Game.stage.lengthM) + ' m 完走';
    UI.show('clear');
  },
  updateCheckpoint() {
    const cps = Game.stage.checkpoints;
    for (let i = 0; i < cps.length; i++) if (Game.dist >= cps[i] && cps[i] > Game.lastCheckpoint) Game.lastCheckpoint = cps[i];
  },
  saveBest(cleared) {
    if (!Game.stage) return;
    if (Game.stage.endless) {
      const best = U.lsGet('best.endless', 0);
      if (Game.dist > best) U.lsSet('best.endless', Math.floor(Game.dist));
    } else {
      const key = 'best.' + Game.stage.id;
      const best = U.lsGet(key, 0);
      if (Game.dist > best) U.lsSet(key, Math.floor(Game.dist));
      if (cleared) {
        const list = U.lsGet('cleared', []);
        if (list.indexOf(Game.stage.id) < 0) { list.push(Game.stage.id); U.lsSet('cleared', list); }
      }
    }
  },

  /* --- 描画（更新とワンセットで呼ぶ） ------------------------------------- */
  render() {
    if (!World.ready) return;
    World.syncCorridor(Game.dist, Game.active);
    World.syncObstacles(Game.active, Game.dist);
    World.syncRunners(Game.runners, Game.t);
    World.syncCamera(Game.runners, Game.status === 'dying' ? Game.dyingT : 0);
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
      drawCalls: World.drawCalls()
    };
  }
};
