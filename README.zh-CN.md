<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a> · <b>简体中文</b> · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="Kamo，一只剪纸风格的变色龙，站在树叶之间">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>点录制，点几下，停止。视频已经剪好了。</b><br>
  一款免费、开源的录屏工具：每次点击自动放大，光标顺滑移动，<br>
  导出的视频看起来像有人花了一小时精心剪辑。而你一分钟都没花。
</p>

<p align="center">
  <a href="LICENSE"><img alt="许可证：MIT" src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="平台：目前支持 Windows，Mac 和 Chrome 即将推出" src="https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%C2%B7%20Mac%20%E5%92%8C%20Chrome%20%E5%8D%B3%E5%B0%86%E6%8E%A8%E5%87%BA-2F6F68?style=flat-square">
  <img alt="无遥测" src="https://img.shields.io/badge/%E9%81%A5%E6%B5%8B-%E6%97%A0-A8D5A2?style=flat-square">
</p>

<h3 align="center">Windows 版现已推出</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="下载 Windows 版" src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac：即将推出" src="https://img.shields.io/badge/Mac-%E5%8D%B3%E5%B0%86%E6%8E%A8%E5%87%BA-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Chrome 扩展：即将推出" src="https://img.shields.io/badge/Chrome-%E5%8D%B3%E5%B0%86%E6%8E%A8%E5%87%BA-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>Chrome 扩展推出后，同样可以在 Edge、Brave 和 Arc 中使用。等不及了？<a href="#从源码构建">从源码构建</a>。</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="一段演示应用的录制：每次点击都会变成对点击位置的平滑放大">
</p>

