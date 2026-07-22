# Voz do Paciente

Sistema para criação, publicação e análise de pesquisas de satisfação em um hospital com múltiplas unidades e setores.

## Funcionalidades atuais

- painel responsivo com indicadores reais de satisfação, respostas, pesquisas e alertas;
- resultados filtráveis por período, pesquisa e setor;
- gráficos de volume, distribuição de notas e ranking de setores;
- exportação CSV protegida pelo escopo de acesso do usuário e registrada na auditoria;
- consulta individual das respostas, com filtros de período, pesquisa e setor;
- identificação do paciente oculta por padrão e revelação restrita a perfis autorizados;
- auditoria automática de cada acesso aos dados pessoais de uma resposta;
- painel de auditoria exclusivo do administrador, com filtros e paginação;
- criação, edição e publicação posterior de rascunhos;
- pausa, retomada e encerramento de publicações;
- novas versões sem apagar respostas anteriores, com substituição segura dos QR Codes;
- perguntas de estrelas, NPS, sim/não, escolha única ou múltipla e texto;
- seleção de vários setores e QR Code individual para cada ponto de publicação;
- biblioteca compartilhada para clonar e adaptar perguntas de outros setores;
- formulário público responsivo, sem login, para acesso pelo QR Code;
- pesquisas anônimas, com identificação opcional ou obrigatória;
- criptografia AES-256-GCM dos dados de identificação;
- bloqueio configurável de respostas repetidas por aparelho, sem armazenar o IP bruto;
- alertas automáticos para avaliações abaixo do limite definido pelo gerente;
- PostgreSQL com migrações versionadas;
- autenticação por e-mail e senha com sessões armazenadas no banco;
- senhas protegidas com `scrypt` e comparação resistente a ataques de temporização;
- bloqueio de login por 15 minutos após cinco falhas;
- perfis de administrador, gerente de unidade, gerente de setor e analista;
- isolamento dos dados conforme unidade ou setor;
- cadastro de usuários pelo administrador;
- Docker para instalação no Debian.

O ambiente local pode usar `AUTH_DEMO_MODE=true` quando não houver um PostgreSQL ativo. Esse modo é automaticamente recusado em produção.

## Preparação do banco

1. Copie `.env.example` para `.env`.
2. Substitua todas as senhas e chaves de exemplo.
3. Inicie somente o PostgreSQL:

```bash
docker compose up -d db
```

4. Aplique as migrações e crie a estrutura inicial:

```bash
npm run db:migrate
npm run db:seed
```

O seed cria o Hospital principal, as unidades Urgência e Cendor, seus setores e o primeiro administrador definido nas variáveis `INITIAL_ADMIN_*`.

## Desenvolvimento

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

A aplicação fica disponível em `http://localhost:3000`.

Com o servidor e o PostgreSQL ativos, execute as validações integradas:

```bash
npm run test:e2e
npm run test:lifecycle
npm run test:responses
npm run test:audit
```

Os testes criam dados temporários, validam os fluxos completos e removem os registros de teste ao terminar.

## Implantação

Para montar os contêineres:

```bash
docker compose up -d --build
```

Em produção, mantenha `AUTH_DEMO_MODE=false`. A aplicação deverá ficar atrás de um proxy HTTPS. Como os pacientes usarão a internet móvel, `PUBLIC_SURVEY_HOST` precisa ser um endereço público acessível externamente; o painel administrativo pode continuar restrito à rede interna. O PostgreSQL é publicado somente no endereço local do servidor e nunca diretamente na internet.
