# Wakkerdam Online Helper — v0.3.43

Een privé online helper/prototype voor een Weerwolven-achtig spel met drie schermen:

- **Speler**: joinen, geheime rol zien, stemmen en nachtacties uitvoeren.
- **Host / Verteller**: rollen kiezen, spel starten, nachtstappen doorklikken, acties volgen, stemmingen openen/sluiten.
- **Infoscherm**: openbaar scherm voor beamer/tv met fase, burgemeesterstemming, dagstemming en eliminatie-animaties.

Deze build gebruikt dezelfde simpele stack als Theater Balance Scale:

- Node.js
- Express
- Socket.IO
- gewone HTML/CSS/JS in `public/`


## Nieuw in v0.3.43

- **Start spel** en **Reset** staan permanent in dezelfde bovenste actierij; tijdelijke faseknoppen verschijnen uitsluitend eronder.
- De Ziener ziet na bevestiging duidelijk de naam en rolkaart van de onderzochte speler, zonder opnieuw de eigen bekende rolkaart te tonen.
- De Host ziet bij een bevestigde Zienerkeuze onder **Bekijkt** dezelfde spelersnaam en beschikbare rol-PNG.
- Iedere doelkeuze toont de spelersnaam met daaronder een vaste spelerkaart. Tot een rol bekend mag zijn, is dat een stabiele Burgerkaart.
- De Ziener onthoudt onderzochte rollen: bij een volgende nacht verschijnt voor die speler de werkelijk ontdekte kaart.
- Geliefden zien elkaars naam en echte rolkaart met de melding om rond te kijken en hun geliefde te spotten.
- Nachtacties eindigen met **Je antwoord is doorgevoerd** en **De [rol] gaat weer slapen**; losse teksten als *Ingestuurd* zijn verwijderd.
- Heksdoelen volgen dezelfde kaartvorm als andere spelerskeuzes. Alleen de rode/groene selectie blijft; extra emoji-iconen zijn verwijderd.
- Hostresultaten gebruiken één rustig resultaatvak. De Zienerkaart staat direct onder **Bekijkt**, zonder extra blauw rolvak.
- Publieke statuswijzigingen van eliminaties en winnaars worden pas vrijgegeven wanneer hun reveal klaar is; de Host blijft alles direct live zien.
- Alle winstuitkomsten gebruiken dezelfde filmische overgang: eerst volledig zwart, dan de nieuwe eindpagina plaatsen, daarna weer infaden.
- Dagstembalken en tellers blijven allemaal bewegen tot hetzelfde eindmoment; de laatste stem en de grafiek bereiken gelijktijdig hun definitieve stand.
- **Het Dorp** staat weer boven de dorpskaartengroep; het rode wolvenpaneel heeft meer afstand en ruimere wolfkaarten.

## Nieuw in v0.3.41

- Het scherm **Het Dorp wint** toont alle dorp-/spelerskaarten in één gelijkmatig kaartformaat links, met de verslagen wolven in een compact rood paneel rechts op dezelfde hoogte.
- De winnaarspagina berekent automatisch een passende kaartkolom- en rijverdeling voor kleine én grote groepen.
- Stem- en rolkeuzevakjes op het Spelerscherm behouden een natuurlijke grootte, worden netjes over de beschikbare ruimte verdeeld en wrappen pas wanneer dat nodig is.
- Lange spelersnamen schalen binnen hun keuzevakje zonder dat de vakken van rand tot rand worden uitgerekt.
- **Host → Huidige stap** toont alleen de actieve rol, de rolspeler en de relevante keuzevakken.
- Voor Heks, Ziener, Cupido, Fluitspeler en vergelijkbare rollen ziet de Host voorlopige selecties live; na insturen verandert de status naar **Bevestigd**.
- Voorlopige keuzes blijven op het Spelerscherm geselecteerd tijdens realtime updates en na reconnect; opnieuw aantikken maakt een doelkeuze weer leeg.
- Hekskeuzes springen niet meer terug naar **niemand** wanneer de Host live wordt bijgewerkt.
- Dubbele test-/previewvakken, voortgangsbalken en vinkjes zijn uit de rolweergave van **Huidige stap** verwijderd.
- Het winnaarscherm gebruikt nog maar één titel en houdt kaarten plus het rode wolvenpaneel volledig binnen breedbeeld, tablet en telefoon.

