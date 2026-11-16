// Verify the configured Supabase database before importing the API. This keeps
// direct server starts from bypassing the npm run dev preflight.
import { ensureSupabaseConfigured, checkBetterGetafeSchema } from './server/src/config/supabaseSetup.js';

try {
  const setup = await ensureSupabaseConfigured();
  if (setup.cancelled) process.exit(0);
  console.info('[Supabase] Connection verified.');
  await checkBetterGetafeSchema(setup.url);
  console.info('[Supabase] Better Getafe database ready.');
} catch (error) {
  console.error(`[Supabase] ${error.message}`);
  process.exit(1);
}

await import('./server/index.js');
