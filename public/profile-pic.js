(function() {
    const PLACEHOLDER = '/LocalYT-Rev-Files/user-profile-placeholder.jpg';
    let menuInstance = null;
    let currentUserId = null;

    // --- Settings Storage Helpers ---
    function getSetting(key, fallback) {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    }

    function setSetting(key, value) {
        localStorage.setItem(key, value);
        if (currentUserId) {
            saveSettingsToServer();
        }
    }

    function saveSettingsToServer() {
        const settings = {
            language: localStorage.getItem('language'),
            appearanceMode: localStorage.getItem('appearanceMode')
        };
        fetch('/user-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        }).catch(err => console.error('Failed to sync settings:', err));
    }

    function saveSettingsToServerSync() {
        const settings = {
            language: localStorage.getItem('language'),
            appearanceMode: localStorage.getItem('appearanceMode')
        };
        return fetch('/user-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        }).catch(err => console.error('Failed to sync settings:', err));
    }

    function loadSettingsFromServer() {
        return fetch('/user-settings')
            .then(res => {
                if (!res.ok) throw new Error('Not authenticated');
                return res.json();
            })
            .then(settings => {
                if (settings.language) localStorage.setItem('language', settings.language);
                if (settings.appearanceMode) localStorage.setItem('appearanceMode', settings.appearanceMode);
                return settings;
            })
            .catch(() => null);
    }

    function getLang(en, de) {
        return getSetting('language', 'en') === 'de' ? de : en;
    }

    // ======================================================================
    // SETTINGS PAGE TRANSLATIONS
    // ======================================================================
    function translateSettingsPage() {
        // Only run on settings page
        if (!window.location.pathname.includes('settings.html')) return;

        const lang = getSetting('language', 'en');
        const isDe = lang === 'de';

        // --- Tab content headings (the <h1> at the top of each panel) ---
        const tabHeadings = {
            'tab-profile': { en: 'Profile Picture', de: 'Profilbild' },
            'tab-appearance': { en: 'Appearance', de: 'Erscheinungsbild' },
            'tab-playback': { en: 'Playback', de: 'Wiedergabe' },
            'tab-content': { en: 'Content & Recommendations', de: 'Inhalt & Empfehlungen' },
            'tab-account': { en: 'Account', de: 'Konto' }
        };

        Object.keys(tabHeadings).forEach(tabId => {
            const tabPanel = document.getElementById(tabId);
            if (tabPanel) {
                const h1 = tabPanel.querySelector('h1');
                if (h1) {
                    h1.textContent = tabHeadings[tabId][isDe ? 'de' : 'en'];
                }
            }
        });

        // Translation dictionary for settings page elements with IDs
        const translations = {
            // Sidebar tab titles
            sidebarProfile: { en: 'Profile Picture', de: 'Profilbild' },
            sidebarAppearance: { en: 'Appearance', de: 'Erscheinungsbild' },
            sidebarPlayback: { en: 'Playback', de: 'Wiedergabe' },
            sidebarContent: { en: 'Content', de: 'Inhalt' },
            sidebarAccount: { en: 'Account', de: 'Konto' },

            // Profile tab
            uploadBtn: { en: 'Upload Picture', de: 'Bild hochladen' },
            removeBtn: { en: 'Remove Picture', de: 'Bild entfernen' },

            // Save buttons
            saveAppearanceBtn: { en: 'Save Appearance Settings', de: 'Erscheinungsbild speichern' },
            savePlaybackBtn: { en: 'Save Playback Settings', de: 'Wiedergabe speichern' },
            saveContentBtn: { en: 'Save Content Settings', de: 'Inhaltseinstellungen speichern' },

            // Account tab - buttons with IDs
            renameBtn: { en: 'Rename', de: 'Umbenennen' },
            changePassBtn: { en: 'Update', de: 'Aktualisieren' },
            exportConfigBtn: { en: 'Export Config', de: 'Konfig. exportieren' },
            logoutBtn: { en: 'Logout', de: 'Abmelden' },
            toggleDeleteBtn: { en: 'Delete Account', de: 'Konto löschen' },
            deleteAccountBtn: { en: 'Confirm Delete', de: 'Löschen bestätigen' },

            // Algorithm preferences
            algoPrefsHeading: { en: 'Algorithm Preferences', de: 'Algorithmus-Einstellungen' },
            algoPrefsDesc: { en: 'Adjust scores to influence your recommendations. Higher = matching videos are more likely to appear.', de: 'Passe die Werte an, um deine Empfehlungen zu beeinflussen. Höher = passende Videos werden eher angezeigt.' },
            addTagBtn: { en: 'Add Tag', de: 'Tag hinzufügen' },
            resetPrefsBtn: { en: 'Reset All', de: 'Alle zurücksetzen' },

            // Modal buttons
            cancelCropBtn: { en: 'Cancel', de: 'Abbrechen' },
            doneCropBtn: { en: 'Done', de: 'Fertig' }
        };

        // Apply translations to elements with matching IDs
        Object.keys(translations).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
                    el.placeholder = translations[id][isDe ? 'de' : 'en'];
                } else {
                    el.textContent = translations[id][isDe ? 'de' : 'en'];
                }
            }
        });

        // --- Translate Account tab sections ---
        const accountTab = document.getElementById('tab-account');
        if (accountTab) {
            // Find all h2 elements in account sections
            const h2s = accountTab.querySelectorAll('.account-section h2');
            const h2Map = [
                { en: 'Account Management', de: 'Kontoverwaltung' },
                { en: 'Configuration', de: 'Konfiguration' },
                { en: 'Danger Zone', de: 'Gefahrenzone' }
            ];
            h2s.forEach((h2, i) => {
                if (h2Map[i]) {
                    h2.textContent = isDe ? h2Map[i].de : h2Map[i].en;
                }
            });

            // Find all h3 elements in account sections
            const h3s = accountTab.querySelectorAll('h3');
            const h3Map = [
                { en: 'Rename Account', de: 'Konto umbenennen' },
                { en: 'Change Password', de: 'Passwort ändern' },
                { en: 'Logout', de: 'Abmelden' },
                { en: 'Delete Account', de: 'Konto löschen' }
            ];
            h3s.forEach((h3, i) => {
                if (h3Map[i]) {
                    h3.textContent = isDe ? h3Map[i].de : h3Map[i].en;
                }
                if (i === 3) {
                    h3.style.color = '#ff4444';
                }
            });

            // Translate description paragraphs in account sections
            const descPs = accountTab.querySelectorAll('.account-section p');
            const descMap = [
                { en: 'End your current session.', de: 'Beende deine aktuelle Sitzung.' },
                { en: 'WARNING: Once deleted, you won\'t be able to recover it.', de: 'WARNUNG: Einmal gelöscht, kann das Konto nicht wiederhergestellt werden.' },
                { en: 'Export or import your settings as a JSON file.', de: 'Exportiere oder importiere deine Einstellungen als JSON-Datei.' }
            ];
            descPs.forEach((p, i) => {
                if (descMap[i]) {
                    p.textContent = isDe ? descMap[i].de : descMap[i].en;
                }
            });

            // Translate delete warning text (contains HTML)
            const deleteWarning = accountTab.querySelector('#deleteWarningText');
            if (deleteWarning) {
                deleteWarning.innerHTML = isDe
                    ? 'Gib dein aktuelles Passwort ein und tippe <strong style="color:#ff4444;">DELETE</strong>, um dein Konto permanent zu löschen.'
                    : 'Enter your current password and type <strong style="color:#ff4444;">DELETE</strong> to permanently delete your account.';
            }

            // Translate input placeholders in account tab
            const inputs = {
                newUsername: { en: 'New Username', de: 'Neuer Benutzername' },
                currentPassword: { en: 'Current Password', de: 'Aktuelles Passwort' },
                newPassword: { en: 'New Password', de: 'Neues Passwort' },
                deletePassword: { en: 'Current Password', de: 'Aktuelles Passwort' },
                deleteConfirmInput: { en: 'Type DELETE', de: 'DELETE eingeben' }
            };
            Object.keys(inputs).forEach(inputId => {
                const input = accountTab.querySelector('#' + inputId);
                if (input) input.placeholder = inputs[inputId][isDe ? 'de' : 'en'];
            });

            // Translate import config label
            const importLabel = accountTab.querySelector('label[for="importConfigInput"]');
            if (importLabel) importLabel.textContent = isDe ? 'Konfig. importieren' : 'Import Config';
        }

        // --- Translate settings section headers (the grid section dividers) ---
        const sectionHeaders = document.querySelectorAll('.settings-section-header');
        const headerMap = {
            'Video & Channel Layout': { en: 'Video & Channel Layout', de: 'Video & Kanal-Layout' },
            'Playlist Layout': { en: 'Playlist Layout', de: 'Playlist-Layout' },
            'Visual Style': { en: 'Visual Style', de: 'Visueller Stil' },
            'Player': { en: 'Player', de: 'Player' },
            'Autoplay': { en: 'Autoplay', de: 'Autoplay' },
            'Playlist Behavior': { en: 'Playlist Behavior', de: 'Playlist-Verhalten' },
            'Player Overlays': { en: 'Player Overlays', de: 'Player-Overlays' }
        };
        
        sectionHeaders.forEach(header => {
            const text = header.textContent.trim();
            if (headerMap[text]) {
                header.textContent = isDe ? headerMap[text].de : headerMap[text].en;
            }
        });

        // --- Translate search input placeholder ---
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.placeholder = isDe ? 'Suchen' : 'Search';
        }

        // --- Translate tag input placeholder ---
        const tagInput = document.getElementById('newTagInput');
        if (tagInput) {
            tagInput.placeholder = isDe ? 'Neuen Tag hinzufügen...' : 'Add new tag...';
        }

        // --- Translate card labels and descriptions ---
        const cardTranslations = {
            videoPageLayoutLabel: { en: 'Video page style', de: 'Videoseiten-Stil' },
            videoPageLayoutDesc: { en: 'Modern or Classic layout (view count on right, buttons stacked)', de: 'Modernes oder klassisches Layout (Aufrufzahl rechts, Buttons gestapelt)' },
            channelPageStyleLabel: { en: 'Channel page style', de: 'Kanalseiten-Stil' },
            channelPageStyleDesc: { en: 'Modern rounded header or classic square-in-banner', de: 'Moderner abgerundeter Header oder klassisch (Quadrat im Banner)' },
            channelDefaultViewLabel: { en: 'Default channel video layout', de: 'Standard-Kanalvideo-Layout' },
            channelDefaultViewDesc: { en: 'Grid or list for channel videos tab', de: 'Raster oder Liste für Kanal-Videos' },
            playlistPageLayoutLabel: { en: 'Default playlist layout', de: 'Standard-Playlist-Layout' },
            playlistPageLayoutDesc: { en: 'Grid or list view for playlists', de: 'Raster- oder Listenansicht für Playlists' },
            commenterProfileLabel: { en: 'Commenter avatar style', de: 'Avatar-Stil für Kommentatoren' },
            commenterProfileDesc: { en: 'Letters & colors or classic placeholder', de: 'Buchstaben & Farben oder klassischer Platzhalter' },
            titleColorSchemeLabel: { en: 'Title color scheme', de: 'Titel-Farbschema' },
            titleColorSchemeDesc: { en: 'Video titles & channel names in white or blue', de: 'Videotitel & Kanalnamen in Weiß oder Blau' },
            roundedCornersLabel: { en: 'Rounded corners', de: 'Abgerundete Ecken' },
            roundedCornersDesc: { en: 'Subtle rounding on player & thumbnails', de: 'Leichte Abrundung an Player & Thumbnails' },
            sidebarSvgIconsLabel: { en: 'Sidebar SVG icons', de: 'Seitenleisten-Symbole' },
            sidebarSvgIconsDesc: { en: 'Show icons next to sidebar items', de: 'Symbole neben Seitenleisteneinträgen anzeigen' },
            playerUIScaleLabel: { en: 'Player UI scale', de: 'Player-UI-Skalierung' },
            playerUIScaleDesc: { en: 'Control size (+/- keys while playing)', de: 'Größe der Steuerung (+/- Tasten während der Wiedergabe)' },
            autoplayEnabledLabel: { en: 'Enable Autoplay', de: 'Autoplay aktivieren' },
            autoplayDesc: { en: 'Automatically play next video', de: 'Nächstes Video automatisch abspielen' },
            playlistAutoplayLabel: { en: 'Autoplay next in playlist', de: 'Nächstes in Playlist abspielen' },
            playlistAutoplayDesc: { en: 'Play next video in sequence', de: 'Nächstes Video in Reihenfolge abspielen' },
            nonPlaylistModeLabel: { en: 'Non-playlist behavior', de: 'Verhalten außerhalb von Playlists' },
            nonPlaylistDesc: { en: 'What plays after a standalone video ends', de: 'Was nach einem einzelnen Video abgespielt wird' },
            playlistOrderLabel: { en: 'Invert playlist order', de: 'Playlist-Reihenfolge umkehren' },
            playlistOrderDesc: { en: 'Newest videos first (oldest on the right)', de: 'Neueste Videos zuerst (älteste rechts)' },
            channelProfilePicLabel: { en: 'Show channel profile pic', de: 'Kanal-Profilbild anzeigen' },
            channelProfilePicDesc: { en: 'Bottom-right corner of player', de: 'Untere rechte Ecke des Players' },
            showEndScreenGridLabel: { en: 'End screen recommendation grid', de: 'Empfehlungsraster am Ende' },
            showEndScreenGridDesc: { en: '4×3 grid when autoplay is off', de: '4×3-Raster wenn Autoplay deaktiviert ist' },
            showEndcardsLabel: { en: 'Show video endcards', de: 'Video-Endkarten anzeigen' },
            showEndcardsDesc: { en: 'Two thumbnails in last 20 seconds', de: 'Zwei Vorschaubilder in den letzten 20 Sekunden' },
            fuzzySubCountLabel: { en: 'Fuzzy subscription counts', de: 'Ungefähre Abonnentenzahlen' },
            fuzzySubCountDesc: { en: 'Randomize last digits of rounded counts', de: 'Letzte Ziffern gerundeter Zahlen zufällig machen' },
            hidePostImagesLabel: { en: 'Hide images in posts', de: 'Bilder in Beiträgen ausblenden' },
            hidePostImagesDesc: { en: 'Save bandwidth & reduce loading times', de: 'Bandbreite sparen & Ladezeiten reduzieren' }
        };

        Object.keys(cardTranslations).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = cardTranslations[id][isDe ? 'de' : 'en'];
            }
        });

        // --- Translate dropdown options ---
        const dropdownTranslations = {
            videoPageLayout: {
                options: [
                    { en: 'Modern', de: 'Modern' },
                    { en: 'Classic', de: 'Klassisch' }
                ]
            },
            channelPageStyle: {
                options: [
                    { en: 'Modern', de: 'Modern' },
                    { en: 'Classic', de: 'Klassisch' }
                ]
            },
            channelDefaultView: {
                options: [
                    { en: 'Grid', de: 'Raster' },
                    { en: 'List', de: 'Liste' }
                ]
            },
            playlistPageLayout: {
                options: [
                    { en: 'Grid', de: 'Raster' },
                    { en: 'List', de: 'Liste' }
                ]
            },
            commenterProfileStyle: {
                options: [
                    { en: 'Modern (Letters & Colors)', de: 'Modern (Buchstaben & Farben)' },
                    { en: 'Classic (Placeholder)', de: 'Klassisch (Platzhalter)' }
                ]
            },
            titleColorScheme: {
                options: [
                    { en: 'Default', de: 'Standard' },
                    { en: 'Blue', de: 'Blau' }
                ]
            },
            autoplayNonPlaylistMode: {
                options: [
                    { en: 'First recommended', de: 'Erstes empfohlenes' },
                    { en: 'Random recommended', de: 'Zufällig empfohlen' },
                    { en: 'Random from database', de: 'Zufällig aus Datenbank' }
                ]
            },
            playerUIScale: {
                options: {
                    5: { en: '100% (Default)', de: '100% (Standard)' }
                }
            }
        };

        Object.keys(dropdownTranslations).forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const config = dropdownTranslations[selectId];
            if (config.options && Array.isArray(config.options)) {
                config.options.forEach((opt, i) => {
                    if (select.options[i]) {
                        select.options[i].text = isDe ? opt.de : opt.en;
                    }
                });
            } else if (config.options && typeof config.options === 'object') {
                Object.keys(config.options).forEach(idx => {
                    if (select.options[idx]) {
                        select.options[idx].text = isDe ? config.options[idx].de : config.options[idx].en;
                    }
                });
            }
        });
    }

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
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 0);
        }
    }

    // ======================================================================
    // BULLETPROOF LOGO COLOR (Data URI method to bypass <img> SVG limits)
    // ======================================================================
    function applyLogoColor() {
        const logo = document.getElementById('mainLogo');
        if (!logo) return;

        const isLight = getSetting('appearanceMode', 'dark') === 'light';
        const targetColor = isLight ? '#333333' : '#ffffff';
        const versionTextColor = isLight ? '#999999' : '#c8c8c8';

        if (logo.dataset.currentLogoColor === targetColor) return;

        fetch('LocalYT-Rev-Files/Logo.svg')
            .then(response => response.text())
            .then(svgText => {
                const protectedSvg = svgText.replace(
                    /(<g clip-path="url\(#clip1_2733_1405\)">[\s\S]*?<\/g>)/,
                    (match) => match.replace(/fill="white"/g, 'fill="KEEP_WHITE"')
                );

                let modifiedSvg = protectedSvg.replace(/fill="white"/g, `fill="${targetColor}"`);
                modifiedSvg = modifiedSvg.replace(/fill="KEEP_WHITE"/g, 'fill="white"');

                const base64Svg = btoa(unescape(encodeURIComponent(modifiedSvg)));
                logo.src = `data:image/svg+xml;base64,${base64Svg}`;
                
                logo.dataset.currentLogoColor = targetColor;
            })
            .then(() => {
                applyChristmasHat(); 
            })
            .catch(err => {
                console.error('Failed to load SVG for coloring, falling back to default:', err);
            });
    }

    // ======================================================================
    // CHRISTMAS HAT OVERLAY (Server Time Check)
    // ======================================================================
    function applyChristmasHat() {
        const logo = document.getElementById('mainLogo');
        if (!logo) return;

        if (logo.dataset.christmasHatApplied === 'true') return;

        fetch(window.location.href, { method: 'HEAD' })
            .then(response => {
                const serverDateStr = response.headers.get('Date');
                if (!serverDateStr) return;
                
                const serverMonth = new Date(serverDateStr).getMonth();
                
                if (serverMonth !== 11) return;

                requestAnimationFrame(() => {
                    if (logo.dataset.christmasHatApplied === 'true') return;

                    const logoWidth = logo.offsetWidth;
                    const logoHeight = logo.offsetHeight;

                    if (logoWidth === 0 || logoHeight === 0) {
                        return;
                    }

                    let wrapper = logo.parentElement;
                    if (!wrapper.classList.contains('christmas-logo-wrapper')) {
                        wrapper = document.createElement('div');
                        wrapper.className = 'christmas-logo-wrapper';
                        wrapper.style.position = 'relative';
                        wrapper.style.display = 'inline-flex';
                        wrapper.style.alignItems = 'center';
                        wrapper.style.overflow = 'visible';
                        logo.parentNode.insertBefore(wrapper, logo);
                        wrapper.appendChild(logo);
                    }

                    const hatImg = document.createElement('img');
                    hatImg.src = '/LocalYT-Rev-Files/christmas-hat.png';
                    hatImg.className = 'christmas-hat-overlay';
                    hatImg.draggable = false;

                    const hatWidth = logoWidth * 0.18; 
                    
                    const offsetY = -(hatWidth * 0.45);
                    const offsetX = -(hatWidth * -0.55);

                    Object.assign(hatImg.style, {
                        position: 'absolute',
                        top: `${offsetY}px`,
                        left: `${offsetX}px`,
                        width: `${hatWidth}px`,
                        height: 'auto',
                        pointerEvents: 'none',
                        zIndex: '10',
                        transform: 'rotate(15deg)'
                    });

                    wrapper.appendChild(hatImg);
                    logo.dataset.christmasHatApplied = 'true';
                });
            })
            .catch(err => {
                console.error('Failed to check server time for Christmas hat:', err);
            });
    }

    function applyLightModeBlackOverride() {
        let oldOverride = document.getElementById('light-mode-black-override');
        if (oldOverride) oldOverride.remove();
    
        const titleScheme = JSON.parse(localStorage.getItem('titleColorScheme') || '{}');
        const isBlueTitles = titleScheme.scheme === 'blue';
    
        let styleText = `
            [style*="background-color: rgb(30, 30, 30)"],
            [style*="background-color: #1e1e1e"],
            .video-description,
            .video-item,
            .playlist-item,
            .post-item,
            .channel-top-section,
            .channel-content-section {
                background-color: #FFFFFF !important;
            }
            
            /* Force .video-info background to transparent */
            .video-info {
                background: transparent !important;
                background-color: transparent !important;
            }
            
            [style*="color: rgb(136, 136, 136)"],
            [style*="color: #888888"],
            .video-description,
            .video-description.collapsed,
            .home-video-description-text,
            .playlist-description,
            .playlist-video-count,
            .video-count,
            .post-date,
            .home-video-meta,
            .comment-timestamp,
            .sidebar-autoplay-label,
            .suggestion-channel,
            .view-count {
                color: #555555 !important;
            }
            
            /* Channel name link - darker for better contrast in light mode */
            .channel-name-link {
                color: #1a1a1a !important;
            }
            .channel-name-link:hover {
                color: #065fd4 !important;
            }

            .subscriber-count {
                color: #555555 !important;
            }
    
            [style*="color: rgb(204, 204, 204)"],
            [style*="color: #cccccc"],
            .about-description .description-text,
            .stats-item,
            .stats-item.total-views,
            .share-button,
            #shareBtnText {
                color: #555555 !important;
            }
    
            [style*="color: rgb(170, 170, 170)"],
            [style*="color: #aaaaaa"],
            .tab,
            .like-dislike-icons span,
            .share-container span,
            .save-container span,
            .sub-count,
            .comment-like-btn span,
            .description-toggle {
                color: #666666 !important;
            }
    
            #classicInfoBoxWrapper {
                background-color: #ffffff !important;
                border-color: #e0e0e0 !important;
            }
    
            #classicInfoBoxWrapper #classicActionsWrapper {
                border-top-color: #e0e0e0 !important;
            }
    
            .channel-name,
            .classic-channel-name-text {
                color: #000000 !important;
            }
    
            body[data-video-layout="classic"] .video-description,
            .classic-layout-active .video-description {
                background-color: #ffffff !important;
            }
    
            body[data-video-layout="classic"] .description-toggle,
            .classic-layout-active .description-toggle {
                background-color: #ffffff !important;
                border-top-color: #e0e0e0 !important;
                color: #333333 !important;
            }
    
            .channel-name,
            .classic-channel-name-text {
                color: #000000 !important;
            }
    
            .tab.active {
                color: #333 !important;
                border-bottom-color: #333 !important;
            }
    
            .suggestion-item.current-video-item {
                background-color: #999 !important;
            }
    
            .playlist-section-header, .playlist-section-header a {
                color: #333 !important;
            }

            /* Playlists page light mode fixes */
            .playlists-header {
                color: #000000 !important;
            }
            .playlist-title {
                color: #000000 !important;
            }
            .playlist-video-count,
            .playlist-total-duration {
                color: #555555 !important;
            }
            .playlist-section {
                border-bottom-color: #e0e0e0 !important;
            }
            .playlist-btn {
                color: #555555 !important;
                border-color: #cccccc !important;
            }
            .playlist-btn:hover {
                color: #000000 !important;
                border-color: #999999 !important;
                background: rgba(0, 0, 0, 0.05) !important;
            }
            .playlist-delete-btn:hover {
                color: #ff4444 !important;
                border-color: #ff4444 !important;
                background: rgba(255, 68, 68, 0.05) !important;
            }
            .playlist-share-btn:hover {
                color: #3ea6ff !important;
                border-color: #3ea6ff !important;
                background: rgba(62, 166, 255, 0.05) !important;
            }
            .playlist-video-item .video-description {
                background-color: transparent !important;
            }
            .scroll-arrow {
                background: rgba(255, 255, 255, 0.8) !important;
                border-color: #cccccc !important;
            }
            .scroll-arrow svg {
                fill: #333333 !important;
            }
            .scroll-arrow:hover {
                background: rgba(255, 255, 255, 0.95) !important;
                border-color: #999999 !important;
            }
    
            .suggestion-item {
                background-color: #ffffff !important;
                color: #0f0f0f !important;
            }
    
            .suggestion-item:hover {
                background-color: #e0e0e0 !important;
            }
    
            .search-suggestions {
                background-color: #ffffff !important;
                border-color: rgba(0, 0, 0, 0.1) !important;
            }
    
            .suggestion-item .history-icon {
                filter: invert(0) !important;
            }
    
            .suggestion-item .history-icon {
                filter: invert(0.8) !important;
            }
    
            [style*="color: rgb(227, 227, 227)"],
            [style*="color: #e3e3e3"],
            .post-content-text,
            .classic-playlist-description {
                color: #000000 !important;
            }
    
            .comment-text.collapsed::after {
                background: linear-gradient(rgba(255, 255, 255, 0), #f1f1f1) !important;
            }
    
            .video-description.collapsed::after {
                background: linear-gradient(rgba(255, 255, 255, 0), #ffffff) !important;
            }
    
            .channel-name {
                color: #000000 !important;
            }
    
            .subscriber-count {
                color: #737373 !important;
            }
    
            ::placeholder {
                color: #737373 !important;
            }
    
            .search-icon {
                filter: invert(0.6) !important; 
            }
    
            .tab-search-icon {
                filter: invert(0) !important;
            }
    
            #channelSearchInput {
                color: #0f0f0f !important;
            }
            #searchInput {
                color: #000000 !important;
            }

            .search-filters-toggle {
                background: #e0e0e0 !important;
                color: #0f0f0f !important;
            }
            .search-filters-toggle:hover {
                background: #d0d0d0 !important;
                color: #000 !important;
            }
            .search-filters-toggle.active {
                background: #cccccc !important;
                color: #000 !important;
            }

            .category-button {
                background-color: #ffffff !important;
                color: #0f0f0f !important;
                border-color: #cccccc !important;
            }

            .category-button:hover {
                background-color: #e0e0e0 !important;
            }

            /* ===== DIVIDER BELOW MINI PLAYER LIGHT MODE ===== */
            .home-others-label {
                border-top-color: #e0e0e0 !important;
            }

            /* ===== RELATED TAB LIGHT MODE ===== */
            #relatedTab .related-channel-item {
                background-color: #ffffff !important;
                border-color: #e0e0e0 !important;
            }
            #relatedTab .related-channel-item:hover {
                background-color: #f0f0f0 !important;
            }
            #relatedTab .related-channel-name {
                color: #0f0f0f !important;
            }
            #relatedTab .related-channel-name:hover {
                color: #065fd4 !important;
            }
            #relatedTab .related-channel-sub-btn {
                background-color: #cc181e !important;
                color: #ffffff !important;
            }
            #relatedTab .related-channel-sub-btn:hover {
                background-color: #a31418 !important;
            }
            #relatedTab .related-channel-sub-btn.subscribed {
                background-color: #e0e0e0 !important;
                color: #0f0f0f !important;
            }
            #relatedTab .related-channel-sub-btn.subscribed:hover {
                background-color: #cccccc !important;
            }
            #relatedTab .no-related-channels {
                color: #555555 !important;
            }
            #relatedTabLabel {
                color: #0f0f0f !important;
            }

            /* ===== CHANGELOG PAGE LIGHT MODE ===== */
            .doc-sidebar {
                background-color: #f0f0f0 !important;
                border-right-color: #d0d0d0 !important;
            }
            .toc-item a {
                color: #444444 !important;
            }
            .toc-item a:hover {
                color: #222222 !important;
                background-color: rgba(0, 0, 0, 0.05) !important;
                border-left-color: #aaaaaa !important;
            }
            .toc-title {
                color: #000000 !important;
            }
            .doc-content {
                color: #222222 !important;
            }
            .doc-header {
                border-bottom-color: #d0d0d0 !important;
            }
            .doc-header h1 {
                color: #000000 !important;
            }
            .doc-header p {
                color: #555555 !important;
            }
            .doc-section h2 {
                color: #000000 !important;
                border-left-color: #999999 !important;
            }
            .doc-section li {
                color: #333333 !important;
            }
            .doc-divider {
                border-top-color: #e0e0e0 !important;
            }
            .top-bar {
                background-color: #f0f0f0 !important;
                border-bottom-color: #d0d0d0 !important;
            }
            .top-bar .logo {
                filter: none !important;
            }

            /* ===== EDIT TOPICS PAGE LIGHT MODE ===== */
            .edit-topics-title,
            .modal-title,
            .topic-card-name {
                color: #000000 !important;
            }
            .edit-topics-subtitle,
            .topic-card-meta,
            .form-group .hint {
                color: #555555 !important;
            }
            .topic-card {
                background: #f5f5f5 !important;
                border-color: #e0e0e0 !important;
            }
            .topic-card:hover {
                background: #eeeeee !important;
            }
            .topic-card-pic {
                background: #ddd !important;
            }
            .modal-content {
                background: #ffffff !important;
                border-color: #d0d0d0 !important;
                color: #333333 !important;
            }
            .form-group label {
                color: #555555 !important;
            }
            .form-group input[type="text"],
            .form-group input[type="number"],
            .form-group textarea {
                background: #f0f0f0 !important;
                border-color: #cccccc !important;
                color: #000000 !important;
            }
            .form-group input:focus,
            .form-group textarea:focus {
                border-color: #3ea6ff !important;
            }
            .tag-input-wrapper {
                background: #f0f0f0 !important;
                border-color: #cccccc !important;
            }
            .tag-input-field {
                color: #000000 !important;
            }
            .tag-pill {
                background: #3ea6ff33 !important;
                color: #065fd4 !important;
                border-color: #3ea6ff66 !important;
            }
            .tag-suggestion {
                background: #e8e8e8 !important;
                color: #333333 !important;
                border-color: #cccccc !important;
            }
            .tag-suggestion:hover {
                background: #d0d0d0 !important;
                color: #000000 !important;
                border-color: #aaaaaa !important;
            }
            .btn-secondary {
                background: #e0e0e0 !important;
                color: #222222 !important;
            }
            .btn-secondary:hover {
                background: #cccccc !important;
            }
            .image-preview {
                background: #f0f0f0 !important;
                border-color: #cccccc !important;
            }
            .image-preview .placeholder-text {
                color: #888888 !important;
            }
            .add-topic-card {
                border-color: #cccccc !important;
            }
            .add-topic-card:hover {
                border-color: #3ea6ff !important;
                background: rgba(62, 166, 255, 0.08) !important;
            }
            .add-topic-card .plus-icon {
                color: #888888 !important;
            }
            .add-topic-card .add-text {
                color: #666666 !important;
            }
            .cropper-modal {
                background: #ffffff !important;
                border-color: #d0d0d0 !important;
            }
            .cropper-modal-title {
                color: #000000 !important;
            }
            .modal-overlay {
                background: rgba(0,0,0,0.5) !important;
            }
            .cropper-modal-overlay {
                background: rgba(0,0,0,0.6) !important;
            }

            /* ===== SETTINGS PAGE LIGHT MODE ===== */
            .settings-sidebar {
                background: #f5f5f5 !important;
                border-right: 1px solid #d0d0d0 !important;
            }
            .settings-sidebar a {
                color: #555555 !important;
            }
            .settings-sidebar a:hover {
                color: #000000 !important;
            }
            .settings-sidebar a.active {
                color: #000000 !important;
                background-color: rgba(0, 0, 0, 0.05) !important;
                border-left-color: #000000 !important;
            }
            .settings-content h1 {
                color: #000000 !important;
            }
            .settings-content .profile-status {
                color: #666666 !important;
            }
            .settings-content .profile-btn.secondary {
                background-color: #e0e0e0 !important;
                color: #222222 !important;
            }
            .settings-content .profile-btn.secondary:hover {
                background-color: #cccccc !important;
            }
            .settings-content .profile-btn.primary {
                background-color: #cc0000 !important;
                color: #ffffff !important;
            }
            .settings-content .profile-btn.primary:hover {
                background-color: #ff2222 !important;
            }
            .preset-card {
                background-color: #f5f5f5 !important;
                border-color: #d0d0d0 !important;
            }
            .preset-card .preset-label {
                color: #222222 !important;
            }
            .preset-card .preset-desc {
                color: #666666 !important;
            }
            .preset-select {
                background-color: #ffffff !important;
                border-color: #cccccc !important;
                color: #000000 !important;
            }
            .preset-select:focus {
                border-color: #3ea6ff !important;
            }
            .setting-card {
                background-color: #f5f5f5 !important;
                border-color: #d0d0d0 !important;
            }
            .setting-card:hover {
                border-color: #999999 !important;
            }
            .setting-card .card-label {
                color: #222222 !important;
            }
            .setting-card .card-desc {
                color: #666666 !important;
            }
            .settings-section-header {
                color: #555555 !important;
                border-bottom-color: #d0d0d0 !important;
            }
            .account-section {
                background-color: #f5f5f5 !important;
                border-color: #d0d0d0 !important;
            }
            .account-section h2 {
                border-bottom-color: #d0d0d0 !important;
                color: #000000 !important;
            }
            select.setting-select {
                background-color: #ffffff !important;
                border-color: #cccccc !important;
                color: #000000 !important;
            }
            select.setting-select:focus {
                border-color: #3ea6ff !important;
            }
            .pref-item {
                border-bottom-color: #d0d0d0 !important;
            }
            .pref-tag {
                color: #222222 !important;
            }
            .pref-value {
                background-color: #ffffff !important;
                border-color: #cccccc !important;
                color: #000000 !important;
            }
            .pref-list-container {
                border-color: #d0d0d0 !important;
                background: #fafafa !important;
            }
            .btn {
                background-color: #e0e0e0 !important;
                color: #222222 !important;
            }
            .btn:hover {
                background-color: #cccccc !important;
            }
            .btn-danger {
                background-color: #cc0000 !important;
                color: #ffffff !important;
            }
            .btn-danger:hover {
                background-color: #ff2222 !important;
            }
            .btn-logout {
                background-color: #d0d0d0 !important;
                color: #222222 !important;
            }
            .btn-logout:hover {
                background-color: #bbbbbb !important;
            }
            .btn-save {
                background-color: #2196F3 !important;
                color: #ffffff !important;
            }
            .btn-save:hover {
                background-color: #1e88e5 !important;
            }
            .delete-account-form {
                background-color: #1a0000 !important;
                border-color: #440000 !important;
            }
            .delete-account-form p {
                color: #cccccc !important;
            }
            input[type="text"], input[type="password"] {
                background: #f0f0f0 !important;
                border-color: #cccccc !important;
                color: #000000 !important;
            }
            .save-bar {
                background: #f5f5f5 !important;
                border-top-color: #d0d0d0 !important;
            }
            .save-bar .status-msg {
                color: #555555 !important;
            }
            .toggle-slider {
                background-color: #cccccc !important;
            }
            .toggle-switch input:checked + .toggle-slider {
                background-color: #2196F3 !important;
            }
            .toggle-slider:before {
                background-color: #ffffff !important;
            }
            .profile-pic-display {
                border-color: #cccccc !important;
            }
        `;
    
        // Only force title colors to black if blue titles are OFF
        if (!isBlueTitles) {
            styleText += `
            .video-title:not(.blue-text):not([style*="#128ee9"]),
            .playlist-title:not(.blue-text):not([style*="#128ee9"]),
            .home-video-title:not(.blue-text):not([style*="#128ee9"]),
            .post-author-name:not(.blue-text):not([style*="#128ee9"]),
            .suggestion-title,
            .current-video-title,
            .comment-author,
            .comment-text,
            .comments-count,
            #commentsTotalAmount,
            .video-item .video-title,
            .video-info .video-title,
            .video-details .video-title,
            #videoContainer .video-title {
                color: #000000 !important;
            }
            `;
        } else {
            // Blue titles ON – make suggestion-title and current-video-title darker grey
            styleText += `
            .suggestion-title,
            .current-video-title,
            .video-item .video-title,
            .video-info .video-title,
            .video-details .video-title,
            #videoContainer .video-title {
                color: #128ee9 !important;
            }
            `;
        }
    
        styleText += `
            .openbtn {
                filter: invert(1);
            }
    
            .sort-toggle,
            .sort-toggle.open,
            .view-toggle,
            .view-toggle.open,
            .sort-dropdown-menu,
            .view-dropdown-menu {
                background-color: #f0f0f0 !important;
                color: #0f0f0f !important;
            }
            
            .sort-dropdown-item,
            .view-dropdown-item {
                color: #0f0f0f !important;
            }
            
            .sort-dropdown-item:hover,
            .view-dropdown-item:hover {
                background-color: #e0e0e0 !important;
            }
    
            .sort-toggle-arrow,
            .view-toggle-arrow {
                border-top-color: #0f0f0f !important;
            }
    
            .logo {
                filter: none !important;
            }

            /* Override search.html .video-title for light mode */
            .search-page .video-title {
                color: #000000 !important;
            }
        `;
    
        const style = document.createElement('style');
        style.id = 'light-mode-black-override';
        style.textContent = styleText;
        document.head.appendChild(style);
    }

    function safeRefreshPage() {
        if (sessionStorage.getItem('justRefreshedAppearance') === 'true') {
            sessionStorage.removeItem('justRefreshedAppearance');
            return; 
        }
        sessionStorage.setItem('justRefreshedAppearance', 'true');
        setTimeout(() => {
            location.reload();
        }, 50); 
    }

    function toggleAppearanceMode(isShiftHeld = false) {
        const root = document.documentElement;
        const currentMode = getSetting('appearanceMode', 'dark');

        const oledOverride = document.getElementById('oled-black-override');
        if (oledOverride && currentMode === 'oled') {
            oledOverride.remove();
        }

        const lightOverride = document.getElementById('light-mode-black-override');
        if (lightOverride && currentMode !== 'light') {
             lightOverride.remove();
        }

        if (isShiftHeld) {
            if (currentMode === 'dark' || currentMode === 'oled') {
                root.style.setProperty('--main-bg-color', '#f1f1f1');
                root.style.setProperty('--secondary-bg-color', '#ffffff');
                root.style.setProperty('--input-bg-color', '#f1f1f1');
                
                applyLightModeBlackOverride();
                setSetting('appearanceMode', 'light');

                safeRefreshPage();

            } else {
                root.style.setProperty('--main-bg-color', '#0f0f0f');
                root.style.setProperty('--secondary-bg-color', '#212121');
                root.style.setProperty('--input-bg-color', '#1a1a1a');
                setSetting('appearanceMode', 'dark');
                safeRefreshPage();
            }
        } else {
            if (currentMode === 'oled') {
                root.style.setProperty('--main-bg-color', '#0f0f0f');
                root.style.setProperty('--secondary-bg-color', '#212121');
                root.style.setProperty('--input-bg-color', '#1a1a1a');
                setSetting('appearanceMode', 'dark');
            } else if (currentMode === 'light') {
                root.style.setProperty('--main-bg-color', '#0f0f0f');
                root.style.setProperty('--secondary-bg-color', '#212121');
                root.style.setProperty('--input-bg-color', '#1a1a1a');
                setSetting('appearanceMode', 'dark');
                safeRefreshPage();

            } else {
                root.style.setProperty('--main-bg-color', '#000000');
                root.style.setProperty('--secondary-bg-color', '#000000');
                root.style.setProperty('--input-bg-color', '#000000');
                
                const style = document.createElement('style');
                style.id = 'oled-black-override';
                
                style.textContent = `
                    body,
                    html,
                    .channel-top-section,
                    .channel-content-section,
                    .settings-section,
                    .pref-list-container,
                    .tab-panel,
                    .profile-menu-dropdown,
                    .post-item,
                    .video-item,
                    .playlist-item,
                    .delete-account-form,
                    .crop-modal-overlay,
                    .about-container,
                    .home-preview-section,
                    .videos-wrapper,
                    .posts-container,
                    .playlists-container,
                    .search-container { 
                        background-color: #000000 !important; 
                        background: #000000 !important;
                    }
                    .subscribe-button {
                        background-color: red !important;
                    }
                    img[src$=".svg"] {
                        background-color: transparent !important;
                    }
                    .playlist-thumbnail,
                    .video-thumbnail,
                    .channel-banner,
                    .post-images-wrapper,
                    .home-player-wrapper,
                    img[src$=".jpg"], 
                    img[src$=".jpeg"], 
                    img[src$=".png"] {
                        background-color: transparent !important;
                        background: transparent !important !important;
                    }
            .video-description,
            .video-description.collapsed {
                color: #aaaaaa !important;
            }
                `;
                const old = document.getElementById('oled-black-override');
                if (old) old.remove();
                document.head.appendChild(style);
                
                setSetting('appearanceMode', 'oled');
            }
        }
        
        const oldStyle = document.getElementById('profile-menu-styles');
        if (oldStyle) oldStyle.remove();
        injectMenuStyles();

        if (window.logoVersionRef) {
            const mode = getSetting('appearanceMode', 'dark');
            window.logoVersionRef.style.color = (mode === 'light') ? '#999999' : '#c8c8c8';
        }
      
        const searchIcon = document.getElementById('searchIcon') || document.querySelector('.search-icon');
        const searchInput = document.getElementById('searchInput');
        
        if (getSetting('appearanceMode', 'dark') === 'light') {
            if (searchIcon) searchIcon.style.filter = 'invert(1)';
            if (searchInput) {
                searchInput.style.color = '#0f0f0f';
                searchInput.style.backgroundColor = '#f1f1f1'; 
                
                const phStyle = document.getElementById('light-mode-placeholder-style');
                if (!phStyle) {
                    const s = document.createElement('style');
                    s.id = 'light-mode-placeholder-style';
                    s.textContent = `#searchInput::placeholder { color: #888 !important; }`;
                    document.head.appendChild(s);
                }
            }
            
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') {
                    if (!img.classList.contains('logo') && !img.classList.contains('christmas-hat-overlay')) {
                        img.style.filter = 'invert(1)';
                    }
                }
            });
            
            applyLightModeBlackOverride();
            
        } else if (getSetting('appearanceMode', 'dark') === 'oled') {
            if (searchIcon) searchIcon.style.filter = '';
            if (searchInput) {
                searchInput.style.color = '';
                searchInput.style.backgroundColor = '';
            }
            const phStyle = document.getElementById('light-mode-placeholder-style');
            if (phStyle) phStyle.remove();
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') img.style.filter = '';
            });
            
        } else {
            if (searchIcon) searchIcon.style.filter = '';
            if (searchInput) {
                searchInput.style.color = '';
                searchInput.style.backgroundColor = '';
            }
            const phStyle = document.getElementById('light-mode-placeholder-style');
            if (phStyle) phStyle.remove();
            const ovd = document.getElementById('oled-black-override');
            if (ovd) ovd.remove();
            const lvd = document.getElementById('light-mode-black-override');
            if (lvd) lvd.remove();
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') img.style.filter = '';
            });
        }
        
        // Re-translate settings page after appearance change
        translateSettingsPage();
    }

    function updateAppearanceText(item) {
        const currentMode = getSetting('appearanceMode', 'dark');
        const textSpan = item.querySelector('.profile-menu-text');
        
        if (currentMode === 'light') {
            textSpan.textContent = getLang('Appearance: Light', 'Erscheinungsbild: Hell');
        } else if (currentMode === 'oled') {
            textSpan.textContent = getLang('Appearance: OLED', 'Erscheinungsbild: OLED');
        } else {
            textSpan.textContent = getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel');
        }
    }

    function toggleLanguage(item) {
        const currentLang = getSetting('language', 'en');
        const newLang = currentLang === 'de' ? 'en' : 'de';
        setSetting('language', newLang);
        
        if (item) {
            const currentMode = getSetting('appearanceMode', 'dark');
            const textSpan = item.querySelector('.profile-menu-text');
            if (newLang === 'de') {
                textSpan.textContent = currentMode === 'oled' ? 'Erscheinungsbild: OLED' : 
                                  currentMode === 'light' ? 'Erscheinungsbild: Hell' : 
                                  'Erscheinungsbild: Dunkel';
            } else {
                textSpan.textContent = currentMode === 'oled' ? 'Appearance: OLED' : 
                                  currentMode === 'light' ? 'Appearance: Light' : 
                                  'Appearance: Dark';
            }
        }
        
        // Re-translate settings page if we're on it
        translateSettingsPage();
        
        if (currentUserId) {
            saveSettingsToServerSync().then(() => {
                location.reload();
            });
        } else {
            location.reload();
        }
    }

    function updateLanguageText(item) {
        const currentLang = getSetting('language', 'en');
        const textSpan = item.querySelector('.profile-menu-text');
        if (currentLang === 'de') {
            textSpan.textContent = 'Sprache: Deutsch';
        } else {
            textSpan.textContent = 'Language: English';
        }
    }

    function applyLanguage() {
        const lang = getSetting('language', 'en');
        
        const dict = {
            'subscribeButton': { en: 'Subscribe', de: 'Abonnieren' },
            'subscribedState': { en: 'Subscribed', de: 'Abonniert' },
            'chaptersLabel': { en: 'Chapters', de: 'Kapitel' },
            'shareContainer': { en: 'Share', de: 'Teilen' },
            'saveContainer': { en: 'Save', de: 'Speichern' },
            'savedState': { en: 'Saved', de: 'Gespeichert' },
            'descriptionToggleMore': { en: 'Show more', de: 'Mehr anzeigen' },
            'descriptionToggleLess': { en: 'Show less', de: 'Weniger anzeigen' },
            'noDescription': { en: 'No description available for this video.', de: 'Keine Beschreibung für dieses Video verfügbar.' },
            'commentsCount': { en: 'Comments', de: 'Kommentare' },
            'saveModalTitle': { en: 'Save to Playlist', de: 'In Playlist speichern' },
            'noPlaylistsMessage': { en: 'No playlists yet. Create one below.', de: 'Keine Playlisten vorhanden. Erstellen Sie unten eine.' },
            'newPlaylistName': { en: 'New playlist name', de: 'Name der neuen Playlist' },
            'createPlaylistBtn': { en: 'Create', de: 'Erstellen' },
            'shareModalTitle': { en: 'Share Video', de: 'Video teilen' },
            'copyWithTimestamp': { en: 'Copy Link + Timestamp', de: 'Link + Zeitstempel kopieren' },
            'copyWithoutTimestamp': { en: 'Copy Link', de: 'Link kopieren' },
            'copyMessage': { en: 'Video URL copied to clipboard!', de: 'Video-URL in die Zwischenablage kopiert!' },
            'recHeader': { en: 'Recommended', de: 'Empfohlen' },
            'relatedChannelsLabel': { en: 'Related Channels', de: 'Ähnliche Kanäle' }
        };

        Object.keys(dict).forEach(key => {
            const el = document.getElementById(key);
            if (el) {
                if (el.tagName === 'INPUT') {
                    el.placeholder = dict[key][lang] || dict[key]['en'];
                } else if (el.querySelector('span')) {
                    el.querySelector('span').textContent = dict[key][lang] || dict[key]['en'];
                } else {
                    el.textContent = dict[key][lang] || dict[key]['en'];
                }
            }
        });
        
        const saveH2 = document.querySelector('#saveModal h2');
        if (saveH2) saveH2.textContent = dict.saveModalTitle[lang];
        
        const shareH2 = document.querySelector('#shareModal h2');
        if (shareH2) shareH2.textContent = dict.shareModalTitle[lang];

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
            const saveIcon = document.getElementById('saveIcon');
            const isSaved = saveIcon && saveIcon.src.includes('saved.svg');
            
            if (isSaved) {
                saveSpan.textContent = dict.savedState[lang];
            } else {
                saveSpan.textContent = dict.saveContainer[lang];
            }
        }

        // Update the related tab label (if present)
        const relatedTabLabel = document.getElementById('relatedTabLabel');
        if (relatedTabLabel) {
            relatedTabLabel.textContent = dict.relatedChannelsLabel[lang] || dict.relatedChannelsLabel['en'];
        }
        
        // Translate settings page elements
        translateSettingsPage();
    }

    function applyAppearanceMode() {
        const mode = getSetting('appearanceMode', 'dark');
        if (mode === 'oled') {
            document.documentElement.style.setProperty('--main-bg-color', '#000000');
            document.documentElement.style.setProperty('--secondary-bg-color', '#000000');
            document.documentElement.style.setProperty('--input-bg-color', '#000000');
        } else if (mode === 'light') {
            document.documentElement.style.setProperty('--main-bg-color', '#f1f1f1');
            document.documentElement.style.setProperty('--secondary-bg-color', '#ffffff');
            document.documentElement.style.setProperty('--input-bg-color', '#f1f1f1');
            applyLightModeBlackOverride();
        }
    }

    // ================================================================
    // UPDATED initNotifications – makes notification items clickable
    // ================================================================
    function initNotifications() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions) return;
        if (document.getElementById('notifBell')) return;

        const notifWrapper = document.createElement('div');
        notifWrapper.style.position = 'relative';
        notifWrapper.style.marginRight = '24px';
        notifWrapper.style.display = 'flex';
        notifWrapper.style.alignItems = 'center';
        
        const notifIcon = document.createElement('img');
        notifIcon.id = 'notifBell';
        notifIcon.src = '/LocalYT-Rev-Files/notifications.svg';
        notifIcon.className = 'notif-icon';
        notifIcon.draggable = false;
        
        const badge = document.createElement('span');
        badge.id = 'notifBadge';
        badge.className = 'notif-badge';
        
        const notifDropdown = document.createElement('div');
        notifDropdown.id = 'notifDropdown';
        notifDropdown.className = 'profile-menu-dropdown notif-dropdown';
        
        notifWrapper.appendChild(notifIcon);
        notifWrapper.appendChild(badge);
        notifWrapper.appendChild(notifDropdown);
        
        const profilePic = document.getElementById('headerProfilePic');
        if (profilePic) userActions.insertBefore(notifWrapper, profilePic);
        else userActions.appendChild(notifWrapper);

        notifIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notifDropdown.classList.contains('open')) {
                notifDropdown.classList.remove('open');
            } else {
                notifDropdown.classList.add('open');
                badge.style.display = 'none';
                fetch('/api/notifications/read', { method: 'POST' }).catch(err => console.error(err));
            }
        });

        document.addEventListener('click', () => {
            if (notifDropdown.classList.contains('open')) notifDropdown.classList.remove('open');
        });

        fetch('/api/notifications')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data) return;
                if (data.unreadCount > 0) {
                    badge.textContent = data.unreadCount;
                    badge.style.display = 'flex';
                }
                if (data.notifications.length === 0) {
                    notifDropdown.innerHTML = `<div class="profile-menu-item" style="cursor:default; flex-direction:column; align-items:flex-start;"><span style="font-weight:bold;">No new notifications</span></div>`;
                } else {
                    notifDropdown.innerHTML = '';
                    data.notifications.forEach(n => {
                        const item = document.createElement('div');
                        item.className = 'profile-menu-item';
                        item.style.flexDirection = 'column';
                        item.style.alignItems = 'flex-start';
                        item.style.padding = '12px 20px';
                        item.style.borderBottom = '1px solid rgba(128,128,128,0.2)';
                        
                        const msg = document.createElement('span');
                        msg.style.fontWeight = 'bold';
                        msg.style.fontSize = '14px';
                        msg.textContent = n.message;
                        
                        const time = document.createElement('span');
                        time.style.fontSize = '12px';
                        time.style.opacity = '0.7';
                        time.style.marginTop = '4px';
                        time.textContent = new Date(n.timestamp).toLocaleString();
                        
                        item.appendChild(msg);
                        item.appendChild(time);

                        // ---- Make notification clickable if it contains a channel name ----
                        let channelName = null;
                        if (n.channel) {
                            channelName = n.channel;
                        } else if (n.message && n.message.includes(':')) {
                            const parts = n.message.split(':');
                            channelName = parts[0].trim();
                        }
                        if (channelName) {
                            const url = `channel.html?channel=${encodeURIComponent(channelName)}`;
                            item.style.cursor = 'pointer';
                            // Left click – navigate in same tab
                            item.addEventListener('click', (e) => {
                                e.stopPropagation();
                                window.location.href = url;
                                notifDropdown.classList.remove('open'); // close dropdown
                            });
                            // Middle click – open in new tab
                            item.addEventListener('mouseup', (e) => {
                                if (e.button === 1) {
                                    e.preventDefault();
                                    window.open(url, '_blank');
                                    notifDropdown.classList.remove('open');
                                }
                            });
                            // Right click – open in new tab
                            item.addEventListener('contextmenu', (e) => {
                                e.preventDefault();
                                window.open(url, '_blank');
                                notifDropdown.classList.remove('open');
                            });
                        }
                        // ----------------------------------------------------------------

                        notifDropdown.appendChild(item);
                    });
                }
            })
            .catch(err => console.error('Error fetching notifications:', err));
    }

    function initProfilePic() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions) {
            userActions = document.createElement('div');
            userActions.className = 'user-actions';
            const topBar = document.querySelector('.top-bar');
            if (topBar) topBar.appendChild(userActions);
        }

        applyAppearanceMode();
        applyLogoColor();

        const logo = document.getElementById('mainLogo');
        if (logo && !document.getElementById('logo-version')) {
            const versionSpan = document.createElement('span');
            versionSpan.id = 'logo-version';
            versionSpan.textContent = 'v4.80'; // Current LocalYT Version
            
            const isLight = getSetting('appearanceMode', 'dark') === 'light';
            versionSpan.style.color = isLight ? '#999999' : '#c8c8c8';
            versionSpan.style.fontFamily = "'RobotoRegular', Arial, sans-serif";
            versionSpan.style.fontSize = "12px";
            versionSpan.style.marginLeft = "4px";
            versionSpan.style.transform = "translateY(-5px)";
            versionSpan.style.userSelect = "none";
            versionSpan.style.alignSelf = "center";
            
            logo.parentNode.insertBefore(versionSpan, logo.nextSibling);
            
            window.logoVersionRef = versionSpan;
        }

        if (getSetting('language', 'en') === 'de') {
            applyLanguage();
        }
        
        // Apply settings page translations if on settings page
        translateSettingsPage();

        userActions.style.position = 'relative';

        const existing = document.getElementById('headerProfilePic');
        if (existing) existing.remove();
        
        const oldMenu = document.getElementById('profileMenuDropdown');
        if (oldMenu) oldMenu.remove();

        const img = document.createElement('img');
        img.id = 'headerProfilePic';
        img.className = 'header-profile-pic';
        img.alt = 'Profile';
        img.src = PLACEHOLDER;
        
        menuInstance = document.createElement('div');
        menuInstance.id = 'profileMenuDropdown';
        menuInstance.className = 'profile-menu-dropdown';

        let userData = null;

        fetch('/session-user')
            .then(res => {
                if (res.ok) return res.json();
                return null;
            })
            .then(data => {
                userData = data;
                
                if (userData && userData.username) {
                    currentUserId = userData.username;
                    
                    return loadSettingsFromServer().then(() => {
                        applyAppearanceMode();
                        if (getSetting('language', 'en') === 'de') {
                            applyLanguage();
                        }
                        
                        return fetch('/user-profile-pic')
                            .then(picRes => picRes.json())
                            .then(picData => {
                                if (picData.hasCustomPic && picData.picUrl) {
                                    img.src = picData.picUrl;
                                }
                            })
                            .catch(() => {});
                    });
                }
                return null;
            })
            .then(() => {
                buildMenu(userData);
                if (userData && userData.username) {
                    initNotifications();
                }
                // Apply settings translations after everything is loaded
                translateSettingsPage();
            })
            .catch(err => {
                console.error('Error checking session:', err);
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
                    window.location.href = '/login.html';
                }));
                translateSettingsPage();
            });

        function buildMenu(userData) {
            if (userData && userData.username) {
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign Out', 'Abmelden'), () => {
                    fetch('/logout').then(() => {
                        window.location.href = '/login.html';
                    }).catch(err => console.error('Logout failed:', err));
                }));

                const appearanceItem = createMenuItem('appearance.svg', getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel'));
                updateAppearanceText(appearanceItem);

                let holdTimer;
                appearanceItem.addEventListener('mousedown', () => { holdTimer = setTimeout(() => { toggleAppearanceMode(true); updateAppearanceText(appearanceItem); closeMenu(); }, 500); });
                appearanceItem.addEventListener('mouseup', () => clearTimeout(holdTimer));
                appearanceItem.addEventListener('mouseleave', () => clearTimeout(holdTimer));

                appearanceItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearTimeout(holdTimer);
                    const isShiftHeld = e.shiftKey;
                    toggleAppearanceMode(isShiftHeld);
                    updateAppearanceText(appearanceItem);
                    closeMenu();
                });

                menuInstance.appendChild(appearanceItem);

                const languageItem = createMenuItem('language.svg', getLang('Language: English', 'Sprache: Englisch'));
                updateLanguageText(languageItem);
                
                languageItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleLanguage(languageItem);
                    closeMenu();
                });
                
                menuInstance.appendChild(languageItem);

                menuInstance.appendChild(createMenuItem('settings.svg', getLang('Settings', 'Einstellungen'), () => {
                    window.location.href = 'settings.html';
                }));

                menuInstance.appendChild(createMenuItem('changelog.svg', getLang('Changelog', 'Änderungsprotokoll'), () => {
                    window.location.href = 'changelog.html';
                }));

                menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                    window.open('https://github.com/pbz134/LocalYT', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                    window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('about.svg', getLang('About', 'Über'), () => {
                    window.location.href = 'about.html';
                }));

            } else {
                menuInstance.appendChild(createMenuItem('signout.svg', getLang('Sign In', 'Anmelden'), () => {
                    window.location.href = '/login.html';
                }));

                menuInstance.appendChild(createMenuItem('changelog.svg', getLang('Changelog', 'Änderungsprotokoll'), () => {
                    window.location.href = 'changelog.html';
                }));

                menuInstance.appendChild(createMenuItem('sourcecode.svg', getLang('Source Code', 'Quellcode'), () => {
                    window.open('https://github.com/pbz134/LocalYT', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('feedback.svg', getLang('Send Feedback', 'Feedback senden'), () => {
                    window.open('https://github.com/pbz134/LocalYT/issues', '_blank');
                }));

                menuInstance.appendChild(createMenuItem('about.svg', getLang('About', 'Über'), () => {
                    window.location.href = 'about.html';
                }));
            }
        }

        img.onclick = function(e) {
            e.stopPropagation();
            toggleMenu();
        };

        userActions.appendChild(img);
        userActions.appendChild(menuInstance);

        injectMenuStyles();
    }

    function injectMenuStyles() {
        if (document.getElementById('profile-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'profile-menu-styles';
        
        const isLightMode = getSetting('appearanceMode', 'dark') === 'light';
        const textColor = isLightMode ? '#0f0f0f' : '#fff';  
        const hoverBg = isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.1)';
        const borderColor = isLightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        const shadowColor = isLightMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)';
        
        style.textContent = `
            .profile-menu-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background-color: var(--secondary-bg-color);
                border: 1px solid ${borderColor};
                min-width: 220px;
                box-shadow: 0 4px 20px ${shadowColor};
                z-index: 2000;
                display: none;
                padding: 8px 0;
            }

            .profile-menu-dropdown.open {
                display: block;
            }

            .profile-menu-item {
                display: flex;
                align-items: center;
                padding: 10px 20px;
                color: ${textColor};
                font-family: 'RobotoRegular', Arial, sans-serif;
                font-size: 14px;
                cursor: pointer;
                transition: background-color 0.15s ease;
                user-select: none;
            }

            .profile-menu-item:hover {
                background-color: ${hoverBg};
            }

            .profile-menu-icon {
                width: 20px;
                height: 20px;
                margin-right: 16px;
                opacity: 0.9;
                filter: ${isLightMode ? 'invert(0)' : 'invert(1)'};
            }

            .header-profile-pic {
                cursor: pointer;
            }

            .notif-icon {
                width: 28px;
                height: 28px;
                cursor: pointer;
                filter: ${isLightMode ? 'invert(0)' : 'invert(1)'};
            }
            .notif-badge {
                position: absolute;
                top: -5px;
                right: -8px;
                background-color: red;
                color: white;
                border-radius: 50%;
                font-size: 10px;
                padding: 2px 5px;
                display: none;
                font-family: 'RobotoRegular', Arial, sans-serif;
                font-weight: bold;
                align-items: center;
                justify-content: center;
                min-width: 16px;
                height: 16px;
                box-sizing: border-box;
            }
            .notif-dropdown {
                min-width: 300px;
                max-height: 400px;
                overflow-y: auto;
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