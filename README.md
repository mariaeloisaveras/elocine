# Elocine

Aplicação local de filmes, séries e canais ao vivo com **Angular + FastAPI**. A interface oferece
catálogo, busca, temporadas e um player com controles sobre vídeo. O backend acessa o provedor IPTV
e gerencia reprodução, conversão e cache.

## Recursos

- Catálogo de filmes, séries e canais, com pesquisa sem distinção de acentos, categorias e
  paginação.
- Página de reprodução separada, com volta ao catálogo preservando os filtros.
- Elenco, direção, gêneros e país de origem abaixo da sinopse de filmes e séries, quando fornecidos
  pelo provedor.
- Seleção de temporada/episódio e histórico de continuar assistindo neste navegador.
- Programação dos canais (EPG): programa atual, horários e andamento nos cards. No player, o botão
  **Programação** abre a grade em um painel sem interromper o vídeo, inclusive em tela cheia.
  Atualização a cada minuto enquanto visível, com horários locais e indicação quando não há dados.
- Menu **Áudio e legendas** dentro do player, inclusive em tela cheia. No modo de compatibilidade,
  permite escolher as faixas de áudio e ativar/desativar legendas em texto disponibilizadas pelo
  vídeo. A troca preserva a posição e a pausa em filmes/episódios; nos canais, retoma o ao vivo.
  Faixas de legenda em imagem são sinalizadas como incompatíveis, e legendas fixas na imagem não
  podem ser removidas. O app não baixa traduções ou legendas externas.
- Aparência das legendas ajustável no menu: tamanho, cor, fundo e contorno, com prévia e preferência
  salva neste navegador. Mudanças visuais são aplicadas sem reiniciar o vídeo.
- Barra de tempo total com tooltip ao passar o mouse, volume e tela cheia.
- Nos últimos **30 segundos**, um botão de próximo episódio preenche em **5 segundos** antes de
  avançar. Mover o mouse cancela o avanço automático daquele episódio; o botão continua disponível
  para clicar.
- Compatibilidade máxima ativada por padrão: conversão para H.264/AAC com FFmpeg.
- Carregamento de filmes/episódios em arquivo temporário, inclusive com o vídeo pausado.
- Controle de uma reprodução por vez e encerramento de sessões abandonadas.

A tela inicial também reúne carrosséis de Netflix, Prime Video, HBO/Max, Disney+, Globoplay, Apple
TV+ e Paramount+ quando existem categorias correspondentes no provedor. Os títulos são agrupados
pelos rótulos dessas categorias; a organização não representa uma integração com as plataformas. O
botão **Ver todos** abre uma tela dedicada à plataforma com todos os filmes e séries em uma grade.
Os títulos chegam em lotes de 30 conforme você se aproxima do fim da lista, sem trocar de página. Há
busca dentro da seleção **Tudo**; voltar do player preserva os títulos carregados e a posição de
rolagem durante a sessão. As telas de filmes, séries e ao vivo também usam rolagem contínua.

Nos carrosséis, as setas aparecem sobre o card da borda ao passar o mouse. Cada clique avança ou
volta um grupo de títulos. Conforme a rolagem se aproxima do fim, o próximo lote é carregado
automaticamente até o último título disponível; a seta de avançar some ao chegar ao fim. Em telas de
toque, o deslize horizontal continua disponível.

## Tecnologias e arquitetura

- **Interface:** Angular 22, TypeScript, Signals e rotas carregadas sob demanda.
- **API:** Python, FastAPI e adaptador Xtream Codes.
- **Vídeo:** HLS.js no navegador; FFmpeg, relay HTTP e cache temporário no backend.
- **Testes:** Vitest/DOM simulado e unittest com servidores locais e vídeos sintéticos.
- **Organização:** domínio, aplicação, infraestrutura e apresentação. A montagem das dependências
  fica em pontos de configuração próprios, fora das regras de negócio.

Detalhes das camadas e do ciclo de reprodução estão em [ARCHITECTURE.md](ARCHITECTURE.md).

## Pré-requisitos

- Python **3.12 ou superior**, com suporte a `venv`.
- Node.js **24.15 ou superior na linha 24**, ou outra versão compatível com Angular 22. O script de
  instalação abaixo pode instalar um Node portátil só neste projeto.
- Acesso a um provedor IPTV compatível com a API Xtream Codes e autorizado a oferecer os conteúdos
  que você pretende reproduzir.

Os scripts fornecidos atendem Linux/macOS. As dependências ficam em `.venv`, `node_modules` e
`.tools`, sem exigir instalação global.

## Instalação

```bash
git clone https://github.com/mariaeloisaveras/elocine.git
cd elocine
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/setup_node.py
bash scripts/npm.sh ci
```

Em uma instalação nova, crie a configuração local:

```bash
cp .env.example .env
```

Se já existe um `.env`, mantenha o arquivo existente. Edite seus valores:

```dotenv
IPTV_URL="http://seu-provedor:porta"
IPTV_USER="seu-usuario"
IPTV_PASS="sua-senha"
```

Configurações opcionais:

| Variável          | Uso / padrão                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `IPTV_USER_AGENT` | Identificação nas requisições. Padrão: `VLC/3.0.20 LibVLC/3.0.20`.                                 |
| `IPTV_FFMPEG`     | Caminho para um FFmpeg existente. Se ausente, usa o disponível no sistema ou o binário da `.venv`. |
| `ELOCINE_PORT`    | Porta do app; padrão `8000`.                                                                       |
| `IPTV_DEMO`       | `1` para usar demonstração sem acessar o provedor.                                                 |

O `.env` é lido apenas pelo backend e está no `.gitignore`. As credenciais não entram no código
Angular nem no histórico do navegador.

