# Célula Ágape

PWA para organizar a rotina da célula: Mural, Palavra da Célula, escala de lanche, perfis de acesso e notificações push.

## Funcionalidades

- Login e sessão com Supabase.
- Mural com versículos, mensagens, avisos, imagens e vídeos.
- Palavra da Célula publicada e atualizada pela administração.
- Escala de lanche por semanas, membros, modelos e alarmes configuráveis.
- Perfis de permissão, incluindo Líder e acesso administrativo.
- Notificações Web Push por aparelho.
- Notificações automáticas para:
  - nova publicação ou atualização da Palavra da Célula;
  - novo post no Mural;
  - alarmes configurados da escala de lanche.
- Instalação como PWA em Android, iPhone e desktop compatível.

## Stack

- HTML, CSS e JavaScript no frontend.
- Vercel Functions no backend.
- Supabase Database, Storage e autenticação operacional.
- `web-push` para notificações criptografadas.
- Node.js 20 ou superior.

## Desenvolvimento

```bash
npm install
npm test
```

O projeto é uma aplicação estática com funções serverless. Para desenvolvimento local, sirva a raiz do projeto com um servidor HTTP e configure as variáveis de ambiente necessárias.

## Variáveis da Vercel

Configure estas variáveis no projeto Vercel:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
CRON_SECRET
AUTH_EMAIL_DOMAIN
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
```

`SUPABASE_SERVICE_KEY`, `VAPID_PRIVATE_KEY` e `CRON_SECRET` são segredos e nunca devem ser enviados ao frontend ou commitados no Git.

A chave pública VAPID também deve estar em `js/config.js`, com o mesmo valor de `VAPID_PUBLIC_KEY`.

## Banco de dados

Execute os scripts no Supabase SQL Editor nesta ordem:

1. `supabase/01_schema.sql`
2. `supabase/02_seguranca_rls.sql`, depois que os usuários estiverem migrados
3. `supabase/03_agendador_pg_cron.sql`, preenchendo a URL pública do app e o `CRON_SECRET`
4. `supabase/04_midia_mural.sql`
5. `supabase/05_mural_palavra_limpeza.sql`
6. `supabase/06_login_proprio.sql`
7. `supabase/07_perfis_permissoes.sql`
8. `supabase/08_login_proprio_operacao.sql`
9. `supabase/09_correcao_final_permissoes.sql`
10. `supabase/10_notificacoes_conteudo.sql
11_funcoes_celula.sql`

Os scripts são incrementais. Execute cada um uma vez no banco correto e confira os resultados antes de avançar.

O agendador dos alarmes é o `pg_cron` do Supabase. A Vercel não deve receber um cron de execução por minuto em planos Hobby, pois esse intervalo causa falha de deploy.

## Notificações

Cada aparelho precisa:

1. abrir o app em HTTPS;
2. fazer login;
3. instalar o PWA quando estiver no iPhone;
4. tocar em **Ativar notificações**;
5. permitir notificações no navegador.

Para conferir dispositivos registrados:

```sql
select id, user_id, endpoint, created_at
from public.push_subscriptions
order by created_at desc;
```

Para conferir a fila:

```sql
select id, tipo, titulo, status, tentativas, created_at
from public.notificacoes
order by created_at desc
limit 20;
```

Para conferir as execuções do agendador:

```sql
select status, return_message, start_time
from cron.job_run_details
order by start_time desc
limit 10;
```

## Mídia do Mural

Imagens são comprimidas no navegador antes do envio. O backend grava o post e os metadados de mídia; vídeos são mantidos no Storage conforme a configuração do banco.

Se um post aparecer sem mídia, verifique:

- `supabase/04_midia_mural.sql` foi executado;
- o bucket de mídia existe e está acessível conforme as políticas;
- `image_path` está preenchido na tabela `posts`;
- a URL pública ou assinada do Storage está válida.

## Usuários e permissões

O fluxo recomendado é:

1. criar ou migrar os usuários;
2. criar o perfil em **ADM → Perfis e permissões**;
3. marcar as permissões;
4. salvar o perfil;
5. vincular o perfil ao usuário;
6. fazer logout e login novamente para renovar a sessão.

O perfil não aparece no usuário até que o vínculo seja salvo. Alterações de permissão não atualizam uma sessão já aberta.

## Instalação do PWA

O app exibe um pop-up de instalação quando o navegador oferece o prompt nativo. Se o navegador não oferecer esse prompt, o mesmo pop-up mostra as instruções manuais.

- Android/Chrome: menu do navegador → **Adicionar à tela inicial**.
- iPhone/Safari: **Compartilhar** → **Adicionar à Tela de Início**.

No iPhone, notificações push funcionam pelo app instalado na tela inicial, não pela aba comum do Safari.

## Estrutura

```text
api/                 Funções serverless e bibliotecas backend
icons/               Ícones do PWA
js/                  Código do frontend
scripts/             Scripts operacionais de migração
supabase/            Migrações SQL incrementais
tests/               Testes automatizados
index.html           Aplicação e estilos
manifest.json        Metadados do PWA
sw.js                Service Worker
vercel.json          Configuração de deploy
```

## Verificação antes do merge

```bash
node --check api/mural.js
node --check api/cron-alarms.js
node --check api/push-device.js
node --check js/app.js
node --check js/perfis.js
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8'))"
git diff --check
npm test
```

Antes de testar em produção, confirme que o deploy foi concluído, execute as migrações pendentes no Supabase e teste com pelo menos dois aparelhos inscritos para notificações.