## Nieuw in v0.3.40

- De brede HUD-centreer- en viewportlaag uit v0.3.39 is grotendeels teruggedraaid naar de bestaande indeling.
- De stabiele dagstemmingsanimatie blijft behouden: de grafiek staat eerst centraal en schuift daarna zonder overshoot opzij.
- Nacht-spelersvakjes gebruiken weer hun natuurlijke naambreedte, verspreiden zich over de rij en wrappen pas als de schermbreedte dat vereist.
- De vakjes bij “spelers hebben gestemd” volgen de naambreedte en verkleinen lange namen automatisch.
- Stembalken en tellers bereiken zichtbaar de laatste stem en houden die kort vast voordat de einduitslag verschijnt.
- De eerdere “Het Dorp wint”-indeling is hersteld.
- De kaartafbeeldingen van de Heks en Ziener zijn hersteld op het Speler- en Infoscherm.
- De Windows-starter opent Player, Host en Info automatisch zodra de server bereikbaar is.

## Nieuw in v0.3.39

- HUD-elementen op Host, Speler en Infoscherm blijven gecentreerd en binnen de viewport.
- Spelertitels gebruiken geen negatieve viewportmarges of `translateX`-correcties meer.
- Het onderste spelersoverzicht op het Infoscherm heeft een vaste, gecentreerde plek en schaalt mee van kleine tot zeer grote groepen.
- Kandidaat-, stemuitslag-, eliminatie- en winnaarschermen schalen compacter bij weinig ruimte.
- De dagstemgrafiek schuift vloeiend op zonder overshoot wanneer de eliminatiekaart verschijnt.
- Dubbele koppen, statusregels en uitlegtekst zijn waar mogelijk verwijderd of verkort.

## Nieuw in v0.3.38

- Host wolfkaarten worden groen voor wolven die het huidige meest gekozen doelwit volgen en rood voor afwijkende doelwitten.
- Wolfmarkersegmenten in spelerdoelwitten hebben iets meer tussenruimte.


- De Kick-knop staat nu op de plek waar de 👑 kroonknop stond.
- De spelerknoppen staan nu compacter naast elkaar: **Kick**, **Kill**, **Revive**.
- De kroonknop is uit de spelerknoprij gehaald, zodat Kick niet meer onder Revive valt.



## v0.3.15

- Weerwolven-kiesproces gefixt: aanklikken is nu alleen een voorlopige selectie; het spelerscherm blijft actief zichtbaar totdat je expliciet op OK / bevestigen drukt.
- Wolven zien live gekleurde markers, tellers/streepjes en bevestigingsstatussen per doelwit.
- Wolven kunnen hun bevestiging annuleren of wijzigen zolang de consensusstap nog actief is.
- Spelerscherm gebruikt minder extra vakken: rolkaartafbeeldingen staan directer in beeld zonder extra zichtbare kaart-doos eromheen.

## v0.3.15

- Hostscherm/hoofdscherm rustiger gemaakt: dezelfde medieval-card stijl, maar minder drukke goudlijnen en minder ornament-randen.
- Spelerscherm centreert rolkaarten en hoofdteksten duidelijker in het midden van het scherm.
- Reset verbeterd: na reset blijft dezelfde lobby bruikbaar en kun je opnieuw starten met de bestaande spelers/testspelers.

## v0.3.15

- UI verder richting de karakterkaart-stijl: donkerblauw, parchment, goudlijnen en minder standaard moderne web-app look.
- Spelerscherm na joinen is meer beeldvullend zoals het Infoscherm, zonder groot los paneel/vak rondom de actie.
- Vierkante, scherpere panelen blijven behouden.

## Belangrijk

