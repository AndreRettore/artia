# Apontamentos Artia - Arquitetura e Funcionamento

## 1. Visão geral

Este projeto é uma aplicação web **single-page** (SPA) feita em um único arquivo principal: `index.html`.

Objetivo do sistema:

- registrar apontamentos de horas por dia/horário;
- editar, mover e redimensionar eventos no calendário semanal;
- visualizar os mesmos dados em Tabela, Gantt, Gráficos e Diretório de IDs;
- importar/exportar dados (XLSX/CSV);
- manter dados locais no navegador (offline-first com persistência).

## 2. Stack técnica

- **UI + lógica**: HTML, CSS e JavaScript vanilla (sem framework).
- **Gráficos**: [Chart.js](https://cdn.jsdelivr.net/npm/chart.js) via CDN.
- **Presença online**: Firebase Realtime Database (SDK modular via `script type="module"`).
- **Persistência local principal**: IndexedDB.
- **Persistência auxiliar**: localStorage (preferências e filtros).
- **Leitura/escrita XLSX**: implementação própria no JS (parser XML + ZIP store writer), sem libs externas de XLSX.
- **Backup local em arquivo**: File System Access API (`showDirectoryPicker` / `showSaveFilePicker`) com fallback para download.

## 3. Estrutura de alto nível

### 3.1 Arquivos do repositório

- `index.html`: interface, estilos e toda a lógica da aplicação.
- `base_dados_id_artia_no_client.xlsx`: base padrão de IDs usada no carregamento automático inicial.
- `favicon-exxata-clock-red.svg`: favicon.

### 3.2 Blocos principais de interface

- **Header/topbar**: navegação de visões, filtros globais, botões de import/export e configurações.
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

## 4. Modelo de dados

### 4.1 Estado principal em memória

O objeto `state` controla o runtime:

- `weekStart`: início da semana ativa;
- `events`: lista de eventos;
- `selection`: seleção atual no calendário;
- `editingEventId`: evento em edição;
- `selectedEventId`: evento selecionado (1 clique seleciona, 2 abre);
- `idBaseIndex` / `idBaseMeta`: base de IDs carregada;
- `view`: visão ativa (`calendar`, `table`, `gantt`, `charts`, `directory`).

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

## 5. Persistência

### 5.1 IndexedDB

Banco: `artia_offline_db_v1`

Object stores:

- `events` (eventos salvos)
- `kv` (chave-valor para configurações e metadados)

Dados importantes em `kv`:

- base de IDs: `LS_IDBASE_KEY`, `LS_IDBASE_META_KEY`
- handles de backup: `backupDirectoryHandle`, `backupFileHandle`, `backupFolderName`
- e-mail de exportação e outros metadados

### 5.2 localStorage

Usado para preferências rápidas:

- tema (`theme`)
- filtros de período (Tabela/Gráficos)
- clipboard de campos do modal
- preferência de horário quebrado (`LS_UI_PREFS_KEY`)

## 6. Fluxo de inicialização

No `init()`:

1. monta combos de horário e datalist de atividades;
2. aplica preferência de horários quebrados;
3. carrega base de IDs do IndexedDB;
4. se não houver base local, tenta carregar automaticamente um XLSX padrão do repositório;
5. carrega eventos do IndexedDB;
6. registra handlers globais;
7. renderiza a view inicial.

### 6.1 Carregamento automático da base de IDs

Na primeira execução (sem base salva), o sistema tenta `fetch` em ordem:

1. `./base_dados_id_artia_no_client.xlsx`
2. `./base_ids_artia.xlsx`
3. `./ids_artia.xlsx`
4. `./ids-artia.xlsx`
5. `./assets/base_ids_artia.xlsx`

Se encontrar e parsear com sucesso, a base fica salva localmente.

Importante:

- isso **não remove** a opção manual de carregar IDs;
- o botão **Carregar IDs Artia (XLSX)** continua substituindo a base quando o usuário quiser.

## 7. Importação/Exportação

### 7.1 Importar base de IDs (manual)

Botão: `Carregar IDs Artia (XLSX)`

Regras esperadas da planilha:

- Coluna A: atividade
- Coluna B: ID
- Coluna C: projeto + descrição

O parser:

- remove pseudo-atividades;
- normaliza chaves (`projeto||atividade`);
- salva índice e metadados.

### 7.2 Importar apontamentos (XLSX)

Botão: `Importar Apontamentos (XLSX)`

Fluxo:

- lê aba `atividades`;
- mapeia cabeçalho dinamicamente;
- cria eventos no formato interno;
- permite substituir tudo ou mesclar.

### 7.3 Exportar CSV

Botão: `Exportar CSV` (menu com "Tudo" e "Tabela com Filtros")

- delimitador `;` (compatibilidade Excel pt-BR);
- inclui colunas de esforço e e-mail configurado.

### 7.4 Backup XLSX

- `Salvar XLSX`: gera backup imediatamente;
- `Definir Local de Salvamento`: vincula pasta/arquivo para sobrescrever backup automaticamente;
- fallback para download quando API de arquivo não estiver disponível.

## 8. Funcionalidades de calendário e regras de negócio

- seleção por arraste em slots vazios para criar evento;
- hint visual com início/fim + duração;
- sem sobreposição no mesmo dia (validação antes de salvar/mover);
- drag-and-drop de evento para mover;
- resize pelas bordas superior/inferior;
- confirmação quando arrastar para outra data;
- clique único seleciona evento, segundo clique abre modal;
- opção de arredondar horários (10 min) ou permitir horários quebrados;
- preenchimento automático de ID quando projeto+atividade batem com base carregada.

## 9. Views e responsabilidade de cada uma

- **Calendário**: operação principal (CRUD por horário).
- **Tabela**: auditoria, ordenação, filtros e edição por linha.
- **Gantt**: consolidado semanal por projeto/dia.
- **Gráficos**: leitura analítica por período/projeto.
- **Diretório**: consulta da base de IDs por projeto/atividade.

## 10. Presença online (Firebase)

Existe um bloco separado de script para presença:

- gera `sessionId` por aba;
- envia heartbeat periódico;
- remove sessão em disconnect;
- exibe contador de usuários online no badge.
- salva no RTDB os campos `state`, `lastSeen` formatado em UTC, `lastSeenMs` para a lógica de presença e `email` capturado do campo de exportação.

Observação:

- as credenciais do Firebase estão no cliente por design (modelo padrão de app web com RTDB);
- para produção, manter regras de segurança do Firebase bem restritas.

## 11. Como publicar no GitHub Pages

1. manter `index.html` na raiz (ou ajustar caminho conforme sua estrutura de pages);
2. versionar junto o XLSX padrão (`base_dados_id_artia_no_client.xlsx`) na mesma pasta de `index.html`;
3. publicar no GitHub Pages;
4. abrir a URL publicada e validar:
   - base de IDs carrega sozinha no primeiro acesso;
   - botão manual de carregar IDs continua funcionando.

## 12. Pontos de manutenção recomendados

- separar `index.html` em arquivos (`styles.css`, `app.js`, módulos por domínio) quando o escopo crescer;
- mover credenciais sensíveis e regras de segurança para ambiente controlado;
- aumentar cobertura de testes além do `selftest` interno;
- documentar schema exato das planilhas em um guia de operação para usuários finais.

## 13. Modo de autoteste

A aplicação possui um fluxo interno de autoteste acionado por query string:

- `?selftest=1`

Ele executa verificações de renderização e regras principais e marca PASS/FAIL no título da página.
