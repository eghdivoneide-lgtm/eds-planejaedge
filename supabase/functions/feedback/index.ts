import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

async function alertAdmin(texto: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_ALERT_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_ALERT_CHAT_ID')
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
    })
  } catch (_) { /* alerta nunca derruba o feedback */ }
}

// Feedback do beta: grava em public.feedback + alerta no Telegram. Exige JWT do usuário.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return json({ erro: 'nao_autenticado' }, 401)
    const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: u } = await sb.auth.getUser(token)
    const user = u?.user
    if (!user) return json({ erro: 'nao_autenticado' }, 401)
    const body = await req.json().catch(() => ({}))
    const sentimento = (body.sentimento || '').toString().slice(0, 20)
    const mensagem = (body.mensagem || '').toString().slice(0, 2000)
    const contexto = body.contexto || {}
    await sb.from('feedback').insert({ user_id: user.id, email: user.email, sentimento, mensagem, contexto })
    const emoji = sentimento === 'positivo' ? '👍' : sentimento === 'negativo' ? '👎' : '💬'
    const txt = mensagem.slice(0, 500)
    await alertAdmin(`${emoji} PlanejaEdge — FEEDBACK de ${user.email}${txt ? `:\n"${txt}"` : ' (sem texto)'}`)
    return json({ ok: true })
  } catch (_err) {
    return json({ erro: 'erro_interno' }, 500)
  }
})
