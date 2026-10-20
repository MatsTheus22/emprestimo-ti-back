// Entrada da Vercel Function. As variáveis chegam do painel da Vercel;
// não há .env aqui (ver rules/secrets.md).
import { createApp } from '../src/app.factory';
import { createServerlessHandler } from '../src/serverless';

export default createServerlessHandler(createApp);
