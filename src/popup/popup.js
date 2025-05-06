function myVersion() {
    return chrome.runtime.getManifest().version;
}

function myDescription() {
    return chrome.runtime.getManifest().description;
}

function myName() {
    return chrome.runtime.getManifest().name;
}

// On load, populate the input fields with saved settings
function loadSettings() {
    chrome.storage.sync.get(['ig_downloader_settings'], function (result) {
        const settings = result.ig_downloader_settings || {};
        // Telegram settings
        if (settings.telegram) {
            document.getElementById('telegramToken').value = settings.telegram.token || '';
            document.getElementById('chatId').value = settings.telegram.chatId || '';
        } else {
            document.getElementById('telegramToken').value = '';
            document.getElementById('chatId').value = '';
        }
        console.log('Settings loaded:', settings);
    });
}

// Save settings to local storage
function saveSettings() {
    const saveButton = document.getElementById('save-settings');
    const settings = {
        telegram: {
            token: document.getElementById('telegramToken').value,
            chatId: document.getElementById('chatId').value
        },
        // Add other settings here as needed
    };
    chrome.storage.sync.set({ig_downloader_settings: settings}, function () {
        console.log('Settings saved:', settings);
        saveButton.textContent = 'Saved!';
        setTimeout(() => {
            saveButton.textContent = 'Save';
        }, 1000);
    });
}

// Toggle password visibility
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('telegramToken');
    const toggleIcon = document.querySelector('#toggle-password i'); // Select the <i> tag inside the span
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

// Attach event listeners
window.addEventListener('DOMContentLoaded', function () {
    console.log('Instagram Downloader v' + myVersion());
    document.getElementById('toggle-password').addEventListener('click', togglePasswordVisibility);
    document.getElementById('app-title').textContent = `${myName()} v${myVersion()}`;
    document.getElementById('app-description').textContent = myDescription();
    loadSettings();
    document.getElementById('save-settings').addEventListener('click', saveSettings);
});