const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH',
  'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', '08000', '08001', '08003',
  '08006', '57P01', '57P02', '57P03', '53300', 'STORAGE_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE',
]);

export function isDependencyFailure(error) {
  if (!error) return false;
  return TRANSIENT_CODES.has(error.code) ||
    ['TimeoutError', 'RequestTimeout', 'NetworkingError', 'SocketClosedUnexpectedlyError', 'ClientOfflineError'].includes(error.name) ||
    /connection (?:terminated|closed|ended)|timeout exceeded when trying to connect/i.test(error.message || '') ||
    [408, 429, 500, 502, 503, 504].includes(Number(error.$metadata?.httpStatusCode || error.statusCode)) ||
    isDependencyFailure(error.cause);
}

export function dependencyStatus(error) {
  if (error?.code === 'ETIMEDOUT' || error?.name === 'TimeoutError') return 504;
  return isDependencyFailure(error) ? 503 : 500;
}

export function installPoolErrorHandler(pool, category) {
  // pg removes a failed idle client before emitting this event. The next
  // checkout creates a connection; restarting the application is unnecessary.
  pool.on('error', error => {
    console.error(JSON.stringify({ event: 'postgres_pool_error', category, code: error.code || error.name }));
  });
  // Checked-out transaction clients can fail while no query is pending too.
  pool.on('connect', client => client.on('error', error => {
    console.error(JSON.stringify({ event: 'postgres_client_error', category, code: error.code || error.name }));
  }));
  return pool;
}
