# Permission justifications (Chrome Web Store form)

Kamo asks for no host permission at install and never for `<all_urls>` permanently (E-06). The list
matches `apps/extension/scripts/manifest.ts`; a test fails if they drift apart.

| Permission | Justification (paste as is) |
|---|---|
| `tabCapture` | Records the video and sound of the tab the user chose, after they click Record in Kamo's popup. Only that tab, only while recording. |
| `offscreen` | Chrome extensions record media in an offscreen document: the recorder runs there, saving the video in chunks to the extension's own storage. |
| `activeTab` | Gives Kamo access to the tab the user clicked Kamo on, to show the 3-2-1 countdown and to listen to mouse clicks there while it records, so the video can zoom where the user clicked. |
| `scripting` | Injects the countdown and the mouse-click listener into the recorded tab only, while recording, and removes them when it stops. It reads mouse positions only: never the keyboard, never the page content. |
| `storage` | Remembers the user's choices (microphone, camera, tab sound) in the browser. Nothing leaves the browser. |
| `downloads` | Saves the exported video (MP4 or GIF) to the user's downloads folder when they click Export. |
| `alarms` | Wakes the extension about once a minute to animate Kamo's toolbar icon (a blink). No network, no data. |
| Optional host permission `<all_urls>` | Asked only if the user opts in (welcome page or editor): keeps capturing clicks when the recorded tab moves to another site during a recording, which `activeTab` does not cover. Without it, the video still records. |

Remote code: none. Every script ships in the package.

Data usage answers: Kamo collects none of the listed data types. Recordings, projects and settings
stay in the user's browser (Origin Private File System and `chrome.storage.local`). The extension
makes no network request of its own; the only links (the desktop app download) open in a normal tab
when the user clicks them.
