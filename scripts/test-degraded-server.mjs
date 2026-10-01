import { setStorageClientFactoryForTests } from '../server/src/services/storage.js';
process.env.PORT = process.env.DEGRADED_TEST_PORT || '8086';
process.env.BACKEND_PORT = process.env.PORT;
setStorageClientFactoryForTests(() => ({ send: async () => { throw Object.assign(new Error('Storage test unavailable'), { code: 'ECONNREFUSED' }); }, destroy() {} }));
await import('../server/index.js');
