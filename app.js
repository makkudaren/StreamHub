const TMDB_KEY='98ec65682824bd46bc5b926e5b267f43';
const TMDB='https://api.themoviedb.org/3';
const IMG='https://image.tmdb.org/t/p/';
// Shared inline icons (same outline style as the rest of the UI; no emoji/text symbols)
const ICON_STAR='<svg class="icon-star" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const ICON_SHUFFLE='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>';
// Accent color (hex, no #). Changeable in Settings; also passed to players that support theming.
const DEFAULT_ACCENT='e8271a';
const ACCENTS=[
  {hex:'e8271a',name:'StreamHub Red'},
  {hex:'f97316',name:'Sunset Orange'},
  {hex:'eab308',name:'Golden'},
  {hex:'22c55e',name:'Emerald'},
  {hex:'14b8a6',name:'Teal'},
  {hex:'3b82f6',name:'Ocean Blue'},
  {hex:'8b5cf6',name:'Violet'},
  {hex:'ec4899',name:'Pink'},
];
let COLOR=DEFAULT_ACCENT;

function hexToRgb(hex){const n=parseInt(hex,16);return[(n>>16)&255,(n>>8)&255,n&255]}
function mixWhite([r,g,b],t){return '#'+[r,g,b].map(c=>Math.round(c+(255-c)*t).toString(16).padStart(2,'0')).join('')}

// Recolors the whole app: every accent in style.css reads these variables.
function applyAccent(hex){
  hex=String(hex||'').replace('#','').toLowerCase();
  if(!/^[0-9a-f]{6}$/.test(hex)) hex=DEFAULT_ACCENT;
  COLOR=hex;
  const rgb=hexToRgb(hex),root=document.documentElement.style;
  root.setProperty('--accent','#'+hex);
  root.setProperty('--accent-rgb',rgb.join(','));
  root.setProperty('--accent2',mixWhite(rgb,0.3));
  root.setProperty('--accent3',mixWhite(rgb,0.15));
  root.setProperty('--orb1','#'+hex);
}

function setAccent(hex){
  applyAccent(hex);
  try{localStorage.setItem('sv_accent',JSON.stringify(COLOR))}catch{}
  renderAccentPicker();
}

function renderAccentPicker(){
  const wrap=document.getElementById('accentSwatches');
  if(!wrap) return;
  const preset=ACCENTS.find(a=>a.hex===COLOR);
  wrap.innerHTML=ACCENTS.map(a=>`
    <button class="accent-swatch${a.hex===COLOR?' active':''}" style="--sw:#${a.hex}" role="radio" aria-checked="${a.hex===COLOR}" title="${a.name}" aria-label="${a.name}" onclick="setAccent('${a.hex}')"></button>`).join('')+`
    <label class="accent-swatch accent-swatch-custom${preset?'':' active'}" style="--sw:#${COLOR}" title="Custom color">
      <input type="color" value="#${COLOR}" aria-label="Custom accent color" oninput="applyAccent(this.value)" onchange="setAccent(this.value)">
    </label>`;
  const name=document.getElementById('accentName');
  if(name) name.textContent=preset?preset.name:`Custom #${COLOR.toUpperCase()}`;
}

// Apply the saved accent immediately so the page doesn't flash the default red.
try{applyAccent(JSON.parse(localStorage.getItem('sv_accent')||'null')||DEFAULT_ACCENT)}catch{applyAccent(DEFAULT_ACCENT)}

let heroItems=[],currentHeroIdx=0,heroItem=null,heroTimer=null,searchTimer=null;
let currentPlayerSeason=1,currentPlayerEpisode=1,currentMediaMeta=null,currentTrailerKey=null;
let currentView='homeContent';
// Streaming servers. Add new ones here — the settings list and the player dropdown are built from this.
// The first entry is the default.
const SERVERS = [
  // Disabled for now — uncomment to bring back.
  // { id:'vidking',   name:'VidKing',   host:'vidking.net',
  //   movie: id => `https://www.vidking.net/embed/movie/${id}?color=${COLOR}&autoPlay=true`,
  //   tv: (id,s,e) => `https://www.vidking.net/embed/tv/${id}/${s}/${e}?color=${COLOR}&autoPlay=true&nextEpisode=true&episodeSelector=true` },
  // { id:'vidsrc',    name:'VidSrc',    host:'vidsrcme.ru',
  //   movie: id => `https://vidsrcme.ru/embed/movie/${id}`,
  //   tv: (id,s,e) => `https://vidsrcme.ru/embed/tv/${id}/${s}/${e}` },
  // VidLink forces mute whenever it autoplays (autoplay=true or omitted), so autoplay=false keeps audio on.
  // `label` is the public name shown everywhere (player dropdown, toasts). The real provider
  // `name`/`host` only appear in the Settings server list.
  { id:'cinezo',    label:'Netherite', name:'Cinezo',    host:'cinezo.live', recommended:true,
    movie: id => `https://player.cinezo.live/embed/movie/${id}`,
    tv: (id,s,e) => `https://player.cinezo.live/embed/tv/${id}/${s}/${e}` },
  { id:'vidlink',   label:'Diamond',   name:'VidLink',   host:'vidlink.pro',
    movie: id => `https://vidlink.pro/movie/${id}?primaryColor=${COLOR}&autoplay=false`,
    tv: (id,s,e) => `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=${COLOR}&autoplay=false&nextbutton=true` },
  // scale < 1 shrinks the server's own player UI (iframe is rendered larger, then scaled down to fit).
  // Tune these if a server's controls look too big or too small.
  { id:'vidzee',    label:'Gold',      name:'VidZee',    host:'vidzee.wtf', scale:0.75,
    movie: id => `https://player.vidzee.wtf/embed/movie/${id}`,
    tv: (id,s,e) => `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}` },
  { id:'vidup',     label:'Iron',      name:'VidUp',     host:'vidup.to', scale:0.8,
    movie: id => `https://vidup.to/movie/${id}?autoPlay=true`,
    tv: (id,s,e) => `https://vidup.to/tv/${id}/${s}/${e}?autoPlay=true&nextEpisode=true&episodeSelector=true` },
  { id:'moviesapi', label:'Copper',    name:'MoviesAPI', host:'moviesapi.to',
    movie: id => `https://moviesapi.to/movie/${id}`,
    tv: (id,s,e) => `https://moviesapi.to/tv/${id}-${s}-${e}` },
  // Anime only. Takes an AniList ID (not TMDB), so StreamHub looks it up first — see "AniList lookup".
  // On non-anime titles the player falls back to the first regular server.
  { id:'animeembed', label:'Emerald', name:'AnimeEmbed', host:'animeembed.com', animeOnly:true,
    anime: (anilistId,ep) => `https://animeembed.com/embed/ani/${anilistId}/${ep}?track=${getAnimeTrack()}&autoPlay=1&muted=0&autoSkip=1&autoNext=0&start=0&accent=${COLOR}` },
];
const getServer = id => SERVERS.find(s => s.id === id) || SERVERS[0];
const firstRegularServer = () => SERVERS.find(s => !s.animeOnly);

// Sub/Dub preference for anime-only servers
function getAnimeTrack(){ return getSaved('sv_anime_track','sub')==='dub'?'dub':'sub'; }

// ---- AniList lookup (TMDB → AniList ID + episode) ----
// AnimeEmbed needs AniList IDs. We search AniList by the title + year, then map TMDB's
// "season N, episode E" onto AniList, where every season (or split cour) is its own entry
// linked by SEQUEL relations: count the episode's absolute position using TMDB's per-season
// episode counts, then walk the sequel chain until it lands inside an entry.
const ANILIST_URL='https://graphql.anilist.co';
const AL_FIELDS='id type format episodes startDate{year} title{romaji english native} synonyms';
const anilistNodeCache={}; // id -> {episodes, sequelId|null|undefined}

async function anilistQuery(query,variables){
  const r=await fetch(ANILIST_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({query,variables}),
  });
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j||j.errors) throw new Error('AniList request failed');
  return j.data;
}

const normTitle=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,'');

async function anilistFindBase(names,year,isMovie){
  const formats=isMovie?['MOVIE']:['TV','TV_SHORT','ONA','OVA'];
  const q=`query($s:String,$f:[MediaFormat]){Page(perPage:10){media(search:$s,type:ANIME,format_in:$f,sort:SEARCH_MATCH){${AL_FIELDS}}}}`;
  const wanted=new Set(names.map(normTitle).filter(Boolean));
  let best=null,bestScore=-Infinity;
  for(const name of names){
    if(!name) continue;
    const list=(await anilistQuery(q,{s:name,f:formats})).Page.media||[];
    list.forEach((m,i)=>{
      const titles=[m.title.english,m.title.romaji,m.title.native,...(m.synonyms||[])].map(normTitle);
      const y=m.startDate?.year;
      let score=-i*0.5;                                   // AniList's own ranking
      if(titles.some(t=>wanted.has(t))) score+=4;         // exact title match
      if(!isMovie&&m.format==='TV') score+=1;             // prefer the main series over spin-off ONAs
      if(year&&y){ const dy=Math.abs(y-year); score+=dy===0?3:dy===1?1:-3; }
      if(score>bestScore){ bestScore=score; best=m; }
    });
    if(bestScore>=6) break; // exact title + year: no need to try the other name
  }
  if(!best||bestScore<0) return null;
  anilistNodeCache[best.id]={episodes:best.episodes};
  return best;
}

async function anilistNext(id){
  const c=anilistNodeCache[id]||(anilistNodeCache[id]={});
  if(c.sequelId!==undefined) return c.sequelId;
  const q=`query($id:Int){Media(id:$id){episodes relations{edges{relationType node{${AL_FIELDS}}}}}}`;
  const m=(await anilistQuery(q,{id})).Media;
  c.episodes=m.episodes;
  const e=(m.relations?.edges||[]).find(e=>e.relationType==='SEQUEL'&&e.node.type==='ANIME'&&['TV','TV_SHORT','ONA'].includes(e.node.format));
  c.sequelId=e?e.node.id:null;
  if(e) anilistNodeCache[e.node.id]={...(anilistNodeCache[e.node.id]||{}),episodes:e.node.episodes};
  return c.sequelId;
}

// Returns {id, ep} on AniList for a TMDB title, or null if no confident match.
async function resolveAniList(info,season,ep){
  const baseKey=`sv_anilist_${info.type}_${info.tmdbId}`;
  let baseId=getSaved(baseKey,null);
  if(!baseId){
    const base=await anilistFindBase(info.names,info.year,info.type==='movie');
    if(!base) return null;
    baseId=base.id;
    setSaved(baseKey,baseId);
  }
  if(info.type==='movie') return {id:baseId,ep:1};
  // Absolute episode number across TMDB's regular seasons
  let abs=ep;
  (info.seasons||[]).forEach(s=>{ if(s.season_number>0&&s.season_number<season) abs+=s.episode_count||0; });
  // Walk the sequel chain until the episode fits inside an entry
  let id=baseId;
  for(let hops=0;hops<30;hops++){
    if(!anilistNodeCache[id]||anilistNodeCache[id].episodes===undefined) await anilistNext(id);
    const count=anilistNodeCache[id].episodes;
    if(!count||abs<=count) return {id,ep:abs};          // unknown count = still airing: assume it's here
    const next=await anilistNext(id);
    if(!next) return {id,ep:Math.min(abs,count)};       // ran out of sequels: best effort
    abs-=count;id=next;
  }
  return null;
}

// Info about the anime currently open on the detail page (null if it isn't anime)
let currentAnimeInfo=null;
function isAnimeTitle(d){
  return (d.genres||[]).some(g=>g.id===16)&&(d.original_language==='ja'||(d.origin_country||[]).includes('JP'));
}

// The server that will actually play this title:
//  - anime → the anime server automatically, unless you switched this show to another
//    server from the player (remembered per show in sv_animeserver_<tmdbId>)
//  - everything else → your chosen default server
const animeServer = () => SERVERS.find(s => s.animeOnly);
function isAnimeId(tmdbId){
  return !!(currentAnimeInfo&&tmdbId!=null&&String(currentAnimeInfo.tmdbId)===String(tmdbId));
}
function playableServer(tmdbId){
  if(isAnimeId(tmdbId)&&animeServer()){
    const override=getSaved('sv_animeserver_'+tmdbId,null);
    const o=override&&SERVERS.find(s=>s.id===override&&!s.animeOnly);
    return o||animeServer();
  }
  const s=getServer(activePlayer);
  return s.animeOnly?firstRegularServer():s;
}

// Default server for movies/shows. Anime-only servers are picked automatically for anime,
// so they can't be the default (an older saved choice falls back to the first regular server).
let activePlayer = (s => s.animeOnly ? firstRegularServer().id : s.id)(getServer(getSaved('sv_player', SERVERS[0].id)));

function getSaved(k,d=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
function setSaved(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function getRecent(){return getSaved('sv_recent',[])}
function getProgress(id){return getSaved('sv_progress_'+id,0)}
function saveProgress(id,pct){setSaved('sv_progress_'+id,pct)}
function isWatched(id){return getSaved('sv_watched_'+id,false)}
function markWatched(id){setSaved('sv_watched_'+id,true)}

// Per-show resume state: the last episode played, and the season tab last viewed.
function getShowPos(tvId){return getSaved('sv_tvpos_'+tvId,null)}
function setShowPos(tvId,s,e,name){setSaved('sv_tvpos_'+tvId,{s:+s,e:+e,name:name||''})}
function getViewSeason(tvId){return getSaved('sv_tvseason_'+tvId,null)}
function setViewSeason(tvId,s){setSaved('sv_tvseason_'+tvId,+s)}

// Where "Continue" should go: the last episode played, or the next one if that was finished.
// Uses watch progress only — episodes are auto-ticked as soon as they're opened, so the tick
// doesn't mean "finished".
function resolveResume(tvId,seasons){
  const real=(seasons||[]).filter(s=>s.season_number>0&&s.episode_count>0);
  const pos=getShowPos(tvId);
  if(!pos) return {s:real[0]?.season_number||1,e:1,started:false};
  const key=`${tvId}_s${pos.s}e${pos.e}`;
  const finished=getProgress(key)>=90;
  if(!finished) return {s:pos.s,e:pos.e,name:pos.name,started:true};
  const cur=real.find(x=>x.season_number===pos.s);
  if(cur&&pos.e<cur.episode_count) return {s:pos.s,e:pos.e+1,started:true};
  const today=new Date().toISOString().slice(0,10);
  const next=real.find(x=>x.season_number>pos.s&&(!x.air_date||x.air_date<=today));
  if(next) return {s:next.season_number,e:1,started:true};
  return {s:pos.s,e:pos.e,name:pos.name,started:true};
}
function toggleWatched(e,id){
  e.stopPropagation();
  const nowWatched=!isWatched(id);
  setSaved('sv_watched_'+id,nowWatched);
  const btn=e.currentTarget;
  btn.classList.toggle('checked',nowWatched);
  btn.setAttribute('aria-label',nowWatched?'Mark as unwatched':'Mark as watched');
}
function saveRecent(item){
  let l=getRecent();
  const existing = l.find(i => String(i.id) === String(item.id));
  if(existing) item = { ...existing, ...item, poster: item.poster || existing.poster };
  l=l.filter(i=>String(i.id)!==String(item.id));
  l.unshift(item);
  if(l.length>20)l=l.slice(0,20);
  setSaved('sv_recent',l);
}

function getMyList() { return getSaved('sv_mylist', []); }

// ---- Clearing saved data ----
// Everything StreamHub stores lives in localStorage under keys starting with "sv_".
const WATCH_HISTORY_PREFIXES=['sv_recent','sv_progress_','sv_watched_','sv_tvpos_','sv_tvseason_'];

function savedKeys(){
  const keys=[];
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith('sv_')) keys.push(k); } }catch{}
  return keys;
}
function removeSavedKeys(match){
  savedKeys().filter(match).forEach(k=>{ try{localStorage.removeItem(k)}catch{} });
}

