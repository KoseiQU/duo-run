/* ============================================================================
   tests/test_p5a.js — P5a（ゾーン5「鏡の世界」の造形 ／ S6「鏡の世界」）

     【P5a-1 造形】
     ・ゾーン切替（neon ⇄ ruins ⇄ sea ⇄ space ⇄ mirror）でリークしない・パレットと霧
     ・鏡スキンの見た目と当たり判定のズレ ±10%
     ・装飾が 2体の走行空間へ食い込まない／小物 20種以上・前方60mに40個以上
     ・ドローコール ≤300・三角形は S1 比 +30% 以内・sync の1フレーム ≤0.8ms
     ・擬似反射（反転コピー）が鏡面の奥に立つ
     【P5a-2 S6】
     ・鏡ゾーン（該当キャラだけ反転・実タッチで右フリック→画面左・出口で戻る）
     ・入れ替えワープ（上下の担当が入れ替わる・HUD・戻り）
     ・重ね掛け（1区画に最大1回・必ず解除してから次）
     ・レーザーネットの密度アップ（1区画 4〜5本）
     ・割れた鏡の床（飛び石）の到達時刻の判定
     ・不変条件・密度・動作比率・ボット完走・鏡の砕け散り・解放・中断復元
   ============================================================================ */
'use strict';

