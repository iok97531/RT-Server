// server.js
// RT-Server: 웹 클라이언트와 Odroid 간 중계 서버

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const config = require('./config/config');
const {Gpio} = require('onoff');

// Express 앱 및 서버 생성
const app = express();
const server = http.createServer(app);
const io = socketIo(server, config.socket);

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 연결된 클라이언트 관리
const clients = {
  web: new Set(),     // 웹 클라이언트들
  odroid: new Set()   // Odroid 클라이언트들
};

// 릴레이 상태 관리
const relayState = {
  ch1: false,
  ch2: false,
  ch3: false,
  ch4: false
};

// GPIO 핀 설정 (작동 확인된 핀들만)
let relays = {};
try {
  relays = {
    ch1: new Gpio(456, 'out'),  // PIN_7 - 작동 확인됨
    ch2: new Gpio(488, 'out')   // PIN_8 - 작동 확인됨
    // ch3, ch4는 나중에 핀 찾으면 추가
  };
  
  // 초기화: 모든 릴레이 OFF
  Object.values(relays).forEach(relay => {
    relay.writeSync(0);
  });
  
  log('GPIO 초기화 완료 - CH1: GPIO 456, CH2: GPIO 488', 'success');
} catch (error) {
  log(`GPIO 초기화 실패: ${error.message}`, 'error');
  log('GPIO 없이 서버만 실행됩니다', 'warning');
}

// 릴레이 제어 함수 (수정됨)
function controlRelay(channel, state) {
  try {
    const channelKey = `ch${channel}`;
    const relay = relays[channelKey];
    
    if (relay) {
      relay.writeSync(state ? 1 : 0);
      relayState[channelKey] = state;
      log(`릴레이 CH${channel} 제어: ${state ? 'ON 🔴' : 'OFF ⚫'} (GPIO ${channel === 1 ? '456' : '488'})`, 'success');
      return { success: true, channel, state };
    } else {
      log(`릴레이 CH${channel} 사용 불가 (핀 미설정)`, 'warning');
      return { success: false, channel, error: '핀 미설정' };
    }
  } catch (error) {
    log(`릴레이 CH${channel} 제어 실패: ${error.message}`, 'error');
    return { success: false, channel, error: error.message };
  }
}

// 비상 정지 함수 (추가)
function emergencyStop() {
  try {
    Object.keys(relays).forEach(channelKey => {
      const channel = channelKey.replace('ch', '');
      relays[channelKey].writeSync(0);
      relayState[channelKey] = false;
    });
    log('🚨 비상 정지: 모든 릴레이 OFF', 'warning');
    return { success: true };
  } catch (error) {
    log(`비상 정지 실패: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

// 로그 함수
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const levelIcon = {
    info: 'ℹ️',
    error: '❌',
    success: '✅',
    warning: '⚠️'
  };
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${levelIcon[level] || 'ℹ️'} ${message}`);
}

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    server: 'RT-Server',
    status: 'running',
    message: 'Odroid Relay Control Server',
    availableChannels: Object.keys(relays).map(ch => ch.replace('ch', ''))
  });
});

// 상태 확인 API
app.get('/api/status', (req, res) => {
  res.json({
    server: 'RT-Server',
    status: 'running',
    clients: {
      web: clients.web.size,
      odroid: clients.odroid.size
    },
    relayState: relayState,
    availableChannels: Object.keys(relays).map(ch => ch.replace('ch', '')),
    gpioStatus: Object.keys(relays).length > 0 ? 'active' : 'inactive',
    uptime: process.uptime()
  });
});

