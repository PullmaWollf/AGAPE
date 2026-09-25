import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, encoded] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !encoded) return false;
  const derived = Buffer.from(await scrypt(String(password), salt, 64));
  const expected = Buffer.from(encoded, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function validarSenha(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return false;
  }
  return true;
}

export function senhaValidaOuErro(password) {
  if (!validarSenha(password)) throw new Error('a senha precisa ter entre 6 e 128 caracteres');
}
