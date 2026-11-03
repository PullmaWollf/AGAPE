# Dossiê técnico do APP CÉLULA ÁGAPE
**Inventário e auditoria de arquitetura para evolução futura | 03/11/2026**

**Escopo:** repositório GitHub `PullmaWollf/AGAPE` (branch `main`), projeto Vercel `agape`, projeto Supabase `AGAPE APP`. Levantamento com leitura do código, configuração de deploy, metadados e consultas **somente leitura** ao banco em produção. Não constitui pentest, backup restaurável ou homologação funcional de todos os fluxos. Não houve implementação de White Label.

## 1. Sumário executivo
Ágape é um PWA responsivo para organização de uma célula religiosa. Reúne autenticação própria, membros e perfis, mural multimídia, Palavra da Célula em PDF, escalas de lanche e funções, presença em célula/culto, relatórios, acompanhamento pastoral com link WhatsApp, agenda de contatos, personalização da home, notificações push e instalação PWA. A aplicação está em produção em **https://celula-agape.vercel.app/**.

A arquitetura atual é um **monólito modular leve**, com frontend em HTML/CSS/JavaScript puro, funções Node.js na Vercel e Supabase PostgreSQL/Storage. Não há React/Next.js nem build frontend obrigatório. O modelo de autenticação é **próprio do Ágape**, com tokens HMAC de sessão; a existência de `auth_id` e código legado de Supabase Auth não significa que a sessão atual use JWT do Supabase. Essa distinção é essencial para evoluir com segurança.

**Avaliação:** produto funcional em evolução, mas **não está pronto para ser comercializado como plataforma multi-inquilino**. Há riscos críticos nas políticas RLS e acoplamentos de código/infraestrutura. Corrigir esses itens antes de qualquer lançamento White Label.

## 2. Identificação e infraestrutura
| Item | Situação observada |
|---|---|
| GitHub | `PullmaWollf/AGAPE`, branch principal `main` |
| Frontend | HTML5, CSS, JavaScript; PWA mobile-first |
| Backend | Node.js 24.x; Vercel Functions; ES modules |
| Vercel | Projeto `agape`, ID `prj_7erZH2sYh3mNDS1PzsrAgztpWAZo` |
| Domínio | `celula-agape.vercel.app` |
| Supabase | `AGAPE APP`, ID `pubrskqrsskiamzflpmj` |
| Região DB | `us-east-1` |
| Banco | PostgreSQL 17 (versão observada 17.6.1.166) |
| Supabase Edge Functions | Nenhuma listada; backend está na Vercel |
| Repositório de migrações | `supabase/*.sql`; histórico aplicado também no Supabase |
| Armazenamento | 3 buckets públicos, detalhados abaixo |
| Notificações | Web Push + VAPID + assinaturas e fila PostgreSQL |
| Dependências | `@supabase/supabase-js`, `@vercel/analytics`, `web-push` |
| Desenvolvimento/testes | Node test runner, jsdom e PGlite em devDependencies |

## 3. Diagrama lógico
```text
Navegador / PWA instalado
  ├── index.html + css/* + js/*
  ├── service worker (somente shell estático)
  ├── Supabase client (configuração pública; sujeito a RLS)
  └── HTTPS /api/*
         └── Vercel api/index.js (dispatcher)
               ├── api-routes/auth-*.js
               ├── api-routes/admin-*.js
               ├── api-routes/mural.js, palavra-celula.js
               ├── api-routes/escala*.js
               ├── api-routes/chamada.js, frequencia.js
               ├── api-routes/agape-extras.js
               └── cron, notificações, push, avatar
                       └── Supabase service role (somente servidor)
                             ├── PostgreSQL public.*
                             ├── Storage
                             └── funções SQL / triggers / cron
```
A chave pública/anon no frontend é intencionalmente visível. **A service role nunca deve ser exposta.** A segurança não pode depender apenas de ocultar botões ou de chamar APIs pelo frontend: as regras do Supabase precisam proteger a Data API.

