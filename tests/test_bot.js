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

  /* シードをまとめて走らせる（完走できなかったものだけ詳細を残す） */
  function sweep(mode, from, to) {
    const bad = [];
    for (let seed = from; seed <= to; seed++) {
      const r = runStage('S0', seed, mode, 200);
      if (r.status !== 'clear') {
        bad.push('seed' + seed + ' ' + r.dist.toFixed(0) + 'm ' +
                 (r.killer ? r.killer.obstacle + '@lane' + r.killer.lane + '/' + r.killer.runner : '?'));
      }
    }
    return bad;
  }

  DUO.__suites.push({
    name: 'ボット perfect が S0 を完走する（seed 1〜50 全部）',
    quick: true,
    run(t) {
      const bad = sweep('perfect', 1, 50);
      t.eq(bad.length, 0, 'perfect 50シード全完走（未完走: ' + (bad.join(' / ') || 'なし') + '）');
      /* 1本は距離と所要も記録しておく */
      const r = runStage('S0', 26, 'perfect', 200);
      t.info('seed26: ' + r.status + ' ' + r.dist.toFixed(0) + 'm / ' + r.sec.toFixed(1) + '秒ぶんの走行');
    }
  });

  DUO.__suites.push({
    name: 'ボット delay250（反応0.25秒遅れ）が S0 を seed 1〜50 中 45 以上完走',
    quick: true,
    run(t) {
      const bad = sweep('delay250', 1, 50);
      t.ok(bad.length <= 5, 'delay250 完走 ' + (50 - bad.length) + '/50 ≥ 45（未完走: ' + (bad.join(' / ') || 'なし') + '）');
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

  /* P1.1 の回帰テスト:
     真横を通過している最中の障害物のレーンへ、自分から横移動して突っ込んでいた。
     （§4.7 の反応窓があるので、通過しきってから動いても次のウォールには間に合う） */
  DUO.__suites.push({
    name: '回帰: 真横を通過中の障害物のレーンへは横移動しない',
    quick: true,
    run(t) {
      const In = I(), Game = In.Game, CFG = In.CFG;
      /* 障害物のレーンへ移りたい状況を作り、前後の様々な位置関係で
         「安全と判断した横移動は本当に死なない」ことを確かめる */
      const cases = [
        { type: 'PILLAR',  surface: 'floor', obsLane: 1,  myLane: 0, dir: 1,  who: 0 },
        { type: 'WIDEBAR', surface: 'floor', obsLane: -1, myLane: 1, dir: -1, who: 0 }, // -1,0を塞ぐ
        { type: 'ROVER',   surface: 'ceil',  obsLane: 1,  myLane: 0, dir: 1,  who: 1 }
      ];
      cases.forEach((c) => {
        let refused = 0, allowed = 0;
        for (let k = 0; k <= 16; k++) {
          const ahead = 0.8 - k * 0.12;                       // +0.8m 手前 〜 -1.1m 後ろ
          DUO.reset(); DUO.start('S0', 5); In.clearObstacles();
          Game.runners.forEach((x) => { x.laneFrom = x.laneTo = x.laneVal = c.myLane; x.laneT = CFG.LANE_T; });
          const r = Game.runners[c.who];
          const o = In.spawnOne(c.type, c.surface, c.obsLane, 6);
          let guard = 0;
          while ((o.at - Game.dist) > ahead && guard++ < 400) DUO.__step(1 / 60);
          if (Game.status !== 'playing') { t.ok(false, c.type + ': 準備段階で死んだ'); break; }
          if (In.Bot.moveIsSafe(Game, r, c.myLane + c.dir)) {
            allowed++;
            In.Runners.input(r, c.dir > 0 ? 'right' : 'left');   // 実際に動かしてみる
            for (let i = 0; i < 45; i++) DUO.__step(1 / 60);
            t.eq(Game.status, 'playing',
                 c.type + '(' + c.surface + '): 相対 ' + ahead.toFixed(2) + 'm で「安全」と判断した横移動で死なない');
          } else {
            refused++;
          }
        }
        t.ok(refused > 0, c.type + '(' + c.surface + '): 危ない瞬間は横移動を拒否している（' + refused + '/17）');
        t.ok(allowed > 0, c.type + '(' + c.surface + '): 安全な瞬間は横移動を許可している（' + allowed + '/17）');
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
