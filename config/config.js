module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  
  socket: {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
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