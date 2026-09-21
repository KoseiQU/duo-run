/* ============================================================================
   tests/test_bot.js — 自動プレイヤーの完走証明（§4.7）と描画の健全性
   ・長距離のランは __step（描画なし）で回す。描画そのものは別テストで確認する。
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;

  function runStage(stageId, seed, mode, maxSec) {
    const Game = I().Game;
    DUO.reset();
    DUO.start(stageId, seed);
    DUO.bot(mode);
    let frames = 0;
    const cap = Math.round(maxSec * 60);
    while (Game.status === 'playing' && frames++ < cap) DUO.__step(1 / 60);
    return { status: Game.status, dist: Game.dist, sec: frames / 60, killer: Game.killer };
  }

  DUO.__suites.push({
    name: 'ボット perfect が S0 を完走する',
    quick: true,
    run(t) {
      [1, 7, 2024].forEach((seed) => {
        const r = runStage('S0', seed, 'perfect', 200);
        t.eq(r.status, 'clear', 'perfect / seed ' + seed + ' 完走（' + r.dist.toFixed(0) + 'm, ' +
             r.sec.toFixed(1) + '秒, 死因=' + (r.killer ? r.killer.obstacle + '@lane' + r.killer.lane : 'なし') + '）');
      });
    }
  });

  DUO.__suites.push({
    name: 'ボット delay250（反応0.25秒遅れ）',
    quick: false,
    run(t) {
      [1, 7].forEach((seed) => {
        const r = runStage('S0', seed, 'delay250', 200);
        t.eq(r.status, 'clear', 'delay250 / seed ' + seed + ' 完走（' + r.dist.toFixed(0) + 'm, 死因=' +
             (r.killer ? r.killer.obstacle + '@lane' + r.killer.lane : 'なし') + '）');
      });
    }
  });

  DUO.__suites.push({
    name: 'ボット perfect が仮エンドレスを走り続ける',
    quick: false,
    run(t) {
      const r = runStage('endless', 42, 'perfect', 120);
      t.eq(r.status, 'playing', 'エンドレス120秒 生存（' + r.dist.toFixed(0) + 'm 到達）');
      t.ok(r.dist > 900, 'エンドレスで 900m 以上進む（' + r.dist.toFixed(0) + 'm）');
    }
  });

  DUO.__suites.push({
    name: '描画: pump は更新＋描画をワンセットで行う / ドローコール',
    quick: true,
    run(t) {
      const W = I().World;
      DUO.reset(); DUO.start('S0', 3); DUO.bot('perfect');
      const before = W.renderer.info.render.frame;
      const d0 = DUO.state().dist;
      DUO.pump(1 / 60);
      t.ok(W.renderer.info.render.frame > before, 'pump で描画フレームが進む');
      t.ok(DUO.state().dist > d0, 'pump で更新も進む');
      /* 障害物が視界に多い所でドローコールを測る */
      DUO.skipTo(500);
      for (let i = 0; i < 120; i++) DUO.pump(1 / 60);
      const calls = W.drawCalls();
      t.ok(calls > 0 && calls <= 300, 'ドローコール ' + calls + ' ≤ 300');
      t.ok(W.renderer.info.render.triangles > 0, '三角形が描かれている');
      /* 2体が常に画面内（カメラの視錐台に入っている） */
      const cam = W.camera;
      cam.updateMatrixWorld();
      const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const fr = new THREE.Frustum().setFromProjectionMatrix(proj);
      I().Game.runners.forEach((r) => {
        const p = new THREE.Vector3(I().Runners.x(r), I().Runners.footY(r), 0);
        t.ok(fr.containsPoint(p), r.id + ' がカメラの視界内にいる');
      });
    }
  });

  DUO.__suites.push({
    name: 'ボットは人間と同じ入力経路を通る',
    quick: true,
    run(t) {
      const In = I();
      DUO.reset(); DUO.start('S0', 11); DUO.bot('perfect');
      In.clearObstacles();
      In.spawnOne('ROVER', 'floor', 0, 14);
      /* Input.push を一時的に包んで、ボットの判断がキュー経由か数える */
      const orig = In.Input.push;
      let pushes = 0;
      In.Input.push = function (h, a) { pushes++; return orig.call(In.Input, h, a); };
      let guard = 0;
      while (In.Game.status === 'playing' && guard++ < 400 && In.Game.dist < 20) DUO.__step(1 / 60);
      In.Input.push = orig;
      t.ok(pushes > 0, 'ボットの判断が Input キューに載る（' + pushes + '回）');
      t.eq(In.Game.status, 'playing', 'ボットは置いた障害物を回避する');
    }
  });
})();
