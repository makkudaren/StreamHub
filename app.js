// ============================================================
//  StreamHub · app.js
//  All original functionality preserved.
//  Player customized with Vidking params: autoPlay, nextEpisode,
//  episodeSelector, and green accent color (30d158 → 30d158).
// ============================================================

// ── Configuration ────────────────────────────────────────────
const TMDB_API_KEY  = '98ec65682824bd46bc5b926e5b267f43';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL  = 'https://image.tmdb.org/t/p/w500';

// Vidking player customization
const PLAYER_COLOR    = '30d158';           // Green accent (hex, no #)
const PLAYER_MOVIE_PARAMS = `color=${PLAYER_COLOR}&autoPlay=true`;
const PLAYER_TV_PARAMS    = `color=${PLAYER_COLOR}&autoPlay=true&nextEpisode=true&episodeSelector=true`;

// ── Global State ─────────────────────────────────────────────
let currentTab    = 'movie';
let searchTimeout = null;
let currentTvId   = null;

// ── DOM References ───────────────────────────────────────────
const dashboardView = document.getElementById('dashboard-view');
const playerView    = document.getElementById('player-view');
const movieGrid     = document.getElementById('movie-grid');
const vidkingPlayer = document.getElementById('vidking-player');
const progressLog   = document.getElementById('progress-log');
const searchInput   = document.getElementById('search-input');
const gridTitle     = document.getElementById('grid-title');
const gridEyebrow   = document.getElementById('grid-eyebrow');
const tabContainer  = document.getElementById('tab-container');
const tabMovie      = document.getElementById('tab-movie');
const tabTv         = document.getElementById('tab-tv');
const tvControls    = document.getElementById('tv-controls');
const seasonList    = document.getElementById('season-list');
const episodeList   = document.getElementById('episode-list');
const chromeLabel   = document.getElementById('chrome-label');

// ── Theme Toggle ─────────────────────────────────────────────
function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('sh-theme', next);
}

(function applyStoredTheme() {
    const stored = localStorage.getItem('sh-theme');
    if (stored) document.documentElement.setAttribute('data-theme', stored);
})();

