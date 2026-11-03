# Arquitetura e evolução do Ágape

## Estrutura atual (novembro de 2026)

- `index.html`: estrutura semântica das páginas, modais e entradas dos módulos.
- `css/agape-ui-foundation.css`: **camada final de layout**, tokens de espaçamento, responsividade, foco acessível e superfícies. É carregada **depois** dos estilos de domínio para centralizar decisões de layout.
- `css/agape-home-v2.css`: identidade da home, cartões e hero.
- `css/agape-presenca-dark.css`: regras específicas de chamada, frequência e modo escuro.
- `css/agape-extras.css`: elementos de contatos e editor de layout.
- `css/chamada.css`: interfaces de presença e relatórios.
- `js/app.js`: estado e orquestração legado da aplicação.
- `js/agape-extras.js`: personalização da home, contatos e WhatsApp pastoral.
- `js/chamada.js`, `js/frequencia.js`, `js/frequencia-calculos.js`: presença e relatórios.
- `api/index.js`: roteamento de API.
- `api-routes/`: endpoints por responsabilidade; `api/_lib/`: autenticação, acesso e utilitários.
- Supabase: dados e políticas; Vercel: hospedagem e funções serverless; `sw.js`: cache de recursos estáticos, **nunca de sessões ou dados privados**.

## Diretrizes para novas funcionalidades

1. **Separar domínio de apresentação**: regras de negócio e permissões ficam na API ou em módulos JS, nunca só em botões ocultos.
2. **Estilos escaláveis**: adicionar novos componentes ao CSS de seu domínio; usar `agape-ui-foundation.css` somente para padrões transversais. Evitar novos `!important` fora da camada de compatibilidade.
3. **Responsividade**: projetar primeiro para telas de 320–480 px; validar 768, 1024 e 1440 px; não permitir rolagem horizontal no documento; tabelas podem rolar em seus próprios contêineres.
4. **Acessibilidade**: controles com foco visível, alvos confortáveis ao toque, respeito a movimento reduzido, contraste no tema claro e escuro.
5. **Persistência**: dados compartilhados no Supabase; preferências individuais só no dispositivo quando apropriado. Alterações de esquema devem ter migrações versionadas.
6. **Privacidade**: telefone e acompanhamento pastoral acessíveis apenas a perfis autorizados. Links `wa.me` preenchem texto; o usuário confirma o envio.
7. **Publicação**: revisar mudanças, executar testes, conferir produção na Vercel e atualizar o cache PWA quando arquivos estáticos mudarem.

## Próximas etapas recomendadas (sem quebra de compatibilidade)

- Extrair de `js/app.js` os módulos de autenticação, navegação, escala, mural e administração, preservando interfaces globais enquanto migramos.
- Substituir montagem dinâmica de páginas por componentes reutilizáveis e acessíveis, sem introduzir framework de forma precipitada.
- Criar testes automatizados de navegação responsiva e de permissões, além de testes de regressão da home e do tema escuro.
- Revisar CSS legado e remover regras redundantes **depois** de testes visuais comparativos; não apagar estilos em lote.
- Adicionar validação de dados e auditoria de alterações administrativas conforme o produto crescer.

**Regra de manutenção:** não misturar mudanças visuais com migrações de banco ou mudanças de autorização no mesmo ajuste, salvo necessidade demonstrada.
