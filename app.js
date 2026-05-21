// Initialize Icons
lucide.createIcons();

// Configuration
const TMDB_API_KEY = '98ec65682824bd46bc5b926e5b267f43';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Global State
let currentTab = 'movie'; // 'movie' or 'tv'
let searchTimeout;

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const playerView = document.getElementById('player-view');
const movieGrid = document.getElementById('movie-grid');
const vidkingPlayer = document.getElementById('vidking-player');
const progressLog = document.getElementById('progress-log');
const searchInput = document.getElementById('search-input');
const gridTitle = document.getElementById('grid-title');
const gridIcon = document.getElementById('grid-icon');
const tabContainer = document.getElementById('tab-container');
const tabMovie = document.getElementById('tab-movie');
const tabTv = document.getElementById('tab-tv');

// Fetch Trending Content Based on Active Tab
async function fetchTrending() {
    try {
        const response = await fetch(`${TMDB_BASE_URL}/trending/${currentTab}/week?api_key=${TMDB_API_KEY}`);
        const data = await response.json();
        
        // Inject the explicit media type into trending items since endpoints split them
        const resultsWithType = data.results.map(item => ({
            ...item,
            media_type: currentTab
        }));
        
        renderGrid(resultsWithType);
    } catch (error) {
        console.error('Error fetching trending:', error);
        movieGrid.innerHTML = '<p class="text-red-500">Failed to load content. Verify your TMDB API Key.</p>';
    }
}

// Switch Dashboard Tabs
function switchTab(type) {
    currentTab = type;
    searchInput.value = ''; // Reset search on tab switch
    
    // Update Tab UI States
    if (type === 'movie') {
        tabMovie.className = "flex items-center gap-2 text-lg font-medium border-b-2 border-red-600 pb-2 px-1 text-white transition-all";
        tabTv.className = "flex items-center gap-2 text-lg font-medium border-b-2 border-transparent pb-2 px-1 text-gray-400 hover:text-white transition-all";
        gridTitle.innerText = 'Trending Movies';
        gridIcon.setAttribute('data-lucide', 'film');
    } else {
        tabTv.className = "flex items-center gap-2 text-lg font-medium border-b-2 border-red-600 pb-2 px-1 text-white transition-all";
        tabMovie.className = "flex items-center gap-2 text-lg font-medium border-b-2 border-transparent pb-2 px-1 text-gray-400 hover:text-white transition-all";
        gridTitle.innerText = 'Trending TV Shows';
        gridIcon.setAttribute('data-lucide', 'tv');
    }
    
    lucide.createIcons();
    fetchTrending();
}

// Global Live Search (Handles both Movies & TV simultaneously)
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    searchTimeout = setTimeout(() => {
        if (query.length > 0) {
            tabContainer.classList.add('hidden'); // Hide categorization tabs when searching globally
            searchMulti(query);
        } else {
            tabContainer.classList.remove('hidden');
            switchTab(currentTab); // Return to standard selected trending view
        }
    }, 500); 
});

async function searchMulti(query) {
    try {
        // Multi-search endpoint returns mixing results of movie, tv, and person types
        const response = await fetch(`${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        gridTitle.innerText = `Search Results for "${query}"`;
        gridIcon.setAttribute('data-lucide', 'search');
        lucide.createIcons();
        
        // Filter out people types from the mixed search array
        const filteredResults = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
        
        if (filteredResults.length === 0) {
            movieGrid.innerHTML = '<p class="text-gray-400 col-span-full">No titles matched your search.</p>';
        } else {
            renderGrid(filteredResults);
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Render Uniform Cards
function renderGrid(items) {
    movieGrid.innerHTML = '';
    
    items.forEach(item => {
        if (!item.poster_path) return;
        
        // TV items use .name, movies use .title
        const title = item.media_type === 'tv' ? item.name : item.title;
        const iconType = item.media_type === 'tv' ? 'tv' : 'film';

        const card = document.createElement('div');
        card.className = 'group relative cursor-pointer rounded-lg overflow-hidden transition-transform hover:scale-105 hover:ring-2 hover:ring-red-600';
        card.onclick = () => launchPlayer(item.id, item.media_type);

        card.innerHTML = `
            <img src="${IMG_BASE_URL}${item.poster_path}" alt="${title}" class="w-full h-auto object-cover">
            <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity gap-2 p-2 text-center">
                <i data-lucide="play" class="w-12 h-12 text-white"></i>
                <div class="flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-xs text-gray-300">
                    <i data-lucide="${iconType}" class="w-3 h-3"></i>
                    <span class="uppercase font-semibold tracking-wider">${item.media_type}</span>
                </div>
            </div>
            <div class="absolute bottom-0 w-full p-2 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <p class="text-sm font-semibold truncate">${title}</p>
            </div>
        `;
        movieGrid.appendChild(card);
    });
    
    lucide.createIcons();
}

// Media-Aware Player Route Trigger
function launchPlayer(id, mediaType) {
    dashboardView.classList.add('hidden');
    playerView.classList.remove('hidden');
    
    if (mediaType === 'tv') {
        // Embed format for TV: /embed/tv/{id}/{season}/{episode}?params
        // Starting at Season 1 Episode 1 and activating explicit selectors
        vidkingPlayer.src = `https://www.vidking.net/embed/tv/${id}/1/1?color=dc2626&autoPlay=true&episodeSelector=true&nextEpisode=true`;
    } else {
        // Embed format for Movie: /embed/movie/{id}?params
        vidkingPlayer.src = `https://www.vidking.net/embed/movie/${id}?color=dc2626&autoPlay=true`;
    }
    
    window.scrollTo(0, 0);
}

function showDashboard() {
    playerView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    vidkingPlayer.src = '';
    progressLog.innerText = 'Waiting for playback data...';
}

// Continuous Messaging Interface 
window.addEventListener("message", function (event) {
    try {
        const messageData = JSON.parse(event.data);
        
        if (messageData.type === "PLAYER_EVENT") {
            const data = messageData.data;
            let logText = `[${data.event.toUpperCase()}] ID: ${data.id} | Progress: ${data.progress.toFixed(1)}%`;
            
            if (data.mediaType === 'tv') {
                logText += ` | S${data.season}E${data.episode}`;
            }
            
            progressLog.innerText = logText;
        }
    } catch (e) {
        // Filter structural browser noise
    }
});

// Run
fetchTrending();