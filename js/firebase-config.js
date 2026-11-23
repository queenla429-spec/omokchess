/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  // [수정] GitHub Pages는 같은 계정의 저장소들이 같은 주소(아이디.github.io)를 함께 써서
  // 다른 저장소에서 저장한 Firebase 연결 정보를 그대로 읽던 문제 → 사이트 경로별로 따로 저장
  const SCOPE = location.pathname.replace(/[^/]*$/, '') || '/';
  const KEYS = window.ARENA_KEYS = { cfg: 'arenaFirebaseConfig@' + SCOPE, demo: 'arenaDemoMode@' + SCOPE };
  // 주소 끝에 ?reset 을 붙여 열면 이 브라우저에 저장된 연결 정보를 지워요
  if (/[?&]reset(=|&|$)/.test(location.search)) {
    try { localStorage.removeItem(KEYS.cfg); localStorage.removeItem(KEYS.demo); } catch {}
    history.replaceState(null, '', location.pathname);
  }
  function decodeFb(raw) {
    try {
      const b64 = decodeURIComponent(raw).replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      const obj = JSON.parse(json);
      if (obj && obj.apiKey && obj.databaseURL) return obj;
    } catch {}
    return null;
  }

  let cfg = null;
  const hash = location.hash || '';
  const m = hash.match(/[#&]fb=([^&]+)/);
  if (m) {
    cfg = decodeFb(m[1]);
    if (cfg) {
      try {
        localStorage.setItem(KEYS.cfg, JSON.stringify(cfg));
        localStorage.removeItem(KEYS.demo);
      } catch {}
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  const sp = new URLSearchParams(location.search);
  const cls = sp.get('c');
  if (cls) {
    try { localStorage.setItem('omokClassCode', cls.trim().toLowerCase()); } catch {}
  }

  if (!cfg) {
    try {
      const saved = localStorage.getItem(KEYS.cfg);
      if (saved) cfg = JSON.parse(saved);
    } catch {}
  }

  let isDemo = false;
  try { isDemo = localStorage.getItem(KEYS.demo) === '1'; } catch {}

  if (cfg && cfg.apiKey && cfg.databaseURL) {
    window.OMOK_FB_CONFIG = cfg;
    window.OMOK_NEEDS_CONNECT = false;
  } else if (isDemo) {
    window.OMOK_FB_CONFIG = null;
    window.OMOK_NEEDS_CONNECT = false;
  } else {
    window.OMOK_FB_CONFIG = null;
    window.OMOK_NEEDS_CONNECT = true;
  }
})();
