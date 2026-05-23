
const TMDB_KEY='98ec65682824bd46bc5b926e5b267f43';
const TMDB='https://api.themoviedb.org/3';
const IMG='https://image.tmdb.org/t/p/';
const VID='https://www.vidking.net/embed';
const COLOR='e8271a';

let heroItems=[],currentHeroIdx=0,heroItem=null,heroTimer=null,searchTimer=null;
let currentModal=null,currentPlayerSeason=1,currentPlayerEpisode=1,currentMediaMeta=null;

function getSaved(k,d=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
function setSaved(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function getRecent(){return getSaved('sv_recent',[])}
function getProgress(id){return getSaved('sv_progress_'+id,0)}
function saveProgress(id,pct){setSaved('sv_progress_'+id,pct)}
function saveRecent(item){
  let l=getRecent();
  const existing = l.find(i => i.id === item.id);
  if(existing) {
    item = { ...existing, ...item };
  }
  l=l.filter(i=>i.id!==item.id);
  l.unshift(item);
  if(l.length>20)l=l.slice(0,20);
  setSaved('sv_recent',l);
}

function getMyList() { return getSaved('sv_mylist', []); }

function toggleMyList() {
  if (!currentMediaMeta) return;
  let list = getMyList();
  const exists = list.find(i => i.id === currentMediaMeta.id);
  const btn = document.querySelector('.modal-actions .btn-glass');
  
  if (exists) {
    list = list.filter(i => i.id !== currentMediaMeta.id);
    showToast(`"${currentMediaMeta.title}" removed from your list`);
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
  } else {
    list.unshift(currentMediaMeta);
    showToast(`"${currentMediaMeta.title}" saved to your list`);
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Saved`;
  }
  
  setSaved('sv_mylist', list);
  renderMyListRow();
}

function removeFromMyList(e, id) {
  e.stopPropagation();
  let list = getMyList();
  list = list.filter(item => item.id !== id);
  setSaved('sv_mylist', list);
  renderMyListRow();
  
  if (document.getElementById('searchResults').classList.contains('visible') && document.getElementById('searchTitle').textContent === 'My List') {
    showMyList();
  }
  showToast("Removed from My List");
}

let isDark=true;
function toggleTheme(){
  isDark=!isDark;
  document.documentElement.setAttribute('data-theme',isDark?'dark':'light');
  document.getElementById('themeIcon').innerHTML=isDark
    ?'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    :'<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
}

window.addEventListener('scroll', () => {
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 20);
});

// Run URL param check once on page load instead:
(function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const movie = params.get('movie');
  const tv = params.get('tv');
  if (movie) openDetail(movie, 'movie');
  else if (tv) openDetail(tv, 'tv');
})();

function setActiveNav(el){
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
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

function skeletonRow(row,n=8){
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
  return`<div class="card" onclick="openDetail(${item.id},'${type}')">
    ${poster?`<img class="card-poster" src="${poster}" alt="${title}" loading="lazy">`:`<div class="card-poster skeleton"></div>`}
    ${isNew?'<div class="card-badge">New</div>':''}
    ${prog>0?`<div class="card-progress"><div class="card-progress-fill" style="width:${prog}%"></div></div>`:''}
    <div class="card-info">
      <div class="card-title">${title}</div>
      <div class="card-meta"><span class="card-rating">★ ${rating}</span><span>${year}</span></div>
    </div>
  </div>`;
}

function makeWideCard(item,type){
  const thumb=item.backdrop_path?`${IMG}w500${item.backdrop_path}`:(item.poster_path?`${IMG}w342${item.poster_path}`:'');
  const title=item.title||item.name||'Untitled';
  const prog=getProgress(item.id);
  return`<div class="card card-wide" onclick="openDetail(${item.id},'${type}')">
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

  return `<div class="card" onclick="openDetail(${item.id},'${item.type}')">
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

  return `<div class="card" onclick="openDetail(${item.id},'${item.type}')">
    ${removeBtn}
    ${poster ? `<img class="card-poster" src="${poster}" alt="${item.title}" loading="lazy">` : fallbackIcon}
    ${prog > 0 ? `<div class="card-progress"><div class="card-progress-fill" style="width:${prog}%"></div></div>` : ''}
    <div class="card-info">
      <div class="card-title">${item.title || 'Unknown'}</div>
      <div class="card-meta"><span style="text-transform:capitalize">${item.type}</span>${item.year ? ` · ${item.year}` : ''}</div>
    </div>
  </div>`;
}

async function fillRow(rowId,path,params={},type='movie',wide=false){
  const row=document.getElementById(rowId);if(!row)return;
  skeletonRow(row);
  try{
    const d=await tmdb(path,params);
    row.innerHTML=(d.results||[]).map(i=>wide?makeWideCard(i,type):makeCard(i,type)).join('');
  }catch{row.innerHTML='<p style="color:var(--text3);padding:20px">Failed to load.</p>'}
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
    heroTimer=setInterval(()=>setHero((currentHeroIdx+1)%heroItems.length),7000);
  }catch{}
}

function renderHeroIndicators(){
  const el=document.getElementById('heroIndicators');
  el.innerHTML=heroItems.map((_,i)=>`<button class="hero-dot-btn${i===0?' active':''}" onclick="setHero(${i})"></button>`).join('');
}

async function setHero(idx){
  currentHeroIdx=idx;heroItem=heroItems[idx];
  document.querySelectorAll('.hero-dot-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));
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

function playFromHero(){if(heroItem) playMovie(heroItem.id, heroItem.title, heroItem.poster_path);}
function infoFromHero(){if(heroItem)openDetail(heroItem.id,'movie')}

function playMovie(id, title, posterPath = ''){
  const prog=getProgress(id);
  const src=`${VID}/movie/${id}?color=${COLOR}&autoPlay=true${prog>0?`&progress=${Math.floor(prog*36)}`:''}`;
  openPlayer(src,title||'');
  if (currentMediaMeta && currentMediaMeta.id === id) {
    saveRecent(currentMediaMeta);
  } else {
    saveRecent({id, type:'movie', title, year:'', poster: posterPath});
  }
  renderRecent();
}

async function openDetail(id,type){
  const overlay=document.getElementById('detailModal');
  overlay.classList.add('open');
  if (window.innerWidth <= 860) createBackButton('modal');
  currentModal={id,type};
  document.getElementById('modalTitle').textContent='Loading...';
  document.getElementById('modalMeta').innerHTML='';
  document.getElementById('modalActions').innerHTML='';
  document.getElementById('modalOverview').textContent='';
  document.getElementById('modalCast').innerHTML='';
  document.getElementById('modalEpisodes').innerHTML='';
  
  const backdropImg = document.getElementById('modalBackdrop');
  const imageLoader = document.getElementById('modalImageLoader');
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
    const rating=(d.vote_average||0).toFixed(1);
    const runtime=d.runtime?`${d.runtime} min`:(d.episode_run_time?.[0]?`~${d.episode_run_time[0]} min/ep`:'');
    const genres=(d.genres||[]).slice(0,3).map(g=>g.name).join(', ');
    
    if(d.backdrop_path) {
        backdropImg.src=`${IMG}w1280${d.backdrop_path}`;
    } else if(d.poster_path) {
        backdropImg.src=`${IMG}w780${d.poster_path}`;
    } else {
        imageLoader.classList.add('hidden');
    }

    document.getElementById('modalTitle').textContent=title;
    document.getElementById('modalMeta').innerHTML=`
      <div class="modal-rating">★ ${rating}</div>
      <span class="modal-tag">${year}</span>
      ${runtime?`<span class="modal-tag">${runtime}</span>`:''}
      ${genres?`<span class="modal-tag">${genres}</span>`:''}
      <span class="modal-tag">${type==='movie'?'Movie':'TV Series'}</span>
    `;
    const prog=getProgress(id);
    currentMediaMeta = {id, type, title, poster: d.poster_path, rating: d.vote_average, year};
    const isInList = getMyList().some(i => i.id === id);

    document.getElementById('modalActions').innerHTML=`
      <button class="btn btn-primary" onclick="playMedia(${id},'${type}','${title.replace(/'/g,"\\'")}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        ${prog>0?'Continue':'Play Now'}
      </button>
      <button class="btn btn-glass" onclick="toggleMyList()">
        ${isInList 
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Saved` 
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> My List`}
      </button>
    `;
    document.getElementById('modalOverview').textContent=d.overview||'No description available.';
    const cast=(d.credits?.cast||[]).slice(0,8);
    if(cast.length){
      document.getElementById('modalCast').innerHTML=`
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
      currentPlayerSeason=1;currentPlayerEpisode=1;
      await loadSeasons(id,d.seasons||[],d);
    }
  }catch{
    document.getElementById('modalTitle').textContent='Failed to load.';
  }
  const newUrl = `${window.location.pathname}?${type}=${id}`;
  window.history.pushState({modal: {id, type}}, '', newUrl);
}

async function loadSeasons(tvId,seasons,show){
  const realSeasons=seasons.filter(s=>s.season_number>0);
  if(!realSeasons.length)return;
  const container=document.getElementById('modalEpisodes');
  container.innerHTML=`
    <div class="glass-divider"></div>
    <p class="section-label" style="margin-bottom:14px">Episodes</p>
    <div class="season-tabs" id="seasonTabs">${realSeasons.map(s=>`
      <button class="season-tab${s.season_number===1?' active':''}" onclick="selectSeason(${tvId},${s.season_number},this)">
        Season ${s.season_number}
      </button>`).join('')}
    </div>
    <div id="episodesList"><div class="loading-center"><div class="spinner"></div></div></div>
  `;
  await loadEpisodes(tvId,1,show.name||show.title||'');
}

async function selectSeason(tvId,num,btn){
  document.querySelectorAll('.season-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');currentPlayerSeason=num;
  await loadEpisodes(tvId,num,'');
}

async function loadEpisodes(tvId,season){
  const el=document.getElementById('episodesList');
  el.innerHTML='<div class="loading-center"><div class="spinner"></div></div>';
  try{
    const d=await tmdb(`/tv/${tvId}/season/${season}`);
    const eps=d.episodes||[];
    el.innerHTML=`<div class="episodes-grid">${eps.map(ep=>{
      const thumb=ep.still_path?`${IMG}w400${ep.still_path}`:'';
      const prog=getProgress(`${tvId}_s${season}e${ep.episode_number}`);
      return`<div class="episode-card" onclick="playEpisode(${tvId},${season},${ep.episode_number},'${(ep.name||'').replace(/'/g,"\\'")}')">
        <div class="episode-thumb-wrap">
          ${thumb?`<img class="episode-thumb" src="${thumb}" alt="${ep.name}" loading="lazy">`:`<div class="episode-thumb skeleton" style="height:100%"></div>`}
          <div class="episode-num">E${ep.episode_number}</div>
          <div class="episode-play-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          ${prog>0?`<div class="ep-progress-wrap" style="position:absolute;bottom:0;left:0;right:0"><div class="ep-progress-fill" style="width:${prog}%"></div></div>`:''}
        </div>
        <div class="episode-info">
          <div class="episode-title">${ep.name||'Episode '+ep.episode_number}</div>
          <div class="episode-desc">${ep.overview||'No description available.'}</div>
          ${ep.air_date?`<div class="episode-air">${ep.air_date}</div>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
  }catch{
    el.innerHTML='<p style="color:var(--text3);padding:20px">Failed to load episodes.</p>';
  }
}

function closeDetailModal(e){if(e.target===e.currentTarget)closeDetailModalBtn()}
function closeDetailModalBtn(){
  document.getElementById('detailModal').classList.remove('open');
  document.body.style.overflow='';
  window.history.pushState(null, '', window.location.pathname);
}

function playMedia(id,type,title,s,e){
  if(type==='movie') {
      playMovie(id, title);
  } else {
      playEpisode(id, s||currentPlayerSeason||1, e||currentPlayerEpisode||1, title);
  }
}

function playEpisode(tvId,season,ep,epName){
  currentPlayerSeason=season;currentPlayerEpisode=ep;
  const prog=getProgress(`${tvId}_s${season}e${ep}`);
  const src=`${VID}/tv/${tvId}/${season}/${ep}?color=${COLOR}&autoPlay=true&nextEpisode=true&episodeSelector=true${prog>0?`&progress=${Math.floor(prog*36)}`:''}`;
  openPlayer(src,`S${season} E${ep} – ${epName||''}`);
  if (currentMediaMeta && currentMediaMeta.id === tvId) {
    saveRecent(currentMediaMeta);
    renderRecent();
  }
}

function openPlayer(src,label){
  document.getElementById('playerFrame').src=src;
  document.getElementById('playerTitleText').textContent=label;
  document.getElementById('playerModal').classList.add('open');
  document.body.style.overflow='hidden';
  
  if (window.innerWidth <= 860) createBackButton('player');
  
  window.addEventListener('message',handlePlayerMessage);
  const params = new URLSearchParams(window.location.search);
  if(currentPlayerSeason) params.set('s', currentPlayerSeason);
  if(currentPlayerEpisode) params.set('e', currentPlayerEpisode);
  params.set('play', 'true');
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

function closePlayerModal(e){if(e.target===e.currentTarget)closePlayerModalBtn()}
function closePlayerModalBtn(){
  document.getElementById('playerModal').classList.remove('open');
  document.getElementById('playerFrame').src='';
  document.body.style.overflow='';
  const params = new URLSearchParams(window.location.search);
  params.delete('play');
  params.delete('s');
  params.delete('e');
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

function handlePlayerMessage(event){
  try{
    const msg=typeof event.data==='string'?JSON.parse(event.data):event.data;
    if(msg?.type==='PLAYER_EVENT'&&msg.data){
      const{id,mediaType,progress,season,episode}=msg.data;
      if(id&&progress!=null){
        if(mediaType==='tv'&&season&&episode)saveProgress(`${id}_s${season}e${episode}`,Math.min(100,progress));
        else saveProgress(id,Math.min(100,progress));
      }
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
}

function renderMyListRow() {
  const list = getMyList();
  const section = document.getElementById('myListSection');
  const row = document.getElementById('myListRow');
  if(!list.length) { section.style.display='none'; return; }
  section.style.display='block';
  row.innerHTML = list.map(item => makeListCard(item, true)).join('');
}

function showMyList() {
  const list = getMyList();
  document.getElementById('homeContent').classList.add('hidden');
  document.getElementById('searchResults').classList.add('visible');
  document.getElementById('searchTitle').textContent = 'My List';
  document.getElementById('searchCount').textContent = `${list.length} items`;
  const grid = document.getElementById('searchGrid');
  if(!list.length) { grid.innerHTML='<p style="color:var(--text3);padding:20px;grid-column:1/-1">Your list is empty. Start saving some movies or shows!</p>'; return; }
  grid.innerHTML = list.map(item => makeListCard(item, true)).join('');
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
  showHomePage();
}

function debounceSearch(val){
  clearTimeout(searchTimer);
  if(!val.trim()){showHomePage();return;}
  searchTimer=setTimeout(()=>doSearch(val),400);
}

async function doSearch(q){
  document.getElementById('homeContent').classList.add('hidden');
  document.getElementById('searchResults').classList.add('visible');
  document.getElementById('searchTitle').textContent=`Results for "${q}"`;
  document.getElementById('searchCount').textContent='Searching...';
  const grid=document.getElementById('searchGrid');
  grid.innerHTML='<div class="loading-center" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try{
    const[movies,tv]=await Promise.all([tmdb('/search/movie',{query:q}),tmdb('/search/tv',{query:q})]);
    const all=[...(movies.results||[]).map(i=>({...i,_type:'movie'})),...(tv.results||[]).map(i=>({...i,_type:'tv'}))].sort((a,b)=>(b.popularity||0)-(a.popularity||0));
    document.getElementById('searchCount').textContent=`${all.length} results found`;
    if(!all.length){grid.innerHTML='<p style="color:var(--text3);padding:20px;grid-column:1/-1">No results found.</p>';return;}
    grid.innerHTML=all.map(i=>makeCard(i,i._type)).join('');
  }catch{grid.innerHTML='<p style="color:var(--text3);padding:20px;grid-column:1/-1">Search failed.</p>'}
}

function showHome(){
  showHomePage();
  closeSearch();
  document.getElementById('searchInput').value='';
  setActiveNav(document.getElementById('navHome'));
}

function showHomePage(){
  document.getElementById('homeContent').classList.remove('hidden');
  document.getElementById('searchResults').classList.remove('visible');
}

function loadGridData(title, apis, navElementId) {
  document.getElementById('homeContent').classList.add('hidden');
  document.getElementById('searchResults').classList.add('visible');
  document.getElementById('searchTitle').textContent=title;
  document.getElementById('searchCount').textContent='';
  const grid=document.getElementById('searchGrid');
  grid.innerHTML='<div class="loading-center" style="grid-column:1/-1"><div class="spinner"></div></div>';
  
  Promise.all(apis.map(api => tmdb(api.path))).then(responses => {
    let all = [];
    responses.forEach((res, index) => {
        all = all.concat((res.results||[]).map(i => ({...i, _type: apis[index].type})));
    });
    const seen=new Set();
    const unique=all.filter(i=>!seen.has(i.id)&&seen.add(i.id));
    grid.innerHTML=unique.map(i=>makeCard(i,i._type)).join('');
  }).catch(()=>{grid.innerHTML='<p style="color:var(--text3);padding:20px;grid-column:1/-1">Failed to load.</p>'});
  
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
  const recent=getRecent();
  document.getElementById('homeContent').classList.add('hidden');
  document.getElementById('searchResults').classList.add('visible');
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
  recent = recent.filter(item => item.id !== id);
  setSaved('sv_recent', recent);
  renderRecent(); 
  if (document.getElementById('searchResults').classList.contains('visible') && document.getElementById('searchTitle').textContent === 'Continue Watching') {
    showRecent();
  }
  showToast("Removed from history");
}

function createBackButton(type) {
  const btn = document.createElement('button');
  btn.className = 'back-btn-float';
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="19" y1="12" x2="9" y2="12"/>
                        <path d="M15 18l-6-6 6-6"/>
                    </svg>`;
  btn.onclick = () => {
    if (type === 'modal') closeDetailModalBtn();
    else closePlayerModalBtn();
    document.body.removeChild(btn);
  };
  document.body.appendChild(btn);
}

async function init(){
  renderRecent();renderMyListRow();loadHero();
  fillRow('trendMoviesRow','/trending/movie/day',{},'movie');
  fillRow('trendTVRow','/trending/tv/day',{},'tv');
  fillRow('topRatedRow','/movie/top_rated',{},'movie');
  fillRow('nowPlayingRow','/movie/now_playing',{},'movie',true);
  fillRow('actionRow','/discover/movie',{with_genres:'28,53'},'movie');
  fillRow('topTVRow','/tv/top_rated',{},'tv');
  fillRow('upcomingRow','/movie/upcoming',{},'movie',true);
}
init();

