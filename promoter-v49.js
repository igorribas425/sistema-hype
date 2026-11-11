(() => {
  'use strict';
  const config = window.HYPE_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(config.url, config.anonKey);
  const $ = id => document.getElementById(id);
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const digits = value => String(value || '').replace(/\D/g, '');
  let salesUrl = '';
  let teamInviteUrl = '';
  const matrixCode = new URLSearchParams(window.location.search).get('matriz')?.trim().toUpperCase() || '';
  const isBranchSignup = Boolean(matrixCode);
  const matrixInviteToken = isBranchSignup ? '' :
    (new URLSearchParams(window.location.search).get('convite')?.trim() || '');
  let inviteVerified = isBranchSignup;
  const tabButtons = {
    cadastro: $('promoterTabRegister'),
    vendas: $('promoterTabSales'),
    filiais: $('promoterTabBranches')
  };
  function showTab(tab) {
    if (tab === 'vendas' && !salesUrl) return;
    if (tab === 'filiais' && (isBranchSignup || !teamInviteUrl)) return;
    for (const [name, button] of Object.entries(tabButtons)) {
      if (!button) continue;
      const selected = name === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    if ($('promoterForm')) $('promoterForm').hidden = tab !== 'cadastro';
    if ($('promoterResult')) $('promoterResult').hidden = tab !== 'vendas';
    if ($('promoterTeamInvite')) $('promoterTeamInvite').hidden = tab !== 'filiais';
    $('promoterResult')?.classList.toggle('show', tab === 'vendas' && !!salesUrl);
    $('promoterTeamInvite')?.classList.toggle('show', tab === 'filiais' && !!teamInviteUrl);
  }
  if (!isBranchSignup && !matrixInviteToken) {
    const hint = $('promoterHint');
    if (hint) hint.textContent = 'O cadastro de matriz agora é exclusivo por convite. Peça ao ADM da HYPE o novo link de cadastro.';
    const button = $('promoterSubmit');
    if (button) { button.disabled = true; button.textContent = 'SOLICITE O CONVITE DE MATRIZ'; }
  }
  if (isBranchSignup) {
    if (tabButtons.filiais) tabButtons.filiais.hidden = true;
    if ($('promoterSubmit')) $('promoterSubmit').textContent = 'CADASTRAR FILIAL E GERAR LINK';
    const heading = $('promoterHeading');
    const subtitle = $('promoterSubtitle');
    const hint = $('promoterHint');
    const label = $('promoterMatrixLabel');
    if (heading) heading.textContent = 'Seja filial de vendas HYPE';
    if (subtitle) subtitle.textContent = 'Você foi convidado por uma matriz. Faça seu cadastro como vendedor e receba seu próprio link para vender ingressos.';
    if (hint) hint.textContent = 'O CPF não pode estar vinculado a outra matriz. Se você já é promoter, entre em contato com a administração para alterar o vínculo.';
    if (label) { label.textContent = 'Código da matriz: ' + matrixCode; label.hidden = false; }
  }
  function showStatus(message, kind) {
    const box = $('promoterStatus');
    if (!box) return;
    box.className = `status show ${kind || ''}`;
    box.textContent = message;
  }
  async function validateInvite() {
    if (isBranchSignup) return;
    const button = $('promoterSubmit');
    if (!matrixInviteToken) {
      showStatus('O convite está incompleto. Abra o link completo enviado pelo administrador da HYPE.', 'error');
      return;
    }
    if (!client) {
      showStatus('Não foi possível conectar ao servidor. Atualize a página e tente novamente.', 'error');
      button.disabled = true;
      return;
    }
    button.disabled = true;
    button.textContent = 'VERIFICANDO CONVITE...';
    showStatus('Verificando se este convite é o atual da HYPE...', '');
    try {
      const {data, error} = await client.rpc('public_matriz_convite_valido_v252', {
        p_invite_token: matrixInviteToken
      });
      if (error) throw error;
      if (data !== true) {
        inviteVerified = false;
        button.disabled = true;
        button.textContent = 'SOLICITE O NOVO CONVITE AO ADM';
        showStatus('Este link é antigo, foi revogado ou está incompleto. Peça ao ADM da HYPE o convite de matriz atualizado e abra o link completo.', 'error');
        return;
      }
      inviteVerified = true;
      button.disabled = false;
      button.textContent = 'CADASTRAR MATRIZ E GERAR LINKS';
      showStatus('Convite de matriz confirmado. Preencha os dados para gerar seus links.', 'ok');
    } catch (error) {
      inviteVerified = false;
      button.disabled = true;
      button.textContent = 'ATUALIZE A PÁGINA PARA TENTAR';
      showStatus('Não foi possível validar o convite agora. Atualize a página ou fale com o ADM. ' + (error?.message || ''), 'error');
    }
  }
  function formatCpf(input) {
    const value = digits(input.value).slice(0, 11);
    input.value = value.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  function formatPhone(input) {
    const value = digits(input.value).slice(0, 11);
    input.value = value.length > 10 ? value.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3') : value.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
  }
  async function copy() {
    if (!salesUrl) return;
    try { await navigator.clipboard.writeText(salesUrl); } catch (_) {
      const area = document.createElement('textarea'); area.value = salesUrl; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    showStatus('Link copiado. Envie para seus clientes.', 'ok');
  }
  async function share() {
    if (!salesUrl) return;
    if (navigator.share) {
      try { await navigator.share({title:'Link de vendas HYPE',text:'Meu link de vendas HYPE',url:salesUrl}); return; } catch (_) {}
    }
    await copy();
  }
  function openSales() {
    if (salesUrl) window.location.href = salesUrl;
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('promoterSubmit');
    if (!form.reportValidity() || !client) return;
    if (!isBranchSignup && !inviteVerified) {
      showStatus('O convite ainda não foi validado. Use o link oficial mais recente enviado pelo ADM.', 'error');
      return;
    }
    button.disabled = true; button.textContent = 'GERANDO...';
    try {
      const params = {
        p_name: $('promoterName').value.trim(),
        p_cpf: digits($('promoterCpf').value),
        p_phone: digits($('promoterPhone').value),
        p_website: $('promoterWebsite').value
      };
      if (isBranchSignup) params.p_matrix_code = matrixCode;
      else params.p_invite_token = matrixInviteToken;
      const {data, error} = await client.rpc(
        isBranchSignup ? 'public_filial_cadastro_v251' : 'public_matriz_cadastro_v251',
        params
      );
      if (error) throw error;
      const row = rows(data)[0] || {};
      if (!row.ok || !row.sales_url) {
        if (!isBranchSignup && /convite oficial de matriz/i.test(String(row.message || ''))) inviteVerified = false;
        showStatus(row.message || 'Cadastro indisponível.', 'error');
        salesUrl = '';
        teamInviteUrl = '';
        tabButtons.vendas.disabled = true;
        tabButtons.filiais.disabled = true;
        showTab('cadastro');
        return;
      }
      salesUrl = row.sales_url;
      $('promoterSalesLink').textContent = salesUrl;
      tabButtons.vendas.disabled = false;
      tabButtons.filiais.disabled = true;
      $('promoterResult').classList.add('show');
      $('promoterTeamInvite')?.classList.remove('show');
      teamInviteUrl = '';
      if (!isBranchSignup) {
        try {
          const {data: matrixData, error: matrixError} = await client.rpc('public_promoter_matrix_invite_v250', {
            p_promoter_code: row.promoter_code
          });
          const invite = rows(matrixData)[0];
          if (!matrixError && invite?.ok && invite.invite_url) {
            teamInviteUrl = invite.invite_url;
            $('promoterTeamUrl').textContent = teamInviteUrl;
            $('promoterTeamInvite')?.classList.add('show');
            tabButtons.filiais.disabled = false;
          }
        } catch (_) { /* Continua fornecendo o link de venda sem dependências */ }
      }
      showTab('vendas');
      showStatus(row.message || 'Cadastro aprovado.', 'ok');
    } catch (error) {
      showStatus(error?.message || 'Não foi possível gerar o link.', 'error');
    } finally {
      button.disabled = !isBranchSignup && !inviteVerified;
      button.textContent = isBranchSignup ? 'CADASTRAR FILIAL E GERAR LINK' : (inviteVerified ? 'CADASTRAR MATRIZ E GERAR LINKS' : 'SOLICITE O NOVO CONVITE AO ADM');
    }
  }
  tabButtons.cadastro?.addEventListener('click', () => showTab('cadastro'));
  tabButtons.vendas?.addEventListener('click', () => showTab('vendas'));
  tabButtons.filiais?.addEventListener('click', () => showTab('filiais'));
  showTab('cadastro');
  void validateInvite();
  $('promoterCpf')?.addEventListener('input', event => formatCpf(event.currentTarget));
  $('promoterPhone')?.addEventListener('input', event => formatPhone(event.currentTarget));
  $('promoterForm')?.addEventListener('submit', submit);
  $('promoterCopy')?.addEventListener('click', copy);
  $('promoterShare')?.addEventListener('click', share);
  $('promoterOpenSales')?.addEventListener('click', openSales);
  $('promoterTeamCopy')?.addEventListener('click', async () => {
    if (!teamInviteUrl) return;
    try { await navigator.clipboard.writeText(teamInviteUrl); }
    catch (_) {
      const area = document.createElement('textarea');
      area.value = teamInviteUrl; document.body.appendChild(area);
      area.select(); document.execCommand('copy'); area.remove();
    }
    showStatus('Convite para filiais copiado.', 'ok');
  });
})();
