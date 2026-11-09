# Entrega da prática

## Links

- Repositório (turma REST: back e front):
  - Back: https://github.com/MatsTheus22/emprestimo-ti-back
  - Front: https://github.com/MatsTheus22/emprestimo-ti-front
  - Agente (rules, specs, skill, subagente, hooks e o diário): https://github.com/MatsTheus22/emprestimo-ti-agent
- Produção (Vercel):
  - Sistema: https://emprestimo-ti-front.vercel.app
  - API: https://emprestimo-ti-back.vercel.app

Como ler:

- O projeto tem três repositórios, e a tag `entrega-pratica` está nos três. Este arquivo é igual nos três.
- Os caminhos citados, como `docs/specs/...`, `hooks/...` e `skills/...`, estão no repositório do agente, salvo quando começam com `back/` ou `front/`.
- Cada commit vem com o repositório: "agente `c3ae53e`", "back `4d3fc7b`".
- As specs desta prática são três:
  - `003-dados-iniciais`;
  - `004-solicitar-emprestimo`;
  - `005-trocar-fotos`, que nasceu de um erro meu na revisão das fotos (seção 4).
- O registro do dia a dia está em `docs/entrega/diario.md`.

Quem é quem neste texto:

- **Agente:** o agente que implementou cada spec.
- **Chat de validação:** uma segunda sessão do agente, que usei para revisar o trabalho do primeiro antes de cada aprovação. Quando uma proposta ou um teste foi dele, isso aparece escrito.

## 1. Conflitos: o que foi pedido contra o que já existia

| pedido                                                                               | contrariava o quê                                                                                                    | o que você fez                                                                                                                                                                                                                      | por quê                                                                                                                     | onde ficou registrado                                                                                | commit                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| Tech lead: "o verificador pode corrigir o teste e verificar de novo"                 | Requisito "Independência" do subagente: quem corrige é o agente principal                                            | Recusei. O verificador não tem Edit nem Write, e o hook só deixa ele rodar testes, build e git de leitura                                                                                                                           | Um verificador que corrige o que verifica passa a aprovar o próprio trabalho                                                | `agents/verificador-spec.md:42-44`, `.claude/agents/verificador-spec.md:5`, `hooks/regras.mjs:63-69` | agente `0c83194`                 |
| Contrato da skill: só Pexels, crédito "Fotos: Pexels"                                | Aviso do professor em sala (2026-11-05): a fonte passa a ser o Pixabay. A emissão de chaves do Pexels estava pausada | Troquei para o Pixabay, inclusive o crédito na tela                                                                                                                                                                                 | O aviso do professor vale sobre o texto                                                                                     | `docs/specs/003-dados-iniciais/spec.md:14`, `skills/imagens-equipamentos/SKILL.md:3`                 | agente `cbc9fb8`                 |
| Briefing de dados, item 4: "instale a biblioteca sharp"                              | `rules/restrictions.md`: biblioteca só se estiver em ADR                                                             | Primeiro, não instalei: o CDN do Pexels já entregava 800×600, testado em 2 fotos. Depois da troca para o Pixabay, que só oferece tamanhos fixos, aprovei o ADR-003 e usei `sharp` só nos scripts locais da skill                    | O tamanho precisa ser garantido, não só pedido. Dependência nova exige registro                                             | `docs/adr/003-sharp.md`, `docs/specs/003-dados-iniciais/spec.md:14`                                  | agente `169ee7f`, `18407da`      |
| Briefing de dados, item 5: senha padrão escrita no arquivo que popula os dados       | Regra "nenhuma senha em código ou no histórico do git" (`rules/secrets.md`) e ADR-001 §7, cadastro fechado           | Recusei. Criei a conta do professor pelo painel do Auth e a membership por SQL. O script de dados não toca em usuários                                                                                                              | A regra do enunciado vence o pedido do briefing                                                                             | `docs/specs/003-dados-iniciais/spec.md:25-28`, CA-04 e CA-07                                         | agente `c3ae53e`, back `2d3bdda` |
| Briefing de dados, item 3: TI-0004 e TI-0007 em manutenção, os outros 10 disponíveis | A lista da própria prática põe também a TI-0010 em manutenção                                                        | Segui a lista: 3 em manutenção e 9 disponíveis. Primeiro escolhi o briefing e revi antes de implementar                                                                                                                             | Entendi pelo documento que a lista é mais definitiva que o briefing, que pode estar errado                                  | `docs/specs/003-dados-iniciais/spec.md:11-13`                                                        | agente `3f09df4`                 |
| Briefing de empréstimo, item 3: devolução em 14 dias úteis                           | `docs/PRD.md`: 14 dias; `layout.md`: "hoje + 14 dias"                                                                | 14 dias corridos, vencendo no fim do 14º dia no horário de São Paulo                                                                                                                                                                | Regra de negócio é do PRD                                                                                                   | `docs/specs/004-solicitar-emprestimo/spec.md:13`, `:41-44`, CA-08                                    | back `4d3fc7b`                   |
| Briefing de empréstimo, item 4: limite de 5 em aberto                                | `docs/PRD.md`: até 3 itens                                                                                           | Limite de 3                                                                                                                                                                                                                         | Regra de negócio é do PRD                                                                                                   | `docs/specs/004-solicitar-emprestimo/spec.md:13`, CA-10                                              | back `4d3fc7b`                   |
| Briefing de empréstimo, item 9: catálogo sem rodapé nem crédito                      | Contrato da skill: a tela das fotos mostra o crédito com link                                                        | O catálogo mostra "Fotos: Pixabay" com link                                                                                                                                                                                         | O crédito é exigência das diretrizes da API, já no contrato                                                                 | `docs/specs/004-solicitar-emprestimo/spec.md:19-20`, CA-07                                           | front `c38e7cf`                  |
| `layout.md`: card de item emprestado com "Com {pessoa} · devolver até {data}"        | Briefing de empréstimo, item 9: o catálogo mostra só os dados do equipamento                                         | Item com outra pessoa mostra só "Emprestado". A API nem envia o nome dela. O `layout.md` ganhou a seção "11. Alterações"                                                                                                            | Quem está com o item não é dado do equipamento                                                                              | `docs/specs/004-solicitar-emprestimo/spec.md:21-22`, CA-06 e CA-19, `layout.md:241`                  | agente `bdd3c27`, back `daaf1f3` |
| Senha antiga dos usuários de demonstração, que estava no código do back              | Regra "nenhuma senha em código ou no histórico do git"                                                               | Tirei a senha do código. Ela continua no histórico do back e deste repositório, sem reescrita. Os usuários que a usavam eram só do ambiente local: foram apagados em 2026-11-05, e a senha agora é recusada (`invalid_credentials`) | Reescrever o histórico de um repositório público não apaga as cópias já feitas. O que tira o risco é a senha não valer mais | `docs/entrega/diario.md` ("Senha antiga de usuários de demonstração")                                | back `e290993`, agente `7463f09` |

