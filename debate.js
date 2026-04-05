// ========== DEBATE.JS v9 — СОВЕТ ЭКСПЕРТОВ ==========
const DEBATE_MAX_ROUNDS = 10;
const FETCH_TIMEOUT_MS = 45000;
const CLAMP_LINES = 5;
const CRITERIA = ['facts','logic','practicality','handling_criticism','usefulness'];
const CRITERIA_LABELS = { facts:'Факты', logic:'Логика', practicality:'Практичность', handling_criticism:'Работа с критикой', usefulness:'Полезность' };
let currentDebate = null;
let debateInited = false;
let debateAborted = false;

// ========== INIT ==========
function initDebate() {
  renderDebateAgentSelector();
  if (debateInited) return;
  debateInited = true;
  $('debateStartBtn').addEventListener('click', startDebate);
  $('debateMoreRoundsBtn').addEventListener('click', continueDebate);
  $('debateFinalBtn').addEventListener('click', submitFinalVerdict);
  $('debateNewBtn').addEventListener('click', resetDebatePage);
  $('debateRoundsInput').max = DEBATE_MAX_ROUNDS;
  $('debateRoundsInput').addEventListener('input', updateSetupInfo);
  $('debateJudgeModel').addEventListener('change', updateSetupInfo);
  document.querySelectorAll('.debate-preset').forEach(p => {
    p.addEventListener('click', () => { $('debateTopicInput').value = p.dataset.topic; });
  });
}

// ========== AGENT SELECTOR + WARNINGS ==========
function renderDebateAgentSelector() {
  const el = $('debateAgentSelector'); if (!el) return;
  el.innerHTML = allAgents.map(a =>
    `<div class="agent-chip" data-agent="${escAttr(a.id)}">${esc(a.emoji)} ${esc(a.name)}</div>`
  ).join('');
  el.querySelectorAll('.agent-chip').forEach(c => {
    c.addEventListener('click', () => {
      c.classList.toggle('selected');
      const id = c.dataset.agent, color = findAgent(id).color;
      if (c.classList.contains('selected')) { c.style.borderColor = color; c.style.color = color; c.style.background = color+'1a'; }
      else { c.style.borderColor = ''; c.style.color = ''; c.style.background = ''; }
      updateSetupInfo();
    });
  });
}

function updateSetupInfo() {
  const selected = [...($('debateAgentSelector')?.querySelectorAll('.agent-chip.selected') || [])];
  const agents = selected.length, rounds = parseInt($('debateRoundsInput')?.value) || 3;
  const judgeModel = $('debateJudgeModel')?.value || '';
  let est = $('debateTimeEst');
  if (!est) { $('debateStartBtn').insertAdjacentHTML('afterend', '<div id="debateTimeEst" class="debate-time-est"></div>'); est = $('debateTimeEst'); }
  if (agents >= 2) {
    const calls = agents * rounds + rounds, mins = Math.max(1, Math.ceil(calls * 6 / 60));
    est.textContent = `⏱ ~${mins} мин · ${calls} запросов к AI`;
  } else est.textContent = '';
  let warn = $('debateWarnings');
  if (!warn) { $('debateSetupMsg').insertAdjacentHTML('beforebegin', '<div id="debateWarnings"></div>'); warn = $('debateWarnings'); }
  const warnings = [];
  const models = selected.map(c => findAgent(c.dataset.agent).model);
  if (models.includes(judgeModel)) warnings.push('⚠️ Судья на той же модели что и участник — возможен bias');
  const counts = {}; models.forEach(m => { counts[m] = (counts[m]||0)+1; });
  const dupes = Object.entries(counts).filter(([,c]) => c > 1);
  if (dupes.length) warnings.push('⚠️ Несколько агентов на одной модели — будут «спорить сами с собой»');
  warn.innerHTML = warnings.map(w => `<div class="debate-warning">${esc(w)}</div>`).join('');
}

