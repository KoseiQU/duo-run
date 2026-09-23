/* ============================================================================
   DUO RUN — testhook.js  監査・機械テストの入口 window.DUO（契約 §7）

     DUO.start(stageIdOr'endless'[, seed])   ステージ開始
     DUO.pump(dt)                            更新＋描画をワンセットで1フレーム
     DUO.key(code, down)                     キー入力（e.code）
     DUO.touch(zone, dir)                    'bottom'|'top' × 'left'|'right'|'up'|'down'
                                             （dir はスクリーン方向。担当キャラの足場で
                                               jump/slide に変換される＝§4.2 改訂）
     DUO.state()                             速度・距離・2体の状態・生存・現在チャンク
     DUO.skipTo(m)                           指定距離へ跳ぶ
     DUO.bot(mode)                           null | 'perfect' | 'delay250'
     DUO.runAll() / DUO.runQuick()           機械テスト（Promiseを返す）
     DUO.reset()                             製品の初期状態（タイトル）へ戻す
     DUO.__suites                            tests/*.js が push するテスト集合
   ============================================================================ */
'use strict';

const DUO = {
  __suites: [],
  __lastReport: null,
  __running: false,

  start(stageId, seed) { return DUO.state(Game.start(stageId || 'S0', seed)); },
  pump(dt) { Game.pump(dt === undefined ? 1 / 60 : dt); return DUO.state(); },
  key(code, down) { Input.keyEvent(code, !!down); return true; },
  touch(zone, dir) { return Input.gesture(zone, dir); },
  state() { return Game.snapshot(); },
  skipTo(m) {
    if (!Game.stage || Game.status === 'idle') return null;
    const st = Game.status;
    Game.resetRun(m);
    Game.status = (st === 'playing' || st === 'dying') ? 'playing' : st;
    return DUO.state();
  },
  bot(mode) { Game.botMode = (mode === 'off') ? null : (mode || null); return Game.botMode; },
  reset() {
    Game.botMode = null;
    Game.handSwap = false;
    Game.merged = false;
    Game.runners.forEach((r) => { r.mirrored = false; r.jumpT = CFG.JUMP_T; });
    Game.runners[0].surface = 'floor';
    Game.runners[1].surface = 'ceil';
    Game.flipT = 0;
    Game.flipN = 0;
    Zero.cur = 1;
    if (typeof HUD !== 'undefined' && HUD.mergeCue) HUD.mergeCue(false);
    if (typeof UI !== 'undefined' && UI.allClearHide) UI.allClearHide();
    Input.clear();
    Game.toTitle();
    return DUO.state();
  },

  /* 更新のみ（描画なし）。長距離のボット完走テスト用 */
  __step(dt) { Game.step(dt); return null; },

  __internal: {
    CFG: CFG, OBS: OBS, Game: Game, Obstacles: Obstacles, Runners: Runners,
    Fair: Fair, World: World, Input: Input, Bot: Bot, U: U,
    Setpieces: Setpieces, Tutorial: Tutorial, UI: UI, HUD: HUD, FF: FF, Sync: Sync,
    Warp: Warp, Zero: Zero, Bridge: Bridge, Mirror: Mirror, Swap: Swap, Merge: Merge, Endless: Endless, Audio: Audio, Platform: Platform,
    expandEntry: expandEntry,
    createGenerator: createGenerator, makeStage: makeStage, CHUNK_DEFS: CHUNK_DEFS,
    STAGE_DEFS: STAGE_DEFS, INTRO_S1: INTRO_S1, MOT: MOT,
    endlessPool: endlessPool, scaleParams: scaleParams,
    Zones: Zones, ZoneKit: ZoneKit, ZoneNeon: ZoneNeon, ZoneRuins: ZoneRuins, ZoneSea: ZoneSea,
    ZoneSpace: ZoneSpace, ZoneMirror: ZoneMirror, ZoneCore: ZoneCore,
    /* 障害物の見た目の外接箱（**判定外の装飾を除く**）。
       契約§4.3（2026-09-23 P5c）でジャンプ障害物に足した
       「両脇の高い支柱(1.6m)・支柱上端の警告バー・手前の路面の警告帯(4m)」は
       当たり判定を一切持たない**視認性のための標示**なので、
       「見た目と判定のズレ ±10%」はこれらを外して測る（除かないと、
       判定 0.6m の柵に対して見た目 1.72m/奥行き 4.25m を比べることになり、
       本来の目的＝「当たり判定と実体の食い違いを見つける」が測れなくなる）。
       装飾のメッシュには生成時に userData.deco が立っている。 */
    viewBox(view) {
      const b = new THREE.Box3();
      b.makeEmpty();
      view.traverse((o) => { if (o.isMesh && !o.userData.deco) b.expandByObject(o); });
      return b;
    },
    /* テストで単体の障害物を置く */
    spawnOne(type, surface, lane, atAheadM) {
      const o = Obstacles.make(type, surface, lane, Game.dist + atAheadM, Game.dist);
      Game.active.push(o);
      return o;
    },
    clearObstacles() {
      Game.active.forEach((o) => World.dropView(o));
      Game.active.length = 0;
    }
  },

  /* --- テストハーネス ------------------------------------------------------ */
  _mkT() {
    const res = { pass: 0, fail: 0, msgs: [] };
    return {
      res: res,
      ok(c, m) { if (c) res.pass++; else { res.fail++; res.msgs.push('NG: ' + m); } return !!c; },
      eq(a, b, m) { return this.ok(a === b, m + ' [got ' + a + ' / want ' + b + ']'); },
      near(a, b, eps, m) { return this.ok(Math.abs(a - b) <= eps, m + ' [got ' + a + ' / want ' + b + '±' + eps + ']'); },
      info(m) { res.msgs.push('.. ' + m); }
    };
  },

  _run(quickOnly) {
    if (DUO.__running) return Promise.reject(new Error('already running'));
    DUO.__running = true;
    const t0 = (performance && performance.now) ? performance.now() : Date.now();
    const lsSnap = U.lsSnapshot();
    DUO.__lsSnap = lsSnap;
    const list = DUO.__suites.filter((s) => (quickOnly ? s.quick : true));
    const report = { mode: quickOnly ? 'quick' : 'all', suites: [], pass: 0, fail: 0, sec: 0 };

    const yieldOnce = () => new Promise((r) => setTimeout(r, 0));

    return (async function () {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        DUO.reset();
        /* 製品の初期状態＝チュートリアル未了（P6 初回のみ表示）。スイートごとに戻す */
        try { window.localStorage.removeItem(CFG.LS_PREFIX + 'tutorialDone'); } catch (e) { /* noop */ }
        if (typeof UI !== 'undefined') UI._testLock = true;   // テスト中はステージ解放規則を本来の姿で検証
        const t = DUO._mkT();
        const st = (performance && performance.now) ? performance.now() : Date.now();
        try {
          /* 非同期のテスト（音のオフライン描画など / P6）は Promise を返してよい */
          const pr = s.run(t);
          if (pr && typeof pr.then === 'function') await pr;
        } catch (e) {
          t.res.fail++;
          t.res.msgs.push('EX: ' + (e && e.stack ? e.stack : e));
        }
        const el = (((performance && performance.now) ? performance.now() : Date.now()) - st) / 1000;
        report.suites.push({ name: s.name, pass: t.res.pass, fail: t.res.fail, sec: +el.toFixed(2), msgs: t.res.msgs });
        report.pass += t.res.pass;
        report.fail += t.res.fail;
        await yieldOnce();
      }
      /* --- 後始末: localStorage と製品状態を完全復帰し、通常操作が通るか確かめる --- */
      if (typeof UI !== 'undefined') UI._testLock = false;
      U.lsRestore(lsSnap);
      DUO.reset();
      const t = DUO._mkT();
      try {
        /* 中身で比べる（キーの並び順は localStorage 側の都合で変わる） */
        const stable = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
        const snapNow = U.lsSnapshot();
        t.eq(stable(snapNow), stable(lsSnap), 'localStorage が実行前と一致');
        t.eq(DUO.state().status, 'idle', 'タイトル画面へ復帰');
        t.eq(document.getElementById('screen-title').classList.contains('on'), true, 'タイトルのDOMが表示状態');
        DUO.start('S0', 4242);
        DUO.pump(1 / 60);
        t.eq(DUO.state().status, 'playing', 'runAll後に通常のプレイ開始ができる');
        DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
        t.eq(DUO.state().runners.lumen.act, 'jump', 'runAll後にキー入力が効く');
        DUO.touch('top', 'down'); DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.act, 'jump', 'runAll後にタッチ入力が効く（上半分の下フリック＝UMBRAのジャンプ）');
        DUO.reset();
        t.eq(DUO.state().status, 'idle', '最後にタイトルへ戻る');
      } catch (e) {
        t.res.fail++; t.res.msgs.push('EX: ' + (e && e.stack ? e.stack : e));
      }
      report.suites.push({ name: '_restore（初期状態復帰）', pass: t.res.pass, fail: t.res.fail, sec: 0, msgs: t.res.msgs });
      report.pass += t.res.pass; report.fail += t.res.fail;

      U.lsRestore(lsSnap);
      DUO.reset();
      /* 音の設定（メモリ上）も保存値へ戻す（P6） */
      if (typeof Audio !== 'undefined' && Audio.SE && Audio.loadSettings) Audio.loadSettings();
      report.sec = +((((performance && performance.now) ? performance.now() : Date.now()) - t0) / 1000).toFixed(2);
      report.ok = (report.fail === 0);
      DUO.__lastReport = report;
      DUO.__running = false;
      return report;
    })();
  },

  runAll() { return DUO._run(false); },
  runQuick() { return DUO._run(true); }
};

window.DUO = DUO;