## 1b. Lacunas: o que foi pedido de forma incompleta

| spec | o que faltava                                           | alternativas                                                     | o que decidiu                                                                                                                                           | por quê                                                                                                                                                                               | commit                           |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 003  | Papel e nome do professor                               | `operacoes`, com acesso máximo; `colaborador`                    | `colaborador`, nome "Marcelo Grilo" (CA-07)                                                                                                             | Primeiro escolhi acesso máximo. Mudei ao ver que `operacoes` cai em "Em construção" (spec 002, CA-07), e o professor precisa ver o catálogo                                           | agente `c3ae53e`                 |
| 003  | Quem cria a conta do professor                          | Script de dados; eu, pelo painel do Auth                         | Eu crio a conta pelo painel e a membership por SQL. O script não toca em usuários                                                                       | Inserir direto em `auth.users` pode quebrar o login e deixaria a senha no editor SQL                                                                                                  | agente `c3ae53e`                 |
| 003  | Patrimônio vazio                                        | Opcional, como o agente propôs no plano; obrigatório             | NOT NULL                                                                                                                                                | O pedido é patrimônio único, e nulo escapa do índice único                                                                                                                            | back `6130957`                   |
| 003  | Categoria no banco                                      | Texto livre; CHECK                                               | CHECK com as 4 categorias                                                                                                                               | Barra erro de digitação, como no `status`                                                                                                                                             | back `6130957`                   |
| 003  | Imagem e créditos no banco                              | URL completa; só o caminho                                       | Caminho `TI-000N.jpg`, mais origem, autor e licença em colunas de `equipment`                                                                           | A URL pública depende do ambiente. O crédito precisa acompanhar o equipamento                                                                                                         | back `6130957`                   |
| 003  | Rodar de novo                                           | Atualizar o que existe; manter                                   | O que existe fica como está. Trocar uma foto publicada exige `--substituir`                                                                             | Uma foto revisada não muda sem decisão explícita                                                                                                                                      | back `2d3bdda`, agente `1f6c5a0` |
| 003  | Foto gerada por IA                                      | Aceitar; recusar                                                 | Recusada por código, pelo campo `isAiGenerated` da API (`skills/imagens-equipamentos/SKILL.md:55`)                                                      | O contrato pede registrar quem fotografou                                                                                                                                             | agente `51b28a2`                 |
| 003  | Como provar o que só existe em produção                 | Print solto; arquivo de evidência                                | Evidências em `docs/specs/<spec>/evidencias/`, gravadas por mim                                                                                         | O verificador nunca acessa produção                                                                                                                                                   | agente `831d824`                 |
| 004  | Como guardar "emprestado"                               | Calcular a partir de `loans`; gravar em `equipment.status`       | Gravar, com índice único parcial: no máximo um empréstimo aberto por equipamento (CA-01)                                                                | Quem garante é o banco, e não só o código                                                                                                                                             | back `0306792`                   |
| 004  | Dois pedidos ao mesmo tempo, e o limite de 3            | Conferir na aplicação; transação com trava                       | Transação com `SELECT ... FOR UPDATE` na membership da pessoa (CA-12)                                                                                   | Sem a trava, dois pedidos simultâneos passam pela conferência do limite                                                                                                               | back `4d3fc7b`                   |
| 004  | Quem pode escrever direto no banco                      | Só `loans` e `equipment`, como o agente propôs; todas as tabelas | `anon` e `authenticated` sem escrita em nenhuma tabela de domínio, nem em `_prisma_migrations`, e leitura só das próprias linhas (CA-02 a CA-04, CA-24) | O chat de validação testou no banco local, com rollback: um colaborador mudava papéis, apagava memberships, renomeava o tenant e forjava auditoria. O ADR-001 §7 pede deny by default | back `0306792`                   |
| 004  | Quando começa o atraso                                  | 14 × 24 h; fim do 14º dia                                        | Fim do 14º dia no horário de São Paulo, convertido para UTC ao gravar (CA-08)                                                                           | A tela diz "devolver até" aquela data. O chat de validação mostrou que, sem a conversão, uma sessão em outro fuso grava 5 horas a menos                                               | back `4d3fc7b`                   |
| 004  | Auditoria                                               | Gravar; não gravar                                               | `loan.create` na mesma transação. Cada pessoa lê só a própria auditoria                                                                                 | ADR-001 §10. Lida por tenant, a auditoria mostraria quem pegou o quê                                                                                                                  | back `4d3fc7b`                   |
| 004  | Limpar os empréstimos dos meus testes em produção       | Apagar à mão; script                                             | Script `limpar:emprestimos-teste`, rodado por mim. O e-mail só entra com `--email`, e a conta do professor é recusada (CA-17, CA-18)                    | A conta do professor fica intacta, e o repositório é público                                                                                                                          | back `d4422f3`, agente `ba7901c` |
| 004  | Papel da minha conta de teste                           | `colaborador`; `operacoes`                                       | `operacoes`                                                                                                                                             | A mesma conta vai testar outras funcionalidades                                                                                                                                       | agente `ef3effb`                 |
| 004  | Observação de manutenção, que não existe em `equipment` | Coluna nova; texto fixo                                          | Texto fixo "Indisponível durante a manutenção"                                                                                                          | Sem mudar o schema por uma frase                                                                                                                                                      | front `c38e7cf`                  |
| 004  | Limite e atraso ao mesmo tempo                          | Mostrar o limite; mostrar o atraso                               | Vale o atraso (CA-11)                                                                                                                                   | O atraso tem banner e atalho para resolver                                                                                                                                            | back `4d3fc7b`                   |
| 004  | Busca, filtros e botão "Devolver" do `layout.md`        | Implementar; deixar de fora                                      | Fora desta spec                                                                                                                                         | O briefing não pede, e a devolução está fora de escopo                                                                                                                                | agente `7089461`                 |
| 004  | Trecho do CA-07 da spec 002 ("Em construção")           | Editar a 002; registrar na 004                                   | A 004 registra que substitui o trecho                                                                                                                   | Spec fechada não se edita. A mudança fica na spec que a pede                                                                                                                          | agente `7089461`                 |
| 004  | Rate limit, previsto no ADR-001 §10                     | Implementar; desvio consciente                                   | Desvio consciente, registrado na spec                                                                                                                   | O enunciado não pede, e exigiria tabela nova                                                                                                                                          | agente `7089461`                 |
| 005  | Créditos no banco depois da troca de fotos              | Script novo; SQL colado no editor                                | SQL em uma transação, rodado por mim (`docs/specs/005-trocar-fotos/atualizar-creditos.sql`)                                                             | Operação única: a consulta das 12 linhas prova o resultado                                                                                                                            | agente `3b7612a`, back `e9f1adf` |
| 005  | Como regravar só o que mudou                            | Lista digitada (`--somente`); comparar com a URL pública         | `--substituir` grava só a foto que difere da URL pública (CA-05)                                                                                        | Sem lista para errar, e repetir é seguro                                                                                                                                              | agente `2fb4a0e`                 |
| 005  | A TI-0007 sem nenhum monitor aceitável em 4 buscas      | Buscar de novo; mover uma foto da TI-0006                        | Movi a 17768, que era reserva da TI-0006 (CA-03)                                                                                                        | Cumpre o requisito e não exige mudar código                                                                                                                                           | agente `20f55fa`                 |

