const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  'qwerty123',
  'admin123',
]);

export function getPasswordPolicyChecks(password, minimumLength = 8) {
  const value = typeof password === 'string' ? password : '';
  const upperLower = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const number = /\d/.test(value);
  return {
    length: value.length >= minimumLength,
    upperLower,
    number,
    mixed: upperLower && number,
    symbol: /[^A-Za-z0-9]/.test(value),
    common: value.length > 0 && !COMMON_PASSWORDS.has(value.toLowerCase()),
    size: value.length <= 1024,
  };
}

export function passwordPassesPolicy(password, minimumLength = 8) {
  return Object.values(getPasswordPolicyChecks(password, minimumLength)).every(Boolean);
}