// ========== FETCH ==========
async function fetchT(url, opts, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: c.signal }); clearTimeout(t); return r; }
  catch(e) { clearTimeout(t); throw e.name === 'AbortError' ? new Error('Таймаут ('+Math.round(ms/1000)+'с)') : e; }
}
async function fetchR(url, opts, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetchT(url, opts, FETCH_TIMEOUT_MS);
      if (r.status === 429) { if (i < retries) { await sleep(2000*(i+1)); continue; } throw new Error('Rate limit'); }
      if (!r.ok) { const b = await r.text(); throw new Error(r.status+': '+b.slice(0,200)); }
      return await r.json();
    } catch(e) { if (i === retries) throw e; await sleep(1500); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ========== START ==========
async function startDebate() {
  const topic = $('debateTopicInput').value.trim();
  const agentIds = [...$('debateAgentSelector').querySelectorAll('.agent-chip.selected')].map(c => c.dataset.agent);
  const judgeModel = $('debateJudgeModel').value;
  const maxRounds = Math.min(parseInt($('debateRoundsInput').value)||3, DEBATE_MAX_ROUNDS);
  const msgEl = $('debateSetupMsg');
  msgEl.textContent = '';
  if (!topic) { msgEl.textContent = 'Введи тему'; return; }
  if (agentIds.length < 2) { msgEl.textContent = 'Выбери минимум 2 агента'; return; }

  debateAborted = false;
  $('debateStartBtn').disabled = true;
  $('debateSetupPanel').style.display = 'none';
  $('debateArenaPanel').style.display = 'block';
  $('debateTopicDisplay').textContent = topic;
  renderControls(); showSkeleton(agentIds);
  window.addEventListener('beforeunload', warnLeave);
  try {
    const { data: debate, error } = await sb.from('debates')
      .insert({ user_id: currentUser.id, topic, agent_ids: agentIds, judge_model: judgeModel, max_rounds: maxRounds })
      .select().single();
    if (error) throw new Error(error.message);
    currentDebate = { id: debate.id, agentIds, judgeModel, topic, maxRounds, currentRound: 0, allMessages: [], roundAnalyses: [] };
    hideSkeleton(); await runNextRound();
  } catch(e) { hideSkeleton(); showErr('Ошибка: '+e.message); recoverUI(); }
}

// ========== CONTROLS ==========
function renderControls() {
  if ($('debateControlsArea')) return;
  $('debateTopicDisplay').insertAdjacentHTML('afterend',
    `<div id="debateControlsArea" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <button id="debateStopBtn" class="btn btn-danger btn-sm" onclick="window._stopDebate()">⏹ Остановить</button>
      <span id="debateProgress" class="debate-progress"></span>
    </div><div id="debateScoreboard" class="debate-scoreboard"></div>`);
}
function updateProgress(t) { const e = $('debateProgress'); if (e) e.textContent = t; }
function showSkeleton(ids) {
  $('debateThread').innerHTML = `<div id="skelWrap"><div class="debate-round-header">— Раунд 1 —</div>${ids.map(id => {
    const a = findAgent(id);
    return `<div class="debate-card debate-skeleton"><div class="debate-card-header"><span class="agent-dot" style="background:${escAttr(a.color)}"></span>${esc(a.emoji)} ${esc(a.name)}</div><div class="debate-card-body"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></div>`;
  }).join('')}</div>`;
  updateProgress('Подключаюсь к экспертам...');
}
function hideSkeleton() { const s = document.getElementById('skelWrap'); if (s) s.remove(); }
function warnLeave(e) { if (currentDebate && !debateAborted) { e.preventDefault(); e.returnValue = ''; } }

// ========== STOP ==========
function stopDebate() {
  debateAborted = true;
  const b = $('debateStopBtn'); if (b) b.style.display = 'none';
  updateProgress('⏹ Остановлено');
  window.removeEventListener('beforeunload', warnLeave);
  if (currentDebate) {
    sb.from('debates').update({ status: 'paused', current_round: currentDebate.currentRound }).eq('id', currentDebate.id).then(null, () => {});
    showFinalPanel();
  }
}
window._stopDebate = stopDebate;

function recoverUI() {
  $('debateStartBtn').disabled = false; updateProgress('');
  const b = $('debateStopBtn'); if (b) b.style.display = 'none';
  window.removeEventListener('beforeunload', warnLeave);
  if (!currentDebate || currentDebate.currentRound === 0) {
    $('debateSetupPanel').style.display = 'block'; $('debateArenaPanel').style.display = 'none';
  }
}

// ========== SCOREBOARD (avg across rounds, 5-criteria) ==========
function renderScoreboard() {
  const el = $('debateScoreboard');
  if (!el || !currentDebate?.roundAnalyses?.length) { if (el) el.innerHTML = ''; return; }
  const agents = currentDebate.agentIds;
  const stats = agents.map(id => {
    const a = resolveAgent(id);
    const allScores = currentDebate.roundAnalyses.map(ra => {
      const ds = ra.detailed_scores?.[id];
      if (!ds) return null;
      return CRITERIA.reduce((s, c) => s + (+(ds[c]||0)), 0) / CRITERIA.length;
    }).filter(x => x !== null);
    const avg = allScores.length ? allScores.reduce((s,v) => s+v, 0) / allScores.length : 0;
    const last = allScores[allScores.length - 1] || 0;
    let trend = '';
    if (allScores.length >= 2) {
      const d = Math.round((last - allScores[allScores.length-2]) * 10) / 10;
      if (d > 0) trend = `<span style="color:var(--success)">▲${d.toFixed(1)}</span>`;
      else if (d < 0) trend = `<span style="color:var(--danger)">▼${Math.abs(d).toFixed(1)}</span>`;
    }
    return { id, a, avg, last, trend };
  });
  const maxAvg = Math.max(...stats.map(s => s.avg));
  el.innerHTML = stats.map(s => {
    const pct = Math.round((s.avg/10)*100), leader = s.avg === maxAvg && s.avg > 0;
    return `<div class="debate-sb-item ${leader ? 'debate-sb-leader' : ''}">
      <span class="debate-sb-agent"><span class="agent-dot" style="background:${escAttr(s.a.color)}"></span>${esc(s.a.emoji)} ${esc(s.a.name)}</span>
      <div class="debate-sb-bar"><div class="debate-sb-fill" style="width:${pct}%;background:${escAttr(s.a.color)}"></div></div>
      <span class="debate-sb-score">${s.last.toFixed(1)} (ø${s.avg.toFixed(1)}) ${s.trend}</span>
    </div>`;
  }).join('');
}

// ========== RUN ROUND ==========
async function runNextRound() {
  if (debateAborted) return;
  currentDebate.currentRound++;
  const roundNum = currentDebate.currentRound, total = currentDebate.agentIds.length;

  collapseOldRounds();
  const rgId = 'round_' + roundNum;
  appendHTML(`<div class="debate-round-group" id="${rgId}">
    <div class="debate-round-header" id="${rgId}_hdr" onclick="window._toggleRound('${rgId}')">— Раунд ${roundNum} — <span class="round-toggle">▾</span></div>
    <div class="debate-round-content" id="${rgId}_content"></div>
  </div>`);
  updateProgress(`Раунд ${roundNum}/${currentDebate.maxRounds}`);

  let roundId = null;
  try { const { data } = await sb.from('debate_rounds').insert({ debate_id: currentDebate.id, round_number: roundNum }).select().single(); roundId = data?.id; } catch(e) {}

  for (let i = 0; i < total; i++) {
    if (debateAborted) return;
    const agentId = currentDebate.agentIds[i], agent = findAgent(agentId);
    updateProgress(`Раунд ${roundNum}/${currentDebate.maxRounds} · ${agent.emoji} ${agent.name} (${i+1}/${total})`);
    const cardId = appendAgentCard(rgId, agent, getRole(i, total));
    const t0 = performance.now();
    let text;
    try {
      const data = await fetchR(CONFIG.PROXY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: agent.model || 'gpt-4o-mini', messages: buildAgentMsgs(agentId, i, total, roundNum), max_tokens: 512 })
      });
      text = data.choices?.[0]?.message?.content || '(пустой ответ)';
    } catch(e) { text = '⚠ Ошибка: ' + e.message; }
    const ms = Math.round(performance.now() - t0);
    currentDebate.allMessages.push({ agentId, round: roundNum, text });
    fillAgentCard(cardId, text, ms);
    if (roundId) sb.from('debate_messages').insert({ round_id: roundId, agent_id: agentId, content: text }).then(null, () => {});
  }

  if (debateAborted) return;
  if (roundNum === 1 && currentDebate.maxRounds >= 3) {
    appendToRound(rgId, '<div class="debate-encouragement">💡 К 3-му раунду аргументы обострятся — эксперты начнут отвечать на конкретную критику</div>');
  }

  updateProgress(`Раунд ${roundNum}/${currentDebate.maxRounds} · ⚖️ Анализ...`);
  appendJudgeThinking(rgId);
  let analysis;
  try { analysis = await runJudge(roundNum); }
  catch(e) { analysis = emptyAnalysis('Ошибка: ' + e.message); }
  currentDebate.roundAnalyses.push(analysis);
  fillJudgeCard(analysis);
  renderScoreboard();
  updateRoundHeader(rgId, roundNum, analysis);

  sb.from('debate_verdicts').insert({
    debate_id: currentDebate.id, round_number: roundNum,
    consensus_reached: analysis.consensus_reached,
    contradictions: analysis.disagreements || [],
    verdict_text: analysis.synthesis, agent_scores: analysis.detailed_scores || {}
  }).then(null, () => {});

  if (analysis.consensus_reached) {
    sb.from('debates').update({ status: 'done', current_round: roundNum }).eq('id', currentDebate.id).then(null, () => {});
    finishDebate(); showFinalPanel(); flashTitle('✅ Дебат завершён — AgentArena'); return;
  }
  if (roundNum >= currentDebate.maxRounds) {
    sb.from('debates').update({ status: 'paused', current_round: roundNum }).eq('id', currentDebate.id).then(null, () => {});
    finishDebate(); showPausePanel(); flashTitle('⏸ Дебат завершён — AgentArena'); return;
  }
  updateProgress('Пауза...'); await sleep(1000); runNextRound();
}

