/* ============================================================================
   DUO RUN — hud.js  HUD（距離・速度・左右の手アイコン）と画面切替（§4.8 最小版）
   ステージ選択・リザルトの本格UIは P2。ここでは最小限。
   ============================================================================ */
'use strict';

const HUD = {
  el: {},
  _last: {},
  init() {
    const ids = ['hud-dist', 'hud-speed', 'hud-stage', 'hand-left', 'hand-right',
                 'hand-left-name', 'hand-right-name', 'hand-left-keys', 'hand-right-keys',
                 'flag-mirror', 'flag-swap', 'dead-dist', 'dead-cp', 'clear-dist'];
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
    /* 手アイコン: 担当キャラの色と名前（入れ替えワープで中身が入れ替わる） */
    ['left', 'right'].forEach((hand) => {
      const r = g.runnerForHand(hand);
      if (!r) return;
      const box = HUD.el['hand-' + hand];
      if (box) box.setAttribute('data-char', r.id);
      HUD._set('hand-' + hand + '-name', r.id.toUpperCase());
      HUD._set('hand-' + hand + '-keys', hand === 'left' ? 'A D / W / S' : '← → / ↑ / ↓');
      const mir = HUD.el['flag-' + (hand === 'left' ? 'mirror' : 'swap')];
      if (mir) { /* 反転表示のフック（P2で使う） */ }
    });
    const anyMirror = g.runners.some((r) => r.mirrored);
    if (HUD.el['flag-mirror']) HUD.el['flag-mirror'].style.display = anyMirror ? '' : 'none';
    if (HUD.el['flag-swap']) HUD.el['flag-swap'].style.display = g.handSwap ? '' : 'none';
  }
};

const UI = {
  screens: ['title', 'dead', 'clear'],
  show(name) {
    UI.screens.forEach((s) => {
      const e = document.getElementById('screen-' + s);
      if (e) e.classList.toggle('on', s === name);
    });
    const hud = document.getElementById('hud');
    if (hud) hud.classList.toggle('on', name === 'play');
  },
  init(game) {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
    on('btn-s0', () => game.start('S0'));
    on('btn-endless', () => game.start('endless'));
    on('btn-retry', () => game.retry());
    on('btn-title', () => game.toTitle());
    on('btn-title2', () => game.toTitle());
  }
};
