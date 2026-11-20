# Solara-Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kusumaalief/Solara-Bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kusumaalief/Solara-Bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solara Bay v3 is a 3D blocky open-world crime game in the spirit of GTA 6, built with Three.js (vendored locally — the game makes no network requests). You play Leo Marin, back in Solara Bay and in debt: explore a 640×480 blocky city on foot or behind the wheel, steal cars, outrun the police as your wanted level climbs, and run five story missions — Borrowed Wheels, The Courier, the Bay Heist, the Harbor Lights race, and The Getaway — with three named mission givers (Mara Voss, Dario Kess, Officer Reyes). Between jobs there are taxi fares to run and sun coins to collect on Solara Beach, and earning cash unlocks a sports car at the Harbor Garage and the beach cabana.

What's new in v3: Marin's Armory, a gun shop run by Gus Ferraro — buy the Bay Pistol ($150), the Boomstick shotgun ($400) or the Harbor Rifle ($700), each with its own damage, fire rate, range, magazine and ammo, plus $40 ammo packs. Pick your gun in the weapon chooser (Tab or B, or F at the armory): big cards with a blocky gun icon, full stats, price and owned status, locked guns greyed out; equip with a click or 1/2/3. The HUD shows the equipped gun and its ammo, guns have distinct sounds, tracers and muzzle flashes, and Leo visibly holds the gun he's carrying. Also new: Vinyl Bay Records music store and the Record Row plaza (kiosk, food cart, market stalls, benches and a neon-skyline billboard), the Violet Towers, and a bus stop — new blocky objects inspired by a city street pack, using three of its textures (downscaled to 512px, 48 KB total) as storefront facades and a billboard. All city, characters, vehicles, names, story, art and sound are original, apart from those three free-to-use pack textures, credited below.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in a desktop browser
```

Controls: WASD move/drive · mouse drag to look · click to shoot · E enter a car · F interact · Q punch · Space jump · H horn · R restart · V camera reset · Shift run · P pause · C save · M mute · T reload · 1/2/3 switch gun · Tab/B weapon chooser. Staged screenshot scenes are available at `?shot=chase|drive|mission|armory&seed=7`.

## Credits

Three textures in `game/textures/` (`facade-orange.jpg`, `facade-violet.jpg`, `skyline-neon.jpg`) come from a free-to-use low-poly city street pack supplied by the entrant, downscaled to 512px for the game; the pack's FBX model itself is not used. Everything else is original.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cnh431p3&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
