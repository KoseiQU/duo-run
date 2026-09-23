/* ============================================================================
   tests/test_p7b.js — P7b（v2 の新ギミック・崩れる橋 2秒・鏡ゾーンの表示 / 契約 §4.5【改訂 v2】）
     【P7b-1】崩れる橋（2秒猶予）
       ・橋＝長い1レーン区間（speed × 3.0秒）。踏んで 1.9秒は生存・2.1秒は死（死因は崩れる橋）
       ・踏んだ瞬間に大きな赤い警告「崩れる！離れろ」（data-ui="bridge-cue"）。崩落・離脱で消える
       ・隣のレーンへ移れば抜けられる／踏まなければ崩れない／跳んでも穴に着地する（occ）
       ・Fair: 崩落の続く間はそのレーンを塞ぐ（cover）・崩れたレーンは横切れない
       ・S3（旧S3/S4） 50シードで §4.7・tip 違反0、ボット完走（perfect / delay250）
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
    name: 'P7b-1: 崩れる橋の不変条件（崩落の続く間の cover・崩れたレーンは横切れない・S3（旧S3/S4） 50シード）',
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

      /* S3（旧S3/S4）50シード（§4.7・tip の猶予規則・橋の出現・踏み口の手前の空き） */
      ['S3'].forEach((sid) => {
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
    name: 'P7b-1: S3 ボット完走（perfect / delay250・崩れる橋を踏んで抜ける）',
    quick: false,
    run(t) {
      const In = I();
      let stepped = 0, total = 0;
      [['S3', [11, 12, 13, 14]]].forEach((c) => {   // 旧S3/S4 は S3 へ統合（P7c）
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

/* ============================================================================
   【P7b-2】転がる丸岩（契約§4.5【新・遺跡】）
     ・位置は走行距離の関数（到達した瞬間＝譜面の params.roll.lane）・横から転がって抜けていく
     ・occ ⇔ 当たり判定 hits の総当り一致（動くレーザーと同じ検査）／要求はジャンプ（高さ 0.6）
     ・±0.5 の到達は2レーンに掛かる／通り過ぎたレーンは素通り／実入力で跳べば生存・走れば死
     ・見た目: 赤茶の球＋白いひび（§4.3 の色）・球は判定と同じ位置／予告の音（SE 'rock'）
     ・S3（旧S3/S4） の札（rank3〜4・8本以上）・50シードで §4.7・tip 違反0・出現
   ============================================================================ */
(function () {
  const I = () => DUO.__internal;
  const stepN = (sec) => { let n = Math.round(sec * 60); while (n-- > 0 && Game.status === 'playing') DUO.__step(1 / 60); };
  function warnColor(hex) {
    const c = new THREE.Color(hex), hsl = {};
    c.getHSL(hsl);
    if (hsl.s < 0.2 || hsl.l > 0.93 || hsl.l < 0.08) return true;
    return (hsl.h * 360 <= 32 || hsl.h * 360 >= 350);
  }

  DUO.__suites.push({
    name: 'P7b-2: 転がる丸岩（到達時刻の位置・occ⇔hits 総当り一致・跳べば越える・2レーン掛かり・通過済みは素通り）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG, R = In.Runners, MOT = In.MOT, OBS = In.OBS;
      t.near(OBS.ROCK.y1, 0.60, 1e-9, '判定の高さ 0.6（ハードルと同じ＝跳べば越えられる）');
      t.near(OBS.ROCK.depth, 2 * CFG.ROCK.R, 1e-9, '奥行き＝球の直径');
      /* 1) 位置の規則 */
      const o = Ob.make('ROCK', 'floor', 0, 300, 0, { roll: { lane: 0.5, dir: -1, periodM: 12 } });
      t.near(MOT.rollLane(o, 300), 0.5, 1e-9, '到達した瞬間の位置は params.roll.lane');
      t.ok(MOT.rollLane(o, 300 - 24) > 2, '手前では +x 側（dir の逆）の壁の外から転がってくる: ' + MOT.rollLane(o, 276).toFixed(2));
      t.ok(MOT.rollLane(o, 300 + 24) < -1, '通り過ぎた後は -x 側へ抜けていく');
      t.eq(Ob.bands(o, 276).length, 0, '壁の外に居る間は当たらない');
      /* 2) occ ⇔ hits の総当り（安全と言った動作は絶対に当たらない／危険と言った動作は必ず当たる） */
      const probe = { run: 0, jump: CFG.OCC.JUMP_T, slide: CFG.SLIDE_T / 2 };
      let mS = 0, mD = 0, checked = 0;
      [-1, -0.5, 0, 0.5, 1].forEach((ln) => {
        [-1, 1].forEach((dir) => {
          ['floor', 'ceil'].forEach((surf) => {
            const oo = Ob.make('ROCK', surf, 0, 500, 0, { roll: { lane: ln, dir: dir, periodM: 14 } });
            const occ = Ob.occ(oo);
            const W = (OBS.ROCK.depth + CFG.SLIDE_D) / 2 + 0.2;
            ['floor', 'ceil'].forEach((side) => {
              CFG.LANES.forEach((lane) => {
                ['run', 'jump', 'slide'].forEach((act) => {
                  const want = occ[side].lanes[lane][act];
                  let hit = false;
                  for (let d = -W; d <= W; d += 0.01) {
                    if (Ob.affects(oo, side) && Ob.hits(oo, R.boxOf(side, lane, act, probe[act]), oo.at + d)) { hit = true; break; }
                  }
                  checked++;
                  if (want && hit) mS++;
                  if (!want && !hit) mD++;
                });
              });
            });
            t.eq(Ob.demand(oo, surf), 'jump', '到達 ' + ln + '（' + surf + '）: 要求はジャンプ');
            const blocked = CFG.LANES.filter((l) => !occ[surf].lanes[l].run);
            t.eq(blocked.length, (Math.abs(ln % 1) > 0.25) ? 2 : 1,
                 '到達 ' + ln + ' が塞ぐレーンは ' + ((Math.abs(ln % 1) > 0.25) ? '2' : '1') + ' 本: ' + blocked.join(','));
            t.ok(blocked.every((l) => occ[surf].lanes[l].jump), '塞がれたレーンも跳べば越えられる');
          });
        });
      });
      t.eq(mS, 0, '「安全」と判定した ' + checked + ' 通りは1つも当たらない');
      t.eq(mD, 0, '「危険」と判定した通りは必ず当たる');

      /* 3) 実入力の経路: 走れば死・跳べば生存・通り過ぎたレーンは素通り */
      const trial = (runnerLane, rollLane, dir, act) => {
        DUO.reset(); DUO.start('S3', 5); DUO.skipTo(300);
        In.clearObstacles();
        const sp = Game.speed;
        const oo = Ob.make('ROCK', 'floor', 0, Game.dist + 50, Game.dist,
                           { roll: { lane: rollLane, dir: dir, periodM: CFG.ROCK.PERIOD * sp / CFG.REF_SPEED } });
        Game.active.push(oo);
        Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = runnerLane; r.laneT = CFG.LANE_T; });
        let g = 0;
        while (Game.dist < oo.at - sp * CFG.BOT.JUMP_LEAD && g++ < 600) DUO.__step(1 / 60);
        if (act === 'jump') { DUO.key('KeyW', true); DUO.__step(1 / 60); DUO.key('KeyW', false); }
        while (Game.dist < oo.at + 3 && g++ < 900 && Game.status === 'playing') DUO.__step(1 / 60);
        return { alive: Game.status === 'playing', killer: Game.killer };
      };
      const a = trial(0, 0, 1, null);
      t.eq(a.alive, false, '到達レーンを走っていれば当たる');
      t.eq(a.killer && a.killer.obstacle, 'ROCK', '死因は転がる丸岩');
      t.eq(trial(0, 0, 1, 'jump').alive, true, '跳べば越えられる（実キー入力）');
      t.eq(trial(-1, 0.5, 1, null).alive, true, '通り過ぎたレーン（岩は右へ抜けた）は素通り');
      t.eq(trial(1, 0.5, 1, null).alive, false, '±0.5 の到達は隣のレーンにも掛かる');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P7b-2: 転がる丸岩の見た目（赤茶＋白いひび・球＝判定の位置・影と土煙）・予告の音・S3（旧S3/S4） の札（50シード）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG, MOT = In.MOT;
      DUO.reset(); DUO.start('S3', 5); DUO.skipTo(300); DUO.pump(1 / 60);
      /* 色（§4.3: 赤・橙・白＋無彩色だけ） */
      const v = Ob.acquire('ROCK');
      const bad = [];
      let white = false, red = false;
      v.traverse((q) => {
        if (!q.isMesh || !q.material || !q.material.color) return;
        const hx = q.material.color.getHex();
        if (!warnColor(hx)) bad.push('#' + hx.toString(16));
        if (hx === 0xffffff) white = true;
        const hsl = {}; q.material.color.getHSL(hsl);
        if (hsl.s > 0.4 && hsl.h * 360 < 32) red = true;
      });
      t.eq(bad.length, 0, '丸岩の色は赤・橙・白（＋無彩色）だけ ' + bad.join(' '));
      t.ok(red && white, '赤茶の球＋白いひび');
      t.ok(!!v.userData.rock && !!v.userData.rock.dust && !!v.userData.rock.path, '予告の影（通り道の筋）と土煙がある');
      Ob.release('ROCK', v);
      /* 見た目の球の位置＝判定の帯の中心（天井側も） */
      In.clearObstacles();
      let maxErr = 0;
      ['floor', 'ceil'].forEach((surf) => {
        const o = In.spawnOne('ROCK', surf, 0, 20);
        o.params = { roll: { lane: 0.5, dir: -1, periodM: 14 } };
        [-6, -2, 0, 3].forEach((dd) => {
          const d = o.at + dd;
          Game.dist = d;
          In.World.syncObstacles(Game.active, d);
          const b = Ob.bands(o, d, []);
          if (!b.length) return;
          o.view.updateMatrixWorld(true);
          const p = new THREE.Vector3();
          o.view.userData.rock.ball.getWorldPosition(p);
          maxErr = Math.max(maxErr, Math.abs(p.x - (b[0].x0 + b[0].x1) / 2));
        });
      });
      t.ok(maxErr < 0.02, '見た目の球の x＝判定の帯の中心（最大ずれ ' + maxErr.toFixed(3) + 'm）');
      DUO.reset();

      /* 予告の音（SE 'rock'）は到達の CUE_T 秒前に1回 */
      t.ok(typeof In.Audio.SE.rock === 'function', '効果音 rock がある');
      const heard = [];
      const play0 = In.Audio.play;
      In.Audio.play = function (name) { heard.push(name); return false; };
      try {
        DUO.start('S3', 5); DUO.skipTo(300); In.clearObstacles();
        const o = In.spawnOne('ROCK', 'floor', 1, 70);
        let g = 0;
        while (Game.dist < o.at + 5 && g++ < 600 && Game.status === 'playing') DUO.__step(1 / 60);
      } finally { In.Audio.play = play0; }
      t.eq(heard.filter((n) => n === 'rock').length, 1, '転がる音は1個につき1回');
      DUO.reset();

      /* 札: S3（旧S3/S4） に rank3〜4 で 8本以上 */
      const defs = In.CHUNK_DEFS.filter((c) => c.rock);
      t.ok(defs.length >= 8, '転がる丸岩の札は ' + defs.length + ' 本（8本以上）');
      t.eq(defs.filter((c) => c.difficulty < 3 || c.difficulty > 4).length, 0, 'ランクは 3〜4');
      t.eq(defs.filter((c) => !(c.s3 || c.s4)).length, 0, 'S3（旧S3/S4）（古代遺跡）の札');
      t.ok(defs.filter((c) => c.s3).length >= 4 && defs.filter((c) => c.s4).length >= 4, '旧S3（外周）と旧S4（内部）の両方の札');
      [['S3', 40]].forEach((c) => {                 // 旧S3/S4 は S3 へ統合（P7c）
        let bad = 0, tipBad = 0, seen = 0, tipped = 0, nPlayed = 0;
        for (let seed = 1; seed <= 50; seed++) {
          const st = In.makeStage(c[0]);
          const g = In.createGenerator(st, seed);
          for (let d = 0; d < st.lengthM; d += 20) g.ensure(d + CFG.SPAWN_AHEAD, d);
          const list = g.obstacles.filter((o) => o.at <= st.lengthM);
          if (In.Fair.validate(list, st.speedAt, { startLanes: [0], reactBoth: st.reactBoth }).length) bad++;
          if (In.Fair.tipCheck(list, g.events, st.speedAt).length) tipBad++;
          const rocks = list.filter((o) => o.type === 'ROCK');
          if (rocks.length) seen++;
          /* ゴールの先（大演出の後ろ）は走らないので tip は要らない（生成器の既存の規則）。
             ゴール線上（lengthM − 2m より奥）の札はその「先」の札の頭なので初出の判定から外す */
          const played = rocks.filter((o) => o.at < st.lengthM - 2);
          if (c[0] === 'S3' && played.length) {
            nPlayed++;
            const tip = g.events.filter((e) => e.type === 'tip' && e.params.id === 'rock')[0];
            if (tip && tip.params.targetAt <= Math.min.apply(null, played.map((o) => o.at)) + 1e-6) tipped++;
          }
          /* 1レーンを転がる距離は速度に比例（＝秒で一定） */
          rocks.forEach((o) => {
            const k = o.params.roll.periodM / st.speedAt(o.at);
            if (Math.abs(k - CFG.ROCK.PERIOD / CFG.REF_SPEED) > 0.08) bad++;
          });
        }
        t.eq(bad, 0, c[0] + ' 50シードで §4.7 違反なし（転がる丸岩込み）');
        t.eq(tipBad, 0, c[0] + ' 50シードで tip の猶予規則の違反なし');
        t.ok(seen >= c[1], c[0] + ' 転がる丸岩が出る（' + seen + '/50 シード）');
        if (c[0] === 'S3') t.eq(tipped, nPlayed, 'S3 の初出は tip つき（' + tipped + '/' + nPlayed + '）');
      });
    }
  });
})();

/* ============================================================================
   【P7b-3】サメの横断・泡の噴出口（契約§4.5【新・深海】）
     ・サメ: 2レーン幅×全高の壁が横スキャン（到達の瞬間＝端で溜まる）／occ⇔hits 総当り一致／
       抜けたレーンは生存・残ったレーンは死（実経路）／見た目は白×赤の縞・腹が白・目が赤
     ・泡: 踏むと強制ジャンプ（0.55秒・死なない・天井には無い）／自分で跳べば跳ばされない／
       強制ジャンプ中に越えられない物を置くと Fair 違反／跳ばされる瞬間に泡が噴き上がる
     ・S4 の札（rank3〜4・10本以上）・50シードで §4.7・tip 違反0・出現・ボット完走
   ============================================================================ */
(function () {
  const I = () => DUO.__internal;
  const stepN = (sec) => { let n = Math.round(sec * 60); while (n-- > 0 && Game.status === 'playing') DUO.__step(1 / 60); };
  function warnColor(hex) {
    const c = new THREE.Color(hex), hsl = {};
    c.getHSL(hsl);
    if (hsl.s < 0.2 || hsl.l > 0.93 || hsl.l < 0.08) return true;
    return (hsl.h * 360 <= 32 || hsl.h * 360 >= 350);
  }
  function scene(lane) {
    const In = I();
    DUO.reset(); DUO.start('S4', 5); DUO.skipTo(300);
    In.clearObstacles();
    Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = lane; r.laneT = In.CFG.LANE_T; });
  }

  DUO.__suites.push({
    name: 'P7b-3: サメの横断（2レーン幅の横スキャン・到達時刻の判定・occ⇔hits 一致・抜けたレーンへ）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG, R = In.Runners, MOT = In.MOT, OBS = In.OBS;
      t.eq(OBS.SHARK.span, 2, 'サメは2レーン幅');
      t.eq(OBS.SHARK.both, true, '床と天井の両方に効く（全高の壁）');
      const mk = (from, to, ph) => Ob.make('SHARK', 'floor', from, 500, 0, { scan: { from: from, to: to, phase: ph, periodM: 60 } });
      t.near(MOT.scanLane(mk(-1, 0, 0), 500), -1, 1e-9, 'phase 0 の到達位置は from');
      t.near(MOT.scanLane(mk(-1, 0, 0.5), 500), 0, 1e-9, 'phase 0.5 の到達位置は to');
      t.ok(Math.abs(MOT.scanLane(mk(-1, 0, 0), 470) - (-1)) > 0.5, '手前では横へ動いている（迫りながら横切る）');
      const probe = { run: 0, jump: CFG.OCC.JUMP_T, slide: CFG.SLIDE_T / 2 };
      let mS = 0, mD = 0, checked = 0;
      [[-1, 0, 0], [-1, 0, 0.5], [0, -1, 0], [0, -1, 0.5]].forEach((c) => {
        const o = mk(c[0], c[1], c[2]);
        const occ = Ob.occ(o);
        const W = (OBS.SHARK.depth + CFG.SLIDE_D) / 2 + 0.2;
        ['floor', 'ceil'].forEach((side) => {
          const free = CFG.LANES.filter((l) => occ[side].lanes[l].run);
          const at = MOT.scanLane(o, o.at);
          const want = (at < -0.5) ? 1 : -1;
          t.eq(free.join(','), String(want), 'from ' + c[0] + '→' + c[1] + ' ph ' + c[2] + '（' + side + '）: 空くのはサメが抜けた1レーン（' + want + '）');
          t.eq(Ob.demand(o, side), 'lane', '要求はレーン移動（跳んでも潜っても抜けない）');
          CFG.LANES.forEach((lane) => {
            ['run', 'jump', 'slide'].forEach((act) => {
              const w = occ[side].lanes[lane][act];
              let hit = false;
              for (let d = -W; d <= W; d += 0.01) {
                if (Ob.hits(o, R.boxOf(side, lane, act, probe[act]), o.at + d)) { hit = true; break; }
              }
              checked++;
              if (w && hit) mS++;
              if (!w && !hit) mD++;
            });
          });
        });
      });
      t.eq(mS, 0, '「安全」と判定した ' + checked + ' 通りは1つも当たらない');
      t.eq(mD, 0, '「危険」と判定した通りは必ず当たる');
      /* 実経路: 抜けたレーンは生存・残ったレーンは死 */
      const trial = (lane) => {
        scene(lane);
        const sp = Game.speed;
        const o = Ob.make('SHARK', 'floor', -1, Game.dist + 60, Game.dist,
                          { scan: { from: -1, to: 0, phase: 0, periodM: CFG.SEA.SHARK_PERIOD * sp / CFG.REF_SPEED } });
        Game.active.push(o);
        let g = 0;
        while (Game.dist < o.at + 3 && g++ < 900 && Game.status === 'playing') DUO.__step(1 / 60);
        return { alive: Game.status === 'playing', killer: Game.killer };
      };
      t.eq(trial(1).alive, true, 'サメが抜けたレーン（右）は生存');
      const d0 = trial(0);
      t.eq(d0.alive, false, 'サメの残るレーン（中央）は死');
      t.eq(d0.killer && d0.killer.obstacle, 'SHARK', '死因はサメ');
      t.eq(trial(-1).alive, false, '左も死（2レーン幅）');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P7b-3: 泡の噴出口（踏むと強制ジャンプ0.55秒・死なない・天井には無い・自分で跳べば跳ばされない・Fair）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG, OBS = In.OBS;
      t.eq(OBS.VENT.harmless, true, '噴出口は死なない');
      /* 1) 何もせず踏む → 強制ジャンプ */
      scene(0);
      let v = In.spawnOne('VENT', 'floor', 0, 40);
      let g = 0;
      while (typeof v.ventM !== 'number' && g++ < 300 && Game.status === 'playing') DUO.__step(1 / 60);
      const r0 = Game.runners[0];
      t.eq(v.ventBy, 'lumen', '踏んだ LUMEN が跳ばされる');
      t.eq(r0.act, 'jump', '強制ジャンプが発動する（Runners の jump）');
      t.near(r0.jumpT, CFG.JUMP_T, 1e-9, '滞空は 0.55秒（通常のジャンプと同じ）');
      t.ok(v.ventM >= v.at - (OBS.VENT.depth + CFG.BODY_D) / 2 - 0.5 && v.ventM <= v.at, '噴出口に触れた瞬間に跳ぶ');
      t.eq(Game.runners[1].act, 'run', '天井の UMBRA は影響を受けない（天井側には無い）');
      stepN(0.50);
      t.eq(r0.act, 'jump', '0.50秒後はまだ宙');
      stepN(0.10);
      t.eq(r0.act, 'run', '0.55秒で着地');
      t.eq(Game.status, 'playing', '噴出口では死なない');
      /* 2) 自分で先に跳べば跳ばされない（踏まない） */
      scene(0);
      v = In.spawnOne('VENT', 'floor', 0, 40);
      g = 0;
      while (Game.dist < v.at - Game.speed * CFG.BOT.JUMP_LEAD && g++ < 300) DUO.__step(1 / 60);
      DUO.key('KeyW', true); DUO.__step(1 / 60); DUO.key('KeyW', false);
      while (Game.dist < v.at + 3 && g++ < 400) DUO.__step(1 / 60);
      t.eq(typeof v.ventM === 'number', false, '跳んで越えれば噴出口を踏まない');
      /* 3) 隣のレーンは素通り・スライド中でも跳ばされる */
      scene(1);
      v = In.spawnOne('VENT', 'floor', 0, 40);
      g = 0;
      while (Game.dist < v.at + 3 && g++ < 400) DUO.__step(1 / 60);
      t.eq(typeof v.ventM === 'number', false, '隣のレーンは素通り（踏まずに避けてもよい）');
      scene(0);
      v = In.spawnOne('VENT', 'floor', 0, 30);
      g = 0;
      while (Game.dist < v.at - Game.speed * 0.3 && g++ < 300) DUO.__step(1 / 60);
      DUO.key('KeyS', true); DUO.__step(1 / 60); DUO.key('KeyS', false);
      while (typeof v.ventM !== 'number' && g++ < 400) DUO.__step(1 / 60);
      t.eq(Game.runners[0].act, 'jump', 'スライド中に踏んでも跳ばされる（スライドをキャンセル）');
      /* 4) occ・要求 */
      const o = Ob.make('VENT', 'floor', 0, 500, 0);
      const a = Ob.occ(o).floor.lanes[0];
      t.eq(a.run, false, '噴出口のレーンを走る＝跳ばされる（走ったままではいられない）');
      t.eq(a.jump, true, '跳んでいれば踏まない');
      t.eq(Ob.demand(o, 'floor'), 'jump', '要求はジャンプ（床側だけ）');
      t.eq(Ob.demand(o, 'ceil'), 'none', '天井には要求しない');
      /* 5) Fair: 強制ジャンプ中に越えられない物（柱）は置けない／ハードルは越えられるので置ける */
      const sp = () => 10;
      const mk = (type, lane, at) => Ob.make(type, 'floor', lane, at, 0);
      let errs = In.Fair.validate([mk('VENT', 0, 100), mk('PILLAR', 0, 103)], sp, { startLanes: 'any' });
      t.ok(errs.some((e) => e.indexOf('噴出口') >= 0), '強制ジャンプ中に柱（越えられない）は違反: ' + errs[0]);
      errs = In.Fair.validate([mk('VENT', 0, 100), mk('ROVER', 0, 101)], sp, { startLanes: 'any' });
      t.eq(errs.filter((e) => e.indexOf('噴出口') >= 0).length, 0, '強制ジャンプで越えられるハードルは置ける');
      errs = In.Fair.validate([mk('VENT', 0, 100), mk('PILLAR', 1, 103)], sp, { startLanes: 'any' });
      t.eq(errs.filter((e) => e.indexOf('噴出口') >= 0).length, 0, '別のレーンの柱は強制ジャンプに関係しない');
      /* 天井の要求を噴出口の直後 speed×0.6秒 に置いてよい（契約§4.5） */
      errs = In.Fair.validate([mk('VENT', 0, 100), Ob.make('ROVER', 'ceil', 0, 106, 0)], sp,
                              { startLanes: 'any', reactBoth: 0.45 });
      t.eq(errs.length, 0, '噴出口の 0.6秒後の天井の要求は置ける: ' + errs.join(' | '));
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P7b-3: 深海の見た目（サメ=白×赤の縞・腹が白・目が赤／噴出口=白い円＋泡・跳ばされると噴き上げ）・S4 の札（50シード）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG;
      DUO.reset(); DUO.start('S4', 5); DUO.skipTo(300); DUO.pump(1 / 60);
      ['SHARK', 'VENT'].forEach((ty) => {
        const v = Ob.acquire(ty);
        const bad = [];
        v.traverse((q) => {
          if (!q.isMesh || !q.material || !q.material.color) return;
          const hx = q.material.color.getHex();
          if (!warnColor(hx) || hx === CFG.COL.LUMEN || hx === CFG.COL.UMBRA) bad.push('#' + hx.toString(16));
        });
        t.eq(bad.length, 0, ty + ' の色は赤・橙・白（＋無彩色）だけ ' + bad.join(' '));
        Ob.release(ty, v);
      });
      /* サメ: 下（腹）が白・上に赤・赤い目 */
      const sv = Ob.acquire('SHARK');
      sv.position.set(0, 0, 0); sv.rotation.set(0, 0, 0); sv.updateMatrixWorld(true);
      let lowWhite = 0, hiRed = 0, eyeRed = 0;
      sv.traverse((q) => {
        if (!q.isMesh || q.userData.deco) return;
        const b = new THREE.Box3().setFromObject(q), hx = q.material.color.getHex();
        if (hx === 0xffffff && b.min.y < 1.0) lowWhite++;
        if (hx === ObstacleSkin.COL.red && b.max.y > 3.0) hiRed++;
        if (hx === 0xff2a14) eyeRed++;
      });
      t.ok(lowWhite > 0 && hiRed > 0, 'サメの腹側（下）が白・上が赤');
      t.ok(eyeRed > 0, 'サメの目は赤');
      Ob.release('SHARK', sv);
      /* 噴出口: 跳ばされた直後は泡が高く噴き上がる */
      In.clearObstacles();
      Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = CFG.LANE_T; });
      const vo = In.spawnOne('VENT', 'floor', 0, 30);
      const top = () => {
        In.World.syncObstacles(Game.active, Game.dist);
        const im = vo.view.userData.vent.bubbles, m = new THREE.Matrix4(), p = new THREE.Vector3();
        let mx = 0;
        for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); p.setFromMatrixPosition(m); mx = Math.max(mx, p.y); }
        return mx;
      };
      In.World._t = 0.37;
      const calm = top();
      let g = 0;
      while (typeof vo.ventM !== 'number' && g++ < 300) DUO.__step(1 / 60);
      DUO.__step(1 / 60);
      In.World._t = 0.37;
      const burst = top();
      t.ok(burst > calm + 0.3, '跳ばされた瞬間に泡が噴き上がる（最高 ' + calm.toFixed(2) + ' → ' + burst.toFixed(2) + 'm）');
      DUO.reset();

      /* 札: S4 に rank3〜4 で 10本以上 */
      const defs = In.CHUNK_DEFS.filter((c) => c.shark || c.vent);
      t.ok(defs.length >= 10, 'サメ・泡の札は ' + defs.length + ' 本（10本以上）');
      t.eq(defs.filter((c) => c.difficulty < 3 || c.difficulty > 4 || !c.s5).length, 0, 'S4 の rank3〜4');
      t.eq(defs.filter((c) => (c.ceil || []).some((e) => e.type === 'VENT')).length, 0, '噴出口は床だけ（天井側には無い）');
      let bad = 0, tipBad = 0, sk = 0, vt = 0, tipped = 0, nPlayed = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S4');
        const g2 = In.createGenerator(st, seed);
        for (let d = 0; d < st.lengthM; d += 20) g2.ensure(d + CFG.SPAWN_AHEAD, d);
        const list = g2.obstacles.filter((o) => o.at <= st.lengthM);
        if (In.Fair.validate(list, st.speedAt, { startLanes: [0], reactBoth: st.reactBoth }).length) bad++;
        if (In.Fair.tipCheck(list, g2.events, st.speedAt).length) tipBad++;
        const played = list.filter((o) => o.at < st.lengthM - 2);
        if (played.some((o) => o.type === 'SHARK')) sk++;
        if (played.some((o) => o.type === 'VENT')) vt++;
        ['SHARK', 'VENT'].forEach((ty) => {
          const os = played.filter((o) => o.type === ty);
          if (!os.length) return;
          nPlayed++;
          const tip = g2.events.filter((e) => e.type === 'tip' && e.params.id === ty.toLowerCase())[0];
          if (tip && tip.params.targetAt <= Math.min.apply(null, os.map((o) => o.at)) + 1e-6) tipped++;
        });
      }
      t.eq(bad, 0, 'S4 50シードで §4.7 違反なし（サメ・噴出口の強制ジャンプ込み）');
      t.eq(tipBad, 0, 'S4 50シードで tip の猶予規則の違反なし');
      t.ok(sk >= 45, 'サメが出る（' + sk + '/50 シード）');
      t.ok(vt >= 45, '噴出口が出る（' + vt + '/50 シード）');
      t.eq(tipped, nPlayed, '初出は tip つき（' + tipped + '/' + nPlayed + '）');
    }
  });

  DUO.__suites.push({
    name: 'P7b-3: S4 ボット完走（perfect / delay250・サメと噴出口）',
    quick: false,
    run(t) {
      [21, 22, 23].forEach((seed) => {
        ['perfect', 'delay250'].forEach((mode) => {
          DUO.reset(); DUO.start('S4', seed); DUO.bot(mode);
          let g = 0;
          while (Game.status === 'playing' && g++ < 60 * 200) DUO.__step(1 / 60);
          t.ok(Game.status === 'goal' || Game.status === 'clear',
               'S4 seed' + seed + ' ' + mode + ' 完走（' + Game.status + ' @' + Game.dist.toFixed(0) + 'm' +
               (Game.killer ? ' 死因 ' + Game.killer.obstacle : '') + '）');
        });
      });
      DUO.reset();
    }
  });
})();

