/* ============================================================================
   DUO RUN — endless.js  エンドレスの骨組み（契約 §4.4 / §6 P6）
   ・1000m ごとにゾーンを切り替える（ネオン→遺跡→深海→宇宙→鏡→コア→… をループ）。
     対象は **クリア済みのゾーンだけ**（開発中の UI.UNLOCK_ALL=true の間は全ゾーン）。
   ・切替は Zones.switchTo の暗転ではなく **トンネル抜け**（無地の連絡通路 40m＋光のゲート）で繋ぐ。
     通路の中では前方が光の膜でふさがっているので、ゾーンの差し替え（数十ms）が画面に出ない。
   ・切替の前後 speed×1.0秒 は障害物なし（生成器が空ける / chunks.js）。
   ・1500m ごとにミニ大演出（崩落・大ジャンプ・巨岩追跡のミニ版）をランダムに挿入する。
   ・「どこで切り替えるか」は生成器（createGenerator）が決めて gen.switches に積む。
     ここは (1) 設計の数値 (2) クリア状況 → ゾーンごとの顔ぶれ (3) 走行中の切替の実行 だけを持つ。
   ============================================================================ */
'use strict';

const Endless = {
  ORDER: ['neon', 'ruins', 'sea', 'space', 'mirror', 'core'],
  /* ゾーン → そのゾーンを持ち込むステージ（クリア判定の出所） */
  /* ゾーン → そのゾーンを持ち込むステージ（クリア判定の出所 / 契約§4.4 v2 の7ステージ）。
     S1（白空間チュートリアル）はエンドレスに含めない。 */
  STAGES: { neon: ['S2'], ruins: ['S3'], sea: ['S4'], space: ['S5'], mirror: ['S6'], core: ['S7'] },
  LABEL: { neon: 'ネオン都市', ruins: '古代遺跡', sea: '深海', space: '宇宙ステーション', mirror: '鏡の世界', core: 'コア' },
  TITLE: { neon: 'NEON CITY', ruins: 'RUINS', sea: 'DEEP SEA', space: 'STATION', mirror: 'MIRROR', core: 'CORE' },

  SWITCH_M: 1000,       // 契約§4.4「1000mごとにゾーン切替演出」
  TUNNEL_M: 40,         // 無地の連絡通路の長さ（m・実寸）
  GRACE_T: 1.0,         // 切替（通路）の前後に障害物を置かない秒数（speed × 1.0秒）
  SWAP_BEFORE: 12,      // ゲートの何 m 手前で実際にゾーンを差し替えるか（カメラが通路の奥にいる瞬間）
  MINI_M: 1500,         // 契約§4.4「ミニ版を1500mごとにランダム挿入」
  MINIS: ['mini_collapse', 'mini_jump', 'mini_rock'],
  CUE_T: 1.8,           // ゾーン名の表示（秒）

  ALL: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
  /* 開発中の全解放（UI.UNLOCK_ALL）なら全ステージをクリア済みとみなす。
     機械テストは UI._testLock で本来の規則（クリア済みのゾーンだけ）を検証する。 */
  clearedList() {
    const all = (typeof UI !== 'undefined' && UI.UNLOCK_ALL && !UI._testLock);
    return all ? Endless.ALL.slice() : (U.lsGet('cleared', []) || []);
  },

  /* クリア状況 → { zones:[順番], pools:{ zone: {pool, minRank, maxRank, reactBoth} } }。
     顔ぶれは各ステージのプール（重み付けの重複ごと）をそのまま使う＝ゾーンごとの比率の調整を引き継ぐ。
     合体区間（S8）はゾーン切替と噛み合わないので持ち込まない（P5b の決定）。 */
  plan(cleared) {
    const has = (id) => (cleared || []).indexOf(id) >= 0;
    const late = CFG.FAIR.REACT_BOTH_LATE;
    const pools = {};
    /* ネオン都市は基本セットとして最初から入っている。S2 クリアで動くレーザーが混ざる */
    let neon = STAGE_DEFS.endless.chunkPool.slice(), nr = STAGE_DEFS.endless.maxRank;
    if (has('S2')) { neon = neon.concat(ENDLESS_UNLOCK.S2); nr = 3; }
    pools.neon = { pool: neon, minRank: 1, maxRank: nr, reactBoth: CFG.FAIR.REACT_BOTH };
    if (has('S3')) pools.ruins = { pool: STAGE_DEFS.S3.chunkPool.slice(), minRank: 2, maxRank: 4, reactBoth: late };
    if (has('S4')) pools.sea = { pool: STAGE_DEFS.S4.chunkPool.slice(), minRank: 3, maxRank: 4, reactBoth: late };
    if (has('S5')) pools.space = { pool: STAGE_DEFS.S5.chunkPool.slice(), minRank: 4, maxRank: 5, reactBoth: late };
    if (has('S6')) pools.mirror = { pool: STAGE_DEFS.S6.chunkPool.slice(), minRank: 4, maxRank: 5, reactBoth: late };
    if (has('S7')) {
      pools.core = { pool: STAGE_DEFS.S7.chunkPool.filter((id) => CHUNK_BY_ID[id] && !CHUNK_BY_ID[id].merge),
                     minRank: 5, maxRank: 5, reactBoth: late };
    }
    return { zones: Endless.ORDER.filter((z) => !!pools[z]), pools: pools };
  },

  /* ---- 走行中（Game.onEvent から） ---------------------------------------- */
  cueUntil: -1,
  cueText: null,
  log: [],              // 監査用: 実際に切り替えた記録 {zone, at, dist}
  onEvent(e, game) {
    if (!e || !e.params) return false;
    if (e.type === 'zone.switch') {
      /* カメラが通路の奥にいて、前方は光の膜でふさがっている瞬間に差し替える */
      if (Zones.id() !== e.params.zone) {
        Zones.switchTo(e.params.zone, true);
        Zones.mode(null);
      }
      /* 鏡ゾーン【P8a 固定反転】: 区画（ゾーン）の中では戻さず、ゾーン切替で解除する（契約§4.5） */
      if (game && typeof Mirror !== 'undefined') Mirror.clearAll(game);
      Endless.log.push({ zone: e.params.zone, at: e.at, dist: game ? game.dist : e.at });
      return true;
    }
    if (e.type === 'zone.gate') {
      /* ゲートをくぐった: 白い光が抜けて、ゾーン名を出す */
      Endless.gateFlash();
      const z = e.params.zone;
      const n = (e.params.idx || 0) + 1;
      Endless.cueText = Endless.TITLE[z] || z;
      if (typeof HUD !== 'undefined' && HUD.cue) HUD.cue(Endless.cueText, 'ZONE ' + n + ' ／ ' + (Endless.LABEL[z] || z));
      const sp = game ? game.speed : CFG.SPEED_MIN;
      Endless.cueUntil = e.at + sp * Endless.CUE_T;
      if (typeof Audio !== 'undefined' && Audio.play) Audio.play('gate');
      return true;
    }
    return false;
  },
  update(game) {
    if (Endless.cueUntil > 0 && game.dist >= Endless.cueUntil) {
      /* 別の合図（ミニ大演出の予告など）に差し替わっていたら消さない */
      if (typeof HUD !== 'undefined' && HUD.cueOn === Endless.cueText && HUD.cueHide) HUD.cueHide();
      Endless.cueUntil = -1;
      Endless.cueText = null;
    }
  },
  reset() {
    Endless.cueUntil = -1;
    Endless.cueText = null;
    Endless.log.length = 0;
    ZoneKit.mask = null;
  },
  /* 光のゲートを抜けた瞬間の白い抜け（CSS のクラスだけで完結する） */
  gateFlash() {
    const e = document.getElementById('zonegate');
    if (!e) return false;
    e.classList.remove('on');
    void e.offsetWidth;
    e.classList.add('on');
    return true;
  },

  /* 今いる（生成済みの）切替・通路（World と監査の窓口） */
  switches() { return (typeof Game !== 'undefined' && Game.gen && Game.gen.switches) ? Game.gen.switches : []; },
  /* dist から見て描くべき通路（前方 VIEW_FAR 以内に入口がある／カメラがまだ中にいる） */
  tunnelNear(dist) {
    const sw = Endless.switches();
    for (let i = 0; i < sw.length; i++) {
      const s = sw[i];
      if (s.t0 - dist < CFG.VIEW_FAR && s.at - dist > -(CFG.CAM.Z + 6)) return s;
    }
    return null;
  },
  zoneAt(m) {
    return (typeof Game !== 'undefined' && Game.gen && Game.gen.zoneAt) ? Game.gen.zoneAt(m) : Zones.id();
  }
};
