# Apontamentos Artia - Arquitetura e Funcionamento

## 1. Visão geral

Este projeto é uma aplicação web **single-page** (SPA) feita majoritariamente em um único arquivo principal: `index.html`.

Objetivo do sistema:

- registrar apontamentos de horas por dia/horário;
- editar, mover e redimensionar eventos no calendário semanal;
- visualizar os mesmos dados em Tabela, Gantt, Gráficos e Diretório de IDs;
- importar/exportar dados (XLSX/CSV);
- manter dados locais no navegador (offline-first com persistência);
- consultar IDs do Artia por uma API protegida hospedada na Vercel, sem expor credenciais no front.

## 2. Arquitetura atual

Hoje o projeto está dividido em duas camadas:

- **Front-end**: site estático servido pelo GitHub Pages ou pela própria Vercel
- **Back-end leve**: funções serverless da Vercel para leitura/refresh da base de IDs do Artia

Fluxo resumido:

1. o navegador carrega `index.html`;
2. os eventos e preferências vêm do armazenamento local do browser;
3. a base de IDs é carregada do IndexedDB local, quando existir;
4. em paralelo, o front pode sincronizar a base pela rota `GET /api/artia-ids`;
5. a Vercel responde um snapshot rápido e sanitizado, sem expor `projectLabel` ao cliente;
6. quando necessário, o snapshot pode ser regenerado por um endpoint protegido de refresh.

## 3. Stack técnica

