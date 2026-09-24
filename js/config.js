/* Configuração pública do app (nada aqui é segredo: a chave "anon" só funciona dentro
   das regras de RLS do banco). Se recriar o projeto no Supabase, troque estes valores.
   A chave privada do VAPID e a chave de serviço ficam SÓ nas variáveis de ambiente da Vercel. */
window.AGAPE_CONFIG = {
  SUPA_URL: 'https://qjllwusplawqziziokcu.supabase.co',
  SUPA_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqbGx3dXNwbGF3cXppemlva2N1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMTM4MTMsImV4cCI6MjEwNTc4OTgxM30.uhi1kY82MCA3LnsKjXMcMMxDYrIrS2UWWcWks2UYlvI',
  VAPID_PUBLIC_KEY: 'BM8z5iHQ48R6PmbY9TCxWBhw-a3dUqov5cg37DVlFSjuP3jSMisAS_XfkBxJoufFt5QTtMJM-syloUNqH9Y30DY',
  // Domínio do e-mail interno usado no Supabase Auth (login "ana" → ana@celulaagape.app).
  // Precisa ser IGUAL à variável AUTH_EMAIL_DOMAIN da Vercel e do script de migração.
  EMAIL_DOMAIN: 'celulaagape.app',
  TZ: 'America/Sao_Paulo',
};
