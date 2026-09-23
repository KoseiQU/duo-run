/* ============================================================================
   DUO RUN — tutorial.js  導入区間のテキスト指示（契約 §4.8）
   ・S1 冒頭の導入区間（chunks.js の INTRO_S1）が撒く event {type:'tip'} で表示する。
   ・文言はタッチ前提（iPhone/iPad専用・契約§1）。指アイコン＋フリックの言い方。
   ・DOM オーバーレイ 1枚（#tip）。表示は CSS の .on クラスで、可視性を機械テストできる。
   ============================================================================ */
'use strict';

const Tutorial = {
  SHOW_T: 2.6,          // 表示時間（秒）… 対象の位置を持たない tip だけに使う
  /* 契約§4.8（2026-09-23）: tip は **対象の通過で消す**。対象の位置（untilM）を持つ tip は
     走行距離がそこ＋PASS_M を越えたら消す（時間では消さない＝説明中に消えない）。 */
  PASS_M: 0.6,
  untilM: null,

  /* 文言はタッチ前提（契約§1 iPhone/iPad専用）。指アイコン＋短い指示。
     ■ 改行は「句」の切れ目でしか起きないようにする（P2a-3 の残課題:
       「上へフ／リックで」のように語の途中で折り返していた）。
       各句を inline-block の <span class="ph"> に包むと、句の内部では絶対に折り返さない。
       文言はここで **句の配列** として書き、show() が span に包む。 */
  TIPS: {
    jump_l: { ph: ['<span class="finger">👆</span><b class="k">下半分</b>を', '<b class="k">上へフリック</b>で', 'ジャンプ'] },
    jump_r: { ph: ['<span class="finger">👇</span><b class="k2">上半分</b>は', '<b class="k2">下へフリック</b>で', 'ジャンプ'] },
    lane:   { ph: ['<span class="finger">👈</span>柱は', '<b>横へフリック</b>で避ける', '（上下それぞれ）'] },
    gap:    { ph: ['<span class="finger">👆</span>穴はジャンプ', '（下半分を上へ）'] },
    laser:  { ph: ['<span class="finger">👇</span>赤い光線もジャンプ', '（上半分は下へ）'] },
    wide:   { ph: ['<span class="finger">👉</span>2レーンをふさぐ梁は', '空いたレーンへ'] },
    both:   { ph: ['同時に来る！', '<b class="k">下</b>と<b class="k2">上</b>を', '別々に'] },
    /* S3 の新ギミック（契約§4.4）。初出のときだけ短く出す */
    bridge: { ph: ['<span class="finger">👆</span>崩れる橋は', '踏んだら<b>すぐ横へ</b>', 'または跳び越す'] },
    pendulum: { ph: ['<span class="finger">👈</span>振り子の刃は', '<b>空いたレーン</b>へ'] },
    /* S4 の新ギミック（契約§4.4 / §4.5）。初出のときだけ短く出す */
    sync: { ph: ['<span class="finger">👆</span>光る踏み板を', '<b class="k">下</b>と<b class="k2">上</b>で<b>同時に</b>',
                 '踏むと橋が架かる'] },
    dropceil: { ph: ['<span class="finger">👇</span>天井が落ちる', '<b class="k">下</b>は<b>横へ</b>、<b class="k2">上</b>は<b>跳ぶ</b>'] },
    /* S5 の新ギミック（契約§4.4 / §4.5）。初出のときだけ短く出す */
    current: { ph: ['<span class="finger">👈</span>海流に流される', '<b>逆へフリック</b>で踏みとどまる'] },
    liftpad: { ph: ['<span class="finger">👆</span>浮き上がる足場は', '<b>跳び越える</b>', '沈んでいれば通れる'] },
    colordoor: { ph: ['<span class="finger">👉</span>扉は<b class="k">同じ色</b>だけ通れる', '<b class="k">下は琥珀</b>／<b class="k2">上は藍</b>へ'] },
    /* S6 の新ギミック（契約§4.4 / §4.5）。初出のときだけ短く出す */
    gravwarp: { ph: ['<span class="finger">👆</span>黄のゲートで<b>上下が入れ替わる</b>',
                     '<b class="k">下半分</b>は<b>床を走る方</b>のまま'] },
    zerog: { ph: ['<span class="finger">👆</span>無重力区間は', '<b>ジャンプが長い</b>'] },
    lasernet: { ph: ['<span class="finger">👈</span>レーザー網は', '<b class="k">下</b>と<b class="k2">上</b>で',
                     '<b>よけるレーンが違う</b>'] },
    /* S7 の新ギミック（契約§4.4 / §4.5）。初出のときだけ短く出す */
    mirrorzone: { ph: ['<span class="finger">🪞</span>銀の枠をくぐった側は', '<b>左右が逆</b>になる',
                       '（出口の枠で戻る）'] },
    handswap: { ph: ['<span class="finger">🔄</span>紫の枠で<b>担当が入れ替わる</b>',
                     '<b class="k">下半分</b>が<b class="k2">上のキャラ</b>を動かす'] },
    shardstep: { ph: ['<span class="finger">👆</span>鏡の床が砕けた', '<b>揺れる足場</b>へ跳べ'] },
    dualzone: { ph: ['<span class="finger">🌀</span>鏡と入れ替えが<b>同時</b>に効く',
                     '担当も左右も入れ替わっている'] },
    /* S8 の新ギミック（契約§4.4 / §4.5）。初出のときだけ短く出す */
    mergerun: { ph: ['<span class="finger">🤝</span>2人が<b>1体</b>になった',
                     '<b class="k">下半分</b>で<b>横へ移動</b>',
                     '<b class="k2">上半分</b>で<b>↑跳ぶ ↓潜る</b>'] }
  },
  /* ---- 初回のみ（§6 P6）: S1 冒頭の操作チュートリアルは、最後の「同時に来る！」を
     通り抜けたら済み（localStorage duorun.tutorialDone）。以後の S1 では出さない。
     設定の「チュートリアルをもう一度」で戻せる。障害物の並び（tip の猶予規則の窓）は変えない。
     新ギミックの初出 tip（S3〜）はステージごとの説明なので毎回出す。 ---- */
  INTRO_IDS: ['jump_l', 'jump_r', 'lane', 'gap', 'laser', 'wide', 'both'],
  LAST_ID: 'both',
  skipped: 0,
  isDone() { return !!U.lsGet('tutorialDone', false); },
  markDone() { U.lsSet('tutorialDone', true); return true; },
  resetDone() {
    try { window.localStorage.removeItem(CFG.LS_PREFIX + 'tutorialDone'); } catch (e) { /* noop */ }
    return true;
  },
  isIntro(id) { return Tutorial.INTRO_IDS.indexOf(id) >= 0; },

  /* 句をつなぐ（句と句の間だけが改行できる位置になる） */
  html(tip) { return tip.ph.map((x) => '<span class="ph">' + x + '</span>').join(''); },

  el: null,
  t: 0,
  current: null,

  init() { Tutorial.el = document.getElementById('tip'); Tutorial.hide(); },

  show(id, untilM) {
    const tip = Tutorial.TIPS[id];
    if (!tip || !Tutorial.el) return false;
    Tutorial.el.innerHTML = Tutorial.html(tip);
    Tutorial.el.classList.add('on');
    /* tip は分割線の上に出るので、同じ場所にあるタッチ領域のラベルは一時的に消す */
    document.body.classList.add('tip-on');
    Tutorial.current = id;
    Tutorial.t = Tutorial.SHOW_T;
    Tutorial.untilM = (typeof untilM === 'number') ? untilM : null;
    return true;
  },

  hide() {
    if (!Tutorial.el) return;
    Tutorial.el.classList.remove('on');
    document.body.classList.remove('tip-on');
    Tutorial.current = null;
    Tutorial.t = 0;
    Tutorial.untilM = null;
  },

  update(dt, dist) {
    if (!Tutorial.current) return;
    if (Tutorial.untilM !== null) {
      if (typeof dist === 'number' && dist >= Tutorial.untilM + Tutorial.PASS_M) {
        /* 最後の操作説明を通り抜けた＝チュートリアル済み（ボットの走行では記録しない） */
        const bot = (typeof Game !== 'undefined' && Game.botMode);
        if (Tutorial.current === Tutorial.LAST_ID && !bot) Tutorial.markDone();
        Tutorial.hide();
      }
      return;
    }
    Tutorial.t -= dt;
    if (Tutorial.t <= 0) Tutorial.hide();
  },

  /* イベント入口（Game.onEvent から） */
  onEvent(e) {
    if (!e || e.type !== 'tip' || !e.params) return;
    if (Tutorial.isIntro(e.params.id) && Tutorial.isDone()) { Tutorial.skipped++; return; }
    Tutorial.show(e.params.id, e.params.untilM);
  },

  reset() { Tutorial.hide(); }
};
