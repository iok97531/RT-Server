// client.js - RT-Server 웹 클라이언트

class RelayController {
    constructor() {
        this.socket = null;
        this.relayState = {
            ch1: false,
            ch2: false,
            ch3: false,
            ch4: false
        };
        
        this.init();
    }

    init() {
        this.initSocket();
        this.initEventListeners();
        this.addLog('클라이언트 초기화 완료', 'info');
    }

    initSocket() {
        // Socket.io 연결 - 로컬 서버
        this.socket = io('http://localhost:3000');
        
        // 연결 이벤트
        this.socket.on('connect', () => {
            this.addLog('서버에 연결됨', 'success');
            this.updateConnectionStatus('connected');
            
            // 웹 클라이언트로 등록
            this.socket.emit('register', {
                type: 'web',
                name: `웹클라이언트-${new Date().getTime()}`
            });
        });

        // 연결 해제 이벤트
        this.socket.on('disconnect', () => {
            this.addLog('서버 연결 해제됨', 'error');
            this.updateConnectionStatus('disconnected');
        });

        // 재연결 시도 이벤트
        this.socket.on('reconnecting', (attemptNumber) => {
            this.addLog(`재연결 시도 중... (${attemptNumber})`, 'warning');
            this.updateConnectionStatus('connecting');
        });

        // 릴레이 상태 업데이트 수신
        this.socket.on('relay_state', (state) => {
            this.addLog('릴레이 상태 수신됨', 'info');
            this.relayState = state;
            this.updateRelayUI();
        });

        // 릴레이 상태 변경 수신
        this.socket.on('relay_state_update', (data) => {
            const { channel, state } = data;
            this.addLog(`릴레이 CH${channel}: ${state ? 'ON' : 'OFF'}`, 'info');
            this.relayState[`ch${channel}`] = state;
            this.updateRelayButton(channel, state);
        });

        // 클라이언트 수 업데이트
        this.socket.on('client_count', (data) => {
            this.updateClientCount(data);
        });

        // Odroid 연결/해제 알림
        this.socket.on('odroid_connected', (data) => {
            this.addLog(`Odroid 연결됨: ${data.name}`, 'success');
        });

        this.socket.on('odroid_disconnected', (data) => {
            this.addLog('Odroid 연결 해제됨', 'warning');
        });
    }

    initEventListeners() {
        // 릴레이 버튼 이벤트
        document.querySelectorAll('.relay-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const channel = parseInt(e.currentTarget.dataset.channel);
                const currentState = this.relayState[`ch${channel}`];
                this.toggleRelay(channel, !currentState);
            });
        });

        // 전체 제어 버튼
        document.getElementById('all-on').addEventListener('click', () => {
            this.controlAllRelays(true);
        });

        document.getElementById('all-off').addEventListener('click', () => {
            this.controlAllRelays(false);
        });

        // 로그 지우기 버튼
        document.getElementById('clear-log').addEventListener('click', () => {
            this.clearLog();
        });
    }

    toggleRelay(channel, state) {
        if (!this.socket || !this.socket.connected) {
            this.addLog('서버에 연결되지 않음', 'error');
            return;
        }

        this.addLog(`릴레이 CH${channel} ${state ? 'ON' : 'OFF'} 요청`, 'info');
        
        // 서버에 릴레이 제어 요청
        this.socket.emit('relay_control', {
            channel: channel,
            state: state
        });

        // UI 즉시 업데이트 (서버 응답 대기 없이)
        this.updateRelayButton(channel, state);
    }

    controlAllRelays(state) {
        this.addLog(`전체 릴레이 ${state ? 'ON' : 'OFF'} 요청`, 'info');
        
        for (let i = 1; i <= 4; i++) {
            this.toggleRelay(i, state);
        }
    }

    updateRelayButton(channel, state) {
        const btn = document.getElementById(`relay-${channel}`);
        const statusSpan = btn.querySelector('.relay-status');
        
        btn.className = `relay-btn ${state ? 'on' : 'off'}`;
        statusSpan.textContent = state ? 'ON' : 'OFF';
        
        this.relayState[`ch${channel}`] = state;
    }

    updateRelayUI() {
        for (let i = 1; i <= 4; i++) {
            const state = this.relayState[`ch${i}`];
            this.updateRelayButton(i, state);
        }
    }

    updateConnectionStatus(status) {
        const statusText = document.getElementById('connection-status');
        const statusIndicator = document.getElementById('status-indicator');
        
        statusIndicator.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                statusText.textContent = '연결됨';
                break;
            case 'connecting':
                statusText.textContent = '연결 중...';
                break;
            case 'disconnected':
                statusText.textContent = '연결 안됨';
                break;
        }
    }

    updateClientCount(data) {
        document.getElementById('web-count').textContent = data.web;
        document.getElementById('odroid-count').textContent = data.odroid;
    }

    addLog(message, type = 'info') {
        const logContainer = document.getElementById('log-container');
        const logEntry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // 로그가 너무 많아지면 오래된 것 삭제
        const entries = logContainer.children;
        if (entries.length > 100) {
            logContainer.removeChild(entries[0]);
        }
    }

    clearLog() {
        const logContainer = document.getElementById('log-container');
        logContainer.innerHTML = '<div class="log-entry">로그가 지워졌습니다.</div>';
    }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', () => {
    const relayController = new RelayController();
    
    // 전역 객체로 등록 (디버깅용)
    window.relayController = relayController;
});

// 키보드 단축키
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        switch (e.key) {
            case '1':
            case '2':
            case '3':
            case '4':
                e.preventDefault();
                const channel = parseInt(e.key);
                const currentState = window.relayController.relayState[`ch${channel}`];
                window.relayController.toggleRelay(channel, !currentState);
                break;
            case 'a':
                e.preventDefault();
                window.relayController.controlAllRelays(true);
                break;
            case 'd':
                e.preventDefault();
                window.relayController.controlAllRelays(false);
                break;
        }
    }
});