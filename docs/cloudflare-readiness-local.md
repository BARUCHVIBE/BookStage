# Preparação local para Cloudflare

Última revisão local: 14/09/2026.

## Estado validado

- D1 local com 24 migrations aplicadas e nenhuma pendente.
- `PRAGMA integrity_check`: `ok`.
- Violações de foreign key: `0`.
- Snapshot criado em `.bookstage-migration/snapshots/` (diretório ignorado pelo Git).
- Sessões e tabelas de rate limit não são exportadas.
- Hashes de credenciais são preservados no snapshot; senhas em texto puro não são exportadas.
- 11 objetos encontrados no R2 local: 8 referenciados e 3 órfãos.
- Configurações separadas para staging e production são geradas em `dist/deploy/`.

## Bloqueadores antes de importar staging

- Após o teste de upload do Bragadok, restam 14 referências persistidas a imagens
  externas, correspondendo a 11 URLs únicas. A validação correta com `GET`
  parcial encontrou 7 URLs disponíveis e 4 indisponíveis. A verificação anterior
  por `HEAD` foi descartada porque os CDNs do Discord podem recusar esse método
  mesmo quando entregam a imagem normalmente.
- BG RJ, DJ Marcio Fantasia e Maridão 70 usam `media.discordapp.net` e suas fotos
  e capas responderam HTTP 206 com `image/webp` na revisão atual. Ainda são
  dependências externas e devem ser copiadas para o R2 antes da migração
  definitiva.
- Os três objetos R2 órfãos precisam de revisão humana antes de qualquer remoção.
- O asset oficial da marca BookStage ainda não existe em `public/brand/`.

## Segurança do transporte de arquivos

As rotas públicas resolvem a autorização pela referência tenant-safe armazenada
no D1. Isso permite restaurar objetos por `wrangler r2 object put`, que preserva o
conteúdo e `content-type`, mesmo sem transportar `customMetadata`.

Novas referências internas continuam exigindo que os metadados R2 correspondam
à organização e ao tipo do arquivo. Uma referência já persistida no próprio
tenant pode ser mantida após a importação.

## Próxima validação

1. Reenviar imagens quebradas dos artistas.
2. Gerar novo snapshot com `npm run staging:data:export`.
3. Confirmar zero URLs externas indisponíveis e zero chaves R2 ausentes.
4. Revisar os objetos órfãos sem removê-los automaticamente.
5. Somente após autorização explícita, aplicar migrations e importar em staging.
