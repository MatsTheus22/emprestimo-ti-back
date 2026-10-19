import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument, serializeOpenApiDocument } from '../src/openapi';

// npm run openapi → grava openapi.json na raiz. O front regenera o cliente
// a partir dele (orval). Commite o arquivo junto com a mudança de contrato.
async function main(): Promise<void> {
  const document = await buildOpenApiDocument();
  writeFileSync('openapi.json', serializeOpenApiDocument(document));
  console.log(`openapi.json gerado (${Object.keys(document.paths).length} rotas)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
