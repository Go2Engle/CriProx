# Installing and running CriProx

## Desktop releases

Download the newest stable build from [GitHub Releases](https://github.com/Go2Engle/CriProx/releases/latest).

| Platform | Release package    | Support notes                                                                                   |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| macOS    | Universal DMG      | Runs on Apple Silicon and Intel Macs. The application is currently unsigned and not notarized.  |
| Windows  | x64 NSIS installer | The installer is currently unsigned and may trigger a SmartScreen warning.                      |
| Linux    | x64 AppImage       | CriProx can create project and export files, but Cricut Design Space is not available on Linux. |

Windows and Linux installers are built on their respective GitHub-hosted runners. Runtime behavior can still vary by distribution, graphics stack, printer driver, and security settings, so issue reports should include the CriProx version and operating-system details.

CriProx checks for a newer stable release when the desktop app starts. Choose **Review update**
from the notice or open **Settings → Updates** to check again, view formatted release notes, and download
the package for your device without leaving CriProx. **Remind me later** hides that version’s
notice for 24 hours. A small **Update available** button beside the donation button in the bottom
bar opens the Updates page while the notice is snoozed. Once the download is verified, it reads
**Update ready**. The main notice returns after 24 hours; a newer release gets its own notice.

Downloads show progress and can be cancelled or retried. CriProx checks the downloaded bytes
against the official release’s `SHA256SUMS.txt` and verifies the file again before opening it.
A checksum checks file integrity; it does not authenticate the publisher like code signing.
Incomplete, oversized, or mismatched downloads are removed. If the release has no matching
package or checksum file, use **View release on GitHub** for manual installation.

After the download is verified:

- **macOS:** Choose **Install update**. CriProx opens the DMG and closes automatically. Drag the new app into
  **Applications**, choose **Replace**, and reopen it. The unsigned-app instructions below
  still apply if macOS blocks the new version. Below the download controls and above the release
  notes, the Updates screen has **Copy command** and **Open Terminal** buttons; copy the command
  before installing, then paste and run it after replacing the app. **Open Terminal** opens
  Apple’s Terminal without executing the command.
- **Windows:** Choose **Install update**. CriProx launches the installer and closes automatically.
  Complete setup and reopen the app.
  Windows may still show a warning for the unsigned installer.
- **Linux:** Choose **Install update**, then choose a permanent location for the verified AppImage.
  CriProx saves it, makes it executable, launches it, and closes the current copy. A canceled
  location picker or launch failure keeps the current app open. Your desktop launcher may need
  to be pointed at the new AppImage if you save it under a different name or location.

CriProx saves the autosaved workspace before launching the download and closing. Finish exports
and save any managed-project changes first; unsaved default changes disable installation until
saved or undone. A workspace-save or installer-launch failure keeps CriProx open. macOS app
replacement and Windows setup remain interactive. Updates keep your project library.
Downloads continue while Settings is closed, but closing CriProx interrupts them. Download
progress and readiness are remembered for the current app session; a later download clears
previous files in the private `update-downloads` cache. Existing users need to install the
release introducing this flow manually once.

## Test installers from a branch

To share a feature build, push the branch to GitHub, then open **Actions → Test installers → Run workflow**. Leave GitHub's **Branch** dropdown on `main` so it runs the workflow stored there. Enter the feature branch name in the `build_branch` field (for example, `feature/my-change`) and start the run. The branch does not need its own copy of the workflow. The resolve job records the branch's exact commit, which all three platform jobs build.

After the run completes, open it and download the `test-installer-macos`, `test-installer-windows`, or `test-installer-linux` artifact from **Artifacts**. Extract the artifact ZIP to get the DMG, EXE, or AppImage, then share the run link with testers. Testers need to sign in to GitHub and have read access to the repository to download Actions artifacts. The workflow requests 30 days of artifact retention, subject to the repository's retention limit.

These builds use the branch's current application version and are for testing; they are not published as stable releases. Give testers the branch name from the run title and the commit from the **Resolve branch commit** job summary so they can identify the build when reporting an issue. The same unsigned-installer notes above apply.

## Opening the unsigned macOS app

Only use a copy downloaded from the official CriProx repository. Move `CriProx.app` to **Applications**, then run:

```sh
xattr -dr com.apple.quarantine "/Applications/CriProx.app"
```

Open CriProx again after the command completes. This removes the quarantine attribute from that application bundle; it does not sign or notarize the app.

## macOS release signing

The release workflow currently produces an unsigned macOS installer. Developer ID signing and
notarization can be enabled after the repository has a Developer ID Application certificate and Apple
notarization credentials configured as GitHub Actions secrets.

## Local development

Prerequisites:

- Node.js 22 or newer
- npm
- Git

Clone and start the browser development server:

```sh
git clone https://github.com/Go2Engle/CriProx.git
cd CriProx
npm ci
npm run dev
```

Vite serves the app at `http://127.0.0.1:5173` and reloads renderer changes during development.

## Simulate an update locally

From a development checkout with dependencies installed, run:

```sh
npm run desktop:updates
```

Choose **Review update** or **Settings → Updates**. The default simulation advertises a newer
version, shows the formatted changelog, and downloads an 8 MB test file over roughly eight
seconds. Try **Cancel download**, **Retry download**, and **Test installer handoff**. The last
action runs verification again and shows a confirmation dialog; it keeps CriProx open and does not
launch an installer. The macOS copy and Terminal buttons are real desktop actions in this mode.

To exercise a specific failure or an up-to-date app:

```sh
npm run desktop:updates -- --scenario=checksum-failure
npm run desktop:updates -- --scenario=network-failure
npm run desktop:updates -- --scenario=up-to-date
```

The checksum scenario fails the first completed download, then **Retry download** succeeds.
The network scenario fails the first update check, then **Check now** succeeds. Each launch uses
a new temporary profile, separate from your normal workspace, project library, settings, and
update reminders. Its path appears in the terminal and is removed on a normal exit. The fixture
makes no update-network requests and uses the same platform selection, streaming, cancellation,
checksum verification, and progress events as real updates. Simulation is available only in
unpackaged development runs and is excluded from installers.

This exercises CriProx’s update flow. Actual unsigned installer prompts and replacement of the
installed app still need separate testing on each operating system.

## Available commands

| Command                   | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `npm run dev`             | Start the Vite browser preview on localhost                  |
| `npm run desktop`         | Build the renderer and launch it in Electron                 |
| `npm run desktop:updates` | Launch an isolated local update simulation |
| `npm test`                | Run the Node test suite                                      |
| `npm run build`           | Type-check the project and build the production renderer     |
| `npm run preview`         | Serve the completed renderer build locally                   |
| `npm run package`         | Build an installer for the current operating system          |
| `npm run package:mac`     | Build a universal macOS DMG                                  |
| `npm run package:windows` | Build a Windows x64 NSIS installer                           |
| `npm run package:linux`   | Build a Linux x64 AppImage                                   |
| `npm run format`          | Format source, tests, Electron files, and Vite configuration |

Installer output is written to `release/`. Windows and Linux packages should be built and tested on their target platforms; cross-building does not replace a native runtime check.

## Network access and offline use

Scryfall and MPC Autofill searches require an internet connection, as does the desktop release check. Local artwork, locally saved projects, and cached export artwork can be used without a connection. Remote preview images are not guaranteed to remain available offline.

CriProx has no user account, hosted project service, or cloud sync. Browser-mode data is stored in the browser profile. Desktop mode keeps the active workspace and default managed-project library in the application's local profile, or uses the folder selected in Settings. On macOS, upgrades from v0.6.0 or earlier can copy the old `Documents/CriProx` library from **Settings → Project library → Import old library**. The old files remain in Documents as a backup. Export a JSON backup before clearing site/application data or switching environments.

## Configure your defaults

Open **Settings → New project defaults** to edit the starting setup for future decks. The Sheet,
Print, Card backs, Cut guides, and Alignment groups share one draft and one **Save defaults**
button. Select **Also apply to current project** if the open deck should use those choices too.
Theme and project-folder changes on the Appearance and Project library pages apply immediately.

## Next step

Before printing, continue with the [Cricut workflow and physical validation guide](CRICUT-WORKFLOW.md).
For registered Cricut layouts, set up and save the cut template in Design Space once, capture its
print output as a PDF, and import it into CriProx. For each deck, save the finished PDF from
CriProx, print it from a dedicated PDF application at **100% / Actual size**, then cut with the
matching saved Design Space project using **Already Printed / Skip printing** when available.
CriProx saves print files; it does not print directly or control the cutter. Manual cutting also
uses a saved PDF printed from a PDF application, with paper-edge guides for trimming or a matched
Basic Cut template for Cricut.