/* ============================================================================
   【P7b-4】鏡ゾーンの表示（契約§4.5【表示改訂】）
     ・発動中: 画面上部の中央に大きな「MIRROR」／反転している側の半分の枠が縞模様＋「←→ 逆」／
       該当キャラに銀の粒（鏡の光）。出口で全部消える
     ・「どちらの半分が反転しているか」は Game.runnerForZone から引く＝入れ替えワープと重なっても
       画面の位置で分かる（その半分の横フリックが実際に逆に効くことまで確かめる）
   ============================================================================ */
(function () {
  const I = () => DUO.__internal;
  /* 可視性（computed style）: 自分と祖先が display:none / visibility:hidden でなく、自分の不透明度が 0 でない。
     祖先の opacity は画面遷移のフェード（#hud の 0.2秒）で途中値になるので見ない */
  const vis = (el) => {
    if (!el) return false;
    if (+getComputedStyle(el).opacity === 0) return false;
    let e = el;
    while (e && e !== document.body) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      e = e.parentElement;
    }
    return true;
  };
  const frame = (z) => document.querySelector('[data-ui="mirror-' + z + '"]');
  const sparkle = (id) => I().World.runnerViews[id] && I().World.runnerViews[id].sparkle.visible;

  DUO.__suites.push({
    name: 'P7b-4: 鏡ゾーンの表示（MIRROR 大・反転側の縞枠と「←→ 逆」・銀の粒・出口で消える・入れ替えとの重ね掛け）',
    quick: true,
    run(t) {
      const In = I(), Game = In.Game;
      /* 1) 実走: S6 の鏡ゾーン（床側）の入口〜出口をボットで跨ぐ */
      let m = null, seed = 0;
      for (let s = 1; s <= 20 && !m; s++) {
        const g = In.createGenerator(In.makeStage('S6'), s);
        g.ensure(1500, 0);
        const f = g.mirrors.filter((r) => r.side === 'floor')[0];
        if (f) { m = f; seed = s; }
      }
      t.ok(!!m, 'S6 に床側の鏡ゾーンがある（seed ' + seed + '）');
      if (!m) return;
      DUO.reset(); DUO.start('S6', seed); DUO.skipTo(Math.max(0, m.from - 60)); DUO.bot('perfect');
      let g = 0;
      while (Game.dist < m.from - 2 && g++ < 900 && Game.status === 'playing') DUO.pump(1 / 60);
      const flag = document.getElementById('flag-mirror');
      t.eq(vis(flag), false, '入口の手前では MIRROR は出ていない');
      t.eq(vis(frame('bottom')) || vis(frame('top')), false, '入口の手前では縞枠は出ていない');
      while (Game.dist < m.from + 6 && g++ < 900 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(Game.runners[0].mirrored, true, '入口を跨ぐと LUMEN（床）の左右が反転');
      t.eq(vis(flag), true, '画面上部に MIRROR が見える');
      const fr = flag.getBoundingClientRect();
      t.ok(parseFloat(getComputedStyle(flag).fontSize) >= 22, 'MIRROR は大きい（' + getComputedStyle(flag).fontSize + '）');
      t.ok(Math.abs((fr.left + fr.right) / 2 - window.innerWidth / 2) < 4, 'MIRROR は中央（' + ((fr.left + fr.right) / 2).toFixed(0) + ' / ' + window.innerWidth / 2 + '）');
      t.ok(fr.top < window.innerHeight * 0.3, 'MIRROR は画面の上部（top ' + fr.top.toFixed(0) + 'px）');
      t.eq(vis(frame('bottom')), true, '反転している側（下半分＝LUMEN を動かす半分）の枠が縞模様');
      t.eq(vis(frame('top')), false, '反転していない側（上半分）の枠は出ない');
      t.ok(/repeating-linear-gradient/.test(getComputedStyle(frame('bottom')).borderImageSource), '枠は縞模様（border-image）');
      const tags = frame('bottom').querySelectorAll('.mir-tag');
      t.eq(tags.length >= 1 && Array.prototype.every.call(tags, (e) => e.textContent === '←→ 逆' && vis(e)), true, '枠の中に「←→ 逆」');
      const bb = frame('bottom').getBoundingClientRect();
      t.ok(bb.top >= window.innerHeight * 0.45 && bb.bottom <= window.innerHeight + 1, '縞枠は下半分に収まる');
      t.eq(sparkle('lumen'), true, 'LUMEN に銀の粒（鏡の光）');
      t.eq(sparkle('umbra'), false, 'UMBRA には出ない');
      /* 出口で全部消える */
      while (Game.dist < m.to + 6 && g++ < 2000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(Game.status, 'playing', '鏡ゾーンをボットが抜ける');
      t.eq(Game.runners[0].mirrored, false, '出口で反転が戻る');
      t.eq(vis(flag), false, '出口で MIRROR が消える');
      t.eq(vis(frame('bottom')) || vis(frame('top')), false, '出口で縞枠が消える');
      t.eq(sparkle('lumen'), false, '出口で銀の粒が消える');

      /* 2) 入れ替えワープとの重ね掛け: LUMEN（床）が反転 × 担当が入れ替わる →
            LUMEN を動かすのは上半分 ＝ 縞枠は上半分に出る（画面の位置で分かる） */
      DUO.reset(); DUO.start('S6', seed); DUO.skipTo(200);
      In.clearObstacles();
      Game.runners[0].mirrored = true;
      DUO.pump(1 / 60);
      t.eq(vis(frame('bottom')) && !vis(frame('top')), true, '入れ替え前: LUMEN の反転は下半分の枠');
      Game.setHandSwap(true);
      DUO.pump(1 / 60);
      t.eq(Game.runnerForZone('top').id, 'lumen', '入れ替え中は上半分が LUMEN を動かす');
      t.eq(vis(frame('top')), true, '重ね掛け: 縞枠は上半分へ移る');
      t.eq(vis(frame('bottom')), false, '重ね掛け: 下半分の枠は消える');
      t.eq(vis(document.getElementById('flag-swap')) && vis(document.getElementById('flag-mirror')), true,
           'MIRROR と SWAP が同時に見える');
      /* 縞枠の出ている半分の横フリックが、実際に逆に効く（表示と操作が一致する） */
      const r0 = Game.runners[0];
      r0.laneFrom = r0.laneTo = r0.laneVal = 0; r0.laneT = In.CFG.LANE_T;
      DUO.touch('top', 'right'); DUO.pump(1 / 60);
      t.eq(r0.laneTo, -1, '縞枠の半分（上）で右フリック → LUMEN は左へ（反転している）');
      const r1 = Game.runners[1];
      r1.laneFrom = r1.laneTo = r1.laneVal = 0; r1.laneT = In.CFG.LANE_T;
      DUO.touch('bottom', 'right'); DUO.pump(1 / 60);
      t.eq(r1.laneTo, 1, '縞枠の無い半分（下）で右フリック → UMBRA は右へ（通常）');
      /* UMBRA（天井）も反転すると両方の半分に出る */
      r1.mirrored = true; DUO.pump(1 / 60);
      t.eq(vis(frame('top')) && vis(frame('bottom')), true, '両方反転なら両方の半分に縞枠');
      t.eq(sparkle('umbra'), true, '天井の UMBRA にも銀の粒');
      Game.setHandSwap(false); r0.mirrored = false; r1.mirrored = false;
      DUO.pump(1 / 60);
      t.eq(vis(frame('top')) || vis(frame('bottom')) || vis(document.getElementById('flag-mirror')), false, '解除で全部消える');
      /* リトライ・タイトルでも残らない */
      Game.runners[0].mirrored = true; DUO.pump(1 / 60);
      DUO.reset(); DUO.pump(1 / 60);
      t.eq(vis(frame('bottom')), false, 'タイトルへ戻ると縞枠は消える');
      t.eq(sparkle('lumen'), false, 'タイトルへ戻ると銀の粒は消える');
    }
  });
})();
