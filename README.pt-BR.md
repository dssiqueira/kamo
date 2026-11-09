<p align="center">
  <a href="README.md">English</a> · <b>Português (Brasil)</b> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="Kamo, um camaleão de papel recortado, entre folhas">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>Aperta gravar. Clica. Para. Já está editado.</b><br>
  Um gravador de tela grátis e de código aberto que dá zoom em cada clique, suaviza o cursor<br>
  e exporta um vídeo com cara de que alguém passou uma hora editando. Você gastou zero minuto.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licença: MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Plataforma: Windows hoje, Mac e Chrome em breve" src="https://img.shields.io/badge/plataforma-Windows%20%C2%B7%20Mac%20e%20Chrome%20em%20breve-2F6F68?style=flat-square">
  <img alt="Sem telemetria" src="https://img.shields.io/badge/telemetria-nenhuma-A8D5A2?style=flat-square">
</p>

<h3 align="center">Já disponível para Windows</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="Baixar para Windows" src="https://img.shields.io/badge/Baixar-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac: em breve" src="https://img.shields.io/badge/Mac-em%20breve-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Extensão para Chrome: em breve" src="https://img.shields.io/badge/Chrome-em%20breve-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>Quando a extensão para Chrome sair, ela também vai rodar no Edge, no Brave e no Arc. Não aguenta esperar? <a href="#compilar-a-partir-do-código">Compile a partir do código</a>.</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="Gravação de um app de demonstração: cada clique vira um zoom suave no ponto clicado">
</p>

