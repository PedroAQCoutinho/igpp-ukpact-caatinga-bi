# Prompt para o Claude Code local (v2, 24/11/2026)

Cole no Claude Code aberto dentro do clone deste repositório.

```
Você vai implementar o BI do projeto iGPP - UK Pact - Caatinga neste repositório (igpp-ukpact-caatinga-bi). A reunião é amanhã, 25/11.

1. Rode git pull aqui e no meu-contexto. Leia AGENTS.md (deste repo e do meu-contexto), meu-contexto/infra/bancos.md e docs/especificacao.md (v2), que é a fonte da verdade. Abra prototipo/ (cd prototipo && python3 -m http.server 8001) e navegue nas 4 abas: essa é a interface aprovada, e o BI final deve se comportar igual.
2. Siga a ordem de entrega da seção 6 da especificação.
3. Etapas sem banco (bibliotecas em vendor/, esqueleto DuckDB, console SQL, abas 1 e 2 portadas, malha oficial do IBGE): execute com autonomia. Instale o que precisar fora do repo. Faça commit e push ao fim de cada etapa, rodando scripts/checar_dados.py antes.
4. Etapas com banco: antes de cada execução, me mostre o arquivo extract/*.sql e espere meu "ok". Use só service=curupira. Nunca abra o ~/.pgpass. Não imprima linhas de imóveis, só totais. data/local/ nunca entra no git.
   - Antes da extração de imóveis, me pergunte a definição de "área potencialmente degradada" (seção 4.2).
   - Se a conferência com o Relatório 2 não bater, pare e me mostre a diferença.
5. Ao final de cada etapa, diga em 2 ou 3 linhas o que ficou pronto e o que assumiu. Registre a sessão em meu-contexto/infra/diario.md.

Se algo não couber até amanhã, siga a ordem de corte da seção 6 e me avise. Não improvise mudanças de interface.
```
