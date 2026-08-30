// COLOQUE AQUI os dados do seu projeto Supabase.
// URL: Project Settings > Data API > Project URL
// ANON KEY: Project Settings > API Keys > Publishable/anon key
// supabase-config.js
const SUPABASE_URL = 'https://axkbfrljohpkjnbotqnf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QLfFi3Cl5FCL1SZnHOl8DQ_nigRxb-c';

// Inicialização do cliente Supabase para todo o sistema
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);