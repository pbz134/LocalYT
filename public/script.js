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
