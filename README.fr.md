<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.de.md">Deutsch</a> · <b>Français</b> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="Kamo, un caméléon en papier découpé, au milieu des feuilles">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>Lancez l'enregistrement. Cliquez. Arrêtez. C'est déjà monté.</b><br>
  Un enregistreur d'écran gratuit et open source qui zoome sur chaque clic, adoucit votre curseur<br>
  et exporte une vidéo qui semble avoir demandé une heure de montage. Vous y avez passé zéro minute.
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence : MIT" src="https://img.shields.io/badge/licence-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Plateforme : Windows aujourd'hui, Mac et Chrome bientôt" src="https://img.shields.io/badge/plateforme-Windows%20%C2%B7%20Mac%20%26%20Chrome%20bient%C3%B4t-2F6F68?style=flat-square">
  <img alt="Aucune télémétrie" src="https://img.shields.io/badge/t%C3%A9l%C3%A9m%C3%A9trie-aucune-A8D5A2?style=flat-square">
</p>

<h3 align="center">Disponible dès maintenant sur Windows</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="Télécharger pour Windows" src="https://img.shields.io/badge/T%C3%A9l%C3%A9charger-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac : bientôt disponible" src="https://img.shields.io/badge/Mac-bient%C3%B4t-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Extension Chrome : bientôt disponible" src="https://img.shields.io/badge/Chrome-bient%C3%B4t-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>À sa sortie, l'extension Chrome fonctionnera aussi dans Edge, Brave et Arc. Vous ne pouvez pas attendre ? <a href="#compiler-depuis-les-sources">Compilez-la depuis les sources</a>.</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="Enregistrement d'une app de démonstration : chaque clic devient un zoom fluide sur l'endroit cliqué">
</p>

> [!NOTE]
> **Kamo est tout jeune.** La version Windows est sortie, et c'est sous Windows que Kamo est développé et testé tous les jours. L'app Mac et l'extension Chrome arrivent bientôt. Les installateurs ne sont pas encore signés. Les versions sont publiées sur [GitHub Releases](https://github.com/dssiqueira/kamo/releases) ; si quelque chose accroche, [ouvrez une issue](https://github.com/dssiqueira/kamo/issues).

> [!TIP]
> **Premier lancement sous Windows.** L'installateur n'étant pas encore signé, SmartScreen peut afficher « Windows a protégé votre ordinateur ». Cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**.

---

## Ce qui le rend différent

**Vous ne montez pas. Vous enregistrez.** Kamo repère où vous cliquez (uniquement la souris, jamais le clavier) et, quand vous arrêtez, la vidéo a déjà une caméra qui suit l'action, un curseur qui glisse au lieu de trembler et un cadre qui a l'air pensé par un designer.

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="Côte à côte : à gauche, l'enregistrement brut avec un curseur minuscule et tremblant ; à droite, la même prise dans Kamo, avec un zoom sur chaque clic sur un fond vert sauge">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>Les clics deviennent des zooms.</b> Les clics proches partagent un même plan, pour que la caméra ne fasse jamais de va-et-vient. Chaque mouvement est un ressort (raideur 170, amortissement 26), jamais un glissement linéaire.</td>
    <td width="50%" valign="top"><b>Un curseur qui glisse.</b> Kamo laisse le curseur du système hors de l'enregistrement et le redessine à partir du trajet de votre souris, avec le même ressort. Plus grand, plus fluide, avec une onde à chaque clic.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>Arrière-plan, marge, coins et ombre</b> sont activés par défaut. Choisissez un préréglage, une couleur unie ou votre propre image.</td>
    <td width="50%" valign="top"><b>Tout se modifie.</b> Déplacez, étirez ou supprimez des zooms sur la timeline, coupez le début et la fin. Vos zooms manuels ne sont jamais écrasés quand les zooms sont régénérés.</td>
  </tr>
</table>

### Un enregistrement, tous les formats