Nas tabelas acima, três motivos foram propostos pelo agente, e eu aceitei:

- **004:** atraso, auditoria e e-mail fora do repositório.

Outros foram propostos pelo chat de validação, e eu também aceitei:

- **003:** conta do professor, rodar de novo, patrimônio e categoria.
- **004:** spec 002 e permissões.
- **005:** créditos e regravação.

## 2. Onde o agente tentou decidir por você

- **As 23 decisões iniciais.** Na primeira leitura do enunciado, o agente listou 23 pontos em aberto e tratou todos como escolha livre minha. Um deles era manter a senha antiga no histórico. Perguntei se o HTML permitia cada decisão, e ele separou o que o enunciado já fixava do que era meu. Foi por essa revisão que a senha virou conflito (seção 1), e não "opção".
- **Patrimônio opcional, só no plano (003).** O agente deixou `asset_tag` opcional e escreveu isso só no `plan.md`, sem pôr na spec. Peguei na revisão do plano: nulo escapa do índice único, e o pedido é patrimônio único. Decidi NOT NULL e registrei na spec (`docs/specs/003-dados-iniciais/spec.md:20-22`).
- **Permissões e fuso no plano (004).** O plano deixava `_prisma_migrations` fora do REVOKE e gravava `due_at` sem converter o fuso. A pedido meu, o chat de validação rodou o DDL e a fórmula no banco local, com rollback. Eu trouxe o resultado e decidi as duas correções. O `spec.md` da 004 diz "teste do usuário" nesses pontos, porque a mensagem que colei estava em primeira pessoa. A spec fechada não foi editada.
- **Formato do Storage (005).** O agente escreveu o CA-05 dizendo que o Storage responde 404 a foto ausente, sem medir. Na T2 ele mediu, achou HTTP 400 com `statusCode` 404 no corpo e trouxe a diferença para eu decidir, sem mudar a spec por conta própria (agente `d54093d`).
- **A transcrição das minhas aprovações de foto (003).** Aqui o erro foi de omissão: o chat que transcreveu as aprovações tinha o requisito de direito de imagem e não me avisou de que as fotos o violavam. Detalhes na seção 4.

