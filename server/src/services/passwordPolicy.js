const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  'qwerty123',
  'admin123',
]);

export function passwordMeetsPolicy(password, minimumLength = 8) {
  if (typeof password !== 'string') return false;
  const minimum = Number(minimumLength);
  if (!Number.isSafeInteger(minimum) || minimum < 1) return false;
  return password.length >= minimum
    && password.length <= 1024
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
    && !COMMON_PASSWORDS.has(password.toLowerCase());
}
