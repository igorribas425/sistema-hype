import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function digits(value: unknown) { return String(value || "").replace(/\D/g, ""); }
function asaasError(data: any) {
  if (Array.isArray(data?.errors) && data.errors.length) return data.errors.map((e:any)=>e?.description||e?.message||e?.code).filter(Boolean).join(" | ");
  return data?.message || data?.error || "Erro na API do Asaas.";
}
async function asaasRequest(path: string, options: RequestInit = {}) {
  const apiKey = Deno.env.get("ASAAS_API_KEY") || Deno.env.get("ASAAS_ACCESS_TOKEN");
  if (!apiKey) throw new Error("Secret ASAAS_API_KEY não configurado no Supabase.");
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set("access_token", apiKey);
  headers.set("User-Agent", "Hype Lounge Club");
  const response = await fetch(`https://api.asaas.com/v3${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(asaasError(data));
  return data;
}
async function getOrCreateCustomer(ticket:any) {
  const cpf = digits(ticket.cpf);
  if (cpf.length === 11 || cpf.length === 14) {
    const found = await asaasRequest(`/customers?cpfCnpj=${encodeURIComponent(cpf)}&limit=1`);
    if (Array.isArray(found?.data) && found.data[0]?.id) return found.data[0].id;
  }
  const customer:any = { name:String(ticket.customer_name || "Cliente Hype").trim() };
  const email = String(ticket.email || "").trim();
  const phone = digits(ticket.phone);
  if (email.includes("@")) customer.email = email;
  if (phone.length >= 10) customer.mobilePhone = phone;
  if (cpf.length === 11 || cpf.length === 14) customer.cpfCnpj = cpf;
  const created = await asaasRequest("/customers", { method:"POST", body:JSON.stringify(customer) });
  if (!created?.id) throw new Error("Asaas não retornou o ID do cliente.");
  return created.id;
}
async function getExistingPayment(ticketId:number) {
  const result = await asaasRequest(`/payments?externalReference=${encodeURIComponent(String(ticketId))}&limit=10`);
  if (!Array.isArray(result?.data)) return null;
  return result.data.find((p:any)=>p?.billingType === "PIX" && p?.status !== "DELETED") || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (req.method !== "POST") return json({ success:false,error:"Método não permitido." },405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Configuração interna do Supabase ausente.");
    const body = await req.json().catch(()=>({}));
    const ticketId = Number(body?.ticket_id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) return json({success:false,error:"ticket_id inválido."},400);
    const supabase = createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
    const ticketResult = await supabase.from("tickets").select("id,ticket_code,customer_name,phone,email,cpf,price,payment_status").eq("id",ticketId).maybeSingle();
    if (ticketResult.error) throw new Error(ticketResult.error.message);
    const ticket = ticketResult.data;
    if (!ticket) return json({success:false,error:"Ingresso não encontrado."},404);
    if (ticket.payment_status === "Pago") return json({success:false,error:"Este ingresso já está pago."},409);
    const value = Number(ticket.price || 0);
    if (!Number.isFinite(value) || value <= 0) return json({success:false,error:"Valor do ingresso inválido."},400);
    let payment = await getExistingPayment(ticket.id);
    if (!payment) {
      const customerId = await getOrCreateCustomer(ticket);
      const tomorrow = new Date(Date.now()+24*60*60*1000).toISOString().slice(0,10);
      payment = await asaasRequest("/payments",{method:"POST",body:JSON.stringify({customer:customerId,billingType:"PIX",value,dueDate:tomorrow,description:`Ingresso ${ticket.ticket_code || ticket.id} - Hype Lounge Club`,externalReference:String(ticket.id)})});
    }
    if (!payment?.id) throw new Error("Asaas não retornou o ID da cobrança.");
    const pix = await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
    if (!pix?.payload) throw new Error("Asaas não retornou o PIX Copia e Cola.");
    await supabase.from("tickets").update({payment_method:"PIX Asaas"}).eq("id",ticket.id);
    return json({success:true,ticket_id:ticket.id,ticket_code:ticket.ticket_code,payment_id:payment.id,payment_status:payment.status||"PENDING",qr_code:pix.payload,qr_code_base64:pix.encodedImage||null,expiration_date:pix.expirationDate||null});
  } catch (error) {
    return json({success:false,error:error instanceof Error?error.message:"Erro ao gerar PIX no Asaas."},500);
  }
});
