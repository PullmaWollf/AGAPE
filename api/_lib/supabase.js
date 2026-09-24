// Cliente Supabase com a chave de SERVIÇO (ignora RLS). Só existe no servidor.
import { createClient } from '@supabase/supabase-js';

export function clienteAdmin(env = process.env) {
  const url = env.SUPABASE_URL;
  const chave = env.SUPABASE_SERVICE_KEY;
  if (!url || !chave) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_KEY nas variáveis de ambiente da Vercel.');
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
