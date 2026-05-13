self.onmessage = function(e) {
    const { type, query, searchId, maxResults } = e.data;
    
    if (type === 'initialize') {
        self.searchIndex = e.data.index;
        self.channelSet = null; // Reset cache on re-initialization
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
        const lowerTitle = (video.displayName || '').toLowerCase();
        const videoChannel = (video.path && video.path.split('/')[0]) || '';
        const lowerChannel = videoChannel.toLowerCase();

        let titleMatchCount = 0;
        let channelMatchCount = 0;
        let descMatchCount = 0;
        
        let baseScore = 0;

        // --- Exact Match Bonuses ---
        if (lowerTitle === queryLower) baseScore += 100;
        if (lowerChannel === queryLower) baseScore += 80;

        // --- Strict Word Boundary Matching for Terms ---
        queryTerms.forEach(term => {
            const termRegex = new RegExp(`\\b(${term})\\b`, 'i');
            
            if (termRegex.test(lowerTitle)) {
                titleMatchCount++;
                baseScore += 10;
            }
            if (termRegex.test(lowerChannel)) {
                channelMatchCount++;
                baseScore += 5;
            }
            if (video.description && termRegex.test(video.description.toLowerCase())) {
                descMatchCount++;
                baseScore += 2;
            }
        });

        // --- Multi-Word Exponential Bonus ---
        // If a title matches multiple exact words, multiply the base score.
        // 4 matches = x15, 3 matches = x8, 2 matches = x3.
        // This guarantees "Protectors of the earth" obliterates "The best people of the earth"
        if (titleMatchCount >= 4) baseScore *= 15;
        else if (titleMatchCount === 3) baseScore *= 8;
        else if (titleMatchCount === 2) baseScore *= 3;
        
        if (channelMatchCount >= 2) baseScore *= 2;

        // --- Add slight priority if channel name matches the query ---
        const isFromMatchedChannel = potentialChannels.has(lowerChannel);
        if (isFromMatchedChannel && titleMatchCount > 0) {
            baseScore += 15;
        }

        if (baseScore > 0) {
            scoredResults.push({ ...video, score: baseScore, _isPriority: isFromMatchedChannel });
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
    
    const q = query.toLowerCase();
    return self.searchIndex.videos
        .filter(video => video.displayName.toLowerCase().includes(q))
        .slice(0, maxResults);
}