# Qwpie - Taskbar Magpie

The original Qwen 4 Windows desktop pet, with all 11 existing sprite poses.
This is an Electron source distribution, not a standalone EXE.

## Run on Windows

Install Node.js LTS and npm, extract `Qwpie-source.zip`, then open a terminal in the extracted folder:

```powershell
npm install
npm start
```

The first command downloads Electron 45.3.1. The second launches the desktop pet, not a web server. No API key or paid generation is needed. This publication preparation did not run these commands or install dependencies.

Qwpie stays above windows on the primary monitor. Drag and toss the bird. The tray menu lets you feed it, put it to sleep, wake it, or exit. Idle sleep follows system keyboard/mouse inactivity.

The app watches newly copied text through a local PowerShell process and reacts to links, numbers, code and long text. The initial clipboard content is not emitted. No network request is made by the running app. Position and happiness are saved locally in Electron's userData directory.

## What is included

- `src/` - original main process, preload bridge, renderer, styles and clipboard watcher, copied byte for byte.
- `assets/sprites/` - 11 processed transparent PNG poses.
- `assets/icons/` - application and tray icons.
- `package.json` - distribution manifest with only the reviewed `electron .` start command and pinned Electron dependency.

Publication changes are limited to package metadata, this README, the gallery page and the ZIP. Model source and processed images are unchanged. Original paid sprite-generation tools, raw images, tests, clipboard samples, local configuration and logs are excluded. No sprite generation command is included.

Historical sprite cost: 11 images, 66 KIE credits, nominally $0.33. These images already existed; preparing this distribution incurred no new generation cost.

## Verification limits

The author demonstrated dragging and tossing during recording. Clipboard reactions have limitations; do not assume every text type is classified correctly. This publication checks packaging and browser previews. It does not claim a fresh Windows end-to-end test of the source ZIP.

See the root `THIRD_PARTY_NOTICES.md` for dependency licenses and provenance. No new blanket license is assigned to model output or generated art.
