import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Central tem cadastro, Meu Link e Link Filial, com blocos separados', () => {
  const html=read('promoter.html');
  const js=read('promoter-v49.js');
  for (const id of ['promoterTabRegister','promoterTabSales','promoterTabBranches',
                    'promoterResult','promoterTeamInvite']) {
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(js,/function showTab\(tab\)/);
  assert.match(js,/tabButtons\.filiais\.disabled = false/);
  assert.match(js,/public_matriz_cadastro_v251/);
  assert.match(js,/public_promoter_branch_signup_v250/);
  assert.match(html,/#promoterResult\[hidden\]/);
});

test('recadastro não apaga ingressos e exige confirmação para reinício', () => {
  const sql=read('supabase/migrations/202611100002_hype_promoters_recadastro_v251.sql');
  assert.match(sql,/promoter_matriz_recadastro_v251/);
  assert.match(sql,/staff_reiniciar_matrizes_v251/);
  assert.match(sql,/p_confirmacao is distinct from 'REINICIAR MATRIZES'/);
  assert.match(sql,/was_active/);
  assert.match(sql,/reenrolled_at is not null/);
  assert.match(sql,/enable row level security/);
  assert.doesNotMatch(sql,/delete from public\.promoters_global_v16|drop table public\.tickets|truncate public\.tickets/i);
  assert.doesNotMatch(sql,/grant execute on function public\.staff_reiniciar_matrizes_v251[^;]*to anon/i);
});

test('ADM não exibe arquivados pendentes, mas preserva histórico', () => {
  const js=read('promoter-global-v16-8.js');
  const html=read('admin.html');
  assert.match(js,/staff_matrizes_pendentes_v251/);
  assert.match(js,/visibleRows = rows\.filter/);
  assert.match(html,/COPIAR LINK DE CADASTRO/);
});
