<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <b>日本語</b>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="葉っぱの中に立つ、切り絵風のカメレオン Kamo">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>録画して、クリックして、止めるだけ。もう編集済み。</b><br>
  無料でオープンソースの画面録画アプリ。クリックするたびに自動でズームし、カーソルをなめらかにして、<br>
  1 時間かけて編集したような動画を書き出します。あなたがかけた時間は、ゼロ分です。
</p>

<p align="center">
  <a href="LICENSE"><img alt="ライセンス：MIT" src="https://img.shields.io/badge/%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="対応環境：現在は Windows、Mac と Chrome は近日公開" src="https://img.shields.io/badge/%E5%AF%BE%E5%BF%9C-Windows%20%C2%B7%20Mac%20%E3%81%A8%20Chrome%20%E3%81%AF%E8%BF%91%E6%97%A5%E5%85%AC%E9%96%8B-2F6F68?style=flat-square">
  <img alt="テレメトリなし" src="https://img.shields.io/badge/%E3%83%86%E3%83%AC%E3%83%A1%E3%83%88%E3%83%AA-%E3%81%AA%E3%81%97-A8D5A2?style=flat-square">
</p>

<h3 align="center">Windows 版、公開中</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="Windows 版をダウンロード" src="https://img.shields.io/badge/%E3%83%80%E3%82%A6%E3%83%B3%E3%83%AD%E3%83%BC%E3%83%89-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac：近日公開" src="https://img.shields.io/badge/Mac-%E8%BF%91%E6%97%A5%E5%85%AC%E9%96%8B-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Chrome 拡張機能：近日公開" src="https://img.shields.io/badge/Chrome-%E8%BF%91%E6%97%A5%E5%85%AC%E9%96%8B-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>Chrome 拡張機能は公開後、Edge、Brave、Arc でも使えます。待ちきれない方は<a href="#ソースからビルド">ソースからビルド</a>できます。</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="デモアプリの録画：クリックするたびに、その場所へなめらかにズームします">
</p>

