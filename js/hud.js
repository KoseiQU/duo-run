/* ============================================================================
   DUO RUN — hud.js  HUD（距離・速度・左右の手アイコン）と画面遷移（§4.8）
   画面: タイトル → モード選択 → ステージ選択 → プレイ → リザルト
   ・操作できる要素にはすべて data-ui を付ける（監査・機械テストがここを叩く）。
   ・保存は localStorage `duorun.*`（クリア済みステージ・ベスト距離）。
   ============================================================================ */
'use strict';

const HUD = {
  el: {},
  _last: {},
  init() {
    const ids = ['hud-dist', 'hud-speed', 'hud-stage', 'hand-left', 'hand-right',
                 'hand-left-name', 'hand-right-name', 'hand-left-keys', 'hand-right-keys',
                 'flag-mirror', 'flag-swap', 'flag-grav', 'flag-zero', 'flag-merge',
                 'dead-dist', 'dead-cp', 'dead-best',
                 'clear-dist', 'clear-best', 'title-best', 'cue', 'cue-main', 'cue-sub',
                 'sync', 'sync-main', 'sync-sub'];
    ids.forEach((id) => { HUD.el[id] = document.getElementById(id); });
    HUD.cueHide();
    HUD.syncState = 'x';
    HUD.syncCue(null);
  },

  /* 大演出の予告（§4.4 大ジャンプの「JUMP!」）。2体に被らない位置は CSS 側で担保 */
  cue(main, sub, where) {
    const e = HUD.el.cue || document.getElementById('cue');
    if (!e) return false;
    if (HUD.el['cue-main']) HUD.el['cue-main'].textContent = main;
    if (HUD.el['cue-sub']) HUD.el['cue-sub'].textContent = sub || '';
    /* DUO体は画面の中央を飛ぶので、大ジャンプの合図だけ上へ逃がす（§4.5 改訂） */
    e.classList.toggle('high', where === 'high');
    e.classList.add('on');
    HUD.cueOn = main;
    return true;
  },
  cueHide() {
    const e = HUD.el.cue || document.getElementById('cue');
    if (e) e.classList.remove('on');
    HUD.cueOn = null;
  },
  /* 自由飛行（大ジャンプの滑空 / 契約§4.5 改訂）: 上下の枠と分割線を消す。
     着地で必ず戻す（Setpieces.landing / Setpieces.reset が呼ぶ）。 */
  free: false,
  freeFlight(on) {
    HUD.free = !!on;
    const e = document.getElementById('touchzones');
    if (e) e.classList.toggle('free', HUD.free);
    return HUD.free;
  },
  /* 同時スイッチ（契約§4.5 / S4）の予告と成否（P3b）。
     'cue' … これから踏む（SYNC!） / 'ok' … 橋が架かった / 'miss' … 迂回しろ / null … 消す */
  SYNC_TEXT: { cue: ['SYNC!', '2人同時にパッドを踏め'],
               ok:  ['BRIDGE', '橋が架かった'],
               miss:['MISS', '細い足場へ迂回しろ'] },
  syncState: null,
  syncCue(state) {
    const e = HUD.el.sync || (HUD.el.sync = document.getElementById('sync'));
    if (!e) return false;
    if (HUD.syncState === state) return true;
    HUD.syncState = state || null;
    const txt = HUD.SYNC_TEXT[state];
    e.classList.toggle('on', !!txt);
    e.classList.toggle('ok', state === 'ok');
    e.classList.toggle('miss', state === 'miss');
    if (txt) {
      const m = HUD.el['sync-main'] || (HUD.el['sync-main'] = document.getElementById('sync-main'));
      const s = HUD.el['sync-sub'] || (HUD.el['sync-sub'] = document.getElementById('sync-sub'));
      if (m) m.textContent = txt[0];
      if (s) s.textContent = txt[1];
    }
    return true;
  },

  /* 崩れる橋（契約§4.5【改訂 v2】/ P7b）: 踏んだ瞬間から崩落まで、大きな赤い警告
     「崩れる！離れろ」。st = { left: 崩落までの秒, surface: 'floor'|'ceil' } / null で消す。
     床の橋は画面の下寄り・天井の橋は上寄り（踏んだキャラの側）に出し、帯が崩落まで縮む。 */
  bridgeState: null,
  bridgeCue(st) {
    const e = HUD.el['bridge-cue'] || (HUD.el['bridge-cue'] = document.getElementById('bridge-cue'));
    if (!e) return false;
    const tz = document.getElementById('touchzones');
    const on = !!st;
    if (!on) {
      if (HUD.bridgeState !== null) {
        e.classList.remove('on');
        if (tz) { tz.classList.remove('brg-floor'); tz.classList.remove('brg-ceil'); }
        HUD.bridgeState = null;
      }
      return true;
    }
    if (HUD.bridgeState === null) e.classList.add('on');
    /* 文字はキャラの居る側（面）に、赤く脈打つ枠は **そのキャラを動かす半分**
       （入れ替えワープ中は逆の半分 / Game.runnerForZone が唯一の出所）に出す */
    const side = (st.surface === 'ceil') ? 'ceil' : 'floor';
    const zone = st.zone || (side === 'ceil' ? 'top' : 'bottom');
    /* キャラが左寄り（レーン -1）なら右の脇へ、それ以外は左の脇へ */
    const sx = (st.lane !== undefined && st.lane < 0) ? 'r' : 'l';
    const key = side + '|' + zone + '|' + sx;
    if (HUD.bridgeState !== key) {
      e.classList.toggle('ceil', side === 'ceil');
      e.classList.toggle('side-r', sx === 'r');
      if (tz) { tz.classList.toggle('brg-floor', zone === 'bottom'); tz.classList.toggle('brg-ceil', zone === 'top'); }
      HUD.bridgeState = key;
    }
    const bar = HUD.el['bridge-bar'] || (HUD.el['bridge-bar'] = document.getElementById('bridge-bar'));
    if (bar) bar.style.transform = 'scaleX(' + U.clamp(st.left / CFG.BRIDGE.WARN_T, 0, 1).toFixed(3) + ')';
    return true;
  },

  /* 鏡ゾーン（契約§4.5【表示改訂】/ P7b）: 左右が反転しているキャラを **いま動かしている半分**
     （上/下）の枠を縞模様にし「←→ 逆」を出す。入れ替えワープ中でも Game.runnerForZone が
     唯一の出所なので、画面の位置と反転している手が必ず一致する。出口（mirrored が戻る）で消える。 */
  mirrorState: '',
  mirrorZones(g) {
    let st = '';
    if (g && !g.merged && g.runnerForZone && g.status !== 'allclear') {
      ['top', 'bottom'].forEach((z) => {
        const r = g.runnerForZone(z);
        if (r && r.mirrored) st += (st ? ' ' : '') + z;
      });
    }
    if (st === HUD.mirrorState) return st;
    HUD.mirrorState = st;
    const tz = document.getElementById('touchzones');
    if (tz) {
      tz.classList.toggle('mir-top', st.indexOf('top') >= 0);
      tz.classList.toggle('mir-bottom', st.indexOf('bottom') >= 0);
    }
    return st;
  },

  /* 合体区間（契約§4.5 / S8）: 1体になっている間だけ表示する。
     チップの案内も「両手で1体を動かす」割当に差し替える（§4.5 を上下タッチで読んだ形）。 */
  mergeCue(on) {
    const e = HUD.el['flag-merge'] || (HUD.el['flag-merge'] = document.getElementById('flag-merge'));
    if (e) e.style.display = on ? '' : 'none';
    return !!on;
  },

  /* 重力反転ワープ（契約§4.5 / S6）: 面が入れ替わっている間だけ表示する。
     手アイコンは surface から引いているので、表示そのものは勝手に入れ替わる。 */
  gravCue(on) {
    const e = HUD.el['flag-grav'] || (HUD.el['flag-grav'] = document.getElementById('flag-grav'));
    if (!e) return false;
    e.style.display = on ? '' : 'none';
    return !!on;
  },

  _set(id, txt) {
    if (HUD._last[id] === txt) return;
    HUD._last[id] = txt;
    const e = HUD.el[id];
    if (e) e.textContent = txt;
  },
  update(g) {
    HUD._set('hud-dist', Math.floor(g.dist) + ' m');
    HUD._set('hud-speed', g.speed.toFixed(1) + ' m/s');
    /* エンドレスは今のゾーン名も出す（1000m ごとに切り替わる / §4.4 P6） */
    HUD._set('hud-stage', g.stage
      ? (g.stage.endless && typeof Endless !== 'undefined' && Zones.id()
         ? g.stage.name + ' · ' + (Endless.LABEL[Zones.id()] || '') : g.stage.name)
      : '');
    /* 全クリア演出（§6 P5b）の間は、操作の案内と状態フラグを伏せる
       （もう操作しないし、最後の画面に「GRAVITY」などが残ると邪魔になる）。 */
    const fin = (g.status === 'allclear');
    ['hand-left', 'hand-right'].forEach((id) => {
      const e = HUD.el[id] || (HUD.el[id] = document.getElementById(id));
      if (e) e.style.opacity = fin ? '0' : '';
    });
    if (fin) {
      ['flag-mirror', 'flag-swap', 'flag-grav', 'flag-zero', 'flag-merge'].forEach((id) => {
        const e = HUD.el[id];
        if (e) e.style.display = 'none';
      });
      HUD.mirrorZones(null);
      return;
    }
    /* 担当アイコン: 画面の下半分＝床のキャラ／上半分＝天井のキャラ（§4.2 改訂）。
       重力反転ワープで面が入れ替わっても、画面の位置と担当は一致し続ける。 */
    /* 入れ替えワープ（§4.5 / S7）で担当が入れ替わったら、**チップごと入れ替わる**
       （名前・色・フリックの向きの案内が、その半分がいま動かすキャラのものになる）。
       どちらを担当しているかは Game.runnerForZone の1か所だけが決める。 */
    /* 合体区間（§4.5 / S8）: 2体は1体。両手で1体を動かすので、チップは
       「下半分＝移動／上半分＝跳ぶ・潜る」に差し替える（名前は合体体の名前）。 */
    const mg = !!g.merged;
    [['left', 'bottom', '下半分'], ['right', 'top', '上半分']].forEach((c) => {
      const r = mg ? (g.mergeLead ? g.mergeLead() : null)
                   : (g.runnerForZone ? g.runnerForZone(c[1])
                      : g.runners.filter((x) => x.surface === (c[1] === 'top' ? 'ceil' : 'floor'))[0]);
      if (!r) return;
      const box = HUD.el['hand-' + c[0]];
      if (box) box.setAttribute('data-char', r.id);
      HUD._set('hand-' + c[0] + '-name', mg ? 'DUO' : r.id.toUpperCase());
      HUD._set('hand-' + c[0] + '-keys',
               mg ? (c[2] + (c[0] === 'left' ? ' ←→移動' : ' ↑跳ぶ ↓潜る'))
                  : (c[2] + (r.surface === 'floor' ? ' ↑跳ぶ ↓潜る' : ' ↓跳ぶ ↑潜る')));
    });
    /* S6: 重力反転中／無重力区間（契約§4.5）。どちらも「今どうなっているか」を面と
       滞空倍率（Zero.cur）から引くだけ＝表示と判定が必ず一致する。 */
    if (HUD.el['flag-grav']) {
      HUD.el['flag-grav'].style.display = (g.flipped && g.flipped()) ? '' : 'none';
    }
    if (HUD.el['flag-zero']) {
      HUD.el['flag-zero'].style.display =
        (typeof Zero !== 'undefined' && Zero.cur > 1 && g.status === 'playing') ? '' : 'none';
    }
    const anyMirror = g.runners.some((r) => r.mirrored);
    if (HUD.el['flag-mirror']) HUD.el['flag-mirror'].style.display = anyMirror ? '' : 'none';
    HUD.mirrorZones(g);
    if (HUD.el['flag-swap']) HUD.el['flag-swap'].style.display = (g.handSwap && !g.merged) ? '' : 'none';
    if (HUD.el['flag-merge']) HUD.el['flag-merge'].style.display = g.merged ? '' : 'none';
  }
};