## 3. Uma decisão que merece (ou não) um ADR

**`sharp` virou o ADR-003** (`docs/adr/003-sharp.md`, agente `18407da`).

- **Alternativa defensável:** pedir o tamanho ao CDN de imagens e não ter dependência nova. Com o Pexels, isso funcionava, e foi a primeira decisão.
- **Por que virou ADR:**
  - É dependência nova, e `rules/restrictions.md` só aceita biblioteca registrada em `docs/adr/`.
  - A decisão mudou por causa de um fato externo, a troca de fonte. Sem o registro, quem lesse o código não saberia por que a primeira opção foi abandonada.
  - Ela limita o resto do sistema: `sharp` só nos scripts locais da skill, nunca na API nem no front.

**O índice único parcial da 004 não virou ADR.** Também tinha alternativa, calcular a situação a partir de `loans`, mas vale só para esta funcionalidade e está inteiro na spec e no teste do CA-01.

## 4. A skill imagens-equipamentos

**Onde ficou cada coisa e o critério:**

- **`SKILL.md`:** o que o agente precisa em todo uso. É o fluxo buscar → revisar → fechar → enviar → conferir, as proibições e a tabela "Quem garante cada requisito".
- **`references/`:** o que se consulta só às vezes ou é para outra pessoa ler:
  - `api-pixabay.md`: parâmetros e limites da API;
  - `criterios-revisao.md`: escrito para quem revisa as fotos;
  - `licenca.md`;
  - `equipamentos.json`: a lista do enunciado;
  - `buscas-alternativas.json`: os termos extras de busca.