Deze app bevat geen officiële artwork, tegels, logo's of letterlijk overgenomen handleidingtekst. De rolbeschrijvingen zijn korte, eigen samenvattingen voor privégebruik/testen.

## Lokaal starten

Dubbelklik op:

```text
START-WAKKERDAM-LOCALHOST.bat
```

Of handmatig:

```bash
npm install
npm start
```

Open daarna:

- Speler: `http://localhost:3000/` of `http://localhost:3000/player`
- Host: `http://localhost:3000/host`
- Infoscherm: `http://localhost:3000/info`

`/viewer` bestaat nog als oude alias, maar stuurt door naar `/info`.

## Render.com

- Language: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

## Nieuw in v0.3.15

- De Weerwolven-kill is nu een echte gezamenlijke consensusactie: elke levende wolf kiest live een doelwit, ziet de keuzes van de andere wolven met markers/kleuren, kan OK drukken of annuleren, en de kill wordt pas vastgezet als alle levende wolven hetzelfde doelwit hebben bevestigd.
- Het hostscherm toont bij de huidige nachtstap een compacte tijdlijn met rol-iconen en pijltjes, waarbij de actieve stap oplicht.
- Het spelerscherm is veel rustiger en beeldvullend gemaakt: geen spelersaantal, berichtenblok, statuslabels, versienummer of extra badge meer tijdens het spel. Alleen de actuele actie staat centraal.
- Dode spelers krijgen nu een duidelijk rood eliminatiescherm.
- Belangrijke spelerkeuzes werken veiliger: bij het kiezen van een speler selecteer je eerst een vakje en bevestig je daarna apart.
- Nacht-/ronde-eliminaties worden beter gegroepeerd: als bijvoorbeeld de Jager na zijn dood nog iemand meeneemt, blijft die extra dode bij dezelfde ronde/nachtrapportage op het Infoscherm staan.
- Het Burger-icoon is geel gehouden voor betere herkenbaarheid.

## Nieuw in v0.3.15

- Burgemeesterverkiezing is opgesplitst in twee duidelijke fases:
  1. spelers stellen zich kandidaat;
  2. daarna opent de host pas de stemronde.
- Op het hostscherm staat nu één duidelijke knop **Start burgemeesterverkiezing**, daarna **Laat spelers stemmen**, daarna **Rond burgemeester af**.
- Spelers krijgen op hun telefoon uitleg over wat burgemeester zijn betekent: je stem telt dubbel bij dagstemmingen.
- Spelers mogen bij de burgemeesterstemming niet op zichzelf stemmen, ook kandidaten niet.
- Het Infoscherm toont bij de burgemeesterfase alleen de informatie die op dat moment nodig is: eerst kandidaten, daarna live stemmen.

## Nieuw in v0.3.15

- Het Infoscherm heeft nu natuurlijkere spacing tussen titel, tekst, spelerslijst en eliminatievakken.
- Het Infoscherm toont tijdens de nacht alleen algemene publieke tekst, zoals: “Het is nacht. Iedereen slaapt.” Geen verteller-/hostdetails meer.
- De achtergrond van het Infoscherm verandert nu mee met de fase: lobby, nacht, dag/stemming en einde hebben elk een andere sfeer.
- Dode spelers op het Infoscherm hebben een duidelijkere maar rustiger styling.
- Het speelscherm/spelerscherm is tijdens het spel beeldvullender gemaakt, terwijl het lobbyscherm hetzelfde blijft.

## Nieuw in v0.3.15

- Burgemeester-kandidaat stellen is nu definitief: spelers kunnen hun kandidatuur niet meer intrekken.
- Het Burger-icoon is geel/duidelijker gemaakt.
- Keuzevakken op het spelerscherm hebben nu duidelijke witte tekst en betere knopstijl voor telefoons.
- Als de Ziener een speler kiest, ziet de Ziener direct de gevonden kaart/rol op het eigen scherm.
- De host ziet de actuele keuzes/resultaten van de huidige nachtstap nu in een duidelijk overzicht, in plaats van ruwe debug-JSON.
- Het Infoscherm is nu beeldvullend: geen bovenbalk, geen versienummer, alleen de informatie die op dat moment nodig is.
- Oude speler-sessies van een vorige lobby/build mogen niet meer automatisch als nieuwe speler joinen; spelers moeten dan opnieuw hun naam invoeren.

