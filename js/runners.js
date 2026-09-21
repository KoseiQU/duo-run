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
      alive: true,
      view: null
    };
    return r;
  },

  reset(r, surface) {
    if (surface) r.surface = surface;
    r.mirrored = false;
    r.laneFrom = 0; r.laneTo = 0; r.laneVal = 0; r.laneT = CFG.LANE_T;
    r.act = 'run'; r.actT = 0; r.alive = true;
  },

  /* 1動作ぶんの入力（keydownのエッジ／フリック1回ぶん） */
  input(r, act) {
    if (!r.alive) return false;
    if (act === 'left' || act === 'right') {
      let dir = (act === 'right') ? 1 : -1;
      if (r.mirrored) dir = -dir;                 // 鏡ゾーン
      const target = U.clamp(r.laneTo + dir, -1, 1);
      if (target === r.laneTo && r.laneT >= CFG.LANE_T) return false;
      r.laneFrom = r.laneVal; r.laneTo = target; r.laneT = 0;
      return true;
    }
    if (act === 'jump') {
      if (r.act === 'jump') return false;          // 空中ジャンプ不可
      r.act = 'jump'; r.actT = 0;                  // スライド中のジャンプは可（キャンセル）
      return true;
    }
    if (act === 'slide') {
      if (r.act !== 'run') return false;           // 空中スライド不可
      r.act = 'slide'; r.actT = 0;
      return true;
    }
    return false;
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
      r.actT += dt;
      const dur = (r.act === 'jump') ? CFG.JUMP_T : CFG.SLIDE_T;
      if (r.actT >= dur) { r.act = 'run'; r.actT = 0; }
    }
  },

  /* 面からの足元の浮き（ジャンプの軌道）。天井側は「床へ向かって」離れる */
  footOffset(r) {
    if (r.act !== 'jump') return 0;
    const u = U.clamp(r.actT / CFG.JUMP_T, 0, 1);
    return CFG.JUMP_APEX * Math.pow(Math.sin(Math.PI * u), CFG.JUMP_SHAPE);
  },
  height(r) { return r.act === 'slide' ? CFG.SLIDE_H : CFG.RUN_H; },
  x(r) { return r.laneVal * CFG.LANE_W; },

  /* 当たり判定ボックス（絶対座標。2体は常に z=0） */
  box(r) {
    const off = Runners.footOffset(r);
    const h = Runners.height(r);
    const x = Runners.x(r);
    let y0, y1;
    if (r.surface === 'floor') { y0 = off; y1 = off + h; }
    else { y1 = CFG.H - off; y0 = CFG.H - off - h; }
    return {
      x0: x - CFG.BODY_W / 2, x1: x + CFG.BODY_W / 2,
      y0: y0, y1: y1,
      z0: -CFG.BODY_D / 2, z1: CFG.BODY_D / 2
    };
  },

  /* 見た目まわりで使う「足元の y」 */
  footY(r) {
    const off = Runners.footOffset(r);
    return r.surface === 'floor' ? off : CFG.H - off;
  }
};
