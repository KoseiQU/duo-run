/* ============================================================================
   tests/test_p6.js — P6: エンドレスのゾーン切替・ミニ大演出（契約 §4.4 / §4.7 / §6 P6）
   ・ゾーンは クリア済みのものだけ（UI._testLock 中は本来の規則）。検証では cleared を一時的に書き換え、
     最後に必ず localStorage を戻す。
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ALL = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
  /* cleared を一時的に差し替えて fn を実行（必ず戻す） */
  function withCleared(list, fn) {
    const U = I().U;
    const snap = U.lsSnapshot();
    try { U.lsSet('cleared', list); return fn(); }
    finally { U.lsRestore(snap); }
  }
  const OPT = (g) => ({ startLanes: [0], reactBoth: g.reactBoth, currents: g.currents, zeros: g.zeros,
                        warps: g.warps, mirrors: g.mirrors, swaps: g.swaps, merges: g.merges });

  /* ==========================================================================
     1. クリア済みゾーンだけが順番に回る（UNLOCK_ALL=false の規則）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: エンドレスのゾーンはクリア済みだけ（順 neon→ruins→sea→space→mirror→core）',
    quick: true,
    run(t) {
      const In = I(), E = In.Endless;
      t.eq(In.UI._testLock, true, 'テスト中は本来の解放規則（UI._testLock）');
      t.eq(E.plan([]).zones.join(','), 'neon', '未クリアならネオン都市だけ');
      t.eq(E.plan(['S1', 'S2', 'S3']).zones.join(','), 'neon,ruins', 'S3 クリアで遺跡が加わる');
      t.eq(E.plan(['S1', 'S2', 'S3', 'S4', 'S5']).zones.join(','), 'neon,ruins,sea', 'S5 クリアで深海');
      t.eq(E.plan(ALL).zones.join(','), 'neon,ruins,sea,space,mirror,core', '全クリアで6ゾーン（契約の順）');
      t.eq(E.plan(['S6']).zones.join(','), 'neon,space', '飛び地のクリアでも順は保つ');
      const core = E.plan(ALL).pools.core.pool;
      t.eq(core.filter((id) => (In.CHUNK_DEFS.filter((c) => c.id === id)[0] || {}).merge).length, 0,
           'コアの顔ぶれに合体区間は入れない');
      /* クリア状況を読んで生成器が組む */
      withCleared([], () => {
        const g = In.createGenerator(In.makeStage('endless'), 3);
        g.ensure(3500, 0);
        t.eq(g.switches.length, 0, '1ゾーンだけなら切替は無い（通路も出さない）');
        t.ok(g.minis.length >= 2, '1ゾーンでもミニ大演出は 1500m ごとに入る（' + g.minis.length + '）');
      });
      withCleared(['S1', 'S2', 'S3', 'S4'], () => {
        const g = In.createGenerator(In.makeStage('endless'), 3);
        g.ensure(4200, 0);
        t.eq(g.switches.map((s) => s.to).join(','), 'ruins,neon,ruins,neon', '2ゾーンなら交互にループ');
      });
      /* 開発中の全解放（UNLOCK_ALL）は全ゾーン */
      In.UI._testLock = false;
      const all = (In.UI.UNLOCK_ALL) ? E.clearedList() : ALL;
      In.UI._testLock = true;
      t.eq(E.plan(all).zones.length, 6, 'UNLOCK_ALL の間は全ゾーンを回す');
    }
  });

  /* ==========================================================================
     2. 切替の位置・猶予・ゲート型ギミックとの重なり・§4.7（seed 1〜10）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: ゾーン切替の位置と前後の猶予（speed×1.0秒 障害物なし）・§4.7（seed 1〜10 × 7500m）',
    quick: true,
    run(t) {
      const In = I(), E = In.Endless, CFG = In.CFG;
      withCleared(ALL, () => {
        const st = In.makeStage('endless');
        let bad = [], nSw = 0, nMini = 0, maxDelay = 0;
        const kinds = {};
        for (let seed = 1; seed <= 10; seed++) {
          const g = In.createGenerator(st, seed);
          g.ensure(7500, 0);
          const sw = g.switches;
          nSw += sw.length;
          /* 順番 */
          sw.forEach((s, i) => {
            const want = E.ORDER[(i + 1) % 6], from = E.ORDER[i % 6];
            if (s.to !== want || s.from !== from) bad.push('seed' + seed + ' 順 ' + s.from + '>' + s.to);
            /* 位置: 1000m の倍数（前のチャンクが食い込んだときだけ遅れる） */
            const nominal = (i + 1) * E.SWITCH_M;
            if (s.at < nominal - 1e-6) bad.push('seed' + seed + ' 切替が早い @' + s.at.toFixed(1));
            maxDelay = Math.max(maxDelay, s.at - nominal);
            if (Math.abs((s.at - s.t0) - E.TUNNEL_M) > 1e-6) bad.push('seed' + seed + ' 通路の長さ');
            /* 前後 speed×1.0秒 は障害物なし（通路の中も） */
            const a = s.t0 - st.speedAt(s.t0) * E.GRACE_T, b = s.at + st.speedAt(s.at) * E.GRACE_T;
            const inside = g.obstacles.filter((o) => o.at > a + 1e-6 && o.at < b - 1e-6);
            if (inside.length) bad.push('seed' + seed + ' 猶予内に障害物 ' + inside[0].type + '@' + inside[0].at.toFixed(1));
            /* ゲート型ギミックの区間の途中で切り替えない */
            ['currents', 'zeros', 'warps', 'mirrors', 'swaps', 'merges'].forEach((k) => {
              g[k].forEach((r) => {
                if (r.from < b && r.to > a) bad.push('seed' + seed + ' ' + k + ' の区間が切替に重なる @' + r.from.toFixed(0));
              });
            });
            g.syncs.forEach((gr) => {
              if (gr.padAt < b && gr.gapAt > a) bad.push('seed' + seed + ' 同時スイッチが切替に重なる');
            });
            /* 実際の差し替えは通路の奥（ゲートの手前）＝ 前方は光の膜 */
            if (!(s.swapAt > s.t0 + CFG.CAM.Z && s.swapAt < s.at)) bad.push('seed' + seed + ' 差し替え位置 ' + s.swapAt);
          });
          if (sw.length < 7) bad.push('seed' + seed + ' 7500m で切替 ' + sw.length + ' 回');
          /* ミニ大演出 */
          g.minis.forEach((m, i) => {
            nMini++;
            kinds[m.id] = (kinds[m.id] || 0) + 1;
            const nominal = (i + 1) * E.MINI_M;
            if (m.startM < nominal - 1e-6) bad.push('seed' + seed + ' ミニが早い ' + m.startM.toFixed(0));
            const len = (m.endM - m.startM) / m.k;
            if (len < 100 || len > 150) bad.push('seed' + seed + ' ミニの長さ ' + len.toFixed(0));
            sw.forEach((s) => {
              const a = s.t0 - st.speedAt(s.t0) * E.GRACE_T, b = s.at + st.speedAt(s.at) * E.GRACE_T;
              if (m.startM < b && m.freeTo > a) bad.push('seed' + seed + ' ミニが切替に重なる ' + m.id);
            });
          });
          if (g.minis.length < 4) bad.push('seed' + seed + ' 7500m でミニ ' + g.minis.length + ' 回');
          /* §4.7 はコース全体で成り立つ（ゾーンの境目・ミニ演出の前後も） */
          const errs = In.Fair.validate(g.obstacles, st.speedAt, OPT(g));
          if (errs.length) bad.push('seed' + seed + ' §4.7 ' + errs[0]);
          if (g.log.some((l) => l.id === '(mini-unfair)')) bad.push('seed' + seed + ' ミニの譜面が §4.7 を外れた');
          /* 合体区間はエンドレスに出ない */
          if (g.merges.length) bad.push('seed' + seed + ' 合体区間が出た');
        }
        t.eq(bad.length, 0, '切替・猶予・ミニ・§4.7 の違反 0（' + (bad.slice(0, 4).join(' / ') || 'なし') + '）');
        t.ok(nSw >= 70, '10シードで切替 ' + nSw + ' 回');
        t.ok(maxDelay < 300, '切替の遅れは最大 ' + maxDelay.toFixed(1) + 'm（チャンク1本ぶん未満）');
        t.eq(Object.keys(kinds).sort().join(','), 'mini_collapse,mini_jump,mini_rock',
             'ミニ大演出は3種とも出る（' + JSON.stringify(kinds) + '）');
        t.info('切替 ' + nSw + ' / ミニ ' + nMini + ' / 最大遅延 ' + maxDelay.toFixed(1) + 'm');
      });
    }
  });

  /* ==========================================================================
     3. 密度（§4.7 エンドレス: 1000m ごとに +1。規則で空ける区間＝通路・ミニ演出は除いて測る）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: エンドレスの密度（1000m ごと・通路とミニ演出を除く）',
    quick: true,
    run(t) {
      const In = I();
      withCleared(ALL, () => {
        const st = In.makeStage('endless');
        const low = [], rows = [];
        for (let seed = 1; seed <= 6; seed++) {
          const g = In.createGenerator(st, seed);
          g.ensure(12500, 0);
          const ex = [];
          g.switches.forEach((s) => ex.push([s.freeFrom, s.freeTo]));
          g.minis.forEach((m) => ex.push([m.startM, m.freeTo]));
          const row = [];
          for (let a = 0; a < 12000; a += 1000) {
            const items = g.obstacles.filter((o) => o.at >= a && o.at < a + 1000);
            const c = In.Fair.countDemands(items, st.speedAt, { merges: g.merges });
            let len = 1000 - (a === 0 ? In.CFG.LEAD_IN : 0);
            ex.forEach((w) => { len -= Math.max(0, Math.min(w[1], a + 1000) - Math.max(w[0], a)); });
            const d = c.total / Math.max(len, 1) * 100;
            row.push(d);
            /* 目安（3 + 1000mごと+1）。44 m/s 近くの実質上限（決定ログ: 約5〜10回/100m）で頭打ち */
            const want = Math.min(3 + a / 1000, 5);
            if (d < want * 0.7) low.push('seed' + seed + '@' + a + ' ' + d.toFixed(1));
          }
          rows.push(row.map((x) => x.toFixed(1)).join(' '));
          if (g.log.some((l) => l.id === '(blank)')) low.push('seed' + seed + ' 空白チャンク');
        }
        t.eq(low.length, 0, '各 1000m の密度が目安の 70% 以上（' + (low.slice(0, 4).join(' / ') || 'なし') + '）');
        t.info('seed1 ' + rows[0]);
      });
    }
  });

  /* ==========================================================================
     4. 実走: 通路に入る → 奥で差し替え → 光のゲート → 新しいゾーン（描画つき）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: 実走のゾーン切替（トンネル抜け・暗転なし・ゾーン名・小物の伏せ）',
    quick: true,
    run(t) {
      const In = I(), Game = In.Game, Zs = In.Zones, W = In.World, E = In.Endless;
      withCleared(ALL, () => {
        /* 同じシードの生成器で先の切替を調べておく（生成は決定論的） */
        const g0 = In.createGenerator(In.makeStage('endless'), 5);
        g0.ensure(3600, 0);
        DUO.reset(); DUO.start('endless', 5); DUO.bot('perfect');
        const sw0 = g0.switches[0];
        t.ok(!!sw0, '最初の切替が生成されている');
        DUO.skipTo(sw0.t0 - 70);
        t.eq(Zs.id(), 'neon', '手前はネオン都市');
        let tunVis = false, maskOn = false, swDist = null, gateSeen = false, cue = null, maxCalls = 0;
        let fadeBefore = document.getElementById('zonefade').className;
        let guard = 0;
        while (Game.dist < sw0.at + 40 && Game.status === 'playing' && guard++ < 900) {
          DUO.pump(1 / 60);
          if (W.tunnel.visible) tunVis = true;
          if (In.ZoneKit.mask) maskOn = true;
          maxCalls = Math.max(maxCalls, W.drawCalls());
          if (swDist === null && Zs.id() === 'ruins') swDist = Game.dist;
          if (Game.dist >= sw0.at && Game.dist < sw0.at + 6) {
            if (document.getElementById('zonegate').classList.contains('on')) gateSeen = true;
            cue = In.HUD.cueOn;
          }
        }
        t.eq(Game.status, 'playing', '切替を跨いで生存（ボット perfect）');
        t.eq(tunVis, true, '連絡通路が描かれる');
        t.eq(maskOn, true, '通路の中はゾーンの小物を伏せる（無地）');
        t.ok(swDist !== null && swDist >= sw0.swapAt - 1e-6 && swDist < sw0.at,
             'ゾーンの差し替えは通路の奥・ゲートの手前（' + (swDist === null ? '—' : swDist.toFixed(1)) +
             ' / 入口 ' + sw0.t0.toFixed(0) + ' ゲート ' + sw0.at.toFixed(0) + '）');
        t.eq(Zs.id(), 'ruins', 'ゲートの先は古代遺跡');
        t.eq(gateSeen, true, '光のゲートで白く抜ける（#zonegate）');
        t.eq(cue, 'RUINS', 'ゾーン名を出す（' + cue + '）');
        t.eq(document.getElementById('zonefade').className, fadeBefore, '暗転（#zonefade）は使わない');
        t.ok(document.getElementById('hud-stage').textContent.indexOf('古代遺跡') >= 0, 'HUD にゾーン名');
        t.ok(maxCalls <= 300, '通路の区間のドローコール ' + maxCalls + ' ≤ 300');
        /* 抜けたら通路は消え、小物の伏せも外れる */
        for (let i = 0; i < 90; i++) DUO.pump(1 / 60);
        t.eq(W.tunnel.visible, false, '抜けたら通路を隠す');
        t.eq(In.ZoneKit.mask, null, '抜けたら小物の伏せを外す');
        t.eq(In.HUD.cueOn, null, 'ゾーン名は時間で消える');
        /* skipTo は途中のゾーンから始まる（再開位置のゾーンに合わせる） */
        const sw2 = g0.switches[2];
        DUO.skipTo(sw2.at + 200);
        t.eq(Zs.id(), sw2.to, 'skipTo 先のゾーンに合わせる（' + Zs.id() + '）');
        DUO.reset();
        t.eq(E.cueUntil, -1, 'reset で切替の表示状態が戻る');
      });
    }
  });

  /* ==========================================================================
     5. ミニ大演出の実走（崩落・大ジャンプ＝DUO体自由飛行・巨岩の追跡）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: ミニ大演出の実走（崩落・大ジャンプ・巨岩）と後片付け',
    quick: true,
    run(t) {
      const In = I(), Game = In.Game, Sp = In.Setpieces, W = In.World;
      withCleared(ALL, () => {
        const found = {};
        const st = In.makeStage('endless');
        for (let seed = 1; seed <= 30 && Object.keys(found).length < 3; seed++) {
          const g = In.createGenerator(st, seed);
          g.ensure(4800, 0);
          g.minis.forEach((m) => { if (!found[m.id]) found[m.id] = { seed: seed, m: m }; });
        }
        ['mini_collapse', 'mini_jump', 'mini_rock'].forEach((id) => {
          const f = found[id];
          if (!t.ok(!!f, id + ' がシード 1〜30 のどこかで出る')) return;
          DUO.reset(); DUO.start('endless', f.seed); DUO.bot('perfect');
          const m = f.m;
          DUO.skipTo(m.startM - 70);
          let seenState = false, glide = false, look = 0, fall = 0, guard = 0;
          while (Game.dist < m.freeTo + 60 && Game.status === 'playing' && guard++ < 1500) {
            DUO.pump(1 / 60);
            const s = Sp.state;
            if (s && s.mini === id) {
              seenState = true;
              if (Sp.glideActive()) glide = true;
              look = Math.max(look, Sp.lookBack(Game.dist));
              fall = Math.max(fall, Sp.tileFall(Game.dist - 12, 'floor', 0));
            }
          }
          t.eq(Game.status, 'playing', id + ': ボット perfect で生存（' + (Game.killer ? JSON.stringify(Game.killer) : '') + '）');
          t.eq(seenState, true, id + ': 演出が始まる（state.mini）');
          if (id === 'mini_jump') t.eq(glide, true, id + ': DUO体の自由飛行に入る');
          if (id === 'mini_rock') t.ok(look > 0.5, id + ': 振り返りカットで巨岩を見せる（' + look.toFixed(2) + '）');
          if (id === 'mini_collapse') t.ok(fall > 0, id + ': 背後の路面が崩れる');
          t.eq(Sp.state, null, id + ': 終わったら演出を片付ける');
          t.eq(In.Input.mode, 'lanes', id + ': 入力は通常（レーン）に戻る');
          const fb = W._fogBase;
          t.ok(Math.abs(W.scene.fog.far - fb.far) < 1e-6 && W.scene.fog.color.getHex() === fb.color,
               id + ': 霧がゾーンの基準へ戻る');
        });
        DUO.reset();
      });
    }
  });

  /* ==========================================================================
     6. ボットの長距離（perfect 5000m × seed1〜10 / delay250 2500m × seed1〜10）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: エンドレスをボットが走り切る（perfect 5000m / delay250 2500m × seed 1〜10）',
    quick: false,
    run(t) {
      const Game = I().Game;
      withCleared(ALL, () => {
        const runTo = (seed, mode, goal) => {
          DUO.reset(); DUO.start('endless', seed); DUO.bot(mode);
          let g = 0;
          while (Game.status === 'playing' && Game.dist < goal && g++ < 400000) DUO.__step(1 / 60);
          return { d: Game.dist, k: Game.killer, z: I().Zones.id() };
        };
        const pf = [], df = [];
        for (let seed = 1; seed <= 10; seed++) {
          const r = runTo(seed, 'perfect', 5020);
          if (r.d < 5000) pf.push(seed + '@' + Math.floor(r.d) + (r.k ? ':' + r.k.obstacle : ''));
        }
        for (let seed = 1; seed <= 10; seed++) {
          const r = runTo(seed, 'delay250', 2520);
          if (r.d < 2500) df.push(seed + '@' + Math.floor(r.d) + (r.k ? ':' + r.k.obstacle : ''));
        }
        DUO.reset();
        t.eq(pf.length, 0, 'perfect が 5000m 生存 10/10（落ちた種: ' + (pf.join(',') || 'なし') + '）');
        t.eq(df.length, 0, 'delay250 が 2500m 生存 10/10（落ちた種: ' + (df.join(',') || 'なし') + '）');
      });
    }
  });

  /* ==========================================================================
     7. リーク: ゾーンを一巡（6回の切替）しても増え続けない
     ========================================================================== */
  DUO.__suites.push({
    name: 'P6-1: エンドレスでゾーンを一巡してもリークしない',
    quick: false,
    run(t) {
      const In = I(), Game = In.Game, W = In.World, R = W.renderer;
      withCleared(ALL, () => {
        DUO.reset(); DUO.start('endless', 9); DUO.bot('perfect');
        /* 各切替の手前から、実ステップ（描画つき）でゲートを跨ぐ */
        const through = (sw) => {
          DUO.skipTo(sw.t0 - 20);
          let g = 0;
          while (Game.dist < sw.at + 30 && Game.status === 'playing' && g++ < 600) DUO.pump(1 / 60);
        };
        const g0 = In.createGenerator(In.makeStage('endless'), 9);
        g0.ensure(12600, 0);
        const loop = (from) => {
          for (let i = from; i < from + 6; i++) through(g0.switches[i]);
          for (let i = 0; i < 20; i++) DUO.pump(1 / 60);
          return { geo: R.info.memory.geometries, ch: W.scene.children.length, tex: R.info.memory.textures, z: In.Zones.id() };
        };
        const a = loop(0), b = loop(6);
        t.eq(a.z, 'neon', '一巡でネオンへ戻る');
        t.eq(b.geo, a.geo, 'ジオメトリ数が増え続けない（' + a.geo + ' → ' + b.geo + '）');
        t.eq(b.ch, a.ch, 'シーンの要素数が増え続けない（' + a.ch + ' → ' + b.ch + '）');
        t.eq(b.tex, 0, 'テクスチャは0枚のまま（契約§3）');
        DUO.reset();
      });
    }
  });
})();
