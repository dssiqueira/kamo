<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <b>Deutsch</b> · <a href="README.fr.md">Français</a> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="Kamo, ein Chamäleon aus Scherenschnitt-Papier, zwischen Blättern">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>Aufnahme starten. Klicken. Stopp. Schon fertig geschnitten.</b><br>
  Ein kostenloser Open-Source-Bildschirmrekorder, der auf jeden Klick zoomt, deinen Mauszeiger glättet<br>
  und ein Video exportiert, das aussieht, als hätte jemand eine Stunde daran geschnitten. Du hast null Minuten gebraucht.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Lizenz: MIT" src="https://img.shields.io/badge/Lizenz-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Plattform: heute Windows, Mac und Chrome bald" src="https://img.shields.io/badge/Plattform-Windows%20%C2%B7%20Mac%20%26%20Chrome%20bald-2F6F68?style=flat-square">
  <img alt="Keine Telemetrie" src="https://img.shields.io/badge/Telemetrie-keine-A8D5A2?style=flat-square">
</p>

<h3 align="center">Jetzt für Windows verfügbar</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="Für Windows herunterladen" src="https://img.shields.io/badge/Download-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac: bald verfügbar" src="https://img.shields.io/badge/Mac-bald%20verf%C3%BCgbar-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Chrome-Erweiterung: bald verfügbar" src="https://img.shields.io/badge/Chrome-bald%20verf%C3%BCgbar-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>Sobald die Chrome-Erweiterung erscheint, läuft sie auch in Edge, Brave und Arc. Du kannst nicht warten? <a href="#aus-dem-quellcode-bauen">Bau sie aus dem Quellcode</a>.</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="Aufnahme einer Demo-App: Jeder Klick wird zu einem sanften Zoom auf die angeklickte Stelle">
</p>

