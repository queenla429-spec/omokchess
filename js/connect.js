/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 — 체스 이식판(연결 진단 강화) */
(function(){
  const $ = (s, r = document) => r.querySelector(s);
  const KEYS = ['apiKey','authDomain','databaseURL','projectId','storageBucket','messagingSenderId','appId','measurementId'];

  // ---------- 1) 구성 코드 읽기: 따옴표 종류·주석·앞뒤 코드·JSON·키 순서에 상관없이 값만 뽑아요 ----------
  function parseFirebaseConfig(text) {
    let raw = String(text || '');
    if (!raw.trim()) throw new Error('코드를 붙여넣어 주세요.');
    raw = raw.replace(/[\u201C\u201D\u201E\u201F\u2033\uFF02]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032\uFF07]/g, "'").replace(/[\u00A0\u200B\uFEFF]/g, ' ')
      // [\uC218\uC815] \uD55C\uAE00 \uC785\uB825\uAE30(\uC804\uAC01)\uB85C \uB4E4\uC5B4\uAC04 \uFF1A \uFF0C \uFF5B \uFF5D \uB3C4 \uC77C\uBC18 \uAE30\uD638\uB85C \uBC14\uAFD4\uC694
      .replace(/\uFF1A/g, ':').replace(/\uFF0C/g, ',').replace(/\uFF5B/g, '{').replace(/\uFF5D/g, '}');
    raw = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w"'])\/\/[^\n]*/g, '$1');
    const cfg = {};
    for (const k of KEYS) {
      const m = raw.match(new RegExp('(?:^|[\\s{,"\'])' + k + '["\']?\\s*[:=]\\s*(["\'`])([^"\'`\\n]*?)\\1'));
      if (m) cfg[k] = m[2].trim();
    }
    if (!Object.keys(cfg).length) throw new Error('firebaseConfig 코드를 찾지 못했어요. Firebase 콘솔의 "const firebaseConfig = { ... };" 부분을 통째로 복사해 붙여넣어 주세요.');
    if (!cfg.apiKey) throw new Error('apiKey 값을 찾지 못했어요. 코드를 중간에 잘라서 복사하지 않았는지 확인하세요.');
    if (/^(\.+|…+|YOUR[_ -]?API[_ -]?KEY|API[_ -]?KEY)$/i.test(cfg.apiKey)) throw new Error('예시 문구가 그대로 들어 있어요. 내 Firebase 프로젝트에서 복사한 실제 코드를 붙여넣어 주세요.');
    if (!/^AIza[\w-]{20,}$/.test(cfg.apiKey)) throw new Error('apiKey 형식이 달라요. (보통 AIza… 로 시작해요) 따옴표 안의 값 전체가 복사됐는지 확인하세요.');
    if (cfg.databaseURL) {
      cfg.databaseURL = cfg.databaseURL.replace(/\/+$/, '');
      if (!/^https:\/\/[\w.-]+\.(firebaseio\.com|firebasedatabase\.app)$/.test(cfg.databaseURL)) throw new Error('databaseURL 형식이 달라요. (https://…firebaseio.com 또는 …firebasedatabase.app) 주소만 들어가 있어야 해요.');
    } else if (!cfg.projectId) {
      throw new Error('projectId 와 databaseURL 이 모두 없어요. 코드 전체를 다시 복사해 주세요.');
    }
    return cfg;
  }

  // ---------- 2) 연결 점검: 흔한 실패 원인을 미리 찾아서 한국어로 알려줘요 ----------
  async function http(url, opt) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal, cache: 'no-store' }, opt));
      let body = null; try { body = await r.json(); } catch {}
      return { status: r.status, body };
    } catch (e) { return { status: 0 }; } finally { clearTimeout(to); }
  }
  const dbExists = s => s === 200 || s === 401 || s === 403 || s === 423;

  async function findDatabaseUrl(cfg) {
    const p = cfg.projectId;
    const cands = [`https://${p}-default-rtdb.firebaseio.com`, `https://${p}-default-rtdb.asia-southeast1.firebasedatabase.app`, `https://${p}-default-rtdb.europe-west1.firebasedatabase.app`, `https://${p}.firebaseio.com`];
    const rs = await Promise.all(cands.map(u => http(u + '/config/master.json')));
    const i = rs.findIndex(r => dbExists(r.status));
    return { url: i >= 0 ? cands[i] : null, offline: rs.every(r => r.status === 0) };
  }

  async function checkConfig(cfg, say) {
    const problems = [], warns = [];
    say = say || (() => {});
    if (!cfg.databaseURL) {
      say('Realtime Database 주소를 찾는 중…');
      const f = await findDatabaseUrl(cfg);
      if (f.url) { cfg.databaseURL = f.url; warns.push('코드에 databaseURL이 없어서 자동으로 찾았어요: ' + f.url); }
      else if (f.offline) throw new Error('Firebase 서버에 접속할 수 없어요. 인터넷 연결(또는 학교 네트워크 차단)을 확인한 뒤 다시 시도하세요.');
      else problems.push('Realtime Database를 아직 만들지 않았어요.\n→ Firebase 콘솔 [빌드 → Realtime Database → 데이터베이스 만들기]를 먼저 하고, 다시 시도하세요.');
    }
    if (cfg.databaseURL) {
      say('데이터베이스 규칙을 확인하는 중…');
      const r = await http(cfg.databaseURL + '/config/master.json');
      if (r.status === 401 || r.status === 403) problems.push('데이터베이스 규칙이 아직 적용되지 않았어요(잠금 모드).\n→ [Realtime Database → 규칙] 탭에 안내 3단계의 규칙을 붙여넣고 반드시 [게시]를 누르세요.');
      else if (r.status === 404) problems.push('databaseURL 주소가 틀린 것 같아요(데이터베이스를 찾을 수 없어요).\n→ 구성 코드를 다시 복사하세요. 데이터베이스를 만든 뒤에 코드를 새로 복사해야 주소가 들어 있어요.');
      else if (r.status === 423) problems.push('데이터베이스가 잠겨 있어요. Firebase 콘솔에서 데이터베이스 상태를 확인하세요.');
      else if (r.status === 0) warns.push('데이터베이스에 접속해 확인하지 못했어요. (네트워크 문제일 수 있어요)');
    }
    say('로그인 설정을 확인하는 중…');
    const a = await http('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(cfg.apiKey),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'connection-check@chess.example.com', password: 'check-0000', returnSecureToken: true }) });
    const errTxt = a.body && a.body.error ? JSON.stringify(a.body.error) : '';
    if (a.status === 0) warns.push('로그인 서버에 접속해 확인하지 못했어요. (네트워크 문제일 수 있어요)');
    else if (/API_KEY_INVALID|API key not valid/i.test(errTxt)) problems.push('apiKey 가 올바르지 않아요.\n→ 구성 코드의 apiKey 를 다시 복사하세요. (다른 프로젝트의 코드는 아닌지 확인)');
    else if (/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/.test(errTxt)) problems.push('이메일/비밀번호 로그인이 꺼져 있어요.\n→ [빌드 → Authentication → 로그인 방법]에서 "이메일/비밀번호"를 사용 설정하고 저장하세요.');
    else if (/CONFIGURATION_NOT_FOUND/.test(errTxt)) problems.push('Authentication을 아직 시작하지 않았어요.\n→ [빌드 → Authentication → 시작하기]를 누른 뒤 "이메일/비밀번호"를 켜세요.');
    else if (/PROJECT_NOT_FOUND/.test(errTxt)) problems.push('프로젝트를 찾을 수 없어요. 구성 코드가 맞는지 확인하세요.');
    else if (a.status === 403) warns.push('API 키에 사용 제한이 걸려 있어 로그인 설정을 확인하지 못했어요. (제한 설정이 맞다면 괜찮아요)');
    return { problems, warns };
  }

  function encodeConfig(cfg) {
    const str = unescape(encodeURIComponent(JSON.stringify(cfg)));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function saveAndReload(cfg) {
    // [수정] firebase-config.js는 databaseURL이 없으면 설정이 없는 것으로 보고 연결 화면으로 되돌려요.
    // 「확인을 건너뛰고 연결」을 눌렀을 때 무한히 연결 화면으로 돌아오던 문제 → 기본 주소를 채워 저장
    if (!cfg.databaseURL && cfg.projectId) cfg.databaseURL = `https://${cfg.projectId}-default-rtdb.firebaseio.com`;
    localStorage.setItem(window.ARENA_KEYS.cfg, JSON.stringify(cfg));
    localStorage.removeItem(window.ARENA_KEYS.demo);
    location.reload();
  }

  // 붙여넣기 → 읽기 → 점검 → 저장. 문제가 있으면 이유를 보여주고, 필요하면 "그래도 연결"을 누를 수 있어요.
  async function connectFlow(text, errEl, btn) {
    const old = document.getElementById('cn-force'); if (old) old.remove();
    const say = (msg, bad) => { errEl.style.whiteSpace = 'pre-line'; errEl.style.color = bad ? '' : 'var(--muted)'; errEl.textContent = msg; };
    if (btn) btn.disabled = true;
    try {
      const cfg = parseFirebaseConfig(text);
      const { problems, warns } = await checkConfig(cfg, say);
      if (problems.length) {
        say('연결 전에 확인할 것이 있어요:\n\n' + problems.map((p, i) => `${i + 1}. ${p}`).join('\n\n'), true);
        const f = document.createElement('button');
        f.type = 'button'; f.id = 'cn-force'; f.className = 'btn xs'; f.style.marginTop = '8px'; f.textContent = '확인을 건너뛰고 이 설정으로 연결';
        f.onclick = () => saveAndReload(cfg);
        errEl.after(f);
      } else {
        say(warns.length ? warns.join('\n') + '\n연결합니다…' : '확인 완료! 연결합니다…');
        saveAndReload(cfg);
      }
    } catch (err) { say(err.message, true); }
    finally { if (btn) btn.disabled = false; }
  }

  const DB_RULES = JSON.stringify({
    rules: {
      config: {
        // [수정] 처음 설정 때 master와 masterName을 한 번에 저장하면, 저장 전 데이터(root)에는 아직 master가 없어서 거부되던 문제
        master: { ".read": true, ".write": "auth != null && !data.exists() && newData.val() === auth.uid" },
        masterName: { ".read": "auth != null", ".write": "auth != null && (root.child('config/master').val() === auth.uid || newData.parent().child('master').val() === auth.uid)" },
        joinCode: { ".read": "auth != null", ".write": "auth != null && (root.child('config/master').val() === auth.uid || newData.parent().child('master').val() === auth.uid)" }
      },
      classList: { ".read": true, ".write": "auth != null" },
      members: { "$uid": { ".read": "auth != null", ".write": "auth != null" } },
      classes: { "$cid": { pub: { ".read": true, ".write": "auth != null" }, ".read": "auth != null", ".write": "auth != null" } }
    }
  }, null, 2);

  const SLIDES = [
    { chip: '1. 프로젝트', title: '1단계: Firebase 프로젝트 만들기',
      body: `<ol>
        <li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a>에 구글 계정으로 로그인합니다.</li>
        <li><span class="cn-red">프로젝트 만들기</span>(또는 프로젝트 추가)를 누르고 이름(예: <code>chess-arena</code>)을 입력한 뒤 계속 진행해 만듭니다.</li></ol>` },
    { chip: '2. 로그인 기능', title: '2단계: 이메일/비밀번호 로그인 켜기',
      body: `<ol>
        <li>왼쪽 메뉴에서 <span class="cn-red">빌드 → Authentication</span>을 누르고 <b>시작하기</b>를 클릭합니다.</li>
        <li>로그인 제공업체 목록에서 <span class="cn-red">이메일/비밀번호</span>를 선택하고, 맨 위 <b>사용 설정</b> 스위치를 켠 뒤 <b>저장</b>합니다.</li></ol>` },
    { chip: '3. 데이터베이스', title: '3단계: Realtime Database 만들기 & 규칙 붙여넣기',
      body: `<ol>
        <li>왼쪽 메뉴에서 <span class="cn-red">빌드 → Realtime Database</span>를 누르고 <b>데이터베이스 만들기</b>를 클릭합니다.</li>
        <li>위치는 기본값(또는 싱가포르)으로 두고, 보안 규칙은 <b>잠금 모드</b>로 시작합니다.</li>
        <li>상단 <span class="cn-red">규칙(Rules)</span> 탭을 눌러 기존 내용을 지우고 아래 규칙을 붙여넣은 뒤 <b>게시</b>를 누릅니다.</li></ol>
      <div class="cn-rules" id="cn-rules-box">${DB_RULES}</div>
      <button class="btn sm" type="button" id="cn-copy-rules">규칙 복사하기</button>` },
    { chip: '4. 연결 코드', title: '4단계: 웹 앱 등록 후 연결 코드 붙여넣기',
      body: `<ol>
        <li>왼쪽 위 톱니바퀴 <span class="cn-red">프로젝트 설정 → 일반</span>으로 이동합니다.</li>
        <li>아래쪽 「내 앱」에서 <span class="cn-red">&lt;/&gt; (웹)</span> 아이콘을 누르고 앱 닉네임(예: <code>chess</code>)을 적은 뒤 <b>앱 등록</b>을 누릅니다. (Firebase Hosting 설정은 체크하지 않아도 돼요)</li>
        <li>화면에 나오는 <code>const firebaseConfig = { ... };</code> 코드를 복사해 아래 칸에 붙여넣으세요. <b>import 줄이나 주석이 같이 들어가도 괜찮아요.</b></li></ol>
      <p class="muted" style="font-size:.86em;margin:4px 0 8px">이미 앱을 등록했다면: 프로젝트 설정 → 일반 → 내 앱 → <b>SDK 설정 및 구성</b>에서 다시 복사할 수 있어요. 코드에 <code>databaseURL</code>이 없어도 자동으로 찾아 드려요.</p>
      <textarea id="cn-config" rows="6" spellcheck="false" placeholder="const firebaseConfig = {\n  apiKey: &quot;...&quot;,\n  ...\n};"></textarea>
      <button class="btn primary lg" type="button" id="cn-connect-go" style="margin-top:10px">연결 확인하고 시작하기</button>
      <p class="err" id="cn-err"></p>` }
  ];

  let slideIdx = 0;
  function renderGuide() {
    const chips = $('#cn-chips'), track = $('#cn-track'), count = $('#cn-count');
    if (!chips || !track) return;
    chips.innerHTML = SLIDES.map((s, i) => `<button type="button" data-si="${i}" class="${i === slideIdx ? 'on' : ''}">${s.chip}</button>`).join('');
    const cur = SLIDES[slideIdx];
    track.innerHTML = `<div class="cn-slide"><h4>${cur.title}</h4>${cur.body}</div>`;
    count.textContent = `${slideIdx + 1} / ${SLIDES.length}`;
    $('#cn-prev').disabled = slideIdx === 0;
    $('#cn-next').disabled = slideIdx === SLIDES.length - 1;
    const copyBtn = $('#cn-copy-rules');
    if (copyBtn) copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(DB_RULES); copyBtn.textContent = '복사 완료!'; }
      catch { const r = document.createRange(); r.selectNodeContents($('#cn-rules-box')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copyBtn.textContent = '선택됨 — Ctrl+C로 복사하세요'; }
      setTimeout(() => { copyBtn.textContent = '규칙 복사하기'; }, 2000);
    };
    const goBtn = $('#cn-connect-go');
    if (goBtn) goBtn.onclick = () => connectFlow($('#cn-config').value, $('#cn-err'), goBtn);
  }

  function showConnectView(view) {
    $('#cn-home').classList.toggle('hidden', view !== 'home');
    $('#cn-guide').classList.toggle('hidden', view !== 'guide');
    $('#cn-relink').classList.toggle('hidden', view !== 'relink');
    $('.connect-card').classList.toggle('wide', view === 'guide');
    if (view === 'guide') renderGuide();
  }

  window.addEventListener('DOMContentLoaded', () => {
    $('#cn-start')?.addEventListener('click', () => { slideIdx = 0; showConnectView('guide'); });
    $('#cn-again')?.addEventListener('click', () => showConnectView('relink'));
    $('#cn-back')?.addEventListener('click', () => showConnectView('home'));
    $('#cn-again-back')?.addEventListener('click', () => showConnectView('home'));
    $('#cn-prev')?.addEventListener('click', () => { if (slideIdx > 0) { slideIdx--; renderGuide(); } });
    $('#cn-next')?.addEventListener('click', () => { if (slideIdx < SLIDES.length - 1) { slideIdx++; renderGuide(); } });
    $('#cn-chips')?.addEventListener('click', e => { const b = e.target.closest('[data-si]'); if (b) { slideIdx = Number(b.dataset.si); renderGuide(); } });

    $('#cn-again-form')?.addEventListener('submit', e => {
      e.preventDefault();
      connectFlow($('#cn-again-config').value, $('#cn-again-err'), e.target.querySelector('button[type=submit]'));
    });

    $('#cn-link-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const val = $('#cn-link').value.trim();
      const m = val.match(/[#&]fb=([^&\s]+)/);
      if (!m) { $('#cn-link-err').textContent = '접속 링크에 연결 정보(#fb=...)가 없습니다. 선생님께 받은 링크를 통째로 붙여넣어 주세요.'; return; }
      try {
        const b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
        const cfg = JSON.parse(decodeURIComponent(escape(atob(b64))));
        if (!cfg.apiKey || !(cfg.databaseURL || cfg.projectId)) throw new Error();   // [수정] databaseURL 없이 연결된 반의 접속 링크도 열리게
        saveAndReload(cfg);
      } catch { $('#cn-link-err').textContent = '올바른 접속 링크가 아닙니다.'; }
    });

    $('#cn-demo')?.addEventListener('click', () => { localStorage.setItem(window.ARENA_KEYS.demo, '1'); location.reload(); });
    $('#demo-exit')?.addEventListener('click', () => { localStorage.removeItem(window.ARENA_KEYS.demo); location.reload(); });
    // [추가] 처음 설정 화면: 어느 Firebase에 연결됐는지 보여 주고, 다른 Firebase로 바꿀 수 있게
    const cfgNow = window.OMOK_FB_CONFIG;
    const pid = $('#setup-project');
    if (pid && cfgNow) pid.textContent = cfgNow.projectId || (cfgNow.databaseURL || '').replace(/^https:\/\//, '');
    $('#setup-relink')?.addEventListener('click', () => {
      try { localStorage.removeItem(window.ARENA_KEYS.cfg); } catch {}
      location.href = location.pathname;
    });
    $('#relink')?.addEventListener('click', () => { window.App.show('connect'); showConnectView('relink'); });

    $('#forgot-master')?.addEventListener('click', () => {
      window.App.modal(`<h3>master 비밀번호 재설정</h3>
        <div class="forgot-box"><ol class="forgot-steps">
          <li><a href="https://console.firebase.google.com/" target="_blank" rel="noopener">Firebase 콘솔</a> → <b>Authentication → Users</b>로 이동합니다.</li>
          <li><code>master@omok.example.com</code> 계정을 찾아 오른쪽 점 3개 메뉴에서 <b>계정 삭제</b>를 누릅니다.</li>
          <li><b>Realtime Database</b>에서 <code>config/master</code> 항목을 삭제한 뒤 이 페이지를 새로고침하면 처음 설정 화면이 다시 열립니다.</li>
        </ol></div>
        <div class="foot"><button class="btn primary" data-close>확인</button></div>`);
    });
  });

  window.OmokConnect = { parseFirebaseConfig, checkConfig, connectFlow };
  // [수정] 바탕화면 파일(file://)로 열었을 때 학생이 열 수 없는 링크가 만들어지던 문제
  // → 경고를 띄우고, 선생님이 입력한 GitHub Pages 주소로 링크·QR을 만들어요.
  const SITE_KEY = 'chessSiteUrl';
  const cleanSite = v => {
    v = String(v || '').trim().split('#')[0].split('?')[0];
    if (!/^https?:\/\//i.test(v)) return '';
    if (/\.html?$/i.test(v)) return v;
    return v.replace(/\/*$/, '/');
  };
  window.OmokShare = function(cid, cname) {
    const cfg = window.OMOK_FB_CONFIG;
    const esc = window.App.esc;
    const isFile = location.protocol === 'file:';
    let saved = ''; try { saved = cleanSite(localStorage.getItem(SITE_KEY)); } catch {}
    const baseOf = () => isFile ? saved : location.origin + location.pathname;
    const urlOf = () => { const base = baseOf(); if (!base) return ''; return cfg ? `${base}?c=${encodeURIComponent(cid)}#fb=${encodeConfig(cfg)}` : `${base}?c=${encodeURIComponent(cid)}`; };
    const m = window.App.modal(`<h3>학생 접속 링크 · QR (${esc(cname || cid)})</h3>
      ${isFile ? `<div class="forgot-warn"><b>지금은 내 컴퓨터의 파일로 열려 있어요.</b> 이 주소는 학생 기기에서 열리지 않아요.<br>GitHub Pages 주소(예: <code>https://내아이디.github.io/chess-arena/</code>)를 아래에 입력하면 그 주소로 링크와 QR을 만들어 드려요.</div>
      <label>사이트 주소<input id="sh-site" placeholder="https://내아이디.github.io/chess-arena/" value="${esc(saved)}" autocapitalize="none" spellcheck="false"></label>
      <div class="foot" style="margin-top:0"><button class="btn sm" id="sh-site-go">이 주소로 만들기</button></div>` : ''}
      <p class="muted" style="margin-top:0;font-size:.9em">학생 태블릿·크롬북으로 아래 QR 코드를 찍거나 접속 링크를 공유하세요. 반 코드(<b>${esc(cid)}</b>)와 서버 연결 정보가 함께 들어 있습니다.</p>
      <div class="share-qr" id="sh-qr"></div>
      <label>접속 링크<textarea id="sh-link" rows="3" readonly></textarea></label>
      <div class="foot"><button class="btn ghost" data-close>닫기</button><button class="btn primary" id="sh-copy">링크 복사</button></div>`);
    const paint = () => {
      const url = urlOf();
      m.el.querySelector('#sh-link').value = url || '먼저 위에 사이트 주소를 입력하세요.';
      m.el.querySelector('#sh-qr').innerHTML = url ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}" alt="QR Code" style="width:200px;height:200px;display:block">` : '<p class="muted" style="font-size:.85em">주소를 입력하면 QR이 나와요</p>';
      m.el.querySelector('#sh-copy').disabled = !url;
    };
    const go = m.el.querySelector('#sh-site-go');
    if (go) go.onclick = () => {
      const v = cleanSite(m.el.querySelector('#sh-site').value);
      if (!v) { window.App.toast('https:// 로 시작하는 사이트 주소를 입력하세요.', 'bad'); return; }
      saved = v; try { localStorage.setItem(SITE_KEY, v); } catch {}
      m.el.querySelector('#sh-site').value = v; paint();
    };
    paint();
    m.el.querySelector('#sh-copy').onclick = async () => {
      const url = urlOf(); if (!url) return;
      try { await navigator.clipboard.writeText(url); window.App.toast('접속 링크를 복사했어요.', 'good'); }
      catch { const t = m.el.querySelector('#sh-link'); t.select(); window.App.toast('링크를 선택했어요. Ctrl+C로 복사하세요.'); }
    };
  };
})();
