# 🦪 Mosselkapitein — De Grote Oceaan

Een kleurrijke 3D-simulatiegame waarin jij kapitein bent van een vissersschip dat
gespecialiseerd is in het **vangen, bereiden en verkopen van mosselen**. Vrolijke,
semi-realistische stijl met dynamische golven, een volledige dag-/nachtcyclus en
wisselend weer. Gebouwd met [Three.js](https://threejs.org) — geen build-stap nodig.

## ▶️ Starten

De game gebruikt ES-modules, dus hij moet via een lokale webserver draaien
(dubbelklikken op `index.html` werkt **niet** door browser-beveiliging).

```bash
cd game2
python3 -m http.server 8765
```

Open daarna **http://localhost:8765** in je browser en klik op **⚓ Uitvaren!**

> Tip: elke statische server werkt ook, bijv. `npx serve` of de
> "Live Preview" van je editor.

## 🎮 Besturing

**Desktop (toetsenbord):**

| Toets | Actie |
|-------|-------|
| `W` / `S` | Gas geven / achteruit |
| `A` / `D` | Sturen |
| `F` | Sonar-ping (zoek mosselbanken) |
| `Spatie` | Mosselen vangen (vasthouden bij een bank) |
| `E` | Actie / aanmeren / eiland verkennen / redden |
| `C` | Camera wisselen (volg / dichtbij / vogelvlucht) |
| `M` | Zeekaart openen |
| `U` | Snel naar de werf (upgrades, bij een haven) |
| `G` | Meeuw op verkenning sturen (na aankoop) |
| `P` | Pauze |

**📱 Mobiel (touch):** de game herkent telefoons/tablets automatisch en toont
besturing op het scherm:

- **Joystick** (linksonder) — omhoog = vooruit, omlaag = achteruit, links/rechts = sturen.
- **🦪 Vang** — vasthouden om mosselen te vangen bij een bank.
- **📡 Sonar** en **⚓ Actie** — tik om te pingen / aan te meren / te redden.
- **Knoppenrij rechtsboven** — kaart 🗺️, werf 🔧, camera 📷, meeuw 🐦, pauze ⏸️.
- Speel het liefst in **liggende stand** (landscape).

> Touch-besturing testen op een computer? Voeg `?touch=1` toe aan de URL,
> bijv. `http://localhost:8765/index.html?touch=1`.

## 💾 Opslaan & als app installeren

- **Automatisch opslaan:** je voortgang (munten, niveau, ruim, upgrades, schip,
  schepen, eilanden en je positie) wordt elke paar seconden en bij het sluiten
  bewaard in de browser (`localStorage`). Bij terugkomst staat er **⚓ Verder spelen**;
  met **🆕 Nieuw spel beginnen** wis je de save en start je opnieuw.
- **Op je iPhone als app:** open de site in **Safari** → deelknop → **"Zet op
  beginscherm"**. Dankzij de web-manifest en het app-icoon start de game dan
  schermvullend, met eigen icoon, in liggende stand.
- **Offline spelen:** na de eerste keer laden cachet een service worker de game
  én de Three.js-bibliotheek, dus hij werkt daarna ook zonder internet en laadt
  sneller. Push je een update? Verhoog `CACHE` in `sw.js` zodat telefoons de
  nieuwe versie ophalen.

## 🧭 Gameloop

1. **Zoek** mosselbanken met de **sonar** (`F`) — groene blips op de radar.
2. **Vang** mosselen (`Spatie` vasthouden) tot je ruim vol is.
3. **Meer aan** in een haven (`E`) en open de **Kombuis** om gerechten te koken
   in de timing-**minigame** — hoe beter je timing, hoe waardevoller het bord.
4. **Verkoop** rauwe vangst en gerechten; prijzen verschillen per haven.
5. **Upgrade** op de **Werf**: groter ruim, sterkere motor, betere mosselhark,
   sonarbereik, weersmachine, meeuw, drijvend restaurant.
6. **Koop betere schepen** en word de beroemdste mosselkapitein ter wereld.

## ✨ Functies

- **Dynamische oceaan** met Gerstner-achtige golf-shader; het schip stampt en rolt mee.
- **Dag-/nachtcyclus** met zonsop-/ondergang, sterren en maan.
- **Weersysteem**: helder, bewolkt, regen, mist en storm (grotere golven, regen,
  bliksem). Regen laat mosselbanken sneller aangroeien; een **weersmachine**
  geeft beperkte invloed op het weer.
- **Biomes**: rustige kustwateren, stormachtige noordzee, tropische wateren en een
  mistige mysteriezone — elk met eigen weer en sfeer.
- **RPG-systeem**: kapitein-niveau + XP en vaardigheden (navigatie, koken, handel,
  visserij) die meegroeien en je sterker maken.
- **Kook-minigame** en **kookwedstrijden** tegen lokale kapiteins.
- **Leuke extra's**: verborgen eilanden met schatten 🏴‍☠️, gestrande zeelieden
  redden ⛑️, exotische zeedieren voor je **aquarium** 🐠, **gouden mosselen** met
  unieke krachten 🌟, **flessenpost** met missies 📜, een **meeuw** als hulpdier 🐦
  en een **drijvend restaurant** voor passief inkomen 🍽️.
- **Zeekaart** (`M`) en **sonar-radar** voor navigatie.

## 🌍 Gratis online hosten

De game is een **statische site** (alleen `index.html` + `game.js`) — dat kan
gratis bij elk van deze diensten. Je hoeft niets te installeren of te bouwen.

### Optie A — Netlify Drop (snelste, geen account-gedoe)
1. Ga naar **https://app.netlify.com/drop**
2. Sleep de **hele `game2`-map** in het vak.
3. Klaar — je krijgt direct een live URL (bijv. `https://random-naam.netlify.app`).
   Gratis HTTPS, werkt meteen op mobiel.

### Optie B — GitHub Pages (gratis, eigen URL, makkelijk updaten)
1. Maak een gratis account op **github.com** en een nieuwe repository, bijv. `mosselkapitein`.
2. Upload `index.html`, `game.js` en `README.md` (knop **Add file → Upload files**).
3. Ga naar **Settings → Pages**, kies bij *Branch* `main` en map `/ (root)`, klik **Save**.
4. Na ~1 minuut staat de game op `https://<jouw-naam>.github.io/mosselkapitein/`.

   Met de command line:
   ```bash
   cd game2
   git init && git add . && git commit -m "Mosselkapitein"
   git branch -M main
   git remote add origin https://github.com/<jouw-naam>/mosselkapitein.git
   git push -u origin main
   ```
   (zet daarna Pages aan via Settings → Pages)

### Optie C — Cloudflare Pages of Vercel
Beide gratis: maak een account, koppel je GitHub-repo (of sleep de map bij
Cloudflare), framework-preset op **"None / static"**, en publiceren maar.

### Optie D — itch.io (speciaal voor games, leuke speelpagina)
1. Account op **itch.io** → **Upload new project**.
2. Maak een **zip** van de map (met `index.html` in de root) en upload die.
3. Kies *Kind of project: HTML*, vink **"This file will be played in the browser"** aan,
   zet de viewport bijv. op 1280×720 en publiceer.

> **Belangrijk bij alle opties:** `index.html` moet in de hoofdmap van de upload
> staan en `game.js` ernaast — meer is niet nodig. De Three.js-bibliotheek wordt
> automatisch via internet (CDN) geladen, dus die hoef je niet mee te uploaden.

## 🗂️ Bestanden

- `index.html` — UI, HUD, stijl en de Three.js import-map.
- `game.js` — alle spel-logica, 3D-wereld, shaders en systemen.
- `.claude/launch.json` — config voor de ingebouwde preview-server.

Veel vaarplezier, Kapitein! ⚓
