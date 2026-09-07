const groupSelect=document.getElementById("screenTestGroup");
const scenarioSelect=document.getElementById("screenTestScenario");
const workspace=document.getElementById("screenTestWorkspace");
const wolfMonitor=document.getElementById("peekWolfMonitor");
const wolfMonitorViewport=document.getElementById("peekWolfMonitorViewport");
const wolfMonitorFrame=document.getElementById("peekWolfMonitorFrame");
const embeddedHostMode=new URLSearchParams(location.search).has("embeddedHost");
document.body.classList.toggle("screenTestHostEmbedded",embeddedHostMode);
let activeSurface="player";
let activeViewport="auto";
let flowTimer=null;
let peekVisualProgress=null;
let wolfMonitorReady=false;
let wolfMonitorFitFrame=null;
const wolfMonitorSession="screen_test_wolf_monitor";

const viewportSpecs={
  phone:{width:390,height:844,label:"Smalle telefoon"},
  phoneWide:{width:430,height:932,label:"Grote telefoon"},
  tablet:{width:820,height:1080,label:"Tablet"},
  monitor:{width:1280,height:720,label:"Monitor"},
};
const approvedFogSettings=Object.freeze({
  density:600,
  motion:110,
  turbulence:600,
  pushHeight:53,
  handMotion:100,
  handSize:76,
  pushForce:45,
  returnPush:600,
  refill:600,
  inertia:66,
});
let fogTestSettings={...approvedFogSettings};
const approvedPeekBalanceSettings=Object.freeze({
  eyelids:Object.freeze({cautionStrength:100,peekSeconds:4}),
  mirror:Object.freeze({cautionStrength:100,peekSeconds:8}),
  fog:Object.freeze({cautionStrength:100,peekSeconds:15}),
});
let peekBalanceSettings=Object.fromEntries(
  Object.entries(approvedPeekBalanceSettings).map(([mode,settings])=>[mode,{...settings}])
);

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
    version:"0.3.72",lobbyId:"screen_test",selfKey:me.key,phase:"night",round:1,nightNumber:1,dayNumber:0,started:true,
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
    version:"0.3.72",lobbyId:"screen_test",phase:"night",round:1,nightNumber:1,dayNumber:0,started:true,
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
    alive:team==="lovers" ? index<2 : ![6,8,10].includes(index),
    loverKey:team==="lovers" && index<2 ? `test_${index===0?2:1}` : null,
    enchanted:team==="piper" && index!==5,
    roleName:(roleDefs[player.roleId]||roleDefs.villager).name,
    roleEmoji:(roleDefs[player.roleId]||roleDefs.villager).emoji,
  }));
  const copy={
    village:{title:"Het Dorp wint!",text:"De ochtend breekt aan. Er is weer hoop.",team:"village"},
    wolves:{title:"De Weerwolven winnen!",text:"",team:"wolves"},
    piper:{title:"De Fluitspeler wint!",text:"Iedereen is in de ban van zijn melodie.",team:"piper"},
    lovers:{title:"De Geliefden winnen!",text:"Samen blijven zij als laatsten over.",team:"lovers"},
  };
  state.winner=copy[team];
  state.winnerRevealToken=`screen_winner_${team}_${Date.now()}`;
  state.winnerPublicRevealed=team!=="wolves";
  return state;
}

