# 🔍 Auditoria Técnica — EDS PlanejaEdge

| | |
|---|---|
| **Projeto** | EDS PlanejaEdge (assistente pedagógico com IA) |
| **Repositório** | `eghdivoneide-lgtm/EDS_Seduc_Web` |
| **Data da auditoria** | 25/06/2026 |
| **Escopo** | Frontend (PWA), Edge Functions (Deno/Supabase), banco de dados (migrations + RLS), integração de pagamento (Kiwify), PWA, CI e configuração de deploy |
| **Objetivo** | Avaliar prontidão para lançamento como MVP |
| **Nota geral** | **8.5 / 10** |
| **Status** | ✅ Liberável como MVP **após corrigir 1 item crítico** |

> **Nota aos analistas:** este documento é uma base para conferência. Cada achado traz evidência (arquivo:linha), impacto e recomendação. Pedimos validação dos pontos, ajuste de severidade onde julgarem necessário e refinamento das correções propostas antes da implementação.

---

## 1. Sumário Executivo

O EDS PlanejaEdge é um MVP **bem arquitetado**, com fundação de segurança e backend acima da média para o estágio. As chaves sensíveis estão isoladas no servidor, o controle de créditos é atômico e à prova de race condition, e o pagamento é idempotente.

Há **um único bloqueador real** para o lançamento comercial: uma **inconsistência no valor de créditos iniciais** (a propaganda promete 100; o banco entrega 30). Os demais achados são de severidade média ou cosmética e podem ser tratados com o produto já em produção.

| Dimensão | Nota |
|---|---|
| Segurança | 9.5 |
| Backend / Banco de dados | 9.0 |
| Integração de pagamento | 9.0 |
| Frontend / UX | 8.0 |
| Consistência / polimento | 7.0 |
| Documentação | 9.0 |

---

## 2. Quadro de Achados

| # | Severidade | Achado | Bloqueia MVP? |
|---|---|---|---|
| A-01 | 🔴 Crítico | Inconsistência no crédito inicial (100 prometido × 30 entregue) | **Sim** |
| A-02 | 🟡 Médio | Cliente pode definir `creditos` no insert de perfil (RLS não valida valor) | Não |
| A-03 | 🟡 Médio | `schema.sql` (100) diverge das migrations (30) — fonte de verdade dupla | Não |
| A-04 | 🟢 Cosmético | Resquícios de nomenclatura "seduc" em arquivos e descrição | Não |
| A-05 | 🟢 Cosmético | Ausência de Content-Security-Policy (CSP) nos headers | Não |
| A-06 | 🟢 Informativo | Raiz `/` serve o app; landing em `/landing.html` (decisão de produto) | Não |

---

## 3. Detalhamento dos Achados

### 🔴 A-01 — Inconsistência no crédito inicial (CRÍTICO)

**Evidência:**
| Local | Valor |
|---|---|
| `landing.html:220` — "100 créditos grátis" | 100 |
| `README.md:28,47` | 100 |
| `index.html:1600` — cálculo admin `100 - creditos` | 100 |
| `supabase/schema.sql:10` | 100 |
| `supabase/migrations/20260620000001_init.sql:10` (`DEFAULT 30`) | **30** |
| `supabase/migrations/20260620000001_init.sql:32` (trigger `handle_new_user`) | **30** |
| `index.html:1442` (fallback de insert no cliente) | **30** |

**Impacto:**
- O professor que se cadastra recebe **30 créditos**, mas a landing e a comunicação prometem **100** → quebra de promessa logo no primeiro contato, risco de frustração e de reclamação.
- O painel admin calcula "créditos usados" como `100 - creditos`, produzindo números **incorretos** (ex.: usuário novo com 30 aparece como tendo usado 70).

**Recomendação:**
Definir **100** como valor único e alinhar em três lugares:
1. `migrations/...init.sql` → `DEFAULT 100` e o `INSERT` do trigger `handle_new_user` → `100`.
2. `index.html:1442` → fallback de insert → `100` (idealmente remover o `creditos` do insert; ver A-02).
3. `schema.sql` → confirmar `100`.
4. Aplicar migration de correção no banco **em produção** (usuários já criados com 30 podem ser ajustados via `UPDATE` pontual, se desejado).