## 4. Inventário do repositório
### Arquivos raiz
- `index.html`: páginas, navegação, formulários, modais e carregamento de scripts/estilos.
- `manifest.json`: nome, ícones e instalação PWA.
- `sw.js`: cache versionado do shell, estratégia de rede para navegação, sem cache de API.
- `offline.html`: fallback offline.
- `vercel.json`: headers, rewrite para `api/index`, fallback SPA, cron mensal.
- `package.json` / `package-lock.json`: dependências e testes.
- `README.md`: instruções operacionais gerais; revisar divergências com o código atual.

### Frontend
| Arquivo | Responsabilidade |
|---|---|
| `js/app.js` | Estado global `S`, navegação, inicialização, mural, escalas e administração legada |
| `js/agape-extras.js` | Editor da home, **10 paletas**, agenda e WhatsApp |
| `js/theme.js` | Modo claro/escuro por usuário, persistido localmente; evento de atualização de paleta |
| `js/chamada.js` | Interface de registro de presença |
| `js/frequencia.js` | Relatórios, gráficos e acompanhamento |
| `js/frequencia-calculos.js` | Cálculos auxiliares dos relatórios |
| `js/admin-chamadas.js` | Gestão de chamadas por administrador |
| `js/perfis.js` | UI de perfis e permissões |
| `js/utils.js` | Utilitários, formatação, normalização |
| `js/config.js` | URL e chave pública Supabase, VAPID pública, timezone |
| `js/ui-icons.js` | Utilitário legado de ícones; não incluído na página atual para evitar mutações dinâmicas |

| CSS | Responsabilidade |
|---|---|
| `css/agape-modern.css` | Base visual e ajustes legados |
| `css/agape-love.css` | Tokens rosa/vinho e regras de tema |
| `css/agape-editorial.css` | Tipografia e estilo editorial |
| `css/agape-home-v2.css` | Hero e cartões da home |
| `css/agape-presenca-dark.css` | Contraste de presença e frequência no escuro |
| `css/chamada.css` | Chamada e relatórios |
| `css/agape-extras.css` | Editor e contatos |
| `css/agape-ui-foundation.css` | Layout responsivo e padrões compartilhados |
| `css/agape-palettes.css` | Dez paletas com tokens CSS |
| `css/agape-love-safe.css` | Arquivo de compatibilidade existente; confirmar se é utilizado antes de removê-lo |

### Backend
**Dispatcher:** `api/index.js`, com `api/_lib/http.js`, `auth.js`, `password.js`, `login.js`, `supabase.js`, `push.js`, `chamada-acesso.js`, `dispatcher.js`.

**Endpoints mapeados** (base `/api/`; consultar arquivo para verbos e campos):
| Endpoint | Finalidade |
|---|---|
| `auth-login`, `auth-session`, `auth-logout` | Login, renovação/validação, saída |
| `admin-users` | Gestão de usuários, senhas, perfis e participação |
| `admin-perfis` | CRUD e vínculo de perfis/permissões |
| `admin-config` | Configurações operacionais |
| `mural` | Leitura, criação e exclusão de publicações |
| `palavra-celula` | PDF, publicação e remoção |
| `escala`, `escala-save`, `escala-funcoes` | Escalas e funções |
| `chamada`, `admin-chamadas` | Registro/edição e administração de presenças |
| `frequencia` | Relatórios de participação |
| `agape-extras` | Personalização, paletas, telefones, contatos |
| `profile-avatar` | Avatar de usuário |
| `push-device`, `test-push`, `notificacoes-admin` | Assinaturas, teste e gestão de push |
| `cron-alarms`, `cron-limpeza-mural` | Agendamentos e limpeza |

### Scripts e testes
- `scripts/criar-admin.mjs`: bootstrap administrativo.
- `scripts/migrar-usuarios.mjs`: migração de usuários.
- `tests/*.test.js`: testes de API, autenticação/usuários, banco, presença, editor, UI, PDF e utilitários.
- `docs/ARQUITETURA-EVOLUCAO.md`: diretrizes arquiteturais anteriores.