## Nieuw in v0.3.15

- Het Windows-opstartbestand gebruikt `call npm install` en `call npm start`, zodat het consolevenster open blijft.
- Het opstartvenster toont duidelijk dat het open moet blijven zolang de localhost-server draait.
- Als Node/npm of `package.json` niet gevonden wordt, blijft het venster open met een duidelijke foutmelding.

## Nieuw in v0.3.15

- “Viewerscherm” heet nu in de UI **Infoscherm**.
- Hostlink opent nu `/info`.
- Spelerscherm gebruikt per tab `sessionStorage`, zodat je op dezelfde computer meerdere tabbladen als verschillende spelers kunt joinen.
- Naamveld krijgt automatisch focus; leeg op Enter joinen geeft automatisch `Speler 1`, `Speler 2`, enzovoort.
- Spelerscherm is compacter gemaakt voor telefoons.
- Telefoon trilt kort wanneer een speler een nieuwe actieve actie krijgt, als het apparaat de Vibration API ondersteunt.
- Hostknoppen zijn contextgevoeliger: burgemeester/dagstemming-knoppen verschijnen pas wanneer ze logisch nodig zijn.
- Skip-knop is verwijderd uit de host-UI.
- Host kan pas naar de volgende nachtstap als de actieve menselijke spelers klaar zijn.
- Rechtsonder op het hostscherm staat een debug-knop met:
  - `Kopieer debug`
  - `Kopieer console`
  - `Voeg extra speler toe`
- Testspelers kunnen in de lobby worden toegevoegd om layout/spelerslijsten te testen.

## Wat zat er al in v0.1.0?

- Lobby met spelers joinen.
- Host kan roltegels selecteren met uitleg en aantallen.
- Rollen worden geheim uitgedeeld zodra aantal geselecteerde tegels gelijk is aan aantal spelers.
- Host kan nacht starten en per rol doorklikken.
- Spelers krijgen alleen hun eigen geheime prompt.
- Wolven kiezen samen een slachtoffer.
- Heks kan één keer redden en één keer vergiftigen.
- Ziener kan inspecteren.
- Cupido kiest geliefden.
- Wolfshond, Wolvenkind, Vos, Fluitspeler, Witte Weerwolf, Grote Boze Wolf en Besmettelijke Oerwolf hebben eerste werkende logica.
- Burgemeesterverkiezing met kandidaatstelling, stemmen via spelers en live balkjes op Infoscherm.
- Dagstemming met stemmen via spelers en live balkjes op Infoscherm.
- Eliminaties met rode animatie op Infoscherm.
- Host heeft noodknoppen voor handmatig elimineren/reviven/burgemeester zetten.

## Bekende beperkingen

- Dit is een speelbare basis, geen perfecte vervanging van een menselijke spelleider.
- Het Onschuldige Meisje is in een online versie vooral een passieve/roleplay-rol; er is geen echte fysieke “gluur”-mechaniek.
- Testspelers zijn handig voor layout-testen, maar echte spelers moeten met een eigen telefoon/tabblad joinen om acties zelf uit te voeren.
- De Dorpsoudste, Ridder met Roestige Zwaard, Jager, Geliefden en Wolvenkind hebben basislogica, maar kunnen in zeldzame randgevallen nog hostcontrole nodig hebben.
- Stemgelijkheid wordt standaard als “niemand automatisch geëlimineerd” afgehandeld. De host kan daarna handmatig iemand elimineren als jullie anders spelen.

## Structuur

- `server.js` — alle game state + Socket.IO events
- `public/index.html` — speler
- `public/player.js` — spelerlogica
- `public/host.html` — host
- `public/host.js` — hostlogica
- `public/viewer.html` — infoscherm HTML, oude naam intern behouden
- `public/viewer.js` — infoschermlogica, oude naam intern behouden
- `public/style.css` — styling