**Esforço estimado:** ~15 min + 1 migration de produção.

---

### 🟡 A-02 — Cliente pode definir `creditos` no insert de perfil (MÉDIO)

**Evidência:** `index.html:1429-1445` (função `loadUserProfile`) e `migrations/...init.sql:21-22` (policy `profiles_insert_own`).

A política de RLS de insert valida apenas a identidade:
```sql
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
```
Ela **não restringe o valor de `creditos`**. O cliente faz:
```js
.insert({ id: ..., email: ..., creditos: 30 })
```

**Impacto:**
- Em condições normais o *trigger* `handle_new_user` cria o perfil no cadastro (server-side), então o insert do cliente cai em `ON CONFLICT DO NOTHING` e não é executado.
- **Porém**, se o trigger falhar ou não existir o perfil, um usuário tecnicamente capaz poderia inserir o próprio perfil com `creditos` arbitrário (ex.: 100000), contornando o modelo de cobrança.
- Severidade limitada pela dependência da falha do trigger, mas é uma superfície de abuso evitável.

**Recomendação (uma das opções):**
1. **Preferida:** remover `creditos` do insert no cliente — deixar exclusivamente o trigger/servidor definir o saldo inicial.
2. Endurecer a policy com limite: `WITH CHECK (auth.uid() = id AND creditos <= 100)`.
3. (Defesa em profundidade) Tornar o trigger a única via de criação de perfil e tratar ausência de perfil como erro recuperável no cliente.

**Esforço estimado:** ~20 min.

---

### 🟡 A-03 — Fonte de verdade dupla no schema (MÉDIO)

**Evidência:** `supabase/schema.sql:10` (`DEFAULT 100`) × `supabase/migrations/20260620000001_init.sql:10` (`DEFAULT 30`).

**Impacto:** Dois arquivos descrevem o mesmo schema com valores diferentes. Quem aplicar `schema.sql` obtém um comportamento; quem aplicar as migrations obtém outro. Foi a causa-raiz que permitiu o A-01 passar despercebido.

**Recomendação:** Eleger as **migrations** como fonte única de verdade e ou (a) gerar o `schema.sql` a partir delas, ou (b) marcá-lo como apenas-referência/snapshot no topo do arquivo. Garantir que os dois nunca divirjam.

**Esforço estimado:** ~10 min.

---

### 🟢 A-04 — Resquícios de nomenclatura "seduc" (COSMÉTICO)

**Evidência:** `manifest-seduc.webmanifest`, `sw-seduc.js`, descrição "SEDUC-PE" em `manifest-seduc.webmanifest:4`, chaves `localStorage` `seduc_*` em `index.html` (linhas 1656, 1679, 1681, 1804, 1812, 2713, 2714) e `sw-seduc.js:6`.

**Impacto:** Apenas consistência de marca; sem efeito funcional.

**⚠️ Atenção (risco se feito errado):** **Não renomear as chaves `localStorage` `seduc_*`.** Elas guardam perfil, histórico e preferências dos professores. Renomeá-las **apagaria os dados locais** dos usuários já ativos no beta. Renomeação de arquivos (`manifest`, `sw`) exige atualizar todas as referências e o registro do service worker, com cuidado de cache.

**Recomendação:** Tratar somente após o beta, com plano de migração de chaves (ler chave antiga → gravar nova) se a renomeação for desejada. Baixa prioridade.

**Esforço estimado:** ~30–45 min (com migração de chaves), se priorizado.

---

### 🟢 A-05 — Ausência de CSP (COSMÉTICO)

**Evidência:** `netlify.toml` define X-Frame-Options, X-Content-Type-Options e Referrer-Policy, mas **não** define `Content-Security-Policy`.

