/* ============================================================================
   tests/test_p7b.js — P7b（v2 の新ギミック・崩れる橋 2秒・鏡ゾーンの表示 / 契約 §4.5【改訂 v2】）
     【P7b-1】崩れる橋（2秒猶予）
       ・橋＝長い1レーン区間（speed × 3.0秒）。踏んで 1.9秒は生存・2.1秒は死（死因は崩れる橋）
       ・踏んだ瞬間に大きな赤い警告「崩れる！離れろ」（data-ui="bridge-cue"）。崩落・離脱で消える
       ・隣のレーンへ移れば抜けられる／踏まなければ崩れない／跳んでも穴に着地する（occ）
       ・Fair: 崩落の続く間はそのレーンを塞ぐ（cover）・崩れたレーンは横切れない
       ・S3/S4 50シードで §4.7・tip 違反0、ボット完走（perfect / delay250）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const stepN = (sec) => { let n = Math.round(sec * 60); while (n-- > 0 && Game.status === 'playing') DUO.__step(1 / 60); };

  /* S3 の 300m 付近・障害物を空にして、床の中央レーンに橋を1本置く（踏み口は aheadM 先） */
  function bridgeScene(aheadM, lane, surface) {
    const In = I();
    DUO.reset(); DUO.start('S3', 5); DUO.skipTo(300);
    In.clearObstacles();
    const unit = Game.speed;
    const at = Game.dist + aheadM + unit * In.CFG.BRIDGE.WARN_T;
    const o = In.Obstacles.make('BRIDGE', surface || 'floor', lane === undefined ? 0 : lane, at, Game.dist,
                                { bridge: { unitM: unit } });
    Game.active.push(o);
    Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = In.CFG.LANE_T; });
    return o;
  }
  function cueShown() {
    const e = document.getElementById('bridge-cue');
    if (!e || !e.classList.contains('on')) return false;
    const cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  DUO.__suites.push({
    name: 'P7b-1: 崩れる橋（踏んで1.9秒は生存・2.1秒は死／警告の可視性／横へ抜ける／踏まねば崩れない）',
    quick: true,
    run(t) {
      const In = I(), MOT = In.MOT, CFG = In.CFG;
      /* 1) 形: 踏み口〜終わり＝3.0秒、崩落点 at＝踏み口＋2.0秒 */
      const o0 = In.Obstacles.make('BRIDGE', 'floor', 0, 500, 0, { bridge: { unitM: 25 } });
      t.near(MOT.bridgeEnd(o0) - MOT.bridgeEntry(o0), 25 * 3.0, 1e-9, '橋の長さ = speed × 3.0秒');
      t.near(o0.at - MOT.bridgeEntry(o0), 25 * 2.0, 1e-9, '踏み口から崩落点まで = speed × 2.0秒');
      t.eq(MOT.bridgeFallAt(o0), Infinity, '踏まれていなければ崩れない');
      /* 速度で伸縮（生成時に unitM ＝ その地点の 1秒ぶん） */
      const st = In.makeStage('S3');
      const sc = st.speedAt(600) / CFG.REF_SPEED;
      t.near(In.scaleParams({ bridge: {} }, sc).bridge.unitM / st.speedAt(600), 1, 1e-3, 'unitM ÷ 速度 = 1秒（速度によらず 2.0秒で崩落）');

      /* 2) 踏んで waitSec だけ何もしない */
      const stay = (waitSec) => {
        const o = bridgeScene(40);
        let g = 0;
        while (typeof o.stepM !== 'number' && g++ < 2000 && Game.status === 'playing') DUO.__step(1 / 60);
        const stepped = (typeof o.stepM === 'number');
        const cue = cueShown();
        stepN(waitSec);
        return { stepped: stepped, cue: cue, alive: Game.status === 'playing', killer: Game.killer,
                 cueAfter: cueShown(), o: o };
      };
      const a = stay(1.9);
      t.eq(a.stepped, true, '橋の踏み口で「踏んだ」が記録される');
      t.eq(a.cue, true, '踏んだ瞬間に警告「崩れる！離れろ」が見える（#bridge-cue.on）');
      t.eq(a.alive, true, '踏んで 1.9秒はまだ板の上＝生存');
      t.eq(a.cueAfter, true, '崩落の前（1.9秒）は警告が出続ける');
      const e = document.getElementById('bridge-cue');
      const main = e.querySelector('.bc-main');
      t.eq(main.textContent + e.querySelector('.bc-sub').textContent, '崩れる！離れろ', '文言は「崩れる！離れろ」');
      t.eq(getComputedStyle(main).color.replace(/\s/g, ''), 'rgb(255,74,48)', '警告は赤（§4.3 の警告色）');
      t.ok(parseFloat(getComputedStyle(main).fontSize) >= 30, '大きな警告（' + getComputedStyle(main).fontSize + '）');
      t.eq(e.getAttribute('data-ui'), 'bridge-cue', 'data-ui="bridge-cue"');
      const b = stay(2.1);
      t.eq(b.alive, false, '踏んで 2.1秒はそのレーンが崩落している＝死');
      t.eq(b.killer && b.killer.obstacle, 'BRIDGE', '死因は崩れる橋');
      DUO.pump(1 / 60);
      stepN(1.0);
      t.eq(cueShown(), false, '死んだら警告は消える');

      /* 3) 踏んで 0.6秒で右へ抜ける → 橋の終わりまで生存・警告は消える */
      const o3 = bridgeScene(40);
      let g = 0;
      while (typeof o3.stepM !== 'number' && g++ < 2000) DUO.__step(1 / 60);
      stepN(0.6);
      DUO.touch('bottom', 'right');
      stepN(0.3);
      t.eq(cueShown(), false, '橋のレーンを離れたら警告は消える');
      while (Game.dist < MOT.bridgeEnd(o3) + 3 && g++ < 4000 && Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(Game.status, 'playing', '崩落の前に隣のレーンへ移れば抜けられる');
      t.ok(Game.dist >= MOT.bridgeFallAt(o3), '崩落は起きている（' + (MOT.bridgeFallAt(o3) - MOT.bridgeEntry(o3)).toFixed(1) + 'm 先で）');
      /* 崩れたレーンへ戻ると死ぬ（崩落が続く間） */
      const o4 = bridgeScene(40);
      g = 0;
      while (typeof o4.stepM !== 'number' && g++ < 2000) DUO.__step(1 / 60);
      DUO.touch('bottom', 'right'); stepN(0.3);
      while (Game.dist < MOT.bridgeFallAt(o4) + 3 && g++ < 4000) DUO.__step(1 / 60);
      DUO.touch('bottom', 'left'); stepN(0.4);
      t.eq(Game.status !== 'playing' && Game.killer && Game.killer.obstacle, 'BRIDGE', '崩落の続く間にそのレーンへ戻ると落ちる');

      /* 4) 踏まない（隣のレーンを走る）→ 崩れない・警告も出ない */
      const o5 = bridgeScene(40, 1);
      g = 0; let seen = false;
      while (Game.dist < MOT.bridgeEnd(o5) + 2 && g++ < 4000 && Game.status === 'playing') { DUO.__step(1 / 60); if (cueShown()) seen = true; }
      t.eq(typeof o5.stepM === 'number', false, '隣のレーンを走れば踏まない');
      t.eq(seen, false, '踏まなければ警告は出ない');
      t.eq(Game.status, 'playing', '踏まなければ崩れない');
      /* 5) 天井の橋も同じ（UMBRA が踏む）・警告は上寄り */
      const o6 = bridgeScene(40, 0, 'ceil');
      g = 0;
      while (typeof o6.stepM !== 'number' && g++ < 2000) DUO.__step(1 / 60);
      t.eq(o6.stepBy, 'umbra', '天井の橋は UMBRA が踏む');
      t.eq(document.getElementById('bridge-cue').classList.contains('ceil'), true, '天井の橋の警告は上寄り');
      stepN(2.1);
      t.eq(Game.killer && Game.killer.obstacle, 'BRIDGE', '天井の橋も 2.0秒で崩落');
      DUO.reset();
      t.eq(cueShown(), false, 'タイトルへ戻ると警告は消える');

      /* 6) 占有（planning＝最悪値＝踏み口で踏んだ） */
      const oo = In.Obstacles.make('BRIDGE', 'floor', 0, 500, 0, { bridge: { unitM: 24 } });
      const acts = In.Obstacles.occ(oo).floor.lanes[0];
      t.eq(acts.run, false, '崩落点で橋のレーンに居ると落ちる');
      t.eq(acts.jump, false, '跳んでも穴に着地する（崩落は 1.0秒続く）＝ジャンプは逃げ道にならない');
      t.eq(acts.slide, false, '潜っても落ちる');
      t.eq(In.Obstacles.demand(oo, 'floor'), 'lane', '要求はレーン移動');
      t.eq(In.Obstacles.occ(oo).ceil.lanes[0].run, true, '反対の面には効かない');
      t.eq(In.Obstacles.occ(oo).floor.lanes[1].run, true, '隣のレーンは素通りできる');
      t.eq(typeof oo.stepM === 'number', false, '占有の計算は実物の「踏んだ」を書き換えない');
    }
  });

  DUO.__suites.push({
    name: 'P7b-1: 崩れる橋の不変条件（崩落の続く間の cover・崩れたレーンは横切れない・S3/S4 50シード）',
    quick: true,
    run(t) {
      const In = I(), F = In.Fair, sp = () => 10;
      const mk = (type, lane, at, surface, params) => In.Obstacles.make(type, surface || 'floor', lane, at, 0, params || null);
      const br = () => mk('BRIDGE', 0, 100, 'floor', { bridge: { unitM: 10 } });
      /* 崩落の続く間（100〜110m）のウォールで、橋のレーンが塞がる */
      let l = [br(), mk('PILLAR', -1, 106), mk('PILLAR', 1, 106)];
      let errs = F.validate(l, sp, { startLanes: 'any' });
      t.ok(errs.some((x) => x.indexOf('生存経路なし(floor)') >= 0), '崩れた橋のレーンしか空いていないウォールは違反: ' + errs.join(' | '));
      l = [br(), mk('PILLAR', -1, 114), mk('PILLAR', 1, 114)];
      errs = F.validate(l, sp, { startLanes: 'any' });
      t.eq(errs.filter((x) => x.indexOf('(floor)') >= 0).length, 0, '橋の終わりを過ぎれば、そのレーンは空いている');
      /* 崩れたレーン（中央）を横切れない: 崩落の続く間に左へ寄せられ、その直後に右が要る */
      l = [br(), mk('LASER_V', 1, 105), mk('PILLAR', -1, 109.5)];
      errs = F.validate(l, sp, { startLanes: 'any' });
      t.ok(errs.some((x) => x.indexOf('到達不能(floor)') >= 0), '崩れた中央を横切る道しかないのは違反: ' + errs.join(' | '));
      /* ウォールの cover は items に数えない（要求は増えない） */
      const ws = F.walls([br(), mk('ROVER', -1, 106)], sp);
      t.eq(ws.length, 2, 'ウォールは2つ');
      t.eq((ws[1].cover || []).length, 1, '崩落の続く間のウォールに橋が cover として付く');
      t.eq(ws[1].demand.floor, 'jump', '要求は増えない（ハードルのジャンプだけ）');
      t.eq(F.laneActs(ws[1], 'floor')[0].run, false, 'cover のレーンは走れない');

      /* S3 / S4 50シード（§4.7・tip の猶予規則・橋の出現・踏み口の手前の空き） */
      ['S3', 'S4'].forEach((sid) => {
        let bad = 0, tipBad = 0, seen = 0, blanks = 0, n = 0;
        for (let seed = 1; seed <= 50; seed++) {
          const st = In.makeStage(sid);
          const g = In.createGenerator(st, seed);
          for (let d = 0; d < st.lengthM; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
          const list = g.obstacles.filter((o) => o.at <= st.lengthM);
          const errs2 = F.validate(list, st.speedAt, { startLanes: [0], reactBoth: st.reactBoth });
          if (errs2.length) { bad++; if (bad === 1) t.info(sid + ' seed' + seed + ': ' + errs2.slice(0, 2).join(' | ')); }
          if (F.tipCheck(list, g.events, st.speedAt).length) tipBad++;
          blanks += g.log.filter((c) => c.id === '(blank)').length;
          const bs = list.filter((o) => o.type === 'BRIDGE');
          if (bs.length) seen++;
          n += bs.length;
          bs.forEach((o) => {
            const u = In.MOT.bridgeUnit(o);
            if (Math.abs(u - st.speedAt(o.at) ) > st.speedAt(o.at) * 0.08) bad++;       // 1秒ぶん ≒ その地点の速度
          });
        }
        t.eq(bad, 0, sid + ' 50シードで §4.7 違反なし（崩落の cover・横切り禁止込み）');
        t.eq(tipBad, 0, sid + ' 50シードで tip の猶予規則の違反なし');
        t.eq(blanks, 0, sid + ' 空白チャンクは0回');
        t.ok(seen >= (sid === 'S3' ? 45 : 20), sid + ' 崩れる橋が出る（' + seen + '/50 シード・計' + n + '本）');
      });
    }
  });

  /* ボット完走（契約§4.7）: 橋を実際に踏んで抜ける走行を含む */
  DUO.__suites.push({
    name: 'P7b-1: S3/S4 ボット完走（perfect / delay250・崩れる橋を踏んで抜ける）',
    quick: false,
    run(t) {
      const In = I();
      let stepped = 0, total = 0;
      [['S3', [11, 12]], ['S4', [11, 12]]].forEach((c) => {
        c[1].forEach((seed) => {
          ['perfect', 'delay250'].forEach((mode) => {
            DUO.reset(); DUO.start(c[0], seed); DUO.bot(mode);
            const seenB = new Set();
            let g = 0;
            while (Game.status === 'playing' && g++ < 60 * 200) {
              DUO.__step(1 / 60);
              for (let i = 0; i < Game.active.length; i++) {
                const o = Game.active[i];
                if (o.type === 'BRIDGE' && !seenB.has(o)) { seenB.add(o); total++; }
              }
            }
            seenB.forEach((o) => { if (typeof o.stepM === 'number') stepped++; });
            t.ok(Game.status === 'goal' || Game.status === 'clear' || Game.goalT > 0,
                 c[0] + ' seed' + seed + ' ' + mode + ' 完走（' + Game.status + ' @' + Game.dist.toFixed(0) + 'm' +
                 (Game.killer ? ' 死因 ' + Game.killer.obstacle : '') + '）');
          });
        });
      });
      t.ok(stepped >= 1, 'ボットが橋を実際に踏んで抜けた走行がある（' + stepped + '/' + total + ' 本）');
      DUO.reset();
    }
  });
})();
