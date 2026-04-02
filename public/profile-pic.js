(function() {
    const PLACEHOLDER = '/LocalYT-Rev-Files/user-profile-placeholder.jpg';
    let menuInstance = null;

    // Helper to create menu items
    function createMenuItem(icon, text, onClick) {
        const item = document.createElement('div');
        item.className = 'profile-menu-item';
        
        const iconImg = document.createElement('img');
        iconImg.src = `/LocalYT-Rev-Files/${icon}`;
        iconImg.className = 'profile-menu-icon';
        iconImg.draggable = false;
        
        const textSpan = document.createElement('span');
        textSpan.className = 'profile-menu-text';
        textSpan.textContent = text;
        
        item.appendChild(iconImg);
        item.appendChild(textSpan);
        
        if (onClick) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                onClick();
                closeMenu();
            });
        }
        
        return item;
    }

    function closeMenu() {
        if (menuInstance) {
            menuInstance.classList.remove('open');
        }
        document.removeEventListener('click', closeMenu);
    }

    function toggleMenu() {
        if (!menuInstance) return;
        
        if (menuInstance.classList.contains('open')) {
            closeMenu();
        } else {
            menuInstance.classList.add('open');
            // Timeout to prevent the same click from closing it immediately
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 0);
        }
    }

    function initProfilePic() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions) {
            userActions = document.createElement('div');
            userActions.className = 'user-actions';
            const topBar = document.querySelector('.top-bar');
            if (topBar) topBar.appendChild(userActions);
        }

        // Ensure container has relative positioning for the modal
        userActions.style.position = 'relative';

        const existing = document.getElementById('headerProfilePic');
        if (existing) existing.remove();
        
        // Remove old menu if re-initializing
        const oldMenu = document.getElementById('profileMenuDropdown');
        if (oldMenu) oldMenu.remove();

        // 1. Create Profile Picture
        const img = document.createElement('img');
        img.id = 'headerProfilePic';
        img.className = 'header-profile-pic';
        img.alt = 'Profile';
        img.src = PLACEHOLDER;
        
        // 2. Create Modal/Dropdown
        menuInstance = document.createElement('div');
        menuInstance.id = 'profileMenuDropdown';
        menuInstance.className = 'profile-menu-dropdown';

        // Check Session Status
        fetch('/session-user')
            .then(res => {
                if (res.ok) return res.json();
                return null; // Not logged in
            })
            .then(userData => {
                if (userData && userData.username) {
                    // --- LOGGED IN STATE ---
                    
                    // Load custom profile pic if available
                    fetch('/user-profile-pic')
                        .then(picRes => picRes.json())
                        .then(picData => {
                            if (picData.hasCustomPic && picData.picUrl) {
                                img.src = picData.picUrl;
                            }
                        })
                        .catch(() => {});

                    // Sign Out
                    menuInstance.appendChild(createMenuItem('signout.svg', 'Sign Out', () => {
                        fetch('/logout').then(() => {
                            window.location.href = '/login.html';
                        }).catch(err => console.error('Logout failed:', err));
                    }));

                    // Appearance (Placeholder)
                    menuInstance.appendChild(createMenuItem('appearance.svg', 'Appearance: Dark'));

                    // Language (Placeholder)
                    menuInstance.appendChild(createMenuItem('language.svg', 'Language: English'));

                    // Settings
                    menuInstance.appendChild(createMenuItem('settings.svg', 'Settings', () => {
                        window.location.href = 'settings.html';
                    }));

                    // Help
                    menuInstance.appendChild(createMenuItem('help.svg', 'Help', () => {
                        window.location.href = 'documentation.html';
                    }));

                    // Source Code
                    menuInstance.appendChild(createMenuItem('sourcecode.svg', 'Source Code', () => {
                        window.open('https://github.com/pbz134/LocalYT', '_blank');
                    }));

                    // Send Feedback
                    menuInstance.appendChild(createMenuItem('feedback.svg', 'Send Feedback', () => {
                        window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                    }));

                } else {
                    // --- LOGGED OUT STATE ---
                    
                    // Sign In
                    menuInstance.appendChild(createMenuItem('signout.svg', 'Sign In', () => {
                        window.location.href = 'login.html';
                    }));

                    // Help
                    menuInstance.appendChild(createMenuItem('help.svg', 'Help', () => {
                        window.location.href = 'documentation.html';
                    }));

                    // Source Code
                    menuInstance.appendChild(createMenuItem('sourcecode.svg', 'Source Code', () => {
                        window.open('https://github.com/pbz134/LocalYT', '_blank');
                    }));

                    // Send Feedback
                    menuInstance.appendChild(createMenuItem('feedback.svg', 'Send Feedback', () => {
                        window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                    }));
                }
            })
            .catch(err => {
                console.error('Error checking session:', err);
                // Fallback: Show Sign In on error
                menuInstance.appendChild(createMenuItem('signout.svg', 'Sign In', () => {
                    window.location.href = 'login.html';
                }));
            });

        // Attach Events
        img.onclick = function(e) {
            e.stopPropagation();
            toggleMenu();
        };

        // Append to DOM
        userActions.appendChild(img);
        userActions.appendChild(menuInstance);

        // Inject CSS for the menu
        injectMenuStyles();
    }

    function injectMenuStyles() {
        if (document.getElementById('profile-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'profile-menu-styles';
        style.textContent = `
            .profile-menu-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background-color: #212121;
                border: 1px solid rgba(255, 255, 255, 0.1);
                min-width: 220px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                z-index: 2000;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-10px);
                transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
                padding: 8px 0;
            }

            .profile-menu-dropdown.open {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }

            .profile-menu-item {
                display: flex;
                align-items: center;
                padding: 10px 20px;
                color: #fff;
                font-family: 'RobotoRegular', Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
                transition: background-color 0.15s ease;
                user-select: none;
            }

            .profile-menu-item:hover {
                background-color: rgba(255, 255, 255, 0.1);
            }

            .profile-menu-icon {
                width: 20px;
                height: 20px;
                margin-right: 16px;
                opacity: 0.9;
                filter: invert(1);
            }

            .header-profile-pic {
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfilePic);
    } else {
        initProfilePic();
    }
})();