> [!NOTE]
> **Kamo ist noch jung.** Die Windows-Version ist da, und unter Windows wird Kamo jeden Tag entwickelt und getestet. Die Mac-App und die Chrome-Erweiterung kommen bald. Die Installer sind noch nicht codesigniert. Neue Versionen erscheinen auf [GitHub Releases](https://github.com/dssiqueira/kamo/releases); wenn dir etwas Holpriges auffällt, [eröffne ein Issue](https://github.com/dssiqueira/kamo/issues).

> [!TIP]
> **Erster Start unter Windows.** Der Installer ist noch nicht codesigniert, deshalb meldet SmartScreen eventuell „Der Computer wurde durch Windows geschützt“. Klick auf **Weitere Informationen** und dann auf **Trotzdem ausführen**.

---

## Was Kamo anders macht

**Du schneidest nicht. Du nimmst auf.** Kamo merkt sich, wohin du klickst (nur die Maus, nie die Tastatur), und wenn du stoppst, hat das Video schon eine Kamera, die dem Geschehen folgt, einen Mauszeiger, der gleitet statt zu zittern, und einen Rahmen, der nach Design aussieht.

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="Nebeneinander: links die Rohaufnahme mit einem winzigen, zittrigen Mauszeiger; rechts dieselbe Aufnahme in Kamo, mit Zoom auf jeden Klick vor einem salbeigrünen Hintergrund">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>Aus Klicks werden Zooms.</b> Klicks, die nah beieinander liegen, teilen sich eine Einstellung, damit die Kamera nie hin und her springt. Jede Bewegung ist eine Feder (Steifigkeit 170, Dämpfung 26), nie ein lineares Gleiten.</td>
    <td width="50%" valign="top"><b>Ein Mauszeiger, der gleitet.</b> Kamo lässt den Systemzeiger aus der Aufnahme weg und zeichnet ihn mit derselben Feder aus deinem Mausweg neu. Größer, weicher und mit einer kleinen Welle bei jedem Klick.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Hintergrund, Abstand, Ecken und Schatten</b> sind von Anfang an aktiv. Wähl eine Vorlage, eine Volltonfarbe oder dein eigenes Bild.</td>
    <td width="50%" valign="top"><b>Alles lässt sich bearbeiten.</b> Zooms auf der Zeitleiste verschieben, dehnen oder löschen, Anfang und Ende kürzen. Deine manuellen Zooms werden nie überschrieben, wenn die Zooms neu erzeugt werden.</td>
  </tr>
</table>

### Eine Aufnahme, jedes Format

16:9 für YouTube, 1:1 für den Feed, 9:16 für Reels und Shorts, zusammen aus derselben Zeitleiste exportiert. MP4 bis 4K60 und GIF in einem einzigen Exportdurchgang, dazu Untertitel als `.srt`. Vorschau und Export teilen sich denselben Rendering-Code: Was du siehst, ist das, was du bekommst. Kein Wasserzeichen, kein Zeitlimit.

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="Dieselbe Aufnahme nebeneinander in 16:9, 1:1 und vertikalem 9:16 exportiert, mit der Kamera unter dem Bildschirm">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="Eine runde Webcam-Blase in der Ecke, die schrumpft, während die Kamera hineinzoomt">
      <br><b>Webcam-Blase.</b> Rund, quadratisch oder breit, in jeder Ecke oder genau dort, wohin du sie ziehst. Sie schrumpft, während die Kamera zoomt, und kommt danach zurück. In 9:16 kann sie zu einer eigenen Karte werden (Geteilt).
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="Untertitel in fünf Stilen: Fett, Kamo, Schreibmaschine, Neon und Marker">
      <br><b>Untertitel in 12 Stilen.</b> Direkt auf deinem Computer transkribiert: Das Transkriptionsprogramm ist schon eingebaut, und das Modell (Leicht, ~148 MB, oder Genau, ~488 MB) lädt erst von Hugging Face herunter, wenn du darum bittest. Korrigier ein Wort auf der Zeitleiste, und das Transkript zieht mit. Brenn sie ins Video ein oder exportier eine <code>.srt</code>.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="Die Aufnahme auf einem eigenen Hintergrundbild: ein Sonnenuntergang im Scherenschnitt-Stil">
      <br><b>Dein eigener Hintergrund.</b> Zieh ein PNG, JPG oder WebP hinein. Kamo kopiert es ins Projekt und schneidet es für jedes Format passend zu.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="Die Galerie der Untertitelstile im Editor neben einem Untertitel im Kamo-Stil in der Vorschau">
      </picture>
      <br><b>Wähl einen Look, keine Schriftart.</b> Schlicht, Fett, Kamo, Neon, Schreibmaschine, Kino und sechs weitere, unten oder in der Mitte, in drei Größen. Ein Klick, und die Vorschau ist aktuell.
    </td>
  </tr>
</table>

<sub>Alle Clips auf dieser Seite zeigen eine erfundene Demo-App, mit Kamo bearbeitet und exportiert und dann für GitHub zu einem GIF verkleinert. Die „Webcam“ ist ein gezeichnetes Chamäleon auf einem Canvas. Echten Bildschirmen oder Gesichtern ist nichts passiert.</sub>

## So funktioniert's

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="Vier Schritte: Einen Bildschirm, ein Fenster oder einen Bereich aufnehmen; Klicken, wobei Kamo die Maus aufzeichnet, aber nie die Tastatur; Zoom, bei dem jeder Klick zu einem Zoom mit Feder wird; Export als MP4, GIF und .srt in 16:9, 1:1 und 9:16">
</picture>

Starte auf der Startseite, über das Menü im Infobereich oder über die Sprungliste in der Windows-Taskleiste (auf dem Mac über das Dock-Menü): Kamo nimmt auf, was du zuletzt ausgewählt hast, nach einem 3-2-1-Countdown mit leisem Ticken, das du in den Einstellungen ausschalten kannst. Die Aufnahme beginnt in dem Moment, in dem der Countdown endet.

## Ein Rundgang durch die App

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="Kamos Startseite: Bildschirm, Fenster oder Bereich wählen, Mikrofon, Computerton und Kamera ein- und ausschalten und die letzten Projekte sehen">
      </picture>
      <br><b>Startseite.</b> Bildschirm, Fenster oder Bereich. Mikrofon, Computerton und Kamera haben je eine eigene Karte, die Rauschunterdrückung findest du in den Audioeinstellungen des Mikrofons. Deine Projekte und lokalen Playlists liegen direkt darunter.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="Der Editor: Live-Vorschau mit Zooms, einer Webcam-Blase, dem Stil-Panel und einer Zeitleiste mit Spuren für Zoom, Webcam und Untertitel">
      </picture>
      <br><b>Editor.</b> Öffnet sich, sobald du die Aufnahme stoppst. Live-Vorschau in der Mitte, Stil rechts, Zooms, Webcam und Untertitel auf der Zeitleiste. Bearbeitungen sind nicht destruktiv: Das Originalvideo wird nie angerührt.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="Der Bereichsrahmen über einer Demo-App, mit Feldern für Breite und Höhe und einer Schaltfläche Aufnehmen">
      </picture>
      <br><b>Bereich.</b> Ein Rahmen, den du über dem Bildschirm verschiebst und in der Größe änderst, auf den Pixel genau. Klicks außerhalb davon lösen nie einen Zoom aus.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="Die Willkommenstour: Kamo, das Chamäleon, sagt Klick auf Aufnehmen, neben einer Skizze der Aufnahmeoptionen">
      </picture>
      <br><b>Willkommenstour.</b> Kamo zeigt dir alles in drei Folien, in deiner Sprache. Danach hält es sich raus.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="Das Popup der Chrome-Erweiterung: Diesen Tab aufnehmen, mit Schaltern für Mikrofon, Tab-Ton und Kamera">
  <br><sub>Die Chrome-Erweiterung (bald verfügbar): ein Popup, ein Knopf. Während der Aufnahme pausiert und stoppt eine kleine Leiste in einem eigenen Fenster, und ein Klick auf das Symbol in der Symbolleiste stoppt ebenfalls.</sub>
</p>

## Desktop oder Erweiterung?

Dieselbe Engine, derselbe Editor, derselbe Export. Der Unterschied liegt darin, was sie aufnehmen können. Windows ist schon da; die Mac-App und die Erweiterung kommen bald.

| | Desktop-App<br><sub>Windows · Mac (Apple Silicon, bald)</sub> | Chrome-Erweiterung (bald)<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| Den ganzen Bildschirm aufnehmen | ✅ | — |
| Ein Fenster oder einen Bereich aufnehmen | ✅ | — |
| Einen Browser-Tab aufnehmen | ✅ (als Fenster) | ✅ |
| Mikrofon | ✅ | ✅ |
| Computerton / Tab-Ton | ✅ | ✅ (Tab-Ton) |
| Webcam-Blase und geteiltes 9:16 | ✅ | ✅ |
| Automatischer Zoom, Kamera mit Feder, weicher Mauszeiger, Zeitleiste | ✅ | ✅ |
| Hintergrundvorlagen und Volltonfarben | ✅ | ✅ |
| Eigenes Hintergrundbild | ✅ | noch nicht |
| Lokale Transkription und Untertitel | ✅ | — (nur Desktop) |
| MP4 und GIF in 16:9, 1:1, 9:16 exportieren | ✅ | ✅ |
| Export in 4K und 60fps | ✅ | — (Tabs nehmen bis 1080p30 auf) |
| Wo die Projekte liegen | Ein Ordner auf deiner Festplatte | Im Browser (OPFS) |
| Lesbar für den lokalen MCP-Server | ✅ | — |

## Privat von Grund auf

- **100 % lokal.** Aufnehmen, Bearbeiten und Exportieren funktionieren offline und ohne Konto.
- **Keine Telemetrie. Keine Analytics.** Auch nicht „anonymisiert“. Gar nichts.
- **Nichts verlässt deinen Rechner, außer du entscheidest dich, es zu senden.**
- **Nur die Maus, nie die Tastatur.** Kamo zeichnet Klicks und Bewegungen auf. Tastenanschläge werden nicht erfasst, und die Erweiterung liest nie die Seite, die du aufnimmst. Die CI prüft das bei jedem Pull Request.
- **Kleiner Download.** Die App nimmt auf, bearbeitet und exportiert, und das kleine Transkriptionsprogramm ist schon eingebaut. Das Sprachmodell nicht: Es kommt direkt von Hugging Face, dem offiziellen Zuhause der whisper.cpp-Modelle, und zwar nur, wenn du darum bittest, auf eine Version festgelegt und per SHA-256 geprüft. Kein Kamo-Server ist beteiligt. (Hugging Face ist vom chinesischen Festland aus noch nicht erreichbar, deshalb lässt sich die Transkription dort vorerst nicht einrichten.)
- **Nicht destruktiv.** Deine Rohaufnahme wird nie verändert; jede Bearbeitung steht in `project.json`.

## Nutz deine Aufnahmen mit KI

Kamo bringt einen kleinen **lokalen MCP-Server** mit, damit Claude Code (oder jeder andere MCP-Client) mit deinen Aufnahmen arbeiten kann: Transkripte, die Klick-Zeitleiste, Zooms und alle 5 Sekunden ein Referenz-Screenshot.

> „Such die Aufnahme, in der ich die Abrechnungseinstellungen erklärt habe, und schreib daraus eine Schritt-für-Schritt-Anleitung.“

Er ist **schreibgeschützt und hat keinen Netzwerkzugriff**: Er liest deinen Projektordner und antwortet dem Agenten, den du verbunden hast. Sonst nichts.

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

Die Desktop-App zeigt dir den genauen Befehl mit deinem Ordner schon eingetragen unter **Einstellungen → Mit einem Agenten verbinden**. Tools, Beispiele und andere Clients: [apps/mcp/README.md](apps/mcp/README.md) (auf Englisch).

## Aus dem Quellcode bauen

Du brauchst Node 24+ und pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

Zum Aufnehmen auf dem Desktop brauchst du das native Capture-Hilfsprogramm: Rust und die Visual Studio Build Tools unter Windows, Xcode auf dem Mac. Siehe [`apps/desktop/native`](apps/desktop/native). Gerade nichts zum Aufnehmen da? [`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project) erzeugt ein realistisches Beispielprojekt, das du im Editor öffnen kannst (es ist die Demo „Acme Studio“ aus den Clips oben).

## Architektur

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="Architektur: Die Desktop-App und die Chrome-Erweiterung nutzen beide packages/ui, das wiederum packages/core nutzt. Der lokale MCP-Server liest den Projektordner, den die Desktop-App schreibt.">
</picture>

Ein pnpm-Monorepo, TypeScript überall.

- **`packages/core`** ist die Engine: Projektformat, Zoom-Erzeugung, virtuelle Kamera, weicher Mauszeiger, Frame-Rendering und Export mit WebCodecs (MP4 und GIF). Vorschau und Export laufen mit demselben Code.
- **`packages/ui`** ist der Editor mit Zeitleiste und Panels (React).
- Keines von beiden weiß, wo es läuft: kein Electron, kein Node und kein `chrome.*` darin. Aufnahme, Ereignisse, Speicher und Dateien kommen über Schnittstellen herein, deshalb nutzt die Erweiterung beide unverändert.
- **`apps/desktop`** ist Electron, mit kleinen nativen Hilfsprogrammen für die Aufnahme: Rust (Windows Graphics Capture) und Swift (ScreenCaptureKit).
- **`apps/extension`** ist Manifest V3: Tab-Aufnahme in einem Offscreen-Dokument, ein Content-Script nur für die Maus, Projekte in OPFS.
- **`apps/mcp`** ist der lokale MCP-Server: stdio, schreibgeschützt, kein Netzwerk.

Neu hier, Mensch oder Agent? Fang bei [AGENTS.md](AGENTS.md) an. Von dort geht es zu den Produktdokumenten, Entscheidungen und dem Plan in [docs/](docs/). Die Oberfläche folgt [DESIGN.md](DESIGN.md). Diese Dokumente sind auf Englisch.

## Sprachen

English, Português (Brasil), Español, 简体中文, 日本語, Deutsch, Français und 한국어, passend zu deinem System ausgewählt und jederzeit umschaltbar. Datum, Zahlen und Dauern werden im Format deiner Sprache angezeigt. Muttersprachler: Ein Review der Übersetzungen ist einer der nützlichsten Beiträge überhaupt.

## Roadmap

Der Plan Schritt für Schritt steht in [docs/plan.md](docs/plan.md), jede Funktion mit ihren Akzeptanzkriterien in [docs/features.md](docs/features.md). Als Nächstes: ein getesteter Mac-Build, signierte Installer, der Eintrag im Chrome Web Store und `@kamo/mcp` auf npm. Ein Paket für den Microsoft Store ist ebenfalls in Vorbereitung. Eine optionale Cloud zum Teilen von Links ist geplant; die App selbst bleibt kostenlos und vollständig.

## Mitmachen

Issues und Pull Requests sind willkommen. Lies bitte zuerst [CONTRIBUTING.md](CONTRIBUTING.md); dort stehen die wenigen Regeln, an denen das Projekt festhält (plattformunabhängige Engine, nur die Maus, jeder Text übersetzt). Wer mitmacht, stimmt dem [Verhaltenskodex](CODE_OF_CONDUCT.md) zu. Eine Sicherheitslücke gefunden? Folge bitte [SECURITY.md](SECURITY.md), statt ein öffentliches Issue zu eröffnen.

## Lizenz

[MIT](LICENSE). Nutz es, forke es, veröffentliche es.

## Danksagungen

Kamo steht auf den Schultern großartiger Open-Source-Arbeit: Electron, React, Vite, Tailwind CSS, mediabunny, gifenc, das MCP TypeScript SDK, whisper.cpp (in die App eingebaut; seine Modelle laden von Hugging Face herunter, wenn du darum bittest) sowie die Schriften Inter, Instrument Serif und JetBrains Mono. Die Lizenzhinweise für alles, was in der App steckt, findest du in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="Kamo lächelt">
  <br><sub>Mit der Geduld eines Chamäleons gemacht. Und jetzt nimm etwas auf.</sub>
</p>
