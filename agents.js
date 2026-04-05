// ========== AGENTS.JS ==========
// Зависит от: app.js (sb, $, esc, currentUser, customAgents, loadCustomAgents, renderAgentSelector)
// Предоставляет: renderMyAgents, editAgent, deleteAgent

function renderMyAgents() {
  const mine = customAgents.filter(a => a.owner_id === currentUser.id);
  const others = customAgents.filter(a => a.owner_id !== currentUser.id);
  const el = $('agentsGrid');
  if (!mine.length && !others.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🤖</div><p>У тебя пока нет агентов. Создай первого!</p></div>';
    return;
  }
  let h = '';
  h += mine.map(a => agentCard(a, true)).join('');
  if (others.length) {
    h += `<div style="grid-column:1/-1;margin-top:20px;font-size:0.85rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">Агенты сообщества</div>`;
    h += others.map(a => agentCard(a, false)).join('');
  }
  el.innerHTML = h;
}

function agentCard(a, mine) {
  return `<div class="agent-card">
    <div class="agent-card-top"><div class="agent-card-emoji" style="background:${escAttr(a.color)}22;border:1px solid ${escAttr(a.color)}44">${esc(a.emoji)}</div>
    <div class="agent-card-info"><h3>${esc(a.name)}</h3><span class="agent-model-badge">${a.model}</span></div></div>
    <div class="agent-card-desc">${esc(a.description || 'Без описания')}</div>
    ${a.system_prompt ? `<div class="agent-card-prompt">${esc(a.system_prompt)}</div>` : ''}
    ${mine ? `<div class="agent-card-actions"><button class="btn btn-sm" onclick="editAgent('${a.dbId}')">Изменить</button><button class="btn btn-sm btn-danger" onclick="deleteAgent('${a.dbId}')">Удалить</button></div>` : ''}
  </div>`;
}

// ========== AGENT FORM ==========
$('addAgentBtn').addEventListener('click', () => openAgentForm());
$('agentColor').addEventListener('input', e => { $('agentColorHex').textContent = e.target.value; });
$('cancelAgentBtn').addEventListener('click', closeAgentForm);
$('agentFormOverlay').addEventListener('click', e => { if (e.target === $('agentFormOverlay')) closeAgentForm(); });

function openAgentForm(agent) {
  $('editAgentId').value = agent?.dbId || '';
  $('agentFormTitle').textContent = agent ? 'Редактировать агента' : 'Создать агента';
  $('agentEmoji').value = agent?.emoji || '🤖';
  $('agentName').value = agent?.name || '';
  $('agentDesc').value = agent?.description || '';
  $('agentModel').value = agent?.model || 'gpt-4o-mini';
  $('agentColor').value = agent?.color || '#22d3ee';
  $('agentColorHex').textContent = agent?.color || '#22d3ee';
  $('agentPrompt').value = agent?.system_prompt || '';
  $('agentFormMsg').textContent = '';
  $('agentFormOverlay').classList.add('active');
}

function closeAgentForm() { $('agentFormOverlay').classList.remove('active'); }

$('saveAgentBtn').addEventListener('click', async () => {
  const name = $('agentName').value.trim(), msg = $('agentFormMsg');
  msg.textContent = ''; msg.className = 'auth-msg';
  if (!name) { msg.textContent = 'Введи имя агента'; msg.classList.add('error'); return; }
  const payload = {
    owner_id: currentUser.id, name,
    description: $('agentDesc').value.trim(),
    emoji: $('agentEmoji').value || '🤖',
    color: $('agentColor').value,
    model: $('agentModel').value,
    system_prompt: $('agentPrompt').value.trim(),
    is_public: true
  };
  const editId = $('editAgentId').value;
  let error;
  if (editId) ({ error } = await sb.from('custom_agents').update(payload).eq('id', editId));
  else ({ error } = await sb.from('custom_agents').insert(payload));
  if (error) { msg.textContent = error.message; msg.classList.add('error'); return; }
  closeAgentForm();
  await loadCustomAgents();
  renderAgentSelector();
  renderMyAgents();
});

async function editAgent(dbId) {
  const a = customAgents.find(x => x.dbId === dbId);
  if (a) openAgentForm(a);
}

async function deleteAgent(dbId) {
  if (!confirm('Удалить агента?')) return;
  await sb.from('custom_agents').delete().eq('id', dbId);
  await loadCustomAgents();
  renderAgentSelector();
  renderMyAgents();
}

window.editAgent = editAgent;
window.deleteAgent = deleteAgent;
