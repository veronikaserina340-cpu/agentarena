// ========== RATING.JS ==========
// Зависит от: app.js (sb, $, findAgent)
// Предоставляет: loadRatings

async function loadRatings() {
  const { data } = await sb.from('agent_ratings').select('score,agent_responses(agent_id)');
  const el = $('ratingContent');
  if (!data?.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Пока нет оценок</p></div>';
    return;
  }
  const stats = {};
  data.forEach(r => {
    const aid = r.agent_responses?.agent_id;
    if (!aid) return;
    if (!stats[aid]) stats[aid] = { sum: 0, count: 0 };
    stats[aid].sum += r.score;
    stats[aid].count++;
  });
  const rows = Object.entries(stats)
    .map(([id, s]) => ({ id, avg: s.sum / s.count, count: s.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  el.innerHTML = `<table class="rating-table">
    <thead><tr><th>#</th><th>Агент</th><th>Средняя оценка</th><th>Голосов</th><th></th></tr></thead>
    <tbody>
      ${rows.map((r, i) => {
        const a = findAgent(r.id);
        return `<tr>
          <td class="rank-cell ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</td>
          <td><span class="result-agent"><span class="agent-dot" style="background:${escAttr(a.color)}"></span>${esc(a.emoji)} ${esc(a.name)}</span></td>
          <td class="avg-score">${r.avg.toFixed(2)} ★</td>
          <td class="votes-count">${r.count}</td>
          <td class="bar-cell"><div class="rating-bar-bg"><div class="rating-bar-fill" style="width:${(r.avg / 5 * 100).toFixed(0)}%"></div></div></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