## 5. Funcionalidades e regras de negócio
**Autenticação:** credenciais de login do app; tokens de sessão assinados com HMAC-SHA256, prazo máximo definido no código de 365 dias, com `session_version` para invalidação. Verificar armazenamento e renovação no cliente em cada alteração futura. `AUTH_SESSION_SECRET` dedicado é preferível ao fallback em `SUPABASE_SERVICE_KEY`.

**Papéis:** campo `users.role` e perfis adicionais em `perfis_permissao.permissoes` (JSONB). Há permissões específicas como `chamada_registrar` e `frequencia_relatorio`. O backend deve continuar verificando as permissões por operação.

**Mural:** texto, imagens e vídeos; publicações com autor, data e metadados de mídia. Triggers geram notificações; existe rotina de limpeza mensal.

**Palavra da Célula:** registro de PDF atual, metadados e arquivo no Storage; atualização administrativa.

**Escalas:** semanas, modelos, atribuições e funções; alarmes com antecedências configuráveis.

**Chamada:** eventos do tipo `celula` e `culto`, presença por usuário e data, edição/cancelamento por perfil autorizado; unicidade por data/tipo.

**Relatórios:** consolidação de presenças por período e tipo; identifica necessidades de acompanhamento pastoral. Mensagens são abertas em `https://wa.me/` com texto pré-preenchido; não são disparadas automaticamente.

**Contatos:** `users.telefone`, cadastro em Minha Conta, listagem para liderança autorizada, edição administrativa; formato brasileiro com DDD.

**Personalização da home:** registro `config.chave='home_layout_v1'`, JSON contendo textos, ordem/visibilidade de blocos e `paletaLight` / `paletaDark`. Só ADM salva; leitura pública do layout é intencional. Não é editor de HTML arbitrário.

**Paletas:** cinco claras (Rosé clássico, Azul oceano, Verde esmeralda, Índigo moderno, Âmbar elegante) e cinco escuras (Vinho Ágape, Azul meia-noite, Floresta, Grafite, Violeta). Cada modo tem uma seleção independente, compartilhada pelo banco. O botão de tema mantém a preferência de modo de cada usuário.

## 6. Dicionário de dados — esquema `public` observado
**18 objetos relacionais, incluindo uma view**, listados abaixo. Tipos essenciais e relações:
| Objeto | Colunas principais / finalidade |
|---|---|
| `users` | `id uuid PK`, `name`, `login`, `role`, `auth_id`, `pass_hash`, `perfil_id FK`, `avatar_url`, `session_version`, `ativo`, `data_ingresso_celula`, `telefone` |
| `perfis_permissao` | `id PK`, `nome`, `descricao`, `permissoes jsonb`, datas |
| `config` | `chave text PK`, `valor text`, `atualizado_em` |
| `segredos` | `chave PK`, `valor`; conteúdo sensível não foi consultado |
| `posts` | `id PK`, `type`, `content`, `author_id FK`, `author_name`, `created_at`, `image_path`, `image_w/h/bytes`, `media_type`, `media_duration` |
| `palavra_celula` | `id boolean PK`, `titulo`, `arquivo_path`, `nome_arquivo`, `paginas`, `atualizado_em`, `atualizado_por` |
| `escala_semanas` | `id PK`, `date`, `tipo`, `modelo_id FK`, `alarm_ts`, flags de alarmes |
| `escala_membros` | `id PK`, `escala_id FK`, `user_id FK`, `user_name` |
| `escala_funcoes` | `id PK`, `nome`, `created_at` |
| `escala_atribuicoes` | `id PK`, `escala_id FK`, `user_id FK`, `funcao_id FK`, `user_name`, `funcao_nome` |
| `escala_modelos` | `id PK`, `nome`, `semanas`, `hora_alarme`, flags de alarmes |
| `escala_modelo_itens` | `id PK`, `modelo_id FK`, `semana`, `user_id FK`, `funcao_id FK`, nomes |
| `chamadas` | `id PK`, `data_celula`, `tipo`, `registrado_por FK`, timestamps |
| `chamada_presencas` | `id PK`, `chamada_id FK`, `user_id FK`, `status`, `registrado_por FK`, `atualizado_em` |
| `push_subscriptions` | `id PK`, `user_id FK`, `endpoint`, `subscription_json`, `user_agent`, `created_at` |
| `push_alarms` | `id PK`, `alarm_key`, `fire_at`, `title`, `body`, `url`, `target_user_ids uuid[]`, `sent` |
| `notificacoes` | `id PK`, `chave`, `tipo`, `kind`, `semana_id FK`, `post_id FK`, `user_id FK`, `titulo`, `corpo`, `url`, `fire_at`, `expira_em`, `status`, `tentativas`, `proxima_tentativa`, `enviada_em`, `ultimo_erro` e métricas |
| `notificacoes_desejadas` | **View** de notificações pretendidas, com `chave`, `semana_id`, `user_id`, `kind`, `fire_at`, `expira_em`, `titulo`, `corpo`, `url` |

