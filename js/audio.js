/* ============================================================================
   DUO RUN — audio.js  音（BGM・効果音）をすべて WebAudio で合成する（契約 §3 / §6 P6）
   ・音源ファイルは使わない。オシレーター・ノイズ・フィルタ・エンベロープだけで作る。
   ・BGM はゾーンごとに雰囲気の違う 8小節ループを 16分音符のシーケンサで鳴らす。
     速度に応じてテンポ +0〜20%。
       ネオン = シンセベース＋アルペジオ ／ 遺跡 = 太鼓＋笛 ／ 深海 = パッド＋泡
       宇宙 = ドローン＋ビープ ／ 鏡 = ベル＋ハーモニクス ／ コア = 脈動ベース＋ノイズ
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
  /* 監査用の数え（play が呼ばれた回数・実際に鳴らした回数・名前ごと） */
  stats: { calls: 0, voiced: 0, byName: {} },
  last: null,
  /* テスト用: undefined = 本物、null = AudioContext の無い環境、関数 = 偽物のクラス */
  _acOverride: undefined,
  _hiddenOverride: undefined,
  _timers: [],

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
    /* BGM のシーケンサ（先読みして予約する） */
    Audio._timers.push(setInterval(Audio.tick, 40));
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
        Audio.comp.threshold.value = -14; Audio.comp.knee.value = 12;
        Audio.comp.ratio.value = 4; Audio.comp.attack.value = 0.004; Audio.comp.release.value = 0.2;
        Audio.master = c.createGain();
        Audio.bgmBus = c.createGain();
        Audio.seBus = c.createGain();
        Audio.bgmBus.connect(Audio.master);
        Audio.seBus.connect(Audio.master);
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
      Audio.seBus.gain.setTargetAtTime(Audio.settings.se * 0.9, now, 0.03);
      Audio.bgmBus.gain.setTargetAtTime(Audio.settings.bgm * 0.5 * Audio.bgm.level, now, 0.25);
    } catch (e) { return false; }
    return true;
  },

  /* ==========================================================================
     合成の部品（ctx と出口を受け取る＝本番もオフライン描画のテストも同じ関数）
     ========================================================================== */
  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  hash(n, salt) {
    let x = (n * 374761393 + (salt | 0) * 668265263) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  },
  _noise: null,
  noiseBuf(c) {
    if (Audio._noise && Audio._noise.c === c) return Audio._noise.b;
    const len = Math.floor((c.sampleRate || 44100) * 1.5);
    const b = c.createBuffer(1, len, c.sampleRate || 44100);
    const d = b.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
    Audio._noise = { c: c, b: b };
    return b;
  },
  /* 1音: {type, f, f2(ピッチの行き先), glide, dur, vol, a(立ち上がり), hold(0..1 持続の割合),
           lp/lp2(フィルタの始点/終点), ft(フィルタ型), q, detune, vib:[Hz, 深さHz]} */
  tone(c, out, t, o) {
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    /* ナイキスト周波数を超える指定はしない（警告を出さない・折り返しを作らない） */
    const ny = (c.sampleRate || 44100) * 0.45;
    osc.frequency.setValueAtTime(U.clamp(o.f, 1, ny), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(U.clamp(o.f2, 1, ny), t + (o.glide || o.dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const g = c.createGain();
    const a = o.a || 0.004, dur = Math.max(o.dur, a + 0.01), v = Math.max(0.0002, o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.hold) g.gain.setValueAtTime(v, t + a + (dur - a) * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = o.ft || 'lowpass';
      f.frequency.setValueAtTime(U.clamp(o.lp, 20, ny), t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(U.clamp(o.lp2, 20, ny), t + dur);
      f.Q.setValueAtTime(o.q || 0.8, t);
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    if (o.vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.setValueAtTime(o.vib[0], t);
      lg.gain.setValueAtTime(o.vib[1], t);
      l.connect(lg); lg.connect(osc.frequency);
      l.start(t); l.stop(t + dur + 0.05);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  },
  /* ノイズ: {dur, vol, a, hold, f, f2, ft, q} */
  noise(c, out, t, o) {
    const src = c.createBufferSource();
    src.buffer = Audio.noiseBuf(c);
    const f = c.createBiquadFilter();
    f.type = o.ft || 'lowpass';
    const ny = (c.sampleRate || 44100) * 0.45;
    f.frequency.setValueAtTime(U.clamp(o.f || 1000, 20, ny), t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(U.clamp(o.f2, 20, ny), t + o.dur);
    f.Q.setValueAtTime(o.q || 0.7, t);
    const g = c.createGain();
    const a = o.a || 0.003, dur = Math.max(o.dur, a + 0.01), v = Math.max(0.0002, o.vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.hold) g.gain.setValueAtTime(v, t + a + (dur - a) * o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, (o.off || 0) % 1.0);
    src.stop(t + dur + 0.05);
    return src;
  },
  /* ベル（非整数倍音の和）: 鏡・チャイムに使う */
  bell(c, out, t, f, dur, vol) {
    const ny = (c.sampleRate || 44100) * 0.45;
    [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach((p, i) => {
      if (f * p[0] > ny) return;
      Audio.tone(c, out, t, { type: 'sine', f: f * p[0], dur: dur * (1 - i * 0.18), vol: vol * p[1], a: 0.002 });
    });
  },
  kick(c, out, t, vol) {
    Audio.tone(c, out, t, { type: 'sine', f: 150, f2: 42, glide: 0.12, dur: 0.28, vol: vol });
    Audio.noise(c, out, t, { dur: 0.02, vol: vol * 0.25, f: 3000, ft: 'highpass' });
  },

  /* ==========================================================================
     効果音（名前 → 合成）。o.who は 'lumen' | 'umbra'（UMBRA は少し低く・柔らかく）
     ========================================================================== */
  SE: {
    jump(c, out, t, o) {
      const k = (o.who === 'umbra') ? 0.75 : 1;
      Audio.tone(c, out, t, { type: (o.who === 'umbra') ? 'triangle' : 'square', f: 330 * k, f2: 780 * k,
                              glide: 0.11, dur: 0.16, vol: 0.13, lp: 2600 });
    },
    slide(c, out, t, o) {
      Audio.noise(c, out, t, { dur: 0.24, vol: 0.2, f: 2200, f2: 420, ft: 'bandpass', q: 1.4, off: 0.3 });
    },
    lane(c, out, t, o) {
      Audio.noise(c, out, t, { dur: 0.09, vol: 0.12, f: 1400, f2: 4200, ft: 'bandpass', q: 1.1, off: 0.6 });
      Audio.tone(c, out, t, { type: 'sine', f: (o.who === 'umbra') ? 620 : 880, dur: 0.05, vol: 0.05 });
    },
    land(c, out, t, o) {
      Audio.tone(c, out, t, { type: 'sine', f: 150, f2: 58, glide: 0.08, dur: 0.12, vol: 0.2 });
      Audio.noise(c, out, t, { dur: 0.05, vol: 0.06, f: 900, off: 0.8 });
    },
    hit(c, out, t, o) {
      Audio.noise(c, out, t, { dur: 0.55, vol: 0.5, f: 2400, f2: 160, off: 0.1 });
      Audio.tone(c, out, t, { type: 'sawtooth', f: 190, f2: 38, glide: 0.45, dur: 0.5, vol: 0.28, lp: 1400, lp2: 200 });
    },
    checkpoint(c, out, t, o) {
      Audio.bell(c, out, t, 880, 0.6, 0.12);
      Audio.bell(c, out, t + 0.11, 1320, 0.8, 0.12);
    },
    goal(c, out, t, o) {
      [72, 76, 79, 84].forEach((m, i) => {
        Audio.tone(c, out, t + i * 0.1, { type: 'triangle', f: Audio.mtof(m), dur: 0.5 + i * 0.12, vol: 0.14 });
      });
      Audio.bell(c, out, t + 0.4, Audio.mtof(96), 1.2, 0.08);
    },
    gate(c, out, t, o) {           // エンドレスの光のゲート
      Audio.tone(c, out, t, { type: 'sine', f: 420, f2: 1680, glide: 0.35, dur: 0.5, vol: 0.12 });
      Audio.noise(c, out, t, { dur: 0.6, vol: 0.08, f: 5000, ft: 'highpass', a: 0.08, off: 0.2 });
      Audio.bell(c, out, t + 0.18, 1760, 0.9, 0.06);
    },
    gate_grav(c, out, t, o) {      // 重力反転ワープ
      Audio.tone(c, out, t, { type: 'sawtooth', f: 520, f2: 130, glide: 0.2, dur: 0.24, vol: 0.12, lp: 1800 });
      Audio.tone(c, out, t + 0.2, { type: 'sawtooth', f: 130, f2: 620, glide: 0.2, dur: 0.26, vol: 0.12, lp: 1800 });
    },
    gate_swap(c, out, t, o) {      // 入れ替えワープ
      Audio.tone(c, out, t, { type: 'square', f: 480, f2: 820, glide: 0.18, dur: 0.22, vol: 0.07, lp: 2400 });
      Audio.tone(c, out, t, { type: 'square', f: 820, f2: 480, glide: 0.18, dur: 0.22, vol: 0.07, lp: 2400 });
    },
    gate_mirror(c, out, t, o) {    // 鏡ゾーン
      Audio.bell(c, out, t, 1245, 0.9, 0.11);
      Audio.tone(c, out, t, { type: 'sine', f: 2490, dur: 0.6, vol: 0.04, a: 0.1 });
    },
    gate_merge(c, out, t, o) {     // 合体区間
      [60, 64, 67].forEach((m) => Audio.tone(c, out, t, { type: 'triangle', f: Audio.mtof(m), f2: Audio.mtof(m + 12),
                                                             glide: 0.3, dur: 0.5, vol: 0.08 }));
    },
    boost(c, out, t, o) {
      Audio.tone(c, out, t, { type: 'sawtooth', f: 220, f2: 1500, glide: 0.3, dur: 0.38, vol: 0.12, lp: 900, lp2: 5000 });
      Audio.bell(c, out, t + 0.2, 2093, 0.5, 0.05);
    },
    warn(c, out, t, o) {           // 大演出の予告
      [0, 0.16, 0.36, 0.52].forEach((d, i) => {
        Audio.tone(c, out, t + d, { type: 'square', f: (i % 2) ? 660 : 880, dur: 0.13, vol: 0.07, lp: 3000 });
      });
    },
    rumble(c, out, t, o) {         // 崩落の轟音（ノイズ＋ローパス）
      Audio.noise(c, out, t, { dur: 2.4, vol: 0.55, f: 260, f2: 90, a: 0.25, hold: 0.4 });
      Audio.tone(c, out, t, { type: 'sine', f: 46, f2: 32, dur: 2.2, vol: 0.3, a: 0.3, hold: 0.4 });
    },
    boom(c, out, t, o) {           // 爆発（ノイズ＋ローパスの掃引）
      Audio.noise(c, out, t, { dur: 1.6, vol: 0.7, f: 3200, f2: 110, a: 0.005 });
      Audio.tone(c, out, t, { type: 'sine', f: 70, f2: 28, glide: 1.0, dur: 1.4, vol: 0.45 });
    },
    rock(c, out, t, o) {           // 転がる丸岩（契約§4.5 新・遺跡 / P7b）: 石が転がる低いごろごろ
      for (let i = 0; i < 7; i++) {
        Audio.noise(c, out, t + i * 0.13, { dur: 0.16, vol: 0.28 - i * 0.02, f: 320, f2: 140, a: 0.01, off: 0.1 + i * 0.07 });
      }
      Audio.tone(c, out, t, { type: 'sine', f: 64, f2: 44, dur: 1.0, vol: 0.22, a: 0.08, hold: 0.5 });
    },
    glass(c, out, t, o) {          // 鏡が砕ける
      Audio.noise(c, out, t, { dur: 0.8, vol: 0.28, f: 4500, ft: 'highpass', off: 0.5 });
      [2100, 2830, 3520].forEach((f, i) => Audio.bell(c, out, t + i * 0.05, f, 0.6, 0.04));
    },
    ui(c, out, t, o) {
      Audio.tone(c, out, t, { type: 'sine', f: 1200, dur: 0.05, vol: 0.06 });
    }
  },
  SE_NAMES() { return Object.keys(Audio.SE); },

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
      fn(c, Audio.seBus, t, o || {});
      Audio.stats.voiced++;
      return true;
    } catch (e) { return false; }
  },

  /* ==========================================================================
     BGM（ゾーンごとの 8小節ループ・16分音符のシーケンサ）
     ========================================================================== */
  BARS: 8,
  ZONES: {
    neon:   { bpm: 116, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
    ruins:  { bpm: 94,  chords: [[50, 53, 57], [48, 52, 55], [50, 53, 57], [45, 48, 52]],
              scale: [62, 65, 67, 69, 72, 74, 77, 79] },
    sea:    { bpm: 70,  chords: [[51, 55, 58, 62], [48, 51, 55, 58], [44, 48, 51, 55], [46, 50, 53, 58]] },
    space:  { bpm: 84,  chords: [[48, 55, 62], [50, 55, 62], [48, 55, 64], [46, 53, 62]] },
    mirror: { bpm: 100, chords: [[54, 57, 61], [50, 54, 57], [57, 61, 64], [52, 56, 59]] },
    core:   { bpm: 128, chords: [[52, 55, 59], [53, 57, 60], [52, 55, 59], [50, 54, 57]] }
  },
  /* 1ステップ（16分音符）ぶんを予約する。step は 0..127（8小節）。sd = 1ステップの秒数 */
  PATTERN: {
    neon(c, out, t, step, sd, Z) {
      const s = step % 16, bar = (step / 16) | 0, ch = Z.chords[(bar >> 1) % 4];
      if (s % 4 === 0) Audio.kick(c, out, t, 0.42);
      if (s % 2 === 1) Audio.noise(c, out, t, { dur: 0.04, vol: 0.05, f: 7000, ft: 'highpass', off: s * 0.05 });
      if (s === 4 || s === 12) Audio.noise(c, out, t, { dur: 0.16, vol: 0.12, f: 1800, ft: 'bandpass', q: 0.9, off: 0.4 });
      if (s % 2 === 0) {
        Audio.tone(c, out, t, { type: 'sawtooth', f: Audio.mtof(ch[0] - 24 + ((s === 6 || s === 14) ? 12 : 0)),
                                dur: sd * 1.7, vol: 0.2, lp: 900, lp2: 220, q: 4 });
      }
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      const up = (bar >= 4 && (s % 8) >= 4) ? 12 : 0;
      Audio.tone(c, out, t, { type: 'square', f: Audio.mtof(ch[arp[s % 8]] + 12 + up), dur: sd * 0.85,
                              vol: 0.045, lp: 2800 });
    },
    ruins(c, out, t, step, sd, Z) {
      const s = step % 16, bar = (step / 16) | 0, ch = Z.chords[(bar >> 1) % 4];
      /* 太鼓（低・高）と、乾いた鈴 */
      if (s === 0 || s === 6 || s === 10) Audio.tone(c, out, t, { type: 'sine', f: 110, f2: 62, glide: 0.2, dur: 0.34, vol: 0.4 });
      if (s === 3 || s === 8 || s === 14) Audio.tone(c, out, t, { type: 'sine', f: 190, f2: 120, glide: 0.12, dur: 0.2, vol: 0.24 });
      if (s % 2 === 1) Audio.noise(c, out, t, { dur: 0.05, vol: 0.035, f: 5200, ft: 'bandpass', q: 2, off: s * 0.03 });
      /* 持続する低い唸り */
      if (s === 0 && bar % 2 === 0) Audio.tone(c, out, t, { type: 'triangle', f: Audio.mtof(ch[0] - 12), dur: sd * 32,
                                                             vol: 0.08, a: 0.4, hold: 0.6 });
      /* 笛（三角波＋ビブラート）: 5音音階から決まった順で */
      if (s % 4 === 0 && Audio.hash(step, 7) < 0.72) {
        const sc = Z.scale, n = sc[Math.floor(Audio.hash(step, 3) * sc.length)];
        Audio.tone(c, out, t, { type: 'triangle', f: Audio.mtof(n), dur: sd * 3.6, vol: 0.09, a: 0.06, hold: 0.5,
                                vib: [5.2, 5] });
      }
    },
    sea(c, out, t, step, sd, Z) {
      const s = step % 16, bar = (step / 16) | 0, ch = Z.chords[(bar >> 1) % 4];
      /* パッド（ずらした鋸波を暗いフィルタで） */
      if (s === 0 && bar % 2 === 0) {
        ch.forEach((m, i) => {
          [-7, 7].forEach((dt) => Audio.tone(c, out, t, { type: 'sawtooth', f: Audio.mtof(m), detune: dt, dur: sd * 32,
                                                           vol: 0.035, a: 1.2, hold: 0.55, lp: 700 + i * 60 }));
        });
      }
      if (s === 0 || s === 8) Audio.tone(c, out, t, { type: 'sine', f: Audio.mtof(ch[0] - 24), dur: sd * 7, vol: 0.14, a: 0.2 });
      /* 泡（上がっていく短い音） */
      if (Audio.hash(step, 11) < 0.28) {
        const f = 300 + Audio.hash(step, 13) * 500;
        Audio.tone(c, out, t + sd * Audio.hash(step, 17) * 0.5, { type: 'sine', f: f, f2: f * 2.6, glide: 0.07,
                                                                     dur: 0.09, vol: 0.05 });
      }
    },
    space(c, out, t, step, sd, Z) {
      const s = step % 16, bar = (step / 16) | 0, ch = Z.chords[(bar >> 1) % 4];
      /* ドローン（根音と5度・4小節） */
      if (s === 0 && bar % 4 === 0) {
        Audio.tone(c, out, t, { type: 'sine', f: Audio.mtof(ch[0] - 24), dur: sd * 64, vol: 0.2, a: 1.5, hold: 0.7 });
        Audio.tone(c, out, t, { type: 'triangle', f: Audio.mtof(ch[0] - 17), dur: sd * 64, vol: 0.06, a: 2.0, hold: 0.6 });
      }
      if (s === 0 && bar % 2 === 1) {
        Audio.tone(c, out, t, { type: 'sawtooth', f: Audio.mtof(ch[1] - 12), dur: sd * 30, vol: 0.03, a: 1.4, hold: 0.5, lp: 600 });
      }
      /* ビープ（計器の電子音） */
      if (Audio.hash(step, 21) < 0.3) {
        const n = ch[Math.floor(Audio.hash(step, 23) * ch.length)] + 24;
        Audio.tone(c, out, t, { type: (Audio.hash(step, 29) < 0.5) ? 'sine' : 'square', f: Audio.mtof(n),
                                dur: sd * 0.6, vol: 0.035, lp: 3500 });
      }
      if (s % 4 === 2) Audio.noise(c, out, t, { dur: 0.03, vol: 0.02, f: 8000, ft: 'highpass', off: 0.9 });
    },
    mirror(c, out, t, step, sd, Z) {
      const s = step % 16, bar = (step / 16) | 0, ch = Z.chords[(bar >> 1) % 4];
      /* ベル（3連の揺らぎ） */
      if (s % 3 === 0) {
        const n = ch[Math.floor(Audio.hash(step, 31) * ch.length)] + 12 + ((Audio.hash(step, 37) < 0.3) ? 12 : 0);
        Audio.bell(c, out, t, Audio.mtof(n), 1.1, 0.07);
      }
      /* ハーモニクス（倍音だけの薄いパッド） */
      if (s === 0 && bar % 2 === 0) {
        ch.forEach((m) => Audio.tone(c, out, t, { type: 'sine', f: Audio.mtof(m + 24), dur: sd * 32, vol: 0.022, a: 1.0, hold: 0.6 }));
        Audio.tone(c, out, t, { type: 'sine', f: Audio.mtof(ch[0] - 12), dur: sd * 32, vol: 0.1, a: 0.6, hold: 0.6 });
      }
      if (s === 0 || s === 10) Audio.kick(c, out, t, 0.18);
    },
    core(c, out, t, step, sd, Z) {
      const s = step % 16, bar = (step / 16) | 0, ch = Z.chords[(bar >> 1) % 4];
      if (s % 4 === 0 || s === 10) Audio.kick(c, out, t, 0.5);
      /* 脈動ベース（16分で刻み、裏拍を強く） */
      Audio.tone(c, out, t, { type: 'sawtooth', f: Audio.mtof(ch[0] - 24), dur: sd * 0.9,
                              vol: (s % 2) ? 0.2 : 0.1, lp: (s % 2) ? 1100 : 500, lp2: 180, q: 6 });
      /* ノイズ（スネア代わりの噴き出し・4小節目は上昇） */
      if (s === 4 || s === 12) Audio.noise(c, out, t, { dur: 0.2, vol: 0.16, f: 5200, f2: 900, ft: 'bandpass', q: 0.8, off: 0.2 });
      if (bar % 4 === 3 && s >= 8) Audio.noise(c, out, t, { dur: sd, vol: 0.02 + 0.012 * (s - 8), f: 800 + (s - 8) * 700, ft: 'highpass', off: 0.7 });
      if (bar % 2 === 1 && (s === 0 || s === 6 || s === 12)) {
        ch.forEach((m) => Audio.tone(c, out, t, { type: 'square', f: Audio.mtof(m + 12), dur: sd * 1.2, vol: 0.03, lp: 2400 }));
      }
    }
  },
  /* ゾーンの1ステップを ctx/出口へ（本番の予約・オフライン描画のテストが共用） */
  scheduleStep(c, out, zone, step, t, sd) {
    const Z = Audio.ZONES[zone] || Audio.ZONES.neon;
    const fn = Audio.PATTERN[zone] || Audio.PATTERN.neon;
    fn(c, out, t, step % (Audio.BARS * 16), sd, Z);
  },
  /* ステップの秒数（テンポは速度に応じて +0〜20%） */
  stepDur(zone, tempoMul) {
    const Z = Audio.ZONES[zone] || Audio.ZONES.neon;
    return 60 / (Z.bpm * (tempoMul || 1)) / 4;
  },
  tempoFor(speed) {
    return 1 + 0.2 * U.clamp(((speed || CFG.SPEED_MIN) - CFG.SPEED_MIN) / (CFG.SPEED_MAX - CFG.SPEED_MIN), 0, 1);
  },

  bgm: { zone: 'neon', step: 0, nextT: 0, tempo: 1, level: 0.55, on: true },
  /* 毎フレーム（Game.render から）: 今のゾーン・速度・場面をシーケンサへ渡すだけ */
  update(game) {
    const B = Audio.bgm;
    const z = (typeof Zones !== 'undefined' && Zones.id()) ? Zones.id() : 'neon';
    if (z !== B.zone) { B.zone = z; B.step = 0; }
    const st = game ? game.status : 'idle';
    B.tempo = (st === 'playing' || st === 'dying') ? Audio.tempoFor(game.speed) : 1;
    const lv = (st === 'playing' || st === 'goal' || st === 'allclear') ? 1
             : (st === 'dying') ? 0.6 : (st === 'idle') ? 0.55 : 0.32;
    if (Math.abs(lv - B.level) > 1e-3) { B.level = lv; Audio.applySettings(); }
    return B;
  },
  /* 先読み予約（setInterval 40ms）。running でなければ何もしない */
  tick() {
    const c = Audio.ctx, B = Audio.bgm;
    if (!c || c.state !== 'running' || !Audio.bgmBus || !B.on) return 0;
    if (Audio.settings.mute || Audio.settings.bgm <= 0) { B.nextT = 0; return 0; }
    const now = c.currentTime;
    /* 止まっていた（隠れていた）後は今から数え直す（溜まった分を一気に鳴らさない） */
    if (!B.nextT || B.nextT < now - 0.05) B.nextT = now + 0.06;
    let n = 0;
    try {
      while (B.nextT < now + 0.22 && n < 16) {
        const sd = Audio.stepDur(B.zone, B.tempo);
        Audio.scheduleStep(c, Audio.bgmBus, B.zone, B.step, B.nextT, sd);
        B.nextT += sd;
        B.step = (B.step + 1) % (Audio.BARS * 16);
        n++;
      }
    } catch (e) { return n; }
    return n;
  },

  /* オフラインで鳴らして音量を測る（機械テスト用・Promise）。kind='se'|'bgm' */
  renderOffline(kind, name, sec) {
    const OAC = (typeof window !== 'undefined') ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
    if (!OAC) return Promise.resolve(null);
    const rate = 22050, len = Math.floor(rate * (sec || 1));
    const c = new OAC(1, len, rate);
    const out = c.createGain();
    out.connect(c.destination);
    if (kind === 'se') Audio.SE[name](c, out, 0.01, { who: 'lumen' });
    else {
      const sd = Audio.stepDur(name, 1);
      for (let i = 0, t = 0.01; t < (sec || 1) - 0.05; i++, t += sd) Audio.scheduleStep(c, out, name, i, t, sd);
    }
    return c.startRendering().then(function (buf) {
      const d = buf.getChannelData(0);
      let sum = 0, peak = 0;
      for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
      if (Audio._noise && Audio._noise.c === c) Audio._noise = null;
      return { rms: Math.sqrt(sum / d.length), peak: peak };
    });
  }
};
