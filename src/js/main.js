const IG_BASE_URL = window.location.origin + '/';
/**
 * @deprecated
 */
const IG_PROFILE_HASH = '69cba40317214236af40e7efa697781d';
/**
 * @deprecated
 */
const IG_POST_HASH = '9f8827793ef34641b2fb195d4d41151c';

const IG_SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const IG_POST_REGEX = /\/(p|tv|reel|reels)\/([A-Za-z0-9_-]*)(\/?)/;
const IG_STORY_REGEX = /\/(stories)\/(.*?)\/(\d*)(\/?)/;
const IG_HIGHLIGHT_REGEX = /\/(stories)\/(highlights)\/(\d*)(\/?)/;

const APP_NAME = `${chrome.runtime.getManifest().name} v${chrome.runtime.getManifest().version}`;

const appCache = Object.freeze({
    /**
     * Cache user id, reduce one api call to get id from username
     * 
     * username => id
     */
    userIdsCache: new Map(),
    /**
     * Cache post id, reduce one api call to get post id from shortcode.
     * 
     * Only for private profile, check out  post-modal-view-handler.js
     * 
     * shortcode => post_id
     */
    postIdInfoCache: new Map(),
});

const appState = Object.freeze((() => {
    let currentDisplay = '';
    const current = {
        shortcode: '',
        username: '',
        highlights: '',
    };
    const previous = {
        shortcode: '',
        username: '',
        highlights: '',
    };
    window.addEventListener('shortcodeChange', e => {
        current.shortcode = e.detail.code;
    });
    return {
        get currentDisplay() { return currentDisplay; },
        set currentDisplay(value) { if (['post', 'stories', 'highlights'].includes(value)) currentDisplay = value; },
        current: Object.freeze({
            get shortcode() { return current.shortcode; },
            set shortcode(value) {
                current.shortcode = value;
                downloadPostPhotos().then(data => {
                    renderMedias(data);
                    currentDisplay = 'post';
                });
            },
            get username() { return current.username; },
            set username(value) {
                current.username = value;
                downloadStoryPhotos('stories').then(data => {
                    renderMedias(data);
                    currentDisplay = 'stories';
                });
            },
            get highlights() { return current.highlights; },
            set highlights(value) {
                current.highlights = value;
                downloadStoryPhotos('highlights').then(data => {
                    renderMedias(data);
                    currentDisplay = 'hightlights';
                });
            },
        }),
        setCurrentShortcode() {
            const page = window.location.pathname.match(IG_POST_REGEX);
            if (page) current.shortcode = page[2];
        },
        setCurrentUsername() {
            const page = window.location.pathname.match(IG_STORY_REGEX);
            if (page && page[2] !== 'highlights') current.username = page[2];
        },
        setCurrentHightlightsId() {
            const page = window.location.pathname.match(IG_HIGHLIGHT_REGEX);
            if (page) current.highlights = page[3];
        },
        setPreviousValues() {
            Object.keys(current).forEach(key => { previous[key] = current[key]; });
        },
        getFieldChange() {
            if (current.highlights !== previous.highlights) return 'highlights';
            if (current.username !== previous.username) return 'stories';
            if (current.shortcode !== previous.shortcode) return 'post';
            return 'none';
        },
    };
})());

