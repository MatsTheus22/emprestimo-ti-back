import { readdirSync, readFileSync } from 'node:fs';

// Spec 001 CA-10: na Vercel toda requisição vai para a function da API e
// nenhum arquivo do repositório é servido como estático.

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  outputDirectory?: string;
  rewrites?: { source: string; destination: string }[];
};

describe('vercel.json (API)', () => {
  it('test_ca_10_toda_rota_vai_para_a_function', () => {
    expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/api' }]);
  });

  it('test_ca_10_estaticos_so_de_uma_pasta_vazia', () => {
    expect(config.outputDirectory).toBe('public');
    expect(readdirSync('public')).toEqual(['.gitkeep']);
  });
});
