# Apontamentos Artia com GitHub Pages + Vercel

## Arquitetura atual

- GitHub Pages: hospeda o front
- Vercel: expõe `api/artia-ids`
- GitHub Actions: atualiza `data/artia-ids.json` automaticamente a cada hora

O site nao consulta mais o banco do Artia em tempo real na abertura da pagina. Ele le um snapshot rapido em JSON.

## Por que essa estrategia

Foi testado localmente que a consulta direta nas views de atividades do banco do Artia demora mais de 60 segundos ate com `LIMIT 5`, entao a API online nao ficava viavel para uso em tempo real.

A solucao gratuita e estavel foi:

1. um workflow agendado do GitHub Actions gera o snapshot
2. o workflow salva `data/artia-ids.json` no repositorio
3. o GitHub Pages e a Vercel passam a servir esse snapshot ja pronto

## Workflow automatico

Arquivo:

- [.github/workflows/update-artia-snapshot.yml](/Users/andre/Documents/apontamentos-artia-codex_v5/.github/workflows/update-artia-snapshot.yml)

Ele roda:

- de hora em hora
- manualmente via `workflow_dispatch`

## Secrets que voce precisa criar no GitHub

No repositorio, em `Settings > Secrets and variables > Actions`, crie:

- `ARTIA_DB_HOST`
- `ARTIA_DB_PORT`
- `ARTIA_DB_USER`
- `ARTIA_DB_PASSWORD`
- `ARTIA_DB_NAME`

Opcionais:

- `ARTIA_DB_SSL`
- `ARTIA_ORGANIZATION_ID`
- `ARTIA_DB_ACTIVITIES_TABLE`
- `ARTIA_DB_PROJECTS_TABLE`
- `ARTIA_DB_QUERY`
- `ARTIA_DB_QUERY_TIMEOUT_MS`

## Como o snapshot e gerado

Script:

- [scripts/build-artia-ids-from-db.js](/Users/andre/Documents/apontamentos-artia-codex_v5/scripts/build-artia-ids-from-db.js)

Ele:

- conecta no banco do Artia
- executa a query configurada
- normaliza para `project`, `projectLabel`, `activity`, `id`
- salva em:

- [data/artia-ids.json](/Users/andre/Documents/apontamentos-artia-codex_v5/data/artia-ids.json)

## API usada pelo site

Arquivo:

- [api/artia-ids.js](/Users/andre/Documents/apontamentos-artia-codex_v5/api/artia-ids.js)

Ela so le o snapshot e responde rapido.

## Scripts disponiveis

- `npm run build:ids-snapshot`
  Gera snapshot a partir do XLSX local
- `npm run build:ids-snapshot:db`
  Gera snapshot a partir do banco do Artia
- `npm run dev:local`
  Sobe o servidor local

## Validacao local que foi feita

Com o snapshot em JSON:

- `GET /api/artia-ids?limit=5`: ~125 ms
- `GET /api/artia-ids`: ~232 ms
- total: 62.899 IDs

## Observacoes importantes

- O horario do `schedule` do GitHub Actions usa UTC
- O GitHub permite workflows agendados com intervalo minimo de 5 minutos
- Em repositorio publico, workflows agendados podem ser desativados apos 60 dias sem atividade

## Proximo passo

Depois de subir esses arquivos, basta:

1. configurar os secrets do GitHub
2. abrir a aba `Actions`
3. rodar `Update Artia Snapshot` manualmente uma vez
4. confirmar que `data/artia-ids.json` foi atualizado
5. testar a pagina
