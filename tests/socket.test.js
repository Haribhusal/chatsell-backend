const http = require('http');
const express = require('express');
const { init, getIO } = require('../src/utils/socket');
const Client = require('socket.io-client');

describe('Socket.io Notifications', () => {
  let io, server, socket;
  let port;

  beforeAll((done) => {
    const app = express();
    server = http.createServer(app);
    io = init(server);
    server.listen(() => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close();
    done();
  });

  beforeEach((done) => {
    socket = new Client(`http://localhost:${port}`);
    socket.on('connect', done);
  });

  afterEach(() => {
    socket.disconnect();
  });

  it('should receive new_order notification after joining business room', (done) => {
    const businessId = '65e6d6e6e6e6e6e6e6e6e6e6';
    const orderData = { _id: 'order123', totalAmount: 1000 };

    socket.emit('join', businessId);

    // Wait a bit to ensure join is processed
    setTimeout(() => {
      socket.on('new_order', (data) => {
        expect(data._id).toBe('order123');
        expect(data.totalAmount).toBe(1000);
        done();
      });

      // Manually trigger emission through the utility
      const ioServer = getIO();
      ioServer.to(businessId).emit('new_order', orderData);
    }, 100);
  });
});
