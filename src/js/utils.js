function saveFile(blob, fileName) {
    const a = document.createElement('a');
    a.download = fileName;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
}

function getCookieValue(name) {
    return document.cookie.split('; ')
        .find(row => row.startsWith(`${name}=`))
        ?.split('=')[1];
}

function getFetchOptions() {
    return {
        headers: {
            // Hardcode variable: a="129477";f.ASBD_ID=a in JS, can be remove
            // 'x-asbd-id': '129477',
            'x-csrftoken': getCookieValue('csrftoken'),
            'x-ig-app-id': '936619743392459',
            'x-ig-www-claim': sessionStorage.getItem('www-claim-v2'),
            // 'x-instagram-ajax': '1006598911',
            'x-requested-with': 'XMLHttpRequest'
        },
        referrer: window.location.href,
        referrerPolicy: 'strict-origin-when-cross-origin',
        method: 'GET',
        mode: 'cors',
        credentials: 'include'
    };
}

function getValueByKey(obj, key) {
    if (typeof obj !== 'object' || obj === null) return null;
    const stack = [obj];
    const visited = new Set();
    while (stack.length) {
        const current = stack.pop();
        if (visited.has(current)) continue;
        visited.add(current);
        try {
            if (current[key] !== undefined) return current[key];
        } catch (error) {
            if (error.name === 'SecurityError') continue;
            console.log(error);
        }
        for (const value of Object.values(current)) {
            if (typeof value === 'object' && value !== null) {
                stack.push(value);
            }
        }
    }
    return null;
};

function resetDownloadState() {
    const DOWNLOAD_BUTTON = document.querySelector('.download-button');
    DOWNLOAD_BUTTON.classList.remove('loading');
    DOWNLOAD_BUTTON.textContent = 'Download';
    DOWNLOAD_BUTTON.disabled = false;
}

async function saveMedia(media, fileName) {
    try {
        const respone = await fetch(media.src);
        const blob = await respone.blob();
        saveFile(blob, fileName);
        media.nextElementSibling.classList.remove('check');
    } catch (error) {
        console.log(error);
    }
}

async function saveZip() {
    const DOWNLOAD_BUTTON = document.querySelector('.download-button');
    DOWNLOAD_BUTTON.classList.add('loading');
    DOWNLOAD_BUTTON.textContent = 'Loading...';
    DOWNLOAD_BUTTON.disabled = true;
    const medias = Array.from(document.querySelectorAll('.overlay.checked')).map(item => item.previousElementSibling);
    const zipFileName = medias[0].title.replaceAll(' | ', '_') + '.zip';
    async function fetchSelectedMedias() {
        let count = 0;
        const results = await Promise.allSettled(medias.map(async (media) => {
            const res = await fetch(media.src);
            const blob = await res.blob();
            const data = {
                title: media.title.replaceAll(' | ', '_'),
                data: blob
            };
            data.title = media.nodeName === 'VIDEO' ? `${data.title}.mp4` : `${data.title}.jpeg`;
            count++;
            DOWNLOAD_BUTTON.textContent = `${count}/${medias.length}`;
            return data;
        }));
        results.forEach(promise => {
            if (promise.status === 'rejected') throw new Error('Fail to fetch');
        });
        return results.map(promise => promise.value);
    }
    try {
        const medias = await fetchSelectedMedias();
        const blob = await createZip(medias);
        saveFile(blob, zipFileName);
        document.querySelectorAll('.overlay').forEach(element => {
            element.classList.remove('checked');
        });
        resetDownloadState();
    } catch (error) {
        console.log(error);
        resetDownloadState();
    }
}

function shouldDownload() {
    if (window.location.pathname === '/' && appState.getFieldChange() !== 'none') {
        return appState.getFieldChange();
    }
    appState.setCurrentShortcode();
    appState.setCurrentUsername();
    appState.setCurrentHightlightsId();
    function getCurrentPage() {
        const currentPath = window.location.pathname;
        if (currentPath.match(IG_POST_REGEX)) return 'post';
        if (currentPath.match(IG_STORY_REGEX)) {
            if (currentPath.match(IG_HIGHLIGHT_REGEX)) return 'highlights';
            return 'stories';
        }
        if (currentPath === '/') return 'post';
        return 'none';
    }
    const currentPage = getCurrentPage();
    const valueChange = appState.getFieldChange();
    if (['highlights', 'stories', 'post'].includes(currentPage)) {
        if (currentPage === valueChange) return valueChange;
        if (appState.currentDisplay !== currentPage) return currentPage;
    }
    return 'none';
}

