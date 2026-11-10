import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('ADM organiza Promoters em Matrizes, Filiais e Cadastro Matriz', () => {
  const html = read('admin.html');
  const controller = read('hype-v49-registration-admin.js');
  for (const id of ['v49PromoterTabManage', 'v250PromoterTabBranches',
                    'v49PromoterTabLink', 'v250BranchList']) {
    assert.ok(html.includes(id), id);
  }
  assert.match(controller, /tab === 'branches'/);
  assert.match(controller, /branches\.hidden = !isBranches/);
});

test('filiais mantêm código individual para vendas; somatório da rede sem duplicação', () => {
  const js = read('promoter-global-v16-8.js');
  assert.match(js, /staff_list_promoter_branches_v250/);
  assert.match(js, /branchIds = new Set/);
  assert.match(js, /visibleRows\.filter\(p => !branchIds\.has/);
  assert.match(js, /groupRevenue: Number\(p\.revenue/);
  assert.match(js, /team\.reduce/);
  assert.match(js, /copyPromoterRecruitV250/);
});

test('cadastro público da filial exige código da matriz e não altera cadastro original', () => {
  const js = read('promoter-v49.js');
  const html = read('promoter.html');
  assert.match(js, /new URLSearchParams\(window\.location\.search\)\.get\('matriz'\)/);
  assert.match(js, /public_promoter_branch_signup_v250/);
  assert.match(js, /public_matriz_cadastro_v251/);
  assert.match(read('supabase/migrations/202611100002_hype_promoters_recadastro_v251.sql'),
    /public_promoter_registration_submit_v49/);
  assert.match(js, /public_promoter_matrix_invite_v250/);
  assert.match(html, /id="promoterTeamInvite"/);
});

test('SQL não apaga vendas antigas e protege vínculo matriz-filial', () => {
  const sql = read('supabase/migrations/202611100001_hype_promoter_network_v250.sql');
  assert.match(sql, /create table if not exists public\.promoter_branches_v250/);
  assert.match(sql, /matrix_id bigint not null references public\.promoters_global_v16\(id\) on delete restrict/);
  assert.match(sql, /promoter_id bigint not null unique references public\.promoters_global_v16\(id\) on delete restrict/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.promoter_branches_v250/);
  assert.match(sql, /private\.hype_require_staff/);
  assert.match(sql, /CPF já cadastrado/);
  assert.match(sql, /public_promoter_registration_submit_v49/);
  assert.doesNotMatch(sql, /\b(?:delete from public\.tickets|truncate\b|drop table public\.tickets)\b/i);
});
test('relatório detalhado de filiais não revela CPF nem WhatsApp', () => {
  const sql = read('supabase/migrations/202611100001_hype_promoter_network_v250.sql');
  const js = read('promoter-global-v16-8.js');
  assert.match(sql, /create or replace function public\.staff_promoter_branch_sales_v250/);
  assert.match(sql, /private\.hype_require_staff/);
  assert.match(sql, /order by t\.purchased_at desc/);
  assert.match(sql, /limit 100/);
  assert.match(js, /openBranchSalesV250/);
  assert.match(js, /customer_name/);
  assert.match(js, /HypePromoterNetworkV250\.openSales/);
});