- **`scripts/`:** tudo que dá para garantir por código, com 80 testes:
  - `buscar.mjs`, `fechar.mjs` e `enviar.mjs`;
  - `conferir.mjs`, que entrou na 005;
  - `lib.mjs`.

**Quem garante cada requisito:**

| Requisito                      | Garantido por                                                                                        | Onde                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| Só Pixabay                     | Código: a busca só chama essa API                                                                    | `buscar.mjs`                      |
| 800×600                        | Código: `sharp` redimensiona, e o arquivo final é relido. Falha se o tamanho diferir, e nunca amplia | `validarArquivo` em `lib.mjs`     |
| Sem repetição                  | Código: compara o id da Pixabay e o hash, na busca e no fechamento                                   | `buscar.mjs`, `avaliarDecisoes`   |
| Créditos                       | Código: o manifesto sai só das aprovadas                                                             | `creditos.json`                   |
| Sem duplicar no bucket         | Código: caminho fixo, e só grava por cima com `--substituir`, e só se a foto difere                  | `enviar.mjs`                      |
| Foto publicada = foto aprovada | Código: compara o hash da URL pública                                                                | `conferir.mjs`                    |
| Direito de imagem              | **Revisão humana.** O código só faz um filtro inicial por tags, que não provam o que aparece na foto | `references/criterios-revisao.md` |
| Segredos                       | Regra e código: a chave vem do ambiente, e `saida/` fica fora do git                                 | `rules/secrets.md`, `.gitignore`  |

A divisão segue uma regra: o que dá para medir em um arquivo é código. O que exige olhar a foto é humano, e por isso o agente nunca aprova uma foto, só transcreve o que eu disse.

**Como o agente fica impedido de enviar para produção:**

- **No script:** `enviar.mjs --alvo producao` exige terminal interativo, que o agente não tem. Lê `SUPABASE_URL` e a chave só do processo, nunca de arquivo, e pede a digitação do ref do projeto.
- **No harness:** o hook nega ao agente o envio e a conferência com alvo de produção (`hooks/regras.mjs`, testado em `hooks/regras.test.mjs`).
- **Nas regras:** `rules/operacao.md` proíbe qualquer acesso ao Supabase remoto.
- **Limite:** o hook lê o texto do comando, e isso não é fronteira de segurança. A garantia principal é o script exigir terminal interativo e chave no processo.

**Fotos reprovadas: 112 no total, todas com motivo em `creditos.json`.**

- **Spec 003: 31 de 54 candidatas.** Quase todas por não mostrar o equipamento certo: sala, teclado, notebook no lugar de monitor.
- **O erro:** revisei só por esse critério. Seis das 12 fotos aprovadas descumpriam o requisito de direito de imagem:
  - TI-0004: mãos e pernas de uma pessoa;
  - TI-0006 e TI-0007: a maçã da Apple;
  - TI-0012: "FUJIFILM";
  - TI-0001: tela com conteúdo;
  - TI-0008: "HDMI" em relevo.
- **Quem achou:** as cinco primeiras, o agente da 004, pelos prints de produção; a TI-0008, o agente da 005.
- **Spec 005: mais 81 reprovadas, em 4 buscas, por pessoa, marca ou tela com conteúdo.**
  - Em cada folha, o chat de validação conferiu minhas escolhas contra o requisito antes da transcrição.
  - Câmera foi o caso mais difícil: quase toda foto de câmera mostra a marca.
- **Resultado:** 12 aprovadas e 7 reservas. Produção conferida por hash: 12 de 12 (`docs/specs/005-trocar-fotos/evidencias/imagens.txt`).

## 5. O subagente verificador

**Como é acionado:** por hooks, e não por instrução (`.claude/settings.json`).

- **`Stop`** (`hooks/exigir-verificacao.mjs`): não deixa o agente encerrar com as tarefas de uma spec concluídas e sem verificação.
- **Gate de status:** o Edit de `Status: PRONTA` é negado se a última rodada não aprovou o código atual (`hooks/regras.mjs:186`, `motivoNaoPronta`).
- **Gate de PR:**
  - o PR do back ou do front precisa de rodada `PRONTA` ou `PRONTA PARA PRODUÇÃO`;
  - o PR do agente precisa de `Status: PRONTA`.
