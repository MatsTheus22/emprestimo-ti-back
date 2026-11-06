import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Spec 003 CA-02: o arquivo de dados traz os 12 equipamentos da lista, cada um
// com situação, imagem e créditos.

interface EquipamentoInicial {
  assetTag: string;
  name: string;
  category: string;
  status: string;
  imagePath: string;
  photoSource: string;
  photoAuthor: string;
  photoLicense: string;
}

const RAIZ = path.resolve(__dirname, '..');
const SKILL = path.resolve(RAIZ, '..', 'skills', 'imagens-equipamentos');

function lerJson<T>(caminho: string): T {
  return JSON.parse(readFileSync(caminho, 'utf8')) as T;
}

const dados = lerJson<EquipamentoInicial[]>(
  path.join(RAIZ, 'prisma', 'dados', 'equipamentos-iniciais.json'),
);

describe('dados iniciais', () => {
  it('test_ca_02_tem_12_equipamentos_com_patrimonio_unico', () => {
    const esperados = Array.from({ length: 12 }, (_, i) => `TI-${String(i + 1).padStart(4, '0')}`);

    expect(dados.map((item) => item.assetTag)).toEqual(esperados);
  });

  it('test_ca_02_tres_em_manutencao_e_nove_disponiveis', () => {
    const emManutencao = dados.filter((item) => item.status === 'manutencao');
    const disponiveis = dados.filter((item) => item.status === 'disponivel');

    expect(emManutencao.map((item) => item.assetTag)).toEqual(['TI-0004', 'TI-0007', 'TI-0010']);
    expect(disponiveis).toHaveLength(9);
  });

  it('test_ca_02_imagem_de_cada_um_e_o_patrimonio_em_jpg', () => {
    for (const item of dados) expect(item.imagePath).toBe(`${item.assetTag}.jpg`);
  });

  it('test_ca_02_categoria_e_uma_das_permitidas', () => {
    for (const item of dados) {
      expect(['notebook', 'monitor', 'cabo', 'camera']).toContain(item.category);
    }
  });

  it('test_ca_02_todo_equipamento_tem_nome_e_creditos', () => {
    for (const item of dados) {
      expect(item.name).not.toBe('');
      expect(item.photoSource).toMatch(/^https:\/\/pixabay\.com\/photos\//);
      expect(item.photoAuthor).not.toBe('');
      expect(item.photoLicense).toBe('Pixabay Content License');
    }
  });
});

// A skill fica em outro repositório: num clone só do back, esta comparação não roda.
const comSkill = existsSync(SKILL) ? describe : describe.skip;

comSkill('dados iniciais contra as listas da skill', () => {
  it('test_ca_02_igual_a_equipamentos_json_e_creditos_json', () => {
    const lista = lerJson<
      { patrimonio: string; nome: string; categoria: string; situacao: string }[]
    >(path.join(SKILL, 'references', 'equipamentos.json'));
    const creditos = lerJson<{
      itens: {
        patrimonio: string;
        arquivo: string;
        origem: string;
        autor: string;
        licenca: string;
      }[];
    }>(path.join(SKILL, 'creditos.json'));
    const porPatrimonio = new Map(creditos.itens.map((item) => [item.patrimonio, item]));

    const esperado = lista.map((item) => {
      const credito = porPatrimonio.get(item.patrimonio);
      return {
        assetTag: item.patrimonio,
        name: item.nome,
        category: item.categoria,
        status: item.situacao,
        imagePath: credito?.arquivo,
        photoSource: credito?.origem,
        photoAuthor: credito?.autor,
        photoLicense: credito?.licenca,
      };
    });

    expect(dados).toEqual(esperado);
  });
});
