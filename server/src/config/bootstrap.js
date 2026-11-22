import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.development.local', quiet: true });
  dotenv.config({ path: '.env', quiet: true });
}
