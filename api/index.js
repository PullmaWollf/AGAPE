import adminPerfis from './_routes/admin-perfis.js';
import adminUsers from './_routes/admin-users.js';
import authLogin from './_routes/auth-login.js';
import authLogout from './_routes/auth-logout.js';
import authSession from './_routes/auth-session.js';
import cronAlarms from './_routes/cron-alarms.js';
import cronLimpezaMural from './_routes/cron-limpeza-mural.js';
import escalaFuncoes from './_routes/escala-funcoes.js';
import escalaSave from './_routes/escala-save.js';
import escala from './_routes/escala.js';
import mural from './_routes/mural.js';
import profileAvatar from './_routes/profile-avatar.js';
import pushDevice from './_routes/push-device.js';
import testPush from './_routes/test-push.js';

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
  const partes = String(req.url || '').split('?')[0].split('/').filter(Boolean);
  const nome = partes[0] === 'api' ? partes[1] : partes[0];
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
