# Wakkerdam Online Helper — v0.3.57

## Nieuw in v0.3.57

- Alle vaste telefoon-, tablet- en monitorvoorbeelden worden proportioneel volledig binnen de beschikbare teststage geschaald.
- Playeracties in **Test alle pagina’s** werken interactief en leveren echte testresultaten en vervolgschermen op.
- Een Jagerschot speelt in de tester automatisch de keuze-, impact- en overzichtsflow op het Infoscherm af.
- De ronde rolinformatieknop blijft binnen ieder geschaald previewframe klikbaar.
- De drie Spiekende-Meisje-mechanics hebben een professionele koude, blauwe sterrennachtstijl gekregen.
- Spiegelscherf en mist vragen preciezere interactie voordat een wolf duidelijk herkenbaar wordt.

## Eerder in v0.3.56

- Alle keuzelijsten in **Debug → Test alle pagina’s** gebruiken nu een expliciete donkere achtergrond met lichte tekst, inclusief de geopende opties.
- De groeps-, pagina- en Spiekende-Meisje-selectors behouden dezelfde leesbare stijl bij hover, focus en selectie, ook wanneer de browser anders een wit standaardveld toont.

## Nieuw in v0.3.55

- Het Spiekende Meisje heeft tijdens de gezamenlijke wolvenfase drie interactieve, servergestuurde spiekvarianten: oogleden, spiegelscherf en mist.
- Een shuffle-bag gebruikt iedere actieve variant precies eenmaal per cyclus en voorkomt directe herhaling tussen cycli.
- Resterende tijd, veegacties, risico, betrapping en wolvenwaarschuwingen blijven bewaard bij refresh, reconnect of een tweede apparaat.
- Iedere variant en het volledige systeem kunnen met omgevingsvariabelen los worden uitgeschakeld.
- Debug → Test alle pagina’s bevat echte interactieve previews, wolvenperspectieven, een state-inspector, rotatiesimulatie en cleanup-test.
- Paginatesterframes blijven gecentreerd en gebruiken een strikt geïsoleerde previewsessie zonder lobby-reconnects.

### Spiekmechanic of één variant uitschakelen

De toggles staan centraal in `peek-system.js` en kunnen zonder codewijziging vóór het starten van de server worden gezet:

- `WAKKERDAM_PEEK_ENABLED=0` schakelt het volledige systeem veilig uit.
- `WAKKERDAM_PEEK_EYELIDS_ENABLED=0` schakelt optie 1 uit.
- `WAKKERDAM_PEEK_MIRROR_ENABLED=0` schakelt optie 2 uit.
- `WAKKERDAM_PEEK_FOG_ENABLED=0` schakelt optie 3 uit.

De shuffle-bag gebruikt automatisch alleen de overgebleven opties. Met één actieve optie mag die iedere nacht terugkomen; met nul opties loopt de gewone wolvenfase zonder extra stap verder.

## Nieuw in v0.3.54

- Snelle selecties vervangen niet langer het volledige Playerkaart-raster. Alleen de gewijzigde selectiestatus wordt bijgewerkt en voorlopige doelen worden uitsluitend naar de betreffende speler en Host gestuurd.
- De nachttijdlijn respecteert de actuele levensstatus en eerdere dodelijke acties: een later doel of een latere rolactie valt weg zodra die speler eerder in de nacht sterft. Een Host-revive maakt de speler weer beschikbaar; de levensdrank van de Heks blijft de bewuste reddingsexceptie.
- **Betoverden zien elkaar** staat vooraf in iedere relevante nachttijdlijn. Sterft de Fluitspeler, dan volgt de volgende nacht éénmalig **De betovering is verbroken**, waarna alle betoveringen en toekomstige stappen verdwijnen.
- Ontbrekende nachtacties, kandidaatantwoorden, burgemeesterstemmen en dagstemmen kunnen altijd door de Host worden geforceerd. Iedere forceerknop gebruikt dezelfde aftellende balk van één seconde.
- Selectiemomenten met een maximum tonen een korte melding wanneer eerst iemand gedeselecteerd moet worden.
- De Heks gebruikt geen selectievakje rechtsboven meer; de tegels **Niemand redden** en **Niemand vergiftigen** zijn herkenbaar geel, met een sterkere rand wanneer ze werkelijk gekozen zijn.
- Na bevestiging zien geliefden **Je hebt je geliefden gezien**.
- De stemgrafiek start alle balken tegelijk en gebruikt voor iedere balk dezelfde fysieke stijgsnelheid; de hoogste balk bereikt na exact drie seconden zijn eindhoogte.
- De eindovergang is rustiger en langer. Dorpswinst houdt een zonnige, hoopvolle dageraad vast; wolvenwinst een donkerrode nachtelijke sfeer. Fluitspeler- en geliefdenwinst hebben een eigen blijvend thema.
- De Debugtab bevat een mobiele **Test alle pagina’s**-studio met alle echte Player- en Infoschermen, gegroepeerd per rol/fase en schakelbare telefoon-, tablet- en monitorformaten.

