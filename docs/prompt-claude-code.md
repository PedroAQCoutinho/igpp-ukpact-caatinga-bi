# Prompt usado no Claude Code local (24/11/2026)

Você vai implementar o BI do projeto iGPP - UK Pact - Caatinga neste repositório (`igpp-ukpact-caatinga-bi`). A reunião é amanhã, 25/11.

1. Rode `git pull` aqui e no `meu-contexto`. Leia `AGENTS.md` (deste repo e do meu-contexto), `meu-contexto/infra/bancos.md` e `docs/especificacao.md`. A especificação é a fonte da verdade.
2. Siga a ordem de entrega da seção 6 da especificação.
3. **Etapas 1 e 2 (sem banco):** execute com autonomia. Instale o que precisar fora do repo, copie as bibliotecas para `vendor/`, converta a base do Felipe e construa o console e as abas 1 e 2. Faça commit e push ao fim de cada etapa.
4. **Etapas 3 e 4 (banco):** antes de cada execução, me mostre o arquivo `extract/*.sql` e espere meu "ok". Use só `service=curupira`. Nunca abra o `~/.pgpass`. Se a conferência de totais não bater com o Relatório 2, pare e me mostre a diferença.
5. **Etapas 5 e 6:** abas 3 e 4, README e teste do zero sem internet.
6. Ao final de cada etapa, diga em 2 ou 3 linhas o que ficou pronto e o que assumiu. Registre a sessão em `meu-contexto/infra/diario.md`.

Se algo da especificação for inviável até amanhã, proponha um corte em vez de improvisar.
