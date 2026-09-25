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
      /* 当たり判定を持たない目印（ゲート・粒子）はウォールではない（Fair.wallsAll と同じ扱い）。
         混ぜると「目印のウォール＝何もしなくてよい」を先に見て、その奥の2レーン封鎖
         （ワイド梁 / 契約§4.3 v2）への横移動が遅れる（P7a で実測: 無重力の粒子の直後の梁） */
      if (OBS[o.type].ghost) continue;
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
    /* 崩れる橋（契約§4.5 改訂 v2）: 崩落が続く間（C〜X）のウォールでは、そのレーンを塞ぐ。
       崩落点 C を通り過ぎた橋もここで拾う（Fair.coverWalls と同じ規則・同じ最悪値）。 */
    const longs = game.active.filter((o) => OBS[o.type].long && Obstacles.affects(o, surface) &&
                                          o.at + Obstacles.extent(o).fwd + 2 > game.dist);
    if (longs.length) Fair.coverWalls(walls, longs);
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
        box: Runners.boxOf(r.surface, U.lerp(r.laneVal, targetLane, p), a.act, a.actT, r.jumpT),
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
        if (!Obstacles.near(o, cur.d, 5)) continue;
        if (Obstacles.hits(o, hull, cur.d)) return false;
      }
      prev = cur;
    }
    return true;
  },

  /* そのレーンが（最悪値で）崩落中か・移動しきる前に崩落が始まるか（Fair.coverSpan と同じ区間） */
  pitAt(game, r, lane) {
    const pad = game.speed * (CFG.LANE_T + CFG.BOT.MOVE_MARGIN);
    for (let i = 0; i < game.active.length; i++) {
      const o = game.active[i];
      if (!OBS[o.type].long || o.lane !== lane || !Obstacles.affects(o, r.surface)) continue;
      const c = Fair.coverSpan(o);
      if (game.dist > c.from - pad && game.dist < c.to + CFG.BODY_D) return true;
    }
    return false;
  },

  /* 同時スイッチ（契約§4.5 / S4）: **完璧反応のボットは2人同時に踏める**。
     踏むのは任意（踏み損ねても迂回で生き残れる＝§4.7 は occ が最悪値で担保している）ので、
     「次のウォールより手前にパッドがあり、そこへ動いても危なくない」ときだけ寄せる。
     0.25秒遅延のボットは寄せない＝踏み損ねて迂回する道を通る。 */
  padAim(game, r, walls) {
    let best = null;
    for (let i = 0; i < game.active.length; i++) {
      const o = game.active[i];
      if (!OBS[o.type].pad || o.surface !== r.surface || !o.grp || o.grp.ok !== null) continue;
      if (o.grp[r.surface] !== null) continue;                 // もう踏んだ
      const rel = o.at - game.dist;
      if (rel < -game.speed * CFG.SYNC.PAD_T * 0.4 || rel > CFG.BOT.LOOKAHEAD) continue;
      if (!best || o.at < best.at) best = o;
    }
    if (!best || best.lane === r.laneTo) return null;
    /* パッドより手前に「動作を要求するウォール」があるなら、そちらが先 */
    for (let i = 0; i < walls.length; i++) {
      if (walls[i].at < best.at + game.speed * CFG.SYNC.PAD_T * 0.5) {
        const acts = Fair.laneActs(walls[i], r.surface);
        const a = acts[best.lane];
        if (!a || !a.run) return null;                         // パッドのレーンでは抜けられない
      }
    }
    if (r.act === 'jump') return null;
    const dir = (best.lane > r.laneTo) ? 1 : -1;
    const step = U.clamp(r.laneTo + dir, -1, 1);
    if (!Bot.moveIsSafe(game, r, step)) return null;
    if (Bot.pitAt(game, r, step)) return null;          // 崩落中の橋のレーンへは寄せない（P8b）
    return { act: (dir * (r.mirrored ? -1 : 1) > 0) ? 'right' : 'left' };
  },

  decideFor(game, r, delaySec) {
    const sp = game.speed;
    const walls = Bot.wallsFor(game, r.surface);
    if (!walls.length) return delaySec ? null : Bot.padAim(game, r, walls);
    const w = walls[0];
    const acts = Bot.laneActs(w, r.surface);

    /* 1) レーンを決める（今の目標レーンが全滅なら、生存レーンのうち一番近い所へ） */
    let lane = r.laneTo;
    const ok = (l) => { const a = acts[l]; return a && (a.run || a.jump); };
    if (!ok(lane)) {
      let best = null, bestCost = 1e9;
      CFG.LANES.forEach((l) => {
        if (!ok(l)) return;
        /* 次のウォールでも生き残れるレーンを優先（同コストなら移動量が小さい方） */
        let cost = Math.abs(l - r.laneTo);
        if (walls[1]) {
          const a2 = Fair.laneActs(walls[1], r.surface)[l];
          if (!(a2.run || a2.jump)) cost += 0.5;
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
      /* 崩れる橋（P8b）: 崩落の手前〜橋の終わり（C − 移動の秒 〜 X）のレーンへは横から入らない
         （入った先が穴。エンドレスの札は橋の直後に別のレーンを要求することがある）。終わってから動く */
      if (Bot.pitAt(game, r, step)) return null;
      /* 鏡ゾーンで左右が反転していても「画面上どちらへ動きたいか」で指示を出す */
      return { act: (dir * (r.mirrored ? -1 : 1) > 0) ? 'right' : 'left' };
    }

    const a = acts[lane];
    /* そのまま走れば通れる ＝ 手が空いているので、同時スイッチのパッドへ寄せてよい */
    if (a.run) return delaySec ? null : Bot.padAim(game, r, walls);

    /* このレーンを塞いでいる一番手前の障害物までの「見かけの距離」
       （動く／点滅する障害物は「到達時の占有」で見る＝契約§4.5） */
    let target = null;
    for (let i = 0; i < w.items.length; i++) {
      const o = w.items[i];
      if (Obstacles.affects(o, r.surface) && Obstacles.blocksLane(o, r.surface, lane)) { target = o; break; }
    }
    if (!target) return null;
    const perceived = (target.at - game.dist) + sp * delaySec;

    /* 無重力区間（契約§4.5 / S6）では滞空が伸びるので、踏切も同じ倍率だけ早める。
       ＝ 通過の瞬間の姿勢（位相）が通常と同じになり、占有（occ）の表と一致する。
       ■ 倍率は **踏み切る場所（＝今いる場所）** で見る。滞空はそこで決まるので
         （Runners.input が Zero.cur を焼き付ける）、目標地点の倍率で早めると
         区間の境目で「早すぎる踏切」になって落ちる（2026-09-22 P4b で実測）。 */
    const zk = (typeof Zero !== 'undefined' && game.gen) ? Zero.kAt(game.gen.zeros, game.dist) : 1;
    if (a.jump && r.act !== 'jump' && perceived <= sp * CFG.BOT.JUMP_LEAD * zk) return { act: 'jump' };
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
    /* 合体区間（契約§4.5 / S8）: 動かす体は1つ（床を走っている方）だけ。
       出す入力も人間と同じ経路＝ 移動は左手・ジャンプは右手（§4.5 の割当）。 */
    if (game.merged) {
      const r = game.mergeLead();
      const cmd = Bot.decideFor(game, r, delay);
      if (cmd) {
        const hand = (cmd.act === 'left' || cmd.act === 'right') ? 'left' : 'right';
        const h = game.flipHand(hand, cmd.act);
        Input.push(h.hand, h.act);
      }
      return;
    }
    /* 世界反転の回転中（0.5秒）は入力が捨てられる（人間と同じ）。出さずに待つ */
    if (game.rollT > 0) return;
    for (let i = 0; i < game.runners.length; i++) {
      const r = game.runners[i];
      const cmd = Bot.decideFor(game, r, delay);
      if (!cmd) continue;
      /* 人間と同じ入力経路に流す（担当の手から入れる）。cmd は世界基準（レーンの ± と鏡の反転込み）なので、
         世界反転中は画面基準へ 180° 回して出す（左手＝画面の下のキャラ・A/D＝画面の左右 / Game.flipHand） */
      const h = game.flipHand(r.hand, cmd.act);
      Input.push(h.hand, h.act);
    }
  }
};
