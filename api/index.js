import adminPerfis from '../api-routes/admin-perfis.js';
import adminUsers from '../api-routes/admin-users.js';
import authLogin from '../api-routes/auth-login.js';
import authLogout from '../api-routes/auth-logout.js';
import authSession from '../api-routes/auth-session.js';
import cronAlarms from '../api-routes/cron-alarms.js';
import cronLimpezaMural from '../api-routes/cron-limpeza-mural.js';
import escalaFuncoes from '../api-routes/escala-funcoes.js';
import escalaSave from '../api-routes/escala-save.js';
import escala from '../api-routes/escala.js';
import mural from '../api-routes/mural.js';
import profileAvatar from '../api-routes/profile-avatar.js';
import pushDevice from '../api-routes/push-device.js';
import testPush from '../api-routes/test-push.js';

const rotas = {
  'admin-perfis': adminPerfis,
  'admin-users': adminUsers,
  'auth-login': authLogin,
  'auth-logout': authLogout,
  'auth-session': authSession,
  'cron-alarms': cronAlarms,
  'cron-limpeza-mural': cronLimpezaMural,
  'escala-funcoes': escalaFuncoes,
  'escala-save': escalaSave,
  escala,
  mural,
  'profile-avatar': profileAvatar,
  'push-device': pushDevice,
  'test-push': testPush,
};

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const partes = url.pathname.split('/').filter(Boolean);
  const nome = url.searchParams.get('route') || (partes[0] === 'api' ? partes[1] : partes[0]);
  const rota = rotas[nome];
  if (!rota) return res.status(404).json({ ok: false, erro: 'rota não encontrada' });
  return rota(req, res);
}

export const config = { api: { bodyParser: true } };
export const runtime = 'nodejs';
export const maxDuration = 60;
export const preferredRegion = 'iad1';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