## Nieuw in v0.3.53

- Op telefoon en tablet bewaart de Heks de levensdrank- en gifdrankkeuze los van elkaar. Beide doelen worden samen vooraf getoond en atomair bevestigd, zodat tegelijk redden en vergiftigen betrouwbaar werkt.
- Hekskeuzes zijn op touchschermen duidelijker: alleen een werkelijk gekozen reddingsdoel krijgt groen en een vergiftigingsdoel rood. **Niemand redden** en **Niemand vergiftigen** zijn standaard neutraal en worden pas gemarkeerd wanneer ze bewust zijn gekozen.
- Wanneer een mobiele browser na appwissel, tabwissel, vergrendeling of sluimerstand terugkeert, vraagt het Spelerscherm direct de actuele spelstatus op. Een vastgelopen mobiele verbinding wordt automatisch opnieuw opgebouwd, zonder handmatig verversen.
- De buitenste panelen van het Betoverden-overzicht zijn weer volledig neutraal. Alleen iedere afzonderlijke spelerskaart houdt een dun, subtiel paars accent.
- Betoverde spelers zien op hun eigen rustige spelerscherm **Je bent betoverd!** met daaronder **De Betoverde**.
- Bij winst van de Fluitspeler staat de Fluitspelerkaart centraal bovenaan en staan alle ooit betoverde spelers eronder, inclusief grijze kaarten van overleden Betoverden.
- De eindovergang heeft voor een Fluitspelerwinst een eigen paarse, diagonale cinematische overgang die subtiel in het eindscherm blijft doorwerken.
- De Jageraankondiging toont niet langer de technische tekst over de automatische tiensecondenfallback.

## Nieuw in v0.3.52

- Zodra alle wolven hetzelfde slachtoffer hebben bevestigd, krijgen zij dezelfde rustige actiebevestiging als andere nachtrollen: **Je koos**, de naam en Burgerkaart van het slachtoffer, **Te doden** en **De Weerwolven gaan weer slapen**.
- Rollen die de Host vooraf op spelers toepast blijven als lobby-preset bewaard en staan na Reset weer bij dezelfde spelers geselecteerd.
- Testspelers hebben drie eenvoudige speelstijlen. De Heks en Besmettelijke Oerwolf gebruiken hun kracht nu soms echt, terwijl Ziener en Vos minder vaak dezelfde speler opnieuw onderzoeken en de Fluitspeler afwisselt tussen één en twee doelen.
- De knop na het Jager-overzicht kan niet meer disabled blijven door een oude forceertimer; **Naar volledig dagoverzicht** is meteen normaal aanklikbaar.
- Kaart-PNG's op het Spelerscherm worden tijdens live state-updates als bestaande, reeds gedecodeerde DOM-nodes hergebruikt. Ongewijzigde schermen worden niet opnieuw opgebouwd, waardoor het korte verdwijnen/terugkomen op andere apparaten is weggenomen.
- **Geliefden zien elkaar** staat vanaf het begin in de tijdlijn van nacht één wanneer Cupido meespeelt. Na Cupido wordt dezelfde stap met de echte geliefden gevuld; vanaf nacht twee staat hij er niet meer in.
- Telefoon- en tabletkeuzes gebruiken weer de gecentreerde monitorcompositie, maar met echte verticale pagina-scroll, leesbare minimumkaartmaten en een bereikbare sticky bevestigingsknop.
- Host- en Info-overzichten zijn op touchformaten opnieuw gecentreerd zonder de leidende monitorindeling te wijzigen.

