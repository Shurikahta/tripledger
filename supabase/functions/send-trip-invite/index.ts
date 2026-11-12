import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Not authorized' }, 401)
    const { member_id: memberId } = await request.json()
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Not authorized' }, 401)

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: member, error: memberError } = await admin.from('trip_members')
      .select('id,trip_id,email,status,role').eq('id', memberId).maybeSingle()
    if (memberError || !member || member.status !== 'pending' || member.role !== 'participant') return json({ error: 'Invitation unavailable.' }, 404)
    const { data: manager } = await admin.from('trip_members').select('id')
      .eq('trip_id', member.trip_id).eq('user_id', user.id).eq('role', 'manager').eq('status', 'active').maybeSingle()
    if (!manager) return json({ error: 'Only the trip manager can send invitations.' }, 403)
    const { data: trip } = await admin.from('trips').select('name').eq('id', member.trip_id).single()
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('INVITE_FROM_EMAIL')
    const appUrl = Deno.env.get('APP_URL')
    if (!apiKey || !from || !appUrl) return json({ error: 'Email invitations are not configured yet.' }, 503)

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [member.email],
        subject: `Convite para ${trip?.name ?? 'uma viagem'}`,
        html: `<div style="font-family:Arial,sans-serif;color:#26352f;max-width:560px;margin:auto;padding:28px"><p style="color:#5c9b80;font-weight:700;letter-spacing:1px">TRIPLEDGER</p><h1 style="font-size:24px">Foste convidado para uma viagem</h1><p>Foi-te enviado um convite para <strong>${escapeHtml(trip?.name ?? 'uma viagem')}</strong>.</p><p>Abre a aplicação e usa o teu endereço de email para receber um código OTP e ativar a conta.</p><p style="margin:28px 0"><a href="${escapeHtml(appUrl)}" style="background:#285b4a;color:#fff;padding:13px 18px;border-radius:9px;text-decoration:none">Abrir Tripledger</a></p><p style="color:#6d7772;font-size:13px">Se não estavas à espera deste convite, podes ignorar esta mensagem.</p></div>`,
      }),
    })
    if (!response.ok) return json({ error: 'O serviço de email não conseguiu enviar o convite.' }, 502)
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o convite.' }, 500)
  }
})

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
