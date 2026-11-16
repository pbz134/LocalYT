/**
 * LocalYT ToS Popup
 * =================
 * Non-dismissible Terms of Service acceptance popup.
 *
 * Behavior:
 *  - Fetches "ToS.txt" from LocalYT-Rev-Files.
 *  - Lines beginning with "//" (after optional whitespace) are comments and are stripped.
 *  - If the stripped content is empty, NO popup is shown.
 *  - Otherwise every visitor (logged in or not) must scroll through the ToS and
 *    click "I Accept" once. Acceptance is stored in localStorage + cookie.
 *  - The accepted ToS hash is stored; editing ToS.txt forces re-acceptance.
 */
(function () {
    'use strict';

    /* ---------------------------- Config ---------------------------- */
    const TOS_FILE          = 'LocalYT-Rev-Files/ToS.txt';
    const STORAGE_KEY       = 'lyt_tos_accepted_v1';
    const COOKIE_NAME       = 'lyt_tos_accepted_v1';
    const COOKIE_DAYS       = 365;
    const SALT              = 'SALT-REPLACEWITHYOUROWN!'; // obfuscation, don't leave at default value!
    const CHECK_INTERVAL_MS = 1000;
    const POPUP_ID          = 'lyt-tos-popup';

    /* --------------------------- Utilities -------------------------- */
    function hashStr(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }
    function sign(payload) { return hashStr(SALT + '|' + payload); }

    function setCookie(name, value, days) {
        const d = new Date();
        d.setTime(d.getTime() + days * 864e5);
        document.cookie = name + '=' + encodeURIComponent(value) +
            ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
    }
    function getCookie(name) {
        const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + safe + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    }
    function applyImportant(el, styles) {
        for (const key of Object.keys(styles)) {
            const prop = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
            try { el.style.setProperty(prop, String(styles[key]), 'important'); } catch (e) {}
        }
    }

    /* ---------------------- ToS parsing & state --------------------- */
    function parseTos(raw) {
        const out = [];
        for (const line of raw.split(/\r?\n/)) {
            if (/^\s*\/\//.test(line)) continue; // full-line comment
            out.push(line);
        }
        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function isAccepted(currentHash) {
        let ls = null, ck = null;
        try { ls = localStorage.getItem(STORAGE_KEY); } catch (e) {}
        try { ck = getCookie(COOKIE_NAME); } catch (e) {}
        if (!ls || !ck || ls !== ck) return false;
        const parts = ls.split('.');
        if (parts.length !== 3) return false;
        const [h, t, sig] = parts;
        if (h !== currentHash) return false;
        if (sig !== sign(h + '.' + t)) return false;
        return true;
    }

    function setAccepted(currentHash) {
        const t = Date.now().toString(36);
        const value = currentHash + '.' + t + '.' + sign(currentHash + '.' + t);
        try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
        setCookie(COOKIE_NAME, value, COOKIE_DAYS);
    }

    /* ----------------------- Popup management ----------------------- */
    const state = { active: false, tosText: '', tosHash: '', observer: null, intervalId: null };

    function isPopupPresent() {
        const el = document.getElementById(POPUP_ID);
        if (!el || !el.isConnected) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity || '1') < 0.5) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (r.top > 100 || r.left > 100) return false; // moved off-screen
        return true;
    }

    function buildPopup() {
        const prev = document.getElementById(POPUP_ID);
        if (prev) prev.remove();

        const overlay = document.createElement('div');
        overlay.id = POPUP_ID;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        applyImportant(overlay, {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            background: 'rgba(0,0,0,0.92)', zIndex: '2147483647',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px', boxSizing: 'border-box', fontFamily: 'Arial,sans-serif',
        });

        const box = document.createElement('div');
        applyImportant(box, {
            background: '#1a1a1a', color: '#d2cfcf', border: '1px solid #333',
            borderRadius: '8px', width: '100%', maxWidth: '720px', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'hidden',
            fontFamily: 'Arial,sans-serif', textAlign: 'left',
        });

        const header = document.createElement('div');
        applyImportant(header, { padding: '18px 24px', borderBottom: '1px solid #333', background: '#111' });
        const h1 = document.createElement('h1');
        applyImportant(h1, { margin: '0', fontSize: '20px', fontWeight: 'normal', color: '#fff', fontFamily: 'Arial,sans-serif' });
        h1.textContent = 'Terms of Service';
        const hp = document.createElement('p');
        applyImportant(hp, { margin: '6px 0 0 0', fontSize: '13px', color: '#888', fontFamily: 'Arial,sans-serif' });
        hp.textContent = 'You must read and accept the Terms of Service to use LocalYT.';
        header.appendChild(h1); header.appendChild(hp);

        const content = document.createElement('div');
        content.id = 'lyt-tos-content';
        applyImportant(content, {
            padding: '20px 24px', overflowY: 'auto', flex: '1',
            whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.7',
            color: '#b0adae', minHeight: '150px', fontFamily: 'Arial,sans-serif',
            wordBreak: 'break-word', userSelect: 'text',
        });
        content.textContent = state.tosText;

        const footer = document.createElement('div');
        applyImportant(footer, {
            padding: '16px 24px', borderTop: '1px solid #333', background: '#111',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '16px', flexWrap: 'wrap',
        });

        const hint = document.createElement('span');
        hint.id = 'lyt-tos-hint';
        applyImportant(hint, { fontSize: '12px', color: '#888', fontFamily: 'Arial,sans-serif' });
        hint.textContent = 'Scroll to the bottom to enable Accept.';

        const btn = document.createElement('button');
        btn.id = 'lyt-tos-accept';
        btn.type = 'button';
        btn.disabled = true;
        btn.textContent = 'I Accept';
        applyImportant(btn, {
            padding: '10px 24px', background: '#333', color: '#777', border: 'none',
            borderRadius: '4px', fontSize: '14px', cursor: 'not-allowed',
            fontFamily: 'Arial,sans-serif', fontWeight: 'bold',
        });

        footer.appendChild(hint); footer.appendChild(btn);
        box.appendChild(header); box.appendChild(content); box.appendChild(footer);
        overlay.appendChild(box);

        try {
            document.documentElement.style.setProperty('overflow', 'hidden', 'important');
            if (document.body) document.body.style.setProperty('overflow', 'hidden', 'important');
        } catch (e) {}

        (document.body || document.documentElement).appendChild(overlay);

        // --- Scroll detection ---
        let unlocked = false;
        function unlock() {
            if (unlocked) return;
            unlocked = true;
            btn.disabled = false;
            applyImportant(btn, {
                padding: '10px 24px', background: '#c00', color: '#fff',
                border: 'none', borderRadius: '4px', fontSize: '14px',
                cursor: 'pointer', fontFamily: 'Arial,sans-serif', fontWeight: 'bold',
            });
            hint.textContent = 'Click "I Accept" to continue.';
            try { hint.style.setProperty('color', '#aaa', 'important'); } catch (e) {}
        }
        content.addEventListener('scroll', function () {
            if (content.scrollTop + content.clientHeight >= content.scrollHeight - 8) unlock();
        }, { passive: true });
        setTimeout(function () {
            if (content.scrollHeight <= content.clientHeight + 8) unlock();
        }, 120);

        btn.addEventListener('click', function () {
            if (btn.disabled) return;
            // Double-check real scroll (defends against devtools re-enabling button)
            if (content.scrollTop + content.clientHeight < content.scrollHeight - 8) return;
            setAccepted(state.tosHash);
            teardown();
        });

        return overlay;
    }

    function teardown() {
        state.active = false;
        if (state.observer) { try { state.observer.disconnect(); } catch (e) {} state.observer = null; }
        if (state.intervalId) { clearInterval(state.intervalId); state.intervalId = null; }
        const p = document.getElementById(POPUP_ID);
        if (p) p.remove();
        try {
            document.documentElement.style.removeProperty('overflow');
            if (document.body) document.body.style.removeProperty('overflow');
        } catch (e) {}
    }

    function startEnforcement() {
        try {
            state.observer = new MutationObserver(function () {
                if (!state.active) return;
                if (!document.getElementById(POPUP_ID)) {
                    Promise.resolve().then(function () {
                        if (state.active && !document.getElementById(POPUP_ID)) buildPopup();
                    });
                }
            });
            state.observer.observe(document.body || document.documentElement, { childList: true, subtree: false });
        } catch (e) {}

        state.intervalId = setInterval(function () {
            if (!state.active) return;
            if (!isPopupPresent()) {
                const p = document.getElementById(POPUP_ID);
                if (p) p.remove();
                buildPopup();
            }
        }, CHECK_INTERVAL_MS);

        window.addEventListener('pageshow', function () {
            if (state.active && !isPopupPresent()) buildPopup();
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && state.active && !isPopupPresent()) buildPopup();
        });

        // Cross-tab sync: if accepted in another tab, close here too
        window.addEventListener('storage', function (e) {
            if (!state.active) return;
            if (e.key === STORAGE_KEY && isAccepted(state.tosHash)) teardown();
        });
    }

    /* ---------------------------- Bootstrap -------------------------- */
    function whenBodyReady(fn) {
        if (document.body) return fn();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    async function fetchTos() {
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(TOS_FILE, { cache: 'no-cache' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return await res.text();
            } catch (e) {
                lastErr = e;
                if (attempt < 2) await new Promise(r => setTimeout(r, 500));
            }
        }
        throw lastErr;
    }

    // Start fetch immediately; suppress unhandled-rejection warning
    const fetchPromise = fetchTos();
    fetchPromise.catch(function () {});

    whenBodyReady(function () {
        fetchPromise.then(function (raw) {
            const text = parseTos(raw);
            if (!text) return;                     // empty / comment-only → no popup
            const tosHash = hashStr(text);
            if (isAccepted(tosHash)) return;       // already accepted → done

            state.active = true;
            state.tosText = text;
            state.tosHash = tosHash;
            buildPopup();
            startEnforcement();
        }).catch(function (err) {
            console.error('[LocalYT ToS] Unable to load ToS file:', err);
        });
    });
})();