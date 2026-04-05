// ========== INIT.JS ==========
// Загружается ПОСЛЕДНИМ. Все функции из других файлов уже доступны.
// Зависит от: config.js, app.js, arena.js, agents.js, history.js, rating.js, debate.js
// Предоставляет: автологин, проверка целостности

(function() {
  var missing = [];
  try { if (!CONFIG) throw 0; } catch(e) { missing.push('config.js'); }
  try { if (!sb) throw 0; } catch(e) { missing.push('app.js'); }
  try { if (typeof runTask !== 'function') throw 0; } catch(e) { missing.push('arena.js'); }
  try { if (typeof renderMyAgents !== 'function') throw 0; } catch(e) { missing.push('agents.js'); }
  try { if (typeof loadHistory !== 'function') throw 0; } catch(e) { missing.push('history.js'); }
  try { if (typeof loadRatings !== 'function') throw 0; } catch(e) { missing.push('rating.js'); }
  try { if (typeof initDebate !== 'function') throw 0; } catch(e) { missing.push('debate.js'); }

  if (missing.length > 0) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#f85149;">' +
      '<h2>Ошибка загрузки</h2><p>Не загрузились файлы: <b>' + missing.join(', ') + '</b></p>' +
      '<p style="color:#8b949e">Убедитесь что все 10 файлов загружены в Cloudflare.</p></div>';
    return;
  }

  // Автологин
  (async function() {
    try {
      var s = await sb.auth.getSession();
      if (s.data.session && s.data.session.user) enterApp(s.data.session.user);
    } catch(e) { console.warn('Auto-login failed:', e); }
  })();

  // Слушаем авторизацию
  sb.auth.onAuthStateChange(function(ev, session) {
    if (ev === 'SIGNED_IN' && session && session.user && !currentUser) enterApp(session.user);
    if (ev === 'SIGNED_OUT') exitApp();
  });
})();
