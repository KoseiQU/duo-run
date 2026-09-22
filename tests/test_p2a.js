/* ============================================================================
   tests/test_p2a.js — P2a 段階2で足した規範の検証
     ・動作比率（契約 §4.3: レーン移動 50%前後／ジャンプ 35%前後／スライド 15%以下）
     ・壁の穴のルール（rank3以上・1チャンク最大1・連続禁止・全幅に展開される）
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
    name: '動作比率（契約§4.3: レーン移動/ジャンプ主体・スライドは15%以下）',
    quick: true,
    run(t) {
      const In = I();
      const sum = { lane: 0, jump: 0, slide: 0, total: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const g = genStage(seed);
        const c = In.Fair.countDemands(g.list, g.stage.speedAt);
        sum.lane += c.lane; sum.jump += c.jump; sum.slide += c.slide; sum.total += c.total;
      }
      const pct = (k) => sum.total ? sum[k] / sum.total * 100 : 0;
      t.ok(sum.total > 500, 'S0 50シードで必須動作が十分に集まる（' + sum.total + '回）');
      /* 契約§4.3「レーン移動50%前後／ジャンプ35%前後／スライド15%以下」。
         スライドは壁の穴だけ（S1は0%）なので、その余りはジャンプ側に乗る。
         ＝ レーン 45〜60% を主基準、ジャンプは残り（28〜55%）で見る。 */
      t.ok(pct('lane') >= 45 && pct('lane') <= 60, 'レーン移動 ' + pct('lane').toFixed(1) + '% が 45〜60%');
      t.ok(pct('jump') >= 28 && pct('jump') <= 55, 'ジャンプ ' + pct('jump').toFixed(1) + '% が 28〜55%');
      t.ok(pct('slide') <= 15, 'スライディング ' + pct('slide').toFixed(1) + '% ≤ 15%');
      t.info('内訳 lane=' + sum.lane + ' jump=' + sum.jump + ' slide=' + sum.slide);

      /* S1相当（ランク1〜2のみ）はスライド0% */
      const s12 = { slide: 0, total: 0 };
      for (let seed = 1; seed <= 50; seed++) {
        const g = genStage(seed, 2);
        const c = In.Fair.countDemands(g.list, g.stage.speedAt);
        s12.slide += c.slide; s12.total += c.total;
      }
      t.eq(s12.slide, 0, 'S1相当（ランク1〜2）ではスライディングが0回（' + s12.total + '回中）');
    }
  });

  DUO.__suites.push({
    name: '壁の穴のルール（rank3以上・1チャンク最大1・連続禁止・全幅展開）',
    quick: true,
    run(t) {
      const In = I();
      const defs = In.CHUNK_DEFS;
      let holeChunks = 0;
      defs.forEach((d) => {
        const n = (d.floor || []).concat(d.ceil || []).filter((e) => e.type === 'WALLHOLE').length;
        if (n) {
          holeChunks++;
          t.ok(n === 1, d.id + ': 壁の穴は1チャンクに1つだけ（' + n + '）');
          t.ok(d.difficulty >= 3, d.id + ': 壁の穴は rank3 以上（rank' + d.difficulty + '）');
          t.ok(d.wallhole === 1, d.id + ': wallhole フラグが立っている（生成器の連続禁止に使う）');
        }
        /* 失効した旧型を使っていないこと */
        (d.floor || []).concat(d.ceil || []).forEach((e) => {
          /* SYNCSW は「対のパッド＋その先の橋」へ展開される譜面上の型（P3b / 契約§4.5）。
             実体は SYNCPAD / SYNCGAP なので OBS には載っていない。 */
          if (e.type === 'SYNCSW') { t.ok(typeof In.Sync.expand === 'function', d.id + ': SYNCSW は Sync が展開する'); return; }
          /* ZEROG / GRAVWARP も同じ「譜面上の型」（P4b / 契約§4.5）。
             実体は ZEROGATE+ZEROFIELD / WARPGATE×2 で、規則は Zero / Warp が持つ。 */
          if (e.type === 'ZEROG') { t.ok(typeof In.Zero.expand === 'function', d.id + ': ZEROG は Zero が展開する'); return; }
          if (e.type === 'GRAVWARP') { t.ok(typeof In.Warp.expand === 'function', d.id + ': GRAVWARP は Warp が展開する'); return; }
          /* MIRRORZ / HANDSWAP も同じ「譜面上の型」（P5a / 契約§4.5）。
             実体は MIRGATE×2 / SWAPGATE×2 で、規則は Mirror / Swap が持つ。 */
          if (e.type === 'MIRRORZ') { t.ok(typeof In.Mirror.expand === 'function', d.id + ': MIRRORZ は Mirror が展開する'); return; }
          if (e.type === 'HANDSWAP') { t.ok(typeof In.Swap.expand === 'function', d.id + ': HANDSWAP は Swap が展開する'); return; }
          /* MERGE も同じ「譜面上の型」（P5b / 契約§4.5 合体区間）。
             実体は MERGEGATE×2 で、規則は Merge が持つ。 */
          if (e.type === 'MERGE') { t.ok(typeof In.Merge.expand === 'function', d.id + ': MERGE は Merge が展開する'); return; }
          t.ok(!!In.OBS[e.type], d.id + ': 未定義の障害物型を使っていない (' + e.type + ')');
          t.ok(e.type !== 'WALLSOLID', d.id + ': WALLSOLID はチャンクに直接書かない');
        });
      });
      t.ok(holeChunks >= 2, '壁の穴を含むチャンクが定義されている（' + holeChunks + '本）');

      /* 生成結果: 全幅に展開され、穴レーン以外は WALLSOLID になる */
      let walls = 0, consecutive = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const g = genStage(seed);
        const byAt = {};
        g.list.forEach((o) => {
          if (o.type !== 'WALLHOLE' && o.type !== 'WALLSOLID') return;
          const k = o.surface + '@' + o.at.toFixed(2);
          (byAt[k] = byAt[k] || []).push(o);
        });
        Object.keys(byAt).forEach((k) => {
          const set = byAt[k];
          walls++;
          t.ok(set.length === 3, '壁は3レーン全部に置かれる（' + set.length + '）');
          t.ok(set.filter((o) => o.type === 'WALLHOLE').length === 1, '穴は1レーンだけ');
          const lanes = set.map((o) => o.lane).sort();
          t.ok(lanes.join(',') === '-1,0,1', '3レーンを覆う（' + lanes.join(',') + '）');
        });
        /* 連続禁止: ログ上で壁の穴チャンクが隣り合わない */
        const ids = g.gen.log.map((c) => c.id);
        for (let i = 1; i < ids.length; i++) {
          const a = In.CHUNK_DEFS.filter((d) => d.id === ids[i - 1])[0];
          const b = In.CHUNK_DEFS.filter((d) => d.id === ids[i])[0];
          if (a && b && a.wallhole && b.wallhole) consecutive++;
        }
      }
      t.ok(walls > 0, '50シード中に壁の穴が生成される（' + walls + '枚）');
      t.eq(consecutive, 0, '壁の穴チャンクは連続しない');
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
           WALLHOLE … 穴の中（判定の下）に潜り抜けの誘導帯があるので y の下端は見ない
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
      const skip = { GAP: ['y', 'z'], WALLHOLE: ['y0'], LASER_SCAN: ['x', 'z'], LASER_ROT: ['x', 'y', 'z'],
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

      /* 2体: 走り／ジャンプ／スライドの見た目が判定ボックスに収まっているか */
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
      check('slide', 'LUMEN スライド');
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
