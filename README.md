# 🏙️ Engine de Validação de Endereços

[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-yellow.svg)](https://github.com/moschini80/higienizador-ceps/blob/main/LICENSE)
[![Demo](https://img.shields.io/badge/demo-GitHub%20Pages-0175C2?logo=github)](https://moschini80.github.io/higienizador-ceps/)
[![Testes Unitários](https://img.shields.io/badge/testes%20unit%C3%A1rios-14%20suites-brightgreen?logo=javascript&logoColor=black)](https://moschini80.github.io/higienizador-ceps/tests.html)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Sem dependências](https://img.shields.io/badge/depend%C3%AAncias-nenhuma-brightgreen)](https://github.com/moschini80/higienizador-ceps)

Ferramenta **100% local** (sem servidor, sem backend, sem dependências externas) para validação e cruzamento em massa de endereços postais brasileiros.

> Este projeto nasceu de dois motivos: estudar como usar IA no desenvolvimento de software e atender um pedido de um amigo das antigas que precisava higienizar uma base de CEPs. O resultado virou uma ferramenta de uso geral.

Processa arquivos com **milhões de registros** sem travar o navegador — utiliza `ReadableStream` para leitura linha a linha e mantém o consumo de RAM estável.

---

## ✨ Funcionalidades

- 🔍 **Busca exata por CEP** com lookup O(1) via `Map()`
- 🗣️ **Fonetização PT-BR** — trata CH/X, PH/F, Ç/S, NH, LH, S intervocálico e demais variações do Português
- 📐 **Jaro-Winkler** — mede similaridade entre grafias, favorecendo prefixos comuns
- 📊 **Dashboard em tempo real** — contador progressivo, ETA, velocidade (reg/s) e barras por categoria
- ⏸️ **Pause / Resume / Cancel** do processamento
- 💾 **Exportação em 4 arquivos CSV** independentes (com BOM UTF-8 para Excel)
- 🧪 **Suite de testes unitários** integrada, rodando direto no navegador

---

## 📁 Estrutura do Projeto

```
validador_endereco/
├── index.html                   # Interface principal (UI + Dashboard)
├── phonetics.js                 # Algoritmo fonético PT-BR
├── similarity.js                # Jaro-Winkler e score composto
├── processor.js                 # Stream, pipeline de batimento, exportação
├── ui-manager.js                # Atualização do Dashboard
├── tests.html                   # Suite de testes unitários
├── fixture_base_referencia.csv  # Base de referência de exemplo (10 CEPs)
└── fixture_arquivo_trabalho.csv # Arquivo de trabalho de exemplo (15 registros)
```

---

## 🚀 Como Usar

### 1. Abrir a aplicação

Abra o arquivo `index.html` diretamente no navegador (Chrome, Edge ou Firefox).  
Nenhuma instalação ou servidor é necessário.

---

### 2. Carregar a Base de Referência (Passo 1)

A base de referência é o dicionário de CEPs contra o qual os endereços serão validados.

#### Opção A — Pasta OpenCEP *(recomendado)*

> O projeto [OpenCEP](https://github.com/SeuAliado/OpenCEP/releases) disponibiliza gratuitamente todos os CEPs do Brasil.

1. Acesse **https://github.com/SeuAliado/OpenCEP/releases**
2. Baixe o arquivo **`v1.zip`** da versão mais recente
3. **Descompacte** o zip — você verá uma pasta chamada `v1` com milhares de arquivos `.json`, um por CEP
4. No Passo 1 da ferramenta, selecione o modo **📂 Pasta OpenCEP (v1)**
5. Clique no campo de seleção e aponte para a pasta `v1` extraída
6. Clique em **⬆️ Carregar Pasta**

> Formato de cada arquivo JSON do OpenCEP:
> ```json
> {
>   "cep": "01001-900",
>   "logradouro": "Praça da Sé 108",
>   "bairro": "Sé",
>   "localidade": "São Paulo",
>   "uf": "SP"
> }
> ```

#### Opção B — CSV próprio

1. Selecione o modo **📄 CSV / TXT**
2. Escolha seu arquivo CSV
3. Informe o número da coluna do CEP e do logradouro (contagem começa em 0)
4. Marque se o arquivo possui cabeçalho
5. Clique em **⬆️ Carregar Base**

---

### 3. Selecionar o Arquivo de Trabalho (Passo 2)

O arquivo de trabalho contém os registros a serem validados.

| Campo | Descrição |
|---|---|
| **Coluna ID** | Identificador do registro (ex: código do cliente) |
| **Coluna CEP** | CEP do endereço a validar |
| **Coluna Endereço** | Logradouro a ser comparado com a base |

> A ferramenta aceita CEPs formatados (`01001-900`) ou sem formatação (`01001900`).  
> O delimitador (vírgula, ponto e vírgula, tab, pipe) é detectado automaticamente.

---

### 4. Ajustar os Limiares de Classificação (Passo 3)

Use os sliders para definir os pontos de corte do score (0–100):

| Categoria | Score | Cor |
|---|---|---|
| ✅ **Sucesso Total** | ≥ limiar superior (padrão: 95%) | Verde |
| ⚠️ **Corrigido** | Entre os dois limiares (padrão: 70–94%) | Amarelo |
| 🔶 **Risco / Divergente** | Abaixo do limiar inferior (padrão: < 70%) | Laranja |
| ❌ **CEP Inválido** | CEP não encontrado na base | Vermelho |

---

### 5. Iniciar o Processamento

- Clique em **▶️ Iniciar Processamento**
- Acompanhe o Dashboard em tempo real:
  - **Total processado** e **velocidade** (registros/segundo)
  - **Tempo decorrido** e **ETA** (estimativa de conclusão)
  - Barras de progresso por categoria
- Use **⏸️ Pausar** para suspender e **▶️ Continuar** para retomar
- Use **⛔ Cancelar** para interromper — os resultados parciais são mantidos

---

### 6. Exportar os Resultados

Após o processamento, a seção **💾 Exportar Resultados** é exibida automaticamente.

Clique em **⬇️ Baixar CSV** em cada categoria, ou use **📦 Baixar Todos os CSVs** para exportar os 4 arquivos de uma vez.

Todos os arquivos exportados contêm as colunas:

| Coluna | Descrição |
|---|---|
| `ID_ORIGINAL` | ID do registro do arquivo de trabalho |
| `CEP` | CEP original |
| `ENDERECO_ORIGINAL` | Endereço conforme consta no arquivo de trabalho |
| `ENDERECO_BASE_OFICIAL` | Endereço encontrado na base de referência |
| `SCORE_FINAL` | Score de 0 a 100 |
| `METODO_BATIMENTO` | `Exato`, `Fonetico` ou `Jaro` |

---

## 🧪 Executar os Testes

Abra o arquivo **`tests.html`** no navegador. Os testes rodam automaticamente.

### Cobertura

| Suite | Casos |
|---|---|
| `PhoneticsPTBR.normalize` | Acentos, cedilha, espaços, null/undefined |
| `PhoneticsPTBR.phoneticCode — dígrafos` | PH→F, CH→X, NH→NI, LH→LI, GU, QU, RR, SS |
| `PhoneticsPTBR.phoneticCode — contextuais` | C/G antes de E/I, Y→I, W→V |
| `PhoneticsPTBR.phoneticCode — S intervocálico` | casa→caza, sala→sala |
| `PhoneticsPTBR — endereços reais` | Praça da Sé, Carijós/Karijos |
| `Similarity.jaro` | Caso clássico MARTHA/MARHTA, simetria, limites |
| `Similarity.jaroWinkler` | Bônus de prefixo, limites |
| `Similarity.computeScore` | Exato, Fonético, abreviações, strings opostas |
| `Processor.normalizeCEP` | Hífen, ponto, espaço, vazio |
| `Processor.detectDelimiter` | Vírgula, ponto e vírgula, tab, pipe |
| `Processor.classifyOne` | CEP inválido, match exato, typos, risk |
| `Processor — CSV via Blob` | Carregamento, separadores, linhas vazias |
| `Processor — JSON OpenCEP` | Array correto, rejeita não-array |
| `Processor — end-to-end` | Pipeline completo com as 4 categorias |

---

### Testar com os Fixtures

Os arquivos de exemplo cobrem os casos principais:

**`fixture_base_referencia.csv`** — 10 CEPs reais como base de referência  
**`fixture_arquivo_trabalho.csv`** — 15 registros com variações para testar:

| Registro | Cenário | Resultado esperado |
|---|---|---|
| 1, 3, 5, 13 | Endereço idêntico ao da base | ✅ Sucesso Total |
| 4, 7, 12 | Typo leve / equivalente fonético | ✅ Sucesso Total |
| 2, 9, 10 | Abreviação (Av. vs Avenida) | ⚠️ Corrigido |
| 14 | Typo médio (Fnchal vs Funchal) | ⚠️ Corrigido |
| 6 | XV de Novembro vs 15 de Novembro | ⚠️ Corrigido ou 🔶 Risco |
| 11 | Endereço completamente diferente | 🔶 Risco |
| 8, 15 | CEP inexistente | ❌ CEP Inválido |

---

## ⚙️ Pipeline de Batimento

Para cada registro do arquivo de trabalho:

```
CEP não encontrado na base?
    └─► ❌ CEP Inválido (score = 0, método = N/A)

CEP encontrado:
    ├─ Normaliza strings (uppercase + remove acentos + Ç→S)
    ├─ Strings normalizadas idênticas?
    │      └─► score = 100, método = "Exato"
    └─ Calcula score composto:
           ├─ 35%  Jaro-Winkler sobre strings normalizadas
           └─ 65%  Jaro-Winkler sobre códigos fonéticos
           
           Fonéticos idênticos → método = "Fonetico"
           JW normalizado ≥ 0.95 → método = "Exato"
           demais → método = "Jaro"

Score ≥ limiar superior → ✅ Sucesso Total
Score ≥ limiar inferior → ⚠️ Corrigido
Score < limiar inferior → 🔶 Risco
```

---

## 🧠 Fonetização PT-BR

| Regra | Exemplo |
|---|---|
| `PH` → `F` | PHarmácia → Farmácia |
| `CH` → `X` | CHave → Xave |
| `LH` → `LI` | FiLHo → FiLIo |
| `NH` → `NI` | ViNHo → ViNIo |
| `GU` + E/I → `G` | GUErra → GEra |
| `QU` + E/I → `K` | QUEro → KEro |
| `RR` → `R` | CaRRo → CaRo |
| `SS` → `S` | PaSSo → PaSo |
| `C` + E/I → `S` | CEdo → SEdo |
| `G` + E/I → `J` | GENte → JENte |
| `Y` → `I` | Yoga → Ioga |
| `W` → `V` | Wagner → Vagner |
| `Ç` → `S` | Praça → Prasa |
| S intervocálico → `Z` | CaSa → CaZa |

---

## 🌐 Compatibilidade

| Navegador | Suporte |
|---|---|
| Chrome 89+ | ✅ Completo |
| Edge 89+ | ✅ Completo |
| Firefox 91+ | ✅ Completo |
| Safari 15+ | ✅ Completo |

> A seleção de pasta (`webkitdirectory`) é suportada em todos os navegadores modernos.

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).

Base sugerida de CEPs: [OpenCEP](https://github.com/SeuAliado/OpenCEP) — verifique a licença do projeto original.