const peekModeMeta={
  eyelids:{number:1,label:"Door je oogleden gluren",instruction:"Houd ingedrukt om je ogen voorzichtig te openen. Laat snel los wanneer een wolf omkijkt. Lang kijken maakt je beter zichtbaar."},
  mirror:{number:2,label:"De Spiegelscherf",instruction:"Sleep de scherf rustig naar één speler en houd hem daar even stil om goed te kunnen zien. Te snel bewegen of te lang kijken kan een lichtflits veroorzaken."},
  fog:{number:3,label:"De mist wegvegen",instruction:"Je hebt vijftien seconden om de mist rustig weg te duwen. Blijf langer bij één speler om die langzaam zichtbaar te maken; wild bewegen kan je verraden."},
};
function peekView(mode="eyelids",overrides={}){
  const players=people(Number(overrides.playerCount||12));
  const wolfKeys=players.slice(1,Math.min(players.length,1+Number(overrides.wolfCount||2))).map(player=>player.key);
  const meta=peekModeMeta[mode];
  const balance=peekBalanceSettings[mode]||approvedPeekBalanceSettings[mode]||approvedPeekBalanceSettings.eyelids;
  const timeBudgetMs=Math.max(100,Math.round(Number(balance.peekSeconds||4)*1000));
  const testRiskMultiplier=Math.max(.1,Math.min(4,100/Math.max(25,Number(balance.cautionStrength||100))));
  const view={
    id:`screen_peek_${mode}_${Date.now()}`,
    mode,
    modeNumber:meta.number,
    modeLabel:meta.label,
    status:"active",
    instruction:meta.instruction,
    firstInstruction:true,
    remainingPeekMs:timeBudgetMs,
    remainingFogMs:mode==="fog"?timeBudgetMs:15000,
    timeBudgetMs,
    testTimeBudgetMs:timeBudgetMs,
    testCautionStrength:Number(balance.cautionStrength||100),
    testRiskMultiplier,
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
  const fogSettings=mode==="fog"
    ? {...fogTestSettings,...(overrides.fogSettings||{})}
    : undefined;
  const peek=peekView(mode,{...overrides,...(fogSettings?{fogSettings}:{})});
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
const scenarios=[
  {surface:"player",group:"Basis",label:"Wachten in de nacht",description:"Standaard rustscherm met de eigen rolkaart.",make:()=>playerBase("villager")},
  {surface:"player",group:"Basis",label:"Uitgeschakeld",description:"Volledig rood doodscherm.",make:()=>{const s=playerBase("villager");s.me.alive=false;s.players[0].alive=false;s.phase="day";return s;}},
  {surface:"player",group:"Basis",label:"Winnaar bekend",description:"Eindmelding op het Player-scherm.",make:()=>{const s=playerBase("villager");s.phase="ended";s.winner={title:"Het Dorp wint!",text:"De wolven zijn verslagen.",team:"village"};return s;}},

  {surface:"player",group:"Nachtrollen",label:"Spiekende Meisje testen",description:"Kies de spiekgame in het Mechanic-vak; geopende Playerpagina’s en het wolvenperspectief reageren live.",peekMechanic:true,make:()=>peekPlayerState(selectedPeekMode(true))},
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

let currentScenarioState=null;
let rotationState=window.WakkerdamPeekRules.createPeekState();

function uid(prefix="preview"){return `${prefix}_${Math.random().toString(36).slice(2,9)}_${Date.now().toString(36).slice(-5)}`;}
function clearFlowTimer(){
  clearTimeout(flowTimer);
  flowTimer=null;
}
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
  return activeSurface==="player" && activeScenario()?.peekMechanic===true;
}
function setViewport(mode){
  activeViewport=Object.prototype.hasOwnProperty.call(viewportSpecs,mode)||mode==="auto"?mode:"auto";
  document.querySelectorAll("[data-test-viewport]").forEach(candidate=>{
    const active=candidate.dataset.testViewport===activeViewport;
    candidate.classList.toggle("active",active);
    candidate.setAttribute("aria-pressed",active?"true":"false");
  });
  fitWolfMonitor();
  postScenario();
}
function postCleanup(){
  if(!wolfMonitorFrame?.contentWindow)return;
  wolfMonitorFrame.contentWindow.postMessage({
    type:"wakkerdam-screen-test-cleanup",
    surface:"player",
    sessionId:wolfMonitorSession,
    requestId:`wolf_cleanup_${Date.now()}`,
  },"*");
}
function wolfMonitorSpec(){
  return viewportSpecs[activeViewport]||viewportSpecs.phoneWide;
}
function fitWolfMonitor(){
  cancelAnimationFrame(wolfMonitorFitFrame);
  wolfMonitorFitFrame=requestAnimationFrame(()=>{
    wolfMonitorFitFrame=null;
    if(!wolfMonitorViewport||!wolfMonitorFrame||!isPeekGroup())return;
    const spec=wolfMonitorSpec();
    const bounds=wolfMonitor.getBoundingClientRect();
    const availableWidth=Math.max(180,bounds.width-20);
    const availableHeight=Math.max(260,Math.min(window.innerHeight*.58,620));
    const scale=Math.min(1,availableWidth/spec.width,availableHeight/spec.height);
    wolfMonitorViewport.style.width=`${Math.round(spec.width*scale)}px`;
    wolfMonitorViewport.style.height=`${Math.round(spec.height*scale)}px`;
    wolfMonitorFrame.style.width=`${spec.width}px`;
    wolfMonitorFrame.style.height=`${spec.height}px`;
    wolfMonitorFrame.style.transform=`scale(${scale})`;
    const label=document.getElementById("peekWolfMonitorFormat");
    if(label)label.textContent=`${spec.label} · ${spec.width} × ${spec.height}`;
  });
}
function ensureWolfMonitor(){
  if(!wolfMonitorFrame||!isPeekGroup())return;
  if(wolfMonitorFrame.dataset.session!==wolfMonitorSession){
    wolfMonitorReady=false;
    wolfMonitorFrame.dataset.session=wolfMonitorSession;
    wolfMonitorFrame.src=`/player?screenTest=1&devicePreview=1&screenTestSession=${encodeURIComponent(wolfMonitorSession)}`;
  }
  fitWolfMonitor();
}
function postWolfMonitor(){
  if(!isPeekGroup())return;
  ensureWolfMonitor();
  if(!wolfMonitorReady||!wolfMonitorFrame?.contentWindow)return;
  wolfMonitorFrame.contentWindow.postMessage({
    type:"wakkerdam-screen-test",
    surface:"player",
    sessionId:wolfMonitorSession,
    state:wolfPreviewState(),
  },"*");
}
function postScenario(){
  if(!currentScenarioState) return;
  if(embeddedHostMode){
    window.parent?.postMessage({
      type:"wakkerdam-screen-test-broadcast",
      surface:activeSurface,
      state:currentScenarioState,
      viewport:activeViewport,
    },"*");
  }
  postWolfMonitor();
}
function wolfPreviewState(){
  const peek=currentPeek();
  const players=peek?.players||people();
  const wolfKey=peek?.debugWolfKeys?.[0]||players.find(player=>player.roleId==="werewolf")?.key||"test_2";
  const state=action("wolves","werewolf",{
    title:"Weerwolven kiezen slachtoffer",
    options:players.filter(player=>player.key!==wolfKey),
    ownSelection:null,
    ownConfirmed:false,
    wolfLocked:false,
    wolfConsensus:{rows:[
      {key:wolfKey,name:"Jij",marker:1,colorIndex:0,targetKey:null,confirmed:false},
      {key:peek?.debugWolfKeys?.[1]||"test_9",name:"Andere wolf",marker:2,colorIndex:1,targetKey:null,confirmed:false},
    ],locked:false},
  });
  state.players=players;
  state.me={...state.me,key:wolfKey,name:players.find(player=>player.key===wolfKey)?.name||"Weerwolf"};
  state.selfKey=wolfKey;
  let warning=null;
  if(peek?.__debugServerState){
    warning=window.WakkerdamPeekRules.wolfWarningView(peek.__debugServerState,wolfKey,{
      girl:players.find(player=>player.key==="test_1")||players[0],
      players,
    });
  }else if(currentScenarioState?.action?.kind==="little_girl_peek_result"&&currentScenarioState.action.peek?.caught){
    const girl=players[0]||person(0);
    warning={
      token:`screen_caught_${currentScenarioState.action.id}`,
      mode:selectedPeekMode(false),
      level:"major",
      text:`${girl.name} is betrapt!`,
      hint:{direction:"boven",silhouette:"mantel",colorHint:"oker"},
      identity:{key:girl.key,name:girl.name,roleName:"Het Spiekende Meisje",roleCardSrc:"/assets/cards/spiekende_meisje.png"},
    };
  }
  state.peekWarning=warning;
  return state;
}
function refreshScenarioMeta(){
  const list=filteredScenarios();
  const index=Math.max(0,Number(scenarioSelect.value)||0);
  const scenario=list[index]||list[0];
  if(!scenario) return;
  document.getElementById("screenTestCounter").textContent=`${index+1} / ${list.length} · ${scenario.group}`;
  document.getElementById("screenTestTitle").textContent=scenario.label;
  document.getElementById("screenTestDescription").textContent=scenario.description;
  const peekActive=isPeekGroup();
  document.getElementById("peekTestPanel").classList.toggle("hidden",!peekActive);
  workspace?.classList.toggle("peek-active",peekActive);
  wolfMonitor?.classList.toggle("hidden",!peekActive);
  if(peekActive)ensureWolfMonitor();
  updateWolfPreview();
  const playButton=document.getElementById("screenTestPlayNext");
  if(playButton){
    const actionKind=currentScenarioState?.action?.kind||"";
    playButton.textContent=actionKind==="hunter_shot"
      ?"Speel het schot ▶"
      : currentScenarioState?.action && !currentScenarioState.action.submitted
        ?"Voer testactie uit ▶"
        :"Volgende pagina ▶";
  }
}
function showScenario(){
  const scenario=activeScenario();
  if(!scenario) return;
  clearFlowTimer();
  postCleanup();
  currentScenarioState=scenario.make();
  refreshScenarioMeta();
  syncPeekControlsFromState();
  postScenario();
}
function publishScenario({preserveState=false}={}){
  if(!preserveState) currentScenarioState=activeScenario()?.make()||null;
  refreshScenarioMeta();
  syncPeekControlsFromState();
  postScenario();
}
function syncSurfaceButtons(){
  document.querySelectorAll("[data-test-surface]").forEach(button=>{
    const active=button.dataset.testSurface===activeSurface;
    button.classList.toggle("active",active);
    button.classList.toggle("gold",active);
    button.classList.toggle("ghost",!active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
}
function openScenario(surface,group,label,stateOverride=null){
  clearFlowTimer();
  postCleanup();
  activeSurface=surface;
  syncSurfaceButtons();
  fillGroups(group);
  if(group && [...groupSelect.options].some(option=>option.value===group)) groupSelect.value=group;
  fillScenarios(label);
  if(label){
    const list=filteredScenarios();
    const index=list.findIndex(item=>item.label===label);
    if(index>=0) scenarioSelect.value=String(index);
  }
  currentScenarioState=stateOverride||activeScenario()?.make()||null;
  publishScenario({preserveState:true});
}
function setSurface(surface){
  if(surface===activeSurface) return;
  openScenario(surface,null,null);
}
function moveScenario(delta){
  clearFlowTimer();
  const list=filteredScenarios();
  const next=(Number(scenarioSelect.value)+delta+list.length)%list.length;
  scenarioSelect.value=String(next);
  showScenario();
}

function previewPerson(key,{revealRole=false}={}){
  const option=currentScenarioState?.action?.options?.find(player=>player.key===key);
  const existing=currentScenarioState?.players?.find(player=>player.key===key);
  const fallbackIndex=Math.max(0,Number(String(key||"").replace(/\D/g,""))-1);
  const base=existing||option||person(fallbackIndex);
  if(!revealRole) return {...base};
  const roleId=base.roleId||roleCycle[fallbackIndex%roleCycle.length]||"villager";
  const role=roleDefs[roleId]||roleDefs.villager;
  return {...base,roleId,roleName:role.name,roleEmoji:role.emoji,cardRoleId:roleId,cardRoleName:role.name,cardRoleEmoji:role.emoji,cardRevealed:true};
}
function hunterInfoState(stageName,target){
  const state=infoBase();
  state.phase="hunter";
  const shot={...death(target?.name||"Luna",target?.roleName||"Burger","hunter",target?.key||"test_2"),cardVariant:target?.cardVariant||2};
  state.hunterSequence={
    stage:stageName,
    hunterKey:"test_1",
    hunterName:"Maurizio",
    shotToken:`screen_shot_${Date.now()}`,
    shotDeaths:stageName==="shot_suspense"||stageName==="summary"?[shot]:[],
    allDeaths:stageName==="shot_suspense"||stageName==="summary"?[shot]:[],
  };
  return state;
}
function runHunterFlow(target){
  const actionState=currentScenarioState?.action;
  if(actionState){
    actionState.submitted=true;
    actionState.submission={targetKey:target.key,targetName:target.name,targetCard:target};
    postScenario();
  }
  clearFlowTimer();
  flowTimer=setTimeout(()=>{
    openScenario("info","Jager","Jager kiest",hunterInfoState("choosing",target));
    flowTimer=setTimeout(()=>{
      currentScenarioState=hunterInfoState("shot_suspense",target);
      const list=filteredScenarios();
      const revealIndex=list.findIndex(item=>item.label==="Schot onthulling");
      if(revealIndex>=0) scenarioSelect.value=String(revealIndex);
      refreshScenarioMeta();
      postScenario();
      flowTimer=setTimeout(()=>{
        currentScenarioState=hunterInfoState("summary",target);
        const summaryIndex=list.findIndex(item=>item.label==="Jager-overzicht");
        if(summaryIndex>=0) scenarioSelect.value=String(summaryIndex);
        refreshScenarioMeta();
        postScenario();
        flowTimer=null;
      },2300);
    },850);
  },480);
}
function completePlayerAction(payload={}){
  const actionState=currentScenarioState?.action;
  if(!actionState) return;
  const kind=payload.kind||actionState.kind;
  if(kind==="hunter_shot" && payload.targetKey){
    runHunterFlow(previewPerson(payload.targetKey));
    return;
  }
  const submission={};
  if(payload.targetKey){
    const target=previewPerson(payload.targetKey,{revealRole:kind==="seer"});
    Object.assign(submission,{targetKey:target.key,targetName:target.name,targetCard:target});
    if(kind==="seer"){
      submission.targetRoleId=target.roleId||"villager";
      submission.targetRoleName=target.roleName||"Burger";
      submission.targetRoleEmoji=target.roleEmoji||"🟡";
      submission.result=submission.targetRoleName;
    }
  }
  if(Array.isArray(payload.targetKeys)){
    const selected=payload.targetKeys.map(key=>previewPerson(key));
    submission.people=selected;
    submission.targets=selected.map(player=>player.name);
    if(kind==="cupid") submission.lovers=submission.targets;
  }
  if(kind==="witch"){
    if(payload.saveKey) submission.saveTarget=previewPerson(payload.saveKey);
    if(payload.poisonKey) submission.poisonTarget=previewPerson(payload.poisonKey);
  }
  if(payload.choice) submission.choice=payload.choice;
  if(kind==="mayor_candidate") submission.choice=payload.isCandidate?"Kandidaat":"Geen kandidaat";
  if(payload.ready) submission.ready=true;
  actionState.submitted=true;
  actionState.submission=submission;
  if(kind==="wolves") actionState.sleepMessage="De Weerwolven gaan weer slapen.";
  postScenario();
  refreshScenarioMeta();
}
function simulatePlayerEvent(eventName,payload={}){
  if(activeSurface!=="player" || !currentScenarioState?.action) return;
  if(eventName==="player_preview"){
    if(payload.targetKey!==undefined) currentScenarioState.action.previewTargetKey=payload.targetKey;
    if(Array.isArray(payload.targetKeys)) currentScenarioState.action.previewTargetKeys=[...payload.targetKeys];
    return;
  }
  if(eventName==="player_action") completePlayerAction(payload);
}
function reduceExternalPeek(payload={}){
  const peek=currentPeek();
  const rules=window.WakkerdamPeekRules;
  if(!peek||!rules) return peek;
  let serverState=peek.__debugServerState;
  if(!serverState){
    serverState=rules.createPeekState();
    rules.startPeekSession(serverState,{
      girlKey:"test_1",
      wolfKeys:peek.debugWolfKeys||[],
      nightNumber:1,
      forcedMode:peek.mode,
    });
    Object.assign(serverState.session,{
      id:peek.id,
      mode:peek.mode,
      status:peek.status,
      activeAt:Date.now(),
      remainingPeekMs:Number(peek.remainingPeekMs??4000),
      remainingFogMs:Number(peek.remainingFogMs??15000),
      testTimeBudgetMs:Number(peek.testTimeBudgetMs||peek.timeBudgetMs||4000),
      testCautionStrength:Number(peek.testCautionStrength||100),
      testRiskMultiplier:Number(peek.testRiskMultiplier||1),
      risk:Number(peek.risk||0),
      detectionLevel:peek.detectionLevel||"none",
      fogExposure:Object.fromEntries((peek.fogReveals||[]).map(reveal=>[reveal.key,Number(reveal.strength||0)])),
    });
  }
  if(payload.kind==="ack_instruction") rules.acknowledgeInstruction(serverState);
  else rules.applyPeekInteraction(serverState,payload,{
    players:peek.players||[],
    isWolfKey:key=>(peek.debugWolfKeys||[]).includes(key),
  });
  const next=rules.girlView(serverState,{
    players:peek.players||[],
    isWolfKey:key=>(peek.debugWolfKeys||[]).includes(key),
  });
  next.debugWolfKeys=peek.debugWolfKeys||[];
  if(next.mode==="fog")next.fogSettings={...fogTestSettings};
  next.__debugServerState=serverState;
  return next;
}
function simulateExternalPlayerEvent(eventName,payload={}){
  if(activeSurface!=="player" || !currentScenarioState?.action) return;
  if(eventName==="peek_instruction_ack" && currentPeek()){
    currentScenarioState.action.peek=reduceExternalPeek({kind:"ack_instruction",sessionId:payload.sessionId});
    syncPeekControlsFromState();
    postScenario();
    return;
  }
  if(eventName==="peek_interaction" && currentPeek()){
    currentScenarioState.action.peek=reduceExternalPeek(payload);
    syncPeekControlsFromState();
    postScenario();
    return;
  }
  simulatePlayerEvent(eventName,payload);
}
function playCurrentFlow(){
  const actionState=currentScenarioState?.action;
  if(activeSurface!=="player" || !actionState || actionState.submitted){
    moveScenario(1);
    return;
  }
  if(actionState.kind==="little_girl_peek"){
    if(actionState.peek?.status==="instruction"){
      replaceWithInteractivePeek(actionState.peek.mode,{status:"active"});
    }else{
      currentScenarioState=peekResultState(!!actionState.peek?.caught);
      postScenario();
      refreshScenarioMeta();
    }
    return;
  }
  const options=actionState.options||[];
  if(["cupid","piper"].includes(actionState.kind)){
    completePlayerAction({kind:actionState.kind,targetKeys:options.slice(0,2).map(player=>player.key)});
  }else if(actionState.kind==="witch"){
    completePlayerAction({
      kind:"witch",
      saveKey:actionState.pendingVictims?.[0]?.key||null,
      poisonKey:actionState.allTargets?.find(player=>player.key!==actionState.pendingVictims?.[0]?.key)?.key||null,
    });
  }else if(actionState.kind==="mayor_candidate"){
    completePlayerAction({kind:"mayor_candidate",isCandidate:true});
  }else if(actionState.choices?.length){
    completePlayerAction({kind:actionState.kind,choice:actionState.choices[0].value});
  }else if(options.length){
    completePlayerAction({kind:actionState.kind,targetKey:options[0].key});
  }else{
    completePlayerAction({kind:actionState.kind,ready:true});
  }
}

function currentPeek(){
  return currentScenarioState?.action?.kind==="little_girl_peek" ? currentScenarioState.action.peek : null;
}
function selectedPeekMode(advanceAuto=false){
  const requested=document.getElementById("peekTestMode")?.value||"auto";
  if(["eyelids","mirror","fog"].includes(requested)) return requested;
  if(advanceAuto || !rotationState.rotation.currentMode){
    return window.WakkerdamPeekRules.chooseNextMode(rotationState)||"eyelids";
  }
  return rotationState.rotation.currentMode;
}
function replaceWithInteractivePeek(mode=null,overrides={}){
  const select=document.getElementById("peekTestMode");
  const requested=mode||select.value;
  const resolved=requested==="auto" ? selectedPeekMode(true) : requested;
  const balance=peekBalanceSettings[resolved]||approvedPeekBalanceSettings[resolved]||approvedPeekBalanceSettings.eyelids;
  const timeBudgetMs=Math.max(100,Math.round(Number(balance.peekSeconds||4)*1000));
  const testRiskMultiplier=Math.max(.1,Math.min(4,100/Math.max(25,Number(balance.cautionStrength||100))));
  currentScenarioState=peekPlayerState(resolved,{
    playerCount:Number(document.getElementById("peekTestPlayers").value||12),
    wolfCount:Number(document.getElementById("peekTestWolves").value||2),
    risk:0,
    remainingPeekMs:timeBudgetMs,
    remainingFogMs:resolved==="fog"?timeBudgetMs:15000,
    timeBudgetMs,
    testTimeBudgetMs:timeBudgetMs,
    testCautionStrength:Number(balance.cautionStrength||100),
    testRiskMultiplier,
    ...(resolved==="fog"?{fogSettings:{...fogTestSettings}}:{}),
    ...overrides,
  });
  peekVisualProgress=null;
  syncPeekControlsFromState();
  postScenario();
}
function syncPeekControlsFromState(){
  const peek=currentPeek();
  if(peek){
    const modeSelect=document.getElementById("peekTestMode");
    if(modeSelect.value!=="auto") modeSelect.value=peek.mode;
    document.getElementById("peekTestPlayers").value=peek.players?.length||12;
    document.getElementById("peekTestWolves").value=peek.debugWolfKeys?.length||2;
    if(peekBalanceSettings[peek.mode]){
      peekBalanceSettings[peek.mode]={
        cautionStrength:Number(peek.testCautionStrength||peekBalanceSettings[peek.mode].cautionStrength||100),
        peekSeconds:Number((peek.testTimeBudgetMs||peek.timeBudgetMs||4000)/1000),
      };
    }
    if(peek.mode==="fog"&&peek.fogSettings) fogTestSettings={...approvedFogSettings,...peek.fogSettings};
  }
  syncBalanceControls();
  syncFogControls();
  updateWolfPreview();
}

function syncBalanceControls(){
  const mode=currentPeek()?.mode||selectedPeekMode(false);
  const settings=peekBalanceSettings[mode]||approvedPeekBalanceSettings[mode]||approvedPeekBalanceSettings.eyelids;
  const caution=document.getElementById("peekCautionStrength");
  const seconds=document.getElementById("peekSeconds");
  if(caution)caution.value=String(settings.cautionStrength);
  if(seconds)seconds.value=String(settings.peekSeconds);
  const cautionOutput=document.getElementById("peekCautionOutput");
  const secondsOutput=document.getElementById("peekSecondsOutput");
  if(cautionOutput)cautionOutput.textContent=`${settings.cautionStrength}%`;
  if(secondsOutput)secondsOutput.textContent=`${Number(settings.peekSeconds).toFixed(1).replace(".",",")} s`;
}
function applyBalanceSetting(key,value){
  const mode=currentPeek()?.mode||selectedPeekMode(false);
  if(!peekBalanceSettings[mode])return;
  peekBalanceSettings={
    ...peekBalanceSettings,
    [mode]:{...peekBalanceSettings[mode],[key]:Number(value)},
  };
  const status=currentPeek()?.status||"active";
  replaceWithInteractivePeek(mode,{status});
}
function updateWolfPreview(progress=peekVisualProgress){
  void progress;
  postWolfMonitor();
}

function syncFogControls(){
  const fogActive=currentPeek()?.mode==="fog";
  document.getElementById("peekFogControls")?.classList.toggle("hidden",!fogActive);
  document.querySelectorAll("[data-fog-setting]").forEach(input=>{
    const key=input.dataset.fogSetting;
    const value=Number(fogTestSettings[key]??approvedFogSettings[key]??0);
    input.value=String(value);
    const output=document.querySelector(`[data-fog-output="${key}"]`);
    if(output)output.textContent=`${value}%`;
  });
}
function applyFogSetting(input){
  const key=input.dataset.fogSetting;
  if(!Object.prototype.hasOwnProperty.call(approvedFogSettings,key))return;
  fogTestSettings={...fogTestSettings,[key]:Number(input.value)};
  const output=document.querySelector(`[data-fog-output="${key}"]`);
  if(output)output.textContent=`${fogTestSettings[key]}%`;
  const peek=currentPeek();
  if(peek?.mode==="fog"){
    peek.fogSettings={...fogTestSettings};
    postScenario();
  }
}
async function exportPeekSettings(){
  const mechanics=Object.fromEntries(Object.entries(peekBalanceSettings).map(([mode,settings])=>[
    mode,
    {
      cautionStrength:Number(settings.cautionStrength),
      riskMultiplier:Number((100/Math.max(25,Number(settings.cautionStrength))).toFixed(4)),
      peekSeconds:Number(settings.peekSeconds),
    },
  ]));
  const payload={
    preset:"Wakkerdam Spiekende Meisje · Alle mechanics",
    schemaVersion:1,
    testOnly:true,
    explanation:"Een hogere cautionStrength laat de voorzichtigheidsbalk langzamer vullen.",
    mechanics,
    fog:{...fogTestSettings},
  };
  const exported=JSON.stringify(payload,null,2);
  const output=document.getElementById("peekSettingsExportOutput");
  const status=document.getElementById("peekSettingsExportStatus");
  output.value=exported;
  output.classList.remove("hidden");
  let copied=false;
  try{
    await navigator.clipboard.writeText(exported);
    copied=true;
  }catch(_error){
    output.focus();
    output.select();
    copied=document.execCommand?.("copy")||false;
  }
  const blob=new Blob([exported],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="wakkerdam-spiekende-meisje-testinstellingen.json";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent=copied
    ? "Instellingen zijn gekopieerd en als JSON gedownload."
    : "JSON gedownload; de tekst staat hieronder klaar om handmatig te kopiëren.";
}

document.querySelectorAll("[data-test-surface]").forEach(button=>button.addEventListener("click",()=>setSurface(button.dataset.testSurface)));
document.querySelectorAll("[data-test-viewport]").forEach(button=>button.addEventListener("click",()=>{
  setViewport(button.dataset.testViewport);
}));
groupSelect.addEventListener("change",()=>{fillScenarios();showScenario();});
scenarioSelect.addEventListener("change",showScenario);
document.getElementById("screenTestPrev").addEventListener("click",()=>moveScenario(-1));
document.getElementById("screenTestNext").addEventListener("click",()=>moveScenario(1));
document.getElementById("screenTestReplay").addEventListener("click",showScenario);
document.getElementById("screenTestPlayNext").addEventListener("click",playCurrentFlow);
document.getElementById("peekTestRestart").addEventListener("click",()=>replaceWithInteractivePeek());
document.getElementById("peekTestInstruction").addEventListener("click",()=>replaceWithInteractivePeek(null,{status:"instruction"}));
document.getElementById("peekTestMode").addEventListener("change",showScenario);
document.querySelectorAll("[data-fog-setting]").forEach(input=>input.addEventListener("input",()=>applyFogSetting(input)));
document.getElementById("peekCautionStrength")?.addEventListener("input",event=>applyBalanceSetting("cautionStrength",event.target.value));
document.getElementById("peekSeconds")?.addEventListener("input",event=>applyBalanceSetting("peekSeconds",event.target.value));
document.getElementById("peekSettingsExport")?.addEventListener("click",exportPeekSettings);
document.getElementById("peekSettingsReset")?.addEventListener("click",()=>{
  fogTestSettings={...approvedFogSettings};
  peekBalanceSettings=Object.fromEntries(
    Object.entries(approvedPeekBalanceSettings).map(([mode,settings])=>[mode,{...settings}])
  );
  replaceWithInteractivePeek(currentPeek()?.mode||selectedPeekMode(false),{status:currentPeek()?.status||"active"});
  document.getElementById("peekSettingsExportStatus").textContent="De teststandaard voor alle drie mechanics is hersteld.";
});
for(const id of ["peekTestPlayers","peekTestWolves"]){
  document.getElementById(id).addEventListener("input",()=>{
    const status=currentPeek()?.status||"active";
    replaceWithInteractivePeek(selectedPeekMode(false),{status});
  });
}
window.addEventListener("keydown",event=>{
  if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if(event.key==="ArrowLeft") moveScenario(-1);
  if(event.key==="ArrowRight") moveScenario(1);
});
window.addEventListener("message",event=>{
  if(event.source===wolfMonitorFrame?.contentWindow){
    if(event.data?.type==="wakkerdam-screen-test-ready"&&event.data.surface==="player"){
      if(event.data.sessionId&&event.data.sessionId!==wolfMonitorSession)return;
      wolfMonitorReady=true;
      fitWolfMonitor();
      postWolfMonitor();
    }
    return;
  }
  if(event.source===window.parent&&event.data?.type==="wakkerdam-screen-test-host-close"){
    postCleanup();
    return;
  }
  if(event.source===window.parent&&event.data?.type==="wakkerdam-screen-test-external-player-event"){
    simulateExternalPlayerEvent(event.data.eventName,event.data.payload||{});
    return;
  }
});
wolfMonitorFrame?.addEventListener("load",()=>{
  wolfMonitorReady=true;
  fitWolfMonitor();
  postWolfMonitor();
});
window.addEventListener("resize",fitWolfMonitor,{passive:true});
window.addEventListener("orientationchange",fitWolfMonitor,{passive:true});

fillGroups();
fillScenarios();
currentScenarioState=activeScenario()?.make()||null;
publishScenario({preserveState:true});
setViewport("auto");
