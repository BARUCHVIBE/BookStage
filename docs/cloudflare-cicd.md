# BookStage — CI/CD e migração de dados

## Ambientes

| Ambiente | Worker | D1 | R2 | Dados |
| --- | --- | --- | --- | --- |
| Local | Vinext/Miniflare | estado em `.wrangler/state` | estado em `.wrangler/state` | desenvolvimento |
| Staging | `bookstage-staging` | `bookstage-staging-v2` | `bookstage-staging-files` | continuação controlada dos testes locais |
| Production | `bookstage-production` | `bookstage-production` | `bookstage-production-files` | vazio até aprovação de go-live |

Os bindings lógicos da aplicação permanecem `DB` e `FILES`. `ASSETS` e `IMAGES`
são fornecidos pelo build Vinext/Cloudflare. O arquivo `.openai/hosting.json`
continua contendo somente o projeto e os bindings lógicos.

## Quality gate

Pull requests e pushes para `main` executam, nesta ordem:

1. verificação de imutabilidade e segurança das migrations;
2. typecheck;
3. lint;
4. testes;
5. build.

Somente um push para `main` aprovado pelo gate segue para staging. Production
usa workflow manual, exige a palavra `PRODUCTION` e a aprovação do environment
protegido `production` no GitHub.

Configure os seguintes secrets nos environments `staging` e `production`:

- `CLOUDFLARE_API_TOKEN`: token limitado à conta e aos Workers, D1 e R2 necessários;
- `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare.

Nunca use o token OAuth local do Wrangler como secret e nunca grave tokens no Git.

## Migração inicial local → staging

O snapshot preserva IDs, hashes de senha e relações. Ele exclui sessões,
tentativas de login e rate limits temporários.

```bash
npm run staging:data:export
npm run staging:data:import
npm run staging:data:import:confirmed
npm run staging:data:validate
```

`staging:data:import` executa somente a verificação e é bloqueado sem confirmação.
O comando explícito `staging:data:import:confirmed` aplica as migrations, cria
um backup remoto e exige que o D1 de destino esteja vazio.
Depois envia os objetos R2, importa o D1 e compara as contagens. O diretório
inteiro é ignorado pelo Git porque contém dados privados.

A migração inicial usa blue/green: o D1 anterior `bookstage-staging`
(`bab69395-cfaa-48f7-bf71-c79cd1ad3914`) permanece preservado, enquanto o
binding de staging aponta para o D1 validado `bookstage-staging-v2`. Isso evita
uma substituição parcial e permite rollback imediato do binding.

O import é propositalmente limitado ao environment `staging`. Não há comando
automático que copie esse snapshot para production.

## Arquivos

O export inventaria todos os objetos locais do bucket e verifica se cada chave
R2 referenciada no D1 possui bytes correspondentes. Uploads usam chaves opacas e
são aditivos. URLs HTTP externas de artistas aparecem no `manifest.json` como
risco separado; elas não são apresentadas como objetos R2 migrados.

## Migrations

Arquivos de migration já revisados são imutáveis e possuem SHA-256 em
`ops/migrations-lock.json`. Uma alteração histórica ou uma nova migration com
`DROP TABLE`, `DROP COLUMN`, `DELETE FROM`, `TRUNCATE` ou desativação de foreign
keys bloqueia o CI.

Antes de cada migration remota, o workflow registra o bookmark corrente do D1
Time Travel nos logs da execução. Para uma migration de production que exija
reconstrução ou remoção de dados, o fluxo automático deve permanecer bloqueado:
revisar SQL, obter bookmark/export adicional, ensaiar em cópia de staging e
somente então atualizar explicitamente o lock em revisão separada.

O Vinext gera uma configuração redirecionada sem os environments originais.
Por isso `scripts/prepare-deploy-configs.mjs` materializa configurações de deploy
separadas após o build. Os scripts `deploy:staging` e `deploy:production` usam
essas configurações e impedem que um deploy herde acidentalmente o binding base.

## Rollback

Código e banco são tratados separadamente:

- Worker: usar o rollback de deployment/version do Cloudflare;
- D1: restaurar o export SQL criado antes da operação ou usar D1 Time Travel;
- R2: uploads do processo inicial são aditivos e não removem versões existentes.

Nunca tente corrigir uma migration parcialmente aplicada editando o arquivo já
publicado. Crie uma migration corretiva nova.

## Primeiro go-live

Production começa vazio. Antes de importar qualquer dado, gerar um inventário
por organização contendo usuários, artistas, documentos e indicação de dado
real versus teste. A importação para production depende de aprovação explícita
desse inventário e de um backup do D1 de destino.
