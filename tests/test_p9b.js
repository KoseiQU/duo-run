/* ============================================================================
   P9b: BGM をエレクトロ・ポップに作り直し（ゾーン別変奏 7曲＋エンドレスのクロスフェード）・SE の質感合わせ
   ・監査環境では鳴らせない前提。OfflineAudioContext で本番と同じエンジン／スケジューラを模擬時刻で回して数値で確かめる。
   ============================================================================ */
(function () {
  const I = () => DUO.__internal;
  const A = () => I().Audio;
  const M = () => I().Audio.Mus;
  const db = (g) => 20 * Math.log10(Math.max(1e-9, g));

  /* 窓 w 秒の RMS（dB）を hop ごとに並べる */
  function windows(buf, w, hop, from, to) {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, sr = buf.sampleRate;
    const W = Math.floor(w * sr), H = Math.floor(hop * sr), out = [];
    const a0 = Math.floor((from || 0) * sr), a1 = Math.min(L.length, to ? Math.floor(to * sr) : L.length);
    for (let s = a0; s + W <= a1; s += H) {
      let q = 0;
      for (let i = s; i < s + W; i++) q += L[i] * L[i] + R[i] * R[i];
      out.push({ t: s / sr, db: db(Math.sqrt(q / (2 * W))) });
    }
    return out;
  }
  const ZONE_IDS = ['white', 'neon', 'ruins', 'sea', 'space', 'mirror', 'core'];

  DUO.__suites.push({
    name: 'P9b-1/2: ゾーン別 BGM 7曲の数値（10秒描画: RMS ±2dB・ピーク<0.98・帯域比・ループ長・ノード数）',
    quick: false,
    run(t) {
      const Z = A().ZONES, Mu = M();
      t.eq(Object.keys(Z).sort().join(','), ZONE_IDS.slice().sort().join(','), '7ゾーンすべてに曲がある');
      const zl = I().Zones.list();
      t.eq(zl.filter((z) => !Z[z]).length, 0, 'ゲームのゾーン（' + zl.join(',') + '）すべてに対応する曲');
      /* ④ ループ長: 小節の整数倍・16小節以上・旋律/進行の小節数が一致 */
      ZONE_IDS.forEach((id) => {
        const z = Z[id];
        t.ok(Number.isInteger(z.bars) && z.bars >= 16, id + ': ' + z.bars + '小節（16以上の整数）');
        t.ok(z.MM.length === z.bars && z.prog.length === z.bars, id + ': 旋律・コード進行が ' + z.bars + ' 小節ぶん');
        t.near(z.loopSec * z.bpm / 240, z.bars, 1e-9, id + ': ループ ' + z.loopSec.toFixed(2) + '秒 = 小節の整数倍');
      });
      /* 実際のシーケンサも bars で折り返す（17小節目が1小節目に戻る） */
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oc = new OAC(2, 44100, 44100);
      const E = new Mu.Engine(oc, oc.destination, { offline: true });
      const S = E.switchTo('ruins', 0, false, { seed: 1 });
      const seen = [];
      for (let k = 0; k < 17; k++) { S.schedBar(); seen.push(S.curI); }
      t.eq(seen.join(','), Array.from({ length: 16 }, (_, k) => k).concat([0]).join(','), '17小節目で頭へ戻る（' + seen.slice(-3).join(',') + '）');
      /* ペンタトニックの SE 音程がその曲の和音の音の集合に含まれる（不協和にならない） */
      ZONE_IDS.forEach((id) => {
        const z = Z[id], pcs = {};
        Object.keys(z.CH).forEach((k) => { z.CH[k].n.concat([z.CH[k].b]).forEach((m) => { pcs[((m % 12) + 12) % 12] = 1; }); });
        const P = A().pentFor(id), bad = [];
        for (let i = 0; i < 5; i++) if (!pcs[P(i) % 12]) bad.push(P(i));
        t.eq(bad.length, 0, id + ': SE のペンタトニックが曲の音に含まれる（外れ: ' + (bad.join(',') || 'なし') + '）');
      });
      /* ①〜③ 10秒描画 */
      const rows = {};
      let chain = Promise.resolve();
      ZONE_IDS.forEach((id) => {
        chain = chain.then(() => Mu.render(id, 10, { count: true })).then((r) => {
          const a = Mu.analyse(r.buf);
          a.npb = r.nodes / Math.max(1, r.bars); a.drop = r.engine.dropped || 0;
          rows[id] = a;
        });
      });
      return chain.then(() => {
        const mean = ZONE_IDS.reduce((s, id) => s + rows[id].rms, 0) / ZONE_IDS.length;
        const ref = rows.neon;
        ZONE_IDS.forEach((id) => {
          const a = rows[id];
          t.ok(Math.abs(a.rms - mean) <= 2, id + ': RMS ' + a.rms.toFixed(1) + 'dB（平均 ' + mean.toFixed(1) + ' ±2dB）');
          t.ok(a.peak < 0.98, id + ': ピーク ' + a.peak.toFixed(3) + ' < 0.98');
          t.ok(Math.abs(a.bands[0] - ref.bands[0]) <= 15 && Math.abs(a.bands[1] - ref.bands[1]) <= 15 &&
               a.bands[2] >= ref.bands[2] * 0.15 && a.bands[2] <= ref.bands[2] * 4,
               id + ': 帯域比 低/中/高 ' + a.bands.map((b) => b.toFixed(1)).join('/') + '%（基準 S2 ' +
               ref.bands.map((b) => b.toFixed(1)).join('/') + '・低中 ±15pt・高 0.15〜4倍）');
          t.ok(a.npb <= 320, id + ': 1小節あたりのノード生成 ' + Math.round(a.npb) + '（≤320）');
          t.eq(a.drop, 0, id + ': 通常時は発音上限で間引かれない');
        });
        t.info(ZONE_IDS.map((id) => id + ' rms=' + rows[id].rms.toFixed(1) + ' pk=' + rows[id].peak.toFixed(2) + ' bands=' +
          rows[id].bands.map((b) => b.toFixed(1)).join('/') + ' nodes/bar=' + Math.round(rows[id].npb)).join(' | '));
      });
    }
  });

  DUO.__suites.push({
    name: 'P9b-2: クロスフェード（2小節）・盛り上げレイヤー・キック抜き・被弾のこもり・テンポは小節頭・発音上限',
    quick: false,
    run(t) {
      const Au = A(), Mu = M();
      t.near(Au.tempoFor(16), 1, 1e-9, '16 m/s でテンポ等倍');
      t.near(Au.tempoFor(30), 1.075, 1e-9, '30 m/s で +7.5%');
      t.near(Au.tempoFor(44), 1.15, 1e-9, '44 m/s で +15%');
      /* テンポの変更は小節頭で反映 */
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oc = new OAC(2, 44100, 44100);
      const E = new Mu.Engine(oc, oc.destination, { offline: true });
      const S = E.switchTo('neon', 0, false, { seed: 1 });
      S.schedBar();
      const bd0 = S.barDur, q0 = S.q.length;
      E.mul = 1.15;
      t.eq(S.barDur, bd0, '小節の途中ではテンポを変えない');
      S.schedBar();
      t.near(S.barDur, bd0 / 1.15, 1e-9, '次の小節頭で +15% のテンポ');
      t.ok(q0 > 40, '1小節の予定表 ' + q0 + ' 音（発音ノードはまだ作らない）');
      const neonBar = 240 / Au.ZONES.neon.bpm;
      return Promise.all([
        Mu.render('ruins', 12, { from: { zone: 'neon', at: 3 } }),
        Mu.render('neon', 8, {}),
        Mu.render('neon', 8, { hype: true }),
        Mu.render('neon', 8, { nokick: true }),
        Mu.render('neon', 4, { muffleAt: 2.0 }),
        Mu.render('neon', 6, { maxv: 6 })
      ]).then((rs) => {
        /* クロスフェード: 次の小節頭から2小節。途切れも山もない */
        const x = rs[0], XE = x.engine;
        const k = (XE.xfadeAt - 0.08) / neonBar;
        t.near(k, Math.round(k), 0.002, 'クロスフェードは今の曲の小節頭から（' + k.toFixed(3) + ' 小節目）');
        t.near(XE.xfadeLen, 2 * 240 / Au.ZONES.ruins.bpm, 1e-6, '長さは2小節（' + XE.xfadeLen.toFixed(2) + '秒）');
        const ws = windows(x.buf, 0.5, 0.25, 1.0, 11.5), avg = ws.reduce((s, w) => s + w.db, 0) / ws.length;
        const lo = Math.min.apply(null, ws.map((w) => w.db)), hi = Math.max.apply(null, ws.map((w) => w.db));
        t.ok(lo > avg - 9, '切替の前後で途切れない（最小 ' + lo.toFixed(1) + ' / 平均 ' + avg.toFixed(1) + 'dB）');
        t.ok(hi < avg + 4, '重なりで音量の山ができない（最大 ' + hi.toFixed(1) + 'dB）');
        /* 盛り上げレイヤー: 同じ曲のまま高域が増え、音量は +3dB 以内 */
        const base = Mu.analyse(rs[1].buf), hy = Mu.analyse(rs[2].buf), nk = Mu.analyse(rs[3].buf);
        t.ok(hy.bands[2] > base.bands[2] * 1.15, '盛り上げ中は高域が増える（' + base.bands[2].toFixed(1) + '→' + hy.bands[2].toFixed(1) + '%）');
        /* 音量はほぼ据え置き（まとめ役のコンプが吸う）＝飛び出さずに密度と明るさだけ増える */
        t.ok(hy.rms - base.rms > -0.5 && hy.rms - base.rms < 3, '盛り上げで音量 ' + (hy.rms - base.rms).toFixed(1) + 'dB（-0.5〜+3）');
        t.ok(hy.peak < 0.98, '盛り上げ中もピーク ' + hy.peak.toFixed(3) + ' < 0.98');
        t.ok(nk.bands[0] < base.bands[0] - 3, '自由飛行（キック抜き）で低域が減る（' + base.bands[0].toFixed(1) + '→' + nk.bands[0].toFixed(1) + '%）');
        /* 被弾: ローパスで一瞬こもる（高域が落ちて戻る） */
        const mu = rs[4].buf;
        const hb = (a, b) => Mu.analyse(mu, a, b).bands[2];
        const before = hb(1.4, 1.95), during = hb(2.02, 2.3), after = hb(3.2, 3.9);
        t.ok(during < before * 0.3, '被弾の直後は高域が落ちる（' + before.toFixed(2) + '→' + during.toFixed(2) + '%）');
        t.ok(after > before * 0.5, 'すぐ戻る（' + after.toFixed(2) + '%）');
        /* 発音上限: 上限を 6 にすると装飾パートから間引き、必須パートは鳴る */
        const lim = rs[5];
        t.ok((lim.engine.dropped || 0) > 0, '上限を超えたら装飾パートを間引く（' + lim.engine.dropped + '音）');
        t.ok(Mu.analyse(lim.buf).rms > -40, '間引いても曲は鳴り続ける');
        t.info('xfade@' + XE.xfadeAt.toFixed(2) + 's len=' + XE.xfadeLen.toFixed(2) + ' hype ' + base.rms.toFixed(1) + '→' + hy.rms.toFixed(1) +
               'dB nokick low ' + base.bands[0].toFixed(1) + '→' + nk.bands[0].toFixed(1));
      });
    }
  });

  DUO.__suites.push({
    name: 'P9b-3: SE の音量バランス（BGM より +3〜6dB）と音程（BGM のキーのペンタトニック）',
    quick: false,
    run(t) {
      const Au = A(), Mu = M();
      const names = Au.SE_NAMES();
      const BIG = ['hit', 'goal', 'rumble', 'boom'];
      const gB = db(Au.DEFAULTS.bgm * Au.BGM_K), gS = db(Au.DEFAULTS.se * Au.SE_K);
      /* SE はゾーンのキーに合わせて音程が変わる（同じ jump でも D と E で違う高さ） */
      const Pn = Au.pentFor('neon'), Pr = Au.pentFor('ruins');
      t.ok(Pn(0) % 12 === 2 && Pr(0) % 12 === 7, 'ペンタトニックの主音はゾーンの相対メジャー（neon=D, ruins=G）');
      const jobs = [Mu.render('neon', 10, {}).then((r) => ({ k: '__bgm', buf: r.buf }))];
      names.forEach((n) => {
        const sr = 44100, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const c = new OAC(2, sr * ((n === 'rumble' || n === 'boom') ? 2.8 : 1.6), sr);
        const bus = c.createGain();
        Mu.seChain(c, bus, c.destination);
        Au.SE[n](c, Au.seOut(c, bus, n), 0.01, { who: 'lumen', P: Au.pentFor('neon') });
        jobs.push(c.startRendering().then((buf) => ({ k: n, buf: buf })));
      });
      return Promise.all(jobs).then((res) => {
        const bgm = Mu.analyse(res[0].buf).rms + gB;
        const rows = res.slice(1).map((x) => {
          const w = windows(x.buf, 0.05, 0.0125);
          const top = Math.max.apply(null, w.map((q) => q.db));
          let pk = 0; const d = x.buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
          return { k: x.k, rel: top + gS - bgm, pk: pk };
        });
        rows.forEach((r) => {
          const big = BIG.indexOf(r.k) >= 0, lo = big ? 5.5 : 2.5, hi = big ? 9.5 : 6.5;
          t.ok(r.rel >= lo && r.rel <= hi, r.k + ': BGM より ' + (r.rel >= 0 ? '+' : '') + r.rel.toFixed(1) + 'dB（' + lo + '〜' + hi + '）');
          t.ok(r.pk < 1.0, r.k + ': 単体でクリップしない（' + r.pk.toFixed(2) + '）');
        });
        const norm = rows.filter((r) => BIG.indexOf(r.k) < 0).map((r) => r.rel).sort((a, b) => a - b);
        const med = norm[norm.length >> 1];
        t.ok(med >= 3 && med <= 6, 'ふだんの SE の中央値 +' + med.toFixed(1) + 'dB（+3〜6dB）');
        t.info('BGM ' + bgm.toFixed(1) + 'dBFS（既定の音量）/ ' + rows.map((r) => r.k + '=' + r.rel.toFixed(1)).join(' '));
      });
    }
  });
})();
