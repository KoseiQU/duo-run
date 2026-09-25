/* ============================================================================
   tests/test_p7c.js — P7c ステージ再編（契約 §4.4【全面改訂 v2】: 8→7ステージ・S1＝白空間チュートリアル）
     ・7ステージの表（ID・名前・長さ・速度・ゾーン・大演出の配置・チェックポイント）
     ・旧ID → 新ID の保存の移行（duorun.cleared / best.* を1回だけ・duorun.migrated=v2）と表示
     ・エンドレスの解放規則（S1 は含めない）・白い空間の表示（HUD の文字・障害物の露出）
   ============================================================================ */
'use strict';

(function () {
  const I = () => DUO.__internal;

  DUO.__suites.push({
    name: 'P7c: 7ステージの表（契約§4.4 v2: 長さ・速度・ゾーン・大演出の配置・チェックポイント）',
    quick: true,
    run(t) {
      const In = I();
      const WANT = [
        ['S1', 'white', 600, 14, 16, ''],
        ['S2', 'neon', 1800, 16, 24, 'collapse,bigjump'],
        ['S3', 'ruins', 2000, 22, 28, 'rockchase,templefall'],
        ['S4', 'sea', 1600, 26, 30, 'megafish'],
        ['S5', 'space', 1600, 28, 34, 'blastout'],
        ['S6', 'mirror', 1600, 30, 38, 'shatter'],
        ['S7', 'core', 1800, 32, 44, 'collapseall']
      ];
      t.eq(In.UI.STAGES.map((s) => s.id).join(','), WANT.map((w) => w[0]).join(','), 'ステージ選択は S1〜S7 の7枚');
      t.eq(In.STAGE_DEFS.S8, undefined, '旧 S8 は無い（旧8ステージ構成は失効）');
      WANT.forEach((w) => {
        const st = In.makeStage(w[0]);
        t.eq(st.zone, w[1], w[0] + ': ゾーン ' + w[1]);
        t.eq(st.lengthM, w[2], w[0] + ': ' + w[2] + 'm');
        t.near(st.speedAt(0), w[3], 1e-9, w[0] + ': 開始 ' + w[3] + ' m/s');
        t.near(st.speedAt(st.lengthM), w[4], 1e-9, w[0] + ': 終了 ' + w[4] + ' m/s');
        t.eq(st.setpieces.map((x) => x.id).join(','), w[5], w[0] + ': 大演出 ' + (w[5] || 'なし'));
        /* 終盤の演出はゴールで終わる／中盤の演出（2本のステージ）はステージの中ほど */
        st.setpieces.forEach((sp, i) => {
          if (i === st.setpieces.length - 1) t.near(sp.start + sp.lengthM, st.lengthM, 1e-9, w[0] + ': 終盤の演出はゴールで終わる');
          else t.ok(sp.start > st.lengthM * 0.35 && sp.start + sp.lengthM < st.lengthM * 0.65, w[0] + ': 中盤の演出は中ほど（' + sp.start + 'm〜）');
        });
        /* チェックポイントは演出の中に無い（演出の途中からは再開させない） */
        const inSp = st.checkpoints.filter((c) => st.setpieces.some((sp) => c > sp.start - 1 && c < sp.start + sp.lengthM + In.Setpieces.MID_END_M));
        t.eq(inSp.length, 0, w[0] + ': チェックポイント（' + st.checkpoints.map((c) => Math.round(c)).join('/') + '）は演出の外');
        const mid = st.setpieces.filter((x) => x.mid)[0];
        if (mid) {
          const after = st.checkpoints.filter((c) => c > mid.start + mid.lengthM && c < mid.start + mid.lengthM + 60);
          t.eq(after.length, 1, w[0] + ': 中盤の演出の直後にチェックポイント（' + Math.round(after[0] || 0) + 'm）');
        }
      });
      /* 全クリアは最後のステージ（S7 コア）。HUD のステージ名 */
      t.eq(In.UI.STAGES[In.UI.STAGES.length - 1].id, 'S7', '最後は S7（全クリアの判定）');
      DUO.reset(); DUO.start('S3', 1); DUO.pump(1 / 60);
      t.eq(document.getElementById('hud-stage').textContent, 'S3 古代遺跡', 'HUD のステージ名は新しい名前');
      DUO.reset();
    }
  });

  DUO.__suites.push({
    name: 'P7c: 旧ID → 新ID の保存の移行（旧データを植えて1回だけ移す・表示まで）',
    quick: true,
    run(t) {
      const In = I(), U = In.U, G = In.Game, UI = In.UI, CFG = In.CFG;
      const snap = U.lsSnapshot();
      const rm = (k) => { try { window.localStorage.removeItem(CFG.LS_PREFIX + k); } catch (e) { /* noop */ } };
      try {
        /* --- 旧8ステージの保存（実データの形そのもの） --- */
        ['cleared', 'migrated', 'allclear'].forEach(rm);
        for (let i = 1; i <= 8; i++) rm('best.S' + i);
        U.lsSet('cleared', ['S1', 'S2', 'S3', 'S5', 'S8']);
        U.lsSet('best.S1', 850); U.lsSet('best.S2', 1100);        // → 新S2（大きい方）
        U.lsSet('best.S3', 900); U.lsSet('best.S4', 1150);        // → 新S3（大きい方）
        U.lsSet('best.S5', 1400);                                  // → 新S4
        U.lsSet('best.S7', 620);                                   // → 新S6（未クリアの記録）
        U.lsSet('best.S8', 1790);                                  // → 新S7
        U.lsSet('best.endless', 4321);
        U.lsSet('allclear', true);
        t.eq(G.migrateSave(), true, '移行が走る');
        t.eq(JSON.stringify(U.lsGet('cleared', null)), JSON.stringify(['S2', 'S3', 'S4', 'S7']),
             'cleared: 旧S1|S2→S2・旧S3→S3・旧S5→S4・旧S8→S7（' + JSON.stringify(U.lsGet('cleared', null)) + '）');
        t.eq(U.lsGet('best.S1', null), null, '旧 best.S1 は新 S1（チュートリアル）の記録に化けない');
        t.eq(U.lsGet('best.S2', 0), 1100, 'best.S2 ＝ max(旧S1, 旧S2)');
        t.eq(U.lsGet('best.S3', 0), 1150, 'best.S3 ＝ max(旧S3, 旧S4)');
        t.eq(U.lsGet('best.S4', 0), 1400, 'best.S4 ＝ 旧S5');
        t.eq(U.lsGet('best.S5', null), null, 'best.S5（旧S6 の記録なし）は無い');
        t.eq(U.lsGet('best.S6', 0), 620, 'best.S6 ＝ 旧S7');
        t.eq(U.lsGet('best.S7', 0), 1790, 'best.S7 ＝ 旧S8');
        t.eq(U.lsGet('best.S8', null), null, '旧 best.S8 は消える');
        t.eq(U.lsGet('best.endless', 0), 4321, 'エンドレスの最長はそのまま');
        t.eq(U.lsGet('allclear', false), true, '全クリアの印はそのまま');
        t.eq(U.lsGet('migrated', null), 'v2', 'duorun.migrated = v2');
        /* --- 1回だけ: もう一度呼んでも何も変えない（新ID の記録を旧ID と取り違えない） --- */
        const before = JSON.stringify(U.lsSnapshot());
        t.eq(G.migrateSave(), false, '2回目は走らない');
        t.eq(JSON.stringify(U.lsSnapshot()), before, '2回目は保存を変えない');
        /* --- 表示: ステージ選択（星・ベスト）とタイトル --- */
        UI.show('stages');
        const card = (id) => document.querySelector('[data-ui="stage-' + id + '"]');
        t.ok(card('S2').innerHTML.indexOf('★') >= 0 && card('S2').textContent.indexOf('ベスト 1100 m') >= 0, 'S2 に星とベスト 1100 m');
        t.ok(card('S3').innerHTML.indexOf('★') >= 0 && card('S3').textContent.indexOf('ベスト 1150 m') >= 0, 'S3 に星とベスト 1150 m');
        t.ok(card('S4').textContent.indexOf('ベスト 1400 m') >= 0, 'S4 にベスト 1400 m');
        t.ok(card('S6').innerHTML.indexOf('★') < 0 && card('S6').textContent.indexOf('ベスト 620 m') >= 0, 'S6 は星なし・ベスト 620 m');
        t.ok(card('S7').innerHTML.indexOf('★') >= 0, 'S7 に星');
        t.ok(card('S1').innerHTML.indexOf('★') < 0 && card('S1').textContent.indexOf('未挑戦') >= 0, 'S1（チュートリアル）は未挑戦');
        t.eq(document.getElementById('stages-allclear').style.display, '', '全クリアの印が出る');
        UI.show('title');
        t.ok(document.getElementById('title-best').textContent.indexOf('クリア 4 ステージ') >= 0,
             'タイトルに「クリア 4 ステージ」: ' + document.getElementById('title-best').textContent);
        /* --- 解放（本来の規則）: 新S1 未クリアでも、移行で得た S2 のクリアは S3 を開ける --- */
        t.eq(UI.isUnlocked(2), true, '移行で S2 クリア済み → S3 は解放');
        t.eq(UI.isUnlocked(1), true, '新S1 は未クリアでも、クリア済みの S2 は選べる');
        t.eq(UI.isUnlocked(4), true, '移行で S4 クリア済み → S5 は解放');
        t.eq(UI.isUnlocked(5), false, 'S5 未クリア → S6 はロック（記録はあっても未クリア）');
        /* --- 新規（保存なし）: 印だけ付き、cleared は作らない --- */
        ['cleared', 'migrated', 'allclear', 'best.endless'].forEach(rm);
        for (let i = 1; i <= 8; i++) rm('best.S' + i);
        t.eq(G.migrateSave(), true, '新規でも1回走る');
        t.eq(U.lsGet('cleared', null), null, '新規では cleared を作らない');
        t.eq(U.lsGet('migrated', null), 'v2', '新規も migrated = v2');
      } finally {
        U.lsRestore(snap);
        DUO.reset();
      }
    }
  });

  DUO.__suites.push({
    name: 'P7c: エンドレスの解放（S1 白空間は含めない・ゾーン順 neon→ruins→sea→space→mirror→core）と白空間の表示',
    quick: true,
    run(t) {
      const In = I(), E = In.Endless, Zs = In.Zones, Ob = In.Obstacles;
      t.eq(E.ORDER.join(','), 'neon,ruins,sea,space,mirror,core', 'ゾーン順（白空間は無い）');
      t.eq(E.ALL.join(','), 'S1,S2,S3,S4,S5,S6,S7', '全ステージの一覧は7本');
      t.eq(E.plan(['S1']).zones.join(','), 'neon', 'S1 だけのクリアはネオン（基本セット）のまま');
      t.eq(In.endlessPool(['S1']).pool.length, In.endlessPool([]).pool.length, 'S1 のクリアでは顔ぶれは増えない');
      t.eq(E.plan(E.ALL).zones.join(','), 'neon,ruins,sea,space,mirror,core', '全クリアで6ゾーン');
      Object.keys(E.STAGES).forEach((z) => {
        t.ok(E.STAGES[z].indexOf('S1') < 0, z + ': 持ち込むステージに S1 は無い');
      });
      /* 白い空間: HUD の文字は暗色・障害物の露出は白空間だけ（他ゾーンへ移ると 1 に戻る） */
      DUO.reset(); DUO.start('S1', 2); DUO.pump(1 / 60);
      t.eq(document.body.getAttribute('data-zone'), 'white', 'body[data-zone=white]');
      const col = getComputedStyle(document.querySelector('.hud-top')).color;
      const m = col.match(/\d+/g).map(Number);
      t.ok(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 90, '白い空間では HUD の文字が暗い（' + col + '）');
      t.eq(Ob.tone, Zs.get('white').PAL.obstacleTone, '白い空間の障害物の露出 ' + Ob.tone);
      t.ok(Ob.tone < 1, '（白に溶けないよう一段暗く）');
      /* 旧「白い壁は白い霧より暗く描く」は壁の穴の失効（2026-09-27）で対象が無くなった */
      DUO.reset(); DUO.start('S2', 2); DUO.pump(1 / 60);
      t.eq(Ob.tone, 1, 'ネオンへ移ると露出は 1 に戻る');
      t.eq(document.body.getAttribute('data-zone'), 'neon', 'body[data-zone=neon]');
      t.ok(In.World.drawCalls() <= 300, 'ドローコール ' + In.World.drawCalls() + ' ≤ 300');
      DUO.reset(); DUO.start('S1', 2); DUO.pump(1 / 60);
      t.ok(In.World.drawCalls() <= 300, '白い空間のドローコール ' + In.World.drawCalls() + ' ≤ 300');
      DUO.reset();
    }
  });
})();