> [!NOTE]
> **Kamo はまだ生まれたばかりです。** Windows 版は公開済みで、Kamo は毎日 Windows 上で開発・テストされています。Mac アプリと Chrome 拡張機能は近日公開予定です。インストーラーにはまだコード署名がありません。ビルドは [GitHub Releases](https://github.com/dssiqueira/kamo/releases) で公開しています。気になる点があれば [issue を立ててください](https://github.com/dssiqueira/kamo/issues)。

> [!TIP]
> **Windows での初回起動について。** インストーラーにまだコード署名がないため、SmartScreen に「Windows によって PC が保護されました」と表示されることがあります。**詳細情報** をクリックしてから **実行** を選んでください。

---

## ここが違う

**編集はしない。録画するだけ。** Kamo はあなたがクリックした場所を記録します（マウスだけで、キーボードは一切記録しません）。録画を止めた時点で、動画にはもう、操作を追いかけるカメラ、震えずにすべるように動くカーソル、そしてデザインされたようなフレームが入っています。

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="左右の比較：左は小さく震えるカーソルが映った元の録画、右は同じテイクを Kamo で仕上げたもので、セージ色の背景の上でクリックごとにズームしています">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>クリックがズームに。</b> 近くのクリックはひとつのショットにまとめるので、カメラがあちこち跳ねません。動きはすべてスプリング（剛性 170、減衰 26）で、直線的なスライドは使いません。</td>
    <td width="50%" valign="top"><b>すべるように動くカーソル。</b> Kamo はシステムのカーソルを録画に入れず、マウスの軌跡から同じスプリングで描き直します。大きく、なめらかに、クリックするたびに波紋が広がります。</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>背景、余白、角の丸み、影</b>は最初からオン。プリセット、単色、自分の画像から選べます。</td>
    <td width="50%" valign="top"><b>すべて編集できます。</b> タイムライン上でズームをドラッグ、伸縮、削除し、前後をカットできます。ズームを再生成しても、手動で設定したズームは上書きされません。</td>
  </tr>
</table>

### 1 回の録画で、すべての形式に

YouTube 向けの 16:9、フィード向けの 1:1、Reels や Shorts 向けの 9:16 を、同じタイムラインからまとめて書き出せます。最大 4K60 の MP4、GIF、`.srt` 字幕に対応。プレビューと書き出しは同じレンダリングコードを使うので、見たとおりの仕上がりになります。透かしなし、時間制限なし。

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="同じ録画を 16:9、1:1、縦長の 9:16（画面の下にカメラ）で並べて書き出した例">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="隅に置かれた丸い Webカメラのバブル。カメラがズームする間は小さくなります">
      <br><b>Webカメラのバブル。</b> 丸、四角、横長から選べて、四隅のどこにでも、ドラッグした好きな場所にも置けます。カメラがズームしている間は小さくなり、終わると元に戻ります。9:16 では独立したカードにもできます（分割）。
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="5 つのスタイルの字幕：太字、Kamo、タイプライター、ネオン、マーカー">
      <br><b>12 種類の字幕スタイル。</b> 文字起こしはあなたのパソコン上で行います（必要なときだけダウンロードするオプションパック）。タイムラインで単語を直せば、文字起こしも追従します。動画に焼き込むことも、<code>.srt</code> で書き出すこともできます。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="切り絵風の夕焼けの壁紙を背景にした録画">
      <br><b>自分だけの背景。</b> PNG、JPG、WebP をドロップするだけ。Kamo が画像をプロジェクトにコピーし、どの形式にも合うようにトリミングします。
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="エディターの字幕スタイル一覧と、プレビュー上の Kamo スタイルの字幕">
      </picture>
      <br><b>選ぶのはフォントではなく、雰囲気。</b> シンプル、太字、Kamo、ネオン、タイプライター、シネマなど全 12 種類。位置は下か中央、サイズは 3 段階。クリックひとつでプレビューに反映されます。
    </td>
  </tr>
</table>

<sub>このページのクリップはすべて架空のデモアプリを Kamo で編集・書き出しし、GitHub 用に GIF に縮小したものです。「Webカメラ」の映像は canvas に描いたカメレオンのイラストです。実在の画面や人の顔は一切使っていません。</sub>

## しくみ

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="4 つのステップ：画面、ウィンドウ、選択範囲を録画。クリックすると、Kamo はマウスだけを記録し、キーボードは記録しません。ズームでは、クリックごとにスプリングでズーム。書き出しでは、16:9、1:1、9:16 の MP4、GIF、.srt に">
</picture>

## アプリを見てみよう

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="Kamo のホーム画面：画面、ウィンドウ、選択から選び、マイク、パソコンの音、カメラを切り替え、最近のプロジェクトを確認できます">
      </picture>
      <br><b>ホーム。</b> 画面、ウィンドウ、選択の 3 つから選びます。マイク、パソコンの音、カメラはそれぞれワンタッチで切り替え。プロジェクトとローカルのプレイリストはすぐ下に並びます。
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="エディター：ズーム付きのライブプレビュー、Webカメラのバブル、スタイルパネル、そしてズーム・Webカメラ・字幕のトラックが並ぶタイムライン">
      </picture>
      <br><b>エディター。</b> 中央にライブプレビュー、右にスタイル、タイムラインにズーム、Webカメラ、字幕。非破壊編集なので、元の動画には一切手を加えません。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="デモアプリの上に置いた選択フレーム。幅と高さの入力欄と録画ボタン付き">
      </picture>
      <br><b>選択。</b> 画面上で動かしたりサイズを変えたりできるフレームで、ピクセル単位で正確にサイズを指定できます。フレームの外のクリックではズームしません。
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="ようこそツアー：カメレオンの Kamo が「録画を押して」と話し、隣に録画オプションのスケッチ">
      </picture>
      <br><b>ようこそツアー。</b> Kamo が 3 枚のスライドで、あなたの言語で案内します。そのあとは邪魔しません。
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="Chrome 拡張機能のポップアップ：「このタブを録画」と、マイク、タブの音声、カメラの切り替え">
  <br><sub>Chrome 拡張機能（近日公開）：ポップアップひとつ、ボタンひとつ。</sub>
</p>

## デスクトップ版か、拡張機能か

エンジンも、エディターも、書き出しも同じ。違うのは録画できるものです。Windows 版は公開中、Mac アプリと拡張機能は近日公開です。

| | デスクトップアプリ<br><sub>Windows · Mac（Apple シリコン、近日公開）</sub> | Chrome 拡張機能（近日公開）<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| 画面全体を録画 | ✅ | — |
| ウィンドウや選択範囲を録画 | ✅ | — |
| ブラウザのタブを録画 | ✅（ウィンドウとして） | ✅ |
| マイク | ✅ | ✅ |
| パソコンの音 / タブの音声 | ✅ | ✅（タブの音声） |
| Webカメラのバブルと 9:16 の分割 | ✅ | ✅ |
| 自動ズーム、スプリングのカメラ、なめらかなカーソル、タイムライン | ✅ | ✅ |
| 背景プリセットと単色 | ✅ | ✅ |
| 自分の画像を背景に | ✅ | 未対応 |
| ローカルでの文字起こしと字幕 | ✅ | —（デスクトップのみ） |
| 16:9、1:1、9:16 で MP4 と GIF を書き出し | ✅ | ✅ |
| 4K・60fps の書き出し | ✅ | —（タブの録画は最大 1080p30） |
| プロジェクトの保存先 | ディスク上のフォルダー | ブラウザの中（OPFS） |
| ローカル MCP サーバーからの読み取り | ✅ | — |

## プライバシー重視の設計

- **100% ローカル。** 録画、編集、書き出しはすべてオフラインで、アカウントなしで使えます。
- **テレメトリなし。アナリティクスなし。** 「匿名化」でもありません。一切なしです。
- **あなたが送ると決めない限り、何もパソコンの外に出ません。**
- **マウスだけ、キーボードは記録しません。** Kamo が記録するのはクリックと動きだけ。キー入力は取得せず、拡張機能が録画中のページの内容を読むこともありません。この点は pull request ごとに CI でチェックしています。
- **軽いダウンロード。** アプリがするのは録画、編集、書き出しだけ。文字起こしモデルのような重いものはオプションパックで、必要なときにだけダウンロードします。
- **非破壊編集。** 元の録画は決して変更されません。編集内容はすべて `project.json` に保存されます。

## 録画を AI で活用する

Kamo には小さな**ローカル MCP サーバー**が付いていて、Claude Code（またはほかの MCP クライアント）が録画内容とやり取りできます。文字起こし、クリックのタイムライン、ズーム、そして 5 秒ごとの参照用スクリーンショットにアクセスできます。

> 「請求設定について説明した録画を探して、それをもとに手順書を書いて。」

**読み取り専用で、ネットワークにはアクセスしません。** プロジェクトフォルダーを読んで、あなたが接続したエージェントに答えるだけです。

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

デスクトップアプリの **設定 → エージェントに接続** に、フォルダーが入力済みのコマンドがそのまま表示されます。ツール、使用例、ほかのクライアントについては [apps/mcp/README.md](apps/mcp/README.md)（英語）をご覧ください。

## ソースからビルド

Node 24 以上と pnpm（`npm i -g pnpm`）が必要です。

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

デスクトップで録画するには、ネイティブのキャプチャヘルパーが必要です。Windows では Rust と Visual Studio Build Tools、Mac では Xcode を用意してください。詳しくは [`apps/desktop/native`](apps/desktop/native) を参照。すぐに録画できる環境がなくても、[`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project) でリアルなサンプルプロジェクトを作ってエディターで開けます（上のクリップの「Acme Studio」デモがそれです）。

## アーキテクチャ

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="アーキテクチャ：デスクトップアプリと Chrome 拡張機能はどちらも packages/ui を使い、packages/ui は packages/core を使います。ローカル MCP サーバーは、デスクトップアプリが書き込んだプロジェクトフォルダーを読み取ります。">
</picture>

pnpm のモノレポで、すべて TypeScript です。

- **`packages/core`** はエンジンです。プロジェクト形式、ズームの生成、仮想カメラ、なめらかなカーソル、フレームのレンダリング、WebCodecs による書き出し（MP4 と GIF）を担います。プレビューと書き出しは同じコードで動きます。
- **`packages/ui`** はエディター、タイムライン、各パネル（React）です。
- どちらも自分がどこで動いているかを知りません。中には Electron も Node も `chrome.*` もありません。キャプチャ、イベント、保存、ファイルはインターフェース経由で受け取るので、拡張機能も両方をそのまま再利用できます。
- **`apps/desktop`** は Electron で、キャプチャ用の小さなネイティブヘルパーを備えています。Rust（Windows Graphics Capture）と Swift（ScreenCaptureKit）です。
- **`apps/extension`** は Manifest V3 です。offscreen ドキュメントでのタブキャプチャ、マウスだけを扱う content script、OPFS に保存されるプロジェクトで構成されています。
- **`apps/mcp`** はローカル MCP サーバーです。stdio、読み取り専用、ネットワークなし。

はじめての方は、人間でもエージェントでも [AGENTS.md](AGENTS.md) から読んでください。[docs/](docs/) にあるプロダクトのドキュメント、決定事項、計画へ案内してくれます。UI は [DESIGN.md](DESIGN.md) に従っています。これらのドキュメントは英語です。

## 言語

English、Português (Brasil)、Español、简体中文、日本語、Deutsch、Français、한국어に対応。システムの設定に合わせて選ばれ、いつでも切り替えられます。日付、数値、時間の長さはあなたの言語の形式で表示されます。ネイティブスピーカーの方へ：翻訳のレビューは、いちばん役に立つ貢献のひとつです。

## ロードマップ

ステップごとの計画は [docs/plan.md](docs/plan.md) に、各機能と受け入れ基準は [docs/features.md](docs/features.md) にあります。次の予定は、実機でテストした Mac 版、署名付きインストーラー、Chrome ウェブストアへの掲載、npm での `@kamo/mcp` の公開です。リンクで共有するためのオプションのクラウドも計画中ですが、アプリ自体は今後も無料で、すべての機能が使えます。

## コントリビュート

issue や pull request は大歓迎です。まずは [CONTRIBUTING.md](CONTRIBUTING.md) を読んでください。このプロジェクトが大切にしているいくつかのルール（プラットフォームに依存しないエンジン、マウスのみ、すべての文言を翻訳）がまとめてあります。参加することで、[行動規範](CODE_OF_CONDUCT.md)に同意したものとみなされます。セキュリティの問題を見つけた場合は、公開の issue ではなく [SECURITY.md](SECURITY.md) の手順に従ってください。

## ライセンス

[MIT](LICENSE)。自由に使って、フォークして、リリースしてください。

## 謝辞

Kamo は優れたオープンソースの成果の上に成り立っています：Electron、React、Vite、Tailwind CSS、mediabunny、gifenc、MCP TypeScript SDK、whisper.cpp（オプションの文字起こしパックに含まれます）、そして Inter、Instrument Serif、JetBrains Mono の各書体。アプリに同梱しているもののライセンス表記は [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) にあります。

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="笑顔の Kamo">
  <br><sub>カメレオンの根気でつくりました。さあ、何か録画してみましょう。</sub>
</p>
