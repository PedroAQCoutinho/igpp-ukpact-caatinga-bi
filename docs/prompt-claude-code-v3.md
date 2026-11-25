# Prompt consolidado para o Claude Code (v3, 25/11/2026)

**Agente:** Claude Code (máquina de Pedro). **Status:** executado em 25/11/2026. Itens 1–5 e 9 já estavam prontos; 6, 7 e 8 implementados e publicados na VM. Ver `meu-contexto/infra/diario.md` (25/11) e as seções 12 e 13 da especificação.

```
git pull no meu-contexto e no igpp-ukpact-caatinga-bi. Antes de começar, siga a regra do AGENTS.md: veja se há issues de feedback abertas neste repo e me mostre o resumo.

Porte para o BI real tudo o que está no prototipo/ e na especificação (seções 2.1, 10, 12 e 13) e republique na VM. Itens:

1. Salvaguardas (abas 3 e 4): primeiro filtro de imóvel, em card próprio, com botões Elegíveis | Não elegíveis | Todos (padrão Todos; elegível = apto_todos). Troque "aptos" por "elegíveis". Sem cenário UCUS.
2. Área potencialmente degradada fixa = agricultura + pastagem + mosaico (nulos como zero). Sem seletor de usos. Atualize a definição nas Decisões do projeto e no manifest. Recalcule a partir dos componentes, sem nova extração.
3. Card "Uso da terra (% da área do imóvel)": Sem filtro | ≥ | ≤ e campo de % por uso.
4. Visual (seção 2.1): títulos dos cards acima do valor (16px, 600); legendas de fieldset 17px em negrito; cards de filtro em dois tons de cinza; cores MapBiomas (agricultura #E974ED, pastagem #EDDE8E, mosaico #FFEFC3, vegetação nativa #1F8D49), vermelho #d73027 para a parte degradada; "X% degradada" em vermelho; linhas "Subtotal <grupo>" destacadas.
5. Aba 4: abre com recorte "Todos" (Caatinga inteira).
6. Aba Geo (seção 13): bloco "O bioma Caatinga por UF" (Tabelas 4 e 7); cards fixos à direita; construtor de mapas antes do uso da terra; pop-ups ⓘ com Expandir e Baixar figura (tipologia: Fig. 45 + download da Fig. 46; aridez: Fig. 51; risco: Fig. 50; degradada: Quadro 3). As imagens já estão em assets/ (ver assets/LEIAME.md); no BI real, o download funciona com <a download>. Alternância Área | Nº de CAR em aridez e risco. Tabela por tipologia com a área de cada uso e pizza Nº de CAR | Área.
7. Pontos "Arranjos citados nas entrevistas" (seção 12.1; data/arranjos_pontos_v1_20261125.csv): botão liga/desliga em todos os mapas, só os 22 pontos com local, ponto cheio = município, vazado = região aproximada.
8. APLs (seção 12.2): baixe a planilha oficial "Lista APLs_outubro2022_publico.xlsx" do Observatório Brasileiro de APLs (https://www.gov.br/empresas-e-negocios/pt-br/observatorioapl/apls-brasileiros/apls.xlsx/@@download/file/Lista%20APLs_outubro2022_publico.xlsx). Guarde em data/raw/. Monte apl_municipio (muitos-para-muitos) para os municípios da base. Antes de seguir, me mostre: colunas da planilha, quantos APLs e municípios caem na Caatinga e os setores. Depois crie as variáveis tem_apl, tem_apl_setor_<x> e n_apls, disponíveis no recorte e na HACHURA de todos os construtores de mapas, e a seção "Arranjos já existentes" na aba 4, com mapa categórico estático por setor e a lista.
9. Feedback (seção 10): se ainda não foi feito, siga o prompt anterior (caixa no BI, receptor na VM, script de issues).

Antes de mexer no Caddy, confirme que a VM responde e veja a RAM (free -h). Ao final de cada item, 2 ou 3 linhas sobre o que ficou pronto e o que assumiu. Registre no meu-contexto/infra/diario.md.
```