## Nieuw in v0.3.51

- Iedere levende wolf toont zijn live doel op het Hostscherm met spelersnaam en vaste kaart-PNG. Na consensus staat het daadwerkelijke wolvenslachtoffer één keer apart.
- De stemgrafiek laat alle balken tegelijk en met dezelfde fysieke snelheid vertrekken; de hoogste balk bereikt na exact drie seconden zijn eindhoogte en kortere balken zijn eerder klaar.
- Het onzichtbare debugvlak en de lang-indrukactie op het woord “in” zijn verwijderd. Spelerdebug opent uitsluitend na vijf snelle, losse D-toetsen.
- Jagerkaarten krijgen geen bullseye-rolmarkering meer. Alleen het slachtoffer van het laatste schot krijgt het kleine bullseyevak.
- De Jageraankondiging gebruikt de generieke tekst **De Jager lost nog één laatste schot** en plaatst het grote bullseye-embleem boven de Jagerkaart.
- Het Hostscherm toont gedurende de volledige Jagerflow ook de Jagerkaart en ziet een gekozen schotslachtoffer onmiddellijk, voordat het Infoscherm de uitslag openbaar maakt.
- Burgemeesterverkiezing, dagstemming en een volgende nacht zijn op zowel Host als server geblokkeerd totdat de Jagerflow volledig is afgerond. Een onbeantwoorde Jagerkeuze kan nog steeds veilig willekeurig worden geforceerd.
- Betoverde kaarten gebruiken alleen een zachte paarse outline; de extra paarse vlakken, gloed en overbodige groepskop zijn verwijderd.
- **Start spel** is groen.
- Het winnaarsscherm gebruikt een diagonale, teamafhankelijke cinematische overgang: een gouden zonsopkomst voor het dorp en een rode zonsondergang voor de wolven.

## Nieuw in v0.3.50

- De volledige Jagersequentie gebruikt voortaan één herkenbaar bullseye-icoon: in de aankondiging, tijdens het richten, bij het schot en als kleine markering op Jager- en schotkaarten.
- De uitgeschakelde Jagerkaart, koppen, subtitels, bullseye en schotteksten zijn horizontaal en verticaal opnieuw gecentreerd voor monitor, tablet en telefoon.
- De aankondiging gaat niet meer na enkele seconden vanzelf naar de keuze. De Host kan normaal doorklikken; pas na tien seconden treedt de automatische fallback in.
- Het Jager-overzicht toont uitsluitend het schotslachtoffer en eventuele gekoppelde gevolgslachtoffers. Na een aparte Hostklik volgt via zwart het volledige dag-/rondeoverzicht, inclusief de Jager.
- De live uitschakeling door het schot heeft een gelijktijdige impactflits en kaartimpact zonder dat het Player-resultaat te vroeg zichtbaar wordt.
- Live socketupdates worden per animatieframe samengevoegd en ongewijzigde Host-/Infoblokken worden niet meer steeds opnieuw opgebouwd.
- Dure achtergrondvervaging en extreem brede schaduwen op scrollende Host-/Playeronderdelen zijn vervangen door lichtere, visueel overeenkomstige lagen voor vloeiender scrollen en bewegen.

## Nieuw in v0.3.49

