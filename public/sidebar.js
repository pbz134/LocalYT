// Inject Sidebar CSS
const sidebarCSS = document.createElement('style');
sidebarCSS.id = 'sidebar-styles';
sidebarCSS.textContent = `
    .sidebar {
        height: calc(100% - 60px);
        width: 0;
        position: fixed;
        z-index: 1001;
        top: 60px;
        left: 0;
        background-color: var(--main-bg-color);
        overflow-x: hidden;
        transition: 0.5s;
        padding-top: 0;
    }

    .sidebar .genre-link .topic-custom-pic {
        border-radius: 50%;
        object-fit: cover;
    }

    /* Prevents text inside from squishing/reflowing while the sidebar width animates */
    .sidebar-inner {
        width: 270px;
        padding-right: 8px;
        box-sizing: border-box;
    }

    .sidebar a {
        padding: 8px 8px 8px 20px;
        text-decoration: none;
        font-size: 25px;
        color: #818181;
        display: block;
        transition: 0.3s;
        white-space: nowrap; /* Prevents text from wrapping during animation */
    }

    .sidebar a:hover {
        color: #f1f1f1;
    }

    .sidebar .sidebar-divider {
        height: 1px;
        background-color: #3f3f3f;
        margin: 12px 20px;
    }

    .sidebar .genre-label {
        padding: 8px 8px 4px 20px;
        font-size: 13px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: bold;
        white-space: nowrap; /* Prevents text from wrapping during animation */
    }

    .sidebar .genre-link {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 8px 8px 20px;
    }

    .sidebar .genre-link img {
        width: 25px;
        height: 25px;
        flex-shrink: 0;
    }

    /* SVG icon styling for sidebar items */
    .sidebar .sidebar-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 8px 8px 20px;
        text-decoration: none;
        font-size: 25px;
        color: #818181;
        transition: 0.3s;
        white-space: nowrap;
    }

    .sidebar .sidebar-item:hover {
        color: #f1f1f1;
    }

    .sidebar .sidebar-item img.sidebar-icon {
        width: 25px;
        height: 25px;
        flex-shrink: 0;
        filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%);
        transition: filter 0.3s;
    }

    .sidebar .sidebar-item:hover img.sidebar-icon {
        filter: invert(100%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(100%) contrast(100%);
    }

    .openbtn {
        font-size: 20px;
        cursor: pointer;
        background-color: #111;
        color: white;
        border: none;
        margin-top: -2px;
        margin-right: 10px;
    }

    .openbtn:hover {
        background-color: #444;
    }
`;
document.head.appendChild(sidebarCSS);