16:9 pour YouTube, 1:1 pour le fil, 9:16 pour les Reels et les Shorts, exportés ensemble depuis la même timeline. MP4 jusqu'en 4K60 et GIF en un seul export, plus des sous-titres en `.srt`. L'aperçu et l'export partagent le même code de rendu : ce que vous voyez est ce que vous obtenez. Pas de filigrane, pas de limite de durée.

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="Le même enregistrement exporté côte à côte en 16:9, en 1:1 et en 9:16 vertical, avec la caméra sous l'écran">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="Une bulle de webcam ronde dans un coin, qui rétrécit pendant que la caméra zoome">
      <br><b>Bulle de webcam.</b> Ronde, carrée ou large, dans n'importe quel coin ou là où vous la faites glisser. Elle rétrécit pendant que la caméra zoome et revient ensuite. En 9:16, elle peut devenir sa propre carte (Partagé).
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="Des sous-titres en cinq styles : Gras, Kamo, Machine à écrire, Néon et Surligneur">
      <br><b>Des sous-titres en 12 styles.</b> Transcrits sur votre ordinateur : le programme de transcription est intégré, et le modèle (Léger, ~148 Mo, ou Précis, ~488 Mo) se télécharge depuis Hugging Face uniquement quand vous le demandez. Corrigez un mot sur la timeline et la transcription suit. Incrustez-les dans la vidéo ou exportez un <code>.srt</code>.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="L'enregistrement encadré sur un fond d'écran personnalisé : un coucher de soleil en papier découpé">
      <br><b>Votre propre arrière-plan.</b> Déposez un PNG, un JPG ou un WebP. Kamo le copie dans le projet et le recadre pour chaque format.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="La galerie de styles de sous-titres de l'éditeur, à côté d'un sous-titre au style Kamo dans l'aperçu">
      </picture>
      <br><b>Choisissez un style, pas une police.</b> Épuré, Gras, Kamo, Néon, Machine à écrire, Cinéma et six autres, en bas ou au milieu, en trois tailles. Un clic, et l'aperçu se met à jour.
    </td>
  </tr>
</table>

<sub>Tous les extraits de cette page montrent une app de démonstration inventée, montée et exportée par Kamo, puis réduite en GIF pour GitHub. La « webcam » est un caméléon illustré, dessiné sur un canvas. Aucun écran ni visage réel n'a été maltraité.</sub>

## Comment ça marche

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="Quatre étapes : Enregistrer un écran, une fenêtre ou une sélection ; Cliquer, et Kamo note la souris mais jamais le clavier ; Zoom, où chaque clic devient un zoom à ressort ; Exporter en MP4, GIF et .srt en 16:9, 1:1 et 9:16">
</picture>

Lancez l'enregistrement depuis l'accueil, depuis le menu de la zone de notification ou depuis la liste de raccourcis de la barre des tâches Windows (le menu du Dock sur Mac) : Kamo enregistre ce que vous avez choisi en dernier, après un compte à rebours 3-2-1 accompagné d'un léger tic-tac que vous pouvez couper dans les Réglages. L'enregistrement démarre à la seconde où le compte à rebours se termine.

## Visite guidée de l'app

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="L'accueil de Kamo : choisir Écran, Fenêtre ou Sélection, activer le micro, le son de l'ordinateur et la caméra, et voir les projets récents">
      </picture>
      <br><b>Accueil.</b> Écran, Fenêtre ou Sélection. Micro, son de l'ordinateur et caméra ont chacun leur carte, avec la réduction du bruit dans les Réglages audio du micro. Vos projets et vos playlists locales sont juste en dessous.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="L'éditeur : aperçu en direct avec des zooms, une bulle de webcam, le panneau de style et une timeline avec des pistes de zoom, de webcam et de sous-titres">
      </picture>
      <br><b>Éditeur.</b> Il s'ouvre dès que vous arrêtez l'enregistrement. Aperçu en direct au centre, style à droite, zooms, webcam et sous-titres sur la timeline. L'édition est non destructive : la vidéo brute n'est jamais touchée.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="Le cadre de Sélection au-dessus d'une app de démonstration, avec des champs de largeur et de hauteur et un bouton Enregistrer">
      </picture>
      <br><b>Sélection.</b> Un cadre que vous déplacez et redimensionnez sur l'écran, au pixel près. Les clics en dehors ne déclenchent jamais de zoom.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="La visite de bienvenue : Kamo, le caméléon, dit Lancez l'enregistrement, à côté d'un croquis des options d'enregistrement">
      </picture>
      <br><b>Visite de bienvenue.</b> Kamo vous guide en trois diapositives, dans votre langue. Puis il s'efface.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="La fenêtre de l'extension Chrome : Enregistrer cet onglet, avec des interrupteurs pour le micro, le son de l'onglet et la caméra">
  <br><sub>L'extension Chrome (bientôt disponible) : une fenêtre, un bouton. Pendant l'enregistrement, une petite barre dans sa propre fenêtre permet de mettre en pause et d'arrêter, et un clic sur l'icône de la barre d'outils arrête aussi.</sub>
