# EDS PlanejaEdge

Assistente pedagógico com IA para professores e coordenadores da rede pública. Gera planos de aula, avaliações, correções e relatórios de turma com base na BNCC, usando o modelo Gemini da Google — sem expor a chave de API no cliente.

## Arquitetura

```
Navegador (PWA)
  │
  ├── Supabase Auth (email + senha)
  │     └── JWT Bearer token em cada requisição
  │
  └── Supabase Edge Function: ai-proxy (Deno)
        ├── Valida JWT via getUser()
        ├── Débito atômico de crédito (RPC debit_credit)
        ├── Chama Gemini com GEMINI_KEY (env var secreta)
        └── Estorno automático se Gemini falhar (RPC refund_credit)
```

**Stack:**
- Frontend: PWA single-file HTML5+JS, Netlify (branch `master`)
- Auth + DB: Supabase (`eds-planejaedge`, São Paulo)
- IA: Gemini 2.5 Flash / Pro via Edge Function
- Deploy: automático no Netlify a cada push em `master`

## Modelo de créditos

Cada usuário nasce com **100 créditos**. Cada chamada à IA consome 1 crédito.

- Crédito debitado **antes** da chamada Gemini (débito atômico, sem race condition)
- Crédito **estornado automaticamente** se a IA retornar erro
- Ao zerar: HTTP 402 → mensagem "Créditos esgotados"

**Adicionar créditos via painel admin** (recomendado) ou via SQL:
```sql
UPDATE profiles SET creditos = creditos + 100 WHERE email = 'professor@escola.edu.br';
```

## Banco de dados

Tabela principal: `public.profiles`

| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID | FK → auth.users |
| email | TEXT | E-mail do professor |
| creditos | INTEGER | Créditos restantes (padrão 100) |
| is_admin | BOOLEAN | Acesso ao painel admin |
| last_ai_at | TIMESTAMPTZ | Última chamada IA (rate limit) |
| created_at | TIMESTAMPTZ | Data de cadastro |

**Funções RPC:**
- `debit_credit(p_user_id)` — débito atômico, retorna `NULL` (sem crédito) ou `-1` (rate limit)
- `refund_credit(p_user_id)` — estorna 1 crédito
- `admin_list_users()` — lista todos os usuários (só admins)
- `admin_add_credits(p_email, p_amount)` — adiciona créditos (só admins)

## Segurança

- Chave Gemini (`GEMINI_KEY`) e `SUPABASE_SERVICE_ROLE_KEY` vivem **exclusivamente** nos segredos da Edge Function — nunca no cliente ou no repositório
- No app, apenas a **anon key** (pública por design do Supabase)
- CORS restrito ao domínio Netlify via env var `ALLOWED_ORIGIN`
- RLS habilitada na tabela `profiles` (cada usuário acessa só o próprio perfil)
- Rate limit: 1 requisição a cada 3 segundos por usuário (enforced no banco)
- Allowlist de modelos Gemini no proxy (rejeita nomes arbitrários)
- Limite de payload: 100k caracteres por requisição

## Deploy

### Pré-requisitos
- Conta Netlify conectada ao repositório GitHub
- Projeto Supabase criado (região São Paulo recomendada)
- Node.js 18+ (para usar `npx supabase`)

### 1. Variáveis de ambiente (Supabase Edge Function secrets)

```bash
npx supabase secrets set GEMINI_KEY=AIza... --project-ref SEU_PROJECT_REF
npx supabase secrets set ALLOWED_ORIGIN=https://seu-site.netlify.app --project-ref SEU_PROJECT_REF
```

### 2. Aplicar schema do banco

Execute os arquivos em `supabase/migrations/` no SQL Editor do Supabase (em ordem numérica) ou via CLI:

```bash
SUPABASE_ACCESS_TOKEN=seu_pat npx supabase db push --project-ref SEU_PROJECT_REF
```

### 3. Deploy da Edge Function

```bash
SUPABASE_ACCESS_TOKEN=seu_pat npx supabase functions deploy ai-proxy --project-ref SEU_PROJECT_REF
```

### 4. Configurar constantes no `index.html`

```js
const SUPABASE_URL      = 'https://SEU_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';  // anon key pública
```

### 5. Push para `master` → Netlify deploya automaticamente

## Painel Admin

Para acessar o painel de gestão de usuários e créditos:

1. No SQL Editor do Supabase, marque seu usuário como admin:
```sql
UPDATE profiles SET is_admin = TRUE WHERE email = 'seu@email.com';
```

2. Faça login no app — um botão "Admin" aparecerá no menu de perfil
3. No painel admin: veja todos os professores, créditos usados e adicione créditos

## Estrutura de arquivos

```
index.html                          # App completo (PWA)
sw-seduc.js                         # Service Worker
manifest-seduc.webmanifest          # PWA manifest
netlify.toml                        # Security headers + redirects
supabase/
  functions/ai-proxy/index.ts       # Edge Function (Deno)
  migrations/
    20260620000001_init.sql          # Schema inicial (profiles, RLS, trigger)
    20260621000001_debit_credit_fn.sql
    20260621000002_refund_credit_fn.sql
    20260621000003_admin_and_ratelimit.sql
```

## Desenvolvimento local

O app não precisa de build. Abra `index.html` em qualquer servidor HTTPS local:

```bash
npx serve .
# ou
python -m http.server 8080
```

Para testar a Edge Function localmente é necessário Docker. Para desenvolvimento, é mais prático apontar para o projeto Supabase de staging.

## Licença

Proprietário — EDS Soluções Inteligentes. Uso restrito à rede SEDUC-PE durante o período beta.
