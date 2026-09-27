import dns from 'node:dns';
import https from 'node:https';

// Some Windows networks return IPv6 records for B2 while lacking IPv6 routes.
// Prefer reachable IPv4 addresses for this B2-only agent and retain IPv6 when
// DNS has no IPv4 answer. Cycling addresses also lets SDK retries try another
// regional edge address without changing process-wide DNS or IPv6 settings.
export function createBackblazeHttpsAgent({ onAddress } = {}) {
  let nextAddress = 0;
  const lookup = (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      const ordered = [...addresses.filter(address => address.family === 4), ...addresses.filter(address => address.family === 6)];
      if (!ordered.length) return callback(Object.assign(new Error(`No addresses found for ${hostname}.`), { code: 'ENOTFOUND' }));
      const selected = ordered[nextAddress++ % ordered.length];
      onAddress?.({ hostname, address: selected.address, family: selected.family });
      if (options?.all) callback(null, [selected]);
      else callback(null, selected.address, selected.family);
    });
  };
  return new https.Agent({ keepAlive: true, maxSockets: 50, autoSelectFamily: false, lookup });
}
