# Auditoria técnica do BookStage — 11/09/2026

## Resumo executivo

O checkout local foi revisado de ponta a ponta em autenticação, autorização, multiempresa, artistas, Booking, agenda, CRM, propostas, contratos, shows, financeiro, assets públicos, interface, migrations, scripts de transferência e CI. Os achados críticos e altos que podiam ser corrigidos com segurança no código local foram tratados e cobertos por testes.

O sistema está **pronto para a rodada de validação local assistida**, mas ainda está **NÃO PRONTO PARA PILOTO EXTERNO**. Antes de publicar dados reais é obrigatório ensaiar a transferência D1/R2 em um ambiente descartável e definir um transporte que preserve `customMetadata`. O script atual falha de forma segura antes de qualquer mutação remota quando essa garantia não existe.

Nenhum commit, push ou deploy foi realizado nesta rodada.

## Correções de segurança e isolamento

- O guard central agora rejeita organizações inativas, mesmo quando uma sessão antiga ainda possui cookie de organização ativa.
- A listagem de solicitações comerciais usa o papel da organização ativa. Booking visualiza apenas solicitações próprias e de artistas atualmente autorizados; SALES respeita as atribuições comerciais.
- Respostas da agenda e de conflitos não entregam ao Booking `status`, notas internas, identificadores ou títulos privados de outros eventos.
- Prefixos de estado gravados historicamente no título (`Opção`, `Consulta`, `Show confirmado` e `Bloqueio`) são removidos no backend antes da resposta ao Booking.
- O dashboard do Booking deixou de reexpor listas de OPTION/BLOCKED e alertas de expiração internos.
- Booking continua podendo alterar ou remover somente eventos criados por ele; eventos ligados ao CRM continuam protegidos pelo fluxo da oportunidade.
- URLs diretas de propostas e contratos exigem organização ativa, acesso atual ao artista e acesso à oportunidade.
- O Owner de uma organização não pode mais alterar o nome global de outro usuário e afetar os demais tenants.
- Assets de artista e branding são servidos somente por tokens opacos, metadados válidos, organização ativa e referência atual no banco. Arquivos deixam de ser acessíveis após desvinculação, respeitado o cache curto.
- Inputs de login agora validam tipos e limites antes de qualquer operação com string.
- Todas as mutações examinadas mantêm proteção de origem; downloads privados continuam autorizados e com headers de sandbox/nosniff.

## Correções de integridade

- Alterar o cachê de uma oportunidade invalida aprovações pendentes/aprovadas relacionadas, impede fechar na mesma requisição e recalcula comissões estimadas percentuais elegíveis.
- Valores não podem ser alterados depois do fechamento e comissões pagas/aprovadas bloqueiam alterações incompatíveis.
- Os efeitos de `CLOSED_WON` executam somente na transição real, evitando reconfirmar agenda ou recriar Show após edições repetidas.
- Proposta vencida não pode ser aceita silenciosamente.
- Datas e horários operacionais usam `America/Sao_Paulo`; o intervalo padrão da negociação é 18h–23h local, persistido em UTC sem mudar o dia operacional.
- A consulta local do D1 retornou `integrity_check=ok`, nenhum erro de chave estrangeira, nenhum Show duplicado por oportunidade e nenhuma Opportunity órfã de artista.

## Correções de qualidade e experiência

- Chamadas dos principais módulos migraram para o helper HTTP seguro, que trata 204, body vazio, JSON, texto e erros 4xx/5xx sem gerar `Unexpected end of JSON input`.
- A troca de organização foi consolidada para impedir estado parcial e busca duplicada de artistas.
- O CRM passou de um corte silencioso de 250 itens para paginação de 100 itens com total e carregamento incremental.
- Navegação e permissões visuais foram centralizadas por capability/papel; PRODUCTION não recebe CRM/Contratos e Equipe fica restrita a OWNER/MANAGER.
- Os botões da navegação compacta receberam nomes acessíveis.
- O item enganoso `Financeiro — Em breve` foi removido; o financeiro existente continua acessível dentro de oportunidades e Shows conforme a permissão.
- “Novos leads” foi renomeado para “Novas oportunidades” e Shows cancelados deixaram de compor o indicador de fechados.
- As imagens públicas preservam a ordem `coverUrl → photoUrl → fallback`, rejeitam caminhos locais e mantêm proporção/enquadramento dos cards.
- Workflows agora preservam bookmarks de rollback como artefatos temporários.

## Testes e validações executados

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm test`: 5 testes JavaScript + 176 testes TypeScript aprovados (181 no total).
- `npm run build`: aprovado.
- `npm run migrations:check`: 24 migrations íntegras, sem migration destrutiva nova.
- D1 local: integridade e chaves estrangeiras aprovadas; ausência de Shows duplicados e Opportunity órfã verificada.
- HTTP sem sessão: rotas internas críticas retornaram 401.
- Troca de tenant por ID/URL: artista e oportunidade de outra organização retornaram 404.
- Matriz local de perfis: OWNER, SALES, BOOKING_AGENT, PRODUCTION e FINANCE validada nas rotas principais.
- Validação visual: login, seleção de organização, dashboard responsivo Light/Dark, Booking, agenda, CRM e catálogo público.
- Agenda real como Booking: título sem estado interno; modal sem status/notas internas; edição disponível apenas no registro próprio.
- Console do navegador nas rotas revisadas: sem erros ou warnings.

## Riscos e pendências antes do piloto externo

1. **Transferência R2:** a ferramenta via Wrangler usada atualmente não restaura `customMetadata`. O import foi bloqueado preventivamente; é necessário implementar/selecionar transporte compatível e ensaiar exportação, importação e rollback em staging descartável.
2. **Marca oficial:** não existe no repositório um SVG/PNG final do monograma BookStage informado pelo produto. Os placeholders `B` não foram substituídos para evitar redesenhar a marca por CSS contra a especificação. É preciso fornecer os assets oficiais horizontal e símbolo.
3. **Conta e recuperação:** ainda não há recuperação de senha por e-mail, troca de senha pelo próprio usuário nem encerramento global de sessões. Isso exige definir provedor de e-mail e política de recuperação antes de usuários externos reais.
4. **Teste de segurança ponta a ponta:** a cobertura melhorou com regras e SQL real, mas é recomendado adicionar uma suíte HTTP/E2E isolada com duas empresas, todos os perfis, uploads/downloads e concorrência antes de produção.
5. **URLs internas:** telas operacionais ainda usam estado do shell em parte da navegação; deep links de detalhes podem ser evoluídos depois, sem impacto no isolamento atual.

## Checklist para a próxima etapa

- Validar localmente os fluxos OWNER, SALES, Booking, PRODUCTION e FINANCE com os dados de teste.
- Fornecer os assets oficiais BookStage.
- Definir e testar transporte R2 com preservação de metadados.
- Implementar política de senha/recuperação e revogação global de sessões.
- Rodar a suíte novamente no commit candidato.
- Ensaiar backup, importação e rollback em staging vazio.
- Repetir teste de acesso cruzado e download privado no ambiente publicado.
- Somente depois promover a primeira empresa piloto.