// ── Fetch Trending ───────────────────────────────────────────
async function fetchTrending() {
    showSkeletons();
    try {
        const res  = await fetch(`${TMDB_BASE_URL}/trending/${currentTab}/week?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        const resultsWithType = data.results.map(item => ({ ...item, media_type: currentTab }));
        renderGrid(resultsWithType);
    } catch (err) {
        console.error('Error fetching trending:', err);
        movieGrid.innerHTML = '<p style="color:var(--accent);grid-column:1/-1;padding:20px 0;">Failed to load content. Check your network.</p>';
    }
}

// ── Tab Switching ─────────────────────────────────────────────
function switchTab(type) {
    currentTab = type;
    searchInput.value = '';

    if (type === 'movie') {
        tabMovie.classList.add('active');
        tabTv.classList.remove('active');
        gridTitle.textContent   = 'Movies';
        gridEyebrow.textContent = 'TRENDING THIS WEEK';
    } else {
        tabTv.classList.add('active');
        tabMovie.classList.remove('active');
        gridTitle.textContent   = 'TV Shows';
        gridEyebrow.textContent = 'TRENDING THIS WEEK';
    }

    fetchTrending();
}

// ── Search ───────────────────────────────────────────────────
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    searchTimeout = setTimeout(() => {
        if (query.length > 0) {
            tabContainer.classList.add('hidden');
            gridEyebrow.textContent = 'SEARCH RESULTS';
            searchMulti(query);
        } else {
            tabContainer.classList.remove('hidden');
            switchTab(currentTab);
        }
    }, 500);
});

async function searchMulti(query) {
    showSkeletons();
    try {
        const res  = await fetch(`${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        const data = await res.json();

        gridTitle.textContent = `"${query}"`;

        const filtered = data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv');

        if (filtered.length === 0) {
            movieGrid.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;padding:20px 0;">No titles matched your search.</p>';
        } else {
            renderGrid(filtered);
        }
    } catch (err) {
        console.error('Search error:', err);
    }
}

// ── Skeleton Loaders ─────────────────────────────────────────
function showSkeletons(count = 10) {
    movieGrid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'skeleton-card';
        movieGrid.appendChild(sk);
    }
}

// ── Render Grid ──────────────────────────────────────────────
function renderGrid(items) {
    movieGrid.innerHTML = '';

    items.forEach((item, idx) => {
        if (!item.poster_path) return;

        const title    = item.media_type === 'tv' ? item.name : item.title;
        const typeIcon = item.media_type === 'tv'
            ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`
            : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`;

        const card = document.createElement('div');
        card.className = 'media-card';
        card.style.animationDelay = `${idx * 40}ms`;
        card.onclick = () => launchPlayer(item.id, item.media_type, 1, 1);

        card.innerHTML = `
            <img src="${IMG_BASE_URL}${item.poster_path}" alt="${title}" loading="lazy">
            <div class="card-overlay">
                <div class="play-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
                <div class="card-type-badge">
                    ${typeIcon}
                    <span>${item.media_type.toUpperCase()}</span>
                </div>
            </div>
            <div class="card-title-bar">
                <p>${title}</p>
            </div>
        `;

        movieGrid.appendChild(card);
    });
}

// ── Launch Player ─────────────────────────────────────────────
function launchPlayer(id, mediaType, season = 1, episode = 1) {
    dashboardView.classList.add('hidden');
    playerView.classList.remove('hidden');

    const url = new URL(window.location);
    url.searchParams.set('type', mediaType);
    url.searchParams.set('id', id);

    if (mediaType === 'tv') {
        currentTvId = id;
        tvControls.classList.remove('hidden');

        url.searchParams.set('s', season);
        url.searchParams.set('e', episode);

        vidkingPlayer.src = `https://www.vidking.net/embed/tv/${id}/${season}/${episode}?${PLAYER_TV_PARAMS}`;
        chromeLabel.textContent = `TV · Season ${season} · Episode ${episode}`;

        loadSeasons(id, season);
    } else {
        currentTvId = null;
        tvControls.classList.add('hidden');

        url.searchParams.delete('s');
        url.searchParams.delete('e');

        vidkingPlayer.src = `https://www.vidking.net/embed/movie/${id}?${PLAYER_MOVIE_PARAMS}`;
        chromeLabel.textContent = `Movie · Loading stream…`;
    }

    window.history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Show Dashboard ────────────────────────────────────────────
function showDashboard() {
    playerView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    vidkingPlayer.src = '';
    progressLog.textContent = 'Waiting for stream data…';

    const url = new URL(window.location);
    url.searchParams.delete('type');
    url.searchParams.delete('id');
    url.searchParams.delete('s');
    url.searchParams.delete('e');
    window.history.pushState({}, '', url);
}

// ── Load Seasons ──────────────────────────────────────────────
async function loadSeasons(tvId, activeSeason = 1) {
    try {
        const res  = await fetch(`${TMDB_BASE_URL}/tv/${tvId}?api_key=${TMDB_API_KEY}`);
        const data = await res.json();

        seasonList.innerHTML = '';

        const seasons = data.seasons.filter(s => s.season_number > 0);
        seasons.forEach(season => {
            const btn = document.createElement('button');
            btn.className = 'season-btn';
            btn.textContent = `Season ${season.season_number}`;
            
            // Highlight the active season
            if (season.season_number == activeSeason) {
                btn.classList.add('active');
            }

            btn.onclick = () => {
                // Visually update the active button
                document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Load the episodes for the clicked season
                loadEpisodes(tvId, season.season_number);
            };

            seasonList.appendChild(btn);
        });

        if (seasons.length > 0) loadEpisodes(tvId, activeSeason);
    } catch (err) {
        console.error('Failed to load seasons:', err);
    }
}

// ── Load Episodes ─────────────────────────────────────────────
async function loadEpisodes(tvId, seasonNumber) {
    try {
        const res  = await fetch(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`);
        const data = await res.json();

        episodeList.innerHTML = '';

        data.episodes.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = 'episode-btn';
            btn.onclick   = () => launchPlayer(tvId, 'tv', seasonNumber, ep.episode_number);

            // Construct image URL (with a fallback if TMDB doesn't have an image)
            const imgUrl = ep.still_path 
                ? `${IMG_BASE_URL}${ep.still_path}` 
                : 'https://via.placeholder.com/300x169?text=No+Image';
            
            // Truncate overview if it's too long, or add a fallback
            const overview = ep.overview ? ep.overview : 'No description available for this episode.';

            btn.innerHTML = `
                <div class="ep-thumb">
                    <img src="${imgUrl}" alt="Episode ${ep.episode_number}" loading="lazy">
                    <div class="ep-play-overlay">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    </div>
                </div>
                <div class="ep-details">
                    <span class="ep-title">${ep.episode_number}. ${ep.name}</span>
                    <span class="ep-desc">${overview}</span>
                </div>
            `;
            episodeList.appendChild(btn);
        });
    } catch (err) {
        console.error('Failed to load episodes:', err);
    }
}

// ── Progress Tracking ─────────────────────────────────────────
window.addEventListener('message', (event) => {
    try {
        const msg = JSON.parse(event.data);
        if (msg.type !== 'PLAYER_EVENT') return;

        const d = msg.data;
        let log = `[${d.event.toUpperCase()}]  id: ${d.id}  ·  progress: ${d.progress.toFixed(1)}%`;
        if (d.mediaType === 'tv') log += `  ·  S${d.season}E${d.episode}`;
        if (d.currentTime !== undefined) log += `  ·  ${formatTime(d.currentTime)} / ${formatTime(d.duration)}`;

        progressLog.textContent = log;
        chromeLabel.textContent = d.mediaType === 'tv'
            ? `TV · S${d.season}E${d.episode} · ${d.progress.toFixed(1)}%`
            : `Movie · ${d.progress.toFixed(1)}%`;
    } catch (_) {}
});

function formatTime(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
}

// ── Init ──────────────────────────────────────────────────────
function initApp() {
    const params = new URLSearchParams(window.location.search);
    const type   = params.get('type');
    const id     = params.get('id');

    if (id && type) {
        const s = params.get('s') || 1;
        const e = params.get('e') || 1;
        launchPlayer(id, type, s, e);
    }

    fetchTrending();
}

initApp();