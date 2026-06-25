# 🔎 Resposta à Auditoria Técnica — EDS PlanejaEdge

| | |
|---|---|
| **Projeto** | EDS PlanejaEdge |
| **Repositório** | `eghdivoneide-lgtm/eds-planejaedge` |
| **Auditoria de referência** | Auditoria Técnica de 25/06/2026 — nota **8.5/10** |
| **Data desta resposta** | 25/06/2026 |
| **Resultado** | Bloqueador (A-01) **já estava resolvido**; A-02, A-03 e **A-07 corrigidos**; A-04/A-05/A-06 planejados para pós-MVP |
| **Status** | ✅ **Liberado como MVP** |

> Agradecemos a auditoria — criteriosa e bem evidenciada. Verificamos **cada achado contra o código em produção** (a auditoria parece ter rodado sobre um snapshot anterior em alguns pontos). Abaixo, a réplica item a item, com evidência e a indicação do que pedimos para reconferência.

---

## 📋 Quadro de respostas

| # | Sev. | Achado | Nossa resposta | Reconferir? |
|---|------|--------|----------------|:----------:|
| A-01 | 🔴 | Crédito inicial 100×30 | ✅ **Já resolvido** — tudo em 100; confirmado em produção (conta nova nasce com 100) | Opcional |
| A-02 | 🟡 | Cliente podia definir `creditos` no insert | ✅ **Corrigido** — `creditos` removido do insert + policy `WITH CHECK (creditos <= 100)` aplicada em produção | **Sim** |
| A-03 | 🟡 | `schema.sql` × migrations divergiam | ✅ **Alinhado** — `schema.sql` marcado como snapshot/referência | Opcional |
| A-04 | 🟢 | Nomenclatura "seduc" | ⏳ Pós-MVP (com plano de migração de chaves) | Não |
| A-05 | 🟢 | Ausência de CSP | ⏳ Pós-MVP | Não |
| A-06 | ℹ️ | Raiz serve o app, não a landing | Decisão de produto (confirmada) | Não |
| A-07 | 🟢 | `MAX_PAYLOAD_CHARS=12M` abre superfície de custo (~12 MB por 1 crédito) | ✅ **Corrigido** — compressão de imagem no cliente (commit `2bfd544`), testado em produção | Não |

---

## 🔧 Detalhamento

### 🔴 A-01 — Crédito inicial (RESOLVIDO antes da auditoria)
O valor inicial está **unificado em 100** em todas as fontes do código atual:
- `supabase/migrations/20260620000001_init.sql` → `DEFAULT 100` e trigger `handle_new_user` → `100`
- `supabase/migrations/20260621000005_beta_100_credits.sql` → reforça `DEFAULT 100` + trigger `100` + `UPDATE` dos antigos de 30→100
- `supabase/schema.sql` → `DEFAULT 100`
- `index.html` → comentário e fallback coerentes com 100
- `landing.html`, `termos.html` → "100 créditos grátis"
- Cálculo admin `100 - creditos` já tem guarda contra negativo (`< 0 ? '—'`)

**Confirmação em produção:** cadastro de conta nova retorna **100 créditos**.
**Para reconferência (opcional):** criar uma conta de teste e validar o saldo inicial = 100.

### 🟡 A-02 — Insert de perfil com `creditos` arbitrário (CORRIGIDO)
Aplicamos **defesa em dois níveis**:
1. **Cliente:** removido o campo `creditos` do `insert` em `index.html` (passa a depender do trigger/`DEFAULT`).
2. **Banco (produção):** policy de INSERT endurecida —
   ```sql
   CREATE POLICY "profiles_insert_own" ON public.profiles
       FOR INSERT WITH CHECK (auth.uid() = id AND creditos <= 100);
   ```
   Migration: `supabase/migrations/20260625000020_harden_profiles_insert.sql` (aplicada em produção).
   O trigger `handle_new_user` é `SECURITY DEFINER` (ignora RLS) e segue criando com 100; compras são `UPDATE` via `service_role`, não afetadas.

