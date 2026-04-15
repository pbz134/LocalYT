(function() {
    // Configuration
    const CONFIG = {
        minChars: 2,
        maxResults: 5,
        debounceMs: 200,
        maxRecentSearches: 5,
        endpoints: ['/search-index', '/videos'] 
    };

    // State
    let searchIndex = null;
    let isIndexLoading = false;
    let debounceTimer = null;
    let recentSearchesCache = []; 

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const suggestionsContainer = document.getElementById('searchSuggestions');
    const searchIcon = document.getElementById('searchIcon');

    if (!searchInput || !suggestionsContainer) return;

    // --- SERVER-SIDE SEARCH HISTORY MANAGEMENT ---

    async function fetchRecentSearches() {
        try {
            const response = await fetch('/user-search-history');
            if (response.ok) {
                recentSearchesCache = await response.json();
            } else {
                recentSearchesCache = []; 
            }
        } catch (e) {
            // Silently fail or log
            recentSearchesCache = []; 
        }
    }

    // Optimistic save (updates UI immediately, sends to background)
    function saveSearchQueryLocal(query) {
        if (!query || query.trim() === '') return;
        
        // Also send to server just in case (e.g. if they click a suggestion and don't press enter)
        fetch('/user-search-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query.trim() })
        }).catch(() => {}); // Ignore errors here

        // Update local array
        const cleanQuery = query.trim();
        recentSearchesCache = recentSearchesCache.filter(item => item !== cleanQuery);
        recentSearchesCache.unshift(cleanQuery);
        if (recentSearchesCache.length > CONFIG.maxRecentSearches) {
            recentSearchesCache = recentSearchesCache.slice(0, CONFIG.maxRecentSearches);
        }
    }

    function renderRecentSearches() {
        if (recentSearchesCache.length === 0) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            return;
        }

        suggestionsContainer.innerHTML = ''; 

        // Header
        const header = document.createElement('div');
        header.className = 'suggestion-item';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '12px';
        header.style.color = '#888';
        header.style.cursor = 'default';
            header.textContent = (localStorage.getItem('language') === 'de') ? 'Suchverlauf' : 'Recent Searches';
            suggestionsContainer.appendChild(header);

        recentSearchesCache.forEach(query => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            
            // --- CHANGE: Use SVG instead of Emoji ---
            item.innerHTML = `
                <img src="/LocalYT-Rev-Files/history.svg" class="history-icon" style="width: 20px; height: 20px; margin-right: 8px; opacity: 0.7; vertical-align: middle;" alt="History">
                <span>${query}</span>
            `;
            
            item.addEventListener('click', () => {
                searchInput.value = query;
                saveSearchQueryLocal(query); 
                window.location.href = `search.html?q=${encodeURIComponent(query)}`;
            });

            suggestionsContainer.appendChild(item);
        });
        
        suggestionsContainer.style.display = 'block';
    }

    /**
     * Tries to fetch search data from available endpoints.
     */
    async function loadSearchIndex() {
        if (searchIndex || isIndexLoading) return;

        isIndexLoading = true;

        for (const url of CONFIG.endpoints) {
            try {
                const response = await fetch(url);
                if (!response.ok) continue; 
                
                const data = await response.json();
                
                if (Array.isArray(data)) {
                    searchIndex = data;
                } else if (data && Array.isArray(data.videos)) {
                    searchIndex = data.videos;
                } else {
                    continue;
                }

                console.log(`Search index loaded from ${url}`);
                break; 

            } catch (error) {
                console.warn(`Failed to load from ${url}:`, error);
            }
        }
        
        if (!searchIndex) searchIndex = []; 
        isIndexLoading = false;
    }

    function handleSearch(query) {
        if (query.length === 0) {
            renderRecentSearches();
            return;
        }

        if (query.length < CONFIG.minChars) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            return;
        }

        if (!searchIndex) {
            if (!isIndexLoading) loadSearchIndex();
            return;
        }

        const lowerQuery = query.toLowerCase();

        const matches = searchIndex
            .filter(video => video.displayName && video.displayName.toLowerCase().includes(lowerQuery))
            .slice(0, CONFIG.maxResults);

        renderSuggestions(matches);
    }

    function renderSuggestions(videos) {
        suggestionsContainer.innerHTML = '';

        if (videos.length === 0) {
             suggestionsContainer.style.display = 'none';
             return;
        }
        
        suggestionsContainer.style.display = 'block';

        videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = video.displayName; 
            
            const videoPath = video.path; 

            item.addEventListener('click', () => {
                saveSearchQueryLocal(video.displayName);
                window.location.href = `video.html?src=${encodeURIComponent(videoPath)}`;
            });

            item.addEventListener('mouseup', (e) => {
                if (e.button === 1) { 
                    e.preventDefault();
                    saveSearchQueryLocal(video.displayName);
                    window.open(`video.html?src=${encodeURIComponent(videoPath)}`, '_blank');
                }
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                saveSearchQueryLocal(video.displayName);
                window.open(`video.html?src=${encodeURIComponent(videoPath)}`, '_blank');
            });

            suggestionsContainer.appendChild(item);
        });
    }

    // --- Event Listeners ---

    // 1. Input Handling
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        debounceTimer = setTimeout(() => handleSearch(query), CONFIG.debounceMs);
    });

    // 2. Focus Handling -> Fetch & Show Recent Searches
    searchInput.addEventListener('focus', () => {
        loadSearchIndex(); 
        
        fetchRecentSearches().then(() => {
            if (searchInput.value.trim().length === 0) {
                renderRecentSearches();
            } else {
                handleSearch(searchInput.value.trim());
            }
        });
    });

    // 3. Search Submission (Enter Key)
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                saveSearchQueryLocal(query); 
            }
        }
    });

    // 4. Search Icon Click Submission
    if (searchIcon) {
        searchIcon.addEventListener('click', (e) => {
            const query = searchInput.value.trim();
            if (query) {
                saveSearchQueryLocal(query);
            } else {
                searchInput.focus();
            }
        });
    }

    // 5. Close Suggestions on Outside Click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
        }
    });

})();