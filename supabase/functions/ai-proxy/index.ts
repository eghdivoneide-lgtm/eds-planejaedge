import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

    try {
        // Autenticar usuário via JWT
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

        const _sb = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authErr } = await _sb.auth.getUser(token)
        if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

        // Verificar créditos
        const { data: profile } = await _sb
            .from('profiles')
            .select('creditos')
            .eq('id', user.id)
            .single()

        if (!profile || profile.creditos <= 0) {
            return new Response(JSON.stringify({ error: 'sem_creditos' }), {
                status: 402,
                headers: { ...CORS, 'Content-Type': 'application/json' }
            })
        }

        // Chamar Gemini
        const { model, contents, system_instruction, generationConfig } = await req.json()
        const geminiKey = Deno.env.get('GEMINI_KEY') ?? ''
        const modelName = model || 'gemini-2.5-flash'

        const geminiBody: Record<string, unknown> = { contents }
        if (system_instruction) geminiBody.system_instruction = system_instruction
        if (generationConfig)   geminiBody.generationConfig   = generationConfig

        const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${geminiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
        )

        if (!geminiResp.ok) {
            const errText = await geminiResp.text()
            return new Response(errText, { status: geminiResp.status, headers: CORS })
        }

        // Debitar 1 crédito após sucesso
        await _sb
            .from('profiles')
            .update({ creditos: profile.creditos - 1, updated_at: new Date().toISOString() })
            .eq('id', user.id)

        const data = await geminiResp.json()
        return new Response(JSON.stringify(data), {
            headers: { ...CORS, 'Content-Type': 'application/json' }
        })

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { ...CORS, 'Content-Type': 'application/json' }
        })
    }
})