function setDownloadState(state = 'ready') {
    const DOWNLOAD_BUTTON = document.querySelector('.download-button');
    const MEDIAS_CONTAINER = document.querySelector('.medias-container');
    const options = {
        ready() {
            DOWNLOAD_BUTTON.classList.add('loading');
            DOWNLOAD_BUTTON.textContent = 'Loading...';
            DOWNLOAD_BUTTON.disabled = true;
            MEDIAS_CONTAINER.replaceChildren();
        },
        fail() { 
            resetDownloadState();
            showToast('Failed to fetch media');
            // Add shake effect
            DOWNLOAD_BUTTON.classList.add('shake');
            setTimeout(() => DOWNLOAD_BUTTON.classList.remove('shake'), 400); 
        },
        success() {
            DOWNLOAD_BUTTON.disabled = false;
            appState.setPreviousValues();
            const photosArray = MEDIAS_CONTAINER.querySelectorAll('img , video');
            let loadedPhotos = 0;
            function countLoaded() {
                loadedPhotos++;
                if (loadedPhotos === photosArray.length) resetDownloadState();
            }
            photosArray.forEach(media => {
                if (media.tagName === 'IMG') {
                    media.addEventListener('load', countLoaded);
                    media.addEventListener('error', countLoaded);
                }
                else {
                    media.addEventListener('loadeddata', countLoaded);
                    media.addEventListener('abort', countLoaded);
                }
            });
        }
    };
    options[state]();
}

async function handleFetch() {
    let data = null;
    const TITLE_CONTAINER = document.querySelector('.title-container').firstElementChild;
    const DISPLAY_CONTAINER = document.querySelector('.display-container');
    const DOWNLOAD_BUTTON = document.querySelector('.download-button');
    const SEND_BUTTON = document.querySelector('.send-button');
    const option = shouldDownload();

    requestAnimationFrame(() => { 
        DISPLAY_CONTAINER.classList.remove('hide'); 
        SEND_BUTTON.classList.remove('hide');
    });
    
    if (option === 'none') {
        showToast('No media to download');
        // Add shake effect
        DOWNLOAD_BUTTON.classList.add('shake');
        setTimeout(() => DOWNLOAD_BUTTON.classList.remove('shake'), 400); 
        return;
    }
    setDownloadState('ready');
    option === 'post' ? data = await downloadPostPhotos() : data = await downloadStoryPhotos(option);
    if (!data) return setDownloadState('fail');
    appState.currentDisplay = option;
    renderMedias(data);
}

async function handleDownload() {
    let data = null;
    const TITLE_CONTAINER = document.querySelector('.title-container').firstElementChild;
    const DISPLAY_CONTAINER = document.querySelector('.display-container');
    const DOWNLOAD_BUTTON = document.querySelector('.download-button');
    const SEND_BUTTON = document.querySelector('.send-button');
    const option = shouldDownload();
    const totalItemChecked = Array.from(document.querySelectorAll('.overlay.checked'));
    if (TITLE_CONTAINER.classList.contains('multi-select')
        && !DISPLAY_CONTAINER.classList.contains('hide')
        && option === 'none'
        && totalItemChecked.length !== 0) {
        return saveZip();
    }
    requestAnimationFrame(() => { 
        DISPLAY_CONTAINER.classList.remove('hide'); 
        SEND_BUTTON.classList.remove('hide');
    });
    
    if (option === 'none') {
        showToast('No media to download');
        // Add shake effect
        DOWNLOAD_BUTTON.classList.add('shake');
        setTimeout(() => DOWNLOAD_BUTTON.classList.remove('shake'), 400); 
        return;
    }
}

