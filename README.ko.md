<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <b>한국어</b>
</p>

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-scene.webp" width="240" alt="나뭇잎 사이에 서 있는 종이 공예 카멜레온 Kamo">
</p>

<h1 align="center">Kamo</h1>

<p align="center">
  <b>녹화하고, 클릭하고, 멈추세요. 편집은 이미 끝났어요.</b><br>
  클릭할 때마다 자동으로 줌하고 커서를 부드럽게 다듬어 주는 무료 오픈 소스 화면 녹화 앱이에요.<br>
  누군가 한 시간 들여 편집한 것 같은 영상이 나오지만, 여러분이 쓴 시간은 0분이에요.
</p>

<p align="center">
  <a href="LICENSE"><img alt="라이선스: MIT" src="https://img.shields.io/badge/%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-MIT-3F7539?style=flat-square"></a>
  <a href="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dssiqueira/kamo/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="플랫폼: 지금은 Windows, Mac과 Chrome은 곧 출시" src="https://img.shields.io/badge/%ED%94%8C%EB%9E%AB%ED%8F%BC-Windows%20%C2%B7%20Mac%EA%B3%BC%20Chrome%EC%9D%80%20%EA%B3%A7%20%EC%B6%9C%EC%8B%9C-2F6F68?style=flat-square">
  <img alt="텔레메트리 없음" src="https://img.shields.io/badge/%ED%85%94%EB%A0%88%EB%A9%94%ED%8A%B8%EB%A6%AC-%EC%97%86%EC%9D%8C-A8D5A2?style=flat-square">
</p>

<h3 align="center">Windows 버전, 지금 받을 수 있어요</h3>

<p align="center">
  <a href="https://github.com/dssiqueira/kamo/releases/latest"><img alt="Windows 버전 다운로드" src="https://img.shields.io/badge/%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C-Windows-A8D5A2?style=for-the-badge&labelColor=1F3A1C"></a>
  <img alt="Mac: 곧 출시" src="https://img.shields.io/badge/Mac-%EA%B3%A7%20%EC%B6%9C%EC%8B%9C-CDE8E4?style=for-the-badge&labelColor=2F6F68">
  <img alt="Chrome 확장 프로그램: 곧 출시" src="https://img.shields.io/badge/Chrome-%EA%B3%A7%20%EC%B6%9C%EC%8B%9C-CDE8E4?style=for-the-badge&labelColor=2F6F68">
</p>

<p align="center">
  <sub>Chrome 확장 프로그램이 나오면 Edge, Brave, Arc에서도 쓸 수 있어요. 기다리기 어렵다면 <a href="#소스에서-빌드하기">소스에서 직접 빌드</a>해 보세요.</sub>
</p>

<p align="center">
  <img src="docs/readme/hero.gif" width="880" alt="데모 앱 녹화: 클릭할 때마다 클릭한 곳으로 부드럽게 줌해요">
</p>