- **UI + lógica**: HTML, CSS e JavaScript vanilla (sem framework)
- **Gráficos**: [Chart.js](https://cdn.jsdelivr.net/npm/chart.js) via CDN
- **Presença online**: Firebase Realtime Database (SDK modular no cliente)
- **Persistência local principal**: IndexedDB
- **Persistência auxiliar**: localStorage
- **Leitura/escrita XLSX e importação CSV**: implementação própria no JS para importação/exportação no front
- **Servidor local**: Node.js simples em `local-dev-server.js`
- **Funções serverless**: Vercel Functions em `api/`
- **Banco Artia**: MySQL via `mysql2`
- **Persistência opcional de snapshot na Vercel**: `@vercel/blob`

## 4. Estrutura de alto nível

### 4.1 Arquivos principais

- `index.html`: interface, estilos e toda a lógica do app
- `api/artia-ids.js`: endpoint público de leitura da base de IDs
- `api/artia-ids-refresh.js`: endpoint protegido para regenerar o snapshot
- `lib/artia-snapshot-store.js`: camada de persistência do snapshot
- `lib/artia-snapshot-sources.js`: fontes de geração do snapshot (`bundled`, `db`, `upstream`)
- `data/artia-ids.json`: snapshot versionado de fallback, sanitizado
- `scripts/build-artia-ids-snapshot.js`: gera snapshot a partir de XLSX local
- `scripts/build-artia-ids-from-db.js`: gera snapshot a partir do banco do Artia
- `local-dev-server.js`: servidor local para testes de front + API
- `.env.local.example`: exemplo de configuração local

### 4.2 Blocos principais de interface

- **Header/topbar**: navegação de visões, ações globais, exportação, sincronização e configurações
- **Views**:
  - Calendário (`#calendarView`)
  - Tabela (`#tableView`)
  - Gantt (`#ganttView`)
  - Gráficos (`#chartsView`)
  - Diretório (`#directoryView`)
- **Modais**:
  - ajuda (`#helpBackdrop`)
  - arredondamento de horários (`#roundingBackdrop`)
  - evento (criar/editar) (`#modalBackdrop`)
  - importação XLSX/CSV (`#importConfigBackdrop`)

### 4.3 Guia didático do `index.html`

O `index.html` é grande porque ele concentra, no mesmo arquivo, três coisas que em projetos maiores normalmente ficam separadas:

- **HTML**: a estrutura visual da tela, botões, tabelas, modais e campos
- **CSS**: as cores, tamanhos, espaçamentos, responsividade e aparência
- **JavaScript**: as regras do sistema, cliques, salvamento, importação, exportação e renderização das visões

As linhas abaixo são aproximadas. Se alguém adicionar ou remover conteúdo antes de uma seção, os números mudam, mas a ordem geral continua a mesma.

```text
index.html
|-- <head>                                      # linhas 1-32
|   |-- título, metadados, favicon e descrição do site
|
|-- <style>                                     # linhas 33-3564
|   |-- :root                                  # variáveis de tema, cores e tamanhos
|   |-- tema claro                             # ajustes quando <html class="light">
|   |-- topbar/header                          # barra superior, botões e menus
|   |-- calendário                             # grade semanal, horários, eventos e seleção
|   |-- tabela                                 # layout da visão Tabela
|   |-- gantt                                  # layout da visão Gantt
|   |-- gráficos                               # cards e área dos canvas Chart.js
|   |-- diretório                              # consulta da base de IDs
|   |-- modais                                 # ajuda, evento, importação e arredondamento
|   |-- responsivo                             # ajustes para telas menores
|
|-- <body>                                      # a partir da linha 3565
|   |-- script Firebase/presença online        # linhas 3566-3696
|   |   |-- conecta no Firebase
|   |   |-- registra sessão online
|   |   |-- atualiza o contador "online"
|   |
|   |-- <header class="topbar">                # linhas 3698-3874
|   |   |-- logo/nome "Exxata Apontamentos"
|   |   |-- campo de e-mail para exportação CSV
|   |   |-- menu Exportar CSV
|   |   |-- botão de tema claro/escuro
|   |   |-- menu de configurações
|   |   |-- botões de visão: Calendário, Tabela, Gantt, Gráficos, Diretório
|   |   |-- botões de backup, sincronização e importação
|   |   |-- navegação de semana: anterior, hoje, próxima
|   |   |-- status da base de IDs e último salvamento
|   |
|   |-- badge de usuários online               # linhas 3876-3878
|   |
|   |-- <main class="app appMain">             # linhas 3880-4008
|   |   |-- #calendarView                       # grade semanal principal
|   |   |-- #directoryView                      # diretório de IDs Artia
|   |   |-- #tableView                          # tabela de apontamentos
|   |   |-- #ganttView                          # resumo semanal por projeto
|   |   |-- #chartsView                         # gráficos por período/projeto
|   |
|   |-- modais HTML                            # linhas 4010-4403
|   |   |-- #helpBackdrop                       # modal "Como usar o site"
|   |   |-- #importUploadBackdrop               # primeira tela da importação
|   |   |-- #importConfigBackdrop               # escolha de aba/cabeçalhos da planilha
|   |   |-- #roundingBackdrop                   # configuração de horários quebrados
|   |   |-- #modalBackdrop                      # modal de criar/editar apontamento
|   |
|   |-- Chart.js via CDN                        # linha 4406
|   |
|   |-- <script> principal                      # linhas 4407-10962
|       |-- constantes e configurações gerais
|       |-- IndexedDB e backup XLSX
|       |-- funções de data, horário e texto
|       |-- estado principal (`state`)
|       |-- renderização do calendário
|       |-- renderização da Tabela, Gantt, Gráficos e Diretório
|       |-- seleção por arraste na grade
|       |-- modal de evento
|       |-- exportação CSV
|       |-- navegação entre visões e semanas
|       |-- importação da base de IDs Artia
|       |-- importação de apontamentos XLSX/CSV
|       |-- autoteste (`?selftest=1`)
|       |-- inicialização (`init()`)
```

#### 4.3.1 Como ler o arquivo sem se perder

Uma forma simples de entender o arquivo é seguir esta ordem:

1. **Comece pelo HTML visível**, nas linhas do `<header>`, `<main>` e dos modais.
   Ali ficam os elementos que aparecem na tela. Procure por `id="..."`, porque esses IDs são usados depois pelo JavaScript.

2. **Depois veja o `state`**, perto da linha 5365.
   Ele é a "memória atual" do sistema: semana aberta, eventos, visão ativa, evento em edição e base de IDs carregada.

3. **Depois leia o `renderAll()`**, perto da linha 7451.
   Essa função decide qual visão aparece na tela e chama as funções de desenho corretas.

4. **Por fim, leia os eventos de clique**, principalmente a partir da linha 8628 e depois da linha 9085.
   Esses trechos conectam botões e campos da tela com as funções do sistema.

#### 4.3.2 Mapa do JavaScript principal

```text
<script> principal
|-- Configurações e URLs da API                 # linhas 4408-4435
|   |-- chaves de localStorage
|   |-- URL da API Vercel de IDs Artia
|   |-- arquivos candidatos para base local
|
|-- IndexedDB + Backup XLSX                     # linhas 4436-5117
|   |-- openDB(), kvGet(), kvSet()
|   |-- loadEventsFromDB(), saveEventsToDB()
|   |-- geração de XLSX sem biblioteca externa
|   |-- seleção do destino de backup
|
|-- Utilitários gerais                          # linhas 5118-5299
|   |-- datas, horários e durações
|   |-- formatação pt-BR
|   |-- limpeza de texto e escape de HTML
|   |-- normalização de código de projeto
|   |-- montagem do índice de IDs Artia
|
|-- Dados iniciais e estado                     # linhas 5301-5476
|   |-- ACTIVITY_NAMES
|   |-- EXAMPLE_EVENTS
|   |-- state
|   |-- salvar/carregar eventos
|   |-- carregar/salvar base de IDs
|
|-- Elementos da tela                           # linhas 5471-5546
|   |-- document.getElementById(...)
|   |-- guarda referências para botões, filtros e views
|
|-- Calendário                                  # linhas 5548-6343
|   |-- renderHeader()
|   |-- renderGrid()
|   |-- renderEvents()
|   |-- linha do horário atual
|   |-- mover/redimensionar eventos
|
|-- Tabela                                      # linhas 6344-6509
|   |-- renderTable()
|   |-- filtros por período, projeto, atividade e lançamento
|   |-- ordenação por coluna
|
|-- Gantt                                       # linhas 6510-6718
|   |-- renderGantt()
|   |-- soma horas por projeto e por dia da semana
|
|-- Gráficos                                    # linhas 6719-7310
|   |-- Chart.js
|   |-- filtros por período/projeto
|   |-- horas por projeto e horas ao longo do tempo
|
|-- Diretório de IDs                            # linhas 7318-7450
|   |-- renderDirectory()
|   |-- lista projetos e atividades da base Artia
|
|-- Renderização geral                          # linhas 7451-7536
|   |-- renderAll()
|   |-- mostra/esconde views conforme state.view
|
|-- Arraste em área vazia                       # linhas 7537-7639
|   |-- cria seleção no calendário
|   |-- abre modal de novo apontamento
|
|-- Modais e apontamentos                       # linhas 7640-8843
|   |-- abrir/fechar modal
|   |-- preencher campos
|   |-- buscar ID automaticamente
|   |-- salvar, editar e apagar evento
|   |-- ditado de observação
|
|-- Exportação CSV e navegação                  # linhas 8844-9250
|   |-- exportar tudo
|   |-- exportar tabela filtrada
|   |-- trocar semana
|   |-- trocar visão
|   |-- alternar tema
|
|-- Base de IDs Artia                           # linhas 9262-9482
|   |-- importar XLSX da base
|   |-- sincronizar IDs via API
|   |-- salvar índice local
|
|-- Importar apontamentos XLSX/CSV              # linhas 9483-10552
|   |-- ler planilha
|   |-- escolher aba
|   |-- mapear cabeçalhos
|   |-- transformar linhas em eventos
|   |-- mesclar ou substituir eventos existentes
|
|-- Autoteste                                   # linhas 10553-10838
|   |-- roda quando a URL tem ?selftest=1
|   |-- valida renderização e regras principais
|
|-- Inicialização                               # linhas 10839-10875
|   |-- init()
|   |-- monta horários
|   |-- carrega eventos salvos
|   |-- registra handlers
|   |-- renderiza a tela
|   |-- sincroniza base de IDs em segundo plano
|
|-- Local de trabalho no modal                  # linhas 10894-10962
|   |-- botões Escritorio, Casa e Cliente
|   |-- prefixo automático na observação
```

#### 4.3.3 Onde mexer para tarefas comuns

- **Mudar texto de um botão ou label**: procure o texto no HTML, normalmente entre as linhas 3698 e 4403.
- **Mudar cor, tamanho ou espaçamento**: procure a classe no `<style>`, entre as linhas 33 e 3564.
- **Mudar o comportamento de um botão**: procure o `id` do botão e depois procure `addEventListener` com esse mesmo ID.
- **Mudar campos do modal de apontamento**: comece em `#modalBackdrop` no HTML e depois veja as funções perto de `openCreateModalFromSelection()`, `openEditModal()` e `onSave()`.
- **Mudar regras de horário**: veja `CONFIG`, `parseTypedTimeToMinutes()`, `formatTimeFromMinutes()` e as funções de sobreposição.
- **Mudar filtros da Tabela**: veja `renderTable()`, `getFilteredTableEvents()` e `ensureTableFilterOptions()`.
- **Mudar gráficos**: veja `computeChartData()` e `updateCharts()`.
- **Mudar importação de planilhas**: veja `IMPORT_FIELD_DEFS`, `findHeaderMapping()`, `buildEventsFromRows()` e `prepareActivityImportFile()`.
- **Mudar salvamento local**: veja `openDB()`, `loadEventsFromDB()` e `saveEventsToDB()`.
- **Mudar o que acontece ao abrir o site**: veja `init()`.

#### 4.3.4 Palavras-chave úteis para buscar

Use `Ctrl + F` no editor ou `rg` no terminal:

```bash
rg -n "function renderAll|async function init|let state|btnViewCalendar|modalBackdrop|renderTable|renderGantt|updateCharts" index.html
```

Atalho mental:

- `render...` geralmente desenha algo na tela
- `open...` geralmente abre modal ou arquivo
- `close...` geralmente fecha modal
- `load...` geralmente carrega dados
- `save...` geralmente salva dados
- `parse...` geralmente transforma texto/planilha em dados
- `build...` geralmente monta uma estrutura nova
- `ensure...` geralmente garante que algo exista ou esteja atualizado

## 5. Modelo de dados

### 5.1 Estado principal em memória

O objeto `state` controla o runtime:

- `weekStart`: início da semana ativa
- `events`: lista de eventos
- `selection`: seleção atual no calendário
- `editingEventId`: evento em edição
- `selectedEventId`: evento selecionado
- `idBaseIndex` / `idBaseMeta`: índice local da base de IDs
- `view`: visão ativa (`calendar`, `table`, `gantt`, `charts`, `directory`)

### 5.2 Evento

Cada evento possui, em geral:

- `id`
- `start` e `end` (ISO datetime)
- `day` (ISO date)
- `project`
- `activityLabel`
- `activityId`
- `notes`
- `artiaLaunched` (boolean)

## 6. Persistência

### 6.1 IndexedDB

Banco: `artia_offline_db_v1`

Object stores:

- `events`
- `kv`

Dados importantes em `kv`:

- base de IDs: índice e metadados salvos localmente
- handles de backup: `backupDirectoryHandle`, `backupFileHandle`, `backupFolderName`
- e-mail de exportação e outros metadados

### 6.2 localStorage

Usado para preferências rápidas:

- tema
- filtros de período da Tabela e dos Gráficos
- clipboard de campos do modal
- preferência de arredondamento / horários quebrados

### 6.3 Snapshot de IDs na Vercel

O back-end trabalha com um snapshot da base de IDs:

- leitura pública em `GET /api/artia-ids`
- refresh protegido em `GET/POST /api/artia-ids-refresh`

Persistência possível:

- **Vercel Blob**, quando `BLOB_READ_WRITE_TOKEN` estiver configurado
- **arquivo temporário local** em `/tmp/artia-ids.json` na Vercel
- **fallback versionado** em `data/artia-ids.json`

Observação:

- o snapshot público enviado ao navegador não inclui `projectLabel`
- isso evita expor nomes de clientes pela API pública

## 7. Fluxo de inicialização

No `init()`:

1. monta os combos de horário;
2. aplica preferência de arredondamento / horários quebrados;
3. carrega eventos salvos do IndexedDB;
4. registra handlers globais;
5. renderiza a interface imediatamente;
6. em segundo plano, tenta carregar/sincronizar a base de IDs.

Importante:

- o calendário não fica mais bloqueado esperando a sincronização da base de IDs;
- a tela abre primeiro, e a base sincroniza depois.

## 8. Fluxo da base de IDs

### 8.1 No front-end

O front pode obter a base de três formas:

- base salva localmente no IndexedDB;
- upload manual de um XLSX pelo menu de configurações;
- sincronização pela API da Vercel.

### 8.2 Na API da Vercel

`GET /api/artia-ids`:

- lê o snapshot persistido;
- tenta renovar automaticamente se o snapshot estiver velho ou vier da fonte errada;
- responde apenas com:
  - `project`
  - `activity`
  - `id`

`GET/POST /api/artia-ids-refresh`:

- regenera o snapshot explicitamente;
- exige segredo quando `ARTIA_REFRESH_SECRET` estiver configurado.

### 8.3 Fontes suportadas

A fonte é escolhida por `ARTIA_IDS_SOURCE_MODE`:

- `bundled`
  - usa `data/artia-ids.json`
- `db`
  - consulta o banco do Artia via MySQL
- `upstream`
  - consulta uma API upstream do Artia

### 8.4 Regras práticas já implementadas

- a API pública está sanitizada e não expõe `projectLabel`
- o front suporta códigos de projeto numéricos, alfanuméricos e com ponto
  - exemplos: `0072`, `SP0001`, `C1358`, `21.10`, `21.1`
- o contador de IDs no front usa separador de milhar em `pt-BR`
- o botão de sincronização da API é um ícone de nuvem
- o carregamento manual de XLSX foi movido para o menu de configurações

## 9. Importação/Exportação

### 9.1 Importar base de IDs manualmente

Ação: `Carregar IDs Artia (XLSX)` no menu de configurações

Formato esperado:

- Coluna A: atividade
- Coluna B: ID
- Coluna C: projeto + descrição

O parser:

- remove pseudo-atividades
- normaliza chaves por projeto + atividade
- salva índice e metadados no IndexedDB

### 9.2 Importar apontamentos

Botão: `Importar Apontamentos (XLSX/CSV)`

Fluxo:

- lê as abas disponíveis do XLSX ou cria uma aba virtual para CSV
- permite escolher aba e cabeçalho
- cria eventos no formato interno
- permite substituir tudo ou mesclar

### 9.3 Exportar CSV

Botão: `Exportar CSV`

- delimitador `;`
- compatível com Excel pt-BR
- inclui e-mail configurado e colunas derivadas

### 9.4 Backup XLSX

- `Salvar XLSX`: gera backup imediatamente
- `Definir Local de Salvamento`: vincula pasta/arquivo
- fallback para download quando a File System Access API não estiver disponível

## 10. Funcionalidades de calendário e regras de negócio

- seleção por arraste em slots vazios para criar evento
- hint visual com início/fim e duração
- validação para evitar sobreposição no mesmo dia
- drag-and-drop para mover evento
- resize pelas bordas superior/inferior
- clique único seleciona evento, segundo clique abre modal
- arredondamento por step ou horários quebrados livres
- fim do dia exibido como `23:59` na interface
- internamente o fim do dia continua sendo tratado como fechamento correto do dia
- preenchimento automático de ID quando projeto + atividade batem com a base carregada

## 11. Views e responsabilidade de cada uma

- **Calendário**: operação principal de criação e edição
- **Tabela**: auditoria, ordenação, filtros e edição por linha
- **Gantt**: consolidado semanal por projeto e por dia
- **Gráficos**: leitura analítica por período/projeto
- **Diretório**: consulta da base de IDs por projeto/atividade

### 11.1 Filtros da Tabela

A visão Tabela possui:

- filtro de data inicial
- filtro de data final
- filtro por projeto
- filtro por atividade
- filtro por lançamento no Artia:
  - `Todos`
  - `Lançados`
  - `Não lançados`

Os combos de projeto e atividade são abastecidos a partir do intervalo da própria Tabela, e não da semana ativa do calendário.

## 12. Presença online (Firebase)

Existe um bloco separado de script para presença:

- gera `sessionId` por aba
- envia heartbeat periódico
- mantém a sessão no RTDB
- marca `offline` no disconnect
- exibe contador de usuários online no badge

Observação:

- as credenciais do Firebase ficam no cliente por design do modelo web com RTDB
- para produção, as regras do Firebase devem permanecer restritas

## 13. API da Vercel

### 13.1 Endpoint público

Arquivo: `api/artia-ids.js`

Funções:

- aplicar CORS por origem permitida
- ler snapshot existente
- renovar snapshot automaticamente quando necessário
- devolver somente os campos públicos da base

Parâmetros:

- `limit`
  - opcional
  - limita o número de linhas retornadas

### 13.2 Endpoint protegido de refresh

Arquivo: `api/artia-ids-refresh.js`

Funções:

- regenerar o snapshot manualmente
- gravar o snapshot no storage configurado

Métodos:

- `GET`
- `POST`

Autorização:

- via `Authorization: Bearer ...`
- ou `X-Artia-Refresh-Secret`
- ou `?secret=...`

### 13.3 Camadas auxiliares

`lib/artia-snapshot-store.js`:

- lê/escreve no Blob quando disponível
- usa `/tmp/artia-ids.json` na Vercel
- usa `.cache/artia-ids.json` em ambiente local
- usa `data/artia-ids.json` como fallback

`lib/artia-snapshot-sources.js`:

- gera snapshot a partir do arquivo bundled
- gera snapshot a partir do banco
- gera snapshot a partir de API upstream
- normaliza, ordena e remove duplicados

## 14. Variáveis de ambiente

### 14.1 Essenciais

- `ARTIA_ALLOWED_ORIGINS`
- `ARTIA_IDS_SOURCE_MODE`

### 14.2 Para proteger o refresh

- `ARTIA_REFRESH_SECRET`

### 14.3 Para persistência no Vercel Blob

- `BLOB_READ_WRITE_TOKEN`
- `ARTIA_SNAPSHOT_BLOB_PATH` opcional

### 14.4 Para refresh via banco

- `ARTIA_DB_HOST`
- `ARTIA_DB_PORT`
- `ARTIA_DB_USER`
- `ARTIA_DB_PASSWORD`
- `ARTIA_DB_NAME`

Opcionais:

- `ARTIA_DB_QUERY_MODE`
  - `custom`
  - `time_entries`
  - vazio para usar a query padrão
- `ARTIA_DB_QUERY`
- `ARTIA_DB_CONNECT_TIMEOUT_MS`
- `ARTIA_DB_QUERY_TIMEOUT_MS`
- `ARTIA_DB_SSL`
- `ARTIA_ORGANIZATION_ID`
- `ARTIA_DB_ACTIVITIES_TABLE`
- `ARTIA_DB_TIME_ENTRIES_TABLE`

### 14.5 Para refresh via API upstream

- `ARTIA_UPSTREAM_URL`
- `ARTIA_API_KEY`
- `ARTIA_AUTH_HEADER`
- `ARTIA_AUTH_SCHEME`
- `ARTIA_DATA_PATH`
- `ARTIA_PROJECT_FIELD`
- `ARTIA_PROJECT_LABEL_FIELD`
- `ARTIA_ACTIVITY_FIELD`
- `ARTIA_ID_FIELD`
- `ARTIA_UPSTREAM_TIMEOUT_MS`

### 14.6 Para estratégia de renovação

- `ARTIA_SNAPSHOT_TTL_MS`

## 15. Publicação

### 15.1 Front no GitHub Pages

1. publicar `index.html` e assets no GitHub Pages
2. configurar a meta `artia-proxy-url` apontando para a Vercel, se necessário
3. validar carregamento do app, presença e sincronização dos IDs

### 15.2 Back-end na Vercel

1. conectar a branch `api`
2. configurar variáveis de ambiente
3. garantir `ARTIA_ALLOWED_ORIGINS`
4. fazer deploy
5. testar:
   - `GET /api/artia-ids`
   - `GET /api/artia-ids?limit=5`

### 15.3 Observações importantes

- CORS não protege a URL pública por si só; apenas controla chamadas entre origens no navegador
- por isso a API pública devolve só os campos mínimos
- o segredo do Artia continua no back-end e não vai para o navegador

## 16. Teste local

1. copiar `.env.local.example` para `.env.local`
2. ajustar as variáveis necessárias
3. rodar:

```bash
npm install
npm run dev:local
```

4. abrir:

- `http://localhost:3000`
- `http://localhost:3000/api/artia-ids?limit=5`

### 16.1 Scripts disponíveis

- `npm run dev:local`
  - sobe o servidor local
- `npm run build:ids-snapshot`
  - gera snapshot a partir do XLSX local
- `npm run build:ids-snapshot:db`
  - gera snapshot a partir do banco do Artia

## 17. Segurança e cuidados antes de tornar público

- não versionar segredos reais em `.env.local`
- manter `ARTIA_REFRESH_SECRET` configurado na Vercel
- evitar publicar snapshots reais com `projectLabel`
- lembrar que o histórico Git antigo também pode conter artefatos sensíveis, mesmo que o estado atual esteja limpo

## 18. Pontos de manutenção recomendados

- separar `index.html` em módulos quando o escopo crescer
- ampliar testes automatizados além do `selftest`
- documentar melhor o contrato das planilhas importadas
- revisar periodicamente o payload público da API para manter apenas o mínimo necessário

## 19. Modo de autoteste

A aplicação possui um fluxo interno de autoteste acionado por query string:

- `?selftest=1`

Ele executa verificações de renderização e regras principais e marca PASS/FAIL no título da página.
