/* ============================================================================
   tests/test_p2a.js — P2a 段階2で足した規範の検証
     ・動作比率（契約 §4.3: レーン移動／ジャンプの2種。スライディングは 2026-09-27 失効）
     ・壁の穴の失効（定義のどこにも残っていない）
     ・カメラ対称性 camSym（横1280×720・縦375×812 とも 0.8〜1.25）
     ・見た目と当たり判定のズレ（±10%以内）
     ・速度（§4.1 2026-09-21 2倍化）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;

  /* S0 を 1本ぶん生成して障害物リストを返す（実プレイと同じく前進しながら生成） */
  function genStage(seed, maxRank) {
    const In = I();
    const stage = In.makeStage('S0');
    if (maxRank) stage.maxRank = maxRank;
    const gen = In.createGenerator(stage, seed);
    for (let d = 0; d < stage.lengthM; d += 20) gen.ensure(d + In.CFG.SPAWN_AHEAD, d);
    return { stage: stage, gen: gen, list: gen.obstacles.filter((o) => o.at <= stage.lengthM) };
  }

  DUO.__suites.push({
    name: '動作比率（契約§4.3: レーン移動／ジャンプの2種・スライディング失効）',
    quick: true,
    run(t) {
      const In = I();
      const sum = { lane: 0, jump: 0, total: 0 };
      let other = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const g = genStage(seed);
        const c = In.Fair.countDemands(g.list, g.stage.speedAt);
        sum.lane += c.lane; sum.jump += c.jump; sum.total += c.total;
        other += c.total - c.lane - c.jump;
      }
      const pct = (k) => sum.total ? sum[k] / sum.total * 100 : 0;
      t.ok(sum.total > 500, 'S0 50シードで必須動作が十分に集まる（' + sum.total + '回）');
      /* 契約§4.3（2026-09-27）: 回避は「横に避ける」と「飛び越える」の2種だけ。
         レーン 45〜60% を主基準、ジャンプは残り（40〜55%）で見る。 */
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 40 && pct('jump') <= 55, 'ジャンプ ' + pct('jump').toFixed(1) + '% が 40〜55%');
      t.eq(other, 0, '要求はレーン移動とジャンプの2種だけ（それ以外 ' + other + '回）');
      t.ok(!('slide' in In.Fair.countDemands([], () => 10)), '集計にスライドの列が無い');
      t.info('内訳 lane=' + sum.lane + ' jump=' + sum.jump + ' 計' + sum.total);
    }
  });

  /* 壁の穴（WALLHOLE / WALLSOLID）の失効（契約§4.3 2026-09-27）。定義のどこにも残っていない */
  DUO.__suites.push({
    name: '壁の穴の失効（定義: チャンク・S1・大演出・エンドレスの札・型）',
    quick: true,
    run(t) {
      const In = I();
      const bad = (e) => e && (e.type === 'WALLHOLE' || e.type === 'WALLSOLID');
      t.ok(!In.OBS.WALLHOLE && !In.OBS.WALLSOLID, 'OBS に WALLHOLE / WALLSOLID の型が無い');
      let n = 0;
      In.CHUNK_DEFS.forEach((d) => {
        (d.floor || []).concat(d.ceil || []).forEach((e) => { if (bad(e)) n++; });
        if (d.wallhole) n++;
      });
      t.eq(n, 0, 'ステージのチャンク定義に壁の穴が無い（' + In.CHUNK_DEFS.length + '本）');
      let m = 0;
      In.EndlessKit.UNITS.forEach((d) => {
        (d.floor || []).concat(d.ceil || []).forEach((e) => { if (bad(e)) m++; });
        if (d.wallhole || d.gset.indexOf('wallhole') >= 0) m++;
      });
      t.eq(m, 0, 'エンドレスの札に壁の穴が無い（' + In.EndlessKit.UNITS.length + '枚）');
      t.ok(In.EndlessKit.GIMMICKS.indexOf('wallhole') < 0, 'エンドレスの採用ギミックに壁の穴が無い');
      let k = 0;
      In.INTRO_S1.forEach((it) => (it.floor || []).concat(it.ceil || []).forEach((e) => { if (bad(e)) k++; }));
      t.eq(k, 0, 'S1 チュートリアル（INTRO_TUT）に壁の穴が無い');
      t.ok(!In.Tutorial.TIPS.hole, 'tip「壁の穴は潜る」が無い');
      let s = 0;
      Object.keys(In.Setpieces.DEFS || {}).forEach((id) => {
        const sc = In.Setpieces.DEFS[id];
        (sc.floor || []).concat(sc.ceil || []).forEach((e) => { if (bad(e)) s++; });
      });
      t.eq(s, 0, '大演出のスクリプトに壁の穴が無い');
      /* 文言: tip・HUD の案内に「潜る」が残っていない */
      const txt = Object.keys(In.Tutorial.TIPS).map((id) => In.Tutorial.TIPS[id].ph.join('')).join(' ');
      t.ok(txt.indexOf('潜') < 0, 'tip の文言に「潜る」が無い');
    }
  });

  /* 生成結果にも壁の穴が出ない（全7ステージ×50シード・エンドレス（全クリア扱い）×50シード×3000m）。
     重いので runAll のみ */
  DUO.__suites.push({
    name: '壁の穴が生成されない（全7ステージ×50シード・エンドレス×50シード×3000m）',
    quick: false,
    run(t) {
      const In = I();
      const U = In.U, snap = U.lsSnapshot();
      const bad = {};
      let n = 0, other = 0;
      const scan = (sid, list, st) => {
        list.forEach((o) => { n++; if (/^WALL/.test(o.type)) bad[sid] = (bad[sid] || 0) + 1; });
        const c = In.Fair.countDemands(list, st.speedAt);
        other += c.total - c.lane - c.jump;
      };
      try {
        U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
        ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'endless'].forEach((sid) => {
          for (let seed = 1; seed <= 50; seed++) {
            const st = In.makeStage(sid);
            const g = In.createGenerator(st, seed);
            const L = (sid === 'endless') ? 3000 : st.lengthM;
            for (let d = 0; d < L + 100; d += 40) g.ensure(d + In.CFG.SPAWN_AHEAD, d);
            scan(sid, g.obstacles.filter((o) => o.at <= L), st);
          }
        });
      } finally { U.lsRestore(snap); }
      t.eq(Object.keys(bad).length, 0, '壁の穴（WALLHOLE / WALLSOLID）は1枚も生成されない（障害物 ' + n + ' 個・' + (JSON.stringify(bad)) + '）');
      t.eq(other, 0, '要求はレーン移動とジャンプの2種だけ（それ以外 ' + other + '回）');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'カメラ対称性 camSym（横・縦とも 0.8〜1.25 / §4.1）',
    quick: true,
    run(t) {
      const In = I(), W = In.World;
      DUO.reset(); DUO.start('S0', 9); DUO.pump(1 / 60);
      [[1280, 720, 'PC横'], [375, 812, 'スマホ縦'], [812, 375, '横持ち']].forEach((v) => {
        W.setViewport(v[0], v[1], 1);
        DUO.pump(1 / 60);
        const c = DUO.state().camSym;
        t.ok(c && c.ratio >= 0.8 && c.ratio <= 1.25,
             v[2] + ' ' + v[0] + '×' + v[1] + ' の見かけ高さ比 ' + (c ? c.ratio : 'null') +
             '（LUMEN ' + (c ? c.lumen : '-') + 'px / UMBRA ' + (c ? c.umbra : '-') + 'px）');
        /* 2体が視錐台に入っていること */
        const cam = W.camera;
        cam.updateMatrixWorld();
        const fr = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        In.Game.runners.forEach((r) => {
          t.ok(fr.containsPoint(new THREE.Vector3(In.Runners.x(r), In.Runners.footY(r), 0)),
               v[2] + ': ' + r.id + ' が画面内');
        });
      });
      W.resize();
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: '見た目と当たり判定のズレが ±10% 以内',
    quick: true,
    run(t) {
      const In = I(), OBS = In.OBS, CFG = In.CFG;
      /* 例外（意図的に判定の外に出る装飾。いずれも「当たらないのに当たりそう」に
         見える方向ではないので許容する）:
           GAP      … 路面下の穴と、判定外の路面を戻す埋め板を持つので x だけ見る
           LASER_SCAN … 到達位置を示す路面のマーカー（判定の外の標示）が x/z に伸びる。
                        光柱そのものの高さ y は判定どおりなので y だけ見る
           LASER_ROT  … 腕と光のカーテンは毎フレーム bands() から置く“動く部品”なので
                        静止した外接箱では測れない（tests/test_p2b.js が
                        occ ⇔ hits の総当りで、判定と見た目の一致を直接検証している）
           BRIDGE     … 板（判定の外＝踏んでいる間は無害）と谷が前後・左右・下へ伸びる。
                        落ちる位置と判定の一致は tests/test_p3a.js が直接見ている */
      /* P3b で足した S4 の新ギミック:
           SYNCPAD … 当たり判定を持たない（踏むだけ）ので外接箱と比べられない
           SYNCGAP … 谷・折れた橋脚・架かる橋の3態を重ねて持つ（tests/test_p3b.js が occ⇔hits で見る）
           DROPCEIL … 床のブロックと天井の穴の2枚を絶対 y で持つので y/z は外接箱と合わない */
      /* P4a で足した S5 の新ギミック:
           CURRENT/CURGATE … 当たり判定を持たない（流れの矢印とゲートだけ）
           DOOR            … 同色＝通れる扉なので当たり判定を持たない
           LIFTPAD         … 土台の縁が判定の外へ少し出る（天板は判定どおり）
           FISH_TAIL       … 動く部品（bands から毎フレーム置く / LASER_SCAN と同じ理由） */
      /* 【2026-09-23 P5c】ジャンプ障害物（ローバー／ローレーザー）に足した
           ・両脇の高い支柱 1.6m（レーン端 x=±0.55）
           ・支柱上端をつなぐ光る警告バー
           ・手前の路面の警告帯（幅レーン・長さ 4m・シェブロン）
         は **当たり判定を一切持たない視認性のための標示**（契約§4.3）。
         判定 0.6m の柵に対して見た目 1.72m・奥行き 4.25m を比べてしまうと
         この検査の目的（当たり判定と実体の食い違いを見つける）が測れなくなるので、
         装飾（userData.deco）を外した外接箱 In.viewBox() で測る。 */
      const skip = { GAP: ['y', 'z'], LASER_SCAN: ['x', 'z'], LASER_ROT: ['x', 'y', 'z'],
                     /* S7: ゲートは ghost、割れた鏡の床は足場＋裂け目を毎フレーム置く（P5a） */
                     MIRGATE: ['x', 'y', 'z'], SWAPGATE: ['x', 'y', 'z'], MERGEGATE: ['x', 'y', 'z'], SHARDGAP: ['x', 'y', 'z'],
                    WARPGATE: ['x', 'y', 'z'], ZEROGATE: ['x', 'y', 'z'],
                     ZEROFIELD: ['x', 'y', 'z'], NETGATE: ['x', 'y', 'z'],
                     LASER_H: ['x', 'y', 'z'], LASER_DIAG: ['x', 'y', 'z'],
                     BRIDGE: ['x', 'y', 'z'],
                     SYNCPAD: ['x', 'y', 'z'], SYNCGAP: ['x', 'y', 'z'], DROPCEIL: ['y', 'z'],
                     CURRENT: ['x', 'y', 'z'], CURGATE: ['x', 'y', 'z'], DOOR: ['x', 'y', 'z'],
                     LIFTPAD: ['z'], FISH_TAIL: ['x', 'z'] };
      Object.keys(OBS).forEach((type) => {
        const view = In.Obstacles.acquire(type);
        view.position.set(0, 0, 0); view.rotation.set(0, 0, 0); view.updateMatrixWorld(true);
        const b3 = In.viewBox(view);            /* 判定外の装飾（P5c の支柱・警告バー・路面帯）は除く */
        const o = In.Obstacles.make(type, 'floor', 0, 0, 0);
        const hb = In.Obstacles.box(o, 0);
        /* 見た目はレーン中心ローカル。span2 は判定側が隣レーンまで伸びるのでその分ずらす */
        const xc = ((In.Obstacles.laneLo(o) + In.Obstacles.laneHi(o)) / 2) * CFG.LANE_W;
        const ex = skip[type] || [];
        const cmp = (ax, edge, v, h, size) => {
          if (ex.indexOf(ax) >= 0 || ex.indexOf(ax + edge) >= 0) return;
          const tol = Math.max(Math.abs(size) * 0.10, 0.07);
          t.ok(Math.abs(v - h) <= tol,
               OBS[type].label + ' ' + ax + edge + ': 見た目 ' + v.toFixed(2) + ' / 判定 ' + h.toFixed(2) +
               '（許容±' + tol.toFixed(2) + '）');
        };
        cmp('x', 0, b3.min.x + xc, hb.x0, hb.x1 - hb.x0);
        cmp('x', 1, b3.max.x + xc, hb.x1, hb.x1 - hb.x0);
        cmp('y', 0, b3.min.y, hb.y0, hb.y1 - hb.y0);
        cmp('y', 1, b3.max.y, hb.y1, hb.y1 - hb.y0);
        cmp('z', 0, b3.min.z, hb.z0, hb.z1 - hb.z0);
        cmp('z', 1, b3.max.z, hb.z1, hb.z1 - hb.z0);
        In.Obstacles.release(type, view);
      });

      /* 2体: 走りの見た目が判定ボックスに収まっているか（スライディングは 2026-09-27 失効） */
      DUO.reset(); DUO.start('S0', 3); DUO.pump(1 / 60);
      const Game = In.Game, W = In.World;
      const check = (act, label) => {
        const r = Game.runners[0];
        if (act !== 'run') In.Runners.input(r, act);
        for (let i = 0; i < 12; i++) DUO.pump(1 / 60);
        const v = W.runnerViews.lumen;
        v.group.updateMatrixWorld(true);
        const b3 = new THREE.Box3().setFromObject(v.group);
        const hb = In.Runners.box(r);
        const hy = hb.y1 - hb.y0, hz = hb.z1 - hb.z0;
        t.ok(Math.abs((b3.max.y - b3.min.y) - hy) <= Math.max(hy * 0.10, 0.06),
             label + ' 高さ: 見た目 ' + (b3.max.y - b3.min.y).toFixed(2) + ' / 判定 ' + hy.toFixed(2));
        t.ok(Math.abs((b3.max.z - b3.min.z) - hz) <= Math.max(hz * 0.10, 0.06),
             label + ' 奥行き: 見た目 ' + (b3.max.z - b3.min.z).toFixed(2) + ' / 判定 ' + hz.toFixed(2));
        while (Game.runners[0].act !== 'run') DUO.pump(1 / 60);
      };
      check('run', 'LUMEN 走り');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: '速度（§4.1 2026-09-21 2倍化）と時間基準の不変条件',
    quick: true,
    run(t) {
      const In = I(), CFG = In.CFG;
      t.eq(CFG.SPEED_MIN, 16, '開始速度 16 m/s');
      t.eq(CFG.SPEED_MAX, 44, '上限速度 44 m/s');
      const s0 = In.makeStage('S0');
      t.near(s0.speedAt(0), 16, 1e-6, 'S0 開始 16 m/s');
      t.near(s0.speedAt(s0.lengthM), 20, 1e-6, 'S0 終了 20 m/s');
      const e = In.makeStage('endless');
      t.near(e.speedAt(0), 16, 1e-6, 'エンドレス開始 16 m/s');
      t.ok(e.speedAt(100000) <= CFG.SPEED_MAX, 'エンドレスでも上限 44 を超えない');
      /* 生成は速度に比例して伸びる＝「動作に使える時間」は速度が変わっても同じ */
      const g = genStage(7);
      const walls = In.Fair.walls(g.list, g.stage.speedAt);
      let minSec = 1e9;
      for (let i = 1; i < walls.length; i++) {
        minSec = Math.min(minSec, (walls[i].at - walls[i - 1].atEnd) / g.stage.speedAt(walls[i].at));
      }
      t.ok(minSec >= CFG.FAIR.REACT, '速度2倍でも最小ウォール間隔 ' + minSec.toFixed(3) + '秒 ≥ ' + CFG.FAIR.REACT + '秒');
      /* 画角は速度で広がる（狭まらない＝2体が画面外に出ない） */
      const W = In.World;
      DUO.reset(); DUO.start('S0', 3);
      for (let i = 0; i < 90; i++) DUO.pump(1 / 60);
      t.ok(W.camera.fov >= W._baseFov - 1e-6, '速度演出の画角は基準より狭くならない（' +
           W.camera.fov.toFixed(1) + '° ≥ ' + W._baseFov.toFixed(1) + '°）');
      t.ok(W.camera.fov <= W._baseFov + CFG.CAM.FOV_SPEED_GAIN + 1e-6, '画角の上乗せは +' + CFG.CAM.FOV_SPEED_GAIN + '° まで');
      DUO.reset();
    }
  });
})();
