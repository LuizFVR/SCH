# Voz do Paciente

Sistema para criação, publicação e análise de pesquisas de satisfação em um hospital com múltiplas unidades e setores.

## Funcionalidades atuais

- painel responsivo com indicadores;
- criação de rascunhos e publicação transacional de pesquisas;
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

O ambiente local usa `AUTH_DEMO_MODE=true` em `.env.local` porque não há um servidor PostgreSQL ativo nesta máquina. Esse modo é automaticamente recusado em produção.

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

Para validar o fluxo completo com o servidor de desenvolvimento e o PostgreSQL ativos:

```bash
npm run test:e2e
```

Esse teste cria dados temporários, valida login, publicação, QR Code, resposta, criptografia, bloqueio de duplicidade e alerta, e remove os registros de teste ao terminar.

## Implantação

Para montar os contêineres:

```bash
docker compose up -d --build
```

Em produção, mantenha `AUTH_DEMO_MODE=false`. A aplicação deverá ficar atrás de um proxy HTTPS. Como os pacientes usarão a internet móvel, `PUBLIC_SURVEY_HOST` precisa ser um endereço público acessível externamente; o painel administrativo pode continuar restrito à rede interna. O PostgreSQL é publicado somente no endereço local do servidor e nunca diretamente na internet.
