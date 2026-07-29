const frame=document.getElementById("screenTestFrame");
const groupSelect=document.getElementById("screenTestGroup");
const scenarioSelect=document.getElementById("screenTestScenario");
const viewport=document.getElementById("screenTestViewport");
let activeSurface="player";
let activeViewport="auto";
let frameReady=false;

const roleDefs={
  villager:{id:"villager",name:"Burger",emoji:"🟡",desc:"Vind de wolven en bescherm het dorp."},
  werewolf:{id:"werewolf",name:"Weerwolf",emoji:"🐺",desc:"Kies samen een slachtoffer."},
  cupid:{id:"cupid",name:"Cupido",emoji:"💘",desc:"Koppel twee spelers."},
  seer:{id:"seer",name:"Ziener",emoji:"🔮",desc:"Onderzoek iedere nacht één speler."},
  witch:{id:"witch",name:"Heks",emoji:"🧪",desc:"Gebruik je levensdrank en gifdrank."},
  piper:{id:"piper",name:"Fluitspeler",emoji:"🎵",desc:"Betover alle andere spelers."},
  hunter:{id:"hunter",name:"Jager",emoji:"◎",desc:"Neem bij je dood één speler mee."},
  little_girl:{id:"little_girl",name:"Het Spiekende Meisje",emoji:"👁️",desc:"Spiek voorzichtig tijdens de gezamenlijke wolvenfase."},
};
const names=["Maurizio","Luna","Noah","Sophie","Milan","Yara","Finn","Zoë","Daan","Nova","Sam","Isa"];
const roleCycle=["villager","werewolf","cupid","seer","witch","piper","hunter","villager","werewolf","villager","villager","villager"];

function person(index,overrides={}){
  const roleId=overrides.roleId||roleCycle[index%roleCycle.length];
  const role=roleDefs[roleId]||roleDefs.villager;
  return {
    key:`test_${index+1}`,
    seat:index,
    name:names[index]||`Speler ${index+1}`,
    alive:true,
    connected:true,
    isMayor:index===1,
    enchanted:[2,4,7].includes(index),
    cardRoleId:overrides.revealRole?roleId:"villager",
    cardRoleName:overrides.revealRole?role.name:"Burger",
    cardRoleEmoji:overrides.revealRole?role.emoji:"🟡",
    cardRevealed:!!overrides.revealRole,
    cardVariant:(index%4)+1,
    roleName:role.name,
    roleEmoji:role.emoji,
    roleId,
    team:roleId==="werewolf"?"wolf":roleId==="piper"?"solo_piper":"village",
    wolfLike:roleId==="werewolf",
    isBot:false,
    ...overrides,
  };
}
function people(count=12){return Array.from({length:count},(_,index)=>person(index));}
function playerBase(roleId="villager"){
  const players=people();
  const role=roleDefs[roleId]||roleDefs.villager;
  const me={...players[0],roleId,role,roleName:role.name,roleEmoji:role.emoji,cardVariant:1,team:roleId==="werewolf"?"wolf":roleId==="piper"?"solo_piper":"village",wolfLike:roleId==="werewolf",infected:false,wildChildTurned:false,enchanted:false,alive:true};
  return {
    version:"0.3.55",lobbyId:"screen_test",selfKey:me.key,phase:"night",round:1,nightNumber:1,dayNumber:0,started:true,
    me,players,action:null,roleInfo:{roleId,roleName:role.name,objective:role.desc,facts:[]},
    mayorElection:{open:false,stage:"idle",candidates:[],voters:[],result:null},
    dayVote:{open:false,voters:[],counts:[],result:null},dayAftermath:{active:false,fromNight:false},
    lastDeaths:[],publicDeathPending:false,hunterSequence:null,privateLog:[],recentPublicLog:[],winner:null,hostNote:"",
  };
}
function targetOptions(excludeSelf=true){return people().filter((_,index)=>!excludeSelf||index!==0).map(player=>({...player,cardRoleId:"villager",cardRoleName:"Burger",cardRevealed:false}));}
function action(kind,roleId,extra={}){
  const state=playerBase(roleId);
  state.action={id:`screen_${kind}`,kind,title:extra.title||kind,text:extra.text||"",submitted:false,submission:null,actorRoleName:state.me.role.name,...extra};
  return state;
}
function submitted(kind,roleId,submission,extra={}){
  const state=action(kind,roleId,extra);
  state.action.submitted=true;
  state.action.submission=submission;
  return state;
}
function death(name="Luna",roleName="Burger",cause="wolves",key="test_2"){
  return {key,name,roleName,roleEmoji:"🟡",cardVariant:2,cause,publicReason:"uitgeschakeld"};
}
function infoBase(){
  return {
    version:"0.3.55",lobbyId:"screen_test",phase:"night",round:1,nightNumber:1,dayNumber:0,started:true,
    players:people(),aliveCount:12,
    mayorElection:{open:false,stage:"idle",candidates:[],voters:[],result:null},
    dayVote:{open:false,voters:[],counts:[],result:null},dayAftermath:{active:false,fromNight:false},
    lastDeaths:[],aftermathActive:false,deathRevealToken:null,deathPublicRevealed:true,hunterSequence:null,
    recentPublicLog:[],currentPublicMoment:"De nacht valt over het dorp.",winner:null,winnerRevealToken:null,winnerPublicRevealed:true,
  };
}
function voteRows(){return people(5).map((player,index)=>({key:player.key,name:player.name,votes:[4,2,1,3,1][index]}));}
function infoWinner(team){
  const state=infoBase();
  state.phase="ended";
  state.players=people().map((player,index)=>({
    ...player,
    alive:![6,8,10].includes(index),
    enchanted:team==="piper" && index!==5,
    roleName:(roleDefs[player.roleId]||roleDefs.villager).name,
    roleEmoji:(roleDefs[player.roleId]||roleDefs.villager).emoji,
  }));
  const copy={
    village:{title:"Het Dorp wint!",text:"De ochtend breekt aan. Er is weer hoop.",team:"village"},
    wolves:{title:"De Weerwolven winnen!",text:"Het dorp blijft achter in een rode, dreigende nacht.",team:"wolves"},
    piper:{title:"De Fluitspeler wint!",text:"Iedereen is in de ban van zijn melodie.",team:"piper"},
    lovers:{title:"De Geliefden winnen!",text:"Samen blijven zij als laatsten over.",team:"lovers"},
  };
  state.winner=copy[team];
  state.winnerPublicRevealed=true;
  return state;
}

