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
                 'flag-mirror', 'flag-swap', 'flag-grav', 'flag-zero',
                 'dead-dist', 'dead-cp', 'dead-best',
                 'clear-dist', 'clear-best', 'title-best', 'cue', 'cue-main', 'cue-sub',
                 'sync', 'sync-main', 'sync-sub', 'cur', 'cur-f', 'cur-c'];
    ids.forEach((id) => { HUD.el[id] = document.getElementById(id); });
    HUD.cueHide();
    HUD.syncState = 'x';
    HUD.syncCue(null);
    HUD.curState = 'x';
    HUD.currentCue(0, 0);
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

  /* 海流ベルト（契約§4.5 / S5）: 今どちらへ流されているかを矢印で出す。
     床（下半分＝LUMEN）と天井（上半分＝UMBRA）で向きが違うので、2つ並べる。
     dir / cdir は -1（左）/ 0（流れの外）/ +1（右）。 */
  curState: null,
  currentCue(dir, cdir) {
    const e = HUD.el.cur || (HUD.el.cur = document.getElementById('cur'));
    if (!e) return false;
    const key = dir + '|' + cdir;
    if (HUD.curState === key) return true;
    HUD.curState = key;
    const on = !!(dir || cdir);
    e.classList.toggle('on', on);
    if (!on) return true;
    const arrow = (d) => (d > 0 ? '▶▶' : (d < 0 ? '◀◀' : '—'));
    const f = HUD.el['cur-f'] || (HUD.el['cur-f'] = document.getElementById('cur-f'));
    const c = HUD.el['cur-c'] || (HUD.el['cur-c'] = document.getElementById('cur-c'));
    if (c) c.textContent = arrow(cdir);
    if (f) f.textContent = arrow(dir);
    return true;
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
    if (HUD.el['flag-swap']) HUD.el['flag-swap'].style.display = g.handSwap ? '' : 'none';
  }
};

/* ---------------------------------------------------------------- 画面遷移 */
const UI = {
  screens: ['title', 'mode', 'stages', 'dead', 'clear'],
  /* ステージ選択の並び（契約 §4.4）。実装済みは S1・S2、以降は P3 以降で解放 */
  STAGES: [
    { id: 'S1', name: 'ネオン都市・入門', ready: true },
    { id: 'S2', name: 'ネオン都市・夜', ready: true },
    { id: 'S3', name: '古代遺跡・外周', ready: true },
    { id: 'S4', name: '古代遺跡・内部', ready: true },
    { id: 'S5', name: '深海', ready: true },
    { id: 'S6', name: '宇宙ステーション', ready: true },
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
  /* 開発中は実装済み（ready）ステージを全部選べる（契約§4.4 2026-09-22 テスト用）。
     正式リリース時に false へ。機械テストはロック規則の検証中だけ _testLock を立てる。 */
  UNLOCK_ALL: true,
  _testLock: false,
  isUnlocked(i) {
    if (i === 0) return true;
    if (UI.UNLOCK_ALL && !UI._testLock) return true;
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
