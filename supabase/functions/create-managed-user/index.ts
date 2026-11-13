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

    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim().toLowerCase()
    if (!url || !anonKey || !serviceKey || !adminEmail) {
      return json({ error: 'User provisioning is not configured.' }, 503)
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Not authorized' }, 401)
    if ((user.email ?? '').trim().toLowerCase() !== adminEmail) {
      return json({ error: 'Only the administrator can create users.' }, 403)
    }

    let body: { email?: unknown; password?: unknown }
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid request body.' }, 400)
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email address.' }, 400)
    }
    if (password.length < 10 || password.length > 128) {
      return json({ error: 'Password must be between 10 and 128 characters.' }, 400)
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) {
      if (createError.code === 'email_exists' || createError.code === 'user_already_exists') {
        return json({ error: 'Já existe uma conta com este email.' }, 409)
      }
      return json({ error: 'Não foi possível criar a conta.' }, 500)
    }

    return json({ id: data.user.id, email: data.user.email })
  } catch {
    return json({ error: 'Não foi possível criar a conta.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