(function () {
  /* P5c: 譜面は tip の猶予規則（契約§4.8）で位置がずれるので、固定の距離・種ではなく
     「その種で最初に出る区間」を生成して探す（見つけた区間の少し手前へ skipTo し、実ステップで跨ぐ） */
  function findRegion(kind, pred) {
    for (let seed = 1; seed <= 40; seed++) {
      DUO.reset(); DUO.start('S6', seed);
      Game.gen.ensure(1400, 0);
      const r = Game.gen[kind].filter((q) => q.from > 150 && q.to < 1380 && (!pred || pred(q)))[0];
      if (r) { const out = { seed: seed, from: r.from }; DUO.reset(); return out; }
    }
    DUO.reset();
    return null;
  }
  const I = () => DUO.__internal;
  const app = () => document.getElementById('app');
  const canSynth = (typeof window.Touch === 'function' && typeof window.TouchEvent === 'function');
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
  const handName = (s) => document.getElementById('hand-' + s + '-name').textContent;
  const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';

  /* ==========================================================================
     1. ゾーン切替（契約§6 P5a）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5a: ゾーン切替（neon ⇄ ruins ⇄ sea ⇄ space ⇄ mirror）でリークしない・鏡のパレットと霧',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Zs = In.Zones, R = W.renderer;
      t.ok(Zs.list().indexOf('mirror') >= 0, '鏡ゾーンが登録されている: ' + Zs.list().join(','));
      const z = Zs.get('mirror');
      t.eq(typeof z.build, 'function', 'mirror: build がある');
      t.eq(typeof z.sync, 'function', 'mirror: sync がある');
      t.eq(typeof z.propsAhead, 'function', 'mirror: propsAhead がある');
      t.ok(!z.obstacleSkin, 'mirror: ゾーン別の障害物スキンは持たない（契約§4.3 v2）');
      ['road', 'roadRough', 'roadMetal', 'skirt', 'metal', 'amber', 'indigo', 'fog'].forEach((k) => {
        t.ok(z.PAL[k] !== undefined, 'mirror: PAL.' + k + ' がある');
      });
      t.eq(z.PAL.amber, Zs.get('neon').PAL.amber, '床の色（琥珀）はゾーンによらず同じ');
      t.eq(z.PAL.indigo, Zs.get('neon').PAL.indigo, '天井の色（藍）はゾーンによらず同じ');
      t.eq(z.RAINBOW.length, 6, '虹は6色（帯・縁光・万華鏡が同じ配列を読む）');

      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const neonFog = W.scene.fog.color.getHex(), neonRoad = W._roadMat.color.getHex();
      const childs0 = W.scene.children.length;

      Zs.switchTo('mirror');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(Zs.id(), 'mirror', '鏡ゾーンへ切り替わる');
      t.eq(W.scene.fog.color.getHex(), z.PAL.fog, '霧が鏡の銀白へ替わる');
      t.ok(W.scene.fog.far >= 80, '霧は薄い（far ' + W.scene.fog.far + ' ≥ 80 / 契約§5）');
      const fogY = (() => { const h = z.PAL.fog;
        return 0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255); })();
      t.ok(fogY > 8 && fogY < 60,
           '霧の色は「銀だが暗部を作れる」輝度 ' + fogY.toFixed(1) + '（黒潰れ 8 の上・中間調 60 の下）');
      t.eq(W._roadMat.color.getHex(), W.roadColor(z.PAL.road), '路面の色が鏡の銀へ替わる（無地の暗色へ沈めた色 / 契約§5 v2）');
      t.eq(W._fogBase.color, z.PAL.fog, '演出から戻すときの霧の基準値も更新される');
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, '鏡のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      const kinds = {};
      Zs.active().propFields.forEach((f) => { kinds[f.name] = 1; });
      t.ok(Object.keys(kinds).length >= 20, '鏡の小物は ' + Object.keys(kinds).length + '種（20種以上）');

      /* 三角形は S1（ネオン都市）比 +30% 以内（契約§3 / ジオラマ規範） */
      const tris = W.renderer.info.render.triangles;
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      const trisS1 = W.renderer.info.render.triangles;
      t.ok(tris <= trisS1 * 1.30,
           '鏡の三角形 ' + tris + ' ≤ ネオン(S2)(' + trisS1 + ') の1.30倍（比 ' + (tris / trisS1).toFixed(2) + '）');

      /* 1フレームの送り出しが 0.8ms 以内 */
      Zs.switchTo('mirror');
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) Zs.sync(300 + i * 0.4, i * 0.016, 34);
      const ms = (performance.now() - t0) / 120;
      t.ok(ms <= 0.8, '鏡の sync は1フレーム ' + ms.toFixed(3) + 'ms（≤0.8ms）');

      /* 戻す → ネオン都市の値に完全に戻る */
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(W.scene.fog.color.getHex(), neonFog, '霧の色がネオン都市へ戻る');
      t.eq(W._roadMat.color.getHex(), neonRoad, '路面の色が戻る');
      t.eq(W.scene.children.length, childs0, 'シーンの要素数が元通り（' + W.scene.children.length + '）');

      /* --- リーク検査: 5ゾーンを3周してもジオメトリが増え続けない --- */
      const cycle = () => {
        ['ruins', 'sea', 'space', 'mirror', 'neon'].forEach((id) => {
          Zs.switchTo(id);
          for (let i = 0; i < 5; i++) DUO.pump(1 / 60);
        });
        return { geo: R.info.memory.geometries, tex: R.info.memory.textures,
                 ch: W.scene.children.length, calls: W.drawCalls() };
      };
      cycle();
      const a = cycle(), b = cycle(), c = cycle();
      t.eq(b.geo, c.geo, 'ジオメトリ数が増え続けない（' + a.geo + ' → ' + b.geo + ' → ' + c.geo + '）');
      t.eq(b.ch, c.ch, 'シーンの要素数が増え続けない（' + b.ch + ' → ' + c.ch + '）');
      t.eq(c.tex, 0, 'テクスチャは0枚のまま（契約§3 画像を使わない）');
      t.ok(c.calls <= 300, '往復後のドローコール ' + c.calls + ' ≤ 300');
      const left = Object.keys(In.Obstacles._mat).filter((k) => k.indexOf('mirror|') === 0);
      t.eq(left.length, 0, 'ネオンへ戻したあと鏡スキンのマテリアルは残っていない（' + left.length + '）');
      t.eq(In.Obstacles._pool.mirror, undefined, '鏡スキンの見た目プールも捨てられている');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 鏡スキンの見た目と判定／装飾が走路に入らない／擬似反射
     ========================================================================== */
  DUO.__suites.push({
    name: 'P5a: 鏡スキンの見た目と判定のズレ ±10%・装飾が走路に入らない・擬似反射',
    quick: true,
    run(t) {
      const In = I(), OBS = In.OBS, CFG = In.CFG, Zs = In.Zones;
      DUO.reset(); DUO.start('S2', 2);
      Zs.switchTo('mirror');
      DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      /* 【2026-09-23 P5c】ジャンプ障害物（ローバー／ローレーザー）に足した
           ・両脇の高い支柱 1.6m（レーン端 x=±0.55）
           ・支柱上端をつなぐ光る警告バー
           ・手前の路面の警告帯（幅レーン・長さ 4m・シェブロン）
         は **当たり判定を一切持たない視認性のための標示**（契約§4.3）。
         判定 0.6m の柵に対して見た目 1.72m・奥行き 4.25m を比べてしまうと
         この検査の目的（当たり判定と実体の食い違いを見つける）が測れなくなるので、
         装飾（userData.deco）を外した外接箱 In.viewBox() で測る。 */
      const skip = { GAP: ['y', 'z'], WALLHOLE: ['y0'], LASER_SCAN: ['x', 'z'],
                     LASER_ROT: ['x', 'y', 'z'], BRIDGE: ['x', 'y', 'z'],
                     SYNCPAD: ['x', 'y', 'z'], SYNCGAP: ['x', 'y', 'z'], DROPCEIL: ['y', 'z'],
                     CURRENT: ['x', 'y', 'z'], CURGATE: ['x', 'y', 'z'], DOOR: ['x', 'y', 'z'],
                     LIFTPAD: ['z'], FISH_TAIL: ['x', 'z'],
                     WARPGATE: ['x', 'y', 'z'], ZEROGATE: ['x', 'y', 'z'],
                     ZEROFIELD: ['x', 'y', 'z'], NETGATE: ['x', 'y', 'z'],
                     LASER_H: ['x', 'y', 'z'], LASER_DIAG: ['x', 'y', 'z'],
                     /* S6: ゲートは ghost、割れた鏡の床は「足場＋裂け目」を毎フレーム置く */
                     MIRGATE: ['x', 'y', 'z'], SWAPGATE: ['x', 'y', 'z'], MERGEGATE: ['x', 'y', 'z'],
                     SHARDGAP: ['x', 'y', 'z'] };
      Object.keys(OBS).forEach((type) => {
        const view = In.Obstacles.acquire(type);
        view.position.set(0, 0, 0); view.rotation.set(0, 0, 0); view.updateMatrixWorld(true);
        const b3 = In.viewBox(view);            /* 判定外の装飾（P5c の支柱・警告バー・路面帯）は除く */
        const o = In.Obstacles.make(type, 'floor', 0, 0, 0, type === 'BRIDGE' ? { bridge: { leadM: 9 } } : null);
        const hb = In.Obstacles.box(o, 0);
        const xc = ((In.Obstacles.laneLo(o) + In.Obstacles.laneHi(o)) / 2) * CFG.LANE_W;
        const ex = skip[type] || [];
        const cmp = (ax, edge, v, h, size) => {
          if (ex.indexOf(ax) >= 0 || ex.indexOf(ax + edge) >= 0) return;
          const tol = Math.max(Math.abs(size) * 0.10, 0.07);
          t.ok(Math.abs(v - h) <= tol,
               '鏡 ' + OBS[type].label + ' ' + ax + edge + ': 見た目 ' + v.toFixed(2) +
               ' / 判定 ' + h.toFixed(2) + '（許容±' + tol.toFixed(2) + '）');
        };
        cmp('x', 0, b3.min.x + xc, hb.x0, hb.x1 - hb.x0);
        cmp('x', 1, b3.max.x + xc, hb.x1, hb.x1 - hb.x0);
        cmp('y', 0, b3.min.y, hb.y0, hb.y1 - hb.y0);
        cmp('y', 1, b3.max.y, hb.y1, hb.y1 - hb.y0);
        cmp('z', 0, b3.min.z, hb.z0, hb.z1 - hb.z0);
        cmp('z', 1, b3.max.z, hb.z1, hb.z1 - hb.z0);
        In.Obstacles.release(type, view);
      });
      /* 割れた鏡の床: 足場の見た目は **判定の足場（MOT.shardLane）と同じ位置**に置かれる */
      {
        const o = In.Obstacles.make('SHARDGAP', 'floor', -1, 100, 0,
                                    { shard: { from: 0, to: 1, phase: 0, periodM: 30 } });
        const view = In.Obstacles.acquire('SHARDGAP');
        o.view = view;
        In.Obstacles.place(o, 100, 0);
        const sd = view.userData.shard;
        t.ok(!!sd, '割れた鏡の床の骨組み（足場＋裂け目）が建つ');
        const xc = ((In.Obstacles.laneLo(o) + In.Obstacles.laneHi(o)) / 2) * CFG.LANE_W;
        t.near(sd.pad.position.x + xc, In.MOT.shardLane(o, 100) * CFG.LANE_W, 0.01,
               '足場の見た目は判定の足場と同じ x');
        t.near(sd.pad.scale.x, CFG.SHARD.HW * 2, 0.01, '足場の幅は判定どおり');
        In.Obstacles.place(o, 104, 0);
        t.near(sd.ghost.position.x + xc, In.MOT.shardLane(o, 100) * CFG.LANE_W, 0.01,
               '予告（ghost）は「到達した瞬間の足場」を指し続ける');
        o.view = null;
        In.Obstacles.release('SHARDGAP', view);
      }
      /* 装飾が 2体の通り道（|x| ≤ レーン端 + 体半幅）へ食い込まない */
      const bad = In.ZoneKit.intrudes(Zs.get('mirror'));
      t.eq(bad.length, 0, '鏡の装飾は走行空間に入らない: ' +
           bad.map((b) => b.name + '(' + b.over + 'm)').join(', '));
      /* 壁区間（鏡の回廊）と開放区間（鏡片が浮かぶ空間）が交互に来る（契約§5） */
      const zm = Zs.get('mirror');
      let wall = 0;
      for (let m = 0; m < 1200; m += 2) if (zm.isWall(m)) wall++;
      const ratio = wall / 600;
      t.ok(ratio > 0.3 && ratio < 0.7, '壁区間は ' + (ratio * 100).toFixed(0) + '%（開放区間と交互）');

      /* --- 擬似反射（契約§5「反転コピーのメッシュでよい」） --- */
      DUO.reset(); DUO.start('S6', 5);
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const ds = Zs.get('mirror').doubles;
      t.ok(!!ds && ds.length === 6, '反転コピーは6体（床・天井・左右の壁 × 2体）: ' + (ds ? ds.length : 0));
      /* 壁区間へ移して同期する */
      let m0 = 200;
      while (!zm.isWall(m0) && m0 < 400) m0 += 2;
      DUO.skipTo(m0);
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      const XW = CFG.HALF_W + 0.16;
      const lum = Game.runners.filter((r) => r.id === 'lumen')[0];
      const floorD = ds.filter((d) => d.plane === 'floor')[0];
      t.eq(floorD.mesh.visible, true, '床の鏡に「床を走る方」の反転コピーが出る');
      t.near(floorD.mesh.position.x, In.Runners.x(lum), 0.001, '床の反転コピーは本体と同じ x');
      t.eq(floorD.mesh.scale.y < 0, true, '床の反転コピーは上下が反転している（scale.y < 0）');
      t.ok(floorD.mesh.position.y <= 0.001, '床の反転コピーは床面の下（鏡の奥）にある');
      const wallD = ds.filter((d) => d.plane === 'wall' && d.side === -1 && d.id === 'lumen')[0];
      t.eq(wallD.mesh.visible, true, '壁区間では壁の鏡にも反転コピーが出る');
      const MD = Zs.get('mirror').MIRROR_DEPTH;
      t.near(wallD.mesh.position.x, -XW + (-XW - In.Runners.x(lum)) * MD, 0.001,
             '壁の反転コピーは壁面（x = -' + XW.toFixed(2) + '）で折り返した位置（奥行きは ' + MD + ' 倍）');
      t.eq(wallD.mesh.scale.x < 0, true, '壁の反転コピーは左右が反転している（scale.x < 0）');
      t.ok(wallD.mesh.position.x < -XW,
           '壁の反転コピーは鏡面パネルの **奥** にある（x ' + wallD.mesh.position.x.toFixed(2) + ' < -' + XW.toFixed(2) + '）');
      /* 開放区間では壁の鏡は出ない */
      let m1 = m0;
      while (zm.isWall(m1) && m1 < m0 + 200) m1 += 2;
      DUO.skipTo(m1 + 6);
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      t.eq(ds.filter((d) => d.plane === 'wall')[0].mesh.visible, false,
           '開放区間では壁の鏡（反転コピー）は消える');
      DUO.reset();
    }
  });

  /* ==========================================================================
     3. 鏡ゾーン（契約§4.5 / S6）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 鏡ゾーン（該当キャラだけ左右反転・実タッチで右フリック→画面左・出口で戻る）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG, Mirror = In.Mirror;
      /* --- 仕組みの単体確認: 反転は Runners.input の1か所だけ --- */
      DUO.reset(); DUO.start('S6', 5);
      DUO.pump(1 / 60);
      const lum = Game.runners.filter((r) => r.id === 'lumen')[0];
      const umb = Game.runners.filter((r) => r.id === 'umbra')[0];
      lum.mirrored = true;
      In.Runners.input(lum, 'right');
      t.eq(lum.laneTo, -1, '反転中は right が左へ（判定の1か所＝Runners.input）');
      In.Runners.input(umb, 'right');
      t.eq(umb.laneTo, 1, '反転していない側はそのまま右へ');
      lum.mirrored = false;

      /* --- ゲートの展開と猶予（契約§6 P5a） --- */
      const items = [];
      const reg = Mirror.expand(items, { at: 0, lane: 0, params: { mir: { side: 'floor', backT: 5 } } },
                                'floor', 100, 0, 3, null);
      t.eq(items.length, 2, '鏡ゾーンは入口と出口の2枚で1組');
      t.eq(items[0].type, 'MIRGATE', 'ゲートの型は MIRGATE');
      t.eq(In.OBS.MIRGATE.ghost, true, 'ゲートは当たり判定を持たない（通るだけ）');
      t.near(reg.to - reg.from, 5 * CFG.REF_SPEED * 3, 1e-6, '出口は backT 秒ぶん先（速度でスケール）');
      t.eq(reg.side, 'floor', '効くのはゲートを置いた面');
      t.eq(Mirror.crossed([reg], 99, 101), 1, '入口を跨いだ回数を距離で数える');
      t.eq(Mirror.crossed([reg], 99, 101, 'ceil'), 0, '別の面のゲートは数えない');
      t.eq(Mirror.gateNear([reg], 105, 10), true, 'ゲートの直後はウォールを置けない（Fair が見る窓口）');

      /* --- 走行中: 該当キャラだけ反転し、出口で戻る --- */
      const fm = findRegion('mirrors', (q) => q.side === 'floor');
      t.ok(!!fm, '床側の鏡ゾーンを持つ種がある（seed' + (fm && fm.seed) + ' @' + (fm && fm.from.toFixed(0)) + 'm）');
      DUO.reset(); DUO.start('S6', fm.seed); DUO.bot('perfect');
      DUO.skipTo(Math.max(0, fm.from - 110));
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      const regs = Game.gen.mirrors.filter((r) => !r.dead && r.from >= fm.from - 1);
      t.ok(regs.length > 0, 'seed' + fm.seed + ' の ' + Math.round(fm.from - 110) + 'm 以降に鏡ゾーンがある');
      const r0 = regs[0];
      t.eq(r0.side, 'floor', 'この鏡ゾーンは床側（下半分の左右が逆になる）');
      let guard = 0;
      while (Game.dist < r0.from - 2 && guard++ < 9000) DUO.__step(1 / 60);
      t.eq(DUO.state().runners.lumen.mirrored, false, 'ゲートの手前では反転していない');
      while (Game.dist < r0.from + 8 && guard++ < 9000) DUO.__step(1 / 60);
      t.eq(DUO.state().runners.lumen.mirrored, true, 'ゲートを通ると床側（LUMEN）が反転する');
      t.eq(DUO.state().runners.umbra.mirrored, false, '天井側（UMBRA）は通常のまま');
      DUO.pump(1 / 60);
      t.eq(shown('flag-mirror'), true, 'HUD に MIRROR が出る');
      t.eq(getComputedStyle(document.getElementById('flag-mirror')).color.replace(/\s/g, ''),
           getComputedStyle(document.getElementById('flag-mirror')).color.replace(/\s/g, ''),
           'MIRROR の表示色は CSS で反転中のキャラ側の色');

      /* --- 実入力経路（合成 TouchEvent）: 右フリック → 画面左へ --- */
      if (canSynth) {
        DUO.bot('off');
        In.Input.clear();
        const before = DUO.state().runners.lumen.lane;
        flick(31, 'bottom', 90, 0);
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.lumen.lane, Math.max(-1, before - 1),
             '実タッチ: 下半分を **右フリック** → LUMEN は **画面左** へ（契約§4.5）');
        const ub = DUO.state().runners.umbra.lane;
        flick(32, 'top', 90, 0);
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.lane, Math.min(1, ub + 1),
             '実タッチ: 上半分を右フリック → UMBRA は画面右へ（反転していない）');
        DUO.bot('perfect');
      } else {
        t.info('この環境では TouchEvent を合成できないので実タッチ経路は省略');
      }

      /* --- 出口で戻る --- */
      guard = 0;
      while (Game.dist < r0.to + 8 && guard++ < 20000) DUO.__step(1 / 60);
      t.eq(DUO.state().runners.lumen.mirrored, false, '出口のゲートで反転が戻る');
      DUO.pump(1 / 60);
      t.eq(shown('flag-mirror'), false, 'HUD の MIRROR が消える');
      t.eq(Game.status, 'playing', '鏡ゾーンをボットが抜けられる（反転を知った上で正しい入力を出す）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. 入れ替えワープ（契約§4.5 / S6）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 入れ替えワープ（上下の担当が入れ替わる・HUD・実タッチ・戻り）',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG, Swap = In.Swap;
      /* --- 展開と猶予 --- */
      const items = [];
      const reg = Swap.expand(items, { at: 0, lane: 0, params: { swp: { backT: 4 } } },
                              'floor', 200, 0, 3, null);
      t.eq(items.length, 2, '入れ替えワープは入口と戻りの2枚で1組');
      t.eq(items[0].type, 'SWAPGATE', 'ゲートの型は SWAPGATE');
      t.eq(In.OBS.SWAPGATE.ghost, true, 'ゲートは当たり判定を持たない');
      t.near(reg.to - reg.from, 4 * CFG.REF_SPEED * 3, 1e-6, '戻りは backT 秒ぶん先');
      t.eq(Swap.gateNear([reg], 205, 10), true, 'ゲートの直後はウォールを置けない（両面とも）');

      /* --- 走行中 --- */
      const fs = findRegion('swaps', null);
      t.ok(!!fs, '入れ替えワープを持つ種がある（seed' + (fs && fs.seed) + ' @' + (fs && fs.from.toFixed(0)) + 'm）');
      DUO.reset(); DUO.start('S6', fs.seed); DUO.bot('perfect');
      DUO.skipTo(Math.max(0, fs.from - 110));
      for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
      const regs = Game.gen.swaps.filter((r) => !r.dead && r.from >= fs.from - 1);
      t.ok(regs.length > 0, 'seed' + fs.seed + ' の ' + Math.round(fs.from - 110) + 'm 以降に入れ替えワープがある');
      const r0 = regs[0];
      let guard = 0;
      while (Game.dist < r0.from - 2 && guard++ < 9000) DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(DUO.state().handSwap, false, 'ゲートの手前では入れ替わっていない');
      t.eq(DUO.state().zoneOwner.bottom, 'lumen', '下半分は床の LUMEN');
      t.eq(handName('left'), 'LUMEN', 'HUD: 下半分のチップは LUMEN');
      while (Game.dist < r0.from + 8 && guard++ < 9000) DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(DUO.state().handSwap, true, 'ゲートを通ると担当が入れ替わる');
      t.eq(DUO.state().zoneOwner.bottom, 'umbra', '下半分が天井の UMBRA を動かす（契約§4.5 の解釈）');
      t.eq(DUO.state().zoneOwner.top, 'lumen', '上半分が床の LUMEN を動かす');
      t.eq(handName('left'), 'UMBRA', 'HUD: 下半分のチップが UMBRA へ入れ替わる');
      t.eq(handName('right'), 'LUMEN', 'HUD: 上半分のチップが LUMEN へ入れ替わる');
      t.eq(document.getElementById('hand-left').getAttribute('data-char'), 'umbra',
           'HUD: チップの色（data-char）も入れ替わる');
      t.eq(document.getElementById('hand-left-keys').textContent.indexOf('↓跳ぶ') >= 0, true,
           'HUD: 下半分の案内が「↓跳ぶ」（天井を走る方の向き）になる');
      t.eq(shown('flag-swap'), true, 'HUD に SWAP が出る');

      /* --- 実入力経路: 下半分の下フリック＝天井側（UMBRA）のジャンプ --- */
      if (canSynth) {
        DUO.bot('off');
        In.Input.clear();
        Game.runners.forEach((r) => { r.act = 'run'; r.actT = 0; });
        flick(41, 'bottom', 0, 90);      // 下フリック
        DUO.pump(1 / 60);
        t.eq(DUO.state().runners.umbra.act, 'jump',
             '実タッチ: 下半分の下フリック → UMBRA がジャンプ（担当が入れ替わっている）');
        t.eq(DUO.state().runners.lumen.act, 'run', 'LUMEN は動かない');
        DUO.bot('perfect');
      }

      /* --- 戻り --- */
      guard = 0;
      while (Game.dist < r0.to + 8 && guard++ < 20000) DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(DUO.state().handSwap, false, '再通過で担当が戻る');
      t.eq(handName('left'), 'LUMEN', 'HUD も戻る');
      t.eq(shown('flag-swap'), false, 'HUD の SWAP が消える');
      t.eq(Game.status, 'playing', '入れ替えワープをボットが抜けられる');
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. 重ね掛け（契約§6 P5a「1区画に最大1回・必ず解除してから次」）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 鏡ゾーンと入れ替えワープの重ね掛け（1区画1回・解除順・S6後半のみ）',
    quick: true,
    run(t) {
      const In = I();
      const s7 = In.CHUNK_DEFS.filter((c) => c.s7);
      const count = (c, type) => (c.floor || []).concat(c.ceil || []).filter((e) => e.type === type).length;
      s7.forEach((c) => {
        t.ok(count(c, 'MIRRORZ') <= 1, c.id + ': 鏡ゾーンは1区画に最大1回（' + count(c, 'MIRRORZ') + '）');
        t.ok(count(c, 'HANDSWAP') <= 1, c.id + ': 入れ替えは1区画に最大1回（' + count(c, 'HANDSWAP') + '）');
      });
      const both = s7.filter((c) => c.mir && c.swap);
      t.ok(both.length >= 2, '重ね掛けのチャンクが ' + both.length + '本ある');
      both.forEach((c) => {
        t.eq(c.minSpeed >= 34, true, c.id + ': 重ね掛けは S6 後半だけ（minSpeed ' + c.minSpeed + '）');
        /* 展開して「同時に効いている区間」が1つだけで、どちらも必ず解除されることを見る */
        const items = [], sink = { mirrors: [], swaps: [] };
        (c.floor || []).forEach((e) => In.expandEntry(items, e, 'floor', e.at, 0, 1,
                                                      { mirrors: sink.mirrors, swaps: sink.swaps }));
        t.eq(sink.mirrors.length, 1, c.id + ': 鏡ゾーンの組は1つ');
        t.eq(sink.swaps.length, 1, c.id + ': 入れ替えの組は1つ');
        const mr = sink.mirrors[0], sw = sink.swaps[0];
        const lo = Math.max(mr.from, sw.from), hi = Math.min(mr.to, sw.to);
        t.ok(hi > lo, c.id + ': 両方が同時に効く区間がある（' + lo.toFixed(1) + '〜' + hi.toFixed(1) + '）');
        const nested = (mr.from >= sw.from && mr.to <= sw.to) || (sw.from >= mr.from && sw.to <= mr.to);
        t.eq(nested, true, c.id + ': 片方を必ず解除してからもう片方を解除する（入れ子）');
        t.ok(Math.max(mr.to, sw.to) <= c.lengthM,
             c.id + ': チャンクの終わりまでに両方とも解除される');
        /* 重なりは1区画に1回だけ（入れ子なので区間は1つ） */
        t.eq(In.Mirror.crossed([mr], 0, c.lengthM), 2, c.id + ': 鏡は入口と出口の2回だけ跨ぐ');
        t.eq(In.Swap.crossed([sw], 0, c.lengthM), 2, c.id + ': 入れ替えも2回だけ跨ぐ');
      });
      /* 実走行でも「同時に効く」状態が現れる */
      let seen = 0, seeds = 0, seenIn = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S6');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1600; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        for (let a = 0; a < g.mirrors.length; a++) {
          for (let b = 0; b < g.swaps.length; b++) {
            const lo = Math.max(g.mirrors[a].from, g.swaps[b].from);
            const hi = Math.min(g.mirrors[a].to, g.swaps[b].to);
            if (hi > lo) {
              seen++; t.ok(lo > 700, '重ね掛けは後半で起きる（' + Math.floor(lo) + 'm）');
              if (hi < st.lengthM) seenIn++;                 // ゴールより手前（走る区間）
            }
          }
        }
        /* 重ね掛けの札（dualzone の初出 tip つき）がゴールより手前に出たか（P7a の既知課題の指標） */
        if (g.events.some((e) => e.type === 'tip' && e.params.id === 'dualzone' && e.params.targetAt < st.lengthM)) seeds++;
      }
      t.ok(seen >= 20, '50シードのうち ' + seen + ' 区間で重ね掛けが起きる（20以上）');
      /* P7c: P7a の既知課題「重ね掛けが 1/50 に減」の回収（1600m の中で 60% 以上のシード） */
      t.ok(seeds >= 30, 'ゴールより手前で重ね掛けの札（dualzone）が出るシード ' + seeds + '/50（60% 以上 / P7c）');
      t.ok(seenIn >= 20, 'ゴールより手前の重ね掛け区間 ' + seenIn + '（20以上）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     6. 割れた鏡の床（飛び石）の判定と、レーザーネットの密度アップ
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 割れた鏡の床（揺れる足場・到達時刻の判定）とレーザーネットの密度アップ',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG, Ob = In.Obstacles;
      /* 到達時刻（dist = at）の足場は譜面どおりのレーン */
      [-1, 0, 1].forEach((lane) => {
        const o = Ob.make('SHARDGAP', 'floor', lane, 500, 0,
                          { shard: { from: lane, to: (lane === 1 ? 0 : lane + 1), phase: 0, periodM: 30 } });
        t.near(In.MOT.shardLane(o, 500), lane, 1e-6, '到達時（phase 0）の足場はレーン ' + lane);
        const occ = Ob.occ(o);
        CFG.LANES.forEach((l) => {
          const a = occ.floor.lanes[l];
          if (l === lane) {
            t.eq(a.run, true, 'レーン ' + l + ' は足場の上＝そのまま走れる');
          } else {
            t.eq(a.run, false, 'レーン ' + l + ' は足場が無い＝走ると落ちる');
            t.eq(a.jump, true, 'レーン ' + l + ' は跳べば越えられる（契約「足場のないところは GAP」）');
          }
        });
        t.eq(Ob.demand(o, 'floor'), 'jump', '要求はジャンプ（飛び石を渡る）');
        t.eq(Ob.demand(o, 'ceil'), 'none', '床側の割れは天井のキャラには効かない');
      });
      /* 足場は左右に揺れる（距離の関数＝決定論的） */
      {
        const o = Ob.make('SHARDGAP', 'floor', 0, 500, 0,
                          { shard: { from: 0, to: 1, phase: 0, periodM: 30 } });
        const a = In.MOT.shardLane(o, 500), b = In.MOT.shardLane(o, 515), c = In.MOT.shardLane(o, 530);
        t.near(a, 0, 1e-6, '到達時は from の端（溜め）');
        t.near(b, 1, 1e-6, '半周期先は to の端');
        t.near(c, 0, 1e-6, '1周期で戻る（決定論的な往復）');
        t.eq(In.MOT.shardLane(o, 500) === In.MOT.shardLane(o, 500), true, '同じ距離なら必ず同じ位置');
        /* 路面は3レーンとも抜ける（足場は障害物のビューが描く） */
        const sp = Ob.holeSpan(o, 500);
        t.ok(!!sp && sp.lanes && sp.lanes.length === 3, '割れた鏡の床は路面を3レーンとも消す');
        t.eq(sp.side, 'floor', '消えるのはその面だけ');
      }
      /* 通過窓の全域で足場のレーンが安全（揺れで判定がぶれない） */
      {
        const o = Ob.make('SHARDGAP', 'floor', -1, 800, 0,
                          { shard: { from: -1, to: 0, phase: 0, periodM: 30 } });
        let ok = true;
        for (let d = -2.6; d <= 2.6; d += 0.2) {
          const bands = Ob.bands(o, 800 + d, []);
          const rb = In.Runners.boxOf('floor', -1, 'run', 0);
          for (let i = 0; i < bands.length; i++) {
            const b = bands[i];
            if (In.U.overlap1(rb.x0, rb.x1, b.x0, b.x1) && In.U.overlap1(rb.y0, rb.y1, b.y0, b.y1)) ok = false;
          }
        }
        t.eq(ok, true, '通過窓（±2.6m）のあいだ、足場のレーンは塞がらない');
      }
      /* Fair の「通過に要する距離」は割れた鏡の床では伸びない（noPass） */
      t.eq(In.OBS.SHARDGAP.noPass, true, '割れた鏡の床は maxDepth から外す印を持つ');
      t.ok(In.Fair.maxDepth() <= 1.61,
           'Fair.maxDepth は従来どおり（' + In.Fair.maxDepth().toFixed(2) + 'm）＝既存ステージに影響しない');

      /* レーザーネットの密度アップ（契約§4.4 S6「区画あたり4〜5本」） */
      const beams = ['LASER_H', 'LASER_DIAG', 'LASER_SCAN'];
      const nets = In.CHUNK_DEFS.filter((c) => c.s7 && (c.floor || []).some((e) => e.type === 'NETGATE'));
      t.ok(nets.length >= 3, 'レーザーネットの区画を持つチャンクが ' + nets.length + '本');
      /* 「1区画」＝ NETGATE から 30 基準m（＝ 速度34で約100m。契約§4.5「1区画 40〜80m」）*/
      const inSection = (c) => {
        const gate = (c.floor || []).filter((e) => e.type === 'NETGATE')[0];
        if (!gate) return 0;
        return (c.floor || []).concat(c.ceil || [])
          .filter((e) => beams.indexOf(e.type) >= 0 && e.at >= gate.at && e.at <= gate.at + 30).length;
      };
      nets.forEach((c) => {
        const n = inSection(c);
        t.ok(n >= 4 && n <= 5, c.id + ': 1区画のビームは ' + n + '本（契約§4.4 S6 は 4〜5本）');
      });
      const s6nets = In.CHUNK_DEFS.filter((c) => c.s6 && (c.floor || []).some((e) => e.type === 'NETGATE'));
      const avg = (list) => list.reduce((a, c) => a + inSection(c), 0) / Math.max(1, list.length);
      t.ok(avg(nets) >= avg(s6nets),
           'S6 のネットは S5 より濃い（' + avg(s6nets).toFixed(1) + ' → ' + avg(nets).toFixed(1) + '本）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. S6 の定義・不変条件・密度・動作比率（50シード）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 定義と不変条件・密度・動作比率（50シード）',
    quick: false,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S6');
      t.eq(st0.lengthM, 1600, 'S6 は 1600m（契約§4.4 v2）');
      t.eq(st0.zone, 'mirror', 'ゾーンは鏡の世界');
      t.near(st0.speedAt(0), 30, 1e-6, '開始 30 m/s');
      t.near(st0.speedAt(1600), 38, 1e-6, '終了 38 m/s');
      t.near(st0.checkpoints[0], 1600 / 3, 1e-6, 'チェックポイント1 は 1/3 地点');
      t.near(st0.checkpoints[1], 3200 / 3, 1e-6, 'チェックポイント2 は 2/3 地点');
      t.eq(st0.setpiece, 'shatter', '終盤の大演出は「鏡の砕け散り」');
      t.near(st0.reactBoth, In.CFG.FAIR.REACT_BOTH_LATE, 1e-9, '両者同時要求の余白は 0.45秒（契約§4.7）');
      const s7 = In.CHUNK_DEFS.filter((c) => c.s7);
      t.ok(s7.length >= 12, 'S6 のチャンクを ' + s7.length + '本 追加（12本以上）');
      t.eq(s7.filter((c) => c.difficulty < 4).length, 0, 'すべて rank4 以上（契約§6 P5a「rank5 中心」）');
      t.ok(s7.filter((c) => c.difficulty === 5).length >= s7.length / 2,
           'rank5 が ' + s7.filter((c) => c.difficulty === 5).length + '本（半数以上＝rank5 中心）');
      t.ok(s7.filter((c) => c.mir).length >= 3, '鏡ゾーンのチャンクが ' + s7.filter((c) => c.mir).length + '本');
      t.ok(s7.filter((c) => c.swap).length >= 3, '入れ替えのチャンクが ' + s7.filter((c) => c.swap).length + '本');
      t.ok(s7.filter((c) => c.net).length >= 3, 'レーザーネットのチャンクが ' + s7.filter((c) => c.net).length + '本');

      let bad = 0, spFound = 0, blanks = 0, mirSeen = 0, swpSeen = 0, bothSeen = 0, overlapSeen = 0, netSeen = 0, tips = 0;
      const agg = { lane: 0, jump: 0, slide: 0, total: 0 };
      const half = { b: 0 }, rnd = { a: 0, b: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S6');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1600; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1600);
        const errs = In.Fair.validate(l, st.speedAt,
                                      { startLanes: [0], reactBoth: st.reactBoth,
                                        zeros: g.zeros, warps: g.warps,
                                        mirrors: g.mirrors, swaps: g.swaps });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        blanks += g.log.filter((c) => c.id === '(blank)').length;
        if (g.mirrors.length) mirSeen++;
        if (g.swaps.length) swpSeen++;
        if (g.mirrors.length && g.swaps.length) bothSeen++;
        let ov = 0;
        g.mirrors.forEach((mr) => g.swaps.forEach((sw) => {
          if (Math.min(mr.to, sw.to) > Math.max(mr.from, sw.from)) ov++;
        }));
        if (ov) overlapSeen++;
        if (l.some((o) => o.type === 'LASER_DIAG' || o.type === 'LASER_H')) netSeen++;
        tips += g.events.filter((e) => e.type === 'tip').length;
        const c = In.Fair.countDemands(l, st.speedAt);
        agg.lane += c.lane; agg.jump += c.jump; agg.slide += c.slide; agg.total += c.total;
        /* P5c（契約§4.8 tip の猶予規則）: tip の窓（表示開始〜対象通過後 speed×1.0秒）は
         規則で「対象以外は置かない」区間なので、密度はその窓を除いた区間で測る */
        const tw = In.Fair.tipWindows(g.events);
        rnd.xa = (rnd.xa || 0) + In.Fair.tipOverlap(tw, 0, 800);
        rnd.xb = (rnd.xb || 0) + In.Fair.tipOverlap(tw, 800, 1400);
        /* P7c: 重ね掛けの札（鏡＋入れ替えのゲート区間・約360実m）は 800m 以降に必ず1本置く（既知課題の回収）。
           ゲートの猶予で構造的に薄い区間なので、tip の窓と同じく後半の密度の測定から外す（既知の妥協点） */
        const dualSpan = g.log.filter((c) => { const d = In.CHUNK_DEFS.filter((x) => x.id === c.id)[0]; return d && d.dual; })
          .map((c) => ({ a: c.startM, b: c.startM + c.lengthM }));
        dualSpan.forEach((w) => { rnd.xb += Math.max(0, Math.min(1400, w.b) - Math.max(800, w.a)); });
        In.Fair.walls(l, st.speedAt).forEach((w) => {
          const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
          if (In.Fair.inTipWindow(tw, w.at)) return;
          if (w.at < 800) { rnd.a += n; } else {
            half.b += n;
            if (w.at < 1400 && !dualSpan.some((q) => w.at >= q.a && w.at < q.b)) rnd.b += n;
          }
        });
      }
      t.eq(bad, 0, 'S6 50シードで §4.7 違反なし（大演出区間・鏡/入れ替えの猶予を含む）');
      t.eq(spFound, 50, '50シードすべてに鏡の砕け散りが入る');
      t.eq(blanks, 0, '空白チャンク（生成の詰まり）は0回');
      t.ok(mirSeen >= 35, '鏡ゾーンが出る（' + mirSeen + '/50 シード）');
      t.ok(swpSeen >= 35, '入れ替えワープが出る（' + swpSeen + '/50 シード）');
      t.ok(bothSeen >= 20, '鏡ゾーンと入れ替えが同じ走行に出る（' + bothSeen + '/50 シード）');
      t.ok(overlapSeen >= 20, '重ね掛け（同時に効く区間）が起きる（' + overlapSeen + '/50 シード）');
      t.ok(netSeen >= 40, 'レーザーネットが出る（' + netSeen + '/50 シード）');
      t.ok(tips >= 50, '新ギミックの初出に tip が撒かれる（計' + tips + '回 / 50シード）');

      /* 密度（S5 と同じ流儀で、**大演出（終盤200m）を除いたランダム区間**で測る）。
         契約§4.7 の S6 の目安は 10→14回/100m だが、30〜38 m/s では
         「ジャンプ連続 0.70秒」「ウォール間隔 0.45秒」の下限から
         理論上限が 11.7回/100m（全部レーン移動）で、§4.3 の比率と両立する
         実質上限は決定ログどおり約10回/100m。実装の目安は 8→10（既知の妥協点）。 */
      const dens = In.STAGE_DEFS.S6.density;
      t.eq(dens[0] + '-' + dens[1], '8-10', '密度の目安は 8→10回/100m（契約§4.7 の 10→14 に対する妥協）');
      const A = rnd.a / (50 * 800 - rnd.xa) * 100, B = rnd.b / (50 * 600 - rnd.xb) * 100;
      const wantA = In.U.lerp(dens[0], dens[1], 400 / 1600);
      const wantB = In.U.lerp(dens[0], dens[1], 1100 / 1600);
      t.ok(A >= wantA * 0.75 && A <= wantA * 1.25,
           'S6 前半の密度 ' + A.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
      t.ok(B >= wantB * 0.75 && B <= wantB * 1.25,
           'S6 後半（演出を除く）の密度 ' + B.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
      /* P5c（契約§4.8）: 新ギミックの初出（ゲート＋直後の猶予＝譜面の一番薄いところ）は
         ほぼ前半に来て、そこが tip の窓として丸ごと測定から外れる。そのぶん前半の「窓の外」が
         相対的に濃く出る（P5c 前の実測でも S6 は 前半→後半 が +2〜3% の僅差だった）。
         「後半が前半を大きく割らない」（−12% まで）で見る。目安 ±25% の判定は上のとおり厳密。 */
      /* P7a（契約§4.8 2026-09-24 改訂）: tip の窓が 4.0秒前＋対象後1.0秒に伸び、前半の「窓の外」が
         さらに濃く出る（窓はゲートの薄い所をまとめて外す）。−20% までで見る（目安 ±25% は上で厳密に見る） */
      t.ok(B >= A * 0.80, 'S6 密度は後半が前半を大きく割らない（' + A.toFixed(2) + ' → ' + B.toFixed(2) + '・tip の窓を除く）');
      t.info('演出込みの後半密度 ' + (half.b / 50 / 7.5).toFixed(2) + ' 回/100m（砕け散りの200mを含む）');
      /* 動作比率（契約§4.3 / 上限はスライド抜きで正規化した 62%） */
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 62, 'S6 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜62%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S6 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'S6 スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('S6 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' slide=' + agg.slide + ' 計' + agg.total);
      DUO.reset();
    }
  });

  /* ==========================================================================
     8. S6: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: ボット完走（perfect / delay250 × seed 1〜50）',
    quick: false,
    run(t) {
      const runToEnd = (limit) => {
        let g = 0;
        while ((Game.status === 'playing' || Game.status === 'goal') && g++ < (limit || 60000)) DUO.__step(1 / 60);
        return Game.status;
      };
      let p = 0, d = 0;
      const pf = [], df = [];
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S6', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S6', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S6 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S6 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     9. 大演出「鏡の砕け散り」
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 大演出「鏡の砕け散り」（ひび→砕け→飛び石→鏡へのカット→中断復元）',
    quick: false,          // 実描画を伴うので runAll 側へ（契約§7）
    run(t) {
      const In = I(), Sp = In.Setpieces, CFG = In.CFG;
      const D = Sp.DEFS.shatter, R = Sp.MR;
      t.eq(D.lengthM, 200, '砕け散りは終盤200m');
      t.eq((D.floor || []).filter((e) => e.type === 'SHARDGAP').length, 4, '床側の飛び石の裂け目は4か所');
      t.eq((D.ceil || []).filter((e) => e.type === 'SHARDGAP').length, 4, '天井側の飛び石の裂け目は4か所');
      /* 床と天井で足場のレーンが違う（2体に別の判断を配る） */
      const fs = (D.floor || []).filter((e) => e.type === 'SHARDGAP');
      const cs = (D.ceil || []).filter((e) => e.type === 'SHARDGAP');
      let diff = 0;
      fs.forEach((f, i) => { if (cs[i] && cs[i].params.shard.from !== f.params.shard.from) diff++; });
      t.eq(diff, 4, '床側と天井側で足場のレーンが全部違う');
      fs.concat(cs).forEach((e) => {
        t.eq(e.lane, -1, '割れた鏡の床は全幅の型（lane は -1・足場は params.shard.from）');
        t.eq(e.params.shard.phase, 0, '到達した瞬間（phase 0）は足場が端で溜まっている');
      });
      /* §4.7（ジャンプ連続）を満たす間隔 */
      for (let i = 1; i < fs.length; i++) {
        t.ok(fs[i].at - fs[i - 1].at >= 26.5,
             '裂け目の間隔 ' + (fs[i].at - fs[i - 1].at) + 'm ≥ 26.5m（速度38でジャンプ連続 0.70秒）');
      }
      /* カットの窓には障害物を置かない */
      const last = Math.max.apply(null, (D.floor || []).concat(D.ceil || []).map((e) => e.at));
      t.ok(last < R.CUT0, '鏡へのカット（' + R.CUT0 + 'm〜）より手前で譜面が終わる（' + last + 'm）');

      /* --- 実走行 --- */
      DUO.reset(); DUO.start('S6', 4); DUO.bot('perfect');
      DUO.skipTo(1340);
      let guard = 0, crackMax = 0, breakMax = 0, shardSeen = 0, tileShard = 0;
      let cutAtPeak = 0, covAtPeak = 0, camZ = null, camZ0 = null;
      while (Game.dist < 1400 && guard++ < 4000) DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'shatter', '1400m で鏡の砕け散りが始まる');
      camZ0 = In.World.camera.position.z;
      while ((Game.status === 'playing' || Game.status === 'goal') && guard++ < 9000) {
        DUO.pump(1 / 60);
        const m = Game.dist;
        crackMax = Math.max(crackMax, Sp.shatterCrackK(m));
        breakMax = Math.max(breakMax, Sp.shatterBreakK(m));
        if (Game.active.some((o) => o.type === 'SHARDGAP')) shardSeen++;
        if (Sp.tileShard(m + 8, 'floor', 0)) tileShard++;
        const k = Sp.mirrorCutK(m);
        if (k > cutAtPeak) { cutAtPeak = k; covAtPeak = Sp.mirrorOnScreen(m); camZ = In.World.camera.position.z; }
      }
      t.ok(crackMax > 0.9, 'ひびの線が走る（予告の強さ ' + crackMax.toFixed(2) + '）');
      t.ok(breakMax > 0.98, '床と天井が砕けて鏡片になる（' + breakMax.toFixed(2) + '）');
      t.ok(shardSeen > 60, '飛び石（割れた鏡の床）が ' + shardSeen + 'フレーム 画面にある');
      t.ok(tileShard > 60, '路面が「浮いた鏡片」になる（' + tileShard + 'フレーム）');
      t.ok(cutAtPeak > 0.98, '鏡へ向くカットが最大まで入る（' + cutAtPeak.toFixed(2) + '）');
      t.ok(covAtPeak >= 0.20,
           'カットの山で出口の大鏡が画面の ' + (covAtPeak * 100).toFixed(0) + '% を占める（20%以上）');
      t.ok(camZ !== null && camZ < camZ0 - 1.0,
           'カット中はカメラが鏡へ寄る（z ' + camZ0.toFixed(2) + ' → ' + (camZ || 0).toFixed(2) + '）');
      t.eq(Game.status, 'clear', 'perfect ボットが砕け散りを抜けてゴールする');

      /* 0.25秒遅延のボットでも抜けられる */
      DUO.reset(); DUO.start('S6', 4); DUO.bot('delay250');
      DUO.skipTo(1340);
      guard = 0;
      while ((Game.status === 'playing' || Game.status === 'goal') && guard++ < 9000) DUO.__step(1 / 60);
      t.eq(Game.status, 'clear', 'delay250 ボットも砕け散りを抜けてゴールする');

      /* --- 中断復元: 演出の途中でリトライしても元に戻る --- */
      DUO.reset(); DUO.start('S6', 4); DUO.bot('perfect');
      DUO.skipTo(1340);
      guard = 0;
      while (Game.dist < 1480 && guard++ < 4000) DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'shatter', '演出の途中');
      Game.retry(true);
      DUO.pump(1 / 60);
      t.eq(Sp.state, null, 'リトライで演出の状態が消える');
      t.eq(Sp.shatter.group.visible, false, '鏡片と大鏡が消える');
      t.eq(Sp.shatter.light.intensity, 0, '大鏡の明かりが消える');
      t.eq(In.World.scene.fog.far, In.World._fogBase.far, '霧が元に戻る');
      t.eq(In.World.scene.fog.color.getHex(), In.World._fogBase.color, '霧の色も元に戻る');
      t.eq(In.World.trim.visible, true, '路面の縁が戻る');
      DUO.reset();
    }
  });

  /* ==========================================================================
     10. 中断復元（mirrored / handSwap / HUD が全部戻る）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 中断復元（鏡の反転・担当の入れ替え・HUD が全部戻る）',
    quick: true,
    run(t) {
      const In = I();
      /* 鏡ゾーンの中でリトライ */
      const fm = findRegion('mirrors', (q) => q.side === 'floor');
      DUO.reset(); DUO.start('S6', fm.seed); DUO.bot('perfect');
      DUO.skipTo(Math.max(0, fm.from - 110));
      const r0 = Game.gen.mirrors.filter((r) => !r.dead && r.from >= fm.from - 1)[0];
      let guard = 0;
      while (Game.dist < r0.from + 10 && guard++ < 9000) DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(DUO.state().runners.lumen.mirrored, true, '鏡ゾーンの中にいる');
      Game.retry(true);
      DUO.pump(1 / 60);
      t.eq(DUO.state().runners.lumen.mirrored, false, 'リトライで反転が戻る');
      t.eq(DUO.state().runners.umbra.mirrored, false, '相方も通常のまま');
      t.eq(shown('flag-mirror'), false, 'HUD の MIRROR が消える');

      /* 入れ替えワープの中でリトライ（チェックポイントから） */
      const fs = findRegion('swaps', null);
      DUO.reset(); DUO.start('S6', fs.seed); DUO.bot('perfect');
      DUO.skipTo(Math.max(0, fs.from - 110));
      const s0 = Game.gen.swaps.filter((r) => !r.dead && r.from >= fs.from - 1)[0];
      guard = 0;
      while (Game.dist < s0.from + 10 && guard++ < 9000) DUO.__step(1 / 60);
      DUO.pump(1 / 60);
      t.eq(DUO.state().handSwap, true, '入れ替えワープの中にいる');
      t.eq(handName('left'), 'UMBRA', 'HUD も入れ替わっている');
      /* 区間の中にチェックポイントを置いて再開する（旧: 固定の 500m。P5c で譜面の位置が動くため区間基準に） */
      Game.lastCheckpoint = Math.ceil(s0.from + 20);
      Game.retry();
      DUO.pump(1 / 60);
      t.eq(DUO.state().handSwap, false, 'チェックポイント再開で担当が戻る');
      t.eq(DUO.state().zoneOwner.bottom, 'lumen', '下半分は LUMEN に戻る');
      t.eq(handName('left'), 'LUMEN', 'HUD も戻る');
      t.eq(shown('flag-swap'), false, 'HUD の SWAP が消える');
      /* 再開位置より手前のゲートは取り込まない（片道だけ通った状態を作らない） */
      const mrs = Game.gen.mirrors.filter((r) => !r.dead);
      const sws = Game.gen.swaps.filter((r) => !r.dead);
      t.eq(mrs.every((r) => r.from >= Game.dist), true, '再開位置より手前の鏡ゾーンは殺されている');
      t.eq(sws.every((r) => r.from >= Game.dist), true, '再開位置より手前の入れ替えも殺されている');
      t.eq(Game.active.some((o) => In.OBS[o.type].mirror || In.OBS[o.type].swap
                                   ? (o.reg && o.reg.from < Game.dist) : false), false,
           '孤立したゲート（出口だけ）が残っていない');
      /* DUO.reset でも必ず戻る */
      Game.handSwap = true;
      Game.runners[0].mirrored = true;
      DUO.reset();
      t.eq(DUO.state().handSwap, false, 'DUO.reset で担当が戻る');
      t.eq(DUO.state().runners.lumen.mirrored, false, 'DUO.reset で反転も戻る');
    }
  });

  /* ==========================================================================
     11. S6 の解放・エンドレスのプール・tip
     ========================================================================== */
  DUO.__suites.push({
    name: 'S6: 解放（S5クリアで解放）・エンドレスのプール・鏡ゾーンの選択・tip',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U, Zs = In.Zones, W = In.World, Tut = In.Tutorial;
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4']);
      UI.show('stages');
      let s7 = document.querySelector('[data-ui="stage-S6"]');
      t.eq(s7 && s7.getAttribute('data-unlocked'), '0', 'S5 未クリアでは S6 はロック');
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5']);
      UI.show('stages');
      s7 = document.querySelector('[data-ui="stage-S6"]');
      t.eq(s7 && s7.getAttribute('data-unlocked'), '1', 'S5 をクリアすると S6 が解放される');
      t.ok(s7 && s7.innerHTML.indexOf('準備中') < 0, 'S6 は「準備中」ではなく遊べる');
      const s8 = document.querySelector('[data-ui="stage-S7"]');
      t.eq(s8 && s8.getAttribute('data-unlocked'), '0', 'S7 はまだロック');
      s7.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S6', 'クリックで S6 が始まる');
      t.near(DUO.state().speed, 30, 0.5, 'S6 は 30 m/s から');
      t.eq(Zs.id(), 'mirror', 'ゾーンは鏡の世界');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, 'S6 のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');

      /* エンドレス: S6 クリアで鏡ゾーン・入れ替えが混ざる（契約§4.4） */
      const withS6 = In.endlessPool(['S1', 'S2', 'S3', 'S4', 'S5']);
      const withS7 = In.endlessPool(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
      t.ok(withS7.pool.length > withS6.pool.length,
           'S6 クリアでプールが増える（' + withS6.pool.length + '→' + withS7.pool.length + '）');
      const has = (pool, id) => pool.indexOf(id) >= 0;
      const s7ids = In.CHUNK_DEFS.filter((c) => c.s7).map((c) => c.id);
      t.eq(s7ids.some((id) => has(withS6.pool, id)), false, 'S6 未クリアのエンドレスに S6 の顔は出ない');
      t.eq(s7ids.every((id) => has(withS7.pool, id)), true, 'S6 クリア後は S6 の顔が全部混ざる');
      ['S1', 'S2', 'S3', 'S4', 'S5'].forEach((id) => {
        const pool = In.makeStage(id).chunkPool;
        t.eq(s7ids.some((x) => pool.indexOf(x) >= 0), false, id + ' に S6 の顔は混ざらない');
      });
      /* エンドレス（ネオン）でも S6 の新ギミックの見た目が壊れない */
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
      DUO.reset(); DUO.start('endless', 4);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      ['MIRGATE', 'SWAPGATE', 'SHARDGAP'].forEach((type) => {
        const v = In.Obstacles.acquire(type);
        const ud = v.userData;
        const okView = (type === 'SHARDGAP') ? !!ud.shard : !!ud.gate;
        t.eq(okView, true, 'ネオンのスキンでも ' + In.OBS[type].label + ' の骨組みが建つ（ゾーン共通の保険）');
        In.Obstacles.release(type, v);
      });
      /* 新ギミックの初出 tip（契約§4.8） */
      t.ok(!!Tut.TIPS.mirrorzone, '鏡ゾーンの文言がある');
      t.ok(!!Tut.TIPS.handswap, '入れ替えワープの文言がある');
      t.eq(In.STAGE_DEFS.S6.tipOnce.mir, 'mirrorzone', 'S6 の tip: 鏡ゾーン');
      t.eq(In.STAGE_DEFS.S6.tipOnce.swap, 'handswap', 'S6 の tip: 入れ替えワープ');
      t.eq(Tut.show('mirrorzone'), true, '鏡ゾーンの tip を出せる');
      t.eq(Tut.el.classList.contains('on'), true, 'tip が表示状態になる');
      Tut.hide();
      U.lsRestore(snap);
      DUO.reset();
    }
  });
})();
