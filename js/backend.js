/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const isDemo = !window.OMOK_FB_CONFIG;
  const authListeners = new Set();
  const demoListeners = new Map();
  let serverOffset = 0;
  let fbApp = null, workerApp = null, fbAuth = null, workerAuth = null, fbDb = null;

  const toEmail = k => `${String(k).trim().toLowerCase()}@omok.example.com`;
  const now = () => Date.now() + serverOffset;
  const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // --- Demo Storage Engine ---
  const DEMO_KEY = 'omokDemoStore_v1';
  const DEMO_UID_KEY = 'omokDemoUid';
  function loadDemo() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const init = {
      config: { master: 'demo_master', masterName: '선생님', joinCode: 'demo' },
      classList: { '3-2': { name: '3학년 2반 (데모)', teacherName: '선생님', createdAt: Date.now() } },
      members: {
        demo_s1: { cid: '3-2', role: 'student' },
        demo_s2: { cid: '3-2', role: 'student' },
        demo_s3: { cid: '3-2', role: 'student' }
      },
      auth: {
        'master': { uid: 'demo_master', pw: '123456' },
        '3-2.kim01': { uid: 'demo_s1', pw: '123456' },
        '3-2.lee02': { uid: 'demo_s2', pw: '123456' },
        '3-2.park03': { uid: 'demo_s3', pw: '123456' }
      },
      classes: {
        '3-2': {
          meta: { name: '3학년 2반 (데모)', teacherName: '선생님', createdAt: Date.now() },
          pub: { name: '3학년 2반 (데모)' },
          users: {
            demo_s1: { loginId: 'kim01', name: '김민준', score: 1120, placed: 5, wins: 7, losses: 3, draws: 0, rankGames: 10 },
            demo_s2: { loginId: 'lee02', name: '이서연', score: 1035, placed: 5, wins: 5, losses: 5, draws: 0, rankGames: 10 },
            demo_s3: { loginId: 'park03', name: '박지호', score: 960, placed: 3, wins: 2, losses: 1, draws: 0, rankGames: 3 }
          },
          secrets: {
            demo_s1: { pw: '123456', loginId: 'kim01' },
            demo_s2: { pw: '123456', loginId: 'lee02' },
            demo_s3: { pw: '123456', loginId: 'park03' }
          }
        }
      }
    };
    saveDemo(init);
    return init;
  }

  function getByPath(obj, path) {
    if (!path) return obj;
    const parts = path.split('/').filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[p];
    }
    return cur === undefined ? null : JSON.parse(JSON.stringify(cur));
  }

  function setByPath(obj, path, val) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (val === null || val === undefined) delete cur[last];
    else cur[last] = JSON.parse(JSON.stringify(val));
  }

  function notifyDemo() {
    const store = loadDemo();
    for (const [path, cbs] of demoListeners.entries()) {
      const val = getByPath(store, path);
      cbs.forEach(cb => cb(val));
    }
  }

  function saveDemo(store) {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(store)); } catch {}
    notifyDemo();
  }

  window.addEventListener('storage', e => {
    if (e.key === DEMO_KEY) notifyDemo();
  });

  // --- Firebase SDK Loader ---
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Firebase SDK 로드 실패'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (isDemo) {
      setTimeout(() => {
        let uid = null;
        try { uid = sessionStorage.getItem(DEMO_UID_KEY); } catch {}
        authListeners.forEach(cb => cb(uid || null));
      }, 60);
      return;
    }
    if (!window.firebase) {
      const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
      await loadScript(base + 'firebase-app-compat.js');
      await loadScript(base + 'firebase-auth-compat.js');
      await loadScript(base + 'firebase-database-compat.js');
    }
    if (!fbApp) {
      fbApp = firebase.initializeApp(window.OMOK_FB_CONFIG);
      workerApp = firebase.initializeApp(window.OMOK_FB_CONFIG, 'worker');
      fbAuth = fbApp.auth();
      workerAuth = workerApp.auth();
      fbDb = fbApp.database();
      fbDb.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; });
      fbAuth.onAuthStateChanged(u => authListeners.forEach(cb => cb(u ? u.uid : null)));
    }
  }

  window.Backend = {
    mode: isDemo ? 'demo' : 'firebase',
    init,
    now,
    newKey,
    onAuth(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signIn(loginKey, pw) {
      const k = String(loginKey).trim().toLowerCase();
      if (isDemo) {
        const st = loadDemo();
        const rec = st.auth && st.auth[k];
        if (!rec || rec.pw !== pw) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다. (데모 계정: master / 123456 또는 반 코드 3-2, kim01 / 123456)');
        try { sessionStorage.setItem(DEMO_UID_KEY, rec.uid); } catch {}
        authListeners.forEach(cb => cb(rec.uid));
        return rec.uid;
      }
      const cred = await fbAuth.signInWithEmailAndPassword(toEmail(k), pw);
      return cred.user.uid;
    },
    async signUpSelf(loginKey, pw) {
      const k = String(loginKey).trim().toLowerCase();
      if (isDemo) {
        const st = loadDemo();
        if (st.auth && st.auth[k]) { const e = new Error('이미 존재하는 계정'); e.kind = 'exists'; throw e; }
        const uid = 'demo_' + newKey();
        st.auth[k] = { uid, pw };
        saveDemo(st);
        try { sessionStorage.setItem(DEMO_UID_KEY, uid); } catch {}
        return uid;
      }
      try {
        const cred = await fbAuth.createUserWithEmailAndPassword(toEmail(k), pw);
        return cred.user.uid;
      } catch (err) {
        if (err && err.code === 'auth/email-already-in-use') err.kind = 'exists';
        throw err;
      }
    },
    async deleteSelf() {
      if (isDemo) return;
      if (fbAuth.currentUser) await fbAuth.currentUser.delete();
    },
    async signOut() {
      if (isDemo) {
        try { sessionStorage.removeItem(DEMO_UID_KEY); } catch {}
        authListeners.forEach(cb => cb(null));
        return;
      }
      await fbAuth.signOut();
    },
    async createAccount(loginKey, pw) {
      const k = String(loginKey).trim().toLowerCase();
      if (isDemo) {
        const st = loadDemo();
        const uid = 'demo_' + newKey();
        st.auth[k] = { uid, pw };
        saveDemo(st);
        return uid;
      }
      // [수정] 예전에 같은 반 코드·아이디로 만든 계정이 Firebase에 남아 있으면 영어 오류만 뜨던 문제
      // → 같은 비밀번호면 그 계정을 그대로 다시 쓰고, 아니면 한국어로 해결 방법을 알려 줘요.
      try {
        const cred = await workerAuth.createUserWithEmailAndPassword(toEmail(k), pw);
        const uid = cred.user.uid;
        await workerAuth.signOut();
        return uid;
      } catch (err) {
        if (!err || err.code !== 'auth/email-already-in-use') throw err;
        try {
          const cred = await workerAuth.signInWithEmailAndPassword(toEmail(k), pw);
          const uid = cred.user.uid;
          await workerAuth.signOut();
          return uid;
        } catch {
          throw new Error(`예전에 만든 '${k.split('.').pop()}' 계정이 Firebase에 남아 있어요. 다른 아이디를 쓰거나, Firebase 콘솔 → Authentication → 사용자에서 ${toEmail(k)} 를 삭제한 뒤 다시 등록하세요.`);
        }
      }
    },
    async deleteAccount(loginKey, pw) {
      const k = String(loginKey).trim().toLowerCase();
      if (isDemo) {
        const st = loadDemo();
        delete st.auth[k];
        saveDemo(st);
        return;
      }
      if (!pw) return;
      const cred = await workerAuth.signInWithEmailAndPassword(toEmail(k), pw);
      await cred.user.delete();
    },
    async setPassword(loginKey, oldPw, newPw) {
      if (String(newPw).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
      const k = String(loginKey).trim().toLowerCase();
      if (isDemo) {
        const st = loadDemo();
        if (!st.auth[k] || st.auth[k].pw !== oldPw) throw new Error('현재 비밀번호가 일치하지 않습니다.');
        st.auth[k].pw = newPw;
        saveDemo(st);
        return;
      }
      const cred = await workerAuth.signInWithEmailAndPassword(toEmail(k), oldPw);
      await cred.user.updatePassword(newPw);
      await workerAuth.signOut();
    },
    async get(path) {
      if (isDemo) return getByPath(loadDemo(), path);
      const snap = await fbDb.ref(path).once('value');
      return snap.val();
    },
    async set(path, val) {
      if (isDemo) {
        const st = loadDemo();
        setByPath(st, path, val);
        saveDemo(st);
        return;
      }
      await fbDb.ref(path).set(val);
    },
    async update(path, updates) {
      if (isDemo) {
        const st = loadDemo();
        const prefix = path ? path.replace(/\/$/, '') + '/' : '';
        for (const [k, v] of Object.entries(updates || {})) setByPath(st, prefix + k, v);
        saveDemo(st);
        return;
      }
      await fbDb.ref(path || '/').update(updates);
    },
    async remove(path) {
      if (isDemo) {
        const st = loadDemo();
        setByPath(st, path, null);
        saveDemo(st);
        return;
      }
      await fbDb.ref(path).remove();
    },
    on(path, cb) {
      if (isDemo) {
        if (!demoListeners.has(path)) demoListeners.set(path, new Set());
        demoListeners.get(path).add(cb);
        setTimeout(() => cb(getByPath(loadDemo(), path)), 0);
        return () => {
          const s = demoListeners.get(path);
          if (s) { s.delete(cb); if (!s.size) demoListeners.delete(path); }
        };
      }
      const ref = fbDb.ref(path);
      const fn = s => cb(s.val());
      ref.on('value', fn);
      return () => ref.off('value', fn);
    },
    async tx(path, fn) {
      if (isDemo) {
        const st = loadDemo();
        const cur = getByPath(st, path);
        const next = fn(cur);
        if (next === undefined) return { committed: false };
        setByPath(st, path, next);
        saveDemo(st);
        return { committed: true };
      }
      const res = await fbDb.ref(path).transaction(cur => fn(cur));
      return { committed: res.committed };
    },
    setupPresence(path, dataFn) {
      if (isDemo) return;
      fbDb.ref('.info/connected').on('value', s => {
        if (!s.val()) return;
        const ref = fbDb.ref(path);
        ref.onDisconnect().remove();
        ref.set(dataFn());
      });
    },
    resetDemo() {
      try {
        localStorage.removeItem(DEMO_KEY);
        sessionStorage.removeItem(DEMO_UID_KEY);
      } catch {}
    }
  };
})();