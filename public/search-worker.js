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
    if (!query) return [];
    
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    const scoredResults = [];
    
    for (const video of self.searchIndex.videos) {
        let score = 0;
        const lowerTitle = video.displayName.toLowerCase();
        const lowerChannel = video.path.split('/')[0].toLowerCase();
        
        // Exact matches score highest
        if (lowerTitle === query) score += 100;
        if (lowerChannel === query) score += 80;
        
        // Partial matches
        for (const term of queryTerms) {
            if (lowerTitle.includes(term)) score += 10;
            if (lowerChannel.includes(term)) score += 5;
            if (video.description && video.description.toLowerCase().includes(term)) score += 2;
        }
        
        if (score > 0) {
            scoredResults.push({ ...video, score });
        }
    }
    
    // Sort by score and return top results
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, maxResults);
}

function getSuggestions(query, maxResults = 5) {
    if (!query) return [];
    
    return self.searchIndex.videos
        .filter(video => video.displayName.toLowerCase().includes(query.toLowerCase()))
        .slice(0, maxResults);
}