function renderMedias(data) {
    const TITLE_CONTAINER = document.querySelector('.title-container').firstElementChild;
    const MEDIAS_CONTAINER = document.querySelector('.medias-container');
    MEDIAS_CONTAINER.replaceChildren();
    if (!data) return;
    const fragment = document.createDocumentFragment();
    const date = new Date(data.date * 1000).toISOString().split('T')[0];
    data.medias.forEach(item => {
        const attributes = {
            class: 'medias-item',
            src: item.url,
            title: `${data.user.username} | ${item.id} | ${date}`,
            controls: ''
        };
        const ITEM_TEMPLATE =
            `<div class="media-wrapper">
                <button class="action-button">
                    <svg aria-label="Share" class="x1lliihq x1n2onr6 xyb1xck" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Share</title><line fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2" x1="22" x2="9.218" y1="3" y2="10.083"></line><polygon fill="none" points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></polygon></svg>
                </button>
                ${item.isVideo ? `<video></video>` : '<img/>'}
                <div class="overlay">✔</div>
            </div>`;
        const itemDOM = new DOMParser().parseFromString(ITEM_TEMPLATE, 'text/html').body.firstElementChild;
        const media = itemDOM.querySelector('img, video');
        const selectBox = itemDOM.querySelector('.overlay');
        Object.keys(attributes).forEach(key => {
            if (item.isVideo) media.setAttribute(key, attributes[key]);
            else if (key !== 'controls') media.setAttribute(key, attributes[key]);
        });
        media.addEventListener('click', (e) => {
            if (TITLE_CONTAINER.classList.contains('multi-select')) {
                if (item.isVideo) e.preventDefault();
                selectBox.classList.toggle('checked');
            }
            else saveMedia(media, media.title.replaceAll(' | ', '_') + `${item.isVideo ? '.mp4' : '.jpeg'}`);
        });
        itemDOM.querySelector('.action-button').addEventListener('click', async (e) => {
            const button = e.currentTarget;
            const originalSVG = button.innerHTML; // Save the original SVG
            const sendingSVG = `
                <svg class="sending-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="24" height="24">
                    <circle cx="25" cy="25" r="20" stroke="currentColor" stroke-width="4" fill="none" stroke-dasharray="31.4" stroke-linecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                    </circle>
                </svg>
            `;
        
            // Replace the button's SVG with the "Sending" SVG
            button.innerHTML = sendingSVG;
        
            try {
                await sendMedia(media); // Perform the operation
            } catch (error) {
                console.error('Error sending media:', error);
            } finally {
                // Restore the original SVG after the operation is complete
                button.innerHTML = originalSVG;
            }
        });
        fragment.appendChild(itemDOM);
    });
    MEDIAS_CONTAINER.appendChild(fragment);
    TITLE_CONTAINER.classList.remove('multi-select');
    setDownloadState('success');
}

function handleLongClick(element, shortClickHandler, longClickHandler, delay = 400) {
    element.addEventListener('mousedown', () => {
        let count = 0;
        const intervalId = setInterval(() => {
            count = count + 10;
            if (count >= delay) {
                clearInterval(intervalId);
                longClickHandler();
            }
        }, 10);
        element.addEventListener('mouseup', () => {
            clearInterval(intervalId);
            if (count < delay) shortClickHandler();
        }, { once: true });
    });
}

function isValidJson(string) {
    try {
        JSON.parse(string);
        return true;
    } catch {
        return false;
    }
}

async function handleSend() {
    let data = null;
    const TITLE_CONTAINER = document.querySelector('.title-container').firstElementChild;
    const DISPLAY_CONTAINER = document.querySelector('.display-container');
    const SEND_BUTTON = document.querySelector('.send-button');
    const option = shouldDownload();
    const totalItemChecked = Array.from(document.querySelectorAll('.overlay.checked'));
    if (TITLE_CONTAINER.classList.contains('multi-select')
        && !DISPLAY_CONTAINER.classList.contains('hide')
        && option === 'none'
        && totalItemChecked.length !== 0) {
        const SEND_BUTTON = document.querySelector('.send-button');
        SEND_BUTTON.classList.add('loading');
        SEND_BUTTON.textContent = 'Loading...';
        SEND_BUTTON.disabled = true;
        const medias = Array.from(document.querySelectorAll('.overlay.checked')).map(item => item.previousElementSibling);
        const username = medias[0].title.split(' | ')[0];
        async function fetchSelectedMedias() {
            let count = 0;
            const results = await Promise.allSettled(medias.map(async (media) => {
                const res = await fetch(media.src);
                const blob = await res.blob();
                const data = {
                    title: media.title.replaceAll(' | ', '_'),
                    type: media.nodeName === 'VIDEO' ? 'video' : 'photo',
                    blob: blob,
                };
                data.title = media.nodeName === 'VIDEO' ? `${data.title}.mp4` : `${data.title}.jpeg`;
                count++;
                SEND_BUTTON.textContent = `${count}/${medias.length}`;
                return data;
            }));
            results.forEach(promise => {
                if (promise.status === 'rejected') throw new Error('Fail to fetch');
            });
            return results.map(promise => promise.value);
        }
        try {
            const medias = await fetchSelectedMedias();
            const caption = `<a href="https://www.instagram.com/${username}">@${username}</a>`;
            // If count of media is 1, send it as a single media
            if (medias.length == 1) {
                const media = medias[0];
                await sendToTelegram(media.blob,caption, media.type, true);
            } else {
                const content = {
                    'medias': [],
                    'blobs': [] 
                };
                medias.forEach(media => {
                    let item = {
                        type: media.type,
                        media: 'attach://'+media.title,
                        parse_mode: 'html'
                    };
                    if (content.medias.length == 0) item.caption = caption;
                    content.medias.push(item);
                    content.blobs.push({
                        title: media.title,
                        blob: media.blob,
                    });
                });
    
                await sendBulkToTelegram(content, true);
            }
            document.querySelectorAll('.overlay').forEach(element => {
                element.classList.remove('checked');
            });
            // Set success state to button
            SEND_BUTTON.textContent = 'Success';
            setTimeout(() => {
                resetSendState();
            }, 1000);
                
        } catch (error) {
            console.log(error);
            showToast(error.message ?? 'Failed to send media');
            SEND_BUTTON.textContent = 'Failed';
            setTimeout(() => {
                resetSendState();
            }, 1000);
        }

    } else {
        // Only if send button is visible
        if (SEND_BUTTON.classList.contains('hide')) return;
        showToast('No media to send');
        // Add shake effect
        SEND_BUTTON.classList.add('shake');
        setTimeout(() => SEND_BUTTON.classList.remove('shake'), 400);
    }
}

