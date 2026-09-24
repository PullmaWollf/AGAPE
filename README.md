# Célula Ágape — PWA

Mural com posts (versículo, mensagem, aviso — com foto opcional), escala de
lanche por semanas do mês com modelos reutilizáveis, e notificações push
reais em cada aparelho instalado.

## O que mudou nesta versão

- **Escala por modelos**: crie um modelo para cada tamanho de mês (3, 4 ou 5
  semanas) e gere o mês inteiro em um clique, com opção de rodízio.
- **Notificações confiáveis**: a fila de envio agora vive no banco
  (`public.notificacoes`) e é despachada por um agendador dentro do próprio
  Supabase (a cada minuto), com retentativas e Web Push **criptografado**
  (a versão antiga mandava o texto sem criptografia — os navegadores
  descartavam a notificação).
- **Fotos no mural**: comprimidas no aparelho antes de enviar (limite de
  300 KB por imagem, para não pesar o plano gratuito do Supabase).
- **Segurança**: login pelo Supabase Auth (nada de senha em texto puro no
  banco) e RLS de verdade — antes, qualquer pessoa com a chave pública do
  site conseguia ler a tabela de usuários e apagar tudo.

## Passo a passo do deploy (nesta ordem)

### 1. Banco (Supabase → SQL Editor)
Rode:
1. `supabase/01_schema.sql` — aditivo, pode rodar mais de uma vez sem medo.
2. **Não rode ainda o `02_seguranca_rls.sql`** — ele só entra no passo 4.

### 2. Variáveis de ambiente (Vercel → Settings → Environment Variables)
```
SUPABASE_URL              = https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_KEY      = a chave "service_role" (Settings → API) — NUNCA a anon
VAPID_PUBLIC_KEY          = (gere no passo 3)
VAPID_PRIVATE_KEY         = (gere no passo 3)
VAPID_SUBJECT             = mailto:seuemail@exemplo.com
CRON_SECRET               = uma senha longa aleatória, só sua
AUTH_EMAIL_DOMAIN         = celulaagape.app   (pode deixar esse valor)
```
Gere o par de chaves VAPID localmente:
```
npx web-push generate-vapid-keys
```
A chave **pública** também precisa estar em `js/config.js`
(`VAPID_PUBLIC_KEY`) — ela não é segredo, mas precisa ser a mesma dos dois
lados.

### 3. Migrar os usuários para o Supabase Auth
Com `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no seu terminal (não precisa ser
na Vercel — pode rodar do seu computador):
```
npm install
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrar-usuarios.mjs --dry-run   # confere antes
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrar-usuarios.mjs             # executa
```
Isso cria uma conta no Supabase Auth para cada usuário existente,
**mantendo a senha atual** quando ela tiver 6+ caracteres (ex.: a conta
`admin`/`agape2024` continua funcionando). Se alguém tinha senha mais curta,
o script gera uma temporária e mostra no final — anote e repasse.

### 4. Deploy do app e trava de segurança
1. Suba o repositório na Vercel (ou rode `vercel --prod`).
2. Teste o login com uma conta migrada.
3. Só então, no SQL Editor: rode `supabase/02_seguranca_rls.sql` (ele se
   recusa a rodar se sobrar alguém sem conta no Auth — é proposital).
4. No painel do Supabase, em **Authentication → Providers → Email**,
   desligue "Allow new users to sign up".

### 5. Agendador das notificações (dentro do Supabase)
Edite os dois valores marcados `<<< EDITE >>>` em
`supabase/03_agendador_pg_cron.sql` (a URL do seu app na Vercel e o mesmo
`CRON_SECRET` do passo 2) e rode o script no SQL Editor. Ele chama
`/api/cron-alarms` a cada minuto — é o que garante a notificação sair na
hora certa, mesmo com ninguém de app aberto.

O workflow `.github/workflows/cron-push.yml` continua existindo como
**reserva** (caso o pg_cron falhe), mas o principal agora é o do Supabase.

### 6. Testar
No app, entre, vá em **Minha conta** e toque em **Ativar notificações** →
**Enviar notificação de teste**. Se não chegar, confira `CRON_SECRET`,
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` e, no Supabase, a saída de:
```sql
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
```

## Estrutura
```
theagape/
├── index.html                    ← markup + estilos
├── js/
│   ├── config.js                 ← chaves públicas (Supabase URL/anon, VAPID pública)
│   ├── utils.js                  ← funções puras (datas, escala, imagem) — testadas
│   └── app.js                    ← toda a lógica do app
├── sw.js                         ← Service Worker (push + clique na notificação)
├── manifest.json / vercel.json
├── api/
│   ├── cron-alarms.js            ← despachante chamado pelo agendador
│   ├── admin-users.js            ← criar/excluir/redefinir senha (só ADM)
│   ├── test-push.js              ← "enviar notificação de teste"
│   └── _lib/                     ← http, supabase, auth, login, push, dispatcher
├── supabase/
│   ├── 01_schema.sql             ← tabelas novas, RPCs, fila de notificações, bucket
│   ├── 02_seguranca_rls.sql      ← RLS real (rodar só depois da migração)
│   └── 03_agendador_pg_cron.sql  ← pg_cron a cada minuto
├── scripts/migrar-usuarios.mjs   ← migra users → Supabase Auth
└── tests/                        ← 71 testes (SQL real via PGlite + API)
```

## Rodando os testes
```
npm install
npm test
```

## Notificações no iPhone
O iOS só entrega push para apps **instalados na tela de início** (Safari →
Compartilhar → "Adicionar à Tela de Início" → abrir o app por esse ícone).
O app mostra um aviso pedindo isso quando detecta iPhone fora do modo
instalado.
