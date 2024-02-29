const Driver = require('./Driver');
const Sender = require('./Sender');
const Order = require('./Order');

class OrderingApp {
  constructor() {
    this.orders = [];
    this.drivers = [];
    this.senders = [];
    this.socketUserMap = new Map();
  }

  assignSocket({ socket, user }) {
    console.log('Assigning socket to user', user.name);
    this.socketUserMap.set(user.id, socket);
  }

  sendEvent({ socket, data, eventname }) {
    socket.emit(eventname, data);
  }

  joinSession(socket) {
    const { name, id, user_type } = socket.handshake.query;
    if (user_type === 'driver') {
      const driver = this.drivers.find((driver) => driver.id === id);
      if (driver) {
        this.assignSocket({ socket, user: driver });
        // get all orders for the driver
        const orders = this.orders.filter(
          (order) => order.driver?.id === id || order.status === 'pending'
        );
        const driverSocket = this.socketUserMap.get(id);
        driverSocket.emit('orderHistory', { orders });
        return;
      } else {
        this.createUser({ name, socket, user_type });
      }
    } else if (user_type === 'sender') {
      const sender = this.senders.find((sender) => sender.id === id);
      if (sender) {
        this.assignSocket({ socket, user: sender });
        // get all orders for the sender
        const orders = this.orders.filter((order) => order.sender.id === id);
        const userSocket = this.socketUserMap.get(id);
        userSocket.emit('orderHistory', { orders });
        return;
      } else {
        this.createUser({ name, socket, user_type });
      }
    }
  }

  createUser({ name, socket, user_type }) {
    switch (user_type) {
      case 'driver':
        const driver = new Driver(name);
        this.drivers.push(driver);
        this.assignSocket({ socket, user: driver, user_type });
        this.sendEvent({
          socket,
          data: { driver },
          eventname: 'driverCreated',
        });
        console.log('Driver created');
        return driver;
      case 'sender':
        const sender = new Sender(name);
        this.senders.push(sender);
        this.assignSocket({ socket, user: sender, user_type });
        this.sendEvent({
          socket,
          data: { sender },
          eventname: 'senderCreated',
        });
        console.log('Sender created', this.senders);
        return sender;
      default:
        throw new Error('Invalid user type');
    }
  }

  requestRide({ current_location, destination, price, id }) {
    console.log('Requesting ride');
    console.log({ id });

    const sender = this.senders.find((sender) => {
      return sender.id === id;
    });

    const order = new Order({ current_location, destination, price, sender });
    this.orders.push(order);

    // notify drivers
    for (const driver of this.drivers) {
      console.log('Driver in ride', driver.in_ride);
      if (driver.in_ride) continue;
      this.sendEvent({
        socket: this.socketUserMap.get(driver.id),
        data: { order },
        eventname: 'orderRequested',
      });
    }

    // notify the sender of the order placed
    this.sendEvent({
      socket: this.socketUserMap.get(sender.id),
      data: { order },
      eventname: 'orderPlaced',
    });

    // cancel the order if not accepted within 60 seconds
    setTimeout(() => {
      // Find the order
      if (order.status === 'pending') {
        order.updateStatus('cancelled');
        this.sendEvent({
          socket: this.socketUserMap.get(sender.id),
          data: { order },
          eventname: 'orderCancelled',
        });

        for (const driver of this.drivers) {
          this.sendEvent({
            socket: this.socketUserMap.get(driver.id),
            data: { order },
            eventname: 'orderCancelled',
          });
        }
      }
    }, 60000);

    console.log('Order requested', order);
    return order;
  }

  acceptOrder({ id, driver_id }) {
    // get all info about order
    const driver = this.drivers.find((driver) => driver.id === driver_id);
    const order = this.orders.find((order) => order.id === id);
    const sender = this.senders.find((sender) => sender.id === order.sender.id);

    console.log('Accepting order', { order, driver, sender });

    order.assignDriver(driver);
    order.updateStatus('accepted');
    driver.updateStatus();

    const userSocket = this.socketUserMap.get(sender.id);
    userSocket.emit('orderAccepted', { order: order });

    const driverSocket = this.socketUserMap.get(driver.id);
    driverSocket.emit('orderAccepted', { order: order });

    for (const driver of this.drivers) {
      if (driver.id === driver_id) continue;
      this.sendEvent({
        socket: this.socketUserMap.get(driver.id),
        data: { order },
        eventname: 'orderFulfilled',
      });
    }
  }

  rejectOrder(order) {
    const { id, driver_id } = order;
    const driver = this.drivers.find((driver) => driver.id === driver_id);
    const _order = this.orders.find((order) => order.id === id);
    const sender = this.senders.find(
      (sender) => sender.id === _order.sender.id
    );

    console.log('Rejecting order', { _order, driver, sender });

    const driverSocket = this.socketUserMap.get(driver.id);
    driverSocket.emit('orderRejected', { order: _order });
  }

  finishRide(order) {
    const { id, driver_id } = order;
    const driver = this.drivers.find((driver) => driver.id === driver_id);
    const _order = this.orders.find((order) => order.id === id);
    const sender = this.senders.find(
      (sender) => sender.id === _order.sender.id
    );

    console.log('Finishing ride', { _order, driver, sender });

    _order.updateStatus('completed');
    driver.updateStatus();

    console.log('driver details', _order);

    const driverSocket = this.socketUserMap.get(driver.id);
    driverSocket.emit('rideCompleted', { order: _order });

    const senderSocket = this.socketUserMap.get(sender.id);
    senderSocket.emit('rideCompleted', { order: _order });
  }
}

module.exports = OrderingApp;