**Impacto:** Camada extra de mitigação a XSS ausente. Mitigado parcialmente pelos headers já presentes e pela arquitetura (sem chaves sensíveis no cliente).

**Recomendação:** Adicionar uma CSP — atenção: o app usa CDNs (fontes Google, libs como mammoth/pdf, supabase-js) e estilos/scripts inline, então a política precisa ser montada e testada com cuidado para não quebrar o app. Tratar como reforço pós-MVP.

**Esforço estimado:** ~1–2 h (montagem + testes).

---

### 🟢 A-06 — Roteamento raiz/landing (INFORMATIVO)

**Evidência:** `netlify.toml` redirect catch-all → `/index.html`; landing em `/landing.html`.

**Impacto:** A raiz `/` abre o **app (login)**, não a landing. Decisão de produto, não defeito.

**Recomendação:** Confirmar que campanhas/anúncios apontam para `/landing.html`. Se a intenção for que visitantes novos caiam primeiro na landing, considerar inverter (landing na raiz, app em `/app`). Sem impacto técnico.

---

## 4. Pontos Fortes (validados)

- **Isolamento de segredos:** `GEMINI_KEY` e `SUPABASE_SERVICE_ROLE_KEY` apenas nos secrets das Edge Functions; cliente expõe somente a `anon key` (pública por design, protegida por RLS). — `ai-proxy/index.ts`, `kiwify-webhook/index.ts`
- **Débito atômico de crédito:** `UPDATE ... WHERE creditos > 0 RETURNING` em RPC `SECURITY DEFINER` — sem double-spend. — `migrations/...debit_credit_fn.sql`, `...admin_and_ratelimit.sql`
- **Estorno automático** em falha do Gemini. — `ai-proxy/index.ts:112-117`
- **Rate limiting** de 3s por usuário no banco. — `migrations/...admin_and_ratelimit.sql`
- **Pagamento idempotente:** índice único em `order_id`; webhook não credita o mesmo pedido 2x. — `migrations/...kiwify_grant.sql`
- **Validação de payload + allowlist de modelos** no proxy. — `ai-proxy/index.ts:34-76`
- **CORS** restrito por domínio com liberação de previews do Netlify. — `ai-proxy/index.ts:7-32`
- **Headers de segurança** no Netlify (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). — `netlify.toml`
- **Funções SQL com `search_path` fixo** e verificação de admin via `request.jwt.claims`. — `migrations/...admin_and_ratelimit.sql`
- **PWA completo** (manifest + service worker + instalável) e **CI** no GitHub Actions.
- **Correção do bug de beta** `payload_muito_grande` já implementada (PR #7): histórico por orçamento de caracteres + compressão de imagem + mensagens de erro amigáveis.

---

## 5. Veredito sobre o Lançamento (MVP)

**Liberável como MVP após corrigir o achado A-01** (inconsistência de créditos), que é rápido. A fundação de segurança, pagamento e créditos está pronta e robusta. Os achados A-02 e A-03 devem entrar na primeira sprint pós-lançamento; A-04 a A-06 são polimento sem urgência.

### Checklist sugerido antes de abrir as vendas
- [ ] **A-01** — Alinhar crédito inicial em 100 (migration + front + schema) e aplicar em produção
- [ ] **A-02** — Remover `creditos` do insert do cliente (ou endurecer a policy)
- [ ] **A-03** — Definir fonte única de verdade do schema
- [ ] Confirmar secrets de produção configurados (`GEMINI_KEY`, `KIWIFY_TOKEN_*`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGIN`)
- [ ] Smoke test de ponta a ponta: cadastro → uso de IA → esgotar créditos → compra Kiwify → crédito automático

### Pós-lançamento (acompanhar)
- [ ] **A-04** nomenclatura "seduc" (com migração de chaves localStorage)
- [ ] **A-05** CSP
- [ ] **A-06** decisão de roteamento raiz/landing

---

*Documento gerado para conferência e refinamento pela equipe de analistas. Os pontos, severidades e correções propostas estão abertos a validação antes da implementação.*
