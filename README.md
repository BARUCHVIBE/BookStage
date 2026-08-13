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
```

Use `.env.example` como referência. Arquivos `.env` reais não devem ser versionados.

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

As migrations ficam em `drizzle/`.

## Validação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