- De algemene Lobby-/Dag-/Nachtindeling van het Infoscherm is teruggezet naar de goedgekeurde v0.3.47-compositie. Tekst, kaarten en spelerslijst houden weer hun oorspronkelijke gecentreerde plaats.
- De stemgrafiek gebruikt weer goed zichtbare lineaire balkhoogtes. Alle balken beginnen tegelijk, tellen tegelijk op en stoppen in hetzelfde frame.
- Het dorpswinstscherm gebruikt opnieuw de kaartmaten en kolomindeling van v0.3.47; kaarten verkleinen alleen wanneer de beschikbare ruimte dat vereist.
- Bevestigingsknoppen op alle spelerkeuzeschermen staan iets hoger, met vrije ruimte boven de onderste gouden lijn.
- De Ziener toont direct **[speler] is de** boven de onthulde rolkaart en gaat daarna zichtbaar weer slapen.
- De Host ziet voorlopige en bevestigde doelkeuzes met spelersnaam en kaart-PNG. Dit geldt ook voor Heks, Cupido, Fluitspeler, Ziener en andere doelrollen.
- Heksdoelen krijgen daarnaast een tijdelijk icoon linksboven op hun Host-spelersvak. De Host ziet het eliminatieoverzicht direct zodra de nacht eindigt.
- De Heks wordt in latere nachten niet meer wakker wanneer beide drankjes al gebruikt zijn.
- Geliefden zien uitsluitend elkaars naam en publieke Burgerkaart, nooit elkaars geheime rol. Na bevestiging krijgt de geliefde kort een bonzend hart in beeld.
- Betoverde spelers tonen geen dubbele status onder hun eigen kaart en zien de andere betoverden met een duidelijke paarse gloed.
- De liefdesverdrietkaart wordt nu werkelijk als volledig rood kaartvak verkleind; naam en gebroken hart blijven leesbaar.
- Burgemeesterstemmen gebruiken goudgele voortgangslijnen op het Hostscherm.

## Nieuw in v0.3.48

- De lobbyrolkeuze op de Host gebruikt goed leesbare donkere opties en iedere spelersrij houdt dezelfde vaste hoogte, ongeacht de geselecteerde rol.
- Actieresultaten op het Spelerscherm gebruiken **Je koos** met passende formuleringen zoals **Te zien**, **Te redden**, **Te vergiftigen**, **Te koppelen** en **Te betoveren**. De eigen rolkaart wordt niet dubbel getoond.
- De Heks toont opgeslagen en vergiftigde spelers als kaartresultaat op de Host. Na een reveal toont de Host bovendien een tijdelijk eliminatieoverzicht met kaart, naam en doodsoorzaak.
- Alle betoverde spelers zien de volledige actuele groep met namen en vaste Burgerkaarten. Deze pagina heeft geen Klaar-knop en wordt uitsluitend door de Host doorgeklikt.
- Nacht-, stem- en doodsrevelaties behouden een stabiele scène-identiteit, zodat een bevestigingsupdate of reconnect de inspringanimatie niet opnieuw start.
- Stembalken bewegen met dezelfde fysieke snelheid en stoppen in hetzelfde frame. Kortere balken starten later; hoge scores blijven daardoor langer bewegen. Een versterkte hoogtecurve maakt bijvoorbeeld 13 tegenover 14 stemmen zichtbaar zonder de grafiek hoger te maken.
- Na de grafiek schuiven grafiek en resultaattekst naar rechts; de uitgeschakelde spelerkaart verschijnt een fractie later.
- Het Infoscherm schaalt de onderste spelerslijst dynamisch op monitor, tablet en telefoon. Tijdens het laatste schot verdwijnt die lijst volledig en blijven de normale rolkaarten en het bewegende vizier behouden.
- Geliefdekaarten worden volledig getoond met een duidelijkere roze gloed. Een door liefdesverdriet gestorven kaart is als geheel kleiner, met leesbare tekst.
- Het informatieknopje heeft een clipartachtige uitvoering en sluit na zeven seconden automatisch.
- Grote dorpswinnaarschermen benutten extra breedte en verdelen grote spelersgroepen compacter, terwijl het paneel met verslagen wolven verticaal gecentreerd blijft.

## Nieuw in v0.3.47

