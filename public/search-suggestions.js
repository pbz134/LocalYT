(function() {
    // Configuration
    const CONFIG = {
        minChars: 2,
        maxResults: 5,
        debounceMs: 200,
        // Heuristic: Try search-index first (index.html), fallback to /videos (about.html)
        endpoints: ['/search-index', '/videos'] 
    };

    // State
    let searchIndex = null;
    let isIndexLoading = false;
    let debounceTimer = null;

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const suggestionsContainer = document.getElementById('searchSuggestions');

    if (!searchInput || !suggestionsContainer) return;

    /**
     * Tries to fetch search data from available endpoints.
     * Normalizes data to always be an array of video objects.
     */
    async function loadSearchIndex() {
        if (searchIndex || isIndexLoading) return;

        isIndexLoading = true;

        for (const url of CONFIG.endpoints) {
            try {
                const response = await fetch(url);
                if (!response.ok) continue; // Try next endpoint
                
                const data = await response.json();
                
                // DATA NORMALIZATION:
                // /search-index returns { videos: [...] }
                // /videos returns [...]
                if (Array.isArray(data)) {
                    searchIndex = data;
                } else if (data && Array.isArray(data.videos)) {
                    searchIndex = data.videos;
                } else {
                    console.warn(`Format not recognized for ${url}`);
                    continue;
                }

                console.log(`Search index loaded from ${url}`);
                break; // Stop loop on success

            } catch (error) {
                console.warn(`Failed to load from ${url}:`, error);
            }
        }
        
        // Fallback if empty
        if (!searchIndex) searchIndex = []; 
        isIndexLoading = false;
    }

    function handleSearch(query) {
        if (query.length < CONFIG.minChars) {
            suggestionsContainer.innerHTML = '';
            return;
        }

        if (!searchIndex) {
            if (!isIndexLoading) loadSearchIndex();
            return;
        }

        const lowerQuery = query.toLowerCase();

        // Filter results
        const matches = searchIndex
            .filter(video => video.displayName && video.displayName.toLowerCase().includes(lowerQuery))
            .slice(0, CONFIG.maxResults);

        renderSuggestions(matches);
    }

    function renderSuggestions(videos) {
        suggestionsContainer.innerHTML = '';

        if (videos.length === 0) return;

        videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = video.displayName;
            
            // Handle path (some endpoints might return 'path', others might imply it)
            // Assuming standard 'path' property exists based on previous context
            const videoPath = video.path; 

            item.addEventListener('click', () => {
                window.location.href = `video.html?src=${encodeURIComponent(videoPath)}`;
            });

            item.addEventListener('mouseup', (e) => {
                if (e.button === 1) { 
                    e.preventDefault();
                    window.open(`video.html?src=${encodeURIComponent(videoPath)}`, '_blank');
                }
            });

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                window.open(`video.html?src=${encodeURIComponent(videoPath)}`, '_blank');
            });

            suggestionsContainer.appendChild(item);
        });
    }

    // --- Event Listeners ---

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        debounceTimer = setTimeout(() => handleSearch(query), CONFIG.debounceMs);
    });

    searchInput.addEventListener('focus', loadSearchIndex);

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.innerHTML = '';
        }
    });

})();