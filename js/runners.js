/* ============================================================================
   DUO RUN — runners.js  2体（LUMEN=床 / UMBRA=天井）の状態と当たり判定ボックス
   ・「どちらの手が担当か」は Game.handSwap（入れ替えワープのフック / §4.5）
   ・「左右が反転しているか」は runner.mirrored（鏡ゾーンのフック / §4.5）
   ・「床／天井どちらを走るか」は runner.surface（重力反転ワープのフック / §4.5）
   ============================================================================ */
'use strict';

const Runners = {
  create(id, surface, hand) {
    const r = {
      id: id,                    // 'lumen' | 'umbra'
      hand: hand,                // 既定の担当手 'left' | 'right'
      surface: surface,          // 'floor' | 'ceil'
      mirrored: false,           // 左右反転中か（鏡ゾーン）
      laneFrom: 0, laneTo: 0, laneVal: 0, laneT: CFG.LANE_T,
      act: 'run', actT: 0,       // 'run' | 'jump' | 'slide'
      /* 踏み切った瞬間の滞空時間（秒）。無重力区間（§4.5 / S6）では 1.5倍になる。
         **高さは変えない**ので、通過の瞬間の姿勢（位相 = 経過/滞空）は通常と同じ。
         ＝ 判定（occ）の表は書き換わらず、変わるのは「時間」だけ。 */
      jumpT: CFG.JUMP_T,
      laneBuf: 0,                // 空中で入った横入力（着地の瞬間に1回だけ実行 / §4.2）
      alive: true,
      view: null
    };
    return r;
  },

  reset(r, surface) {
    if (surface) r.surface = surface;
    r.mirrored = false;
    r.laneFrom = 0; r.laneTo = 0; r.laneVal = 0; r.laneT = CFG.LANE_T;
    r.act = 'run'; r.actT = 0; r.laneBuf = 0; r.alive = true;
    r.jumpT = CFG.JUMP_T;
  },

  /* 1動作ぶんの入力（keydownのエッジ／フリック1回ぶん） */
  input(r, act) {
    if (!r.alive) return false;
    if (act === 'left' || act === 'right') {
      let dir = (act === 'right') ? 1 : -1;
      if (r.mirrored) dir = -dir;                 // 鏡ゾーン
      /* **ジャンプ中は横に動けない**（契約§4.2 改訂／斜め飛びをなくす）。
         入力は捨てずに1個だけ覚えておき、着地の瞬間に実行する。 */
      if (r.act === 'jump') { r.laneBuf = dir; return false; }
      const target = U.clamp(r.laneTo + dir, -1, 1);
      if (target === r.laneTo && r.laneT >= CFG.LANE_T) return false;
      r.laneFrom = r.laneVal; r.laneTo = target; r.laneT = 0;
      return true;
    }
    if (act === 'jump') {
      if (r.act === 'jump') return false;          // 空中ジャンプ不可
      r.act = 'jump'; r.actT = 0;                  // スライド中のジャンプは可（キャンセル）
      /* 滞空時間は **踏み切った場所** で決まる（無重力区間なら 1.5倍 / 契約§4.5）。
         Zero.cur は Game.step が毎フレーム現在地から更新する唯一の出所。 */
      r.jumpT = CFG.JUMP_T * ((typeof Zero !== 'undefined') ? Zero.cur : 1);
      r.laneBuf = 0;                               // 踏切の瞬間に古いバッファは捨てる
      return true;                                 // 補間中のジャンプは可（補間はそのまま続く）
    }
    if (act === 'slide') {
      if (r.act !== 'run') return false;           // 空中スライド不可
      r.act = 'slide'; r.actT = 0;
      return true;
    }
    return false;
  },

  /* 海流ベルトに流される（契約§4.5 / S5）。プレイヤーの入力ではないので
     「1スワイプ1レーン」「空中横移動禁止」の制限は掛からない（水に流されるので、
     跳んでいても押される）。鏡ゾーンの反転も掛けない（流れは画面基準）。
     ＝ 押された結果は必ず「隣のレーンへ 0.12秒で移る」だけなので、
        Fair（不変条件）とボットは Current.driftBetween で同じ結果を予測できる。 */
  push(r, dir) {
    if (!r.alive || !dir) return false;
    const target = U.clamp(r.laneTo + dir, -1, 1);
    if (target === r.laneTo) return false;               // すでに端＝これ以上は流されない
    r.laneFrom = r.laneVal; r.laneTo = target; r.laneT = 0;
    return true;
  },

  update(r, dt) {
    /* レーン補間（0.12秒） */
    if (r.laneT < CFG.LANE_T) {
      r.laneT = Math.min(CFG.LANE_T, r.laneT + dt);
      r.laneVal = U.lerp(r.laneFrom, r.laneTo, U.smooth(r.laneT / CFG.LANE_T));
    } else {
      r.laneVal = r.laneTo;
    }
    /* 動作タイマー */
    if (r.act !== 'run') {
      const wasJump = (r.act === 'jump');
      r.actT += dt;
      const dur = wasJump ? (r.jumpT || CFG.JUMP_T) : CFG.SLIDE_T;
      if (r.actT >= dur) {
        r.act = 'run'; r.actT = 0;
        /* 着地の瞬間に、空中で入っていた横入力を1回だけ実行する（§4.2） */
        if (wasJump && r.laneBuf) {
          const target = U.clamp(r.laneTo + r.laneBuf, -1, 1);
          if (target !== r.laneTo) { r.laneFrom = r.laneVal; r.laneTo = target; r.laneT = 0; }
          r.laneBuf = 0;
        }
      }
    }
  },

  /* 面からの足元の浮き（ジャンプの軌道）。天井側は「床へ向かって」離れる */
  footOffset(r) {
    if (r.act !== 'jump') return 0;
    const u = U.clamp(r.actT / (r.jumpT || CFG.JUMP_T), 0, 1);
    return CFG.JUMP_APEX * Math.pow(Math.sin(Math.PI * u), CFG.JUMP_SHAPE);
  },
  height(r) { return r.act === 'slide' ? CFG.SLIDE_H : CFG.RUN_H; },
  x(r) { return r.laneVal * CFG.LANE_W; },

  /* 当たり判定ボックス（絶対座標。2体は常に z=0）
     ── 実物も「未来の予測」も必ずこの1か所を通す（ボットが実寸で判断するため） */
  /* jumpT を省くと通常の滞空（CFG.JUMP_T）で測る。占有（occ）の probe は
     **位相**で測っているので、無重力でも同じ表になる（時間だけが伸びる）。 */
  boxOf(surface, laneVal, act, actT, jumpT) {
    const off = (act === 'jump')
      ? CFG.JUMP_APEX * Math.pow(Math.sin(Math.PI * U.clamp(actT / (jumpT || CFG.JUMP_T), 0, 1)), CFG.JUMP_SHAPE)
      : 0;
    const h = (act === 'slide') ? CFG.SLIDE_H : CFG.RUN_H;
    const d = (act === 'slide') ? CFG.SLIDE_D : CFG.BODY_D;   // 倒れ込むぶん前後に伸びる
    const x = laneVal * CFG.LANE_W;
    let y0, y1;
    if (surface === 'floor') { y0 = off; y1 = off + h; }
    else { y1 = CFG.H - off; y0 = CFG.H - off - h; }
    return {
      x0: x - CFG.BODY_W / 2, x1: x + CFG.BODY_W / 2,
      y0: y0, y1: y1,
      z0: -d / 2, z1: d / 2
    };
  },
  box(r) { return Runners.boxOf(r.surface, r.laneVal, r.act, r.actT, r.jumpT); },

  /* t秒後の動作状態（入力がなければどうなるか）。ボットの予測に使う */
  actAfter(r, t) {
    if (r.act === 'run') return { act: 'run', actT: 0 };
    const dur = (r.act === 'jump') ? (r.jumpT || CFG.JUMP_T) : CFG.SLIDE_T;
    const tt = r.actT + t;
    return (tt >= dur) ? { act: 'run', actT: 0 } : { act: r.act, actT: tt };
  },

  /* 見た目まわりで使う「足元の y」 */
  footY(r) {
    const off = Runners.footOffset(r);
    return r.surface === 'floor' ? off : CFG.H - off;
  }
};