function finishDebate() {
  const b = $('debateStopBtn'); if (b) b.style.display = 'none';
  window.removeEventListener('beforeunload', warnLeave);
}

// ========== AGENT ROLES ==========
function getRole(index, total) {
  if (index === 0) return 'Адвокат стороны А';
  if (index === 1) return 'Адвокат стороны Б';
  return 'Критический аналитик';
}

function getRolePrompt(index, total, topic) {
  if (index === 0) return `Ты аналитик-адвокат ПЕРВОЙ стороны в дебатах. Тема: "${topic}".
Твоя задача — максимально ГЛУБОКО и УБЕДИТЕЛЬНО аргументировать ЗА первый вариант/позицию.
Приводи конкретные факты, данные, примеры из реального мира, исследования.
Отвечай на критику оппонентов конкретно — не отмахивайся, а разбирай их аргументы.
До 250 слов. Будь конкретен, избегай общих фраз.`;

  if (index === 1) return `Ты аналитик-адвокат ВТОРОЙ стороны в дебатах. Тема: "${topic}".
Твоя задача — максимально ГЛУБОКО и УБЕДИТЕЛЬНО аргументировать ЗА альтернативную позицию/вариант.
Ищи слабости в аргументах первой стороны и приводи контраргументы с фактами.
Приводи данные, примеры, исследования. Будь конкретен.
До 250 слов.`;

  return `Ты критический аналитик в дебатах. Тема: "${topic}".
Твоя задача — объективно анализировать аргументы ОБЕИХ сторон.
Находи: непроверенные допущения, логические ошибки, упущенные факторы, скрытые риски.
Предлагай альтернативные решения или компромиссы, о которых другие не подумали.
До 250 слов. Будь конкретен и конструктивен.`;
}

