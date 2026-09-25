/* ============================================================================
   tests/test_input.js — 入力 → 状態遷移（ジャンプ／スライド／レーン補間／重力逆／フック）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  /* 障害物のない状態で操作だけを見る */
  function freshPlay(seed) {
    DUO.reset();
    DUO.start('S0', seed === undefined ? 99 : seed);
    DUO.__internal.clearObstacles();
  }
  function pumpFor(sec) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) DUO.pump(1 / 60);
  }
  /* 単発キー: keydown → 1ポンプ → keyup（同tickでdown/upするとエッジが消える） */
  function tap(code) { DUO.key(code, true); DUO.pump(1 / 60); DUO.key(code, false); }

  DUO.__suites.push({
    name: 'キー入力 → ジャンプ／スライドの状態遷移',
    quick: true,
    run(t) {
      const CFG = I().CFG;
      freshPlay();
      let s = DUO.state();
      t.eq(s.runners.lumen.act, 'run', '初期状態は run');

      /* --- ジャンプ（W） --- */
      tap('KeyW');
      s = DUO.state();
      t.eq(s.runners.lumen.act, 'jump', 'W でジャンプ開始');
      t.ok(s.runners.lumen.offset > 0, 'ジャンプ直後に足元が浮く（' + s.runners.lumen.offset.toFixed(3) + '）');
      /* 頂点（滞空の半分）で JUMP_APEX に到達 */
      pumpFor(CFG.JUMP_T / 2 - 1 / 60);
      t.near(DUO.state().runners.lumen.offset, CFG.JUMP_APEX, 0.03, 'ジャンプ最高点 = ' + CFG.JUMP_APEX);
      /* 滞空 0.55秒で着地 */
      pumpFor(CFG.JUMP_T / 2 + 2 / 60);
      s = DUO.state();
      t.eq(s.runners.lumen.act, 'run', '滞空 ' + CFG.JUMP_T + '秒 で着地して run に戻る');
      t.near(s.runners.lumen.offset, 0, 1e-6, '着地したら足元は面の上');

      /* 空中での2段ジャンプは不可 */
      tap('KeyW'); DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
      t.near(DUO.state().runners.lumen.actT, 2 / 60, 0.004, '空中で再入力しても跳び直さない（actTが巻き戻らない）');
      pumpFor(CFG.JUMP_T);

      /* --- スライディング（S） --- */
      tap('KeyS');
      s = DUO.state();
      t.eq(s.runners.lumen.act, 'slide', 'S でスライディング開始');
      t.near(s.runners.lumen.box.y1 - s.runners.lumen.box.y0, CFG.SLIDE_H, 1e-6, 'スライド中の当たり判定高さ = ' + CFG.SLIDE_H);
      pumpFor(CFG.SLIDE_T + 2 / 60);
      t.eq(DUO.state().runners.lumen.act, 'run', 'スライド ' + CFG.SLIDE_T + '秒 で解除');

      /* --- スライド中のジャンプはキャンセルして跳べる（連続要求の救済） --- */
      tap('KeyS');
      tap('KeyW');
      t.eq(DUO.state().runners.lumen.act, 'jump', 'スライド中の W はジャンプへ移行できる');
      pumpFor(CFG.JUMP_T);

      /* --- オートリピートは1動作 --- */
      DUO.key('KeyW', true); DUO.key('KeyW', true); DUO.pump(1 / 60);
      const actT1 = DUO.state().runners.lumen.actT;
      DUO.key('KeyW', true); DUO.pump(1 / 60); DUO.key('KeyW', false);
      t.ok(DUO.state().runners.lumen.actT > actT1, 'keydown の連打（keyupなし）で跳び直さない');
    }
  });

  DUO.__suites.push({
    name: 'レーン移動の補間（0.12秒）',
    quick: true,
    run(t) {
      const CFG = I().CFG;
      freshPlay();
      tap('KeyA');
      let s = DUO.state();
      t.eq(s.runners.lumen.lane, -1, 'A で目標レーンが左へ');
      t.ok(s.runners.lumen.laneVal > -1 && s.runners.lumen.laneVal < 0, '1フレーム後は補間の途中（' + s.runners.lumen.laneVal.toFixed(3) + '）');
      pumpFor(CFG.LANE_T / 2);
      s = DUO.state();
      t.ok(s.runners.lumen.laneVal > -0.9 && s.runners.lumen.laneVal < -0.1, '中間時点は中間位置');
      pumpFor(CFG.LANE_T);
      s = DUO.state();
      t.near(s.runners.lumen.laneVal, -1, 1e-6, CFG.LANE_T + '秒で移動完了');
      t.near(s.runners.lumen.x, -CFG.LANE_W, 1e-6, 'x = -LANE_W');
      /* 端でそれ以上外に出ない */
      tap('KeyA'); pumpFor(CFG.LANE_T);
      t.eq(DUO.state().runners.lumen.lane, -1, '左端より外へは出ない');
      /* 右へ2つ */
      tap('KeyD'); pumpFor(CFG.LANE_T); tap('KeyD'); pumpFor(CFG.LANE_T);
      t.eq(DUO.state().runners.lumen.lane, 1, '右端まで移動できる');
      /* 空中では横に動けない。入力は着地の瞬間に1回だけ実行される（§4.2 改訂 2026-09-21） */
      tap('KeyW'); tap('KeyA'); pumpFor(CFG.LANE_T);
      const s2 = DUO.state();
      t.eq(s2.runners.lumen.lane, 1, '滞空中はレーンが変わらない');
      while (I().Game.runners[0].act === 'jump') DUO.pump(1 / 60);
      pumpFor(CFG.LANE_T);
      t.eq(DUO.state().runners.lumen.lane, 0, '着地の瞬間に1回だけ実行される');
      t.eq(s2.runners.lumen.act, 'jump', 'レーン移動でジャンプは中断されない');
    }
  });

  DUO.__suites.push({
    name: 'UMBRA は重力が逆（天井を走る）',
    quick: true,
    run(t) {
      const CFG = I().CFG;
      freshPlay();
      let s = DUO.state();
      t.eq(s.runners.umbra.surface, 'ceil', 'UMBRA は天井');
      t.near(s.runners.umbra.foot, CFG.H, 1e-6, '足元は天井 y=' + CFG.H);
      t.near(s.runners.umbra.box.y1, CFG.H, 1e-6, '体は天井から下へ伸びる');
      t.near(s.runners.umbra.box.y0, CFG.H - CFG.RUN_H, 1e-6, '頭の位置 = H - 身長');

      /* ↑ で「床に向かって」跳ぶ */
      tap('ArrowUp');
      pumpFor(CFG.JUMP_T / 2 - 1 / 60);
      s = DUO.state();
      t.eq(s.runners.umbra.act, 'jump', '↑ で UMBRA がジャンプ');
      t.near(s.runners.umbra.foot, CFG.H - CFG.JUMP_APEX, 0.04, '最高点は床に近づく（y=' + (CFG.H - CFG.JUMP_APEX).toFixed(2) + '）');
      t.ok(s.runners.lumen.act === 'run', '↑ は LUMEN に影響しない');
      pumpFor(CFG.JUMP_T);

      /* ←→ は画面基準（UMBRAの「→」も画面右） */
      tap('ArrowRight'); pumpFor(CFG.LANE_T);
      t.eq(DUO.state().runners.umbra.lane, 1, '→ で画面右へ（スクリーン基準）');
      t.eq(DUO.state().runners.lumen.lane, 0, 'LUMEN は動かない');
    }
  });

  DUO.__suites.push({
    name: '後段フェーズ用フック（鏡・世界反転・床天井の入れ替え）',
    quick: true,
    run(t) {
      const CFG = I().CFG, Game = I().Game;
      freshPlay();
      /* 鏡ゾーン: 左右反転 */
      Game.setMirror('lumen', true);
      tap('KeyD'); pumpFor(CFG.LANE_T);
      t.eq(DUO.state().runners.lumen.lane, -1, '鏡中は D で画面左へ');
      t.eq(DUO.state().runners.umbra.lane, 0, '反転は片方だけに効く');
      Game.setMirror('lumen', false);
      tap('KeyD'); pumpFor(CFG.LANE_T);
      t.eq(DUO.state().runners.lumen.lane, 0, '反転解除で元に戻る');

      /* 世界反転（P8a / 旧・入れ替えワープ）: 画面の下に見える UMBRA を左手（WASD）が担当。
         回転（0.5秒）が終わるまでは入力を受け付けない */
      Game.setWorldFlip(true);
      t.eq(DUO.state().worldFlip, true, 'worldFlip が状態として持てる');
      tap('KeyW');
      t.eq(DUO.state().runners.umbra.act === 'run' && DUO.state().runners.lumen.act === 'run', true,
           '回転中は W を受け付けない');
      pumpFor(CFG.HANDSWAP.ROLL_T);
      tap('KeyW');
      t.eq(DUO.state().runners.umbra.act, 'jump', '世界反転中は W で UMBRA（画面の下）が跳ぶ');
      t.eq(DUO.state().runners.lumen.act, 'run', 'LUMEN は跳ばない');
      t.eq(DUO.state().runners.umbra.hand, 'left', 'HUD 用の担当手も入れ替わる');
      Game.setWorldFlip(false);
      pumpFor(CFG.JUMP_T + CFG.HANDSWAP.ROLL_T);

      /* 重力反転ワープ: 床と天井が入れ替わる */
      Game.swapSurfaces();
      let s = DUO.state();
      t.eq(s.runners.lumen.surface, 'ceil', 'LUMEN が天井へ');
      t.eq(s.runners.umbra.surface, 'floor', 'UMBRA が床へ');
      t.near(s.runners.lumen.box.y1, CFG.H, 1e-6, '入れ替え後の当たり判定も面に追従する');
      Game.swapSurfaces();
      t.eq(DUO.state().runners.lumen.surface, 'floor', '再通過で元に戻る');

      /* チャンクの events スロットが存在する（P2以降のギミック用） */
      t.ok(Array.isArray(I().CHUNK_DEFS[0].events), 'チャンク定義に events がある');
      t.ok('setpiece' in I().makeStage('S0'), 'ステージ定義に setpiece スロットがある');
    }
  });

  DUO.__suites.push({
    name: '実イベント経路（window への KeyboardEvent）',
    quick: true,
    run(t) {
      freshPlay();
      const ev = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type, { code: code, key: key, bubbles: true, cancelable: true }));
      ev('keydown', 'ArrowDown', 'ArrowDown');
      DUO.pump(1 / 60);
      ev('keyup', 'ArrowDown', 'ArrowDown');
      t.eq(DUO.state().runners.umbra.act, 'slide', '実 KeyboardEvent（↓）でスライドする');
      ev('keydown', 'KeyA', 'a'); DUO.pump(1 / 60); ev('keyup', 'KeyA', 'a');
      t.eq(DUO.state().runners.lumen.lane, -1, '実 KeyboardEvent（A）でレーン移動する');
      /* 割り当てのないキーは無視 */
      ev('keydown', 'KeyZ', 'z'); DUO.pump(1 / 60); ev('keyup', 'KeyZ', 'z');
      t.eq(DUO.state().runners.lumen.lane, -1, '未割当のキーは無視される');
      /* e.code を出さない経路（仮想キーボード等）は e.key から補う */
      for (let i = 0; i < 40; i++) DUO.pump(1 / 60);
      ev('keydown', '', 'w'); DUO.pump(1 / 60); ev('keyup', '', 'w');
      t.eq(DUO.state().runners.lumen.act, 'jump', 'e.code が空でも e.key から補って動く');
      ev('keydown', '', 'ArrowRight'); for (let i = 0; i < 10; i++) DUO.pump(1 / 60); ev('keyup', '', 'ArrowRight');
      t.eq(DUO.state().runners.umbra.lane, 1, 'e.code が空の矢印キーも補える');
    }
  });
})();
