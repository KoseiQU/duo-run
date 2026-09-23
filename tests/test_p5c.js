/* ============================================================================
   tests/test_p5c.js — P5c（実機評の全ステージ適用）
     【P5c-1】ジャンプ障害物の視認性の骨格 … 契約 v2（2026-09-24）で失効（tests/test_p7a.js）
     【P5c-2】tip の猶予規則（契約§4.8）
       ・全ステージ×50シード: tip の窓内の必須動作＝対象のみ（1回以下）・先行 ≥ speed×2.5秒
       ・tip の出現率は P5c 前（92c80df）の −10% 以内
       ・実走: 表示は対象の通過で消える（時間では消えない）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ZONES = ['neon', 'ruins', 'sea', 'space', 'mirror', 'core'];

  /* 【P5c-1】ジャンプ障害物の視認性の骨格（支柱・警告バー・路面帯・▲）は契約 v2 で失効。
     共通デザインの検査は tests/test_p7a.js。 */

  /* ==========================================================================
     P5c-2: tip の猶予規則（契約§4.8）
     ========================================================================== */
  /* P5c 前（92c80df）の tip 数（50シード・ゴールより手前）。出現率はこの −10% 以内 */
  const TIP_BASE = { S1: 350, S3: 87, S4: 97, S5: 129, S6: 121, S7: 118, S8: 50 };
  DUO.__suites.push({
    name: 'P5c: tip の猶予規則（全ステージ×50シード・窓内は対象のみ・先行 speed×2.5秒・出現率）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG;
      t.eq(CFG.TIP.LEAD_T, 2.5, 'tip は対象の speed×2.5秒 手前');
      t.eq(CFG.TIP.AFTER_T, 1.0, '対象の通過後 speed×1.0秒 までが窓');
      Object.keys(TIP_BASE).forEach((sid) => {
        const st = In.makeStage(sid);
        let tips = 0, bad = 0, multi = 0, noTarget = 0, lead = Infinity;
        const firstErr = [];
        for (let seed = 1; seed <= 50; seed++) {
          const g = In.createGenerator(st, seed);
          for (let d = 0; d < st.lengthM; d += 20) g.ensure(d + CFG.SPAWN_AHEAD, d);
          const evs = g.events.filter((e) => e.type === 'tip' && e.at < st.lengthM);
          const list = g.obstacles.filter((o) => o.at <= st.lengthM + 60);
          const stt = {};
          const errs = In.Fair.tipCheck(list, evs, st.speedAt, { merges: g.merges }, stt);
          bad += errs.length;
          if (errs.length && firstErr.length < 2) firstErr.push('seed' + seed + ': ' + errs[0]);
          (stt.nTarget || []).forEach((n) => { if (n > 1) multi++; });
          evs.forEach((e) => {
            tips++;
            if (!e.params.target || !e.params.target.length) noTarget++;
            lead = Math.min(lead, (e.params.targetAt - e.at) / st.speedAt(e.params.targetAt));
          });
        }
        t.eq(bad, 0, sid + ': tip の窓内に対象以外の必須動作なし・先行 ≥ speed×2.5秒（50シード）' +
             (firstErr.length ? ' / ' + firstErr.join(' | ') : ''));
        t.eq(multi, 0, sid + ': 窓内の対象の必須動作は1回以下');
        t.eq(noTarget, 0, sid + ': どの tip も対象を持つ');
        if (tips) t.ok(lead >= CFG.TIP.LEAD_T - 1e-6, sid + ': 最短の先行 ' + lead.toFixed(2) + '秒 ≥ 2.5秒');
        t.ok(tips >= TIP_BASE[sid] * 0.9,
             sid + ': tip の出現 ' + tips + ' 回 / 50シード（P5c 前 ' + TIP_BASE[sid] + ' の −10% 以内）');
      });
    }
  });

  DUO.__suites.push({
    name: 'P5c: tip は対象の通過で消える（実走 S1・S5）・表示中の前方に他の障害物がない',
    quick: true,
    run(t) {
      const In = I(), Tut = In.Tutorial, CFG = In.CFG;
      const el = document.getElementById('tip');
      [['S1', 3], ['S5', 2]].forEach((sp) => {
        DUO.reset(); DUO.start(sp[0], sp[1]); DUO.bot('perfect');
        Game.gen.ensure(900, 0);
        const ev0 = Game.gen.events.filter((e) => e.type === 'tip')[0];
        if (!t.ok(!!ev0, sp[0] + ': tip がある')) return;
        if (ev0.at > 60) DUO.skipTo(ev0.at - 40);
        /* skipTo は譜面を作り直す（uid が変わる）ので、作り直した後の同じ tip を引き直す */
        Game.gen.ensure(ev0.at + 200, Game.dist);
        const ev = Game.gen.events.filter((e) => e.type === 'tip' && e.params.id === ev0.params.id)[0];
        let on = null, off = null, guard = 0, ahead = 0;
        while (guard++ < 20000 && Game.status === 'playing') {
          DUO.__step(1 / 60);
          if (Tut.current && on === null) on = Game.dist;
          if (on !== null && Tut.current) {
            /* 表示中: 前方の障害物（対象以外・必須動作あり）が窓の中にない */
            const tg = {}; ev.params.target.forEach((u) => { tg[u] = 1; });
            Game.gen.obstacles.forEach((o) => {
              if (tg[o.uid] || o.at < Game.dist || o.at > ev.params.winEnd) return;
              if (In.Obstacles.demand(o, 'floor') !== 'none' || In.Obstacles.demand(o, 'ceil') !== 'none') ahead++;
            });
          }
          if (on !== null && !Tut.current) { off = Game.dist; break; }
        }
        t.ok(on !== null && Math.abs(on - ev.at) < 2, sp[0] + ': tip は予定の位置で出る（' + (on || 0).toFixed(1) + 'm / 予定 ' + ev.at.toFixed(1) + 'm）');
        t.ok((ev.params.targetAt - on) / Game.stage.speedAt(ev.params.targetAt) >= CFG.TIP.LEAD_T - 0.1,
             sp[0] + ': 対象の ' + ((ev.params.targetAt - on) / Game.stage.speedAt(ev.params.targetAt)).toFixed(2) + '秒 手前で出る');
        t.ok(off !== null && off >= ev.params.untilM && off <= ev.params.untilM + 2,
             sp[0] + ': 対象の通過で消える（' + (off || 0).toFixed(1) + 'm / 対象 ' + ev.params.untilM.toFixed(1) + 'm）');
        t.eq(ahead, 0, sp[0] + ': 表示中、窓の中に対象以外の必須動作が無い');
        t.eq(Game.status, 'playing', sp[0] + ': ボットは生きている');
      });
      t.eq(el.classList.contains('on'), false, '消えたあとは吹き出しが非表示');
      DUO.reset();
    }
  });
  /* S7 鏡へのカット（§4.4「鏡が主役」）: 実機の画面比（横持ち・縦持ち・iPad）で大鏡が 20% 以上。
     P5c-0 の前出し（3.2→5.6）だけでは横持ちで 11% だったので、カットで画角も絞る（fovAdd −13°） */
  DUO.__suites.push({
    name: 'P5c: S7 鏡へのカットで大鏡が画面の 20% 以上（812×375・375×812・1024×768）',
    quick: false,
    run(t) {
      const In = I(), Sp = In.Setpieces, W = In.World;
      [[812, 375], [375, 812], [1024, 768]].forEach((v) => {
        DUO.reset(); DUO.start('S7', 4); DUO.bot('perfect'); DUO.skipTo(1240);
        let g = 0;
        while (Game.dist < 1300 && g++ < 4000) DUO.__step(1 / 60);
        W.setViewport(v[0], v[1], 1);
        let best = 0, cov = 0;
        while ((Game.status === 'playing' || Game.status === 'goal') && g++ < 9000) {
          DUO.pump(1 / 60);
          const k = Sp.mirrorCutK(Game.dist);
          if (k > best) { best = k; cov = Sp.mirrorOnScreen(Game.dist); }
        }
        W.resize();
        t.ok(best > 0.95, v.join('×') + ': カットが山まで来る（' + best.toFixed(2) + '）');
        t.ok(cov >= 0.20, v.join('×') + ': カットの山で大鏡が画面の ' + (cov * 100).toFixed(1) + '%（20%以上）');
      });
      DUO.reset();
    }
  });
})();
