export function validatePasswordLogin(email, password) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { field: 'email', code: 'invalid_email', message: 'Enter a valid email address, such as you@example.com.' }
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { field: 'password', code: 'missing_password', message: 'Enter your password.' }
  }
  if (password.length > 1024) {
    return { field: 'password', code: 'password_too_long', message: 'Password must be 1,024 characters or fewer.' }
  }
  return null
}
