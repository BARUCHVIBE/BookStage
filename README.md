# BookStage

Fundação multiempresa do BookStage, uma plataforma B2B para centralizar a operação comercial e operacional de shows.

## Requisitos

- Node.js 22.13 ou superior

## Executar localmente

```bash
npm install
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000`.

### Credenciais locais padrão

- E-mail: `admin@bookstage.local`
- Senha: `BookStage@2026`

As credenciais podem ser substituídas pelas variáveis abaixo:

```env
BOOKSTAGE_LOCAL_ADMIN_EMAIL=admin@bookstage.local
BOOKSTAGE_LOCAL_ADMIN_PASSWORD=uma-senha-segura
BOOKSTAGE_ENABLE_LOCAL_SEED=true
```

Use `.env.example` como referência. Arquivos `.env` reais não devem ser versionados.
O seed local só é executado quando `BOOKSTAGE_ENABLE_LOCAL_SEED=true` e nunca em produção.

## Autenticação

O ambiente local usa autenticação própria por e-mail e senha:

- senha derivada com PBKDF2-SHA256 e salt individual;
- sessão persistida no D1/SQLite;
- somente o hash do token de sessão é armazenado;
- cookie `HttpOnly`, `SameSite=Strict` e com expiração de sete dias;
- logout revoga a sessão no banco;
- APIs continuam validando usuário e membership no servidor.

## Banco de dados

Principais tabelas:

- `users`
- `organizations`
- `memberships`
- `auth_credentials`
- `sessions`
- `artists`
- `artist_sales_assignments`
- `calendar_entries`

As migrations ficam em `drizzle/`.

## Equipe comercial dos artistas

Cada artista pode ter um responsável comercial principal e múltiplos comerciais autorizados. As atribuições usam chaves estrangeiras compostas com `organization_id`, impedindo relacionamentos entre tenants também no banco. OWNER e MANAGER gerenciam atribuições; SALES visualiza somente artistas aos quais está atribuído.

O helper `getArtistPrimaryCommercial` mantém preparada a consulta tenant-safe que poderá ser usada por oportunidades futuras, sem implementar CRM neste módulo.

## Agenda central

A agenda mensal atende a visão geral e a visão por artista, com filtros por artista e status. `CONFIRMED` e `BLOCKED` são protegidos contra sobreposição tanto na API quanto por triggers do SQLite. `AVAILABLE`, `INQUIRY` e `OPTION` podem coexistir; ausência de bloqueio também representa disponibilidade.

## Catálogo público

Cada organização ativa possui uma vitrine em `/catalogo/<slug-da-organizacao>`. Artistas ativos aparecem somente quando marcados como públicos e recebem uma página própria. As rotas públicas usam DTOs explícitos e a agenda é convertida apenas em `Disponível`, `Consultar disponibilidade` ou `Indisponível`, sem notas ou status operacionais.

O CTA público cria ou reutiliza um `Customer` no tenant, registra uma `booking_request` com origem `PUBLIC_CATALOG` e atribui o responsável comercial principal do artista. A caixa interna `Solicitações` permite acompanhar essas entradas até a implementação do CRM.

## Validação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