const peekModeMeta={
  eyelids:{number:1,label:"Door je oogleden gluren",instruction:"Houd ingedrukt om je ogen voorzichtig te openen. Laat snel los wanneer een wolf omkijkt. Lang kijken maakt je beter zichtbaar."},
  mirror:{number:2,label:"De Spiegelscherf",instruction:"Beweeg de spiegelscherf langs de spelers. Alleen in de weerspiegeling kun je de wolven herkennen. Te snel of te lang kijken veroorzaakt een lichtflits."},
  fog:{number:3,label:"De mist wegvegen",instruction:"Veeg kleine stukjes mist weg om spelers te bekijken. Grote en wilde bewegingen kunnen door de wolven worden gezien."},
};
function peekView(mode="eyelids",overrides={}){
  const players=people(Number(overrides.playerCount||12));
  const wolfKeys=players.slice(1,Math.min(players.length,1+Number(overrides.wolfCount||2))).map(player=>player.key);
  const meta=peekModeMeta[mode];
  const view={
    id:`screen_peek_${mode}_${Date.now()}`,
    mode,
    modeNumber:meta.number,
    modeLabel:meta.label,
    status:"active",
    instruction:meta.instruction,
    firstInstruction:true,
    remainingPeekMs:4000,
    fogActionsRemaining:4,
    risk:0,
    detectionLevel:"none",
    caught:false,
    wolfLookActive:false,
    holding:false,
    holdStartedAt:null,
    mirrorReveal:null,
    fogReveals:[],
    players:players.map(player=>({...player,awakeWolf:mode==="eyelids"?wolfKeys.includes(player.key):undefined})),
    debugWolfKeys:wolfKeys,
    ...overrides,
  };
  delete view.playerCount;
  delete view.wolfCount;
  return view;
}
function peekPlayerState(mode="eyelids",overrides={}){
  const peek=peekView(mode,overrides);
  const state=action("little_girl_peek","little_girl",{title:peek.modeLabel,peek});
  state.me.roleId="little_girl";
  state.me.role=roleDefs.little_girl;
  state.me.roleName=roleDefs.little_girl.name;
  state.action.actorRoleName=roleDefs.little_girl.name;
  return state;
}
function peekResultState(caught=false){
  const state=playerBase("little_girl");
  state.action={
    id:`screen_peek_result_${Date.now()}`,
    kind:"little_girl_peek_result",
    title:caught?"Je sluit snel je ogen":"Je sluit voorzichtig je ogen",
    text:caught?"Een wolf keek jouw kant op… Hebben ze je gezien?":"De wolven gaan weer slapen.",
    peek:{caught},
  };
  return state;
}
function wolfWarning(mode,level="minor"){
  const state=playerBase("werewolf");
  const copy={
    eyelids:"Jullie zagen iemand tussen de bomen gluren…",
    mirror:"Er weerkaatste iets tussen de slapende dorpelingen…",
    fog:"Iemand bewoog zich door de mist…",
  };
  state.peekWarning={
    token:`screen_warning_${mode}_${level}_${Date.now()}`,
    mode,
    level,
    text:copy[mode],
    hint:{direction:"linksonder",silhouette:level==="major"?"mantel":"slank",colorHint:"donkerrood"},
  };
  return state;
}