> [!NOTE]
> **O Kamo ainda é novinho.** A versão para Windows já saiu, e é no Windows que o Kamo é desenvolvido e testado todo dia. O app para Mac e a extensão para Chrome chegam em breve. Os instaladores ainda não têm assinatura de código. As versões saem no [GitHub Releases](https://github.com/dssiqueira/kamo/releases); se esbarrar em alguma aresta, [abra uma issue](https://github.com/dssiqueira/kamo/issues).

> [!TIP]
> **Primeira vez no Windows.** Como o instalador ainda não tem assinatura de código, o SmartScreen pode avisar "O Windows protegeu o computador". Clique em **Mais informações** e depois em **Executar assim mesmo**.

---

## O que faz o Kamo diferente

**Você não edita. Você grava.** O Kamo observa onde você clica (só o mouse, nunca o teclado) e, quando você para, o vídeo já tem uma câmera que acompanha a ação, um cursor que desliza em vez de tremer e um enquadramento com cara de design.

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="Lado a lado: à esquerda, a gravação crua com um cursor minúsculo e trêmulo; à direita, a mesma tomada no Kamo, com zoom em cada clique sobre um fundo verde-sálvia">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>Cliques viram zooms.</b> Cliques próximos dividem o mesmo plano, então a câmera nunca fica pulando. Todo movimento é uma mola (rigidez 170, amortecimento 26), nunca um deslize linear.</td>
    <td width="50%" valign="top"><b>Um cursor que desliza.</b> O Kamo deixa o cursor do sistema fora da gravação e o redesenha a partir do caminho do mouse, com a mesma mola. Maior, mais suave e com uma ondinha a cada clique.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Fundo, padding, cantos e sombra</b> já vêm ligados. Escolha um fundo pronto, uma cor sólida ou sua própria imagem.</td>
    <td width="50%" valign="top"><b>Tudo é editável.</b> Arraste, estique ou apague zooms na linha do tempo e corte as pontas. Seus zooms manuais nunca são sobrescritos quando os zooms são gerados de novo.</td>
  </tr>
</table>

### Uma gravação, todos os formatos

16:9 para o YouTube, 1:1 para o feed, 9:16 para Reels e Shorts, exportados juntos da mesma linha do tempo. MP4 até 4K60, GIF e legendas em `.srt`. A prévia e a exportação usam o mesmo código de renderização: o que você vê é o que sai. Sem marca d'água, sem limite de tempo.

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="A mesma gravação exportada lado a lado em 16:9, 1:1 e 9:16 vertical, com a câmera embaixo da tela">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="Uma bolha redonda de webcam no canto, que encolhe enquanto a câmera dá zoom">
      <br><b>Bolha de webcam.</b> Redonda, quadrada ou larga, em qualquer canto ou onde você arrastar. Ela encolhe enquanto a câmera dá zoom e volta depois. No 9:16, pode virar um cartão próprio (dividido).
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="Legendas em cinco estilos: Forte, Kamo, Datilografado, Neon e Marca-texto">
      <br><b>Legendas em 12 estilos.</b> Transcritas no seu computador (um pacote opcional que você só baixa se quiser). Corrija uma palavra na linha do tempo e a transcrição acompanha. Grave na imagem ou exporte um <code>.srt</code>.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="A gravação emoldurada num papel de parede próprio, um pôr do sol de papel recortado">
      <br><b>Seu próprio fundo.</b> Solte um PNG, JPG ou WebP. O Kamo copia a imagem para o projeto e recorta para caber em todos os formatos.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="A galeria de estilos de legenda do editor, ao lado de uma legenda no estilo Kamo na prévia">
      </picture>
      <br><b>Escolha um visual, não uma fonte.</b> Limpo, Forte, Kamo, Neon, Datilografado, Cinema e mais seis, embaixo ou no meio, em três tamanhos. Um clique e a prévia atualiza.
    </td>
  </tr>
</table>

<sub>Todo clipe desta página é de um app de demonstração inventado, editado e exportado pelo Kamo e depois encolhido num GIF para o GitHub. A "webcam" é um camaleão ilustrado, desenhado num canvas. Nenhuma tela ou rosto real foi ferido.</sub>

## Como funciona

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="Quatro passos: Grave uma tela, janela ou seleção; Clique, e o Kamo registra o mouse, nunca o teclado; Zoom, em que cada clique vira um zoom com mola; Exporte em MP4, GIF e .srt, em 16:9, 1:1 e 9:16">
</picture>

## Um tour pelo app

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="A tela inicial do Kamo: escolha Tela, Janela ou Selecionar, ligue microfone, som do computador e câmera e veja os projetos recentes">
      </picture>
      <br><b>Início.</b> Tela, Janela ou Selecionar. Microfone, som do computador e câmera são um botão cada. Seus projetos e playlists locais ficam logo abaixo.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="O editor: prévia ao vivo com zooms, uma bolha de webcam, o painel de estilo e uma linha do tempo com faixas de zoom, webcam e legendas">
      </picture>
      <br><b>Editor.</b> Prévia ao vivo no meio, estilo à direita, zooms, webcam e legendas na linha do tempo. A edição é não destrutiva: o vídeo original nunca é alterado.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="A moldura de Selecionar sobre um app de demonstração, com campos de largura e altura e um botão Gravar">
      </picture>
      <br><b>Selecionar.</b> Uma moldura que você move e redimensiona sobre a tela, com tamanho exato em pixels. Cliques fora dela nunca viram zoom.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="O tour de boas-vindas: o camaleão Kamo diz Aperte Gravar, ao lado de um esboço das opções de gravação">
      </picture>
      <br><b>Tour de boas-vindas.</b> O Kamo mostra tudo em três telas, no seu idioma. Depois sai do caminho.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="O popup da extensão para Chrome: Gravar esta aba, com botões de microfone, som da aba e câmera">
  <br><sub>A extensão para Chrome (em breve): um popup, um botão.</sub>
</p>

## Desktop ou extensão?

Mesmo motor, mesmo editor, mesma exportação. A diferença é o que cada um consegue gravar. O Windows já saiu; o app para Mac e a extensão chegam em breve.

| | App desktop<br><sub>Windows · Mac (Apple silicon, em breve)</sub> | Extensão para Chrome (em breve)<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| Gravar a tela inteira | ✅ | — |
| Gravar uma janela ou uma seleção | ✅ | — |
| Gravar uma aba do navegador | ✅ (como janela) | ✅ |
| Microfone | ✅ | ✅ |
| Som do computador / som da aba | ✅ | ✅ (som da aba) |
| Bolha de webcam e 9:16 dividido | ✅ | ✅ |
| Zoom automático, câmera com mola, cursor suave, linha do tempo | ✅ | ✅ |
| Fundos prontos e cores sólidas | ✅ | ✅ |
| Sua própria imagem de fundo | ✅ | ainda não |
| Transcrição local e legendas | ✅ | — (só no desktop) |
| Exportar MP4 e GIF em 16:9, 1:1, 9:16 | ✅ | ✅ |
| Exportação em 4K e 60fps | ✅ | — (abas gravam até 1080p30) |
| Onde ficam os projetos | Uma pasta no seu disco | Dentro do navegador (OPFS) |
| Legível pelo servidor MCP local | ✅ | — |

## Privado de fábrica

- **100% local.** Gravar, editar e exportar funcionam offline, sem conta.
- **Sem telemetria. Sem analytics.** Nem "anonimizado". Nada.
- **Nada sai da sua máquina a não ser que você mesmo envie.**
- **Só o mouse, nunca o teclado.** O Kamo registra cliques e movimento. Ele não captura teclas, e a extensão nunca lê a página que você grava. O CI confere isso em todo pull request.
- **Download leve.** O app grava, edita e exporta. Coisas pesadas, como o modelo de transcrição, são pacotes opcionais, baixados só quando você pede.
- **Não destrutivo.** Sua gravação original nunca é alterada; toda edição fica no `project.json`.

## Use suas gravações com IA

O Kamo vem com um pequeno **servidor MCP local** para que o Claude Code (ou qualquer cliente MCP) converse com o que você gravou: transcrições, a linha do tempo de cliques, os zooms e uma captura de referência a cada 5 segundos.

> "Encontre a gravação em que eu expliquei as configurações de cobrança e escreva uma documentação passo a passo a partir dela."

Ele é **somente leitura e não acessa a rede**: lê a sua pasta de projetos e responde ao agente que você conectou. Mais nada.

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

O app desktop mostra o comando exato, já com a sua pasta preenchida, em **Configurações → Conectar a um agente**. Ferramentas, exemplos e outros clientes: [apps/mcp/README.md](apps/mcp/README.md) (em inglês).

## Compilar a partir do código

Requer Node 24+ e pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

Gravar no desktop exige o auxiliar nativo de captura: Rust e o Visual Studio Build Tools no Windows, Xcode no Mac. Veja [`apps/desktop/native`](apps/desktop/native). Sem nada pronto para gravar? O [`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project) gera um projeto de exemplo realista que você abre no editor (é a demo "Acme Studio" dos clipes acima).

## Arquitetura

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="Arquitetura: o app desktop e a extensão para Chrome usam packages/ui, que usa packages/core. O servidor MCP local lê a pasta de projetos gravada pelo app desktop.">
</picture>

Um monorepo pnpm, TypeScript em tudo.

- **`packages/core`** é o motor: formato do projeto, geração de zooms, câmera virtual, cursor suave, renderização dos quadros e exportação com WebCodecs (MP4 e GIF). A prévia e a exportação rodam o mesmo código.
- **`packages/ui`** é o editor, a linha do tempo e os painéis (React).
- Nenhum dos dois sabe onde está rodando: nada de Electron, Node ou `chrome.*` dentro deles. Captura, eventos, armazenamento e arquivos entram por interfaces, e por isso a extensão reaproveita os dois do jeito que estão.
- **`apps/desktop`** é Electron, com pequenos auxiliares nativos de captura: Rust (Windows Graphics Capture) e Swift (ScreenCaptureKit).
- **`apps/extension`** é Manifest V3: captura da aba num documento offscreen, um content script que só olha o mouse e projetos no OPFS.
- **`apps/mcp`** é o servidor MCP local: stdio, somente leitura, sem rede.

Chegou agora, humano ou agente? Comece pelo [AGENTS.md](AGENTS.md). Ele aponta para a documentação do produto, as decisões e o plano em [docs/](docs/). A interface segue o [DESIGN.md](DESIGN.md). Esses documentos estão em inglês.

## Idiomas

English, Português (Brasil), Español, 简体中文, 日本語, Deutsch, Français e 한국어, escolhido a partir do seu sistema e trocável a qualquer momento. Datas, números e durações aparecem no formato do seu idioma. Falantes nativos: revisar as traduções é uma das contribuições mais úteis.

## Próximos passos

O plano passo a passo está em [docs/plan.md](docs/plan.md), e cada recurso com seus critérios de aceite em [docs/features.md](docs/features.md). Na fila: uma versão para Mac testada, instaladores assinados, a página na Chrome Web Store e o `@kamo/mcp` no npm. Uma nuvem opcional para compartilhar links está nos planos; o app em si continua grátis e completo.

## Como contribuir

Issues e pull requests são bem-vindos. Leia antes o [CONTRIBUTING.md](CONTRIBUTING.md); ele cobre as poucas regras que o projeto leva a sério (motor independente de plataforma, só o mouse, todo texto traduzido). Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md). Achou um problema de segurança? Siga o [SECURITY.md](SECURITY.md) em vez de abrir uma issue pública.

## Licença

[MIT](LICENSE). Use, faça fork, coloque no ar.

## Agradecimentos

O Kamo se apoia em ótimos projetos de código aberto: Electron, React, Vite, Tailwind CSS, mediabunny, gifenc, o MCP TypeScript SDK, whisper.cpp (incluído no app; os modelos vêm do Hugging Face quando você pede) e as fontes Inter, Instrument Serif e JetBrains Mono. Os avisos de licença do que vai dentro do app estão em [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="Kamo sorrindo">
  <br><sub>Feito com paciência de camaleão. Agora vai lá gravar alguma coisa.</sub>
</p>
