// Cliente Supabase falso, em memória, só com o que as funções da API usam.
export function criarFake({ users = [], push_subscriptions = [], contas = {}, tokens = {} } = {}) {
  const tabelas = { users, push_subscriptions };
  const log = { authCriadas: [], authApagadas: [], authSenhas: [] };
  let seq = 1000;

  class Q {
    constructor(nome) { this.nome = nome; this.op = 'select'; this.filtros = []; this.opts = {}; this.payload = null; this.retorna = false; this.unico = null; }
    select(_cols, opts = {}) { if (this.op === 'select') this.opts = opts; else this.retorna = true; return this; }
    insert(obj) { this.op = 'insert'; this.payload = obj; return this; }
    update(obj) { this.op = 'update'; this.payload = obj; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtros.push((r) => r[c] === v); return this; }
    in(c, vs) { this.filtros.push((r) => vs.includes(r[c])); return this; }
    ilike(c, v) { this.filtros.push((r) => String(r[c]).toLowerCase() === String(v).toLowerCase()); return this; }
    order() { return this; }
    maybeSingle() { this.unico = 'maybe'; return this; }
    single() { this.unico = 'single'; return this; }
    async executar() {
      const t = tabelas[this.nome];
      const casa = (r) => this.filtros.every((f) => f(r));
      if (this.op === 'insert') {
        const novo = { id: `id-${seq++}`, ...this.payload };
        if (this.falhaInsert) return { data: null, error: { message: this.falhaInsert } };
        t.push(novo);
        return { data: this.retorna ? (this.unico ? novo : [novo]) : null, error: null };
      }
      if (this.op === 'update') { t.filter(casa).forEach((r) => Object.assign(r, this.payload)); return { data: null, error: null }; }
      if (this.op === 'delete') {
        for (let i = t.length - 1; i >= 0; i--) if (casa(t[i])) t.splice(i, 1);
        return { data: null, error: null };
      }
      const achados = t.filter(casa);
      if (this.opts.head) return { data: null, count: achados.length, error: null };
      if (this.unico) return { data: achados[0] ?? null, error: null };
      return { data: achados, error: null };
    }
    then(ok, err) { return this.executar().then(ok, err); }
  }

  const fake = {
    tabelas, log, falhaInsertEmUsers: null,
    from(nome) {
      const q = new Q(nome);
      if (nome === 'users' && fake.falhaInsertEmUsers) q.falhaInsert = fake.falhaInsertEmUsers;
      return q;
    },
    auth: {
      async getUser(token) {
        const u = tokens[token];
        return u ? { data: { user: { id: u } }, error: null } : { data: { user: null }, error: { message: 'jwt inválido' } };
      },
      admin: {
        async createUser({ email, password }) {
          if (contas[email]) return { data: null, error: { message: 'A user with this email address has already been registered' } };
          const id = `auth-${seq++}`;
          contas[email] = { id, password };
          log.authCriadas.push(email);
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id) { log.authApagadas.push(id); return { error: null }; },
        async listUsers() {
          return { data: { users: Object.entries(contas).map(([email, c]) => ({ id: c.id, email })) }, error: null };
        },
        async updateUserById(id, attrs) { log.authSenhas.push({ id, ...attrs }); return { data: {}, error: null }; },
      },
    },
  };
  return fake;
}

export function reqRes({ metodo = 'POST', corpo = {}, cabecalhos = {} } = {}) {
  const req = { method: metodo, body: corpo, headers: cabecalhos };
  const res = {
    codigo: null, corpo: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.codigo = c; return this; },
    json(o) { this.corpo = o; return this; },
  };
  return { req, res };
}