> [!NOTE]
> **Kamo는 아직 어려요.** Windows 버전이 나왔고, Kamo는 매일 Windows에서 만들고 테스트하고 있어요. Mac 앱과 Chrome 확장 프로그램은 곧 나와요. 설치 프로그램에는 아직 코드 서명이 없어요. 빌드는 [GitHub Releases](https://github.com/dssiqueira/kamo/releases)에 올라오고, 불편한 점이 있으면 [이슈를 열어 주세요](https://github.com/dssiqueira/kamo/issues).

> [!TIP]
> **Windows에서 처음 실행할 때.** 설치 프로그램에 아직 코드 서명이 없어서 SmartScreen이 "Windows의 PC 보호"라고 표시할 수 있어요. **추가 정보**를 클릭한 다음 **실행**을 누르세요.

---

## 무엇이 다른가요

**편집하지 마세요. 녹화만 하세요.** Kamo는 여러분이 클릭하는 곳을 지켜봐요(마우스만, 키보드는 절대 기록하지 않아요). 녹화를 멈추는 순간, 영상에는 이미 동작을 따라가는 카메라, 떨리지 않고 미끄러지듯 움직이는 커서, 디자인한 듯한 프레임이 들어 있어요.

<p align="center">
  <img src="docs/readme/before-after.gif" width="880" alt="나란히 비교: 왼쪽은 작고 떨리는 커서가 보이는 원본 녹화, 오른쪽은 같은 장면을 Kamo로 다듬은 것으로 세이지색 배경 위에서 클릭마다 줌해요">
</p>

<table>
  <tr>
    <td width="50%" valign="top"><b>클릭이 줌이 돼요.</b> 가까운 클릭은 한 장면으로 묶어서 카메라가 이리저리 튀지 않아요. 모든 움직임은 스프링(강성 170, 감쇠 26)으로, 직선으로 미끄러지는 법이 없어요.</td>
    <td width="50%" valign="top"><b>미끄러지듯 움직이는 커서.</b> Kamo는 시스템 커서를 녹화에서 빼고, 마우스가 지나간 경로를 따라 같은 스프링으로 다시 그려요. 더 크고, 더 부드럽고, 클릭할 때마다 물결이 퍼져요.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><b>배경, 여백, 모서리, 그림자</b>가 처음부터 켜져 있어요. 프리셋, 단색, 내 이미지 중에서 고르세요.</td>
    <td width="50%" valign="top"><b>모든 것을 편집할 수 있어요.</b> 타임라인에서 줌을 끌고, 늘리고, 지우고, 앞뒤를 잘라 내세요. 줌을 다시 만들어도 직접 설정한 줌은 절대 덮어쓰지 않아요.</td>
  </tr>
</table>

### 한 번 녹화로 모든 형식을

YouTube용 16:9, 피드용 1:1, 릴스와 쇼츠용 9:16을 같은 타임라인에서 한꺼번에 내보내요. 최대 4K60 MP4와 GIF를 한 번의 내보내기로 함께 만들고, `.srt` 자막도 더할 수 있어요. 미리보기와 내보내기는 같은 렌더링 코드를 쓰니까 보이는 그대로 나와요. 워터마크도, 시간 제한도 없어요.

<p align="center">
  <img src="docs/readme/formats.gif" width="880" alt="같은 녹화를 16:9, 1:1, 화면 아래에 카메라가 있는 세로 9:16으로 나란히 내보낸 모습">
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/webcam.gif" alt="모서리에 있는 원형 웹캠 버블이 카메라가 줌하는 동안 작아지는 모습">
      <br><b>웹캠 버블.</b> 원형, 사각형, 가로형 중에서 고르고, 네 모서리 어디든 또는 끌어서 원하는 곳에 둘 수 있어요. 카메라가 줌하는 동안에는 작아졌다가 끝나면 돌아와요. 9:16에서는 별도의 카드로 만들 수도 있어요(분할).
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/captions.gif" alt="다섯 가지 스타일의 자막: 굵게, Kamo, 타자기, 네온, 마커">
      <br><b>12가지 스타일의 자막.</b> 받아쓰기는 여러분의 컴퓨터에서 해요. 받아쓰기 프로그램은 앱에 들어 있고, 모델(가벼움 약 148 MB, 정확함 약 488 MB)은 요청할 때만 Hugging Face에서 내려받아요. 타임라인에서 단어를 고치면 받아쓴 내용도 따라 바뀌어요. 영상에 입히거나 <code>.srt</code>로 내보내세요.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/background.gif" alt="종이 공예 느낌의 노을 배경화면 위에 놓인 녹화">
      <br><b>나만의 배경.</b> PNG, JPG, WebP를 끌어다 놓으세요. Kamo가 이미지를 프로젝트에 복사하고 모든 형식에 맞게 잘라 줘요.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/caption-styles-dark.webp">
        <img src="docs/readme/caption-styles-light.webp" alt="편집기의 자막 스타일 모음과 미리보기에 나온 Kamo 스타일 자막">
      </picture>
      <br><b>글꼴이 아니라 분위기를 고르세요.</b> 깔끔, 굵게, Kamo, 네온, 타자기, 시네마 외 여섯 가지가 더 있어요. 아래쪽이나 가운데에, 세 가지 크기로 놓을 수 있어요. 한 번 클릭하면 미리보기가 바로 바뀌어요.
    </td>
  </tr>
</table>

<sub>이 페이지의 클립은 모두 가상의 데모 앱을 Kamo로 편집하고 내보낸 뒤 GitHub용 GIF로 줄인 거예요. "웹캠"은 canvas에 그린 카멜레온 일러스트예요. 실제 화면이나 얼굴은 하나도 쓰지 않았어요.</sub>

## 작동 방식

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/how-it-works-dark.svg">
  <img src="docs/readme/how-it-works-light.svg" width="920" alt="네 단계: 화면, 창 또는 선택 영역 녹화. 클릭하면 Kamo가 마우스만 기록하고 키보드는 절대 기록하지 않음. 줌, 클릭마다 스프링 줌이 됨. 16:9, 1:1, 9:16의 MP4, GIF, .srt로 내보내기">
</picture>

홈, 트레이 메뉴, Windows 작업 표시줄의 점프 목록(Mac에서는 Dock 메뉴) 어디서든 시작할 수 있어요. Kamo는 마지막으로 고른 것을 3-2-1 카운트다운 뒤에 녹화해요. 카운트다운 중의 작은 소리는 설정에서 끌 수 있어요. 카운트다운이 끝나는 순간 녹화가 시작돼요.

## 앱 둘러보기

<table>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/home-dark.webp">
        <img src="docs/readme/home-light.webp" alt="Kamo 홈: 화면, 창, 선택 중에서 고르고 마이크, 컴퓨터 소리, 카메라를 켜고 끄며 최근 프로젝트를 볼 수 있어요">
      </picture>
      <br><b>홈.</b> 화면, 창, 선택 중에서 고르세요. 마이크, 컴퓨터 소리, 카메라는 각각 카드 한 장이고, 소음 억제는 마이크의 오디오 설정 안에 있어요. 프로젝트와 로컬 재생목록은 바로 아래에 있어요.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/editor-dark.webp">
        <img src="docs/readme/editor-light.webp" alt="편집기: 줌이 들어간 실시간 미리보기, 웹캠 버블, 스타일 패널, 줌·웹캠·자막 트랙이 있는 타임라인">
      </picture>
      <br><b>편집기.</b> 녹화를 멈추자마자 열려요. 가운데에 실시간 미리보기, 오른쪽에 스타일, 타임라인에 줌, 웹캠, 자막이 있어요. 비파괴 편집이라 원본 영상은 절대 건드리지 않아요.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/select-frame-dark.webp">
        <img src="docs/readme/select-frame-light.webp" alt="데모 앱 위에 놓인 선택 프레임과 너비, 높이 입력란, 녹화 버튼">
      </picture>
      <br><b>선택.</b> 화면 위에서 옮기고 크기를 바꿀 수 있는 프레임으로, 픽셀 단위로 정확한 크기를 정할 수 있어요. 프레임 밖의 클릭으로는 줌이 생기지 않아요.
    </td>
    <td width="50%" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/readme/welcome-tour-dark.webp">
        <img src="docs/readme/welcome-tour-light.webp" alt="환영 투어: 카멜레온 Kamo가 &quot;녹화를 누르세요.&quot;라고 말하고, 옆에 녹화 옵션 스케치가 있어요">
      </picture>
      <br><b>환영 투어.</b> Kamo가 슬라이드 세 장으로, 여러분의 언어로 안내해요. 그다음에는 방해하지 않아요.
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/readme/extension-popup.webp" width="300" alt="Chrome 확장 프로그램 팝업: 이 탭 녹화, 마이크, 탭 소리, 카메라 토글">
  <br><sub>Chrome 확장 프로그램(곧 출시): 팝업 하나, 버튼 하나. 녹화하는 동안 별도 창에 뜨는 작은 막대로 일시 정지하고 멈출 수 있고, 툴바 아이콘을 클릭해도 멈춰요.</sub>
</p>

## 데스크톱 앱일까요, 확장 프로그램일까요?

엔진도, 편집기도, 내보내기도 같아요. 다른 점은 녹화할 수 있는 대상이에요. Windows 버전은 지금 받을 수 있고, Mac 앱과 확장 프로그램은 곧 나와요.

| | 데스크톱 앱<br><sub>Windows · Mac(Apple 실리콘, 곧 출시)</sub> | Chrome 확장 프로그램(곧 출시)<br><sub>Chrome · Edge · Brave · Arc</sub> |
|---|:---:|:---:|
| 전체 화면 녹화 | ✅ | — |
| 창 하나 또는 선택 영역 녹화 | ✅ | — |
| 브라우저 탭 녹화 | ✅ (창으로) | ✅ |
| 마이크 | ✅ | ✅ |
| 컴퓨터 소리 / 탭 소리 | ✅ | ✅ (탭 소리) |
| 웹캠 버블과 9:16 분할 | ✅ | ✅ |
| 자동 줌, 스프링 카메라, 부드러운 커서, 타임라인 | ✅ | ✅ |
| 배경 프리셋과 단색 | ✅ | ✅ |
| 내 이미지로 배경 만들기 | ✅ | 아직 안 돼요 |
| 로컬 받아쓰기와 자막 | ✅ | — (데스크톱만) |
| 16:9, 1:1, 9:16으로 MP4와 GIF 내보내기 | ✅ | ✅ |
| 4K, 60fps 내보내기 | ✅ | — (탭은 최대 1080p30으로 녹화) |
| 프로젝트 저장 위치 | 디스크의 폴더 | 브라우저 안(OPFS) |
| 로컬 MCP 서버에서 읽기 | ✅ | — |

## 처음부터 프라이버시를 지키도록

- **100% 로컬.** 녹화, 편집, 내보내기 모두 오프라인에서, 계정 없이 돼요.
- **텔레메트리 없음. 분석 없음.** "익명화"도 아니에요. 아예 없어요.
- **여러분이 직접 보내기로 하지 않는 한, 아무것도 컴퓨터 밖으로 나가지 않아요.**
- **마우스만, 키보드는 절대 아니에요.** Kamo는 클릭과 움직임만 기록해요. 키 입력은 수집하지 않고, 확장 프로그램은 녹화하는 페이지의 내용을 절대 읽지 않아요. CI가 pull request마다 이 점을 확인해요.
- **가벼운 다운로드.** 앱은 녹화, 편집, 내보내기를 하고, 작은 받아쓰기 프로그램도 들어 있어요. 음성 모델은 들어 있지 않아요. 요청할 때만 whisper.cpp 모델의 공식 배포처인 Hugging Face에서 바로 내려받고, 버전 하나로 고정해 SHA-256으로 확인해요. Kamo 서버는 전혀 거치지 않아요. (중국 본토에서는 아직 Hugging Face에 접속할 수 없어서, 당분간 그곳에서는 받아쓰기를 설정할 수 없어요.)
- **비파괴 편집.** 원본 녹화는 절대 바뀌지 않아요. 모든 편집은 `project.json`에 저장돼요.

## 녹화를 AI와 함께 쓰기

Kamo에는 작은 **로컬 MCP 서버**가 들어 있어서 Claude Code(또는 다른 MCP 클라이언트)가 녹화한 내용과 대화할 수 있어요. 받아쓴 내용, 클릭 타임라인, 줌, 그리고 5초마다 찍은 참고용 스크린숏까지요.

> "결제 설정을 설명했던 녹화를 찾아서, 그걸로 단계별 문서를 써 줘."

**읽기 전용이고 네트워크에 접근하지 않아요.** 프로젝트 폴더를 읽고 여러분이 연결한 에이전트에 답할 뿐이에요. 그 밖에는 아무것도 하지 않아요.

```bash
# Once @kamo/mcp is on npm (coming soon):
claude mcp add kamo -- npx -y @kamo/mcp --dir "<projects folder>"

# Today, from a clone of this repository:
pnpm install && pnpm --filter @kamo/mcp build
claude mcp add kamo -- node "<path to kamo>/apps/mcp/dist/cli.js" --dir "<projects folder>"
```

데스크톱 앱의 **설정 → 에이전트 연결**에서 여러분의 폴더가 채워진 정확한 명령어를 보여 줘요. 도구, 예시, 다른 클라이언트는 [apps/mcp/README.md](apps/mcp/README.md)(영어)를 참고하세요.

## 소스에서 빌드하기

Node 24 이상과 pnpm(`npm i -g pnpm`)이 필요해요.

```bash
pnpm install
pnpm --filter @kamo/desktop dev       # the desktop app
pnpm --filter @kamo/extension build   # the extension: load apps/extension/dist in chrome://extensions
pnpm --filter @kamo/mcp dev           # the local MCP server (try it with the MCP Inspector)
pnpm check                            # lint, typecheck, tests, i18n and the keyboard guard
```

데스크톱에서 녹화하려면 네이티브 캡처 도우미가 필요해요. Windows에서는 Rust와 Visual Studio Build Tools, Mac에서는 Xcode가 있어야 해요. [`apps/desktop/native`](apps/desktop/native)를 참고하세요. 녹화 환경이 당장 없다면 [`apps/desktop/scripts/sample-project`](apps/desktop/scripts/sample-project)로 실제 같은 샘플 프로젝트를 만들어 편집기에서 열 수 있어요(위 클립의 "Acme Studio" 데모가 바로 그거예요).

## 아키텍처

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/architecture-dark.svg">
  <img src="docs/readme/architecture-light.svg" width="920" alt="아키텍처: 데스크톱 앱과 Chrome 확장 프로그램은 모두 packages/ui를 쓰고, packages/ui는 packages/core를 써요. 로컬 MCP 서버는 데스크톱 앱이 기록한 프로젝트 폴더를 읽어요.">
</picture>

pnpm 모노레포이고, 모든 곳에서 TypeScript를 써요.

- **`packages/core`**는 엔진이에요. 프로젝트 형식, 줌 생성, 가상 카메라, 부드러운 커서, 프레임 렌더링, WebCodecs 내보내기(MP4와 GIF)를 맡아요. 미리보기와 내보내기는 같은 코드로 돌아가요.
- **`packages/ui`**는 편집기, 타임라인, 패널(React)이에요.
- 둘 다 자신이 어디서 실행되는지 몰라요. 안에는 Electron도, Node도, `chrome.*`도 없어요. 캡처, 이벤트, 저장, 파일은 인터페이스를 통해 들어오기 때문에 확장 프로그램도 둘을 그대로 다시 써요.
- **`apps/desktop`**은 Electron이고, 캡처용 작은 네이티브 도우미가 있어요. Rust(Windows Graphics Capture)와 Swift(ScreenCaptureKit)예요.
- **`apps/extension`**은 Manifest V3예요. offscreen 문서에서 탭을 캡처하고, 마우스만 다루는 content script를 쓰고, 프로젝트는 OPFS에 저장해요.
- **`apps/mcp`**는 로컬 MCP 서버예요. stdio, 읽기 전용, 네트워크 없음.

처음 오셨나요? 사람이든 에이전트든 [AGENTS.md](AGENTS.md)에서 시작하세요. [docs/](docs/)에 있는 제품 문서, 결정 사항, 계획으로 안내해 줘요. UI는 [DESIGN.md](DESIGN.md)를 따라요. 이 문서들은 영어로 되어 있어요.

## 언어

English, Português (Brasil), Español, 简体中文, 日本語, Deutsch, Français, 한국어를 지원해요. 시스템 설정에 맞춰 골라지고 언제든 바꿀 수 있어요. 날짜, 숫자, 시간 길이는 여러분의 언어 형식으로 표시돼요. 원어민 여러분, 번역 검토는 가장 큰 도움이 되는 기여 중 하나예요.

## 로드맵

단계별 계획은 [docs/plan.md](docs/plan.md)에, 모든 기능과 인수 기준은 [docs/features.md](docs/features.md)에 있어요. 다음 순서는 실제 기기에서 테스트한 Mac 버전, 서명된 설치 프로그램, Chrome 웹 스토어 등록, npm의 `@kamo/mcp`예요. Microsoft Store 패키지도 준비하고 있어요. 링크로 공유하기 위한 선택형 클라우드도 계획 중이지만, 앱 자체는 앞으로도 무료이고 모든 기능을 갖출 거예요.

## 기여하기

이슈와 pull request를 환영해요. 먼저 [CONTRIBUTING.md](CONTRIBUTING.md)를 읽어 주세요. 이 프로젝트가 꼭 지키는 몇 가지 규칙(플랫폼에 의존하지 않는 엔진, 마우스만, 모든 문구 번역)이 정리되어 있어요. 참여하시면 [행동 강령](CODE_OF_CONDUCT.md)에 동의하는 것으로 봐요. 보안 문제를 발견하셨다면 공개 이슈를 여는 대신 [SECURITY.md](SECURITY.md)를 따라 주세요.

## 라이선스

[MIT](LICENSE). 자유롭게 쓰고, 포크하고, 배포하세요.

## 감사의 말

Kamo는 훌륭한 오픈 소스 작업 위에 서 있어요. Electron, React, Vite, Tailwind CSS, mediabunny, gifenc, MCP TypeScript SDK, whisper.cpp(앱에 들어 있고, 모델은 요청할 때 Hugging Face에서 내려받아요), 그리고 Inter, Instrument Serif, JetBrains Mono 서체예요. 앱에 함께 들어가는 것들의 라이선스 고지는 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)에 있어요.

<p align="center">
  <img src="packages/design-tokens/assets/mascot/kamo-head-happy.webp" width="72" alt="웃고 있는 Kamo">
  <br><sub>카멜레온의 인내심으로 만들었어요. 이제 뭔가 녹화해 보세요.</sub>
</p>
