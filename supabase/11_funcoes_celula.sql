-- Funções padrão da Célula Ágape
-- Execute após 10_notificacoes_conteudo.sql.
begin;

create unique index if not exists escala_funcoes_nome_lower_key
  on public.escala_funcoes (lower(trim(nome)));

insert into public.escala_funcoes (nome)
values
  ('🙏 Oração inicial'),
  ('📃 Versículo de abertura'),
  ('🔨🧊 Quebra-gelo'),
  ('🎤 Louvor'),
  ('🙏 Oração pela Palavra'),
  ('📃 Palavra'),
  ('🧏‍♂️🙏 Pedidos de oração'),
  ('🌍 Real missionário'),
  ('🙏🥞 Oração pelo lanche')
on conflict do nothing;

commit;