(() => {
    function createElement(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html').body;
        const fragment = document.createDocumentFragment();
        fragment.append(...doc.childNodes);
        return fragment;
    }
    function initUI() {
        document.body.appendChild(createElement(
            `<div class="display-container hide">
				<div class="title-container">
					<span title="${APP_NAME}">Medias</span>
                    <div class="shortcuts-tooltip">
                        <span class="shortcuts-icon" title="Keyboard Shortcuts">⌨️</span>
                        <div class="shortcuts-content">
                            <h3>Keyboard Shortcuts</h3>
                            <div id="shortcuts-list">
                                <!-- Shortcuts will be dynamically inserted here -->
                            </div>
                        </div>
                    </div>
					<button class="esc-button">&times</button>
				</div>
                <div class="toast" style="display:none"></div>
				<div class="medias-container">
					<p style="position: absolute;top: 50%;transform: translate(0%, -50%);">
						Nothing to download
					</p>
				</div>
			</div>
			<button class="download-button">Download</button>
            <button class="send-button hide">Send Media</button>`));
    }
    function handleEvents() {
        const keyboardShortcuts = getKeyboardShortcuts();
        const TITLE_CONTAINER = document.querySelector('.title-container').firstElementChild;
        const DISPLAY_CONTAINER = document.querySelector('.display-container');
        const ESC_BUTTON = document.querySelector(keyboardShortcuts.esc.target);
        const FETCH_BUTTON = document.querySelector(keyboardShortcuts.fetchMedias.target);
        const DOWNLOAD_BUTTON = document.querySelector(keyboardShortcuts.download.target);
        const SEND_BUTTON = document.querySelector(keyboardShortcuts.send.target);
        const SWITCH_TARGET_BUTTON = document.querySelector(keyboardShortcuts.switchTarget.target);
        const IGNORE_FOCUS_ELEMENTS = ['INPUT', 'TEXTAREA'];

        const ESC_EVENT_KEYS = keyboardShortcuts.esc.keys;
        const FETCH_MEDIAS_EVENT_KEYS = keyboardShortcuts.fetchMedias.keys;
        const DOWNLOAD_EVENT_KEYS = keyboardShortcuts.download.keys;
        const SEND_EVENT_KEYS = keyboardShortcuts.send.keys;
        const SELECT_EVENT_KEYS = keyboardShortcuts.toggleSelect.keys;
        const SELECT_ALL_EVENT_KEYS = keyboardShortcuts.toggleSelectAll.keys;
        const CHECK_CURRENT_EVENT_KEYS = keyboardShortcuts.selectCurrent.keys;
        const SWITCH_TARGET_EVENT_KEYS = keyboardShortcuts.switchTarget.keys;
        function setTheme() {
            const isDarkMode = localStorage.getItem('igt') === null ?
                window.matchMedia('(prefers-color-scheme: dark)').matches :
                localStorage.getItem('igt') === 'dark';
            if (isDarkMode) {
                DISPLAY_CONTAINER.classList.add('dark');
                DISPLAY_CONTAINER.firstElementChild.classList.add('dark');
            }
            else {
                DISPLAY_CONTAINER.classList.remove('dark');
                DISPLAY_CONTAINER.firstElementChild.classList.remove('dark');
            }
        }
        function populateShortcutsTooltip() {
            const shortcutsList = document.getElementById('shortcuts-list');
            if (!shortcutsList) return;

            const shortcutItems = [];
            const keyboardShortcuts = getKeyboardShortcuts();
            
            // Create HTML for each shortcut group
            for (const [key, properties] of Object.entries(keyboardShortcuts)) {
                const description = properties.description;
                const keys = properties.keys;
                const keyboardShortcutItems = keys.map(k => `<kbd>${k === 'Escape' ? 'ESC' : k}</kbd>`).join(' or ');
                shortcutItems.push(`<div class="shortcut-item"><span>${description}</span><span class="shortcut-keys">${keyboardShortcutItems}</span></div>`);
            }
            
            shortcutsList.innerHTML = shortcutItems.join('');
        }
        function pauseVideo() {
            if (DISPLAY_CONTAINER.classList.contains('hide')) {
                DISPLAY_CONTAINER.querySelectorAll('video').forEach(video => {
                    video.pause();
                });
            }
        }
        function toggleSelectMode() {
            if (TITLE_CONTAINER.classList.contains('multi-select')) {
                TITLE_CONTAINER.title = 'Hold to select / deselect all';
                DISPLAY_CONTAINER.querySelectorAll('.overlay').forEach(element => {
                    element.classList.add('show');
                });
            }
            else {
                TITLE_CONTAINER.textContent = 'Medias';
                TITLE_CONTAINER.title = APP_NAME;
                DISPLAY_CONTAINER.querySelectorAll('.overlay').forEach(element => {
                    element.classList.remove('show');
                });
            }
        }
        function handleSelectAll() {
            if (!TITLE_CONTAINER.classList.contains('multi-select')) return;
            const totalItem = Array.from(DISPLAY_CONTAINER.querySelectorAll('.overlay'));
            const totalItemChecked = Array.from(DISPLAY_CONTAINER.querySelectorAll('.overlay.checked'));
            if (totalItemChecked.length !== totalItem.length) totalItem.forEach(item => {
                if (!item.classList.contains('saved')) item.classList.add('checked');
            });
            else {
                totalItem.forEach(item => { item.classList.remove('checked'); });
            }
        }
        function setSelectedMedias() {
            if (TITLE_CONTAINER.classList.contains('multi-select')) {
                TITLE_CONTAINER.textContent = `Selected ${DISPLAY_CONTAINER.querySelectorAll('.overlay.checked').length}`;
            }
        }
        // Helper function to get the element in the center of the viewport
        function getElementInCenter() {
            const container = document.querySelector('.medias-container');
            const elements = Array.from(container.querySelectorAll('.overlay'));
            const viewportHeight = window.innerHeight;
            const viewportCenter = viewportHeight / 2;

            let closestElement = null;
            let closestDistance = Infinity;

            elements.forEach(element => {
                const rect = element.getBoundingClientRect();
                const elementCenter = rect.top + rect.height / 2;
                const distanceToCenter = Math.abs(viewportCenter - elementCenter);

                if (distanceToCenter < closestDistance) {
                    closestDistance = distanceToCenter;
                    closestElement = element;
                }
            });

            return closestElement;
        }
        let currentMediaTarget = null;
        function getNextMediaTarget() {
            const overlays = Array.from(document.querySelectorAll('.medias-container .overlay'));
            if (overlays.length === 0) return null;
            let idx = overlays.indexOf(currentMediaTarget);
            // Remove highlight from previous
            if (currentMediaTarget) {
                currentMediaTarget.closest('div.media-wrapper')?.classList.remove('active-glow');
            }
            idx = (idx + 1) % overlays.length;
            currentMediaTarget = overlays[idx];
            // Add highlight to new target
            currentMediaTarget.closest('div.media-wrapper')?.classList.add('active-glow');
            // Scroll into view
            currentMediaTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return currentMediaTarget;
        }
        populateShortcutsTooltip();
        const handleTheme = new MutationObserver(setTheme);
        const handleVideo = new MutationObserver(pauseVideo);
        const handleToggleSelectMode = new MutationObserver(toggleSelectMode);
        const handleSelectMedia = new MutationObserver(setSelectedMedias);
        handleTheme.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
        handleVideo.observe(DISPLAY_CONTAINER, {
            attributes: true,
            attributeFilter: ['class']
        });
        handleToggleSelectMode.observe(TITLE_CONTAINER, {
            attributes: true,
            attributeFilter: ['class']
        });
        handleSelectMedia.observe(DISPLAY_CONTAINER.querySelector('.medias-container'), {
            attributes: true, childList: true, subtree: true
        });
        let hoveredElement = null; // Variable to store the currently hovered element
        // Add a mouseover event listener to track the hovered element
        document.querySelector('.medias-container').addEventListener('mouseover', (e) => {
            // Check if the hovered element is a media element (e.g., img or video)
            if (e.target.matches('img, video')) {
                hoveredElement = e.target; // Update the hovered element
            }
            // Clear currentMediaTarget and glow
            if (currentMediaTarget) {
                currentMediaTarget.closest('div.media-wrapper')?.classList.remove('active-glow');
                currentMediaTarget = null;
            }
        });
        // Add a mouseout event listener to clear the hovered element when the mouse leaves
        document.querySelector('.medias-container').addEventListener('mouseout', (e) => {
            if (e.target === hoveredElement) {
                hoveredElement = null; // Clear the hovered element
            }
            // Clear currentMediaTarget and glow
            if (currentMediaTarget) {
                currentMediaTarget.closest('div.media-wrapper')?.classList.remove('active-glow');
                currentMediaTarget = null;
            }
        });
        ESC_BUTTON.addEventListener('click', () => {
            DISPLAY_CONTAINER.classList.add('hide');
            SEND_BUTTON.classList.add('hide');
        });
        let keyed_key = null;
        window.addEventListener('keydown', (e) => {
            keyed_key = e.key;
            if (window.location.pathname.startsWith('/direct')) return;
            if (IGNORE_FOCUS_ELEMENTS.includes(e.target.tagName)) return;
            if (e.target.role === 'textbox') return;
            if (e.ctrlKey) return;
            if (FETCH_MEDIAS_EVENT_KEYS.includes(e.key)) {
                return FETCH_BUTTON.click();
            }
            if (DOWNLOAD_EVENT_KEYS.includes(e.key)) {
                return DOWNLOAD_BUTTON.click();
            }
            if (SEND_EVENT_KEYS.includes(e.key)) {
                return SEND_BUTTON.click();
            }
            if (ESC_EVENT_KEYS.includes(e.key)) {
                return ESC_BUTTON.click();
            }
            if (SELECT_EVENT_KEYS.includes(e.key) && !DISPLAY_CONTAINER.classList.contains('hide')) {
                return TITLE_CONTAINER.classList.toggle('multi-select');
            }
            if (SELECT_ALL_EVENT_KEYS.includes(e.key) &&
                !DISPLAY_CONTAINER.classList.contains('hide') &&
                TITLE_CONTAINER.classList.contains('multi-select')
            ) {
                handleSelectAll(); // Call the function to select/deselect all
            }
            if (CHECK_CURRENT_EVENT_KEYS.includes(e.key) &&
                !DISPLAY_CONTAINER.classList.contains('hide') &&
                TITLE_CONTAINER.classList.contains('multi-select')
            ) {
                // If currentMediaTarget is active, mark it; else fallback to hoveredElement
                let target = currentMediaTarget;
                if (!target) {
                    if (!hoveredElement) return;
                    // Find parent div from hoveredElement, then check child class .overlay
                    const div = hoveredElement.closest('div');
                    target = div.querySelector('.overlay');
                }
                if (target) {
                    target.classList.toggle('checked');
                }
            }
            if (SWITCH_TARGET_EVENT_KEYS.includes(e.key) &&
                !DISPLAY_CONTAINER.classList.contains('hide') &&
                TITLE_CONTAINER.classList.contains('multi-select')
            ) {
                getNextMediaTarget();
            }
        });
        window.addEventListener('keyup', (e) => {
            keyed_key = null;
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                DISPLAY_CONTAINER.querySelectorAll('video').forEach(video => {
                    video.pause();
                });
            }
        });
        handleLongClick(TITLE_CONTAINER, () => {
            TITLE_CONTAINER.classList.toggle('multi-select');
        }, handleSelectAll);
        DOWNLOAD_BUTTON.addEventListener('click', () => {
            if (DOWNLOAD_EVENT_KEYS.includes(keyed_key)) {
                handleDownload();
            }
        });
        FETCH_BUTTON.addEventListener('click', () => {
            if (FETCH_MEDIAS_EVENT_KEYS.includes(keyed_key) || keyed_key === null) {
                handleFetch();
            }
        });
        window.addEventListener('online', () => {
            DISPLAY_CONTAINER.querySelectorAll('img , video').forEach(media => {
                media.src = media.src;
            });
        });
        SEND_BUTTON.addEventListener('click', handleSend);
        window.addEventListener('pathChange', () => {
            if (window.location.pathname.startsWith('/direct')) {
                DOWNLOAD_BUTTON.setAttribute('hidden', 'true');
                SEND_BUTTON.setAttribute('hidden', 'true');
                DISPLAY_CONTAINER.classList.add('hide');
            }
            else DOWNLOAD_BUTTON.removeAttribute('hidden');
        });
        window.addEventListener('userLoad', e => {
            appCache.userIdsCache.set(e.detail.username, e.detail.id);
        });
        window.addEventListener('postView', e => {
            if (appCache.postIdInfoCache.has(e.detail.id)) return;
            // Check valid shortcode
            if (e.detail.code.startsWith(convertToShortcode(e.detail.id))) {
                appCache.postIdInfoCache.set(e.detail.code, e.detail.id);
            }
        });
        setTheme();
        if (window.location.pathname.startsWith('/direct')) {
            DOWNLOAD_BUTTON.classList.add('hide');
            SEND_BUTTON.classList.add('hide');
            DISPLAY_CONTAINER.classList.add('hide');
        }
    }
    function run() {
        document.querySelectorAll('.display-container, .download-button, .send-button').forEach(node => {
            node.remove();
        });
        initUI();
        handleEvents();
    }
    run();
})();