- **Por quê:** o requisito diz que a verificação não pode depender de alguém lembrar de pedir. Uma instrução no `AGENTS.md` depende.

**O que ele lê e por quê** (`agents/verificador-spec.md:16-19`):

- **Arquivos:** `AGENTS.md`, as rules de restrições, checks e testes, e na pasta da spec o `spec.md`, o `plan.md`, o `tasks.md` e as evidências.
- **Por que ler em vez de herdar:** ele não herda a conversa. As decisões estão nesses arquivos, e um contexto limpo não absorve as justificativas do agente que escreveu o código.

**O que ele não consegue fazer:**

- **Sem escrita:** ele não tem Edit, Write nem NotebookEdit (`.claude/agents/verificador-spec.md:5`).
- **Bash limitado:** só `cd`, testes, build e git de leitura (`hooks/regras.mjs:63-69`).
- **Sem produção:** merge, workflow e `migrate deploy` estão negados no `settings.json` e no hook.
- **Sem contaminação:** a rodada é gravada pelo hook a partir da resposta dele, e ninguém escreve em `verificacoes/` à mão. O hook barra até comando que só cita a pasta junto com um redirecionamento.
- **Comparável:** o formato da resposta é fixo, com CAs em ordem, status de vocabulário fechado, hash do back e do front e modelo fixo. `node hooks/comparar-rodadas.mjs docs/specs/002-login/verificacoes 1 2` mostra duas rodadas lado a lado.

**Monolito ou back/front:**

- São três repositórios.
- Cada rodada grava o commit, a árvore e se o back e o front estavam limpos (`hooks/regras.mjs:89`, `estadoRepos`), e o verificador roda testes e build nos dois.
- Quando a spec toca a raiz, ele também verifica `skills/` e `hooks/`, rodando os testes de lá.
- **CA de produção:** só é provado por arquivo em `evidencias/`. Antes disso, o status é AGUARDA PRODUÇÃO, e o veredito é `PRONTA PARA PRODUÇÃO`, que libera os PRs de código. O `PRONTA` final só vem com as evidências.

## 6. O verificador em ação

**Histórico real:**

- **Nenhuma rodada de spec real reprovou.** Na 003, na 004 e na 005, a rodada 1 deu `PRONTA PARA PRODUÇÃO` e a rodada 2, depois das evidências, deu `PRONTA`.
- **Por que nenhuma reprovou:** os defeitos foram pegos antes, na revisão de spec e plano e nos testes de cada tarefa:
  - 003: `asset_tag` opcional;
  - 004: `_prisma_migrations` e o fuso do `due_at`;
  - 005: o fuso do `updated_at` e o formato 404 do Storage.
- **A única reprovação foi a da prova.** Nela apareceu um defeito do próprio mecanismo: uma execução reprovou o CA-04, mas não gerou arquivo de rodada, porque o agente entregou a resposta só pela ferramenta `SubagentHandback` e o hook lia só o texto final. A spec continuou bloqueada, então não houve aprovação falsa. Corrigi o hook para ler também a entrega e o transcript, sem duplicar (agente `ce8fdf9`).

**Prova com erro plantado (spec 002-login):**

- **O erro:** em `back/src/modules/auth/auth.guard.ts:42`, o guard responde 401 em vez de 403 para token válido sem acesso, quebrando o CA-04.
- **Commits:** plantado em back `af46491` e desfeito em back `43a325a`, que tem a mesma árvore da `main`. A branch é `prova-verificador`, nunca mergeada. O verificador não foi avisado do erro.
- **Rodadas:** gravadas em agente `3d4e780`.

| rodada | back                      | veredito   | CA-04                                                                                         |
| ------ | ------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| 1      | `2358293` (main)          | PRONTA     | ATENDIDO                                                                                      |
| 2      | `af46491` (erro plantado) | NÃO PRONTA | REPROVADO: `test_ca_04_token_sem_tenant_responde_403` recebe 401; causa em `auth.guard.ts:42` |
| 3      | `43a325a` (erro desfeito) | PRONTA     | ATENDIDO                                                                                      |

- **O que ele fez:** apontou o arquivo e a linha da causa e não corrigiu nada.
- **Gate ao vivo:** com a rodada 2 como a última, o Edit de `Status: PRONTA` foi bloqueado. Depois da rodada 3, foi liberado.
- **Limite da comparação:** status, veredito e hashes são comparáveis. O texto livre varia: a rodada 2 citou um item fora de escopo que as rodadas 1 e 3 não citaram.

