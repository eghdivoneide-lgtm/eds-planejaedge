import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
}

// Mapa: token do webhook → { produto, créditos }
const PLANS: Record<string, { nome: string; creditos: number }> = {
    '6t5gipip4hy': { nome: 'Starter',       creditos: 200  },
    'znfm7ny7yj3': { nome: 'Profissional',   creditos: 500  },
    'pk8p5ggfsjz': { nome: 'Premium',        creditos: 1200 },
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST')    return new Response('Method Not Allowed', { status: 405 })

    try {
        const body = await req.json()

        // Kiwify envia o token no campo webhook_token do body
        const token   = (body.webhook_token || '').trim()
        const status  = body.order_status || body.status || ''
        const email   = (body.Customer?.email || body.customer?.email || '').toLowerCase().trim()

        // Só processa compra aprovada ou renovação de assinatura
        const isApproved = ['paid', 'approved', 'order_approved', 'subscription_renewed']
            .some(s => status.toLowerCase().includes(s))

        if (!isApproved) {
            return new Response(JSON.stringify({ ok: true, skipped: status }), {
                headers: { ...CORS, 'Content-Type': 'application/json' }
            })
        }

        const plan = PLANS[token]
        if (!plan) {
            console.warn('Token desconhecido:', token)
            return new Response(JSON.stringify({ error: 'token_invalido' }), {
                status: 400,
                headers: { ...CORS, 'Content-Type': 'application/json' }
            })
        }

        if (!email) {
            return new Response(JSON.stringify({ error: 'email_ausente' }), {
                status: 400,
                headers: { ...CORS, 'Content-Type': 'application/json' }
            })
        }

        const _sb = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Adiciona créditos ao professor (cria perfil se ainda não existir)
        const { data: existing } = await _sb
            .from('profiles')
            .select('id, creditos')
            .eq('email', email)
            .single()

        if (existing) {
            await _sb
                .from('profiles')
                .update({ creditos: existing.creditos + plan.creditos, updated_at: new Date().toISOString() })
                .eq('email', email)
        } else {
            // Professor ainda não fez login — cria perfil com os créditos do plano
            const { data: authUser } = await _sb.auth.admin.listUsers()
            const user = authUser?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === email)
            if (user) {
                await _sb.from('profiles').upsert({
                    id: user.id,
                    email,
                    creditos: plan.creditos,
                    updated_at: new Date().toISOString()
                })
            }
        }

        // Registra o pagamento no histórico
        await _sb.from('payment_log').insert({
            email,
            plano: plan.nome,
            creditos_adicionados: plan.creditos,
            kiwify_status: status,
            payload: body,
        }).catch(() => {}) // tabela opcional — não bloqueia se não existir

        console.log(`✅ ${plan.creditos} créditos adicionados para ${email} (plano ${plan.nome})`)

        return new Response(JSON.stringify({ ok: true, email, plano: plan.nome, creditos: plan.creditos }), {
            headers: { ...CORS, 'Content-Type': 'application/json' }
        })

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('kiwify-webhook error:', msg)
        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' }
        })
    }
})
