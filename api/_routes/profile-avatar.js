import { clienteAdmin } from '../_lib/supabase.js';
import { exigirAdmin, usuarioAutenticado } from '../_lib/auth.js';
import { responder, HttpError } from '../_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    const db = clienteAdmin();
    const { perfil } = await usuarioAutenticado(db, req);
    const data = String(req.body?.data || '');
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(data) || data.length > 700000) throw new HttpError(400, 'foto inválida ou muito grande');
    const match = data.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const path = `${perfil.id}/avatar.${ext}`;
    const upload = await db.storage.from('profile-avatars').upload(path, Buffer.from(match[2], 'base64'), { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true, cacheControl: '31536000' });
    if (upload.error) throw new Error(upload.error.message);
    const publicUrl = db.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
    const saved = await db.from('users').update({ avatar_url: `${publicUrl}?v=${Date.now()}` }).eq('id', perfil.id).select('avatar_url').single();
    if (saved.error) throw new Error(saved.error.message);
    return responder(res, 200, { ok: true, avatar_url: saved.data.avatar_url });
  } catch (error) { return responder(res, error.status || 500, { ok: false, erro: error.message || 'não foi possível salvar a foto' }); }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