</p>

## App de bureau ou extension ?

Le même moteur, le même éditeur, le même export. La différence, c'est ce que chacune peut enregistrer. Windows est déjà disponible ; l'app Mac et l'extension arrivent bientôt.

| | App de bureau<br><sub>Windows · Mac (Apple Silicon, bientôt)</sub> | Extension Chrome (bientôt)<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| Enregistrer tout l'écran | ✅ | — |
| Enregistrer une fenêtre ou une sélection | ✅ | — |
| Enregistrer un onglet du navigateur | ✅ (comme fenêtre) | ✅ |
| Micro | ✅ | ✅ |
| Son de l'ordinateur / son de l'onglet | ✅ | ✅ (son de l'onglet) |
| Bulle de webcam et 9:16 partagé | ✅ | ✅ |
| Zoom automatique, caméra à ressort, curseur fluide, timeline | ✅ | ✅ |
| Arrière-plans prédéfinis et couleurs unies | ✅ | ✅ |
| Votre propre image d'arrière-plan | ✅ | pas encore |
| Transcription locale et sous-titres | ✅ | — (bureau uniquement) |
| Export MP4 et GIF en 16:9, 1:1, 9:16 | ✅ | ✅ |
| Export en 4K et 60fps | ✅ | — (les onglets s'enregistrent jusqu'en 1080p30) |
| Où vivent les projets | Un dossier sur votre disque | Dans le navigateur (OPFS) |
| Lisible par le serveur MCP local | ✅ | — |

## Privé par conception

- **100 % local.** Enregistrer, monter et exporter fonctionnent hors ligne, sans compte.
- **Aucune télémétrie. Aucune analyse d'audience.** Même pas « anonymisée ». Rien.
- **Rien ne quitte votre ordinateur, sauf si vous choisissez de l'envoyer.**
- **La souris uniquement, jamais le clavier.** Kamo enregistre les clics et les mouvements. Il ne capture pas les frappes au clavier, et l'extension ne lit jamais la page que vous enregistrez. La CI le vérifie à chaque pull request.
- **Téléchargement léger.** L'app enregistre, monte et exporte, et le petit programme de transcription est intégré. Le modèle de reconnaissance vocale, lui, ne l'est pas : il se télécharge directement depuis Hugging Face, la maison officielle des modèles whisper.cpp, uniquement quand vous le demandez, figé sur une version et vérifié par SHA-256. Aucun serveur Kamo n'intervient. (Hugging Face n'est pas encore accessible depuis la Chine continentale, la transcription ne peut donc pas y être configurée pour le moment.)
- **Non destructif.** Votre enregistrement brut n'est jamais modifié ; chaque modification vit dans `project.json`.

## Utilisez vos enregistrements avec l'IA

Kamo inclut un petit **serveur MCP local** pour que Claude Code (ou tout autre client MCP) puisse dialoguer avec ce que vous avez enregistré : transcriptions, chronologie des clics, zooms et une capture de référence toutes les 5 secondes.

> « Trouve l'enregistrement où j'expliquais les paramètres de facturation et rédige une documentation pas à pas à partir de celui-ci. »

Il est **en lecture seule et n'a aucun accès au réseau** : il lit votre dossier de projets et répond à l'agent que vous avez connecté. Rien d'autre.

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

L'app de bureau affiche la commande exacte, avec votre dossier déjà renseigné, dans **Réglages → Connecter un agent**. Outils, exemples et autres clients : [apps/mcp/README.md](apps/mcp/README.md) (en anglais).

