// Login do app → e-mail interno do Supabase Auth. Deve ser IGUAL à função
// loginParaEmail de js/utils.js (há um teste que garante isso).
export function normalizarLogin(login) {
  return String(login ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function loginParaEmail(login, dominio = process.env.AUTH_EMAIL_DOMAIN || 'celulaagape.app') {
  return `${normalizarLogin(login)}@${dominio}`;
}
