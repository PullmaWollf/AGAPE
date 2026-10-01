import { responder, cookieSessao } from '../api/_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { ok: false, erro: 'método não permitido' });
  res.setHeader('Set-Cookie', cookieSessao('', 0));
  return responder(res, 200, { ok: true });
}

export const config = { api: { bodyParser: false } };
