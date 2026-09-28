/* ============================================================================
   DUO RUN — audio.js  音（BGM・効果音）をすべて WebAudio で合成する（契約 §3 / P6 / P9b）
   ・音源ファイルは使わない。オシレーター・ノイズ・フィルタ・エンベロープだけで作る。
   ・BGM の作風は「エレクトロ・ポップ」に統一（2026-09-28 ユーザーが聴き比べサンプル3番を採用）。
     明るいプラックのリード・4つ打ち・オクターブで跳ねるベース・パッド・リバーブ/ディレイのセンド・
     人間味（ベロシティ ±15%・タイミング ±8ms）・マスターのコンプ＋リミッタ。
     ゾーンごとにキー・コード進行・メロディ・音色の味付けを変えた 16小節ループの変奏（7種）。
       白空間=軽い版(C) ／ ネオン=基準曲(D/Bm) ／ 遺跡=Em＋木琴＋タム ／ 深海=F#m・丸い音・泡
       宇宙=A・sus4/add9・グライド ／ 鏡=C#m・ベル・反行メロディを左右に ／ コア=Dm・歪んだベース・転調
     速度 16→44 m/s でテンポ +0〜15%（小節頭で反映）。エンドレスのゾーン切替は2小節のクロスフェード。
     大演出中は同じ曲に「盛り上げレイヤー」（16分のハイハット・ライザー・ベースのオクターブ上）、
     自由飛行中はキックを抜く。被弾で一瞬こもらせる（ローパス）。
   ・負荷対策: 先読み 0.12秒のスケジューラ（小節の中身は「予定表」にしておき、発音ノードは
     鳴らす直前に作る）・同時発音数の上限（超えたら装飾パートから間引く）・リバーブの IR は
     AudioContext ごとに1回だけ生成して BGM/SE の2本の ConvolverNode で共有。
   ・iOS Safari の制約:
       AudioContext は最初のユーザー操作（タイトルの START など）の中で作って resume する。
       visibilitychange → hidden で suspend、visible で resume。
       別タブから戻ると無音になる実例があるので、**毎秒の再試行**と
       **解錠後も外さないユーザー操作フック**（触るたびに running でなければ resume）を持つ。
   ・AudioContext が無い／suspended のままでも、Audio.* はすべて例外なく何もしないで返る。
   ・設定（BGM/SE の音量・ミュート）は localStorage `duorun.audio`。
   ・名前は契約の指示どおり `Audio`（window.Audio＝HTMLAudioElement はこのゲームでは使わない）。
   ============================================================================ */
'use strict';

