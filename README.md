# Apontamentos Artia - Arquitetura e Funcionamento

## 1. Visao geral

Este projeto e uma aplicacao web **single-page** (SPA) feita em um unico arquivo principal: `index.html`.

Objetivo do sistema:

- registrar apontamentos de horas por dia/horario;
- editar, mover e redimensionar eventos no calendario semanal;
- visualizar os mesmos dados em Tabela, Gantt, Graficos e Diretorio de IDs;
- importar/exportar dados (XLSX/CSV);
- manter dados locais no navegador (offline-first com persistencia).

## 2. Stack tecnica

- **UI + logica**: HTML, CSS e JavaScript vanilla (sem framework).
- **Graficos**: [Chart.js](https://cdn.jsdelivr.net/npm/chart.js) via CDN.
- **Presenca online**: Firebase Realtime Database (SDK modular via `script type="module"`).
- **Persistencia local principal**: IndexedDB.
- **Persistencia auxiliar**: localStorage (preferencias e filtros).
- **Leitura/escrita XLSX**: implementacao propria no JS (parser XML + ZIP store writer), sem libs externas de XLSX.
- **Backup local em arquivo**: File System Access API (`showDirectoryPicker` / `showSaveFilePicker`) com fallback para download.

## 3. Estrutura de alto nivel

### 3.1 Arquivos do repositorio

- `index.html`: interface, estilos e toda a logica da aplicacao.
- `base_dados_id_artia_no_client.xlsx`: base padrao de IDs usada no carregamento automatico inicial.
- `favicon-exxata-clock-red.svg`: favicon.

### 3.2 Blocos principais de interface

- **Header/topbar**: navegacao de visoes, filtros globais, botoes de import/export e configuracoes.
- **Views**:
  - Calendario (`#calendarView`)
  - Tabela (`#tableView`)
  - Gantt (`#ganttView`)
  - Graficos (`#chartsView`)
  - Diretorio (`#directoryView`)
- **Modais**:
  - ajuda (`#helpBackdrop`)
  - arredondamento de horarios (`#roundingBackdrop`)
  - evento (criar/editar) (`#modalBackdrop`)

## 4. Modelo de dados

### 4.1 Estado principal em memoria

O objeto `state` controla o runtime:

- `weekStart`: inicio da semana ativa;
- `events`: lista de eventos;
- `selection`: selecao atual no calendario;
- `editingEventId`: evento em edicao;
- `selectedEventId`: evento selecionado (1 clique seleciona, 2 abre);
- `idBaseIndex` / `idBaseMeta`: base de IDs carregada;
- `view`: visao ativa (`calendar`, `table`, `gantt`, `charts`, `directory`).

### 4.2 Evento

Cada evento possui, em geral:

- `id`
- `start` e `end` (ISO datetime)
- `day` (ISO date)
- `project`
- `activityLabel`
- `activityId`
- `notes`
- `artiaLaunched` (boolean)

## 5. Persistencia

## 5.1 IndexedDB

Banco: `artia_offline_db_v1`

Object stores:

- `events` (eventos salvos)
- `kv` (chave-valor para configuracoes e metadados)

Dados importantes em `kv`:

- base de IDs: `LS_IDBASE_KEY`, `LS_IDBASE_META_KEY`
- handles de backup: `backupDirectoryHandle`, `backupFileHandle`, `backupFolderName`
- email de exportacao e outros metadados

## 5.2 localStorage

Usado para preferencias rapidas:

- tema (`theme`)
- filtros de periodo (Tabela/Graficos)
- clipboard de campos do modal
- preferencia de horario quebrado (`LS_UI_PREFS_KEY`)

## 6. Fluxo de inicializacao

No `init()`:

1. monta combos de horario e datalist de atividades;
2. aplica preferencia de horarios quebrados;
3. carrega base de IDs do IndexedDB;
4. se nao houver base local, tenta carregar automaticamente um XLSX padrao do repositorio;
5. carrega eventos do IndexedDB;
6. registra handlers globais;
7. renderiza a view inicial.

### 6.1 Carregamento automatico da base de IDs

Na primeira execucao (sem base salva), o sistema tenta `fetch` em ordem:

1. `./base_dados_id_artia_no_client.xlsx`
2. `./base_ids_artia.xlsx`
3. `./ids_artia.xlsx`
4. `./ids-artia.xlsx`
5. `./assets/base_ids_artia.xlsx`

Se encontrar e parsear com sucesso, a base fica salva localmente.

Importante:

- isso **nao remove** a opcao manual de carregar IDs;
- o botao **Carregar IDs Artia (XLSX)** continua substituindo a base quando o usuario quiser.

## 7. Importacao/Exportacao

## 7.1 Importar base de IDs (manual)

Botao: `Carregar IDs Artia (XLSX)`

Regras esperadas da planilha:

- Coluna A: atividade
- Coluna B: ID
- Coluna C: projeto + descricao

O parser:

- remove pseudo-atividades;
- normaliza chaves (`projeto||atividade`);
- salva indice e metadados.

## 7.2 Importar apontamentos (XLSX)

Botao: `Importar Apontamentos (XLSX)`

Fluxo:

- le aba `atividades`;
- mapeia cabecalho dinamicamente;
- cria eventos no formato interno;
- permite substituir tudo ou mesclar.

## 7.3 Exportar CSV

Botao: `Exportar CSV` (menu com "Tudo" e "Tabela com Filtros")

- delimitador `;` (compatibilidade Excel pt-BR);
- inclui colunas de esforco e email configurado.

## 7.4 Backup XLSX

- `Salvar XLSX`: gera backup imediatamente;
- `Definir Local de Salvamento`: vincula pasta/arquivo para sobrescrever backup automaticamente;
- fallback para download quando API de arquivo nao estiver disponivel.

## 8. Funcionalidades de calendario e regras de negocio

- selecao por arraste em slots vazios para criar evento;
- hint visual com inicio/fim + duracao;
- sem sobreposicao no mesmo dia (validacao antes de salvar/mover);
- drag-and-drop de evento para mover;
- resize pelas bordas superior/inferior;
- confirmacao quando arrastar para outra data;
- clique unico seleciona evento, segundo clique abre modal;
- opcao de arredondar horarios (10 min) ou permitir horarios quebrados;
- preenchimento automatico de ID quando projeto+atividade batem com base carregada.

## 9. Views e responsabilidade de cada uma

- **Calendario**: operacao principal (CRUD por horario).
- **Tabela**: auditoria, ordenacao, filtros e edicao por linha.
- **Gantt**: consolidado semanal por projeto/dia.
- **Graficos**: leitura analitica por periodo/projeto.
- **Diretorio**: consulta da base de IDs por projeto/atividade.

## 10. Presenca online (Firebase)

Existe um bloco separado de script para presenca:

- gera `sessionId` por aba;
- envia heartbeat periodico;
- remove sessao em disconnect;
- exibe contador de usuarios online no badge.

Observacao:

- as credenciais do Firebase estao no cliente por design (modelo padrao de app web com RTDB).
- para producao, manter regras de seguranca do Firebase bem restritas.

## 11. Como publicar no GitHub Pages

1. manter `index.html` na raiz (ou ajustar caminho conforme sua estrutura de pages);
2. versionar junto o XLSX padrao (`base_dados_id_artia_no_client.xlsx`) na mesma pasta de `index.html`;
3. publicar no GitHub Pages;
4. abrir a URL publicada e validar:
   - base de IDs carrega sozinha no primeiro acesso;
   - botao manual de carregar IDs continua funcionando.

## 12. Pontos de manutencao recomendados

- separar `index.html` em arquivos (`styles.css`, `app.js`, modulos por dominio) quando o escopo crescer;
- mover credenciais sensiveis e regras de seguranca para ambiente controlado;
- aumentar cobertura de testes alem do `selftest` interno;
- documentar schema exato das planilhas em um guia de operacao para usuarios finais.

## 13. Modo de autoteste

A aplicacao possui um fluxo interno de autoteste acionado por query string:

- `?selftest=1`

Ele executa verificacoes de renderizacao e regras principais e marca PASS/FAIL no titulo da pagina.

