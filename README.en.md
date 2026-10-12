[简体中文](README.md) | [日本語](README.ja.md) | **English**

<div align="center">

# OverplayHUD

Restore the CS:GO-era HUD in Counter-Strike 2

A full-screen transparent overlay built on Valve's official Game State Integration

![version](https://img.shields.io/badge/version-2.1.0-CC0000?style=flat-square)
![platform](https://img.shields.io/badge/platform-Windows-111111?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-111111?style=flat-square)

![Overlay](docs/hud.png)

</div>

---

## Overview

Counter-Strike 2 replaced the HUD layout of the CS:GO era. This project draws a fully transparent,
mouse-through overlay on top of the game, reproducing the scoreboard, money, health and armor,
ammunition, kill-streak indicator and weapon list in the CS:GO layout and visual style.

All data originates from the official GSI (Game State Integration) interface provided by Valve.
The game process posts JSON payloads to a local port; the application only receives and renders them.
It does not read game memory, inject DLLs, hook the render pipeline, or simulate any input.

> Use on third-party anti-cheat platforms such as Faceit, ESEA, 5E and B5 is not advisable.
> Their detection policies are considerably more aggressive than VAC, and an overlay may itself
> be treated as a violation.

## Features

**HUD modules**

| Module | Description |
|---|---|
| Scoreboard | Centered at the top; team emblems, alive indicator, score and round timer |
| Money | Current balance; purchase and kill rewards shown on additional rows |
| Health and armor | Bottom bar; health mapped to four state levels, armor and helmet indicated separately |
| Ammunition and kill streak | Bottom right; kill-streak skull badges, magazine and reserve counts |
| Weapon list | Vertical column on the right; primary, secondary, melee, grenades, special equipment |

**Notifications and customization**

- Text notifications for five event types: kill, multi-kill, death, assist and MVP. One notification per frame.
- An arbitrary number of custom text elements, supporting variable interpolation (health, money, stats, round, and more).
- A built-in drawing tool for rectangles, ellipses, lines, freehand curves and text, saved as HUD elements or icons.

**Appearance and configuration**

- Twelve built-in font presets, or any system font.
- Per-element offset, scale, rotation, opacity, glow and outline.
- Advanced appearance: entrance, pulse and shake animations, curved text, gamepad vibration.
- A graphical settings interface with live preview for every option.

**Other features**

- Automatic detection of the CS2 installation directory; one-click installation of the GSI configuration
  and the native HUD disabling commands.
- Configuration profiles can be exported, imported and shared.

## Download and Installation

Both the installer and the portable build are published on the **Releases** page of this repository.

| File | Description |
|---|---|
| `OverplayHUD-x.y.z-setup.exe` | Installer; creates Start menu and desktop shortcuts (recommended) |
| `OverplayHUD-x.y.z-portable.exe` | Single-file portable build; no installation required |

Installation procedure:

1. Run the application. An OverplayHUD icon appears in the system tray.
2. Right-click the tray icon and select "安装 GSI 配置到 CS2" (Install GSI configuration to CS2).
3. Exit CS2 completely and restart it. Reconnecting to a server is not sufficient.
4. In the CS2 video settings, set the display mode to "Fullscreen Windowed";
   otherwise the overlay will be hidden behind the game.
5. Right-click the tray icon and select "设置" (Settings) to adjust the appearance.

> The settings interface is currently available in Chinese only.

## Building from Source

Intended for code modification or self-building. Requires Node.js 18 or later and Windows.

### 1. Install the GSI configuration

```bash
npm run install-cfg
```

The CS2 directory is located automatically and `gamestate_integration_overplayhud.cfg` is copied into
both `game/csgo/cfg` and `game/core/cfg`. CS2 ships two cfg directories, and placing the file in only
one of them may silently fail. If detection fails, specify the game path manually:

```bash
node tools/install-cfg.mjs --game "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive"
```

CS2 must be restarted completely afterwards.

### 2. Verify the data connection

```bash
npm run verify
```

After entering a match, the terminal prints one line of status data per second.
If nothing is printed within 20 seconds, a troubleshooting checklist is displayed.

### 3. Start the overlay

```bash
npm start        # Normal use
npm run mock     # Preview with simulated data, without launching the game
```

## Disabling the Native HUD

The "原生 HUD 命令" (Native HUD commands) page of the settings interface writes the following
commands into CS2 in one click. They may also be executed manually:

```cfg
cl_draw_only_deathnotices 1          // keep only the crosshair and kill feed
cl_drawhud_force_radar 1             // keep the radar
cl_drawhud_force_teamid_overhead 1   // keep teammate overhead indicators
bind alt toggle cl_drawhud_force_deathnotices 1 0
r_drawtracers_firstperson false      // disable first-person tracers
```

The radar and the kill feed are rendered by the native game interface. GSI does not provide radar
coordinates for the local player, so both are intentionally left to the game.

## Settings Interface

The settings window opens automatically at startup. It can also be opened from the tray menu
or with `npm run settings`.

The navigation is divided into four groups: Overview, Basic, Advanced, and Tools & Help.
Appearance parameters are presented as sliders and color swatches. Changes take effect on the overlay
immediately; click Save once satisfied. Unsaved changes are discarded when the window is closed.

A "live preview" function opens a separate window that displays advanced appearance settings using
simulated data. It does not affect the current match and produces no game input.

## Limitations

The GSI interface has the following inherent limitations, which cannot be worked around:

| Item | Description |
|---|---|
| Radar and kill feed | Rendered natively by the game |
| Alive count | Unavailable from the local player's perspective; CT / T labels are shown by default. The actual count is available to observers. |
| Teammate and opponent data | Available only while spectating after death, in GOTV, or in replays |
| Kill event stream | Not available; notifications are inferred from kill / death / assist deltas between two snapshots |
| Round timer | Derived from the local clock, with an error of roughly ±0.5 s. Observer mode uses official data and is exact. |

These limitations stem from the scope Valve exposes through GSI, not from this implementation.

## Security and Compatibility

- Data originates solely from the official GSI, listening only on `127.0.0.1`, with no external ports exposed.
- No game memory is read, no DLLs are injected, no render hooks are installed, and no input is simulated.
- Displayed information is limited to what an ordinary player can already see.
- CS2 must be set to "Fullscreen Windowed"; exclusive fullscreen hides the overlay.

## Documentation

| File | Contents |
|---|---|
| **README.md** | Project overview, installation and usage (Chinese) |
| [TUTORIAL.md](TUTORIAL.md) | Illustrated tutorial: settings pages, cautions and implementation notes (Chinese) |
| [DESIGN.md](DESIGN.md) | Developer documentation: module design details, configuration reference, packaging and troubleshooting (Chinese) |
| [DEV-PLAN.md](DEV-PLAN.md) | Development plan (Chinese) |
| [ADVANCED-CONFIG-PLAN.md](ADVANCED-CONFIG-PLAN.md) | Advanced appearance configuration plan (Chinese) |

## License

[MIT](LICENSE)

This project is not affiliated with Valve Corporation. Counter-Strike, CS:GO and CS2 are trademarks
of Valve. This project only reads data through Valve's official GSI interface and redraws the
interface in its own window.