/* ---------------------------------------------------------------- 画面遷移 */
const UI = {
  screens: ['title', 'mode', 'stages', 'dead', 'clear'],
  /* ステージ選択の並び（契約 §4.4 v2 / P7c: 7ステージ）。S1 はチュートリアル（白い空間） */
  STAGES: [
    { id: 'S1', name: 'チュートリアル', ready: true },
    { id: 'S2', name: 'ネオン都市', ready: true },
    { id: 'S3', name: '古代遺跡', ready: true },
    { id: 'S4', name: '深海', ready: true },
    { id: 'S5', name: '宇宙ステーション', ready: true },
    { id: 'S6', name: '鏡の世界', ready: true },
    { id: 'S7', name: 'コア', ready: true }
  ],

  show(name) {
    UI.screens.forEach((s) => {
      const e = document.getElementById('screen-' + s);
      if (e) e.classList.toggle('on', s === name);
    });
    const hud = document.getElementById('hud');
    if (hud) hud.classList.toggle('on', name === 'play');
    UI.current = name;
    if (name === 'stages') UI.renderStages();
    if (name === 'title') UI.renderTitle();
  },

  cleared() { return U.lsGet('cleared', []) || []; },
  /* 全クリア（7ステージすべて制覇＝S7 コアのクリア / 契約§6 P5b・P7c）。localStorage の印が唯一の出所 */
  allCleared() { return !!U.lsGet('allclear', false); },

  /* 全クリア演出（最終ステージ S7 クリア直後の短いオーバーレイ）。
     2体は World がポーズを取り続け、ここは文字と「全ゾーンの色の流れ」を受け持つ。 */
  allClearShow() {
    const e = document.getElementById('allclear');
    if (!e) return false;
    e.classList.remove('on');
    void e.offsetWidth;                 // アニメーションを確実に再生させる
    e.classList.add('on');
    return true;
  },
  allClearHide() {
    const e = document.getElementById('allclear');
    if (e) e.classList.remove('on');
    return true;
  },
  /* 開発中は実装済み（ready）ステージを全部選べる（契約§4.4 2026-09-22 テスト用）。
     正式リリース時に false へ。機械テストはロック規則の検証中だけ _testLock を立てる。 */
  UNLOCK_ALL: true,
  _testLock: false,
  isUnlocked(i) {
    if (i === 0) return true;
    if (UI.UNLOCK_ALL && !UI._testLock) return true;
    return UI.cleared().indexOf(UI.STAGES[i - 1].id) >= 0;
  },

  tutorialPending() { return !(typeof Tutorial !== 'undefined' && Tutorial.isDone && Tutorial.isDone()); },
  renderTitle() {
    const pend = UI.tutorialPending();
    const bs = document.getElementById('btn-start');
    if (bs) bs.textContent = pend ? 'START ─ チュートリアル' : 'START';
    const sk = document.getElementById('btn-start-skip');
    if (sk) sk.style.display = pend ? '' : 'none';
    const e = HUD.el['title-best'] || document.getElementById('title-best');
    if (!e) return;
    const be = U.lsGet('best.endless', 0);
    const cl = UI.cleared().length;
    e.textContent = (cl ? ('クリア ' + cl + ' ステージ') : '') + (be ? ((cl ? ' ／ ' : '') + 'エンドレス最長 ' + be + ' m') : '');
  },

  renderStages() {
    const grid = document.getElementById('stage-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const cleared = UI.cleared();
    /* 全クリアの印（契約§6 P5b「ステージ選択に全クリアの印」） */
    const mark = document.getElementById('stages-allclear');
    if (mark) {
      const on = UI.allCleared();
      mark.style.display = on ? '' : 'none';
      mark.textContent = on ? '★ ALL CLEAR — 全' + UI.STAGES.length + 'ステージ制覇' : '';
    }
    UI.STAGES.forEach((st, i) => {
      const unlocked = UI.isUnlocked(i) && st.ready;
      const done = cleared.indexOf(st.id) >= 0;
      const best = U.lsGet('best.' + st.id, 0);
      const b = document.createElement('button');
      b.className = 'stage-card';
      b.setAttribute('data-ui', 'stage-' + st.id);
      b.setAttribute('data-unlocked', unlocked ? '1' : '0');
      if (!unlocked) b.setAttribute('disabled', 'disabled');
      b.innerHTML = '<div class="no">' + st.id + '</div><div class="nm">' + st.name + '</div>' +
                    '<div class="meta">' + (st.ready ? (best ? ('ベスト ' + best + ' m') : '未挑戦') : '準備中') + '</div>' +
                    (done ? '<div class="star">★</div>' : (unlocked ? '' : '<div class="lock">🔒</div>'));
      if (unlocked) b.addEventListener('click', () => { UI.game.start(st.id); });
      grid.appendChild(b);
    });
  },

  /* 設定パネル（§6 P6）: 音量・ミュート・チュートリアルの再表示 */
  settingsOpen(on) {
    const p = document.getElementById('settings');
    const title = document.getElementById('screen-title');
    if (!p) return false;
    p.classList.toggle('on', !!on);
    if (title) title.classList.toggle('set-open', !!on);
    UI.renderSettings();
    return !!on;
  },
  renderSettings() {
    if (typeof Audio === 'undefined' || !Audio.SE) return false;
    const s = Audio.settings;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = String(Math.round(v * 100)); };
    const txt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('set-bgm', s.bgm); set('set-se', s.se);
    txt('set-bgm-v', Math.round(s.bgm * 100)); txt('set-se-v', Math.round(s.se * 100));
    const m = document.getElementById('set-mute');
    if (m) { m.textContent = s.mute ? '音: OFF（ミュート）' : '音: ON'; m.classList.toggle('off', !!s.mute); }
    const tb = document.getElementById('set-tut');
    if (tb && typeof Tutorial !== 'undefined' && Tutorial.isDone) tb.disabled = !Tutorial.isDone();
    return true;
  },

  init(game) {
    UI.game = game;
    const on = (sel, fn) => {
      document.querySelectorAll('[data-ui="' + sel + '"]').forEach((e) => e.addEventListener('click', fn));
    };
    /* ボタンの手応え（小さなクリック音）。data-ui の付いたボタンすべて */
    document.querySelectorAll('button[data-ui]').forEach((e) => e.addEventListener('click', () => U.sfx('ui')));
    on('settings', () => UI.settingsOpen(true));
    on('settings-close', () => UI.settingsOpen(false));
    on('audio-mute', () => { if (typeof Audio !== 'undefined' && Audio.SE) Audio.toggleMute(); UI.renderSettings(); });
    on('tutorial-reset', () => { if (typeof Tutorial !== 'undefined' && Tutorial.resetDone) Tutorial.resetDone(); UI.renderSettings(); UI.renderTitle(); });
    ['bgm', 'se'].forEach((k) => {
      const e = document.querySelector('[data-ui="audio-' + k + '"]');
      if (e) e.addEventListener('input', () => {
        if (typeof Audio !== 'undefined' && Audio.SE) Audio.setVolume(k, (+e.value || 0) / 100);
        UI.renderSettings();
      });
    });
    UI.renderSettings();
    /* 初回（チュートリアル未了）は START が S1 チュートリアルを促す（契約§4.4 v2 / P7c）。
       済みならモード選択へ。未了でも「スキップ」でモード選択へ行ける（ステージ選択でも S1 を選べる） */
    on('start', () => {
      UI.settingsOpen(false);
      if (UI.tutorialPending()) game.start('S1');
      else UI.show('mode');
    });
    on('start-skip', () => { UI.settingsOpen(false); UI.show('mode'); });
    on('mode-stage', () => UI.show('stages'));
    on('mode-endless', () => game.start('endless'));
    on('back-title', () => UI.show('title'));
    on('back-mode', () => UI.show('mode'));
    on('retry', () => game.retry());
    on('retry-clear', () => game.retry(true));
    on('next', () => { game.toTitle(); UI.show(game.stage && game.stage.endless ? 'mode' : 'stages'); });
    on('title', () => game.toTitle());
    UI.renderTitle();
  }
};