## Executar

Na pasta do projeto:

```bash
./run.sh
```

Abra **http://localhost:8000**. Mantenha o terminal aberto e use **Ctrl+C** para encerrar. Não é
necessário ativar a `.venv`: o script utiliza o Python dela.

O script compila o Angular quando necessário e serve a interface e a API no mesmo endereço. Para
escolher outra porta:

```bash
ELOCINE_PORT=8002 ./run.sh
```

Feche outros players ao usar uma conta limitada a uma conexão.

### Demonstração

```bash
IPTV_DEMO=1 ./run.sh
```

Esse modo identifica o catálogo como ilustrativo e gera um vídeo sintético local. Não precisa de
credenciais e não substitui silenciosamente o catálogo do provedor.

## Desenvolvimento

Instale também as ferramentas e dependências de teste Python:

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
```

Em um terminal, execute a API:

```bash
.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

Em outro, execute o Angular:

```bash
bash scripts/npm.sh start
```

Abra **http://localhost:4200**. O proxy de desenvolvimento encaminha `/api/**` para
`localhost:8000`. A documentação da API fica em **http://localhost:8000/api/docs**.

### Verificação

```bash
bash scripts/npm.sh run build
bash scripts/npm.sh test
bash scripts/npm.sh run format:check
.venv/bin/python -m ruff check backend scripts tests server.py
.venv/bin/python -m ruff format --check backend scripts tests server.py
.venv/bin/python -m unittest discover -s tests -v
```

Para formatar o código:

```bash
bash scripts/npm.sh run format
.venv/bin/python -m ruff format backend scripts tests server.py
```

Os testes não precisam acessar o provedor real. Usam fixtures, servidores locais e FFmpeg para
validar cache, buscas, conversão, navegação e controles.

## Estrutura

```text
src/app/
  domain/             Entidades e contratos dos repositórios
  application/        Casos de uso de catálogo e reprodução
  infrastructure/     Adaptadores HTTP e histórico local
  presentation/       Telas, componentes, estilos e contador de próximo episódio
backend/
  domain/             Entidades, portas e erros de negócio
  application/        Pesquisa e controle da sessão de reprodução
  infrastructure/     Xtream, configuração, demo e adaptadores de vídeo
  presentation/       Endpoints e validação HTTP
  bootstrap.py        Composição das dependências e ciclo de vida do servidor
scripts/              Ferramentas locais de instalação/execução
tests/                Testes Python
server.py             Entrada do FastAPI
run.sh                Entrada para executar o app completo
```

## Player

| Atalho | Ação                          |
| ------ | ----------------------------- |
| Espaço | Pausar / reproduzir           |
| ← / →  | Voltar / adiantar 10 segundos |
| F      | Entrar / sair da tela cheia   |
| Esc    | Sair da tela cheia            |

Os atalhos respeitam campos de texto, seletores e controles focados.

### Áudio e legendas

Abra **Áudio e legendas** nos controles do vídeo — em telas menores, o botão aparece como
**Áudio/CC**. O menu também fica disponível em tela cheia. Com **Compatibilidade máxima** ativa,
escolha uma faixa de áudio ou uma legenda em texto oferecida pelo conteúdo; selecione
**Desativadas** para desligar a legenda.

Na seção **Aparência da legenda**, ajuste:

| Opção    | Valores                                           |
| -------- | ------------------------------------------------- |
| Tamanho  | Pequeno, médio ou grande                          |
| Cor      | Branco, amarelo, azul-claro ou verde              |
| Fundo    | Sem fundo, preto semitransparente ou preto sólido |
| Contorno | Ativar ou desativar o contorno escuro             |

A prévia acompanha as escolhas. As alterações são aplicadas imediatamente, sem recarregar a
reprodução, e ficam salvas neste navegador para os próximos títulos. **Restaurar padrão** volta para
tamanho médio, texto branco, fundo semitransparente e contorno escuro.

As legendas selecionáveis têm uma folga inferior de **8% da altura do vídeo**, inclusive em tela
cheia. Essa posição é automática. Legendas fixas na imagem não podem ser movidas, estilizadas ou
desativadas pelo player.

O histórico, a preferência de compatibilidade e a aparência das legendas ficam no `localStorage`
deste navegador. Os vídeos são armazenados temporariamente no computador que executa Python. Parar,
trocar de título ou encerrar o app limpa o cache correspondente.

No modo de compatibilidade, uma busca fora da janela disponível encerra a conversão anterior e
inicia outra no destino, sem manter duas entradas do provedor. No modo normal, buscar uma parte
ainda não baixada pode exigir aguardar o download.

## Preparar o repositório remoto

O repositório local usa a branch `main`. Antes de publicar, confira os arquivos:

```bash
git status
```

Confira o destino do envio:

```bash
git remote -v
```

Se ainda não houver um remoto chamado `origin`, configure:

```bash
git remote add origin https://github.com/mariaeloisaveras/elocine.git
```

Com o destino conferido, crie o commit e envie:

```bash
git add .
git commit -m "feat: aplicação Elocine com Angular e FastAPI"
git push -u origin main
```

`.env`, ambientes, binários, caches e builds são ignorados; `.env.example` e os arquivos de
dependências são versionáveis. Não inclua listas ou credenciais reais no código ou nos testes.

## Limites da execução atual

O app foi configurado para uso local: API e relay escutam em `127.0.0.1`. Acesso por outro
dispositivo ou hospedagem HTTPS requer configurar o endereço de mídia e um proxy reverso. A
reprodução também depende do provedor, de seu limite de conexões, dos codecs de origem e da
capacidade do computador para conversão.
