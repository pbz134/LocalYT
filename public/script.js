document.addEventListener('DOMContentLoaded', () => {
    fetch('/videos')
        .then(response => response.json())
        .then(videos => {
            const container = document.getElementById('videoContainer');
            videos.forEach(video => {
                const videoElement = document.createElement('div');
                videoElement.className = 'video-item';
                videoElement.innerHTML = `
                    <div class="video-wrapper">
                        <video muted>
                            <source src="/videos/${encodeURIComponent(video)}" type="video/mp4">
                        </video>
                        <div class="logo-overlay"></div>
                    </div>
                    <div class="video-title" onclick="openVideo('${encodeURIComponent(video)}')">${video}</div>
                `;
                container.appendChild(videoElement);

                const videoWrapper = videoElement.querySelector('.video-wrapper');
                videoWrapper.addEventListener('click', () => {
                    const videoPlayer = videoWrapper.querySelector('video');
                    videoPlayer.play();
                    videoWrapper.querySelector('.logo-overlay').style.display = 'none';
                });
            });
        });

    /* --- Search icon injection and click handler --- */
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        const searchIcon = document.createElement('div');
        searchIcon.className = 'search-icon';
        searchIcon.innerHTML = '<img src="search_icon.svg" alt="Search">';
        searchContainer.appendChild(searchIcon);

        searchIcon.addEventListener('click', () => {
            const input = document.getElementById('searchInput');
            const query = input.value.toLowerCase();

            if (!query) {
                input.focus();
                return;
            }

            const videos = document.querySelectorAll('.video-item');
            videos.forEach(video => {
                const title = video.querySelector('.video-title').textContent.toLowerCase();
                if (title.includes(query)) {
                    video.style.display = '';
                } else {
                    video.style.display = 'none';
                }
            });
        });
    }
    /* --- End search icon --- */

    document.getElementById('searchInput').addEventListener('input', (event) => {
        const query = event.target.value.toLowerCase();
        const videos = document.querySelectorAll('.video-item');
        videos.forEach(video => {
            const title = video.querySelector('.video-title').textContent.toLowerCase();
            if (title.includes(query)) {
                video.style.display = '';
            } else {
                video.style.display = 'none';
            }
        });
    });
});

function openVideo(videoSrc) {
    window.location.href = `video.html?src=${videoSrc}`;
}