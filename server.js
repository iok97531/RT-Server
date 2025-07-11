// server.js
// RT-Server: 웹 클라이언트와 Odroid 간 중계 서버

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');

// Express 앱 및 서버 생성
const app = express();
const server = http.createServer(app);
const io = socketIo(server, config.socket);

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// 로그 함수
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    uptime: process.uptime()
  });
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
      log(`릴레이 제어 요청: CH${channel} -> ${state ? 'ON' : 'OFF'}`);
      
      // Odroid 클라이언트들에게 릴레이 제어 신호 전송
      broadcastToOdroid('relay_control', { channel, state });
    }
  });

  // Odroid로부터 릴레이 상태 업데이트
  socket.on('relay_state_update', (data) => {
    if (socket.clientType === 'odroid') {
      const { channel, state } = data;
      relayState[`ch${channel}`] = state;
      log(`릴레이 상태 업데이트: CH${channel} -> ${state ? 'ON' : 'OFF'}`);
      
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

// 아무거나 하는 함수
function abcdefg() {
  
  console.log('랜덤 숫자: ', Math.random())
}

// 서버 시작 (다른거 하는거)
server.listen(config.server.port, config.server.host, () => {
  log(`RT-Server 시작됨: http://${config.server.host}:${config.server.port}`);
  log(`웹 클라이언트 접속 URL: http://localhost:${config.server.port}`);
});

// 종료 시 정리 (다른거 하는거 추가)

process.on('SIGINT', () => {
  log('서버 종료 중...');
  server.close(() => {
    log('서버 종료됨');
    process.exit(0);
  });
});

// ByeongGuk "Hello World"