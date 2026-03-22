# Apontamentos Artia com GitHub Pages + Vercel

## Visao geral

Este projeto continua sendo um site estatico em `index.html`, publicado no GitHub Pages.

A integracao segura com o Artia agora fica separada:

- GitHub Pages: entrega a interface do site.
- Vercel: executa a funcao serverless em `api/artia-ids.js`.
- Artia API: recebe a chamada da Vercel com a chave guardada em variaveis de ambiente.

Assim, a chave nao vai para o navegador nem para o HTML publicado.

## Fluxo da arquitetura

1. O usuario abre o site no GitHub Pages.
2. O front chama a URL da Vercel configurada no meta `artia-proxy-url`.
3. A funcao `api/artia-ids.js` usa a chave guardada na Vercel para consultar o Artia.
4. A Vercel devolve apenas um JSON normalizado com `project`, `projectLabel`, `activity` e `id`.
5. O site salva essa base no IndexedDB e reaproveita o mesmo fluxo ja usado pela planilha XLSX.

Se a API nao estiver configurada ou falhar, o site ainda pode cair no XLSX local como fallback.

## Arquivos importantes

- `index.html`: interface, logica principal e sincronizacao da base de IDs.
- `api/artia-ids.js`: proxy serverless da Vercel para o Artia.
- `base_dados_id_artia_no_client.xlsx`: fallback local opcional.

## O que mudou no front

- Foi adicionado o meta `<meta name="artia-proxy-url" content="" />`.
- Foi adicionado o botao `Atualizar IDs via API`, mostrado apenas quando a URL da Vercel esta configurada.
- No carregamento inicial, o site tenta sincronizar pela API protegida.
- A resposta da Vercel entra no mesmo indice de IDs ja usado pelo modo XLSX.

## Como configurar no GitHub Pages

Edite o `index.html` e preencha o meta com a URL da sua funcao:

```html
<meta name="artia-proxy-url" content="https://seu-projeto.vercel.app/api/artia-ids" />
```

Depois publique normalmente no GitHub Pages.

## Como testar em localhost

Foi adicionado um servidor local simples em `local-dev-server.js`, sem dependencias externas.

1. Copie `.env.local.example` para `.env.local`.
2. Preencha a URL real do Artia, a chave e os campos de mapeamento.
3. Rode `npm run dev:local`.
4. Abra `http://localhost:3000`.

Em localhost, o front usa `/api/artia-ids` automaticamente, mesmo se o meta `artia-proxy-url` estiver vazio.

## Como configurar na Vercel

Crie um projeto na Vercel apontando para este repositorio. Como o projeto e estatico + `api/`, normalmente nao precisa build custom.

Configure estas variaveis de ambiente:

- `ARTIA_UPSTREAM_URL`: endpoint real da API do Artia que retorna os IDs.
- `ARTIA_API_KEY`: chave da API do Artia.
- `ARTIA_ALLOWED_ORIGINS`: origem do seu GitHub Pages, por exemplo `https://andre.github.io`.

Campos de mapeamento da resposta:

- `ARTIA_DATA_PATH`: caminho ate o array na resposta, por exemplo `data.items`.
- `ARTIA_PROJECT_FIELD`: campo do projeto, por exemplo `project.id`.
- `ARTIA_PROJECT_LABEL_FIELD`: campo do nome do projeto, por exemplo `project.name`.
- `ARTIA_ACTIVITY_FIELD`: campo do nome da atividade, por exemplo `name`.
- `ARTIA_ID_FIELD`: campo do ID da atividade, por exemplo `id`.

Opcionais:

- `ARTIA_API_KEY_HEADER`: nome do header da chave. Padrao: `Authorization`.
- `ARTIA_API_KEY_PREFIX`: prefixo do header. Padrao: `Bearer`.
- `ARTIA_EXTRA_HEADERS_JSON`: headers extras em JSON.
- `ARTIA_FORWARD_QUERY_PARAMS`: query params que a Vercel deve repassar ao upstream.

## Formato esperado pelo front

A funcao da Vercel devolve este formato:

```json
{
  "rows": [
    {
      "project": "1360",
      "projectLabel": "Cliente X",
      "activity": "Reuniao",
      "id": "R01"
    }
  ],
  "meta": {
    "count": 1,
    "fetchedAt": "2026-03-22T12:00:00.000Z",
    "sourceName": "Artia API via Vercel",
    "sourceEndpoint": "https://api.exemplo.com/atividades"
  }
}
```

## Observacoes de seguranca

- A chave do Artia fica apenas na Vercel.
- O navegador nunca recebe a chave.
- `ARTIA_ALLOWED_ORIGINS` ajuda a limitar chamadas do seu dominio.
- Isso protege a chave, mas nao substitui autenticacao forte se voce quiser restringir totalmente o uso publico do endpoint.

## Publicacao sugerida

1. Suba este repositorio no GitHub.
2. Ative o GitHub Pages para servir o `index.html`.
3. Conecte o mesmo repositorio na Vercel.
4. Configure as variaveis de ambiente.
5. Publique.
6. Cole a URL da Vercel no meta `artia-proxy-url`.
7. Abra o site e teste o botao `Atualizar IDs via API`.
