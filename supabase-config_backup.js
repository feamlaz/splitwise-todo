// Конфигурация Supabase
const SUPABASE_CONFIG = {
  url: 'https://bxsuqeubabzmereefyrt.supabase.co',
  anonKey: 'sb_publishable_R9MH4il-cDRm-etC049PGQ_yCFWC2O1'
};

// Экспорт для использования в браузере
if (typeof window !== 'undefined') {
  window.SUPABASE_CONFIG = SUPABASE_CONFIG;
}

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SUPABASE_CONFIG;
}