**👉 Pedimos reconferência:** validar que a policy está ativa em produção, por exemplo tentando, como usuário comum autenticado, inserir um perfil próprio com `creditos > 100` (deve ser **rejeitado**).

### 🟡 A-03 — Fonte de verdade dupla (ALINHADO)
Os dois arquivos já estão coerentes (ambos `DEFAULT 100`). Adotamos as **migrations como fonte única de verdade** e marcamos o `supabase/schema.sql` com cabeçalho de **snapshot/referência**, para nunca mais divergir.
**Para reconferência (opcional):** conferir o cabeçalho de `schema.sql`.

### 🟢 A-04 — Nomenclatura "seduc" (PÓS-MVP)
Concordamos. **Importante:** não renomearemos as chaves `localStorage` `seduc_*` sem um plano de migração (ler chave antiga → gravar nova), pois isso apagaria perfil/histórico/preferências dos professores já ativos no beta. Sem efeito funcional; baixa prioridade.

### 🟢 A-05 — CSP (PÓS-MVP)
Concordamos. O app usa CDNs (Google Fonts, libs de DOCX/PDF, supabase-js) e estilos/scripts inline, então a CSP será montada e testada com cuidado para não quebrar o app. Reforço de defesa em profundidade, sem urgência.

### ℹ️ A-06 — Roteamento raiz/landing (DECISÃO DE PRODUTO)
A raiz `/` abre o app (login) por decisão de produto. Campanhas e anúncios apontam para `/landing.html`. Sem alteração técnica no momento.

### 🟢 A-07 — Custo do payload de 12 MB (CORRIGIDO)
O `MAX_PAYLOAD_CHARS` foi elevado para 12.000.000 (`ai-proxy/index.ts:44`) para permitir upload de PDF/imagem, o que abria superfície de custo (~12 MB ao Gemini por 1 crédito).
**Correção aplicada (commit `2bfd544`):** compressão de imagem no cliente antes do envio — `compressImage()` reduz fotos de celular (vários MB) para ~90 KB via canvas/JPEG, iterando dimensão/qualidade, com fallback para o original. Aplicada em `handleFile` e `handleAvFile`. **Testado em produção:** foto enviada → comprimida → Gemini analisou corretamente (legibilidade preservada). Feita por **port manual** da `compressImage` do PR #7 sobre o `master` (sem o baggage da branch).
Pendência menor (pós-MVP): cobrança proporcional ao tamanho para **PDFs** grandes (imagens já cobertas).

### 🔀 Nota sobre o PR #7 (`claude/wonderful-sagan-kz5o7z`)
A branch divergiu bastante do `master` — o `master` seguiu à frente com outra abordagem de payload (limite 12M) e com as correções da auditoria. **Não recomendamos merge do PR #7 como está** (risco de conflito ou de reverter trabalho mais novo). Vale reaproveitar dele, **reaplicado sobre o `master`**: (1) a **compressão de imagem** (ajuda diretamente o A-07) e (2) o **mockup do app na landing**.

---

## ✅ Itens que pedimos reconferência ao auditor
- **A-02** — confirmar que a policy `profiles_insert_own` em produção rejeita `creditos > 100` no insert do cliente.
- *(Opcional)* **A-01** — validar saldo inicial = 100 em conta nova.
- *(Opcional)* **A-03** — conferir o cabeçalho de `schema.sql`.

Os demais (A-04, A-05, A-06) **não requerem reconferência** — são polimento pós-MVP / decisão de produto, já registrados em nosso plano.

---

## 🗂️ Rastreabilidade (commits)
- `5892f30` webhook por `product_name` · `ec45e6d` índice único `payment_log` (idempotência) · `a8c6881` auto-refresh de saldo · `cbc0f9a` README atualizado · `2480284` **A-02/A-03** (insert endurecido + schema como referência)

> **Conclusão:** o único bloqueador apontado já estava sanado e os pontos médios foram corrigidos. Consideramos o **EDS PlanejaEdge liberado como MVP**, e ficamos à disposição para a reconferência dos itens acima.