// Build Sidebar and Toggle Button
function initSidebar() {
    // 1. Create the sidebar container if it doesn't exist
    let sidebar = document.getElementById('mySidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'mySidebar';
        sidebar.className = 'sidebar';
        document.body.prepend(sidebar);
    }

    // 2. Populate the sidebar HTML with default topics (will be replaced if user has custom ones)
    sidebar.innerHTML = `
        <div class="sidebar-inner">
            <a href="watch_history.html" id="sidebarWatchHistory" class="sidebar-item">
                <img src="LocalYT-Rev-Files/watch_history.svg" alt="" class="sidebar-icon">Watch History
            </a>
            <a href="liked_videos.html" id="sidebarLikedVideos" class="sidebar-item">
                <img src="LocalYT-Rev-Files/liked_videos.svg" alt="" class="sidebar-icon">Liked Videos
            </a>
            <a href="subscribed_channels.html" id="sidebarSubscriptions" class="sidebar-item">
                <img src="LocalYT-Rev-Files/subscriptions.svg" alt="" class="sidebar-icon">Subscriptions
            </a>
            <a href="user_playlists.html" id="sidebarPlaylists" class="sidebar-item">
                <img src="LocalYT-Rev-Files/playlists.svg" alt="" class="sidebar-icon">Playlists
            </a>
            <a href="watch_later.html" id="sidebarWatchLater" class="sidebar-item">
                <img src="LocalYT-Rev-Files/watch_later.svg" alt="" class="sidebar-icon">Watch later
            </a>
            <div class="sidebar-divider"></div>
            <div class="genre-label" id="sidebarGenreLabel">Topics</div>
            <div id="sidebarTopicsContainer">
                <a href="genre_channel.html?genre=gaming" class="genre-link" id="sidebarGaming">
                    <img src="LocalYT-Rev-Files/genre_gaming.svg" alt="" style="filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%);">Gaming
                </a>
                <a href="genre_channel.html?genre=music" class="genre-link" id="sidebarMusic">
                    <img src="LocalYT-Rev-Files/genre_music.svg" alt="" style="filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%);">Music
                </a>
                <a href="genre_channel.html?genre=sports" class="genre-link" id="sidebarSports">
                    <img src="LocalYT-Rev-Files/genre_sports.svg" alt="" style="filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%);">Sports
                </a>
                <a href="genre_channel.html?genre=movies" class="genre-link" id="sidebarMovies">
                    <img src="LocalYT-Rev-Files/genre_movies.svg" alt="" style="filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%);">Movies
                </a>
            </div>
            <a href="edit_topics.html" class="genre-link" id="sidebarEditTopics" style="display:none; opacity: 0.7; margin-top: 4px;">
                <img src="LocalYT-Rev-Files/genre_gaming.svg" alt="" style="filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%);">Edit Topics
            </a>
        </div>
    `;

    // 3. Create and inject the ☰ toggle button into the header
    const topBar = document.querySelector('.top-bar');
    if (topBar && !document.getElementById('sidebarToggleBtn')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'sidebarToggleBtn';
        toggleBtn.className = 'openbtn';
        toggleBtn.innerHTML = '&#9776;';
        toggleBtn.onclick = toggleNav;
        topBar.insertBefore(toggleBtn, topBar.firstChild);
    }

    // 4. Apply translations
    const getLang = (en, de) => localStorage.getItem('language') === 'de' ? de : en;

    const watchHistoryEl = document.getElementById('sidebarWatchHistory');
    const likedVideosEl = document.getElementById('sidebarLikedVideos');
    const subscriptionsEl = document.getElementById('sidebarSubscriptions');
    const playlistsEl = document.getElementById('sidebarPlaylists');
    const watchLaterEl = document.getElementById('sidebarWatchLater');
    const genreLabelEl = document.getElementById('sidebarGenreLabel');
    const editTopicsEl = document.getElementById('sidebarEditTopics');

    // Update text content while preserving icon
    if (watchHistoryEl) {
        const textNode = watchHistoryEl.childNodes[watchHistoryEl.childNodes.length - 1];
        if (textNode) textNode.textContent = getLang('Watch History', 'Wiedergabeverlauf');
    }
    if (likedVideosEl) {
        const textNode = likedVideosEl.childNodes[likedVideosEl.childNodes.length - 1];
        if (textNode) textNode.textContent = getLang('Liked Videos', 'Videos, die ich mag');
    }
    if (subscriptionsEl) {
        const textNode = subscriptionsEl.childNodes[subscriptionsEl.childNodes.length - 1];
        if (textNode) textNode.textContent = getLang('Subscriptions', 'Abonnements');
    }
    if (playlistsEl) {
        const textNode = playlistsEl.childNodes[playlistsEl.childNodes.length - 1];
        if (textNode) textNode.textContent = getLang('Playlists', 'Playlisten');
    }
    if (watchLaterEl) {
        const textNode = watchLaterEl.childNodes[watchLaterEl.childNodes.length - 1];
        if (textNode) textNode.textContent = getLang('Watch later', 'Später ansehen');
    }

    if (genreLabelEl) genreLabelEl.textContent = getLang('Topics', 'Themen');
    if (editTopicsEl) editTopicsEl.lastChild.textContent = getLang('Edit Topics', 'Themen bearb.');

    // 5. Load SVG icons setting from server or localStorage
    loadSidebarSvgIconSetting();

    // 6. Fetch user's custom topics and replace defaults if found
    fetch('/user-topics')
        .then(r => {
            if (!r.ok) throw new Error('Not authenticated');
            return r.json();
        })
        .then(userTopics => {
            // User is logged in — always show the Edit Topics link
            const editLink = document.getElementById('sidebarEditTopics');
            if (editLink) editLink.style.display = 'flex';

            // If the user has custom topics, replace the defaults
            if (Array.isArray(userTopics) && userTopics.length > 0) {
                const container = document.getElementById('sidebarTopicsContainer');
                if (!container) return;

                container.innerHTML = '';

                userTopics.forEach(topic => {
                    const link = document.createElement('a');
                    link.href = `genre_channel.html?topic=${encodeURIComponent(topic.id)}`;
                    link.className = 'genre-link';

                    const img = document.createElement('img');
                    if (topic.profilePic) {
                        img.src = topic.profilePic;
                        img.style.borderRadius = '50%';
                        img.style.objectFit = 'cover';
                    } else {
                        img.src = 'LocalYT-Rev-Files/genre_gaming.svg';
                        img.style.filter = 'invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(60%) contrast(90%)';
                    }
                    img.alt = '';
                    img.style.width = '25px';
                    img.style.height = '25px';
                    img.style.flexShrink = '0';

                    link.appendChild(img);
                    link.appendChild(document.createTextNode(topic.name || getLang('Custom Topic', 'Benutzerdefiniertes Thema')));
                    container.appendChild(link);
                });
            }
        })
        .catch(() => {
            // Not logged in or error — keep default topics, hide Edit button
        });

    // 7. Prevent middle-clicks from opening sidebar links twice
    sidebar.addEventListener('auxclick', function(e) {
        // e.button === 1 is the middle mouse button
        if (e.button === 1 && e.target.closest('a')) {
            e.preventDefault();
        }
    });

    // 8. Listen for changes to the SVG icon setting
    window.addEventListener('storage', function(e) {
        if (e.key === 'sidebarSvgIcons') {
            const enabled = JSON.parse(e.newValue || 'true');
            applySvgIconVisibility(enabled);
        }
    });

    // 9. Also listen for custom event from settings page
    window.addEventListener('sidebarSvgIconsChanged', function(e) {
        if (e.detail !== undefined) {
            applySvgIconVisibility(e.detail);
        }
    });
}

