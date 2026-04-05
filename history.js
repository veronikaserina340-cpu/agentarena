// ========== HISTORY.JS ==========
// Зависит от: app.js (sb, $, esc, currentUser, findAgent)
// Предоставляет: loadHistory, openDetail, closeDetail

async function loadHistory() {
  // Load debates
  const { data: debates } = await sb.from('debates').select('id,topic,status,current_round,created_at')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
  const debateEl = $('debateHistoryList');
  if (debateEl) {
    if (debates?.length) {
      debateEl.innerHTML = debates.map(d => {
        const date = new Date(d.created_at).toLocaleString('ru');
        const statusIcon = d.status === 'done' ? '✅' : d.status === 'paused' ? '⏸' : '🔄';
        return `<div class="history-item">
          <div class="history-meta"><span class="history-date">${date}</span><span class="history-agent-badge">${statusIcon} ${d.current_round} раунд${d.current_round < 5 ? (d.current_round === 1 ? '' : 'а') : 'ов'}</span></div>
          <div class="history-task-text">${esc(d.topic)}</div>
        </div>`;
      }).join('');
    } else {
      debateEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">Пока нет дебатов</div>';
    }
  }

  // Load arena tasks
  const { data } = await sb.from('tasks').select('id,prompt,agents,created_at')
    .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(50);
  const el = $('historyList');
  if (!data?.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Пока нет задач</p></div>';
    return;
  }
  el.innerHTML = data.map(t => `<div class="history-item" onclick="openDetail('${t.id}')">
    <div class="history-meta">
      <span class="history-date">${new Date(t.created_at).toLocaleString('ru')}</span>
      <div class="history-agents">${(t.agents || []).map(a => {
        const ag = findAgent(a);
        return `<span class="history-agent-badge">${esc(ag.emoji)} ${esc(ag.name)}</span>`;
      }).join('')}</div>
    </div>
    <div class="history-task-text">${esc(t.prompt)}</div>
  </div>`).join('');
}

// ========== DETAIL OVERLAY ==========
async function openDetail(taskId) {
  const { data: task } = await sb.from('tasks').select('*').eq('id', taskId).single();
  const { data: responses } = await sb.from('agent_responses').select('*').eq('task_id', taskId).order('created_at');
  if (!task) return;
  $('detailPanel').innerHTML = `
    <button class="detail-close" onclick="closeDetail()">✕</button>
    <span class="history-date">${new Date(task.created_at).toLocaleString('ru')}</span>
    <div class="detail-task-text">${esc(task.prompt)}</div>
    <div class="results-grid">${(responses || []).map(r => {
      const a = findAgent(r.agent_id);
      return `<div class="result-card">
        <div class="result-header"><div class="result-agent"><span class="agent-dot" style="background:${escAttr(a.color)}"></span>${esc(a.emoji)} ${esc(a.name)}</div><span class="result-time">${r.response_time_ms || 0}ms</span></div>
        <div class="result-body">${esc(r.response_text)}</div>
      </div>`;
    }).join('')}</div>`;
  $('detailOverlay').classList.add('active');
}

function closeDetail() { $('detailOverlay').classList.remove('active'); }

window.openDetail = openDetail;
window.closeDetail = closeDetail;

$('detailOverlay').addEventListener('click', e => {
  if (e.target === $('detailOverlay')) closeDetail();
});
