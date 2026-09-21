/* ============================================================================
   tests/test_p2b.js — P2b（S2 ネオン都市・夜／動くレーザー／ビル間の大ジャンプ）

     ・占有 occ が「唯一の出所」であること（静止型は OBS.safe と完全一致）
     ・動くレーザーの**到達時刻判定**が 判定(hits) / ボット / 不変条件(Fair) で一致する
     ・点滅レーザー: OFF 中は通れる／ON 中は死ぬ
     ・S2 をボットが完走する（perfect / delay250 × seed 1〜50）
     ・S2 の不変条件・動作比率・壁の穴
     ・大ジャンプ: 発火・滑空中はジャンプ/スライド無効・眼下の構図・中断復元
     ・S2 の解放ロジック（S1クリアで解放）とエンドレスのプール
     ・P2b-0: チュートリアル tip の語中改行なし・2体に被らない
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const runToEnd = (limit) => {
    let g = 0;
    while ((Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 40000)) DUO.__step(1 / 60);
    return Game.status;
  };
  /* 実ステップで dist まで進める（skipTo で直行すると演出イベントが発火しない） */
  const advanceTo = (m, limit) => {
    let g = 0;
    while (Game.dist < m && (Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 20000)) DUO.pump(1 / 60);
    return Game.dist;
  };

  /* ==========================================================================
     1. 占有（occ）が唯一の出所であること
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b: 占有 occ が静止型の OBS.safe と完全に一致する（唯一の出所の証明）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, OBS = In.OBS;
      Object.keys(OBS).forEach((type) => {
        if (OBS[type].motion) return;                       // 動く型は次のテストで見る
        if (OBS[type].pad) return;                          // 当たり判定を持たない型（同時スイッチのパッド / P3b）
        if (OBS[type].ghost) return;                        // 〃（海流の帯・同色の扉 / P4a）
        ['floor', 'ceil'].forEach((surface) => {
          const o = Ob.make(type, surface, 0, 100, 0);
          const side = OBS[type].both ? surface : surface;
          const a = Ob.occ(o)[side].lanes[0];
          const safe = OBS[type].safe;
          t.eq(!a.run, true, OBS[type].label + '(' + surface + '): 立ったままは当たる');
          t.eq(a.jump, safe.indexOf('jump') >= 0, OBS[type].label + '(' + surface + '): ジャンプの可否が OBS.safe と一致');
          t.eq(a.slide, safe.indexOf('slide') >= 0, OBS[type].label + '(' + surface + '): スライドの可否が OBS.safe と一致');
          /* 隣のレーンは（span を超えていれば）素通りできる */
          const far = (OBS[type].span >= 2) ? 1 : 1;
          const b = Ob.occ(o)[side].lanes[far + (OBS[type].span - 1)] || Ob.occ(o)[side].lanes[1];
          if (OBS[type].span === 1) t.eq(b.run, true, OBS[type].label + ': 隣のレーンは素通りできる');
          /* 反対の面には効かない（both を除く） */
          if (!OBS[type].both) {
            const other = (surface === 'floor') ? 'ceil' : 'floor';
            t.eq(Ob.occ(o)[other].lanes[0].run, true, OBS[type].label + ': 反対の面には効かない');
          }
        });
      });
      /* ジャンプの“届く高さ”はボットの実際の踏切と同じ（設計の要）  */
      t.near(In.CFG.OCC.JUMP_T, In.CFG.BOT.JUMP_LEAD, 1e-9, '占有判定のジャンプ位相＝ボットの踏切 JUMP_LEAD');
    }
  });

  /* ==========================================================================
     2. 動くレーザー: 到達時刻の判定が 判定 / ボット / 不変条件 で一致する
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b: 動くレーザーの到達時刻判定（occ ⇔ 当たり判定 hits の総当り一致）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, CFG = In.CFG, R = In.Runners;
      /* occ が「安全」と言った動作は、通過窓を 0.01m 刻みでなめても**絶対に当たらない**。
         逆に「危険」と言った動作は、どこかで必ず当たる。 */
      const probe = { run: 0, jump: CFG.OCC.JUMP_T, slide: CFG.SLIDE_T / 2 };
      const cases = [];
      [0, 0.125, 0.25, 0.37, 0.5, 0.62, 0.75, 0.88].forEach((ph) => {
        cases.push({ type: 'LASER_SCAN', surface: 'floor', lane: 0, params: { scan: { from: -1, to: 1, phase: ph, periodM: 52 } } });
        cases.push({ type: 'LASER_SCAN', surface: 'floor', lane: 0, params: { scan: { from: 0, to: 1, phase: ph, periodM: 52 } } });
        [-1, 0, 1].forEach((hub) => {
          cases.push({ type: 'LASER_ROT', surface: 'floor', lane: hub, params: { rot: { phase: ph, periodM: 60 } } });
          cases.push({ type: 'LASER_ROT', surface: 'ceil', lane: hub, params: { rot: { phase: ph, periodM: 60 } } });
        });
        cases.push({ type: 'LASER_V', surface: 'floor', lane: 0, params: { blink: { onAtArrival: (ph < 0.5), periodM: 44 } } });
      });
      let mismatchSafe = 0, mismatchDanger = 0, checked = 0, survivable = 0;
      cases.forEach((c) => {
        const o = Ob.make(c.type, c.surface, c.lane, 500, 0, c.params);
        const occ = Ob.occ(o);
        const W = (In.OBS[c.type].depth + CFG.SLIDE_D) / 2 + 0.2;
        ['floor', 'ceil'].forEach((side) => {
          let anySafe = false;
          CFG.LANES.forEach((lane) => {
            ['run', 'jump', 'slide'].forEach((act) => {
              const want = occ[side].lanes[lane][act];
              let hit = false;
              for (let d = -W; d <= W; d += 0.01) {
                if (Ob.hits(o, R.boxOf(side, lane, act, probe[act]), o.at + d)) { hit = true; break; }
              }
              checked++;
              if (want && hit) mismatchSafe++;              // ← 絶対に起きてはいけない
              if (!want && !hit) mismatchDanger++;          // ← 過剰に危険と言っている
              if (want) anySafe = true;
            });
          });
          if (anySafe) survivable++;
        });
      });
      t.eq(mismatchSafe, 0, '「安全」と判定した ' + checked + ' 通りは1つも当たらない（不一致 ' + mismatchSafe + '）');
      t.eq(mismatchDanger, 0, '「危険」と判定した通りは必ず当たる（不一致 ' + mismatchDanger + '）');
      t.eq(survivable, cases.length * 2, 'どの位相でも各面に生存できる動作が残っている');

      /* 運動は「走行距離」の関数＝到達時の位相はチャンクに書いた phase そのもの */
      const o2 = Ob.make('LASER_SCAN', 'floor', 0, 300, 0, { scan: { from: -1, to: 1, phase: 0, periodM: 52 } });
      t.near(In.MOT.scanLane(o2, 300), -1, 1e-9, 'phase 0 の到達位置は from（レーン-1）');
      const o3 = Ob.make('LASER_SCAN', 'floor', 0, 300, 0, { scan: { from: -1, to: 1, phase: 0.5, periodM: 52 } });
      t.near(In.MOT.scanLane(o3, 300), 1, 1e-9, 'phase 0.5 の到達位置は to（レーン+1）');
      t.ok(Math.abs(In.MOT.scanLane(o3, 300 - 13) - 1) > 0.3, '手前では別の位置にいる（＝動いている）');
      const o4 = Ob.make('LASER_ROT', 'floor', 0, 300, 0, { rot: { phase: 0.25, periodM: 60 } });
      t.near(In.MOT.rotTheta(o4, 300), Math.PI / 2, 1e-9, 'phase 0.25 の到達角度は真上');
      /* 回転レーザーは「低い所はジャンプ／立っている所はレーン移動」＝潜る要求は作らない */
      let slideDemands = 0;
      for (let i = 0; i <= 40; i++) {
        const oo = Ob.make('LASER_ROT', 'floor', (i % 3) - 1, 300, 0, { rot: { phase: i / 40, periodM: 60 } });
        if (Ob.demand(oo, 'floor') === 'slide') slideDemands++;
      }
      t.eq(slideDemands, 0, '回転レーザーはスライディングを要求しない（契約§4.3 の動作比率を守る）');
    }
  });

  /* ==========================================================================
     3. 点滅レーザー: OFF 中は通れる／ON 中は死ぬ（実プレイ経路）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b: 点滅レーザー（OFF中は通過可・ON中は死亡）',
    quick: true,
    run(t) {
      const In = I(), Game = In.Game;
      const trial = (onAtArrival) => {
        DUO.reset(); DUO.start('S2', 5);
        DUO.skipTo(300);
        In.clearObstacles();
        const o = In.Obstacles.make('LASER_V', 'floor', 0, Game.dist + 40, Game.dist,
                                    { blink: { onAtArrival: onAtArrival, periodM: 44 } });
        Game.active.push(o);
        Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = In.CFG.LANE_T; });
        let guard = 0, sawOff = false, sawOn = false;
        while (Game.dist < o.at + 3 && guard++ < 1200 && Game.status === 'playing') {
          if (In.MOT.blinkOn(o, Game.dist)) sawOn = true; else sawOff = true;
          DUO.__step(1 / 60);
        }
        return { alive: Game.status === 'playing', sawOn: sawOn, sawOff: sawOff, o: o };
      };
      const off = trial(false);
      t.eq(off.alive, true, '到達時に消えている点滅レーザーは、何もせず通り抜けられる');
      t.eq(off.sawOn && off.sawOff, true, '近づく間に点いたり消えたりしている（予告になっている）');
      const on = trial(true);
      t.eq(on.alive, false, '到達時に点いている点滅レーザーは、避けないと死ぬ');

      /* 切り替わりは通過窓の外（周期の半分だけ離れている）＝通過中に切り替わらない */
      const o = In.Obstacles.make('LASER_V', 'floor', 0, 500, 0, { blink: { onAtArrival: true, periodM: 44 } });
      for (let d = -0.9; d <= 0.9; d += 0.05) t.ok(In.MOT.blinkOn(o, 500 + d), '通過窓の中はずっと ON のまま');
      t.eq(In.MOT.blinkOn(o, 500 + 22.5), false, '周期の半分ぶん手前/先では消えている');
      /* 不変条件から見ても「消えている＝要求なし」 */
      const offO = In.Obstacles.make('LASER_V', 'floor', 0, 500, 0, { blink: { onAtArrival: false, periodM: 44 } });
      t.eq(In.Obstacles.demand(offO, 'floor'), 'none', '消えているレーザーは動作を要求しない');
      t.eq(In.Obstacles.demand(o, 'floor'), 'lane', '点いているレーザーはレーン移動を要求する');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. S2: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S2: ボット完走（perfect / delay250 × seed 1〜50）',
    quick: false,
    run(t) {
      let p = 0, d = 0;
      const pf = [], df = [];
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S2', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S2', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S2 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S2 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     5. S2: 定義・不変条件・動作比率・壁の穴
     ========================================================================== */
  DUO.__suites.push({
    name: 'S2: 定義と不変条件・動作比率（50シード）',
    quick: true,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S2');
      t.eq(st0.lengthM, 1200, 'S2 は 1200m');
      t.near(st0.speedAt(0), 20, 1e-6, '開始 20 m/s');
      t.near(st0.speedAt(1200), 24, 1e-6, '終了 24 m/s');
      t.near(st0.checkpoints[0], 400, 1e-6, 'チェックポイント1 は 400m');
      t.near(st0.checkpoints[1], 800, 1e-6, 'チェックポイント2 は 800m');
      t.eq(st0.setpiece, 'bigjump', '終盤の大演出は「ビル間の大ジャンプ」');

      /* 動くレーザー入りチャンクが8本以上（契約の要求） */
      const moving = In.CHUNK_DEFS.filter((c) => c.moving);
      t.ok(moving.length >= 8, '動くレーザー入りのチャンクが ' + moving.length + '本（8本以上）');
      const kinds = {};
      moving.forEach((c) => (c.floor || []).concat(c.ceil || []).forEach((e) => {
        if (e.type === 'LASER_SCAN') kinds.scan = 1;
        if (e.type === 'LASER_ROT') kinds.rot = 1;
        if (e.params && e.params.blink) kinds.blink = 1;
      }));
      t.eq(!!(kinds.scan && kinds.rot && kinds.blink), true, '横スキャン・回転・点滅の3種すべてが譜面に入っている');

      let bad = 0, spFound = 0, movingSeen = 0, holeSeen = 0;
      const kind = { LASER_SCAN: 0, LASER_ROT: 0, blink: 0 };
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S2');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1200; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1200);
        const errs = In.Fair.validate(l, st.speedAt, { startLanes: [0] });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        if (l.some((o) => In.OBS[o.type].motion || (o.params && o.params.blink))) movingSeen++;
        if (l.some((o) => o.type === 'WALLHOLE')) holeSeen++;
        if (l.some((o) => o.type === 'LASER_SCAN')) kind.LASER_SCAN++;
        if (l.some((o) => o.type === 'LASER_ROT')) kind.LASER_ROT++;
        if (l.some((o) => o.params && o.params.blink)) kind.blink++;
        const cc = In.Fair.countDemands(l, st.speedAt);
        agg.lane += cc.lane; agg.jump += cc.jump; agg.slide += cc.slide; agg.total += cc.total;
      }
      t.eq(bad, 0, 'S2 50シードで §4.7 違反なし（大演出区間を含む）');
      t.eq(spFound, 50, '50シードすべてに大ジャンプが入る');
      t.eq(movingSeen, 50, '50シードすべてに動く/点滅するレーザーが出る');
      t.ok(holeSeen >= 15, '壁の穴は S2 から登場する（' + holeSeen + '/50 シード）');
      t.ok(kind.LASER_SCAN >= 25 && kind.LASER_ROT >= 25 && kind.blink >= 25,
           '3種とも十分な頻度で出る（横スキャン ' + kind.LASER_SCAN + ' / 回転 ' + kind.LASER_ROT +
           ' / 点滅 ' + kind.blink + ' /50シード）');
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'S2 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S2 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'S2 スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('S2 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' slide=' + agg.slide + ' 計' + agg.total);
    }
  });

  /* ==========================================================================
     6. 大ジャンプ（発射台→滑空→着地）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S2: 大演出「ビル間の大ジャンプ」（発火・滑空・着地・中断復元）',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces, B = In.Setpieces.BJ;
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      DUO.reset(); DUO.start('S2', 9); DUO.bot('perfect');
      DUO.skipTo(960);
      advanceTo(1010);
      t.eq(DUO.state().setpiece, 'bigjump', '1000m で大ジャンプの演出が始まる');
      t.eq(document.getElementById('cue').classList.contains('on'), true, 'HUD に「JUMP!」の予告が出る');
      const cueCs = getComputedStyle(document.getElementById('cue'));
      t.ok(cueCs.display !== 'none' && cueCs.visibility !== 'hidden', '予告が実際に見えている（display/visibility）');
      t.ok(document.getElementById('cue-main').textContent.indexOf('JUMP') >= 0, '予告の文字は「JUMP!」');
      t.ok(W.rampCue && W.rampCue.visible, '発射台の点滅ラインが出る');
      /* 上り勾配 */
      const spStart = Sp.state.startM;
      t.ok(Sp.viewLift(spStart + B.RAMP1) > 2.0, '発射台の末端で路面が ' + Sp.viewLift(spStart + B.RAMP1).toFixed(2) + 'm 持ち上がる');
      t.eq(Sp.viewLift(spStart - 5), 0, '演出の手前は平ら');
      t.eq(Sp.tileHidden(spStart + 20), false, '発射台にはまだ路面がある');
      /* 発射台に障害物を置かない（見た目だけ持ち上げるので、判定とズレる余地を作らない） */
      const inRamp = Game.gen.obstacles.filter((o) => o.at > spStart - 2 && o.at < spStart + B.LIP);
      t.eq(inRamp.length, 0, '発射台区間（' + B.LIP + 'm）に障害物はない（' + inRamp.length + '個）');

      /* --- 滑空 --- */
      advanceTo(spStart + B.LIP + 20);
      t.eq(DUO.state().glide, true, '発射後は滑空状態');
      t.eq(Sp.tileHidden(Game.dist), true, '滑空中は路面が無い（ビルとビルの間）');
      t.ok(Sp.viewLift(Game.dist) > 2.5, '滑空中は高い所にいる（' + Sp.viewLift(Game.dist).toFixed(2) + 'm）');
      t.ok(W.camera.fov > W._baseFov + 5, '滑空中は画角が広がる（+' + (W.camera.fov - W._baseFov).toFixed(1) + '°）');
      t.ok(W.scene.fog.far > fogFar0, '滑空中は遠くまで見える（霧 ' + W.scene.fog.far.toFixed(0) + '）');
      t.eq(In.ZoneNeon.cityBelow.visible, true, '眼下の街が出ている');
      t.eq(In.ZoneNeon.clouds.visible, true, '下に雲の層が出ている');
      t.ok(In.ZoneNeon.cloudMats[0].mat.opacity > 0, '雲が実際に描かれている');
      t.eq(W.trim.visible, false, '滑空中は路面の縁のラインが消える');
      t.ok(W.drawCalls() <= 300, '滑空中のドローコール ' + W.drawCalls() + ' ≤ 300');
      /* 眼下の構図: 街の頂点がカメラより十分下にあり、画面の下半分に入る */
      const camY = W.camera.position.y;
      t.ok(camY > 5, 'カメラが高い位置にある（y=' + camY.toFixed(2) + '）');
      const sz = new THREE.Vector2(); W.renderer.getSize(sz);
      const h = sz.y;
      const near = W.projectRect({ x0: -20, x1: 20, y0: -30, y1: -7, z0: -120, z1: -40 });
      const far = W.projectRect({ x0: -60, x1: 60, y0: -46, y1: -16, z0: -420, z1: -300 });
      const pc = (v) => (v / h * 100).toFixed(0) + '%';
      t.ok(near && near.bottom > h * 0.85, '眼下の街が画面の下まで広がる（下端 ' + pc(near.bottom) + '）');
      t.ok(far && far.top > h * 0.42, '遠くの街並みが地平（画面中央）より下に来る＝見下ろしている（上端 ' + pc(far.top) + '）');
      t.ok(near && far && (near.bottom - far.top) > h * 0.35,
           '街が画面の縦 ' + pc(near.bottom - far.top) + ' ぶんに広がっている（眼下に世界が広がる構図）');

      /* --- 滑空は自由飛行（レーンも床/天井も無い）＝1動作ずつの入力は効かない --- */
      DUO.bot(null);
      const before = { l: Game.runners[0].act, u: Game.runners[1].act, lane: Game.runners[0].laneTo };
      DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
      DUO.key('ArrowUp', true); DUO.pump(1 / 60); DUO.key('ArrowUp', false);
      DUO.key('KeyS', true); DUO.pump(1 / 60); DUO.key('KeyS', false);
      t.eq(Game.runners[0].act, 'run', '滑空中はジャンプ入力が無効（LUMEN）');
      t.eq(Game.runners[1].act, 'run', '滑空中はジャンプ入力が無効（UMBRA）');
      DUO.touch('bottom', 'up'); DUO.touch('top', 'down'); DUO.touch('bottom', 'right'); DUO.pump(1 / 60);
      t.eq(Game.runners[0].act, 'run', '滑空中はタッチのジャンプ/スライドも無効（LUMEN）');
      t.eq(Game.runners[1].act, 'run', '滑空中はタッチのジャンプ/スライドも無効（UMBRA）');
      t.eq(Game.runners[0].laneTo, before.lane, '滑空中はレーン移動も起きない（自由飛行 / 契約§4.5 改訂）');
      t.eq(DUO.state().inputMode, 'free', '入力は自由飛行モード（詳細は test_p2c.js）');
      t.info('入力前の状態: ' + before.l + '/' + before.u);

      /* --- 着地 --- */
      DUO.bot('perfect');
      advanceTo(spStart + B.LAND + 3);
      t.eq(DUO.state().glide, false, '着地で滑空が終わる');
      t.eq(DUO.state().phase, 'land', '着地フェーズに入る');
      t.ok(Math.abs(Sp.viewLift(Game.dist)) < 0.6, '着地して高さが戻る（' + Sp.viewLift(Game.dist).toFixed(2) + 'm）');
      t.ok(Sp.camFx().shake > 0.02, '着地の衝撃でカメラが揺れる（' + Sp.camFx().shake.toFixed(3) + '）');
      t.eq(Sp.tileHidden(Game.dist + 6), false, '着地したビルの屋上に路面がある');
      /* ゴールまで走り切る */
      t.eq(runToEnd(), 'clear', '大ジャンプを跨いでゴールできる');
      t.eq(Sp.viewLift(1200), 0, 'ゴール地点の高さは元通り');

      /* --- 中断（リトライ / タイトル）で完全復元 --- */
      DUO.reset(); DUO.start('S2', 9); DUO.bot('perfect');
      DUO.skipTo(960);                       // 演出の手前へ跳んでから実ステップで跨ぐ
      advanceTo(1000 + B.LIP + 30);
      t.eq(DUO.state().glide, true, 'もう一度 滑空に入る');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.eq(DUO.state().glide, false, 'リトライで滑空が解除される');
      t.eq(In.ZoneNeon.cityBelow.visible, false, '眼下の街が消える');
      t.eq(In.ZoneNeon.clouds.visible, false, '雲の層が消える');
      t.eq(In.ZoneNeon._glide, 0, '滑空の強さが 0 に戻る');
      t.eq(document.getElementById('cue').classList.contains('on'), false, '「JUMP!」の予告が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '霧の色が戻る');
      t.eq(W.trim.visible, true, '路面の縁が戻る');
      t.eq(W.trim.position.y, 0, '路面の縁の高さが戻る');
      t.eq(Sp.viewLift(1050), 0, '持ち上がりが残らない');
      t.eq(W.rampCue.visible, false, '発射台のラインが消える');
      for (let i = 0; i < 90; i++) DUO.pump(1 / 60);      // 画角は時定数で戻る（§4.1）
      t.ok(W.camera.fov <= W._baseFov + In.CFG.CAM.FOV_SPEED_GAIN + 1e-6,
           '画角が基準＋速度ぶんに戻る（' + W.camera.fov.toFixed(1) + '° ≤ ' +
           (W._baseFov + In.CFG.CAM.FOV_SPEED_GAIN).toFixed(1) + '°）');
      t.ok(Math.abs(W.camera.position.y - In.CFG.CAM.Y) < 0.3, 'カメラの高さが戻る（' + W.camera.position.y.toFixed(2) + '）');
      /* タイトルへ戻しても同じ */
      DUO.reset(); DUO.start('S2', 9); DUO.skipTo(960); advanceTo(1080);
      Game.toTitle();
      t.eq(DUO.state().setpiece, null, 'タイトルへ戻ると演出状態が消える');
      t.eq(In.ZoneNeon._glide, 0, 'タイトルでも滑空演出が消える');
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. 滑空区間は自由飛行（レーンの障害物は1つも置かない / 契約§4.5 改訂）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S2: 滑空区間はレーンの障害物を持たない（自由飛行＝FF が受け持つ）',
    quick: true,
    run(t) {
      const In = I();
      const def = In.Setpieces.DEFS.bigjump;
      t.eq((def.floor || []).length + (def.ceil || []).length, 0,
           '大ジャンプの譜面にレーンの障害物はない（旧 ADPANEL/DRONE/WIRE2 は失効）');
      t.eq(def.air, true, '自由飛行の区間を持つ演出として印が付いている');
      t.eq(def.landRel, In.Setpieces.BJ.LAND, '着地の位置が定義されている（着地猶予の起点）');
      const st = In.makeStage('S2');
      const inst = In.Setpieces.build('bigjump', 1000, 0);
      t.eq(inst.items.length, 0, '生成しても演出区間に障害物は出ない');
      t.eq(In.Fair.validate(inst.items, st.speedAt, { startLanes: 'any' }).length, 0, '§4.7 の検査も素通り');
      /* 空中は FF の譜面（詳細は test_p2c.js） */
      const c = In.Setpieces.buildAir(9, 1000, st.speedAt);
      t.ok(c.items.length >= 3, '代わりに空中の壁が ' + c.items.length + '本ある');
      t.eq(In.Fair.validateAir(c, st.speedAt, { margin: true }).length, 0, '空中の不変条件（§4.5 断面2D）を満たす');
    }
  });

  /* ==========================================================================
     8. S2 の解放とエンドレスのプール
     ========================================================================== */
  DUO.__suites.push({
    name: 'S2: 解放ロジック（S1クリアで解放）とエンドレスのプール',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U;
      const snap = U.lsSnapshot();
      try { window.localStorage.removeItem(In.CFG.LS_PREFIX + 'cleared'); } catch (e) { /* noop */ }
      UI.show('stages');
      let s2 = document.querySelector('[data-ui="stage-S2"]');
      t.eq(s2 && s2.getAttribute('data-unlocked'), '0', 'S1 未クリアでは S2 はロック');
      t.eq(!!(s2 && s2.hasAttribute('disabled')), true, 'ロック中は押せない');
      U.lsSet('cleared', ['S1']);
      UI.show('stages');
      s2 = document.querySelector('[data-ui="stage-S2"]');
      t.eq(s2 && s2.getAttribute('data-unlocked'), '1', 'S1 をクリアすると S2 が解放される');
      t.ok(s2 && s2.innerHTML.indexOf('準備中') < 0, 'S2 は「準備中」ではなく遊べる');
      const s3 = document.querySelector('[data-ui="stage-S3"]');
      t.eq(s3 && s3.getAttribute('data-unlocked'), '0', 'S3 はまだロック');
      /* 実クリックで S2 が始まる */
      s2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S2', 'クリックで S2 が始まる');
      t.near(DUO.state().speed, 20, 0.5, 'S2 は 20 m/s から');

      /* エンドレス: クリア済みゾーンぶんだけ顔ぶれが増える（契約§4.4） */
      const base = In.endlessPool([]);
      const withS2 = In.endlessPool(['S1', 'S2']);
      t.ok(withS2.pool.length > base.pool.length, 'S2 クリアでエンドレスのプールが増える（' +
           base.pool.length + '→' + withS2.pool.length + '）');
      const movingInBase = base.pool.filter((id) => (In.CHUNK_DEFS.filter((c) => c.id === id)[0] || {}).moving).length;
      const movingInS2 = withS2.pool.filter((id) => (In.CHUNK_DEFS.filter((c) => c.id === id)[0] || {}).moving).length;
      t.eq(movingInBase, 0, 'S2 未クリアのエンドレスに動くレーザーは出ない');
      t.ok(movingInS2 > 0, 'S2 クリア後のエンドレスには動くレーザーが混ざる（' + movingInS2 + '本）');
      t.ok(withS2.maxRank >= 3, 'S2 クリア後はランク3まで出る');
      U.lsSet('cleared', ['S1', 'S2']);
      const st = In.makeStage('endless');
      t.ok(st.chunkPool.length === withS2.pool.length, 'makeStage がクリア状況を読んでプールを組む');
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     9. P2b-0: チュートリアル tip（語中改行なし・2体に被らない）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b-0: チュートリアル tip の改行と位置（2体の投影矩形と交差しない）',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Tut = In.Tutorial;
      const el = document.getElementById('tip');
      /* 句は inline-block＝句の内部では絶対に折り返さない */
      Object.keys(Tut.TIPS).forEach((id) => {
        Tut.show(id);
        const phs = el.querySelectorAll('.ph');
        t.ok(phs.length >= 2 || Tut.TIPS[id].ph.length === 1, id + ': 文言が句に分かれている（' + phs.length + '句）');
        let bad = 0;
        phs.forEach((p) => {
          const cs = getComputedStyle(p);
          if (cs.display !== 'inline-block' || cs.whiteSpace !== 'nowrap') bad++;
          /* 句が2行にまたがっていない＝句の中で折り返していない */
          if (p.getClientRects().length > 1) bad++;
        });
        t.eq(bad, 0, id + ': どの句も語の途中で改行していない');
      });
      /* 縦持ち・横持ち・iPad で 2体に被らない */
      DUO.reset(); DUO.start('S1', 3); DUO.pump(1 / 60);
      [[375, 812, 'スマホ縦'], [812, 375, '横持ち'], [768, 1024, 'iPad縦']].forEach((v) => {
        W.setViewport(v[0], v[1], 1);
        /* 実画面のCSSサイズも合わせる（DOMの矩形はCSSピクセル） */
        const app = document.getElementById('app');
        const oldS = app.getAttribute('style') || '';
        app.style.width = v[0] + 'px'; app.style.height = v[1] + 'px';
        Tut.show('jump_l');
        DUO.pump(1 / 60);
        const r = el.getBoundingClientRect();
        t.ok(r.width > 40 && r.height > 10, v[2] + ': tip が表示されている（' + r.width.toFixed(0) + '×' + r.height.toFixed(0) + '）');
        t.ok(r.top >= 0 && r.bottom <= v[1] && r.left >= 0 && r.right <= v[0], v[2] + ': tip が画面内に収まる');
        /* 2体を端のレーンへ寄せた最悪ケースでも被らない */
        [-1, 0, 1].forEach((lane) => {
          Game.runners.forEach((x) => { x.laneFrom = x.laneTo = x.laneVal = lane; x.laneT = In.CFG.LANE_T; });
          DUO.pump(1 / 60);
          Game.runners.forEach((run) => {
            const rr = W.runnerRect(run);
            const hit = !(rr.right < r.left || rr.left > r.right || rr.bottom < r.top || rr.top > r.bottom);
            t.eq(hit, false, v[2] + ' lane' + lane + ': tip が ' + run.id.toUpperCase() +
                 ' の矩形と交差しない（tip ' + r.top.toFixed(0) + '〜' + r.bottom.toFixed(0) +
                 ' / ' + run.id + ' ' + rr.top.toFixed(0) + '〜' + rr.bottom.toFixed(0) + '）');
          });
        });
        app.setAttribute('style', oldS);
      });
      Tut.hide();
      W.resize();
      DUO.reset();
    }
  });

  /* ==========================================================================
     10. P2b-1: 1スワイプ＝1レーン（契約§4.2 改訂 2026-09-21 実機評）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b-1: 1スワイプ＝1レーン（連続ドラッグで2レーン飛ばない）',
    quick: true,
    run(t) {
      const In = I(), Input = In.Input, CFG = In.CFG;
      const start = (t0) => { Input.clear(); Input.touchStart(1, 200, 600, 812, t0); };
      /* (a) 指を離さず 200px 一気に引いても1回しか出ない */
      DUO.reset(); DUO.start('S1', 3);
      In.clearObstacles();
      start(1000);
      let fired = 0;
      for (let i = 1; i <= 20; i++) if (Input.touchMove(1, 200 + i * 10, 600, 1000 + i * 8)) fired++;
      t.eq(fired, 1, '連続ドラッグ200px（160ms）で出るのは1回だけ（' + fired + '回）');
      DUO.pump(1 / 60);
      t.eq(Game.runners[0].laneTo, 1, 'レーンは1つだけ動く');

      /* (b) 指を離して再フリックすれば また動く */
      Input.touchEnd(1);
      Input.touchStart(2, 200, 600, 812, 2000);
      t.ok(!!Input.touchMove(2, 240, 600, 2020), '指を離してからの再フリックは効く');
      DUO.pump(1 / 60);
      t.eq(Game.runners[0].laneTo, 1, '右端なのでこれ以上は動かない（入力自体は通っている）');

      /* (c) 同じ指でも「64px以上 かつ 220ms以上」なら2回目が効く */
      Game.runners.forEach((r) => { r.laneFrom = r.laneTo = r.laneVal = 0; r.laneT = CFG.LANE_T; });
      Input.clear();
      Input.touchStart(3, 200, 600, 812, 3000);
      t.ok(!!Input.touchMove(3, 230, 600, 3020), '1回目は閾値24pxで出る');
      t.ok(!Input.touchMove(3, 270, 600, 3100), '2回目: 40pxでは出ない（64px必要）');
      t.ok(!Input.touchMove(3, 300, 600, 3150), '2回目: 70px でも 150ms では出ない（220ms必要）');
      const ok2 = Input.touchMove(3, 300, 600, 3300);
      t.ok(!!ok2, '2回目: 70px かつ 300ms なら出る');
      DUO.pump(1 / 60);
      t.eq(Game.runners[0].laneTo, 1, '2回ぶんの入力で ちょうど 0→1（さらに飛ばない）');

      /* (d) 上下フリックも同じ規則 */
      Input.clear();
      Input.touchStart(4, 200, 600, 812, 4000);
      let up = 0;
      for (let i = 1; i <= 12; i++) if (Input.touchMove(4, 200, 600 - i * 12, 4000 + i * 10)) up++;
      t.eq(up, 1, '上フリックも連続ドラッグで1回だけ（' + up + '回）');
      t.eq(In.Input.queue.filter((q) => q.dir === 'up').length, 1, 'キューに積まれるのも1回');
      Input.clear();
      DUO.reset();
    }
  });

  /* ==========================================================================
     11. P2b-1: ジャンプ中の横移動は不可（着地の瞬間に1回だけ実行）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b-1: 空中では横に動けない（着地時に1回だけ実行・§4.2/§4.7）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG;
      DUO.reset(); DUO.start('S1', 3); In.clearObstacles();
      const r = Game.runners[0];
      /* 跳んでから横入力 → 空中では動かない */
      DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
      t.eq(r.act, 'jump', 'ジャンプ中');
      const lane0 = r.laneTo;
      DUO.key('KeyD', true); DUO.pump(1 / 60); DUO.key('KeyD', false);
      t.eq(r.laneTo, lane0, '空中の横入力ではレーンが変わらない');
      t.eq(r.laneBuf, 1, '入力は1個だけバッファされる');
      /* 空中で逆向きを入れたら「最後の方向」が残る */
      DUO.key('KeyA', true); DUO.pump(1 / 60); DUO.key('KeyA', false);
      t.eq(r.laneBuf, -1, 'バッファは最後の方向で上書きされる');
      DUO.key('KeyD', true); DUO.pump(1 / 60); DUO.key('KeyD', false);
      t.eq(r.laneBuf, 1, 'さらに上書きできる');
      /* 空中にいる間ずっと x は動かない */
      let moved = 0;
      while (r.act === 'jump') { const x0 = r.laneVal; DUO.pump(1 / 60); if (Math.abs(r.laneVal - x0) > 1e-9) moved++; }
      t.eq(moved, 0, '滞空中に横位置が動いたフレームは0');
      t.eq(r.laneTo, lane0 + 1, '着地の瞬間にバッファぶんが1回だけ実行される');
      t.eq(r.laneBuf, 0, 'バッファは消費される');
      /* スライド中は横に動ける／レーン補間中のジャンプは可 */
      DUO.reset(); DUO.start('S1', 3); In.clearObstacles();
      const r2 = Game.runners[0];
      DUO.key('KeyS', true); DUO.pump(1 / 60); DUO.key('KeyS', false);
      t.eq(r2.act, 'slide', 'スライド中');
      DUO.key('KeyD', true); DUO.pump(1 / 60); DUO.key('KeyD', false);
      t.eq(r2.laneTo, 1, 'スライド中の横移動はできる');
      DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
      t.eq(r2.act, 'jump', 'レーン補間中でもジャンプできる');
      const to = r2.laneTo;
      while (r2.laneT < CFG.LANE_T) DUO.pump(1 / 60);
      t.near(r2.laneVal, to, 1e-6, 'ジャンプしても補間は最後まで続く');

      /* ボットも同じ制約で動く（空中で横に動かない） */
      let air = 0;
      for (let seed = 1; seed <= 8; seed++) {
        DUO.reset(); DUO.start('S2', seed); DUO.bot('perfect');
        let g = 0;
        while (Game.status === 'playing' && g++ < 5000) {
          const before = Game.runners.map((x) => ({ act: x.act, v: x.laneVal }));
          DUO.__step(1 / 60);
          Game.runners.forEach((x, i) => { if (before[i].act === 'jump' && x.act === 'jump' && Math.abs(x.laneVal - before[i].v) > 1e-9) air++; });
        }
      }
      t.eq(air, 0, 'ボットの走行でも滞空中に横位置が動いたフレームは0（' + air + '）');

      /* §4.7: ジャンプ→レーン移動の反応窓（0.92秒）が検査されている */
      const mk = (type, surface, lane, at) => In.Obstacles.make(type, surface, lane, at, 0);
      const bad = [mk('ROVER', 'floor', 0, 100), mk('PILLAR', 'floor', 0, 108)];
      t.ok(In.Fair.validate(bad, () => 10, { startLanes: [0] }).some((e) => e.indexOf('ジャンプ→横移動') >= 0),
           'ジャンプ直後0.8秒のレーン移動要求を違反として検出する');
      const good = [mk('ROVER', 'floor', 0, 100), mk('PILLAR', 'floor', 0, 110)];
      t.eq(In.Fair.validate(good, () => 10, { startLanes: [0] }).length, 0, '1.0秒空いていれば合格');
      DUO.reset();
    }
  });

  /* ==========================================================================
     12. P2b-1: 密度の規範（契約§4.7）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P2b-1: 必須動作の密度が距離に比例して上がる（S1/S2 前半・後半 ±25%）',
    quick: true,
    run(t) {
      const In = I();
      /* 測る範囲 upTo は「障害物で譜面を作る区間」。大ジャンプ（自由飛行）の演出区間は
         レーンの障害物を持たない（§4.5 改訂）ので、その手前までで測る。
         空中の密度は別の規範（§4.5 の隙間と到達時間）で test_p2c.js が見る。 */
      const meas = (id, len, upTo) => {
        const half = { a: 0, b: 0 };
        let blanks = 0, bad = 0;
        for (let seed = 1; seed <= 50; seed++) {
          const st = In.makeStage(id);
          const g = In.createGenerator(st, seed);
          for (let d = 0; d < len; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
          const l = g.obstacles.filter((o) => o.at <= len);
          if (In.Fair.validate(l, st.speedAt, { startLanes: [0] }).length) bad++;
          blanks += g.log.filter((c) => c.id === '(blank)').length;
          In.Fair.walls(l, st.speedAt).forEach((w) => {
            const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
            if (w.at >= upTo) return;
            if (w.at < upTo / 2) half.a += n; else half.b += n;
          });
        }
        return { a: half.a / 50 / (upTo / 2) * 100, b: half.b / 50 / (upTo / 2) * 100, blanks: blanks, bad: bad };
      };
      const check = (id, len, dens, upTo) => {
        upTo = upTo || len;
        const m = meas(id, len, upTo);
        const wantA = In.U.lerp(dens[0], dens[1], 0.25 * upTo / len), wantB = In.U.lerp(dens[0], dens[1], 0.75 * upTo / len);
        t.ok(m.a >= wantA * 0.75 && m.a <= wantA * 1.25,
             id + ' 前半の密度 ' + m.a.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
        t.ok(m.b >= wantB * 0.75 && m.b <= wantB * 1.25,
             id + ' 後半の密度 ' + m.b.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
        t.ok(m.b > m.a, id + ' 密度は後半のほうが高い（' + m.a.toFixed(2) + ' → ' + m.b.toFixed(2) + '）');
        t.eq(m.bad, 0, id + ' 密度を上げても §4.7 の下限は守られている');
        t.eq(m.blanks, 0, id + ' 空白チャンク（生成の詰まり）は0回');
      };
      check('S1', 900, In.STAGE_DEFS.S1.density);
      check('S2', 1200, In.STAGE_DEFS.S2.density, 1000);   // 1000m以降は自由飛行の演出
      /* エンドレスは 1000m ごとに +1（上限14） */
      const e = In.makeStage('endless');
      t.eq(!!e.density, true, 'エンドレスにも密度の目安がある');
      DUO.reset();
    }
  });
})();
