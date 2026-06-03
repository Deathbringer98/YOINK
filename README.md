# Yoink

A Brave/Chrome extension that adds a download button to every post on X.com. Click it to grab videos and images — and yes, the YOINK sound plays every time (or don't, if you're in a meeting).

## Features

- **HD download** — videos at the highest available quality (up to 1080p)
- **SD / Discord mode** — re-encodes to ≤10 MB so clips share cleanly in Discord
- **Full-res images** — downloads originals, supports multi-photo posts
- **PNG screenshot** — saves any post as a clean, styled card image
- **YOINK sound** — plays on every download; toggle it off or dial the volume in the popup
- Blends into X's native UI — sits right in the post action bar
- Works on X.com and twitter.com
- Auto-update notifications — get a ping when a new version is available
<img width="581" height="675" alt="image" src="https://github.com/user-attachments/assets/15ee45db-ec49-4b1c-bf2f-c61b7dca5771" />

## Installation

### Brave / Chrome
1. Download or clone this repo
2. Go to `brave://extensions` or `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the folder containing `manifest.json`

### Firefox
1. Download or clone this repo
2. Run the build script to create the Firefox package:
   ```powershell
   .\build.ps1 -Firefox
   ```
3. Go to `about:addons` → gear icon → **Install Add-on From File…**
4. Select the generated `yoink-firefox.zip`

> **Temporary install (no zip needed):** go to `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.firefox.json` directly from the repo folder. Lasts until Firefox restarts.

### Safari *(requires Mac + Xcode)*
Safari extensions must be wrapped in a native app using Apple's converter tool. The code is ready — you just need to run the build step on a Mac:

1. Clone the repo on a Mac
2. Copy `manifest.safari.json` over `manifest.json` in the folder
3. Open Terminal in the repo folder and run:
   ```bash
   xcrun safari-web-extension-converter . --project-location ./safari-build --app-name Yoink --bundle-identifier com.ghostbyte.yoink
   ```
4. Open the generated Xcode project, select your team, and hit **Run**
5. In Safari → **Preferences → Extensions** → enable Yoink

> Distributing on the App Store requires an [Apple Developer account](https://developer.apple.com/programs/) ($99/year). Running locally is free with any Apple ID.

## Usage

Three buttons appear in the action row under every post:

| Button | What it does |
|--------|-------------|
| **↓ HD** | Downloads video at the best available quality, or full-res images |
| **↓ SD** | Downloads video at ≤10 MB (ideal for Discord) — video posts only |
| **📷 PNG** | Saves the post as a styled card PNG |

Click the extension icon to mute the YOINK sound or adjust the volume.

## Known Issues

**Download button not appearing / Yoink not working after install or update**

After loading or reloading the extension, X.com tabs that were already open won't pick up the new code automatically. Fix: refresh the X tab after installing or updating.

- **Windows/Linux:** `Ctrl + F5`
- **Mac:** `Cmd + Shift + R`

A regular refresh (`F5`) may not be enough — use the hard refresh to force X to reinitialise with the extension.

Disable Brave Shield if extension isn't working. Brave Shield can cause conflict with the extensions ability to function.
## License

This project is source-available for personal, non-commercial use only.
Commercial use, redistribution, and monetization are strictly prohibited.
See [LICENSE](LICENSE) for full terms.

## Support
<img width="222" height="220" alt="image" src="https://github.com/user-attachments/assets/64a3defd-fdfe-4caf-b0ee-e505cf438623" />


If this saved you time, buy me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ghostbyte-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/ghostbyte)
