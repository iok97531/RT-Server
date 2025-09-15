module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  
  socket: {
    cors: {
      origin: true, // 요청 출처를 동적으로 허용
      methods: ["GET", "POST"],
      credentials: true // 인증 정보(쿠키) 허용
    },
    pingTimeout: 60000,
    pingInterval: 25000
  },
  
  relay: {
    channels: 4,
    defaultState: 'OFF'
  },
  
  logging: {
    level: 'info',
    timestamp: true
  }
};