**Relações:** `users` centraliza membros e relaciona-se a `perfis_permissao`, `posts`, `push_subscriptions`, `chamada_presencas` e escalas. `chamadas` 1:N `chamada_presencas`. `escala_semanas` 1:N `escala_atribuicoes`; modelos 1:N itens. `notificacoes` referencia usuários e, quando aplicável, posts ou semanas.

**Observação:** inventário gerado a partir de `information_schema` e metadados ao vivo. Para definição completa de constraints/defaults/triggers, usar `pg_dump --schema-only` em ambiente controlado, sem exportar dados de usuários.

## 7. Storage
| Bucket | Público | Limite por arquivo | Tipos |
|---|---|---|---|
| `mural` | Sim | 100 MiB | WebP, JPEG, PNG, MP4, WebM, QuickTime |
| `palavra-celula` | Sim | 15 MiB | PDF |
| `profile-avatars` | Sim | 512 KiB | JPEG, PNG, WebP |

**Atenção:** bucket público permite leitura pública dos arquivos conforme URL e políticas. Avaliar se a futura operação multi-cliente exigirá segregação por organização, URLs assinadas, retenção e exclusão de mídia.

## 8. Migrações e rotinas do banco
### Migrações aplicadas no histórico Supabase
- `20261020170359` recuperação de esquema.
- `20261020171358` sessões e papéis nativos.
- `20261029165816` PDF sem limite de páginas.
- `20261029183446` chamada e frequência.
- `20261029191831` unicidade/edição de chamada.
- `20261030114845` tipo culto/célula.
- `20261103131042` telefone de usuários/contatos.

### Scripts SQL versionados no Git
`01_schema.sql`, `02_seguranca_rls.sql`, `03_agendador_pg_cron.sql`, `04_midia_mural.sql`, `05_mural_palavra_limpeza.sql`, `06_login_proprio.sql`, `07_perfis_permissoes.sql`, `08_login_proprio_operacao.sql`, `09_correcao_final_permissoes.sql`, `10_notificacoes_conteudo.sql`, `11_funcoes_celula.sql`, `12_escalas_lanche_funcoes.sql`, `13_avatar_pwa_funcoes.sql`, `14_chamada_frequencia.sql`, `15_chamada_unica_e_edicao.sql`, `15_tipo_reuniao_culto_celula.sql`.

**Divergência importante:** scripts SQL do Git não são equivalentes, um a um, ao histórico de migrações aplicado no Supabase. Antes de replicar o produto, consolidar baseline versionada, gerar diff e testar em banco isolado.

### Funções SQL e triggers
Funções observadas incluem `is_admin`, `is_membro`, `me`, `cfg`, `uso_imagens`, `salvar_semana`, `salvar_modelo`, `aplicar_modelo`, `salvar_chamada`, `atualizar_chamada`, `persistir_chamada`, `gerar_notificacoes`, `claim_notificacoes`, `finalizar_notificacao`, `registrar_dispositivo`, `remover_dispositivo`, `dispositivos_por_usuario`, `limpar_mural_mes_anterior` e funções de trigger. Triggers observados: `palavra_notificacao`, `posts_antes`, `posts_notificacao` e `validar_post_mural`.