const peekScenarios=[
  {surface:"player",group:"Spiekende Meisje · Algemeen",label:"Uitleg optie 1",description:"Eerste, korte uitleg voor Door je oogleden gluren.",make:()=>peekPlayerState("eyelids",{status:"instruction"})},
  {surface:"player",group:"Spiekende Meisje · Algemeen",label:"Uitleg optie 2",description:"Eerste, korte uitleg voor de Spiegelscherf.",make:()=>peekPlayerState("mirror",{status:"instruction"})},
  {surface:"player",group:"Spiekende Meisje · Algemeen",label:"Uitleg optie 3",description:"Eerste, korte uitleg voor de mist.",make:()=>peekPlayerState("fog",{status:"instruction"})},
  {surface:"player",group:"Spiekende Meisje · Algemeen",label:"Neutrale afsluiting",description:"De wolven gaan slapen zonder duidelijke betrapping.",make:()=>peekResultState(false)},
  {surface:"player",group:"Spiekende Meisje · Algemeen",label:"Mogelijk betrapt",description:"Onzekere afsluiting nadat een wolf haar kant op keek.",make:()=>peekResultState(true)},

  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Interactief testen",description:"Houd de knop vast, kijk door de kier en laat los wanneer de wolf omkijkt.",make:()=>peekPlayerState("eyelids")},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Volledig gesloten",description:"Beginstaat zonder ingedrukte knop.",make:()=>peekPlayerState("eyelids",{holding:false})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Ogen beginnen te openen",description:"De eerste veilige kier.",make:()=>peekPlayerState("eyelids",{holding:true,holdStartedAt:Date.now()-260})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Smalle veilige kier",description:"Kort gluren met laag risico.",make:()=>peekPlayerState("eyelids",{holding:true,holdStartedAt:Date.now()-720,risk:18})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Half open · risico",description:"Langer kijken met oplopende rode randen.",make:()=>peekPlayerState("eyelids",{holding:true,holdStartedAt:Date.now()-1550,risk:63})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Roekeloos bijna open",description:"Bijna volledig open en dicht bij betrapping.",make:()=>peekPlayerState("eyelids",{holding:true,holdStartedAt:Date.now()-2550,risk:91})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Wolf kijkt om",description:"Visuele waarschuwing zonder geluid.",make:()=>peekPlayerState("eyelids",{holding:true,holdStartedAt:Date.now()-1200,risk:72,wolfLookActive:true})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Te laat losgelaten",description:"Betrappingsstaat na roekeloos kijken.",make:()=>peekPlayerState("eyelids",{risk:100,detectionLevel:"major",caught:true})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Spiektijd bijna op",description:"Thematische meter met weinig resterende tijd.",make:()=>peekPlayerState("eyelids",{remainingPeekMs:450,risk:70})},
  {surface:"player",group:"Spiekende Meisje · Oogleden",label:"Spiektijd op",description:"Vasthoudknop wordt veilig uitgeschakeld.",make:()=>peekPlayerState("eyelids",{remainingPeekMs:0,risk:78})},

  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Interactief testen",description:"Sleep de echte productiescherf rustig langs spelers.",make:()=>peekPlayerState("mirror")},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Scherf boven slaper",description:"Een gewone slapende speler in de weerspiegeling.",make:()=>peekPlayerState("mirror",{mirrorReveal:{key:"test_4",awakeWolf:false,expiresAt:Date.now()+5000}})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Scherf boven wolf",description:"Een actieve wolf in de weerspiegeling.",make:()=>peekPlayerState("mirror",{mirrorReveal:{key:"test_2",awakeWolf:true,expiresAt:Date.now()+5000}})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Veilige beweging",description:"Lage weerkaatsingsmeter.",make:()=>peekPlayerState("mirror",{risk:22})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Snelle beweging",description:"De zilveren rand wordt gevaarlijk helder.",make:()=>peekPlayerState("mirror",{risk:68})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Weerkaatsing halfvol",description:"Duidelijke maar nog beheersbare risicostaat.",make:()=>peekPlayerState("mirror",{risk:52})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Bijna lichtflits",description:"Scherf is bijna zichtbaar voor de wolven.",make:()=>peekPlayerState("mirror",{risk:92})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Kleine lichtflits",description:"Kleine risicofout met globale richting.",make:()=>peekPlayerState("mirror",{risk:80,detectionLevel:"minor",caught:true})},
  {surface:"player",group:"Spiekende Meisje · Spiegel",label:"Zware lichtflits",description:"Roekeloze fout met vaag silhouet.",make:()=>peekPlayerState("mirror",{risk:100,detectionLevel:"major",caught:true})},

  {surface:"player",group:"Spiekende Meisje · Mist",label:"Interactief testen",description:"Veeg de echte productiemist lokaal weg.",make:()=>peekPlayerState("fog")},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Volledige mistlaag",description:"Alle spelers zijn verborgen.",make:()=>peekPlayerState("fog")},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Gewone speler zichtbaar",description:"Een slaper onder een weggeveegd gebied.",make:()=>peekPlayerState("fog",{fogReveals:[{key:"test_4",awakeWolf:false,expiresAt:Date.now()+5000}]})},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Weerwolf zichtbaar",description:"Gloeiende ogen en wolfvorm onder de mist.",make:()=>peekPlayerState("fog",{fogReveals:[{key:"test_2",awakeWolf:true,expiresAt:Date.now()+5000}]})},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Laatste veegactie",description:"Eén mistveer is nog beschikbaar.",make:()=>peekPlayerState("fog",{fogActionsRemaining:1,risk:48})},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Rustige beweging",description:"Veilige kleine veeg met weinig risico.",make:()=>peekPlayerState("fog",{fogActionsRemaining:3,risk:18})},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Roekeloze beweging",description:"Onrustige mist bij een grote wilde veeg.",make:()=>peekPlayerState("fog",{fogActionsRemaining:2,risk:91})},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Mistverstoring",description:"Kleine fout die een richting verraadt.",make:()=>peekPlayerState("fog",{risk:84,detectionLevel:"minor",caught:true})},
  {surface:"player",group:"Spiekende Meisje · Mist",label:"Zware mistfout",description:"Zware verstoring met vaag silhouet.",make:()=>peekPlayerState("fog",{risk:100,detectionLevel:"major",caught:true})},

  {surface:"player",group:"Spiekende Meisje · Wolven",label:"Geen betrapping",description:"Normale wolvennacht zonder geheime waarschuwing.",make:()=>playerBase("werewolf")},
  {surface:"player",group:"Spiekende Meisje · Wolven",label:"Oogleden · silhouet",description:"Vaag silhouet tussen de bomen.",make:()=>wolfWarning("eyelids","major")},
  {surface:"player",group:"Spiekende Meisje · Wolven",label:"Spiegel · kleine flits",description:"Korte lichtflits en globale richting.",make:()=>wolfWarning("mirror","minor")},
  {surface:"player",group:"Spiekende Meisje · Wolven",label:"Spiegel · zware flits",description:"Flits plus een zeer vaag silhouet.",make:()=>wolfWarning("mirror","major")},
  {surface:"player",group:"Spiekende Meisje · Wolven",label:"Mist · lichte verstoring",description:"Beweging in de mist vanuit een globale richting.",make:()=>wolfWarning("fog","minor")},
  {surface:"player",group:"Spiekende Meisje · Wolven",label:"Mist · zware verstoring",description:"Mistbeweging plus avatarachtige aanwijzing.",make:()=>wolfWarning("fog","major")},
];

