/* ============================================================================
   tests/test_fairness.js — 生成チャンクが §4.7 の不変条件を満たすか（乱数シード100通り）
   ============================================================================ */
'use strict';

DUO.__suites.push({
  name: '公平性の不変条件（S0 / 100シード）',
  quick: true,
  run(t) {
    const I = DUO.__internal;
    let totalObs = 0, blanks = 0, minGapSec = 1e9, minSeeSec = 1e9;

    for (let seed = 1; seed <= 100; seed++) {
      const stage = I.makeStage('S0');
      const gen = I.createGenerator(stage, seed);
      /* 実プレイと同じく「前進しながら」生成する（視認距離を記録するため） */
      for (let d = 0; d < stage.lengthM; d += 20) gen.ensure(d + I.CFG.SPAWN_AHEAD, d);
      const list = gen.obstacles.filter((o) => o.at <= stage.lengthM);
      totalObs += list.length;
      blanks += gen.log.filter((c) => c.id === '(blank)').length;

      const errs = I.Fair.validate(list, stage.speedAt, { startLanes: [0] });
      const vis = I.Fair.checkVisibility(list, stage.speedAt);
      t.ok(errs.length === 0, 'seed ' + seed + ' 不変条件（反応窓/同時/ジャンプ連続/生存経路）: ' + errs.slice(0, 2).join(' | '));
      t.ok(vis.length === 0, 'seed ' + seed + ' 視認距離: ' + vis.slice(0, 2).join(' | '));

      /* 実測の最小マージンも見ておく（数値で監査できるように） */
      const walls = I.Fair.walls(list, stage.speedAt);
      for (let i = 1; i < walls.length; i++) {
        const sp = stage.speedAt(walls[i].at);
        minGapSec = Math.min(minGapSec, (walls[i].at - walls[i - 1].atEnd) / sp);
      }
      list.forEach((o) => {
        const sp = stage.speedAt(Math.max(0, o.spawnDist));
        minSeeSec = Math.min(minSeeSec, (o.at - o.spawnDist) / sp);
      });
      /* 速度2倍化（§4.1）でチャンクが2倍に伸びたぶん、900m あたりの個数は半分になる */
      if (seed === 1) t.ok(list.length > 15, 'seed1 で障害物が十分に生成される（' + list.length + '個）');
    }

    t.ok(minGapSec >= I.CFG.FAIR.REACT, '実測 最小ウォール間隔 ' + minGapSec.toFixed(3) + '秒 ≥ ' + I.CFG.FAIR.REACT + '秒');
    t.ok(minSeeSec >= I.CFG.FAIR.SEE, '実測 最小視認 ' + minSeeSec.toFixed(2) + '秒 ≥ ' + I.CFG.FAIR.SEE + '秒');
    t.info('100シード合計 ' + totalObs + '個 / 空白チャンク ' + blanks + '回');
  }
});

DUO.__suites.push({
  name: '公平性の検査そのものが機能するか（わざと違反を作る）',
  quick: true,
  run(t) {
    const I = DUO.__internal;
    const speedAt = () => 10;
    const mk = (type, surface, lane, at) => I.Obstacles.make(type, surface, lane, at, 0);

    /* 反応窓の違反: 同じキャラに 2.5m（0.25秒）間隔で2回要求
       ※ speed*0.15=1.5m 以内は「同時（＝1つのウォール）」として扱うので、それより広く取る */
    let bad = [mk('ROVER', 'floor', 0, 100), mk('WALLHOLE', 'floor', 0, 102.5)];
    t.ok(I.Fair.validate(bad, speedAt, { startLanes: [0] }).some((e) => e.indexOf('反応窓') >= 0), '近すぎる連続要求を違反として検出する');

    /* ジャンプ連続の違反: 0.45秒は空いているが 0.70秒には足りない */
    bad = [mk('ROVER', 'floor', 0, 100), mk('ROVER', 'floor', 0, 105)];
    t.ok(I.Fair.validate(bad, speedAt, { startLanes: [0] }).some((e) => e.indexOf('ジャンプ連続') >= 0), 'ジャンプ連続の違反を検出する');

    /* 生存経路なし: 3レーン全部を柱で塞ぐ */
    bad = [mk('PILLAR', 'floor', -1, 100), mk('PILLAR', 'floor', 0, 100), mk('PILLAR', 'floor', 1, 100)];
    t.ok(I.Fair.validate(bad, speedAt, { startLanes: [0] }).some((e) => e.indexOf('生存経路なし') >= 0), '全レーン封鎖を検出する');

    /* 同時要求の余白不足 */
    bad = [mk('ROVER', 'floor', 0, 100), mk('ROVER', 'ceil', 0, 100), mk('ROVER', 'floor', 1, 105.4)];
    t.ok(I.Fair.validate(bad, speedAt, { startLanes: [0] }).some((e) => e.indexOf('同時要求') >= 0), '両者同時要求の直後の詰めすぎを検出する');

    /* 視認距離の違反 */
    const near = mk('ROVER', 'floor', 0, 10); near.spawnDist = 0;
    t.ok(I.Fair.checkVisibility([near], speedAt).length > 0, '視認距離不足を検出する');

    /* 正常系は通る */
    const good = [mk('ROVER', 'floor', 0, 100), mk('ROVER', 'floor', 0, 120)];
    t.eq(I.Fair.validate(good, speedAt, { startLanes: [0] }).length, 0, '十分に離れた配置は合格する');
  }
});
