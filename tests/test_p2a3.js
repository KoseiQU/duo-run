/* ============================================================================
   tests/test_p2a3.js — P2a 段階3 → P7c（契約 v2: S1＝白空間チュートリアル、崩落は S2 の中盤）
     ・S1 をボットが完走する（perfect / delay250 × seed 1〜50）
     ・S1 チュートリアルの構成（6項目×tip＋練習）と、tip 表示の可視性（computed style）
     ・S2 中盤の大演出「連鎖崩落」中も §4.7 の不変条件が成立／中断・片付けで演出が完全に戻る
     ・UI 遷移（実クリック経路: 初回の START＝S1）と保存/復元
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const click = (ui) => {
    const e = document.querySelector('[data-ui="' + ui + '"]');
    if (!e) return false;
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  };
  const onScreen = (id) => {
    const e = document.getElementById('screen-' + id);
    return !!e && e.classList.contains('on') && getComputedStyle(e).display !== 'none';
  };
  /* status が playing / goal の間まわす（ゴール演出を跨ぐ） */
  const runToEnd = (limit) => {
    let g = 0;
    while ((Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 30000)) DUO.__step(1 / 60);
    return Game.status;
  };

  DUO.__suites.push({
    name: 'S1: ボット完走（perfect / delay250 × seed 1〜50）',
    quick: false,
    run(t) {
      let p = 0, d = 0;
      const pf = [], df = [];
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S1', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++; else pf.push(seed + '@' + Math.floor(Game.dist));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S1', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++; else df.push(seed + '@' + Math.floor(Game.dist));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S1 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S1 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  DUO.__suites.push({
    name: 'S1: チュートリアルの構成と公平性（契約§4.4 v2 6項目を1つずつ・tip＋練習2〜3回）',
    quick: true,
    run(t) {
      const In = I();
      const stage = In.makeStage('S1');
      t.eq(stage.lengthM, 600, 'S1 は 600m（2026-09-27 壁の穴失効）');
      t.near(stage.speedAt(0), 14, 1e-6, '開始 14 m/s');
      t.near(stage.speedAt(600), 16, 1e-6, '終了 16 m/s');
      t.eq(stage.zone, 'white', 'ゾーンは白い空間');
      t.eq(stage.setpieces.length, 0, '大演出なし');
      /* 項目の順（契約§4.4 S1 / 2026-09-27）: レーン移動→ジャンプ→2レーン封鎖→両手同時→動くレーザー（5項目） */
      const ORDER = ['lane', 'jump', 'wide', 'both', 'moving'];
      /* 各項目の「それだけを要求する」型（練習の中身の検査） */
      const KIND = {
        lane: (o) => o.type === 'PILLAR',
        jump: (o) => o.type === 'ROVER' || o.type === 'LASER_LOW',
        wide: (o) => o.type === 'WIDEBAR',
        both: (o) => o.type === 'ROVER' || o.type === 'WIDEBAR',
        moving: (o) => o.type === 'LASER_SCAN'
      };
      let bad = 0, badSeq = 0, badDrill = 0, badBoth = 0, noReady = 0, extra = 0;
      const drillN = {};
      for (let seed = 1; seed <= 50; seed++) {
        const g = In.createGenerator(stage, seed);
        g.ensure(stage.lengthM, 0);
        const l = g.obstacles;
        if (In.Fair.validate(l, stage.speedAt, { startLanes: [0] }).length) bad++;
        if (In.Fair.checkVisibility(l, stage.speedAt).length) bad++;
        const tips = g.events.filter((e) => e.type === 'tip').map((e) => e.params.id);
        if (tips.join(',') !== ORDER.join(',')) badSeq++;
        /* ランダム区間・大演出は無い（導入の項目と「準備完了」だけ） */
        if (g.log.some((c) => !c.intro)) extra++;
        const ready = g.events.filter((e) => e.type === 'tut.ready')[0];
        if (!ready || ready.at >= stage.lengthM) noReady++;
        /* 項目ごと: 対象＋練習（次の tip の対象より手前）が、その項目の型だけ */
        const tev = g.events.filter((e) => e.type === 'tip');
        tev.forEach((e, i) => {
          const a = e.params.targetAt - 0.01, b = (i + 1 < tev.length) ? tev[i + 1].params.targetAt - 0.01 : 1e9;
          const grp = l.filter((o) => o.at >= a && o.at < b);
          if (!grp.every(KIND[e.params.id])) badDrill++;
          const ats = {};
          grp.forEach((o) => { ats[o.at.toFixed(2)] = 1; });
          const n = Object.keys(ats).length - 1;          // 対象を除いた練習の回数
          drillN[e.params.id] = Math.min(drillN[e.params.id] === undefined ? 9 : drillN[e.params.id], n);
          if (n < 1 || n > 3) badDrill++;
          if (e.params.id === 'both') {
            /* 両手同時: 床と天井に同時に必須動作 */
            const tg = grp.filter((o) => Math.abs(o.at - e.params.targetAt) < 0.01);
            if (!(tg.some((o) => o.surface === 'floor') && tg.some((o) => o.surface === 'ceil'))) badBoth++;
          }
        });
      }
      t.eq(bad, 0, 'S1 50シードで §4.7 違反・視認距離違反なし');
      t.eq(badSeq, 0, 'tip の順は ' + ORDER.join('→') + '（50シード）');
      t.eq(extra, 0, 'ランダム区間・大演出を持たない');
      t.eq(noReady, 0, '最後に「準備完了」（tut.ready）がゴールより手前');
      t.eq(badDrill, 0, '各項目は その型だけ・練習は1〜3回（' + JSON.stringify(drillN) + '）');
      t.ok(ORDER.every((k) => drillN[k] >= 2), '練習はどの項目も2回以上（対象と合わせて3回）: ' + JSON.stringify(drillN));
      t.eq(badBoth, 0, '「両手同時」の対象は床と天井に同時');
      /* 壁の穴は失効（2026-09-27）＝ S1 には出ない。型は レーン移動・ジャンプ・2レーン封鎖・動くレーザーだけ */
      const g1 = In.createGenerator(stage, 1);
      g1.ensure(stage.lengthM, 0);
      t.eq(g1.obstacles.filter((o) => /^WALL/.test(o.type)).length, 0, '壁の穴は出ない');
      t.eq(In.INTRO_S1.filter((it) => it.tip).length, 5, 'S1 の項目は5つ');
      t.ok(g1.obstacles.some((o) => o.type === 'LASER_SCAN'), '動くレーザー（横スキャン）が出る');
      /* エンドレスには含めない（S1 のゾーン白空間は順に無い） */
      t.eq(In.Endless.ORDER.indexOf('white'), -1, 'エンドレスのゾーン順に白空間は無い');
    }
  });

  DUO.__suites.push({
    name: 'S1: チュートリアル表示（DOMオーバーレイの可視性）',
    /* 見ているのは **DOM オーバーレイ**（class / computed style / 文言）だけなので、
       走行は描画なしの DUO.__step で進める（runQuick の上限のため / 2026-09-22 P4a-0）。 */
    quick: true,
    run(t) {
      const In = I();
      DUO.reset(); DUO.start('S1', 3);
      const el = document.getElementById('tip');
      t.ok(!!el, '#tip が存在する');
      t.ok(getComputedStyle(el).opacity === '0' || !el.classList.contains('on'), '開始時は非表示');
      const first = Game.gen.events.filter((e) => e.type === 'tip')[0];
      let shown = null, guard = 0;
      while (Game.dist < first.params.targetAt + 5 && guard++ < 4000) {
        DUO.__step(1 / 60);
        if (el.classList.contains('on') && !shown) shown = { dist: Game.dist, text: el.textContent };
      }
      t.ok(!!shown, '最初の対象（柱）の手前でチュートリアルが表示される');
      if (shown) {
        t.ok(shown.dist < first.params.targetAt, '対象（' + first.params.targetAt.toFixed(0) + 'm）より手前で出る（' + shown.dist.toFixed(0) + 'm）');
        t.ok(shown.text.length > 0, '文言が入っている: ' + shown.text);
      }
      /* 表示中は computed style で見えている */
      DUO.reset(); DUO.start('S1', 3);
      guard = 0;
      while (!el.classList.contains('on') && guard++ < 4000) DUO.__step(1 / 60);
      const cs = getComputedStyle(el);
      t.ok(parseFloat(cs.opacity) > 0.5 || el.classList.contains('on'), '表示中は opacity が上がる（' + cs.opacity + '）');
      t.ok(cs.display !== 'none' && cs.visibility !== 'hidden', 'display/visibility が隠れていない');
      t.eq(DUO.state().tip !== null, true, 'DUO.state().tip に出ている合図が入る');
      /* 2.0秒で消える（§4.8） */
      for (let i = 0; i < 200; i++) DUO.__step(1 / 60);
      t.eq(el.classList.contains('on'), false, '一定時間で自動的に消える');
      /* 文言はタッチ前提（指アイコン＋フリックの言い方） */
      ['lane', 'jump', 'wide', 'both', 'moving'].forEach((id) => {
        t.ok(!!In.Tutorial.TIPS[id], 'S1 の文言がある: ' + id);
      });
      In.Tutorial.show('jump');
      t.ok(el.innerHTML.indexOf('finger') >= 0, '指アイコンが入っている');
      t.ok(el.textContent.indexOf('フリック') >= 0, 'フリックの言い方になっている: ' + el.textContent.slice(0, 24));
      t.ok(el.textContent.indexOf('下へ') >= 0, 'UMBRA は「下へフリックでジャンプ」と案内する');
      t.ok(!In.Tutorial.TIPS.hole, '壁の穴の tip は無い（2026-09-27 失効）');
      In.Tutorial.hide();
      /* 最後の「準備完了」 */
      DUO.reset(); DUO.start('S1', 3); DUO.bot('perfect');
      Game.gen.ensure(Game.stage.lengthM, 0);
      const rd = Game.gen.events.filter((e) => e.type === 'tut.ready')[0];
      DUO.skipTo(rd.at - 20);
      guard = 0;
      while (Game.dist < rd.at + 2 && guard++ < 3000) DUO.__step(1 / 60);
      const cue = document.getElementById('cue');
      t.eq(cue.classList.contains('on'), true, '最後の練習の後に「準備完了」の合図が出る');
      t.ok(document.getElementById('cue-sub').textContent.indexOf('準備完了') >= 0, '文言は「準備完了」');
      DUO.reset();
      t.eq(cue.classList.contains('on'), false, 'タイトルへ戻ると合図が消える');
    }
  });

  DUO.__suites.push({
    name: 'S2: 中盤の大演出「連鎖崩落」（発火・不変条件・片付け・中断復元）',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces;
      const st0 = In.makeStage('S2');
      const mid = st0.setpieces[0];
      t.eq(mid.id + '@' + mid.start, 'collapse@780', 'S2 の中盤は 780m からの連鎖崩落');
      DUO.reset(); DUO.start('S2', 7); DUO.bot('perfect');
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      /* 演出の手前から実ステップで跨ぐ（skipTo で直行すると発火しない） */
      DUO.skipTo(740);
      let guard = 0;
      while (Game.dist < 800 && guard++ < 6000) DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'collapse', '780m で連鎖崩落が発火する');
      t.ok(Sp.state && Sp.state.front < Game.dist - Sp.GAP_MIN + 1,
           '崩落前線はプレイヤーより後ろ（' + (Game.dist - (Sp.state ? Sp.state.front : 0)).toFixed(1) + 'm 後方）');
      let minGap = 1e9;
      guard = 0;
      while (Game.dist < 960 && guard++ < 8000) {
        DUO.pump(1 / 60);
        if (Sp.state) minGap = Math.min(minGap, Game.dist - Sp.state.front);
      }
      t.ok(minGap >= Sp.GAP_MIN - 1, '崩落前線は最接近でも ' + minGap.toFixed(1) + 'm 後ろ（追いつかない）');
      t.ok(W.scene.fog.far < fogFar0, '演出中は霧が濃くなる（' + W.scene.fog.far.toFixed(0) + '）');
      t.ok(W.camera.fov > W._baseFov, '演出中は画角が広がる（+' + (W.camera.fov - W._baseFov).toFixed(1) + '°）');
      t.ok(W.drawCalls() <= 300, '演出中のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Sp.tileFall(Sp.state.front - 6, 'floor', 0) > 0, '前線の後ろのタイルは落下中');
      t.eq(Sp.tileFall(Game.dist + 20, 'floor', 0), 0, '前方のタイルは落ちない');
      /* 中盤の演出は終わったら片付く（ゴールが無いので mid.end で）＝ 走行は続く */
      guard = 0;
      while (Game.dist < 1016 && Game.status === 'playing' && guard++ < 8000) DUO.pump(1 / 60);
      t.eq(DUO.state().status, 'playing', '中盤の演出を抜けても走行は続く');
      t.eq(DUO.state().setpiece, null, '終わりの ' + Sp.MID_END_M + 'm 後で演出状態が片付く');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '片付けで霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '片付けで霧の色が戻る');
      t.eq(Sp.tileFall(Game.dist - 30, 'floor', 0), 0, '崩落タイルの状態が消える');
      guard = 0;
      while (Game.dist < 1030 && guard++ < 3000) DUO.pump(1 / 60);
      t.ok(Game.lastCheckpoint > 1000 && Game.lastCheckpoint < 1030, '中盤の演出の直後にチェックポイント（' + Game.lastCheckpoint.toFixed(0) + 'm）');

      /* --- 中断（タイトルへ）で完全に戻る --- */
      DUO.reset(); DUO.start('S2', 7); DUO.bot('perfect');
      DUO.skipTo(760);
      guard = 0;
      while (Game.dist < 820 && guard++ < 6000) DUO.pump(1 / 60);
      Game.toTitle();
      t.eq(DUO.state().setpiece, null, 'タイトルへ戻ると演出状態が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '霧の色が戻る');
      t.eq(W._shake, 0, 'カメラ揺れが戻る');
      t.eq(W._fxFov, 0, '演出の画角上乗せが戻る');
      DUO.pump(1 / 60);
      t.ok(W.camera.fov <= W._baseFov + CFG.CAM.FOV_SPEED_GAIN + 1e-6, '画角が基準＋速度ぶんに戻る');
      t.eq(Sp.tileFall(0, 'floor', 0), 0, '崩落タイルの状態が消える');

      /* --- 演出中にリトライしても戻る --- */
      DUO.reset(); DUO.start('S2', 7); DUO.bot('perfect');
      DUO.skipTo(770);
      guard = 0;
      while (Game.dist < 810 && guard++ < 6000) DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'collapse', 'もう一度発火している');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, 'リトライで霧が戻る');
      t.eq(DUO.state().status, 'playing', 'リトライ後はプレイ中');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'S1: ゴール演出とリザルト（クリア→保存・チュートリアル済み）',
    quick: true,
    run(t) {
      const In = I();
      const snap = In.U.lsSnapshot();
      DUO.reset();
      ['cleared', 'best.S1', 'tutorialDone'].forEach((k) => {
        try { window.localStorage.removeItem(In.CFG.LS_PREFIX + k); } catch (e) { /* noop */ }
      });
      DUO.start('S1', 11); DUO.bot('perfect');
      let guard = 0;
      while (Game.status === 'playing' && guard++ < 30000) DUO.__step(1 / 60);
      t.eq(Game.status, 'goal', 'ゴール到達で goal 演出に入る');
      t.ok(Game.dist >= 600, '600m を走り切っている（' + Game.dist.toFixed(0) + 'm）');
      for (let i = 0; i < 10; i++) DUO.__step(1 / 60);
      t.eq(Game.status, 'goal', '演出は 1.3 秒ほど続く');
      /* ここから先は人の手（ボットの走行ではチュートリアル済みを記録しない） */
      DUO.bot(null);
      guard = 0;
      while (Game.status === 'goal' && guard++ < 600) DUO.__step(1 / 60);
      t.eq(Game.status, 'clear', '演出のあと clear になる');
      t.eq(document.getElementById('screen-clear').classList.contains('on'), true, 'リザルト（CLEAR）が出る');
      t.ok(document.getElementById('clear-dist').textContent.indexOf('準備完了') >= 0, '「準備完了」が表示される');
      t.eq(In.U.lsGet('cleared', []).indexOf('S1') >= 0, true, 'クリアが localStorage に残る');
      t.ok(In.U.lsGet('best.S1', 0) >= 600, 'ベスト距離が保存される');
      t.eq(DUO.state().bestUpdated, true, 'ベスト更新フラグが立つ');
      t.eq(In.U.lsGet('tutorialDone', false), true, 'S1 クリアでチュートリアル済み（duorun.tutorialDone）');
      In.UI.show('stages');
      const card = document.querySelector('[data-ui="stage-S1"]');
      t.ok(card && card.innerHTML.indexOf('★') >= 0, 'ステージ選択で S1 に星が付く');
      /* ボットのクリアでは記録しない */
      try { window.localStorage.removeItem(In.CFG.LS_PREFIX + 'tutorialDone'); } catch (e) { /* noop */ }
      DUO.reset(); DUO.start('S1', 12); DUO.bot('perfect');
      guard = 0;
      while ((Game.status === 'playing' || Game.status === 'goal') && guard++ < 30000) DUO.__step(1 / 60);
      t.eq(Game.status, 'clear', 'ボットもクリアする');
      t.eq(In.U.lsGet('tutorialDone', false), false, 'ボットのクリアではチュートリアル済みにしない');
      In.U.lsRestore(snap);
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'UI: 実クリック経路（初回 START＝S1 チュートリアル→死亡→リトライ→スキップ→ステージ選択）',
    quick: true,
    run(t) {
      const In = I();
      const snap = In.U.lsSnapshot();
      /* 解放状態を既知にする（最後に lsRestore で元へ戻す） */
      ['cleared', 'tutorialDone'].forEach((k) => {
        try { window.localStorage.removeItem(In.CFG.LS_PREFIX + k); } catch (e) { /* noop */ }
      });
      DUO.reset();
      t.eq(onScreen('title'), true, 'タイトルが出ている');
      t.ok(document.getElementById('btn-start').textContent.indexOf('チュートリアル') >= 0, '初回は START がチュートリアルを促す');
      t.eq(getComputedStyle(document.getElementById('btn-start-skip')).display !== 'none', true, '初回は「スキップ」も出る');
      t.eq(click('start'), true, 'START を押す');
      t.eq(DUO.state().stage, 'S1', '初回の START で S1 チュートリアルが始まる');
      t.eq(onScreen('title'), false, 'プレイ中はタイトルが消える');
      t.eq(document.getElementById('hud').classList.contains('on'), true, 'HUD が出る');
      t.eq(document.body.getAttribute('data-zone'), 'white', '白い空間（HUD は暗い文字）');
      /* わざと死ぬ */
      DUO.skipTo(240);
      In.clearObstacles();
      In.spawnOne('PILLAR', 'floor', 0, 12);
      let guard = 0;
      while (Game.status !== 'dead' && guard++ < 3000) DUO.__step(1 / 60);
      t.eq(onScreen('dead'), true, '死亡でリザルト（CRASH）が出る');
      t.eq(click('retry'), true, 'リトライを押す');
      t.eq(DUO.state().status, 'playing', 'チェックポイントから再開する');
      t.near(DUO.state().dist, 600 / 3, 1e-6, '1/3 地点のチェックポイントから再開');
      t.eq(click('title'), true, 'タイトルへを押す');
      t.eq(onScreen('title'), true, 'タイトルに戻る');
      t.eq(DUO.state().status, 'idle', '状態も idle に戻る');
      /* スキップ → モード → ステージ選択（7枚） */
      t.eq(click('start-skip'), true, 'スキップを押す');
      t.eq(onScreen('mode'), true, 'モード選択へ');
      t.eq(click('mode-stage'), true, 'ステージを押す');
      t.eq(onScreen('stages'), true, 'ステージ選択へ');
      t.eq(document.querySelectorAll('#stage-grid .stage-card').length, 7, 'ステージは7枚');
      const s1 = document.querySelector('[data-ui="stage-S1"]');
      const s2 = document.querySelector('[data-ui="stage-S2"]');
      t.eq(s1 && s1.getAttribute('data-unlocked'), '1', 'S1 は解放されている');
      t.eq(s2 && s2.getAttribute('data-unlocked'), '0', 'S2 はロックされている（S1 未クリア時）');
      t.eq(!!(s2 && s2.hasAttribute('disabled')), true, 'ロックは押せない');
      t.eq(click('stage-S1'), true, 'ステージ選択からも S1 を選べる');
      t.eq(DUO.state().stage, 'S1', 'S1 が始まる');
      /* チュートリアル済みなら START はモード選択へ */
      DUO.reset();
      In.U.lsSet('tutorialDone', true);
      In.UI.show('title');
      t.eq(document.getElementById('btn-start').textContent, 'START', '済みなら START だけ');
      t.eq(getComputedStyle(document.getElementById('btn-start-skip')).display, 'none', '済みならスキップは出ない');
      click('start');
      t.eq(onScreen('mode'), true, '済みなら START でモード選択へ');
      click('mode-endless');
      t.eq(DUO.state().stage, 'endless', 'エンドレスが始まる');
      t.eq(DUO.state().speed >= 16, true, 'エンドレスも 16 m/s から');
      DUO.reset();
      In.U.lsRestore(snap);
      In.UI.show('title');
    }
  });
})();