// Confirmation modal. Resolves true on Confirm, false on Cancel / Esc / clicking outside.
let confirmResolve=null,confirmReturnFocus=null;
function showConfirm({title,message,confirmLabel='Confirm'}){
  const overlay=document.getElementById('confirmOverlay');
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMessage').textContent=message;
  document.getElementById('confirmOk').textContent=confirmLabel;
  if(confirmResolve) confirmResolve(false); // close any modal already open
  confirmReturnFocus=document.activeElement;
  overlay.hidden=false;
  requestAnimationFrame(()=>overlay.classList.add('open'));
  document.getElementById('confirmCancel').focus(); // safe default for a destructive action
  return new Promise(res=>{confirmResolve=res;});
}
function closeConfirm(result){
  const overlay=document.getElementById('confirmOverlay');
  if(!confirmResolve) return;
  const res=confirmResolve;confirmResolve=null;
  overlay.classList.remove('open');
  setTimeout(()=>{ if(!confirmResolve) overlay.hidden=true; },200);
  confirmReturnFocus?.focus?.();
  res(result);
}
document.addEventListener('DOMContentLoaded',()=>{
  const overlay=document.getElementById('confirmOverlay');
  if(!overlay) return;
  document.getElementById('confirmOk').addEventListener('click',()=>closeConfirm(true));
  document.getElementById('confirmCancel').addEventListener('click',()=>closeConfirm(false));
  overlay.addEventListener('click',e=>{ if(e.target===overlay) closeConfirm(false); });
  document.addEventListener('keydown',e=>{
    if(!confirmResolve) return;
    if(e.key==='Escape'){ e.preventDefault(); closeConfirm(false); }
    if(e.key==='Tab'){ // keep focus inside the modal
      const a=document.getElementById('confirmCancel'),b=document.getElementById('confirmOk');
      if(e.shiftKey&&document.activeElement===a){ e.preventDefault(); b.focus(); }
      else if(!e.shiftKey&&document.activeElement===b){ e.preventDefault(); a.focus(); }
    }
  });
});

// Detail page: clear progress, ticks, resume position and Continue Watching entry for this title.
// (My List is kept — that's a separate, deliberate choice.)
async function clearTitleData(){
  if(!currentMediaMeta) return;
  const {id,type,title}=currentMediaMeta;
  const ok=await showConfirm({
    title:`Clear progress for "${title}"?`,
    message:type==='tv'
      ?'This removes watch progress, watched ticks and your resume spot for every episode, and takes it off Continue Watching. My List is not affected.'
      :'This removes your watch progress and takes it off Continue Watching. My List is not affected.',
    confirmLabel:'Clear progress',
  });
  if(!ok) return;
  const own=p=>k=>k===p+id||k.startsWith(`${p}${id}_s`);
  removeSavedKeys(k=>own('sv_progress_')(k)||own('sv_watched_')(k)||k===`sv_tvpos_${id}`||k===`sv_tvseason_${id}`);
  setSaved('sv_recent',getRecent().filter(i=>!(String(i.id)===String(id)&&(!i.type||i.type===type))));
  renderRecent();
  // Refresh the page to match: Play button label, season tab, episode ticks/progress bars
  if(type==='tv') refreshTvResume();
  else { const pb=document.getElementById('detailPlayBtn'); if(pb) pb.innerHTML=playBtnInner(id,type,title,0); }
  showToast(`Cleared saved progress for "${title}"`);
}

// Settings: clear watch history only (Continue Watching, progress, ticks, resume spots).
async function clearWatchHistory(){
  const ok=await showConfirm({
    title:'Clear watch history?',
    message:'This removes Continue Watching, all watch progress, watched ticks and resume spots. My List and your settings are kept.',
    confirmLabel:'Clear history',
  });
  if(!ok) return;
  removeSavedKeys(k=>WATCH_HISTORY_PREFIXES.some(p=>k===p||k.startsWith(p)));
  renderRecent();
  showToast('Watch history cleared');
}

// Settings: wipe everything StreamHub has saved, then reload to a fresh state.
async function clearAllData(){
  const ok=await showConfirm({
    title:'Erase all data?',
    message:'This erases everything StreamHub saved on this device: watch history, My List, server choice and appearance settings. This can\'t be undone.',
    confirmLabel:'Erase everything',
  });
  if(!ok) return;
  removeSavedKeys(()=>true);
  showToast('All saved data cleared');
  setTimeout(()=>location.reload(),700);
}

function toggleMyList() {
  if (!currentMediaMeta) return;
  let list = getMyList();
  const exists = list.find(i => String(i.id) === String(currentMediaMeta.id));
  const btn = document.getElementById('detailListBtn');
  
  if (exists) {
    list = list.filter(i => String(i.id) !== String(currentMediaMeta.id));
    showToast(`"${currentMediaMeta.title}" removed from your list`);
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  } else {
    list.unshift(currentMediaMeta);
    showToast(`"${currentMediaMeta.title}" saved to your list`);
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  }
  
  setSaved('sv_mylist', list);
  renderMyListRow();
}

function removeFromMyList(e, id) {
  e.stopPropagation();
  let list = getMyList();
  list = list.filter(item => String(item.id) !== String(id));
  setSaved('sv_mylist', list);
  renderMyListRow();
  
  if (currentView === 'searchResults' && document.getElementById('searchTitle').textContent === 'My List') {
    showMyList();
  }  
  if (currentView === 'detailPage' && currentMediaMeta && String(currentMediaMeta.id) === String(id)) {
    const btn = document.getElementById('detailListBtn');
    if (btn) btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  }
  
  showToast("Removed from My List");
}
function applyLowPower(on){
  document.documentElement.classList.toggle('low-power', on);
}

function toggleLowPower(){
  const on = document.getElementById('lowPowerToggle').checked;
  setSaved('sv_low_power', on);
  applyLowPower(on);
  const row = document.getElementById('lowPowerRow');
  if(row) row.setAttribute('aria-checked', on);
  showToast(on ? 'Low-power mode enabled' : 'Low-power mode disabled');
}

(function detectTV(){
  const manual = getSaved('sv_low_power', null);
  if (manual !== null) { applyLowPower(manual); return; }
  const ua = navigator.userAgent || '';
  const tvPattern = /SmartTV|SMART-TV|Tizen|WebOS|Web0S|NetCast|HbbTV|BRAVIA|GoogleTV|CrKey|AFTB|AFTT|AFTS|AFTA|AFTN|Fire TV|VIDAA|ADT-G|POV_TV|HAIER|LG Browser|inettv/i;
  const isTV = tvPattern.test(ua) || (window.innerWidth >= 1200 && !window.matchMedia('(hover: hover)').matches);
  if (isTV) applyLowPower(true);
})();
let isDark=true;
function toggleTheme(){
  isDark=!isDark;
  document.documentElement.setAttribute('data-theme',isDark?'dark':'light');
  const toggle = document.getElementById('themeToggle');
  if(toggle) toggle.checked = isDark;
  const row = document.getElementById('darkModeRow');
  if(row) row.setAttribute('aria-checked', isDark);
}

function openSettings() {
  switchPage('settingsPage');
  document.getElementById('themeToggle').checked = isDark;
  document.getElementById('darkModeRow').setAttribute('aria-checked', isDark);
  const lowPowerOn = document.documentElement.classList.contains('low-power');
  document.getElementById('lowPowerToggle').checked = lowPowerOn;
  document.getElementById('lowPowerRow').setAttribute('aria-checked', lowPowerOn);
  document.getElementById('blockPopupsToggle').checked = blockPopupsOn();
  document.getElementById('blockPopupsRow').setAttribute('aria-checked', blockPopupsOn());
  setPlayer(activePlayer, false);
  renderAccentPicker();
}

function closeSettingsBtn() {
  handleUrlRouting();
}

function setPlayer(player, save = true) {
  if (getServer(player).animeOnly) return; // used automatically for anime, not a default
  activePlayer = getServer(player).id;
  if (save) setSaved('sv_player', activePlayer);
  renderServerLists();
  if (save) showToast(`Server set to ${getServer(activePlayer).label}`);
}
window.addEventListener('scroll',()=>{
  document.getElementById('mainNav').classList.toggle('scrolled',window.scrollY>20);
});

function switchPage(pageId) {
  // Tear down any media on the page we're leaving so audio doesn't keep playing hidden
  if (pageId !== 'detailPage') stopTrailer();
  if (pageId !== 'playerPage') {
    const frameWrap = document.getElementById('playerFrameWrap');
    if (frameWrap) frameWrap.innerHTML = '';
    if (typeof closeServerMenu === 'function') closeServerMenu();
    // Leaving the player any way (incl. browser Back): drop focus mode, menus, hide timer
    stopPlayerIdle();
    closeEpisodeMenu();
    exitFocusMode();
  }
  currentView = pageId;
  const pages = ['homeContent', 'searchResults', 'randomPage', 'detailPage', 'playerPage', 'settingsPage'];
  pages.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === pageId ? 'block' : 'none';
  });
  
  const nav = document.getElementById('mainNav');
  if (pageId === 'playerPage') {
    nav.style.display = 'none';
    document.body.style.overflow = 'hidden';
  } else {
    nav.style.display = 'flex';
    document.body.style.overflow = '';
  }
  window.scrollTo(0,0);
}

window.addEventListener('popstate', handleUrlRouting);

function handleUrlRouting() {
  const params = new URLSearchParams(window.location.search);
  const movie = params.get('movie');
  const tv = params.get('tv');
  const play = params.get('play');

  if (play === 'true' && currentMediaMeta) {
    const s = params.get('s');
    const e = params.get('e');
    if (currentMediaMeta.type === 'movie') {
      playMovie(currentMediaMeta.id, currentMediaMeta.title, false);
    } else {
      playEpisode(currentMediaMeta.id, s, e, 'Episode', false);
    }
  } else if (movie) {
    openDetail(movie, 'movie', false);
  } else if (tv) {
    openDetail(tv, 'tv', false);
  } else {
    if (document.getElementById('searchInput').value.trim() !== '') {
      switchPage('searchResults');
    } else {
      switchPage('homeContent');
    }
  }
}

function setActiveNav(el){
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}

async function tmdb(path,params={}){
  const url=new URL(TMDB+path);
  url.searchParams.set('api_key',TMDB_KEY);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  const r=await fetch(url);
  if(!r.ok)throw new Error('TMDB error');
  return r.json();
}

function skeletonRow(row, n = window.innerWidth <= 500 ? 4 : 8){
  row.innerHTML=[...Array(n)].map(()=>`
    <div class="skel-card">
      <div class="skeleton skel-poster"></div>
      <div class="skeleton skel-line"></div>
      <div class="skeleton skel-line-short"></div>
    </div>`).join('');
}

function makeCard(item,type){
  const poster=item.poster_path?`${IMG}w342${item.poster_path}`:'';
  const title=item.title||item.name||'Untitled';
  const year=(item.release_date||item.first_air_date||'').slice(0,4);
  const rating=item.vote_average?item.vote_average.toFixed(1):'—';
  const prog=getProgress(item.id);
  const isNew=item.vote_count<100;
  return`<div class="card" onclick="openDetail(${item.id},'${type}',true)" tabindex="0" role="button">
    ${poster?`<img class="card-poster" src="${poster}" alt="${title}" loading="lazy">`:`<div class="card-poster skeleton"></div>`}
    ${isNew?'<div class="card-badge">New</div>':''}
    ${prog>0?`<div class="card-progress"><div class="card-progress-fill" style="width:${prog}%"></div></div>`:''}
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-meta"><span class="card-rating">${ICON_STAR}${rating}</span><span>${year}</span></div>
    </div>
  </div>`;
}

function makeWideCard(item,type){
  const thumb=item.backdrop_path?`${IMG}w500${item.backdrop_path}`:(item.poster_path?`${IMG}w342${item.poster_path}`:'');
  const title=item.title||item.name||'Untitled';
  const prog=getProgress(item.id);
  return`<div class="card card-wide" onclick="openDetail(${item.id},'${type}',true)" tabindex="0" role="button">
    ${thumb?`<img class="card-thumb" src="${thumb}" alt="${title}" loading="lazy">`:`<div class="card-thumb skeleton"></div>`}
    ${prog>0?`<div class="card-progress"><div class="card-progress-fill" style="width:${prog}%"></div></div>`:''}
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-meta">${(item.release_date||item.first_air_date||'').slice(0,4)}</div>
    </div>
  </div>`;
}

