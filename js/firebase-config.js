/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
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
        localStorage.setItem('omokFirebaseConfig', JSON.stringify(cfg));
        localStorage.removeItem('omokDemoMode');
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
      const saved = localStorage.getItem('omokFirebaseConfig');
      if (saved) cfg = JSON.parse(saved);
    } catch {}
  }

  let isDemo = false;
  try { isDemo = localStorage.getItem('omokDemoMode') === '1'; } catch {}

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
