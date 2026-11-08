(function() {
    const PLACEHOLDER = '/LocalYT-Rev-Files/user-profile-placeholder.jpg';
    let menuInstance = null;
    let currentUserId = null;

    const UPLOAD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000">
        <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
    </svg>`;

    // --- Settings helpers ---
    function getSetting(key, fallback) {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    }
    function setSetting(key, value) {
        localStorage.setItem(key, value);
        if (currentUserId) saveSettingsToServer();
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
            .then(res => { if (!res.ok) throw new Error('Not authenticated'); return res.json(); })
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
    // Settings-page translations
    // ======================================================================
    function translateSettingsPage() {
        if (!window.location.pathname.includes('settings.html')) return;
        const isDe = getSetting('language', 'en') === 'de';

        const tabHeadings = {
            'tab-profile': { en: 'Profile Picture', de: 'Profilbild' },
            'tab-appearance': { en: 'Appearance', de: 'Erscheinungsbild' },
            'tab-playback': { en: 'Playback', de: 'Wiedergabe' },
            'tab-content': { en: 'Content & Recommendations', de: 'Inhalt & Empfehlungen' },
            'tab-account': { en: 'Account', de: 'Konto' }
        };
        Object.keys(tabHeadings).forEach(tabId => {
            const panel = document.getElementById(tabId);
            if (panel) {
                const h1 = panel.querySelector('h1');
                if (h1) h1.textContent = tabHeadings[tabId][isDe ? 'de' : 'en'];
            }
        });

        const translations = {
            sidebarProfile: { en: 'Profile Picture', de: 'Profilbild' },
            sidebarAppearance: { en: 'Appearance', de: 'Erscheinungsbild' },
            sidebarPlayback: { en: 'Playback', de: 'Wiedergabe' },
            sidebarContent: { en: 'Content', de: 'Inhalt' },
            sidebarAccount: { en: 'Account', de: 'Konto' },
            uploadBtn: { en: 'Upload Picture', de: 'Bild hochladen' },
            removeBtn: { en: 'Remove Picture', de: 'Bild entfernen' },
            saveAppearanceBtn: { en: 'Save Appearance Settings', de: 'Erscheinungsbild speichern' },
            savePlaybackBtn: { en: 'Save Playback Settings', de: 'Wiedergabe speichern' },
            saveContentBtn: { en: 'Save Content Settings', de: 'Inhaltseinstellungen speichern' },
            renameBtn: { en: 'Rename', de: 'Umbenennen' },
            changePassBtn: { en: 'Update', de: 'Aktualisieren' },
            exportConfigBtn: { en: 'Export Config', de: 'Konfig. exportieren' },
            logoutBtn: { en: 'Logout', de: 'Abmelden' },
            toggleDeleteBtn: { en: 'Delete Account', de: 'Konto löschen' },
            deleteAccountBtn: { en: 'Confirm Delete', de: 'Löschen bestätigen' },
            algoPrefsHeading: { en: 'Algorithm Preferences', de: 'Algorithmus-Einstellungen' },
            algoPrefsDesc: { en: 'Adjust the values to influence your recommendations for the respective tags in %. Higher = matching videos are more likely to appear.', de: 'Passe die Werte an, um deine Empfehlungen für die jeweiligen Tags in % zu beeinflussen.' },
            addTagBtn: { en: 'Add Tag', de: 'Tag hinzufügen' },
            resetPrefsBtn: { en: 'Reset All', de: 'Alle zurücksetzen' },
            cancelCropBtn: { en: 'Cancel', de: 'Abbrechen' },
            doneCropBtn: { en: 'Done', de: 'Fertig' }
        };
        Object.keys(translations).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.tagName === 'INPUT' && el.placeholder !== undefined) el.placeholder = translations[id][isDe ? 'de' : 'en'];
                else el.textContent = translations[id][isDe ? 'de' : 'en'];
            }
        });

        const accountTab = document.getElementById('tab-account');
        if (accountTab) {
            const h2s = accountTab.querySelectorAll('.account-section h2');
            const h2Map = [
                { en: 'Account Management', de: 'Kontoverwaltung' },
                { en: 'Configuration', de: 'Konfiguration' },
                { en: 'Danger Zone', de: 'Gefahrenzone' }
            ];
            h2s.forEach((h2, i) => { if (h2Map[i]) h2.textContent = isDe ? h2Map[i].de : h2Map[i].en; });

            const h3s = accountTab.querySelectorAll('h3');
            const h3Map = [
                { en: 'Rename Account', de: 'Konto umbenennen' },
                { en: 'Change Password', de: 'Passwort ändern' },
                { en: 'Logout', de: 'Abmelden' },
                { en: 'Delete Account', de: 'Konto löschen' }
            ];
            h3s.forEach((h3, i) => {
                if (h3Map[i]) h3.textContent = isDe ? h3Map[i].de : h3Map[i].en;
                if (i === 3) h3.style.color = '#ff4444';
            });

            const descPs = accountTab.querySelectorAll('.account-section p');
            const descMap = [
                { en: 'End your current session.', de: 'Beende deine aktuelle Sitzung.' },
                { en: "WARNING: Once deleted, you won't be able to recover it.", de: 'WARNUNG: Einmal gelöscht, kann das Konto nicht wiederhergestellt werden.' },
                { en: 'Export or import your settings as a JSON file.', de: 'Exportiere oder importiere deine Einstellungen als JSON-Datei.' }
            ];
            descPs.forEach((p, i) => { if (descMap[i]) p.textContent = isDe ? descMap[i].de : descMap[i].en; });

            const deleteWarning = accountTab.querySelector('#deleteWarningText');
            if (deleteWarning) {
                deleteWarning.innerHTML = isDe
                    ? 'Gib dein aktuelles Passwort ein und tippe <strong style="color:#ff4444;">DELETE</strong>, um dein Konto permanent zu löschen.'
                    : 'Enter your current password and type <strong style="color:#ff4444;">DELETE</strong> to permanently delete your account.';
            }

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

            const importLabel = accountTab.querySelector('label[for="importConfigInput"]');
            if (importLabel) importLabel.textContent = isDe ? 'Konfig. importieren' : 'Import Config';
        }

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
            if (headerMap[text]) header.textContent = isDe ? headerMap[text].de : headerMap[text].en;
        });

        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.placeholder = isDe ? 'Suchen' : 'Search';
        const tagInput = document.getElementById('newTagInput');
        if (tagInput) tagInput.placeholder = isDe ? 'Neuen Tag hinzufügen...' : 'Add new tag...';

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
            if (el) el.textContent = cardTranslations[id][isDe ? 'de' : 'en'];
        });

        const dropdownTranslations = {
            videoPageLayout: { options: [{ en: 'Modern', de: 'Modern' }, { en: 'Classic', de: 'Klassisch' }] },
            channelPageStyle: { options: [{ en: 'Modern', de: 'Modern' }, { en: 'Classic', de: 'Klassisch' }] },
            channelDefaultView: { options: [{ en: 'Grid', de: 'Raster' }, { en: 'List', de: 'Liste' }] },
            playlistPageLayout: { options: [{ en: 'Grid', de: 'Raster' }, { en: 'List', de: 'Liste' }] },
            commenterProfileStyle: { options: [{ en: 'Modern (Letters & Colors)', de: 'Modern (Buchstaben & Farben)' }, { en: 'Classic (Placeholder)', de: 'Klassisch (Platzhalter)' }] },
            titleColorScheme: { options: [{ en: 'Default', de: 'Standard' }, { en: 'Blue', de: 'Blau' }] },
            autoplayNonPlaylistMode: { options: [{ en: 'First recommended', de: 'Erstes empfohlenes' }, { en: 'Random recommended', de: 'Zufällig empfohlen' }, { en: 'Random from database', de: 'Zufällig aus Datenbank' }] },
            playerUIScale: { options: { 5: { en: '100% (Default)', de: '100% (Standard)' } } }
        };
        Object.keys(dropdownTranslations).forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;
            const config = dropdownTranslations[selectId];
            if (config.options && Array.isArray(config.options)) {
                config.options.forEach((opt, i) => { if (select.options[i]) select.options[i].text = isDe ? opt.de : opt.en; });
            } else if (config.options && typeof config.options === 'object') {
                Object.keys(config.options).forEach(idx => { if (select.options[idx]) select.options[idx].text = isDe ? config.options[idx].de : config.options[idx].en; });
            }
        });
    }

    function createMenuItem(icon, text, onClick) {
        const item = document.createElement('div');
        item.className = 'profile-menu-item';

        const iconImg = document.createElement('img');
        iconImg.className = 'profile-menu-icon';
        iconImg.draggable = false;
        if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
            iconImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon);
        } else {
            iconImg.src = `/LocalYT-Rev-Files/${icon}`;
        }

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
        if (menuInstance) menuInstance.classList.remove('open');
        document.removeEventListener('click', closeMenu);
    }

    function toggleMenu() {
        if (!menuInstance) return;
        if (menuInstance.classList.contains('open')) {
            closeMenu();
        } else {
            menuInstance.classList.add('open');
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        }
    }

    // ======================================================================
    // Logo / hat / appearance (unchanged)
    // ======================================================================
    function applyLogoColor() {
        const logo = document.getElementById('mainLogo');
        if (!logo) return;
        const isLight = getSetting('appearanceMode', 'dark') === 'light';
        const targetColor = isLight ? '#333333' : '#ffffff';
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
            .then(() => applyChristmasHat())
            .catch(err => console.error('Failed to load SVG for coloring:', err));
    }

    function applyChristmasHat() {
        const logo = document.getElementById('mainLogo');
        if (!logo || logo.dataset.christmasHatApplied === 'true') return;
        fetch(window.location.href, { method: 'HEAD' })
            .then(response => {
                const serverDateStr = response.headers.get('Date');
                if (!serverDateStr) return;
                if (new Date(serverDateStr).getMonth() !== 11) return;

                requestAnimationFrame(() => {
                    if (logo.dataset.christmasHatApplied === 'true') return;
                    const logoWidth = logo.offsetWidth;
                    const logoHeight = logo.offsetHeight;
                    if (logoWidth === 0 || logoHeight === 0) return;

                    let wrapper = logo.parentElement;
                    if (!wrapper.classList.contains('christmas-logo-wrapper')) {
                        wrapper = document.createElement('div');
                        wrapper.className = 'christmas-logo-wrapper';
                        wrapper.style.cssText = 'position:relative; display:inline-flex; align-items:center; overflow:visible;';
                        logo.parentNode.insertBefore(wrapper, logo);
                        wrapper.appendChild(logo);
                    }
                    const hatImg = document.createElement('img');
                    hatImg.src = '/LocalYT-Rev-Files/christmas-hat.png';
                    hatImg.className = 'christmas-hat-overlay';
                    hatImg.draggable = false;
                    const hatWidth = logoWidth * 0.18;
                    Object.assign(hatImg.style, {
                        position: 'absolute',
                        top: `${-(hatWidth * 0.45)}px`,
                        left: `${-(hatWidth * -0.55)}px`,
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
            .catch(err => console.error('Failed to check server time for Christmas hat:', err));
    }

    function applyLightModeBlackOverride() {
        let oldOverride = document.getElementById('light-mode-black-override');
        if (oldOverride) oldOverride.remove();
        const isBlueTitles = JSON.parse(localStorage.getItem('titleColorScheme') || '{}').scheme === 'blue';

        let styleText = `
            [style*="background-color: rgb(30, 30, 30)"],
            [style*="background-color: #1e1e1e"],
            .video-description, .video-item, .playlist-item, .post-item,
            .channel-top-section, .channel-content-section {
                background-color: #FFFFFF !important;
            }
            .video-info { background: transparent !important; }
            [style*="color: rgb(136, 136, 136)"],
            [style*="color: #888888"],
            .video-description, .video-description.collapsed,
            .home-video-description-text, .playlist-description,
            .playlist-video-count, .video-count, .post-date,
            .home-video-meta, .comment-timestamp,
            .sidebar-autoplay-label, .suggestion-channel, .view-count {
                color: #555555 !important;
            }
            .channel-name-link { color: #1a1a1a !important; }
            .channel-name-link:hover { color: #065fd4 !important; }
            .subscriber-count { color: #555555 !important; }
            [style*="color: rgb(204, 204, 204)"],
            [style*="color: #cccccc"],
            .about-description .description-text, .stats-item, .stats-item.total-views,
            .share-button, #shareBtnText { color: #555555 !important; }
            [style*="color: rgb(170, 170, 170)"],
            [style*="color: #aaaaaa"],
            .tab, .like-dislike-icons span, .share-container span,
            .save-container span, .sub-count, .comment-like-btn span,
            .description-toggle { color: #666666 !important; }
            #classicInfoBoxWrapper { background-color:#fff !important; border-color:#e0e0e0 !important; }
            #classicInfoBoxWrapper #classicActionsWrapper { border-top-color:#e0e0e0 !important; }
            .channel-name, .classic-channel-name-text { color: #000 !important; }
            .tab.active { color: #333 !important; border-bottom-color: #333 !important; }
            .suggestion-item.current-video-item { background-color: #999 !important; }
            .playlist-section-header, .playlist-section-header a { color: #333 !important; }
            .filter-button { background-color:#e0e0e0 !important; color:#333 !important; }
            .filter-button:hover { background-color:#ccc !important; color:#000 !important; }
            .filter-button.active { background-color:#cc0000 !important; color:#fff !important; }
            .playlists-header, .playlist-title { color: #000 !important; }
            .playlist-video-count, .playlist-total-duration { color: #555 !important; }
            .playlist-section { border-bottom-color: #e0e0e0 !important; }
            .playlist-btn { color: #555 !important; border-color: #ccc !important; }
            .suggestion-item { background-color: #fff !important; color: #0f0f0f !important; }
            .suggestion-item:hover { background-color: #e0e0e0 !important; }
            .search-suggestions { background-color: #fff !important; border-color: rgba(0,0,0,0.1) !important; }
            .suggestion-item .history-icon { filter: invert(0.8) !important; }
            .post-content-text, .classic-playlist-description { color: #000 !important; }
            .subscriber-count { color: #737373 !important; }
            ::placeholder { color: #737373 !important; }
            .search-icon { filter: invert(0.6) !important; }
            .tab-search-icon { filter: invert(0) !important; }
            #channelSearchInput, #searchInput { color: #000 !important; }
            .search-filters-toggle { background:#e0e0e0 !important; color:#0f0f0f !important; }
            .search-filters-toggle.active { background:#ccc !important; color:#000 !important; }
            .category-button { background-color:#fff !important; color:#0f0f0f !important; border-color:#ccc !important; }
            .category-button:hover { background-color:#e0e0e0 !important; }
            .skeleton-item .skeleton-thumbnail, .skeleton-item .skeleton-channel-pic,
            .skeleton-item .skeleton-title, .skeleton-item .skeleton-metadata,
            .skeleton-item .playlist-thumbnail, .skeleton-item .playlist-title,
            .skeleton-item .playlist-channel-name { background-color: #e0e0e0 !important; }
            .home-others-label { border-top-color: #e0e0e0 !important; }
            #relatedTab .related-channel-item { background-color:#fff !important; border-color:#e0e0e0 !important; }
            #relatedTab .related-channel-item:hover { background-color:#f0f0f0 !important; }
            #relatedTab .related-channel-name { color:#0f0f0f !important; }
            #relatedTabLabel { color:#0f0f0f !important; }
            .top-bar { background-color: #f0f0f0 !important; border-bottom-color: #d0d0d0 !important; }
            .top-bar .logo { filter: none !important; }
            .settings-sidebar { background: #f5f5f5 !important; border-right: 1px solid #d0d0d0 !important; }
            .settings-sidebar a { color: #555 !important; }
            .settings-sidebar a.active { color: #000 !important; background-color: rgba(0,0,0,0.05) !important; border-left-color: #000 !important; }
            .settings-content h1 { color: #000 !important; }
            .setting-card, .account-section, .preset-card { background-color: #f5f5f5 !important; border-color: #d0d0d0 !important; }
            .setting-card .card-label { color: #222 !important; }
            .setting-card .card-desc { color: #666 !important; }
            .settings-section-header { color: #555 !important; border-bottom-color: #d0d0d0 !important; }
            select.setting-select { background-color:#fff !important; border-color:#ccc !important; color:#000 !important; }
            input[type="text"], input[type="password"] { background:#f0f0f0 !important; border-color:#ccc !important; color:#000 !important; }
            .btn { background-color:#e0e0e0 !important; color:#222 !important; }
            .btn-danger { background-color:#cc0000 !important; color:#fff !important; }
            .btn-save { background-color:#2196F3 !important; color:#fff !important; }
            .toggle-slider { background-color: #ccc !important; }
            .toggle-switch input:checked + .toggle-slider { background-color: #2196F3 !important; }
            .toggle-slider:before { background-color: #fff !important; }
        `;

        if (!isBlueTitles) {
            styleText += `
            .video-title:not(.blue-text):not([style*="#128ee9"]),
            .playlist-title:not(.blue-text):not([style*="#128ee9"]),
            .home-video-title:not(.blue-text):not([style*="#128ee9"]),
            .post-author-name:not(.blue-text):not([style*="#128ee9"]),
            .suggestion-title, .current-video-title,
            .comment-author, .comment-text, .comments-count,
            #commentsTotalAmount, .video-item .video-title,
            .video-info .video-title, .video-details .video-title,
            #videoContainer .video-title { color: #000000 !important; }
            `;
        } else {
            styleText += `
            .suggestion-title, .current-video-title, .video-item .video-title,
            .video-info .video-title, .video-details .video-title,
            #videoContainer .video-title { color: #128ee9 !important; }
            `;
        }

        styleText += `
            .openbtn { filter: invert(1); }
            .sort-toggle, .sort-toggle.open, .view-toggle, .view-toggle.open,
            .sort-dropdown-menu, .view-dropdown-menu { background-color: #f0f0f0 !important; color: #0f0f0f !important; }
            .sort-dropdown-item, .view-dropdown-item { color: #0f0f0f !important; }
            .sort-dropdown-item:hover, .view-dropdown-item:hover { background-color: #e0e0e0 !important; }
            .sort-toggle-arrow, .view-toggle-arrow { border-top-color: #0f0f0f !important; }
            .logo { filter: none !important; }
            .search-page .video-title { color: #000000 !important; }
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
        setTimeout(() => location.reload(), 50);
    }

    function toggleAppearanceMode(isShiftHeld = false) {
        const root = document.documentElement;
        const currentMode = getSetting('appearanceMode', 'dark');
        const oled = document.getElementById('oled-black-override');
        if (oled && currentMode === 'oled') oled.remove();
        const light = document.getElementById('light-mode-black-override');
        if (light && currentMode !== 'light') light.remove();

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
                    body, html, .channel-top-section, .channel-content-section, .settings-section,
                    .pref-list-container, .tab-panel, .profile-menu-dropdown, .post-item, .video-item,
                    .playlist-item, .delete-account-form, .crop-modal-overlay, .about-container,
                    .home-preview-section, .videos-wrapper, .posts-container, .playlists-container,
                    .search-container { background-color: #000 !important; background: #000 !important; }
                    .subscribe-button { background-color: red !important; }
                    img[src$=".svg"] { background-color: transparent !important; }
                    .video-description, .video-description.collapsed { color: #aaa !important; }
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
            window.logoVersionRef.style.color = (getSetting('appearanceMode', 'dark') === 'light') ? '#999999' : '#c8c8c8';
        }

        const searchIcon = document.getElementById('searchIcon') || document.querySelector('.search-icon');
        const searchInput = document.getElementById('searchInput');
        if (getSetting('appearanceMode', 'dark') === 'light') {
            if (searchIcon) searchIcon.style.filter = 'invert(1)';
            if (searchInput) {
                searchInput.style.color = '#0f0f0f';
                searchInput.style.backgroundColor = '#f1f1f1';
                if (!document.getElementById('light-mode-placeholder-style')) {
                    const s = document.createElement('style');
                    s.id = 'light-mode-placeholder-style';
                    s.textContent = `#searchInput::placeholder { color: #888 !important; }`;
                    document.head.appendChild(s);
                }
            }
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') {
                    if (!img.classList.contains('logo') &&
                        !img.classList.contains('christmas-hat-overlay') &&
                        !img.classList.contains('upload-icon')) {
                        img.style.filter = 'invert(1)';
                    }
                }
            });
            applyLightModeBlackOverride();
        } else if (getSetting('appearanceMode', 'dark') === 'oled') {
            if (searchIcon) searchIcon.style.filter = '';
            if (searchInput) { searchInput.style.color = ''; searchInput.style.backgroundColor = ''; }
            const ph = document.getElementById('light-mode-placeholder-style');
            if (ph) ph.remove();
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') img.style.filter = '';
            });
        } else {
            if (searchIcon) searchIcon.style.filter = '';
            if (searchInput) { searchInput.style.color = ''; searchInput.style.backgroundColor = ''; }
            const ph = document.getElementById('light-mode-placeholder-style');
            if (ph) ph.remove();
            ['oled-black-override', 'light-mode-black-override'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
            document.querySelectorAll('.top-bar img').forEach(img => {
                if (!img.id || img.id !== 'headerProfilePic') img.style.filter = '';
            });
        }

        translateSettingsPage();
    }

    function updateAppearanceText(item) {
        const mode = getSetting('appearanceMode', 'dark');
        const text = item.querySelector('.profile-menu-text');
        if (mode === 'light') text.textContent = getLang('Appearance: Light', 'Erscheinungsbild: Hell');
        else if (mode === 'oled') text.textContent = getLang('Appearance: OLED', 'Erscheinungsbild: OLED');
        else text.textContent = getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel');
    }

    function toggleLanguage(item) {
        const newLang = getSetting('language', 'en') === 'de' ? 'en' : 'de';
        setSetting('language', newLang);
        if (item) {
            const mode = getSetting('appearanceMode', 'dark');
            const textSpan = item.querySelector('.profile-menu-text');
            if (newLang === 'de') {
                textSpan.textContent = mode === 'oled' ? 'Erscheinungsbild: OLED' : mode === 'light' ? 'Erscheinungsbild: Hell' : 'Erscheinungsbild: Dunkel';
            } else {
                textSpan.textContent = mode === 'oled' ? 'Appearance: OLED' : mode === 'light' ? 'Appearance: Light' : 'Appearance: Dark';
            }
        }
        translateSettingsPage();
        if (currentUserId) saveSettingsToServerSync().then(() => location.reload());
        else location.reload();
    }

    function updateLanguageText(item) {
        item.querySelector('.profile-menu-text').textContent = getSetting('language', 'en') === 'de'
            ? 'Sprache: Deutsch' : 'Language: English';
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
                if (el.tagName === 'INPUT') el.placeholder = dict[key][lang] || dict[key].en;
                else if (el.querySelector('span')) el.querySelector('span').textContent = dict[key][lang] || dict[key].en;
                else el.textContent = dict[key][lang] || dict[key].en;
            }
        });
        const saveH2 = document.querySelector('#saveModal h2');
        if (saveH2) saveH2.textContent = dict.saveModalTitle[lang];
        const shareH2 = document.querySelector('#shareModal h2');
        if (shareH2) shareH2.textContent = dict.shareModalTitle[lang];
        const subBtn = document.getElementById('subscribeButton');
        if (subBtn) subBtn.textContent = subBtn.classList.contains('subscribed') ? dict.subscribedState[lang] : dict.subscribeButton[lang];
        const saveSpan = document.querySelector('#saveContainer span');
        if (saveSpan) {
            const saveIcon = document.getElementById('saveIcon');
            const isSaved = saveIcon && saveIcon.src.includes('saved.svg');
            saveSpan.textContent = isSaved ? dict.savedState[lang] : dict.saveContainer[lang];
        }
        const rt = document.getElementById('relatedTabLabel');
        if (rt) rt.textContent = dict.relatedChannelsLabel[lang] || dict.relatedChannelsLabel.en;
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
    // Notifications
    // ================================================================
    function initNotifications() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions || document.getElementById('notifBell')) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative; margin-right:24px; display:flex; align-items:center;';

        const bell = document.createElement('img');
        bell.id = 'notifBell';
        bell.src = '/LocalYT-Rev-Files/notifications.svg';
        bell.className = 'notif-icon';
        bell.draggable = false;

        const badge = document.createElement('span');
        badge.id = 'notifBadge';
        badge.className = 'notif-badge';

        const dropdown = document.createElement('div');
        dropdown.id = 'notifDropdown';
        dropdown.className = 'profile-menu-dropdown notif-dropdown';

        wrapper.appendChild(bell);
        wrapper.appendChild(badge);
        wrapper.appendChild(dropdown);

        const profilePic = document.getElementById('headerProfilePic');
        if (profilePic) userActions.insertBefore(wrapper, profilePic);
        else userActions.appendChild(wrapper);

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
            } else {
                dropdown.classList.add('open');
                badge.style.display = 'none';
                fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
            }
        });

        document.addEventListener('click', () => {
            if (dropdown.classList.contains('open')) dropdown.classList.remove('open');
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
                    dropdown.innerHTML = `<div class="profile-menu-item" style="cursor:default; flex-direction:column; align-items:flex-start;"><span style="font-weight:bold;">No new notifications</span></div>`;
                } else {
                    dropdown.innerHTML = '';
                    data.notifications.forEach(n => {
                        const item = document.createElement('div');
                        item.className = 'profile-menu-item';
                        item.style.cssText = 'flex-direction:column; align-items:flex-start; padding:12px 20px; border-bottom:1px solid rgba(128,128,128,0.2);';

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

                        let channelName = n.channel || (n.message && n.message.includes(':') ? n.message.split(':')[0].trim() : null);
                        if (channelName) {
                            const url = `channel.html?channel=${encodeURIComponent(channelName)}`;
                            item.style.cursor = 'pointer';
                            item.addEventListener('click', (e) => {
                                e.stopPropagation();
                                window.location.href = url;
                                dropdown.classList.remove('open');
                            });
                            item.addEventListener('mouseup', (e) => {
                                if (e.button === 1) {
                                    e.preventDefault();
                                    window.open(url, '_blank');
                                    dropdown.classList.remove('open');
                                }
                            });
                            item.addEventListener('contextmenu', (e) => {
                                e.preventDefault();
                                window.open(url, '_blank');
                                dropdown.classList.remove('open');
                            });
                        }

                        dropdown.appendChild(item);
                    });
                }
            })
            .catch(() => {});
    }

    // ================================================================
    // Upload button (next to the bell)
    // ================================================================
    function initUploadButton() {
        let userActions = document.querySelector('.user-actions');
        if (!userActions || document.getElementById('uploadBtn')) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative; margin-right:24px; display:flex; align-items:center;';

        const icon = document.createElement('img');
        icon.id = 'uploadBtn';
        icon.className = 'upload-icon';
        icon.draggable = false;
        icon.title = getLang('Upload video', 'Video hochladen');
        icon.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(UPLOAD_ICON_SVG);

        wrapper.appendChild(icon);

        const bell = document.getElementById('notifBell');
        const bellWrapper = bell ? bell.parentElement : null;
        const profilePic = document.getElementById('headerProfilePic');

        if (bellWrapper && bellWrapper.parentElement === userActions) {
            userActions.insertBefore(wrapper, bellWrapper);
        } else if (profilePic) {
            userActions.insertBefore(wrapper, profilePic);
        } else {
            userActions.appendChild(wrapper);
        }

        icon.addEventListener('click', () => openUploadModal());
    }

    // ==================================================================
    // Upload modal (full metadata)
    // ==================================================================
    function injectUploadModal() {
        if (document.getElementById('lyt-upload-modal')) return;

        const style = document.createElement('style');
        style.textContent = `
            #lyt-upload-modal-overlay {
                display:none; position:fixed; inset:0;
                background:rgba(0,0,0,0.8); z-index:5000;
                align-items:center; justify-content:center; padding:20px;
            }
            #lyt-upload-modal-overlay.visible { display:flex; }
            #lyt-upload-modal {
                background: var(--secondary-bg-color, #212121);
                color: var(--input-text-color, #fff);
                border-radius:8px; width:100%; max-width:560px;
                max-height:90vh; display:flex; flex-direction:column;
                font-family:'RobotoRegular', Arial, sans-serif;
                box-shadow:0 10px 40px rgba(0,0,0,0.6);
                position:relative; overflow:hidden;
            }
            #lyt-upload-close {
                position:absolute; top:10px; right:14px; font-size:22px;
                background:none; border:none; color:#aaa; cursor:pointer;
                line-height:1; z-index:2;
            }
            #lyt-upload-close:hover { color:#fff; }
            #lyt-upload-modal-header {
                padding:22px 24px 12px;
                border-bottom:1px solid rgba(128,128,128,0.2);
                flex-shrink:0;
            }
            #lyt-upload-modal h2 { margin:0 0 6px; font-size:20px; color: var(--input-text-color, #fff); }
            #lyt-upload-modal .lyt-upload-sub { color:#888; font-size:13px; line-height:1.5; }
            #lyt-upload-modal-body {
                padding:16px 24px; overflow-y:auto; flex:1 1 auto;
            }
            #lyt-upload-modal-body::-webkit-scrollbar { width:8px; }
            #lyt-upload-modal-body::-webkit-scrollbar-thumb {
                background:rgba(128,128,128,0.4); border-radius:4px;
            }
            .lyt-upload-section {
                font-size:11px; text-transform:uppercase; letter-spacing:0.6px;
                color:#888; margin:18px 0 10px; padding-bottom:6px;
                border-bottom:1px solid rgba(128,128,128,0.15);
            }
            .lyt-upload-section:first-child { margin-top:0; }
            .lyt-field { margin-bottom:12px; }
            .lyt-field label {
                display:block; font-size:12px; color:#aaa;
                margin-bottom:5px; text-transform:uppercase; letter-spacing:0.5px;
            }
            .lyt-field-row { display:flex; gap:12px; margin-bottom:12px; }
            .lyt-field-row .lyt-field { flex:1; margin-bottom:0; }
            #lyt-upload-modal input[type="text"],
            #lyt-upload-modal input[type="number"],
            #lyt-upload-modal input[type="date"],
            #lyt-upload-modal textarea {
                width:100%; box-sizing:border-box; padding:9px 12px; font-size:14px;
                background: var(--input-bg-color, #1a1a1a);
                border:1px solid #444; color: var(--input-text-color, #fff);
                border-radius:4px; outline:none; font-family:inherit;
            }
            #lyt-upload-modal textarea { resize:vertical; min-height:70px; }
            #lyt-upload-modal input:focus,
            #lyt-upload-modal textarea:focus { border-color:#3ea6ff; }

            #lyt-upload-file-wrapper {
                border:2px dashed #444; border-radius:6px; padding:22px;
                text-align:center; cursor:pointer;
                transition:border-color 0.2s, background 0.2s;
            }
            #lyt-upload-file-wrapper:hover,
            #lyt-upload-file-wrapper.drag-over {
                border-color:#3ea6ff; background:rgba(62,166,255,0.05);
            }
            #lyt-upload-file-wrapper.has-file {
                border-style:solid; border-color:#3ea6ff;
            }
            #lyt-upload-file-input { display:none; }
            #lyt-upload-file-label { font-size:13px; color:#aaa; }
            #lyt-upload-file-name {
                font-size:14px; color: var(--input-text-color, #fff);
                margin-top:6px; word-break:break-all;
            }

            .lyt-simple-file-picker {
                display:flex; align-items:center; gap:10px; padding:9px 12px;
                background: var(--input-bg-color, #1a1a1a);
                border:1px solid #444; border-radius:4px; cursor:pointer;
                transition:border-color 0.15s;
            }
            .lyt-simple-file-picker:hover { border-color:#3ea6ff; }
            .lyt-simple-file-picker.has-file { border-color:#3ea6ff; }
            .lyt-simple-file-picker input { display:none; }
            .lyt-simple-file-picker .lyt-file-btn {
                padding:4px 10px; font-size:12px; background:#333; color:#ddd;
                border:none; border-radius:3px; cursor:pointer;
                font-family:inherit; flex-shrink:0; pointer-events:none;
            }
            .lyt-simple-file-picker .lyt-file-text {
                flex:1; color:#aaa; font-size:13px; overflow:hidden;
                text-overflow:ellipsis; white-space:nowrap;
            }
            .lyt-simple-file-picker.has-file .lyt-file-text { color: var(--input-text-color, #fff); }

            #lyt-upload-modal-footer {
                padding:12px 24px 18px;
                border-top:1px solid rgba(128,128,128,0.2);
                flex-shrink:0;
            }
            #lyt-upload-progress {
                display:none; margin-bottom:10px; height:6px;
                background:#333; border-radius:3px; overflow:hidden;
            }
            #lyt-upload-progress.visible { display:block; }
            #lyt-upload-progress-bar {
                height:100%; width:0%; background:#3ea6ff; transition:width 0.15s;
            }
            #lyt-upload-status {
                font-size:13px; color:#aaa; min-height:18px;
                line-height:1.5; margin-bottom:8px;
            }
            #lyt-upload-status.error { color:#ff6666; }
            #lyt-upload-status.success { color:#6ecf6e; }
            #lyt-upload-buttons { display:flex; gap:10px; justify-content:flex-end; }
            #lyt-upload-buttons button {
                padding:9px 18px; font-size:14px; border:none;
                border-radius:4px; cursor:pointer; font-family:inherit;
            }
            #lyt-upload-cancel-btn { background:#333; color:#ccc; }
            #lyt-upload-cancel-btn:hover { background:#444; }
            #lyt-upload-submit-btn { background:#cc0000; color:#fff; font-weight:600; }
            #lyt-upload-submit-btn:hover:not(:disabled) { background:#e00000; }
            #lyt-upload-submit-btn:disabled { background:#444; cursor:not-allowed; color:#888; }
            .lyt-upload-warn {
                color:#f0a020; font-size:12px; margin-top:6px; line-height:1.4;
            }
        `;
        document.head.appendChild(style);

        document.body.insertAdjacentHTML('beforeend', `
            <div id="lyt-upload-modal-overlay">
                <div id="lyt-upload-modal">
                    <button id="lyt-upload-close" type="button">&times;</button>
                    <div id="lyt-upload-modal-header">
                        <h2 id="lyt-upload-title">Upload Video</h2>
                        <div class="lyt-upload-sub" id="lyt-upload-sub"></div>
                    </div>
                    <div id="lyt-upload-modal-body">
                        <div class="lyt-upload-section" data-section="basic">Basic Information</div>

                        <div class="lyt-field">
                            <label for="lyt-upload-channel">Channel</label>
                            <input type="text" id="lyt-upload-channel" list="lyt-upload-channel-list" placeholder="e.g. TWD98" autocomplete="off">
                            <datalist id="lyt-upload-channel-list"></datalist>
                        </div>
                        <div class="lyt-field">
                            <label for="lyt-upload-playlist">Playlist (optional)</label>
                            <input type="text" id="lyt-upload-playlist" placeholder="Leave empty for channel root">
                        </div>
                        <div class="lyt-field">
                            <label>Video File</label>
                            <div id="lyt-upload-file-wrapper">
                                <input type="file" id="lyt-upload-file-input" accept=".mp4,.mkv,.mp3,.avi,.mov,.wmv,.flv,.webm">
                                <div id="lyt-upload-file-label">Click or drop a video here</div>
                                <div id="lyt-upload-file-name"></div>
                            </div>
                        </div>

                        <div class="lyt-upload-section" data-section="metadata">Metadata (optional)</div>

                        <div class="lyt-field">
                            <label for="lyt-upload-displayname">Display Name</label>
                            <input type="text" id="lyt-upload-displayname">
                        </div>
                        <div class="lyt-field">
                            <label for="lyt-upload-description">Description</label>
                            <textarea id="lyt-upload-description" rows="3"></textarea>
                        </div>
                        <div class="lyt-field-row">
                            <div class="lyt-field">
                                <label for="lyt-upload-date">Upload Date</label>
                                <input type="date" id="lyt-upload-date">
                            </div>
                            <div class="lyt-field">
                                <label for="lyt-upload-views">View Count</label>
                                <input type="number" id="lyt-upload-views" min="0">
                            </div>
                        </div>
                        <div class="lyt-field-row">
                            <div class="lyt-field">
                                <label for="lyt-upload-likes">Likes</label>
                                <input type="number" id="lyt-upload-likes" min="0">
                            </div>
                            <div class="lyt-field">
                                <label for="lyt-upload-dislikes">Dislikes</label>
                                <input type="number" id="lyt-upload-dislikes" min="0">
                            </div>
                        </div>

                        <div class="lyt-upload-section" data-section="attachments">Attachments (optional)</div>

                        <div class="lyt-field">
                            <label>Thumbnail</label>
                            <div class="lyt-simple-file-picker" id="lyt-upload-thumbnail-wrapper">
                                <input type="file" id="lyt-upload-thumbnail-input" accept="image/jpeg,image/png,image/webp">
                                <button type="button" class="lyt-file-btn">Choose</button>
                                <span class="lyt-file-text" id="lyt-upload-thumbnail-name"></span>
                            </div>
                        </div>
                        <div class="lyt-field">
                            <label>Comments JSON</label>
                            <div class="lyt-simple-file-picker" id="lyt-upload-comments-wrapper">
                                <input type="file" id="lyt-upload-comments-input" accept=".json,application/json">
                                <button type="button" class="lyt-file-btn">Choose</button>
                                <span class="lyt-file-text" id="lyt-upload-comments-name"></span>
                            </div>
                        </div>
                        <div class="lyt-field">
                            <label>Livechat JSON</label>
                            <div class="lyt-simple-file-picker" id="lyt-upload-livechat-wrapper">
                                <input type="file" id="lyt-upload-livechat-input" accept=".json,application/json">
                                <button type="button" class="lyt-file-btn">Choose</button>
                                <span class="lyt-file-text" id="lyt-upload-livechat-name"></span>
                            </div>
                        </div>
                    </div>
                    <div id="lyt-upload-modal-footer">
                        <div id="lyt-upload-progress"><div id="lyt-upload-progress-bar"></div></div>
                        <div id="lyt-upload-status"></div>
                        <div id="lyt-upload-buttons">
                            <button id="lyt-upload-cancel-btn" type="button">Cancel</button>
                            <button id="lyt-upload-submit-btn" type="button" disabled>Upload</button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        const overlay     = document.getElementById('lyt-upload-modal-overlay');
        const closeBtn    = document.getElementById('lyt-upload-close');
        const cancelBtn   = document.getElementById('lyt-upload-cancel-btn');
        const submitBtn   = document.getElementById('lyt-upload-submit-btn');
        const titleEl     = document.getElementById('lyt-upload-title');
        const subEl       = document.getElementById('lyt-upload-sub');
        const statusEl    = document.getElementById('lyt-upload-status');
        const progressEl  = document.getElementById('lyt-upload-progress');
        const progressBar = document.getElementById('lyt-upload-progress-bar');

        const channelIn     = document.getElementById('lyt-upload-channel');
        const playlistIn    = document.getElementById('lyt-upload-playlist');
        const displayNameIn = document.getElementById('lyt-upload-displayname');
        const descriptionIn = document.getElementById('lyt-upload-description');
        const dateIn        = document.getElementById('lyt-upload-date');
        const viewsIn       = document.getElementById('lyt-upload-views');
        const likesIn       = document.getElementById('lyt-upload-likes');
        const dislikesIn    = document.getElementById('lyt-upload-dislikes');

        const videoWrapper = document.getElementById('lyt-upload-file-wrapper');
        const videoInput   = document.getElementById('lyt-upload-file-input');
        const videoNameEl  = document.getElementById('lyt-upload-file-name');
        const videoLabelEl = document.getElementById('lyt-upload-file-label');

        let selectedVideoFile = null;
        let uploading = false;
        let uploadSucceeded = false;

        function setupSimplePicker(wrapperId, inputId, nameId, defaultText) {
            const wrapper = document.getElementById(wrapperId);
            const input = document.getElementById(inputId);
            const nameEl = document.getElementById(nameId);
            wrapper.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                if (input.files && input.files[0]) {
                    nameEl.textContent = input.files[0].name;
                    wrapper.classList.add('has-file');
                } else {
                    nameEl.textContent = defaultText;
                    wrapper.classList.remove('has-file');
                }
            });
            nameEl.textContent = defaultText;
            return {
                getFile: () => (input.files && input.files[0]) || null,
                clear: () => { input.value = ''; nameEl.textContent = defaultText; wrapper.classList.remove('has-file'); }
            };
        }

        const thumbnailPicker = setupSimplePicker('lyt-upload-thumbnail-wrapper', 'lyt-upload-thumbnail-input', 'lyt-upload-thumbnail-name', 'Auto-generated if not provided');
        const commentsPicker  = setupSimplePicker('lyt-upload-comments-wrapper',  'lyt-upload-comments-input',  'lyt-upload-comments-name',  'No comments file');
        const livechatPicker  = setupSimplePicker('lyt-upload-livechat-wrapper',  'lyt-upload-livechat-input',  'lyt-upload-livechat-name',  'No livechat file');

        videoWrapper.addEventListener('click', () => { if (!uploading) videoInput.click(); });
        videoWrapper.addEventListener('dragover', (e) => { e.preventDefault(); if (!uploading) videoWrapper.classList.add('drag-over'); });
        videoWrapper.addEventListener('dragleave', () => videoWrapper.classList.remove('drag-over'));
        videoWrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            videoWrapper.classList.remove('drag-over');
            if (uploading) return;
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) handleVideoFile(f);
        });

        function handleVideoFile(file) {
            if (!/\.(mp4|mkv|mp3|avi|mov|wmv|flv|webm)$/i.test(file.name)) {
                statusEl.textContent = getLang('Invalid file type. Allowed: mp4, mkv, mp3, avi, mov, wmv, flv, webm.',
                                                'Ungültiger Dateityp. Erlaubt: mp4, mkv, mp3, avi, mov, wmv, flv, webm.');
                statusEl.className = 'error';
                return;
            }
            selectedVideoFile = file;
            videoNameEl.textContent = file.name + '  (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
            videoLabelEl.style.display = 'none';
            videoWrapper.classList.add('has-file');
            statusEl.textContent = '';
            statusEl.className = '';
            if (!displayNameIn.value.trim()) {
                displayNameIn.placeholder = file.name.replace(/\.[^.]+$/, '');
            }
            validate();
        }

        videoInput.addEventListener('change', () => {
            if (videoInput.files && videoInput.files[0]) handleVideoFile(videoInput.files[0]);
        });
        channelIn.addEventListener('input', validate);

        function validate() {
            submitBtn.disabled = !(selectedVideoFile && channelIn.value.trim().length > 0) || uploading;
        }

        function applyModalTranslations() {
            titleEl.textContent = getLang('Upload Video', 'Video hochladen');
            subEl.textContent = getLang(
                'Adds the file to the LocalYT library. Only video and channel are mandatory.',
                'Fügt die Datei zur LocalYT-Bibliothek hinzu. Nur Video und Kanal sind erforderlich.'
            );
            channelIn.placeholder = getLang('e.g. TWD98', 'z.B. TWD98');
            playlistIn.placeholder = getLang('Leave empty for channel root', 'Leer lassen für Kanal-Stammverzeichnis');
            displayNameIn.placeholder = getLang('Defaults to the video filename', 'Standard ist der Videodateiname');
            descriptionIn.placeholder = getLang('Shown under the video', 'Wird unter dem Video angezeigt');
            viewsIn.placeholder = getLang('Auto', 'Auto');
            likesIn.placeholder = getLang('Auto', 'Auto');
            dislikesIn.placeholder = getLang('Auto', 'Auto');
            videoLabelEl.textContent = getLang('Click or drop a video here', 'Video hier ablegen oder klicken');

            const labels = document.querySelectorAll('#lyt-upload-modal-body label');
            const labelTexts = [
                { en: 'Channel', de: 'Kanal' },
                { en: 'Playlist (optional)', de: 'Playlist (optional)' },
                { en: 'Video File', de: 'Videodatei' },
                { en: 'Display Name', de: 'Anzeigename' },
                { en: 'Description', de: 'Beschreibung' },
                { en: 'Upload Date', de: 'Uploaddatum' },
                { en: 'View Count', de: 'Aufrufe' },
                { en: 'Likes', de: 'Likes' },
                { en: 'Dislikes', de: 'Dislikes' },
                { en: 'Thumbnail', de: 'Vorschaubild' },
                { en: 'Comments JSON', de: 'Kommentar-JSON' },
                { en: 'Livechat JSON', de: 'Livechat-JSON' }
            ];
            labels.forEach((lbl, i) => { if (labelTexts[i]) lbl.textContent = getLang(labelTexts[i].en, labelTexts[i].de); });

            document.querySelectorAll('#lyt-upload-modal-body .lyt-upload-section').forEach(s => {
                const key = s.dataset.section;
                if (key === 'basic') s.textContent = getLang('Basic Information', 'Grundeinstellungen');
                else if (key === 'metadata') s.textContent = getLang('Metadata (optional)', 'Metadaten (optional)');
                else if (key === 'attachments') s.textContent = getLang('Attachments (optional)', 'Anhänge (optional)');
            });

            if (!thumbnailPicker.getFile()) document.getElementById('lyt-upload-thumbnail-name').textContent = getLang('Auto-generated if not provided', 'Automatisch, falls leer');
            if (!commentsPicker.getFile()) document.getElementById('lyt-upload-comments-name').textContent = getLang('No comments file', 'Keine Kommentar-Datei');
            if (!livechatPicker.getFile()) document.getElementById('lyt-upload-livechat-name').textContent = getLang('No livechat file', 'Keine Livechat-Datei');

            if (uploading) submitBtn.textContent = getLang('Uploading...', 'Hochladen...');
            else if (submitBtn.dataset.state === 'success') submitBtn.textContent = getLang('View Video', 'Video ansehen');
            else if (submitBtn.dataset.state === 'retry') submitBtn.textContent = getLang('Retry', 'Erneut versuchen');
            else submitBtn.textContent = getLang('Upload', 'Hochladen');

            cancelBtn.textContent = uploadSucceeded ? getLang('Close', 'Schließen') : getLang('Cancel', 'Abbrechen');
        }

        function reset() {
            selectedVideoFile = null;
            uploading = false;
            uploadSucceeded = false;

            videoInput.value = '';
            videoNameEl.textContent = '';
            videoLabelEl.style.display = '';
            videoWrapper.classList.remove('has-file', 'drag-over');

            channelIn.value = ''; channelIn.disabled = false;
            playlistIn.value = ''; playlistIn.disabled = false;
            displayNameIn.value = '';
            descriptionIn.value = '';
            dateIn.value = '';
            viewsIn.value = '';
            likesIn.value = '';
            dislikesIn.value = '';

            thumbnailPicker.clear();
            commentsPicker.clear();
            livechatPicker.clear();

            statusEl.textContent = '';
            statusEl.className = '';
            progressEl.classList.remove('visible');
            progressBar.style.width = '0%';
            submitBtn.disabled = true;
            submitBtn.dataset.state = '';
            submitBtn.onclick = null;
            videoInput.disabled = false;
            cancelBtn.onclick = close;
            applyModalTranslations();
        }

        function close() {
            if (uploading) return;
            overlay.classList.remove('visible');
            const wasSuccess = uploadSucceeded;
            reset();
            // Reload after success so the client's in-memory MetadataCache
            // (which is loaded once per page) picks up the fresh metadata.
            if (wasSuccess) window.location.reload();
        }

        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('visible') && !uploading) close();
        });

        async function doUpload() {
            if (!selectedVideoFile || !channelIn.value.trim()) return;
            uploading = true;
            submitBtn.disabled = true;
            submitBtn.dataset.state = '';
            submitBtn.textContent = getLang('Uploading...', 'Hochladen...');
            channelIn.disabled = true;
            playlistIn.disabled = true;
            videoInput.disabled = true;
            statusEl.textContent = getLang('Uploading file...', 'Datei wird hochgeladen...');
            statusEl.className = '';
            progressEl.classList.add('visible');
            progressBar.style.width = '0%';
        
            let jobId = null;
        
            try {
                // ---------------- Phase 1: the actual upload ----------------
                const uploadResult = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    const fd = new FormData();
                    fd.append('video', selectedVideoFile);
                    fd.append('channel', channelIn.value.trim());
                    if (playlistIn.value.trim()) fd.append('playlist', playlistIn.value.trim());
                    if (displayNameIn.value.trim()) fd.append('displayName', displayNameIn.value.trim());
                    if (descriptionIn.value.trim()) fd.append('description', descriptionIn.value.trim());
                    if (dateIn.value) fd.append('uploadDate', dateIn.value);
                    if (viewsIn.value !== '') fd.append('viewCount', String(viewsIn.value));
                    if (likesIn.value !== '') fd.append('likes', String(likesIn.value));
                    if (dislikesIn.value !== '') fd.append('dislikes', String(dislikesIn.value));
        
                    const t = thumbnailPicker.getFile(); if (t) fd.append('thumbnail', t);
                    const c = commentsPicker.getFile();  if (c) fd.append('commentsJson', c);
                    const l = livechatPicker.getFile();  if (l) fd.append('livechatJson', l);
        
                    xhr.upload.onprogress = (ev) => {
                        if (ev.lengthComputable) {
                            const pct = Math.round((ev.loaded / ev.total) * 100);
                            progressBar.style.width = pct + '%';
                            statusEl.textContent = getLang(
                                `Uploading file... ${pct}%`,
                                `Datei wird hochgeladen... ${pct}%`
                            );
                        }
                    };
                    xhr.onload = () => {
                        let body = null;
                        try { body = JSON.parse(xhr.responseText); } catch {}
                        if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
                        else reject(new Error((body && body.error) || ('HTTP ' + xhr.status)));
                    };
                    xhr.onerror = () => reject(new Error('Network error'));
                    xhr.ontimeout = () => reject(new Error('Upload timed out'));
                    xhr.timeout = 15 * 60 * 1000;   // 15 min for the upload body alone
                    xhr.open('POST', '/upload-video');
                    xhr.send(fd);
                });
        
                jobId = uploadResult.jobId;
                if (!jobId) throw new Error('Server did not return a job ID');
        
                // ---------------- Phase 2: poll the job ----------------
                statusEl.textContent = getLang('Upload received. Server is processing...', 'Upload erhalten. Server verarbeitet...');
                progressBar.style.width = '0%';
        
                const pollStart = Date.now();
                const POLL_TIMEOUT_MS = 4 * 60 * 60 * 1000;   // 4 hours max
                let pollFailures = 0;
        
                const phaseLabels = {
                    'queued':      { en: 'Queued',                       de: 'In der Warteschlange' },
                    'starting':    { en: 'Starting',                     de: 'Startet' },
                    'reencoding':  { en: 'Reencoding video',             de: 'Video wird reencodiert' },
                    'finalizing':  { en: 'Generating previews',          de: 'Vorschauen werden erstellt' },
                    'complete':    { en: 'Complete',                     de: 'Abgeschlossen' },
                    'error':       { en: 'Error',                        de: 'Fehler' }
                };
        
                const finalResult = await new Promise((resolve, reject) => {
                    const tick = async () => {
                        try {
                            if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
                                return reject(new Error(getLang('Processing timed out', 'Verarbeitung abgelaufen')));
                            }
                    
                            const res = await fetch(`/upload-status/${jobId}`, { cache: 'no-store' });
                            if (!res.ok) {
                                if (res.status === 404) {
                                    return reject(new Error(getLang('Job expired on the server', 'Auftrag ist auf dem Server abgelaufen')));
                                }
                                throw new Error('Poll HTTP ' + res.status);
                            }
                            pollFailures = 0;
                            const status = await res.json();
                    
                            const lang = getLang('en', 'de') === 'de' ? 'de' : 'en';
                    
                            // ----- Queued state -----
                            if (status.status === 'queued' || status.phase === 'queued') {
                                const pos = status.queuePosition || 1;
                                const running = status.queueStatus?.running || 0;
                                const queued  = status.queueStatus?.queued || 0;
                                let msg = lang === 'de'
                                    ? `Wartet in der Warteschlange (Position ${pos})...`
                                    : `Waiting in queue (position ${pos})...`;
                                // Show overall queue depth if more than just you
                                if (queued > 1) {
                                    msg += lang === 'de'
                                        ? ` [${running} aktiv, ${queued} wartend]`
                                        : ` [${running} active, ${queued} waiting]`;
                                }
                                statusEl.textContent = msg;
                                statusEl.className = '';
                                progressBar.style.width = '0%';
                                setTimeout(tick, 5000);   // poll slower while queued
                                return;
                            }
                    
                            // ----- Processing state -----
                            const label = (phaseLabels[status.phase] || phaseLabels.starting)[lang];
                            progressBar.style.width = Math.max(0, Math.min(100, status.progress)) + '%';
                            statusEl.textContent = status.progress > 0
                                ? `${label}... ${status.progress}%`
                                : `${label}...`;
                    
                            if (status.status === 'done') {
                                progressBar.style.width = '100%';
                                return resolve(status.result);
                            }
                            if (status.status === 'error') {
                                return reject(new Error(status.error || getLang('Processing failed', 'Verarbeitung fehlgeschlagen')));
                            }
                    
                            setTimeout(tick, 2000);   // fast poll while processing
                        } catch (e) {
                            pollFailures++;
                            if (pollFailures > 5) return reject(e);
                            setTimeout(tick, 3000);
                        }
                    };
                    tick();
                });
        
                // ---------------- Success ----------------
                statusEl.className = 'success';
                statusEl.textContent = getLang('Upload successful!', 'Upload erfolgreich!');
                if (finalResult.warnings && finalResult.warnings.length) {
                    const w = document.createElement('div');
                    w.className = 'lyt-upload-warn';
                    w.textContent = finalResult.warnings.join(' ');
                    statusEl.appendChild(document.createElement('br'));
                    statusEl.appendChild(w);
                }
        
                uploading = false;
                uploadSucceeded = true;
                submitBtn.dataset.state = 'success';
                submitBtn.textContent = getLang('View Video', 'Video ansehen');
                submitBtn.disabled = false;
                submitBtn.onclick = () => { window.location.href = finalResult.videoUrl; };
                cancelBtn.textContent = getLang('Close', 'Schließen');
        
            } catch (err) {
                console.error('[Upload] failed:', err);
                uploading = false;
                statusEl.className = 'error';
                statusEl.textContent = getLang('Upload failed: ', 'Upload fehlgeschlagen: ') + err.message;
                submitBtn.dataset.state = 'retry';
                submitBtn.textContent = getLang('Retry', 'Erneut versuchen');
                submitBtn.disabled = false;
                channelIn.disabled = false;
                playlistIn.disabled = false;
                videoInput.disabled = false;
            }
        }

        submitBtn.addEventListener('click', () => { if (!uploading) doUpload(); });

        fetch('/api/channels')
            .then(r => r.ok ? r.json() : [])
            .then(channels => {
                const dl = document.getElementById('lyt-upload-channel-list');
                if (!dl) return;
                dl.innerHTML = '';
                channels.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    dl.appendChild(opt);
                });
            })
            .catch(() => {});

        applyModalTranslations();

        overlay._lytReset = reset;
        overlay._lytChannelInput = channelIn;
        overlay._lytApplyTranslations = applyModalTranslations;
    }

    function openUploadModal() {
        injectUploadModal();
        const overlay = document.getElementById('lyt-upload-modal-overlay');
        if (!overlay) return;
        if (typeof overlay._lytReset === 'function') overlay._lytReset();
        if (typeof overlay._lytApplyTranslations === 'function') overlay._lytApplyTranslations();
        overlay.classList.add('visible');
        const channelIn = overlay._lytChannelInput || document.getElementById('lyt-upload-channel');
        if (channelIn) setTimeout(() => channelIn.focus(), 50);
    }

    // ======================================================================
    // Init
    // ======================================================================
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
            const v = document.createElement('span');
            v.id = 'logo-version';
            v.textContent = 'v5.10';
            const isLight = getSetting('appearanceMode', 'dark') === 'light';
            v.style.cssText = `color:${isLight ? '#999999' : '#c8c8c8'};font-family:'RobotoRegular',Arial,sans-serif;font-size:12px;margin-left:4px;transform:translateY(-5px);user-select:none;align-self:center;`;
            logo.parentNode.insertBefore(v, logo.nextSibling);
            window.logoVersionRef = v;
        }

        if (getSetting('language', 'en') === 'de') applyLanguage();
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
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                userData = data;
                if (userData && userData.username) {
                    currentUserId = userData.username;
                    return loadSettingsFromServer().then(() => {
                        applyAppearanceMode();
                        if (getSetting('language', 'en') === 'de') applyLanguage();
                        return fetch('/user-profile-pic')
                            .then(r => r.json())
                            .then(p => { if (p.hasCustomPic && p.picUrl) img.src = p.picUrl; })
                            .catch(() => {});
                    });
                }
                return null;
            })
            .then(() => {
                buildMenu(userData);
                if (userData && userData.username) {
                    initNotifications();
                    // Check upload permission before showing the upload button
                    fetch('/api/permissions')
                        .then(r => r.ok ? r.json() : { canUpload: false })
                        .then(perm => {
                            if (perm.canUpload) initUploadButton();
                        })
                        .catch(() => {});
                }
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
                    fetch('/logout').then(() => window.location.href = '/login.html').catch(() => {});
                }));

                const appearanceItem = createMenuItem('appearance.svg', getLang('Appearance: Dark', 'Erscheinungsbild: Dunkel'));
                updateAppearanceText(appearanceItem);
                let holdTimer;
                appearanceItem.addEventListener('mousedown', () => {
                    holdTimer = setTimeout(() => { toggleAppearanceMode(true); updateAppearanceText(appearanceItem); closeMenu(); }, 500);
                });
                appearanceItem.addEventListener('mouseup', () => clearTimeout(holdTimer));
                appearanceItem.addEventListener('mouseleave', () => clearTimeout(holdTimer));
                appearanceItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearTimeout(holdTimer);
                    toggleAppearanceMode(e.shiftKey);
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

        img.onclick = (e) => { e.stopPropagation(); toggleMenu(); };

        userActions.appendChild(img);
        userActions.appendChild(menuInstance);

        injectMenuStyles();
    }

    function injectMenuStyles() {
        if (document.getElementById('profile-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'profile-menu-styles';

        const isLight = getSetting('appearanceMode', 'dark') === 'light';
        const textColor = isLight ? '#0f0f0f' : '#fff';
        const hoverBg = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)';
        const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
        const shadowColor = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)';

        style.textContent = `
            .profile-menu-dropdown {
                position: absolute; top: 100%; right: 0; margin-top: 8px;
                background-color: var(--secondary-bg-color);
                border: 1px solid ${borderColor};
                min-width: 220px; box-shadow: 0 4px 20px ${shadowColor};
                z-index: 2000; display: none; padding: 8px 0;
            }
            .profile-menu-dropdown.open { display: block; }
            .profile-menu-item {
                display: flex; align-items: center; padding: 10px 20px;
                color: ${textColor}; font-family: 'RobotoRegular', Arial, sans-serif;
                font-size: 14px; cursor: pointer;
                transition: background-color 0.15s ease; user-select: none;
            }
            .profile-menu-item:hover { background-color: ${hoverBg}; }
            .profile-menu-icon {
                width: 20px; height: 20px; margin-right: 16px; opacity: 0.9;
                filter: ${isLight ? 'invert(0)' : 'invert(1)'};
            }
            .header-profile-pic { cursor: pointer; }
            .notif-icon, .upload-icon {
                width: 28px; height: 28px; cursor: pointer;
                filter: ${isLight ? 'invert(0)' : 'invert(1)'};
                transition: filter 0.15s, opacity 0.15s;
            }
            .upload-icon:hover { opacity: 0.8; }
            .notif-badge {
                position: absolute; top: -5px; right: -8px; background-color: red;
                color: white; border-radius: 50%; font-size: 10px; padding: 2px 5px;
                display: none; font-family: 'RobotoRegular', Arial, sans-serif;
                font-weight: bold; align-items: center; justify-content: center;
                min-width: 16px; height: 16px; box-sizing: border-box;
            }
            .notif-dropdown { min-width: 300px; max-height: 400px; overflow-y: auto; }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfilePic);
    } else {
        initProfilePic();
    }
})();