function makeRecentCard(item, showRemove = false) {
  const poster = item.poster ? `${IMG}w342${item.poster}` : '';
  const prog = getProgress(item.id);
  const removeBtn = showRemove ? 
    `<button class="remove-recent-btn" onclick="removeFromRecent(event, ${item.id})" title="Remove">
       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
     </button>` : '';

  const fallbackIcon = `<div class="card-poster" style="background:var(--glass-bg);display:flex;align-items:center;justify-content:center;aspect-ratio:2/3;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg></div>`;

  return `<div class="card" onclick="openDetail(${item.id},'${item.type}',true)" tabindex="0" role="button">
    ${removeBtn}
    ${poster ? `<img class="card-poster" src="${poster}" alt="${item.title}" loading="lazy">` : fallbackIcon}
    ${prog > 0 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${prog}%"></div></div>` : ''}
    <div class="card-info">
      <div class="card-title">${item.title || 'Unknown'}</div>
      <div class="card-meta"><span style="text-transform:capitalize">${item.type}</span>${item.year ? ` · ${item.year}` : ''}</div>
    </div>
  </div>`;
}

function makeListCard(item, showRemove = false) {
  const poster = item.poster ? `${IMG}w342${item.poster}` : '';
  const prog = getProgress(item.id);
  const removeBtn = showRemove ? 
    `<button class="remove-recent-btn" onclick="removeFromMyList(event, ${item.id})" title="Remove">
       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
     </button>` : '';

  const fallbackIcon = `<div class="card-poster" style="background:var(--glass-bg);display:flex;align-items:center;justify-content:center;aspect-ratio:2/3;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg></div>`;

  return `<div class="card" onclick="openDetail(${item.id},'${item.type}',true)" tabindex="0" role="button">
    ${removeBtn}
    ${poster ? `<img class="card-poster" src="${poster}" alt="${item.title}" loading="lazy">` : fallbackIcon}
    ${prog > 0 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${prog}%"></div></div>` : ''}
    <div class="card-info">
      <div class="card-title">${item.title || 'Unknown'}</div>
      <div class="card-meta"><span style="text-transform:capitalize">${item.type}</span>${item.year ? ` · ${item.year}` : ''}</div>
    </div>
  </div>`;
}

// ---- Endless rows ----
// Each home row starts with TMDB page 1; when you scroll near its end, the next page is
// fetched and appended (with skeleton cards as a placeholder while it loads).
const ROW_MAX_PAGES=25;            // ~500 titles per row is plenty
const rowFeeds={};                 // rowId -> {path,params,type,wide,page,totalPages,loading,seen,token}

function appendHtml(container,html){
  const tpl=document.createElement('template');
  tpl.innerHTML=html.trim();
  const els=Array.from(tpl.content.children);
  container.append(...els);
  return els;
}

// opts.shuffle: shuffle each loaded page so the row doesn't always open on the same titles
async function fillRow(rowId,path,params={},type='movie',wide=false,opts={}){
  const row=document.getElementById(rowId);if(!row)return;
  const feed=rowFeeds[rowId]={path,params,type,wide,shuffle:!!opts.shuffle,page:0,totalPages:1,loading:false,seen:new Set(),token:Symbol()};
  skeletonRow(row);
  row.scrollLeft=0;
  if(!row.dataset.feedBound){
    row.dataset.feedBound='1';
    row.addEventListener('scroll',()=>maybeLoadMoreRow(rowId),{passive:true});
  }
  try{
    await loadRowPage(rowId,feed,true);
  }catch{
    if(rowFeeds[rowId]===feed) row.innerHTML='<p style="color:var(--text3);padding:20px">Failed to load.</p>';
  }
}

async function loadRowPage(rowId,feed,first=false){
  const row=document.getElementById(rowId);
  if(!row||feed.loading||feed.page>=Math.min(feed.totalPages,ROW_MAX_PAGES)) return;
  feed.loading=true;
  let skels=[];
  if(!first){
    skels=appendHtml(row,[...Array(4)].map(()=>`
      <div class="skel-card${feed.wide?' skel-card-wide':''}" data-skel>
        <div class="skeleton skel-poster"></div>
        <div class="skeleton skel-line"></div>
        <div class="skeleton skel-line-short"></div>
      </div>`).join(''));
  }
  try{
    const d=await tmdb(feed.path,{...feed.params,page:feed.page+1});
    if(rowFeeds[rowId]!==feed) return;          // row was reloaded (e.g. provider changed)
    feed.page++;
    feed.totalPages=d.total_pages||feed.page;
    const items=(d.results||[]).filter(i=>!feed.seen.has(i.id)&&feed.seen.add(i.id));
    if(feed.shuffle) shuffleInPlace(items);
    const html=items.map(i=>feed.wide?makeWideCard(i,feed.type):makeCard(i,feed.type)).join('');
    if(first){ row.innerHTML=html; staggerCards(row); }
    else { skels.forEach(s=>s.remove()); staggerCards(row,appendHtml(row,html)); }
  }catch(err){
    skels.forEach(s=>s.remove());
    feed.failedAt=Date.now();   // pause briefly so a network error doesn't retry in a loop
    if(first) throw err;
  }finally{
    feed.loading=false;
  }
  maybeLoadMoreRow(rowId); // wide screens: keep filling if the row still isn't scrollable
}

function shuffleInPlace(a){
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function maybeLoadMoreRow(rowId){
  const row=document.getElementById(rowId),feed=rowFeeds[rowId];
  if(!row||!feed||feed.loading||!row.clientWidth) return;
  if(feed.failedAt&&Date.now()-feed.failedAt<5000) return;
  const remaining=row.scrollWidth-(row.scrollLeft+row.clientWidth);
  if(remaining<row.clientWidth*0.75) loadRowPage(rowId,feed);
}

function scrollRow(id,dir){
  const row=document.getElementById(id);
  if(row)row.scrollBy({left:dir*(row.clientWidth*0.7),behavior:'smooth'});
}

async function loadHero(){
  try{
    const d=await tmdb('/trending/movie/day');
    heroItems=(d.results||[]).slice(0,6);
    if(!heroItems.length)return;
    renderHeroIndicators();setHero(0);
    resetHeroTimer();
  }catch{}
}

const HERO_IDLE_MS=5000;
function resetHeroTimer(){
  clearTimeout(heroTimer);
  heroTimer=setTimeout(()=>{
    if(heroItems.length){
      setHero((currentHeroIdx+1)%heroItems.length);
    }
    resetHeroTimer();
  },HERO_IDLE_MS);
}

function nextHero(){
  if(!heroItems.length)return;
  setHero((currentHeroIdx+1)%heroItems.length);
  resetHeroTimer();
}

function prevHero(){
  if(!heroItems.length)return;
  setHero((currentHeroIdx-1+heroItems.length)%heroItems.length);
  resetHeroTimer();
}

function renderHeroIndicators(){
  const el=document.getElementById('heroIndicators');
  el.innerHTML=heroItems.map((_,i)=>`<button class="hero-dot-btn${i===0?' active':''}" onclick="setHero(${i});resetHeroTimer()" aria-label="Go to slide ${i+1}"><span class="hero-dot-bar"></span></button>`).join('');
}

function heroMediaObj(){
  if(!heroItem)return null;
  return {id:heroItem.id,type:'movie',title:heroItem.title||heroItem.name||'Untitled',poster:heroItem.poster_path,rating:heroItem.vote_average,year:(heroItem.release_date||'').slice(0,4)};
}

function toggleHeroBookmark(){
  if(!heroItem)return;
  let list=getMyList();
  const exists=list.find(i=>String(i.id)===String(heroItem.id));
  if(exists){
    list=list.filter(i=>String(i.id)!==String(heroItem.id));
    showToast(`"${heroItem.title||heroItem.name}" removed from your list`);
  }else{
    list.unshift(heroMediaObj());
    showToast(`"${heroItem.title||heroItem.name}" saved to your list`);
  }
  setSaved('sv_mylist',list);
  renderMyListRow();
  updateHeroBookmarkBtn();
}

function updateHeroBookmarkBtn(){
  const btn=document.getElementById('heroBookmarkBtn');
  if(!btn||!heroItem)return;
  const inList=getMyList().some(i=>String(i.id)===String(heroItem.id));
  btn.innerHTML=inList
    ?`<svg width="15" height="15" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`
    :`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
}

