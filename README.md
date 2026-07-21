# Voz do Paciente

Sistema para criação, publicação e análise de pesquisas de satisfação em um hospital com múltiplas unidades e setores.

## Funcionalidades atuais

- painel responsivo com indicadores e alertas demonstrativos;
- gestão visual de pesquisas e construtor de perguntas;
- seleção de vários setores para uma mesma publicação;
- clonagem demonstrativa de perguntas da biblioteca;
- formulário público responsivo para acesso por QR Code;
- PostgreSQL com migrações versionadas;
- autenticação por e-mail e senha com sessões armazenadas no banco;
- senhas protegidas com `scrypt` e comparação resistente a ataques de temporização;
- bloqueio de login por 15 minutos após cinco falhas;
- perfis de administrador, gerente de unidade, gerente de setor e analista;
- isolamento inicial dos dados conforme unidade ou setor;
- cadastro real de usuários pelo administrador;
- dados pessoais de respostas preparados para armazenamento criptografado;
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

## Implantação

Para montar os contêineres:

```bash
docker compose up -d --build
```

Em produção, mantenha `AUTH_DEMO_MODE=false`. A aplicação deverá ficar atrás de um proxy HTTPS. O formulário público e o painel administrativo devem usar endereços e regras de acesso separados. O PostgreSQL é publicado somente no endereço local do servidor e nunca diretamente na internet.
