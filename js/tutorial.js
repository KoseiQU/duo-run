/* ============================================================================
   DUO RUN — tutorial.js  導入区間のテキスト指示（契約 §4.8）
   ・S1 冒頭の導入区間（chunks.js の INTRO_S1）が撒く event {type:'tip'} で表示する。
   ・文言はタッチ前提（iPhone/iPad専用・契約§1）。指アイコン＋フリックの言い方。
   ・DOM オーバーレイ 1枚（#tip）。表示は CSS の .on クラスで、可視性を機械テストできる。
   ============================================================================ */
'use strict';

const Tutorial = {
  SHOW_T: 2.6,          // 表示時間（秒）

  /* 文言はタッチ前提（契約§1 iPhone/iPad専用）。指アイコン＋短い指示。 */
  TIPS: {
    jump_l: { text: '<span class="finger">👆</span><b class="k">下半分</b>を<b class="k">上へ</b>フリックでジャンプ' },
    jump_r: { text: '<span class="finger">👇</span><b class="k2">上半分</b>は<b class="k2">下へ</b>フリックでジャンプ' },
    lane:   { text: '<span class="finger">👈</span>柱は<b>横へ</b>フリックで避ける（上下それぞれ）' },
    gap:    { text: '<span class="finger">👆</span>穴はジャンプ（下半分を上へ）' },
    laser:  { text: '<span class="finger">👇</span>赤い光線もジャンプ（上半分は下へ）' },
    wide:   { text: '<span class="finger">👉</span>2レーンをふさぐ梁は 空いたレーンへ' },
    both:   { text: '同時に来る！<b class="k">下</b>と<b class="k2">上</b>を別々に' }
  },

  el: null,
  t: 0,
  current: null,

  init() { Tutorial.el = document.getElementById('tip'); Tutorial.hide(); },

  show(id) {
    const tip = Tutorial.TIPS[id];
    if (!tip || !Tutorial.el) return false;
    Tutorial.el.innerHTML = tip.text;
    Tutorial.el.classList.add('on');
    Tutorial.current = id;
    Tutorial.t = Tutorial.SHOW_T;
    return true;
  },

  hide() {
    if (!Tutorial.el) return;
    Tutorial.el.classList.remove('on');
    Tutorial.current = null;
    Tutorial.t = 0;
  },

  update(dt) {
    if (!Tutorial.current) return;
    Tutorial.t -= dt;
    if (Tutorial.t <= 0) Tutorial.hide();
  },

  /* イベント入口（Game.onEvent から） */
  onEvent(e) {
    if (e && e.type === 'tip' && e.params) Tutorial.show(e.params.id);
  },

  reset() { Tutorial.hide(); }
};