**Tabela final da 003** (`docs/specs/003-dados-iniciais/verificacoes/rodada-2.md`, back `098ddbe`, veredito PRONTA):

| CA               | evidência                                                                               | status   |
| ---------------- | --------------------------------------------------------------------------------------- | -------- |
| CA-01            | `back/test/db/equipment-schema.db-spec.ts:28,47,58,65,77,85,96`                         | ATENDIDO |
| CA-02            | `back/test/db/seed-iniciais.db-spec.ts:30,45`; `back/test/dados-iniciais.spec.ts:30-68` | ATENDIDO |
| CA-03            | `back/test/db/seed-iniciais.db-spec.ts:59,70,92`; `back/test/seed-iniciais.spec.ts:12`  | ATENDIDO |
| CA-04            | `back/test/db/seed-iniciais.db-spec.ts:104`; `back/test/seed-iniciais.spec.ts:21,25`    | ATENDIDO |
| CA-05            | `back/test/seed-iniciais-alvo.spec.ts:47-151`; `hooks/regras.test.mjs:72,84,89,138,154` | ATENDIDO |
| CA-06            | `skills/imagens-equipamentos/scripts/enviar.test.mjs:29-186`                            | ATENDIDO |
| CA-07 (produção) | `evidencias/login.md`, `login.png`, `banco.txt`                                         | ATENDIDO |
| CA-08 (produção) | `evidencias/banco.txt`                                                                  | ATENDIDO |
| CA-09 (produção) | `evidencias/imagens.txt`                                                                | ATENDIDO |
| CA-10 (produção) | `evidencias/repeticao.txt`                                                              | ATENDIDO |

**Tabela final da 004** (`docs/specs/004-solicitar-emprestimo/verificacoes/rodada-2.md`, back `3b9296b`, front `41318bf`, veredito PRONTA):

| CA               | evidência                                                                                               | status   |
| ---------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| CA-01            | `back/test/db/loans-index.db-spec.ts:39,47,56`                                                          | ATENDIDO |
| CA-02            | `back/test/db/permissoes.db-spec.ts:112-227`                                                            | ATENDIDO |
| CA-03            | `back/test/db/permissoes.db-spec.ts:249-275`                                                            | ATENDIDO |
| CA-04            | `back/test/db/permissoes.db-spec.ts:288,301`                                                            | ATENDIDO |
| CA-05            | `back/test/db/equipment.db-spec.ts:133-262`                                                             | ATENDIDO |
| CA-06            | `back/test/db/equipment.db-spec.ts:271-325`                                                             | ATENDIDO |
| CA-07            | `front/src/pages/CatalogPage.test.tsx:105-197`; `front/src/app/login-flow.test.tsx:139`                 | ATENDIDO |
| CA-08            | `back/test/db/loans-create.db-spec.ts:114,145,168,249,517,530`                                          | ATENDIDO |
| CA-09            | `back/test/db/loans-create.db-spec.ts:286,295,306`                                                      | ATENDIDO |
| CA-10            | `back/test/db/loans-create.db-spec.ts:322-360`                                                          | ATENDIDO |
| CA-11            | `back/test/db/loans-create.db-spec.ts:371-418`                                                          | ATENDIDO |
| CA-12            | `back/test/db/loans-create.db-spec.ts:428-482`                                                          | ATENDIDO |
| CA-13            | `front/src/pages/CatalogRequest.test.tsx:121-317`                                                       | ATENDIDO |
| CA-14            | `back/test/db/loans-create.db-spec.ts:545-622`                                                          | ATENDIDO |
| CA-15            | `back/test/db/loans-me.db-spec.ts:104-292`                                                              | ATENDIDO |
| CA-16            | `front/src/pages/MyLoansPage.test.tsx:81-175`; `front/src/app/login-flow.test.tsx:172`                  | ATENDIDO |
| CA-17            | `back/test/limpar-emprestimos-alvo.spec.ts:51-73`; `back/test/db/limpar-emprestimos.db-spec.ts:105-241` | ATENDIDO |
| CA-18            | `back/test/limpar-emprestimos-alvo.spec.ts:101-145`; `hooks/regras.test.mjs:99,115,122`                 | ATENDIDO |
| CA-19            | `front/src/layout-doc.test.ts:14,18,25,30`                                                              | ATENDIDO |
| CA-20 (produção) | `evidencias/telas.md`, `catalogo-1.png` a `catalogo-3.png`                                              | ATENDIDO |
| CA-21 (produção) | `evidencias/telas.md`, `manutencao.png`                                                                 | ATENDIDO |
| CA-22 (produção) | `evidencias/telas.md`, `solicitar.png`, `meus-emprestimos.png`                                          | ATENDIDO |
| CA-23 (produção) | `evidencias/telas.md`, `limite.png`, `limpeza.txt`                                                      | ATENDIDO |
| CA-24 (produção) | `evidencias/permissoes.txt`                                                                             | ATENDIDO |
| CA-25 (produção) | `evidencias/limpeza.txt`                                                                                | ATENDIDO |