function resetSendState() {
    const SEND_BUTTON = document.querySelector('.send-button');
    SEND_BUTTON.classList.remove('loading');
    SEND_BUTTON.textContent = 'Send Media';
    SEND_BUTTON.disabled = false;
}

async function getConfig() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['ig_downloader_settings'], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error retrieving settings:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                const settings = result.ig_downloader_settings || {};
                const config = {
                    telegram: settings.telegram || {
                        token: '',
                        chatId: ''
                    }
                };
                resolve(config);
            }
        });
    }
    );
}

function getKeyboardShortcuts() {
    return {
        esc: {
            keys: ['Escape', 'C'],
            description: 'Close the current modal or popup',
            target: '.esc-button'
        },
        fetchMedias: {
            keys: ['d'],
            description: 'Fetch medias for the current post',
            target: '.download-button'
        },
        download: {
            keys: ['D'],
            description: 'Download the current selected media(s)',
            target: '.download-button'
        },
        send: {
            keys: ['F'],
            description: 'Send the current media to configured integration(s)',
            target: '.send-button'
        },
        toggleSelect: {
            keys: ['z'],
            description: 'Select/Deselect the current media',
            target: '.medias-item'
        },
        toggleSelectAll: {
            keys: ['X'],
            description: 'Select/Deselect all medias',
            target: '.select-all-button'
        },
        selectCurrent: {
            keys: ['x'],
            description: 'Select the current media',
            target: '.medias-item'
        },
        switchTarget: {
            'keys': ['Z'],
            'description': 'Switch between the current media and the next one',
            'target': '.medias-item'
        }
    }
}

function showToast(message, timeout = 2500) {
    const container = document.querySelector('.display-container');
    if (!container) return;
    // If container is hidden, do not show toast
    if (container.classList.contains('hide')) return;
    let toast = container.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        container.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, timeout);
}

async function sendMedia(media) {
    try {
        const response = await fetch(media.src);
        const blob = await response.blob();
        const username = media.title.split(' | ')[0];
        const type = media.nodeName === 'VIDEO' ? 'video' : 'photo';
        const caption = `<a href="https://www.instagram.com/${username}">@${username}</a>`;
        await sendToTelegram(blob, caption, type, true);
    } catch (error) {
        console.error('Error uploading media:', error);
    }
}

async function sendToTelegram(blob, caption, type = 'photo', parseMode = false) {
    const config = await getConfig();
    const TELEGRAM_BOT_TOKEN = config.telegram.token;
    const TELEGRAM_CHAT_ID = config.telegram.chatId;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('Telegram bot token or chat ID is missing');
        return;
    }
    const action = type === 'video' ? 'sendVideo' : 'sendPhoto';
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${action}`;

    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    if (type === 'video') {
        formData.append('video', blob);
    } else {
        formData.append('photo', blob);
    }
    formData.append('caption', caption);
    if (parseMode) {
        formData.append('parse_mode', 'HTML');
    }

    try {
        const response = await fetch(url, {
        method: 'POST',
        body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
        throw new Error(data.description || 'Telegram API error');
        }

        console.log('Media sent successfully:', data);
    } catch (error) {
        console.error('Error sending media:', error);
    }
}

async function sendBulkToTelegram(content, parseMode = false) {
    const config = await getConfig();
    const TELEGRAM_BOT_TOKEN = config.telegram.token;
    const TELEGRAM_CHAT_ID = config.telegram.chatId;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('[sendBulk] Telegram bot token or chat ID is missing');
        return;
    }

    if (content.blobs.length != content.medias.length || content.blobs.length == 0 || content.medias.length == 0) {
        console.log(`[sendBulk] Content not of the same length`);
        return;
    }
    
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMediaGroup`;
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('media', JSON.stringify(content.medias));
    content.blobs.forEach(blob => {
        if (!blob.title || !blob.blob) return;
        formData.append(blob.title, blob.blob);
    });
    if (parseMode) {
        formData.append('parse_mode', 'HTML');
    }
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.description || 'Telegram API error');
        }

        console.log('Media sent successfully:', data);
    } catch (error) {
        console.error('Error sending media:', error);
    }
}