// Function to load sidebar SVG icon setting
function loadSidebarSvgIconSetting() {
    // First check if we have it in localStorage directly (legacy)
    let enabled = localStorage.getItem('sidebarSvgIcons');
    
    if (enabled !== null) {
        // Found in localStorage directly
        applySvgIconVisibility(JSON.parse(enabled));
        return;
    }
    
    // Try to load from the user settings (which might be stored with the user ID as key)
    // Check all localStorage keys for user settings
    let found = false;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Look for keys that look like user IDs (UUID format)
        if (key && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
            try {
                const settings = JSON.parse(localStorage.getItem(key));
                if (settings && settings.sidebarSvgIcons !== undefined) {
                    applySvgIconVisibility(settings.sidebarSvgIcons);
                    found = true;
                    break;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }
    
    if (!found) {
        // Try loading from server
        fetch('/user-settings')
            .then(res => {
                if (!res.ok) throw new Error('Not authenticated');
                return res.json();
            })
            .then(settings => {
                if (settings && settings.sidebarSvgIcons !== undefined) {
                    applySvgIconVisibility(settings.sidebarSvgIcons);
                    // Save to localStorage for future use
                    localStorage.setItem('sidebarSvgIcons', JSON.stringify(settings.sidebarSvgIcons));
                } else {
                    // Default to true
                    applySvgIconVisibility(true);
                }
            })
            .catch(() => {
                // Not logged in or error, default to true
                applySvgIconVisibility(true);
            });
    }
}

// Function to apply SVG icon visibility
function applySvgIconVisibility(enabled) {
    const sidebarItems = document.querySelectorAll('.sidebar .sidebar-item');
    const genreLinks = document.querySelectorAll('.sidebar .genre-link');

    if (enabled) {
        // Show icons and adjust padding for icon spacing
        sidebarItems.forEach(item => {
            const icon = item.querySelector('img.sidebar-icon');
            if (icon) {
                icon.style.display = 'inline';
                icon.style.marginRight = '0';
            }
            item.style.paddingLeft = '20px';
        });
        // Genre links always have icons visible
        genreLinks.forEach(link => {
            const img = link.querySelector('img');
            if (img) {
                img.style.display = 'inline';
                img.style.marginRight = '0';
            }
            link.style.paddingLeft = '20px';
        });
    } else {
        // Hide icons and adjust padding to reclaim space
        sidebarItems.forEach(item => {
            const icon = item.querySelector('img.sidebar-icon');
            if (icon) {
                icon.style.display = 'none';
                icon.style.marginRight = '0';
            }
            item.style.paddingLeft = '32px';
        });
        // Genre links - hide their icons too but keep padding consistent
        genreLinks.forEach(link => {
            const img = link.querySelector('img');
            if (img) {
                img.style.display = 'none';
                img.style.marginRight = '0';
            }
            link.style.paddingLeft = '32px';
        });
    }
}

// Sidebar Toggle Functions
function toggleNav() {
    const sidebar = document.getElementById("mySidebar");
    const main = document.getElementById("main");
    
    if (sidebar.style.width === "270px") {
        sidebar.style.width = "0";
        if (main) main.style.marginLeft = "0";
    } else {
        sidebar.style.width = "270px";
        if (main) main.style.marginLeft = "270px";
    }
}
window.toggleNav = toggleNav;

function closeNav() {
    const sidebar = document.getElementById("mySidebar");
    const main = document.getElementById("main");
    if (sidebar) sidebar.style.width = "0";
    if (main) main.style.marginLeft = "0";
}
window.closeNav = closeNav;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
} else {
    initSidebar();
}