const Audio = {
  ctx: null,
  master: null, bgmBus: null, seBus: null, comp: null,
  unlocked: false,
  settings: { bgm: 0.7, se: 0.8, mute: false },
  DEFAULTS: { bgm: 0.7, se: 0.8, mute: false },
  LS_KEY: 'audio',
  /* バスの係数（BGM は RMS≈-17.5dBFS に揃えた曲をこの倍率で、SE は BGM より +3〜6dB に聞こえる倍率。test_p9b で実測） */
  BGM_K: 0.5,
  SE_K: 0.9,
  LOOKAHEAD: 0.12,     // 先読み（秒）
  MAXV: 40,            // 同時発音数の上限（装飾パートから間引く）
  /* 監査用の数え（play が呼ばれた回数・実際に鳴らした回数・名前ごと） */
  stats: { calls: 0, voiced: 0, byName: {}, bgmEvents: 0, dropped: 0 },
  last: null,
  /* テスト用: undefined = 本物、null = AudioContext の無い環境、関数 = 偽物のクラス */
  _acOverride: undefined,
  _hiddenOverride: undefined,
  _timers: [],
  _eng: null,

  AC() {
    if (Audio._acOverride !== undefined) return Audio._acOverride;
    return (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext || null) : null;
  },
  hidden() {
    if (Audio._hiddenOverride !== undefined) return !!Audio._hiddenOverride;
    return (typeof document !== 'undefined') && document.visibilityState === 'hidden';
  },
  state() { return Audio.ctx ? Audio.ctx.state : 'none'; },
  running() { return !!(Audio.ctx && Audio.ctx.state === 'running'); },

  /* ---- 起動（boot から1回） ---------------------------------------------- */
  init() {
    Audio.loadSettings();
    if (Audio._inited || typeof window === 'undefined') return;
    Audio._inited = true;
    /* 解錠後も外さないユーザー操作フック（iOS: 別タブから戻ると無音になる実例への保険） */
    ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'].forEach((ev) => {
      window.addEventListener(ev, Audio._gesture, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', Audio.onVisibility);
    window.addEventListener('pagehide', function () { Audio.suspend(); });
    window.addEventListener('pageshow', function () { Audio.tryResume(); });
    /* 毎秒の再試行（visible なのに running でなければ resume） */
    Audio._timers.push(setInterval(Audio.watch, 1000));
    /* BGM のシーケンサ（先読みして予約する。毎フレームの update からも回す） */
    Audio._timers.push(setInterval(Audio.tick, 25));
  },
  _gesture(e) {
    /* 合成イベント（テストの dispatchEvent）では作らない＝自動再生ポリシーの警告を出さない */
    if (e && e.isTrusted === false) return;
    Audio.unlock();
  },

  /* ユーザー操作の中で呼ぶ。1回目は AudioContext を作って無音を鳴らす（iOS の解錠）。
     2回目以降は running でなければ resume するだけ。 */
  unlock() {
    try {
      if (!Audio.ctx) Audio._create();
      const c = Audio.ctx;
      if (!c) return false;
      if (c.state !== 'running' && !Audio.hidden()) Audio.tryResume();
      if (!Audio.unlocked && c.createBuffer && c.createBufferSource) {
        const b = c.createBuffer(1, 1, 22050);
        const s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination);
        if (s.start) s.start(0);
      }
      Audio.unlocked = true;
      return true;
    } catch (e) { return false; }
  },
  _create() {
    const AC = Audio.AC();
    if (!AC) return null;
    let c = null;
    try { c = new AC(); } catch (e) { c = null; }
    if (!c) return null;
    Audio.ctx = c;
    try {
      if (c.createDynamicsCompressor && c.createGain) {
        Audio.comp = c.createDynamicsCompressor();
        Audio.comp.threshold.value = -10; Audio.comp.knee.value = 10;
        Audio.comp.ratio.value = 4; Audio.comp.attack.value = 0.003; Audio.comp.release.value = 0.2;
        Audio.master = c.createGain();
        Audio.bgmBus = c.createGain();
        Audio.seBus = c.createGain();
        Audio.bgmBus.connect(Audio.master);
        Audio.Mus.seChain(c, Audio.seBus, Audio.master);   // SE: 素通し＋軽いリバーブ（IR は BGM と共有）
        Audio.master.connect(Audio.comp);
        Audio.comp.connect(c.destination);
        Audio.applySettings();
      }
    } catch (e) { /* 偽物・古い実装でも落とさない */ }
    return c;
  },
  tryResume() {
    const c = Audio.ctx;
    if (!c || !c.resume || c.state === 'running' || c.state === 'closed') return false;
    try {
      const p = c.resume();
      if (p && p.catch) p.catch(function () {});
      Audio.stats.resumes = (Audio.stats.resumes || 0) + 1;
      return true;
    } catch (e) { return false; }
  },
  suspend() {
    const c = Audio.ctx;
    if (!c || !c.suspend || c.state !== 'running') return false;
    try {
      const p = c.suspend();
      if (p && p.catch) p.catch(function () {});
      Audio.stats.suspends = (Audio.stats.suspends || 0) + 1;
      return true;
    } catch (e) { return false; }
  },
  onVisibility() {
    if (Audio.hidden()) return Audio.suspend();
    return Audio.tryResume();
  },
  watch() {
    if (!Audio.ctx || !Audio.unlocked || Audio.hidden()) return false;
    if (Audio.ctx.state !== 'running') return Audio.tryResume();
    return false;
  },

  /* ---- 設定（localStorage duorun.audio） ---------------------------------- */
  loadSettings() {
    const v = U.lsGet(Audio.LS_KEY, null);
    const d = Audio.DEFAULTS;
    const num = (x, def) => (typeof x === 'number' && isFinite(x)) ? U.clamp(x, 0, 1) : def;
    Audio.settings = {
      bgm: num(v && v.bgm, d.bgm), se: num(v && v.se, d.se), mute: !!(v && v.mute)
    };
    Audio.applySettings();
    return Audio.settings;
  },
  saveSettings() { U.lsSet(Audio.LS_KEY, Audio.settings); return Audio.settings; },
  setVolume(kind, v) {
    if (kind !== 'bgm' && kind !== 'se') return false;
    Audio.settings[kind] = U.clamp(+v || 0, 0, 1);
    Audio.applySettings();
    Audio.saveSettings();
    return Audio.settings[kind];
  },
  setMute(on) {
    Audio.settings.mute = !!on;
    Audio.applySettings();
    Audio.saveSettings();
    return Audio.settings.mute;
  },
  toggleMute() { return Audio.setMute(!Audio.settings.mute); },
  applySettings() {
    const c = Audio.ctx;
    if (!c || !Audio.master) return false;
    try {
      const now = c.currentTime || 0;
      Audio.master.gain.setTargetAtTime(Audio.settings.mute ? 0 : 1, now, 0.03);
      Audio.seBus.gain.setTargetAtTime(Audio.settings.se * Audio.SE_K, now, 0.03);
      Audio.bgmBus.gain.setTargetAtTime(Audio.settings.bgm * Audio.BGM_K * Audio.bgm.level, now, 0.25);
    } catch (e) { return false; }
    return true;
  },

  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  /* ==========================================================================
     効果音（名前 → 合成）。o.who は 'lumen' | 'umbra'（UMBRA は少し低く・柔らかく）
     o.P(i) は今の BGM のキーのメジャー・ペンタトニック i 番目の音（MIDI。i=0 が主音・5 で1オクターブ上）
     ＝ SE の音程は BGM に対して不協和にならない。生のオシレータは使わず、2本のデチューン＋フィルタ＋短い包絡。
     ========================================================================== */
  SE: {
    jump(c, out, t, o) {
      const lo = (o.who === 'umbra') ? -12 : 0, M = Audio.Mus;
      M.sePluck(c, out, t, o.P(2) + 12 + lo, { to: o.P(5) + 12 + lo, gl: 0.07, dur: 0.12, vol: 0.12, cut: 1600, fenv: 3000,
                                               type: (o.who === 'umbra') ? 'triangle' : 'sawtooth' });
      M.seNoise(c, out, t, { dur: 0.12, vol: 0.05, f: 900, f2: 3200, ft: 'bandpass', q: 1.2 });
    },
    lane(c, out, t, o) {
      const M = Audio.Mus;
      M.seNoise(c, out, t, { dur: 0.08, vol: 0.09, f: 1300, f2: 3800, ft: 'bandpass', q: 1.1 });
      M.sePluck(c, out, t, o.P(4) + ((o.who === 'umbra') ? 0 : 12), { dur: 0.05, vol: 0.05, cut: 2400, fenv: 2000, type: 'triangle' });
    },
    land(c, out, t, o) {
      const M = Audio.Mus;
      M.seThump(c, out, t, 150, 58, 0.11, 0.2);
      M.seNoise(c, out, t, { dur: 0.05, vol: 0.05, f: 900 });
    },
    hit(c, out, t, o) {
      const M = Audio.Mus;
      M.seNoise(c, out, t, { dur: 0.5, vol: 0.42, f: 2600, f2: 150 });
      M.sePluck(c, out, t, o.P(0) - 12, { to: o.P(0) - 36, gl: 0.4, dur: 0.45, vol: 0.24, cut: 300, fenv: 1400, fd: 0.3, det: 14 });
      M.seThump(c, out, t, 120, 40, 0.3, 0.25);
    },
    checkpoint(c, out, t, o) {
      const M = Audio.Mus;
      [0, 2, 4].forEach((k, i) => M.sePluck(c, out, t + i * 0.07, o.P(k) + 12, { dur: 0.22, vol: 0.09, cut: 1400, fenv: 4000 }));
      M.seBell(c, out, t + 0.21, o.P(5) + 12, 0.9, 0.07);
    },
    goal(c, out, t, o) {           // ゴールのジングル（BGM と同じプラックの音色・主音のメジャー三和音で終わる）
      const M = Audio.Mus;
      [0, 2, 3, 5].forEach((k, i) => M.sePluck(c, out, t + i * 0.1, o.P(k) + 12, { dur: 0.25, vol: 0.1, cut: 1300, fenv: 4500 }));
      [0, 2, 3].forEach((k, i) => M.sePluck(c, out, t + 0.42 + i * 0.012, o.P(k) + 12,
        { dur: 1.1, vol: 0.07, cut: 1600, fenv: 2500, fd: 0.5, det: 12, a: 0.008 }));
      M.sePluck(c, out, t + 0.42, o.P(0) - 12, { dur: 0.9, vol: 0.1, cut: 400, fenv: 900, type: 'square' });
      M.seBell(c, out, t + 0.42, o.P(5) + 12, 1.4, 0.06);
      M.seNoise(c, out, t + 0.42, { dur: 1.0, vol: 0.05, f: 7000, ft: 'highpass' });
    },
    gate(c, out, t, o) {           // エンドレスの光のゲート
      const M = Audio.Mus;
      M.seNoise(c, out, t, { dur: 0.55, vol: 0.07, f: 2500, f2: 9000, ft: 'highpass', a: 0.2, hold: 0.3 });
      [0, 3, 5, 8].forEach((k, i) => M.sePluck(c, out, t + 0.06 + i * 0.06, o.P(k) + 12, { dur: 0.2, vol: 0.07, cut: 1600, fenv: 4000 }));
      M.seBell(c, out, t + 0.3, o.P(10) , 1.0, 0.05);
    },
    gate_grav(c, out, t, o) {      // 重力反転ワープ
      const M = Audio.Mus;
      M.sePluck(c, out, t, o.P(5) + 12, { to: o.P(0), gl: 0.2, dur: 0.24, vol: 0.1, cut: 900, fenv: 2500, fd: 0.2 });
      M.sePluck(c, out, t + 0.2, o.P(0), { to: o.P(5) + 12, gl: 0.2, dur: 0.26, vol: 0.1, cut: 900, fenv: 2500, fd: 0.2 });
    },
    gate_swap(c, out, t, o) {      // 入れ替えワープ
      const M = Audio.Mus;
      M.sePluck(c, out, t, o.P(4) + 12, { to: o.P(0) + 12, gl: 0.18, dur: 0.22, vol: 0.07, cut: 1400, fenv: 2500, pan: -0.5 });
      M.sePluck(c, out, t, o.P(0) + 12, { to: o.P(4) + 12, gl: 0.18, dur: 0.22, vol: 0.07, cut: 1400, fenv: 2500, pan: 0.5 });
    },
    gate_mirror(c, out, t, o) {    // 鏡ゾーン
      const M = Audio.Mus;
      M.seBell(c, out, t, o.P(7), 0.9, 0.08, -0.5);
      M.seBell(c, out, t + 0.05, o.P(9), 0.9, 0.08, 0.5);
      M.seNoise(c, out, t, { dur: 0.5, vol: 0.03, f: 8000, ft: 'highpass', a: 0.1 });
    },
    gate_merge(c, out, t, o) {     // 合体区間
      const M = Audio.Mus;
      [0, 2, 3].forEach((k) => M.sePluck(c, out, t, o.P(k), { to: o.P(k) + 12, gl: 0.3, dur: 0.45, vol: 0.06, cut: 1000, fenv: 2500, fd: 0.4, a: 0.02 }));
    },
    boost(c, out, t, o) {
      const M = Audio.Mus;
      M.sePluck(c, out, t, o.P(0) - 12, { to: o.P(0) + 12, gl: 0.3, dur: 0.36, vol: 0.1, cut: 700, fenv: 4500, fd: 0.35, det: 12 });
      M.seBell(c, out, t + 0.2, o.P(5) + 12, 0.6, 0.05);
    },
    warn(c, out, t, o) {           // 大演出の予告
      const M = Audio.Mus;
      [0, 0.16, 0.36, 0.52].forEach((d, i) => {
        M.sePluck(c, out, t + d, (i % 2) ? o.P(3) + 12 : o.P(5) + 12, { dur: 0.12, vol: 0.075, cut: 1800, fenv: 2500, type: 'square', det: 5 });
      });
    },
    rumble(c, out, t, o) {         // 崩落の轟音（ノイズ＋ローパス）
      const M = Audio.Mus;
      M.seNoise(c, out, t, { dur: 2.4, vol: 0.5, f: 260, f2: 90, a: 0.25, hold: 0.4 });
      M.seThump(c, out, t, Audio.mtof(o.P(0) - 36), Audio.mtof(o.P(0) - 41), 2.2, 0.26, 0.3);
    },
    boom(c, out, t, o) {           // 爆発（ノイズ＋ローパスの掃引）
      const M = Audio.Mus;
      M.seNoise(c, out, t, { dur: 1.6, vol: 0.62, f: 3200, f2: 110, a: 0.005 });
      M.seThump(c, out, t, 72, 28, 1.3, 0.42);
    },
    rock(c, out, t, o) {           // 転がる丸岩（契約§4.5 新・遺跡 / P7b）: 石が転がる低いごろごろ
      const M = Audio.Mus;
      for (let i = 0; i < 7; i++) {
        M.seNoise(c, out, t + i * 0.13, { dur: 0.16, vol: 0.26 - i * 0.02, f: 320, f2: 140, a: 0.01 });
      }
      M.seThump(c, out, t, 64, 44, 1.0, 0.2, 0.08);
    },
    glass(c, out, t, o) {          // 鏡が砕ける
      const M = Audio.Mus;
      M.seNoise(c, out, t, { dur: 0.8, vol: 0.25, f: 4500, ft: 'highpass' });
      [9, 12, 14].forEach((k, i) => M.seBell(c, out, t + i * 0.05, o.P(k), 0.6, 0.045, (i - 1) * 0.5));
    },
    ui(c, out, t, o) {
      Audio.Mus.sePluck(c, out, t, o.P(0) + 12, { dur: 0.05, vol: 0.05, cut: 2500, fenv: 2000, type: 'triangle' });
    }
  },
  SE_NAMES() { return Object.keys(Audio.SE); },
  /* SE ごとの音量の補正（dB）。test_p9b で「SE の最も大きい 50ms の RMS − BGM の RMS」が
     +3〜6dB（被弾・ゴール・轟音・爆発は +6〜9dB）に入るよう実測で決めた値 */
  SE_TRIM: { jump: 6.6, lane: 13.9, land: 2.8, hit: -2.9, checkpoint: 7.6, goal: -0.4, gate: 6.8, gate_grav: 5.3, gate_swap: 10.3,
             gate_mirror: 7.4, gate_merge: 5.3, boost: 4.8, warn: 4.8, rumble: -1.3, boom: -5.6, rock: -1.2, glass: 0.1, ui: 14.0 },
  seOut(c, bus, name) {
    const d = Audio.SE_TRIM[name] || 0;
    if (!d) return bus;
    const g = c.createGain(); g.gain.value = Math.pow(10, d / 20); g.connect(bus);
    return g;
  },

  /* 今の BGM のキー（メジャー・ペンタトニック）で i 番目の音を返す関数 */
  pentFor(zone) {
    const Z = Audio.ZONES[zone] || Audio.ZONES.neon;
    const base = 72 + Z.rel - (Z.rel >= 6 ? 12 : 0);
    const PT = [0, 2, 4, 7, 9];
    return function (i) { const k = Math.floor(i / 5); return base + PT[((i % 5) + 5) % 5] + 12 * k; };
  },

  /* 効果音を鳴らす。鳴らせない環境（無い・suspended・ミュート）では何もしないで false */
  _lastT: {},
  play(name, o) {
    Audio.stats.calls++;
    Audio.stats.byName[name] = (Audio.stats.byName[name] || 0) + 1;
    Audio.last = name;
    const c = Audio.ctx;
    const fn = Audio.SE[name];
    if (!fn || !c || c.state !== 'running' || !Audio.seBus || Audio.settings.mute || Audio.settings.se <= 0) return false;
    try {
      const t = c.currentTime + 0.005;
      /* 同じ音の連打は 30ms 以内なら1つにまとめる（2体同時のレーン移動など） */
      const key = name + '|' + ((o && o.who) || '');
      if (Audio._lastT[key] !== undefined && t - Audio._lastT[key] < 0.03) return false;
      Audio._lastT[key] = t;
      const oo = Object.assign({}, o || {});
      oo.P = Audio.pentFor(Audio.bgm.zone);
      /* 被弾: BGM を一瞬こもらせる／ゴール: ジングルの間は BGM を下げる */
      const E = Audio._eng;
      if (name === 'hit' && E && E.c === c) E.muffle(c.currentTime);
      if (name === 'goal') Audio.bgm.jingleT = c.currentTime + 2.2;
      fn(c, Audio.seOut(c, Audio.seBus, name), t, oo);
      Audio.stats.voiced++;
      return true;
    } catch (e) { return false; }
  },

  /* ==========================================================================
     BGM（エレクトロ・ポップ・ゾーン別の 16小節ループ）。エンジン本体は下の Audio.Mus
     ========================================================================== */
  BARS: 16,
  ZONES: null,          // Audio.Mus が埋める { white, neon, ruins, sea, space, mirror, core }
  /* 1ステップ（16分音符）の秒数（テンポ倍率つき） */
  stepDur(zone, tempoMul) {
    const Z = Audio.ZONES[zone] || Audio.ZONES.neon;
    return 60 / (Z.bpm * (tempoMul || 1)) / 4;
  },
  /* 速度 16→44 m/s でテンポ +0〜15% */
  tempoFor(speed) {
    return 1 + 0.15 * U.clamp(((speed || CFG.SPEED_MIN) - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
  },

  bgm: { zone: 'neon', tempo: 1, level: 0.55, on: true, xfade: false, hype: false, nokick: false, jingleT: 0, switches: 0 },
  /* 毎フレーム（Game.render から）: 今のゾーン・速度・場面をシーケンサへ渡す */
  update(game) {
    const B = Audio.bgm;
    const z = (typeof Zones !== 'undefined' && Zones.id()) ? Zones.id() : 'neon';
    const st = game ? game.status : 'idle';
    const playing = (st === 'playing');
    if (z !== B.zone) {
      /* エンドレスの走行中（トンネル通過）だけ2小節のクロスフェード。ステージ開始などは頭から */
      B.xfade = !!(playing && game.stage && game.stage.endless && game.dist > 30);
      B.zone = z; B.switches++;
    }
    B.tempo = (playing || st === 'dying') ? Audio.tempoFor(game.speed) : 1;
    B.hype = !!(playing && typeof Setpieces !== 'undefined' && Setpieces.active && Setpieces.active());
    B.nokick = !!(playing && typeof FF !== 'undefined' && FF.on);
    const c = Audio.ctx;
    const jingle = !!(c && B.jingleT && c.currentTime < B.jingleT);
    const lv = jingle ? 0.35
             : (playing || st === 'goal' || st === 'allclear') ? 1
             : (st === 'dying') ? 0.6 : (st === 'idle') ? 0.55 : 0.32;
    if (Math.abs(lv - B.level) > 1e-3) { B.level = lv; Audio.applySettings(); }
    Audio.tick();
    return B;
  },
  /* BGM のエンジン（今の AudioContext と BGM バスに対して1つ） */
  engine() {
    const c = Audio.ctx, d = Audio.bgmBus;
    if (!c || !d || typeof d.connect !== 'function' || typeof c.createGain !== 'function') return null;
    const E0 = Audio._eng;
    if (E0 && E0.c === c && E0.dest === d) return E0;
    const E = new Audio.Mus.Engine(c, d);
    Audio._eng = E;
    return E;
  },
  /* 先読み予約（setInterval 25ms と毎フレーム）。running でなければ何もしない。予約した音符の数を返す */
  tick() {
    const c = Audio.ctx, B = Audio.bgm;
    if (!c || c.state !== 'running' || !Audio.bgmBus || !B.on) return 0;
    if (Audio.settings.mute || Audio.settings.bgm <= 0) return 0;
    try {
      const E = Audio.engine();
      if (!E) return 0;
      const now = c.currentTime;
      E.mul = B.tempo; E.flags.hype = B.hype; E.flags.nokick = B.nokick;
      if (!E.cur || E.cur.id !== B.zone) E.switchTo(B.zone, now, B.xfade && !!E.cur);
      B.xfade = false;
      const n = E.pump(now, Audio.LOOKAHEAD);
      Audio.stats.bgmEvents += n;
      return n;
    } catch (e) { return 0; }
  },
  /* いま鳴っている BGM の出力レベル（RMS）。鳴っていなければ 0 */
  level() {
    const E = Audio._eng;
    if (!E || !E.an || E.c !== Audio.ctx) return 0;
    const d = new Float32Array(E.an.fftSize);
    E.an.getFloatTimeDomainData(d);
    let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    return Math.sqrt(s / d.length);
  },
  /* 試聴（samples/music.html）: ゲームの外から任意のゾーンの曲を鳴らす。zone=null で止める */
  preview(zone, opt) {
    opt = opt || {};
    const B = Audio.bgm;
    if (!zone) {
      const E = Audio._eng;
      if (E && Audio.ctx) E.stop(Audio.ctx.currentTime);
      B.on = false;
      return false;
    }
    Audio.unlock();
    if (!Audio.ctx) return false;
    B.on = true;
    B.xfade = !!opt.xfade && B.zone !== zone;
    B.zone = zone;
    B.tempo = opt.fast ? 1.15 : 1;
    B.hype = !!opt.hype; B.nokick = !!opt.nokick;
    B.level = 1; Audio.applySettings();
    if (!Audio._pv) Audio._pv = setInterval(Audio.tick, 25);
    Audio.tick();
    return true;
  },

  /* オフラインで鳴らして音量を測る（機械テスト用・Promise）。kind='se'|'bgm' */
  renderOffline(kind, name, sec) {
    const OAC = (typeof window !== 'undefined') ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
    if (!OAC) return Promise.resolve(null);
    const M = Audio.Mus;
    const done = (buf) => {
      const d = buf.getChannelData(0);
      let sum = 0, peak = 0;
      for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
      return { rms: Math.sqrt(sum / d.length), peak: peak };
    };
    if (kind === 'se') {
      const rate = 22050, c = new OAC(1, Math.floor(rate * (sec || 1)), rate);
      const bus = c.createGain();
      M.seChain(c, bus, c.destination);
      Audio.SE[name](c, Audio.seOut(c, bus, name), 0.01, { who: 'lumen', P: Audio.pentFor('neon') });
      return c.startRendering().then(done);
    }
    return M.render(name, sec || 1, { rate: 22050, ch: 1 }).then((r) => done(r.buf));
  }
};

/* ============================================================================
   Audio.Mus — 合成エンジン（samples/music.html の 3番「エレクトロ・ポップ」から移植）
   ・ctx と出口を受け取る＝本番もオフライン描画のテストも同じ関数
   ============================================================================ */
Audio.Mus = (function () {
  const TAU = Math.PI * 2;
  function rng(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const dbToG = (d) => Math.pow(10, d / 20);
  const gToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
  const NB = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function nm(s) {
    const r = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!r) throw new Error('bad note: ' + s);
    return 12 * (+r[3] + 1) + NB[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0);
  }
  /* "F2 | F3 A3 C4" → { b: ベース, n: [ボイシング] } */
  function chord(s) {
    const p = s.split('|');
    return { b: nm(p[0].trim()), n: p[1].trim().split(/\s+/).map(nm) };
  }
  /* 1小節 = 16分音符 16個。音名で打鍵、"." は伸ばす、"-" は休符、"|" は区切り */
  function mel(s) {
    const tk = s.trim().split(/\s+/).filter((x) => x !== '|');
    if (tk.length !== 16) throw new Error('1小節は16個: ' + s);
    const out = []; let cur = null;
    tk.forEach((x, i) => {
      if (x === '.') { if (cur) cur.len++; }
      else if (x === '-') cur = null;
      else { cur = { m: nm(x), s: i, len: 1 }; out.push(cur); }
    });
    return out;
  }
  function bq(c, type, f, q) {
    const b = c.createBiquadFilter(); b.type = type; b.frequency.value = Math.min(f, c.sampleRate * 0.45);
    if (q != null) b.Q.value = q;
    return b;
  }
  function comp(c, th, kn, ra, at, re) {
    const k = c.createDynamicsCompressor();
    k.threshold.value = th; k.knee.value = kn; k.ratio.value = ra; k.attack.value = at; k.release.value = re;
    return k;
  }
  /* ADSR（0 から立ち上げ、dur で離す）。止めてよい時刻を返す */
  function env(p, t, peak, a, d, s, dur, r) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(peak * s, t + a, Math.max(0.004, d / 3));
    const te = t + Math.max(dur, a + 0.005);
    p.setTargetAtTime(0, te, Math.max(0.004, r / 3));
    return te + r * 1.8 + 0.05;
  }
  function holdParam(p, t) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
  }

  /* ---- AudioContext ごとの共有物（1回だけ作る）: ノイズ・位相をずらした波形・リバーブの IR・歪みの曲線 ---- */
  function kit(c) {
    if (c.__duoKit) return c.__duoKit;
    const sr = c.sampleRate, k = { sr: sr };
    const nb = c.createBuffer(1, Math.floor(sr * 2), sr), nd = nb.getChannelData(0), r = rng(7);
    for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;
    k.noise = nb;
    /* 位相をずらしたノコギリ波・矩形波（同時に鳴らしたデチューン波の頭が揃って「ビッ」と鳴るのを避ける） */
    k.waves = { saw: [], sq: [] };
    for (let q = 0; q < 5; q++) {
      const ph = 0.37 + q * 1.31;
      ['saw', 'sq'].forEach((kind) => {
        const N = 80, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
        for (let h = 1; h <= N; h++) {
          let b = kind === 'saw' ? ((h % 2 ? 1 : -1) / h) : (h % 2 ? 1 / h : 0);
          b *= 1 / (1 + Math.pow(h / 40, 2));
          re[h] = b * Math.sin(h * ph); im[h] = b * Math.cos(h * ph);
        }
        k.waves[kind].push(c.createPeriodicWave(re, im));
      });
    }
    /* 生成インパルス応答（ステレオ・減衰するノイズ・時間とともに高域が落ちる・初期反射）。BGM と SE で共有 */
    const dur = 1.8, pre = 0.012, len = Math.floor(sr * (dur + pre)), ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch), rr = rng(101 + ch * 17);
      let lp = 0;
      const p0 = Math.floor(pre * sr);
      for (let i = p0; i < len; i++) {
        const u = (i - p0) / (len - p0);
        const e = Math.pow(1 - u, 2.4) * Math.exp(-u * 2.2);
        const a = 0.92 - 0.5 * u * 0.85;
        lp += a * ((rr() * 2 - 1) - lp);
        d[i] = lp * e;
      }
      for (let q = 0; q < 9; q++) {
        const idx = p0 + Math.floor((0.006 + q * 0.0113 + rr() * 0.005) * sr);
        if (idx < len) d[idx] += (rr() < 0.5 ? -1 : 1) * 0.55 * (1 - q / 10);
      }
    }
    k.ir = ir;
    const n = 1024, cv = new Float32Array(n), th = Math.tanh(2.5);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = Math.tanh(2.5 * x) / th; }
    k.curve = cv;
    try { c.__duoKit = k; } catch (e) { /* noop */ }
    return k;
  }

  /* ==========================================================================
     エンジン（AudioContext ごとに1つ）: マスター処理・共有リバーブ/ディレイ・LFO・セッションの管理
     ========================================================================== */
  function Engine(c, dest, opt) {
    const E = this;
    E.c = c; E.dest = dest; E.k = kit(c); E.sr = c.sampleRate; E.offline = !!(opt && opt.offline);
    E.sessions = []; E.cur = null; E.voices = []; E.mul = 1;
    E.flags = { hype: false, nokick: false };
    E.MAXV = (typeof Audio !== 'undefined' && Audio.MAXV) || 40;
    E.input = c.createGain();
    E.hs = bq(c, 'highshelf', 8000); E.hs.gain.value = 1.5;              // 軽いハイシェルフ
    E.glue = comp(c, -18, 12, 2.5, 0.02, 0.25);                           // まとめ役のコンプ
    E.lim = comp(c, -4, 0, 20, 0.001, 0.09);                              // 天井（クリップ防止）
    E.muff = bq(c, 'lowpass', 20000, 0.5);                                // 被弾で一瞬こもらせる
    E.out = c.createGain();
    E.input.connect(E.hs); E.hs.connect(E.glue); E.glue.connect(E.lim); E.lim.connect(E.muff);
    E.muff.connect(E.out); E.out.connect(dest);
    if (c.createAnalyser) { E.an = c.createAnalyser(); E.an.fftSize = 1024; E.out.connect(E.an); }
    /* 共有リバーブ（生成 IR・送りの手前で低域を切ってにごりを防ぐ） */
    E.revIn = c.createGain();
    const rhp = bq(c, 'highpass', 220, 0.7);
    E.rev = c.createConvolver(); E.rev.buffer = E.k.ir;
    const rret = c.createGain(); rret.gain.value = 0.8;
    E.revIn.connect(rhp); rhp.connect(E.rev); E.rev.connect(rret); rret.connect(E.input);
    /* 共有の付点8分ディレイ（帰還に LP/HP。返りを少しリバーブにも送る） */
    E.dlyIn = c.createGain();
    E.dly = c.createDelay(2.0); E.dly.delayTime.value = 0.37;
    E.dlp = bq(c, 'lowpass', 4200, 0.5); const dhp = bq(c, 'highpass', 260, 0.5);
    E.fb = c.createGain(); E.fb.gain.value = 0.32;
    const dret = c.createGain(); dret.gain.value = 0.5;
    E.dlyIn.connect(E.dly); E.dly.connect(E.dlp); E.dlp.connect(dhp); dhp.connect(E.fb); E.fb.connect(E.dly);
    dhp.connect(dret); dret.connect(E.input);
    const d2r = c.createGain(); d2r.gain.value = 0.3; dret.connect(d2r); d2r.connect(E.revIn);
    /* 共有 LFO: ビブラート（リード）と、ゆっくり揺れるコーラス（深海のパッド） */
    const l1 = c.createOscillator(); l1.frequency.value = 5.3;
    E.vib = c.createGain(); E.vib.gain.value = 7; l1.connect(E.vib); l1.start();
    const l2 = c.createOscillator(); l2.frequency.value = 0.45;
    E.cho = c.createGain(); E.cho.gain.value = 14; l2.connect(E.cho); l2.start();
    E.lfos = [l1, l2];
  }
  Engine.prototype.load = function (now) {
    if (this.voices.length > 12) this.voices = this.voices.filter((x) => x > now);
    return this.voices.length;
  };
  Engine.prototype.setDelay = function (S, t) {
    const fx = S.Z.fx;
    this.dly.delayTime.setTargetAtTime(0.75 * S.beat, t, 0.05);
    this.fb.gain.setTargetAtTime(fx.fb, t, 0.2);
    this.dlp.frequency.setTargetAtTime(Math.min(this.sr * 0.45, fx.dlp), t, 0.2);
  };
  /* ゾーンの曲へ切り替える。xfade=true なら今の曲の次の小節頭から2小節で交差させる */
  Engine.prototype.switchTo = function (id, now, xfade, opt) {
    const E = this, Z = ZONES[id] || ZONES.neon, old = E.cur;
    const S = new Session(E, Z, { mul: E.mul, seed: opt && opt.seed });
    S.id = id;
    if (old && xfade) {
      const t = Math.max(old.nextT, now + 0.05), xd = 2 * old.barDur;
      old.stopAt = t + xd; old.killAt = t + xd + 3;
      old.fade(0, t, xd);
      S.nextT = t;
      S.fade(1, t, 2 * S.barDur);
    } else {
      if (old) { old.stopAt = now; old.killAt = now + 1.5; old.fade(0, now, 0.25); old.q.length = 0; }
      S.nextT = now + 0.08;
      S.fade(1, S.nextT, 0.08);
    }
    E.sessions.push(S);
    E.cur = S;
    E.setDelay(S, S.nextT);
    return S;
  };
  Engine.prototype.stop = function (now) {
    const S = this.cur;
    if (S) { S.stopAt = now; S.killAt = now + 1.5; S.fade(0, now, 0.2); S.q.length = 0; }
    this.cur = null;
  };
  /* 被弾: ローパスで 0.4秒ほどこもらせて戻す */
  Engine.prototype.muffle = function (now) {
    const p = this.muff.frequency, top = Math.min(20000, this.sr * 0.45);
    holdParam(p, now);
    p.setTargetAtTime(380, now, 0.02);
    p.setTargetAtTime(top, now + 0.35, 0.25);
  };
  /* スケジューラ: 小節の頭が先読みの窓に入ったら小節の「予定表」を作り、窓に入った音符だけ発音する */
  Engine.prototype.pump = function (now, horizon) {
    const E = this;
    let n = 0;
    for (let k = 0; k < E.sessions.length; k++) {
      const S = E.sessions[k];
      /* 止まっていた（隠れていた・ミュート）後は今から数え直す（溜まった分を一気に鳴らさない） */
      if (S.nextT < now - 0.25 && S.nextT < S.stopAt) { S.q.length = 0; S.nextT = now + 0.06; }
      let guard = 0;
      while (S.nextT < now + horizon + 0.05 && S.nextT < S.stopAt && guard++ < 4) S.schedBar();
      n += S.flush(now + horizon, now);
    }
    for (let k = E.sessions.length - 1; k >= 0; k--) {
      const S = E.sessions[k];
      if (S.killAt < now) { S.dispose(); E.sessions.splice(k, 1); }
    }
    return n;
  };

  /* ==========================================================================
     セッション（1曲ぶん: パートのバス・センド・ダッキング・予定表）
     ========================================================================== */
  function Session(E, Z, opt) {
    const S = this, c = E.c;
    S.E = E; S.c = c; S.Z = Z; S.id = Z.id; S.alive = true;
    S.rnd = rng(opt.seed != null ? opt.seed : ((Math.random() * 4294967296) >>> 0));
    S.mul = opt.mul || 1; S.bar = 0; S.nextT = 0; S.q = []; S.dirty = false; S.curI = 0;
    S.stopAt = Infinity; S.killAt = Infinity; S.ducks = []; S.parts = {};
    S.norm = dbToG(Z.norm || 0);
    S.out = c.createGain(); S.out.gain.value = 0; S.out.connect(E.input);
    S.rs = c.createGain(); S.rs.gain.value = 0; S.rs.connect(E.revIn);
    S.ds = c.createGain(); S.ds.gain.value = 0; S.ds.connect(E.dlyIn);
    Object.keys(Z.parts).forEach((k) => { S.parts[k] = S.part(Z.parts[k]); });
    S.setTempo(0);
  }
  Session.prototype.part = function (o) {
    const S = this, c = S.c, g = c.createGain();
    g.gain.value = o.gain == null ? 1 : o.gain;
    let node = g;
    if (o.hp) { const f = bq(c, 'highpass', o.hp, 0.6); node.connect(f); node = f; }
    if (o.lp) { const f = bq(c, 'lowpass', o.lp, 0.6); node.connect(f); node = f; }
    if (o.drive) {
      const pre = c.createGain(); pre.gain.value = o.drive;
      const ws = c.createWaveShaper(); ws.curve = S.E.k.curve; ws.oversample = '2x';
      const post = c.createGain(); post.gain.value = o.post || (1 / o.drive);
      node.connect(pre); pre.connect(ws); ws.connect(post); node = post;
    }
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; }
    if (o.duck) { const d = c.createGain(); node.connect(d); node = d; S.ducks.push({ g: d, depth: o.duck, rel: o.duckRel || 0.06 }); }
    node.connect(S.out);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; node.connect(s); s.connect(S.rs); }
    if (o.dly) { const s = c.createGain(); s.gain.value = o.dly; node.connect(s); s.connect(S.ds); }
    return g;
  };
  /* 出口とセンドをまとめて v（0..1）へ（クロスフェード） */
  Session.prototype.fade = function (v, t, dur) {
    const S = this, fx = S.Z.fx, tc = Math.max(0.01, dur / 4);
    [[S.out.gain, 1], [S.rs.gain, fx.rev], [S.ds.gain, fx.dly]].forEach((x) => {
      x[0].setTargetAtTime(v * S.norm * x[1], t, tc);
    });
  };
  Session.prototype.setTempo = function (t) {
    const S = this;
    S.bpm = S.Z.bpm * S.mul; S.beat = 60 / S.bpm; S.t16 = S.beat / 4; S.barDur = S.beat * 4;
    if (S.E.cur === S) S.E.setDelay(S, t);
  };
  /* 16分の step の時刻（スウィングなし） */
  Session.prototype.at = function (t0, st) { return t0 + st * this.t16; };
  Session.prototype.j = function () { return (this.rnd() * 2 - 1) * 0.008; };          // タイミング ±8ms
  Session.prototype.v = function (x) { return x * (1 + (this.rnd() * 2 - 1) * 0.15); }; // ベロシティ ±15%
  Session.prototype.duck = function (t) {
    this.ducks.forEach((d) => {
      d.g.gain.setTargetAtTime(1 - d.depth, t, 0.004);
      d.g.gain.setTargetAtTime(1, t + 0.03, d.rel);
    });
  };
  /* 予定表へ（t: 時刻・p: 優先度 0=必須 1=装飾 2=飾りの飾り・f(t): 発音して止める時刻を返す・cond: 'kick'|'hype'） */
  Session.prototype.ev = function (t, p, f, cond) { this.q.push({ t: t, p: p, f: f, c: cond || null }); this.dirty = true; };
  Session.prototype.note = function (fn, part, t, m, dur, vel, o, p, cond) {
    const S = this;
    S.ev(t, p || 0, (tt) => fn(S, part, tt, m, dur, vel, o), cond);
  };
  Session.prototype.chord = function (fn, part, t, dur, ms, vel, o, strum, p) {
    ms.forEach((m, k) => this.note(fn, part, t + k * (strum || 0) + this.j(), m, dur, this.v(vel), o, p));
  };
  /* 旋律（glide=true なら前の音からしゃくり上げる／下げる） */
  Session.prototype.melody = function (fn, part, t0, notes, vel, o, gate, shift, glide) {
    const S = this;
    notes.forEach((n, k) => {
      const t = S.at(t0, n.s) + S.j(), m = n.m + (shift || 0);
      let oo = o;
      if (glide) {
        const prev = (k > 0) ? notes[k - 1].m + (shift || 0) : S.lastMel;
        if (prev != null && prev !== m) oo = Object.assign({}, o, { from: prev, gl: o.gl || 0.08 });
      }
      S.note(fn, part, t, m, n.len * S.t16 * (gate || 0.92), S.v(vel * (n.s % 4 === 0 ? 1 : 0.88)), oo, 0);
    });
    if (glide && notes.length) S.lastMel = notes[notes.length - 1].m + (shift || 0);
  };
  Session.prototype.schedBar = function () {
    const S = this;
    if (Math.abs(S.mul - S.E.mul) > 1e-6) { S.mul = S.E.mul; S.setTempo(S.nextT); }  // テンポは小節頭で反映
    const i = S.bar % S.Z.bars;
    S.curI = i;
    S.Z.bar(S, i, S.nextT);
    S.nextT += S.barDur; S.bar++;
  };
  Session.prototype.flush = function (until, now) {
    const S = this, E = S.E, q = S.q;
    if (S.dirty) { q.sort((a, b) => a.t - b.t); S.dirty = false; }
    let n = 0, i = 0;
    for (; i < q.length && q[i].t < until; i++) {
      const e = q[i];
      if (e.t < now - 0.04) continue;                               // 間に合わなかった音は捨てる
      if (e.c === 'kick' && E.flags.nokick) continue;
      if (e.c === 'hype' && !E.flags.hype) continue;
      if (e.p > 0 && E.load(now) >= E.MAXV) { if (typeof Audio !== 'undefined') Audio.stats.dropped++; E.dropped = (E.dropped || 0) + 1; continue; }
      const end = e.f(Math.max(e.t, now + 0.003));
      if (end) E.voices.push(end);
      n++;
    }
    if (i) q.splice(0, i);
    return n;
  };
  Session.prototype.dispose = function () {
    const S = this;
    S.alive = false; S.q.length = 0;
    if (S.E.offline) return;                                        // オフライン描画ではグラフを残す（自動化で無音になる）
    [S.out, S.rs, S.ds].forEach((x) => { try { x.disconnect(); } catch (e) { /* noop */ } });
  };

  /* ==========================================================================
     楽器（S = セッション、out = パートの入口）。どれも「止めてよい時刻」を返す
     ========================================================================== */
  function osc(S, kind, f) {
    const o = S.c.createOscillator();
    if (kind === 'saw' || kind === 'sq') { const w = S.E.k.waves[kind]; o.setPeriodicWave(w[(S.rnd() * w.length) | 0]); }
    else o.type = kind === 'tri' ? 'triangle' : kind;
    o.frequency.value = Math.min(f, S.E.sr * 0.45);
    return o;
  }
  function nsrc(S) {
    const s = S.c.createBufferSource(); s.buffer = S.E.k.noise; s.loop = true; s.off = S.rnd() * 1.6;
    return s;
  }
  /* 減算合成（デチューンした n 本＋フィルタ・エンベロープ＋ADSR＋任意でサブ・グライド・ビブラート・コーラス） */
  function syn(S, out, t, m, dur, vel, o) {
    const c = S.c, f = mtof(m) * (o.oct ? Math.pow(2, o.oct) : 1), n = o.n || 2, det = o.det || 8;
    const nyq = S.E.sr * 0.45, cut = Math.min(nyq, o.cut || 2000);
    const fl = bq(c, 'lowpass', cut, o.q || 0.7);
    const fe = (o.fenv || 0) * vel;
    if (fe) {
      const fa = o.fa || 0.005;
      fl.frequency.setValueAtTime(cut, t);
      fl.frequency.linearRampToValueAtTime(Math.min(nyq, cut + fe), t + fa);
      fl.frequency.setTargetAtTime(Math.min(nyq, cut + fe * (o.fs || 0)), t + fa, (o.fd || 0.2) / 3);
    }
    const g = c.createGain(); fl.connect(g); g.connect(out);
    const end = env(g.gain, t, vel * (o.lvl || 0.1), o.a || 0.005, o.d || 0.2, o.s == null ? 0.7 : o.s, dur, o.r || 0.15);
    const sp = (n > 1 && o.spread && c.createStereoPanner) ? o.spread : 0;
    for (let i = 0; i < n; i++) {
      const x = osc(S, o.type || 'saw', f);
      const dd = n > 1 ? (i / (n - 1) * 2 - 1) * det : 0;
      x.detune.value = dd + (S.rnd() * 2 - 1) * 2;
      if (o.from != null) { x.detune.setValueAtTime(dd + (o.from - m) * 100, t); x.detune.linearRampToValueAtTime(dd, t + (o.gl || 0.06)); }
      else if (o.scoop) { x.detune.setValueAtTime(dd - o.scoop, t); x.detune.linearRampToValueAtTime(dd, t + 0.07); }
      if (o.vib) S.E.vib.connect(x.detune);
      if (o.cho && (i % 2 === 1)) S.E.cho.connect(x.detune);
      let node = x;
      if (sp) { const p = c.createStereoPanner(); p.pan.value = (i / (n - 1) * 2 - 1) * sp; x.connect(p); node = p; }
      node.connect(fl); x.start(t); x.stop(end);
    }
    if (o.sub) {
      const s = c.createOscillator(); s.type = 'sine'; s.frequency.value = f / 2;
      const sg = c.createGain(); sg.gain.value = o.sub;
      s.connect(sg); sg.connect(g); s.start(t); s.stop(end);
    }
    return end;
  }
  /* FM（ベル）。キャリア2本（少しずらす）＋減衰するモジュレータ */
  function fm(S, out, t, m, dur, vel, o) {
    const c = S.c, f = mtof(m), end = t + dur + (o.tail || 0.9);
    const g = c.createGain(); g.connect(out);
    const pk = vel * (o.lvl || 0.12), tau = (o.tau || 1.4) * Math.pow(2, -(m - 60) / 24);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, tau);
    g.gain.setTargetAtTime(0, t + dur, o.rel || 0.1);
    const mod = c.createOscillator(); mod.frequency.value = Math.min(S.E.sr * 0.45, f * (o.ratio || 1));
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * (o.i0 || 1.2) * (0.5 + vel), t);
    mg.gain.setTargetAtTime(f * (o.i1 || 0.2), t, o.itau || 0.3);
    mod.connect(mg);
    [0, o.chorus == null ? 6 : o.chorus].forEach((d, i) => {
      const x = c.createOscillator(); x.frequency.value = f; x.detune.value = d;
      mg.connect(x.frequency);
      if (i) { const xg = c.createGain(); xg.gain.value = 0.5; x.connect(xg); xg.connect(g); }
      else x.connect(g);
      x.start(t); x.stop(end);
    });
    mod.start(t); mod.stop(end);
    return end;
  }
  /* 木琴（サイン＋4倍付近の倍音が速く消える＋木の打撃音） */
  function mallet(S, out, t, m, dur, vel, o) {
    const c = S.c, f = mtof(m), lv = vel * ((o && o.lvl) || 0.12), end = t + 0.7;
    [[1, 1, 0.16], [3.93, 0.28, 0.035]].forEach((p) => {
      if (f * p[0] > S.E.sr * 0.45) return;
      const x = c.createOscillator(); x.type = 'sine'; x.frequency.value = f * p[0];
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv * p[1], t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, p[2]);
      x.connect(g); g.connect(out); x.start(t); x.stop(end);
    });
    return end;
  }
  /* --- 打楽器 --- */
  function kick(S, out, t, vel, o) {
    o = o || {};
    const c = S.c, dec = o.dec || 0.32;
    const x = c.createOscillator(); x.type = 'sine';
    x.frequency.setValueAtTime(o.f0 || 160, t); x.frequency.exponentialRampToValueAtTime(o.f1 || 47, t + (o.pd || 0.08));
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.003); g.gain.setTargetAtTime(0, t + 0.02, dec / 3.5);
    x.connect(g); g.connect(out); x.start(t); x.stop(t + dec * 2 + 0.05);
    const n = nsrc(S), hp = bq(c, 'highpass', o.clickHz || 2500, 0.7), ng = c.createGain();
    ng.gain.setValueAtTime(vel * (o.click == null ? 0.22 : o.click), t); ng.gain.setTargetAtTime(0, t, 0.004);
    n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t, n.off); n.stop(t + 0.05);
    return t + dec * 2 + 0.05;
  }
  function snare(S, out, t, vel, o) {
    o = o || {};
    const c = S.c, dec = o.dec || 0.16;
    const n = nsrc(S), hp = bq(c, 'highpass', o.hp || 900, 0.7), g = c.createGain();
    g.gain.setValueAtTime(vel * (o.nl || 0.55), t); g.gain.setTargetAtTime(0, t, dec / 3);
    n.connect(hp); hp.connect(g); g.connect(out); n.start(t, n.off); n.stop(t + dec * 2.5);
    const b = c.createOscillator(); b.type = 'triangle';
    b.frequency.setValueAtTime(o.body || 200, t); b.frequency.exponentialRampToValueAtTime((o.body || 200) * 0.78, t + 0.08);
    const bg = c.createGain(); bg.gain.setValueAtTime(vel * 0.5, t); bg.gain.setTargetAtTime(0, t, 0.035);
    b.connect(bg); bg.connect(out); b.start(t); b.stop(t + 0.25);
    return t + dec * 2.5;
  }
  function clap(S, out, t, vel) {
    const c = S.c, n = nsrc(S), bp = bq(c, 'bandpass', 1300, 0.9), g = c.createGain();
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.011;
      g.gain.setValueAtTime(vel * 0.7, tt); g.gain.setTargetAtTime(vel * 0.05, tt + 0.001, 0.004);
    }
    g.gain.setValueAtTime(vel * 0.6, t + 0.034); g.gain.setTargetAtTime(0, t + 0.035, 0.05);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t, n.off); n.stop(t + 0.45);
    return t + 0.45;
  }
  function hat(S, out, t, vel, open, o) {
    o = o || {};
    const c = S.c, n = nsrc(S), hp = bq(c, 'highpass', o.hp || 7500, 0.9), g = c.createGain();
    const dec = open ? (o.open || 0.14) : (o.dec || 0.022);
    g.gain.setValueAtTime(vel * 0.5, t); g.gain.setTargetAtTime(0, t, dec / 3);
    n.connect(hp); hp.connect(g); g.connect(out); n.start(t, n.off); n.stop(t + dec * 3 + 0.02);
    return t + dec * 3 + 0.02;
  }
  function crash(S, out, t, vel) {
    const c = S.c, n = nsrc(S), hp = bq(c, 'highpass', 4500, 0.6), g = c.createGain();
    g.gain.setValueAtTime(vel * 0.4, t); g.gain.setTargetAtTime(0, t, 0.55);
    n.connect(hp); hp.connect(g); g.connect(out); n.start(t, n.off); n.stop(t + 2.8);
    return t + 2.8;
  }
  function riser(S, out, t, dur, vel) {
    const c = S.c, n = nsrc(S), bp = bq(c, 'bandpass', 500, 2.5), g = c.createGain();
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(Math.min(7000, S.E.sr * 0.45), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.02);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(t, n.off); n.stop(t + dur + 0.2);
    return t + dur + 0.2;
  }
  function tom(S, out, t, vel, o) {
    const c = S.c, f = (o && o.f) || 140;
    const x = c.createOscillator(); x.type = 'sine';
    x.frequency.setValueAtTime(f * 1.6, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.09);
    x.connect(g); g.connect(out); x.start(t); x.stop(t + 0.5);
    const n = nsrc(S), lp = bq(c, 'lowpass', 1800, 0.7), ng = c.createGain();
    ng.gain.setValueAtTime(vel * 0.35, t); ng.gain.setTargetAtTime(0, t, 0.015);
    n.connect(lp); lp.connect(ng); ng.connect(out); n.start(t, n.off); n.stop(t + 0.1);
    return t + 0.5;
  }

  /* ==========================================================================
     音色（プリセット）: 基準は 3番の popBass / popPad / popLead / popArp
     ========================================================================== */
  const I = {
    popBass: { type: 'sq', n: 2, det: 5, cut: 200, fenv: 1500, fd: 0.1, q: 2.6, a: 0.003, d: 0.18, s: 0.35, r: 0.06, sub: 0.5, lvl: 0.12 },
    popPad:  { type: 'saw', n: 3, det: 14, cut: 1500, a: 0.02, d: 0.4, s: 0.9, r: 0.3, spread: 0.8, lvl: 0.03 },
    popLead: { type: 'saw', n: 2, det: 9, cut: 700, fenv: 5200, fa: 0.002, fs: 0.05, fd: 0.16, q: 1.8, a: 0.002, d: 0.34, s: 0.2, r: 0.12, spread: 0.4, lvl: 0.1 },
    popArp:  { type: 'sq', n: 2, det: 6, cut: 900, fenv: 3000, fd: 0.07, q: 1.2, a: 0.002, d: 0.12, s: 0, r: 0.06, lvl: 0.045 },
    /* 白空間: 柔らかいプラック・軽いベース */
    wLead:   { type: 'saw', n: 2, det: 8, cut: 800, fenv: 3600, fa: 0.002, fs: 0.05, fd: 0.2, q: 1.2, a: 0.003, d: 0.4, s: 0.2, r: 0.16, spread: 0.4, lvl: 0.1 },
    wBass:   { type: 'sq', n: 2, det: 5, cut: 240, fenv: 900, fd: 0.12, q: 1.6, a: 0.004, d: 0.3, s: 0.45, r: 0.1, sub: 0.55, lvl: 0.11 },
    /* 遺跡: 木琴的な短い減衰のプラック */
    rLead:   { type: 'saw', n: 2, det: 7, cut: 900, fenv: 3800, fa: 0.002, fs: 0, fd: 0.1, q: 1.4, a: 0.002, d: 0.16, s: 0, r: 0.08, spread: 0.3, lvl: 0.1 },
    rBass:   { type: 'sq', n: 2, det: 5, cut: 180, fenv: 1300, fd: 0.09, q: 2.4, a: 0.003, d: 0.16, s: 0.3, r: 0.06, sub: 0.55, lvl: 0.12 },
    mal:     { lvl: 0.13 },
    /* 深海: 丸い音（三角波・ローパス強め）・揺れるパッド・泡 */
    sLead:   { type: 'tri', n: 2, det: 7, cut: 700, fenv: 1600, fa: 0.004, fs: 0.1, fd: 0.25, q: 0.8, a: 0.006, d: 0.4, s: 0.35, r: 0.25, spread: 0.3, lvl: 0.16 },
    sPad:    { type: 'saw', n: 3, det: 10, cut: 900, a: 0.25, d: 0.6, s: 0.9, r: 0.8, spread: 0.8, cho: 1, lvl: 0.036 },
    sBass:   { type: 'tri', n: 2, det: 4, cut: 320, fenv: 500, fd: 0.12, q: 0.9, a: 0.006, d: 0.3, s: 0.5, r: 0.1, sub: 0.6, lvl: 0.2 },
    bub:     { type: 'sine', n: 1, cut: 6000, a: 0.002, d: 0.09, s: 0, r: 0.05, lvl: 0.09, gl: 0.035 },
    /* 宇宙: 浮遊感・グライドするリード・広いパッド */
    spLead:  { type: 'saw', n: 2, det: 8, cut: 1000, fenv: 1800, fa: 0.03, fs: 0.4, fd: 0.4, q: 0.8, a: 0.03, d: 0.5, s: 0.7, r: 0.5, vib: 1, spread: 0.5, lvl: 0.08, gl: 0.09 },
    spPad:   { type: 'saw', n: 3, det: 16, cut: 1300, a: 0.6, d: 0.8, s: 0.9, r: 1.4, spread: 0.9, lvl: 0.034 },
    spBass:  { type: 'sq', n: 2, det: 4, cut: 220, fenv: 800, fd: 0.14, q: 1.8, a: 0.004, d: 0.3, s: 0.5, r: 0.12, sub: 0.6, lvl: 0.11 },
    spArp:   { type: 'tri', n: 2, det: 5, cut: 2600, a: 0.003, d: 0.25, s: 0, r: 0.2, lvl: 0.07 },
    /* 鏡: きらめくベル系プラック */
    bell:    { ratio: 3.5, i0: 0.9, i1: 0.05, itau: 0.12, tau: 0.8, chorus: 3, lvl: 0.075, rel: 0.25, tail: 0.6 },
    mPluck:  { type: 'saw', n: 2, det: 9, cut: 900, fenv: 4200, fa: 0.002, fs: 0.05, fd: 0.12, q: 1.5, a: 0.002, d: 0.24, s: 0.1, r: 0.1, lvl: 0.055 },
    /* コア: 歪ませるベース・硬いリード */
    cBass:   { type: 'sq', n: 2, det: 6, cut: 260, fenv: 2200, fd: 0.09, q: 3, a: 0.003, d: 0.16, s: 0.35, r: 0.05, sub: 0.45, lvl: 0.13 },
    cLead:   { type: 'saw', n: 2, det: 12, cut: 800, fenv: 6000, fa: 0.002, fs: 0.08, fd: 0.14, q: 2, a: 0.002, d: 0.3, s: 0.3, r: 0.1, spread: 0.45, lvl: 0.1 }
  };
  const KICK = { f0: 170, f1: 50, dec: 0.3, click: 0.3 };

  /* ==========================================================================
     共通の部品（小節の中身を予定表に積む）
     ========================================================================== */
  function kicks(S, P, t0, steps, vel, o) {
    steps.forEach((st) => {
      const t = S.at(t0, st) + S.j() * 0.25, v = S.v(vel);
      S.ev(t, 0, (tt) => { S.duck(tt); return kick(S, P.kick, tt, v, o || KICK); }, 'kick');
    });
  }
  function claps(S, P, t0, steps, vel, sn) {
    steps.forEach((st) => {
      const t = S.at(t0, st) + S.j(), v1 = S.v(vel), v2 = S.v(sn || 0.22);
      S.ev(t, 0, (tt) => { clap(S, P.clap, tt, v1); return snare(S, P.clap, tt, v2, { hp: 1500, dec: 0.1 }); });
    });
  }
  /* ハイハット: vs[16] の強さ（0 は打たない）、open の位置は開いたハット */
  function hats(S, P, t0, vs, opens, o) {
    for (let st = 0; st < 16; st++) {
      const vv = vs[st % vs.length];
      if (!vv) continue;
      const t = S.at(t0, st) + S.j(), v = S.v(vv), op = opens.indexOf(st % 4) >= 0;
      S.ev(t, st % 4 === 0 ? 1 : 2, (tt) => hat(S, P.hat, tt, v, op, o));
    }
  }
  /* オクターブで跳ねるベース（8分・裏でオクターブ上）。盛り上げ中はさらにオクターブ上を重ねる */
  function bassOct(S, P, t0, C, pre, o) {
    o = o || {};
    const d = S.t16 * (o.gate || 1.4);
    for (let k = 0; k < 8; k++) {
      const t = S.at(t0, k * 2) + S.j() * 0.4, m = C.b + (k % 2 ? 12 : 0), v = S.v(k % 2 ? 0.72 : 0.95);
      S.note(syn, P.bass, t, m, d, v, pre, 0);
      S.note(syn, P.bass, t, m + 12, d, v * 0.55, pre, 1, 'hype');
    }
  }
  function bassHalf(S, P, t0, C, pre) {
    [[0, 6, 0.95], [8, 5, 0.8], [14, 2, 0.6]].forEach((x) => {
      S.note(syn, P.bass, S.at(t0, x[0]) + S.j() * 0.4, C.b + (x[0] === 14 ? 12 : 0), S.t16 * x[1], S.v(x[2]), pre, 0);
    });
  }
  function pad(S, P, t0, C, pre, vel) {
    S.chord(syn, P.pad, t0, S.barDur * 0.97, C.n.concat([C.n[0] + 12]), vel, pre, 0, 0);
  }
  function arp16(S, P, t0, C, pre, oct, seq, part) {
    const an = C.n.map((m) => m + oct);
    for (let k = 0; k < 16; k++) {
      S.note(syn, part || P.arp, S.at(t0, k) + S.j(), an[seq[k % seq.length] % an.length], S.t16 * 0.8,
             S.v(k % 4 === 0 ? 0.5 : 0.32), pre, 1);
    }
  }
  /* 盛り上げレイヤー（大演出中だけ鳴る）: 16分のハイハット・2小節のライザー（ベースのオクターブ上は bassOct 側） */
  function hype(S, P, t0, i) {
    for (let st = 0; st < 16; st++) {
      const t = S.at(t0, st) + S.j(), v = S.v(st % 2 ? 0.28 : 0.38);
      S.ev(t, 2, (tt) => hat(S, P.hat, tt, v, false, { hp: 8500, dec: 0.02 }), 'hype');
    }
    if (i % 2 === 0) { const d = S.barDur * 2; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, 0.11), 'hype'); }
  }
  /* 楽譜の旋律を鏡に映す（軸で反転し、その小節の和音の音へ寄せる＝反行するメロディ） */
  function mirrorMel(notes, C, axis) {
    const pcs = C.n.concat([C.b]).map((m) => ((m % 12) + 12) % 12);
    return notes.map((n) => {
      const x = 2 * axis - n.m;
      let best = x, bd = 99;
      for (let d = -6; d <= 6; d++) {
        const y = x + d;
        if (pcs.indexOf(((y % 12) + 12) % 12) >= 0 && Math.abs(d) < bd) { bd = Math.abs(d); best = y; }
      }
      return { m: best, s: n.s, len: n.len };
    });
  }
  const HV_POP = [0.3, 0.13, 0.38, 0.13];

  /* ==========================================================================
     ゾーンの曲（7種）。bar(S, i, t0) が i 小節目の予定表を積む
     rel = 相対メジャーの主音（SE のペンタトニック用）／fx = 共有リバーブ/ディレイへの送り量と帰還
     ========================================================================== */
  const ZONES = {
    /* ---------------------------------------------------------- S1 白空間 */
    white: {
      name: 'S1 白空間（チュートリアル）', key: 'C major', bpm: 116, bars: 16, rel: 0,
      desc: '音数を減らした軽い版。前半はキックなしのハーフタイム、後半で4つ打ち。',
      prog: 'C G Am F C G F G Am F C G F G C G'.split(' '),
      C: { C: 'C2 | C4 E4 G4', G: 'G1 | B3 D4 G4', Am: 'A1 | A3 C4 E4', F: 'F1 | A3 C4 F4' },
      fx: { rev: 1.1, dly: 1.0, fb: 0.3, dlp: 4200 },
      parts: {
        lead: { gain: 1.8, rev: 0.3, dly: 0.35 }, pad: { gain: 1.1, rev: 0.4, duck: 0.6, duckRel: 0.06 },
        bass: { gain: 0.9, duck: 0.45, duckRel: 0.05 }, arp: { gain: 1.0, rev: 0.25, dly: 0.3, pan: -0.15, duck: 0.4 },
        kick: { gain: 0.26 }, clap: { gain: 1.4, rev: 0.3 }, hat: { gain: 1.0, pan: 0.15 }, fx: { gain: 0.6, rev: 0.3 }
      },
      M: [
        'E5 . . . | G5 . . . | - - E5 . | D5 . C5 .',
        'D5 . . . | . . B4 . | . . . . | - - - -',
        'C5 . . . | E5 . . . | A5 . . . | G5 . E5 .',
        'F5 . . . | . . . . | - - - - | - - - -',
        'E5 . . . | G5 . . . | - - C6 . | B5 . G5 .',
        'A5 . . . | G5 . . . | D5 . . . | - - - -',
        'C5 . . . | . . F5 . | . . A5 . | G5 . F5 .',
        'D5 . . . | . . . . | - - - - | - - - -',
        'E5 . . E5 | . . C5 . | . . E5 . | A5 . . .',
        'G5 . . . | F5 . . . | C5 . . . | - - - -',
        'E5 . . . | G5 . C6 . | . . . . | B5 . G5 .',
        'D5 . . . | . . . . | B4 . D5 . | G5 . . .',
        'A5 . . . | G5 . F5 . | . . C5 . | F5 . . .',
        'G5 . . . | . . D5 . | . . B4 . | D5 . . .',
        'E5 . . . | . . . . | G5 . . . | E5 . . .',
        'D5 . . . | . . . . | - - - - | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]], full = i >= 8;
        if (full) {
          kicks(S, P, t0, [0, 4, 8, 12], 0.85, KICK);
          claps(S, P, t0, [4, 12], 0.6);
          hats(S, P, t0, HV_POP, [2], null);
          bassOct(S, P, t0, C, I.wBass);
        } else {
          claps(S, P, t0, [8], 0.55);                                          // ハーフタイム（3拍目だけ）
          hats(S, P, t0, [0.26, 0.1, 0.2, 0.1], [], null);
          bassHalf(S, P, t0, C, I.wBass);
        }
        if (i === 8 || i === 0) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, i ? 0.45 : 0.25));
        if (i === 7 || i === 15) { const d = S.barDur; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, 0.09)); }
        pad(S, P, t0, C, I.popPad, 0.5);
        if (i >= 12) {                                                  // 最後の4小節だけ 8分のアルペジオ
          const an = C.n.map((m) => m + 24), seq = [0, 1, 2, 1];
          for (let k = 0; k < 8; k++) S.note(syn, P.arp, S.at(t0, k * 2) + S.j(), an[seq[k % 4]], S.t16 * 0.9, S.v(k % 2 ? 0.34 : 0.46), I.popArp, 1);
        }
        S.melody(syn, P.lead, t0, this.MM[i], 0.8, I.wLead, 0.9);
        hype(S, P, t0, i);
      }
    },
    /* ---------------------------------------------------------- S2 ネオン都市（基準曲＝サンプル3番） */
    neon: {
      name: 'S2 ネオン都市（基準曲）', key: 'D major / B minor', bpm: 122, bars: 16, rel: 2,
      desc: '聴き比べ3番そのもの。明るいプラックと4つ打ち、オクターブで跳ねるベース。',
      prog: 'Bm G D A Bm G D A G A F#m Bm G A D A'.split(' '),
      C: { Bm: 'B1 | B3 D4 F#4', G: 'G1 | B3 D4 G4', D: 'D2 | A3 D4 F#4', A: 'A1 | A3 C#4 E4', 'F#m': 'F#1 | A3 C#4 F#4' },
      fx: { rev: 1.0, dly: 1.0, fb: 0.32, dlp: 4200 },
      parts: {
        lead: { gain: 1.9, rev: 0.25, dly: 0.35 }, pad: { gain: 1.2, rev: 0.35, duck: 0.7, duckRel: 0.06 },
        bass: { gain: 0.9, duck: 0.45, duckRel: 0.05 }, arp: { gain: 1.2, rev: 0.2, dly: 0.25, duck: 0.4, pan: 0.2 },
        kick: { gain: 0.27 }, clap: { gain: 1.6, rev: 0.25 }, hat: { gain: 1.15, pan: 0.15 }, fx: { gain: 0.6, rev: 0.3 }
      },
      M: [
        'F#5 . . D5 | . . B4 . | - - D5 . | E5 . F#5 .',
        'G5 . . F#5 | . . D5 . | . . B4 . | - - - -',
        'A5 . . F#5 | . . D5 . | - - F#5 . | G5 . A5 .',
        'E5 . . . | . . C#5 . | . . - - | - - - -',
        'F#5 . . D5 | . . B4 . | - - D5 . | E5 . F#5 .',
        'B5 . . A5 | . . G5 . | . . F#5 . | E5 . D5 .',
        'F#5 . . . | E5 . D5 . | . . - - | A4 . B4 .',
        'C#5 . . . | . . . . | E5 . . . | - - - -',
        'D5 . . D5 | . . D5 . | E5 . . F#5 | . . G5 .',
        'E5 . . . | . . - - | C#5 . E5 . | A5 . . .',
        'A5 . . F#5 | . . C#5 . | . . E5 . | F#5 . . .',
        'D5 . . . | . . B4 . | . . - - | - - - -',
        'B4 . D5 . | G5 . . . | F#5 . . . | E5 . D5 .',
        'C#5 . E5 . | A5 . . . | G5 . . . | F#5 . E5 .',
        'F#5 . . . | . . A5 . | . . . . | F#5 . . .',
        'E5 . . . | . . . . | - - - - | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]];
        kicks(S, P, t0, [0, 4, 8, 12], 0.92, KICK);
        claps(S, P, t0, [4, 12], 0.7);
        hats(S, P, t0, HV_POP, [2], { open: 0.13 });
        if (i === 0 || i === 8) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, 0.5));
        if (i === 7 || i === 15) { const d = S.barDur; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, 0.1)); }
        bassOct(S, P, t0, C, I.popBass);
        pad(S, P, t0, C, I.popPad, 0.55);
        if (i >= 8) arp16(S, P, t0, C, I.popArp, 24, [0, 1, 2, 1], null);
        S.melody(syn, P.lead, t0, this.MM[i], 0.85, I.popLead, 0.9);
        hype(S, P, t0, i);
      }
    },
    /* ---------------------------------------------------------- S3 古代遺跡 */
    ruins: {
      name: 'S3 古代遺跡', key: 'E minor', bpm: 120, bars: 16, rel: 7,
      desc: 'マイナー寄り。木琴のように短く消えるプラック、タムのフィル、少し民族調の旋律（和声的短音階の D#）。',
      prog: ['Em', 'C', 'D', 'Em', 'Em', 'C', 'Am', 'B', 'C', 'D', 'Em', 'C', 'Am', 'Em', 'B7', 'B7'],
      C: { Em: 'E2 | G3 B3 E4', C: 'C2 | G3 C4 E4', D: 'D2 | F#3 A3 D4', Am: 'A1 | A3 C4 E4', B: 'B1 | B3 D#4 F#4', B7: 'B1 | A3 D#4 F#4' },
      fx: { rev: 1.2, dly: 0.9, fb: 0.28, dlp: 3600 },
      parts: {
        lead: { gain: 1.7, rev: 0.3, dly: 0.25 }, lead2: { gain: 1.3, rev: 0.3, pan: -0.15 },
        pad: { gain: 1.0, rev: 0.4, duck: 0.6, duckRel: 0.06, lp: 3000 },
        bass: { gain: 0.9, duck: 0.45, duckRel: 0.05 }, arp: { gain: 1.2, rev: 0.25, dly: 0.2, pan: 0.25, duck: 0.3 },
        kick: { gain: 0.27 }, clap: { gain: 1.4, rev: 0.3 }, hat: { gain: 1.2, pan: 0.2 }, tom: { gain: 0.4, rev: 0.3 },
        fx: { gain: 0.6, rev: 0.3 }
      },
      M: [
        'E5 . G5 . | B5 . . A5 | G5 . E5 . | . . D5 E5',
        'G5 . . . | E5 . . . | C5 . . D5 | E5 . . .',
        'F#5 . . . | A5 . . F#5 | D5 . . . | E5 . F#5 .',
        'E5 . . . | . . . . | B4 . . . | - - - -',
        'E5 . G5 . | B5 . . A5 | G5 . B5 . | . . E6 .',
        'D6 . . B5 | . . G5 . | E5 . . . | G5 . . .',
        'A5 . . G5 | E5 . . . | C5 . . . | E5 . . .',
        'D#5 . . . | F#5 . . . | B5 . . A5 | F#5 . D#5 .',
        'E5 . . . | G5 . . . | C6 . . B5 | G5 . . .',
        'A5 . . . | F#5 . . D5 | . . E5 . | F#5 . . .',
        'G5 . . F#5 | E5 . . . | B4 . . . | E5 . G5 .',
        'E5 . . . | . . . . | - - C5 . | E5 . G5 .',
        'A5 . . . | C6 . . B5 | A5 . . G5 | E5 . . .',
        'G5 . . . | B5 . . . | E5 . . . | - - - -',
        'F#5 . . . | A5 . . . | D#5 . . . | F#5 . E5 .',
        'D#5 . . . | . . . . | B4 . . . | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]];
        kicks(S, P, t0, [0, 4, 8, 12], 0.9, KICK);
        claps(S, P, t0, [4, 12], 0.62);
        hats(S, P, t0, [0.26, 0.12, 0.2, 0.12], [], { hp: 5200, dec: 0.03 });   // シェイカー寄り
        /* タム: 毎小節 10 に低い一打、4小節ごとに下降のフィル */
        S.ev(S.at(t0, 10) + S.j(), 1, (tt) => tom(S, P.tom, tt, 0.55, { f: 110 }));
        if (i % 4 === 3) [[12, 220], [13, 185], [14, 150], [15, 120]].forEach((x) => {
          const v = S.v(0.7);
          S.ev(S.at(t0, x[0]) + S.j(), 0, (tt) => tom(S, P.tom, tt, v, { f: x[1] }));
        });
        if (i === 0 || i === 8) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, 0.45));
        bassOct(S, P, t0, C, I.rBass);
        pad(S, P, t0, C, I.popPad, 0.45);
        if (i >= 4) {                                                   // 木琴の分散和音（8分）
          const an = C.n.map((m) => m + 12), seq = [0, 2, 1, 2, 0, 2, 1, 3];
          for (let k = 0; k < 8; k++) {
            const m = (seq[k] === 3) ? an[0] + 12 : an[seq[k] % an.length];
            S.note(mallet, P.arp, S.at(t0, k * 2) + S.j(), m, S.t16, S.v(k % 2 ? 0.5 : 0.7), I.mal, 1);
          }
        }
        S.melody(syn, P.lead, t0, this.MM[i], 0.85, I.rLead, 0.8);
        S.melody(mallet, P.lead2, t0, this.MM[i], 0.8, I.mal, 1, 0);
        hype(S, P, t0, i);
      }
    },
    /* ---------------------------------------------------------- S4 深海 */
    sea: {
      name: 'S4 深海', key: 'F# minor', bpm: 108, bars: 16, rel: 9,
      desc: '少し遅め。三角波の丸いリード、コーラスで揺れるパッド、泡のようなアルペジオ。',
      prog: ['F#m', 'D', 'A', 'E', 'F#m', 'D', 'Bm', 'C#', 'D', 'E', 'C#m', 'F#m', 'Bm', 'D', 'E', 'C#'],
      C: { 'F#m': 'F#1 | A3 C#4 F#4', D: 'D2 | A3 D4 F#4', A: 'A1 | A3 C#4 E4', E: 'E2 | G#3 B3 E4', Bm: 'B1 | B3 D4 F#4',
           'C#': 'C#2 | G#3 C#4 F4', 'C#m': 'C#2 | G#3 C#4 E4' },
      fx: { rev: 1.5, dly: 1.1, fb: 0.38, dlp: 2600 },
      parts: {
        lead: { gain: 1.8, rev: 0.4, dly: 0.35, lp: 4500 }, pad: { gain: 1.4, rev: 0.5, duck: 0.5, duckRel: 0.08, lp: 1800 },
        bass: { gain: 1.0, duck: 0.4, duckRel: 0.06, lp: 900 }, arp: { gain: 1.3, rev: 0.45, dly: 0.4, pan: 0.2 },
        kick: { gain: 0.26 }, clap: { gain: 1.2, rev: 0.5, lp: 7000 }, hat: { gain: 1.6, pan: 0.15 },
        fx: { gain: 0.5, rev: 0.5 }
      },
      M: [
        'C#5 . . . | . . A4 . | . . F#4 . | A4 . C#5 .',
        'D5 . . . | . . . . | F#5 . . . | E5 . D5 .',
        'C#5 . . . | . . E5 . | . . . . | A4 . . .',
        'B4 . . . | . . . . | G#4 . . . | - - - -',
        'C#5 . . . | . . E5 . | . . F#5 . | A5 . . .',
        'F#5 . . . | . . E5 . | D5 . . . | A4 . . .',
        'B4 . . . | D5 . . . | F#5 . . . | E5 . D5 .',
        'C#5 . . . | . . . . | G#4 . . . | F4 . . .',
        'A5 . . . | . . F#5 . | . . D5 . | E5 . F#5 .',
        'G#5 . . . | . . E5 . | . . B4 . | - - - -',
        'E5 . . . | . . G#5 . | . . C#6 . | B5 . G#5 .',
        'A5 . . . | . . . . | F#5 . . . | - - - -',
        'D5 . . . | . . F#5 . | . . B5 . | A5 . F#5 .',
        'A5 . . . | . . . . | F#5 . . . | D5 . E5 .',
        'E5 . . . | . . G#5 . | . . B5 . | . . . .',
        'G#5 . . . | . . F5 . | . . C#5 . | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]];
        kicks(S, P, t0, [0, 4, 8, 12], 0.85, { f0: 150, f1: 46, dec: 0.34, click: 0.12 });
        claps(S, P, t0, [4, 12], 0.55);
        hats(S, P, t0, [0.26, 0.12, 0.32, 0.12], [2], { hp: 6500, open: 0.2 });
        if (i === 0 || i === 8) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, 0.3));
        if (i === 15) { const d = S.barDur; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, 0.08)); }
        bassOct(S, P, t0, C, I.sBass, { gate: 1.7 });
        pad(S, P, t0, C, I.sPad, 0.55);
        /* 泡: 和音の音へ下からしゃくり上がる短いサイン（位置は小節ごとにずれる） */
        const an = C.n.map((m) => m + 24), nb = 4 + ((S.rnd() * 3) | 0);
        for (let k = 0; k < nb; k++) {
          const st = (S.rnd() * 16) | 0, m = an[(S.rnd() * an.length) | 0] + (S.rnd() < 0.3 ? 12 : 0);
          S.note(syn, P.arp, S.at(t0, st) + S.j(), m, S.t16 * 0.7, S.v(0.55), Object.assign({ from: m - 7 }, I.bub), 1);
        }
        S.melody(syn, P.lead, t0, this.MM[i], 0.85, I.sLead, 0.95);
        hype(S, P, t0, i);
      }
    },
    /* ---------------------------------------------------------- S5 宇宙ステーション */
    space: {
      name: 'S5 宇宙ステーション', key: 'A major（sus4/add9）', bpm: 116, bars: 16, rel: 9,
      desc: '浮遊感。sus4/add9 の和音、広いリバーブと長いディレイ、音程がすべるリード。',
      prog: ['Asus2', 'Dadd9', 'F#m7', 'Esus4', 'Aadd9', 'Dmaj7', 'Bm7', 'Esus4', 'Dadd9', 'E', 'F#m7', 'Dadd9', 'Bm7', 'Esus4', 'Aadd9', 'Esus4'],
      C: { Asus2: 'A1 | E3 A3 B3 E4', Aadd9: 'A1 | C#4 E4 B4', Dadd9: 'D2 | F#3 A3 E4', 'F#m7': 'F#1 | A3 C#4 E4',
           Esus4: 'E2 | A3 B3 E4', E: 'E2 | G#3 B3 E4', Dmaj7: 'D2 | F#3 A3 C#4', Bm7: 'B1 | A3 D4 F#4' },
      fx: { rev: 2.0, dly: 1.3, fb: 0.45, dlp: 3000 },
      parts: {
        lead: { gain: 1.7, rev: 0.55, dly: 0.45 }, pad: { gain: 1.3, rev: 0.7, duck: 0.5, duckRel: 0.08 },
        bass: { gain: 0.9, duck: 0.45, duckRel: 0.06 }, arp: { gain: 1.3, rev: 0.5, dly: 0.45, pan: -0.2, duck: 0.3 },
        kick: { gain: 0.25 }, clap: { gain: 1.3, rev: 0.6 }, hat: { gain: 1.0, pan: 0.2 }, fx: { gain: 0.6, rev: 0.6 }
      },
      M: [
        'E5 . . . | . . . . | B5 . . . | A5 . . .',
        'F#5 . . . | . . E5 . | . . . . | - - - -',
        'C#5 . . . | . . E5 . | . . A5 . | G#5 . . .',
        'B4 . . . | . . . . | A4 . . . | B4 . . .',
        'E5 . . . | . . . . | C#6 . . . | B5 . . .',
        'A5 . . . | . . F#5 . | . . . . | E5 . . .',
        'D5 . . . | . . F#5 . | . . A5 . | B5 . . .',
        'E6 . . . | . . . . | . . . . | - - - -',
        'F#5 . . . | . . A5 . | E6 . . . | D6 . . .',
        'B5 . . . | . . G#5 . | . . . . | E5 . . .',
        'C#6 . . . | . . . . | A5 . . . | E5 . . .',
        'E5 . . . | . . F#5 . | . . . . | - - - -',
        'D5 . . . | F#5 . . . | B5 . . . | A5 . . .',
        'A5 . . . | . . . . | B5 . . . | E5 . . .',
        'C#6 . . . | . . B5 . | . . . . | E5 . . .',
        'B5 . . . | . . . . | - - - - | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]];
        kicks(S, P, t0, [0, 4, 8, 12], 0.8, { f0: 150, f1: 45, dec: 0.36, click: 0.15 });
        claps(S, P, t0, [4, 12], 0.5);
        hats(S, P, t0, [0.2, 0, 0.3, 0], [2], { open: 0.22 });
        if (i === 0 || i === 8) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, 0.4));
        if (i === 7 || i === 15) { const d = S.barDur; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, 0.09)); }
        bassOct(S, P, t0, C, I.spBass, { gate: 1.7 });
        pad(S, P, t0, C, I.spPad, 0.6);
        if (i >= 4) {                                                   // ゆっくりの8分アルペジオ
          const an = C.n.map((m) => m + 12), seq = [0, 1, 2, 3, 2, 1, 3, 2];
          for (let k = 0; k < 8; k++) {
            S.note(syn, P.arp, S.at(t0, k * 2) + S.j(), an[seq[k] % an.length] + (k >= 4 ? 12 : 0), S.t16 * 1.5,
                   S.v(k % 2 ? 0.45 : 0.6), I.spArp, 1);
          }
        }
        S.melody(syn, P.lead, t0, this.MM[i], 0.85, I.spLead, 0.98, 0, true);
        hype(S, P, t0, i);
      }
    },
    /* ---------------------------------------------------------- S6 鏡の世界 */
    mirror: {
      name: 'S6 鏡の世界', key: 'C# minor', bpm: 124, bars: 16, rel: 4,
      desc: 'きらめくベル系プラック。上下に反行するメロディを左右に振り分け、アルペジオも左右に跳ねる。',
      prog: ['C#m', 'A', 'E', 'B', 'C#m', 'A', 'F#m', 'G#', 'A', 'B', 'G#m', 'C#m', 'F#m', 'A', 'G#', 'G#'],
      C: { 'C#m': 'C#2 | G#3 C#4 E4', A: 'A1 | A3 C#4 E4', E: 'E2 | G#3 B3 E4', B: 'B1 | B3 D#4 F#4',
           'F#m': 'F#1 | A3 C#4 F#4', 'G#m': 'G#1 | G#3 B3 D#4', 'G#': 'G#1 | G#3 C4 D#4' },
      fx: { rev: 1.3, dly: 1.2, fb: 0.36, dlp: 5200 },
      parts: {
        lead: { gain: 1.5, rev: 0.35, dly: 0.3, pan: -0.5 }, lead2: { gain: 1.25, rev: 0.35, dly: 0.3, pan: 0.5 },
        pad: { gain: 1.0, rev: 0.45, duck: 0.6, duckRel: 0.06 }, bass: { gain: 0.9, duck: 0.45, duckRel: 0.05 },
        arpL: { gain: 1.1, rev: 0.25, dly: 0.2, pan: -0.7, duck: 0.35 }, arpR: { gain: 1.1, rev: 0.25, dly: 0.2, pan: 0.7, duck: 0.35 },
        kick: { gain: 0.27 }, clap: { gain: 1.5, rev: 0.3 }, hat: { gain: 1.1 }, fx: { gain: 0.6, rev: 0.35 }
      },
      M: [
        'G#5 . . E5 | . . C#5 . | - - E5 . | G#5 . C#6 .',
        'B5 . . A5 | . . E5 . | . . C#5 . | - - - -',
        'G#5 . . E5 | . . B4 . | - - E5 . | G#5 . B5 .',
        'A5 . . F#5 | . . D#5 . | . . B4 . | - - - -',
        'C#6 . . G#5 | . . E5 . | - - G#5 . | C#6 . E6 .',
        'C#6 . . B5 | . . A5 . | . . E5 . | C#5 . . .',
        'F#5 . . . | A5 . . . | C#6 . . . | A5 . F#5 .',
        'G#5 . . . | . . . . | D#5 . . . | C5 . . .',
        'E5 . . E5 | . . A5 . | . . C#6 . | B5 . A5 .',
        'F#5 . . . | . . D#5 . | . . F#5 . | B5 . . .',
        'D#6 . . B5 | . . G#5 . | . . D#5 . | G#5 . . .',
        'E5 . . . | . . . . | - - - - | - - - -',
        'A5 . . C#6 | . . A5 . | F#5 . . . | C#5 . . .',
        'E5 . . A5 | . . C#6 . | E6 . . . | C#6 . . .',
        'C6 . . . | . . G#5 . | D#5 . . . | . . . .',
        'G#5 . . . | . . . . | - - - - | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]];
        kicks(S, P, t0, [0, 4, 8, 12], 0.9, KICK);
        claps(S, P, t0, [4, 12], 0.65);
        hats(S, P, t0, HV_POP, [2], { hp: 8500 });
        if (i === 0 || i === 8) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, 0.45));
        if (i === 7 || i === 15) { const d = S.barDur; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, 0.1)); }
        bassOct(S, P, t0, C, I.popBass);
        pad(S, P, t0, C, I.popPad, 0.5);
        if (i >= 4) {                                                   // 左右に跳ねるアルペジオ
          const an = C.n.map((m) => m + 24), seq = [0, 2, 1, 2];
          for (let k = 0; k < 16; k++) {
            S.note(syn, (k % 2) ? P.arpR : P.arpL, S.at(t0, k) + S.j(), an[seq[k % 4] % an.length], S.t16 * 0.8,
                   S.v(k % 4 === 0 ? 0.5 : 0.32), I.popArp, 1);
          }
        }
        const mm = this.MM[i], cm = this.CM[i];
        S.melody(fm, P.lead, t0, mm, 0.85, I.bell, 1);                // 左: ベル
        S.melody(syn, P.lead, t0, mm, 0.8, I.mPluck, 0.9);            //     ＋プラックで芯
        S.melody(fm, P.lead2, t0, cm, 0.7, I.bell, 1);                // 右: 鏡に映した反行メロディ
        S.melody(syn, P.lead2, t0, cm, 0.6, I.mPluck, 0.9);
        hype(S, P, t0, i);
      }
    },
    /* ---------------------------------------------------------- S7 コア */
    core: {
      name: 'S7 コア', key: 'D minor → E minor', bpm: 128, bars: 16, rel: 5,
      desc: '最も激しい版。歪んだベース、強いドラム、緊張感のあるマイナー。13小節目から全音上へ転調。',
      prog: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Bb', 'C', 'Dm', 'A', 'Em', 'C', 'D', 'A'],
      C: { Dm: 'D2 | A3 D4 F4', Bb: 'Bb1 | Bb3 D4 F4', C: 'C2 | G3 C4 E4', A: 'A1 | A3 C#4 E4', Gm: 'G1 | G3 Bb3 D4',
           Em: 'E2 | B3 E4 G4', D: 'D2 | A3 D4 F#4' },
      fx: { rev: 0.9, dly: 0.9, fb: 0.3, dlp: 4800 },
      parts: {
        lead: { gain: 1.9, rev: 0.25, dly: 0.3 }, lead2: { gain: 1.2, rev: 0.2, pan: -0.25 },
        pad: { gain: 1.1, rev: 0.3, duck: 0.75, duckRel: 0.06 },
        bass: { gain: 0.75, duck: 0.5, duckRel: 0.05, drive: 5, post: 0.32, lp: 2600 },
        arp: { gain: 1.2, rev: 0.2, dly: 0.2, pan: 0.25, duck: 0.45 },
        kick: { gain: 0.32 }, clap: { gain: 1.8, rev: 0.25 }, hat: { gain: 1.25, pan: 0.15 }, fx: { gain: 0.7, rev: 0.3 }
      },
      M: [
        'D5 . D5 F5 | . . A5 . | G5 . F5 . | E5 . F5 .',
        'D5 . . . | Bb4 . . D5 | . . F5 . | D5 . . .',
        'E5 . E5 G5 | . . C6 . | Bb5 . G5 . | E5 . G5 .',
        'A5 . . . | C#6 . . . | E6 . . . | C#6 . A5 .',
        'D6 . . A5 | . . F5 . | D5 . . F5 | A5 . D6 .',
        'D6 . . . | C6 . Bb5 . | . . F5 . | D5 . . .',
        'G5 . Bb5 . | D6 . . . | Bb5 . G5 . | D5 . . .',
        'E5 . . . | . . C#5 . | . . E5 . | A5 . G5 .',
        'F5 . . . | D5 . F5 . | Bb5 . . . | A5 . F5 .',
        'G5 . . . | E5 . G5 . | C6 . . . | Bb5 . G5 .',
        'A5 . . . | F5 . A5 . | D6 . . . | C6 . A5 .',
        'C#6 . . . | . . . . | E6 . . . | . . . .',
        'E5 . E5 G5 | . . B5 . | A5 . G5 . | F#5 . G5 .',
        'E5 . . . | C5 . . E5 | . . G5 . | E5 . . .',
        'F#5 . F#5 A5 | . . D6 . | C6 . A5 . | F#5 . A5 .',
        'A5 . . . | C#6 . . . | E6 . . . | - - - -'
      ],
      bar(S, i, t0) {
        const P = S.parts, C = this.CH[this.prog[i]];
        const HK = { f0: 185, f1: 50, dec: 0.28, click: 0.42 };
        kicks(S, P, t0, (i % 2) ? [0, 4, 8, 12, 14] : [0, 4, 8, 12], 1.0, HK);
        claps(S, P, t0, [4, 12], 0.85, 0.4);
        hats(S, P, t0, [0.34, 0.16, 0.26, 0.16], [2], { open: 0.1 });
        if (i % 4 === 0) S.ev(t0, 1, (tt) => crash(S, P.fx, tt, i % 8 ? 0.35 : 0.55));
        if (i % 4 === 3) { const d = S.barDur, v = (i === 11) ? 0.16 : 0.1; S.ev(t0, 1, (tt) => riser(S, P.fx, tt, d, v)); }
        if (i === 11) [12, 13, 14, 15].forEach((st, k) => { const v = S.v(0.25 + 0.1 * k); S.ev(S.at(t0, st), 0, (tt) => snare(S, P.clap, tt, v, { hp: 900, dec: 0.1 })); });
        bassOct(S, P, t0, C, I.cBass, { gate: 1.2 });
        for (let k = 0; k < 8; k++) {                                   // 16分の裏で刻む（脈動）
          S.note(syn, P.bass, S.at(t0, k * 2 + 1) + S.j() * 0.4, C.b, S.t16 * 0.7, S.v(0.45), I.cBass, 1);
        }
        pad(S, P, t0, C, I.popPad, 0.5);
        if (i >= 4) arp16(S, P, t0, C, I.popArp, 24, [0, 1, 2, 1, 0, 2, 1, 2], null);
        S.melody(syn, P.lead, t0, this.MM[i], 0.9, I.cLead, 0.85);
        if (i >= 8) S.melody(syn, P.lead2, t0, this.MM[i], 0.5, I.cLead, 0.85, -12);
        hype(S, P, t0, i);
      }
    }
  };
  /* 作風間の音量補正（dB）。test_p9b（OfflineAudioContext で 10秒描画→RMS）で測って揃えた値 */
  const NORM = { white: 0.5, neon: -2.4, ruins: -2.4, sea: -7.2, space: -3.85, mirror: -3.25, core: -7.8 };

  /* 楽譜を読む（書き間違いはここで例外＝読み込み時に見つかる） */
  Object.keys(ZONES).forEach((id) => {
    const Z = ZONES[id];
    Z.id = id;
    Z.norm = NORM[id] || 0;
    Z.CH = {}; Object.keys(Z.C).forEach((k) => { Z.CH[k] = chord(Z.C[k]); });
    Z.MM = Z.M.map(mel);
    if (Z.MM.length !== Z.bars) throw new Error(id + ': 旋律の小節数 ' + Z.MM.length + ' ≠ ' + Z.bars);
    if (Z.prog.length !== Z.bars) throw new Error(id + ': コード進行の小節数');
    Z.prog.forEach((p) => { if (!Z.CH[p]) throw new Error(id + ': 和音がない ' + p); });
    Z.loopSec = Z.bars * 4 * 60 / Z.bpm;
  });
  ZONES.mirror.CM = ZONES.mirror.MM.map((notes, i) => mirrorMel(notes, ZONES.mirror.CH[ZONES.mirror.prog[i]], 78 - 6));

  /* ==========================================================================
     オフライン描画（テスト・診断）: 本番と同じスケジューラを模擬時刻で回す
     opt: {rate, ch, seed, mul, hype, nokick, norm(dB 上書き), count(ノード数を数える), from:{zone, at}(クロスフェード)}
     ========================================================================== */
  const CREATE = ['createGain', 'createOscillator', 'createBiquadFilter', 'createBufferSource', 'createStereoPanner',
                  'createWaveShaper', 'createConvolver', 'createDelay', 'createDynamicsCompressor', 'createAnalyser'];
  function render(id, sec, opt) {
    opt = opt || {};
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const rate = opt.rate || 44100, oc = new OAC(opt.ch || 2, Math.floor(rate * sec), rate);
    const cnt = { n: 0 };
    if (opt.count) CREATE.forEach((k) => {
      if (!oc[k]) return;
      const f = oc[k];
      oc[k] = function () { cnt.n++; return f.apply(oc, arguments); };
    });
    const E = new Engine(oc, oc.destination, { offline: true });
    E.flags.hype = !!opt.hype; E.flags.nokick = !!opt.nokick; E.mul = opt.mul || 1;
    if (opt.maxv) E.MAXV = opt.maxv;
    if (opt.muffleAt) E.muffle(opt.muffleAt);
    let S = E.switchTo(opt.from ? opt.from.zone : id, 0, false, { seed: opt.seed == null ? 12345 : opt.seed });
    if (opt.norm != null) { S.norm = dbToG(opt.norm); S.fade(1, S.nextT, 0.08); }
    const base = cnt.n;
    let switched = !opt.from;
    for (let now = 0; now < sec; now += 0.05) {
      if (!switched && now >= opt.from.at) {
        S = E.switchTo(id, now, true, { seed: 999 });
        if (opt.norm != null) { S.norm = dbToG(opt.norm); }
        switched = true;
        E.xfadeAt = S.nextT; E.xfadeLen = 2 * S.barDur;
      }
      E.pump(now, 0.12);
    }
    const bars = E.sessions.reduce((a, s) => a + s.bar, 0);
    return oc.startRendering().then((buf) => ({ buf: buf, nodes: cnt.n - base, bars: bars, engine: E }));
  }
  /* FFT（帯域比の計算） */
  function fftPow(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  /* RMS(dBFS)・ピーク・帯域比（低 <250Hz／中／高 >4kHz の %）・スペクトル重心 */
  function analyse(buf, from, to) {
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, sr = buf.sampleRate;
    const a0 = Math.max(0, Math.floor((from || 0) * sr)), a1 = Math.min(L.length, to ? Math.floor(to * sr) : L.length);
    let ss = 0, pk = 0;
    for (let i = a0; i < a1; i++) { ss += L[i] * L[i] + R[i] * R[i]; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    const rms = Math.sqrt(ss / (2 * Math.max(1, a1 - a0)));
    const N = 4096, bands = [0, 0, 0], acc = new Float64Array(N / 2);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let s = a0; s + N <= a1; s += N) {
      for (let n = 0; n < N; n++) { const w = 0.5 - 0.5 * Math.cos(TAU * n / (N - 1)); re[n] = (L[s + n] + R[s + n]) * 0.5 * w; im[n] = 0; }
      fftPow(re, im);
      for (let k = 1; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    }
    let tot = 0, cen = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N, p = acc[k];
      if (f < 250) bands[0] += p; else if (f < 4000) bands[1] += p; else bands[2] += p;
      tot += p; cen += p * f;
    }
    return { rms: gToDb(rms), peak: pk, bands: bands.map((b) => b / Math.max(1e-12, tot) * 100), centroid: cen / Math.max(1e-12, tot) };
  }

  /* ==========================================================================
     効果音の部品（2本のデチューン＋フィルタの包絡＋短い振幅の包絡。生のオシレータは鳴らさない）
     ========================================================================== */
  /* SE バス: 素通し＋軽いリバーブ（IR は BGM と共有） */
  function seChain(c, bus, dest) {
    bus.connect(dest);
    try {
      const s = c.createGain(); s.gain.value = 0.22;
      const hp = bq(c, 'highpass', 300, 0.7), cv = c.createConvolver();
      cv.buffer = kit(c).ir;
      bus.connect(s); s.connect(hp); hp.connect(cv); cv.connect(dest);
    } catch (e) { /* リバーブが作れない環境は素通しだけ */ }
    return bus;
  }
  function sePluck(c, out, t, m, o) {
    const ny = c.sampleRate * 0.45, f = Math.min(ny, mtof(m)), dur = o.dur || 0.2, a = o.a || 0.003;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = o.q || 1;
    const cut = Math.min(ny, o.cut || 1200), pk = Math.min(ny, cut + (o.fenv || 3000));
    fl.frequency.setValueAtTime(pk, t); fl.frequency.setTargetAtTime(cut, t + 0.003, (o.fd || 0.08) / 3);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || 0.1, t + a); g.gain.setTargetAtTime(0, t + a, dur / 3.5);
    const end = t + a + dur * 1.6 + 0.05;
    [-1, 1].forEach((s) => {
      const x = c.createOscillator(); x.type = o.type || 'sawtooth';
      x.frequency.setValueAtTime(f, t);
      if (o.to != null) x.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(ny, mtof(o.to))), t + (o.gl || dur));
      x.detune.value = s * (o.det == null ? 7 : o.det);
      x.connect(fl); x.start(t); x.stop(end);
    });
    fl.connect(g);
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(out); }
    else g.connect(out);
    return end;
  }
  function seNoise(c, out, t, o) {
    const src = c.createBufferSource(); src.buffer = kit(c).noise; src.loop = true;
    const ny = c.sampleRate * 0.45;
    const f = c.createBiquadFilter(); f.type = o.ft || 'lowpass';
    f.frequency.setValueAtTime(Math.min(ny, o.f || 1000), t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.min(ny, o.f2), t + o.dur);
    f.Q.value = o.q || 0.7;
    const g = c.createGain(), a = o.a || 0.003, dur = Math.max(o.dur, a + 0.01), v = Math.max(0.0002, o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.hold) g.gain.setValueAtTime(v, t + a + (dur - a) * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, (t * 7.3) % 1.5);
    src.stop(t + dur + 0.05);
    return t + dur + 0.05;
  }
  function seThump(c, out, t, f0, f1, dur, vol, a) {
    const x = c.createOscillator(); x.type = 'sine';
    x.frequency.setValueAtTime(f0, t); x.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + Math.min(dur, 0.12 + dur * 0.3));
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (a || 0.004)); g.gain.setTargetAtTime(0, t + (a || 0.004), dur / 3);
    x.connect(g); g.connect(out); x.start(t); x.stop(t + dur * 1.5 + 0.05);
    return t + dur * 1.5;
  }
  function seBell(c, out, t, m, dur, vol, pan) {
    const ny = c.sampleRate * 0.45, f = Math.min(ny, mtof(m));
    const x = c.createOscillator(); x.type = 'sine'; x.frequency.value = f;
    const md = c.createOscillator(); md.type = 'sine'; md.frequency.value = Math.min(ny, f * 3.5);
    const mg = c.createGain(); mg.gain.setValueAtTime(f * 1.1, t); mg.gain.setTargetAtTime(f * 0.05, t, 0.12);
    md.connect(mg); mg.connect(x.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, dur / 3.5);
    x.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); }
    else g.connect(out);
    x.start(t); md.start(t); x.stop(t + dur * 1.3); md.stop(t + dur * 1.3);
    return t + dur * 1.3;
  }

  return {
    Engine: Engine, Session: Session, ZONES: ZONES, NORM: NORM, I: I,
    render: render, analyse: analyse, kit: kit, seChain: seChain,
    sePluck: sePluck, seNoise: seNoise, seThump: seThump, seBell: seBell,
    mtof: mtof, dbToG: dbToG, gToDb: gToDb, mel: mel, chord: chord, mirrorMel: mirrorMel
  };
})();
Audio.ZONES = Audio.Mus.ZONES;
/* 互換の窓口（旧 API 名）: ノイズの1音 */
Audio.noise = function (c, out, t, o) { return Audio.Mus.seNoise(c, out, t, o); };