- De Host ziet blijvende verbanden zoals geliefden, betoverde spelers en rolmodellen als kleine badges linksboven op de betreffende speler.
- In de lobby kan de Host een beschikbare rol vooraf aan een specifieke speler toewijzen. De rol wordt één keer voor het volgende spel gereserveerd en kan niet vaker worden toegewezen dan hij in de rolverdeling voorkomt.
- Alle spelers krijgen per spel een evenwichtig geschudde Burgerkaart uit de vier meegeleverde kaarten. Het verschil in gebruik is maximaal één en de gekozen kaart blijft het hele spel aan dezelfde speler gekoppeld.
- Het Spelerscherm heeft een rond informatieknopje met het doel van de eigen rol en blijvende verzamelde kennis van onder andere Ziener, Fluitspeler, Cupido en Vos.
- Cupido kan zichzelf niet meer als geliefde kiezen. Bevestigde Cupido-, Fluitspeler-, Heks-, Ziener- en doelresultaten tonen namen met hun spelerskaarten.
- De stemgrafiek gebruikt weer een echte gedeelde animatievoortgang en bereikt in drie seconden met alle balken en cijfers tegelijk de eindstand.
- De volledige Jagersequentie gebruikt een zwarte overgang naar het losse spanningsmoment, verbergt overige HUD-informatie en toont op de Host een echt kaartenoverzicht met Jager-markering.
- Een automatische Jager wacht vijf seconden voordat hij willekeurig een geldig laatste schot kiest.
- Gekoppelde liefdesverdrietkaarten zijn compacter gemaakt en de keuze-/resultaatvakken volgen nauwkeuriger de omvang van hun inhoud.

## Nieuw in v0.3.46

- Alle spelerkeuzes berekenen automatisch hoeveel kolommen, rijen en kaarthoogte beschikbaar zijn. Ook grote groepen blijven op telefoon, tablet en monitor volledig zichtbaar met een bereikbare bevestigingsknop.
- De Heks gebruikt dezelfde schaalbare kaartindeling voor levensdrank en gifdrank; beide groepen verdelen samen de beschikbare schermhoogte.
- De Host kan iedere onbeantwoorde nachtstap en iedere fase van het laatste Jagerschot bewust forceren. De knop heeft een korte beveiligingstimer om misclicks te voorkomen.
- De Jager heeft een volledige Infoscherm-gestuurde flow: aankondiging, doelkeuze, spannende schotreveal en een gezamenlijk nachtoverzicht met Jager-markering.
- Resultaten van dagstemming, burgemeesterstemming, nachtdoden, Jagerschot en einduitslag blijven voor Players verborgen totdat het Infoscherm de bijbehorende reveal heeft bevestigd. De Host ziet alles direct.
- Stembalken, cijfers en scores gebruiken één gedeelde lineaire klok en bereiken tegelijk hun eindstand. Een verversing speelt een reeds afgeronde popup niet opnieuw af.
- Eindschermen schalen de kaarten en kolommen automatisch tot vijftig spelers. Ook de wolfkaarten, titel en subtitel blijven volledig zichtbaar.
- Dubbel geneste resultaatvakken op het Hostscherm zijn verwijderd; spelernaam en rolkaart staan rustig in één resultaatvlak.
- De meegeleverde rolkaarten voor Burger, Cupido, Fluitspeler, Grote Boze Wolf, Heks, Jager, Weerwolf en Ziener vervangen de oude tijdelijke afbeeldingen.

## Nieuw in v0.3.45

- Een door liefdesverdriet overleden geliefde verschijnt in dezelfde reveal als kleinere gekoppelde kaart linksboven bij het oorspronkelijke slachtoffer, met een gebroken hart.
- De koppeling werkt bij nachtelijke eliminaties en de open dagstemming; Players zien beide doden pas na de reveal op het Infoscherm.
- Actie- en Hekskeuzetegels hebben rechte hoeken. Heks-koppen en kaartinhoud zijn gecentreerd.
- **Niemand redden** en **Niemand vergiftigen** zijn even groot als de spelertegels en tonen een duidelijk niets-doen/bewaren-symbool.
- **Verslagen wolven** staat verticaal gecentreerd naast de volledige dorpskaartengroep.
- Alle stembalken bereiken hun eindhoogte en eindcijfer in exact hetzelfde animatieframe.

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
- De Dorpsoudste, Ridder met Roestige Zwaard, Geliefden en Wolvenkind hebben basislogica, maar kunnen in zeldzame randgevallen nog hostcontrole nodig hebben.
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