// ========== BUILD AGENT MESSAGES ==========
function buildAgentMsgs(agentId, agentIndex, total, roundNum) {
  const agent = findAgent(agentId), msgs = [];
  const rolePrompt = getRolePrompt(agentIndex, total, currentDebate.topic);
  const sysContent = (agent.system_prompt ? agent.system_prompt + '\n\n' : '') + rolePrompt;
  msgs.push({ role: 'system', content: sysContent });

  if (currentDebate.allMessages.length > 0) {
    const h = currentDebate.allMessages.map(m => {
      const a = findAgent(m.agentId);
      const idx = currentDebate.agentIds.indexOf(m.agentId);
      return `[${a.name} (${getRole(idx, total)}), р.${m.round}]: ${m.text}`;
    }).join('\n\n');
    msgs.push({ role: 'user', content: `Предыдущие аргументы:\n\n${h}\n\nТвой ход, раунд ${roundNum}. Ответь на КОНКРЕТНЫЕ аргументы оппонентов. Углуби свою позицию.` });
  } else {
    msgs.push({ role: 'user', content: `Раунд 1. Изложи свою позицию по теме: "${currentDebate.topic}". Приведи 3-5 конкретных аргументов с фактами.` });
  }
  return msgs;
}

// ========== JUDGE — 5 CRITERIA + SYNTHESIS ==========
async function runJudge(roundNum) {
  const mapping = currentDebate.agentIds.map((id, i) => `"${id}" = ${findAgent(id).name} (${getRole(i, currentDebate.agentIds.length)})`).join(', ');
  const ids = currentDebate.agentIds.map(id => `"${id}"`).join(', ');
  const h = currentDebate.allMessages.map(m => {
    const a = findAgent(m.agentId);
    const idx = currentDebate.agentIds.indexOf(m.agentId);
    return `[${a.name} (${getRole(idx, currentDebate.agentIds.length)}), р.${m.round}]: ${m.text}`;
  }).join('\n\n');

  const sys = `Ты эксперт-аналитик, оценивающий дебаты. Тема: "${currentDebate.topic}".
Участники: ${mapping}.

Оцени КАЖДОГО участника по 5 критериям (1-10):
- facts: подкреплён ли аргумент данными, примерами, доказательствами?
- logic: есть ли логические ошибки, натяжки, подмена тезиса?
- practicality: применим ли к реальной ситуации?
- handling_criticism: ответил ли на контраргументы или проигнорировал?
- usefulness: помог ли приблизиться к решению?

ШКАЛА: 1-3 слабо (нет фактов, ошибки), 4-6 средне (есть логика, мало конкретики), 7-9 сильно (факты, реакция на критику), 10 исключительно.

В scores используй ТОЛЬКО ID: ${ids}.
JSON без markdown:
{
  "key_arguments": {${currentDebate.agentIds.map(id => `"${id}":"главный аргумент кратко"`).join(',')}},
  "agreements": ["в чём все стороны согласны"],
  "disagreements": ["ключевые разногласия"],
  "weaknesses_found": ["слабость 1 в аргументах", "слабость 2"],
  "synthesis": "Развёрнутая рекомендация: учитывая все аргументы, какое решение лучше и почему. 4-6 предложений.",
  "detailed_scores": {${currentDebate.agentIds.map(id => `"${id}":{"facts":0,"logic":0,"practicality":0,"handling_criticism":0,"usefulness":0,"comment":"почему такие оценки"}`).join(',')}},
  "consensus_reached": false
}`;

  const data = await fetchR(CONFIG.PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: currentDebate.judgeModel, messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Раунд ${roundNum}:\n\n${h}` }
    ], max_tokens: 1200 })
  });
  const raw = data.choices?.[0]?.message?.content || '{}';
  let p;
  try { p = JSON.parse(raw.replace(/```json\n?|```/g, '').trim()); }
  catch(e) { return emptyAnalysis('Судья вернул некорректный ответ.'); }

  // Fallback: remap names → IDs in detailed_scores
  if (p.detailed_scores) {
    const fixed = {};
    for (const [k, v] of Object.entries(p.detailed_scores)) {
      if (currentDebate.agentIds.includes(k)) fixed[k] = v;
      else { const m = allAgents.find(a => a.name === k || a.name.toLowerCase() === k.toLowerCase() || a.model === k); fixed[m ? m.id : k] = v; }
    }
    p.detailed_scores = fixed;
  }
  // Same for key_arguments
  if (p.key_arguments) {
    const fixed = {};
    for (const [k, v] of Object.entries(p.key_arguments)) {
      if (currentDebate.agentIds.includes(k)) fixed[k] = v;
      else { const m = allAgents.find(a => a.name === k || a.name.toLowerCase() === k.toLowerCase() || a.model === k); fixed[m ? m.id : k] = v; }
    }
    p.key_arguments = fixed;
  }
  return p;
}

function emptyAnalysis(msg) {
  return { key_arguments: {}, agreements: [], disagreements: [], weaknesses_found: [], synthesis: msg, detailed_scores: {}, consensus_reached: false };
}

// ========== ROUND COLLAPSE ==========
function updateRoundHeader(rgId, roundNum, analysis) {
  const hdr = document.getElementById(rgId + '_hdr'); if (!hdr) return;
  const ds = analysis.detailed_scores || {};
  const best = Object.entries(ds).map(([id, s]) => ({ a: resolveAgent(id), avg: CRITERIA.reduce((sum, c) => sum + (+(s[c]||0)), 0) / CRITERIA.length })).sort((a,b) => b.avg - a.avg)[0];
  const leaderTxt = best ? `${best.a.emoji} ${best.a.name} ${best.avg.toFixed(1)}` : '';
  const status = analysis.consensus_reached ? '✅' : '🔄';
  const synShort = (analysis.synthesis || '').slice(0, 60) + ((analysis.synthesis || '').length > 60 ? '...' : '');
  hdr.innerHTML = `— Раунд ${roundNum} · ${leaderTxt} · ${status} — <span class="debate-round-preview">${esc(synShort)}</span> <span class="round-toggle">▾</span>`;
}

function collapseOldRounds() {
  document.querySelectorAll('.debate-round-group').forEach(g => {
    const c = g.querySelector('.debate-round-content'), t = g.querySelector('.round-toggle');
    if (c && !c.classList.contains('collapsed')) { c.classList.add('collapsed'); if (t) t.textContent = '▸'; }
  });
}
function toggleRound(id) {
  const c = document.getElementById(id + '_content'), t = document.querySelector('#'+id+' .round-toggle');
  if (!c) return; c.classList.toggle('collapsed');
  if (t) t.textContent = c.classList.contains('collapsed') ? '▸' : '▾';
}
window._toggleRound = toggleRound;

// ========== CARD TOGGLE ==========
function toggleCard(btn) {
  const body = btn.closest('.debate-card').querySelector('.debate-card-body'); if (!body) return;
  body.classList.toggle('clamped');
  btn.textContent = body.classList.contains('clamped') ? 'Читать далее ▾' : 'Свернуть ▴';
}
window._toggleCard = toggleCard;

// ========== DOM ==========
function appendHTML(html) { const t = $('debateThread'); t.insertAdjacentHTML('beforeend', html); t.scrollTop = t.scrollHeight; }
function appendToRound(rgId, html) { const c = document.getElementById(rgId+'_content'); if (c) { c.insertAdjacentHTML('beforeend', html); $('debateThread').scrollTop = $('debateThread').scrollHeight; } }

function appendAgentCard(rgId, agent, role) {
  const id = 'dc_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  appendToRound(rgId, `<div class="debate-card" id="${id}">
    <div class="debate-card-header"><span class="agent-dot" style="background:${escAttr(agent.color)}"></span>${esc(agent.emoji)} <strong>${esc(agent.name)}</strong> <span class="debate-role-badge">${esc(role)}</span><span class="debate-card-time" id="${id}_time"></span></div>
    <div class="debate-card-body clamped debate-thinking">Обдумывает аргументы</div>
    <button class="debate-expand-btn" onclick="window._toggleCard(this)" style="display:none">Читать далее ▾</button>
  </div>`);
  return id;
}

function fillAgentCard(id, text, ms) {
  const card = document.getElementById(id); if (!card) return;
  const body = card.querySelector('.debate-card-body'), btn = card.querySelector('.debate-expand-btn'), timeEl = document.getElementById(id+'_time');
  body.textContent = text; body.classList.remove('debate-thinking');
  if (timeEl && ms) timeEl.textContent = (ms/1000).toFixed(1)+'с';
  setTimeout(() => { if (body.scrollHeight > body.clientHeight+2) btn.style.display = ''; else { body.classList.remove('clamped'); btn.style.display = 'none'; } }, 50);
  $('debateThread').scrollTop = $('debateThread').scrollHeight;
}

// ========== JUDGE CARD (per-round analysis) ==========
function appendJudgeThinking(rgId) {
  appendToRound(rgId, `<div class="debate-verdict-card" id="judge_${Date.now()}"><div class="debate-verdict-header">⚖️ Анализирую аргументы...</div></div>`);
}

function fillJudgeCard(a) {
  const cards = $('debateThread').querySelectorAll('.debate-verdict-card');
  const card = cards[cards.length-1]; if (!card) return;

  const agreeHtml = (a.agreements||[]).length ? `<div class="debate-section"><span class="debate-section-label">✅ Согласны:</span> ${(a.agreements||[]).map(x=>esc(x)).join('; ')}</div>` : '';
  const disagreeHtml = (a.disagreements||[]).length ? `<div class="debate-section"><span class="debate-section-label">⚡ Разногласия:</span> ${(a.disagreements||[]).map(x=>esc(x)).join('; ')}</div>` : '';
  const weakHtml = (a.weaknesses_found||[]).length ? `<div class="debate-section"><span class="debate-section-label">🔍 Слабости:</span> ${(a.weaknesses_found||[]).map(x=>esc(x)).join('; ')}</div>` : '';

  // 5-criteria table
  let scoreTable = '';
  if (a.detailed_scores && Object.keys(a.detailed_scores).length) {
    const header = CRITERIA.map(c => `<th>${CRITERIA_LABELS[c]}</th>`).join('');
    const rows = Object.entries(a.detailed_scores).map(([id, ds]) => {
      const ag = resolveAgent(id);
      const cells = CRITERIA.map(c => { const v = +(ds[c]||0); return `<td style="color:${scoreColor(v)}">${v}</td>`; }).join('');
      const avg = CRITERIA.reduce((s,c) => s + (+(ds[c]||0)), 0) / CRITERIA.length;
      return `<tr><td class="debate-ct-agent"><span class="agent-dot" style="background:${escAttr(ag.color)}"></span>${esc(ag.emoji)} ${esc(ag.name)}</td>${cells}<td style="font-weight:700;color:${scoreColor(avg)}">${avg.toFixed(1)}</td></tr>
        ${ds.comment ? `<tr><td colspan="${CRITERIA.length+2}" class="debate-ct-comment">${esc(ds.comment)}</td></tr>` : ''}`;
    }).join('');
    scoreTable = `<table class="debate-criteria-table"><thead><tr><th></th>${header}<th>Итого</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  card.innerHTML = `
    <div class="debate-verdict-header">⚖️ Анализ раунда — ${a.consensus_reached ? '✅ Консенсус' : '🔄 Продолжаются'}</div>
    ${a.synthesis ? `<div class="debate-synthesis">${esc(a.synthesis)}</div>` : ''}
    ${agreeHtml}${disagreeHtml}${weakHtml}
    ${scoreTable}`;
  $('debateThread').scrollTop = $('debateThread').scrollHeight;
}

// ========== FINAL PANEL ==========
function showFinalPanel() {
  const panel = $('debateFinalPanel'); panel.style.display = 'block';
  if (!currentDebate?.roundAnalyses?.length) {
    $('debateFinalContent').innerHTML = '<p style="color:var(--text-dim)">Нет данных для заключения.</p>';
    $('debateNewBtn').style.display = 'inline-block'; return;
  }
  const last = currentDebate.roundAnalyses[currentDebate.roundAnalyses.length - 1];
  const allAnalyses = currentDebate.roundAnalyses;

  // Key arguments
  let argsHtml = '';
  if (last.key_arguments && Object.keys(last.key_arguments).length) {
    argsHtml = '<div class="debate-final-section"><h4>📌 Ключевые аргументы</h4>' +
      Object.entries(last.key_arguments).map(([id, arg]) => {
        const a = resolveAgent(id); const idx = currentDebate.agentIds.indexOf(id);
        return `<div class="debate-final-arg"><span class="agent-dot" style="background:${escAttr(a.color)}"></span><strong>${esc(a.name)}</strong> <span class="debate-role-badge">${esc(getRole(idx, currentDebate.agentIds.length))}</span><p>${esc(arg)}</p></div>`;
      }).join('') + '</div>';
  }

  // Agreements / Disagreements / Weaknesses
  const agr = (last.agreements||[]).length ? `<div class="debate-final-section"><h4>✅ Эксперты согласны</h4><ul>${last.agreements.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const dis = (last.disagreements||[]).length ? `<div class="debate-final-section"><h4>⚡ Ключевые разногласия</h4><ul>${last.disagreements.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const weak = (last.weaknesses_found||[]).length ? `<div class="debate-final-section"><h4>🔍 Найденные слабости</h4><ul>${last.weaknesses_found.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  // Synthesis
  const synthHtml = last.synthesis ? `<div class="debate-final-synthesis"><h4>💡 Рекомендация</h4><p>${esc(last.synthesis)}</p></div>` : '';

  // Final criteria table (avg across ALL rounds)
  let finalTable = '';
  const agents = currentDebate.agentIds;
  if (allAnalyses.length) {
    const header = CRITERIA.map(c => `<th>${CRITERIA_LABELS[c]}</th>`).join('');
    const rows = agents.map(id => {
      const ag = resolveAgent(id); const idx = currentDebate.agentIds.indexOf(id);
      const avgs = {};
      CRITERIA.forEach(c => {
        const vals = allAnalyses.map(ra => +(ra.detailed_scores?.[id]?.[c]||0)).filter(v => v > 0);
        avgs[c] = vals.length ? vals.reduce((s,v) => s+v, 0) / vals.length : 0;
      });
      const totalAvg = CRITERIA.reduce((s, c) => s + avgs[c], 0) / CRITERIA.length;
      const cells = CRITERIA.map(c => `<td style="color:${scoreColor(avgs[c])}">${avgs[c].toFixed(1)}</td>`).join('');
      return `<tr><td class="debate-ct-agent"><span class="agent-dot" style="background:${escAttr(ag.color)}"></span>${esc(ag.emoji)} ${esc(ag.name)}<br><span class="debate-role-badge">${esc(getRole(idx, agents.length))}</span></td>${cells}<td style="font-weight:700;color:${scoreColor(totalAvg)}">${totalAvg.toFixed(1)}</td></tr>`;
    }).join('');
    finalTable = `<div class="debate-final-section"><h4>📊 Средние оценки за ${allAnalyses.length} раунд${pluralR(allAnalyses.length)}</h4><table class="debate-criteria-table"><thead><tr><th></th>${header}<th>Итого</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // Chart
  let chartHtml = '';
  if (allAnalyses.length >= 2) chartHtml = '<div class="debate-final-section"><h4>📈 Динамика по раундам</h4><div id="debateChartWrap" class="debate-chart-wrap"></div></div>';

  $('debateFinalContent').innerHTML = synthHtml + argsHtml + agr + dis + weak + finalTable + chartHtml;
  $('debateNewBtn').style.display = 'inline-block';
  $('debateContinueFromFinal').style.display = '';

  if (allAnalyses.length >= 2) setTimeout(() => drawChart(document.getElementById('debateChartWrap')), 50);
}

// ========== CHART ==========
function drawChart(wrap) {
  if (!wrap) return;
  const hist = currentDebate.roundAnalyses, agents = currentDebate.agentIds, nr = hist.length;
  if (nr < 2) return;
  const W = Math.min(wrap.clientWidth || 500, 600), H = 180;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'width:100%;height:'+H+'px;display:block';
  wrap.innerHTML = ''; wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const pL=36, pR=16, pT=16, pB=26, cW=W-pL-pR, cH=H-pT-pB;
  for (let v = 0; v <= 10; v += 2) {
    const y = pT+cH-(v/10)*cH;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(pL+cW,y); ctx.stroke();
    ctx.fillStyle = '#484f58'; ctx.font = '10px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(v, pL-6, y);
  }
  for (let r = 0; r < nr; r++) { const x = pL+(r/(nr-1))*cW; ctx.fillStyle = '#484f58'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('Р'+(r+1), x, H-14); }
  agents.forEach(id => {
    const a = resolveAgent(id); ctx.strokeStyle = a.color; ctx.lineWidth = 2; ctx.beginPath();
    const pts = hist.map((ra, r) => {
      const ds = ra.detailed_scores?.[id]; const avg = ds ? CRITERIA.reduce((s,c) => s+(+(ds[c]||0)),0)/CRITERIA.length : 0;
      return { x: pL+(r/(nr-1))*cW, y: pT+cH-(avg/10)*cH };
    });
    pts.forEach((p,i) => { if (i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
    ctx.stroke();
    pts.forEach(p => { ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fill(); });
  });
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:0.75rem';
  legend.innerHTML = agents.map(id => { const a = resolveAgent(id); return `<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:3px;background:${escAttr(a.color)};border-radius:2px;display:inline-block"></span><span style="color:var(--text-dim)">${esc(a.emoji)} ${esc(a.name)}</span></span>`; }).join('');
  wrap.appendChild(legend);
}

// ========== PAUSE ==========
function showPausePanel() {
  $('debatePausePanel').style.display = 'block';
  $('debatePauseRounds').value = 3;
  $('debatePauseInfo').textContent = `Лимит ${currentDebate.currentRound} раундов. Консенсус не найден.`;
  showFinalPanel();
}

// ========== ACTIONS ==========
function continueDebate() {
  debateAborted = false;
  const extra = Math.min(parseInt($('debatePauseRounds')?.value)||3, DEBATE_MAX_ROUNDS);
  currentDebate.maxRounds = currentDebate.currentRound + extra;
  sb.from('debates').update({ status: 'running', max_rounds: currentDebate.maxRounds }).eq('id', currentDebate.id).then(null, () => {});
  $('debatePausePanel').style.display = 'none'; $('debateFinalPanel').style.display = 'none';
  const b = $('debateStopBtn'); if (b) b.style.display = '';
  window.addEventListener('beforeunload', warnLeave);
  runNextRound();
}

function continueFromFinal() {
  debateAborted = false;
  currentDebate.maxRounds = currentDebate.currentRound + 3;
  sb.from('debates').update({ status: 'running', max_rounds: currentDebate.maxRounds }).eq('id', currentDebate.id).then(null, () => {});
  $('debateFinalPanel').style.display = 'none'; $('debatePausePanel').style.display = 'none';
  const b = $('debateStopBtn'); if (b) b.style.display = '';
  window.addEventListener('beforeunload', warnLeave);
  runNextRound();
}
window._continueFromFinal = continueFromFinal;

async function submitFinalVerdict() {
  const text = $('debateFinalVerdictInput').value.trim(); if (!text) return;
  sb.from('debates').update({ final_verdict: text, status: 'done' }).eq('id', currentDebate.id).then(null, () => {});
  $('debateFinalVerdictInput').disabled = true; $('debateFinalBtn').disabled = true;
  $('debateFinalBtn').textContent = '✓ Сохранено';
}

function copyResults() {
  if (!currentDebate) return;
  const last = currentDebate.roundAnalyses?.[currentDebate.roundAnalyses.length-1];
  let t = `📋 AgentArena — Заключение экспертов\nТема: ${currentDebate.topic}\nРаундов: ${currentDebate.currentRound}\n\n`;
  if (last?.synthesis) t += `💡 Рекомендация:\n${last.synthesis}\n\n`;
  if (last?.key_arguments) { t += '📌 Ключевые аргументы:\n'; Object.entries(last.key_arguments).forEach(([id,arg]) => { t += `• ${resolveAgent(id).name}: ${arg}\n`; }); t += '\n'; }
  if (last?.agreements?.length) t += `✅ Согласны: ${last.agreements.join('; ')}\n\n`;
  if (last?.disagreements?.length) t += `⚡ Разногласия: ${last.disagreements.join('; ')}\n`;
  navigator.clipboard.writeText(t).then(() => {
    const b = $('debateCopyBtn'); if (b) { b.textContent = '✓ Скопировано'; setTimeout(() => b.textContent = '📋 Скопировать', 2000); }
  }).catch(() => {});
}
window._copyResults = copyResults;

function repeatDebate() {
  if (!currentDebate) return;
  const { topic, agentIds, maxRounds } = currentDebate;
  resetDebatePage(); $('debateTopicInput').value = topic; $('debateRoundsInput').value = maxRounds;
  setTimeout(() => { $('debateAgentSelector').querySelectorAll('.agent-chip').forEach(c => { if (agentIds.includes(c.dataset.agent)) c.click(); }); }, 100);
}
window._repeatDebate = repeatDebate;

function resetDebatePage() {
  currentDebate = null; debateAborted = false;
  $('debateSetupPanel').style.display = 'block'; $('debateArenaPanel').style.display = 'none';
  $('debatePausePanel').style.display = 'none'; $('debateFinalPanel').style.display = 'none';
  $('debateThread').innerHTML = ''; $('debateTopicInput').value = '';
  $('debateStartBtn').disabled = false; $('debateNewBtn').style.display = 'none';
  $('debateFinalVerdictInput').value = ''; $('debateFinalVerdictInput').disabled = false;
  $('debateFinalBtn').disabled = false; $('debateFinalBtn').textContent = 'Сохранить заметки';
  updateProgress(''); window.removeEventListener('beforeunload', warnLeave);
  const s = $('debateScoreboard'); if (s) s.innerHTML = '';
  const c = $('debateControlsArea'); if (c) c.remove();
  renderDebateAgentSelector();
}

function showErr(msg) { $('debateThread').insertAdjacentHTML('beforeend', `<div style="color:var(--danger);padding:12px;font-size:0.85rem">${esc(msg)}</div>`); }
function scoreColor(s) { if (s >= 7) return 'var(--success)'; if (s >= 4) return 'var(--accent)'; return 'var(--danger)'; }
function pluralR(n) { return n === 1 ? '' : n < 5 ? 'а' : 'ов'; }
function flashTitle(text) {
  const orig = document.title; let on = true;
  const iv = setInterval(() => { document.title = on ? text : orig; on = !on; }, 1000);
  const stop = () => { clearInterval(iv); document.title = orig; document.removeEventListener('click', stop); };
  setTimeout(stop, 15000); document.addEventListener('click', stop);
}
function resolveAgent(id) { const a = findAgent(id); if (a.name !== 'Unknown') return a; return allAgents.find(ag => ag.name === id || ag.model === id) || a; }

window.initDebate = initDebate;
window.renderDebateAgentSelector = renderDebateAgentSelector;
