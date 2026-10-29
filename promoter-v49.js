(() => {
  'use strict';
  const config = window.HYPE_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(config.url, config.anonKey);
  const $ = id => document.getElementById(id);
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const digits = value => String(value || '').replace(/\D/g, '');
  let salesUrl = '';
  let inviteUrl='';
  function showStatus(message, kind) {
    const box = $('promoterStatus');
    if (!box) return;
    box.className = `status show ${kind || ''}`;
    box.textContent = message;
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
    button.disabled = true; button.textContent = 'GERANDO...';
    try {
      const {data, error} = await client.rpc('public_promoter_registration_submit_v49', {
        p_name: $('promoterName').value.trim(),
        p_cpf: digits($('promoterCpf').value),
        p_phone: digits($('promoterPhone').value),
        p_website: $('promoterWebsite').value
      });
      if (error) throw error;
      const row = rows(data)[0] || {};
      if (!row.ok || !row.sales_url) {
        showStatus(row.message || 'Cadastro indisponível.', 'error');
        $('promoterResult').classList.remove('show');
        return;
      }
      salesUrl = row.sales_url;
      inviteUrl=row.promoter_code?`https://hypeloungeclub.com.br/lista-promoter.html?promoter=${encodeURIComponent(row.promoter_code)}`:'';
      if(inviteUrl){$('promoterInviteLink').textContent=inviteUrl;$('promoterInviteResult').style.display='block';}
      $('promoterSalesLink').textContent = salesUrl;
      $('promoterResult').classList.add('show');
      showStatus(row.message || 'Cadastro aprovado.', 'ok');
    } catch (error) {
      showStatus(error?.message || 'Não foi possível gerar o link.', 'error');
    } finally {
      button.disabled = false; button.textContent = 'GERAR MEU LINK DE VENDAS';
    }
  }
  async function invitation(type){
   if(!inviteUrl)return;
   if(type==='open'){location.href=inviteUrl;return;}
   if(type==='share'&&navigator.share){try{await navigator.share({title:'Convite HYPE',url:inviteUrl});return;}catch(_){}}
   try{await navigator.clipboard.writeText(inviteUrl);}catch(_){const box=document.createElement('textarea');box.value=inviteUrl;document.body.append(box);box.select();document.execCommand('copy');box.remove();}
   showStatus('Link de convidados copiado!','ok');
  }
  $('promoterInviteCopy')?.addEventListener('click',()=>invitation('copy'));
  $('promoterInviteShare')?.addEventListener('click',()=>invitation('share'));
  $('promoterInviteOpen')?.addEventListener('click',()=>invitation('open'));
  $('promoterCpf')?.addEventListener('input', event => formatCpf(event.currentTarget));
  $('promoterPhone')?.addEventListener('input', event => formatPhone(event.currentTarget));
  $('promoterForm')?.addEventListener('submit', submit);
  $('promoterCopy')?.addEventListener('click', copy);
  $('promoterShare')?.addEventListener('click', share);
  $('promoterOpenSales')?.addEventListener('click', openSales);
})();