const scenarios=[
  {surface:"player",group:"Basis",label:"Wachten in de nacht",description:"Standaard rustscherm met de eigen rolkaart.",make:()=>playerBase("villager")},
  {surface:"player",group:"Basis",label:"Uitgeschakeld",description:"Volledig rood doodscherm.",make:()=>{const s=playerBase("villager");s.me.alive=false;s.players[0].alive=false;s.phase="day";return s;}},
  {surface:"player",group:"Basis",label:"Winnaar bekend",description:"Eindmelding op het Player-scherm.",make:()=>{const s=playerBase("villager");s.phase="ended";s.winner={title:"Het Dorp wint!",text:"De wolven zijn verslagen.",team:"village"};return s;}},
  ...peekScenarios,

  {surface:"player",group:"Nachtrollen",label:"Wolfshond kiest kant",description:"Twee grote factiekeuzes.",make:()=>action("wolf_hound","villager",{title:"Wolfshond kiest kant",choices:[{value:"village",label:"Ik kies Burgerkant"},{value:"wolf",label:"Ik kies Wolvenkant"}]})},
  {surface:"player",group:"Nachtrollen",label:"Wolvenkind kiest rolmodel",description:"Enkelvoudige spelerselectie.",make:()=>action("wild_child","villager",{title:"Wolvenkind kiest rolmodel",options:targetOptions()})},
  {surface:"player",group:"Nachtrollen",label:"Cupido kiest twee",description:"Meerkeuze met deselectie- en limietmelding.",make:()=>action("cupid","cupid",{title:"Cupido kiest geliefden",options:targetOptions()})},
  {surface:"player",group:"Nachtrollen",label:"Cupido resultaat",description:"Bevestigde koppelkaarten.",make:()=>submitted("cupid","cupid",{people:[person(1),person(2)],lovers:["Luna","Noah"]},{title:"Cupido kiest geliefden"})},
  {surface:"player",group:"Nachtrollen",label:"Geliefden zien elkaar",description:"Naam en kaart van de geliefde.",make:()=>action("lovers_info","villager",{title:"Jouw geliefde",text:"Kijk om je heen om je geliefde te spotten.",lover:person(1),infoOnly:true})},
  {surface:"player",group:"Nachtrollen",label:"Geliefden bevestigd",description:"Bevestigingstekst na het elkaar zien.",make:()=>submitted("lovers_info","villager",{ready:true},{title:"Jouw geliefde"})},
  {surface:"player",group:"Nachtrollen",label:"Ziener selecteert",description:"Selectiepagina van de Ziener.",make:()=>action("seer","seer",{title:"Ziener onderzoekt",options:targetOptions()})},
  {surface:"player",group:"Nachtrollen",label:"Ziener resultaat",description:"Naam en echte rolkaart zijn zichtbaar.",make:()=>submitted("seer","seer",{targetKey:"test_2",targetName:"Luna",targetRoleId:"werewolf",targetRoleName:"Weerwolf",targetRoleEmoji:"🐺",result:"Weerwolf",targetCard:person(1,{roleId:"werewolf",revealRole:true})},{title:"Ziener onderzoekt"})},
  {surface:"player",group:"Nachtrollen",label:"Wolven kiezen",description:"Live markers, kaarten en bevestiging.",make:()=>action("wolves","werewolf",{title:"Weerwolven kiezen slachtoffer",options:targetOptions(),ownSelection:null,ownConfirmed:false,wolfLocked:false,wolfConsensus:{rows:[{key:"test_1",name:"Maurizio",marker:1,colorIndex:0,targetKey:null,confirmed:false},{key:"test_2",name:"Luna",marker:2,colorIndex:1,targetKey:"test_4",targetName:"Sophie",confirmed:true}],locked:false}})},
  {surface:"player",group:"Nachtrollen",label:"Wolven resultaat",description:"Je koos-pagina na consensus.",make:()=>submitted("wolves","werewolf",{targetKey:"test_4",targetName:"Sophie",targetCard:person(3),confirmed:true},{title:"Weerwolven kiezen slachtoffer",sleepMessage:"De Weerwolven gaan weer slapen."})},
  {surface:"player",group:"Nachtrollen",label:"Oerwolf besmetting",description:"Besmetten of niet besmetten.",make:()=>action("infectious_wolf","werewolf",{title:"Besmettelijke Oerwolf",text:"Wolvenslachtoffer: Sophie.",choices:[{value:"no",label:"Niet besmetten"},{value:"yes",label:"Besmetten"}]})},
  {surface:"player",group:"Nachtrollen",label:"Grote Boze Wolf",description:"Extra slachtoffer kiezen.",make:()=>action("big_bad_wolf","werewolf",{title:"Grote Boze Wolf kiest extra slachtoffer",options:targetOptions()})},
  {surface:"player",group:"Nachtrollen",label:"Witte Weerwolf",description:"Een wolfachtig doel kiezen.",make:()=>action("white_wolf","werewolf",{title:"Witte Weerwolf slaat toe",options:[person(1,{roleId:"werewolf"}),person(8,{roleId:"werewolf"})]})},
  {surface:"player",group:"Nachtrollen",label:"Heks beide drankjes",description:"Redding en vergiftiging tegelijk selecteren; Niemand is geel maar niet standaard gekozen.",make:()=>action("witch","witch",{title:"Heks gebruikt drankjes",text:"Gebruik eventueel je levensdrank en/of gifdrank.",pendingVictims:[person(1),person(2)],allTargets:targetOptions(false),canSave:true,canPoison:true})},
  {surface:"player",group:"Nachtrollen",label:"Heks resultaat",description:"Beide gekozen kaarten naast elkaar.",make:()=>submitted("witch","witch",{saveTarget:person(1),poisonTarget:person(3),saveName:"Luna",poisonName:"Sophie"},{title:"Heks gebruikt drankjes"})},
  {surface:"player",group:"Nachtrollen",label:"Vos onderzoekt",description:"Selectie voor het drietal.",make:()=>action("fox","villager",{title:"Vos speurt",options:targetOptions(false)})},
  {surface:"player",group:"Nachtrollen",label:"Fluitspeler selecteert",description:"Maximaal twee Betoverden kiezen.",make:()=>action("piper","piper",{title:"Fluitspeler betovert",options:targetOptions()})},
  {surface:"player",group:"Nachtrollen",label:"Betoverden zien elkaar",description:"Je bent betoverd verschijnt alleen op dit moment.",make:()=>action("enchanted_info","villager",{title:"De Betoverden",people:[person(2),person(4),person(7)],infoOnly:true,hostControlled:true})},
  {surface:"player",group:"Nachtrollen",label:"Betovering verbroken",description:"Eenmalige melding in de nacht na de dood van de Fluitspeler.",make:()=>action("enchantment_broken","villager",{title:"De betovering is verbroken",text:"De Fluitspeler is dood.",infoOnly:true,hostControlled:true,spellBroken:true})},

  {surface:"player",group:"Stemmen",label:"Kandidaatstelling",description:"Ja/nee-keuze voor burgemeester.",make:()=>{const s=action("mayor_candidate","villager",{title:"Wil jij burgemeester worden?",candidateResponse:null,selfCandidate:false});s.phase="mayor";s.mayorElection.open=true;s.mayorElection.stage="candidates";return s;}},
  {surface:"player",group:"Stemmen",label:"Burgemeester stemmen",description:"Kandidaten kiezen met definitieve bevestiging.",make:()=>{const s=action("mayor_vote","villager",{title:"Kies je burgemeester",options:targetOptions().slice(0,5),selectedTargetKey:null,currentVote:null});s.phase="mayor";s.mayorElection.open=true;s.mayorElection.stage="voting";return s;}},
  {surface:"player",group:"Stemmen",label:"Dagstemming",description:"Stemming met spelerskaarten.",make:()=>{const s=action("day_vote","villager",{title:"Dagstemming",options:targetOptions(),selectedTargetKey:null,currentVote:null});s.phase="voting";s.dayVote.open=true;return s;}},
  {surface:"player",group:"Stemmen",label:"Stemmen worden geteld",description:"Afgeschermde resultaatwachtrij.",make:()=>{const s=playerBase();s.phase="day";s.dayVote.result={revealed:false,publicRevealed:false};return s;}},

  {surface:"player",group:"Jager",label:"Jager kiest schot",description:"Laatste geldige doel kiezen.",make:()=>{const s=action("hunter_shot","hunter",{title:"Jager: laatste schot",options:targetOptions()});s.phase="hunter";s.me.alive=false;return s;}},
  {surface:"player",group:"Jager",label:"Jager wacht op reveal",description:"Keuze is doorgevoerd; Info bouwt de reveal op.",make:()=>{const s=action("hunter_wait","hunter",{title:"Je keuze is doorgevoerd",text:"Het Infoscherm onthult zo wie je hebt meegenomen.",waitingOnly:true});s.phase="hunter";s.me.alive=false;return s;}},

  {surface:"info",group:"Basis",label:"Lobby",description:"Wachten op spelers.",make:()=>{const s=infoBase();s.phase="lobby";s.started=false;return s;}},
  {surface:"info",group:"Basis",label:"Nacht",description:"Standaard nachtscène.",make:()=>infoBase()},
  {surface:"info",group:"Basis",label:"Dagochtend zonder doden",description:"Zonnig dagmoment.",make:()=>{const s=infoBase();s.phase="day";s.currentPublicMoment="Het dorp wordt wakker.";return s;}},
  {surface:"info",group:"Basis",label:"Nachtoverzicht met doden",description:"Kaarten van slachtoffers en gekoppelde geliefden.",make:()=>{const s=infoBase();s.phase="day";const primary=death();s.lastDeaths=[primary,{...death("Noah","Cupido","love","test_3"),linkedToKey:primary.key}];return s;}},

  {surface:"info",group:"Stemmen",label:"Kandidaten burgemeester",description:"Alle kandidaatnamen gecentreerd.",make:()=>{const s=infoBase();s.phase="mayor";s.mayorElection={open:true,stage:"candidates",candidates:people(8),voters:[],result:null};return s;}},
  {surface:"info",group:"Stemmen",label:"Burgemeester stemmen",description:"Alleen voortgang, geen stemkeuzes.",make:()=>{const s=infoBase();s.phase="mayor";s.mayorElection={open:true,stage:"voting",candidates:people(5),voters:people().map((p,i)=>({key:p.key,name:p.name,voted:i<7})),result:null};return s;}},
  {surface:"info",group:"Stemmen",label:"Burgemeester grafiek",description:"Alle balken starten tegelijk; de hoogste doet exact drie seconden.",make:()=>{const s=infoBase();s.phase="mayor";s.mayorElection={open:true,stage:"result",candidates:voteRows(),voters:[],result:{counts:voteRows(),winnerKey:"test_1",winnerName:"Maurizio",revealToken:`screen_mayor_${Date.now()}`,publicRevealed:false,revealDurationMs:3000,revealStartedAt:Date.now()}};return s;}},
  {surface:"info",group:"Stemmen",label:"Dagstemming bezig",description:"Stemvoortgang zonder tussenstand.",make:()=>{const s=infoBase();s.phase="voting";s.dayVote={open:true,voters:people().map((p,i)=>({key:p.key,name:p.name,voted:i<8})),counts:[],result:null};return s;}},
  {surface:"info",group:"Stemmen",label:"Dagstemming grafiek",description:"Grafiek schuift na drie seconden naar het eliminatieresultaat.",make:()=>{const s=infoBase();s.phase="day";s.dayVote={open:false,voters:[],counts:voteRows(),result:{counts:voteRows(),eliminatedKey:"test_1",eliminatedName:"Maurizio",eliminatedRoleName:"Burger",eliminatedRoleEmoji:"🟡",eliminatedCardVariant:1,revealToken:`screen_day_${Date.now()}`,publicRevealed:false,revealDurationMs:3000,revealStartedAt:Date.now(),linkedDeaths:[]}};return s;}},

  {surface:"info",group:"Jager",label:"Jager aankondiging",description:"Gecentreerde Jagerkaart en laatste-schotstempel.",make:()=>{const s=infoBase();s.phase="hunter";s.lastDeaths=[death("Maurizio","Jager","wolves","test_1")];s.hunterSequence={stage:"announcement",hunterKey:"test_1",hunterName:"Maurizio",hunterDeath:s.lastDeaths[0],shotDeaths:[],allDeaths:s.lastDeaths};return s;}},
  {surface:"info",group:"Jager",label:"Jager kiest",description:"Spanningsmoment tijdens de geheime keuze.",make:()=>{const s=infoBase();s.phase="hunter";s.hunterSequence={stage:"choosing",hunterKey:"test_1",hunterName:"Maurizio",shotDeaths:[],allDeaths:[]};return s;}},
  {surface:"info",group:"Jager",label:"Schot onthulling",description:"Impactmoment en rechtstreeks slachtoffer.",make:()=>{const s=infoBase();s.phase="hunter";const shot=death("Luna","Burger","hunter","test_2");s.hunterSequence={stage:"shot_suspense",hunterKey:"test_1",hunterName:"Maurizio",shotToken:`screen_shot_${Date.now()}`,shotDeaths:[shot],allDeaths:[shot]};return s;}},
  {surface:"info",group:"Jager",label:"Jager-overzicht",description:"Alleen schotslachtoffer en gekoppelde gevolgen.",make:()=>{const s=infoBase();s.phase="hunter";const shot=death("Luna","Burger","hunter","test_2");s.hunterSequence={stage:"summary",hunterKey:"test_1",hunterName:"Maurizio",shotDeaths:[shot],allDeaths:[shot]};return s;}},

  {surface:"info",group:"Einde",label:"Dorp wint",description:"Zonnige, levendige hoop blijft in het scorebeeld hangen.",make:()=>infoWinner("village")},
  {surface:"info",group:"Einde",label:"Wolven winnen",description:"Rode nachtelijke dreiging, geïnspireerd op de filmische referentie.",make:()=>infoWinner("wolves")},
  {surface:"info",group:"Einde",label:"Fluitspeler wint",description:"Fluitspeler bovenaan en Betoverden eronder.",make:()=>infoWinner("piper")},
  {surface:"info",group:"Einde",label:"Geliefden winnen",description:"Neutrale speciale eindgroep.",make:()=>infoWinner("lovers")},
];

