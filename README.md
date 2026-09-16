# BookBusiness

MVP multiempresa do BookBusiness, uma plataforma B2B para centralizar a operação comercial e operacional de shows.

## Requisitos

- Node.js 22.13 ou superior

## Executar localmente

```bash
npm install
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000`.

### Credenciais locais

O repositório não contém senha padrão. Defina as credenciais locais no arquivo
`.env.local`, que não é versionado:

```env
BOOKSTAGE_LOCAL_ADMIN_EMAIL=admin@bookstage.local
BOOKSTAGE_LOCAL_ADMIN_PASSWORD=uma-senha-segura
BOOKSTAGE_LOCAL_TEAM_PASSWORD=outra-senha-segura
BOOKSTAGE_ENABLE_LOCAL_SEED=true
```

Use `.env.example` como referência. Arquivos `.env` reais não devem ser versionados.
O seed local só é executado quando `BOOKSTAGE_ENABLE_LOCAL_SEED=true`, possui
senha configurada explicitamente e nunca é executado em produção. As contas já
existentes no banco local não são recriadas nem têm suas senhas substituídas.

## Autenticação

O ambiente local usa autenticação própria por e-mail e senha:

- senha derivada com PBKDF2-SHA256 e salt individual;
- sessão persistida no D1/SQLite;
- somente o hash do token de sessão é armazenado;
- cookie `HttpOnly`, `SameSite=Strict` e com expiração de sete dias;
- logout revoga a sessão no banco;
- troca de senha revoga as outras sessões e cria uma nova sessão para o dispositivo atual;
- contas sem membership ativa em uma organização ativa não autenticam;
- tentativas inválidas são limitadas por identidade e e-mail;
- APIs continuam validando usuário e membership no servidor.

## Banco de dados

Entre as principais tabelas estão:

- `users`
- `organizations`
- `memberships`
- `auth_credentials`
- `sessions`
- `artists`
- `artist_sales_assignments`
- `calendar_entries`
- `customers`
- `commercial_requests`
- `opportunities`
- `opportunity_activities`
- `proposals`
- `contracts`
- `shows`
- `payments`
- `commissions`

As migrations ficam em `drizzle/`.

## Equipe comercial dos artistas

Cada artista pode ter um responsável comercial principal e múltiplos comerciais autorizados. As atribuições usam chaves estrangeiras compostas com `organization_id`, impedindo relacionamentos entre tenants também no banco. OWNER e MANAGER gerenciam atribuições; SALES visualiza somente artistas aos quais está atribuído.

O helper `getArtistPrimaryCommercial` resolve o validador interno que será herdado pelas solicitações e oportunidades do artista.

## Agenda central

A agenda mensal atende a visão geral e a visão por artista, com filtros por artista e status. `CONFIRMED` e `BLOCKED` são protegidos contra sobreposição tanto na API quanto por triggers do SQLite. `AVAILABLE`, `INQUIRY` e `OPTION` podem coexistir; ausência de bloqueio também representa disponibilidade.

## Booking, catálogo e solicitações

Cada organização ativa possui uma vitrine em `/catalogo/<slug-da-organizacao>`. Artistas ativos aparecem somente quando marcados como públicos e recebem uma página própria. As rotas públicas usam DTOs explícitos e a agenda é convertida apenas em `Disponível`, `Consultar disponibilidade` ou `Indisponível`, sem notas ou status operacionais.

Colaboradores de Booking recebem acesso explícito a artistas de uma ou mais organizações e podem compartilhar links comerciais opacos. O CTA público identifica o artista, a organização e a origem do link, criando uma `commercial_request` isolada no tenant.

A caixa interna **Solicitações recebidas** permite aceitar, recusar e converter a entrada em uma oportunidade. A conversão é idempotente, preserva o Booking como originador e atribui o comercial principal do artista como validador. O CRM acompanha a oportunidade no Kanban e em lista, com histórico, propostas e integrações operacionais já implementadas.

O contexto multiempresa é selecionado após o login e validado novamente nas APIs. Trocar a organização ativa atualiza menus e dados sem utilizar o tenant anterior como fonte implícita.

## Validação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
