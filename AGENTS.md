# Instrucoes para o Codex

## Preferencias do usuario

- Trabalhar sempre em portugues do Brasil, salvo quando o usuario pedir outro idioma.
- Explicar mudancas tecnicas em linguagem simples quando o usuario pedir revisao antes de commit.
- Antes de qualquer commit, explicar as mudancas para uma pessoa leiga em programacao.
- Antes de qualquer commit, apontar possiveis efeitos colaterais ou riscos de bugs novos.
- Nao fazer commit nem push sem confirmacao explicita do usuario.

## Git e GitHub

- Antes de iniciar mudancas relevantes, verificar `git status --short --branch`.
- Quando fizer pull, preferir `git pull --ff-only`.
- Antes de commitar, revisar exatamente quais arquivos estao staged.
- Evitar incluir arquivos fora do escopo da tarefa.
- Depois de push, verificar se a branch local e `origin/main` estao alinhados quando a branch atual for `main`.
- Nunca commitar `.env`, `.env.local`, `.cache/`, `node_modules/` ou arquivos com credenciais.

## Commits

Quando o Codex for preparar commits neste repositorio:

- Antes de commitar, explicar ao usuario em portugues simples o que mudou.
- Explicar tambem se a mudanca pode gerar efeitos colaterais ou novos bugs.
- Usar uma mensagem curta de commit em portugues.
- Usar uma descricao detalhada no corpo do commit.
- A descricao do commit deve explicar:
  - o que foi alterado;
  - por que foi alterado;
  - quais validacoes foram feitas;
- Nao fazer commit sem confirmacao explicita do usuario.
- Nao incluir arquivos locais ignorados, como `.env`, `.env.local`, `.cache/` ou `node_modules/`.

## Validacao

- Para mudancas visuais, rodar o site em localhost quando possivel e validar no navegador.
- Para mudancas em modal, layout ou interface, conferir abertura, fechamento, scroll e estados principais.
- Rodar `git diff --check` antes de commitar.
- Se testes automatizados nao rodarem por problema preexistente, explicar claramente.

## Seguranca

- Nunca mostrar valores de senhas, tokens, chaves de API ou variaveis sensiveis.
- Ao inspecionar arquivos `.env`, mostrar apenas os nomes das variaveis, nunca os valores.
- Se houver risco de expor credenciais ou dados sensiveis, parar e avisar o usuario antes de prosseguir.
