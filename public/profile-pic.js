(function() {
    const PLACEHOLDER = '/LocalYT-Rev-Files/user-profile-placeholder.jpg';
    let menuInstance = null;

    // --- Language Helper ---
    function getLang(en, de) {
        return localStorage.getItem('language') === 'de' ? de : en;
    }

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

    function toggleAppearanceMode() {
        const root = document.documentElement;
        const currentMode = localStorage.getItem('appearanceMode');

        if (currentMode === 'oled') {
            // Switch to Regular Dark
            root.style.setProperty('--main-bg-color', '#0f0f0f');
            root.style.setProperty('--secondary-bg-color', '#212121');
            root.style.setProperty('--input-bg-color', '#1a1a1a');
            localStorage.setItem('appearanceMode', 'dark');
        } else {
            // Switch to OLED (Pure Black)
            root.style.setProperty('--main-bg-color', '#000000');
            root.style.setProperty('--secondary-bg-color', '#000000');
            root.style.setProperty('--input-bg-color', '#000000');
            localStorage.setItem('appearanceMode', 'oled');
        }
    }

    function updateAppearanceText(item) {
        const currentMode = localStorage.getItem('appearanceMode');
        const textSpan = item.querySelector('.profile-menu-text');
        if (currentMode === 'oled') {
            textSpan.textContent = getLang('Appearance: OLED', 'Erscheinungsbild: OLED');
            item.querySelector('.profile-menu-icon').src = '/LocalYT-Rev-Files/appearance.svg'; // Optional: change icon if you have one
        } else {
            textSpan.textContent = getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel');
        }
    }

    function toggleLanguage() {
        const currentLang = localStorage.getItem('language');
        const newLang = currentLang === 'de' ? 'en' : 'de';
        localStorage.setItem('language', newLang);
        applyLanguage(); // Apply changes immediately
    }

    function updateLanguageText(item) {
        const currentLang = localStorage.getItem('language');
        const textSpan = item.querySelector('.profile-menu-text');
        if (currentLang === 'de') {
            textSpan.textContent = getLang('Language: German', 'Sprache: Deutsch');
        } else {
            textSpan.textContent = getLang('Language: English', 'Sprache: Englisch');
        }
    }

    // This function applies the selected language to the page content
    function applyLanguage() {
        const lang = localStorage.getItem('language');
        
        // Dictionary of all translatable text
        const dict = {
            // Header / Main Buttons
            'subscribeButton': { en: 'Subscribe', de: 'Abonnieren' },
            'subscribedState': { en: 'Subscribed', de: 'Abonniert' },
            'shareContainer': { en: 'Share', de: 'Teilen' },
            'saveContainer': { en: 'Save', de: 'Speichern' },
            'savedState': { en: 'Saved', de: 'Gespeichert' },
            
            // Description / Info
            'descriptionToggleMore': { en: 'Show more', de: 'Mehr anzeigen' },
            'descriptionToggleLess': { en: 'Show less', de: 'Weniger anzeigen' },
            'noDescription': { en: 'No description available for this video.', de: 'Keine Beschreibung für dieses Video verfügbar.' },
            
            // Comments Section
            'commentsCount': { en: 'Comments', de: 'Kommentare' },
            
            // Save Modal
            'saveModalTitle': { en: 'Save to Playlist', de: 'In Playlist speichern' },
            'noPlaylistsMessage': { en: 'No playlists yet. Create one below.', de: 'Keine Playlisten vorhanden. Erstellen Sie unten eine.' },
            'newPlaylistName': { en: 'New playlist name', de: 'Name der neuen Playlist' },
            'createPlaylistBtn': { en: 'Create', de: 'Erstellen' },
            
            // Share Modal
            'shareModalTitle': { en: 'Share Video', de: 'Video teilen' },
            'copyWithTimestamp': { en: 'Copy Link + Timestamp', de: 'Link + Zeitstempel kopieren' },
            'copyWithoutTimestamp': { en: 'Copy Link', de: 'Link kopieren' },
            'copyMessage': { en: 'Video URL copied to clipboard!', de: 'Video-URL in die Zwischenablage kopiert!' },
            
            // Sidebar
            'recHeader': { en: 'Recommended', de: 'Empfohlen' }
        };

        // 1. Update Elements by ID
        Object.keys(dict).forEach(key => {
            const el = document.getElementById(key);
            if (el) {
                // Handle inputs (placeholder)
                if (el.tagName === 'INPUT') {
                    el.placeholder = dict[key][lang] || dict[key]['en'];
                } 
                // Handle spans inside buttons (Share/Save)
                else if (el.querySelector('span')) {
                    el.querySelector('span').textContent = dict[key][lang] || dict[key]['en'];
                } 
                // Handle standard elements
                else {
                    el.textContent = dict[key][lang] || dict[key]['en'];
                }
            }
        });
        
        // 2. Update Modal Titles (Selectors for H2 inside modals)
        const saveH2 = document.querySelector('#saveModal h2');
        if (saveH2) saveH2.textContent = dict.saveModalTitle[lang];
        
        const shareH2 = document.querySelector('#shareModal h2');
        if (shareH2) shareH2.textContent = dict.shareModalTitle[lang];

        // 3. Handle Dynamic States (Text set via JS logic)
        const subBtn = document.getElementById('subscribeButton');
        if (subBtn) {
             if (subBtn.classList.contains('subscribed')) {
                subBtn.textContent = dict.subscribedState[lang];
            } else {
                subBtn.textContent = dict.subscribeButton[lang];
            }
        }

        const saveSpan = document.querySelector('#saveContainer span');
        if (saveSpan) {
            // Check if it is in the "Saved" state by checking the icon src or a class if you prefer
            // Since we don't have a class, we check the icon src associated with it
            const saveIcon = document.getElementById('saveIcon');
            const isSaved = saveIcon && saveIcon.src.includes('saved.svg');
            
            if (isSaved) {
                saveSpan.textContent = dict.savedState[lang];
            } else {
                saveSpan.textContent = dict.saveContainer[lang];
            }
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
    // Apply saved appearance mode
    if (localStorage.getItem('appearanceMode') === 'oled') {
        document.documentElement.style.setProperty('--main-bg-color', '#000000');
        document.documentElement.style.setProperty('--secondary-bg-color', '#000000');
        document.documentElement.style.setProperty('--input-bg-color', '#000000');
    }

    // Apply saved Language on load
    if (localStorage.getItem('language') === 'de') {
        applyLanguage();
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
                    menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign Out', 'Abmelden'), () => {
                        fetch('/logout').then(() => {
                            window.location.href = '/login.html';
                        }).catch(err => console.error('Logout failed:', err));
                    }));

                    // Appearance (Toggle Logic)
                    const appearanceItem = createMenuItem('appearance.svg', getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel'));

                    // Update text based on current state
                    updateAppearanceText(appearanceItem);

                    appearanceItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleAppearanceMode();
                        updateAppearanceText(appearanceItem);
                        closeMenu();
                    });

                    menuInstance.appendChild(appearanceItem);

                    // Language (Toggle Logic)
                    const languageItem = createMenuItem('language.svg', getLang('Language: English', 'Sprache: Englisch'));
                    updateLanguageText(languageItem); // Set initial text
                    
                    languageItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleLanguage();
                        updateLanguageText(languageItem);
                        closeMenu();
                    });
                    
                    menuInstance.appendChild(languageItem);

                    // Settings
                    menuInstance.appendChild(createMenuItem('settings.svg', getLang('Settings', 'Einstellungen'), () => {
                        window.location.href = 'settings.html';
                    }));

                    // Help
                    menuInstance.appendChild(createMenuItem('help.svg', getLang('Help', 'Hilfe'), () => {
                        window.location.href = 'documentation.html';
                    }));

                    // Source Code
                    menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                        window.open('https://github.com/pbz134/LocalYT', '_blank');
                    }));

                    // Send Feedback
                    menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                        window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                    }));

                } else {
                    // --- LOGGED OUT STATE ---
                    
                    // Sign In
                    menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
                        window.location.href = 'login.html';
                    }));

                    // Help
                    menuInstance.appendChild(createMenuItem('help.svg', getLang('Help', 'Hilfe'), () => {
                        window.location.href = 'documentation.html';
                    }));

                    // Source Code
                    menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                        window.open('https://github.com/pbz134/LocalYT', '_blank');
                    }));

                    // Send Feedback
                    menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                        window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                    }));
                }
            })
            .catch(err => {
                console.error('Error checking session:', err);
                // Fallback: Show Sign In on error
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
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
                background-color: var(--secondary-bg-color);
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