## Compiler depuis les sources

Nécessite Node 24+ et pnpm (`npm i -g pnpm`).

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

Pour enregistrer sur le bureau, il faut l'outil de capture natif : Rust et les Visual Studio Build Tools sous Windows, Xcode sur Mac. Voir [`apps/desktop/native`](apps/desktop/native). Rien sous la main à enregistrer ? [`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project) génère un projet d'exemple réaliste que vous pouvez ouvrir dans l'éditeur (c'est la démo « Acme Studio » des extraits ci-dessus).

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="Architecture : l'app de bureau et l'extension Chrome utilisent toutes deux packages/ui, qui utilise packages/core. Le serveur MCP local lit le dossier de projets écrit par l'app de bureau.">
</picture>

Un monorepo pnpm, en TypeScript de bout en bout.

- **`packages/core`** est le moteur : format de projet, génération des zooms, caméra virtuelle, curseur fluide, rendu des images et export avec WebCodecs (MP4 et GIF). L'aperçu et l'export exécutent le même code.
- **`packages/ui`** contient l'éditeur, la timeline et les panneaux (React).
- Aucun des deux ne sait où il s'exécute : ni Electron, ni Node, ni `chrome.*` à l'intérieur. Capture, événements, stockage et fichiers arrivent par des interfaces, si bien que l'extension réutilise les deux tels quels.
- **`apps/desktop`** est en Electron, avec de petits outils natifs pour la capture : Rust (Windows Graphics Capture) et Swift (ScreenCaptureKit).
- **`apps/extension`** est en Manifest V3 : capture d'onglet dans un document offscreen, un content script limité à la souris, projets dans OPFS.
- **`apps/mcp`** est le serveur MCP local : stdio, lecture seule, pas de réseau.

Nouveau ici, humain ou agent ? Commencez par [AGENTS.md](AGENTS.md). Il mène à la documentation produit, aux décisions et au plan dans [docs/](docs/). L'interface suit [DESIGN.md](DESIGN.md). Ces documents sont en anglais.

## Langues

English, Português (Brasil), Español, 简体中文, 日本語, Deutsch, Français et 한국어, choisie d'après votre système et modifiable à tout moment. Les dates, nombres et durées sont mis en forme selon votre langue. Locuteurs natifs : relire les traductions est l'une des contributions les plus utiles.

## Feuille de route

Le plan étape par étape se trouve dans [docs/plan.md](docs/plan.md), et chaque fonctionnalité avec ses critères d'acceptation dans [docs/features.md](docs/features.md). Prochaines étapes : une version Mac testée, des installateurs signés, la fiche sur le Chrome Web Store et `@kamo/mcp` sur npm. Un paquet pour le Microsoft Store est aussi en préparation. Un cloud facultatif pour partager des liens est prévu ; l'app elle-même reste gratuite et complète.

## Contribuer

Les issues et les pull requests sont les bienvenues. Lisez d'abord [CONTRIBUTING.md](CONTRIBUTING.md) ; il présente les quelques règles auxquelles le projet tient fermement (moteur indépendant de la plateforme, souris uniquement, chaque texte traduit). En participant, vous acceptez le [Code de conduite](CODE_OF_CONDUCT.md). Vous avez trouvé un problème de sécurité ? Suivez [SECURITY.md](SECURITY.md) plutôt que d'ouvrir une issue publique.

## Licence

[MIT](LICENSE). Utilisez-le, forkez-le, publiez-le.

## Remerciements

Kamo s'appuie sur d'excellents projets open source : Electron, React, Vite, Tailwind CSS, mediabunny, gifenc, le MCP TypeScript SDK, whisper.cpp (intégré à l'app ; ses modèles se téléchargent depuis Hugging Face quand vous le demandez) et les polices Inter, Instrument Serif et JetBrains Mono. Les mentions de licence de ce qui est livré avec l'app se trouvent dans [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="Kamo qui sourit">
  <br><sub>Fait avec la patience d'un caméléon. Maintenant, allez enregistrer quelque chose.</sub>
</p>
