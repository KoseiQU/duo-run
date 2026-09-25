/* ============================================================================
   tests/test_collision.js — 当たり判定（AABB）
   「各障害物 × 各動作」で、正しい動作なら生存・誤った動作なら死亡になる表を検証する。
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;

  /* 2体とも actorLane に置き、指定の動作を正しい先行時間で出して、障害物を通過させる */
  function trial(type, surface, obsLane, actorLane, action) {
    const In = I();
    const CFG = In.CFG, Game = In.Game;
    DUO.reset();
    DUO.start('S0', 5);
    In.clearObstacles();
    Game.runners.forEach((r) => {
      r.laneFrom = actorLane; r.laneTo = actorLane; r.laneVal = actorLane; r.laneT = CFG.LANE_T;
    });
    const o = In.spawnOne(type, surface, obsLane, 30);
    const lead = CFG.BOT.JUMP_LEAD;
    let fired = false, guard = 0;
    /* 障害物の後端を 2m 通り過ぎるまで回す */
    while (Game.dist < o.at + 2 && guard++ < 1200) {
      if (!fired && action !== 'run' && (o.at - Game.dist) <= Game.speed * lead) {
        Game.runners.forEach((r) => In.Runners.input(r, action));
        fired = true;
      }
      DUO.__step(1 / 60);
      if (Game.status !== 'playing') break;
    }
    return { alive: Game.status === 'playing', killer: Game.killer };
  }

  function table(t, rows) {
    rows.forEach((row) => {
      const type = row[0], surface = row[1], obsLane = row[2], actorLane = row[3], action = row[4], want = row[5];
      const r = trial(type, surface, obsLane, actorLane, action);
      const label = I().OBS[type].label + '(' + surface + ' lane' + obsLane + ') × ' +
                    action + '@lane' + actorLane + ' → ' + (want ? '生存' : '死亡');
      t.eq(r.alive, want, label);
    });
  }

  DUO.__suites.push({
    name: '当たり判定: 床の障害物 × 各動作',
    quick: true,
    run(t) {
      table(t, [
        /* type,     surface, obsLane, actorLane, action, 期待:生存? */
        ['ROVER',   'floor', 0,  0, 'run',   false],
        ['ROVER',   'floor', 0,  0, 'jump',  true ],
        ['ROVER',   'floor', 0,  1, 'run',   true ],
        ['LASER_LOW','floor',0,  0, 'run',   false],
        ['LASER_LOW','floor',0,  0, 'jump',  true ],
        ['LASER_LOW','floor',0,  1, 'run',   true ],
        ['WIDEBAR', 'floor', -1, -1, 'run',  false],
        ['WIDEBAR', 'floor', -1,  0, 'run',  false],
        ['WIDEBAR', 'floor', -1,  0, 'jump', false],
        ['WIDEBAR', 'floor', -1,  1, 'run',  true ]
      ]);
    }
  });

  DUO.__suites.push({
    name: '当たり判定: 天井の障害物 × 各動作（UMBRAのみに効く）',
    quick: true,
    run(t) {
      table(t, [
        ['ROVER', 'ceil', 0,  0, 'run',   false],
        ['ROVER', 'ceil', 0,  0, 'jump',  true ],
        ['ROVER', 'ceil', 0, -1, 'run',   true ],
        ['LASER_LOW','ceil', 1,  1, 'run',   false],
        ['LASER_LOW','ceil', 1,  1, 'jump',  true ]
      ]);
      /* 天井の障害物で死ぬのは UMBRA（床の LUMEN ではない） */
      const r = trial('ROVER', 'ceil', 0, 0, 'run');
      t.eq(r.killer && r.killer.runner, 'umbra', '天井の障害物に当たるのは UMBRA');
      const r2 = trial('ROVER', 'floor', 0, 0, 'run');
      t.eq(r2.killer && r2.killer.runner, 'lumen', '床の障害物に当たるのは LUMEN');
    }
  });

  DUO.__suites.push({
    name: '当たり判定: 床天井の両方に効く障害物（ピラー／縦レーザー）',
    quick: true,
    run(t) {
      table(t, [
        ['PILLAR', 'floor', 0,  0, 'run',   false],
        ['PILLAR', 'floor', 0,  0, 'jump',  false],
        ['PILLAR', 'floor', 0, -1, 'run',   true ],
        ['LASER_V','floor', 0,  0, 'run',   false],
        ['LASER_V','floor', 0,  0, 'jump',  false],
        ['LASER_V','floor', 0,  1, 'run',   true ]
      ]);
      /* ピラーは 2体のどちらにも効く（天井側でも死ぬ） */
      const In = I();
      DUO.reset(); DUO.start('S0', 5); In.clearObstacles();
      In.Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = In.CFG.LANE_T; });
      /* LUMEN だけ安全なレーンへ逃がし、UMBRA を柱に当てる */
      const l = In.Game.runners[0];
      l.laneFrom = l.laneTo = l.laneVal = 1;
      const o = In.spawnOne('PILLAR', 'floor', 0, 20);
      let guard = 0;
      while (In.Game.dist < o.at + 2 && guard++ < 1200 && In.Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(In.Game.killer && In.Game.killer.runner, 'umbra', 'ピラーは天井側の UMBRA にも当たる');
    }
  });

  DUO.__suites.push({
    name: '共有ライフ・スロー0.6秒・チェックポイント再開',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG, Game = In.Game;
      DUO.reset(); DUO.start('S0', 5); In.clearObstacles();
      In.spawnOne('PILLAR', 'floor', 0, 12);
      let guard = 0;
      while (Game.status === 'playing' && guard++ < 1200) DUO.__step(1 / 60);
      t.eq(Game.status, 'dying', 'どちらかが当たった瞬間に死亡演出へ（共有ライフ）');
      /* スロー 0.6秒後に dead */
      for (let i = 0; i < Math.round(CFG.DEATH_SLOW_T * 60) + 2; i++) DUO.__step(1 / 60);
      t.eq(Game.status, 'dead', 'スロー ' + CFG.DEATH_SLOW_T + '秒 のあと dead');
      t.eq(document.getElementById('screen-dead').classList.contains('on'), true, '死亡画面が表示される');

      /* チェックポイント（1/3・2/3地点）からの再開 */
      DUO.reset(); DUO.start('S0', 5);
      const cps = Game.stage.checkpoints;
      t.eq(cps.length, 2, 'チェックポイントは2か所');
      t.near(cps[0], Game.stage.lengthM / 3, 1e-6, '1つ目は 1/3 地点');
      DUO.skipTo(cps[0] - 6);
      while (Game.dist < cps[0] + 4) DUO.__step(1 / 60);   // 実ステップで跨ぐ
      t.near(DUO.state().checkpoint, cps[0], 1e-6, '通過でチェックポイントが更新される');
      In.clearObstacles();
      In.spawnOne('PILLAR', 'floor', 0, 10);
      guard = 0;
      while (Game.status !== 'dead' && guard++ < 2000) DUO.__step(1 / 60);
      Game.retry();
      t.near(DUO.state().dist, cps[0], 1e-6, 'リトライで直前チェックポイントから再開する');
      t.eq(DUO.state().status, 'playing', 'リトライ後は playing');
      /* 再開直後は視認距離ぶんの空白がある */
      const nearest = Game.active.map((o) => o.at - Game.dist).sort((a, b) => a - b)[0];
      t.ok(nearest === undefined || nearest >= Game.speed * CFG.FAIR.SEE,
           '再開直後の最寄り障害物 ' + (nearest === undefined ? '-' : nearest.toFixed(1)) + 'm ≥ 視認距離');
    }
  });
})();
