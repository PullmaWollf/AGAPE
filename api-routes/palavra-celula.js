// Uploads são autorizados pelo login próprio do Ágape.
// O PDF vai diretamente ao Storage por URL assinada; a chave de serviço nunca vai ao navegador.
// Nenhuma validação de quantidade de páginas é feita aqui ou no banco.
import { randomUUID } from 'node:crypto';
import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirPermissao } from '../api/_lib/auth.js';

const BUCKET = 'palavra-celula';
const LIMITE_BYTES = 15 * 1024 * 1024;
const MIME = 'application/pdf';
const NOME_MAX = 180;
const validarNome = (nome) => {
  const normalizado = String(nome ?? '').trim().split(/[\\/]/).pop()?.slice(0, NOME_MAX);
  if (!normalizado || !/\.pdf$/i.test(normalizado)) {
    throw new HttpError(400, 'Selecione um arquivo PDF válido.');
  }
  return normalizado;
};

async function palavraAtual(db) {
  const { data, error } = await db.from('palavra_celula')
    .select('id,titulo,arquivo_path,nome_arquivo,paginas,atualizado_em,atualizado_por')
    .eq('id', true).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export function criarHandler({ criarCliente = clienteAdmin } = {}) {
  return envolver(async (req, res) => {
    if (req.method === 'GET') {
      const atual = await palavraAtual(criarCliente());
      return responder(res, 200, { ok: true, palavra: atual });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');

    const db = criarCliente();
    const { perfil } = await exigirPermissao(db, req, 'palavra');
    const body = req.body || {};
    const acao = body.acao;
    const storage = db.storage.from(BUCKET);

    if (acao === 'preparar') {
      const nome = validarNome(body.nome_arquivo);
      const tamanho = Number(body.tamanho);
      if (!Number.isSafeInteger(tamanho) || tamanho < 1 || tamanho > LIMITE_BYTES) {
        throw new HttpError(400, 'O PDF deve ter até 15 MB.');
      }
      const path = `${perfil.id}/palavra-${Date.now()}-${randomUUID()}.pdf`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error || !data?.token) {
        console.error('[palavra] não foi possível autorizar upload:', error?.message);
        throw new HttpError(503, 'Não foi possível preparar o envio do PDF. Tente novamente.');
      }
      return responder(res, 200, { ok: true, path, token: data.token, nome_arquivo: nome });
    }

    if (acao === 'confirmar') {
      const nome = validarNome(body.nome_arquivo);
      const path = String(body.path || '');
      // Nunca aceita caminhos de outros usuários nem PDFs de nome arbitrário.
      const prefixo = `${perfil.id}/`;
      const arquivo = path.startsWith(prefixo) ? path.slice(prefixo.length) : '';
      if (!/^palavra-\d{10,16}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(arquivo)) {
        throw new HttpError(400, 'Envio não reconhecido. Escolha o PDF novamente.');
      }

      const { data: objetos, error: listaErro } = await storage.list(perfil.id, { limit: 25, search: arquivo });
      if (listaErro) {
        console.error('[palavra] verificação do upload falhou:', listaErro.message);
        throw new HttpError(503, 'Não foi possível verificar o PDF enviado. Tente novamente.');
      }
      const objeto = (objetos || []).find((item) => item.name === arquivo && item.id);
      if (!objeto) throw new HttpError(409, 'O PDF ainda não foi recebido. Tente enviar novamente.');
      const tamanho = Number(objeto.metadata?.size);
      const mime = objeto.metadata?.mimetype || objeto.metadata?.contentType;
      if (!Number.isFinite(tamanho) || tamanho < 1 || tamanho > LIMITE_BYTES ||
          (mime && mime !== MIME)) {
        throw new HttpError(400, 'O arquivo enviado não é um PDF válido de até 15 MB.');
      }

      const anterior = await palavraAtual(db);
      const { data: palavra, error: salvarErro } = await db.from('palavra_celula').upsert({
        id: true,
        titulo: 'Palavra da Célula',
        arquivo_path: path,
        nome_arquivo: nome,
        paginas: null,
        atualizado_por: perfil.id,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'id' }).select('id,titulo,arquivo_path,nome_arquivo,paginas,atualizado_em,atualizado_por').single();
      if (salvarErro) {
        console.error('[palavra] gravação do registro falhou:', salvarErro.message);
        throw new HttpError(503, 'PDF recebido, mas não foi possível publicar. Tente novamente.');
      }

      if (anterior?.arquivo_path && anterior.arquivo_path !== path) {
        const { error: remocaoErro } = await storage.remove([anterior.arquivo_path]);
        if (remocaoErro) console.warn('[palavra] limpeza do PDF anterior:', remocaoErro.message);
      }
      return responder(res, 200, { ok: true, palavra });
    }

    if (acao === 'remover') {
      const anterior = await palavraAtual(db);
      if (!anterior) return responder(res, 200, { ok: true });
      const { error } = await db.from('palavra_celula').delete().eq('id', true);
      if (error) {
        console.error('[palavra] remoção do registro falhou:', error.message);
        throw new HttpError(503, 'Não foi possível remover a Palavra. Tente novamente.');
      }
      if (anterior.arquivo_path) {
        const { error: storageError } = await storage.remove([anterior.arquivo_path]);
        if (storageError) console.warn('[palavra] arquivo antigo pendente de limpeza:', storageError.message);
      }
      return responder(res, 200, { ok: true });
    }

    throw new HttpError(400, 'ação desconhecida');
  });
}

export default criarHandler();
