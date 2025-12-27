document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const apiKeyInput = document.getElementById('api-key');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const keyStatus = document.getElementById('key-status');

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-upload');
    const fileInfo = document.getElementById('file-info');
    const filenameDisplay = document.getElementById('filename');

    const chatStatus = document.getElementById('chat-status');
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');

    let apiKeySet = false;
    let fileUploaded = false;

    // --- API Key Handling ---
    saveKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) return;

        saveKeyBtn.textContent = 'Saving...';
        try {
            const response = await fetch('/set_api_key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });

            if (response.ok) {
                const responseData = await response.json();
                apiKeySet = true;
                keyStatus.textContent = '✓ Saved';
                keyStatus.style.color = 'var(--success)';
                saveKeyBtn.textContent = 'Updated';
                setTimeout(() => saveKeyBtn.textContent = 'Set Key', 2000);
                enableInputsIfReady();

                if (responseData.models) {
                    alert('Key Accepted! Available Models: ' + responseData.models.join(', '));
                }
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to save key');
            }
        } catch (err) {
            console.error(err);
            alert('Error connecting to server');
        }
    });

    // --- File Upload Handling ---
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFileUpload(fileInput.files[0]);
        }
    });

    async function handleFileUpload(file) {
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }

        if (!apiKeySet) {
            alert('Please set your Gemini API Key first.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        chatStatus.textContent = 'Processing PDF...';
        chatStatus.style.color = 'var(--primary)';

        // Show loading state in file area
        filenameDisplay.textContent = 'Uploading: ' + file.name;
        fileInfo.classList.remove('hidden');

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                fileUploaded = true;
                filenameDisplay.textContent = file.name;
                chatStatus.textContent = 'Ready to chat';
                chatStatus.classList.add('active');

                // Add system message
                addMessage('ai', `I've analyzed **${file.name}**. You can now ask questions about it!`);
                enableInputsIfReady();
            } else {
                alert(data.error || 'Upload failed');
                filenameDisplay.textContent = 'Upload failed';
                chatStatus.textContent = 'Error';
            }
        } catch (err) {
            console.error(err);
            alert('Error uploading file');
        }
    }

    // --- Chat Interface ---
    function enableInputsIfReady() {
        if (apiKeySet && fileUploaded) {
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
        }
    }

    function addMessage(role, text) {
        // Remove welcome message if it exists
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';

        const content = document.createElement('div');
        content.className = 'message-content';
        // Simple markdown parsing for bold text
        content.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(content);

        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        addMessage('user', text);
        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        // Add loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai loading-msg';
        loadingDiv.innerHTML = `
            <div class="avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="message-content"><i class="fa-solid fa-circle-notch fa-spin"></i> Thinking...</div>
        `;
        chatContainer.appendChild(loadingDiv);

        try {
            const response = await fetch('/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text })
            });

            const data = await response.json();

            // Remove loading
            loadingDiv.remove();

            if (response.ok) {
                addMessage('ai', data.answer);
            } else {
                addMessage('ai', `**Error:** ${data.error}`);
            }
        } catch (err) {
            loadingDiv.remove();
            addMessage('ai', '**Error:** Could not reach server.');
        }

        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = 'auto';
    });
});