> [!NOTE]
> **Kamo 还很年轻。** Windows 版已经发布，Kamo 每天都在 Windows 上开发和测试。Mac 版应用和 Chrome 扩展即将推出。安装程序目前还没有代码签名。新版本发布在 [GitHub Releases](https://github.com/dssiqueira/kamo/releases)；如果遇到不顺手的地方，欢迎[提交 issue](https://github.com/dssiqueira/kamo/issues)。

> [!TIP]
> **在 Windows 上首次启动。** 由于安装程序还没有代码签名，SmartScreen 可能会提示“Windows 已保护你的电脑”。点击 **更多信息**，然后点击 **仍要运行**。

---

## 有什么不一样

**你不用剪辑，只管录制。** Kamo 会记下你点击的位置（只看鼠标，从不记录键盘）。录制一停，视频里就已经有了跟随操作的镜头、顺滑而不抖动的光标，以及像精心设计过的画面框。

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="左右对比：左边是原始录制，光标又小又抖；右边是同一段在 Kamo 里的效果，在鼠尾草绿背景上对每次点击自动放大">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>点击即缩放。</b> 相邻的点击会合并成同一个镜头，画面不会来回跳。每次移动都使用弹簧动画（刚度 170，阻尼 26），绝不是生硬的线性滑动。</td>
    <td width="50%" valign="top"><b>顺滑的光标。</b> Kamo 不把系统光标录进视频，而是根据鼠标轨迹用同样的弹簧动画重新绘制。更大、更顺滑，每次点击还有一圈涟漪。</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>背景、内边距、圆角和阴影</b>默认就已开启。可以选一个预设、一种纯色，或者你自己的图片。</td>
    <td width="50%" valign="top"><b>一切都可编辑。</b> 在时间轴上拖动、拉伸或删除缩放，剪掉首尾。重新生成缩放时，你手动设置的缩放永远不会被覆盖。</td>
  </tr>
</table>

### 一次录制，所有格式

16:9 发 YouTube，1:1 发信息流，9:16 发 Reels 和 Shorts，从同一条时间轴一起导出。MP4 最高 4K60，还有 GIF 和 `.srt` 字幕。预览和导出使用同一套渲染代码，所见即所得。没有水印，没有时长限制。

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="同一段录制并排导出为 16:9、1:1 和竖屏 9:16，摄像头画面位于屏幕下方">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="角落里的圆形摄像头气泡，镜头放大时会缩小">
      <br><b>摄像头气泡。</b> 圆形、方形或宽屏，放在任意角落，或拖到你想要的位置。镜头放大时它会缩小，之后再恢复。在 9:16 中，它还可以变成单独的卡片（分屏）。
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="五种样式的字幕：醒目、Kamo、打字机、霓虹和荧光笔">
      <br><b>12 种字幕样式。</b> 在你的电脑上本地转录（使用可选扩展包，只在你需要时才下载）。在时间轴上改一个词，转录文本也会跟着更新。可以把字幕烧录进画面，也可以导出 <code>.srt</code>。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="录制画面衬在一张自定义的剪纸风日落壁纸上">
      <br><b>你自己的背景。</b> 拖入一张 PNG、JPG 或 WebP。Kamo 会把它复制到项目中，并裁剪成适合每种格式的尺寸。
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="编辑器中的字幕样式库，旁边是预览中 Kamo 样式的字幕">
      </picture>
      <br><b>挑的是风格，不是字体。</b> 简洁、醒目、Kamo、霓虹、打字机、电影，还有另外六种，可放在底部或中间，有三种大小。点一下，预览立即更新。
    </td>
  </tr>
</table>

<sub>本页所有片段都来自一个虚构的演示应用，由 Kamo 编辑和导出，再压缩成 GIF 放到 GitHub 上。“摄像头”画面是在 canvas 上绘制的一只插画变色龙。没有任何真实屏幕或真人面孔受到伤害。</sub>

## 工作原理

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="四个步骤：录制屏幕、窗口或选区；点击，Kamo 只记录鼠标，从不记录键盘；缩放，每次点击都变成弹簧缩放；导出为 16:9、1:1 和 9:16 的 MP4、GIF 和 .srt">
</picture>

## 应用一览

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="Kamo 主页：选择屏幕、窗口或选择，开关麦克风、电脑声音和摄像头，并查看最近的项目">
      </picture>
      <br><b>主页。</b> 屏幕、窗口或选择。麦克风、电脑声音和摄像头各一个开关。你的项目和本地播放列表就在下方。
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="编辑器：带缩放的实时预览、摄像头气泡、样式面板，以及包含缩放、摄像头和字幕轨道的时间轴">
      </picture>
      <br><b>编辑器。</b> 中间是实时预览，右边是样式，时间轴上是缩放、摄像头和字幕。编辑是非破坏性的：原始视频永远不会被改动。
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="演示应用上方的选区框，带有宽度和高度输入框以及录制按钮">
      </picture>
      <br><b>选择。</b> 一个可以在屏幕上移动和调整大小的框，尺寸精确到像素。框外的点击不会产生缩放。
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="欢迎导览：变色龙 Kamo 说“点录制”，旁边是录制选项的草图">
      </picture>
      <br><b>欢迎导览。</b> Kamo 用三页带你上手，说的是你的语言。之后就不再打扰你。
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="Chrome 扩展的弹出窗口：录制此标签页，带有麦克风、标签页声音和摄像头开关">
  <br><sub>Chrome 扩展（即将推出）：一个弹窗，一个按钮。</sub>
</p>

## 桌面版还是扩展？

同一个引擎，同一个编辑器，同样的导出。区别在于它们能录什么。Windows 版现已推出；Mac 版应用和扩展即将推出。

| | 桌面应用<br><sub>Windows · Mac（Apple 芯片，即将推出）</sub> | Chrome 扩展（即将推出）<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| 录制整个屏幕 | ✅ | — |
| 录制单个窗口或选区 | ✅ | — |
| 录制浏览器标签页 | ✅（作为窗口） | ✅ |
| 麦克风 | ✅ | ✅ |
| 电脑声音 / 标签页声音 | ✅ | ✅（标签页声音） |
| 摄像头气泡和 9:16 分屏 | ✅ | ✅ |
| 自动缩放、弹簧镜头、顺滑光标、时间轴 | ✅ | ✅ |
| 预设背景和纯色 | ✅ | ✅ |
| 自定义背景图片 | ✅ | 暂不支持 |
| 本地转录和字幕 | ✅ | —（仅桌面版） |
| 以 16:9、1:1、9:16 导出 MP4 和 GIF | ✅ | ✅ |
| 4K 和 60fps 导出 | ✅ | —（标签页最高录制 1080p30） |
| 项目存放位置 | 你磁盘上的一个文件夹 | 浏览器内部（OPFS） |
| 可被本地 MCP 服务器读取 | ✅ | — |

## 隐私优先

- **100% 本地。** 录制、编辑和导出都可以离线完成，无需账号。
- **没有遥测，没有数据分析。** 不是“匿名化”，是完全没有。
- **除非你主动发送，否则没有任何东西会离开你的电脑。**
- **只看鼠标，从不碰键盘。** Kamo 记录点击和移动，不捕获按键，扩展也从不读取你录制的网页内容。CI 会在每个 pull request 上检查这一点。
- **下载很轻量。** 应用只负责录制、编辑和导出。转录模型这类大文件是可选扩展包，只在你需要时才下载。
- **非破坏性编辑。** 原始录制永远不会被修改；所有编辑都保存在 `project.json` 中。

## 让 AI 用上你的录制

Kamo 自带一个小巧的**本地 MCP 服务器**，让 Claude Code（或任何 MCP 客户端）可以和你录制的内容对话：转录文本、点击时间线、缩放，以及每 5 秒一张的参考截图。

> “找到我讲解账单设置的那段录制，并据此写一份分步骤的文档。”

它是**只读的，不访问网络**：只读取你的项目文件夹，并回答你所连接的智能体。仅此而已。

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

桌面应用会在 **设置 → 连接到智能体** 中显示完整的命令，并已填好你的文件夹路径。工具、示例和其他客户端的说明见 [apps/mcp/README.md](apps/mcp/README.md)（英文）。

## 从源码构建

需要 Node 24+ 和 pnpm（`npm i -g pnpm`）。

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

在桌面端录制需要原生捕获辅助程序：Windows 上需要 Rust 和 Visual Studio Build Tools，Mac 上需要 Xcode。详见 [`apps/desktop/native`](apps/desktop/native)。手边没有现成的录制环境？[`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project) 会生成一个逼真的示例项目，可以直接在编辑器中打开（就是上面片段里的 “Acme Studio” 演示）。

## 架构

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="架构：桌面应用和 Chrome 扩展都使用 packages/ui，而 packages/ui 使用 packages/core。本地 MCP 服务器读取桌面应用写入的项目文件夹。">
</picture>

一个 pnpm monorepo，全部使用 TypeScript。

- **`packages/core`** 是引擎：项目格式、缩放生成、虚拟镜头、顺滑光标、帧渲染和 WebCodecs 导出（MP4 和 GIF）。预览和导出运行的是同一套代码。
- **`packages/ui`** 是编辑器、时间轴和各个面板（React）。
- 两者都不知道自己运行在哪里：内部没有 Electron、Node 或 `chrome.*`。捕获、事件、存储和文件都通过接口传入，所以扩展可以原样复用它们。
- **`apps/desktop`** 基于 Electron，并带有用于捕获的小型原生辅助程序：Rust（Windows Graphics Capture）和 Swift（ScreenCaptureKit）。
- **`apps/extension`** 基于 Manifest V3：在 offscreen 文档中捕获标签页，content script 只处理鼠标，项目保存在 OPFS 中。
- **`apps/mcp`** 是本地 MCP 服务器：stdio、只读、不联网。

刚来这里，不管你是人还是智能体？从 [AGENTS.md](AGENTS.md) 开始。它会带你找到 [docs/](docs/) 中的产品文档、决策记录和计划。界面遵循 [DESIGN.md](DESIGN.md)。这些文档都是英文的。

## 语言

支持 English、Português (Brasil)、Español、简体中文、日本語、Deutsch、Français 和 한국어，默认跟随系统，随时可以切换。日期、数字和时长都会按你的语言格式显示。母语使用者们：帮忙审校翻译是最有价值的贡献之一。

## 路线图

分步计划见 [docs/plan.md](docs/plan.md)，每个功能及其验收标准见 [docs/features.md](docs/features.md)。接下来：经过测试的 Mac 版、签名安装程序、Chrome 网上应用店上架，以及在 npm 上发布 `@kamo/mcp`。一个用于分享链接的可选云服务也在计划中；应用本身会一直保持免费且功能完整。

## 参与贡献

欢迎提交 issue 和 pull request。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，里面介绍了项目坚持的几条规则（引擎与平台无关、只看鼠标、所有文字都要翻译）。参与即表示你同意遵守[行为准则](CODE_OF_CONDUCT.md)。发现了安全问题？请按照 [SECURITY.md](SECURITY.md) 处理，不要公开提交 issue。

## 许可证

[MIT](LICENSE)。随便用，随便 fork，放心发布。

## 致谢

Kamo 建立在许多优秀的开源项目之上：Electron、React、Vite、Tailwind CSS、mediabunny、gifenc、MCP TypeScript SDK、whisper.cpp（内置于应用中；模型在你需要时从 Hugging Face 下载），以及 Inter、Instrument Serif 和 JetBrains Mono 字体。应用内附带内容的许可声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="微笑的 Kamo">
  <br><sub>以变色龙般的耐心打造。现在，去录点什么吧。</sub>
</p>
