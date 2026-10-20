/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Testes de banco (*.db-spec.ts) rodam só pelo jest.db.config.js.
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.db-spec\\.ts$'],
  // Só transpila: checar tipos aqui repetia o build/lint e deixava cada
  // rodada ~7x mais lenta (tipos do zod 4 + swagger).
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { isolatedModules: true } }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
