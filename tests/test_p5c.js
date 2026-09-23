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
  /* 契約 v2（P7a）: S1 の「穴」の紹介・S4 の落ちる天井・S5 の3ギミックは失効（tip ごと無い） */
  /* 契約§4.8【2026-09-24 改訂】（P7a）で窓が長くなった（2.5秒 → 4.0秒前＋2.0秒で消える）。
     【P7c 7ステージ】ID は新番号。S1＝チュートリアル（6項目×50）、S3＝旧S3+S4（87+46）、
     S4＝深海（P7b のサメ・泡の噴出口 2種×50 の −10%）、S5＝旧S6、S6＝旧S7（重ね掛けを 800m 以降に
     強制して P7a 前の 118 へ回収）、S7＝旧S8。S2（ネオン）は新ギミックの tip を持たない（S1 で説明済み）。 */
  const TIP_BASE = { S1: 300, S3: 133, S4: 90, S5: 121, S6: 118, S7: 50 };
  DUO.__suites.push({
    name: 'P5c→P7a: tip の猶予規則 v2（全ステージ×50シード・4.0秒前に出て2.0秒で消え、消えてから2.0秒・窓内は対象のみ・出現率）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG;
      t.eq(CFG.TIP.LEAD_T, 4.0, 'tip は対象の speed×4.0秒 手前（契約§4.8 2026-09-24）');
      t.eq(CFG.TIP.SHOW_T, 2.0, 'tip は 2.0秒で消える');
      t.eq(CFG.TIP.AFTER_T, 1.0, '対象の通過後 speed×1.0秒 までが窓');
      Object.keys(TIP_BASE).forEach((sid) => {
        const st = In.makeStage(sid);
        let tips = 0, bad = 0, multi = 0, noTarget = 0, lead = Infinity, gapAfter = Infinity, showT = 0;
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
            gapAfter = Math.min(gapAfter, (e.params.targetAt - e.params.hideM) / st.speedAt(e.params.targetAt));
            showT = Math.max(showT, (e.params.hideM - e.at) / st.speedAt(e.at));
          });
        }
        t.eq(bad, 0, sid + ': tip の窓内に対象以外の必須動作なし・先行 ≥ speed×4.0秒・消えてから ≥ 2.0秒（50シード）' +
             (firstErr.length ? ' / ' + firstErr.join(' | ') : ''));
        t.eq(multi, 0, sid + ': 窓内の対象の必須動作は1回以下');
        t.eq(noTarget, 0, sid + ': どの tip も対象を持つ');
        if (tips) {
          t.ok(lead >= CFG.TIP.LEAD_T - 0.02, sid + ': 最短の先行 ' + lead.toFixed(2) + '秒 ≥ 4.0秒');
          t.ok(showT <= CFG.TIP.SHOW_T + 0.02, sid + ': 表示は ' + showT.toFixed(2) + '秒 ≤ 2.0秒');
          t.ok(gapAfter >= CFG.TIP.LEAD_T - CFG.TIP.SHOW_T - 0.03, sid + ': 消えてから対象まで最短 ' + gapAfter.toFixed(2) + '秒 ≥ 2.0秒');
        }
        t.ok(tips >= TIP_BASE[sid] * 0.9,
             sid + ': tip の出現 ' + tips + ' 回 / 50シード（基準 ' + TIP_BASE[sid] + ' の −10% 以内）');
      });
    }
  });

  DUO.__suites.push({
    name: 'P5c→P7a: tip は 2.0秒で消え、消えてから対象まで 2.0秒以上（実走 S1・S5）・窓の中に他の障害物がない',
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
        const sp2 = Game.stage.speedAt(ev.at);
        t.ok(off !== null && Math.abs((off - on) / sp2 - CFG.TIP.SHOW_T) < 0.1,
             sp[0] + ': 2.0秒で消える（表示 ' + (((off || 0) - (on || 0)) / sp2).toFixed(2) + '秒）');
        t.ok(off !== null && (ev.params.targetAt - off) / Game.stage.speedAt(ev.params.targetAt) >= CFG.TIP.LEAD_T - CFG.TIP.SHOW_T - 0.1,
             sp[0] + ': 消えてから対象まで ' + ((ev.params.targetAt - (off || 0)) / Game.stage.speedAt(ev.params.targetAt)).toFixed(2) + '秒（≥ 2.0秒）');
        /* 消えたあと対象の通過（＋1.0秒）までも、窓の中に他の必須動作が来ない */
        while (guard++ < 20000 && Game.status === 'playing' && Game.dist < ev.params.winEnd) {
          DUO.__step(1 / 60);
          const tg = {}; ev.params.target.forEach((u) => { tg[u] = 1; });
          Game.gen.obstacles.forEach((o) => {
            if (tg[o.uid] || o.at < Game.dist || o.at > ev.params.winEnd) return;
            if (In.Obstacles.demand(o, 'floor') !== 'none' || In.Obstacles.demand(o, 'ceil') !== 'none') ahead++;
          });
        }
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
    name: 'P5c: S6 鏡へのカットで大鏡が画面の 20% 以上（812×375・375×812・1024×768）',
    quick: false,
    run(t) {
      const In = I(), Sp = In.Setpieces, W = In.World;
      [[812, 375], [375, 812], [1024, 768]].forEach((v) => {
        DUO.reset(); DUO.start('S6', 4); DUO.bot('perfect'); DUO.skipTo(1340);
        let g = 0;
        while (Game.dist < 1400 && g++ < 4000) DUO.__step(1 / 60);
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
