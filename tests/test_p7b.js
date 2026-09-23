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

/* ============================================================================
   【P7b-2】転がる丸岩（契約§4.5【新・遺跡】）
     ・位置は走行距離の関数（到達した瞬間＝譜面の params.roll.lane）・横から転がって抜けていく
     ・occ ⇔ 当たり判定 hits の総当り一致（動くレーザーと同じ検査）／要求はジャンプ（高さ 0.6）
     ・±0.5 の到達は2レーンに掛かる／通り過ぎたレーンは素通り／実入力で跳べば生存・走れば死
     ・見た目: 赤茶の球＋白いひび（§4.3 の色）・球は判定と同じ位置／予告の音（SE 'rock'）
     ・S3/S4 の札（rank3〜4・8本以上）・50シードで §4.7・tip 違反0・出現
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
    name: 'P7b-2: 転がる丸岩の見た目（赤茶＋白いひび・球＝判定の位置・影と土煙）・予告の音・S3/S4 の札（50シード）',
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

      /* 札: S3/S4 に rank3〜4 で 8本以上 */
      const defs = In.CHUNK_DEFS.filter((c) => c.rock);
      t.ok(defs.length >= 8, '転がる丸岩の札は ' + defs.length + ' 本（8本以上）');
      t.eq(defs.filter((c) => c.difficulty < 3 || c.difficulty > 4).length, 0, 'ランクは 3〜4');
      t.eq(defs.filter((c) => !(c.s3 || c.s4)).length, 0, 'S3/S4（古代遺跡）の札');
      t.ok(defs.filter((c) => c.s3).length >= 4 && defs.filter((c) => c.s4).length >= 4, 'S3 と S4 の両方に');
      [['S3', 40], ['S4', 35]].forEach((c) => {
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
