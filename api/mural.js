import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { exigirPermissao, usuarioAutenticado } from './_lib/auth.js';

export default envolver(async (req, res) => {
  const db = clienteAdmin();
  if (req.method === 'GET') {
    const result = await db.from('posts').select('*').order('created_at', { ascending: false }).limit(100);
    if (result.error) throw new Error(result.error.message);
    return responder(res, 200, { ok: true, posts: result.data || [] });
  }
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const body = req.body || {};
  if (body.acao === 'excluir') {
    const auth = await exigirPermissao(db, req, 'mural_excluir');
    if (!body.id) throw new HttpError(400, 'Publicação inválida.');
    const post = await db.from('posts').select('id,author_id,image_path').eq('id', body.id).maybeSingle();
    if (post.error) throw new Error(post.error.message);
    if (!post.data) throw new HttpError(404, 'Publicação não encontrada.');
    if (auth.perfil.role !== 'adm' && auth.perfil.id !== post.data.author_id) throw new HttpError(403, 'você não tem permissão para isso');
    const result = await db.from('posts').delete().eq('id', body.id);
    if (result.error) throw new Error(result.error.message);
    return responder(res, 200, { ok: true });
  }
  const auth = await usuarioAutenticado(db, req);
  const type = ['versiculo', 'mensagem', 'aviso'].includes(body.type) ? body.type : 'mensagem';
  await exigirPermissao(db, req, 'mural_publicar');
  const content = String(body.content || '').trim();
  const imagePath = body.image_path ? String(body.image_path).slice(0, 500) : null;
  const mediaType = body.media_type === 'video' ? 'video' : (imagePath ? 'image' : null);
  const imageBytes = Number.isFinite(Number(body.image_bytes)) ? Number(body.image_bytes) : null;
  const imageWidth = Number.isFinite(Number(body.image_w)) ? Number(body.image_w) : null;
  const imageHeight = Number.isFinite(Number(body.image_h)) ? Number(body.image_h) : null;
  const mediaDuration = Number.isFinite(Number(body.media_duration)) ? Number(body.media_duration) : null;
  if (!content && !imagePath) throw new HttpError(400, 'A publicação precisa ter texto ou mídia.');
  if (content.length > 2000) throw new HttpError(400, 'A publicação precisa ter entre 1 e 2.000 caracteres.');
  const fullPost = { type, content, author_id: auth.perfil.id, author_name: auth.perfil.name, image_path: imagePath, image_w: imageWidth, image_h: imageHeight, image_bytes: imageBytes, media_type: mediaType, media_duration: mediaDuration };
  let result = await db.from('posts').insert(fullPost).select().single();
  // Permite publicar enquanto a migração opcional de metadados de vídeo ainda não foi aplicada.
  if (result.error && /media_duration|media_type|schema cache|column.*posts/i.test(result.error.message || '')) {
    const legacyPost = { ...fullPost };
    delete legacyPost.media_type;
    delete legacyPost.media_duration;
    result = await db.from('posts').insert(legacyPost).select().single();
  }
  if (result.error) throw new Error(result.error.message);
  return responder(res, 201, { ok: true, post: result.data });
});

export const config = { api: { bodyParser: true } };
