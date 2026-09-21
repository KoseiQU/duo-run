/* ============================================================================
   DUO RUN — bot.js  自動プレイヤー（§4.7 完走証明用）
   ・'perfect'  … 遅延なし
   ・'delay250' … 0.25秒前の世界を見て判断する（＝反応が0.25秒遅れる）
   ・障害物の寸法・安全動作は OBS / Fair から読む（人間より弱いボットで
     「クリア不能」と誤判定しないため、判断材料は実装の実寸そのもの）
   ・入力は Input キュー経由（人間と同じ経路）
   ============================================================================ */
'use strict';

const Bot = {
  /* 先読みの範囲にある、この面のキャラに効く障害物を「ウォール」に束ねる */
  wallsFor(game, surface) {
    const sp = game.speed;
    const mine = [];
    for (let i = 0; i < game.active.length; i++) {
      const o = game.active[i];
      if (!Obstacles.affects(o, surface)) continue;
      const rel = o.at - game.dist;
      if (rel <= 0.2 || rel > CFG.BOT.LOOKAHEAD) continue;
      mine.push(o);
    }
    mine.sort((a, b) => a.at - b.at);
    const walls = [];
    mine.forEach((o) => {
      const w = walls[walls.length - 1];
      if (w && (o.at - w.at) <= sp * CFG.FAIR.SIMUL) { w.items.push(o); }
      else walls.push({ at: o.at, atEnd: o.at, items: [o] });
    });
    return walls;
  },

  /* そのレーンで生き残れる動作（Fair.laneActs と同じ判断材料） */
  laneActs(wall, surface) { return Fair.laneActs(wall, surface); },

  /* 横移動を今出して安全か（＝真横を通過中の障害物に自分から突っ込まないか）。
     レーン補間 0.12秒ぶんの体の掃引を実寸の AABB で前進シミュレーションして確かめる。
     人間なら「すぐ横に柱があるので少し待ってから動く」ところを、機械的に判定する。 */
  moveIsSafe(game, r, targetLane) {
    if (targetLane === r.laneTo) return false;
    const sp = game.speed;
    const span = CFG.LANE_T + CFG.BOT.MOVE_MARGIN;   // 移動しきるまで＋余裕
    const N = CFG.BOT.MOVE_SAMPLES;
    /* 点で見ると「掠る一瞬」を飛ばすので、サンプル間を包む掃引ボックスで判定する */
    const at = (t) => {
      const p = U.smooth(Math.min(1, t / CFG.LANE_T));
      const a = Runners.actAfter(r, t);
      return {
        box: Runners.boxOf(r.surface, U.lerp(r.laneVal, targetLane, p), a.act, a.actT),
        d: game.dist + sp * t
      };
    };
    let prev = at(0);
    for (let i = 1; i <= N; i++) {
      const cur = at((i / N) * span);
      /* 2時点の体を包む。さらに z は、その間に障害物が相対的に流れる距離ぶん前後へ広げる
         （障害物の z は d の増加とともに +z 側へ動く。cur の一点だけ見ると掠る一瞬を落とす） */
      const dz = cur.d - prev.d;
      const hull = {
        x0: Math.min(prev.box.x0, cur.box.x0), x1: Math.max(prev.box.x1, cur.box.x1),
        y0: Math.min(prev.box.y0, cur.box.y0), y1: Math.max(prev.box.y1, cur.box.y1),
        z0: Math.min(prev.box.z0, cur.box.z0) - dz, z1: Math.max(prev.box.z1, cur.box.z1) + dz
      };
      for (let k = 0; k < game.active.length; k++) {
        const o = game.active[k];
        if (!Obstacles.affects(o, r.surface)) continue;
        if (Math.abs(o.at - cur.d) > 5) continue;
        if (Obstacles.hits(o, hull, cur.d)) return false;
      }
      prev = cur;
    }
    return true;
  },

  decideFor(game, r, delaySec) {
    const sp = game.speed;
    const walls = Bot.wallsFor(game, r.surface);
    if (!walls.length) return null;
    const w = walls[0];
    const acts = Bot.laneActs(w, r.surface);

    /* 1) レーンを決める（今の目標レーンが全滅なら、生存レーンのうち一番近い所へ） */
    let lane = r.laneTo;
    const ok = (l) => { const a = acts[l]; return a && (a.run || a.jump || a.slide); };
    if (!ok(lane)) {
      let best = null, bestCost = 1e9;
      CFG.LANES.forEach((l) => {
        if (!ok(l)) return;
        /* 次のウォールでも生き残れるレーンを優先（同コストなら移動量が小さい方） */
        let cost = Math.abs(l - r.laneTo);
        if (walls[1]) {
          const a2 = Fair.laneActs(walls[1], r.surface)[l];
          if (!(a2.run || a2.jump || a2.slide)) cost += 0.5;
        }
        if (cost < bestCost) { bestCost = cost; best = l; }
      });
      if (best !== null) lane = best;
    }

    /* 2) このフレームで出す入力 */
    if (lane !== r.laneTo) {
      /* **空中では横に動けない**（契約§4.2 改訂）。着地してから動く。
         §4.7 の「ジャンプ→レーン移動 0.92秒」があるので、待っても間に合う。 */
      if (r.act === 'jump') return null;
      const dir = (lane > r.laneTo) ? 1 : -1;
      const step = U.clamp(r.laneTo + dir, -1, 1);
      /* 真横を通過中の障害物へ自分から突っ込まない。危ないフレームは動かずに待つ
         （§4.7 の反応窓があるので、通過しきってから動いても次のウォールには間に合う） */
      if (!Bot.moveIsSafe(game, r, step)) return null;
      /* 鏡ゾーンで左右が反転していても「画面上どちらへ動きたいか」で指示を出す */
      return { act: (dir * (r.mirrored ? -1 : 1) > 0) ? 'right' : 'left' };
    }

    const a = acts[lane];
    if (a.run) return null;                       // そのまま走れば通れる

    /* このレーンを塞いでいる一番手前の障害物までの「見かけの距離」
       （動く／点滅する障害物は「到達時の占有」で見る＝契約§4.5） */
    let target = null;
    for (let i = 0; i < w.items.length; i++) {
      const o = w.items[i];
      if (Obstacles.affects(o, r.surface) && Obstacles.blocksLane(o, r.surface, lane)) { target = o; break; }
    }
    if (!target) return null;
    const perceived = (target.at - game.dist) + sp * delaySec;

    if (a.jump && r.act !== 'jump' && perceived <= sp * CFG.BOT.JUMP_LEAD) return { act: 'jump' };
    if (a.slide && r.act === 'run' && perceived <= sp * CFG.BOT.SLIDE_LEAD) return { act: 'slide' };
    return null;
  },

  update(game /*, dt */) {
    if (!game.botMode || game.status !== 'playing') return;
    const delay = (game.botMode === 'delay250') ? CFG.BOT.DELAY : 0;
    /* 自由飛行（大ジャンプ / 契約§4.5）: 「最も近い隙間の中心へ最大速度で移動」。
       人間と同じ入口（Input の自由飛行の目標）へ流す。 */
    if (FF.active()) {
      const a = FF.aim(game.dist, game.speed * delay);
      Input.freeAim(a.x, a.y, 'bot');
      return;
    }
    for (let i = 0; i < game.runners.length; i++) {
      const r = game.runners[i];
      const cmd = Bot.decideFor(game, r, delay);
      if (!cmd) continue;
      /* 人間と同じ入力経路に流す（担当の手から入れる） */
      const hand = game.handSwap ? (r.hand === 'left' ? 'right' : 'left') : r.hand;
      Input.push(hand, cmd.act);
    }
  }
};
