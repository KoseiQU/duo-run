/* ============================================================================
   tests/test_p5c.js — P5c（実機評の全ステージ適用）
     【P5c-1】ジャンプ障害物（ローバー／ローレーザー）の視認性の骨格（契約§4.3）
       ・全6ゾーンで: 支柱 1.6m（x=±0.55・判定外）・警告バー・路面の警告帯 4m・「▲」アイコン
       ・骨格は userData.deco（判定の外）／判定 OBS は不変
       ・床＝琥珀／天井＝藍、明滅、▲は近づくと縮めて消す、バーは通過直前に畳む
       ・横に避ける障害物は警告枠（全高）＋縞
     ※ 40m 先の投影高さ・輝度差は描画の計測（_audit/p5c/measure.js）で監査する。
     【P5c-2】tip の猶予規則（契約§4.8）
       ・全ステージ×50シード: tip の窓内の必須動作＝対象のみ（1回以下）・先行 ≥ speed×2.5秒
       ・tip の出現率は P5c 前（92c80df）の −10% 以内
       ・実走: 表示は対象の通過で消える（時間では消えない）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ZONES = ['neon', 'ruins', 'sea', 'space', 'mirror', 'core'];

  DUO.__suites.push({
    name: 'P5c: ジャンプ障害物の視認性の骨格（全6ゾーン・判定外・色・明滅・▲・バー畳み）',
    quick: true,
    run(t) {
      const In = I(), Zs = In.Zones, OBS = In.OBS;
      t.eq(OBS.ROVER.y1, 0.60, 'ローバーの判定高さは 0.6 のまま');
      t.eq(OBS.LASER_LOW.y1, 0.60, 'ローレーザーの判定高さは 0.6 のまま');
      ZONES.forEach((zn) => {
        Zs.switchTo(zn);
        DUO.pump(1 / 60);
        ['ROVER', 'LASER_LOW'].forEach((ty) => {
          const o = In.Obstacles.make(ty, 'floor', 0, 30, 0);
          const v = In.Obstacles.acquire(ty, In.Obstacles.variantOf(o));
          o.view = v;
          const wr = v.userData.warnRig;
          if (!t.ok(!!wr && !!wr.icon && !!wr.bar, zn + '/' + ty + ': 骨格（警告バー・▲）がある')) { In.Obstacles.release(ty, v); return; }
          v.position.set(0, 0, 0); v.rotation.set(0, 0, 0); v.updateMatrixWorld(true);
          /* 判定外の装飾の外接箱（支柱の高さ・位置・路面帯の長さ） */
          const bd = new THREE.Box3(); bd.makeEmpty();
          v.traverse((q) => { if (q.isMesh && q.userData.deco && q !== wr.icon) bd.expandByObject(q); });
          t.near(bd.max.y, 1.67 + 0.075, 0.03, zn + '/' + ty + ': 支柱＋上端の灯の高さ（支柱 1.6m）');
          t.ok(bd.max.z >= 4.0, zn + '/' + ty + ': 手前の路面に警告帯（4m）: ' + (bd.max.z).toFixed(2));
          t.ok(Math.abs(bd.max.x - 0.55 - 0.085 - 0.04) < 0.08, zn + '/' + ty + ': 支柱はレーン端 x=±0.55: ' + bd.max.x.toFixed(2));
          /* 判定の外: 見た目の外接箱（装飾を除く）は判定の高さ付近に収まる */
          const vb = In.viewBox(v);
          t.ok(vb.max.y < 1.0, zn + '/' + ty + ': 装飾を除いた見た目は低い（' + vb.max.y.toFixed(2) + 'm）＝支柱は判定外');
          /* 色（床=琥珀／天井=藍）・明滅・▲・バー */
          const T = [];
          for (let k = 0; k < 40; k++) {
            In.Obstacles.place(o, 0, k * 0.05);
            T.push(wr.mat.color.getHex());
          }
          const uniq = T.filter((c, i) => T.indexOf(c) === i);
          t.ok(uniq.length === 2, zn + '/' + ty + ': 警告バーが明滅する（2段）');
          const c0 = new THREE.Color(0xffcf6a);
          t.ok(uniq.some((c) => c === c0.getHex()), zn + '/' + ty + ': 床は琥珀');
          o.surface = 'ceil';
          In.Obstacles.place(o, 0, 0.0);
          const cc = new THREE.Color(wr.mat.color.getHex());
          t.ok(cc.b > cc.r, zn + '/' + ty + ': 天井は藍');
          o.surface = 'floor';
          In.Obstacles.place(o, 30 - 40, 0);                           // 40m 先
          t.ok(wr.icon.visible && wr.icon.scale.x > 0.99 && wr.bar.scale.y > 0.99, zn + '/' + ty + ': 40m 先で▲とバーが出ている');
          In.Obstacles.place(o, 30 - 5, 0);                            // 5m 先
          t.ok(!wr.icon.visible, zn + '/' + ty + ': 5m 先で▲は消えている（相方の跳躍帯に居座らない）');
          In.Obstacles.place(o, 30 - 1.5, 0);                          // 通過直前
          t.ok(!wr.bar.visible, zn + '/' + ty + ': 通過直前にバーを畳む（跳んだ体が貫通して見えない）');
          o.view = null;
          In.Obstacles.release(ty, v);
        });
        /* 横に避ける障害物の警告枠（全高） */
        ['PILLAR', 'WIDEBAR', 'WALLHOLE', 'LASER_V'].forEach((ty) => {
          const o = In.Obstacles.make(ty, 'floor', 0, 30, 0);
          const v = In.Obstacles.acquire(ty, In.Obstacles.variantOf(o));
          let glow = 0;
          v.traverse((q) => { if (q.isMesh && q.material && q.material.fog === false && !q.userData.deco) glow++; });
          t.ok(glow >= 1, zn + '/' + ty + ': 霧なしの警告枠がある');
          In.Obstacles.release(ty, v);
        });
      });
      Zs.switchTo('neon');
      DUO.pump(1 / 60);
    }
  });
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
