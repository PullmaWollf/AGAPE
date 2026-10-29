import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirAdmin } from '../api/_lib/auth.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const db = clienteAdmin();
  await exigirAdmin(db, req);
  const [usuarios, subs, notif, uso] = await Promise.all([
    db.from('users').select('id,name,role').order('name'),
    db.from('push_subscriptions').select('user_id'),
    db.from('notificacoes').select('id,kind,tipo,user_id,fire_at,status,tentativas,dispositivos_ok,ultimo_erro').order('fire_at', { ascending: false }).limit(40),
    db.rpc('uso_imagens'),
  ]);
  for (const r of [usuarios,subs,notif]) if (r.error) throw new Error(r.error.message);
  const counts = new Map();
  for (const sub of subs.data || []) counts.set(sub.user_id, (counts.get(sub.user_id) || 0) + 1);
  const nomes = new Map((usuarios.data || []).map(u => [u.id, u.name]));
  return responder(res, 200, {
    ok: true,
    dispositivos: (usuarios.data || []).map(u => ({ user_id: u.id, name: u.name, role: u.role, dispositivos: counts.get(u.id) || 0 })),
    notificacoes: (notif.data || []).map(n => ({ ...n, users: { name: nomes.get(n.user_id) || 'Usuário' } })),
    uso: uso.error ? null : uso.data,
  });
});
