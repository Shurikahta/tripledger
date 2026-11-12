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
    const { email: rawEmail } = await request.json()
    const email = String(rawEmail ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Endereço de email inválido.' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: invitations, error: inviteError } = await admin
      .from('trip_members').select('id').eq('email', email).eq('status', 'pending').limit(1)
    if (inviteError) throw inviteError
    const { data: activeMemberships, error: activeError } = await admin
      .from('trip_members').select('id').eq('email', email).eq('status', 'active').limit(1)
    if (activeError) throw activeError
    const { data: bootstrap, error: bootstrapError } = await admin
      .from('bootstrap_invites').select('email').eq('email', email).eq('status', 'pending').maybeSingle()
    if (bootstrapError) throw bootstrapError
    if (!invitations?.length && !activeMemberships?.length && !bootstrap) return json({ error: 'Não encontrámos um convite pendente para este email.' }, 403)

    const { error: createError } = await admin.auth.admin.createUser({ email, email_confirm: false })
    if (createError && !['email_exists', 'user_already_exists'].includes(createError.code ?? '')) throw createError
    return json({ ok: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Não foi possível validar o convite.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