**Agendamento Vercel:** `GET /api/cron-limpeza-mural`, expressão `0 3 1 * *` (dia 1, 03:00, timezone do agendador). O projeto também possui SQL de `pg_cron`; verificar tarefas efetivamente habilitadas para evitar execuções duplicadas. O código `cron-alarms` existe, mas não há entrada correspondente no `vercel.json` atual.

## 9. Segurança — achados e severidade
**CRÍTICO — RLS permissiva na Data API.** Consulta de políticas em produção mostrou `USING (true)` / `WITH CHECK (true)` para `anon, authenticated` com acesso amplo em `config`, `escala_semanas`, `escala_membros`, `escala_funcoes`, `escala_atribuicoes`, `escala_modelos`, `escala_modelo_itens`, `posts`, `palavra_celula`, `push_subscriptions`, `push_alarms`. Isso pode permitir acesso ou mutação direta fora das verificações de papel implementadas na Vercel, **se os privilégios SQL de acesso às tabelas estiverem concedidos**. Verificar imediatamente GRANTs efetivos e Data API. A presença da chave `anon` no frontend torna especialmente importante não confiar nas proteções do backend como única barreira.

**ALTO — SECURITY DEFINER exposto.** O advisor de segurança Supabase identificou cinco funções `SECURITY DEFINER` executáveis por `anon` (`cfg`, `is_admin`, `is_membro`, `me`, `uso_imagens`) e onze achados para `authenticated`. Revisar `EXECUTE`, `search_path`, verificação de identidade e necessidade de `SECURITY DEFINER`. Não revogar às cegas: testar dependências.

**ALTO — Views e dados pessoais.** A view `notificacoes_desejadas` deve ter `security_invoker` ou privilégios adequados; verificar acesso real. Telefones, presença e acompanhamento pastoral exigem finalidade, minimização, retenção e controle de acesso LGPD.

**MÉDIO — RLS habilitada sem policy.** Advisor apontou `chamadas`, `chamada_presencas`, `perfis_permissao` e `segredos` sem políticas. Pode ser intencional se acessadas exclusivamente por service role; documentar e confirmar.

**MÉDIO — Sessões e segredos.** Sessão HMAC de até 365 dias; recomendar `AUTH_SESSION_SECRET` independente, rotação planejada, invalidação por dispositivo, limitação de tentativas, rate limit e logs de auditoria. Não imprimir tokens ou segredos.

**MÉDIO — Frontend e dependências.** O frontend carrega `@supabase/supabase-js@2` via CDN com versão maior não fixada no HTML. Fixar versão e avaliar CSP/SRI. A complexidade do CSS com várias camadas e `!important` aumenta risco de regressões; preservar correção do overlay fechado, que não deve escurecer a tela.

**Nenhuma correção de segurança foi executada nesta documentação.** Tratar achados como auditoria preliminar baseada em configuração observada, não como exploração comprovada.

## 10. Ambientes, deploy, configuração e operações
### Variáveis esperadas na Vercel (somente nomes)
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AUTH_SESSION_SECRET` (recomendado), `AUTH_EMAIL_DOMAIN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. O README também cita `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`, que deve ser revisada quanto à necessidade atual. Nenhum valor secreto foi exportado.

### Fluxo operacional
1. Clonar o repositório e usar Node 24.
2. `npm ci` e `npm test`.
3. Configurar Vercel e Supabase sem colocar segredos no Git.
4. Aplicar migrações em ambiente de teste; nunca repetir scripts históricos em produção sem diff.
5. Publicar a partir da `main` e verificar build READY.
6. Conferir se o alias `celula-agape.vercel.app` aponta ao **último deployment**; houve histórico de alias preso em versão anterior.
7. Validar PWA, cache `sw.js`, sessão, modo escuro, paletas, contato, chamada e notificações.
8. Manter backup e procedimento de rollback antes de alterações estruturais.

