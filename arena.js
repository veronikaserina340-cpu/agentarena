// ========== ARENA.JS ==========
// Зависит от: config.js (CONFIG), app.js (sb, $, esc, currentUser, allAgents, selectedAgents, findAgent)
// Предоставляет: runTask, callAgent, renderResults, rateResponse

$('runBtn').addEventListener('click', runTask);
$('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runTask(); });

async function runTask() {
  const task = $('taskInput').value.trim();
  if (!task || selectedAgents.size === 0) return;
  const errEl = $('errorMsg'); errEl.style.display = 'none';
  $('runBtn').disabled = true; $('runBtn').textContent = 'Думаю...';
  $('loadingBar').classList.add('active'); $('resultsGrid').innerHTML = '';

  let taskId = null;
  try {
    const { data: tr, error: te } = await sb.from('tasks')
      .insert({ user_id: currentUser.id, prompt: task, agents: [...selectedAgents] }).select().single();
    if (te) { console.warn(te); errEl.textContent = '⚠ ' + te.message; errEl.style.display = 'block'; }
    else taskId = tr.id;
  } catch(e) { errEl.textContent = '⚠ Supabase недоступен'; errEl.style.display = 'block'; }

  const agentList = allAgents.filter(a => selectedAgents.has(a.id));
  const results = await Promise.allSettled(agentList.map(a => callAgent(a, task)));
  const cards = [];

  for (let i = 0; i < agentList.length; i++) {
    const agent = agentList[i], r = results[i], ok = r.status === 'fulfilled';
    const text = ok ? r.value.text : 'Ошибка: ' + (r.reason?.message || '?');
    const ms = ok ? r.value.ms : 0;
    let rid = null;
    if (taskId) {
      try {
        const { data: row, error } = await sb.from('agent_responses')
          .insert({ task_id: taskId, agent_id: agent.id, response_text: text, response_time_ms: ms }).select().single();
        if (!error) rid = row.id;
      } catch(e) {}
    }
    cards.push({ agent, text, ms, responseId: rid });
  }

  renderResults(cards);
  $('runBtn').disabled = false; $('runBtn').textContent = 'Запустить ⚡';
  $('loadingBar').classList.remove('active');
}

async function callAgent(agent, prompt) {
  const msgs = [];
  if (agent.system_prompt) msgs.push({ role: 'system', content: agent.system_prompt });
  msgs.push({ role: 'user', content: prompt });
  const t0 = performance.now();
  const res = await fetch(CONFIG.PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: agent.model, messages: msgs, max_tokens: 2048 })
  });
  if (!res.ok) { const b = await res.text(); throw new Error(res.status + ': ' + b.slice(0, 200)); }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || '(пустой ответ)', ms: Math.round(performance.now() - t0) };
}

function renderResults(cards) {
  $('resultsGrid').innerHTML = cards.map(c => `<div class="result-card">
    <div class="result-header"><div class="result-agent"><span class="agent-dot" style="background:${escAttr(c.agent.color)}"></span>${esc(c.agent.emoji)} ${esc(c.agent.name)}</div><span class="result-time">${c.ms}ms</span></div>
    <div class="result-body">${esc(c.text)}</div>
    <div class="result-footer">${[1,2,3,4,5].map(n => `<button class="rate-btn" data-rid="${c.responseId}" data-score="${n}" onclick="rateResponse(this)">${'★'.repeat(n)}</button>`).join('')}</div>
  </div>`).join('');
}

// ========== RATE ==========
async function rateResponse(btn) {
  const rid = btn.dataset.rid, score = +btn.dataset.score;
  if (!rid) return;
  const { error } = await sb.from('agent_ratings')
    .upsert({ user_id: currentUser.id, response_id: rid, score }, { onConflict: 'user_id,response_id' });
  if (!error) {
    btn.closest('.result-footer').querySelectorAll('.rate-btn').forEach(b => {
      b.classList.remove('rated');
      if (+b.dataset.score <= score) b.classList.add('rated');
    });
  }
}
window.rateResponse = rateResponse;
