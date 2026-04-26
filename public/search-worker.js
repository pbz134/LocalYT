self.onmessage = function(e) {
    const { type, query, searchId, maxResults } = e.data;
    
    if (type === 'initialize') {
        self.searchIndex = e.data.index;
        return;
    }
    
    if (!self.searchIndex) {
        postMessage({ type: 'error', message: 'Search index not initialized' });
        return;
    }
    
    if (type === 'search') {
        const results = performSearch(query, maxResults);
        postMessage({ type: 'search', results, searchId, query });
    } else if (type === 'suggestions') {
        const results = getSuggestions(query, maxResults);
        postMessage({ type: 'suggestions', results, searchId, query });
    }
};

function performSearch(query, maxResults = 100) {
    if (!query || !self.searchIndex || !self.searchIndex.videos) return [];
    
    // 1. Parse Search Terms
    const queryLower = query.toLowerCase();
    // Filter out empty strings and sanitize terms for Regex
    const rawTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
    
    // Escape special regex characters to prevent crashes from symbols like (, ), [, etc.
    const queryTerms = rawTerms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    // 2. Identify Potential Channels (Exact Word Match Only)
    const potentialChannels = new Set();
    
    if (!self.channelSet) {
        self.channelSet = new Set();
        self.searchIndex.videos.forEach(v => {
            if (v.path) self.channelSet.add(v.path.split('/')[0].toLowerCase());
        });
    }

    queryTerms.forEach(term => {
        // Create Regex with Word Boundaries (\b)
        // This ensures "to" matches "to" but NOT "tonight"
        const termRegex = new RegExp(`\\b(${term})\\b`, 'i'); 
        
        self.channelSet.forEach(channelName => {
            if (termRegex.test(channelName)) {
                potentialChannels.add(channelName);
            }
        });
    });

    // 3. Score Videos
    const scoredResults = [];

    for (const video of self.searchIndex.videos) {
        let score = 0;
        const lowerTitle = (video.displayName || '').toLowerCase();
        const videoChannel = (video.path && video.path.split('/')[0]) || '';
        const lowerChannel = videoChannel.toLowerCase();

        // --- PRIORITY LOGIC: Channel Matching ---
        
        let isFromMatchedChannel = false;
        
        if (potentialChannels.has(lowerChannel)) {
            isFromMatchedChannel = true;
            score += 50; 

            if (queryTerms.some(term => lowerChannel === term)) { // Exact channel name match
                score += 100;
            }
            
            // Check remaining terms against Title using Word Boundaries
            // We only check terms that aren't the channel name itself
            const nonChannelTerms = queryTerms.filter(t => !new RegExp(`\\b${t}\\b`, 'i').test(lowerChannel));
            
            nonChannelTerms.forEach(term => {
                const termRegex = new RegExp(`\\b(${term})\\b`, 'i');
                if (termRegex.test(lowerTitle)) score += 20; 
                if (video.description && termRegex.test(video.description.toLowerCase())) score += 5;
            });

            if (nonChannelTerms.length === 0 || lowerTitle.includes(queryLower)) {
                score += 10;
            }
        } 
        
        // --- STANDARD LOGIC: General Matches ---
        
        if (lowerTitle === queryLower) score += 90;
        
        if (!isFromMatchedChannel) {
            queryTerms.forEach(term => {
                // STRICT WORD BOUNDARY MATCHING
                // "to" will NOT match "tonight"
                const termRegex = new RegExp(`\\b(${term})\\b`, 'i');
                
                if (termRegex.test(lowerTitle)) score += 10;
                if (termRegex.test(lowerChannel)) score += 5;
                if (video.description && termRegex.test(video.description.toLowerCase())) score += 2;
            });
        }

        if (score > 0) {
            scoredResults.push({ ...video, score, _isPriority: isFromMatchedChannel });
        }
    }
    
    // 4. Sort Results
    scoredResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a._isPriority !== b._isPriority) return a._isPriority ? 1 : -1;
        return 0;
    });

    return scoredResults.slice(0, maxResults);
}

function getSuggestions(query, maxResults = 5) {
    if (!query) return [];
    
    // Also apply strict matching to suggestions if desired, 
    // though simple includes is usually fine for autocomplete.
    // Sticking to standard behavior here for suggestions to be helpful.
    const q = query.toLowerCase();
    return self.searchIndex.videos
        .filter(video => video.displayName.toLowerCase().includes(q))
        .slice(0, maxResults);
}