let previewSessionId="";
let currentScenarioState=null;
let cleanupRequestId="";
let rotationState=window.WakkerdamPeekRules.createPeekState();
let rotationSequence=[];

function uid(prefix="preview"){return `${prefix}_${Math.random().toString(36).slice(2,9)}_${Date.now().toString(36).slice(-5)}`;}
function filteredScenarios(){
  const all=scenarios.filter(item=>item.surface===activeSurface);
  const group=groupSelect.value;
  return group ? all.filter(item=>item.group===group) : all;
}
function fillGroups(preferred){
  const groups=[...new Set(scenarios.filter(item=>item.surface===activeSurface).map(item=>item.group))];
  groupSelect.innerHTML=groups.map(group=>`<option value="${group}">${group}</option>`).join("");
  groupSelect.value=groups.includes(preferred)?preferred:groups[0];
}
function fillScenarios(preferredLabel){
  const list=filteredScenarios();
  scenarioSelect.innerHTML=list.map((item,index)=>`<option value="${index}">${item.label}</option>`).join("");
  const preferredIndex=list.findIndex(item=>item.label===preferredLabel);
  scenarioSelect.value=String(preferredIndex>=0?preferredIndex:0);
}
function activeScenario(){
  return filteredScenarios()[Number(scenarioSelect.value)||0] || filteredScenarios()[0];
}
function isPeekGroup(){
  return activeSurface==="player" && String(activeScenario()?.group||"").startsWith("Spiekende Meisje");
}
function frameUrl(){
  const path=activeSurface==="player"?"/player":"/info";
  return `${path}?screenTest=1&screenTestSession=${encodeURIComponent(previewSessionId)}`;
}
function postCleanup(){
  if(!frameReady) return;
  frame.contentWindow?.postMessage({type:"wakkerdam-screen-test-cleanup",surface:activeSurface,sessionId:previewSessionId,requestId:uid("passive_cleanup")},"*");
}
function postScenario(){
  if(!currentScenarioState || !frameReady) return;
  frame.contentWindow?.postMessage({
    type:"wakkerdam-screen-test",
    surface:activeSurface,
    sessionId:previewSessionId,
    state:currentScenarioState,
    reducedMotion:document.getElementById("peekTestReducedMotion")?.checked||false,
  },"*");
}
function refreshScenarioMeta(){
  const list=filteredScenarios();
  const index=Math.max(0,Number(scenarioSelect.value)||0);
  const scenario=list[index]||list[0];
  if(!scenario) return;
  document.getElementById("screenTestCounter").textContent=`${index+1} / ${list.length} · ${scenario.group}`;
  document.getElementById("screenTestTitle").textContent=scenario.label;
  document.getElementById("screenTestDescription").textContent=scenario.description;
  document.getElementById("peekTestPanel").classList.toggle("hidden",!isPeekGroup());
}
function showScenario(){
  const scenario=activeScenario();
  if(!scenario) return;
  postCleanup();
  currentScenarioState=scenario.make();
  refreshScenarioMeta();
  syncPeekControlsFromState();
  postScenario();
}
function loadFrame({preserveState=false}={}){
  postCleanup();
  frameReady=false;
  previewSessionId=uid("screen_test");
  if(!preserveState) currentScenarioState=activeScenario()?.make()||null;
  frame.src=frameUrl();
  refreshScenarioMeta();
  syncPeekControlsFromState();
}
function setSurface(surface){
  if(surface===activeSurface) return;
  postCleanup();
  const oldGroup=groupSelect.value;
  activeSurface=surface;
  document.querySelectorAll("[data-test-surface]").forEach(button=>{
    const active=button.dataset.testSurface===surface;
    button.classList.toggle("active",active);
    button.classList.toggle("gold",active);
    button.classList.toggle("ghost",!active);
  });
  fillGroups(oldGroup);
  fillScenarios();
  currentScenarioState=activeScenario()?.make()||null;
  loadFrame({preserveState:true});
}
function moveScenario(delta){
  const list=filteredScenarios();
  const next=(Number(scenarioSelect.value)+delta+list.length)%list.length;
  scenarioSelect.value=String(next);
  showScenario();
}

