# Qwen 4 solo: five practical tests

Original outputs from `qwen4-max-preview` (API name `qwen4.0-max-preview`), tested on 13 November 2026 through official Alibaba Token Plan in Singapore, with Qwen Code 0.27.3.

One English task prompt per test, no task hints or manual fixes to model results. The model could inspect and iterate on its own work. Main sessions used xhigh; the pet included four short CLI calls with effort=none. Up to 60 active model minutes per test. No numerical scores have been invented.

Open `index.html` through a local static server for the gallery. All results except the desktop pet run in the browser. Goldberg needs Matter.js 0.19.0 from cdnjs; the habitat needs Three.js 0.160.0 and OrbitControls from jsDelivr. WebGL is required for the habitat.

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory .
```

Then open http://127.0.0.1:8765/ in a browser. No npm server, build step or API key is required for this site.

| # | Result | Open | Observations |
|---|---|---|---|
| 1 | Capybara bathing in a teacup, animated SVG | [SVG](1-svg/scene.svg) | Valid SVG, seamless 8-second loop in the original independent check. |
| 2 | Hamster wake-up machine | [Play](2-goldberg/index.html) | First three recorded attempts failed; an additional attempt succeeded. Do not infer an overall success rate. START begins, R resets. |
| 3 | Qwpie / Taskbar Magpie, Windows Electron pet | [Gallery](3-desktop-pet/index.html), [source ZIP](3-desktop-pet/Qwpie-source.zip), [instructions](3-desktop-pet/README.md) | Author demonstrated dragging and tossing. Clipboard classification has limitations. Source distribution, not a standalone EXE. |
| 4 | Wormhole Glacier mini-golf | [Play](4-minigolf/index.html), [blueprint](4-minigolf/my-hole.svg) | Both routes passed the original checks, in 1 and 5 strokes. The author found the portal shortcut too easy. Drag back and release, O toggles blueprint, R resets. |
| 5 | Whisker Hollow, Three.js colony | [Open](5-hamsters/index.html) | Independent 5-minute x4 check: 4-10 hamsters, 6 births, 3 generations, no JS errors. Death was later observed by the author during recording. This does not establish indefinite stability. |

English task prompts and their Russian counterparts are in [prompts/](prompts/). The three mini-golf reference drawings are in `4-minigolf/examples/`. The historical pet prompt mentions paid generation, but it is documentation, not a step needed to launch the released pet. No generation tooling or key is included.

## Time, tokens and comparison cost

| Test | Active minutes | Known tokens |
|---|---:|---:|
| SVG | 21.0 | 3,883,122 |
| Goldberg | 60.0 | 25,660,445 |
| Desktop pet | 60.0 | 21,981,066 |
| Mini-golf | 32.1 | 10,287,022 |
| Habitat | 37.4 | 9,549,693 |
| Total | 210.5 | 71,361,348 |

Known input: 5,147,049 uncached + 65,619,340 cached. Output: 594,959 including reasoning. Do not add cache or reasoning again. Two interrupted Goldberg requests returned no usage. The initial invalid SVG configuration attempt and separate setup attempts are excluded.

Actual monetary billing under Alibaba Token Plan is not returned by the API. **$30.27 is only a comparison using Qwen3.8 Max 0902 rates on OpenRouter**, not Qwen 4 pricing: $2/M uncached input, $0.25/M cache reads, $6/M output. The arithmetic is `(5147049*2 + 65619340*0.25 + 594959*6)/1000000 = 30.27081`.

Existing pet images cost 66 KIE credits (11 images at 6 credits), nominally $0.33. The combined comparison is **$30.60**. It is not the actual Qwen 4 bill. No new paid calls, generations or credits were used to prepare this publication.

This calculation follows the supplied project accounting as of 14 November 2026; it is not a current quote. Provider references: [OpenRouter model listing](https://openrouter.ai/models), [KIE image model](https://kie.ai/gpt-image-2-5), [KIE pricing](https://kie.ai/pricing).

## Provenance and publication scope

The SVG, Goldberg, golf, blueprint, habitat, pet runtime source, processed sprites and reference drawings are copied byte for byte from the model results. The publication adds this landing page, a pet gallery, previews, instructions, ZIP packaging and a minimal pet package manifest. It does not repair model behavior.

No environment files, secrets, paid generation tools, node_modules, private logs, harnesses, test clipboard samples, OBS recordings or montage materials are included. Full montage notes are not redistributed.

The structure and dark card styling follow [Fable 5.2 solo](https://github.com/KostiKoNeuro/fable-5-2-solo), [Hy4 solo](https://github.com/KostiKoNeuro/hy4-solo), and [Kimi K3.1 Pro](https://github.com/KostiKoNeuro/kimi-k31-pro-5-tests). Those repositories declare no root license in the inspected metadata. No new blanket license is assigned here. Dependency notices and precise source references are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Prepared for the «Ботанутый Костя» channel. [GitHub](https://github.com/KostiKoNeuro), [Telegram](https://t.me/kostik_neuro). No video URL was supplied, so no placeholder or unrelated video link is included. This folder is prepared locally and has not been published.
