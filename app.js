// ========== APP.JS ==========
// Зависит от: config.js (CONFIG, BASE_AGENTS), supabase-js (CDN)
// Предоставляет: sb, $, esc, findAgent, currentUser, allAgents, customAgents,
//   selectedAgents, enterApp, exitApp, loadCustomAgents, renderAgentSelector

let allAgents = [...BASE_AGENTS];
let customAgents = [];
let currentUser = null;
let selectedAgents = new Set(['gpt-4o-mini', 'gpt-4o']);

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escAttr = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
const findAgent = id => allAgents.find(a => a.id === id) || { name:'Unknown', color:'#888', emoji:'🤖' };

// ========== AUTH ==========
let authMode = 'login';

document.querySelectorAll('.auth-tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    authMode = t.dataset.mode;
    $('authSubmit').textContent = authMode === 'login' ? 'Войти' : 'Создать аккаунт';
    $('authMsg').textContent = '';
  });
});

$('authSubmit').addEventListener('click', async () => {
  const email = $('authEmail').value.trim(), pass = $('authPass').value, msg = $('authMsg');
  msg.textContent = ''; msg.className = 'auth-msg';
  if (!email || !pass) { msg.textContent = 'Заполни оба поля'; msg.classList.add('error'); return; }
  if (pass.length < 6) { msg.textContent = 'Пароль — минимум 6 символов'; msg.classList.add('error'); return; }
  $('authSubmit').disabled = true; $('authSubmit').textContent = '...';
  try {
    let r;
    if (authMode === 'signup') {
      r = await sb.auth.signUp({ email, password: pass });
      if (r.error) throw r.error;
      if (r.data?.user?.identities?.length === 0) { msg.textContent = 'Email уже зарегистрирован'; msg.classList.add('error'); return; }
      msg.textContent = 'Проверь почту для подтверждения!'; msg.classList.add('ok'); return;
    } else {
      r = await sb.auth.signInWithPassword({ email, password: pass });
      if (r.error) throw r.error;
      enterApp(r.data.user);
    }
  } catch(e) { msg.textContent = e.message || 'Ошибка'; msg.classList.add('error'); }
  finally { $('authSubmit').disabled = false; $('authSubmit').textContent = authMode === 'login' ? 'Войти' : 'Создать аккаунт'; }
});

$('authPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('authSubmit').click(); });

// Автологин и onAuthStateChange вынесены в init.js (загружается последним)

async function enterApp(user) {
  currentUser = user;
  $('authPage').classList.remove('active');
  $('mainHeader').style.display = '';
  $('arenaPage').classList.add('active');
  $('userEmail').textContent = user.email;
  await loadCustomAgents();
  renderAgentSelector();
  loadHistory();
  loadRatings();
}

function exitApp() {
  currentUser = null;
  allAgents = [...BASE_AGENTS];
  customAgents = [];
  selectedAgents = new Set(['gpt-4o-mini', 'gpt-4o']);
  $('mainHeader').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('authPage').classList.add('active');
}

$('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); exitApp(); });

// ========== NAV ==========
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $(btn.dataset.page + 'Page').classList.add('active');
    if (btn.dataset.page === 'history') loadHistory();
    if (btn.dataset.page === 'rating') loadRatings();
    if (btn.dataset.page === 'agents') renderMyAgents();
    if (btn.dataset.page === 'debate') initDebate();
  });
});

// ========== CUSTOM AGENTS LOADER ==========
async function loadCustomAgents() {
  const { data } = await sb.from('custom_agents').select('*').order('created_at');
  customAgents = (data || []).map(a => ({
    id: 'custom_' + a.id, dbId: a.id, name: a.name, emoji: a.emoji || '🤖',
    color: a.color || '#888', model: a.model, system_prompt: a.system_prompt || '',
    description: a.description || '', owner_id: a.owner_id, isBase: false
  }));
  allAgents = [...BASE_AGENTS, ...customAgents];
}

// ========== AGENT SELECTOR ==========
function renderAgentSelector() {
  const el = $('agentSelector');
  el.innerHTML = allAgents.map(a => {
    const s = selectedAgents.has(a.id);
    return `<div class="agent-chip ${s ? 'selected' : ''}" data-agent="${escAttr(a.id)}" style="${s ? 'border-color:'+escAttr(a.color)+';color:'+escAttr(a.color)+';background:'+escAttr(a.color)+'1a' : ''}">${esc(a.emoji)} ${esc(a.name)}</div>`;
  }).join('');
  el.querySelectorAll('.agent-chip').forEach(c => {
    c.addEventListener('click', () => {
      const id = c.dataset.agent;
      if (selectedAgents.has(id)) selectedAgents.delete(id);
      else selectedAgents.add(id);
      renderAgentSelector();
    });
  });
}
