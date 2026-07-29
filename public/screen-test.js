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
};
const names=["Maurizio","Luna","Noah","Sophie","Milan","Yara","Finn","Zoë","Daan","Nova","Sam","Isa"];
const roleCycle=["villager","werewolf","cupid","seer","witch","piper","hunter","villager","werewolf","villager","villager","villager"];

function person(index,overrides={}){
  const roleId=overrides.roleId||roleCycle[index%roleCycle.length];
  const role=roleDefs[roleId]||roleDefs.villager;
  return {
    key:`test_${index+1}`,
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
    version:"0.3.54",lobbyId:"screen_test",selfKey:me.key,phase:"night",round:1,nightNumber:1,dayNumber:0,started:true,
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
    version:"0.3.54",lobbyId:"screen_test",phase:"night",round:1,nightNumber:1,dayNumber:0,started:true,
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

const scenarios=[
  {surface:"player",group:"Basis",label:"Wachten in de nacht",description:"Standaard rustscherm met de eigen rolkaart.",make:()=>playerBase("villager")},
  {surface:"player",group:"Basis",label:"Uitgeschakeld",description:"Volledig rood doodscherm.",make:()=>{const s=playerBase("villager");s.me.alive=false;s.players[0].alive=false;s.phase="day";return s;}},
  {surface:"player",group:"Basis",label:"Winnaar bekend",description:"Eindmelding op het Player-scherm.",make:()=>{const s=playerBase("villager");s.phase="ended";s.winner={title:"Het Dorp wint!",text:"De wolven zijn verslagen.",team:"village"};return s;}},

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
  showScenario();
}
function activeScenario(){
  return filteredScenarios()[Number(scenarioSelect.value)||0] || filteredScenarios()[0];
}
function frameUrl(){
  return activeSurface==="player"?"/player?screenTest=1":"/info?screenTest=1";
}
function postScenario(){
  const scenario=activeScenario();
  if(!scenario || !frameReady) return;
  frame.contentWindow?.postMessage({type:"wakkerdam-screen-test",surface:activeSurface,state:scenario.make()},"*");
}
function showScenario(){
  const list=filteredScenarios();
  const index=Math.max(0,Number(scenarioSelect.value)||0);
  const scenario=list[index]||list[0];
  if(!scenario) return;
  document.getElementById("screenTestCounter").textContent=`${index+1} / ${list.length} · ${scenario.group}`;
  document.getElementById("screenTestTitle").textContent=scenario.label;
  document.getElementById("screenTestDescription").textContent=scenario.description;
  postScenario();
}
function setSurface(surface){
  if(surface===activeSurface) return;
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
  frameReady=false;
  frame.src=frameUrl();
}
function moveScenario(delta){
  const list=filteredScenarios();
  const next=(Number(scenarioSelect.value)+delta+list.length)%list.length;
  scenarioSelect.value=String(next);
  showScenario();
}

document.querySelectorAll("[data-test-surface]").forEach(button=>button.addEventListener("click",()=>setSurface(button.dataset.testSurface)));
document.querySelectorAll("[data-test-viewport]").forEach(button=>button.addEventListener("click",()=>{
  activeViewport=button.dataset.testViewport;
  viewport.className=`screenTestViewport ${activeViewport}`;
  document.querySelectorAll("[data-test-viewport]").forEach(candidate=>candidate.classList.toggle("active",candidate===button));
}));
groupSelect.addEventListener("change",()=>fillScenarios());
scenarioSelect.addEventListener("change",showScenario);
document.getElementById("screenTestPrev").addEventListener("click",()=>moveScenario(-1));
document.getElementById("screenTestNext").addEventListener("click",()=>moveScenario(1));
window.addEventListener("keydown",event=>{
  if(event.key==="ArrowLeft") moveScenario(-1);
  if(event.key==="ArrowRight") moveScenario(1);
});
window.addEventListener("message",event=>{
  if(event.data?.type!=="wakkerdam-screen-test-ready" || event.data.surface!==activeSurface) return;
  frameReady=true;
  postScenario();
});
frame.addEventListener("load",()=>{
  frameReady=false;
  setTimeout(()=>{frameReady=true;postScenario();},120);
});

fillGroups();
fillScenarios();
frame.src=frameUrl();
