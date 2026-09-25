/* ============================================================================
   tests/test_p7a.js — P7a（v2基盤: 契約 §4.3【全面改訂 v2】・§4.5【緩和】・§4.8【改訂】・§5）
     【P7a-1】障害物の共通デザイン（ゾーン別スキンは失効）
       ・全ゾーンで同じ1セット（Zones.skin() === ObstacleSkin・ゾーンは obstacleSkin を持たない）
       ・障害物の色は赤・橙・白（＋無彩色）だけ。プレイヤーの琥珀・藍は使わない
       ・ハードル＝白×赤縞の発光バー（幅レーン一杯・厚み0.3・支柱/警告バー/▲なし）
       ・輝度差: 40m 先の障害物の画素が、周りの背景より +40 以上明るい（全6ゾーン）
     【P7a-2】道の簡素化（契約§5 v2）
       ・全ゾーンの走行サンプルで、コリドー内（|x| < 2.0・0 < y < 4）に小物の頂点が1つもない
         （障害物・キャラ・路面と路肩のラインの光は対象外）
       ・路面は無地の暗色（1色・光沢なし）／小物の密度はコリドーの外で前方60mに40個以上
     【P7a-3】失効ギミックの削除・ワイド梁の通常出現
       ・ギャップ・落ちる天井・海流・浮上足場・色の扉が 判定・譜面・大演出・tip のどこにも無い
       ・全ステージ（30シード）でピラー:ワイド梁 ≈ 6:4（ワイド梁の割合 0.40 ±0.10）・§4.7 違反0
     【P7a-4】tip 猶予改訂（tests/test_p5c.js の v2 版）＋自由飛行の緩和
       ・自由飛行: 判定半径 0.30・隙間 +30%・発射後2.0秒なし・間隔 ≥ 1.5秒・1回の飛行で 3〜4個
         （S2 大ジャンプ・S5 区画爆発・S7 全崩壊・エンドレスのミニ版 × 50シード）
       ・高さの手がかり（床と天井の影・照準リング・次の隙間への誘導線）が飛行中だけ出る
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;
  const ZONES = ['neon', 'ruins', 'sea', 'space', 'mirror', 'core', 'white'];
  /* 見た目を検査する「障害物」（ゲート・帯などの目印は障害物ではない） */
  const HAZ = ['ROVER', 'LASER_LOW', 'PILLAR', 'WIDEBAR', 'LASER_V',
               'LASER_SCAN', 'LASER_ROT', 'COLUMN', 'FISH_TOOTH', 'FISH_FIN', 'FISH_TAIL'];

  /* 色が「赤〜橙」か「無彩色（白・灰・黒）」か */
  function warnColor(hex) {
    const c = new THREE.Color(hex), hsl = {};
    c.getHSL(hsl);
    if (hsl.s < 0.2 || hsl.l > 0.93 || hsl.l < 0.08) return true;      // 白・灰・黒
    return (hsl.h * 360 <= 32 || hsl.h * 360 >= 350);                    // 赤〜橙（琥珀 36°は外れる）
  }

  DUO.__suites.push({
    name: 'P7a-1: 障害物の共通デザイン（全ゾーン同一・赤/橙/白のみ・ハードルは発光バーで支柱なし）',
    quick: true,
    run(t) {
      const In = I(), Zs = In.Zones, Ob = In.Obstacles, OBS = In.OBS, CFG = In.CFG;
      DUO.reset(); DUO.start('S1', 3); DUO.pump(1 / 60);
      ZONES.forEach((zn) => {
        t.ok(!Zs.get(zn).obstacleSkin, zn + ': ゾーン別の障害物スキンを持たない');
      });
      ['neon', 'space'].forEach((zn) => {
        Zs.switchTo(zn); DUO.pump(1 / 60);
        t.eq(Zs.skin(), ObstacleSkin, zn + ': 障害物の見た目は共通の1セット');
      });
      /* 同じ型は同じ見た目（ゾーンを替えても形・色が同じ） */
      const sig = (ty) => {
        const v = Ob.acquire(ty); const out = [];
        v.traverse((q) => { if (q.isMesh) out.push(q.geometry.attributes.position.count + ':' + q.material.color.getHex()); });
        Ob.release(ty, v);
        return out.sort().join(',');
      };
      Zs.switchTo('neon'); DUO.pump(1 / 60);
      const a = sig('PILLAR') + '|' + sig('ROVER');
      Zs.switchTo('sea'); DUO.pump(1 / 60);
      const b = sig('PILLAR') + '|' + sig('ROVER');
      t.eq(a, b, 'ゾーンを替えても同じ見た目（形と色）');
      Zs.switchTo('neon'); DUO.pump(1 / 60);

      /* 色の規則（契約§4.3「赤・橙・白の警告色のみ」） */
      const bad = [];
      HAZ.forEach((ty) => {
        const v = Ob.acquire(ty);
        v.traverse((q) => {
          if (!q.isMesh || !q.material || !q.material.color) return;
          const hx = q.material.color.getHex();
          if (!warnColor(hx) || hx === CFG.COL.LUMEN || hx === CFG.COL.UMBRA) bad.push(ty + ':#' + hx.toString(16));
        });
        Ob.release(ty, v);
      });
      t.eq(bad.length, 0, '障害物の色は赤・橙・白（＋無彩色）だけ' + (bad.length ? ': ' + bad.slice(0, 6).join(' ') : ''));

      /* ハードル: 太い白×赤縞の発光バー（厚み0.3・幅レーン一杯）。支柱・警告バー・▲は失効 */
      ['ROVER', 'LASER_LOW'].forEach((ty) => {
        const v = Ob.acquire(ty);
        v.position.set(0, 0, 0); v.rotation.set(0, 0, 0); v.updateMatrixWorld(true);
        const all = new THREE.Box3().setFromObject(v);
        t.ok(all.max.y <= OBS[ty].y1 + 0.02, ty + ': 判定の高さ ' + OBS[ty].y1 + ' より上に何も出ていない（支柱・警告バー・▲なし）: ' + all.max.y.toFixed(2));
        t.ok(!v.userData.warnRig, ty + ': P5c の骨格（warnRig）は無い');
        Ob.release(ty, v);
      });
      const hv = Ob.acquire('ROVER');
      const cols = {};
      hv.position.set(0, 0, 0); hv.rotation.set(0, 0, 0); hv.updateMatrixWorld(true);
      const ub = new THREE.Box3(); ub.makeEmpty();
      hv.traverse((q) => {
        if (!q.isMesh || q.userData.deco || q.material.transparent) return;
        cols[q.material.color.getHex()] = 1;
        ub.expandByObject(q);
      });
      const barH = ub.max.y - ub.min.y, barW = ub.max.x - ub.min.x;
      t.ok(cols[0xffffff] && cols[ObstacleSkin.COL.red], 'ハードルは白×赤の縞');
      t.near(barH, 0.30, 0.02, 'ハードルのバーの厚み 0.3');
      t.ok(barW >= CFG.LANE_W - 2 * 0.10 - 0.02, 'ハードルは幅レーン一杯: ' + barW.toFixed(2));
      Ob.release('ROVER', hv);
      /* 判定は不変（OBS） */
      t.eq(OBS.ROVER.y1, 0.60, 'ハードルの判定高さは 0.6 のまま');
      t.eq(OBS.WIDEBAR.span, 2, 'ワイド梁は2レーン封鎖');
      DUO.reset();
    }
  });

  /* 40m 先の障害物の画素と、その周りの背景の輝度差（契約§5「背景より必ず明るい（+40）」） */
  DUO.__suites.push({
    name: 'P7a-1: 障害物は背景より明るい（40m 先・輝度差 +40 以上・全6ゾーン＋白空間は絶対差）',
    quick: false,
    run(t) {
      const In = I(), Game = In.Game, W = In.World;
      /* P7c: 7ステージの新ID。S1 の白空間は「白背景に対して暗い/赤い」方向で満たす＝符号なしの絶対差（契約§5 / P7c 指示） */
      const SPEC = [['neon', 'S2'], ['ruins', 'S3'], ['sea', 'S4'], ['space', 'S5'], ['mirror', 'S6'], ['core', 'S7'], ['white', 'S1']];
      const TYPES = ['ROVER', 'LASER_LOW', 'PILLAR', 'WIDEBAR', 'LASER_V'];
      const w = 812, h = 375;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      const grab = () => { Game._lastDt = 0; Game.render(); cx.drawImage(W.renderer.domElement, 0, 0, w, h); return cx.getImageData(0, 0, w, h).data; };
      const Y = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const rows = [];
      SPEC.forEach((sp) => {
        DUO.reset(); DUO.start(sp[1], 7); DUO.pump(1 / 60);
        DUO.skipTo(420);
        for (let i = 0; i < 4; i++) DUO.pump(1 / 60);
        W.setViewport(w, h, 1);
        TYPES.forEach((ty) => {
          In.clearObstacles();
          const list = [In.spawnOne(ty, 'floor', ty === 'WIDEBAR' ? -1 : 0, 40)];
          const A = grab().slice();
          const B = (function () {
            /* 障害物だけを消して同じ絵を描く（syncObstacles が visible を戻すので描画の直前に消す） */
            const r0 = W.render;
            W.render = function () { list.forEach((o) => { if (o.view) o.view.visible = false; }); return r0.apply(W, arguments); };
            try { return grab().slice(); } finally { W.render = r0; }
          })();
          /* 障害物の画素 ＝ 障害物を消すと変わる画素。背景 ＝ その外接矩形を 1.6倍ずつ広げた輪の画素
             （障害物の画素を除く）。P5c の決定（投影矩形は背景が混ざるので「障害物の画素」で測る）と同じ流儀 */
          let so = 0, n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
          const mask = new Uint8Array(w * h);
          for (let i = 0, p = 0; i < A.length; i += 4, p++) {
            if (Math.abs(Y(A, i) - Y(B, i)) < 6) continue;
            mask[p] = 1; so += Y(A, i); n++;
            const x = p % w, y = (p / w) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          let sb = 0, nb = 0;
          const pw = (x1 - x0 + 1) * 1.6, ph = (y1 - y0 + 1) * 1.6;
          for (let y = Math.max(0, Math.floor(y0 - ph)); y < Math.min(h, Math.ceil(y1 + ph)); y++) {
            for (let x = Math.max(0, Math.floor(x0 - pw)); x < Math.min(w, Math.ceil(x1 + pw)); x++) {
              const p = y * w + x;
              if (mask[p]) continue;
              sb += Y(B, p * 4); nb++;
            }
          }
          const d = (n && nb) ? so / n - sb / nb : -999;
          rows.push(sp[0] + '/' + ty + ' ' + d.toFixed(0) + '(' + (so / Math.max(1, n)).toFixed(0) + '-' + (sb / Math.max(1, nb)).toFixed(0) + ')');
          if (sp[0] === 'white') t.ok(n > 20 && Math.abs(d) >= 40, sp[0] + '/' + ty + ': 40m 先の輝度差の絶対値 ' + Math.abs(d).toFixed(1) + ' ≥ 40（白背景に対して暗い/赤い・' + n + 'px）');
          else t.ok(n > 20 && d >= 40, sp[0] + '/' + ty + ': 40m 先の輝度差 ' + d.toFixed(1) + ' ≥ +40（' + n + 'px）');
        });
        W.resize();
      });
      t.info(rows.join(' / '));
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P7a-2: 道の簡素化（コリドー内に小物なし・路面は無地の暗色・外側の小物は前方60mに40個以上）',
    quick: true,
    run(t) {
      const In = I(), Zs = In.Zones, W = In.World;
      const SPEC = [['neon', 'S2'], ['ruins', 'S3'], ['sea', 'S4'], ['space', 'S5'], ['mirror', 'S6'], ['core', 'S7']];
      /* S1（白い無地の空間 / 契約§5 v2 の例外）: 小物も遠景も置かない・路面は霧より一段暗い薄灰の無地 */
      DUO.reset(); DUO.start('S1', 11); DUO.pump(1 / 60);
      t.eq(Zs.id(), 'white', 'S1 は白い空間');
      let wbad = 0, wprops = 0;
      [150, 400, 600].forEach((at) => {
        DUO.skipTo(at);
        for (let i = 0; i < 3; i++) DUO.pump(1 / 60);
        wbad += In.ZoneKit.corridorScan(80).length;
        wprops = Math.max(wprops, Zs.propsAhead());
      });
      t.eq(wbad, 0, 'white: コリドー内に物がない（グリッド線は床・天井の面の上）');
      t.eq(wprops, 0, 'white: 小物は置かない（造形なし）');
      t.eq(Zs.active().propFields.length, 0, 'white: 小物のフィールドを持たない');
      t.eq(W._roadMat.color.getHex(), Zs.get('white').PAL.road, 'white: 路面は無地の薄灰（霧より暗い）');
      t.ok(Zs.get('white').PAL.road < Zs.get('white').PAL.fog, 'white: 路面は霧（背景）より一段暗い');
      SPEC.forEach((sp) => {
        DUO.reset(); DUO.start(sp[1], 11); DUO.pump(1 / 60);
        const bad = {};
        let props = Infinity;
        [260, 470, 690].forEach((at) => {
          DUO.skipTo(at);
          for (let i = 0; i < 3; i++) DUO.pump(1 / 60);
          In.ZoneKit.corridorScan(80).forEach((r) => { bad[r.name] = (bad[r.name] || 0) + r.n; });
          props = Math.min(props, Zs.propsAhead());
        });
        const names = Object.keys(bad);
        t.eq(names.length, 0, sp[0] + ': コリドー内（|x|<2.0・0<y<4）に小物がない' +
             (names.length ? ': ' + names.map((k) => k + '×' + bad[k]).join(', ') : ''));
        t.ok(props >= 40, sp[0] + ': コリドーの外の小物は前方60mに ' + props + ' 個（≥ 40）');
        /* 路面は無地の暗色（光沢なし・sRGB 明度 ≤ ROAD_L） */
        const m = W._roadMat, hsl = {};
        m.color.getHSL(hsl, THREE.SRGBColorSpace);
        t.ok(m.isMeshBasicMaterial && hsl.l <= W.ROAD_L + 0.005, sp[0] + ': 路面は無地の暗色（明度 ' + hsl.l.toFixed(3) + '）');
      });
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P7a-3: 失効ギミックの削除・ワイド梁の通常出現（ピラー:ワイド梁 ≈ 6:4 ±10%・30シード）',
    quick: false,
    run(t) {
      const In = I(), CFG = In.CFG;
      const GONE = ['GAP', 'DROPCEIL', 'CURRENT', 'CURGATE', 'LIFTPAD', 'DOOR', 'DOORX'];
      GONE.forEach((ty) => t.eq(In.OBS[ty], undefined, ty + ' の判定は無い（契約 v2 で失効）'));
      const ents = [];
      In.CHUNK_DEFS.forEach((c) => (c.floor || []).concat(c.ceil || []).forEach((e) => ents.push(c.id + ':' + e.type)));
      Object.keys(In.Setpieces.DEFS).forEach((k) => {
        const d = In.Setpieces.DEFS[k];
        (d.floor || []).concat(d.ceil || []).forEach((e) => ents.push(k + ':' + e.type));
      });
      In.STAGE_DEFS.S1.intro.forEach((it) => (it.floor || []).concat(it.ceil || []).forEach((e) => ents.push('intro:' + e.type)));
      const bad = ents.filter((x) => GONE.indexOf(x.split(':')[1]) >= 0);
      t.eq(bad.length, 0, '譜面・大演出・導入区間に失効ギミックが無い' + (bad.length ? ': ' + bad.slice(0, 4).join(', ') : ''));
      const flags = In.CHUNK_DEFS.filter((c) => c.drop || c.cur || c.lift || c.door).map((c) => c.id);
      t.eq(flags.length, 0, 'チャンクの旗（drop/cur/lift/door）も無い');
      Object.keys(In.STAGE_DEFS).forEach((sid) => {
        const d = In.STAGE_DEFS[sid];
        const tk = Object.keys(d.tipOnce || {}).concat(d.coverFlags || []);
        t.ok(!tk.some((k) => ['drop', 'cur', 'lift', 'door'].indexOf(k) >= 0), sid + ': tip・網羅の旗に失効ギミックが無い');
      });
      t.eq(typeof Current, 'undefined', '海流の規則（Current）は無い');

      t.eq(CFG.WIDE_SHARE, 0.40, 'ピラー:ワイド梁 ＝ 6:4');
      const rows = [];
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'endless'].forEach((sid) => {
        const st = In.makeStage(sid);
        const L = isFinite(st.lengthM) ? st.lengthM : 6000;
        let P = 0, W = 0, bad = 0, pairs = 0;
        for (let seed = 1; seed <= 30; seed++) {
          const g = In.createGenerator(st, seed);
          for (let d = 0; d < L; d += 40) g.ensure(d + CFG.SPAWN_AHEAD, d);
          const l = g.obstacles.filter((o) => o.at <= L);
          const seen = {};
          l.forEach((o) => {
            if (o.type === 'PILLAR') P++;
            else if (o.type === 'WIDEBAR') {
              const k = o.at.toFixed(2) + '|' + o.lane;
              if (seen[k]) pairs++; else { seen[k] = 1; W++; }
            }
          });
          if (In.Fair.validate(l, st.speedAt, { startLanes: [0], reactBoth: g.reactBoth, zeros: g.zeros, warps: g.warps,
                                                mirrors: g.mirrors, swaps: g.swaps, merges: g.merges }).length) bad++;
        }
        const share = W / Math.max(1, P + W);
        rows.push(sid + ' ' + P + ':' + W + '=' + share.toFixed(2) + '（対 ' + pairs + '）');
        /* S1 はチュートリアルの固定譜面（1種ずつ紹介）＝ランダム区間を持たないので比の対象外 */
        if (st.tutorial) t.ok(P > 0 && W > 0, sid + ': チュートリアルに柱とワイド梁の両方がある（' + P + ':' + W + '）');
        else t.ok(Math.abs(share - CFG.WIDE_SHARE) <= 0.10, sid + ': ワイド梁の割合 ' + share.toFixed(3) + '（ピラー ' + P + '・ワイド梁 ' + W + '・目安 0.40 ±0.10）');
        t.eq(bad, 0, sid + ': 30シードで §4.7 違反なし');
      });
      t.info(rows.join(' / '));
    }
  });

  DUO.__suites.push({
    name: 'P7a-4: 自由飛行の緩和（半径0.30・隙間+30%・発射後2秒なし・間隔1.5秒以上・3〜4個 × 4種の大演出 × 50シード）',
    quick: true,
    run(t) {
      const In = I(), FF = In.FF, Sp = In.Setpieces;
      t.eq(FF.R, 0.30, '判定半径 0.45 → 0.30');
      t.near(FF.HOLE, 0.85 * 1.3, 1e-9, '穴の半径 +30%（0.85 → ' + FF.HOLE + '）');
      t.near(FF.SLOT, 0.95 * 1.3, 1e-9, '帯の半幅 +30%（0.95 → ' + FF.SLOT + '）');
      t.eq(FF.FIRST_T, 2.0, '発射後 2.0秒は障害物なし');
      t.eq(FF.GAP_MIN_T, 1.5, '障害物の間隔 ≥ 1.5秒');
      const cases = [
        ['S2 大ジャンプ', 'S2', Sp.BJ, null, 'bigjump'],
        ['S5 区画爆発', 'S5', Sp.BL, null, 'blastout'],
        ['S7 全崩壊', 'S7', Sp.CA, null, 'collapseall'],
        ['エンドレスのミニ版', 'endless', Sp.BJM, 3000, null]
      ];
      cases.forEach((c) => {
        const st = In.makeStage(c[1]);
        /* P7c: 大演出の位置は makeStage が決める（stage.setpieces） */
        const sp1 = c[4] ? st.setpieces.filter((x) => x.id === c[4])[0] : null;
        const startM = (c[3] !== null) ? c[3] : sp1.start;
        const k = (c[3] !== null) ? Math.max(1, st.speedAt(startM) / 24) : 1;
        const launch = startM + c[2].LIP * k, land = startM + c[2].LAND * k;
        const flightT = (land - launch) / st.speedAt(land);
        t.ok(flightT >= FF.minFlightT(), c[0] + ': 滑空 ' + flightT.toFixed(2) + '秒 ≥ ' + FF.minFlightT().toFixed(1) + '秒（3個置ける長さ）');
        let bad = 0, nMin = 99, nMax = 0, firstT = 99, gapT = 99, first = '';
        for (let seed = 1; seed <= 50; seed++) {
          const course = FF.build(seed, launch, land, st.speedAt);
          const e = In.Fair.validateAir(course, st.speedAt, { margin: true });
          if (e.length) { bad++; if (!first) first = 'seed' + seed + ': ' + e[0]; }
          nMin = Math.min(nMin, course.items.length); nMax = Math.max(nMax, course.items.length);
          course.items.forEach((it, i) => {
            const sp = st.speedAt(it.at);
            if (i === 0) firstT = Math.min(firstT, (it.at - launch) / sp);
            else gapT = Math.min(gapT, (it.at - course.items[i - 1].at) / sp);
          });
        }
        t.eq(bad, 0, c[0] + ': 50シードで空中の不変条件（Fair.validateAir・0.25秒遅れの余裕込み）' + (first ? ' / ' + first : ''));
        t.ok(nMin >= FF.N_MIN && nMax <= FF.N_MAX, c[0] + ': 1回の飛行で ' + nMin + '〜' + nMax + '個（3〜4個）');
        t.ok(firstT >= FF.FIRST_T - 1e-6, c[0] + ': 発射から最初の障害物まで ' + firstT.toFixed(2) + '秒（≥ 2.0秒）');
        t.ok(gapT >= FF.GAP_MIN_T - 1e-6, c[0] + ': 障害物の間隔 最短 ' + gapT.toFixed(2) + '秒（≥ 1.5秒）');
      });

      /* 高さの手がかり（S2 の大ジャンプを実ステップで跨ぐ） */
      DUO.reset(); DUO.start('S2', 5); DUO.bot('perfect');
      const st2 = In.Game.stage;
      const sp0 = st2.lengthM - Sp.DEFS.bigjump.lengthM;
      DUO.skipTo(sp0 - 30);
      let g = 0, seenOn = false, shadowOk = false, ringOk = false, guideOk = false, offBefore = null;
      while (g++ < 4000 && In.Game.status === 'playing' && In.Game.dist < sp0 + Sp.BJ.LAND + 20) {
        DUO.pump(1 / 60);
        const cue = FF.view && FF.view.cue;
        if (!cue) continue;
        if (!FF.on && offBefore === null && In.Game.dist < sp0 + Sp.BJ.LIP - 2) offBefore = cue.root.visible;
        if (FF.on && In.Game.dist > sp0 + Sp.BJ.LIP + 6) {
          seenOn = seenOn || cue.root.visible;
          const b = FF.body;
          const by = cue.ring.position.y;               // 体の高さ（持ち上がり込み）
          shadowOk = shadowOk || (Math.abs(cue.shadows[0].position.x - b.x) < 1e-6 && cue.shadows[0].position.y < by &&
                                  cue.shadows[1].position.y > by);
          ringOk = ringOk || (Math.abs(cue.ring.position.x - b.x) < 1e-6 && cue.ring.visible);
          guideOk = guideOk || (cue.guide.visible && cue.guide.geometry.attributes.position.getZ(1) < -1);
        }
      }
      t.eq(offBefore, false, '手がかりは発射前には出ていない');
      t.ok(seenOn, '自由飛行の間は手がかりが出る');
      t.ok(shadowOk, 'DUO体の影が床（体の下）と天井（体の上）に落ちる');
      t.ok(ringOk, '体の周りに照準リング');
      t.ok(guideOk, '次の隙間への誘導線（前方へ伸びる）');
      t.eq(In.Game.status === 'playing' || In.Game.status === 'goal', true, 'ボットは大ジャンプを抜ける');
      DUO.reset();
    }
  });

  /* P7a 最終確認: 全8ステージ＋エンドレス × perfect / delay250 × seed 1〜30 */
  DUO.__suites.push({
    name: 'P7a→P7c: ボット完走（新7ステージ S1〜S7 × perfect/delay250 × seed 1〜30、エンドレス perfect 5000m / delay250 2500m）',
    quick: false,
    run(t) {
      const In = I(), G = In.Game, U = In.U;
      const run = (sid, mode, maxM) => {
        const fails = [];
        for (let seed = 1; seed <= 30; seed++) {
          DUO.reset(); DUO.start(sid, seed); DUO.bot(mode);
          let g = 0;
          const lim = maxM || Infinity;
          while (G.status === 'playing' && G.dist < lim && g++ < 400000) DUO.__step(1 / 60);
          const ok = maxM ? (G.status === 'playing' && G.dist >= lim)
                          : (G.status === 'goal' || G.status === 'result' || G.status === 'allclear');
          if (!ok) fails.push(seed + '@' + G.dist.toFixed(0));
        }
        return fails;
      };
      ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'].forEach((sid) => {
        ['perfect', 'delay250'].forEach((mode) => {
          const f = run(sid, mode);
          t.eq(f.length, 0, sid + ' ' + mode + ' が 30/30 完走' + (f.length ? '（落ちた種: ' + f.slice(0, 5).join(',') + '）' : ''));
        });
      });
      const snap = U.lsSnapshot();
      U.lsSet('cleared', ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
      const fp = run('endless', 'perfect', 5000), fd = run('endless', 'delay250', 2500);
      U.lsRestore(snap);
      t.eq(fp.length, 0, 'エンドレス（全ゾーン）perfect が 5000m を 30/30' + (fp.length ? '（' + fp.join(',') + '）' : ''));
      t.eq(fd.length, 0, 'エンドレス（全ゾーン）delay250 が 2500m を 30/30' + (fd.length ? '（' + fd.join(',') + '）' : ''));
      DUO.reset();
    }
  });
})();
