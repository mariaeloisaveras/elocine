# Arquitetura do Elocine

A interface principal é uma aplicação Angular 22, com rotas carregadas sob demanda. O servidor
FastAPI expõe o catálogo e os casos de uso de reprodução. Credenciais Xtream e URLs autenticadas
ficam no Python; o navegador recebe apenas identificadores do catálogo e URLs locais com tokens
temporários.

## Dependências

`Apresentação → Aplicação → Domínio ← Infraestrutura`

O domínio não importa Angular, FastAPI, requests ou o provedor. A composição das dependências fica
em `src/app/app.config.ts` e `backend/bootstrap.py`.

| Camada         | Angular                                                                                       | Python                                                         |
| -------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Domínio        | `domain/`: entidades, portas dos repositórios, tempo e rotas                                  | `backend/domain/`: entidades, contrato do catálogo e erros     |
| Aplicação      | `application/`: catálogo e controle de reprodução                                             | `backend/application/`: pesquisa, paginação e sessão única     |
| Infraestrutura | `infrastructure/`: adaptadores HTTP e armazenamento local                                     | `backend/infrastructure/`: Xtream, configuração e demonstração |
| Apresentação   | `presentation/home`, `presentation/catalog`, `presentation/watch`, componentes compartilhados | `backend/presentation/`: validação e endpoints FastAPI         |

Os adaptadores de mídia estão em `backend/infrastructure/media/`:

- `proxy.py`: sessões temporárias, tokens, playlists e coordenação do relay.
- `http.py`: entrega de mídia, HLS, Range e CORS para o player local.
- `session.py`: recursos e encerramento de uma sessão de mídia.
- `buffer.py` e `download.py`: arquivo temporário e carregamento independente do player.
- `transcoder.py`: descoberta do FFmpeg e comandos de conversão.

`PlaybackService` depende da porta `MediaRelay`, não do servidor HTTP ou do buffer. Seu estado usa
`PlaybackSession`, uma entidade com serialização pública explícita. A apresentação converte apenas
erros de negócio conhecidos em respostas HTTP.

Os estilos das páginas e do player ficam junto dos respectivos componentes. `NextEpisodeController`
concentra o contador, o cancelamento e os temporizadores; seus efeitos acompanham o ciclo de vida do
componente. Estilos base reutilizáveis ficam em `src/styles.css`.

## Navegação e estado

- `/`: catálogo. Filtros e busca ficam na URL para suportar voltar, recarregar e links.
- `/platform/:platform`: grade de filmes e séries da plataforma, com busca e seleção única Tudo.
- `/browse/:kind`: grade geral de filmes, séries ou canais, com busca e categorias.
- As grades usam paginação de 30 itens na API e `IntersectionObserver` para solicitar o próximo lote
  perto do fim da tela. Requisições antigas são canceladas ao mudar filtros; erros mantêm os cards
  já carregados e permitem repetir a página que falhou.
- `CatalogMemoryStore` guarda até oito seleções em memória, incluindo páginas e posição de rolagem,
  para restaurar a navegação após sair do player. Recarregar o app limpa esse estado.
- `/watch/movie/:id`, `/watch/series/:id`, `/watch/live/:id`: reprodução.
- Séries abrem o último episódio assistido, quando disponível, ou o primeiro.
- O botão de voltar encerra a reprodução e restaura a última URL do catálogo.
- Histórico e preferência de compatibilidade ficam no `localStorage`. Tokens e URLs de reprodução
  não são persistidos. O cache de vídeo é temporário no servidor.
- Trocar de título ou episódio encerra a reprodução anterior. Ao sair da página, o cliente libera a
  sessão por `sendBeacon`. Um período sem heartbeat também encerra sessões abandonadas.

## Programação ao vivo

`GET /api/channels/:id/schedule` consulta o EPG curto do canal. O adaptador Xtream decodifica os
textos Base64, valida os timestamps Unix e entrega somente os campos públicos do programa. A seleção
de agora/a seguir usa os intervalos de tempo, sem depender do indicador do provedor.

`LiveGuide` é compartilhado pelos cards e pelo player. Nos cards, `IntersectionObserver` limita as
consultas aos itens visíveis; no player, o painel permanece dentro do contêiner de tela cheia. O
`ScheduleStore` compartilha consultas e mantém um cache de um minuto, limitado a 128 canais. O
provedor também tem cache de um minuto para EPG. A atualização não modifica a sessão do vídeo.

## Vídeo

O player Angular contém os próprios controles, sobre o vídeo e dentro do contêiner de tela cheia. O
tempo exibido é o absoluto: posição do vídeo + deslocamento de uma conversão iniciada após uma
busca. Uma busca fora do trecho disponível encerra a conversão anterior e inicia outra no destino. O
player confirma a posição depois de receber os dados do novo trecho.

No modo de compatibilidade, o servidor converte para H.264/AAC. O download/conversão de filmes e
episódios continua em disco independentemente de o player estar pausado. No modo normal, uma busca
em dados ainda não baixados pode aguardar o download.

## Validação

- `bash scripts/npm.sh run build`: compilação Angular e templates estritos.
- `bash scripts/npm.sh test`: casos de uso, navegação por rotas e controles em DOM simulado.
- `.venv/bin/python -m unittest discover -s tests -v`: API, contrato, exclusividade, cache, Range,
  cancelamento e conversão/busca com vídeo sintético.
- `IPTV_DEMO=1 ./run.sh`: catálogo ilustrativo e vídeo sintético, sem usar o provedor.

O modo de demonstração é explícito e não substitui silenciosamente o catálogo real.
