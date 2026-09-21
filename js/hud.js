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
                 'flag-mirror', 'flag-swap', 'dead-dist', 'dead-cp', 'dead-best',
                 'clear-dist', 'clear-best', 'title-best'];
    ids.forEach((id) => { HUD.el[id] = document.getElementById(id); });
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
    HUD._set('hud-stage', g.stage ? g.stage.name : '');
    /* 担当アイコン: 画面の下半分＝床のキャラ／上半分＝天井のキャラ（§4.2 改訂）。
       重力反転ワープで面が入れ替わっても、画面の位置と担当は一致し続ける。 */
    [['left', 'floor', '下半分 ↑跳ぶ ↓潜る'], ['right', 'ceil', '上半分 ↓跳ぶ ↑潜る']].forEach((c) => {
      const r = g.runners.filter((x) => x.surface === c[1])[0];
      if (!r) return;
      const box = HUD.el['hand-' + c[0]];
      if (box) box.setAttribute('data-char', r.id);
      HUD._set('hand-' + c[0] + '-name', r.id.toUpperCase());
      HUD._set('hand-' + c[0] + '-keys', c[2]);
    });
    const anyMirror = g.runners.some((r) => r.mirrored);
    if (HUD.el['flag-mirror']) HUD.el['flag-mirror'].style.display = anyMirror ? '' : 'none';
    if (HUD.el['flag-swap']) HUD.el['flag-swap'].style.display = g.handSwap ? '' : 'none';
  }
};

/* ---------------------------------------------------------------- 画面遷移 */
const UI = {
  screens: ['title', 'mode', 'stages', 'dead', 'clear'],
  /* ステージ選択の並び（契約 §4.4）。実装済みは S1 のみ、以降は P2b 以降で解放 */
  STAGES: [
    { id: 'S1', name: 'ネオン都市・入門', ready: true },
    { id: 'S2', name: 'ネオン都市・夜', ready: false },
    { id: 'S3', name: '古代遺跡・外周', ready: false },
    { id: 'S4', name: '古代遺跡・内部', ready: false },
    { id: 'S5', name: '深海', ready: false },
    { id: 'S6', name: '宇宙ステーション', ready: false },
    { id: 'S7', name: '鏡の世界', ready: false },
    { id: 'S8', name: 'コア', ready: false }
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
  isUnlocked(i) {
    if (i === 0) return true;
    return UI.cleared().indexOf(UI.STAGES[i - 1].id) >= 0;
  },

  renderTitle() {
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

  init(game) {
    UI.game = game;
    const on = (sel, fn) => {
      document.querySelectorAll('[data-ui="' + sel + '"]').forEach((e) => e.addEventListener('click', fn));
    };
    on('start', () => UI.show('mode'));
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
