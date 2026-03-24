# Apontamentos Artia com GitHub Pages + Vercel

## Arquitetura atual

- GitHub Pages: hospeda o front
- Vercel: expõe a API `api/artia-ids`
- Vercel: tambem pode atualizar o snapshot via `api/artia-ids-refresh`

O site continua lendo os IDs pela API da Vercel. A diferenca e que o snapshot agora fica dentro da propria stack da Vercel, sem GitHub Actions.

## Como funciona

1. o front chama `GET /api/artia-ids`
2. a API responde um snapshot rapido
3. o snapshot pode ser atualizado por `GET/POST /api/artia-ids-refresh`
4. quando a Vercel tem `BLOB_READ_WRITE_TOKEN`, esse snapshot fica persistido no Vercel Blob
5. sem Blob, o ambiente local usa `.cache/artia-ids.json`

## Endpoints

- [api/artia-ids.js](/Users/andre/Documents/apontamentos-artia-codex_v5/api/artia-ids.js)
  Le o snapshot persistido e responde rapido
- [api/artia-ids-refresh.js](/Users/andre/Documents/apontamentos-artia-codex_v5/api/artia-ids-refresh.js)
  Gera e grava um snapshot novo na Vercel

## Sources suportados no refresh

Voce escolhe com `ARTIA_IDS_SOURCE_MODE`:

- `bundled`
  Usa [data/artia-ids.json](/Users/andre/Documents/apontamentos-artia-codex_v5/data/artia-ids.json) como fonte inicial
- `db`
  Consulta o banco do Artia usando `ARTIA_DB_QUERY`
- `upstream`
  Consulta uma API upstream do Artia usando `ARTIA_UPSTREAM_URL`

## Variaveis importantes na Vercel

Obrigatorias para o site:

- `ARTIA_ALLOWED_ORIGINS`

Para proteger o refresh:

- `ARTIA_REFRESH_SECRET`

Para persistencia no Blob:

- `BLOB_READ_WRITE_TOKEN`
- `ARTIA_SNAPSHOT_BLOB_PATH` opcional

Para refresh via banco:

- `ARTIA_IDS_SOURCE_MODE=db`
- `ARTIA_DB_HOST`
- `ARTIA_DB_PORT`
- `ARTIA_DB_USER`
- `ARTIA_DB_PASSWORD`
- `ARTIA_DB_NAME`
- `ARTIA_DB_QUERY`

Para refresh via API upstream:

- `ARTIA_IDS_SOURCE_MODE=upstream`
- `ARTIA_UPSTREAM_URL`
- `ARTIA_API_KEY` opcional

## Observacao importante sobre o banco do Artia

Foi testado localmente que as views `organization_9115_activities` e `organization_9115_activities_v2` continuam lentas demais para uso online. Por isso o backend agora separa:

- leitura rapida do snapshot em `GET /api/artia-ids`
- refresh controlado em `GET/POST /api/artia-ids-refresh`

Se voce quiser refresh real direto do banco, o ideal e definir uma `ARTIA_DB_QUERY` mais eficiente do que a view padrao.

## Teste local

1. copie [.env.local.example](/Users/andre/Documents/apontamentos-artia-codex_v5/.env.local.example) para `.env.local`
2. rode `npm run dev:local`
3. abra `http://localhost:3000`
4. teste:
   - `GET http://localhost:3000/api/artia-ids?limit=5`
   - `POST http://localhost:3000/api/artia-ids-refresh?secret=SEU_SEGREDO`

## Scripts disponiveis

- `npm run build:ids-snapshot`
  Gera snapshot a partir do XLSX local
- `npm run build:ids-snapshot:db`
  Gera snapshot a partir do banco do Artia
- `npm run dev:local`
  Sobe o servidor local