// 릴레이 제어 API (추가)
app.post('/api/relay/:channel/:action', (req, res) => {
  const channel = parseInt(req.params.channel);
  const action = req.params.action;
  
  if (![1, 2, 3, 4].includes(channel)) {
    return res.status(400).json({ error: '잘못된 채널 번호 (1-4)' });
  }
  
  if (!['on', 'off'].includes(action)) {
    return res.status(400).json({ error: '잘못된 액션 (on/off)' });
  }
  
  const state = action === 'on';
  const result = controlRelay(channel, state);
  
  if (result.success) {
    // 웹 클라이언트들에게 상태 브로드캐스트
    broadcastToWeb('relay_state_update', {
      channel: channel,
      state: state
    });
    
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// Socket.io 연결 처리
io.on('connection', (socket) => {
  log(`새로운 연결: ${socket.id}`);

  // 클라이언트 타입 등록
  socket.on('register', (data) => {
    const { type, name } = data;
    
    if (type === 'web') {
      clients.web.add(socket.id);
      socket.clientType = 'web';
      log(`웹 클라이언트 등록: ${socket.id} (${name || 'Unknown'})`);
      
      // 웹 클라이언트에게 현재 상태 전송
      socket.emit('relay_state', relayState);
      socket.emit('available_channels', Object.keys(relays).map(ch => ch.replace('ch', '')));
      
    } else if (type === 'odroid') {
      clients.odroid.add(socket.id);
      socket.clientType = 'odroid';
      log(`Odroid 클라이언트 등록: ${socket.id} (${name || 'Unknown'})`);
      
      // 모든 웹 클라이언트에게 Odroid 연결 알림
      broadcastToWeb('odroid_connected', { id: socket.id, name });
    }
    
    // 연결 상태를 모든 웹 클라이언트에게 브로드캐스트
    broadcastToWeb('client_count', {
      web: clients.web.size,
      odroid: clients.odroid.size
    });
  });

  // 웹 클라이언트로부터 릴레이 제어 요청
  socket.on('relay_control', (data) => {
    if (socket.clientType === 'web') {
      const { channel, state } = data;
      log(`릴레이 제어 요청 (웹): CH${channel} -> ${state ? 'ON' : 'OFF'}`);
      
      const result = controlRelay(channel, state);
      
      if (result.success) {
        // 모든 웹 클라이언트에게 상태 업데이트 브로드캐스트
        broadcastToWeb('relay_state_update', { channel, state });
        
        // Odroid 클라이언트들에게도 전달 (나중을 위해)
        broadcastToOdroid('relay_control', { channel, state });
      }
      
      // 요청한 클라이언트에게 결과 전송
      socket.emit('relay_control_result', result);
    }
  });

  // 비상 정지 요청 (추가)
  socket.on('emergency_stop', () => {
    log(`비상 정지 요청: ${socket.id}`);
    const result = emergencyStop();
    
    if (result.success) {
      // 모든 클라이언트에게 브로드캐스트
      io.emit('emergency_stop_executed', {
        timestamp: new Date().toISOString(),
        executedBy: socket.id
      });
      
      // 상태 업데이트
      broadcastToWeb('relay_state', relayState);
    }
    
    socket.emit('emergency_stop_result', result);
  });

  // Odroid로부터 릴레이 상태 업데이트
  socket.on('relay_state_update', (data) => {
    if (socket.clientType === 'odroid') {
      const { channel, state } = data;
      relayState[`ch${channel}`] = state;
      log(`릴레이 상태 업데이트 (Odroid): CH${channel} -> ${state ? 'ON' : 'OFF'}`);
      
      // 모든 웹 클라이언트에게 상태 업데이트 브로드캐스트
      broadcastToWeb('relay_state_update', { channel, state });
    }
  });

  // 연결 해제 처리
  socket.on('disconnect', () => {
    log(`연결 해제: ${socket.id}`);
    
    if (socket.clientType === 'web') {
      clients.web.delete(socket.id);
    } else if (socket.clientType === 'odroid') {
      clients.odroid.delete(socket.id);
      // 모든 웹 클라이언트에게 Odroid 연결 해제 알림
      broadcastToWeb('odroid_disconnected', { id: socket.id });
    }
    
    // 연결 상태를 모든 웹 클라이언트에게 브로드캐스트
    broadcastToWeb('client_count', {
      web: clients.web.size,
      odroid: clients.odroid.size
    });
  });
});

// 웹 클라이언트들에게 브로드캐스트
function broadcastToWeb(event, data) {
  clients.web.forEach(clientId => {
    io.to(clientId).emit(event, data);
  });
}

// Odroid 클라이언트들에게 브로드캐스트
function broadcastToOdroid(event, data) {
  clients.odroid.forEach(clientId => {
    io.to(clientId).emit(event, data);
  });
}

// 서버 시작
server.listen(config.server.port, config.server.host, () => {
  log(`RT-Server 시작됨: http://${config.server.host}:${config.server.port}`);
  log(`웹 클라이언트 접속 URL: http://localhost:${config.server.port}`);
  
  // 사용 가능한 채널 표시
  const availableChannels = Object.keys(relays).map(ch => ch.replace('ch', ''));
  if (availableChannels.length > 0) {
    log(`사용 가능한 릴레이 채널: ${availableChannels.join(', ')}`);
    log('CH1: GPIO 456 (PIN_7), CH2: GPIO 488 (PIN_8)');
  } else {
    log('⚠️  GPIO 사용 불가 (권한 문제 또는 하드웨어 미연결)');
  }
});

// 종료 시 정리
process.on('SIGINT', () => {
  log('서버 종료 중...');
  
  try {
    // 모든 릴레이 OFF
    Object.values(relays).forEach(relay => {
      relay.writeSync(0);
    });
    log('모든 릴레이 OFF 완료');
    
    // GPIO 정리
    Object.values(relays).forEach(relay => {
      relay.unexport();
    });
    log('GPIO 정리 완료');
  } catch (error) {
    log(`정리 중 오류: ${error.message}`, 'error');
  }
  
  server.close(() => {
    log('서버 종료됨');
    process.exit(0);
  });
});

// 예상치 못한 오류 처리 (추가)
process.on('uncaughtException', (error) => {
  log(`예상치 못한 오류: ${error.message}`, 'error');
  
  // 안전하게 릴레이 OFF
  try {
    Object.values(relays).forEach(relay => {
      relay.writeSync(0);
      relay.unexport();
    });
  } catch (e) {
    // 무시
  }
  
  process.exit(1);
});