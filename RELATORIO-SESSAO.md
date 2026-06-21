# Relatório da Sessão — EDS PlanejaEdge

Registro das correções e melhorias aplicadas no preparo para o piloto com professores.

---

## 🔴 Segurança — 5 vulnerabilidades corrigidas

| Problema | Correção |
|---|---|
| Chave TTS exposta no cliente (enviada direto ao Google via JS) | Recurso de voz removido por completo (a pedido do usuário) |
| Código morto da era pré-Supabase (`markSessionActivity`, `checkSessionExpiry`, chamando funções inexistentes) | Removido — ~30 referências eliminadas |
| Race condition no débito de créditos (double-spend em requisições simultâneas) | Débito atômico via RPC `debit_credit` — `UPDATE ... WHERE creditos > 0 RETURNING` |
| Sem validação de payload no proxy | Limite de 100k caracteres + allowlist de modelos Gemini |
| CORS aberto (`*`) | Restrito ao domínio via `ALLOWED_ORIGIN`, com versão resiliente (multi-domínio + previews do Netlify) |

## 🔴 Bug crítico — crédito perdido quando o Gemini falha

- O crédito era debitado antes da chamada e nunca devolvido em caso de erro.
- Criada a função `refund_credit` + chamada automática no proxy quando o Gemini retorna erro.

## 🟡 Rate limiting

- Professores podiam fazer requisições ilimitadas por segundo.
- Cooldown de 3 segundos por usuário no banco (função `debit_credit` atualizada); retorna **HTTP 429** com mensagem em português.

## 🟡 CORS malformado ("Failed to fetch")

- Ao configurar `ALLOWED_ORIGIN`, o valor ficou como `ALLOWED_ORIGINhttps://...` (nome grudado no valor), produzindo um header inválido.
- Corrigido no painel do Supabase (campo *Value* só com a URL) + redeploy da função.
- Código da `ai-proxy` tornado **resiliente**: aceita vários domínios separados por vírgula e libera previews `*--<site>.netlify.app` automaticamente.

## 🟡 Erros do Supabase em inglês

- Mensagens como *"For security purposes, you can only request this after 12 seconds"* apareciam para o professor.
- Padrões traduzidos para o português via `translateSbError()`.

## 🟡 Créditos não apareciam após login

- `updateCreditsDisplay()` só atualizava elementos fora do campo de visão.
- Adicionado `id="status-chip"` no header + créditos no toast de boas-vindas.
- O chip de créditos deixou de sumir no mobile e ganhou destaque (🪙) — visível em qualquer tela.

---

## ✨ Funcionalidades adicionadas

### Página de apresentação (landing)
- `landing.html` no padrão visual EDS, com a **figura do Professor EDS** que "passeia" pela página exibindo dicas por seção.
- CTAs **"Criar conta"** e **"Entrar"** apontando para o app; o app abre direto no cadastro com `?signup=1`.
- Link **"Conheça nosso aplicativo"** no app (tela de login e Configurações) — conecta app ↔ landing nos dois sentidos.

### Ajuda por tooltip (balão no hover)
- Ao passar o mouse sobre as abas e os botões (prompts e ações), aparece um balão explicando o que cada função faz.
- Foto do consultor (Professor EDS) no cabeçalho como elemento de ajuda.

### Painel Admin (🛠 Admin — visível só para `is_admin = TRUE`)
- Lista todos os professores com créditos restantes e último uso de IA.
- Botão para adicionar créditos sem abrir o Supabase.
- RPCs `admin_list_users` e `admin_add_credits` com verificação de permissão no banco.
- Correção necessária: `auth.uid()` não funciona em `SECURITY DEFINER` — substituído por leitura direta de `request.jwt.claims`.

### GitHub Actions CI
- Valida arquivos obrigatórios, sintaxe do Service Worker e a Edge Function a cada push.
- Corrigido um check que apontava para uma string inexistente (`eds-planejaedge`) → passou a validar a referência real do projeto Supabase.

### Documentação
- `README.md` criado do zero: arquitetura, modelo de créditos, tabela do banco, deploy e segurança.
- `LEIA-ME` corrigido (referenciava arquivo inexistente e fluxo antigo de chave Gemini).

---

## 🗄️ Infraestrutura Supabase

| Função SQL | O que faz |
|---|---|
| `debit_credit(uuid)` | Débito atômico com rate limit de 3s |
| `refund_credit(uuid)` | Estorno quando a IA falha |
| `admin_list_users()` | Lista todos os perfis (só admins) |
| `admin_add_credits(email, amount)` | Adiciona créditos (só admins) |

Colunas adicionadas em `profiles`: `is_admin`, `last_ai_at`.

---

## ✅ Estado final

App disponível em **https://planejaedge-eds.netlify.app**, pronto para o piloto com professores. Créditos gerenciados pelo painel Admin, sem necessidade de acesso direto ao Supabase.
