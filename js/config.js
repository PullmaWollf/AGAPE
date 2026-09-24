/* Configuração pública do app (nada aqui é segredo: a chave "anon" só funciona dentro
   das regras de RLS do banco). Se recriar o projeto no Supabase, troque estes valores.
   A chave privada do VAPID e a chave de serviço ficam SÓ nas variáveis de ambiente da Vercel. */
window.AGAPE_CONFIG = {
  SUPA_URL: 'https://wtggqitutdfazzyziqmb.supabase.co',
  SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Z2dxaXR1dGRmYXp6eXppcW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDYxODMsImV4cCI6MjA5MDU4MjE4M30.EMyKuvQxVHCKhVBJVTAebnLamLNorYS3DjIVZo_lgFM',
  VAPID_PUBLIC_KEY: 'BKeHmk9L2sE3UuYXI0H-dwG0rh_1bzSI45HPVtGTpMJcP5X_FDT8AjGVX79tDz8hnffFLgEOcISdCCDQ81FF2lQ',
  // Domínio do e-mail interno usado no Supabase Auth (login "ana" → ana@celulaagape.app).
  // Precisa ser IGUAL à variável AUTH_EMAIL_DOMAIN da Vercel e do script de migração.
  EMAIL_DOMAIN: 'celulaagape.app',
  TZ: 'America/Sao_Paulo',
};
