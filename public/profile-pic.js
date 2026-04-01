(function() {
    const PLACEHOLDER = '/LocalYT-Rev-Files/user-profile-placeholder.jpg';

    function initProfilePic() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions) {
            userActions = document.createElement('div');
            userActions.className = 'user-actions';
            const topBar = document.querySelector('.top-bar');
            if (topBar) topBar.appendChild(userActions);
        }

        const existing = document.getElementById('headerProfilePic');
        if (existing) existing.remove();

        const img = document.createElement('img');
        img.id = 'headerProfilePic';
        img.className = 'header-profile-pic';
        img.alt = 'Profile';
        img.src = PLACEHOLDER;
        img.onclick = function() {
            window.location.href = 'user_profile_pic.html';
        };
        userActions.appendChild(img);

        fetch('/user-profile-pic')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.hasCustomPic && data.picUrl) {
                    img.src = data.picUrl;
                }
            })
            .catch(function() {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfilePic);
    } else {
        initProfilePic();
    }
})();