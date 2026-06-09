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
    }

    .sidebar a {
        padding: 8px 8px 8px 32px;
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
        margin: 12px 24px;
    }

    .sidebar .genre-label {
        padding: 8px 8px 4px 32px;
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
    }

    .sidebar .genre-link img {
        width: 25px;
        height: 25px;
        flex-shrink: 0;
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
            <a href="watch_history.html" id="sidebarWatchHistory">Watch History</a>
            <a href="liked_videos.html" id="sidebarLikedVideos">Liked Videos</a>
            <a href="subscribed_channels.html" id="sidebarSubscriptions">Subscriptions</a>
            <a href="user_playlists.html" id="sidebarPlaylists">Playlists</a>
            <a href="watch_later.html" id="sidebarWatchLater">Watch later</a>
            <a href="about.html" id="sidebarAbout">About</a>
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
    const aboutEl = document.getElementById('sidebarAbout');
    const genreLabelEl = document.getElementById('sidebarGenreLabel');
    const editTopicsEl = document.getElementById('sidebarEditTopics');

    if (watchHistoryEl) watchHistoryEl.textContent = getLang('Watch History', 'Wiedergabeverlauf');
    if (likedVideosEl) likedVideosEl.textContent = getLang('Liked Videos', 'Videos, die ich mag');
    if (subscriptionsEl) subscriptionsEl.textContent = getLang('Subscriptions', 'Abonnements');
    if (playlistsEl) playlistsEl.textContent = getLang('Playlists', 'Playlisten');
    
    if (watchLaterEl) watchLaterEl.textContent = getLang('Watch later', 'Später ansehen');

    if (aboutEl) aboutEl.textContent = getLang('About', 'Über');
    if (genreLabelEl) genreLabelEl.textContent = getLang('Topics', 'Themen');
    if (editTopicsEl) editTopicsEl.lastChild.textContent = getLang('Edit Topics', 'Themen bearb.');

    // 5. Fetch user's custom topics and replace defaults if found
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

    // 6. Prevent middle-clicks from opening sidebar links twice
    sidebar.addEventListener('auxclick', function(e) {
        // e.button === 1 is the middle mouse button
        if (e.button === 1 && e.target.closest('a')) {
            e.preventDefault();
        }
    });

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