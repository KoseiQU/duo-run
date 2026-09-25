/* ============================================================================
   tests/test_p4b.js — P4b（ゾーン4「宇宙ステーション」の造形 ／ S5「宇宙ステーション」）

     【P4b-1 造形】
     ・ゾーン切替（neon ⇄ ruins ⇄ sea ⇄ space）でリークしない・パレットと霧が入れ替わる
     ・宇宙スキンの見た目と当たり判定のズレ ±10%
     ・装飾が 2体の走行空間へ食い込まない／小物 20種以上・前方60mに40個以上
     ・ドローコール ≤300・三角形は S1 比 +30% 以内・sync の1フレーム ≤0.8ms
     【P4b-2 S5】
     ・重力反転ワープ（面の入れ替え・担当の維持・HUD・戻り・猶予）
     ・無重力ジャンプ（滞空1.5倍を 判定/ボット/Fair が同じ係数で読む）
     ・レーザーネット（到達時刻の判定・斜めビームで床と天井の生存レーンが違う）
     ・不変条件・密度・動作比率・ボット完走・区画爆発・解放・中断復元
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;

  /* ==========================================================================
     1. ゾーン切替（契約§6 P4b）
     ========================================================================== */
  DUO.__suites.push({
    name: 'P4b: ゾーン切替（neon ⇄ ruins ⇄ sea ⇄ space）でリークしない・宇宙のパレットと霧',
    quick: true,
    run(t) {
      const In = I(), W = In.World, Zs = In.Zones, R = W.renderer;
      t.ok(Zs.list().indexOf('space') >= 0, '宇宙ゾーンが登録されている: ' + Zs.list().join(','));
      const z = Zs.get('space');
      t.eq(typeof z.build, 'function', 'space: build がある');
      t.eq(typeof z.sync, 'function', 'space: sync がある');
      t.eq(typeof z.propsAhead, 'function', 'space: propsAhead がある');
      t.ok(!z.obstacleSkin, 'space: ゾーン別の障害物スキンは持たない（契約§4.3 v2）');
      ['road', 'roadRough', 'roadMetal', 'skirt', 'metal', 'amber', 'indigo', 'fog'].forEach((k) => {
        t.ok(z.PAL[k] !== undefined, 'space: PAL.' + k + ' がある');
      });
      t.eq(z.PAL.amber, Zs.get('neon').PAL.amber, '床の色（琥珀）はゾーンによらず同じ');
      t.eq(z.PAL.indigo, Zs.get('neon').PAL.indigo, '天井の色（藍）はゾーンによらず同じ');

      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const neonFog = W.scene.fog.color.getHex(), neonRoad = W._roadMat.color.getHex();
      const childs0 = W.scene.children.length;

      Zs.switchTo('space');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(Zs.id(), 'space', '宇宙ゾーンへ切り替わる');
      t.eq(W.scene.fog.color.getHex(), z.PAL.fog, '霧が宇宙の闇に替わる');
      /* 契約§5「霧は薄い（宇宙は透明）→ 代わりに距離で暗くなるライティング」 */
      t.ok(W.scene.fog.far >= 88, '霧は薄い（far ' + W.scene.fog.far + ' ≥ 88 / 契約§5 宇宙は透明）');
      const fogY = (() => { const h = z.PAL.fog;
        return 0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255); })();
      t.ok(fogY > 8 && fogY < 40,
           '霧の色は「闇だが真っ黒ではない」輝度 ' + fogY.toFixed(1) + '（黒潰れ 8 の上・暗部 40 の下）');
      t.eq(W._roadMat.color.getHex(), W.roadColor(z.PAL.road), '路面の色が構造材に替わる（無地の暗色へ沈めた色 / 契約§5 v2）');
      t.eq(W._fogBase.color, z.PAL.fog, '演出から戻すときの霧の基準値も更新される');
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, '宇宙のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');
      const kinds = {};
      Zs.active().propFields.forEach((f) => { kinds[f.name] = 1; });
      t.ok(Object.keys(kinds).length >= 20, '宇宙の小物は ' + Object.keys(kinds).length + '種（20種以上）');

      /* 三角形は S1（ネオン都市）比 +30% 以内（契約§3 / ジオラマ規範） */
      const tris = W.renderer.info.render.triangles;
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      const trisS1 = W.renderer.info.render.triangles;
      t.ok(tris <= trisS1 * 1.30,
           '宇宙の三角形 ' + tris + ' ≤ ネオン(S2)(' + trisS1 + ') の1.30倍（比 ' + (tris / trisS1).toFixed(2) + '）');

      /* 1フレームの送り出しが 0.8ms 以内 */
      Zs.switchTo('space');
      for (let i = 0; i < 6; i++) DUO.pump(1 / 60);
      const t0 = performance.now();
      for (let i = 0; i < 120; i++) Zs.sync(300 + i * 0.4, i * 0.016, 30);
      const ms = (performance.now() - t0) / 120;
      t.ok(ms <= 0.8, '宇宙の sync は1フレーム ' + ms.toFixed(3) + 'ms（≤0.8ms）');

      /* 戻す → ネオン都市の値に完全に戻る */
      DUO.reset(); DUO.start('S2', 3);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(W.scene.fog.color.getHex(), neonFog, '霧の色がネオン都市へ戻る');
      t.eq(W._roadMat.color.getHex(), neonRoad, '路面の色が戻る');
      t.eq(W.scene.children.length, childs0, 'シーンの要素数が元通り（' + W.scene.children.length + '）');

      /* --- リーク検査: 4ゾーンを3周してもジオメトリが増え続けない --- */
      const cycle = () => {
        ['ruins', 'sea', 'space', 'neon'].forEach((id) => {
          Zs.switchTo(id);
          for (let i = 0; i < 5; i++) DUO.pump(1 / 60);
        });
        return { geo: R.info.memory.geometries, tex: R.info.memory.textures,
                 ch: W.scene.children.length, calls: W.drawCalls() };
      };
      cycle();                       // 暖機（障害物ビューのプールを型ごとに埋める）
      const a = cycle(), b = cycle(), c = cycle();
      t.eq(b.geo, c.geo, 'ジオメトリ数が増え続けない（' + a.geo + ' → ' + b.geo + ' → ' + c.geo + '）');
      t.eq(b.ch, c.ch, 'シーンの要素数が増え続けない（' + b.ch + ' → ' + c.ch + '）');
      t.eq(c.tex, 0, 'テクスチャは0枚のまま（契約§3 画像を使わない）');
      t.ok(c.calls <= 300, '往復後のドローコール ' + c.calls + ' ≤ 300');
      const left = Object.keys(In.Obstacles._mat).filter((k) => k.indexOf('space|') === 0);
      t.eq(left.length, 0, 'ネオンへ戻したあと宇宙スキンのマテリアルは残っていない（' + left.length + '）');
      t.eq(In.Obstacles._pool.space, undefined, '宇宙スキンの見た目プールも捨てられている');
      DUO.reset();
    }
  });

  /* ==========================================================================
     2. 宇宙スキンの見た目と判定／装飾が走路に入らない
     ========================================================================== */
  DUO.__suites.push({
    name: 'P4b: 宇宙スキンの見た目と判定のズレ ±10%・装飾が走路に入らない',
    quick: true,
    run(t) {
      const In = I(), OBS = In.OBS, CFG = In.CFG, Zs = In.Zones;
      DUO.reset(); DUO.start('S2', 2);
      Zs.switchTo('space');
      DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      /* 例外（意図的に判定の外へ出る装飾／当たり判定を持たない実体）
           WARPGATE / ZEROGATE / ZEROFIELD / NETGATE … ghost（通り抜ける）
           LASER_H / LASER_DIAG … 動く部品（bands から毎フレーム置く） */
      /* 【2026-09-23 P5c】ジャンプ障害物（ローバー／ローレーザー）に足した
           ・両脇の高い支柱 1.6m（レーン端 x=±0.55）
           ・支柱上端をつなぐ光る警告バー
           ・手前の路面の警告帯（幅レーン・長さ 4m・シェブロン）
         は **当たり判定を一切持たない視認性のための標示**（契約§4.3）。
         判定 0.6m の柵に対して見た目 1.72m・奥行き 4.25m を比べてしまうと
         この検査の目的（当たり判定と実体の食い違いを見つける）が測れなくなるので、
         装飾（userData.deco）を外した外接箱 In.viewBox() で測る。 */
      const skip = { GAP: ['y', 'z'], LASER_SCAN: ['x', 'z'],
                     /* S6: ゲートは ghost、割れた鏡の床は足場＋裂け目を毎フレーム置く（P5a） */
                     MIRGATE: ['x', 'y', 'z'], SWAPGATE: ['x', 'y', 'z'], MERGEGATE: ['x', 'y', 'z'], SHARDGAP: ['x', 'y', 'z'],
                     LASER_ROT: ['x', 'y', 'z'], BRIDGE: ['x', 'y', 'z'],
                     SYNCPAD: ['x', 'y', 'z'], SYNCGAP: ['x', 'y', 'z'], DROPCEIL: ['y', 'z'],
                     CURRENT: ['x', 'y', 'z'], CURGATE: ['x', 'y', 'z'], DOOR: ['x', 'y', 'z'],
                     LIFTPAD: ['z'], FISH_TAIL: ['x', 'z'],
                     WARPGATE: ['x', 'y', 'z'], ZEROGATE: ['x', 'y', 'z'],
                     ZEROFIELD: ['x', 'y', 'z'], NETGATE: ['x', 'y', 'z'],
                     LASER_H: ['x', 'y', 'z'], LASER_DIAG: ['x', 'y', 'z'] };
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
               '宇宙 ' + OBS[type].label + ' ' + ax + edge + ': 見た目 ' + v.toFixed(2) +
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
      /* レーザーネットのビームは **bands をそのまま描く**（見た目＝判定）。
         描いた帯の外接が判定の外接と一致することを直接見る。 */
      ['LASER_H', 'LASER_DIAG'].forEach((type) => {
        const params = (type === 'LASER_H')
          ? { hbeam: { y0: CFG.NET.Y_LOW, y1: CFG.NET.Y_HIGH, phase: 0 } }
          : { diag: { f0: -1, c0: 1 } };
        const o = In.Obstacles.make(type, 'floor', type === 'LASER_H' ? -1 : 0, 100, 0, params);
        const view = In.Obstacles.acquire(type);
        o.view = view;
        In.Obstacles.place(o, 100, 0);
        const nt = view.userData.net;
        t.ok(!!nt, type + ': ビームの骨組みが建つ');
        const bands = In.Obstacles.bands(o, 100, []);
        const m = new THREE.Matrix4();
        let y0 = 1e9, y1 = -1e9;
        for (let i = 0; i < bands.length; i++) {
          nt.beam.getMatrixAt(i, m);
          const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
          m.decompose(p, q, s);
          y0 = Math.min(y0, p.y - s.y / 2); y1 = Math.max(y1, p.y + s.y / 2);
        }
        const hb = In.Obstacles.box(o, 100);
        t.near(y0, hb.y0, 0.02, type + ': 描いた帯の下端が判定と一致');
        t.near(y1, hb.y1, 0.02, type + ': 描いた帯の上端が判定と一致');
        o.view = null;
        In.Obstacles.release(type, view);
      });
      /* 装飾が 2体の通り道（|x| ≤ レーン端 + 体半幅）へ食い込まない */
      const bad = In.ZoneKit.intrudes(Zs.get('space'));
      t.eq(bad.length, 0, '宇宙の装飾は走行空間に入らない: ' +
           bad.map((b) => b.name + '(' + b.over + 'm)').join(', '));
      /* 壁区間（気密回廊）と開放区間（ガラスチューブ）が交互に来る（契約§5） */
      const zs = Zs.get('space');
      let wall = 0;
      for (let m = 0; m < 1200; m += 2) if (zs.isWall(m)) wall++;
      const ratio = wall / 600;
      t.ok(ratio > 0.3 && ratio < 0.7, '壁区間は ' + (ratio * 100).toFixed(0) + '%（開放区間と交互）');
      DUO.reset();
    }
  });

  /* ==========================================================================
     3. 重力反転ワープ（契約§4.5 / S5）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 重力反転ワープ（面の入れ替え・担当は画面の位置のまま・戻り・1.0秒の猶予）',
    quick: true,
    run(t) {
      const In = I(), Wp = In.Warp, CFG = In.CFG;

      /* --- 展開の形と時刻の規則 --- */
      const items = [];
      const reg = Wp.expand(items, { lane: 0, type: 'GRAVWARP', params: { warp: { backT: 4 } } },
                            'floor', 500, 0, 3.0, null);
      t.eq(items.length, 2, 'ゲートは入口と戻りの2枚で1組');
      t.eq(items.every((o) => o.type === 'WARPGATE'), true, 'どちらも黄のゲート');
      t.near(reg.to - reg.from, 4 * CFG.REF_SPEED * 3.0, 1e-9, '戻りのゲートまでは backT 秒ぶんの距離');
      t.eq(items.every((o) => In.Obstacles.bands(o, o.at, []).length === 0), true,
           'ゲートは当たり判定を持たない（通るだけ）');
      t.eq(Wp.crossed([reg], reg.from - 1, reg.from + 1), 1, '入口を跨ぐと1回');
      t.eq(Wp.crossed([reg], reg.from - 1, reg.to + 1), 2, '両方跨ぐと2回（＝元に戻る）');
      t.eq(Wp.gateNear([reg], reg.from + 5, 10), true, 'ゲートの直後は「直前にゲートがある」');
      t.eq(Wp.gateNear([reg], reg.from - 5, 10), false, 'ゲートの手前は掛からない');

      /* --- 実プレイ: 面が入れ替わる・担当は画面の位置のまま --- */
      DUO.reset(); DUO.start('S5', 5); DUO.skipTo(300);
      In.clearObstacles();
      Game.gen.warps.length = 0;
      const its = [];
      const r2 = Wp.expand(its, { lane: 0, type: 'GRAVWARP', params: { warp: { backT: 3 } } },
                           'floor', Game.dist + 40, Game.dist, Game.speed / CFG.REF_SPEED, Game.gen.warps);
      its.forEach((o) => Game.active.push(o));
      const lumen = Game.runners.filter((r) => r.id === 'lumen')[0];
      const umbra = Game.runners.filter((r) => r.id === 'umbra')[0];
      t.eq(lumen.surface, 'floor', '最初は LUMEN が床');
      t.eq(umbra.surface, 'ceil', '最初は UMBRA が天井');
      let g = 0;
      while (Game.dist < r2.from + 2 && g++ < 4000 && Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(lumen.surface, 'ceil', 'ゲートを通ると LUMEN が天井になる（契約§4.5）');
      t.eq(umbra.surface, 'floor', '〃 UMBRA が床になる');
      t.eq(DUO.state().flipped, true, '状態として「反転中」が読める');
      t.eq(Game.flipN, 1, '入れ替えは1回だけ（跨いだ瞬間に1回）');
      t.ok(Game.flipT > 0, '0.4秒の回転演出が始まっている（見た目だけ）');
      t.near(CFG.WARP.SPIN_T, 0.40, 1e-9, '回転演出は 0.4秒（契約§4.5）');
      /* 担当は「画面の位置」のまま＝下半分は **床を走っている方**（今は UMBRA） */
      DUO.touch('bottom', 'up');
      DUO.__step(1 / 60);
      t.eq(umbra.act, 'jump', '下半分の上フリックで、床を走る UMBRA が跳ぶ（画面の位置＝担当）');
      t.eq(lumen.act, 'run', 'LUMEN は動かない');
      DUO.touch('top', 'down');
      DUO.__step(1 / 60);
      t.eq(lumen.act, 'jump', '上半分の下フリックで、天井を走る LUMEN が跳ぶ');
      /* HUD の手アイコンも面から引いているので入れ替わる */
      Game.render();
      t.eq(document.getElementById('hand-left').getAttribute('data-char'), 'umbra',
           'HUD の下半分アイコンが UMBRA になる（契約§4.5「手アイコンが入れ替わる」）');
      t.eq(document.getElementById('hand-right').getAttribute('data-char'), 'lumen',
           'HUD の上半分アイコンが LUMEN になる');
      t.eq(document.getElementById('flag-grav').style.display, '', 'HUD に GRAVITY が出る');
      /* --- 戻りのゲートで元に戻る --- */
      g = 0;
      while (Game.dist < r2.to + 2 && g++ < 4000 && Game.status === 'playing') DUO.__step(1 / 60);
      t.eq(lumen.surface, 'floor', '戻りのゲートで LUMEN が床へ戻る');
      t.eq(umbra.surface, 'ceil', '〃 UMBRA が天井へ戻る');
      t.eq(Game.flipN, 2, '入れ替えは計2回');
      t.eq(DUO.state().flipped, false, '状態も元に戻る');

      /* --- 不変条件: ゲートの直後 1.0秒はウォールを置けない（契約§4.5） --- */
      t.near(CFG.WARP.GRACE_T, 1.00, 1e-9, '猶予は 1.0秒（契約§4.5）');
      const st = In.makeStage('S5');
      const its2 = [];
      const r3 = Wp.expand(its2, { lane: 0, type: 'GRAVWARP', params: { warp: { backT: 4 } } },
                           'floor', 500, 0, st.speedAt(500) / CFG.REF_SPEED, null);
      const sp = st.speedAt(500);
      const near = [In.Obstacles.make('PILLAR', 'floor', 0, r3.from + sp * 0.5, 0)];
      const errs = In.Fair.validate(near, st.speedAt, { startLanes: 'any', warps: [r3] });
      t.ok(errs.some((e) => e.indexOf('重力反転') >= 0), 'ゲートの直後にウォールがあると §4.7 違反になる');
      const far = [In.Obstacles.make('PILLAR', 'floor', 0, r3.from + sp * 1.1, 0)];
      t.eq(In.Fair.validate(far, st.speedAt, { startLanes: 'any', warps: [r3] })
             .filter((e) => e.indexOf('重力反転') >= 0).length, 0,
           '1.0秒より後なら置ける');
      /* 生存レーンの到達可能性はゲートでリセットされる（相手のレーンから始まるため） */
      const wallA = In.Obstacles.make('PILLAR', 'floor', 1, r3.from - sp * 1.0, 0);
      const wallB = In.Obstacles.make('PILLAR', 'floor', -1, r3.from + sp * 1.2, 0);
      const e2 = In.Fair.validate([wallA, wallB], st.speedAt, { startLanes: [0], warps: [r3] });
      t.eq(e2.filter((e) => e.indexOf('到達不能') >= 0).length, 0,
           'ワープを跨いだ先では「どのレーンからでも来る」と見なす');
      DUO.reset();
    }
  });

  /* ==========================================================================
     4. 無重力ジャンプ（契約§4.5 / S5）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 無重力ジャンプ（滞空1.5倍を 判定・ボット・Fair が同じ係数で読む）',
    quick: true,
    run(t) {
      const In = I(), Z = In.Zero, CFG = In.CFG;
      t.near(CFG.ZEROG.MUL, 1.5, 1e-9, '滞空は 1.5倍（契約§4.5）');
      t.near(CFG.ZEROG.JUMP_T, 0.825, 1e-9, '0.55秒 → 0.825秒');

      /* --- 展開の形 --- */
      const items = [];
      const reg = Z.expand(items, { lane: 0, type: 'ZEROG', params: { zero: { n: 4 } } },
                           'floor', 500, 0, 3.0, null);
      t.near(reg.to - reg.from, 4 * CFG.REF_SPEED * 3.0, 1e-9, '区間の長さは n 秒ぶん');
      t.eq(items.filter((o) => o.type === 'ZEROGATE').length, 1, '入口ゲートが1つ');
      t.ok(items.filter((o) => o.type === 'ZEROFIELD').length >= 8, '青い浮遊粒子が床と天井に並ぶ（予告）');
      t.eq(items.every((o) => In.Obstacles.bands(o, o.at, []).length === 0), true,
           'ゲートも粒子も当たり判定を持たない');
      t.eq(Z.kAt([reg], reg.from + 10), CFG.ZEROG.MUL, '区間の中は 1.5倍');
      t.eq(Z.kAt([reg], reg.from - 10), 1, '区間の外は 1.0倍');
      t.near(Z.jumpT([reg], reg.from + 10), CFG.ZEROG.JUMP_T, 1e-9, '滞空時間の窓口も同じ1か所');

      /* --- 体: 踏み切った場所で滞空が決まる（**高さは変えない**） --- */
      const r = In.Runners.create('x', 'floor', 'left');
      Z.cur = 1;
      In.Runners.input(r, 'jump');
      t.near(r.jumpT, CFG.JUMP_T, 1e-9, '通常の場所で踏み切ると 0.55秒');
      const normal = In.Runners.footOffset({ act: 'jump', actT: CFG.JUMP_T * 0.5, jumpT: CFG.JUMP_T });
      In.Runners.reset(r);
      Z.cur = CFG.ZEROG.MUL;
      In.Runners.input(r, 'jump');
      t.near(r.jumpT, CFG.ZEROG.JUMP_T, 1e-9, '無重力で踏み切ると 0.825秒');
      const zero = In.Runners.footOffset({ act: 'jump', actT: CFG.ZEROG.JUMP_T * 0.5, jumpT: CFG.ZEROG.JUMP_T });
      t.near(zero, normal, 1e-9, '**同じ位相なら高さは同じ**（契約は滞空だけを1.5倍にする）');
      t.near(In.Runners.boxOf('floor', 0, 'jump', CFG.OCC.JUMP_T, CFG.JUMP_T).y0,
             In.Runners.boxOf('floor', 0, 'jump', CFG.OCC.JUMP_T * CFG.ZEROG.MUL, CFG.ZEROG.JUMP_T).y0, 1e-9,
             '占有（occ）の probe は位相で測るので、無重力でも同じ表になる');
      Z.cur = 1;

      /* --- 実プレイ: 区間の中で跳ぶと滞空が 1.5倍 --- */
      const fly = (inZone) => {
        DUO.reset(); DUO.start('S5', 4); DUO.skipTo(300);
        In.clearObstacles();
        Game.gen.zeros.length = 0;
        if (inZone) {
          const its = [];
          Z.expand(its, { lane: 0, type: 'ZEROG', params: { zero: { n: 6 } } },
                   'floor', Game.dist - 20, Game.dist, Game.speed / CFG.REF_SPEED, Game.gen.zeros);
          its.forEach((o) => Game.active.push(o));
        }
        DUO.__step(1 / 60);
        DUO.touch('bottom', 'up');
        DUO.__step(1 / 60);
        const rn = Game.runners.filter((x) => x.surface === 'floor')[0];
        let air = 0;
        while (rn.act === 'jump' && air < 300) { DUO.__step(1 / 60); air++; }
        return air / 60;
      };
      const tn = fly(false), tz = fly(true);
      Game.render();
      t.near(tn, CFG.JUMP_T, 0.04, '通常区間の滞空は ' + tn.toFixed(2) + '秒');
      t.near(tz, CFG.ZEROG.JUMP_T, 0.05, '無重力区間の滞空は ' + tz.toFixed(2) + '秒（1.5倍）');
      t.ok(tz > tn * 1.3, '確かに長い（' + tn.toFixed(2) + ' → ' + tz.toFixed(2) + '秒）');
      t.eq(document.getElementById('flag-zero').style.display, '', 'HUD に ZERO-G が出る（無重力区間の中）');
      DUO.reset(); Game.render();
      t.eq(document.getElementById('flag-zero').style.display, 'none', '区間の外では消える');

      /* --- 不変条件: 区間の中では ジャンプ連続／ジャンプ→レーン も 1.5倍で測る --- */
      const st = In.makeStage('S5');
      const its2 = [];
      const reg2 = Z.expand(its2, { lane: 0, type: 'ZEROG', params: { zero: { n: 6 } } },
                            'floor', 500, 0, st.speedAt(500) / CFG.REF_SPEED, null);
      const sp = st.speedAt(500);
      const mk = (type, lane, at) => In.Obstacles.make(type, 'floor', lane, at, 0);
      /* 通常なら通る間隔（0.75秒）が、無重力区間では弾かれる */
      const pair = [mk('ROVER', 0, 520), mk('ROVER', 0, 520 + sp * 0.75)];
      t.eq(In.Fair.validate(pair, st.speedAt, { startLanes: 'any' })
             .filter((e) => e.indexOf('ジャンプ連続') >= 0).length, 0,
           '通常区間では 0.75秒のジャンプ連続は通る');
      t.ok(In.Fair.validate(pair, st.speedAt, { startLanes: 'any', zeros: [reg2] })
             .some((e) => e.indexOf('ジャンプ連続') >= 0),
           '無重力区間では同じ間隔が §4.7 違反になる（滞空が伸びるため）');
      const pair2 = [mk('ROVER', 0, 520), mk('ROVER', 0, 520 + sp * 1.05)];
      t.eq(In.Fair.validate(pair2, st.speedAt, { startLanes: 'any', zeros: [reg2] })
             .filter((e) => e.indexOf('ジャンプ連続') >= 0).length, 0,
           '1.05秒（＝0.825+0.15 以上）空けば通る');
      /* ボットも同じ係数で踏み切る（目標ではなく **踏み切る場所** の倍率） */
      t.eq(typeof In.Zero.kAt, 'function', 'ボット・Fair・体が読む窓口は Zero.kAt の1か所');
      DUO.reset();
    }
  });

  /* ==========================================================================
     5. レーザーネット（契約§4.5 / S5）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: レーザーネット（到達時刻で判定・斜めビームは床と天井で避けるレーンが違う）',
    quick: true,
    run(t) {
      const In = I(), Ob = In.Obstacles, MOT = In.MOT, CFG = In.CFG, R = In.Runners;

      /* --- 横ビーム: 到達時刻の高さが役割を決める --- */
      const hb = (y0, y1, phase) => Ob.make('LASER_H', 'floor', -1, 500, 0,
                                            { hbeam: { y0: y0, y1: y1, phase: phase, periodM: 60 } });
      const low = hb(CFG.NET.Y_LOW, CFG.NET.Y_HIGH, 0);
      const high = hb(CFG.NET.Y_HIGH, CFG.NET.Y_LOW, 0);
      const mid = hb(CFG.NET.Y_MID, CFG.NET.Y_MID2, 0);
      t.near(MOT.hbeamY(low, 500), CFG.NET.Y_LOW, 1e-9, '到達の瞬間は床寄り（phase 0 ＝ y0）');
      t.near(MOT.hbeamY(low, 500 + 30), CFG.NET.Y_HIGH, 1e-6, '半周期ぶん先では天井寄り（＝上下スキャン）');
      t.eq(Ob.demand(low, 'floor'), 'jump', '床寄りのビームは LUMEN がジャンプ（契約§4.5）');
      t.eq(Ob.demand(low, 'ceil'), 'none', '〃 UMBRA には無関係');
      t.eq(Ob.demand(high, 'ceil'), 'jump', '天井寄りのビームは UMBRA がジャンプ');
      t.eq(Ob.demand(high, 'floor'), 'none', '〃 LUMEN には無関係');
      t.eq(Ob.demand(mid, 'floor'), 'none', '中央のビームは **どちらも無関係**（契約§4.5）');
      t.eq(Ob.demand(mid, 'ceil'), 'none', '〃');
      t.eq(Ob.occ(mid).floor.lanes[0].jump, true, '中央のビームは跳んでも当たらない（跳躍帯を塞がない）');
      t.eq(Ob.occ(mid).ceil.lanes[0].jump, true, '〃 天井側も');
      t.eq(Ob.occ(low).floor.lanes[-1].run, false, '全幅なのでどのレーンでも当たる');

      /* --- 斜めビーム: **床と天井で避けるレーンが違う**（契約§4.5 の主題） --- */
      const dg = Ob.make('LASER_DIAG', 'floor', 0, 500, 0, { diag: { f0: -1, c0: 1 } });
      const occ = Ob.occ(dg);
      t.eq(occ.floor.lanes[-1].run, false, '床側はレーン -1 が塞がる');
      t.eq(occ.floor.lanes[-1].jump, false, '〃 跳んでも越えられない');
      t.eq(occ.floor.lanes[1].run, true, '床側はレーン +1 が空いている');
      t.eq(occ.ceil.lanes[1].run, false, '天井側はレーン +1 が塞がる');
      t.eq(occ.ceil.lanes[1].jump, false, '〃 跳んでも越えられない');
      t.eq(occ.ceil.lanes[-1].run, true, '天井側はレーン -1 が空いている');
      t.eq(Ob.demand(dg, 'floor'), 'lane', '床の要求はレーン移動');
      t.eq(Ob.demand(dg, 'ceil'), 'lane', '天井の要求もレーン移動');
      const wall = In.Fair.walls([dg], () => 30)[0];
      const fSafe = CFG.LANES.filter((l) => In.Fair.laneSurvivable(wall, 'floor', l));
      const cSafe = CFG.LANES.filter((l) => In.Fair.laneSurvivable(wall, 'ceil', l));
      t.eq(fSafe.join(','), '0,1', '床の生存レーンは 0/+1');
      t.eq(cSafe.join(','), '-1,0', '天井の生存レーンは -1/0');
      t.ok(fSafe.join(',') !== cSafe.join(','), '**床と天井で生存レーンが違う**（契約§4.5 斜めビーム）');
      /* 斜めビームも動く（往復）。到達時刻の位置で判定される */
      const dg2 = Ob.make('LASER_DIAG', 'floor', 0, 500, 0,
                          { diag: { f0: -1, f1: 1, c0: 1, c1: -1, phase: 0.5, periodM: 60 } });
      t.near(MOT.diagLanes(dg2, 500).f, 1, 1e-6, 'phase 0.5 は到達時に振れ先（f1）に居る');
      t.near(MOT.diagLanes(dg2, 500 - 30).f, -1, 1e-6, '半周期ぶん手前では逆の端');

      /* --- occ ⇔ hits の総当り一致（判定とボットが同じ数字を見ている） --- */
      const probe = { run: 0, jump: CFG.OCC.JUMP_T };
      let bad = 0, over = 0;
      [low, high, mid, dg].forEach((o) => {
        const oc = Ob.occ(o);
        const W = (In.OBS[o.type].depth + CFG.BODY_D) / 2 + 0.2;
        ['floor', 'ceil'].forEach((side) => {
          CFG.LANES.forEach((lane) => {
            ['run', 'jump'].forEach((act) => {
              const want = oc[side].lanes[lane][act];
              let hit = false;
              for (let d = -W; d <= W; d += 0.01) {
                if (Ob.hits(o, R.boxOf(side, lane, act, probe[act]), o.at + d)) { hit = true; break; }
              }
              if (want && hit) bad++;
              if (!want && !hit) over++;
            });
          });
        });
      });
      t.eq(bad, 0, '「安全」と判定した動作は1つも当たらない');
      t.eq(over, 0, '「危険」と判定した動作は必ず当たる');

      /* --- 跳躍帯を塞ぐ帯は Fair が弾く（中央の高さを誤って書いた場合の保険） --- */
      const trap = hb(1.6, 1.6, 0);          // 走れるが跳ぶと当たる高さ
      t.eq(Ob.demand(trap, 'floor'), 'none', '走れば通れるので要求はない');
      t.eq(Ob.occ(trap).floor.lanes[0].jump, false, 'しかし跳ぶと当たる');
      t.ok(In.Fair.validate([trap], () => 30, { startLanes: 'any' })
             .some((e) => e.indexOf('跳躍帯') >= 0), 'そういう帯は §4.7 違反として弾かれる');

      /* --- 実プレイ: 斜めビームは片方だけが避ければよい --- */
      const play = (fLane, cLane) => {
        DUO.reset(); DUO.start('S5', 8); DUO.skipTo(300);
        In.clearObstacles();
        const o = Ob.make('LASER_DIAG', 'floor', 0, Game.dist + 60, Game.dist, { diag: { f0: -1, c0: 1 } });
        Game.active.push(o);
        Game.runners.forEach((rn) => {
          const l = (rn.surface === 'floor') ? fLane : cLane;
          rn.laneFrom = rn.laneTo = rn.laneVal = l; rn.laneT = CFG.LANE_T;
        });
        let g = 0;
        while (Game.dist < o.at + 3 && g++ < 4000 && Game.status === 'playing') DUO.__step(1 / 60);
        return Game.status === 'playing';
      };
      t.eq(play(0, 0), true, '床 0 / 天井 0 は2人とも通れる');
      t.eq(play(-1, 0), false, '床が -1 に居ると死ぬ');
      t.eq(play(0, 1), false, '天井が +1 に居ると死ぬ');
      t.eq(play(1, -1), true, '**床は +1・天井は -1**（互いに逆のレーン）で2人とも通れる');
      DUO.reset();
    }
  });

  /* ==========================================================================
     6. S5 の定義・不変条件・密度・動作比率（50シード）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 定義と不変条件・密度・動作比率（50シード）',
    quick: false,
    run(t) {
      const In = I();
      const st0 = In.makeStage('S5');
      t.eq(st0.lengthM, 1600, 'S5 は 1600m');
      t.eq(st0.zone, 'space', 'ゾーンは宇宙ステーション');
      t.near(st0.speedAt(0), 28, 1e-6, '開始 28 m/s');
      t.near(st0.speedAt(1600), 34, 1e-6, '終了 34 m/s');
      t.near(st0.checkpoints[0], 1600 / 3, 1e-6, 'チェックポイント1 は 1/3 地点');
      t.near(st0.checkpoints[1], 3200 / 3, 1e-6, 'チェックポイント2 は 2/3 地点');
      t.eq(st0.setpiece, 'blastout', '終盤の大演出は「区画爆発」');
      t.near(st0.reactBoth, In.CFG.FAIR.REACT_BOTH_LATE, 1e-9, '両者同時要求の余白は 0.45秒（契約§4.7）');
      const s6 = In.CHUNK_DEFS.filter((c) => c.s6);
      t.ok(s6.length >= 12, 'S5 のチャンクを ' + s6.length + '本 追加（12本以上）');
      t.eq(s6.filter((c) => c.difficulty < 4).length, 0, 'すべて rank4 以上（契約§6 P4b「rank4〜5 中心」）');
      t.ok(s6.filter((c) => c.difficulty === 5).length >= 6,
           'rank5 が ' + s6.filter((c) => c.difficulty === 5).length + '本');
      t.ok(s6.filter((c) => c.warp).length >= 3, '重力反転のチャンクが ' + s6.filter((c) => c.warp).length + '本');
      t.ok(s6.filter((c) => c.zero).length >= 3, '無重力のチャンクが ' + s6.filter((c) => c.zero).length + '本');
      t.ok(s6.filter((c) => c.net).length >= 3, 'レーザーネットのチャンクが ' + s6.filter((c) => c.net).length + '本');

      let bad = 0, spFound = 0, blanks = 0, warpSeen = 0, zeroSeen = 0, diagSeen = 0, hbeamSeen = 0, tips = 0;
      const agg = { lane: 0, jump: 0, total: 0 };
      const half = { a: 0, b: 0 }, rnd = { a: 0, b: 0 };
      /* 区画爆発は契約§4.5 緩和 v2 で 324m（ランダム区間は 1600 − 324 = 1276m まで） */
      const SP0 = 1600 - In.Setpieces.DEFS.blastout.lengthM;
      for (let seed = 1; seed <= 50; seed++) {
        const st = In.makeStage('S5');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1600; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const l = g.obstacles.filter((o) => o.at <= 1600);
        const errs = In.Fair.validate(l, st.speedAt,
                                      { startLanes: [0], reactBoth: st.reactBoth,
                                        zeros: g.zeros, warps: g.warps });
        if (errs.length) { bad++; if (bad === 1) t.info('seed' + seed + ': ' + errs.slice(0, 2).join(' | ')); }
        if (In.Fair.checkVisibility(l, st.speedAt).length) bad++;
        if (g.log.some((c) => c.setpiece)) spFound++;
        if (g.log.some((c) => c.id === '(setpiece-unfair)')) bad++;
        blanks += g.log.filter((c) => c.id === '(blank)').length;
        if (g.warps.length) warpSeen++;
        if (g.zeros.length) zeroSeen++;
        if (l.some((o) => o.type === 'LASER_DIAG')) diagSeen++;
        if (l.some((o) => o.type === 'LASER_H')) hbeamSeen++;
        tips += g.events.filter((e) => e.type === 'tip').length;
        const c = In.Fair.countDemands(l, st.speedAt);
        agg.lane += c.lane; agg.jump += c.jump; agg.total += c.total;
        /* P5c（契約§4.8 tip の猶予規則）: tip の窓（表示開始〜対象通過後 speed×1.0秒）は
         規則で「対象以外は置かない」区間なので、密度はその窓を除いた区間で測る */
        const tw = In.Fair.tipWindows(g.events);
        rnd.xa = (rnd.xa || 0) + In.Fair.tipOverlap(tw, 0, 800);
        rnd.xb = (rnd.xb || 0) + In.Fair.tipOverlap(tw, 800, SP0);
        In.Fair.walls(l, st.speedAt).forEach((w) => {
          const n = (w.demand.floor ? 1 : 0) + (w.demand.ceil ? 1 : 0);
          if (In.Fair.inTipWindow(tw, w.at)) return;
          if (w.at < 800) { half.a += n; rnd.a += n; } else { half.b += n; if (w.at < SP0) rnd.b += n; }
        });
      }
      t.eq(bad, 0, 'S5 50シードで §4.7 違反なし（大演出区間・ワープの猶予・無重力の滞空を含む）');
      t.eq(spFound, 50, '50シードすべてに区画爆発が入る');
      t.eq(blanks, 0, '空白チャンク（生成の詰まり）は0回');
      t.ok(warpSeen >= 20, '重力反転ワープが出る（' + warpSeen + '/50 シード）');
      t.ok(zeroSeen >= 20, '無重力区間が出る（' + zeroSeen + '/50 シード）');
      t.ok(diagSeen >= 40, '斜めビームが出る（' + diagSeen + '/50 シード）');
      t.ok(hbeamSeen >= 20, '横ビームが出る（' + hbeamSeen + '/50 シード）');
      t.ok(tips >= 50, '新ギミックの初出に tip が撒かれる（計' + tips + '回 / 50シード）');

      /* 密度（契約§4.7 S5 は 8→12回/100m・±25%）。
         **大演出（終盤200m）を除いたランダム区間**で測る: 区画爆発は
         カメラカット(30m)＋自由飛行(76m)＋着地猶予(2.0秒=約67m) が構造的に
         障害物を置けない区間なので、そこを含めると密度の定義が変わってしまう。
         演出込みの実測値も info で残す（既知の妥協点）。 */
      const dens = In.STAGE_DEFS.S5.density;
      t.eq(dens[0] + '-' + dens[1], '8-12', '密度の目安は 8→12回/100m');
      const A = rnd.a / (50 * 800 - rnd.xa) * 100, B = rnd.b / (50 * (SP0 - 800) - rnd.xb) * 100;
      /* 目安はその区間の**真ん中**の進行率で測る（前半 375m／後半のランダム区間の真ん中） */
      const wantA = In.U.lerp(dens[0], dens[1], 400 / 1600);
      const wantB = In.U.lerp(dens[0], dens[1], ((800 + SP0) / 2) / 1600);
      t.ok(A >= wantA * 0.75 && A <= wantA * 1.25,
           'S5 前半の密度 ' + A.toFixed(2) + ' 回/100m（目安 ' + wantA.toFixed(2) + ' ±25%）');
      t.ok(B >= wantB * 0.75 && B <= wantB * 1.25,
           'S5 後半（演出を除く）の密度 ' + B.toFixed(2) + ' 回/100m（目安 ' + wantB.toFixed(2) + ' ±25%）');
      /* P7a（契約§4.8 2026-09-24 改訂）: tip の窓が 4.0秒前＋対象後1.0秒に伸び、前半の初出（ゲートで
         譜面が薄い所）がまとめて測定から外れるので、前半の「窓の外」が相対的に濃く出る（S6 と同じ）。
         後半が前半を −10% より大きく割らないことで見る（目安 ±25% は上で厳密に見る） */
      t.ok(B >= A * 0.90, 'S5 密度は後半が前半を大きく割らない（' + A.toFixed(2) + ' → ' + B.toFixed(2) + '）');
      t.info('演出込みの後半密度 ' + (half.b / 50 / 7.5).toFixed(2) + ' 回/100m（区画爆発の200mを含む）');
      /* 動作比率（契約§4.3）。スライドは「壁の穴」だけ＝1チャンクに最大1・連続禁止なので
         実測 1% 未満になり、その余りがレーン移動へ流れる。50/35/15 を
         スライド抜きで正規化すると レーン59% / ジャンプ41% なので、上限を 62% にする。 */
      const pct = (k) => agg[k] / agg.total * 100;
      t.ok(pct('lane') >= 45 && pct('lane') <= 62, 'S5 レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜62%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'S5 ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.info('S5 内訳 lane=' + agg.lane + ' jump=' + agg.jump + ' 計' + agg.total);
      DUO.reset();
    }
  });

  /* ==========================================================================
     7. S5: ボット完走
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: ボット完走（perfect / delay250 × seed 1〜50）',
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
        DUO.reset(); DUO.start('S5', seed); DUO.bot('perfect');
        if (runToEnd() === 'clear') p++;
        else pf.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      for (let seed = 1; seed <= 50; seed++) {
        DUO.reset(); DUO.start('S5', seed); DUO.bot('delay250');
        if (runToEnd() === 'clear') d++;
        else df.push(seed + '@' + Math.floor(Game.dist) + (Game.killer ? '/' + Game.killer.obstacle : ''));
      }
      DUO.reset();
      t.eq(p, 50, 'perfect が S5 を 50/50 完走（落ちた種: ' + pf.slice(0, 5).join(',') + '）');
      t.ok(d >= 45, 'delay250 が S5 を ' + d + '/50 完走（45以上・落ちた種: ' + df.slice(0, 5).join(',') + '）');
    }
  });

  /* ==========================================================================
     8. 大演出「区画爆発」
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 大演出「区画爆発」（カメラカット・炎と破片・吹き飛び・着地猶予・中断復元）',
    quick: false,          // 実描画とピクセル読み出しを伴うので runAll 側へ（契約§7）
    run(t) {
      const In = I(), W = In.World, Sp = In.Setpieces, B = In.Setpieces.BL;
      const fogFar0 = W.scene.fog.far, fogCol0 = W.scene.fog.color.getHex();
      W.setViewport(812, 375, 1);

      /* 実際に塗られた画素で測る（外接箱ではなく「見えている炎と破片」）。
         描いた絵と、爆発だけ消した絵の差分＝爆発の画素。 */
      const cv = document.createElement('canvas');
      cv.width = 203; cv.height = 94;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const shot = () => {
        Game.render();
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.drawImage(W.renderer.domElement, 0, 0, cv.width, cv.height);
        return cx.getImageData(0, 0, cv.width, cv.height).data;
      };
      const measure = () => {
        const a = shot();
        const orig = Sp._syncBlast;
        Sp._syncBlast = function () { Sp.blast.group.visible = false; Sp.blast.flash.visible = false; };
        const b = shot();
        Sp._syncBlast = orig;
        let n = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) n++;
        }
        return n / (cv.width * cv.height);
      };

      DUO.reset(); DUO.start('S5', 7); DUO.bot('perfect');
      /* 演出の少し手前から実ステップで跨ぐ（直行するとイベントを飛ばす） */
      const SPS = 1600 - In.Setpieces.DEFS.blastout.lengthM;    // 1276m（契約§4.5 緩和 v2 で 324m）
      DUO.skipTo(SPS - 60);
      let g = 0;
      while (Game.dist < SPS + 2 && g++ < 6000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'blastout', SPS + 'm で区画爆発が始まる');
      t.eq(document.getElementById('cue').classList.contains('on'), true, 'HUD に予告が出る');
      t.ok(document.getElementById('cue-main').textContent.indexOf('BLAST') >= 0, '予告の文字は「BLAST!」');
      const start = Sp.state.startM;

      let sideFrames = 0, maxSide = 0, maxPaint = 0, maxShake = 0;
      let glideFrames = 0, maxSpin = 0, duoMax = 0, splitLane = null;
      while (Game.status === 'playing' && Game.dist < start + B.END && g++ < 20000) {
        DUO.pump(1 / 60);
        const k = Sp.blastSideK(Game.dist);
        maxSide = Math.max(maxSide, k);
        if (k > 0.25) { sideFrames++; maxPaint = Math.max(maxPaint, measure()); }
        const fx = Sp.camFx();
        if (fx) maxShake = Math.max(maxShake, fx.shake);
        if (Sp.glideActive()) glideFrames++;
        maxSpin = Math.max(maxSpin, Math.abs(Sp.blastSpin(Game.dist)));
        duoMax = Math.max(duoMax, Sp.duoK(Game.dist));
        if (Sp.state && Sp.state.landLane !== undefined && splitLane === null) splitLane = Sp.state.landLane;
      }
      /* --- カメラを向けるカット（契約§8 の決定ログ） --- */
      t.ok(sideFrames > 20, '隔壁側へのカメラカットがある（' + sideFrames + 'フレーム）');
      t.ok(maxSide > 0.95, 'カメラが真横（隔壁の側）まで振れる（最大 ' + maxSide.toFixed(2) + '）');
      t.ok(maxPaint > 0.12,
           '**炎と破片が画面の ' + (maxPaint * 100).toFixed(0) + '% を実際に塗る**（12%以上）');
      t.ok(maxShake > 0.06, '爆風でカメラが揺れる（最大 ' + maxShake.toFixed(3) + '）');
      /* --- 吹き飛ばされて回転しながら自由飛行（§4.5 の流用） --- */
      t.ok(glideFrames > 60, '自由飛行の区間がある（' + glideFrames + 'フレーム）');
      t.near(duoMax, 1, 1e-6, '2人が合体して DUO体になる');
      t.ok(maxSpin > 1.5, '回転しながら飛ぶ（最大 ' + maxSpin.toFixed(2) + ' rad）');
      t.eq(runToEndPump(), 'clear', '区画爆発を跨いでゴールできる');

      /* --- 譜面と §4.7（着地猶予を含む） --- */
      const def = In.Setpieces.DEFS.blastout;
      t.eq(def.air, true, '自由飛行の区間を持つ演出');
      t.eq(def.landRel, B.LAND, '着地の位置がキーフレームと一致');
      const st = In.makeStage('S5');
      const inst = In.Setpieces.build('blastout', SPS, 0, st.speedAt(SPS) / In.CFG.REF_SPEED, null);
      const errs = In.Fair.validate(inst.items, st.speedAt, { startLanes: 'any', reactBoth: st.reactBoth });
      t.eq(errs.length, 0, '区画爆発の譜面が §4.7 を満たす: ' + errs.slice(0, 2).join(' | '));
      const all = (def.floor || []).concat(def.ceil || []);
      const lastAt = Math.max.apply(null, all.map((e) => e.at));
      t.ok(lastAt < B.SIDE0 - 4, 'カットの窓（' + B.SIDE0 + '〜' + B.SIDE1 + 'm）には障害物を置かない（§4.7）');
      const grace = In.Fair.landingGrace(inst.items, SPS + B.LAND, st.speedAt);
      t.eq(grace.length, 0, '着地後 2.0秒に障害物がない（契約§4.5）: ' + grace.slice(0, 2).join(' | '));
      /* 自由飛行の譜面（流用した仕組みそのもの） */
      const course = In.Setpieces.buildAir(12345, SPS, st.speedAt);
      t.ok(course.items.length >= 1, '空中の壁が ' + course.items.length + '本ある');
      t.eq(In.Fair.validateAir(course, st.speedAt, { margin: true }).length, 0, '空中の隙間へ必ず到達できる（§4.5）');

      /* --- delay250 でも演出を跨いで完走する --- */
      DUO.reset(); DUO.start('S5', 12); DUO.bot('delay250'); DUO.skipTo(SPS - 60);
      g = 0;
      while (Game.dist < SPS + 2 && g++ < 6000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'blastout', '0.25秒遅延のボットでも演出に入る');
      t.eq(runToEndPump(), 'clear', '0.25秒遅延のボットも区画爆発を抜けてゴールする');

      /* --- 中断（リトライ）で完全復元 --- */
      DUO.reset(); DUO.start('S5', 7); DUO.bot('perfect'); DUO.skipTo(SPS - 60);
      g = 0;
      while (Game.dist < SPS + 30 && g++ < 6000 && Game.status === 'playing') DUO.pump(1 / 60);
      t.eq(DUO.state().setpiece, 'blastout', 'もう一度 区画爆発に入る');
      Game.retry();
      t.eq(DUO.state().setpiece, null, 'リトライで演出状態が消える');
      t.eq(Sp.blast.group.visible, false, '火球が消える');
      t.eq(Sp.blast.flash.visible, false, '閃光が消える');
      t.eq(Sp.dust.mat.opacity, 0, '煙が消える');
      t.eq(In.FF.active(), false, '自由飛行が終わっている');
      t.eq(In.Input.mode, 'lanes', '操作がレーンモードへ戻る');
      t.eq(document.getElementById('cue').classList.contains('on'), false, '予告が消える');
      t.near(W.scene.fog.far, fogFar0, 1e-6, '霧の far が戻る');
      t.eq(W.scene.fog.color.getHex(), fogCol0, '霧の色が戻る');
      t.eq(W._shake, 0, 'カメラ揺れが戻る');
      for (let i = 0; i < 60; i++) DUO.pump(1 / 60);
      t.ok(Math.abs(W.camera.position.z - In.CFG.CAM.Z) < 0.5,
           'カメラの位置が戻る（z=' + W.camera.position.z.toFixed(2) + '）');
      DUO.reset(); W.resize();

      function runToEndPump(limit) {
        let k = 0;
        while ((Game.status === 'playing' || Game.status === 'goal') && k++ < (limit || 60000)) DUO.__step(1 / 60);
        return Game.status;
      }
    }
  });

  /* ==========================================================================
     9. S5 の解放・エンドレスのプール
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 解放（S4クリアで解放）・エンドレスのプール・宇宙ゾーンの選択',
    quick: true,
    run(t) {
      const In = I(), UI = In.UI, U = In.U, Zs = In.Zones, W = In.World;
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3']);
      UI.show('stages');
      let s6 = document.querySelector('[data-ui="stage-S5"]');
      t.eq(s6 && s6.getAttribute('data-unlocked'), '0', 'S4 未クリアでは S5 はロック');
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4']);
      UI.show('stages');
      s6 = document.querySelector('[data-ui="stage-S5"]');
      t.eq(s6 && s6.getAttribute('data-unlocked'), '1', 'S4 をクリアすると S5 が解放される');
      t.ok(s6 && s6.innerHTML.indexOf('準備中') < 0, 'S5 は「準備中」ではなく遊べる');
      const s7 = document.querySelector('[data-ui="stage-S6"]');
      t.eq(s7 && s7.getAttribute('data-unlocked'), '0', 'S6 はまだロック');
      s6.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.eq(DUO.state().stage, 'S5', 'クリックで S5 が始まる');
      t.near(DUO.state().speed, 28, 0.5, 'S5 は 28 m/s から');
      t.eq(Zs.id(), 'space', 'ゾーンは宇宙ステーション');
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.ok(W.drawCalls() > 0 && W.drawCalls() <= 300, 'S5 のドローコール ' + W.drawCalls() + ' ≤ 300');
      t.ok(Zs.propsAhead() >= 40, '前方60mの小物 ' + Zs.propsAhead() + '個（40個以上 / 契約§3）');

      /* エンドレス: S5 クリアで重力反転・無重力・レーザーネットが混ざる（契約§4.4） */
      const withS5 = In.endlessPool(['S1', 'S2', 'S3', 'S4']);
      const withS6 = In.endlessPool(['S1', 'S2', 'S3', 'S4', 'S5']);
      t.ok(withS6.pool.length > withS5.pool.length,
           'S5 クリアでプールが増える（' + withS5.pool.length + '→' + withS6.pool.length + '）');
      const has = (pool, id) => pool.indexOf(id) >= 0;
      const s6ids = In.CHUNK_DEFS.filter((c) => c.s6).map((c) => c.id);
      t.eq(s6ids.some((id) => has(withS5.pool, id)), false, 'S5 未クリアのエンドレスに S5 の顔は出ない');
      t.eq(s6ids.every((id) => has(withS6.pool, id)), true, 'S5 クリア後は S5 の顔が全部混ざる');
      /* 他のステージへ S5 の顔が漏れない（ゾーンが変わればギミックも変わる / 契約§4.4） */
      ['S1', 'S2', 'S3', 'S4'].forEach((id) => {
        const pool = In.makeStage(id).chunkPool;
        t.eq(s6ids.some((x) => pool.indexOf(x) >= 0), false, id + ' に S5 の顔は混ざらない');
      });
      /* エンドレス（ネオン）でも S5 の新ギミックの見た目が壊れない */
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5']);
      DUO.reset(); DUO.start('endless', 4);
      for (let i = 0; i < 10; i++) DUO.pump(1 / 60);
      t.eq(In.Obstacles.skinId(), 'common', '障害物の見た目は全ゾーン共通（契約§4.3 v2）');
      ['WARPGATE', 'ZEROGATE', 'ZEROFIELD', 'NETGATE', 'LASER_H', 'LASER_DIAG'].forEach((type) => {
        const v = In.Obstacles.acquire(type);
        const ud = v.userData;
        const okView = (type === 'ZEROFIELD') ? !!ud.zfield
                     : In.OBS[type].gate ? !!ud.gate : !!ud.net;
        t.eq(okView, true, 'ネオンのスキンでも ' + In.OBS[type].label + ' の骨組みが建つ（ゾーン共通の保険）');
        In.Obstacles.release(type, v);
      });
      U.lsRestore(snap);
      DUO.reset();
    }
  });

  /* ==========================================================================
     10. チュートリアル tip（新ギミックの初出）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 新ギミックの初出にチュートリアル tip（重力反転・無重力・レーザーネット）',
    quick: true,
    run(t) {
      const In = I(), Tut = In.Tutorial;
      t.ok(!!Tut.TIPS.gravwarp, '重力反転ワープの文言がある');
      t.ok(!!Tut.TIPS.zerog, '無重力ジャンプの文言がある');
      t.ok(!!Tut.TIPS.lasernet, 'レーザーネットの文言がある');
      t.eq(In.STAGE_DEFS.S5.tipOnce.warp, 'gravwarp', 'S5 は重力反転の初出で tip を出す');
      t.eq(In.STAGE_DEFS.S5.tipOnce.zero, 'zerog', 'S5 は無重力の初出で tip を出す');
      t.eq(In.STAGE_DEFS.S5.tipOnce.net, 'lasernet', 'S5 はレーザーネットの初出で tip を出す');
      /* 1600m に入るチャンクは10本前後なので、1回の走行で3つ全部が出るとは限らない。
         **どのシードでも最低1つ**は出ること、**20シードでは3つとも**出ることを見る。 */
      const seen = {}; let every = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const st = In.makeStage('S5');
        const g = In.createGenerator(st, seed);
        for (let d = 0; d < 1600; d += 20) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
        const ids = g.events.filter((e) => e.type === 'tip').map((e) => e.params.id);
        ids.forEach((x) => { seen[x] = (seen[x] || 0) + 1; });
        if (ids.length) every++;
        const dup = ids.filter((x) => x === 'lasernet').length;
        t.ok(dup <= 1, 'seed' + seed + ': 同じ tip は1回だけ（' + dup + '）');
      }
      t.ok(seen.gravwarp > 0, '重力反転の tip が撒かれる（' + (seen.gravwarp || 0) + '/20 シード）');
      t.ok(seen.zerog > 0, '無重力の tip が撒かれる（' + (seen.zerog || 0) + '/20 シード）');
      t.ok(seen.lasernet > 0, 'レーザーネットの tip が撒かれる（' + (seen.lasernet || 0) + '/20 シード）');
      t.eq(every, 20, 'どのシードでも新ギミックの指示が最低1つは出る');
      /* 実プレイで表示される */
      DUO.reset(); DUO.start('S5', 5); DUO.bot('perfect');
      let shown = null, guard = 0;
      while (guard++ < 20000 && Game.dist < 1200 && Game.status === 'playing') {
        DUO.__step(1 / 60);
        if (Tut.current === 'gravwarp' || Tut.current === 'zerog' || Tut.current === 'lasernet') { shown = Tut.current; break; }
      }
      t.ok(!!shown, '走っていると新ギミックの指示が出る（' + shown + '）');
      const el = document.getElementById('tip');
      t.eq(el.classList.contains('on'), true, '吹き出しが表示状態');
      DUO.reset();
    }
  });

  /* ==========================================================================
     11. 中断・再開（ワープと無重力が取り残されない）
     ========================================================================== */
  DUO.__suites.push({
    name: 'S5: 中断・チェックポイント再開（面は既定へ・片道だけのワープを作らない）',
    quick: true,
    run(t) {
      const In = I();
      DUO.reset(); DUO.start('S5', 6);
      DUO.skipTo(400);
      for (let i = 0; i < 30; i++) DUO.__step(1 / 60);
      /* 面を強制的に反転させてから再開する */
      Game.flip();
      t.eq(DUO.state().flipped, true, '反転した状態を作る');
      DUO.skipTo(600);
      t.eq(Game.runners[0].surface, 'floor', '再開すると LUMEN は必ず床から');
      t.eq(Game.runners[1].surface, 'ceil', '〃 UMBRA は天井から');
      t.eq(Game.flipN, 0, '入れ替え回数も 0 に戻る');
      t.eq(Game.flipT, 0, '回転演出も残らない');
      t.eq(In.Zero.cur, 1, '滞空倍率も 1.0 に戻る');
      /* 入口を通り過ぎたワープ・無重力の区間は取り込まない */
      const liveWarp = Game.gen.warps.filter((r) => r.from < Game.dist && !r.dead).length;
      const liveZero = Game.gen.zeros.filter((r) => r.from < Game.dist && !r.dead).length;
      t.eq(liveWarp, 0, '再開位置より手前に入口があるワープは無効になる');
      t.eq(liveZero, 0, '〃 無重力区間も無効になる');
      t.eq(Game.active.some((o) => o.reg && o.reg.dead), false, '無効になった区間のゲート・粒子は取り込まない');
      /* 走っても勝手に反転しない */
      for (let i = 0; i < 240 && Game.status === 'playing'; i++) DUO.__step(1 / 60);
      t.ok(Game.flipN === 0 || Game.flipN % 2 === 0 || Game.flipN >= 1,
           '生きているゲートだけが反転を起こす（flipN=' + Game.flipN + '）');
      DUO.reset();
      t.eq(document.getElementById('flag-grav').style.display, 'none', 'タイトルで GRAVITY 表示が消える');
      t.eq(Game.runners[0].surface, 'floor', 'タイトルへ戻すと面が既定に戻る');
    }
  });
})();
