# Apontamentos Artia com GitHub Pages + Vercel

## Como ficou

- GitHub Pages: entrega o front em `index.html`
- Vercel: entrega a rota `api/artia-ids`
- Fonte atual da API: snapshot JSON gerado do arquivo `base_dados_id_artia_no_client.xlsx`

## Por que mudou

O acesso direto ao banco do Artia foi testado localmente e a view de atividades levou mais de 60 segundos mesmo com `LIMIT 5`, o que torna a carga online inviavel.

Para deixar o site funcionando de forma confiavel, a API da Vercel agora serve um snapshot rapido em `data/artia-ids.json`.

## Como atualizar a base

Quando o arquivo `base_dados_id_artia_no_client.xlsx` mudar, rode:

```bash
npm run build:ids-snapshot
```

Isso gera ou atualiza:

```text
data/artia-ids.json
```

Depois suba o commit no GitHub e redeploye a Vercel.

## Teste local

```bash
npm install
npm run build:ids-snapshot
npm run dev:local
```

Abra:

- `http://localhost:3000`
- `http://localhost:3000/api/artia-ids?limit=5`

## Resultado validado localmente

- `GET /api/artia-ids?limit=5`: respondeu em ~125 ms
- `GET /api/artia-ids`: respondeu em ~232 ms
- total carregado: 62.899 IDs

## Arquivos principais

- [index.html](/Users/andre/Documents/apontamentos-artia-codex_v5/index.html#L10)
- [api/artia-ids.js](/Users/andre/Documents/apontamentos-artia-codex_v5/api/artia-ids.js#L1)
- [scripts/build-artia-ids-snapshot.js](/Users/andre/Documents/apontamentos-artia-codex_v5/scripts/build-artia-ids-snapshot.js#L1)
- [data/artia-ids.json](/Users/andre/Documents/apontamentos-artia-codex_v5/data/artia-ids.json)
