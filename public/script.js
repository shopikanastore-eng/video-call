document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    const body = document.body;
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const startCallButton = document.getElementById('startCallButton');
    const endCallButton = document.getElementById('endCallButton');
    const statusMessage = document.getElementById('statusMessage');
    const messagesDisplay = document.getElementById('messagesDisplay');
    const chatInput = document.getElementById('chatInput');
    const sendChatButton = document.getElementById('sendChatButton');
    const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
    const toggleChatBtn = document.getElementById('toggleChatBtn');
    const chatContainer = document.getElementById('chat-container');
    const closeChatBtn = document.getElementById('closeChatBtn');

    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const menuOptions = document.getElementById('menuOptions');
    const muteBtn = document.getElementById('muteBtn');
    const unmuteBtn = document.getElementById('unmuteBtn');
    const blockBtn = document.getElementById('blockBtn');

    let localStream;
    let peerConnection;
    let partnerSocketId;
    let isCaller;

    const iceServers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ]
    };

    const statsEl = document.getElementById('liveStats');
    let currentValue = parseInt(statsEl.textContent);

    setInterval(() => {
        const change = Math.floor(Math.random() * 6) + 10; // 10 to 15
        const addOrSubtract = Math.random() < 0.5 ? -1 : 1; // randomly + or -
        currentValue += change * addOrSubtract;

        // Optional: prevent negative value
        if (currentValue < 0) currentValue = 0;

        statsEl.textContent = currentValue;
    }, 2000); // every 2 seconds

    // === MENU LOGIC ===
    let isMuted = false;

    menuToggleBtn.addEventListener('click', () => {
        menuOptions.classList.toggle('hidden');
    });

    muteBtn.addEventListener('click', () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = false);
            isMuted = true;
            menuOptions.classList.add('hidden');
        }
    });

    unmuteBtn.addEventListener('click', () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = true);
            isMuted = false;
            menuOptions.classList.add('hidden');
        }
    });

    blockBtn.addEventListener('click', () => {
        menuOptions.classList.add('hidden');
        socket.emit('block-user', { partnerId: partnerSocketId, deviceId: getUniqueBrowserId() });
        // alert("You have blocked this user.");
    });

    document.addEventListener('click', (e) => {
        if (!menuToggleBtn.contains(e.target) && !menuOptions.contains(e.target)) {
            menuOptions.classList.add('hidden');
        }
    });

    toggleChatBtn?.addEventListener('click', () => {
        chatContainer.classList.add('open');
        toggleChatBtn.classList.add('displaynone');
        body.classList.add('chat-open');
        document.getElementById("toggleChatBtn").classList.remove("show-dot");
    });

    closeChatBtn?.addEventListener('click', () => {
        chatContainer.classList.remove('open');
        toggleChatBtn.classList.remove('displaynone');
        body.classList.remove('chat-open');
    });

    function setLobbyState() {
        body.classList.remove('in-call', 'chat-open');
        chatContainer.classList.remove('open');
        statusMessage.textContent = 'Idle. Find a partner to start.';
        statusMessage.classList.remove('status-searching');
        startCallButton.disabled = false;
        endCallButton.disabled = true;
        chatInput.disabled = true;
        sendChatButton.disabled = true;
        messagesDisplay.innerHTML = '';
        remoteVideoPlaceholder.style.display = 'block';
    }

    function setSearchingState() {
        statusMessage.textContent = 'Finding a partner...';
        statusMessage.classList.add('status-searching');
        startCallButton.disabled = true;
    }

    function setInCallState() {
        body.classList.add('in-call');
        statusMessage.textContent = 'Connected!';
        statusMessage.classList.remove('status-searching');
        startCallButton.disabled = true;
        endCallButton.disabled = false;
        chatInput.disabled = false;
        sendChatButton.disabled = false;
    }

    function addChatMessage(message, type) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', type);
        messageElement.textContent = message;
        messagesDisplay.appendChild(messageElement);
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    }

    function getUniqueBrowserId() {
        let deviceId = localStorage.getItem("deviceId");
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem("deviceId", deviceId);
        }
        return deviceId;
    }

    startCallButton.addEventListener('click', async () => {
        try {
            setSearchingState();
            statusMessage.textContent = 'Checking permissions...';

            const cameraPermission = await navigator.permissions.query({ name: 'camera' });
            const micPermission = await navigator.permissions.query({ name: 'microphone' });

            if (cameraPermission.state === 'denied' || micPermission.state === 'denied') {
                alert('Permission denied. Please enable camera and microphone access in your browser settings.');
                setLobbyState();
                return;
            }

            statusMessage.textContent = 'Requesting camera/mic...';
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            statusMessage.textContent = 'Looking for a partner...';
            socket.emit('join', { deviceId: getUniqueBrowserId() });
        } catch (error) {
            console.error('Error accessing media devices.', error);
            statusMessage.textContent = 'Error: Could not access camera/mic.';
            setLobbyState();
        }
    });

    endCallButton.addEventListener('click', () => {
        socket.emit('leave-call');
        hangUp();
    });

    sendChatButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') sendMessage();
    });

    socket.on('waiting', () => {
        statusMessage.textContent = 'Waiting for a partner...';
        startCallButton.disabled = true;
    });

    socket.on('matched', async (data) => {
        if (data?.isMessage) {
            alert(data?.message)
        }
        partnerSocketId = data.partnerId;
        isCaller = data.isCaller;
        setInCallState();
        statusMessage.textContent = 'Partner found! Connecting...';
        await createPeerConnection();
        if (isCaller) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', { sdp: offer, partnerId: partnerSocketId });
        }
    });

    socket.on('offer', async (data) => {
        if (!isCaller && data.senderId === partnerSocketId) {
            setInCallState();
            if (!peerConnection) await createPeerConnection();
            if (!localStream) {
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    localVideo.srcObject = localStream;
                    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                } catch (error) {
                    console.error("Error getting local media for answer:", error);
                    hangUp();
                    return;
                }
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { sdp: answer, partnerId: partnerSocketId });
        }
    });

    socket.on('answer', async (data) => {
        if (isCaller && data.senderId === partnerSocketId) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
    });

    socket.on('ice-candidate', async (data) => {
        if (data.senderId === partnerSocketId && data.candidate) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (error) {
                console.error('Error adding received ICE candidate', error);
            }
        }
    });

    socket.on('chat-message', (data) => {
        if (data.senderId === partnerSocketId) {
            if (!chatContainer?.classList.contains('open')) {
                document.getElementById("toggleChatBtn").classList.add("show-dot");
            }
            addChatMessage(data.message, 'received');
        }
    });

    socket.on('partner-disconnected', () => {
        addChatMessage('Partner has disconnected.', 'received');
        hangUp();
    });

    socket.on('block-user', (data) => {
        hangUp();
    });

    socket.on('block', (data) => {
        alert(data?.message);
        hangUp();
    });

    socket.on('reset-page', (data) => {
        hangUp();
    });


    async function createPeerConnection() {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection(iceServers);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && partnerSocketId) {
                socket.emit('ice-candidate', { candidate: event.candidate, partnerId: partnerSocketId });
            }
        };

        peerConnection.ontrack = (event) => {
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideoPlaceholder.style.display = 'none';
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (body.classList.contains('in-call')) {
                statusMessage.textContent = `Connection: ${peerConnection.iceConnectionState}`;
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }
    }

    function hangUp() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        partnerSocketId = null;
        isCaller = null;
        setLobbyState();
        location.reload();
        console.log('Call ended and cleaned up.');
    }

    function sendMessage() {
        const message = chatInput.value.trim();
        if (message === '' || !partnerSocketId) return;
        addChatMessage(message, 'sent');
        socket.emit('chat-message', { message, partnerId: partnerSocketId });
        chatInput.value = '';
        chatInput.focus();
    }

    setLobbyState();

    if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        alert('This application requires HTTPS to access the camera and microphone. Please use an HTTPS connection.');
        startCallButton.disabled = true;
        statusMessage.textContent = 'HTTPS required.';
    }
});

