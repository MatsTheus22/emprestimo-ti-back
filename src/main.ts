import { existsSync } from 'node:fs';
import { createApp } from './app.factory';
import { ENV } from './config/env.module';
import type { Env } from './config/env';

// Local lê o .env; na Vercel as variáveis já chegam no process.env.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
}

void bootstrap();
