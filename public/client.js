// client.js - RT-Server 웹 클라이언트

const RELAY_PAIR_COUNT = 2;
const RELAYS_PER_PAIR = 4;
let odroidList = []; // 서버에서 순서대로 받음
let relayStates = [
    Array(RELAYS_PER_PAIR).fill(false),
    Array(RELAYS_PER_PAIR).fill(false)
];

class RelayController {
    constructor() {
        this.socket = null;
        this.relayState = { ch1: false, ch2: false, ch3: false, ch4: false }; // ← 추가
        
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
            // state: [{ch1, ch2, ch3, ch4}, ...]
            if (Array.isArray(state) && state.length === RELAY_PAIR_COUNT) {
                relayStates = state.map(pair => [pair.ch1, pair.ch2, pair.ch3, pair.ch4]);
                // 첫번째 쌍을 this.relayState에 동기화 (키보드 단축키 등에서 사용)
                this.relayState = { ...state[0] };
                this.updateRelayUI();
            }
        });

        // 릴레이 상태 변경 수신
        this.socket.on('relay_state_update', ({ odroidIndex, channel, state }) => {
            relayStates[odroidIndex][channel - 1] = state;
            this.updateRelayUI();
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

        // Odroid 연결 목록 수신
        this.socket.on('odroid_list', (list) => {
            console.log
            odroidList = list;
            for (let i = 0; i < RELAY_PAIR_COUNT; i++) {
                const title = document.getElementById(`pair-${i+1}-title`);
                if (odroidList[i]) {
                    title.textContent = `Odroid ${i+1} (${odroidList[i].name || odroidList[i].id})`;
                    this.enablePair(i, true);
                } else {
                    title.textContent = `Odroid ${i+1} (미연결)`;
                    this.enablePair(i, false);
                }
            }
        });
    }

    initEventListeners() {
        // 릴레이 버튼 이벤트
        for (let pairIdx = 0; pairIdx < RELAY_PAIR_COUNT; pairIdx++) {
            for (let ch = 1; ch <= RELAYS_PER_PAIR; ch++) {
                document.getElementById(`relay-${pairIdx+1}-${ch}`).addEventListener('click', (e) => {
                    const state = !relayStates[pairIdx][ch-1];
                    this.toggleRelay(pairIdx, ch, state);
                });
            }
            document.getElementById(`all-on-${pairIdx+1}`).addEventListener('click', () => {
                this.controlAllRelays(pairIdx, true);
            });
            document.getElementById(`all-off-${pairIdx+1}`).addEventListener('click', () => {
                this.controlAllRelays(pairIdx, false);
            });
        }

        // 로그 지우기 버튼
        document.getElementById('clear-log').addEventListener('click', () => {
            this.clearLog();
        });
    }

    toggleRelay(pairIdx, channel, state) {
        if (!this.socket || !this.socket.connected) {
            this.addLog('서버에 연결되지 않음', 'error');
            return;
        }
        this.addLog(`릴레이 ${pairIdx+1}번 쌍 CH${channel} ${state ? 'ON' : 'OFF'} 요청`, 'info');
        this.socket.emit('relay_control', {
            odroidIndex: pairIdx,
            channel: channel,
            state: state
        });
        this.updateRelayButton(pairIdx, channel, state);
    }

    controlAllRelays(pairIdx, state) {
        this.addLog(`릴레이 ${pairIdx+1}번 쌍 전체 ${state ? 'ON' : 'OFF'} 요청`, 'info');
        for (let ch = 1; ch <= RELAYS_PER_PAIR; ch++) {
            this.toggleRelay(pairIdx, ch, state);
        }
    }

    updateRelayButton(channel, state) {
        const btn = document.getElementById(`relay-${channel}`);
        const statusSpan = btn.querySelector('.relay-status');
        
        btn.className = `relay-btn ${state ? 'on' : 'off'}`;
        statusSpan.textContent = state ? 'ON' : 'OFF';
        
        this.relayState[`ch${channel}`] = state;
    }

    updateRelayButton(pairIdx, channel, state) {
        const btn = document.getElementById(`relay-${pairIdx+1}-${channel}`);
        if (!btn) return; // 버튼이 없으면 함수 종료
        const statusSpan = btn.querySelector('.relay-status');
        btn.className = `relay-btn ${state ? 'on' : 'off'}`;
        statusSpan.textContent = state ? 'ON' : 'OFF';
        relayStates[pairIdx][channel-1] = state;
    }

    updateRelayUI() {
        for (let i = 1; i <= 4; i++) {
            const state = this.relayState[`ch${i}`];
            this.updateRelayButton(i, state);
        }

        for (let pairIdx = 0; pairIdx < RELAY_PAIR_COUNT; pairIdx++) {
            for (let ch = 1; ch <= RELAYS_PER_PAIR; ch++) {
                const btn = document.getElementById(`relay-${pairIdx+1}-${ch}`);
                const statusSpan = btn.querySelector('.relay-status');
                if (relayStates[pairIdx][ch-1]) {
                    btn.classList.add('on');
                    btn.classList.remove('off');
                    statusSpan.textContent = 'ON';
                } else {
                    btn.classList.add('off');
                    btn.classList.remove('on');
                    statusSpan.textContent = 'OFF';
                }
            }
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

    enablePair(pairIdx, enabled) {
        for (let ch = 1; ch <= RELAYS_PER_PAIR; ch++) {
            document.getElementById(`relay-${pairIdx+1}-${ch}`).disabled = !enabled;
        }
        document.getElementById(`all-on-${pairIdx+1}`).disabled = !enabled;
        document.getElementById(`all-off-${pairIdx+1}`).disabled = !enabled;
    }
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', () => {
    const relayController = new RelayController();
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
                const currentState = relayStates[0][channel-1]; // 첫 번째 쌍
                window.relayController.toggleRelay(0, channel, !currentState); // ← 수정!
                break;
            case 'a':
                e.preventDefault();
                for (let pairIdx = 0; pairIdx < RELAY_PAIR_COUNT; pairIdx++) {
                    window.relayController.controlAllRelays(pairIdx, true);
                }
                break;
            case 'd':
                e.preventDefault();
                for (let pairIdx = 0; pairIdx < RELAY_PAIR_COUNT; pairIdx++) {
                    window.relayController.controlAllRelays(pairIdx, false);
                }
                break;
        }
    }
});