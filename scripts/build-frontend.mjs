// Set production mode before Vite loads the config and chooses React's build.
process.env.NODE_ENV = 'production';

const { build } = await import('vite');
await build();