async function setHero(idx){
  currentHeroIdx=idx;heroItem=heroItems[idx];
  document.querySelectorAll('.hero-dot-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));
  updateHeroBookmarkBtn();
  const bg=document.getElementById('heroBg');
  if(heroItem.backdrop_path){
    const heroSize = window.innerWidth <= 860 ? 'w780' : 'original';
    bg.style.backgroundImage=`url(${IMG}${heroSize}${heroItem.backdrop_path})`;
    setTimeout(()=>bg.classList.add('loaded'),50);
  }
  document.getElementById('heroTitle').textContent=heroItem.title||heroItem.name||'';
  document.getElementById('heroRating').textContent=(heroItem.vote_average||0).toFixed(1);
  document.getElementById('heroYear').textContent=(heroItem.release_date||'').slice(0,4);
  document.getElementById('heroDesc').textContent=heroItem.overview||'';
  try{
    const det=await tmdb(`/movie/${heroItem.id}`);
    document.getElementById('heroGenre').textContent=(det.genres||[]).slice(0,2).map(g=>g.name).join(' · ');
  }catch{}
}

function playFromHero(){if(heroItem) playMovie(heroItem.id, heroItem.title, heroItem.poster_path, true);}
function infoFromHero(){if(heroItem)openDetail(heroItem.id,'movie',true)}

// ---- Detail page tags ----
const TYPE_ICONS={
  movie:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',
  tv:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>',
  anime:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

function formatVotes(n){
  if(n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
  if(n>=1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'k';
  return String(n);
}

// Tags are laid out in groups, separated by dividers: type | rating | facts | genres
function buildDetailTags(d,type,{year,runtime}){
  const groups=[];
  let tags=[];
  const endGroup=()=>{ if(tags.length) groups.push(`<div class="tag-group">${tags.join('')}</div>`); tags=[]; };
  // Content type — anime = animated + Japanese origin
  const isAnime=isAnimeTitle(d);
  const kind=isAnime?'anime':type==='movie'?'movie':'tv';
  const kindLabel={movie:'Movie',tv:'TV Series',anime:'Anime'}[kind];
  tags.push(`<span class="tag tag-type tag-type-${kind}">${TYPE_ICONS[kind]}${kindLabel}</span>`);
  endGroup();

  // Rating
  const score=d.vote_average||0,votes=d.vote_count||0;
  if(votes>0){
    tags.push(`<span class="tag tag-rating" title="${votes.toLocaleString()} ratings on TMDB">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <b>${score.toFixed(1)}</b><small>/10 · ${formatVotes(votes)}</small></span>`);
  } else {
    tags.push(`<span class="tag tag-plain">Not rated yet</span>`);
  }
  endGroup();

  // Facts
  if(year) tags.push(`<span class="tag tag-plain">${year}</span>`);
  if(type==='tv'&&d.number_of_seasons) tags.push(`<span class="tag tag-plain">${d.number_of_seasons} Season${d.number_of_seasons>1?'s':''}</span>`);
  if(runtime) tags.push(`<span class="tag tag-plain">${runtime}</span>`);
  if(type==='tv'&&d.status){
    const live=d.status==='Returning Series'||d.status==='In Production';
    tags.push(`<span class="tag tag-plain tag-status${live?' is-live':''}">${live?'Ongoing':d.status}</span>`);
  }

  endGroup();

  // Genres
  (d.genres||[]).slice(0,4).forEach(g=>tags.push(`<span class="tag tag-genre">${g.name}</span>`));
  endGroup();
  return groups.join('<span class="tag-sep" aria-hidden="true"></span>');
}

// Where the detail page was opened from, so Back returns there at the same scroll position.
let detailCameFrom=null;

async function openDetail(id, type, pushState = true){
  if(currentView==='homeContent'||currentView==='searchResults'||currentView==='randomPage'){
    detailCameFrom={view:currentView,scrollY:window.scrollY};
  }
  switchPage('detailPage');
  
  if (pushState) {
    const newUrl = `${window.location.pathname}?${type}=${id}`;
    window.history.pushState({page: 'detail', id, type}, '', newUrl);
  }

  document.getElementById('detailTitle').textContent='Loading...';
  document.getElementById('detailMeta').innerHTML='';
  document.getElementById('detailActions').innerHTML='';
  document.getElementById('detailOverview').textContent='';
  document.getElementById('detailCast').innerHTML='';
  document.getElementById('detailEpisodes').innerHTML='';
  
  const backdropImg = document.getElementById('detailBackdrop');
  const imageLoader = document.getElementById('detailImageLoader');
  backdropImg.classList.remove('loaded');
  imageLoader.classList.remove('hidden');
  
  backdropImg.onload = () => {
    if(backdropImg.src.startsWith('data:image/gif')) return;
    backdropImg.classList.add('loaded');
    imageLoader.classList.add('hidden');
  };
  
  backdropImg.onerror = () => {
    imageLoader.classList.add('hidden');
  };
  
  backdropImg.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  try{
    const d=await tmdb(`/${type}/${id}`,{append_to_response:'credits,videos'});
    const title=d.title||d.name||'';
    const year=(d.release_date||d.first_air_date||'').slice(0,4);
    const runtime=d.runtime?`${d.runtime} min`:(d.episode_run_time?.[0]?`~${d.episode_run_time[0]} min/ep`:'');
    
    if(d.backdrop_path) {
        backdropImg.src=`${IMG}w1280${d.backdrop_path}`;
    } else if(d.poster_path) {
        backdropImg.src=`${IMG}w780${d.poster_path}`;
    } else {
        imageLoader.classList.add('hidden');
    }

    document.getElementById('detailTitle').textContent=title;
    document.getElementById('detailMeta').innerHTML=buildDetailTags(d,type,{year,runtime});
    const prog=getProgress(id);
    currentMediaMeta = {id, type, title, poster: d.poster_path, rating: d.vote_average, year};
    currentAnimeInfo = isAnimeTitle(d) ? {
      tmdbId:id, type,
      names:[...new Set([d.name||d.title, d.original_name||d.original_title].filter(Boolean))],
      year:+year||null,
      seasons:(d.seasons||[]).map(s=>({season_number:s.season_number,episode_count:s.episode_count})),
    } : null;
    const isInList = getMyList().some(i => String(i.id) === String(id));

    const videos=d.videos?.results||[];
    const trailer=videos.find(v=>v.site==='YouTube'&&v.type==='Trailer'&&v.official)
      ||videos.find(v=>v.site==='YouTube'&&v.type==='Trailer')
      ||videos.find(v=>v.site==='YouTube'&&v.type==='Teaser');
    currentTrailerKey=trailer?trailer.key:null;

    currentSeasons = type==='tv' ? (d.seasons||[]) : null;
    document.getElementById('detailActions').innerHTML=`
      <button class="btn btn-primary" id="detailPlayBtn" onclick="playFromDetail()">${playBtnInner(id,type,title,prog)}</button>
      <button class="btn btn-glass btn-icon" id="detailListBtn" onclick="toggleMyList()" title="My List">
        ${isInList
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`}
      </button>
    `;
    document.getElementById('detailTrailer').innerHTML='';
    restoreTrailer();
    document.getElementById('detailOverview').textContent=d.overview||'No description available.';
    const directors=type==='movie'
      ?(d.credits?.crew||[]).filter(c=>c.job==='Director').map(c=>c.name)
      :(d.created_by||[]).map(c=>c.name);
    const directorEl=document.getElementById('detailDirector');
    if(directors.length){
      const label=type==='movie'?(directors.length>1?'Directors':'Director'):(directors.length>1?'Creators':'Creator');
      directorEl.innerHTML=`<p class="section-label">${label}</p><div class="detail-director-names">${directors.join(', ')}</div>`;
    } else {
      directorEl.innerHTML='';
    }
    const cast=(d.credits?.cast||[]).slice(0,8);
    if(cast.length){
      document.getElementById('detailCast').innerHTML=`
        <p class="section-label">Cast</p>
        <div class="cast-grid">${cast.map(c=>`
          <div class="cast-card">
            <img class="cast-img" src="${c.profile_path?IMG+'w185'+c.profile_path:'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 60 60%22><rect width=%2260%22 height=%2260%22 fill=%22%231a1a2e%22/><text x=%2230%22 y=%2236%22 text-anchor=%22middle%22 fill=%22%23555%22 font-size=%2224%22>?</text></svg>'}" alt="${c.name}">
            <div class="cast-name">${c.name}</div>
            <div class="cast-char">${(c.character||'').slice(0,22)}</div>
          </div>`).join('')}
        </div>`;
    }
    if(type==='tv'){
      await loadSeasons(id,d.seasons||[],d);
    }
  }catch{
    document.getElementById('detailTitle').textContent='Failed to load.';
  }
}

let currentSeasons=null;

// Label for the detail page's main Play/Continue button.
function playBtnInner(id,type,title,prog){
  const icon='<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  if(type!=='tv') return `${icon} ${prog>0?'Continue':'Play Now'}`;
  const r=resolveResume(id,currentSeasons);
  return `${icon} ${r.started?'Continue':'Play'} S${r.s} E${r.e}`;
}

// Resolved at click time so it always reflects the latest saved progress.
function playFromDetail(){
  if(!currentMediaMeta) return;
  const {id,type,title}=currentMediaMeta;
  if(type!=='tv') return playMedia(id,type,title);
  const r=resolveResume(id,currentSeasons);
  playMedia(id,'tv',r.name||title,r.s,r.e);
}

// Re-sync the Play button and season tabs with saved progress (e.g. after leaving the player).
function refreshTvResume(){
  if(!currentMediaMeta||currentMediaMeta.type!=='tv'||!currentSeasons) return;
  const {id,type,title}=currentMediaMeta;
  const btn=document.getElementById('detailPlayBtn');
  if(btn) btn.innerHTML=playBtnInner(id,type,title,0);
  loadSeasons(id,currentSeasons,{name:title});
}

async function loadSeasons(tvId,seasons,show){
  const realSeasons=seasons.filter(s=>s.season_number>0);
  if(!realSeasons.length)return;
  // Open on the season last viewed/played, falling back to where "Continue" would go.
  const resume=resolveResume(tvId,seasons);
  const saved=getViewSeason(tvId);
  const startSeason=realSeasons.some(s=>s.season_number===saved)?saved
    :realSeasons.some(s=>s.season_number===resume.s)?resume.s:realSeasons[0].season_number;
  currentPlayerSeason=startSeason;
  currentPlayerEpisode=resume.s===startSeason?resume.e:1;
  const container=document.getElementById('detailEpisodes');
  container.innerHTML=`
    <p class="section-label" style="margin-bottom:14px">Episodes</p>
    <div class="season-tabs-wrap" id="seasonTabsWrap">
      <button class="season-arrow" data-dir="-1" onclick="scrollSeasons(-1)" aria-label="Scroll seasons left" title="Previous seasons">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="season-tabs" id="seasonTabs" onscroll="updateSeasonArrows()">${realSeasons.map(s=>`
        <button class="season-tab${s.season_number===startSeason?' active':''}" onclick="selectSeason(${tvId},${s.season_number},this)">
          Season ${s.season_number}
        </button>`).join('')}
      </div>
      <button class="season-arrow" data-dir="1" onclick="scrollSeasons(1)" aria-label="Scroll seasons right" title="More seasons">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div id="episodesList"><div class="loading-center"><div class="spinner"></div></div></div>
  `;
  // Bring the active tab into view horizontally without scrolling the page.
  const tabs=container.querySelector('.season-tabs'),active=tabs?.querySelector('.active');
  updateSeasonArrows();
  if(tabs&&active) tabs.scrollLeft=active.offsetLeft-tabs.offsetLeft-(tabs.clientWidth-active.offsetWidth)/2;
  updateSeasonArrows();
  if(tabs) enableDragScroll(tabs);
  await loadEpisodes(tvId,startSeason);
}

// Click-and-drag to scroll horizontally with a mouse (touch/trackpads already swipe natively).
// A real drag doesn't count as a click, so letting go over a tab won't switch seasons.
function enableDragScroll(el){
  let startX=0,startLeft=0,down=false,dragging=false,justDragged=false;
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0) return;
    down=true;dragging=false;startX=e.clientX;startLeft=el.scrollLeft;
  });
  el.addEventListener('pointermove',e=>{
    if(!down) return;
    const dx=e.clientX-startX;
    if(!dragging&&Math.abs(dx)>5){ // small threshold so normal clicks still work
      dragging=true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    }
    if(dragging) el.scrollLeft=startLeft-dx;
  });
  const end=()=>{
    if(!down) return;
    down=false;
    if(dragging){
      el.classList.remove('is-dragging');
      justDragged=true;
      setTimeout(()=>{justDragged=false},0); // the click (if any) fires right after pointerup
    }
    dragging=false;
  };
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
  el.addEventListener('click',e=>{ if(justDragged){e.stopPropagation();e.preventDefault();} },true);
  el.addEventListener('dragstart',e=>e.preventDefault());
}

// Tab-strip arrows (seasons, genre chips): scroll by most of the visible width.
function scrollTabStrip(tabsId,dir){
  const tabs=document.getElementById(tabsId);
  if(tabs) tabs.scrollBy({left:dir*tabs.clientWidth*0.7,behavior:'smooth'});
}
function scrollSeasons(dir){ scrollTabStrip('seasonTabs',dir); }
function scrollGenreChips(dir){ scrollTabStrip('genreChips',dir); }

// Show the arrows only when the tabs overflow; dim the one at the end you've reached.
function updateSeasonArrows(){ updateTabArrows('seasonTabsWrap','seasonTabs'); }
function updateGenreArrows(){ updateTabArrows('genreChipsWrap','genreChips'); }
function updateTabArrows(wrapId,tabsId){
  const wrap=document.getElementById(wrapId),tabs=document.getElementById(tabsId);
  if(!wrap||!tabs) return;
  const overflow=tabs.scrollWidth>tabs.clientWidth+2;
  wrap.classList.toggle('has-overflow',overflow);
  const atStart=tabs.scrollLeft<=2,atEnd=tabs.scrollLeft+tabs.clientWidth>=tabs.scrollWidth-2;
  wrap.querySelectorAll('.season-arrow').forEach(b=>{
    const off=b.dataset.dir==='-1'?atStart:atEnd;
    b.disabled=off;
  });
}
window.addEventListener('resize',()=>{updateSeasonArrows();updateGenreArrows();});

async function selectSeason(tvId,num,btn){
  document.querySelectorAll('.season-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');currentPlayerSeason=num;
  setViewSeason(tvId,num);
  await loadEpisodes(tvId,num);
}

async function loadEpisodes(tvId,season){
  const el=document.getElementById('episodesList');
  el.innerHTML='<div class="loading-center"><div class="spinner"></div></div>';
  try{
    const d=await tmdb(`/tv/${tvId}/season/${season}`);
    const eps=d.episodes||[];
    // Highlight the episode "Continue" would play, if it's in this season
    const resume=resolveResume(tvId,currentSeasons);
    const upNext=resume.s===+season?resume.e:null;
    el.innerHTML=`<div class="episodes-grid">${eps.map(ep=>{
      const epKey=`${tvId}_s${season}e${ep.episode_number}`;
      const thumb=ep.still_path?`${IMG}w400${ep.still_path}`:'';
      const prog=getProgress(epKey);
      const watched=isWatched(epKey);
      const isNext=ep.episode_number===upNext;
      return`<div class="episode-card${isNext?' is-up-next':''}" onclick="playEpisode(${tvId},${season},${ep.episode_number},'${(ep.name||'').replace(/'/g,"\\'")}', true)" tabindex="0" role="button">
        <div class="episode-thumb-wrap">
          ${thumb?`<img class="episode-thumb" src="${thumb}" alt="${ep.name}" loading="lazy">`:`<div class="episode-thumb skeleton" style="height:100%"></div>`}
          <div class="episode-num">E${ep.episode_number}</div>
          <button class="episode-watched-btn${watched?' checked':''}" onclick="toggleWatched(event,'${epKey}')" aria-label="${watched?'Mark as unwatched':'Mark as watched'}" title="Mark as watched">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <div class="episode-play-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          ${prog>0?`<div class="ep-progress-wrap" style="position:absolute;bottom:0;left:0;right:0"><div class="ep-progress-fill" style="width:${prog}%"></div></div>`:''}
        </div>
        <div class="episode-info">
          <div class="episode-label">Episode ${ep.episode_number}${isNext&&resume.started?'<span class="episode-up-next">Up next</span>':''}</div>
          <div class="episode-title">${ep.name||'Episode '+ep.episode_number}</div>
          <div class="episode-desc">${ep.overview||'No description available.'}</div>
          ${ep.air_date?`<div class="episode-air">${ep.air_date}</div>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
    staggerCards(el.querySelector('.episodes-grid'));
    // The list scrolls inside its own box: start at the up-next episode (scrolls the list only,
    // never the page), and drop the bottom fade once you've reached the end.
    el.scrollTop=0;
    const next=el.querySelector('.is-up-next');
    if(next) el.scrollTop=Math.max(0,next.offsetTop-12);
    const updateFade=()=>el.classList.toggle('at-end',el.scrollTop+el.clientHeight>=el.scrollHeight-4);
    el.onscroll=updateFade;
    updateFade();
  }catch{
    el.innerHTML='<p style="color:var(--text3);padding:20px">Failed to load episodes.</p>';
  }
}

function closeDetailBtn(){
  stopTrailer();
  const params = new URLSearchParams(window.location.search);
  params.delete('movie');
  params.delete('tv');
  window.history.pushState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
  
  if (detailCameFrom) {
    // Go back to the page (home, a See-all list, search…) the title was opened from
    const {view,scrollY}=detailCameFrom;
    detailCameFrom=null;
    switchPage(view);
    requestAnimationFrame(()=>window.scrollTo(0,scrollY));
  } else if (document.getElementById('searchInput').value.trim() !== '' || document.getElementById('searchTitle').textContent === 'My List' || document.getElementById('searchTitle').textContent === 'Continue Watching') {
    switchPage('searchResults');
  } else {
    switchPage('homeContent');
  }
}

function stopTrailer(){
  const trailerEl=document.getElementById('detailTrailer');
  if(trailerEl) trailerEl.innerHTML='';
}

function playMedia(id,type,title,s,e){
  stopTrailer();
  if(type==='movie') {
      playMovie(id, title, '', true);
  } else {
      playEpisode(id, s||currentPlayerSeason||1, e||currentPlayerEpisode||1, title, true);
  }
}

function playMovie(id, title, posterPath = '', pushState = true){
  const prog=getProgress(id);
  lastPlayback={kind:'movie',id,title,poster:posterPath};
  const srv = playableServer(id);
  if (srv.animeOnly) {
    const fallback = firstRegularServer();
    openPlayer(resolveAniList(currentAnimeInfo,1,1).then(r=>r&&srv.anime(r.id,r.ep)), title||'', pushState,
      {server:srv, fallbackSrc:fallback.movie(id), fallbackServer:fallback});
  } else {
    openPlayer(srv.movie(id), title||'', pushState, {server:srv});
  }
  if (currentMediaMeta && String(currentMediaMeta.id) === String(id)) {
    saveRecent(currentMediaMeta);
  } else {
    saveRecent({id, type:'movie', title, year:'', poster: posterPath});
  }
  renderRecent();
}


function playEpisode(tvId,season,ep,epName, pushState = true){
  season=+season||1;ep=+ep||1;
  currentPlayerSeason=season;currentPlayerEpisode=ep;
  setShowPos(tvId,season,ep,epName);
  setViewSeason(tvId,season);
  markWatched(`${tvId}_s${season}e${ep}`);
  lastPlayback={kind:'tv',tvId,season,ep,epName};
  const prog=getProgress(`${tvId}_s${season}e${ep}`);
  const label = `S${season} E${ep} – ${epName||''}`;
  const srv = playableServer(tvId);
  if (srv.animeOnly) {
    const fallback = firstRegularServer();
    openPlayer(resolveAniList(currentAnimeInfo,season,ep).then(r=>r&&srv.anime(r.id,r.ep)), label, pushState,
      {server:srv, fallbackSrc:fallback.tv(tvId,season,ep), fallbackServer:fallback});
  } else {
    openPlayer(srv.tv(tvId, season, ep), label, pushState, {server:srv});
  }
  if (currentMediaMeta && String(currentMediaMeta.id) === String(tvId)) {
    saveRecent(currentMediaMeta);
    renderRecent();
  }
}

let playingServerId=null,playerLoadToken=0;

// ---- Pop-up ad blocking ----
// We can't reach inside the players (other sites' iframes) the way an ad-block extension
// can, but the browser's iframe `sandbox` lets us choose what the player may do. Leaving
// out allow-popups and allow-top-navigation stops ad tabs/windows and page redirects;
// video, fullscreen and the progress messages keep working. Some players refuse to run
// sandboxed, so it's a setting (off by default — turn it on in Settings).
const PLAYER_SANDBOX='allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock';
function blockPopupsOn(){ return getSaved('sv_block_popups',false)===true; }
function toggleBlockPopups(){
  const on=document.getElementById('blockPopupsToggle').checked;
  setSaved('sv_block_popups',on);
  document.getElementById('blockPopupsRow')?.setAttribute('aria-checked',on);
  showToast(on?'Pop-up ad blocking on':'Pop-up ad blocking off');
  if(currentView==='playerPage') replayCurrent(); // apply to what's playing now
}

function renderPlayerFrame(src,server){
  const scale = server.scale || 1;
  const scaleStyle = scale !== 1
    ? `style="width:${100/scale}%;height:${100/scale}%;transform:scale(${scale});transform-origin:0 0"`
    : '';
  const sandbox = blockPopupsOn() ? `sandbox="${PLAYER_SANDBOX}"` : '';
  document.getElementById('playerFrameWrap').innerHTML = `
    <iframe id="playerFrame" src="${src}" ${scaleStyle} ${sandbox} frameborder="0" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer" loading="eager"></iframe>
  `;
  playingServerId=server.id;
  renderServerMenu();
}

// `src` is a URL, or a Promise of one (anime-only servers look up the AniList ID first).
// If that lookup fails, `opts.fallbackSrc` plays on `opts.fallbackServer` instead.
function openPlayer(src, label, pushState = true, opts = {}){
  switchPage('playerPage');
  const server = opts.server || getServer(activePlayer);
  const token = ++playerLoadToken;
  if (typeof src === 'string') {
    renderPlayerFrame(src, server);
  } else {
    playingServerId = server.id;
    document.getElementById('playerFrameWrap').innerHTML =
      '<div class="player-resolving"><div class="spinner"></div><span>Finding this on AniList…</span></div>';
    Promise.resolve(src).catch(()=>null).then(url=>{
      if (token !== playerLoadToken || currentView !== 'playerPage') return; // user moved on
      if (url) { renderPlayerFrame(url, server); return; }
      showToast(`Couldn't match this on ${server.label} — playing on ${opts.fallbackServer.label}`);
      renderPlayerFrame(opts.fallbackSrc, opts.fallbackServer);
    });
  }

  resetPlayerTitle(label);
  resetEpisodeVote();
  renderServerMenu();
  updateEpisodeSwitcher();
  playerUiActive();
  window.addEventListener('message',handlePlayerMessage);
  
  if (pushState) {
    const params = new URLSearchParams(window.location.search);
    if(currentPlayerSeason) params.set('s', currentPlayerSeason);
    if(currentPlayerEpisode) params.set('e', currentPlayerEpisode);
    params.set('play', 'true');
    window.history.pushState({page: 'player'}, '', `${window.location.pathname}?${params.toString()}`);
  }
}

function closePlayerBtn(){
  playerLoadToken++;          // ignore an AniList lookup that finishes after closing
  playingServerId = null;
  stopPlayerIdle();
  closeEpisodeMenu();
  exitFocusMode();
  document.getElementById('playerFrameWrap').innerHTML = '';
  closeServerMenu();
  resetEpisodeVote();
  const params = new URLSearchParams(window.location.search);
  params.delete('play');
  params.delete('s');
  params.delete('e');
  window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  switchPage('detailPage');
  restoreTrailer();
  refreshTvResume();
}

function restoreTrailer(){
  const trailerEl=document.getElementById('detailTrailer');
  if(trailerEl && currentTrailerKey){
    trailerEl.innerHTML=`<div class="detail-trailer-wrap">
      <iframe id="trailerFrame" src="https://www.youtube.com/embed/${currentTrailerKey}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      <button class="trailer-unmute-btn" id="trailerUnmuteBtn" onclick="unmuteTrailer()" aria-label="Unmute trailer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
        <span>Tap to unmute</span>
      </button>
    </div>`;
  }
}

function unmuteTrailer(){
  const frame=document.getElementById('trailerFrame');
  if(!frame) return;
  const send=(func,args=[])=>frame.contentWindow.postMessage(JSON.stringify({event:'command',func,args}),'*');
  send('unMute');
  send('setVolume',[100]);
  send('playVideo');
  const btn=document.getElementById('trailerUnmuteBtn');
  if(btn) btn.remove();
}

var lastPlayback=null;

function toggleServerMenu(e){
  if(e) e.stopPropagation();
  const menu=document.getElementById('serverMenu');
  const open=!menu.classList.contains('open');
  if(open&&typeof closeEpisodeMenu==='function') closeEpisodeMenu();
  menu.classList.toggle('open',open);
  document.getElementById('serverBtn').setAttribute('aria-expanded',open);
}

function closeServerMenu(){
  const menu=document.getElementById('serverMenu');
  if(menu) menu.classList.remove('open');
  const btn=document.getElementById('serverBtn');
  if(btn) btn.setAttribute('aria-expanded','false');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.server-switcher')) closeServerMenu();
});

// Builds both the settings server list and the player-overlay dropdown from SERVERS
function renderServerLists(){
  const list=document.getElementById('serverList');
  if(list){
    list.innerHTML=SERVERS.map((s,i)=>{
      if(s.animeOnly){
        // Not selectable: always used for anime automatically
        return `<div class="server-row server-row-auto" title="Used automatically whenever you play an anime">
          <span class="server-row-num">${String(i+1).padStart(2,'0')}</span>
          <span class="server-row-text">
            <span class="server-row-name">${s.label}<span class="server-badge server-badge-anime">Auto for anime</span></span>
            <span class="server-row-host">${s.name} · ${s.host} · switch per show from the player</span>
          </span>
        </div>`;
      }
      const on=s.id===activePlayer;
      return `<button class="server-row${on?' active':''}" role="radio" aria-checked="${on}" onclick="setPlayer('${s.id}')">
        <span class="server-row-num">${String(i+1).padStart(2,'0')}</span>
        <span class="server-row-text">
          <span class="server-row-name">${s.label}${s.recommended?'<span class="server-badge">Recommended</span>':''}</span>
          <span class="server-row-host">${s.name} · ${s.host}</span>
        </span>
        <span class="server-row-radio" aria-hidden="true"></span>
      </button>`;
    }).join('');
  }
  // Player dropdown: anime-only servers are listed only while an anime is playing
  const menu=document.getElementById('serverMenuList');
  const animePlaying=isAnimeId(playingTmdbId());
  const shownId=playingServerId||activePlayer;
  if(menu){
    menu.innerHTML=SERVERS.filter(s=>!s.animeOnly||animePlaying).map(s=>`
      <button class="server-option${s.id===shownId?' active':''}" role="menuitemradio" aria-checked="${s.id===shownId}" onclick="switchServer('${s.id}')">
        <span>${s.label}${s.recommended?'<span class="server-badge">Recommended</span>':''}${s.animeOnly?'<span class="server-badge server-badge-anime">Anime</span>':''}</span>
      </button>`).join('');
  }
  const label=document.getElementById('serverBtnLabel');
  if(label) label.textContent=getServer(shownId).label;
  // Sub/Dub toggle only for anime-only servers
  const trackBtn=document.getElementById('animeTrackBtn');
  if(trackBtn){
    trackBtn.hidden=!getServer(shownId).animeOnly;
    trackBtn.textContent=getAnimeTrack()==='dub'?'DUB':'SUB';
    trackBtn.title=`Playing ${getAnimeTrack()==='dub'?'dubbed':'subtitled'} — click to switch`;
  }
}
function renderServerMenu(){ renderServerLists(); }

// Replay whatever is playing (after a server or Sub/Dub change)
function replayCurrent(){
  if(!lastPlayback) return;
  if(lastPlayback.kind==='movie') playMovie(lastPlayback.id,lastPlayback.title,lastPlayback.poster,false);
  else playEpisode(lastPlayback.tvId,lastPlayback.season,lastPlayback.ep,lastPlayback.epName,false);
}

function playingTmdbId(){
  return lastPlayback?(lastPlayback.kind==='movie'?lastPlayback.id:lastPlayback.tvId):null;
}

function switchServer(player){
  closeServerMenu();
  resetEpisodeVote();
  if(player===(playingServerId||activePlayer)) return;
  const tmdbId=playingTmdbId();
  if(isAnimeId(tmdbId)){
    // Anime: remember the choice for this show only; your default server stays the same
    const key='sv_animeserver_'+tmdbId;
    if(getServer(player).animeOnly){ try{localStorage.removeItem(key)}catch{} }
    else setSaved(key,player);
    showToast(`${getServer(player).label} will be used for this anime`);
  } else {
    setPlayer(player);
  }
  replayCurrent();
}

// ---- Player: episode picker ----
// "Episodes" dropdown in the player header (TV only): pick a season, jump to any episode.
const seasonDataCache={};
function getSeasonData(tvId,season){
  const k=`${tvId}_${season}`;
  if(!seasonDataCache[k]) seasonDataCache[k]=tmdb(`/tv/${tvId}/season/${season}`).catch(err=>{delete seasonDataCache[k];throw err;});
  return seasonDataCache[k];
}
const escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let episodeMenuSeason=null;

function updateEpisodeSwitcher(){
  const sw=document.getElementById('episodeSwitcher');
  if(!sw) return;
  const isTv=lastPlayback?.kind==='tv'&&currentSeasons&&currentMediaMeta&&String(currentMediaMeta.id)===String(lastPlayback.tvId);
  sw.hidden=!isTv;
  closeEpisodeMenu();
}
function toggleEpisodeMenu(e){
  if(e) e.stopPropagation();
  const menu=document.getElementById('episodeMenu');
  const open=!menu.classList.contains('open');
  if(open){
    closeServerMenu();
    const sel=document.getElementById('episodeMenuSeason');
    const seasons=(currentSeasons||[]).filter(s=>s.season_number>0);
    sel.innerHTML=seasons.map(s=>`<option value="${s.season_number}">Season ${s.season_number}</option>`).join('');
    sel.hidden=seasons.length<2;
    renderEpisodeMenu(+currentPlayerSeason||seasons[0]?.season_number||1);
  }
  menu.classList.toggle('open',open);
  document.getElementById('episodePickerBtn').setAttribute('aria-expanded',open);
  playerUiActive();
}
function closeEpisodeMenu(){
  document.getElementById('episodeMenu')?.classList.remove('open');
  document.getElementById('episodePickerBtn')?.setAttribute('aria-expanded','false');
}
async function renderEpisodeMenu(season){
  if(!lastPlayback||lastPlayback.kind!=='tv') return;
  const tvId=lastPlayback.tvId;
  const list=document.getElementById('episodeMenuList');
  episodeMenuSeason=season;
  document.getElementById('episodeMenuSeason').value=season;
  list.innerHTML='<div class="episode-menu-empty"><div class="spinner"></div></div>';
  try{
    const d=await getSeasonData(tvId,season);
    if(episodeMenuSeason!==season) return; // switched season while loading
    list.innerHTML=(d.episodes||[]).map(ep=>{
      const n=ep.episode_number;
      const current=+season===+currentPlayerSeason&&n===+currentPlayerEpisode;
      const watched=isWatched(`${tvId}_s${season}e${n}`);
      const thumb=ep.still_path?`<img class="episode-option-thumb" src="${IMG}w185${ep.still_path}" alt="" loading="lazy">`:'<span class="episode-option-thumb"></span>';
      return `<button class="server-option episode-option${current?' active':''}" role="menuitem" data-name="${escHtml(ep.name||'')}" onclick="pickEpisodeFromMenu(${season},${n},this.dataset.name)">
        ${thumb}
        <span class="episode-option-num">E${n}</span>
        <span class="episode-option-title">${escHtml(ep.name||'Episode '+n)}</span>
        ${watched?'<span class="episode-option-tick" aria-label="Watched"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></span>':''}
      </button>`;
    }).join('')||'<div class="episode-menu-empty">No episodes</div>';
    // Center the current episode in the list (scrolls only the menu)
    const cur=list.querySelector('.active');
    if(cur) list.scrollTop=cur.offsetTop-list.clientHeight/2+cur.offsetHeight/2;
  }catch{
    list.innerHTML='<div class="episode-menu-empty">Couldn\'t load episodes</div>';
  }
}
function pickEpisodeFromMenu(season,ep,name){
  closeEpisodeMenu();
  if(!lastPlayback||lastPlayback.kind!=='tv') return;
  playEpisode(lastPlayback.tvId,season,ep,name,false);
  // Keep the address bar in sync without adding a history entry per episode
  const params=new URLSearchParams(window.location.search);
  params.set('s',season);params.set('e',ep);
  window.history.replaceState(window.history.state,'',`${window.location.pathname}?${params.toString()}`);
}

// ---- Player: auto-hide header ----
// The header fades out after a few seconds. Mouse movement over the video itself happens
// inside the player's iframe and never reaches us, so the header comes back when the
// pointer reaches the top edge (the header area) — or on any key press.
const PLAYER_IDLE_MS=3500,FOCUS_IDLE_MS=1500;
let playerIdleTimer=null,playerHeaderHovered=false;

function playerHeaderEl(){ return document.querySelector('#playerPage .player-header'); }
function playerUiActive(){
  const page=document.getElementById('playerPage');
  if(!page) return;
  page.classList.remove('ui-idle');
  schedulePlayerIdle();
}
function schedulePlayerIdle(){
  clearTimeout(playerIdleTimer);
  const page=document.getElementById('playerPage');
  playerIdleTimer=setTimeout(()=>{
    if(currentView!=='playerPage'||playerHeaderHovered) return;
    // Keep it up while a menu is open or a header button has keyboard focus
    const menuOpen=document.querySelector('#serverMenu.open, #episodeMenu.open');
    const kbdFocus=playerHeaderEl()?.contains(document.activeElement)&&document.activeElement.matches(':focus-visible');
    if(menuOpen||kbdFocus){ schedulePlayerIdle(); return; }
    page.classList.add('ui-idle');
  },page?.classList.contains('focus-mode')?FOCUS_IDLE_MS:PLAYER_IDLE_MS);
}
function stopPlayerIdle(){
  clearTimeout(playerIdleTimer);
  playerHeaderHovered=false;
  document.getElementById('playerPage')?.classList.remove('ui-idle');
}

// ---- Player: focus mode ----
// Fullscreens the whole player page (not just the video), hiding the browser's tabs and
// address bar while StreamHub's header stays usable; the header also hides faster.
function toggleFocusMode(){
  const page=document.getElementById('playerPage');
  const fsEl=document.fullscreenElement||document.webkitFullscreenElement;
  if(fsEl){
    (document.exitFullscreen||document.webkitExitFullscreen)?.call(document);
    return;
  }
  const req=page.requestFullscreen||page.webkitRequestFullscreen;
  if(!req){ showToast('Focus mode isn\'t supported in this browser'); return; }
  try{
    const p=req.call(page);
    if(p&&p.catch) p.catch(()=>showToast('Focus mode isn\'t available here'));
  }catch{ showToast('Focus mode isn\'t available here'); }
}
function onFullscreenChange(){
  const page=document.getElementById('playerPage');
  const on=(document.fullscreenElement||document.webkitFullscreenElement)===page;
  page.classList.toggle('focus-mode',on);
  const btn=document.getElementById('focusBtn');
  if(btn){ btn.setAttribute('aria-pressed',on); btn.title=on?'Exit focus mode (T / Esc)':'Focus mode (T)'; }
  playerUiActive();
}
function exitFocusMode(){
  const page=document.getElementById('playerPage');
  if((document.fullscreenElement||document.webkitFullscreenElement)===page){
    (document.exitFullscreen||document.webkitExitFullscreen)?.call(document);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const page=document.getElementById('playerPage'),header=playerHeaderEl();
  if(!page||!header) return;
  header.addEventListener('mouseenter',()=>{ playerHeaderHovered=true; clearTimeout(playerIdleTimer); page.classList.remove('ui-idle'); });
  header.addEventListener('mouseleave',()=>{ playerHeaderHovered=false; schedulePlayerIdle(); });
  // Touch: a tap on the (hidden) header area brings it back without pressing a button
  header.addEventListener('touchstart',e=>{
    if(page.classList.contains('ui-idle')){ e.preventDefault(); playerUiActive(); }
    else schedulePlayerIdle();
  },{passive:false});
  page.addEventListener('mousemove',playerUiActive); // e.g. over the loading screen
  // Wake layer (only clickable while hidden): first move or tap over the video shows the
  // controls; the layer then stops catching events so the player gets them again.
  const wake=document.getElementById('playerWake');
  if(wake){
    wake.addEventListener('mousemove',playerUiActive);
    wake.addEventListener('mousedown',playerUiActive);
    wake.addEventListener('touchstart',e=>{ e.preventDefault(); playerUiActive(); },{passive:false});
  }
  document.addEventListener('keydown',e=>{
    if(currentView!=='playerPage') return;
    if(e.target.closest?.('input,select,textarea')) return;
    if((e.key==='t'||e.key==='T')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){ e.preventDefault(); toggleFocusMode(); }
    playerUiActive();
  });
  document.addEventListener('fullscreenchange',onFullscreenChange);
  document.addEventListener('webkitfullscreenchange',onFullscreenChange);
  document.addEventListener('click',e=>{ if(!e.target.closest('.episode-switcher')) closeEpisodeMenu(); });
});

function toggleAnimeTrack(){
  const next=getAnimeTrack()==='dub'?'sub':'dub';
  setSaved('sv_anime_track',next);
  showToast(next==='dub'?'Switched to Dub':'Switched to Sub');
  replayCurrent();
}

// The player switched episodes on its own: update the header title, server-switch target and URL.
async function onPlayerEpisodeChanged(tvId,season,ep){
  lastPlayback={kind:'tv',tvId,season,ep,epName:''};
  const params=new URLSearchParams(window.location.search);
  params.set('s',season);params.set('e',ep);
  window.history.replaceState(window.history.state,'',`${window.location.pathname}?${params.toString()}`);
  // Keep the "Switching…" spinner up while the episode name loads, then swap once
  // (gives up on the name after 1.5s so the title never hangs).
  let name='';
  try{
    const d=await Promise.race([
      tmdb(`/tv/${tvId}/season/${season}/episode/${ep}`),
      new Promise(r=>setTimeout(()=>r(null),1500)),
    ]);
    name=d?.name||'';
  }catch{}
  // Ignore if the user has moved on to a different episode while this was loading.
  if(currentPlayerSeason!==season||currentPlayerEpisode!==ep) return;
  confirmPlayerTitle(name?`S${season} E${ep} – ${name}`:`S${season} E${ep}`);
  if(name){
    lastPlayback.epName=name;
    setShowPos(tvId,season,ep,name);
  }
}

// Players send messages about episodes that aren't playing (e.g. preloading the next one),
// so a message mentioning an episode isn't proof it's on screen. We only follow an episode
// whose playback time is actually moving forward, while the current one has gone quiet.
const EP_ADVANCES_NEEDED=3;   // forward time updates needed before we believe it
const EP_WINDOW_MS=6000;      // how recent those updates must be
const EP_QUIET_MS=4000;       // the current episode must have stopped advancing for this long
let epTrack={};               // 's-e' -> {t:last time seen, hits:[timestamps of forward progress]}

function resetEpisodeVote(){ epTrack={}; }

function reportPlayerEpisode(tvId,season,episode,time){
  season=+season;episode=+episode;
  if(!season||!episode||typeof time!=='number'||!isFinite(time)) return;
  const now=Date.now(),k=`${season}-${episode}`;
  const tr=epTrack[k]||(epTrack[k]={t:time,hits:[]});
  const advanced=time>tr.t;
  if(advanced) tr.hits.push(now);
  tr.t=time;
  tr.hits=tr.hits.filter(h=>now-h<EP_WINDOW_MS);

  const curKey=`${+currentPlayerSeason}-${+currentPlayerEpisode}`;
  if(k===curKey){
    // The current episode is still playing after all: undo any "Switching…" hint.
    if(advanced) clearTitlePending(true);
    return;
  }
  const cur=epTrack[curKey];
  if(!tr.hits.length) return;
  // Looks like a switch is happening: show "Switching…" early to cover the confirm delay —
  // the new episode is advancing and the current one has paused for a moment. Only after
  // we've seen the current episode play, so a fresh start never flashes it.
  if(cur&&tr.hits.length>=2&&!cur.hits.some(h=>now-h<1500)) setTitlePending(season,episode);
  const curStillPlaying=cur&&cur.hits.some(h=>now-h<EP_QUIET_MS);
  if(!curStillPlaying&&tr.hits.length>=EP_ADVANCES_NEEDED){
    epTrack={};
    followPlayerEpisode(tvId,season,episode);
  }
}

// ---- Player title transitions ----
let playerTitleConfirmed='',titlePendingKey=null,titleSwapTimer=null;

// Fade/slide the title to new text.
function setPlayerTitle(text){
  const el=document.getElementById('playerTitleText');
  if(!el) return;
  clearTimeout(titleSwapTimer);
  if(el.textContent===text&&!el.classList.contains('swap-out')) return;
  el.classList.add('swap-out');
  titleSwapTimer=setTimeout(()=>{
    el.textContent=text;
    el.classList.remove('swap-out');
    el.classList.add('swap-in-start');
    void el.offsetWidth; // restart the transition from the "below" position
    el.classList.remove('swap-in-start');
  },180);
}

// Set the title instantly, no animation (used when the player first opens).
function resetPlayerTitle(text){
  const el=document.getElementById('playerTitleText');
  clearTimeout(titleSwapTimer);
  titlePendingKey=null;playerTitleConfirmed=text;
  el.classList.remove('is-pending','swap-out','swap-in-start');
  el.textContent=text;
}

function setTitlePending(season,ep){
  const k=`${season}-${ep}`;
  if(titlePendingKey===k) return;
  titlePendingKey=k;
  document.getElementById('playerTitleText')?.classList.add('is-pending');
  setPlayerTitle(`Switching to S${season} E${ep}`);
}

function clearTitlePending(revert){
  if(!titlePendingKey) return;
  titlePendingKey=null;
  document.getElementById('playerTitleText')?.classList.remove('is-pending');
  if(revert) setPlayerTitle(playerTitleConfirmed);
}

function confirmPlayerTitle(text){
  playerTitleConfirmed=text;
  clearTitlePending(false);
  setPlayerTitle(text);
}

// The player has settled on a different episode: follow it.
function followPlayerEpisode(tvId,season,episode){
  // Tick the episode we're leaving and the one the player moved to.
  markWatched(`${tvId}_s${+currentPlayerSeason}e${+currentPlayerEpisode}`);
  markWatched(`${tvId}_s${season}e${episode}`);
  currentPlayerSeason=season;currentPlayerEpisode=episode;
  setShowPos(tvId,season,episode,'');
  setViewSeason(tvId,season);
  onPlayerEpisodeChanged(tvId,season,episode);
}

// Message formats differ per server, so accept the common shapes:
//  VidKing-style: {type:'PLAYER_EVENT', data:{id, mediaType, progress, season, episode}}
//  VidLink:       {type:'PLAYER_EVENT', data:{mtmdbId, mediaType, currentTime, duration, season, episode}}
//                 {type:'MEDIA_DATA',   data:{[tmdbId]:{last_season_watched, last_episode_watched, show_progress}}}
// MEDIA_DATA is only used for progress: its "last watched" fields can point at other episodes.
function handlePlayerMessage(event){
  try{
    // Only listen to our player iframe (or a frame nested directly inside it).
    const frame=document.getElementById('playerFrame');
    if(!frame||!lastPlayback) return;
    const fw=frame.contentWindow;
    if(event.source!==fw&&event.source?.parent!==fw) return;

    let msg=event.data;
    if(typeof msg==='string'){try{msg=JSON.parse(msg)}catch{return}}
    if(!msg||typeof msg!=='object') return;
    if(new URLSearchParams(location.search).has('debugplayer')) console.log('[player message]',event.origin,msg);

    const isTv=lastPlayback.kind==='tv';
    const curId=String(isTv?lastPlayback.tvId:lastPlayback.id);

    if(msg.type==='MEDIA_DATA'&&msg.data&&typeof msg.data==='object'){
      const entry=msg.data[curId];
      if(!entry) return;
      if(isTv){
        // MEDIA_DATA carries the player's OWN stored history for every episode (kept inside
        // its iframe, which we can't clear). Only take the episode that's playing right now,
        // otherwise clearing progress in StreamHub gets undone the next time anything plays.
        Object.values(entry.show_progress||{}).forEach(p=>{
          const w=p?.progress?.watched,dur=p?.progress?.duration;
          if(+p?.season!==+currentPlayerSeason||+p?.episode!==+currentPlayerEpisode) return;
          if(dur>0) saveProgress(`${curId}_s${+p.season}e${+p.episode}`,Math.min(100,w/dur*100));
        });
      } else if(entry.progress?.duration>0){
        saveProgress(curId,Math.min(100,entry.progress.watched/entry.progress.duration*100));
      }
      return;
    }

    const d=(msg.data&&typeof msg.data==='object')?msg.data:msg;
    const msgId=d.id??d.tmdbId??d.tmdb_id??d.mtmdbId;
    if(msgId!=null&&String(msgId)!==curId) return;
    let progress=d.progress;
    if(typeof progress!=='number'&&d.duration>0&&d.currentTime!=null) progress=d.currentTime/d.duration*100;
    const season=d.season??d.seasonNumber,episode=d.episode??d.episodeNumber;

    if(isTv&&season&&episode){
      const time=typeof d.currentTime==='number'?d.currentTime:progress;
      reportPlayerEpisode(curId,season,episode,time);
      // Only record progress for the episode we've confirmed is playing.
      if(typeof progress==='number'&&+season===+currentPlayerSeason&&+episode===+currentPlayerEpisode)
        saveProgress(`${curId}_s${+season}e${+episode}`,Math.min(100,progress));
    } else if(!isTv&&typeof progress==='number'){
      saveProgress(curId,Math.min(100,progress));
    }
  }catch{}
}

function renderRecent(){
  const recent=getRecent();
  const section=document.getElementById('recentlyWatched');
  const row=document.getElementById('recentRow');
  if(!recent.length){section.style.display='none';return;}
  section.style.display='block';
  row.innerHTML=recent.map(item => makeRecentCard(item, true)).join('');
  staggerCards(row);
}

function renderMyListRow() {
  const list = getMyList();
  const section = document.getElementById('myListSection');
  const row = document.getElementById('myListRow');
  if(!list.length) { section.style.display='none'; return; }
  section.style.display='block';
  row.innerHTML = list.map(item => makeListCard(item, true)).join('');
  staggerCards(row);
}

function showMyList() {
  stopGridFeed();
  switchPage('searchResults');
  document.getElementById('searchTitle').textContent = 'My List';
  const list = getMyList();
  document.getElementById('searchCount').textContent = `${list.length} items`;
  const grid = document.getElementById('searchGrid');
  if(!list.length) { grid.innerHTML='<p style="color:var(--text3);padding:20px;grid-column:1/-1">Your list is empty. Start saving some movies or shows!</p>'; return; }
  grid.innerHTML = list.map(item => makeListCard(item, true)).join('');
  staggerCards(grid);
  setActiveNav(document.getElementById('navList'));
}

function toggleSearch(){
  const box=document.getElementById('searchBox');
  const open=box.classList.toggle('open');
  if(open)setTimeout(()=>document.getElementById('searchInput').focus(),350);
  else closeSearch();
}

function closeSearch(){
  document.getElementById('searchBox').classList.remove('open');
  document.getElementById('searchInput').value='';
  document.getElementById('searchInput').blur();
  const toggleBtn=document.getElementById('searchToggleBtn');
  if(toggleBtn) toggleBtn.focus();
  showHome();
}

function debounceSearch(val){
  clearTimeout(searchTimer);
  if(!val.trim()){showHome();return;}
  searchTimer=setTimeout(()=>doSearch(val),400);
}

async function doSearch(q){
  switchPage('searchResults');
  document.getElementById('searchTitle').textContent=`Results for "${q}"`;
  document.getElementById('searchCount').textContent='Searching...';
  await startGridFeed(
    [{path:'/search/movie',params:{query:q},type:'movie'},{path:'/search/tv',params:{query:q},type:'tv'}],
    {
      sortByPopularity:true,
      onCount:n=>{document.getElementById('searchCount').textContent=`${n.toLocaleString()} result${n===1?'':'s'} found`;},
      errorText:'Search failed.',
    }
  );
}

function showHome(){
  switchPage('homeContent');
  document.getElementById('searchBox').classList.remove('open');
  document.getElementById('searchInput').value='';
  setActiveNav(document.getElementById('navHome'));
  window.history.pushState({page: 'home'}, '', window.location.pathname);
}

// ---- Endless grid (Movies / TV Shows / Search) ----
// Loads page 1 of every source, then the next page of each whenever you scroll near the bottom.
const GRID_MAX_PAGES=30;
let gridFeed=null; // {sources:[{path,params,type,totalPages}], page, loading, done, seen, sortByPopularity, onCount}

function stopGridFeed(){
  gridFeed=null;
  document.getElementById('gridLoader')?.remove();
  document.getElementById('gridControls').innerHTML=''; // page-specific controls (e.g. service dropdown)
}

async function startGridFeed(sources,{sortByPopularity=false,onCount=null,emptyText='No results found.',errorText='Failed to load.'}={}){
  document.getElementById('gridControls').innerHTML='';
  const grid=document.getElementById('searchGrid');
  const feed=gridFeed={sources:sources.map(s=>({...s,params:s.params||{},totalPages:1})),page:0,loading:false,done:false,seen:new Set(),sortByPopularity,onCount};
  grid.innerHTML='<div class="loading-center" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try{
    const added=await loadGridPage(feed,true);
    if(gridFeed!==feed) return;
    if(!added) grid.innerHTML=`<p style="color:var(--text3);padding:20px;grid-column:1/-1">${emptyText}</p>`;
  }catch{
    if(gridFeed===feed) grid.innerHTML=`<p style="color:var(--text3);padding:20px;grid-column:1/-1">${errorText}</p>`;
  }
}

async function loadGridPage(feed,first=false){
  if(feed.loading||feed.done) return 0;
  const grid=document.getElementById('searchGrid');
  const next=feed.page+1;
  const active=feed.sources.filter(s=>next<=s.totalPages);
  if(!active.length||next>GRID_MAX_PAGES){ feed.done=true; showGridEnd(feed); return 0; }
  feed.loading=true;
  if(!first) setGridLoader('loading');
  try{
    const responses=await Promise.all(active.map(s=>tmdb(s.path,{...s.params,page:next})));
    if(gridFeed!==feed) return 0;
    feed.page=next;
    let items=[];
    responses.forEach((res,i)=>{
      active[i].totalPages=Math.min(res.total_pages||next,GRID_MAX_PAGES);
      active[i].totalResults=res.total_results||0;
      items=items.concat((res.results||[]).map(it=>({...it,_type:active[i].type})));
    });
    if(feed.sortByPopularity) items.sort((a,b)=>(b.popularity||0)-(a.popularity||0));
    items=items.filter(i=>!feed.seen.has(`${i._type}-${i.id}`)&&feed.seen.add(`${i._type}-${i.id}`));
    if(first&&feed.onCount) feed.onCount(feed.sources.reduce((n,s)=>n+(s.totalResults||0),0));
    const html=items.map(i=>makeCard(i,i._type)).join('');
    if(first){ grid.innerHTML=html; staggerCards(grid); }
    else { document.getElementById('gridLoader')?.remove(); staggerCards(grid,appendHtml(grid,html)); }
    if(feed.sources.every(s=>feed.page>=s.totalPages)){ feed.done=true; showGridEnd(feed); }
    return items.length;
  }catch(err){
    if(first) throw err;
    feed.errored=true;          // stop auto-loading until "Try again" is pressed
    setGridLoader('error');
    return 0;
  }finally{
    feed.loading=false;
    if(gridFeed===feed) requestAnimationFrame(maybeLoadMoreGrid); // keep filling tall screens
  }
}

function setGridLoader(state){
  const grid=document.getElementById('searchGrid');
  let el=document.getElementById('gridLoader');
  if(!el){ el=document.createElement('div'); el.id='gridLoader'; el.className='grid-loader'; grid.appendChild(el); }
  else grid.appendChild(el); // keep it last
  el.innerHTML=state==='error'
    ?'Couldn\'t load more. <button class="grid-retry" onclick="retryGridFeed()">Try again</button>'
    :'<div class="spinner"></div>';
}

function showGridEnd(feed){
  if(gridFeed!==feed||!feed.seen.size) return;
  setGridLoader('end');
  document.getElementById('gridLoader').innerHTML='<span class="grid-end">You\'ve reached the end</span>';
}

function retryGridFeed(){
  if(!gridFeed) return;
  gridFeed.errored=false;
  document.getElementById('gridLoader')?.remove();
  loadGridPage(gridFeed);
}

function maybeLoadMoreGrid(){
  const feed=gridFeed;
  if(!feed||feed.loading||feed.done||feed.errored||currentView!=='searchResults') return;
  const nearBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-900;
  if(nearBottom) loadGridPage(feed);
}
window.addEventListener('scroll',maybeLoadMoreGrid,{passive:true});

// "See all" for a home row: a full grid page of exactly what that row shows (same TMDB list),
// loading more as you scroll. Uses the row's current settings, e.g. the chosen streaming service.
let gridReturnScroll=null; // home page scroll position to restore when pressing Back

function seeAllRow(rowId,title){
  const feed=rowFeeds[rowId];
  if(!feed) return;
  const fromHome=currentView==='homeContent';
  const scrollY=window.scrollY;
  loadGridData(title,[{path:feed.path,params:feed.params,type:feed.type}],null);
  if(fromHome) gridReturnScroll=scrollY;
}

// Back from a grid page: return to the home page where you left it.
function backFromGrid(){
  const y=gridReturnScroll;
  stopGridFeed();
  showHome();
  if(y!=null) requestAnimationFrame(()=>window.scrollTo(0,y));
  gridReturnScroll=null;
}

// ---- Browse by genre ----
// Home shows the shared GENRES list as chips (Movies or TV); "See all" opens an endless grid of that
// genre with a Movies/TV switch, a genre dropdown and a random-pick button.
// TMDB's own genre lists are still used to show a random pick's genre names.
const genreLists={}; // 'movie' | 'tv' -> Promise<[{id,name}]>
function getGenres(type){
  if(!genreLists[type]) genreLists[type]=tmdb(`/genre/${type}/list`).then(d=>d.genres||[]).catch(err=>{delete genreLists[type];throw err;});
  return genreLists[type];
}

// One genre list shared by Movies and TV (home chips, genre page, Surprise Me page).
// TMDB uses different genre IDs for movies and TV, so each entry holds the `with_genres`
// value for both ('|' = any of). Movie-only genres use the closest TV genre(s):
// Horror -> Mystery, Thriller -> Crime/Mystery, Romance -> Drama, History -> War & Politics.
const GENRES=[
  {key:'action',      name:'Action',          movie:'28',    tv:'10759'},
  {key:'adventure',   name:'Adventure',       movie:'12',    tv:'10759'},
  {key:'animation',   name:'Animation',       movie:'16',    tv:'16'},
  {key:'comedy',      name:'Comedy',          movie:'35',    tv:'35'},
  {key:'crime',       name:'Crime',           movie:'80',    tv:'80'},
  {key:'documentary', name:'Documentary',     movie:'99',    tv:'99'},
  {key:'drama',       name:'Drama',           movie:'18',    tv:'18'},
  {key:'family',      name:'Family',          movie:'10751', tv:'10751|10762'},
  {key:'fantasy',     name:'Fantasy',         movie:'14',    tv:'10765'},
  {key:'history',     name:'History',         movie:'36',    tv:'10768'},
  {key:'horror',      name:'Horror',          movie:'27',    tv:'9648'},
  {key:'mystery',     name:'Mystery',         movie:'9648',  tv:'9648'},
  {key:'romance',     name:'Romance',         movie:'10749', tv:'18'},
  {key:'scifi',       name:'Science Fiction', movie:'878',   tv:'10765'},
  {key:'thriller',    name:'Thriller',        movie:'53',    tv:'80|9648'},
  {key:'war',         name:'War',             movie:'10752', tv:'10768'},
  {key:'western',     name:'Western',         movie:'37',    tv:'37'},
];
const findGenre=key=>GENRES.find(g=>g.key===key);
const genreParam=(key,type)=>findGenre(key)?.[type]||null;
// The genre chips start with "All" (no genre filter)
const GENRE_CHIPS=[{key:'all',name:'All'},...GENRES];
const findChip=key=>GENRE_CHIPS.find(g=>g.key===key);

// Streaming services for the Browse section's filter (TMDB watch-provider IDs, US availability).
const STREAMING_SERVICES=[
  {id:'8',   name:'Netflix'},
  {id:'337', name:'Disney+'},
  {id:'1899',name:'HBO Max'},
  {id:'9',   name:'Amazon Prime Video'},
  {id:'350', name:'Apple TV+'},
  {id:'15',  name:'Hulu'},
  {id:'531', name:'Paramount+'},
];
const WATCH_REGION='US';
const findService=id=>STREAMING_SERVICES.find(s=>s.id===id);

// TMDB discover filters for a genre chip + streaming service ('' = any service)
function browseFilters(type,genreKey,service){
  const p={include_adult:false};
  const ids=genreParam(genreKey,type);
  if(ids) p.with_genres=ids;
  if(findService(service)){ p.with_watch_providers=service; p.watch_region=WATCH_REGION; }
  return p;
}
// e.g. "Horror Movies on Netflix", "Popular TV Shows"
function browseTitle(type,genreKey,service){
  const g=findGenre(genreKey),s=findService(service);
  const what=`${g?g.name:'Popular'} ${type==='movie'?'Movies':'TV Shows'}`;
  return s?`${what} on ${s.name}`:what;
}

// Home "Browse": genre chips + streaming-service dropdown + Movies/TV toggle all filter one row.
// The choices stay put when switching Movies/TV, and all three are remembered.
const GENRE_BROWSE_KEY='sv_genre_browse';
let genreChipType='movie',genreChipSelected='action',genreChipService='';
{
  const saved=getSaved(GENRE_BROWSE_KEY,{});
  if(saved.type==='movie'||saved.type==='tv') genreChipType=saved.type;
  if(findChip(saved.genre)) genreChipSelected=saved.genre;
  if(findService(saved.service)) genreChipService=saved.service;
}
function saveGenreBrowse(){ setSaved(GENRE_BROWSE_KEY,{type:genreChipType,genre:genreChipSelected,service:genreChipService}); }

function renderBrowseServices(){
  const sel=document.getElementById('browseService');
  if(!sel) return;
  sel.innerHTML='<option value="">All services</option>'+STREAMING_SERVICES.map(s=>`<option value="${s.id}"${s.id===genreChipService?' selected':''}>${escHtml(s.name)}</option>`).join('');
}
function setBrowseService(id){
  genreChipService=findService(id)?id:'';
  saveGenreBrowse();
  fillGenreRow();
}

// So the row isn't the same every visit, each load picks one of these mixes at random
// (all live TMDB queries) and shuffles the cards.
const GENRE_ROW_MIXES=[
  ()=>({sort_by:'popularity.desc','vote_count.gte':50}),                         // popular right now
  type=>({sort_by:'popularity.desc','vote_count.gte':20,                         // recent releases
          [type==='movie'?'primary_release_date.gte':'first_air_date.gte']:yearsAgo(3)}),
  type=>({sort_by:'vote_average.desc','vote_count.gte':type==='movie'?500:200}), // top rated
];
function yearsAgo(n){ const d=new Date(); d.setFullYear(d.getFullYear()-n); return d.toISOString().slice(0,10); }

function renderGenreChips(){
  const el=document.getElementById('genreChips');
  if(!el) return;
  const sel=genreChipSelected;
  el.innerHTML=GENRE_CHIPS.map(g=>`<button class="genre-chip${g.key===sel?' active':''}" role="tab" aria-selected="${g.key===sel}" data-key="${g.key}" onclick="selectGenreChip('${g.key}')">${escHtml(g.name)}</button>`).join('');
  if(!el.dataset.drag){ enableDragScroll(el); el.dataset.drag='1'; }
  // Bring the selected chip into view horizontally without scrolling the page.
  const active=el.querySelector('.active');
  el.scrollLeft=active?active.offsetLeft-el.offsetLeft-(el.clientWidth-active.offsetWidth)/2:0;
  updateGenreArrows();
  fillGenreRow();
}
function selectGenreChip(key){
  genreChipSelected=key;
  saveGenreBrowse();
  document.querySelectorAll('#genreChips .genre-chip').forEach(b=>{
    const on=b.dataset.key===key;
    b.classList.toggle('active',on);b.setAttribute('aria-selected',on);
  });
  fillGenreRow();
}
let genreRowReq=0;
async function fillGenreRow(){
  const req=++genreRowReq,type=genreChipType;
  const base=browseFilters(type,genreChipSelected,genreChipService);
  const mix=GENRE_ROW_MIXES[Math.floor(Math.random()*GENRE_ROW_MIXES.length)];
  await fillRow('genreRow',`/discover/${type}`,{...base,...mix(type)},type,false,{shuffle:true});
  // A narrow mix (e.g. recent TV westerns on one service) can come back empty: fall back to popular.
  const feed=rowFeeds.genreRow;
  if(req===genreRowReq&&feed&&!feed.seen.size&&mix!==GENRE_ROW_MIXES[0]){
    fillRow('genreRow',`/discover/${type}`,{...base,...GENRE_ROW_MIXES[0](type)},type,false,{shuffle:true});
  }
}
function seeAllGenre(){
  openGenre(genreChipType,genreChipSelected,false,genreChipService);
}
function setGenreChipType(type){
  genreChipType=type;
  saveGenreBrowse();
  document.querySelectorAll('#homeContent .type-toggle-btn').forEach(b=>{
    const on=b.dataset.type===type;
    b.classList.toggle('active',on);
    b.setAttribute('aria-checked',on);
  });
  renderGenreChips();
}

// The "See all" browse page. key = a GENRE_CHIPS key ('all', 'action', ...),
// service = a STREAMING_SERVICES id or '' for any service.
function openGenre(type,key,keepReturn,service=''){
  const g=findChip(key);
  if(!g) return;
  if(!findService(service)) service='';
  const fromHome=currentView==='homeContent';
  const y=keepReturn?gridReturnScroll:window.scrollY;
  loadGridData(browseTitle(type,g.key,service),[{
    path:`/discover/${type}`,
    params:{...browseFilters(type,g.key,service),sort_by:'popularity.desc','vote_count.gte':service?10:50},
    type,
  }],null);
  if(fromHome||keepReturn) gridReturnScroll=y;
  renderGenreControls(type,g,service);
}

// Controls on the browse page: Movies/TV switch, genre + service dropdowns, random pick
function renderGenreControls(type,g,service){
  const s=findService(service);
  document.getElementById('gridControls').innerHTML=`
    <div class="type-toggle" role="radiogroup" aria-label="Movies or TV shows">
      <button class="type-toggle-btn${type==='movie'?' active':''}" role="radio" aria-checked="${type==='movie'}" onclick="openGenre('movie','${g.key}',true,'${service}')">Movies</button>
      <button class="type-toggle-btn${type==='tv'?' active':''}" role="radio" aria-checked="${type==='tv'}" onclick="openGenre('tv','${g.key}',true,'${service}')">TV</button>
    </div>
    <select class="provider-select" aria-label="Genre" onchange="openGenre('${type}',this.value,true,'${service}')">
      ${GENRE_CHIPS.map(x=>`<option value="${x.key}"${x.key===g.key?' selected':''}>${escHtml(x.key==='all'?'All genres':x.name)}</option>`).join('')}
    </select>
    <select class="provider-select" aria-label="Choose streaming service" onchange="openGenre('${type}','${g.key}',true,this.value)">
      <option value="">All services</option>
      ${STREAMING_SERVICES.map(x=>`<option value="${x.id}"${x.id===service?' selected':''}>${escHtml(x.name)}</option>`).join('')}
    </select>
    <button class="section-more grid-random-btn" title="Random pick from these titles" onclick="openRandomPick(genrePageRandomOpts)">${ICON_SHUFFLE}Surprise me</button>`;
  genrePageRandomOpts={type,genreId:genreParam(g.key,type),providerId:service||null,
    label:g.key==='all'?(s?s.name:''):g.name};
}
let genrePageRandomOpts={}; // what the genre page's "Surprise me" button picks from

// ---- Random pick ("Surprise me") ----
// Picks a random well-rated, well-known title (optionally within a genre). Shown in two
// places that share this code: the pop-up card (genre pages' "Surprise me") and the
// Surprise Me page. Each has its own "view" with its own element IDs and state.
const randomPagesCache={}; // query key -> total pages (saves a request on re-rolls)
function makeRandomView(ids){ return {ids,token:0,current:null,opts:{type:'movie'}}; }
const randomModalView=makeRandomView({body:'randomBody',again:'randomAgainBtn',view:'randomViewBtn',play:'randomPlayBtn',list:'randomListBtn'});
const randomPageView=makeRandomView({body:'randomPageBody',again:'randomPageAgainBtn',view:'randomPageViewBtn',play:'randomPagePlayBtn',list:'randomPageListBtn',backdrop:'randomPageBackdrop'});

const ICON_BOOKMARK_OFF='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
const ICON_BOOKMARK_ON='<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';

const rvEl=(view,key)=>document.getElementById(view.ids[key]);
function setRandomButtons(view,enabled){
  ['view','play','list'].forEach(k=>{ const b=rvEl(view,k); if(b) b.disabled=!enabled; });
}
function updateRandomListBtn(view){
  const btn=rvEl(view,'list');
  if(!btn) return;
  const inList=!!view.current&&getMyList().some(i=>String(i.id)===String(view.current.id));
  btn.innerHTML=inList?ICON_BOOKMARK_ON:ICON_BOOKMARK_OFF;
  const label=inList?'Remove from My List':'Add to My List';
  btn.title=label;btn.setAttribute('aria-label',label);
}

// Pop-up card
function openRandomPick(opts={}){
  const view=randomModalView;
  view.opts={type:'movie',...opts};
  view.current=null;
  const overlay=document.getElementById('randomOverlay');
  document.getElementById('randomLabel').textContent=opts.label?`Random ${opts.label} pick`:'Random pick';
  overlay.hidden=false;
  requestAnimationFrame(()=>overlay.classList.add('open'));
  rollRandomPick(view);
}
function closeRandomPick(){
  const overlay=document.getElementById('randomOverlay');
  randomModalView.token++;
  overlay.classList.remove('open');
  setTimeout(()=>{ if(!overlay.classList.contains('open')) overlay.hidden=true; },200);
}

async function rollRandomPick(view=randomModalView){
  const token=++view.token;
  const body=rvEl(view,'body');
  setRandomButtons(view,false);
  rvEl(view,'again').disabled=true;
  const backdrop=rvEl(view,'backdrop'); // Surprise Me page only
  if(backdrop){
    // Page: a placeholder shaped like the real card (poster + text lines), old backdrop fades out
    backdrop.classList.add('is-loading');
    body.innerHTML=`
      <div class="skeleton random-poster random-skel-poster" aria-hidden="true"></div>
      <div class="random-info random-skel-info" aria-busy="true" aria-label="Finding a pick">
        <div class="skeleton random-skel-title"></div>
        <div class="skeleton random-skel-meta"></div>
        <div class="skeleton random-skel-line"></div>
        <div class="skeleton random-skel-line"></div>
        <div class="skeleton random-skel-line"></div>
        <div class="skeleton random-skel-line random-skel-line-short"></div>
      </div>`;
  } else {
    body.innerHTML='<div class="random-loading"><div class="spinner"></div></div>';
  }
  const {type,genreId,providerId}=view.opts;
  const params={sort_by:'popularity.desc','vote_count.gte':300,'vote_average.gte':6.5,include_adult:false};
  if(genreId) params.with_genres=genreId;
  if(providerId){ params.with_watch_providers=providerId; params.watch_region=WATCH_REGION; params['vote_count.gte']=100; }
  const key=`${type}|${genreId||''}|${providerId||''}`;
  try{
    let pages=randomPagesCache[key],first=null;
    if(!pages){
      first=await tmdb(`/discover/${type}`,{...params,page:1});
      pages=randomPagesCache[key]=Math.max(1,Math.min(first.total_pages||1,30)); // top ~600 titles
    }
    const page=1+Math.floor(Math.random()*pages);
    const d=(page===1&&first)?first:await tmdb(`/discover/${type}`,{...params,page});
    if(token!==view.token) return;
    let list=(d.results||[]).filter(i=>i.poster_path&&i.id!==view.current?.id);
    if(!list.length) list=d.results||[];
    if(!list.length) throw new Error('empty');
    const pick=list[Math.floor(Math.random()*list.length)];
    let genreNames='';
    try{ const gl=await getGenres(type); genreNames=(pick.genre_ids||[]).slice(0,3).map(id=>gl.find(g=>g.id===id)?.name).filter(Boolean).join(' · '); }catch{}
    if(token!==view.token) return;
    const title=pick.title||pick.name||'Untitled';
    const year=(pick.release_date||pick.first_air_date||'').slice(0,4);
    view.current={id:pick.id,type,title,poster:pick.poster_path,rating:pick.vote_average,year};
    if(backdrop){
      // Swap the backdrop only once the new image has loaded, then fade it in
      if(pick.backdrop_path){
        const url=`${IMG}w1280${pick.backdrop_path}`,img=new Image();
        const show=()=>{ if(token!==view.token) return; backdrop.style.backgroundImage=`url("${url}")`; backdrop.classList.remove('is-loading'); };
        img.onload=show; img.onerror=()=>{ if(token===view.token){ backdrop.style.backgroundImage=''; backdrop.classList.remove('is-loading'); } };
        img.src=url;
      } else {
        backdrop.style.backgroundImage='';
        backdrop.classList.remove('is-loading');
      }
    }
    body.innerHTML=`
      <img class="random-poster" src="${IMG}w342${pick.poster_path}" alt="">
      <div class="random-info">
        <h3 class="random-title">${escHtml(title)}</h3>
        <div class="random-meta">${year?`<span>${year}</span>`:''}${pick.vote_average?`<span class="random-rating">${ICON_STAR}${pick.vote_average.toFixed(1)}</span>`:''}<span>${type==='movie'?'Movie':'TV Series'}</span></div>
        ${genreNames?`<div class="random-genres">${escHtml(genreNames)}</div>`:''}
        <p class="random-overview">${escHtml(pick.overview||'No description available.')}</p>
      </div>`;
    setRandomButtons(view,true);
    updateRandomListBtn(view);
  }catch{
    if(token!==view.token) return;
    if(backdrop){ backdrop.style.backgroundImage=''; backdrop.classList.remove('is-loading'); }
    body.innerHTML='<div class="random-loading">Couldn\'t find a pick. Try again.</div>';
  }finally{
    if(token===view.token) rvEl(view,'again').disabled=false;
  }
}

function viewRandomPick(view=randomModalView){
  if(!view.current) return;
  const {id,type}=view.current;
  if(view===randomModalView) closeRandomPick();
  openDetail(id,type,true);
}
// Play: open the title (so episode/resume/anime info is ready) and start it right away
async function playRandomPick(view=randomModalView){
  if(!view.current) return;
  const {id,type}=view.current;
  if(view===randomModalView) closeRandomPick();
  await openDetail(id,type,true);
  if(currentMediaMeta&&String(currentMediaMeta.id)===String(id)&&currentView==='detailPage') playFromDetail();
}
function toggleRandomInList(view=randomModalView){
  const item=view.current;
  if(!item) return;
  let list=getMyList();
  const exists=list.some(i=>String(i.id)===String(item.id));
  if(exists){
    list=list.filter(i=>String(i.id)!==String(item.id));
    showToast(`"${item.title}" removed from your list`);
  } else {
    list.unshift({...item});
    showToast(`"${item.title}" saved to your list`);
  }
  setSaved('sv_mylist',list);
  renderMyListRow();
  updateRandomListBtn(view);
}

document.addEventListener('DOMContentLoaded',()=>{
  const overlay=document.getElementById('randomOverlay');
  if(!overlay) return;
  overlay.addEventListener('click',e=>{ if(e.target===overlay) closeRandomPick(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!overlay.hidden) closeRandomPick(); });
});

// Surprise Me page
function showRandomPage(){
  stopGridFeed();
  switchPage('randomPage');
  setActiveNav(document.getElementById('navRandom'));
  renderRandomPageGenres();
  if(!randomPageView.current) rollRandomPick(randomPageView);
  else updateRandomListBtn(randomPageView); // My List may have changed meanwhile
}
// Same shared genre list as Browse by Genre; the chosen genre is kept when switching Movies/TV.
let randomPageGenreKey='';
function renderRandomPageGenres(){
  const sel=document.getElementById('randomPageGenre');
  sel.innerHTML='<option value="">Any genre</option>'+GENRES.map(g=>`<option value="${g.key}"${g.key===randomPageGenreKey?' selected':''}>${escHtml(g.name)}</option>`).join('');
}
function setRandomPageType(type){
  randomPageView.opts={type,genreId:genreParam(randomPageGenreKey,type)};
  document.querySelectorAll('#randomPageType .type-toggle-btn').forEach(b=>{
    const on=b.dataset.type===type;
    b.classList.toggle('active',on);b.setAttribute('aria-checked',on);
  });
  renderRandomPageGenres();
  rollRandomPick(randomPageView);
}
function setRandomPageGenre(value){
  randomPageGenreKey=value||'';
  randomPageView.opts={...randomPageView.opts,genreId:genreParam(randomPageGenreKey,randomPageView.opts.type)};
  rollRandomPick(randomPageView);
}

function loadGridData(title, apis, navElementId) {
  gridReturnScroll=null;
  switchPage('searchResults');
  document.getElementById('searchTitle').textContent=title;
  document.getElementById('searchCount').textContent='';
  startGridFeed(apis.map(a=>({path:a.path,params:a.params,type:a.type})));
  setActiveNav(document.getElementById(navElementId));
}

function browseMovies(){
  loadGridData('Popular Movies', [
      {path: '/movie/popular', type: 'movie'},
      {path: '/movie/top_rated', type: 'movie'},
      {path: '/movie/now_playing', type: 'movie'}
  ], 'navMovies');
}

function browseTV(){
  loadGridData('Popular TV Shows', [
      {path: '/tv/popular', type: 'tv'},
      {path: '/tv/top_rated', type: 'tv'},
      {path: '/tv/on_the_air', type: 'tv'}
  ], 'navTV');
}

function showRecent(){
  stopGridFeed();
  switchPage('searchResults');
  const recent=getRecent();
  document.getElementById('searchTitle').textContent='Continue Watching';
  document.getElementById('searchCount').textContent=`${recent.length} items`;
  const grid=document.getElementById('searchGrid');
  if(!recent.length){grid.innerHTML='<p style="color:var(--text3);padding:20px;grid-column:1/-1">Nothing here yet. Start watching something!</p>';return;}
  grid.innerHTML=recent.map(item => makeRecentCard(item, true)).join('');
  setActiveNav(document.getElementById('navRecent'));
}

function removeFromRecent(e, id) {
  e.stopPropagation();
  let recent = getRecent();
  recent = recent.filter(item => String(item.id) !== String(id));
  setSaved('sv_recent', recent);
  renderRecent(); 
  if (currentView === 'searchResults' && document.getElementById('searchTitle').textContent === 'Continue Watching') {
    showRecent();
  }
  showToast("Removed from history");
}

// Animates cards in one after another. Pass `els` to animate only newly appended cards
// (re-running it over existing cards would leave them unclickable).
function staggerCards(container, els) {
  if (!container) return;
  if (document.documentElement.classList.contains('low-power')) return;

  (els || Array.from(container.children)).forEach((child, idx) => {
    child.style.animationDelay = `${idx * 20}ms`;
    child.style.pointerEvents = 'none';
    child.addEventListener('animationend', () => {
      child.style.animation = 'none';
      child.style.pointerEvents = 'auto';
    }, { once: true });
  });
}

(function watchHeroActivity(){
  const heroEl=document.getElementById('hero');
  if(!heroEl)return;
  ['mousemove','mouseenter','click','touchstart','keydown','focusin'].forEach(evt=>{
    heroEl.addEventListener(evt,resetHeroTimer);
  });
})();

async function init(){
  renderRecent();renderMyListRow();loadHero();
  fillRow('trendMoviesRow','/trending/movie/day',{},'movie');
  fillRow('trendTVRow','/trending/tv/day',{},'tv');
  fillRow('topRatedRow','/movie/top_rated',{},'movie');
  fillRow('nowPlayingRow','/movie/now_playing',{},'movie',true);
  fillRow('topTVRow','/tv/top_rated',{},'tv');
  fillRow('upcomingRow','/movie/upcoming',{},'movie',true);
  renderBrowseServices();
  setGenreChipType(genreChipType); // restores the remembered Movies/TV toggle, genre + service

  handleUrlRouting();
}
init();

/* TV remote D-pad navigation: arrow keys move focus between interactive
   elements geometrically instead of relying on the emulated mouse cursor. */
function getFocusCandidates(){
  return Array.from(document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el =>
    !el.classList.contains('remove-recent-btn') &&
    !el.classList.contains('episode-watched-btn') &&
    el.id !== 'searchInput' &&
    !el.closest('.switch') &&
    el.offsetParent !== null
  );
}

function navigateFocus(dir){
  const candidates = getFocusCandidates();
  if(!candidates.length) return;
  const current = document.activeElement;
  if(!current || current === document.body || !candidates.includes(current)){
    candidates[0].focus();
    return;
  }
  const curRect = current.getBoundingClientRect();
  const cx = curRect.left + curRect.width/2, cy = curRect.top + curRect.height/2;
  let best = null, bestScore = Infinity;
  for(const el of candidates){
    if(el === current) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width/2, ey = r.top + r.height/2;
    const dx = ex - cx, dy = ey - cy;
    let pass, primary, secondary;
    if(dir === 'left'){ pass = dx < -4; primary = -dx; secondary = Math.abs(dy); }
    else if(dir === 'right'){ pass = dx > 4; primary = dx; secondary = Math.abs(dy); }
    else if(dir === 'up'){ pass = dy < -4; primary = -dy; secondary = Math.abs(dx); }
    else { pass = dy > 4; primary = dy; secondary = Math.abs(dx); }
    if(!pass) continue;
    const score = primary + secondary * 2;
    if(score < bestScore){ bestScore = score; best = el; }
  }
  if(best) best.focus();
}

document.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if(activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

  if(e.key === 'Enter' || e.key === ' '){
    const el = document.activeElement;
    const role = el && el.getAttribute && el.getAttribute('role');
    if(role === 'button' || role === 'switch'){
      e.preventDefault();
      el.click();
    }
    return;
  }

  const dirMap = {ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right'};
  const dir = dirMap[e.key];
  if(!dir) return;
  e.preventDefault();
  navigateFocus(dir);
});

document.addEventListener('focusin', (e) => {
  if(e.target && e.target.scrollIntoView){
    e.target.scrollIntoView({behavior:'smooth', block:'nearest', inline:'nearest'});
  }
});