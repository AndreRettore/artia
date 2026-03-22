# Apontamentos Artia com GitHub Pages + Vercel

## Visao geral

Este projeto continua com o front estatico no GitHub Pages, mas agora a carga da base de IDs pode vir de uma funcao serverless da Vercel que consulta diretamente o banco do Artia.

- GitHub Pages: entrega o `index.html`
- Vercel: executa `api/artia-ids.js`
- Banco Artia MySQL: fornece projetos e atividades

A senha do banco fica apenas nas variaveis de ambiente da Vercel.

## URL usada pelo site

O front chama a URL configurada em [index.html](/Users/andre/Documents/apontamentos-artia-codex_v5/index.html#L10):

```html
<meta name="artia-proxy-url" content="https://seu-projeto.vercel.app/api/artia-ids" />
```

## O que a funcao faz

A funcao [api/artia-ids.js](/Users/andre/Documents/apontamentos-artia-codex_v5/api/artia-ids.js#L1):

- conecta no MySQL do Artia com `ARTIA_DB_*`
- detecta a organizacao a partir do usuario `cliente-9115`
- consulta `organization_9115_projects` e `organization_9115_activities`
- devolve JSON no formato:

```json
{
  "rows": [
    {
      "project": "1360",
      "projectLabel": "1360 - Cliente X",
      "activity": "Reuniao",
      "id": "123456"
    }
  ]
}
```

## Variaveis da Vercel

Obrigatorias:

- `ARTIA_DB_HOST`
- `ARTIA_DB_PORT`
- `ARTIA_DB_USER`
- `ARTIA_DB_PASSWORD`
- `ARTIA_DB_NAME`
- `ARTIA_ALLOWED_ORIGINS`

Exemplo de `ARTIA_ALLOWED_ORIGINS`:

```txt
http://localhost:3000,https://SEU-USUARIO.github.io
```

Opcionais:

- `ARTIA_ORGANIZATION_ID`
- `ARTIA_DB_PROJECTS_TABLE`
- `ARTIA_DB_ACTIVITIES_TABLE`
- `ARTIA_DB_QUERY`

Se usar `ARTIA_DB_QUERY`, o SQL precisa retornar estas colunas com alias:

- `project`
- `projectLabel`
- `activity`
- `id`

## Teste local

1. Copie `.env.local.example` para `.env.local`
2. Preencha a senha real em `ARTIA_DB_PASSWORD`
3. Rode `npm run dev:local`
4. Abra `http://localhost:3000`

Em localhost, o front usa `/api/artia-ids` automaticamente.

## Deploy

1. Suba o codigo no GitHub
2. Garanta que a Vercel esteja apontando para esse branch
3. Configure as variaveis `ARTIA_DB_*`
4. Faça um novo deploy
5. Teste `https://seu-projeto.vercel.app/api/artia-ids`

Se a rota responder JSON, o site do GitHub Pages ja consegue consumir a base com a senha protegida.
