// Utilidades HTTP compartilhadas pelas funções serverless.
import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export function responder(res, status, corpo) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(corpo);
}

// Compara segredos em tempo constante (evita vazar o valor por diferença de tempo).
export function segredoValido(req, esperado) {
  if (!esperado) return false;
  const cab = String(req.headers?.authorization || '');
  const recebido = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tokenDaRequisicao(req) {
  const cab = String(req.headers?.authorization || '');
  return cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
}

// Executa o handler convertendo HttpError em resposta limpa e ocultando erros internos.
export function envolver(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (e) {
      if (e instanceof HttpError) return responder(res, e.status, { ok: false, erro: e.message });
      console.error('[api] erro inesperado:', e);
      return responder(res, 500, { ok: false, erro: 'erro interno' });
    }
  };
}
