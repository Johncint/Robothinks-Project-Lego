(function() {
    const upBtn = document.getElementById('upBtn');
    const downBtn = document.getElementById('downBtn');
    const eStopBtn = document.getElementById('eStopBtn');
    const connectBtn = document.getElementById('connectBtn');
    const connectBtnText = document.getElementById('connectBtnText');
    const statusText = document.getElementById('statusText');
    const displayText = document.getElementById('displayText');
    const servoIndicator = document.getElementById('servoIndicator');
    const ledUp = document.getElementById('ledUp');
    const ledDown = document.getElementById('ledDown');
    const servoButtons = document.querySelectorAll('.joint-btn');
    
    const speedRange = document.getElementById('speedRange');
    const speedNum = document.getElementById('speedNum');
    const speedCard = document.getElementById('speedCard');
    const sessionTimerEl = document.getElementById('sessionTimer');
    const camStream = document.getElementById('camStream');
    const camPlaceholder = document.getElementById('camPlaceholder');
    const camIpInput = document.getElementById('camIpInput');
    const camToggleBtn = document.getElementById('camToggleBtn');
    const camLiveDot = document.getElementById('camLiveDot');
    const camStatusLabel = document.getElementById('camStatusLabel');
    const toastNotification = document.getElementById('toastNotification');
    const toastTitle = document.getElementById('toastTitle');
    const toastDesc = document.getElementById('toastDesc');
    const toastSvgSuccess = document.getElementById('toastSvgSuccess');
    const toastSvgDisconnect = document.getElementById('toastSvgDisconnect');
    const themeSwatches = document.querySelectorAll('.swatch-btn');

    let upPressed = false;
    let downPressed = false;
    let activeJoint = 1; 
    let port = null;
    let reader = null;
    let inputDone = null;
    let writer = null;
    let commandQueue = Promise.resolve();
    let heartbeatInterval = null;
    let isConnected = false;
    let isCamActive = false;
    let currentSpeedPercent = 50;
    let audioCtx = null;
    let sessionSeconds = 0;
    let sessionTimerInterval = null;

    themeSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            themeSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            const selectedTheme = swatch.getAttribute('data-theme');
            if (selectedTheme === 'purple') {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', selectedTheme);
            }
            initAudio();
            playSound('click');
        });
    });

    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSound(type) {
        try {
            initAudio();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'connect') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.setValueAtTime(500, now + 0.08);
                osc.frequency.setValueAtTime(800, now + 0.16);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'disconnect') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === 'action') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.start(now);
                osc.stop(now + 0.08);
            } else if (type === 'estop') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.setValueAtTime(900, now + 0.1);
                osc.frequency.setValueAtTime(300, now + 0.2);
                osc.frequency.setValueAtTime(900, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            }
        } catch (e) {
            console.error('Audio play failed:', e);
        }
    }

    const jointNames = { 
        1: 'DUAL ARM', 
        2: 'BOOM', 
        4: 'SWING', 
        5: 'BASE 360', 
        6: 'DRIVE' 
    };

    const keyJointMap = { 
        '1': 1, 
        '2': 2, 
        '3': 4, 
        '4': 5, 
        '5': 6 
    };
    
    const commands = {
        1: { up: 'L', down: 'R', stop: 'S' }, 
        2: { up: 'A', down: 'D', stop: 'X' }, 
        4: { up: 'V', down: 'B', stop: 'Z' },
        5: { up: 'J', down: 'K', stop: 'T' },
        6: { up: '1', down: '2', stop: '3' }
    };

    function startSessionTimer() {
        sessionSeconds = 0;
        sessionTimerEl.textContent = '00:00:00';
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = setInterval(() => {
            sessionSeconds++;
            const hrs = String(Math.floor(sessionSeconds / 3600)).padStart(2, '0');
            const mins = String(Math.floor((sessionSeconds % 3600) / 60)).padStart(2, '0');
            const secs = String(sessionSeconds % 60).padStart(2, '0');
            sessionTimerEl.textContent = `${hrs}:${mins}:${secs}`;
        }, 1000);
    }

    function stopSessionTimer() {
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
        sessionSeconds = 0;
        sessionTimerEl.textContent = '00:00:00';
    }

    function showToast(type) {
        toastNotification.className = 'toast-notification';
        if (type === 'success') {
            toastNotification.classList.add('success');
            toastTitle.textContent = 'SYSTEM LINKED';
            toastDesc.textContent = 'Arduino Serial Port Connected Successfully';
            toastSvgSuccess.classList.remove('hidden-svg');
            toastSvgDisconnect.classList.add('hidden-svg');
            playSound('connect');
        } else {
            toastNotification.classList.add('disconnect');
            toastTitle.textContent = 'SYSTEM UNLINKED';
            toastDesc.textContent = 'Arduino Serial Port Disconnected Successfully';
            toastSvgSuccess.classList.add('hidden-svg');
            toastSvgDisconnect.remove('hidden-svg');
            playSound('disconnect');
        }
        toastNotification.classList.add('show');
        setTimeout(() => {
            toastNotification.classList.remove('show');
        }, 3500);
    }

    async function disconnectSerial() {
        try {
            setUp(false);
            setDown(false);
            stopSessionTimer();
            if (writer) { try { await writer.releaseLock(); } catch (e) {} writer = null; }
            if (reader) { try { await reader.cancel(); await reader.releaseLock(); } catch (e) {} reader = null; }
            if (port) { try { await port.close(); } catch (e) {} port = null; }
        } catch (err) {
            console.error('Error during disconnect:', err);
        }
        isConnected = false;
        connectBtnText.textContent = 'CONNECT ARDUINO';
        upBtn.disabled = true;
        downBtn.disabled = true;
        eStopBtn.disabled = true;
        statusText.className = 'status-badge disconnected';
        statusText.querySelector('.status-dot').style.background = '';
        statusText.querySelector('.status-dot').style.boxShadow = '';
        statusText.querySelector('.status-label').textContent = 'NOT CONNECTED';
        statusText.querySelector('.status-label').style.color = '';
        showToast('disconnect');
    }

    connectBtn.addEventListener('click', async () => {
        initAudio();
        playSound('click');
        if (!('serial' in navigator)) { 
            statusText.className = 'status-badge disconnected';
            statusText.querySelector('.status-label').textContent = 'NEEDS CHROME/EDGE'; 
            return; 
        }
        if (isConnected) {
            await disconnectSerial();
            return;
        }
        try {
            port = await navigator.serial.requestPort();
            if (port.readable || port.writable) { try { await port.close(); } catch(e) {} }
            await port.open({ baudRate: 9600 });
            writer = port.writable.getWriter();
            
            if (port.readable) {
                reader = port.readable.getReader();
                inputDone = reader.closed.catch(() => {});
            }
            isConnected = true;
            statusText.className = 'status-badge connected';
            statusText.querySelector('.status-dot').style.background = 'var(--success)';
            statusText.querySelector('.status-dot').style.boxShadow = '0 0 8px var(--success)';
            statusText.querySelector('.status-label').textContent = 'CONNECTED';
            statusText.querySelector('.status-label').style.color = '#34d399';
            connectBtnText.textContent = 'DISCONNECT';
            upBtn.disabled = false;
            downBtn.disabled = false;
            eStopBtn.disabled = false;
            
            startSessionTimer();
            showToast('success');
            port.addEventListener('disconnect', async () => { await disconnectSerial(); });
        } catch (error) { 
            isConnected = false;
            connectBtnText.textContent = 'CONNECT ARDUINO';
            statusText.className = 'status-badge disconnected';
            statusText.querySelector('.status-label').textContent = 'FAILED: ' + error.message.toUpperCase(); 
        }
    });

    camToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        initAudio();
        playSound('click');
        if (isCamActive) {
            camStream.src = '';
            camStream.classList.add('hidden');
            camPlaceholder.classList.remove('hidden');
            camToggleBtn.textContent = 'START FEED';
            camToggleBtn.classList.remove('active-feed');
            camLiveDot.classList.remove('live');
            camStatusLabel.textContent = 'ESP32-CAM FEED';
            isCamActive = false;
        } else {
            let ipVal = camIpInput.value.trim();
            if (!ipVal) return;
            if (!ipVal.startsWith('http://') && !ipVal.startsWith('https://')) {
                ipVal = 'http://' + ipVal;
            }
            camStream.src = ipVal;
            camStream.classList.remove('hidden');
            camPlaceholder.classList.add('hidden');
            camToggleBtn.textContent = 'STOP FEED';
            camToggleBtn.classList.add('active-feed');
            camLiveDot.classList.add('live');
            camStatusLabel.textContent = 'ESP32-CAM [LIVE STREAM]';
            isCamActive = true;
        }
    });

    function sendCommand(cmd) {
        if (!writer) return;
        commandQueue = commandQueue.then(async () => {
            await writer.write(new TextEncoder().encode(cmd));
        }).catch(err => console.error(err));
    }

    function getIntervalFromPercent(percent) {
        return Math.round(142 - (1.22 * percent));
    }

    function startHeartbeat(cmd) {
        clearInterval(heartbeatInterval);
        sendCommand(cmd); 
        const delay = getIntervalFromPercent(currentSpeedPercent);
        heartbeatInterval = setInterval(() => { sendCommand(cmd); }, delay);
    }

    function stopHeartbeat(stopCmd) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        sendCommand(stopCmd);
    }

    function updateUI() {
        const name = jointNames[activeJoint];
        displayText.textContent = name;
        
        ledUp.classList.toggle('active-up', upPressed);
        ledDown.classList.toggle('active-down', downPressed);
        
        if (activeJoint === 1) servoIndicator.textContent = 'ACTIVE · SERVO 1 & 3 (MAX)';
        else if (activeJoint === 6) servoIndicator.textContent = 'ACTIVE · DC MOTOR';
        else servoIndicator.textContent = `ACTIVE · SERVO ${activeJoint}`;
    }

    function updateSpeedZone(percent) {
        if (!speedCard) return;
        speedCard.classList.remove('precision-zone', 'normal-zone', 'turbo-zone');
        if (percent <= 30) {
            speedCard.classList.add('precision-zone');
        } else if (percent <= 70) {
            speedCard.classList.add('normal-zone');
        } else {
            speedCard.classList.add('turbo-zone');
        }
    }

    function setActiveJoint(num) {
        if (activeJoint === num) return;
        setUp(false); 
        setDown(false);
        activeJoint = num;
        
        servoButtons.forEach(btn => {
            const btnJoint = parseInt(btn.dataset.joint);
            const isActive = btnJoint === activeJoint;
            btn.classList.toggle('active', isActive);
            if (isActive) {
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });
        playSound('click');
        updateUI();
    }

    function setUp(pressed) {
        if (upPressed === pressed) return;
        upPressed = pressed;
        updateUI();
        
        if (pressed) {
            upBtn.classList.add('keyboard-active');
            if (downPressed) setDown(false);
            playSound('action');
            startHeartbeat(commands[activeJoint].up);
        } else {
            upBtn.classList.remove('keyboard-active');
            stopHeartbeat(commands[activeJoint].stop);
        }
    }

    function setDown(pressed) {
        if (downPressed === pressed) return;
        downPressed = pressed;
        updateUI();
        
        if (pressed) {
            downBtn.classList.add('keyboard-active');
            if (upPressed) setUp(false);
            playSound('action');
            startHeartbeat(commands[activeJoint].down);
        } else {
            downBtn.classList.remove('keyboard-active');
            stopHeartbeat(commands[activeJoint].stop);
        }
    }

    function adjustSpeed(delta) {
        currentSpeedPercent = Math.min(100, Math.max(1, currentSpeedPercent + delta));
        speedRange.value = currentSpeedPercent;
        speedNum.textContent = currentSpeedPercent;
        updateSpeedZone(currentSpeedPercent);
        playSound('click');
        speedCard.classList.add('speed-active');
        setTimeout(() => {
            speedCard.classList.remove('speed-active');
        }, 200);
        if (upPressed) startHeartbeat(commands[activeJoint].up);
        if (downPressed) startHeartbeat(commands[activeJoint].down);
    }

    async function triggerEmergencyStop() {
        playSound('estop');
        setUp(false);
        setDown(false);
        eStopBtn.classList.add('active-alert');
        setTimeout(() => { eStopBtn.classList.remove('active-alert'); }, 1500);
        await disconnectSerial();
    }

    eStopBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await triggerEmergencyStop();
    });

    if (speedRange && speedNum) {
        speedRange.addEventListener('input', (e) => {
            currentSpeedPercent = parseInt(e.target.value);
            speedNum.textContent = currentSpeedPercent;
            updateSpeedZone(currentSpeedPercent);
            playSound('click');
            if (upPressed) startHeartbeat(commands[activeJoint].up);
            if (downPressed) startHeartbeat(commands[activeJoint].down);
        });
    }

    function attachButtonEvents(button, setter) {
        button.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            button.setPointerCapture(e.pointerId);
            setter(true);
        });
        const release = () => setter(false);
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
    }

    attachButtonEvents(upBtn, setUp);
    attachButtonEvents(downBtn, setDown);

    servoButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveJoint(parseInt(btn.dataset.joint));
        });
    });

    const keyMap = { 'ArrowUp': setUp, 'w': setUp, 'W': setUp, 'ArrowDown': setDown, 's': setDown, 'S': setDown };
    const keysDown = new Set();
    
    window.addEventListener('keydown', async (e) => {
        if (document.activeElement === camIpInput) return;
        initAudio();
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!isConnected) return;
            await triggerEmergencyStop();
            return;
        }
        if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            adjustSpeed(-5);
            return;
        }
        if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            adjustSpeed(5);
            return;
        }
        if (keyJointMap[e.key]) { 
            e.preventDefault();
            setActiveJoint(keyJointMap[e.key]); 
            return; 
        }
        const setter = keyMap[e.key];
        if (!setter) return;
        e.preventDefault();
        if (!keysDown.has(e.key)) { keysDown.add(e.key); setter(true); }
    });
    
    window.addEventListener('keyup', (e) => {
        if (document.activeElement === camIpInput) return;
        const setter = keyMap[e.key];
        if (!setter) return;
        e.preventDefault();
        if (keysDown.has(e.key)) { keysDown.delete(e.key); setter(false); }
    });

    window.addEventListener('blur', () => { setUp(false); setDown(false); keysDown.clear(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { setUp(false); setDown(false); keysDown.clear(); } });

    updateUI();
    updateSpeedZone(currentSpeedPercent);
})();