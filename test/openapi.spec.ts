import { readFileSync } from 'node:fs';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApiDocument, serializeOpenApiDocument } from '../src/openapi';

// Spec 001 CA-09: o contrato é gerado dos schemas Zod e o openapi.json
// commitado nunca fica para trás do código.

let document: OpenAPIObject;

function contentTypes(response: unknown): string[] {
  const content = (response as { content?: Record<string, unknown> } | undefined)?.content;
  return Object.keys(content ?? {});
}

function propriedades(schema: string): Record<string, unknown> {
  const declarado = document.components?.schemas?.[schema] as {
    properties: Record<string, unknown>;
  };
  return declarado.properties;
}

beforeAll(async () => {
  document = await buildOpenApiDocument();
});

describe('OpenAPI', () => {
  it('test_ca_09_documenta_health_publico', () => {
    const health = document.paths['/v1/health']?.get;

    expect(health).toBeDefined();
    expect(health?.security).toBeUndefined();
    expect(health?.responses['200']).toBeDefined();
  });

  it('test_ca_09_documenta_me_com_bearer_schema_e_erros_problem_json', () => {
    const me = document.paths['/v1/me']?.get;

    expect(me?.security).toEqual([{ bearer: [] }]);
    expect(JSON.stringify(me?.responses['200'])).toContain('#/components/schemas/MeDto_Output');
    expect(contentTypes(me?.responses['401'])).toEqual(['application/problem+json']);
    expect(contentTypes(me?.responses['403'])).toEqual(['application/problem+json']);

    const meSchema = document.components?.schemas?.MeDto_Output as { required?: string[] };
    expect([...(meSchema.required ?? [])].sort()).toEqual([
      'displayName',
      'role',
      'tenant',
      'userId',
    ]);
  });

  // Spec 004.
  it('test_ca_05_documenta_equipment_com_bearer_cursor_e_erros_problem_json', () => {
    const equipment = document.paths['/v1/equipment']?.get;

    expect(equipment?.security).toEqual([{ bearer: [] }]);
    expect((equipment?.parameters ?? []).map((p) => ('name' in p ? p.name : ''))).toEqual(
      expect.arrayContaining(['cursor', 'limit']),
    );
    expect(JSON.stringify(equipment?.responses['200'])).toContain(
      '#/components/schemas/EquipmentListDto_Output',
    );
    for (const status of ['400', '401', '403']) {
      expect(contentTypes(equipment?.responses[status])).toEqual(['application/problem+json']);
    }
  });

  it('test_ca_08_documenta_post_loans_com_bearer_e_erros_problem_json', () => {
    const loans = document.paths['/v1/loans']?.post;

    expect(loans?.security).toEqual([{ bearer: [] }]);
    expect(JSON.stringify(loans?.responses['201'])).toContain(
      '#/components/schemas/LoanDto_Output',
    );
    for (const status of ['400', '401', '403', '404', '409']) {
      expect(contentTypes(loans?.responses[status])).toEqual(['application/problem+json']);
    }
  });

  it('test_ca_15_documenta_loans_me_com_bearer_cursor_e_erros_problem_json', () => {
    const loans = document.paths['/v1/loans/me']?.get;

    expect(loans?.security).toEqual([{ bearer: [] }]);
    expect((loans?.parameters ?? []).map((p) => ('name' in p ? p.name : ''))).toEqual(
      expect.arrayContaining(['cursor', 'limit']),
    );
    expect(JSON.stringify(loans?.responses['200'])).toContain(
      '#/components/schemas/MyLoansDto_Output',
    );
    for (const status of ['400', '401', '403']) {
      expect(contentTypes(loans?.responses[status])).toEqual(['application/problem+json']);
    }
  });

  // Spec 004: o orval recusa o contrato com `type` em array, e o @nestjs/swagger lê
  // esse formato como lista. A resposta da API continuava certa, então só isto pega.
  it('test_ca_05_nenhum_schema_do_contrato_tem_type_em_array', () => {
    expect(JSON.stringify(document.components?.schemas)).not.toMatch(/"type":\[/);
  });

  it.each(['EquipmentListDto_Output', 'MyLoansDto_Output'])(
    'test_ca_05_next_cursor_de_%s_e_string_anulavel',
    (schema) => {
      expect(propriedades(schema).nextCursor).toMatchObject({ type: 'string', nullable: true });
    },
  );

  it('test_ca_05_caminho_da_imagem_e_string_anulavel', () => {
    const { items } = propriedades('EquipmentListDto_Output') as {
      items: { items: { properties: Record<string, unknown> } };
    };

    expect(items.items.properties.imagePath).toMatchObject({ type: 'string', nullable: true });
  });

  it('test_ca_09_openapi_json_commitado_esta_atualizado', () => {
    const committed = readFileSync('openapi.json', 'utf8');

    // Se falhar: rode `npm run openapi` e commite o openapi.json.
    expect(committed).toBe(serializeOpenApiDocument(document));
  });
});
