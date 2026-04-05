// ========== CONFIG ==========
// Этот файл содержит ТОЛЬКО настройки. Логики нет.
// Менять: при смене ключей, URL-ов, или списка базовых агентов.
// Не менять: если задача не связана с конфигурацией.

const CONFIG = {
  SUPABASE_URL: 'https://ozoyoqeuwkinowpmssxc.supabase.co',
  SUPABASE_KEY: 'sb_publishable_8Q-G5edvfVDVF6wBO0uMVA_rtEdethb',
  PROXY_URL: 'https://debate-proxy.pxl123789.workers.dev',
  VERSION: 1
};

const BASE_AGENTS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', color: '#3fb950', model: 'gpt-4o-mini', emoji: '⚡', system_prompt: '', isBase: true },
  { id: 'gpt-4o',      name: 'GPT-4o',      color: '#58a6ff', model: 'gpt-4o',      emoji: '🧠', system_prompt: '', isBase: true },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', color: '#d2a8ff', model: 'gpt-4-turbo', emoji: '🚀', system_prompt: '', isBase: true },
];