A 005 também terminou PRONTA, com CA-01 a CA-15 atendidos (`docs/specs/005-trocar-fotos/verificacoes/rodada-2.md`).

## 7. Uma regra sua que esta prática pôs à prova

**Regra:** `rules/restrictions.md` dizia: "Não escolha biblioteca que não esteja no ADR-001".

**O que aconteceu:**

- O briefing pediu `sharp`.
- Com a troca para o Pixabay, `sharp` passou a ser necessário para garantir 800×600.
- O ADR-001 descreve a stack da aplicação, e uma ferramenta de script local não cabe ali.
- A regra, do jeito que estava escrita, obrigava a editar o ADR-001 por uma decisão que não é da stack, ou a desobedecer.

**O que mudei:**

- A regra passou a dizer "que não esteja em `docs/adr/`" (agente `c328051`).
- A decisão ganhou o próprio ADR-003 (agente `18407da`).
- A regra continua impedindo dependência sem registro, mas sem misturar ferramenta de script com a stack.

**Mais duas que a prática pôs à prova:**

- **ADR-001 §9:** dizia que o Supabase ficava em `sa-east-1`, e o projeto de produção está em `us-west-2`. Corrigi o ADR (agente `649fda2`) e, na 005, o comentário do back que repetia o erro (back `711820d`).
- **`rules/operacao.md`:** proíbe o Supabase remoto mesmo para leitura. O chat de validação leu duas vezes o Storage público de produção, só com GET, para conferir fotos e cache, o que descumpre a regra. Está registrado na spec 005, e desde então quem lê produção sou eu, com o `conferir.mjs`, que o hook nega ao agente.

## 8. O que ficou de fora e o que faria diferente

**Ficou de fora:**

- **Devolução, tela de Operações, reserva futura, e-mail e renovação:** fora de escopo pelo briefing. Operações e Equipamentos continuam "Em construção".
- **Busca e filtros do catálogo:** o `layout.md` desenha, e o briefing não pede.
- **Rate limit do ADR-001 §10:** desvio consciente, registrado na spec 004.
- **Landing:** o enunciado fala em "landing", mas o sistema não tem uma. A entrada é o login, e não criei landing nesta prática.
- **Limites da spec 002**, apontados pelas rodadas do verificador:
  - o CA-01 testa a função do hook sem emitir token pelo Auth;
  - o CA-08 simula a sessão, sem recarregar a página de verdade.
- **Os hooks leem o texto do comando**, e isso não é fronteira de segurança. O bloqueio automático só existe em harness com hooks. Em outro, a gravação da rodada e o `checar-spec` são comandos manuais (`agents/` e `hooks/` são Node puro).

**O que faria diferente:**

- **Pôr o requisito de direito de imagem na própria folha de contato,** ao lado de cada foto. Revisei por "mostra o equipamento certo", e 6 fotos chegaram à produção descumprindo o enunciado. Corrigi na 005, mas custou 4 buscas e uma spec inteira.
- **Medir o ambiente antes de escrever o CA.** O formato 404 do Storage, o cache e a região do Supabase foram premissas que se mostraram erradas.
- **Escrever as mensagens para o agente na minha voz e com a autoria certa.** Duas vezes, testes do chat de validação entraram na spec como "teste do usuário", e a spec 004 ficou assim.
- **Testar a sessão sem histórico de verdade.** A ideia era ver se o repositório basta sozinho, mas na 005 o agente leu o handoff e o diário pelo `git show`.
- **Confiar no teste, não no "gravado".** Na 005, logo depois de gravar, a URL pública ainda entregava as fotos antigas. Só a conferência por hash mostrou que a troca tinha acontecido.
