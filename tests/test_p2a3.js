/* ============================================================================
   tests/test_p2a3.js — P2a 段階3（S1本編・崩落演出・UI）
     ・S1 をボットが完走する（perfect / delay250 × seed 1〜50）
     ・導入区間の順序と、チュートリアル表示の可視性（computed style）
     ・大演出「連鎖崩落」中も §4.7 の不変条件が成立／中断すると演出が完全に戻る
     ・UI 遷移（実クリック経路）と保存/復元
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
    name: 'S1: 導入区間の順序と公平性（契約§4.4 1種ずつ紹介）',
    quick: true,
    run(t) {
      const In = I();
      const stage = In.makeStage('S1');
      t.eq(stage.lengthM, 900, 'S1 は 900m');
      t.near(stage.speedAt(0), 16, 1e-6, '開始 16 m/s');
      t.near(stage.speedAt(900), 20, 1e-6, '終了 20 m/s');
      t.near(stage.checkpoints[0], 300, 1e-6, 'チェックポイント1 は 300m');
      t.near(stage.checkpoints[1], 600, 1e-6, 'チェックポイント2 は 600m');

      /* 導入区間の順番: ローバー(床)→ローバー(天井)→ピラー→ギャップ→ローレーザー→ワイド梁→同時 */
      const want = [
        ['ROVER', 'floor'], ['ROVER', 'ceil'], ['PILLAR', 'both'],
        ['GAP', 'floor'], ['LASER_LOW', 'ceil'], ['WIDEBAR', 'floor']
      ];
      const gen = In.createGenerator(stage, 1);
      for (let d = 0; d < 900; d += 20) gen.ensure(d + In.CFG.SPAWN_AHEAD, d);
      /* 導入区間の長さ: 契約§4.8 の tip の猶予規則（tip は対象の speed×2.5秒手前・吹き出しは重ねない）
         で、7つの紹介は最短でも 約 7×2.5秒×16m/s ≒ 280m＋助走 を要する（P5c で 300→約325m）。 */
      const INTRO_END = 330;
      const intro = gen.obstacles.filter((o) => o.at <= INTRO_END).sort((a, b) => a.at - b.at);
      want.forEach((w, i) => {
        const o = intro[i];
        t.ok(o && o.type === w[0] && o.surface === w[1],
             (i + 1) + '番目の紹介は ' + w[0] + '(' + w[1] + ')：' + (o ? o.type + '(' + o.surface + ')@' + o.at.toFixed(0) + 'm' : 'なし'));
      });
      /* 7つ目は床と天井の同時 */
      const both = intro.slice(6, 8);
      t.ok(both.length === 2 && Math.abs(both[0].at - both[1].at) < 1e-6 && both[0].surface !== both[1].surface,
           '最後は床と天井が同時に来る');
      t.ok(intro.length >= 8, '導入区間（〜' + INTRO_END + 'm）に 8個の紹介障害物（' + intro.length + '個）');

      /* 導入区間はスライディングを要求しない（S1 はスライド0%） */
      const list = gen.obstacles.filter((o) => o.at <= 900);
      const c = In.Fair.countDemands(list, stage.speedAt);
      t.eq(c.slide, 0, 'S1 全体でスライディング要求は0回（' + c.total + '回中）');
      t.info('S1 の内訳 lane=' + c.lane + ' jump=' + c.jump);

      /* 50シードで不変条件（大演出区間を含む）と動作比率 */
      let bad = 0, spFound = 0;
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S1');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 900; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 900);
        if (In.Fair.validate(l, st.speedAt, { startLanes: [0] }).length) bad++;
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c2) => c2.setpiece)) spFound++;
        if (g.log.some((c2) => c2.id === '(setpiece-unfair)')) bad++;
        const cc = In.Fair.countDemands(l, st.speedAt);
        agg.lane += cc.lane; agg.jump += cc.jump; agg.slide += cc.slide; agg.total += cc.total;
      }
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'S1 50シードのレーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S1 50シードのジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%（スライド0%のぶんが乗る）');
      t.eq(agg.slide, 0, 'S1 50シードでスライディングは0回（' + agg.total + '回中）');
      t.eq(bad, 0, 'S1 50シードで §4.7 違反なし（大演出区間を含む）');
      t.eq(spFound, 50, '50シードすべてに大演出（連鎖崩落）が入る');
    }
  });

  DUO.__suites.push({
    name: 'S1: チュートリアル表示（DOMオーバーレイの可視性）',
    /* 見ているのは **DOM オーバーレイ**（class / computed style / 文言）だけなので、
       走行は描画なしの DUO.__step で進める（DUO.pump だと 1フレームずつ WebGL を描き、
       この1本だけで runQuick の上限 20秒（契約§7）の半分を食っていた / 2026-09-22 P4a-0）。
       Tutorial の表示・消灯は Game.step の中（イベント発火と Tutorial.update）で起きるので、
       描画を省いてもこのテストの意味は変わらない。描画経路の確認は
       「S1: 大演出」「P2b-0: tip の位置」など pump を使う他のテストが受け持つ。 */
    quick: true,
    run(t) {
      const In = I();
      DUO.reset(); DUO.start('S1', 3);
      const el = document.getElementById('tip');
      t.ok(!!el, '#tip が存在する');
      t.ok(getComputedStyle(el).opacity === '0' || !el.classList.contains('on'), '開始時は非表示');
      /* 最初の tip は 30m 手前で出る（= 60-30 = 30m 付近） */
      let shown = null, guard = 0;
      while (Game.dist < 70 && guard++ < 4000) {
        DUO.__step(1 / 60);
        if (el.classList.contains('on') && !shown) shown = { dist: Game.dist, text: el.textContent };
      }
      t.ok(!!shown, 'ローバーの手前でチュートリアルが表示される');
      if (shown) {
        t.ok(shown.dist < 60, '障害物（60m）より手前で出る（' + shown.dist.toFixed(0) + 'm）');
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
      /* 2.6秒後には消える */
      for (let i = 0; i < 200; i++) DUO.__step(1 / 60);
      t.eq(el.classList.contains('on'), false, '一定時間で自動的に消える');
      /* 文言はタッチ前提（指アイコン＋フリックの言い方） */
      In.Tutorial.show('jump_l');
      t.ok(el.innerHTML.indexOf('finger') >= 0, '指アイコンが入っている');
      t.ok(el.textContent.indexOf('フリック') >= 0, 'フリックの言い方になっている: ' + el.textContent.slice(0, 24));
      In.Tutorial.show('jump_r');
      t.ok(el.textContent.indexOf('下へ') >= 0, 'UMBRA は「下へフリックでジャンプ」と案内する');
      In.Tutorial.hide();
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'S1: 大演出「連鎖崩落」（発火・不変条件・中断復元）',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces;
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      DUO.reset(); DUO.start('S1', 7); DUO.bot('perfect');
      /* 演出の手前から実ステップで跨ぐ（skipTo で直行すると発火しない） */
      DUO.skipTo(660);
      let guard = 0;
      while (Game.dist < 720 && guard++ < 6000) DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'collapse', '700m で連鎖崩落が発火する');
      t.ok(Sp.state && Sp.state.front < Game.dist - Sp.GAP_MIN + 1,
           '崩落前線はプレイヤーより後ろ（' + (Game.dist - (Sp.state ? Sp.state.front : 0)).toFixed(1) + 'm 後方）');
      /* 追いつかない: 演出の間ずっと前線は後ろ */
      let minGap = 1e9;
      guard = 0;
      while (Game.dist < 880 && guard++ < 8000) {
        DUO.pump(1 / 60);
        if (Sp.state) minGap = Math.min(minGap, Game.dist - Sp.state.front);
      }
      t.ok(minGap >= Sp.GAP_MIN - 1, '崩落前線は最接近でも ' + minGap.toFixed(1) + 'm 後ろ（追いつかない）');
      t.ok(W.scene.fog.far < fogFar0, '演出中は霧が濃くなる（' + W.scene.fog.far.toFixed(0) + '）');
      t.ok(W.camera.fov > W._baseFov, '演出中は画角が広がる（+' + (W.camera.fov - W._baseFov).toFixed(1) + '°）');
      t.ok(W.drawCalls() <= 300, '演出中のドローコール ' + W.drawCalls() + ' ≤ 300');
      /* 崩落タイルが実際に落ちている */
      t.ok(Sp.tileFall(Sp.state.front - 6, 'floor', 0) > 0, '前線の後ろのタイルは落下中');
      t.eq(Sp.tileFall(Game.dist + 20, 'floor', 0), 0, '前方のタイルは落ちない');

      /* --- 中断（タイトルへ）で完全に戻る --- */
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
      DUO.reset(); DUO.start('S1', 7); DUO.bot('perfect');
      DUO.skipTo(690);
      guard = 0;
      while (Game.dist < 730 && guard++ < 6000) DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'collapse', 'もう一度発火している');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, 'リトライで霧が戻る');
      t.eq(DUO.state().status, 'playing', 'リトライ後はプレイ中');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'S1: ゴール演出とリザルト（クリア→保存）',
    quick: true,
    run(t) {
      const snap = I().U.lsSnapshot();
      DUO.reset();
      try { window.localStorage.removeItem(I().CFG.LS_PREFIX + 'cleared'); } catch (e) { /* noop */ }
      try { window.localStorage.removeItem(I().CFG.LS_PREFIX + 'best.S1'); } catch (e) { /* noop */ }
      DUO.start('S1', 11); DUO.bot('perfect');
      let guard = 0;
      while (Game.status === 'playing' && guard++ < 30000) DUO.__step(1 / 60);
      t.eq(Game.status, 'goal', 'ゴール到達で goal 演出に入る');
      t.ok(Game.dist >= 900, '900m を走り切っている（' + Game.dist.toFixed(0) + 'm）');
      /* 演出中は徐々に減速して止まる */
      for (let i = 0; i < 10; i++) DUO.__step(1 / 60);
      t.eq(Game.status, 'goal', '演出は 1.3 秒ほど続く');
      guard = 0;
      while (Game.status === 'goal' && guard++ < 600) DUO.__step(1 / 60);
      t.eq(Game.status, 'clear', '演出のあと clear になる');
      t.eq(document.getElementById('screen-clear').classList.contains('on'), true, 'リザルト（CLEAR）が出る');
      t.ok(document.getElementById('clear-dist').textContent.indexOf('900') >= 0, '距離が表示される');
      t.eq(I().U.lsGet('cleared', []).indexOf('S1') >= 0, true, 'クリアが localStorage に残る');
      t.ok(I().U.lsGet('best.S1', 0) >= 900, 'ベスト距離が保存される');
      t.eq(DUO.state().bestUpdated, true, 'ベスト更新フラグが立つ');
      /* ステージ選択に星が付く */
      I().UI.show('stages');
      const card = document.querySelector('[data-ui="stage-S1"]');
      t.ok(card && card.innerHTML.indexOf('★') >= 0, 'ステージ選択で S1 に星が付く');
      I().U.lsRestore(snap);
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'UI: 実クリック経路（タイトル→モード→ステージ選択→S1→死亡→リトライ）',
    quick: true,
    run(t) {
      const In = I();
      const snap = In.U.lsSnapshot();
      /* 解放状態を既知にする（runAll ではボット完走テストが先に S1 をクリア済みにするため。
         最後に lsRestore で元へ戻す） */
      try { window.localStorage.removeItem(In.CFG.LS_PREFIX + 'cleared'); } catch (e) { /* noop */ }
      DUO.reset();
      t.eq(onScreen('title'), true, 'タイトルが出ている');
      t.eq(click('start'), true, 'START を押す');
      t.eq(onScreen('mode'), true, 'モード選択へ');
      t.eq(click('mode-stage'), true, 'ステージを押す');
      t.eq(onScreen('stages'), true, 'ステージ選択へ');
      /* S1 は解放・S2 以降はロック */
      const s1 = document.querySelector('[data-ui="stage-S1"]');
      const s2 = document.querySelector('[data-ui="stage-S2"]');
      t.eq(s1 && s1.getAttribute('data-unlocked'), '1', 'S1 は解放されている');
      t.eq(s2 && s2.getAttribute('data-unlocked'), '0', 'S2 はロックされている（S1 未クリア時）');
      t.eq(!!(s2 && s2.hasAttribute('disabled')), true, 'ロックは押せない');
      t.eq(click('stage-S1'), true, 'S1 を押す');
      t.eq(DUO.state().stage, 'S1', 'S1 が始まる');
      t.eq(onScreen('title'), false, 'プレイ中はタイトルが消える');
      t.eq(document.getElementById('hud').classList.contains('on'), true, 'HUD が出る');
      /* わざと死ぬ */
      DUO.skipTo(320);
      In.clearObstacles();
      In.spawnOne('PILLAR', 'floor', 0, 12);
      let guard = 0;
      while (Game.status !== 'dead' && guard++ < 3000) DUO.__step(1 / 60);
      t.eq(onScreen('dead'), true, '死亡でリザルト（CRASH）が出る');
      t.eq(click('retry'), true, 'リトライを押す');
      t.eq(DUO.state().status, 'playing', 'チェックポイントから再開する');
      t.near(DUO.state().dist, 300, 1e-6, '300m のチェックポイントから再開');
      /* タイトルへ戻る */
      t.eq(click('title'), true, 'タイトルへを押す');
      t.eq(onScreen('title'), true, 'タイトルに戻る');
      t.eq(DUO.state().status, 'idle', '状態も idle に戻る');
      /* エンドレス */
      click('start'); click('mode-endless');
      t.eq(DUO.state().stage, 'endless', 'エンドレスが始まる');
      t.eq(DUO.state().speed >= 16, true, 'エンドレスも 16 m/s から');
      DUO.reset();
      In.U.lsRestore(snap);
    }
  });
})();
