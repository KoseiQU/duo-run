/* ============================================================================
   DUO RUN — platform.js  iPhone/iPad Safari の実機の罠への対策（契約 §1 / §2 / §6 P6）
   ・100vh 問題: #app の高さを innerHeight に追従させる（CSS 変数 --app-h。未対応なら 100dvh）。
   ・ダブルタップ拡大・ピンチ・長押し選択・引っぱりバウンスを止める（CSS と、iOS 独自の gesture* を止める）。
   ・ホーム画面に追加: apple-mobile-web-app-* の meta は index.html。アイコンは **その場で canvas に描いた
     PNG の data URL**（ファイルを置かない＝$0・外部通信なし）。manifest.json は http(s) で配信された
     ときだけ繋ぐ（file:// では読み込めずコンソールを汚すため）。
   ・「ホーム画面に追加すると全画面」の一言は、すでに全画面（standalone）なら出さない。
   ============================================================================ */
'use strict';

const Platform = {
  /* 画面の実の高さへ #app を合わせる（アドレスバーの出入り・回転のたびに） */
  fitApp() {
    const h = window.innerHeight || document.documentElement.clientHeight || 0;
    if (h > 0) document.documentElement.style.setProperty('--app-h', h + 'px');
    return h;
  },
  /* iOS 独自のジェスチャ（ピンチ）とダブルタップ拡大を止める。UI の操作は妨げない */
  guard() {
    const stop = function (e) { if (e.cancelable) e.preventDefault(); };
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, stop, { passive: false }));
    document.addEventListener('dblclick', stop, { passive: false });
    /* 長押しの文脈メニュー（画像保存など）を出さない */
    document.addEventListener('contextmenu', stop, { passive: false });
    /* 素早い2回タップでの拡大（touch-action が効かない古い iOS 向けの保険） */
    let last = 0;
    document.addEventListener('touchend', function (e) {
      const now = Date.now();
      /* ボタン・スライダーの素早い連打は妨げない（そちらは touch-action:manipulation で拡大しない） */
      const onUi = e.target && e.target.closest && e.target.closest('button, input, a');
      if (!onUi && now - last < 320 && e.cancelable) e.preventDefault();
      last = now;
    }, { passive: false });
  },
  /* 全画面（ホーム画面から起動）か */
  standalone() {
    try {
      if (window.navigator && window.navigator.standalone) return true;
      return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             !!(window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches);
    } catch (e) { return false; }
  },
  /* ホーム画面用のアイコン（琥珀と藍の2人＋分割線）を canvas で描いて PNG の data URL にする */
  iconURL(size) {
    const n = size || 180;
    try {
      const cv = document.createElement('canvas');
      cv.width = n; cv.height = n;
      const c = cv.getContext('2d');
      if (!c) return null;
      const g = c.createLinearGradient(0, 0, 0, n);
      g.addColorStop(0, '#141a3e'); g.addColorStop(0.5, '#070914'); g.addColorStop(1, '#2a1a08');
      c.fillStyle = g; c.fillRect(0, 0, n, n);
      const s = n / 180;
      const line = c.createLinearGradient(0, 0, n, 0);
      line.addColorStop(0, 'rgba(255,179,71,0)'); line.addColorStop(0.2, '#ffbe5a');
      line.addColorStop(0.5, '#ffffff'); line.addColorStop(0.8, '#8c9bff'); line.addColorStop(1, 'rgba(125,140,255,0)');
      c.fillStyle = line; c.fillRect(0, n / 2 - 2 * s, n, 4 * s);
      const kid = (x, y, dir, col) => {
        c.save();
        c.translate(x, y); c.scale(s, s * dir);
        c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineWidth = 9;
        c.shadowColor = col; c.shadowBlur = 16;
        c.beginPath(); c.arc(4, -60, 12, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(2, -46); c.lineTo(-3, -22); c.stroke();
        c.beginPath(); c.moveTo(1, -40); c.lineTo(14, -32); c.lineTo(22, -38); c.stroke();
        c.beginPath(); c.moveTo(1, -40); c.lineTo(-12, -32); c.lineTo(-17, -24); c.stroke();
        c.beginPath(); c.moveTo(-3, -22); c.lineTo(9, -10); c.lineTo(15, 0); c.stroke();
        c.beginPath(); c.moveTo(-3, -22); c.lineTo(-9, -8); c.lineTo(-20, -3); c.stroke();
        c.restore();
      };
      kid(n * 0.40, n * 0.86, 1, '#ffb347');
      kid(n * 0.60, n * 0.14, -1, '#8c9bff');
      return cv.toDataURL('image/png');
    } catch (e) { return null; }
  },
  /* <link rel="apple-touch-icon"> と manifest（http(s) のときだけ）を足す */
  installMeta() {
    const head = document.head;
    const url = Platform.iconURL(180);
    if (url) {
      const l = document.createElement('link');
      l.rel = 'apple-touch-icon'; l.href = url;
      head.appendChild(l);
    }
    const proto = (location && location.protocol) || '';
    if (proto === 'http:' || proto === 'https:') {
      const m = document.createElement('link');
      m.rel = 'manifest'; m.href = 'manifest.json';
      head.appendChild(m);
    }
    return !!url;
  },
  /* タイトルの一言（全画面で起動していれば隠す） */
  renderHint() {
    const e = document.getElementById('title-hint');
    if (e) e.style.display = Platform.standalone() ? 'none' : '';
    return !!e;
  },
  init() {
    Platform.fitApp();
    Platform.guard();
    Platform.installMeta();
    Platform.renderHint();
    window.addEventListener('resize', Platform.fitApp);
    window.addEventListener('orientationchange', function () { setTimeout(Platform.fitApp, 60); setTimeout(Platform.fitApp, 400); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', Platform.fitApp);
  }
};
