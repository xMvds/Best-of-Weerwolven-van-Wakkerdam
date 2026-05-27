/* InfoEditor v0.5.0 — debug-only visual layout + keyframe editor for Wakkerdam Infoscherm.
   Codename: InfoEditor. Keep every class/function/comment searchable by "InfoEditor" / "infoEditor"
   so the complete feature can be removed later in one pass. */
(function(){
  'use strict';

  const INFO_EDITOR_VERSION = 5;
  const STORAGE_KEY = 'Wakkerdam.InfoEditor.v5';
  const LEGACY_KEYS = ['Wakkerdam.InfoEditor.v4','Wakkerdam.InfoEditor.v2','Wakkerdam.InfoEditor.v1'];
  const DEBUG_UNLOCK_KEY = 'Wakkerdam.InfoEditor.debugUnlocked';
  const DEFAULT_SNAP = 9;
  const DEFAULT_TIMELINE_SNAP = 100;
  const MAX_HISTORY = 90;

  const INFO_STATES = [
    { id:'live', label:'LIVE huidige state' },
    { id:'lobby', label:'Lobby' },
    { id:'night', label:'Nacht' },
    { id:'day', label:'Dag' },
    { id:'nightDeathReveal', label:'Nacht death reveal' },
    { id:'dayAftermath', label:'Dag aftermath' },
    { id:'mayorElection', label:'Burgemeesterverkiezing' },
    { id:'mayorResult', label:'Burgemeester resultaat' },
    { id:'openDayVote', label:'Open dagstemming' },
    { id:'openDayVoteResult', label:'Dagstemming resultaat' },
    { id:'winnerVillage', label:'Winnaar: Het Dorp' },
    { id:'winnerWolves', label:'Winnaar: Wolven' }
  ];

  const MODULE_SELECTORS = [
    ['mainTitle', '#bigStatus'],
    ['subtitle', '#subStatus'],
    ['deathRevealCard', '#deaths > .deathCard, #deaths .dayElimReveal .deathCard'],
    ['voteResultGroup', '.dayVoteResultStage .dayVoteGraphColumn'],
    ['voteGraphGroup', '.dayVoteResultStage .mayorResultBars, .infoMayorResult:not(.dayVoteGraphColumn) .mayorResultBars'],
    ['voteBars', '.dayVoteResultStage .dayResultBars, .infoMayorResult .mayorResultBars'],
    ['voteLabels', '.dayVoteResultStage .mayorResultBars, .infoMayorResult .mayorResultBars'],
    ['voteCounters', '.dayVoteResultStage .mayorResultBars, .infoMayorResult .mayorResultBars'],
    ['eliminatedText', '.dayVoteResultStage .voteFinalText'],
    ['eliminatedCardPanel', '.dayVoteResultStage .dayVoteRevealColumn'],
    ['playerStatusBar', '#viewerPlayers'],
    ['winnerVillageSection', '.winnerStage .winnerVillageSection'],
    ['defeatedWolvesSidebar', '.winnerStage .winnerDefeatedModule'],
    ['mayorResultGroup', '.infoMayorResult:not(.dayVoteGraphColumn)'],
    ['candidateGroup', '.infoCandidatesCentral, .candidateList.infoCandidatesCentral'],
    ['voterStatusGroup', '.infoVoters']
  ];

  const DEFAULT_LAYOUT = Object.freeze({
    x:0, y:0, scale:1, opacity:255, width:'', maxWidth:'', height:'', gap:'', fontSize:'', zIndex:'',
    lockCenterX:false, lockCenterY:false, axis:'free', hidden:false
  });

  const DEFAULT_TRACKS = {
    openDayVoteResult:{
      duration:3200,
      tracks:{
        voteResultGroup:[
          { time:0, x:0, y:0, scale:1, opacity:255, easing:'easeOutCubic' },
          { time:1800, x:160, y:0, scale:1, opacity:255, easing:'easeInOutCubic' }
        ],
        voteGraphGroup:[
          { time:0, x:0, y:0, scale:1, opacity:255, easing:'easeOutCubic' },
          { time:1800, x:0, y:0, scale:1, opacity:255, easing:'easeInOutCubic' }
        ],
        eliminatedCardPanel:[
          { time:0, x:-210, y:0, scale:.9, opacity:0, easing:'easeOutCubic' },
          { time:2200, x:-240, y:0, scale:1, opacity:255, easing:'easeOutBack' }
        ],
        eliminatedText:[
          { time:0, x:0, y:0, scale:1, opacity:0, easing:'linear' },
          { time:1600, x:0, y:0, scale:1, opacity:255, easing:'easeOutCubic' }
        ],
        playerStatusBar:[
          { time:0, x:0, y:0, scale:1, opacity:255, easing:'linear' }
        ]
      }
    }
  };

  const state = {
    enabled:false,
    debugVisible:false,
    modules:new Map(),
    selectedIds:[],
    selectedKeyframe:null,
    activeTab:'layout',
    selectedState:'live',
    previewMode:false,
    liveSnapshot:null,
    config:loadConfig(),
    snap:true,
    snapThreshold:DEFAULT_SNAP,
    timelineSnapMs:DEFAULT_TIMELINE_SNAP,
    dockPosition:'right',
    drag:null,
    resize:null,
    axisIndicator:'',
    history:{ undo:[], redo:[], pending:null },
    clipboard:{ layout:null, animation:null, stateLayout:null, stateAnimation:null },
    anim:{ playing:false, time:0, raf:0, lastTs:0, preview:false, duration:3200 },
    scanRaf:0,
    uiRaf:0
  };

  let panel=null, debugFab=null, guideLayer=null, measureBadge=null, selectionBox=null, timelineEl=null;
  let mutationObserver=null;

  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
  function idEl(id){ return document.getElementById(id); }
  function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function num(v,f=0){ const n=Number(v); return Number.isFinite(n)?n:f; }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function clone(o){ return JSON.parse(JSON.stringify(o||{})); }
  function cssValue(v){ return String(v??'').trim(); }
  function isInputTarget(t){ return t && ['INPUT','SELECT','TEXTAREA'].includes(t.tagName); }
  function isTextModule(id){ return ['mainTitle','subtitle','eliminatedText','mayorResultGroup'].includes(id); }
  function nowIso(){ return new Date().toISOString(); }

  function baseConfig(){ return { infoEditorVersion:INFO_EDITOR_VERSION, screen:'info', createdAt:nowIso(), states:{}, editorMeta:{ snapEnabled:true, snapThreshold:DEFAULT_SNAP, timelineSnapMs:DEFAULT_TIMELINE_SNAP, dockPosition:'right' } }; }
  // InfoEditor opacity is always stored/shown as 0-255. Only CSS receives 0-1.
  function normalizeOpacity(v){
    if(v === '' || v == null) return 255;
    const n = num(v,255);
    return Math.round(clamp(n,0,255));
  }
  function normalizeLayout(cfg){ return { ...DEFAULT_LAYOUT, ...(cfg||{}), opacity:normalizeOpacity(cfg?.opacity) }; }
  function normalizeTrack(frames){
    if(Array.isArray(frames)) return frames.map(f=>({ time:0,x:0,y:0,scale:1,opacity:255,easing:'linear', ...(f||{}), opacity:normalizeOpacity(f?.opacity) })).sort((a,b)=>num(a.time)-num(b.time));
    return Object.entries(frames||{}).map(([name,f])=>({ name, time:num(f?.time ?? f?.at,0), x:num(f?.x,0), y:num(f?.y,0), scale:num(f?.scale,1), opacity:normalizeOpacity(f?.opacity), easing:f?.easing||'linear', width:f?.width, height:f?.height, fontSize:f?.fontSize, gap:f?.gap })).sort((a,b)=>a.time-b.time);
  }
  function normalizeStateBucket(bucket,stateId){
    const out = { layout:{}, animation:{ duration:3200, tracks:{} }, editorMeta:{} };
    Object.entries(bucket?.layout || {}).forEach(([id,c])=>out.layout[id]=normalizeLayout(c));
    // Old v2 format could put module configs directly under state bucket.
    Object.entries(bucket || {}).forEach(([id,c])=>{ if(!['layout','animation','editorMeta'].includes(id) && !out.layout[id]) out.layout[id]=normalizeLayout(c); });
    const anim = bucket?.animation || DEFAULT_TRACKS[stateId] || {};
    out.animation.duration = num(anim.duration ?? anim.timelineDuration, DEFAULT_TRACKS[stateId]?.duration || 3200);
    const tracks = anim.tracks || anim.modules || DEFAULT_TRACKS[stateId]?.tracks || {};
    Object.entries(tracks).forEach(([id,frames])=>out.animation.tracks[id]=normalizeTrack(frames));
    out.editorMeta = { ...(bucket?.editorMeta||{}) };
    return out;
  }

  function migrateLegacyOpacity(raw){
    if(!raw || num(raw.infoEditorVersion,0) >= 5) return raw;
    const walk=(o)=>{ if(!o || typeof o!=='object') return; Object.entries(o).forEach(([k,v])=>{ if(k==='opacity' && typeof v==='number' && v>0 && v<=1) o[k]=Math.round(v*255); else walk(v); }); };
    walk(raw); return raw;
  }

  function normalizeConfig(raw){
    const cfg = baseConfig();
    cfg.infoEditorVersion = INFO_EDITOR_VERSION;
    cfg.createdAt = raw?.createdAt || cfg.createdAt;
    cfg.editorMeta = { ...cfg.editorMeta, ...(raw?.editorMeta || {}) };
    cfg.editorMeta.dockPosition = ['right','left','top','bottom'].includes(cfg.editorMeta.dockPosition) ? cfg.editorMeta.dockPosition : 'right';
    Object.entries(raw?.states || {}).forEach(([sid,b])=>cfg.states[sid]=normalizeStateBucket(b,sid));
    Object.keys(DEFAULT_TRACKS).forEach(sid=>{ cfg.states[sid] ||= normalizeStateBucket({ animation:DEFAULT_TRACKS[sid] }, sid); });
    return cfg;
  }
  function loadConfig(){
    try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw) return normalizeConfig(migrateLegacyOpacity(JSON.parse(raw))); }catch(e){ console.warn('[InfoEditor] Kon v5 config niet lezen', e); }
    for(const k of LEGACY_KEYS){
      try{ const raw=localStorage.getItem(k); if(raw) return normalizeConfig(migrateLegacyOpacity(JSON.parse(raw))); }catch(e){ console.warn('[InfoEditor] Legacy config fout', e); }
    }
    return normalizeConfig({});
  }
  function saveConfig(){
    state.config.infoEditorVersion = INFO_EDITOR_VERSION;
    state.config.screen = 'info';
    state.config.editorMeta ||= {};
    state.config.editorMeta.snapEnabled = state.snap;
    state.config.editorMeta.snapThreshold = state.snapThreshold;
    state.config.editorMeta.timelineSnapMs = state.timelineSnapMs;
    state.config.editorMeta.dockPosition = state.dockPosition;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }
  function currentLiveStateId(){
    if($('.winnerStage')) return $('.winnerDefeatedModule') ? 'winnerVillage' : 'winnerWolves';
    if($('.dayVoteResultStage')) return 'openDayVoteResult';
    if($('.infoMayorResult') && !$('.dayVoteResultStage')) return 'mayorResult';
    if($('.infoCandidatesCentral')) return 'mayorElection';
    if($('.infoVoters')) return 'openDayVote';
    if($('.deathCard')) return 'nightDeathReveal';
    const hero=idEl('hero');
    if(hero?.classList.contains('night')) return 'night';
    if(hero?.classList.contains('day')) return 'day';
    return 'lobby';
  }
  function activeStateId(){ return state.selectedState === 'live' ? currentLiveStateId() : state.selectedState; }
  function bucket(sid=activeStateId()){
    state.config.states[sid] ||= normalizeStateBucket({ animation:DEFAULT_TRACKS[sid] || {} }, sid);
    state.config.states[sid].layout ||= {};
    state.config.states[sid].animation ||= { duration:DEFAULT_TRACKS[sid]?.duration || 3200, tracks:clone(DEFAULT_TRACKS[sid]?.tracks || {}) };
    state.config.states[sid].animation.tracks ||= {};
    state.config.states[sid].editorMeta ||= {};
    return state.config.states[sid];
  }
  function layoutCfg(id, sid=activeStateId()){ const b=bucket(sid); b.layout[id] ||= normalizeLayout({}); return b.layout[id]; }
  function animCfg(sid=activeStateId()){ const b=bucket(sid); b.animation.duration ||= DEFAULT_TRACKS[sid]?.duration || 3200; b.animation.tracks ||= {}; return b.animation; }

  function injectCss(){
    if(idEl('infoEditorRuntimeCss')) return;
    const style=document.createElement('style');
    style.id='infoEditorRuntimeCss';
    style.textContent = `
/* InfoEditor runtime CSS v0.5.0 — scoped debug editor layer. */
.infoEditorDebugFab.InfoEditor{position:fixed;right:18px;bottom:18px;z-index:99980;display:none}.infoEditorDebugFab.visible{display:block}.infoEditorDebugBtn{border:1px solid #d9b46a99;background:#111722ee;color:#ffe8bd;padding:9px 13px;border-radius:0;font:900 12px/1 system-ui,sans-serif;text-transform:uppercase;box-shadow:0 0 20px #000b;cursor:pointer}.infoEditorDebugBtn.active{box-shadow:0 0 0 2px #ffd86a99,0 0 22px #ffd86a55;background:#3a290f}
body.infoEditorActive{cursor:default}body.infoEditorActive [data-info-editor-id],body.infoEditorActive [data-editor-id]{outline:1px dashed #60c9ffcc;outline-offset:4px;will-change:transform,opacity;transform:var(--info-editor-base-transform,translate3d(0,0,0)) translate(var(--info-editor-x,0px),var(--info-editor-y,0px)) scale(var(--info-editor-scale,1)) translate(var(--info-editor-anim-x,0px),var(--info-editor-anim-y,0px)) scale(var(--info-editor-anim-scale,1))!important;opacity:var(--info-editor-anim-opacity,var(--info-editor-opacity,1))!important;transform-origin:center center!important;position:relative;z-index:7}body.infoEditorActive [data-info-editor-id]::after,body.infoEditorActive [data-editor-id]::after{content:attr(data-info-editor-id);position:absolute;left:0;top:-24px;background:#061a2bee;color:#dff5ff;border:1px solid #60c9ffaa;padding:3px 5px;font:800 10px/1.1 system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:99985}body.infoEditorActive [data-info-editor-id].infoEditorSelected,body.infoEditorActive [data-editor-id].infoEditorSelected{outline:2px solid #ffd86a!important;box-shadow:0 0 0 3px #000a,0 0 24px #ffd86a66!important;z-index:9990!important}body.infoEditorActive [data-info-editor-id].infoEditorSelected::after,body.infoEditorActive [data-editor-id].infoEditorSelected::after{background:#4a3107ee;color:#fff1bd;border-color:#ffd86a}
body.infoScreen.infoEditorActive #viewerPlayers[data-info-editor-id="playerStatusBar"],body.infoScreen.infoEditorActive #viewerPlayers[data-editor-id="playerStatusBar"]{left:50%!important;right:auto!important;bottom:auto!important;transform:translateX(-50%) translate(var(--info-editor-x,0px),var(--info-editor-y,0px)) scale(var(--info-editor-scale,1)) translate(var(--info-editor-anim-x,0px),var(--info-editor-anim-y,0px)) scale(var(--info-editor-anim-scale,1))!important;opacity:var(--info-editor-anim-opacity,var(--info-editor-opacity,1))!important;position:absolute!important;transform-origin:center center!important}
.infoEditorPanel.InfoEditor{position:fixed;right:14px;top:14px;z-index:99992;width:min(500px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;display:none;background:linear-gradient(180deg,#121827f7,#05070df5);border:1px solid #d9b46a88;color:#f8e6bd;padding:12px;box-shadow:0 18px 60px #000e;font:12px/1.35 system-ui,sans-serif;backdrop-filter:blur(12px)}.infoEditorPanel.visible{display:block}.infoEditorPanel button,.infoEditorPanel input,.infoEditorPanel select,.infoEditorPanel textarea{border-radius:0}.infoEditorPanelHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.infoEditorPanelHeader strong{font-family:Georgia,serif;font-size:20px}.infoEditorPanelHeader button,.infoEditorBtn{border:1px solid #a77d4077;background:#0b101a;color:#ffe7b0;padding:7px 8px;cursor:pointer;font-weight:800}.infoEditorBtn:hover,.infoEditorTabs button.active{background:#2b1e0b;border-color:#ffd46a}.infoEditorTabs{display:flex;gap:6px;margin:8px 0}.infoEditorTabs button{flex:1;border:1px solid #a77d4077;background:#080d16;color:#ffe7b0;padding:8px;cursor:pointer;font-weight:900}.infoEditorTabPage{display:none}.infoEditorTabPage.active{display:block}.infoEditorGrid2{display:grid;grid-template-columns:1fr 1fr;gap:5px 8px}.infoEditorGrid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 8px}.infoEditorPanel label{display:flex;flex-direction:column;gap:4px;margin:5px 0;font-weight:800;color:#ecd39f}.infoEditorPanel input,.infoEditorPanel select,.infoEditorPanel textarea{background:#070a11;color:#fff4d3;border:1px solid #9d7b4866;padding:6px 7px;font:12px/1.25 system-ui,sans-serif}.infoEditorChecks{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin:7px 0}.infoEditorChecks label{flex-direction:row;align-items:center;margin:0}.infoEditorButtons{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.infoEditorButtons .infoEditorBtn{flex:1 1 auto}.infoEditorSmall{color:#b9bfd0;font-size:11px;margin:4px 0 8px}.infoEditorReadout{border:1px solid #55c7ff55;background:#07111fee;color:#dff5ff;padding:7px;margin:7px 0;font:700 11px/1.35 ui-monospace,Menlo,monospace}.infoEditorModeBadge{position:fixed;left:16px;top:16px;z-index:99981;background:#06111fee;border:1px solid #60c9ff99;color:#dff5ff;padding:6px 9px;font:900 11px/1.1 system-ui,sans-serif;text-transform:uppercase;display:none}.infoEditorModeBadge.visible{display:block}.infoEditorGuides{position:fixed;inset:0;z-index:99970;pointer-events:none}.infoEditorGuide{position:absolute;background:#55c7ff;box-shadow:0 0 12px #55c7ffcc}.infoEditorGuide.v{top:0;width:1px;height:100vh}.infoEditorGuide.h{left:0;height:1px;width:100vw}.infoEditorGuide.center{background:#ffd86a;box-shadow:0 0 16px #ffd86acc}.infoEditorGuide span{position:absolute;left:6px;top:6px;background:#06111fee;color:#dff5ff;border:1px solid #55c7ffaa;padding:3px 5px;font:700 10px/1.1 system-ui,sans-serif;white-space:nowrap}.infoEditorMeasure{position:fixed;z-index:99991;display:none;pointer-events:none;background:#020711ee;border:1px solid #55c7ffaa;color:#dff5ff;padding:5px 7px;font:800 11px/1.3 ui-monospace,Menlo,monospace;max-width:360px;box-shadow:0 0 16px #000c}.infoEditorMeasure.visible{display:block}.infoEditorSelectionBox{position:fixed;display:none;z-index:99982;pointer-events:none;border:2px solid #ffd86a;box-shadow:0 0 0 1px #000c,0 0 22px #ffd86a55}.infoEditorSelectionBox.visible{display:block}.infoEditorSelectionLabel{position:absolute;left:0;top:-25px;background:#4a3107ee;color:#fff1bd;border:1px solid #ffd86a;padding:3px 6px;font:800 11px/1.2 system-ui,sans-serif;white-space:nowrap}.infoEditorResizeHandle{position:absolute;width:12px;height:12px;background:#ffd86a;border:1px solid #171006;box-shadow:0 0 0 1px #000a,0 0 10px #ffd86a66;pointer-events:auto}.infoEditorResizeHandle.nw{left:-7px;top:-7px;cursor:nwse-resize}.infoEditorResizeHandle.n{left:50%;top:-7px;transform:translateX(-50%);cursor:ns-resize}.infoEditorResizeHandle.ne{right:-7px;top:-7px;cursor:nesw-resize}.infoEditorResizeHandle.e{right:-7px;top:50%;transform:translateY(-50%);cursor:ew-resize}.infoEditorResizeHandle.se{right:-7px;bottom:-7px;cursor:nwse-resize}.infoEditorResizeHandle.s{left:50%;bottom:-7px;transform:translateX(-50%);cursor:ns-resize}.infoEditorResizeHandle.sw{left:-7px;bottom:-7px;cursor:nesw-resize}.infoEditorResizeHandle.w{left:-7px;top:50%;transform:translateY(-50%);cursor:ew-resize}.infoEditorTimeline{position:relative;height:74px;background:#060a11;border:1px solid #9d7b4866;margin:8px 0;overflow:hidden}.infoEditorTimelineTrack{position:absolute;left:10px;right:10px;top:34px;height:2px;background:#705c3a}.infoEditorPlayhead{position:absolute;top:6px;bottom:6px;width:2px;background:#ffd86a;box-shadow:0 0 14px #ffd86a;left:10px;pointer-events:none}.infoEditorKey{position:absolute;top:21px;width:14px;height:14px;background:#55c7ff;border:1px solid #dff5ff;transform:translateX(-50%) rotate(45deg);cursor:pointer;box-shadow:0 0 10px #000;z-index:2}.infoEditorKey.selected{background:#ffd86a;border-color:#fff1bd;box-shadow:0 0 14px #ffd86a}.infoEditorKey.other{opacity:.45}.infoEditorKey span{position:absolute;transform:rotate(-45deg);top:-18px;left:-18px;font:700 9px/1 system-ui;color:#dff5ff;white-space:nowrap;background:#06111fee;padding:2px 3px;border:1px solid #55c7ff55}.infoEditorAxisBadge{position:fixed;z-index:99991;left:50%;top:58px;transform:translateX(-50%);background:#171006ee;border:1px solid #ffd86a;color:#fff1bd;padding:6px 10px;font:900 12px/1 system-ui;display:none}.infoEditorAxisBadge.visible{display:block}.infoEditorToast{position:fixed;right:22px;top:22px;z-index:99999;background:#102514ee;border:1px solid #78db73;color:#dcffd9;padding:9px 12px;font:900 13px/1.2 system-ui;box-shadow:0 0 22px #000c;animation:infoEditorToast .95s ease both}@keyframes infoEditorToast{0%{opacity:0;transform:translateY(-8px)}15%,80%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-8px)}}body.infoEditorAnimationPreview [data-info-editor-id],body.infoEditorAnimationPreview [data-editor-id]{transition:transform .06s linear,opacity .06s linear!important}.infoEditorImportArea{min-height:80px;resize:vertical}.infoEditorModuleList{max-height:112px;overflow:auto;border:1px solid #9d7b4866;background:#060a11;padding:5px}.infoEditorModuleRow{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 5px;cursor:pointer;border:1px solid transparent}.infoEditorModuleRow.active{border-color:#ffd86a;background:#2b1e0b}.infoEditorModuleRow small{color:#93a2bd}@media(max-width:900px){.infoEditorPanel{left:10px;right:10px;top:10px;width:auto;max-height:56vh}.infoEditorGrid2,.infoEditorGrid3{grid-template-columns:1fr}.infoEditorDebugFab{right:10px;bottom:10px}}


/* InfoEditor v0.5.0 polish overrides: dockable panel, clearer sections, visible guides, hidden modules, readable selects. */
.infoEditorPanel.InfoEditor{--ie-panel-w:min(520px,calc(100vw - 28px));border-radius:0!important}
.infoEditorPanel.dock-right{right:14px!important;left:auto!important;top:14px!important;bottom:auto!important;width:var(--ie-panel-w);max-height:calc(100vh - 28px)}
.infoEditorPanel.dock-left{left:14px!important;right:auto!important;top:14px!important;bottom:auto!important;width:var(--ie-panel-w);max-height:calc(100vh - 28px)}
.infoEditorPanel.dock-top{left:14px!important;right:14px!important;top:14px!important;bottom:auto!important;width:auto!important;max-height:44vh;display:none}.infoEditorPanel.dock-top.visible{display:block}
.infoEditorPanel.dock-bottom{left:14px!important;right:14px!important;top:auto!important;bottom:14px!important;width:auto!important;max-height:44vh;display:none}.infoEditorPanel.dock-bottom.visible{display:block}
.infoEditorPanel.dock-top .infoEditorTabPage.active,.infoEditorPanel.dock-bottom .infoEditorTabPage.active{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:10px;align-items:start}.infoEditorPanel.dock-top .infoEditorGrid3,.infoEditorPanel.dock-bottom .infoEditorGrid3{grid-template-columns:repeat(5,minmax(92px,1fr))}.infoEditorPanel.dock-top .infoEditorGrid2,.infoEditorPanel.dock-bottom .infoEditorGrid2{grid-template-columns:repeat(4,minmax(110px,1fr))}
.infoEditorToolbar{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;align-items:end;gap:8px;border:1px solid #9d7b4838;background:#060a1188;padding:7px;margin-bottom:6px}.infoEditorHeaderActions{display:flex;gap:6px;align-items:center}.infoEditorPill{display:inline-flex;align-items:center;justify-content:center;min-height:27px;border:1px solid #55c7ff77;background:#07111f;color:#dff5ff;padding:4px 7px;font:900 11px/1 system-ui;text-transform:uppercase}.infoEditorPill.muted{border-color:#9d7b4866;color:#ecd39f}.infoEditorSectionTitle{font:900 12px/1.1 system-ui;text-transform:uppercase;letter-spacing:.08em;color:#ffd86a;border-bottom:1px solid #9d7b4855;padding-bottom:5px;margin:5px 0 8px}.infoEditorButtons.compact .infoEditorBtn{font-size:11px;padding:6px 7px;flex:0 1 auto}.infoEditorBtn.dangerSoft{border-color:#ff6b6b66;color:#ffd4d4;background:#251111}.infoEditorAdvancedHidden{display:none!important}.infoEditorPanel select,.infoEditorPanel option{background:#fff!important;color:#111!important}.infoEditorPanel select:focus{outline:2px solid #ffd86a}.infoEditorGuide{background:#00d5ff!important;box-shadow:0 0 0 1px #001a,0 0 18px #00d5ffcc!important}.infoEditorGuide.center{background:#ffd400!important;box-shadow:0 0 0 1px #2a1e00,0 0 20px #ffd400cc!important}.infoEditorGuide span{font-size:11px;background:#001724f2;border-color:#00d5ff;color:#e9fbff}.infoEditorMeasure{border-color:#00d5ffcc!important;color:#e9fbff!important;white-space:pre-line}.infoEditorModuleRow.hidden{opacity:.65;color:#ffb2b2}.infoEditorModuleRow.hidden small{color:#ff9999}.infoEditorModuleHidden{opacity:0!important;pointer-events:none!important}.hiddenList .infoEditorModuleRow{border-color:#ff6b6b55}.infoEditorReadout{white-space:pre-line;min-height:48px}.infoEditorTimeline{height:84px;border-color:#d9b46a88}.infoEditorKey{background:#00d5ff;border-color:#e9fbff}.infoEditorKey.selected{background:#ffd400;border-color:#fff2a6}.infoEditorImportArea{width:100%;box-sizing:border-box;color:#111!important;background:#fff!important}.infoEditorDebugFab{z-index:99979}
@media(max-width:900px){.infoEditorPanel.dock-left,.infoEditorPanel.dock-right{left:10px!important;right:10px!important;top:10px!important;width:auto!important;max-height:58vh}.infoEditorToolbar{grid-template-columns:1fr}.infoEditorPanel.dock-top .infoEditorTabPage.active,.infoEditorPanel.dock-bottom .infoEditorTabPage.active{display:block}}
    `;
    document.head.appendChild(style);
  }

  function makeDebugButton(){
    if(debugFab) return;
    debugFab=document.createElement('div');
    debugFab.className='infoEditorDebugFab InfoEditor';
    debugFab.innerHTML='<button type="button" class="infoEditorDebugBtn">InfoEditor</button>';
    document.body.appendChild(debugFab);
    debugFab.querySelector('button').addEventListener('click',()=>setEnabled(!state.enabled));
    const params=new URLSearchParams(location.search);
    setDebugVisible(params.has('infoeditor') || params.has('debug') || localStorage.getItem(DEBUG_UNLOCK_KEY)==='1');
  }
  function setDebugVisible(v){ state.debugVisible=!!v; if(v) localStorage.setItem(DEBUG_UNLOCK_KEY,'1'); debugFab?.classList.toggle('visible',!!v); }

  function makeOverlay(){
    if(panel) return;
    guideLayer=document.createElement('div'); guideLayer.className='infoEditorGuides InfoEditor'; document.body.appendChild(guideLayer);
    measureBadge=document.createElement('div'); measureBadge.className='infoEditorMeasure InfoEditor'; document.body.appendChild(measureBadge);
    const badge=document.createElement('div'); badge.className='infoEditorModeBadge InfoEditor'; badge.dataset.infoEditorModeBadge='1'; document.body.appendChild(badge);
    const axis=document.createElement('div'); axis.className='infoEditorAxisBadge InfoEditor'; axis.dataset.infoEditorAxisBadge='1'; document.body.appendChild(axis);
    selectionBox=document.createElement('div'); selectionBox.className='infoEditorSelectionBox InfoEditor';
    selectionBox.innerHTML=['nw','n','ne','e','se','s','sw','w'].map(h=>`<span class="infoEditorResizeHandle ${h}" data-handle="${h}"></span>`).join('')+'<span class="infoEditorSelectionLabel"></span>';
    document.body.appendChild(selectionBox);

    panel=document.createElement('aside'); panel.className='infoEditorPanel InfoEditor';
    panel.innerHTML=`
      <div class="infoEditorPanelHeader">
        <strong>InfoEditor</strong>
        <div class="infoEditorHeaderActions">
          <button type="button" class="infoEditorBtn" data-action="cycleDock" title="Dock positie wisselen">Dock</button>
          <button type="button" class="infoEditorBtn" data-action="undo">↶</button>
          <button type="button" class="infoEditorBtn" data-action="redo">↷</button>
          <button type="button" class="infoEditorBtn" data-action="close">×</button>
        </div>
      </div>
      <div class="infoEditorToolbar">
        <label>State<select data-field="stateSelect"></select></label>
        <span class="infoEditorPill" data-field="modeLabel">LIVE</span>
        <span class="infoEditorPill muted">Dock: <b data-field="dockLabel">right</b></span>
      </div>
      <div class="infoEditorSmall">State: <span data-field="stateId">-</span> · Geselecteerd: <span data-field="selectedModuleLabel">-</span></div>
      <div class="infoEditorTabs">
        <button type="button" data-tab="layout" class="active">Layout</button>
        <button type="button" data-tab="animation">Animatie</button>
        <button type="button" data-tab="modules">Modules</button>
        <button type="button" data-tab="json">JSON</button>
      </div>
      <section class="infoEditorTabPage active" data-page="layout">
        <div class="infoEditorSectionTitle">Layout eigenschappen</div>
        <label>Module<select data-field="moduleSelect"></select></label>
        <div class="infoEditorGrid3">
          <label>X <input type="number" step="1" data-prop="x"></label>
          <label>Y <input type="number" step="1" data-prop="y"></label>
          <label>Scale <input type="number" step="0.01" data-prop="scale"></label>
          <label>Opacity 0-255 <input type="number" step="1" min="0" max="255" data-prop="opacity"></label>
          <label>Width <input type="text" data-prop="width" placeholder="auto / 420px"></label>
          <label>Height <input type="text" data-prop="height" placeholder="auto / 220px"></label>
          <label>Max W <input type="text" data-prop="maxWidth" placeholder="auto / 60vw"></label>
          <label>Gap <input type="text" data-prop="gap" placeholder="auto / 14px"></label>
          <label>Font <input type="text" data-prop="fontSize" placeholder="auto / 48px"></label>
          <label>Z-index <input type="text" data-prop="zIndex" placeholder="auto / 12"></label>
        </div>
        <div class="infoEditorAdvancedHidden">
          <label><input type="checkbox" data-toggle="snap"> Snap aan</label>
          <label><input type="checkbox" data-prop-check="lockCenterX"> Lock X center</label>
          <label><input type="checkbox" data-prop-check="lockCenterY"> Lock Y center</label>
          <label><input type="checkbox" data-axis-check="x"> Alleen X bewegen</label>
          <label><input type="checkbox" data-axis-check="y"> Alleen Y bewegen</label>
        </div>
        <div class="infoEditorReadout" data-field="readout">Selecteer een module.</div>
        <div class="infoEditorButtons compact">
          <button class="infoEditorBtn" data-action="centerX">Center X</button><button class="infoEditorBtn" data-action="centerY">Center Y</button><button class="infoEditorBtn" data-action="centerBoth">Beide centers</button>
          <button class="infoEditorBtn" data-action="copyLayout">Kopieer layout</button><button class="infoEditorBtn" data-action="pasteLayout">Plak layout</button>
          <button class="infoEditorBtn dangerSoft" data-action="hideModule">Verberg module</button><button class="infoEditorBtn" data-action="resetModule">Reset module</button>
        </div>
        <p class="infoEditorSmall">Shift tijdens slepen = tijdelijke axis-lock. Pijltjes = 1px, Shift+pijltjes = 10px. Center/snap-functionaliteit blijft actief maar staat minder prominent in beeld.</p>
      </section>
      <section class="infoEditorTabPage" data-page="animation">
        <div class="infoEditorSectionTitle">Timeline / keyframes</div>
        <div class="infoEditorButtons compact"><button class="infoEditorBtn" data-action="animStart">Begin</button><button class="infoEditorBtn" data-action="animPlay">Play</button><button class="infoEditorBtn" data-action="animPause">Pauze</button><button class="infoEditorBtn" data-action="animReplay">Replay</button></div>
        <div class="infoEditorGrid2"><label>Duur ms <input type="number" min="100" step="100" data-anim="duration"></label><label>Tijd ms <input type="number" min="0" step="10" data-anim="timeNumber"></label></div>
        <input type="range" min="0" max="3200" step="10" value="0" data-anim="time" style="width:100%">
        <div class="infoEditorTimeline" data-field="timeline"><div class="infoEditorTimelineTrack"></div><div class="infoEditorPlayhead"></div></div>
        <div class="infoEditorSmall"><span data-field="animTime">0 ms</span> / <span data-field="animDuration">3200 ms</span></div>
        <div class="infoEditorGrid2"><label>Anim module<select data-anim="module"></select></label><label>Keyframe<select data-anim="keyframe"></select></label></div>
        <div class="infoEditorGrid3">
          <label>Time <input type="number" step="10" data-key-prop="time"></label><label>X <input type="number" step="1" data-key-prop="x"></label><label>Y <input type="number" step="1" data-key-prop="y"></label>
          <label>Scale <input type="number" step="0.01" data-key-prop="scale"></label><label>Opacity 0-255 <input type="number" step="1" min="0" max="255" data-key-prop="opacity"></label><label>Easing <input type="text" data-key-prop="easing"></label>
          <label>Width <input type="text" data-key-prop="width"></label><label>Height <input type="text" data-key-prop="height"></label><label>Font <input type="text" data-key-prop="fontSize"></label>
        </div>
        <div class="infoEditorButtons compact">
          <button class="infoEditorBtn" data-action="addKeyframe">+ Keyframe</button><button class="infoEditorBtn" data-action="deleteKeyframe">Verwijder</button><button class="infoEditorBtn" data-action="duplicateKeyframe">Dupliceer</button>
          <button class="infoEditorBtn" data-action="prevKeyframe">Vorige</button><button class="infoEditorBtn" data-action="nextKeyframe">Volgende</button>
          <button class="infoEditorBtn" data-action="copyAnimation">Kopieer animatie</button><button class="infoEditorBtn" data-action="pasteAnimation">Plak animatie</button><button class="infoEditorBtn" data-action="resetAnimation">Reset animatie</button>
        </div>
      </section>
      <section class="infoEditorTabPage" data-page="modules">
        <div class="infoEditorSectionTitle">Modules</div>
        <div class="infoEditorGrid2"><label>Snap threshold <input type="number" min="2" max="40" step="1" data-field="snapThreshold"></label><label>Time snap <input type="number" min="10" max="1000" step="10" data-field="timelineSnapMs"></label></div>
        <label>Alle modules</label><div class="infoEditorModuleList" data-field="moduleList"></div>
        <label>Verborgen modules</label><div class="infoEditorModuleList hiddenList" data-field="hiddenModuleList"></div>
        <div class="infoEditorButtons compact">
          <button class="infoEditorBtn dangerSoft" data-action="hideModule">Verberg geselecteerd</button><button class="infoEditorBtn" data-action="restoreModule">Herstel geselecteerd</button>
          <button class="infoEditorBtn" data-action="copyStateLayout">Kopieer state layout</button><button class="infoEditorBtn" data-action="pasteStateLayout">Plak state layout</button>
          <button class="infoEditorBtn" data-action="copyStateAnimation">Kopieer state animation</button><button class="infoEditorBtn" data-action="pasteStateAnimation">Plak state animation</button>
        </div>
      </section>
      <section class="infoEditorTabPage" data-page="json">
        <div class="infoEditorSectionTitle">JSON export/import</div>
        <div class="infoEditorButtons compact">
          <button class="infoEditorBtn" data-action="copyJson">Kopieer volledige JSON</button><button class="infoEditorBtn" data-action="downloadJson">Download volledige JSON</button>
          <button class="infoEditorBtn" data-action="importMerge">Import merge</button><button class="infoEditorBtn" data-action="importReplaceState">Import huidige state</button><button class="infoEditorBtn" data-action="importReplaceAll">Import replace all</button>
          <button class="infoEditorBtn" data-action="resetState">Reset huidige state</button><button class="infoEditorBtn dangerSoft" data-action="resetAll">Reset alles</button>
        </div>
        <textarea class="infoEditorImportArea" data-field="importText" placeholder="Plak InfoEditor JSON hier voor import"></textarea>
        <p class="infoEditorSmall">Export bevat alle states, layouts, hidden-status, animaties, keyframes en editorMeta zoals dockpositie.</p>
      </section>`
    document.body.appendChild(panel);
    timelineEl=panel.querySelector('[data-field="timeline"]');

    panel.addEventListener('input', onPanelInput);
    panel.addEventListener('change', onPanelInput);
    panel.addEventListener('click', onPanelClick);
    timelineEl.addEventListener('pointerdown', onTimelinePointerDown);
    selectionBox.addEventListener('pointerdown', onResizeStart, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onInputFocus, true);
  }

  function setEnabled(v){
    state.enabled=!!v; makeOverlay(); document.body.classList.toggle('infoEditorActive',state.enabled);
    debugFab?.querySelector('button')?.classList.toggle('active',state.enabled);
    if(!state.enabled){ stopAnim(true); restoreLiveSnapshot(); hideGuides(); hideMeasure(); selectionBox?.classList.remove('visible'); }
    else { state.selectedState='live'; state.snap=state.config.editorMeta?.snapEnabled!==false; state.snapThreshold=num(state.config.editorMeta?.snapThreshold,DEFAULT_SNAP); state.timelineSnapMs=num(state.config.editorMeta?.timelineSnapMs,DEFAULT_TIMELINE_SNAP); state.dockPosition=state.config.editorMeta?.dockPosition||'right'; applyDock(); discover(); }
    refreshPanel(); updateModeBadge(); scheduleUi();
  }
  function updateModeBadge(){
    const b=$('[data-info-editor-mode-badge]'); if(!b) return;
    const text=state.enabled ? (state.previewMode ? `EDITOR PREVIEW · ${activeStateId()}` : `LIVE · ${currentLiveStateId()}`) : '';
    b.textContent=text; b.classList.toggle('visible',state.enabled);
  }

  function saveLiveSnapshot(){
    if(state.liveSnapshot) return;
    const hero=idEl('hero');
    state.liveSnapshot = hero ? { heroClass:hero.className, heroDataset:{...hero.dataset}, big:idEl('bigStatus')?.innerHTML||'', sub:idEl('subStatus')?.innerHTML||'', deaths:idEl('deaths')?.innerHTML||'', players:idEl('viewerPlayers')?.innerHTML||'' } : null;
  }
  function restoreLiveSnapshot(){
    if(!state.liveSnapshot) return;
    const snap=state.liveSnapshot, hero=idEl('hero');
    if(hero){ hero.className=snap.heroClass; Object.assign(hero.dataset,snap.heroDataset||{}); }
    if(idEl('bigStatus')) idEl('bigStatus').innerHTML=snap.big;
    if(idEl('subStatus')) idEl('subStatus').innerHTML=snap.sub;
    if(idEl('deaths')) idEl('deaths').innerHTML=snap.deaths;
    if(idEl('viewerPlayers')) idEl('viewerPlayers').innerHTML=snap.players;
    state.liveSnapshot=null; state.previewMode=false; discover();
  }
  function roleCard(role='Burger', name='Speler 1', dead=false){
    const file = role==='Weerwolf' ? 'Weerwolf.png' : role==='Ziener' ? 'Ziener.png' : 'Burger1.png';
    return `<div class="winnerPlayerCard ${dead?'dead':'alive'}"><h3>${esc(name)}</h3><img class="winnerRoleCard" src="/assets/cards/${file}" alt="${esc(role)}"></div>`;
  }
  function mockPlayers(n=7){ return Array.from({length:n},(_,i)=>`<span class="viewerPlayer ${i===2?'dead':''}" data-key="mock-${i}">${i?`Speler ${i}`:'Mau'}</span>`).join(''); }
  function setHero(cls){ const h=idEl('hero'); if(h){ h.className=`viewerHero ${cls}`; h.dataset.baseClass=`viewerHero ${cls}`; } }
  function renderPreview(sid){
    saveLiveSnapshot(); state.previewMode = sid !== 'live'; if(sid==='live'){ restoreLiveSnapshot(); return; }
    const big=idEl('bigStatus'), sub=idEl('subStatus'), deaths=idEl('deaths'), players=idEl('viewerPlayers');
    if(players) players.innerHTML=mockPlayers(8);
    if(sid==='lobby'){ setHero('lobby'); big.innerHTML='Lobby'; sub.innerHTML='Wacht tot iedereen joined.'; deaths.innerHTML=''; }
    else if(sid==='night'){ setHero('night'); big.innerHTML='Nacht'; sub.innerHTML='Het is nacht. Iedereen slaapt.'; deaths.innerHTML=''; }
    else if(sid==='day'){ setHero('day'); big.innerHTML='Dag'; sub.innerHTML='Het is dag. Het dorp wordt wakker.'; deaths.innerHTML=''; }
    else if(sid==='nightDeathReveal' || sid==='dayAftermath'){ setHero('day'); big.innerHTML='Dag'; sub.innerHTML='deze spelers hebben de avond niet overleefd'; deaths.innerHTML=`<div class="deathCard deathCardWithArt"><h3>Speler 3</h3><img class="deathRoleCard" src="/assets/cards/Burger2.png" alt="Burger"></div>`; }
    else if(sid==='mayorElection'){ setHero('day mayor'); big.innerHTML='Burgemeester'; sub.innerHTML='wie stelt zich kandidaat?'; deaths.innerHTML='<div class="candidateList infoCandidatesCentral"><div class="candidateCard"><h3>Speler 2</h3></div><div class="candidateCard"><h3>Speler 5</h3></div></div>'; }
    else if(sid==='mayorResult'){ setHero('day mayor'); big.innerHTML='Burgemeester'; sub.innerHTML='de stemmen zijn geteld'; deaths.innerHTML='<div class="infoMayorResult"><h3 class="voteFinalText">de nieuwe burgemeester is Speler 2</h3><div class="mayorResultBars"><div class="mayorResultBar"><span class="mayorBarFill" style="height:65%"></span><strong>Speler 2</strong><small class="countUp">3</small></div><div class="mayorResultBar"><span class="mayorBarFill" style="height:35%"></span><strong>Speler 5</strong><small class="countUp">1</small></div></div></div>'; }
    else if(sid==='openDayVote'){ setHero('day voting'); big.innerHTML='Dagstemming'; sub.innerHTML='het dorp stemt'; deaths.innerHTML='<div class="infoCenterText"><h3>4/8 spelers hebben gestemd</h3><div class="infoVoters"><span class="candidatePill voted">Mau ✓</span><span class="candidatePill">Speler 1</span><span class="candidatePill voted">Speler 2 ✓</span></div></div>'; }
    else if(sid==='openDayVoteResult'){ setHero('day'); big.innerHTML='Dagstemming'; sub.innerHTML='dit is de uitslag van de open dagstemming'; deaths.innerHTML=`<div class="dayVoteResultStage hasReveal revealReady cardReady" data-result-key="mock"><div class="dayVoteRevealColumn"><div class="dayElimReveal"><div class="deathCard deathCardWithArt"><h3>Speler 6</h3><img class="deathRoleCard" src="/assets/cards/Weerwolf.png" alt="Weerwolf"></div></div></div><div class="infoMayorResult dayVoteGraphColumn"><h3 class="voteFinalText">Speler 6 is geëlimineerd.</h3><div class="mayorResultBars dayResultBars"><div class="mayorResultBar"><span class="mayorBarFill" style="height:20%"></span><strong>Speler 2</strong><small class="countUp">1</small></div><div class="mayorResultBar willEliminate eliminatedBar"><span class="mayorBarFill" style="height:100%"></span><strong>Speler 6</strong><small class="countUp">5</small></div></div></div></div>`; }
    else if(sid==='winnerVillage'){ setHero('ended'); big.innerHTML='Het Dorp wint!'; sub.innerHTML='Alle wolfachtige dreigingen zijn uitgeschakeld.'; deaths.innerHTML=`<div class="winnerStage hasDefeated"><section class="winnerVillageSection"><h3>Het Dorp</h3><div class="winnerCards mainWinnerCards">${roleCard('Burger','Mau')}${roleCard('Burger','Speler 2')}${roleCard('Burger','Speler 3')}${roleCard('Burger','Speler 4')}${roleCard('Burger','Speler 5')}</div></section><aside class="winnerDefeatedModule"><h4 class="winnerDefeatedHeading">Verslagen wolven</h4><div class="defeatedWolves"><div class="winnerCards small">${roleCard('Weerwolf','Speler 6',true)}</div></div></aside></div>`; if(players) players.innerHTML=''; }
    else if(sid==='winnerWolves'){ setHero('ended'); big.innerHTML='De Wolven winnen!'; sub.innerHTML='De wolven zijn niet meer te stoppen.'; deaths.innerHTML=`<div class="winnerStage"><section class="winnerVillageSection"><h3>De Wolven</h3><div class="winnerCards mainWinnerCards">${roleCard('Weerwolf','Speler 3')}${roleCard('Weerwolf','Speler 6')}</div></section></div>`; if(players) players.innerHTML=''; }
    discover();
  }

  function discover(){
    cancelAnimationFrame(state.scanRaf);
    state.scanRaf=requestAnimationFrame(()=>{
      const next=new Map();
      $all('[data-info-editor-id],[data-editor-id]').forEach(el=>{ el.classList.remove('info-editor-module'); el.removeAttribute('data-info-editor-id'); el.removeAttribute('data-editor-id'); });
      for(const [id,sel] of MODULE_SELECTORS){
        const el=$(sel); if(!el) continue;
        el.dataset.infoEditorId=id; el.dataset.editorId=id; el.classList.add('info-editor-module');
        if(id==='playerStatusBar') el.classList.add('infoEditorPlayerStatusBar');
        next.set(id,el);
      }
      state.modules=next;
      if(!state.selectedIds.length || !state.selectedIds.some(id=>next.has(id))) state.selectedIds=next.size?[next.keys().next().value]:[];
      applyAllLayouts(); refreshPanel(); updateSelection(); scheduleUi();
    });
  }

  function getBaseTransform(id,el){
    if(id==='playerStatusBar') return 'translateX(-50%)';
    const inline=el.style.transform||'';
    if(inline && !inline.includes('var(--info-editor')) return inline;
    const c=getComputedStyle(el).transform; return (c && c!=='none') ? c : 'translate3d(0,0,0)';
  }
  function setOrClear(el,prop,value){ if(value!=='' && value!=null) el.style[prop]=String(value); else el.style[prop]=''; }
  function applyLayout(id,el=state.modules.get(id)){
    if(!el) return;
    const cfg=layoutCfg(id);
    el.classList.toggle('infoEditorModuleHidden', state.enabled && !!cfg.hidden);
    if(!el.dataset.infoEditorBaseTransform || id==='playerStatusBar') el.dataset.infoEditorBaseTransform=getBaseTransform(id,el);
    el.style.setProperty('--info-editor-base-transform', el.dataset.infoEditorBaseTransform || 'translate3d(0,0,0)');
    el.style.setProperty('--info-editor-x', `${Math.round(num(cfg.x,0))}px`);
    el.style.setProperty('--info-editor-y', `${Math.round(num(cfg.y,0))}px`);
    el.style.setProperty('--info-editor-scale', String(Math.max(.05,num(cfg.scale,1))));
    el.style.setProperty('--info-editor-opacity', String(clamp(normalizeOpacity(cfg.opacity)/255,0,1)));
    setOrClear(el,'width',cssValue(cfg.width)); setOrClear(el,'height',cssValue(cfg.height)); setOrClear(el,'maxWidth',cssValue(cfg.maxWidth)); setOrClear(el,'gap',cssValue(cfg.gap)); setOrClear(el,'fontSize',cssValue(cfg.fontSize)); setOrClear(el,'zIndex',cssValue(cfg.zIndex));
    if(state.enabled && (cfg.lockCenterX || cfg.lockCenterY)) requestAnimationFrame(()=>enforceLocks(id));
  }
  function applyAllLayouts(){ state.modules.forEach((el,id)=>applyLayout(id,el)); }
  function enforceLocks(id){
    const el=state.modules.get(id), cfg=layoutCfg(id); if(!el) return;
    const r=el.getBoundingClientRect(); let changed=false;
    if(cfg.lockCenterX){ cfg.x=Math.round(num(cfg.x,0)+(window.innerWidth/2-(r.left+r.width/2))); changed=true; }
    if(cfg.lockCenterY){ cfg.y=Math.round(num(cfg.y,0)+(window.innerHeight/2-(r.top+r.height/2))); changed=true; }
    if(changed){ applyLayout(id,el); saveConfig(); }
  }

  function selectedId(){ return state.selectedIds[0] || ''; }
  function selectModule(id, additive=false){
    if(!id || !state.modules.has(id)) return;
    if(additive){ state.selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter(x=>x!==id) : [...state.selectedIds,id]; if(!state.selectedIds.length) state.selectedIds=[id]; }
    else state.selectedIds=[id];
    if(!trackModules().includes(id)) ensureTrack(id);
    updateSelection(); refreshPanel(); scheduleUi();
  }
  function updateSelection(){ state.modules.forEach((el,id)=>el.classList.toggle('infoEditorSelected', state.enabled && state.selectedIds.includes(id))); }

  function refreshPanel(){
    if(!panel) return;
    panel.classList.toggle('visible',state.enabled);
    applyDock();
    const stateIdField=panel.querySelector('[data-field="stateId"]'); if(stateIdField) stateIdField.textContent=activeStateId();
    const selectedLabel=panel.querySelector('[data-field="selectedModuleLabel"]'); if(selectedLabel) selectedLabel.textContent=selectedId()||'-';
    const modeField=panel.querySelector('[data-field="modeLabel"]'); if(modeField) modeField.textContent=state.previewMode?'EDITOR PREVIEW':'LIVE';
    const dockField=panel.querySelector('[data-field="dockLabel"]'); if(dockField) dockField.textContent=state.dockPosition;
    const stateSel=panel.querySelector('[data-field="stateSelect"]');
    stateSel.innerHTML=INFO_STATES.map(s=>`<option value="${esc(s.id)}" ${state.selectedState===s.id?'selected':''}>${esc(s.label)}</option>`).join('');
    const ids=[...state.modules.keys()];
    const modSel=panel.querySelector('[data-field="moduleSelect"]');
    modSel.innerHTML=ids.map(id=>`<option value="${esc(id)}" ${id===selectedId()?'selected':''}>${esc(id)}</option>`).join('');
    const list=panel.querySelector('[data-field="moduleList"]');
    if(list) list.innerHTML=ids.map(id=>{ const c=layoutCfg(id), hasLayout=!!bucket().layout[id], hasAnim=!!animCfg().tracks[id]?.length; return `<div class="infoEditorModuleRow ${state.selectedIds.includes(id)?'active':''} ${c.hidden?'hidden':''}" data-module-row="${esc(id)}"><span>${esc(id)}</span><small>${c.hidden?'hidden ':''}${hasLayout?'L':'-'} ${hasAnim?'A':'-'}</small></div>`; }).join('');
    const hiddenList=panel.querySelector('[data-field="hiddenModuleList"]');
    if(hiddenList) hiddenList.innerHTML=ids.filter(id=>layoutCfg(id).hidden).map(id=>`<div class="infoEditorModuleRow ${state.selectedIds.includes(id)?'active':''} hidden" data-module-row="${esc(id)}"><span>${esc(id)}</span><small>hidden</small></div>`).join('') || '<div class="infoEditorSmall">Geen verborgen modules.</div>';
    const cfg=selectedId()?layoutCfg(selectedId()):normalizeLayout({});
    panel.querySelectorAll('[data-prop]').forEach(input=>{ if(document.activeElement!==input) input.value=cfg[input.dataset.prop] ?? ''; });
    { const el=panel.querySelector('[data-toggle="snap"]'); if(el) el.checked=state.snap; }
    { const el=panel.querySelector('[data-field="snapThreshold"]'); if(el) el.value=state.snapThreshold; }
    { const el=panel.querySelector('[data-field="timelineSnapMs"]'); if(el) el.value=state.timelineSnapMs; }
    panel.querySelectorAll('[data-prop-check]').forEach(i=>i.checked=!!cfg[i.dataset.propCheck]);
    panel.querySelectorAll('[data-axis-check]').forEach(i=>i.checked=(cfg.axis||'free')===i.dataset.axisCheck);
    updateReadout(); refreshAnimationPanel(); updateModeBadge();
  }
  function refreshInputs(){ if(!panel) return; const cfg=selectedId()?layoutCfg(selectedId()):normalizeLayout({}); panel.querySelectorAll('[data-prop]').forEach(input=>{ if(document.activeElement!==input) input.value=cfg[input.dataset.prop] ?? ''; }); updateReadout(); refreshAnimationPanel(false); scheduleUi(); }
  function updateReadout(){
    const out=panel?.querySelector('[data-field="readout"]'); if(!out) return;
    const id=selectedId(), el=state.modules.get(id); if(!id || !el){ out.textContent='Selecteer een module.'; return; }
    const r=el.getBoundingClientRect(), cfg=layoutCfg(id), nearest=nearestGap(r,id);
    const edge=`L:${Math.round(r.left)} R:${Math.round(window.innerWidth-r.right)} T:${Math.round(r.top)} B:${Math.round(window.innerHeight-r.bottom)}`;
    out.textContent=`${id}${cfg.hidden?' · HIDDEN':''}
x:${Math.round(num(cfg.x))} y:${Math.round(num(cfg.y))} · w:${Math.round(r.width)} h:${Math.round(r.height)} · scale ${num(cfg.scale,1)} · opacity ${normalizeOpacity(cfg.opacity)}/255
center Δ ${Math.round(r.left+r.width/2-window.innerWidth/2)}, ${Math.round(r.top+r.height/2-window.innerHeight/2)} · ${edge}${nearest?` · gap ${nearest.id}:${nearest.gap}px`:''}`;
  }

  function beginHistory(label){ state.history.pending={label, before:clone(state.config)}; }
  function commitHistory(label){
    const before=state.history.pending?.before || clone(state.config);
    const after=clone(state.config);
    if(JSON.stringify(before)===JSON.stringify(after)){ state.history.pending=null; return; }
    state.history.undo.push({label:label||state.history.pending?.label||'change', before, after});
    if(state.history.undo.length>MAX_HISTORY) state.history.undo.shift();
    state.history.redo=[]; state.history.pending=null; saveConfig();
  }
  function undo(){ const h=state.history.undo.pop(); if(!h) return flash('Niets om te undo-en'); state.history.redo.push(h); state.config=clone(h.before); afterHistoryRestore('Undo'); }
  function redo(){ const h=state.history.redo.pop(); if(!h) return flash('Niets om te redo-en'); state.history.undo.push(h); state.config=clone(h.after); afterHistoryRestore('Redo'); }
  function afterHistoryRestore(txt){ saveConfig(); applyAllLayouts(); applyAnimationPreview(); refreshPanel(); flash(txt); }
  function withHistory(label,fn){ beginHistory(label); fn(); commitHistory(label); }

  function onInputFocus(ev){ if(state.enabled && ev.target.closest('.infoEditorPanel')) beginHistory('input'); }
  function onPanelInput(ev){
    const t=ev.target;
    if(t.matches('[data-field="stateSelect"]')){ switchState(t.value); return; }
    if(t.matches('[data-field="moduleSelect"]')){ selectModule(t.value); return; }
    if(t.matches('[data-toggle="snap"]')){ state.snap=!!t.checked; saveConfig(); return; }
    if(t.matches('[data-field="snapThreshold"]')){ state.snapThreshold=clamp(num(t.value,DEFAULT_SNAP),2,40); saveConfig(); return; }
    if(t.matches('[data-field="timelineSnapMs"]')){ state.timelineSnapMs=clamp(num(t.value,DEFAULT_TIMELINE_SNAP),10,1000); saveConfig(); return; }
    if(t.matches('[data-axis-check]')){ const id=selectedId(); if(!id) return; beginHistory('axis'); const cfg=layoutCfg(id); cfg.axis=t.checked?t.dataset.axisCheck:'free'; applyLayout(id); commitHistory('axis'); refreshPanel(); return; }
    if(t.matches('[data-prop-check]')){ const id=selectedId(); if(!id) return; const cfg=layoutCfg(id); cfg[t.dataset.propCheck]=!!t.checked; applyLayout(id); saveConfig(); refreshPanel(); return; }
    if(t.matches('[data-prop]')){ updateLayoutProp(t); return; }
    if(t.matches('[data-anim="duration"]')){ withHistory('duration',()=>{ animCfg().duration=clamp(num(t.value,3200),100,60000); state.anim.duration=animCfg().duration; state.anim.time=clamp(state.anim.time,0,state.anim.duration); }); refreshAnimationPanel(); return; }
    if(t.matches('[data-anim="time"],[data-anim="timeNumber"]')){ setAnimTime(num(t.value,0)); return; }
    if(t.matches('[data-anim="module"]')){ const id=t.value; if(id) selectModule(id); selectNearestKeyForModule(id); refreshAnimationPanel(); return; }
    if(t.matches('[data-anim="keyframe"]')){ selectKeyById(t.value); return; }
    if(t.matches('[data-key-prop]')){ updateKeyProp(t); return; }
  }
  function updateLayoutProp(input){
    const id=selectedId(); if(!id) return;
    const cfg=layoutCfg(id), p=input.dataset.prop;
    if(!state.history.pending) beginHistory(`layout ${p}`);
    if(['x','y'].includes(p)) cfg[p]=Math.round(num(input.value,0));
    else if(p==='scale') cfg[p]=Math.max(.05,num(input.value,1));
    else if(p==='opacity') cfg[p]=normalizeOpacity(input.value);
    else cfg[p]=input.value;
    applyLayout(id); saveConfig(); scheduleUi(); updateReadout(); commitHistory(`layout ${p}`);
  }
  function onPanelClick(ev){
    const tab=ev.target.closest('[data-tab]')?.dataset.tab; if(tab){ setTab(tab); return; }
    const row=ev.target.closest('[data-module-row]'); if(row){ selectModule(row.dataset.moduleRow, ev.ctrlKey||ev.metaKey); return; }
    const action=ev.target.closest('[data-action]')?.dataset.action; if(!action) return;
    const actions={ close:()=>setEnabled(false), cycleDock, undo, redo, hideModule, restoreModule, centerX:()=>center('x'), centerY:()=>center('y'), centerBoth:()=>center('both'), resetModule, resetState, resetAll, copyJson, downloadJson, importMerge:()=>importJson('merge'), importReplaceState:()=>importJson('replaceState'), importReplaceAll:()=>importJson('replaceAll'), copyLayout, pasteLayout, copyStateLayout, pasteStateLayout, copyAnimation, pasteAnimation, copyStateAnimation, pasteStateAnimation, resetAnimation, animStart:()=>setAnimTime(0), animPlay:playAnim, animPause:pauseAnim, animReplay:()=>{ setAnimTime(0); playAnim(); }, addKeyframe, deleteKeyframe, duplicateKeyframe, prevKeyframe, nextKeyframe };
    actions[action]?.();
  }
  function setTab(tab){
    state.activeTab=tab;
    panel.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    panel.querySelectorAll('[data-page]').forEach(p=>p.classList.toggle('active',p.dataset.page===tab));
    if(tab==='animation'){ pauseAnim(); state.anim.preview=true; document.body.classList.add('infoEditorAnimationPreview'); ensureTrack(selectedId()); state.anim.duration=animCfg().duration; setAnimTime(clamp(state.anim.time,0,state.anim.duration)); }
    refreshPanel();
  }
  function switchState(sid){
    pauseAnim(); state.selectedState=sid; state.selectedKeyframe=null; state.selectedIds=[]; state.anim.time=0; renderPreview(sid); bucket(activeStateId()); saveConfig(); refreshPanel();
  }

  function onPointerDown(ev){
    if(!state.enabled || ev.target.closest('.InfoEditor')) return;
    const el=ev.target.closest('[data-info-editor-id],[data-editor-id]'); if(!el) return;
    const id=el.dataset.infoEditorId || el.dataset.editorId; if(!id) return;
    ev.preventDefault(); ev.stopPropagation(); selectModule(id,ev.ctrlKey||ev.metaKey);
    beginHistory('drag');
    const cfg=layoutCfg(id);
    state.drag={ id, el, pointerId:ev.pointerId, startX:ev.clientX, startY:ev.clientY, cfgX:num(cfg.x), cfgY:num(cfg.y), rect:el.getBoundingClientRect(), tempAxis:null };
    try{ el.setPointerCapture?.(ev.pointerId); }catch(e){}
  }
  function onResizeStart(ev){
    if(!state.enabled) return;
    const handle=ev.target.closest('[data-handle]')?.dataset.handle; if(!handle || !selectedId()) return;
    ev.preventDefault(); ev.stopPropagation();
    const id=selectedId(), el=state.modules.get(id), cfg=layoutCfg(id), r=el.getBoundingClientRect(), c=getComputedStyle(el);
    beginHistory('resize');
    state.resize={ id, el, handle, pointerId:ev.pointerId, startX:ev.clientX, startY:ev.clientY, rect:r, cfgX:num(cfg.x), cfgY:num(cfg.y), cfgScale:num(cfg.scale,1), cfgWidth:cfg.width, cfgHeight:cfg.height, cfgFont:cfg.fontSize, computedFont:num(c.fontSize,16), tempAxis:null };
  }
  function currentTempAxis(startX,startY,clientX,clientY,shiftKey,current){
    if(!shiftKey) return null;
    if(current) return current;
    const dx=clientX-startX, dy=clientY-startY;
    if(Math.max(Math.abs(dx),Math.abs(dy))<4) return null;
    return Math.abs(dx)>=Math.abs(dy) ? 'horizontal' : 'vertical';
  }
  function applyAxisBadge(axis,x=window.innerWidth/2,y=58){
    const b=$('[data-info-editor-axis-badge]'); if(!b) return;
    b.textContent=axis?`Axis lock: ${axis}`:''; b.classList.toggle('visible',!!axis); b.style.left=`${clamp(x,90,window.innerWidth-90)}px`; b.style.top=`${clamp(y,20,window.innerHeight-40)}px`;
  }
  function onPointerMove(ev){
    if(state.resize) return resizeMove(ev);
    if(!state.drag) return;
    ev.preventDefault(); ev.stopPropagation();
    const d=state.drag, cfg=layoutCfg(d.id); let dx=ev.clientX-d.startX, dy=ev.clientY-d.startY;
    d.tempAxis=currentTempAxis(d.startX,d.startY,ev.clientX,ev.clientY,ev.shiftKey,d.tempAxis);
    if(!ev.shiftKey) d.tempAxis=null;
    if(d.tempAxis==='horizontal' || (cfg.axis||'free')==='x') dy=0;
    if(d.tempAxis==='vertical' || (cfg.axis||'free')==='y') dx=0;
    applyAxisBadge(d.tempAxis,ev.clientX,ev.clientY+18);
    let nx=d.cfgX+dx, ny=d.cfgY+dy;
    if((state.snap && !ev.altKey) || cfg.lockCenterX || cfg.lockCenterY){ const s=snapPosition(d,nx,ny,cfg); nx=s.x; ny=s.y; drawGuides(s.guides); showMeasure(ev.clientX,ev.clientY,s.measure); }
    else { hideGuides(); showMeasure(ev.clientX,ev.clientY,measureText(projectRect(d.rect,nx-d.cfgX,ny-d.cfgY),nx,ny)); }
    cfg.x=Math.round(nx); cfg.y=Math.round(ny); applyLayout(d.id,d.el); refreshInputs();
  }
  function resizeMove(ev){
    ev.preventDefault(); ev.stopPropagation();
    const r=state.resize, cfg=layoutCfg(r.id); let dx=ev.clientX-r.startX, dy=ev.clientY-r.startY;
    r.tempAxis=currentTempAxis(r.startX,r.startY,ev.clientX,ev.clientY,ev.shiftKey,r.tempAxis);
    if(!ev.shiftKey) r.tempAxis=null;
    if(r.tempAxis==='horizontal') dy=0; if(r.tempAxis==='vertical') dx=0;
    applyAxisBadge(r.tempAxis,ev.clientX,ev.clientY+18);
    if(['nw','ne','se','sw'].includes(r.handle)){
      const dominant=Math.abs(dx)>Math.abs(dy)?dx:dy, sign=['nw','sw'].includes(r.handle)?-1:1; const ratio=clamp(1+(dominant*sign)/Math.max(80,r.rect.width),.15,4);
      if(isTextModule(r.id) && ev.shiftKey) cfg.fontSize=`${Math.round(clamp(r.computedFont*ratio,8,260))}px`;
      else cfg.scale=Math.round(clamp(r.cfgScale*ratio,.05,6)*1000)/1000;
    } else if(['e','w'].includes(r.handle)){ const sign=r.handle==='w'?-1:1; cfg.width=`${Math.round(clamp(r.rect.width+dx*sign,36,window.innerWidth*1.6))}px`; }
    else if(['n','s'].includes(r.handle)){ const sign=r.handle==='n'?-1:1; cfg.height=`${Math.round(clamp(r.rect.height+dy*sign,20,window.innerHeight*1.4))}px`; }
    applyLayout(r.id,r.el); refreshInputs(); showMeasure(ev.clientX,ev.clientY,measureText(r.el.getBoundingClientRect(),num(cfg.x),num(cfg.y)));
  }
  function onPointerUp(){
    if(state.drag || state.resize){ commitHistory(state.drag?'drag':'resize'); saveConfig(); }
    state.drag=null; state.resize=null; applyAxisBadge(null); hideGuides(); hideMeasure(); refreshPanel(); scheduleUi();
  }

  function rectObj(r){ return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height, cx:r.left+r.width/2, cy:r.top+r.height/2 }; }
  function projectRect(r,dx,dy){ return { left:r.left+dx, right:r.right+dx, top:r.top+dy, bottom:r.bottom+dy, width:r.width, height:r.height, cx:r.left+dx+r.width/2, cy:r.top+dy+r.height/2 }; }
  function candidatesFor(r,id){
    const xs=[{target:window.innerWidth/2,current:r.cx,guide:{type:'v',pos:window.innerWidth/2,label:'viewport center',center:true}},{target:0,current:r.left,guide:{type:'v',pos:0,label:'viewport left'}},{target:window.innerWidth,current:r.right,guide:{type:'v',pos:window.innerWidth,label:'viewport right'}}];
    const ys=[{target:window.innerHeight/2,current:r.cy,guide:{type:'h',pos:window.innerHeight/2,label:'viewport center',center:true}},{target:0,current:r.top,guide:{type:'h',pos:0,label:'viewport top'}},{target:window.innerHeight,current:r.bottom,guide:{type:'h',pos:window.innerHeight,label:'viewport bottom'}}];
    for(const [oid,el] of state.modules){ if(oid===id) continue; const o=rectObj(el.getBoundingClientRect());
      [{k:'left',v:r.left},{k:'center',v:r.cx},{k:'right',v:r.right}].forEach(own=>[{k:'left',v:o.left},{k:'center',v:o.cx},{k:'right',v:o.right}].forEach(other=>xs.push({target:other.v,current:own.v,guide:{type:'v',pos:other.v,label:`${oid} ${other.k}`,center:other.k==='center'}})));
      [{k:'top',v:r.top},{k:'middle',v:r.cy},{k:'bottom',v:r.bottom}].forEach(own=>[{k:'top',v:o.top},{k:'middle',v:o.cy},{k:'bottom',v:o.bottom}].forEach(other=>ys.push({target:other.v,current:own.v,guide:{type:'h',pos:other.v,label:`${oid} ${other.k}`,center:other.k==='middle'}})));
    }
    return {xs,ys};
  }
  function snapPosition(d,nx,ny,cfg){
    let x=nx,y=ny, pred=projectRect(d.rect,x-d.cfgX,y-d.cfgY), guides=[];
    const c=candidatesFor(pred,d.id);
    function best(arr){ let b=null; arr.forEach(a=>{ const delta=a.target-a.current, abs=Math.abs(delta); if(abs<=state.snapThreshold && (!b || abs<Math.abs(b.delta))) b={delta,guide:a.guide}; }); return b; }
    if(cfg.lockCenterX){ x+=window.innerWidth/2-pred.cx; guides.push({type:'v',pos:window.innerWidth/2,label:'locked center X',center:true}); }
    else { const bx=best(c.xs); if(bx){ x+=bx.delta; guides.push(bx.guide); } }
    pred=projectRect(d.rect,x-d.cfgX,y-d.cfgY);
    if(cfg.lockCenterY){ y+=window.innerHeight/2-pred.cy; guides.push({type:'h',pos:window.innerHeight/2,label:'locked center Y',center:true}); }
    else { const by=best(candidatesFor(pred,d.id).ys); if(by){ y+=by.delta; guides.push(by.guide); } }
    pred=projectRect(d.rect,x-d.cfgX,y-d.cfgY);
    return { x,y,guides,measure:measureText(pred,x,y) };
  }
  function nearestGap(rRaw,id){ const r=rectObj(rRaw); let best=null; for(const [oid,el] of state.modules){ if(oid===id) continue; const o=rectObj(el.getBoundingClientRect()); const h=r.right<=o.left?o.left-r.right:o.right<=r.left?r.left-o.right:0; const v=r.bottom<=o.top?o.top-r.bottom:o.bottom<=r.top?r.top-o.bottom:0; const gap=Math.round(Math.max(h,v)); if(!best||gap<best.gap) best={id:oid,gap}; } return best; }
  function measureText(rLike,x,y){ const r=rLike.cx==null?rectObj(rLike):rLike, n=nearestGap({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}, selectedId()); return `x:${Math.round(x)} y:${Math.round(y)} · w:${Math.round(r.width)} h:${Math.round(r.height)}
center Δ ${Math.round(r.cx-window.innerWidth/2)},${Math.round(r.cy-window.innerHeight/2)} · edges L:${Math.round(r.left)} R:${Math.round(window.innerWidth-r.right)} T:${Math.round(r.top)} B:${Math.round(window.innerHeight-r.bottom)}${n?`
gap ${n.id}: ${n.gap}px`:''}`; }
  function drawGuides(guides=[]){ if(!guideLayer) return; guideLayer.innerHTML=''; guides.forEach(g=>{ const line=document.createElement('div'); line.className=`infoEditorGuide ${g.type} ${g.center?'center':''}`; if(g.type==='h') line.style.top=`${g.pos}px`; else line.style.left=`${g.pos}px`; line.innerHTML=g.label?`<span>${esc(g.label)}</span>`:''; guideLayer.appendChild(line); }); }
  function hideGuides(){ drawGuides([]); }
  function showMeasure(x,y,text){ measureBadge.textContent=text; measureBadge.style.left=`${Math.min(window.innerWidth-380,x+14)}px`; measureBadge.style.top=`${Math.min(window.innerHeight-60,y+14)}px`; measureBadge.classList.add('visible'); }
  function hideMeasure(){ measureBadge?.classList.remove('visible'); }

  function onKeyDown(ev){
    if(!state.enabled) return;
    const key=ev.key.toLowerCase();
    if((ev.ctrlKey||ev.metaKey) && key==='z' && !ev.shiftKey){ ev.preventDefault(); undo(); return; }
    if((ev.ctrlKey||ev.metaKey) && (key==='i' || key==='y' || (key==='z'&&ev.shiftKey))){ ev.preventDefault(); redo(); return; }
    if(isInputTarget(ev.target) && ev.target.closest('.infoEditorPanel')) return;
    if(ev.key==='Escape'){ ev.preventDefault(); setEnabled(false); return; }
    const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}; if(!(ev.key in arrows) || !selectedId()) return;
    ev.preventDefault(); beginHistory('nudge'); const cfg=layoutCfg(selectedId()), step=ev.shiftKey?10:1; let [dx,dy]=arrows[ev.key]; if((cfg.axis||'free')==='x') dy=0; if((cfg.axis||'free')==='y') dx=0; cfg.x=Math.round(num(cfg.x)+dx*step); cfg.y=Math.round(num(cfg.y)+dy*step); applyLayout(selectedId()); commitHistory('nudge'); refreshPanel();
  }

  function center(axis){ const id=selectedId(), el=state.modules.get(id); if(!el) return; withHistory('center',()=>{ const cfg=layoutCfg(id), r=el.getBoundingClientRect(); if(axis==='x'||axis==='both') cfg.x=Math.round(num(cfg.x)+(window.innerWidth/2-(r.left+r.width/2))); if(axis==='y'||axis==='both') cfg.y=Math.round(num(cfg.y)+(window.innerHeight/2-(r.top+r.height/2))); applyLayout(id); }); refreshPanel(); }
  function resetModule(){ const id=selectedId(); if(!id) return; withHistory('reset module',()=>{ delete bucket().layout[id]; applyLayout(id); }); refreshPanel(); }
  function resetState(){ withHistory('reset state',()=>{ state.config.states[activeStateId()]=normalizeStateBucket({ animation:DEFAULT_TRACKS[activeStateId()]||{} }, activeStateId()); applyAllLayouts(); clearAnimVars(); }); refreshPanel(); }
  function resetAll(){ if(!confirm('Alle InfoEditor-data resetten?')) return; state.config=normalizeConfig({}); saveConfig(); applyAllLayouts(); clearAnimVars(); refreshPanel(); flash('Alle InfoEditor-data gereset'); }

  function trackModules(){ return Object.keys(animCfg().tracks||{}); }
  function ensureTrack(id){ if(!id) return; const a=animCfg(); a.tracks[id] ||= [{ time:0, x:num(layoutCfg(id).x), y:num(layoutCfg(id).y), scale:num(layoutCfg(id).scale,1), opacity:normalizeOpacity(layoutCfg(id).opacity), easing:'linear' }]; }
  function keyId(moduleId,index){ return `${moduleId}::${index}`; }
  function parseKeyId(k){ const [moduleId,index]=String(k||'').split('::'); return {moduleId,index:Number(index)}; }
  function getSelectedKey(){ if(!state.selectedKeyframe) return null; const {moduleId,index}=parseKeyId(state.selectedKeyframe); const frame=animCfg().tracks?.[moduleId]?.[index]; return frame?{moduleId,index,frame}:null; }
  function refreshAnimationPanel(full=true){
    if(!panel) return; const anim=animCfg(); state.anim.duration=num(anim.duration,3200);
    const range=panel.querySelector('[data-anim="time"]'), numInput=panel.querySelector('[data-anim="timeNumber"]'), dur=panel.querySelector('[data-anim="duration"]');
    if(range){ range.max=String(state.anim.duration); if(document.activeElement!==range) range.value=String(Math.round(state.anim.time)); }
    if(numInput && document.activeElement!==numInput) numInput.value=String(Math.round(state.anim.time));
    if(dur && document.activeElement!==dur) dur.value=String(Math.round(state.anim.duration));
    panel.querySelector('[data-field="animTime"]').textContent=`${Math.round(state.anim.time)} ms`; panel.querySelector('[data-field="animDuration"]').textContent=`${Math.round(state.anim.duration)} ms`;
    const mods=[...new Set([...state.modules.keys(), ...trackModules()])];
    const modSel=panel.querySelector('[data-anim="module"]'); const current=selectedId()||mods[0]||''; if(modSel) modSel.innerHTML=mods.map(id=>`<option value="${esc(id)}" ${id===current?'selected':''}>${esc(id)}</option>`).join('');
    const keys=[]; Object.entries(anim.tracks||{}).forEach(([mid,frames])=>(frames||[]).forEach((f,i)=>keys.push({id:keyId(mid,i),label:`${mid} @ ${Math.round(num(f.time))}ms`,mid,i,f})));
    if(state.selectedKeyframe && !keys.some(k=>k.id===state.selectedKeyframe)) state.selectedKeyframe=null;
    const keySel=panel.querySelector('[data-anim="keyframe"]'); if(keySel) keySel.innerHTML='<option value="">—</option>'+keys.map(k=>`<option value="${esc(k.id)}" ${k.id===state.selectedKeyframe?'selected':''}>${esc(k.label)}</option>`).join('');
    const selected=getSelectedKey()?.frame || {};
    panel.querySelectorAll('[data-key-prop]').forEach(input=>{ if(document.activeElement!==input) input.value=selected[input.dataset.keyProp] ?? ''; });
    drawTimeline();
  }
  function drawTimeline(){
    if(!timelineEl) return; const duration=Math.max(1,state.anim.duration||animCfg().duration||3200); const w=timelineEl.clientWidth||420; const left=10, inner=Math.max(1,w-20);
    timelineEl.querySelectorAll('.infoEditorKey').forEach(k=>k.remove());
    timelineEl.querySelector('.infoEditorPlayhead').style.left=`${left + (clamp(state.anim.time,0,duration)/duration)*inner}px`;
    const selectedSet=new Set(state.selectedIds);
    Object.entries(animCfg().tracks||{}).forEach(([mid,frames])=>{
      (frames||[]).forEach((f,i)=>{ const marker=document.createElement('div'); marker.className=`infoEditorKey ${state.selectedKeyframe===keyId(mid,i)?'selected':''} ${selectedSet.size && !selectedSet.has(mid)?'other':''}`; marker.style.left=`${left + (clamp(num(f.time),0,duration)/duration)*inner}px`; marker.dataset.keyId=keyId(mid,i); marker.title=`${mid}\n${Math.round(num(f.time))}ms\nx:${num(f.x)} y:${num(f.y)} scale:${num(f.scale,1)} opacity:${normalizeOpacity(f.opacity)} easing:${f.easing||'linear'}`; marker.innerHTML=`<span>${esc(mid)}</span>`; timelineEl.appendChild(marker); });
    });
  }
  function onTimelinePointerDown(ev){
    if(!state.enabled) return; const key=ev.target.closest('.infoEditorKey');
    if(key){ ev.preventDefault(); selectKeyById(key.dataset.keyId); const {moduleId,index}=parseKeyId(key.dataset.keyId); beginHistory('drag keyframe'); const startTime=num(animCfg().tracks[moduleId][index].time); const duration=state.anim.duration; const rect=timelineEl.getBoundingClientRect(); const move=e=>{ const snap=e.shiftKey?Math.max(250,state.timelineSnapMs*2):state.timelineSnapMs; const pct=clamp((e.clientX-rect.left-10)/Math.max(1,rect.width-20),0,1); let t=pct*duration; t=Math.round(t/snap)*snap; setKeyTime(moduleId,index,t,true); }; const up=()=>{ document.removeEventListener('pointermove',move,true); document.removeEventListener('pointerup',up,true); mergeDuplicateKeys(moduleId); commitHistory('drag keyframe'); refreshAnimationPanel(); }; document.addEventListener('pointermove',move,true); document.addEventListener('pointerup',up,true); return; }
    const rect=timelineEl.getBoundingClientRect(); const pct=clamp((ev.clientX-rect.left-10)/Math.max(1,rect.width-20),0,1); setAnimTime(pct*state.anim.duration);
  }
  function setKeyTime(mid,index,t,silent=false){ const frames=animCfg().tracks[mid]; if(!frames?.[index]) return; frames[index].time=clamp(Math.round(num(t)),0,state.anim.duration); frames.sort((a,b)=>num(a.time)-num(b.time)); const newIndex=frames.indexOf(frames.find(f=>f===frames[index])) ; if(!silent) saveConfig(); }
  function mergeDuplicateKeys(mid){ const frames=animCfg().tracks[mid]||[]; const seen=new Map(); const merged=[]; frames.sort((a,b)=>num(a.time)-num(b.time)).forEach(f=>{ const k=String(num(f.time)); if(seen.has(k)) Object.assign(seen.get(k),f); else { seen.set(k,f); merged.push(f); } }); animCfg().tracks[mid]=merged; }
  function selectKeyById(id){ state.selectedKeyframe=id||null; const k=getSelectedKey(); if(k){ selectModule(k.moduleId); state.selectedKeyframe=id; setAnimTime(num(k.frame.time)); } refreshAnimationPanel(); }
  function selectNearestKeyForModule(mid){ const frames=animCfg().tracks[mid]||[]; if(frames.length) state.selectedKeyframe=keyId(mid,0); }
  function updateKeyProp(input){ const k=getSelectedKey(); if(!k) return; if(!state.history.pending) beginHistory('keyframe edit'); const p=input.dataset.keyProp, f=k.frame; if(['time','x','y'].includes(p)) f[p]=Math.round(num(input.value,0)); else if(p==='scale') f[p]=Math.max(.05,num(input.value,1)); else if(p==='opacity') f[p]=normalizeOpacity(input.value); else f[p]=input.value; mergeDuplicateKeys(k.moduleId); saveConfig(); setAnimTime(state.anim.time); refreshAnimationPanel(false); commitHistory(`keyframe ${p}`); }
  function addKeyframe(){ const id=selectedId(); if(!id) return; withHistory('add keyframe',()=>{ const cfg=layoutCfg(id); const track=animCfg().tracks[id] ||= []; const t=Math.round(state.anim.time/state.timelineSnapMs)*state.timelineSnapMs; const existing=track.find(f=>num(f.time)===t); const data={ time:t, x:num(cfg.x), y:num(cfg.y), scale:num(cfg.scale,1), opacity:normalizeOpacity(cfg.opacity), easing:'easeInOutCubic', width:cfg.width, height:cfg.height, fontSize:cfg.fontSize, gap:cfg.gap }; if(existing) Object.assign(existing,data); else track.push(data); track.sort((a,b)=>num(a.time)-num(b.time)); const idx=track.findIndex(f=>f.time===t); state.selectedKeyframe=keyId(id,idx); }); refreshAnimationPanel(); }
  function deleteKeyframe(){ const k=getSelectedKey(); if(!k) return; withHistory('delete keyframe',()=>{ animCfg().tracks[k.moduleId].splice(k.index,1); state.selectedKeyframe=null; }); refreshAnimationPanel(); }
  function duplicateKeyframe(){ const k=getSelectedKey(); if(!k) return; withHistory('duplicate keyframe',()=>{ const f={...k.frame,time:clamp(num(k.frame.time)+state.timelineSnapMs,0,state.anim.duration)}; animCfg().tracks[k.moduleId].push(f); animCfg().tracks[k.moduleId].sort((a,b)=>num(a.time)-num(b.time)); state.selectedKeyframe=keyId(k.moduleId,animCfg().tracks[k.moduleId].indexOf(f)); }); refreshAnimationPanel(); }
  function prevKeyframe(){ const all=allKeys().filter(k=>k.time<state.anim.time).sort((a,b)=>b.time-a.time)[0]; if(all) selectKeyById(all.id); }
  function nextKeyframe(){ const all=allKeys().filter(k=>k.time>state.anim.time).sort((a,b)=>a.time-b.time)[0]; if(all) selectKeyById(all.id); }
  function allKeys(){ const arr=[]; Object.entries(animCfg().tracks||{}).forEach(([mid,frames])=>(frames||[]).forEach((f,i)=>arr.push({id:keyId(mid,i),mid,i,time:num(f.time)}))); return arr; }

  function setAnimTime(t){ state.anim.time=clamp(num(t),0,animCfg().duration||3200); state.anim.preview=true; document.body.classList.add('infoEditorAnimationPreview'); applyAnimationPreview(); refreshAnimationPanel(false); }
  function playAnim(){ pauseAnim(); state.anim.preview=true; state.anim.playing=true; state.anim.lastTs=performance.now(); document.body.classList.add('infoEditorAnimationPreview'); state.anim.raf=requestAnimationFrame(animTick); }
  function pauseAnim(){ state.anim.playing=false; cancelAnimationFrame(state.anim.raf); }
  function stopAnim(clear=false){ pauseAnim(); state.anim.preview=false; if(clear){ document.body.classList.remove('infoEditorAnimationPreview'); clearAnimVars(); } }
  function animTick(ts){ if(!state.anim.playing) return; const dt=ts-(state.anim.lastTs||ts); state.anim.lastTs=ts; state.anim.time+=dt; if(state.anim.time>=state.anim.duration){ state.anim.time=state.anim.duration; state.anim.playing=false; } applyAnimationPreview(); refreshAnimationPanel(false); if(state.anim.playing) state.anim.raf=requestAnimationFrame(animTick); }
  function ease(t,e){ if(!e||e==='linear'||String(e).includes('cubic-bezier')) return t; if(e==='easeOutCubic') return 1-Math.pow(1-t,3); if(e==='easeInOutCubic') return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2; if(e==='easeOutBack'){ const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); } return t; }
  function interpolate(frames,t){
    frames=(frames||[]).slice().sort((a,b)=>num(a.time)-num(b.time)); if(!frames.length) return null; if(t<=num(frames[0].time)) return frames[0]; if(t>=num(frames[frames.length-1].time)) return frames[frames.length-1];
    let a=frames[0],b=frames[frames.length-1]; for(let i=1;i<frames.length;i++){ if(num(frames[i].time)>=t){ a=frames[i-1]; b=frames[i]; break; } }
    const span=Math.max(1,num(b.time)-num(a.time)), p=ease(clamp((t-num(a.time))/span,0,1),b.easing||a.easing||'linear');
    const out={}; ['x','y','scale','opacity'].forEach(k=>out[k]=num(a[k],k==='scale'?1:k==='opacity'?255:0)+(num(b[k],k==='scale'?1:k==='opacity'?255:0)-num(a[k],k==='scale'?1:k==='opacity'?255:0))*p);
    ['width','height','fontSize','gap'].forEach(k=>{ out[k]=b[k]??a[k]??''; }); return out;
  }
  function applyAnimationPreview(){
    if(!state.enabled || !state.anim.preview) return;
    Object.entries(animCfg().tracks||{}).forEach(([id,frames])=>{ const el=state.modules.get(id); if(!el) return; const v=interpolate(frames,state.anim.time); if(!v) return; el.style.setProperty('--info-editor-anim-x',`${Math.round(num(v.x))}px`); el.style.setProperty('--info-editor-anim-y',`${Math.round(num(v.y))}px`); el.style.setProperty('--info-editor-anim-scale',String(Math.max(.05,num(v.scale,1)))); el.style.setProperty('--info-editor-anim-opacity',String(clamp(normalizeOpacity(v.opacity)/255,0,1))); });
    scheduleUi();
  }
  function clearAnimVars(){ state.modules.forEach(el=>['--info-editor-anim-x','--info-editor-anim-y','--info-editor-anim-scale','--info-editor-anim-opacity'].forEach(p=>el.style.removeProperty(p))); }

  function copyLayout(){ const id=selectedId(); if(!id) return; state.clipboard.layout=clone(layoutCfg(id)); flash('Layout module gekopieerd'); }
  function pasteLayout(){ const id=selectedId(); if(!id||!state.clipboard.layout) return flash('Geen layout gekopieerd'); withHistory('paste layout',()=>{ bucket().layout[id]=normalizeLayout(state.clipboard.layout); applyLayout(id); }); refreshPanel(); }
  function copyStateLayout(){ state.clipboard.stateLayout=clone(bucket().layout); flash('State layout gekopieerd'); }
  function pasteStateLayout(){ if(!state.clipboard.stateLayout) return flash('Geen state layout gekopieerd'); withHistory('paste state layout',()=>{ bucket().layout=clone(state.clipboard.stateLayout); applyAllLayouts(); }); refreshPanel(); }
  function copyAnimation(){ const id=selectedId(); if(!id) return; state.clipboard.animation=clone(animCfg().tracks[id]||[]); flash('Animatie module gekopieerd'); }
  function pasteAnimation(){ const id=selectedId(); if(!id||!state.clipboard.animation) return flash('Geen animatie gekopieerd'); withHistory('paste animation',()=>{ animCfg().tracks[id]=clone(state.clipboard.animation); }); refreshAnimationPanel(); }
  function copyStateAnimation(){ state.clipboard.stateAnimation=clone(animCfg()); flash('State animation gekopieerd'); }
  function pasteStateAnimation(){ if(!state.clipboard.stateAnimation) return flash('Geen state animation gekopieerd'); withHistory('paste state animation',()=>{ bucket().animation=clone(state.clipboard.stateAnimation); }); refreshAnimationPanel(); }
  function resetAnimation(){ const id=selectedId(); if(!id) return; withHistory('reset animation',()=>{ delete animCfg().tracks[id]; clearAnimVars(); }); refreshAnimationPanel(); }

  function exportConfig(){ saveConfig(); return { infoEditorVersion:INFO_EDITOR_VERSION, screen:'info', createdAt:state.config.createdAt||nowIso(), exportedAt:nowIso(), states:state.config.states, editorMeta:{ snapEnabled:state.snap, snapThreshold:state.snapThreshold, timelineSnapMs:state.timelineSnapMs, dockPosition:state.dockPosition } }; }
  async function copyJson(){ const json=JSON.stringify(exportConfig(),null,2); try{ await navigator.clipboard.writeText(json); flash('Volledige JSON gekopieerd'); }catch(e){ window.prompt('Kopieer JSON',json); } }
  function downloadJson(){ const blob=new Blob([JSON.stringify(exportConfig(),null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`InfoEditor-full-v5-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function importJson(mode){
    const txt=panel.querySelector('[data-field="importText"]').value.trim(); if(!txt) return flash('Plak eerst JSON');
    let parsed; try{ parsed=normalizeConfig(migrateLegacyOpacity(JSON.parse(txt))); }catch(e){ alert('Ongeldige InfoEditor JSON: '+e.message); return; }
    withHistory('import json',()=>{
      if(mode==='replaceAll') state.config=parsed;
      else if(mode==='replaceState'){
        const sid=activeStateId();
        const src=parsed.states?.[sid] || Object.values(parsed.states||{})[0];
        if(src) state.config.states[sid]=normalizeStateBucket(src,sid);
      } else state.config.states={...state.config.states,...parsed.states};
      state.config.editorMeta={...state.config.editorMeta,...parsed.editorMeta}; state.snap=state.config.editorMeta.snapEnabled!==false; state.snapThreshold=num(state.config.editorMeta.snapThreshold,DEFAULT_SNAP); state.timelineSnapMs=num(state.config.editorMeta.timelineSnapMs,DEFAULT_TIMELINE_SNAP); state.dockPosition=state.config.editorMeta.dockPosition||state.dockPosition||'right';
    }); applyAllLayouts(); refreshPanel(); flash(mode==='replaceAll'?'JSON vervangen':mode==='replaceState'?'Huidige state vervangen':'JSON gemerged');
  }

  function applyDock(){
    if(!panel) return;
    const pos = ['right','left','top','bottom'].includes(state.dockPosition) ? state.dockPosition : 'right';
    panel.classList.remove('dock-right','dock-left','dock-top','dock-bottom');
    panel.classList.add('dock-'+pos);
  }
  function cycleDock(){
    const order=['right','left','top','bottom'];
    const i=order.indexOf(state.dockPosition);
    state.dockPosition=order[(i+1+order.length)%order.length];
    state.config.editorMeta ||= {};
    state.config.editorMeta.dockPosition=state.dockPosition;
    saveConfig(); applyDock(); refreshPanel(); flash('Dock: '+state.dockPosition);
  }
  function hideModule(){
    const id=selectedId(); if(!id) return;
    withHistory('hide module',()=>{ layoutCfg(id).hidden=true; applyLayout(id); });
    refreshPanel();
  }
  function restoreModule(){
    const id=selectedId(); if(!id) return;
    withHistory('restore module',()=>{ layoutCfg(id).hidden=false; applyLayout(id); });
    refreshPanel();
  }

  function scheduleUi(){ cancelAnimationFrame(state.uiRaf); state.uiRaf=requestAnimationFrame(updateSelectionBox); }
  function updateSelectionBox(){
    if(!selectionBox || !state.enabled || !selectedId()){ selectionBox?.classList.remove('visible'); return; }
    const el=state.modules.get(selectedId()); if(!el){ selectionBox.classList.remove('visible'); return; }
    const r=el.getBoundingClientRect(); if(r.width<=0||r.height<=0){ selectionBox.classList.remove('visible'); return; }
    selectionBox.style.left=`${r.left}px`; selectionBox.style.top=`${r.top}px`; selectionBox.style.width=`${r.width}px`; selectionBox.style.height=`${r.height}px`; selectionBox.classList.add('visible'); selectionBox.querySelector('.infoEditorSelectionLabel').textContent=`${selectedId()} · ${Math.round(r.width)}×${Math.round(r.height)}`; updateReadout();
  }
  function flash(text){ const n=document.createElement('div'); n.className='infoEditorToast InfoEditor'; n.textContent=text; document.body.appendChild(n); setTimeout(()=>n.remove(),1200); }

  function unlockListener(){ const params=new URLSearchParams(location.search); if(params.has('infoeditor')||params.has('debug')) return; let presses=[]; document.addEventListener('keydown',ev=>{ if(String(ev.key).toLowerCase()!=='d') return; const now=Date.now(); presses=presses.filter(t=>now-t<1600); presses.push(now); if(presses.length>=5){ setDebugVisible(true); flash('InfoEditor zichtbaar'); presses=[]; } }); }
  function init(){
    injectCss(); makeDebugButton(); unlockListener(); makeOverlay();
    state.snap=state.config.editorMeta?.snapEnabled!==false; state.snapThreshold=num(state.config.editorMeta?.snapThreshold,DEFAULT_SNAP); state.timelineSnapMs=num(state.config.editorMeta?.timelineSnapMs,DEFAULT_TIMELINE_SNAP); state.dockPosition=state.config.editorMeta?.dockPosition||'right'; applyDock();
    const hero=idEl('hero')||document.body; mutationObserver=new MutationObserver(()=>{ if(state.enabled) discover(); }); mutationObserver.observe(hero,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-result-key']});
    discover(); window.addEventListener('resize',()=>{ discover(); scheduleUi(); });
    window.InfoEditor={ enable:()=>setEnabled(true), disable:()=>setEnabled(false), refresh:discover, getConfig:()=>clone(exportConfig()), setTime:setAnimTime, play:playAnim, pause:pauseAnim, switchState };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