function currentPeek(){
  return currentScenarioState?.action?.kind==="little_girl_peek" ? currentScenarioState.action.peek : null;
}
function selectedPeekFeatures(){
  const modes={eyelids:false,mirror:false,fog:false};
  document.querySelectorAll("[data-peek-feature]").forEach(input=>{modes[input.dataset.peekFeature]=input.checked;});
  return {enabled:Object.values(modes).some(Boolean),modes};
}
function replaceWithInteractivePeek(mode=null,overrides={}){
  const select=document.getElementById("peekTestMode");
  const requested=mode||select.value;
  let resolved=requested;
  if(requested==="auto"){
    rotationState.features=selectedPeekFeatures();
    resolved=window.WakkerdamPeekRules.chooseNextMode(rotationState)||"eyelids";
  }
  currentScenarioState=peekPlayerState(resolved,{
    playerCount:Number(document.getElementById("peekTestPlayers").value||12),
    wolfCount:Number(document.getElementById("peekTestWolves").value||2),
    risk:Number(document.getElementById("peekTestRisk").value||0),
    remainingPeekMs:Number(document.getElementById("peekTestTime").value||4000),
    fogActionsRemaining:Number(document.getElementById("peekTestWipes").value||4),
    ...overrides,
  });
  syncPeekControlsFromState();
  postScenario();
}
function syncPeekControlsFromState(){
  const peek=currentPeek();
  if(peek){
    document.getElementById("peekTestMode").value=peek.mode;
    document.getElementById("peekTestPlayers").value=peek.players?.length||12;
    document.getElementById("peekTestWolves").value=peek.debugWolfKeys?.length||2;
    document.getElementById("peekTestRisk").value=peek.risk||0;
    document.getElementById("peekTestTime").value=peek.remainingPeekMs??4000;
    document.getElementById("peekTestWipes").value=peek.fogActionsRemaining??4;
  }
  updatePeekInspector();
}
function updatePeekInspector(){
  const peek=currentPeek();
  const inspector=document.getElementById("peekStateInspector");
  if(!inspector) return;
  if(!peek){
    inspector.textContent=JSON.stringify({preview:"wolvenperspectief of afsluiting",warning:currentScenarioState?.peekWarning||null},null,2);
    return;
  }
  inspector.textContent=JSON.stringify({
    activeMechanic:peek.mode,
    status:peek.status,
    remainingPeekMs:peek.remainingPeekMs,
    remainingWipes:peek.fogActionsRemaining,
    risk:peek.risk,
    detection:peek.detectionLevel,
    wolfLooking:peek.wolfLookActive,
    caught:peek.caught,
    warningShown:peek.detectionLevel!=="none",
    shuffleBag:rotationState.rotation.bag,
    lastMechanic:rotationState.rotation.lastMode,
  },null,2);
}
function mutatePeek(mutator){
  let peek=currentPeek();
  if(!peek){
    replaceWithInteractivePeek();
    peek=currentPeek();
  }
  mutator(peek,currentScenarioState);
  delete peek.__debugServerState;
  syncPeekControlsFromState();
  postScenario();
}
function simulateRotationNight(){
  rotationState.features=selectedPeekFeatures();
  const mode=window.WakkerdamPeekRules.chooseNextMode(rotationState);
  rotationSequence.push(mode);
  rotationSequence=rotationSequence.slice(-12);
  document.getElementById("peekRotationSequence").textContent=rotationSequence.map(item=>peekModeMeta[item]?.number||"–").join(" → ");
  const result=window.WakkerdamPeekRules.validateRotation(rotationSequence,rotationState.features);
  document.getElementById("peekRotationResult").textContent=result.ok?"Geslaagd · geen dubbele of ongeldige keuze.":`Fout · ${result.errors[0]}`;
  updatePeekInspector();
}
function simulateHundredCycles(){
  const modes=["eyelids","mirror","fog"];
  const subsets=[];
  for(let mask=1;mask<8;mask+=1) subsets.push(modes.filter((_,index)=>mask&(1<<index)));
  let errors=0;
  let firstError="";
  for(const enabled of subsets){
    const features={enabled:true,modes:Object.fromEntries(modes.map(mode=>[mode,enabled.includes(mode)]))};
    const count=100*enabled.length;
    const simulation=window.WakkerdamPeekRules.simulateRotation({count,features});
    const result=window.WakkerdamPeekRules.validateRotation(simulation.sequence,features);
    if(!result.ok){
      errors+=result.errors.length;
      firstError=firstError||`${enabled.join("+")}: ${result.errors[0]}`;
    }
  }
  document.getElementById("peekRotationResult").textContent=errors
    ? `Mislukt · ${errors} fouten · ${firstError}`
    : "Geslaagd · 700 cycli gecontroleerd met één, twee en drie actieve opties.";
}
function requestCleanupTest(){
  cleanupRequestId=uid("cleanup_test");
  frame.contentWindow?.postMessage({
    type:"wakkerdam-screen-test-cleanup",
    surface:activeSurface,
    sessionId:previewSessionId,
    requestId:cleanupRequestId,
  },"*");
}

