const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const OrderingApp = require('./OrderingApp');

const port = 3000;
const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const orderingApp = new OrderingApp();

io.on('connection', (socket) => {
  console.log('a user connected');

  orderingApp.joinSession(socket);

  socket.on('requestRide', (order) => {
    console.log('Requesting order', order);
    orderingApp.requestRide(order);
  });

  socket.on('acceptOrder', (order) => {
    console.log('Accepting order', order);
    orderingApp.acceptOrder(order);
  });

  socket.on('rejectOrder', (order) => {
    orderingApp.rejectOrder(order);
  });

  socket.on('finishRide', (order) => {
    console.log('Finishing ride', order);
    orderingApp.finishRide(order);
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/sender', (req, res) => {
  res.sendFile(__dirname + '/sender.html');
});

app.get('/driver', (req, res) => {
  res.sendFile(__dirname + '/driver.html');
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
