# Installing and running CriProx

## Desktop releases

Download the newest stable build from [GitHub Releases](https://github.com/Go2Engle/CriProx/releases/latest).

| Platform | Release package    | Support notes                                                                                   |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| macOS    | Universal DMG      | Runs on Apple Silicon and Intel Macs. Releases are Developer ID signed and notarized.           |
| Windows  | x64 NSIS installer | The installer is currently unsigned and may trigger a SmartScreen warning.                      |
| Linux    | x64 AppImage       | CriProx can create project and export files, but Cricut Design Space is not available on Linux. |

Windows and Linux installers are built on their respective GitHub-hosted runners. Runtime behavior can still vary by distribution, graphics stack, printer driver, and security settings, so issue reports should include the CriProx version and operating-system details.

CriProx checks the repository for a newer stable release when the desktop app starts. The notice is informational: downloads and installation remain under your control, and automatic update installation is not configured.

## Opening the macOS app

Only use a copy downloaded from the official CriProx repository. Open the DMG and move `CriProx.app`
to **Applications** before launching it.

CriProx asks macOS for access to your Documents folder because the default project library is stored
in `Documents/CriProx`. macOS remembers your choice for the signed application, so this prompt should
appear only once. A newly signed release can require one final prompt when replacing an older unsigned
build.

If the prompt repeats with the latest release, confirm that the app is in **Applications** and report
the CriProx and macOS versions in a bug report.

## macOS release signing

The macOS packaging command requires a Developer ID Application certificate and notarization
credentials. The release workflow reads them from the `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` GitHub Actions secrets. It fails instead of
publishing an unsigned macOS build when those credentials are unavailable.

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

## Available commands

| Command                   | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `npm run dev`             | Start the Vite browser preview on localhost                  |
| `npm run desktop`         | Build the renderer and launch it in Electron                 |
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

CriProx has no user account, hosted project service, or cloud sync. Browser-mode data is stored in the browser profile. Desktop mode keeps the active workspace in the application's local profile and managed projects in `Documents/CriProx` by default, or in the folder selected from Project settings. Export a JSON backup before clearing site/application data or switching environments.

## Next step

Before printing, continue with the [Cricut workflow and physical validation guide](CRICUT-WORKFLOW.md). The Design Space handoff is an essential part of the process, not an optional driver setup.
