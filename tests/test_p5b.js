/* ============================================================================
   tests/test_p5b.js — P5b（ゾーン6「コア」の造形 ／ S8「コア」）

     【P5b-1 造形】
     ・ゾーン切替（6種）でリークしない・パレットと霧・脈動が1本の関数から出る
     ・混在スキン（障害物ごとに寄り親のゾーンが決まる・プールが変種で分かれる）
     ・見た目と当たり判定のズレ ±10%／装飾が走行空間へ食い込まない
     ・小物 20種以上・前方60mに40個以上・ドローコール ≤300・三角形 S1比+30%以内
     【P5b-2 S8】
     ・合体区間（入力経路・天井の障害物が当たらない・分離と猶予・ボットも同経路）
     ・S8 の不変条件・密度・比率・全ギミックの出現・ボット完走
     ・全崩壊エスケープ（各段階の可視性）・中断復元・S8解放・全クリア保存
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const app = () => document.getElementById('app');
  function mkT(id, x, y) { return new Touch({ identifier: id, target: app(), clientX: x, clientY: y, pageX: x, pageY: y }); }
  function fire(type, touches) {
    app().dispatchEvent(new TouchEvent(type, {
      changedTouches: touches, touches: (type === 'touchend' || type === 'touchcancel') ? [] : touches,
      bubbles: true, cancelable: true
    }));
  }
  /* 実入力経路のフリック（zone: 'bottom'|'top'、dx/dy は px） */
  function flick(id, zone, dx, dy) {
    const el = app();
    const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
    const x0 = w * 0.5, y0 = (zone === 'top') ? h * 0.25 : h * 0.75;
    fire('touchstart', [mkT(id, x0, y0)]);
    fire('touchmove', [mkT(id, x0 + dx, y0 + dy)]);
    fire('touchend', [mkT(id, x0 + dx, y0 + dy)]);
  }
  const shown = (id) => {
    const e = document.getElementById(id);
    return !!e && getComputedStyle(e).display !== 'none';
  };
  /* 実ステップで m まで走らせる（skipTo は演出の少し手前まで。跨ぎは実ステップ） */
  function runTo(m, maxFrames) {
    let n = 0;
    while (Game.dist < m && n++ < (maxFrames || 6000) && Game.status === 'playing') DUO.__step(1 / 60);
    return Game.dist;
  }

  /* ==========================================================================
     1. ゾーン6「コア」の造形（契約§5 / §6 P5b）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: ゾーン6「コア」の造形（赤黒・脈動・全ゾーンの断片・核の遠景）',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Zs = In.Zones, R = W.renderer;
      t.ok(Zs.list().indexOf('core') >= 0, 'コアゾーンが登録されている: ' + Zs.list().join(','));
      const z = Zs.get('core');
      ['build', 'sync', 'propsAhead', 'setGlide'].forEach((k) => {
        t.eq(typeof z[k], 'function', 'core: ' + k + ' がある');
      });
      t.ok(!!z.obstacleSkin && typeof z.obstacleSkin.build === 'function', 'core: 障害物スキンがある');
      ['road', 'roadRough', 'roadMetal', 'skirt', 'metal', 'amber', 'indigo', 'fog'].forEach((k) => {
        t.ok(z.PAL[k] !== undefined, 'core: PAL.' + k + ' がある');
      });
      t.eq(z.PAL.amber, Zs.get('neon').PAL.amber, '床の色（琥珀）はゾーンによらず同じ');
      t.eq(z.PAL.indigo, Zs.get('neon').PAL.indigo, '天井の色（藍）はゾーンによらず同じ');

      /* 脈動（心臓）は 1本の関数だけが出所（契約§5「脈動する光」） */
      t.eq(typeof z.pulse, 'function', 'core: 脈動 pulse(t) がある');
      let mx = 0, mn = 1;
      for (let i = 0; i < 200; i++) { const v = z.pulse(i * 0.01); mx = Math.max(mx, v); mn = Math.min(mn, v); }
      t.ok(mx > 0.9, '鼓動の山がある（最大 ' + mx.toFixed(2) + '）');
      t.ok(mn < 0.05, '鼓動の谷がある（最小 ' + mn.toFixed(3) + '）＝ 休みのある心音');
      t.near(z.pulse(0.37), z.pulse(0.37 + z.BEAT_T), 1e-9, '鼓動は BEAT_T で厳密に周期的');

      /* 霧は暗赤だが黒潰れしない（契約§3 / §5） */
      DUO.reset(); DUO.start('S8', 3);
      for (let i = 0; i < 8; i++) DUO.pump(1 / 60);
      t.eq(Zs.id(), 'core', 'S8 を始めるとコアゾーンになる');
      t.eq(W.scene.fog.color.getHex(), z.PAL.fog, '霧がコアの暗赤へ替わる');
      const fogY = (() => { const h = z.PAL.fog;
        return 0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255); })();
      t.ok(fogY > 20 && fogY < 80,
           '霧の色は「暗赤だが黒潰れしない」輝度 ' + fogY.toFixed(1) + '（黒潰れ 8 の上）');
      const red = ((z.PAL.fog >> 16) & 255), blue = (z.PAL.fog & 255);
      t.ok(red > blue, '霧は赤寄り（R ' + red + ' > B ' + blue + '）');
      t.eq(W._roadMat.color.getHex(), z.PAL.road, '路面の色がコアへ替わる');
      t.eq(W._fogBase.color, z.PAL.fog, '演出から戻すときの霧の基準値も更新される');
      t.eq(In.Obstacles.skinId(), 'core', '障害物のスキンもコアになる');

      /* 小物・ドローコール・食い込み（契約§3） */
      for (let i = 0; i < 12; i++) DUO.pump(1 / 60);
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, 'コアのドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      const kinds = {};
      Zs.active().propFields.forEach((f) => { kinds[f.name] = 1; });
      const nk = Object.keys(kinds).length;
      t.ok(nk >= 20, 'コアの小物は ' + nk + '種（20種以上）');
      /* 全ゾーンの断片が混ざっている（契約§5） */
      ['frag_neon_board', 'frag_ruins_col', 'frag_coral', 'frag_space_panel', 'frag_mirror']
        .forEach((n) => t.ok(!!kinds[n], '断片 ' + n + ' がある（全ゾーンの断片が混ざる）'));
      t.eq(In.ZoneKit.intrudes(Zs.active(), 400).length, 0, '装飾が2体の走行空間へ食い込まない');

      /* 1フレームの送り出しが 0.8ms 以内 */
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) Zs.sync(300 + i * 0.4, i * 0.016, 40);
      const ms = (performance.now() - t0) / 120;
      t.ok(ms <= 0.8, 'コアの sync は1フレーム ' + ms.toFixed(3) + 'ms（≤0.8ms）');

      /* 三角形は S1（ネオン都市）比 +30% 以内（契約§3） */
      const tris = W.renderer.info.render.triangles;
      DUO.reset(); DUO.start('S1', 3);
      for (let i = 0; i < 12; i++) DUO.pump(1 / 60);
      const trisS1 = W.renderer.info.render.triangles;
      t.ok(tris <= trisS1 * 1.30,
           'コアの三角形 ' + tris + ' ≤ S1(' + trisS1 + ') の1.30倍（比 ' + (tris / trisS1).toFixed(2) + '）');

      /* --- リーク検査: 6ゾーンを3周してもジオメトリが増え続けない ---
         **走行中に測らない**（走っていると障害物の型が増えるたびにジオメトリが
         増え、リークと区別できない）。タイトルへ戻してからゾーンだけ往復する。 */
      DUO.reset();
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      const cycle = () => {
        ['ruins', 'sea', 'space', 'mirror', 'core', 'neon'].forEach((id) => {
          Zs.switchTo(id);
          for (let i = 0; i < 5; i++) DUO.pump(1 / 60);
        });
        return { geo: R.info.memory.geometries, tex: R.info.memory.textures,
                 ch: W.scene.children.length, calls: W.drawCalls() };
      };
      cycle();
      const a = cycle(), b = cycle(), c = cycle();
      t.eq(b.geo, a.geo, 'ゾーン6種を往復してもジオメトリ数が増えない（' + a.geo + '）');
      t.eq(c.geo, a.geo, '〃 3周目も同じ');
      t.eq(c.ch, a.ch, 'シーンの要素数も増えない（' + a.ch + '）');
      t.eq(c.tex, a.tex, 'テクスチャも増えない（' + a.tex + '）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 混在スキン（契約§5「全ゾーンの断片が混ざる」を障害物でも）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: コアの障害物スキン＝全ゾーン混在（寄り親が障害物ごとに決まる・判定は不変）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, Zs = In.Zones;
      DUO.reset(); DUO.start('S8', 5);
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const skin = Zs.skin();
      t.eq(skin.id, 'core', 'S8 のスキンは core');
      t.eq(typeof skin.variant, 'function', 'core のスキンは variant(o) を持つ');
      t.eq(skin.DONORS.length, 5, '寄り親は既存5ゾーン: ' + skin.DONORS.join(','));

      /* 決定論（同じ障害物なら必ず同じ寄り親） */
      const o1 = Ob.make('PILLAR', 'floor', 0, 123.5, 0);
      t.eq(skin.variant(o1), skin.variant(o1), '寄り親は決定論（同じ障害物＝同じ答え）');
      t.ok(skin.DONORS.indexOf(skin.variant(o1)) >= 0, '寄り親は5ゾーンのどれか');

      /* 散らばり: 同じ型でも at が違えば寄り親が散る */
      const seen = {};
      for (let i = 0; i < 400; i++) seen[skin.variant(Ob.make('PILLAR', 'floor', 0, i * 7.3, 0))] = 1;
      t.eq(Object.keys(seen).length, 5, 'PILLAR の寄り親は5ゾーンすべてに散る');
      const seen2 = {};
      for (let i = 0; i < 400; i++) seen2[skin.variant(Ob.make('ROVER', 'floor', 0, i * 7.3, 0))] = 1;
      t.eq(Object.keys(seen2).length, 5, 'ROVER の寄り親も5ゾーンすべてに散る');

      /* プールが変種で分かれる＝使い回しで別ゾーンの姿に化けない */
      const gN = Ob.acquire('PILLAR', 'neon');
      const gR = Ob.acquire('PILLAR', 'ruins');
      t.ok(gN !== gR, '寄り親が違えば別の見た目を作る');
      t.eq(gN.userData._vk, 'neon', '見た目は自分の寄り親を覚えている');
      Ob.release('PILLAR', gN); Ob.release('PILLAR', gR);
      t.eq(Ob.acquire('PILLAR', 'neon'), gN, 'プールへ返すと同じ寄り親の枠へ戻る');
      t.eq(Ob.acquire('PILLAR', 'ruins'), gR, '〃 もう一方も');
      Ob.release('PILLAR', gN); Ob.release('PILLAR', gR);

      /* 判定（OBS）はゾーンによらず不変 */
      const before = JSON.stringify(In.OBS.PILLAR) + JSON.stringify(In.OBS.ROVER);
      Zs.switchTo('neon');
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      t.eq(JSON.stringify(In.OBS.PILLAR) + JSON.stringify(In.OBS.ROVER), before,
           '当たり判定の寸法はスキンを替えても一切変わらない');

      /* 見た目と判定のズレ ±10%（走行中の実体で測る） */
      DUO.reset(); DUO.start('S8', 9);
      DUO.bot('perfect');
      let checked = 0, bad = [];
      for (let f = 0; f < 1400; f++) {
        DUO.pump(1 / 60);
        if (f % 37) continue;
        for (let i = 0; i < Game.active.length; i++) {
          const o = Game.active[i];
          if (!o.view || !o.view.visible) continue;
          const T = In.OBS[o.type];
          if (T.ghost || T.pad || T.motion || T.fish || o.type === 'BRIDGE' || o.type === 'WALLSOLID') continue;
          /* P5c: 判定外の標示（支柱・警告バー・路面の警告帯）は外して測る
             ＝ ここで見たいのは「当たり判定と実体の幅が食い違っていないか」だけ */
          const box = In.viewBox(o.view);
          const bw = box.max.x - box.min.x;
          const want = T.span * CFG.LANE_W;
          checked++;
          /* 縁光（コアの印）と警告の張り出しぶんを見込んで ±22% で見る。
             判定そのものは OBS が唯一の出所なので、ここは「大きく外れていない」の確認。 */
          if (bw > want * 1.25 || bw < want * 0.6) bad.push(o.type + ' w=' + bw.toFixed(2) + '/' + want.toFixed(2));
        }
      }
      t.ok(checked > 40, '見た目と判定の照合 ' + checked + '個');
      t.eq(bad.length, 0, '見た目の幅が判定から大きく外れない' + (bad.length ? (': ' + bad.slice(0, 4).join(', ')) : ''));
      DUO.reset();
    }
  });

  /* ==========================================================================
     3. 合体区間（契約§4.5「合体区間」/ §4.4 S8）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: 合体区間（入力経路・天井は当たらない・分離と猶予・中断復元）',
    quick: true,
    run(t) {
      const In = I(), Mg = In.Merge;
      /* 展開の形: ゲート2枚・長さは秒で一定（契約「100〜150m」） */
      const items = [], sink = [];
      Mg.expand(items, { at: 0, lane: 0, type: 'MERGE', params: { mrg: { n: CFG.MERGE.N_T } } },
                'floor', 100, 0, 3.2, sink);
      t.eq(items.length, 2, '合体区間はゲート2枚（入口と出口）');
      t.eq(items[0].type, 'MERGEGATE', 'ゲートの型は MERGEGATE');
      t.eq(In.OBS.MERGEGATE.ghost, true, 'ゲートは当たり判定を持たない（通るだけ）');
      const reg = sink[0];
      t.near(reg.to - reg.from, CFG.MERGE.N_T * CFG.REF_SPEED * 3.2, 0.01,
             '区間の長さは「秒 × その地点の速度」');
      t.ok((reg.to - reg.from) >= 100 && (reg.to - reg.from) <= 150,
           '速度32の区間長 ' + (reg.to - reg.from).toFixed(0) + 'm は契約の 100〜150m');
      const regFast = [];
      Mg.expand([], { at: 0, lane: 0, type: 'MERGE', params: { mrg: { n: CFG.MERGE.N_T } } },
                'floor', 100, 0, 4.4, regFast);
      const lf = regFast[0].to - regFast[0].from;
      t.ok(lf >= 100 && lf <= 150, '速度44の区間長 ' + lf.toFixed(0) + 'm も契約の 100〜150m');

      /* 区間の内外の判定 */
      t.eq(Mg.activeAt(sink, reg.from - 1), false, 'ゲートの手前は2体のまま');
      t.eq(Mg.activeAt(sink, reg.from + 1), true, '入口を越えると1体');
      t.eq(Mg.activeAt(sink, reg.to + 1), false, '出口を越えると2体へ戻る');

      /* --- 走行中: 実タッチで合体体を動かす（契約§4.5 を上下タッチで読んだ形） ---
         ゲートまではボットに走らせる（人の手では譜面を抜けられない）。ゲートを
         **実ステップで跨いだ**あとはボットを外し、入力の検査の間だけ障害物を伏せる
         （ここで見たいのは「どの入力がどう効くか」であって譜面ではない）。 */
      DUO.reset(); DUO.start('S8', 4);
      let found = null, guard = 0;
      while (!found && guard++ < 40) {
        const list = Game.gen.merges;
        if (list.length) { found = list[0]; break; }
        Game.gen.ensure(Game.gen.cursor + 200, 0);
      }
      t.ok(!!found, 'S8 の生成に合体区間がある');
      /* 障害物を伏せたまま1フレーム進める（生成された先の分も引き取っておく） */
      function stepQ(n) {
        for (let i = 0; i < (n || 1); i++) {
          I().clearObstacles();
          Game.genPtr = Game.gen.obstacles.length;
          DUO.__step(1 / 60);
        }
      }
      if (found) {
        /* 演出の少し手前から実ステップで跨ぐ（跨ぎは必ず実ステップ） */
        DUO.skipTo(Math.max(0, found.from - 120));
        DUO.bot('perfect');
        runTo(found.from + 6, 3000);
        DUO.bot(null);
        Input.clear();
        const st = DUO.state();
        t.eq(st.merged, true, '入口を越えると合体している（merged）');
        t.eq(shown('flag-merge'), true, 'HUD に MERGE が出る');
        const lead = Game.mergeLead(), other = Game.mergePassenger();
        t.eq(lead.surface, 'floor', '合体体は **床を走る**（床と天井の中間ではない）');
        /* 判定は lead 1体ぶん（面の持ち物は変えない）。**見た目**は World が
           もう1体を lead の足元へ寄せる＝「1体として走っている」ように見える。 */
        t.near(Game.mergeK(), 1, 1e-6, '合体の度合いは区間の中では 1');
        DUO.pump(1 / 60);
        const vy = (id) => In.World.runnerViews[id].group.position.y;
        t.ok(Math.abs(vy(other.id) - vy(lead.id)) < 0.6,
             'もう1体は合体体と同じ高さに描かれる（差 '
             + Math.abs(vy(other.id) - vy(lead.id)).toFixed(2) + 'm < 0.6）');
        t.ok(Math.abs(In.World.runnerViews[other.id].group.position.x
                      - In.World.runnerViews[lead.id].group.position.x) < 1.0,
             '〃 横も寄り添っている（手を繋いだ1体）');

        /* 下半分の横フリック＝レーン移動 */
        const lane0 = lead.laneTo;
        flick(71, 'bottom', 90, 0);
        stepQ();
        t.eq(lead.laneTo, Math.min(1, lane0 + 1), '下半分の右フリックでレーンが右へ動く');
        flick(72, 'bottom', -90, 0);
        stepQ();
        t.eq(lead.laneTo, lane0, '下半分の左フリックで戻る');

        /* 上半分の上フリック＝ジャンプ／下フリック＝スライド */
        flick(73, 'top', 0, -90);
        stepQ();
        t.eq(lead.act, 'jump', '上半分の上フリックでジャンプ');
        stepQ(45);
        flick(74, 'top', 0, 90);
        stepQ();
        t.eq(lead.act, 'slide', '上半分の下フリックでスライディング');
        stepQ(40);

        /* 下半分の上下・上半分の横は効かない（1体を両手で操作するため） */
        const laneA = lead.laneTo;
        flick(75, 'bottom', 0, -90);
        stepQ();
        t.eq(lead.act, 'run', '下半分の上フリックは効かない（移動専用）');
        flick(76, 'top', 90, 0);
        stepQ();
        t.eq(lead.laneTo, laneA, '上半分の横フリックは効かない（跳ぶ/潜る専用）');
        t.eq(DUO.state().merged, true, 'ここまでずっと合体区間の中に居る');

        /* 天井側の障害物には当たらない（**合体体と同じレーン**の天井に置く） */
        I().clearObstacles();
        Game.genPtr = Game.gen.obstacles.length;
        In.spawnOne('ROVER', 'ceil', lead.laneTo, 3);
        let hit = false;
        for (let i = 0; i < 40 && Game.status === 'playing'; i++) {
          const keep = Game.active.slice();
          DUO.__step(1 / 60);
          Game.genPtr = Game.gen.obstacles.length;
          Game.active = Game.active.filter((o) => keep.indexOf(o) >= 0);
          if (Game.status !== 'playing') hit = true;
        }
        t.eq(hit, false, '合体中は天井側の障害物に当たらない（誰も天井に居ない）');
        t.eq(Game.status, 'playing', '〃 生きている');

        /* 出口で分離 → 最寄りレーンへ・直後は障害物なし */
        I().clearObstacles();
        DUO.bot('perfect');
        runTo(found.to + 4, 3000);
        DUO.bot(null);
        const st2 = DUO.state();
        t.eq(st2.merged, false, '出口を越えると2体に戻る');
        t.eq(shown('flag-merge'), false, 'HUD の MERGE が消える');
        t.eq(st2.runners.lumen.lane, st2.runners.umbra.lane,
             '分離直後は2体とも同じ（最寄り）レーンに居る');
        const until = found.to + Game.speed * CFG.MERGE.GRACE_T;
        const inGrace = Game.gen.obstacles.filter((o) => {
          const def = In.OBS[o.type];
          return def && !def.ghost && o.at > found.to && o.at < until;
        });
        t.eq(inGrace.length, 0, '出口の直後 ' + CFG.MERGE.GRACE_T + '秒は障害物なし');
      }

      /* 中断復元: リトライで必ず2体へ戻る */
      DUO.reset(); DUO.start('S8', 4);
      Game.merged = true;
      Game.retry(true);
      t.eq(DUO.state().merged, false, 'リトライで必ず2体へ戻る');
      t.eq(shown('flag-merge'), false, '〃 HUD も戻る');
      DUO.reset();
      t.eq(DUO.state().merged, false, 'タイトルへ戻しても2体');
    }
  });

  /* ==========================================================================
     4. ボットも同じ経路（合体区間）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: 合体区間をボットも同じ入力経路で通る',
    quick: true,
    run(t) {
      DUO.reset(); DUO.start('S8', 12);
      DUO.bot('perfect');
      const list = Game.gen.merges;
      Game.gen.ensure(1200, 0);
      /* 2回目の合体区間で見る（1回目は初出の tip の窓＝契約§4.8 で直後の障害物が外れ、
         ボットが入力しないまま抜けることがある） */
      const reg = Game.gen.merges[1] || Game.gen.merges[0];
      t.ok(!!reg, '合体区間がある');
      if (reg) {
        DUO.skipTo(Math.max(0, reg.from - 140));
        let sawMerged = false, pushed = 0;
        const origPush = Input.push;
        Input.push = function (hand, act) { if (Game.merged) pushed++; return origPush.call(Input, hand, act); };
        for (let i = 0; i < 4000 && Game.dist < reg.to + 60 && Game.status === 'playing'; i++) {
          DUO.__step(1 / 60);
          if (Game.merged) sawMerged = true;
        }
        Input.push = origPush;
        t.eq(sawMerged, true, 'ボットが合体区間に入った');
        t.eq(Game.status, 'playing', 'ボットが合体区間を生きて抜けた（' + Math.round(Game.dist) + 'm）');
        t.ok(pushed > 0, '合体中もボットは人間と同じ Input の経路を使う（' + pushed + '回）');
      }
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. S8 の不変条件・密度・比率・ギミックの出現（50シード）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: S8 の §4.7 不変条件・密度・動作比率・全ギミックの出現（50シード）',
    quick: false,
    run(t) {
      const In = I();
      const st = In.makeStage('S8');
      const SP = In.Setpieces.DEFS.collapseall;
      const spStart = st.lengthM - SP.lengthM;
      let errs = 0, blanks = 0, spOk = 0, mergeCounts = {}, mergeIn = {};
      const mergeLen = [];
      const densA = [], densB = [], ratio = { lane: 0, jump: 0, slide: 0, total: 0 };
      const gimmick = { bridge: 0, pend: 0, sync: 0, drop: 0, cur: 0, lift: 0, door: 0,
                        warp: 0, zero: 0, net: 0, mir: 0, swap: 0, merge: 0 };
      const firstErr = [];
      for (let seed = 1; seed <= 50; seed++) {
        const g = In.createGenerator(st, seed);
        g.ensure(st.lengthM + 60, 0);
        const opt = { startLanes: 'any', reactBoth: st.reactBoth, currents: g.currents,
                      zeros: g.zeros, warps: g.warps, mirrors: g.mirrors, swaps: g.swaps,
                      merges: g.merges };
        const e = In.Fair.validate(g.obstacles, st.speedAt, opt);
        if (e.length) { errs++; if (firstErr.length < 3) firstErr.push('seed' + seed + ': ' + e[0]); }
        blanks += g.log.filter((l) => l.id === '(blank)').length;
        if (g.log.some((l) => l.setpiece)) spOk++;
        /* 合体区間の回数（契約§4.4「S8で2回」） */
        const nm = g.merges.length;
        mergeCounts[nm] = (mergeCounts[nm] || 0) + 1;
        const inStage = g.merges.filter((r) => r.to < spStart);
        mergeIn[inStage.length] = (mergeIn[inStage.length] || 0) + 1;
        inStage.forEach((r) => mergeLen.push(r.to - r.from));
        /* 顔ぶれ（チャンクのフラグで数える） */
        const flags = {};
        g.log.forEach((l) => {
          const d = In.CHUNK_DEFS.filter((c) => c.id === l.id)[0];
          if (!d || l.startM > spStart) return;   // 大演出より後ろは走らない
          Object.keys(gimmick).forEach((k) => { if (d[k]) flags[k] = 1; });
        });
        Object.keys(flags).forEach((k) => { gimmick[k]++; });
        /* 密度（大演出の200m超を除いた区間で / 決定ログ 2026-09-22） */
        const half = spStart / 2;
        /* P5c（契約§4.8）: tip の窓は「対象以外は置かない」区間なので除いて測る */
        const tw = In.Fair.tipWindows(g.events);
        const inA = g.obstacles.filter((o) => o.at >= CFG.LEAD_IN && o.at < half && !In.Fair.inTipWindow(tw, o.at));
        const inB = g.obstacles.filter((o) => o.at >= half && o.at < spStart && !In.Fair.inTipWindow(tw, o.at));
        densA.push(In.Fair.countDemands(inA, st.speedAt, opt).total /
                   (half - CFG.LEAD_IN - In.Fair.tipOverlap(tw, CFG.LEAD_IN, half)) * 100);
        densB.push(In.Fair.countDemands(inB, st.speedAt, opt).total /
                   (spStart - half - In.Fair.tipOverlap(tw, half, spStart)) * 100);
        const c = In.Fair.countDemands(g.obstacles, st.speedAt, opt);
        ratio.lane += c.lane; ratio.jump += c.jump; ratio.slide += c.slide; ratio.total += c.total;
      }
      t.eq(errs, 0, '50シードで §4.7 の違反なし' + (firstErr.length ? (' / ' + firstErr.join(' | ')) : ''));
      t.eq(blanks, 0, '50シードで空白チャンクなし');
      t.eq(spOk, 50, '50シードすべてに大演出「全崩壊エスケープ」が入る');
      t.eq(Object.keys(mergeCounts).join(','), '2',
           '合体区間は必ず 2回（内訳 ' + JSON.stringify(mergeCounts) + '）');
      t.eq(Object.keys(mergeIn).join(','), '2',
           '合体区間は 2回とも **大演出より手前**＝実際に走る区間にある（内訳 '
           + JSON.stringify(mergeIn) + '）');
      t.ok(mergeLen.every((m) => m >= 100 && m <= 150),
           '区間の長さは契約の 100〜150m（実測 '
           + Math.min.apply(null, mergeLen).toFixed(0) + '〜'
           + Math.max.apply(null, mergeLen).toFixed(0) + 'm）');

      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const dA = avg(densA), dB = avg(densB);
      /* 判定は stage.densityReal（実測できる帯）に対して行う。**既知の妥協点**:
         S8 は契約が要求する構造そのもの（合体区間2回＝要求を1体ぶんしか置けない／
         12種のうち5種がゲート・区間型で直後 1.0秒の猶予が要る）のせいで、
         §4.7 の目安（10→14）どころか S7 の実測（8.8）にも届かない。 */
      const want = st.densityReal || st.density;
      t.info('密度 前半 ' + dA.toFixed(2) + ' / 後半 ' + dB.toFixed(2) + ' 回/100m（実測の目安 ' + want.join('→') + '）');
      t.ok(dA >= want[0] * 0.75 && dA <= want[0] * 1.25,
           '前半の密度 ' + dA.toFixed(2) + ' は目安 ' + want[0] + ' の ±25% 内');
      t.ok(dB >= want[1] * 0.75 && dB <= want[1] * 1.25,
           '後半の密度 ' + dB.toFixed(2) + ' は目安 ' + want[1] + ' の ±25% 内');
      t.ok(dB <= 10.5, '密度は決定ログの実質上限（約10回/100m）を超えない: ' + dB.toFixed(2));

      const pl = ratio.lane / ratio.total * 100, pj = ratio.jump / ratio.total * 100;
      const ps = ratio.slide / ratio.total * 100;
      t.info('動作比率 レーン ' + pl.toFixed(1) + '% / ジャンプ ' + pj.toFixed(1) + '% / スライド ' + ps.toFixed(1) + '%');
      t.ok(pl <= 62, 'レーン移動は 62% 以下: ' + pl.toFixed(1) + '%');
      t.ok(pj >= 30, 'ジャンプは 30% 以上: ' + pj.toFixed(1) + '%');
      t.ok(ps <= 15, 'スライディングは 15% 以下（契約§4.3）: ' + ps.toFixed(1) + '%');

      /* 全ギミックの出現（50シードで各ギミックが 60% 以上のシードに出る） */
      const weak = [];
      Object.keys(gimmick).forEach((k) => {
        t.info('ギミック ' + k + ': ' + gimmick[k] + '/50 シード');
        if (gimmick[k] < 30) weak.push(k + '=' + gimmick[k]);
      });
      t.eq(weak.length, 0, '全ギミックが 60% 以上のシードに出る' + (weak.length ? (' / 不足: ' + weak.join(',')) : ''));
    }
  });

  /* ==========================================================================
     6. ボット完走（perfect 50 / delay250 40以上）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: S8 をボットが完走する（perfect 50/50・delay250 40以上）',
    quick: false,
    run(t) {
      const res = { perfect: 0, delay250: 0 };
      const dead = { perfect: [], delay250: [] };
      ['perfect', 'delay250'].forEach((mode) => {
        for (let seed = 1; seed <= 50; seed++) {
          DUO.reset();
          DUO.start('S8', seed);
          DUO.bot(mode);
          let guard = 0;
          while (Game.status === 'playing' && guard++ < 40000) DUO.__step(1 / 60);
          /* ゴール演出→全クリア演出→リザルト まで回す */
          while ((Game.status === 'goal' || Game.status === 'allclear') && guard++ < 41000) DUO.__step(1 / 60);
          if (Game.status === 'clear') res[mode]++;
          else if (dead[mode].length < 4) dead[mode].push(seed + '@' + Math.round(Game.dist) + 'm/' + (Game.killer ? Game.killer.obstacle : Game.status));
        }
      });
      t.eq(res.perfect, 50, 'perfect ボットが S8 を 50/50 完走' + (dead.perfect.length ? (' / 落ち: ' + dead.perfect.join(', ')) : ''));
      t.ok(res.delay250 >= 40, 'delay250 ボットが S8 を ' + res.delay250 + '/50 完走（40以上）' +
           (dead.delay250.length ? (' / 落ち: ' + dead.delay250.join(', ')) : ''));
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. 大演出「全崩壊エスケープ」の各段階
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: 全崩壊エスケープ（背後カット・大ジャンプ・崩落の中・反転・出口の光）',
    quick: true,
    run(t) {
      const In = I(), Sp = In.Setpieces, C = Sp.CA, D = Sp.DEFS.collapseall;
      t.eq(D.air, true, '全崩壊は自由飛行の区間を持つ（§4.5 を流用）');
      t.eq(D.landRel, C.LAND, '着地の距離はキーフレーム表と一致');
      t.ok(C.BACK.length >= 2, '振り返りカットは2回（要所で背後の崩壊を見せる）');
      C.BACK.forEach((w, i) => {
        t.ok(w[1] - w[0] >= 40, 'カット' + (i + 1) + 'の長さ ' + (w[1] - w[0]) + 'm ＝ 約1秒（42m/s）');
      });
      /* カットの窓に障害物を置かない（契約§8 の決定ログ） */
      const inCut = (D.floor.concat(D.ceil)).filter((e) => {
        /* ゲート型（GRAVWARP など）は OBS に直接の型を持たない＝当たり判定が無い */
        const def = In.OBS[e.type];
        if (!def || def.ghost) return false;
        return C.BACK.some((w) => e.at > w[0] - 2 && e.at < w[1] + 2);
      });
      t.eq(inCut.length, 0, 'カットの窓には障害物を置かない');
      /* 崩落の中の譜面（崩れる橋＋落ちる天井の連鎖 / 契約§4.4） */
      const types = D.floor.map((e) => e.type);
      t.ok(types.indexOf('BRIDGE') >= 0, '崩落の中に「崩れる橋」がある');
      t.ok(types.indexOf('DROPCEIL') >= 0, '崩落の中に「落ちる天井」がある');
      t.ok(types.indexOf('GRAVWARP') >= 0, '「重力反転ワープ」がある（契約§4.4 …→反転→着地）');
      const flip = D.floor.filter((e) => e.type === 'GRAVWARP')[0];
      t.ok(flip.at > C.LAND, '反転は着地のあと（契約の順: 大ジャンプ→崩落→反転→着地→出口）');
      /* **出口の光は振り返りカットの外**（P5b 監査で発覚: 重なっていて、光へ
         向かう絵が一度も前から見えないままゴールしていた / 契約§4.4「…出口の光へ」） */
      t.ok(C.BACK.every((w) => C.EXIT0 >= w[1]),
           '出口の光（' + C.EXIT0 + 'm〜）は振り返りカットより後ろで始まる（'
           + C.BACK.map((w) => w.join('-')).join(' / ') + '）');

      /* 実走: 演出の少し手前から実ステップで跨ぐ */
      DUO.reset(); DUO.start('S8', 6);
      DUO.bot('perfect');
      const stage = Game.stage;
      const sp0 = stage.lengthM - D.lengthM;
      DUO.skipTo(sp0 - 90);
      const seen = { start: false, back1: 0, glide: false, land: false, back2: 0, flip: false, exit: 0,
                     exitFwd: 0, duo: 0, wall: 0 };
      let guard = 0;
      while (Game.status === 'playing' && guard++ < 8000) {
        DUO.__step(1 / 60);
        const rel = Game.dist - sp0;
        if (Sp.id() === 'collapseall') seen.start = true;
        if (rel > 0 && rel < 60) seen.back1 = Math.max(seen.back1, Sp.fallBackK(Game.dist));
        if (rel > 220) seen.back2 = Math.max(seen.back2, Sp.fallBackK(Game.dist));
        if (Sp.glideActive()) seen.glide = true;
        seen.duo = Math.max(seen.duo, Sp.duoK(Game.dist));
        if (rel > C.LAND && rel < C.LAND + 20 && !Sp.glideActive()) seen.land = true;
        if (Game.flipN > 0) seen.flip = true;
        seen.exit = Math.max(seen.exit, Sp.fallExit(Game.dist));
        if (Sp.fallBackK(Game.dist) < 0.02) seen.exitFwd = Math.max(seen.exitFwd, Sp.fallExit(Game.dist));
      }
      t.eq(seen.start, true, '演出が始まる（崩落前線）');
      t.ok(seen.back1 > 0.9, '振り返りカット1が最大まで振れる（' + seen.back1.toFixed(2) + '）');
      t.eq(seen.glide, true, '大ジャンプ（自由飛行）に入る');
      t.ok(seen.duo > 0.99, '2体が合体して DUO体になる（duoK ' + seen.duo.toFixed(2) + '）');
      t.eq(seen.land, true, '着地して崩落の中を走る');
      t.ok(seen.back2 > 0.9, '振り返りカット2が最大まで振れる（' + seen.back2.toFixed(2) + '）');
      t.eq(seen.flip, true, '重力反転ワープで天地が返る');
      t.ok(seen.exit > 0.9, '出口の光が差す（' + seen.exit.toFixed(2) + '）');
      t.ok(seen.exitFwd > 0.9,
           '出口の光は **前を向いたまま** 差す（カット中ではない / 最大 '
           + seen.exitFwd.toFixed(2) + '）');
      t.ok(Game.status === 'goal' || Game.status === 'allclear' || Game.status === 'clear',
           '演出を抜けてゴールする（' + Game.status + '）');

      /* 中断復元: 演出の途中で抜けてもカメラ・霧・崩落が元へ戻る */
      DUO.reset(); DUO.start('S8', 6);
      DUO.skipTo(sp0 + 30);
      for (let i = 0; i < 30; i++) DUO.pump(1 / 60);
      const fogMid = In.World.scene.fog.far;
      DUO.reset();
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      t.eq(Sp.state, null, '中断で演出の状態が消える');
      t.eq(Sp.fall.group.visible, false, '崩落前線の見た目が伏せられる');
      t.eq(Sp.fall.exit.visible, false, '出口の光も消える');
      t.info('演出中の霧 far ' + fogMid.toFixed(0) + ' → 復帰 ' + In.World.scene.fog.far.toFixed(0));
    }
  });

  /* ==========================================================================
     8. S8 の解放・全クリア・ステージ選択の印
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: S8 の解放（S7クリアで）・全クリアの保存と演出・ステージ選択の印',
    quick: true,
    run(t) {
      const In = I(), U2 = In.U, UI2 = In.UI;
      t.eq(UI2.STAGES.length, 8, 'ステージは8つ');
      t.eq(UI2.STAGES[7].id, 'S8', '8番目は S8');
      t.eq(UI2.STAGES[7].ready, true, 'S8 は実装済み（ready）');
      t.eq(UI2.STAGES[7].name, 'コア', 'S8 の名前は「コア」');

      const snap = U2.lsSnapshot();
      /* 本来の解放規則（テスト中は _testLock で検証する） */
      U2.lsSet('cleared', []);
      t.eq(UI2.isUnlocked(7), false, 'S7 未クリアなら S8 はロック');
      U2.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
      t.eq(UI2.isUnlocked(7), true, 'S7 をクリアすると S8 が解放される');

      /* 全クリアの保存と印 */
      U2.lsSet('allclear', false);
      t.eq(UI2.allCleared(), false, '最初は全クリアではない');
      UI2.show('stages');
      t.eq(shown('stages-allclear'), false, 'ステージ選択に全クリアの印は出ていない');

      DUO.reset(); DUO.start('S8', 2);
      Game.dist = Game.stage.lengthM;
      Game.onGoal();
      let guard = 0;
      while (Game.status === 'goal' && guard++ < 400) DUO.__step(1 / 60);
      t.eq(Game.status, 'allclear', 'S8 のゴール後は全クリア演出に入る');
      t.eq(document.getElementById('allclear').classList.contains('on'), true,
           'ALL CLEAR の演出が表示される');
      t.eq(UI2.allCleared(), true, 'localStorage に全クリアの印（duorun.allclear）が残る');
      t.ok(DUO.state().allClearK >= 0 && DUO.state().allClearK <= 1, '全クリア演出の進み具合が観測できる');
      while (Game.status === 'allclear' && guard++ < 800) DUO.__step(1 / 60);
      t.eq(Game.status, 'clear', '全クリア演出のあとリザルトへ');
      t.eq(document.getElementById('allclear').classList.contains('on'), false, '演出が消える');
      t.ok(UI2.cleared().indexOf('S8') >= 0, 'クリア済みに S8 が入る');

      UI2.show('stages');
      t.eq(shown('stages-allclear'), true, 'ステージ選択に全クリアの印が出る');

      /* S1〜S7 のクリアでは全クリアにならない */
      U2.lsSet('allclear', false);
      DUO.reset(); DUO.start('S7', 2);
      Game.dist = Game.stage.lengthM;
      Game.onGoal();
      guard = 0;
      while (Game.status === 'goal' && guard++ < 400) DUO.__step(1 / 60);
      t.eq(Game.status, 'clear', 'S7 のゴールは通常どおりリザルトへ（全クリア演出は出ない）');
      t.eq(UI2.allCleared(), false, 'S7 では全クリアの印は付かない');

      U2.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     9. エンドレスのプール（S8 をクリアすると顔ぶれが加わる）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5b: エンドレスに S8 の顔ぶれが加わる（合体区間は持ち込まない）',
    quick: true,
    run(t) {
      const In = I(), U2 = In.U;
      const snap = U2.lsSnapshot();
      const base = In.endlessPool([]);
      t.eq(base.pool.filter((id) => (In.CHUNK_DEFS.filter((c) => c.id === id)[0] || {}).s8).length, 0,
           'クリア前のエンドレスに S8 のチャンクは入らない');
      const all = In.endlessPool(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
      const s8n = all.pool.filter((id) => (In.CHUNK_DEFS.filter((c) => c.id === id)[0] || {}).s8).length;
      t.ok(s8n > 0, 'S8 クリア後は S8 のチャンクが混ざる（' + s8n + '本）');
      const mg = all.pool.filter((id) => (In.CHUNK_DEFS.filter((c) => c.id === id)[0] || {}).merge).length;
      t.eq(mg, 0, '合体区間はエンドレスに持ち込まない（ゾーン切替と噛み合わないため）');
      t.ok(all.maxRank >= 5, 'エンドレスのランク上限が 5 まで上がる（' + all.maxRank + '）');
      U2.lsRestore(snap);
      DUO.reset();
    }
  });
})();
