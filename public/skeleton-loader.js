// Skeleton Loader – shows placeholder video items while content loads
(function() {
    const DEFAULT_CONTAINER_ID = 'videoContainer';

    function createSkeletonItem() {
        const div = document.createElement('div');
        div.className = 'video-item skeleton-item';
        div.innerHTML = `
            <div class="thumbnail-container">
                <div class="skeleton-thumbnail"></div>
                <div class="video-length"></div>
            </div>
            <div class="video-info">
                <div class="channel-pic-link">
                    <div class="skeleton-channel-pic"></div>
                </div>
                <div class="video-details">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-metadata"></div>
                </div>
            </div>
        `;
        return div;
    }

    function createPlaylistSkeletonItem() {
        const div = document.createElement('div');
        div.className = 'playlist-item skeleton-item';
        div.innerHTML = `
            <div class="playlist-thumbnail" style="background-color: #2a2a2a;">
                <div class="playlist-overlay"></div>
            </div>
            <div class="playlist-title skeleton-title" style="width: 70%;"></div>
            <div class="playlist-video-count skeleton-metadata" style="width: 40%;"></div>
        `;
        return div;
    }

    function createHomeSkeletonItem() {
        const div = document.createElement('div');
        div.className = 'video-item skeleton-item';
        div.innerHTML = `
            <div class="thumbnail-container">
                <div class="skeleton-thumbnail"></div>
                <div class="video-length"></div>
            </div>
            <div class="video-title skeleton-title" style="width: 80%; margin: 8px 0 4px 0;"></div>
            <div class="video-description skeleton-metadata" style="width: 60%;"></div>
        `;
        return div;
    }

    function createHomePlaylistSkeletonItem() {
        const div = document.createElement('div');
        div.className = 'playlist-item skeleton-item';
        div.innerHTML = `
            <div class="playlist-thumbnail" style="background-color: #2a2a2a; width: 100%; height: 168px;"></div>
            <div class="playlist-info-side" style="padding: 10px;">
                <div class="playlist-title skeleton-title" style="width: 70%;"></div>
                <div class="playlist-channel-name skeleton-metadata" style="width: 50%; margin-top: 6px;"></div>
            </div>
        `;
        return div;
    }

    function createPostSkeletonItem() {
        const div = document.createElement('div');
        div.className = 'post-item skeleton-item';
        div.innerHTML = `
            <div class="post-header">
                <div class="skeleton-channel-pic" style="width: 40px; height: 40px; flex-shrink: 0;"></div>
                <div style="flex: 1;">
                    <div class="skeleton-title" style="width: 50%;"></div>
                    <div class="skeleton-metadata" style="width: 30%; margin-top: 4px;"></div>
                </div>
            </div>
            <div style="padding: 12px 16px;">
                <div class="skeleton-title" style="width: 90%;"></div>
                <div class="skeleton-title" style="width: 70%; margin-top: 6px;"></div>
                <div class="skeleton-title" style="width: 50%; margin-top: 6px;"></div>
            </div>
        `;
        return div;
    }

    function createSearchSkeletonItem() {
        const div = document.createElement('div');
        div.className = 'video-item skeleton-item';
        div.innerHTML = `
            <div class="thumbnail-container">
                <div class="skeleton-thumbnail"></div>
                <div class="video-length"></div>
            </div>
            <div class="video-info">
                <div class="skeleton-title" style="width: 70%; height: 18px; margin-bottom: 8px;"></div>
                <div class="channel-info">
                    <div class="skeleton-channel-pic"></div>
                    <div class="skeleton-metadata" style="width: 40%; height: 14px;"></div>
                </div>
                <div class="skeleton-metadata" style="width: 50%; height: 14px; margin-top: 4px;"></div>
            </div>
        `;
        return div;
    }

    /**
     * Show skeleton placeholders in the specified container.
     * @param {number} count - Number of skeleton items to display.
     * @param {string} [containerId] - ID of the container element (default: 'videoContainer').
     * @param {string} [type] - Type of skeleton: 'video', 'playlist', 'home', 'homeplaylist', 'post', 'search' (default: 'video').
     */
    window.showSkeletons = function(count, containerId, type) {
        const id = containerId || DEFAULT_CONTAINER_ID;
        const container = document.getElementById(id);
        if (!container) return;

        // Remove any existing skeletons first
        hideSkeletons();

        const fragment = document.createDocumentFragment();
        const skeletonType = type || 'video';
        
        for (let i = 0; i < count; i++) {
            let item;
            switch(skeletonType) {
                case 'playlist':
                    item = createPlaylistSkeletonItem();
                    break;
                case 'home':
                    item = createHomeSkeletonItem();
                    break;
                case 'homeplaylist':
                    item = createHomePlaylistSkeletonItem();
                    break;
                case 'post':
                    item = createPostSkeletonItem();
                    break;
                case 'search':
                    item = createSearchSkeletonItem();
                    break;
                default:
                    item = createSkeletonItem();
            }
            fragment.appendChild(item);
        }
        container.appendChild(fragment);
    };

    /**
     * Remove all skeleton placeholders from the page.
     */
    window.hideSkeletons = function() {
        document.querySelectorAll('.skeleton-item').forEach(el => el.remove());
    };
})();