### Testes observados em 03/11/2026
`npm test`: **102 testes, 90 aprovados, 12 falharam** no snapshot analisado; falhas em admin-users, admin-chamadas, fluxo de chamada, test-push, endpoint HTTP e teste legado de UI editorial. Não é correto afirmar que a suíte está verde. Alguns testes parecem pressupor interfaces/contratos antigos, mas cada falha precisa de triagem. Acrescentar testes E2E com usuário de teste, permissões e múltiplas larguras de tela.

## 11. Preparação para White Label — somente planejamento
**Não implementado.** A futura plataforma deve separar claramente **identidade visual** de **isolamento de dados**.

### Requisitos de produto
- Organização/tenant, domínio próprio, nome, logotipo, ícones PWA, fontes, cores, e-mails e configurações por cliente.
- Superadmin da plataforma versus administrador do tenant; líderes e membros vinculados ao tenant.
- Convites, criação e desativação de contas, limites por plano, cobrança (se aplicável), suporte e trilha de auditoria.
- Termos, política de privacidade, exportação de dados e exclusão por tenant.

### Requisitos de arquitetura
- Adicionar `tenant_id` com FK e índices em entidades de negócio, ou optar por banco/projeto por cliente após estudo de custos e isolamento.
- RLS por tenant e identidade autenticada confiável; **não** confiar em `tenant_id` enviado pelo navegador.
- APIs com contexto de tenant validado no servidor; testes de isolamento cruzado (IDOR/BOLA).
- Buckets e paths segregados; políticas de upload e download.
- Serviço de identidade com sessões revogáveis, auditoria, MFA para administradores e política de senha.
- Configuração e temas versionados por tenant; design tokens e recursos de branding separados do domínio de negócio.
- Observabilidade, métricas por tenant, backups, restore testado, migrações reversíveis, ambiente staging e CI com gates.
- Definir política de subdomínios, DNS/TLS, e-mail transacional e cobrança antes da comercialização.

### Roadmap sugerido
**Fase 0 — segurança:** corrigir RLS, RPCs expostas e revisar autenticação. **Fase 1 — confiabilidade:** estabilizar testes, CI, backup, migrações. **Fase 2 — modularidade:** separar `js/app.js` em módulos, contratos de API, design system. **Fase 3 — tenancy:** isolamento e migração de dados. **Fase 4 — branding:** domínios, logos, ícones, e-mails e paletas por tenant. **Fase 5 — produto:** planos, faturamento, suporte, LGPD e observabilidade. Não começar pela troca de logotipo.

## 12. Matriz de prioridades
| Prioridade | Ação | Por quê |
|---|---|---|
| P0 | Auditar GRANTs/RLS e bloquear acesso indevido à Data API | Potencial acesso/modificação de dados fora da API |
| P0 | Auditar RPCs SECURITY DEFINER executáveis por anon | Potencial bypass de autorização |
| P1 | Corrigir 12 testes falhos e instituir pipeline de qualidade | Evitar regressões |
| P1 | Versionar baseline real do banco e testar restauração | Reprodutibilidade |
| P1 | Definir política LGPD para telefones e frequência | Dados pessoais |
| P2 | Separar módulos de UI/negócio e consolidar CSS | Manutenibilidade |
| P2 | Telemetria, logs estruturados e monitoramento | Operação escalável |
| P3 | Projetar e testar isolamento por tenant | Pré-requisito do White Label |
| P3 | Branding por organização | Somente após isolamento e segurança |

## 13. Limitações e método
Fontes: código da branch `main`, `package.json`, `vercel.json`, `README.md`, scripts `supabase/*.sql`; inspeção do projeto Vercel; metadados do projeto Supabase; `information_schema`, `pg_policies`, `pg_proc`, `pg_indexes`, `information_schema.triggers`, `storage.buckets`, lista de migrações, lista de Edge Functions e advisors de segurança. Não foram extraídos valores de `segredos`, senhas, telefones ou dados individuais. Não foi feito pentest, inspeção de logs privados, restauração de backup nem teste de isolamento real entre organizações (ainda inexistentes).

**Conclusão:** a base do Ágape tem funcionalidades concretas e é boa candidata a uma evolução planejada. A prioridade técnica para um futuro White Label é **segurança + migrações + modularidade + tenancy**, e não apenas a camada visual.