document.querySelectorAll("[data-test-surface]").forEach(button=>button.addEventListener("click",()=>setSurface(button.dataset.testSurface)));
document.querySelectorAll("[data-test-viewport]").forEach(button=>button.addEventListener("click",()=>{
  activeViewport=button.dataset.testViewport;
  viewport.className=`screenTestViewport ${activeViewport}`;
  document.querySelectorAll("[data-test-viewport]").forEach(candidate=>candidate.classList.toggle("active",candidate===button));
}));
groupSelect.addEventListener("change",()=>{fillScenarios();showScenario();});
scenarioSelect.addEventListener("change",showScenario);
document.getElementById("screenTestPrev").addEventListener("click",()=>moveScenario(-1));
document.getElementById("screenTestNext").addEventListener("click",()=>moveScenario(1));
document.getElementById("peekTestRestart").addEventListener("click",()=>replaceWithInteractivePeek());
document.getElementById("peekTestInstruction").addEventListener("click",()=>replaceWithInteractivePeek(null,{status:"instruction"}));
document.getElementById("peekTestWolfLook").addEventListener("click",()=>mutatePeek(peek=>{peek.wolfLookActive=!peek.wolfLookActive;}));
document.getElementById("peekTestMinor").addEventListener("click",()=>mutatePeek(peek=>{peek.risk=Math.max(80,peek.risk);peek.detectionLevel="minor";peek.caught=true;}));
document.getElementById("peekTestMajor").addEventListener("click",()=>mutatePeek(peek=>{peek.risk=100;peek.detectionLevel="major";peek.caught=true;}));
document.getElementById("peekTestReconnect").addEventListener("click",()=>loadFrame({preserveState:true}));
document.getElementById("peekTestRefresh").addEventListener("click",()=>loadFrame({preserveState:true}));
document.getElementById("peekTestForce").addEventListener("click",()=>{currentScenarioState=peekResultState(false);postScenario();updatePeekInspector();});
document.getElementById("peekTestGirlDeath").addEventListener("click",()=>{
  currentScenarioState=playerBase("little_girl");
  currentScenarioState.me.alive=false;
  currentScenarioState.players[0].alive=false;
  currentScenarioState.action=null;
  postScenario();
  updatePeekInspector();
});
document.getElementById("peekTestWolfDeath").addEventListener("click",()=>mutatePeek(peek=>{
  const removed=peek.debugWolfKeys.shift();
  const target=peek.players.find(player=>player.key===removed);
  if(target) target.alive=false;
}));
document.getElementById("peekTestCleanup").addEventListener("click",requestCleanupTest);
document.getElementById("peekSimulateNight").addEventListener("click",simulateRotationNight);
document.getElementById("peekSimulateHundred").addEventListener("click",simulateHundredCycles);
document.getElementById("peekTestMode").addEventListener("change",()=>replaceWithInteractivePeek());
for(const id of ["peekTestPlayers","peekTestWolves","peekTestRisk","peekTestTime","peekTestWipes"]){
  document.getElementById(id).addEventListener("input",()=>replaceWithInteractivePeek(document.getElementById("peekTestMode").value==="auto"?null:document.getElementById("peekTestMode").value));
}
document.getElementById("peekTestReducedMotion").addEventListener("change",postScenario);
document.querySelectorAll("[data-peek-feature]").forEach(input=>input.addEventListener("change",()=>{
  rotationState=window.WakkerdamPeekRules.createPeekState(selectedPeekFeatures());
  rotationSequence=[];
  document.getElementById("peekRotationSequence").textContent="Nog geen nachten gesimuleerd.";
  document.getElementById("peekRotationResult").textContent="";
}));
window.addEventListener("keydown",event=>{
  if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if(event.key==="ArrowLeft") moveScenario(-1);
  if(event.key==="ArrowRight") moveScenario(1);
});
window.addEventListener("message",event=>{
  if(event.source!==frame.contentWindow) return;
  if(event.data?.type==="wakkerdam-screen-test-ready"){
    if(event.data.surface!==activeSurface || event.data.sessionId!==previewSessionId) return;
    frameReady=true;
    postScenario();
    return;
  }
  if(event.data?.type==="wakkerdam-peek-debug-state" && event.data.sessionId===previewSessionId && currentScenarioState?.action?.kind==="little_girl_peek"){
    currentScenarioState.action.peek=event.data.peek;
    syncPeekControlsFromState();
    return;
  }
  if(event.data?.type==="wakkerdam-screen-test-cleanup-result" && event.data.requestId===cleanupRequestId){
    const diagnostics=event.data.diagnostics||{};
    const clean=!diagnostics.controllers&&!diagnostics.timers&&!diagnostics.animationFrames&&!diagnostics.activePointers&&!diagnostics.warningOverlay&&!diagnostics.scrollLocked;
    document.getElementById("peekRotationResult").textContent=clean
      ?"Cleanup geslaagd · geen timers, overlays, listeners, pointers of scrolllocks achtergebleven."
      :`Cleanup mislukt · ${JSON.stringify(diagnostics)}`;
    cleanupRequestId="";
  }
});
frame.addEventListener("load",()=>{
  // Het child-ready-bericht kan nét vóór het iframe-load-event aankomen.
  // Houd de zojuist bevestigde previewsessie daarom actief en stuur dezelfde
  // geïsoleerde state nogmaals; dit reset de scenarioselectie niet.
  frameReady=true;
  postScenario();
});

fillGroups();
fillScenarios();
currentScenarioState=activeScenario()?.make()||null;
loadFrame({preserveState:true});
