
/**
 * Module dependencies.
 */

var Emitter = require('events').EventEmitter;
var Configurable = require('configurable');
var debug = require('debug')('axon:sock');
var Message = require('amp-message');
var Parser = require('amp').Stream;
var url = require('url');
var net = require('net');
var util = require('util');
var security = require('../plugins/security');

/**
 * Errors to ignore.
 */

var ignore = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EPIPE',
  'ENOENT'
];

/**
 * Expose `Socket`.
 */

module.exports = Socket;

/**
 * Initialize a new `Socket`.
 *
 * A "Socket" encapsulates the ability of being
 * the "client" or the "server" depending on
 * whether `connect()` or `bind()` was called.
 *
 * @api private
 */

function Socket() {
  this.server = null;
  this.running = 0;
  this.socks = [];
  this.set('hwm', Infinity);
  this.set('identity', String(process.pid));
  this.set('retry timeout', 100);
  this.set('retry max timeout', 5000);
  this.set('secure', false);
  this.set('cipher', 'aes256');
  this.set('secret', 'secret');
}

/**
 * Inherit from `Emitter.prototype`.
 */
util.inherits(Socket, Emitter);

/**
 * Make it configurable `.set()` etc.
 */

Configurable(Socket.prototype);

// redefine the default `set` method to reloading security plugin when some of its
// configs is updated
Socket.prototype.set = function(name, val){
  var observe = [
    'secure',
    'cipher',
    'secret'
  ];
  if (1 == arguments.length) {
    var key;
    for (key in name) {
      if (name.hasOwnProperty(key)) {
        this.set(key, name[key]);
      }
    }
  } else {
    this.settings[name] = val;
  }
  if (~observe.indexOf(name)) {
    this.use(security(this));
  }

  return this;
};


/**
 * Use the given `plugin`.
 *
 * @param {Function} plugin
 * @api private
 */

Socket.prototype.use = function(plugin){
  plugin(this);
  return this;
};

/**
 * Creates a new `Message` and write the `args`.
 *
 * @param {Array} args
 * @return {Buffer}
 * @api private
 */

Socket.prototype.pack = function(args){
  var msg = new Message(args);
  return msg.toBuffer();
};

Socket.prototype.unpack = function(buf){
  var msg = new Message(buf);
  return msg.args;
};

/**
 * Close all open underlying sockets.
 *
 * @param {Function} [fn]
 * @api private
 */

Socket.prototype.closeSockets = function(fn){
  debug('%s closing %d connections', this.type, this.socks.length);
  var n = 0;
  var max = this.socks.length;
  if (max > 0) {
    this.socks.forEach(function(sock){
      sock.destroy();
      n++;
      (n === max) && fn && fn();
    });
  } else {
    fn && fn();
  }
};

/**
 * Close the socket.
 *
 * Delegates to the server or clients
 * based on the socket `type`.
 *
 * @param {Function} [fn]
 * @api public
 */

Socket.prototype.close = function(fn){
  debug('%s closing', this.type);
  this.closing = true;
  this.closeSockets(function () {
    if (this.server) {
      this.closeServer(fn);
    } else {
      fn && fn();
    }
  }.bind(this));
};

/**
 * Close the server.
 *
 * @param {Function} [fn]
 * @api public
 */

Socket.prototype.closeServer = function(fn){
  debug('%s closing', this.type);
  if (this.server) {
    this.server.on('close', this.emit.bind(this, 'close'));
    this.server.close(fn);
  } else {
    this.emit.bind(this, 'close');
    fn && fn();
  }
};

/**
 * Return the server address.
 *
 * @return {Object}
 * @api public
 */

Socket.prototype.address = function(){
  var addr;
  if (this.server) {
    addr = this.server.address();
    addr.string = 'tcp://' + addr.address + ':' + addr.port;
  }
  return addr;
};

/**
 * Remove `sock`.
 *
 * @param {Socket} sock
 * @api private
 */

Socket.prototype.removeSocket = function(sock){
  var i = this.socks.indexOf(sock);
  if (!~i) return;
  debug('%s remove socket %d', this.type, i);
  this.socks.splice(i, 1);
};

/**
 * Add `sock`.
 *
 * @param {Socket} sock
 * @api private
 */

Socket.prototype.addSocket = function(sock){
  var parser = new Parser;
  var i = this.socks.push(sock) - 1;
  debug('%s add socket %d', this.type, i);
  sock.pipe(parser);
  parser.on('data', this.onmessage(sock));
};

/**
 * Handle `sock` errors.
 *
 * Emits:
 *
 *  - `error` (err) when the error is not ignored
 *  - `ignored error` (err) when the error is ignored
 *  - `socket error` (err) regardless of ignoring
 *
 * @param {Socket} sock
 * @api private
 */

Socket.prototype.handleErrors = function(sock){
  var self = this;
  sock.on('error', function(err){
    debug('%s error %s', self.type, err.code || err.message);
    self.emit('socket error', err);
    self.removeSocket(sock);
    if (!~ignore.indexOf(err.code)) {
      self.emit('error', err);
    } else {
      debug('%s ignored %s', self.type, err.code);
      self.emit('ignored error', err);
    }
  });
};

/**
 * Handles framed messages emitted from the parser, by
 * default it will go ahead and emit the "message" events on
 * the socket. However, if the "higher level" socket needs
 * to hook into the messages before they are emitted, it
 * should override this method and take care of everything
 * it self, including emitted the "message" event.
 *
 * @param {net.Socket} sock
 * @return {Function} closure(msg, mulitpart)
 * @api private
 */

Socket.prototype.onmessage = function(sock){
  var self = this;
  return function(buf){
    var msg = self.unpack(buf);
    self.emit.apply(self, ['message'].concat(msg));
  };
};

function onclose(sock, port, host) {
  var self = this;
  var max = self.get('retry max timeout');
  var addr = host + ':' + port;
  return function () {
    self.connected = false;
    if (~self.socks.indexOf(sock)) {
      debug('%s disconnect %s', self.type, addr);
      // client only
      self.emit('disconnect', sock);
    }
    self.removeSocket(sock);
    if (self.closing) {
      self.emit('close');
    } else {
      var retry = self.retry || self.get('retry timeout');
      debug('%s retry connection in %sms', self.type, retry);
      setTimeout(function(){
        debug('%s attempting reconnect', self.type);
        self.emit('reconnect attempt');
        sock.destroy();
        self.connect(port, host);
        self.retry = Math.round(Math.min(max, retry * 1.5));
      }, retry);
    }
  };
}

function onconnect(sock, cb) {
  var self = this;
  return function () {
    debug('%s connect', self.type);
    self.connected = true;
    self.addSocket(sock);
    self.retry = self.get('retry timeout');
    self.emit('connect');
    cb && cb();
  };
}

function onconnection(sock){
  var self = this;
  var addr = sock.remoteAddress + ':' + sock.remotePort;
  debug('%s accept %s', self.type, addr);
  this.addSocket(sock);
  this.handleErrors(sock);
  this.emit('connect', sock);
  sock.on('close', function(){
    debug('%s disconnect %s', self.type, addr);
    // server only
    self.emit('disconnect', sock);
    self.removeSocket(sock);
  });
}

/**
 * Connect to `port` at `host` and invoke `fn()`.
 *
 * Defaults `host` to localhost.
 *
 * @param {Number|String} port
 * @param {String} host
 * @param {Function} fn
 * @return {Socket}
 * @api public
 */

Socket.prototype.connect = function(port, host, fn){
  var self = this;
  if ('server' == this.type) throw new Error('cannot connect() after bind()');
  if ('function' == typeof host) {
    fn = host;
    host = undefined;
  }

  if ('string' == typeof port) {
    port = url.parse(port);
    host = port.hostname || '0.0.0.0';
    port = parseInt(port.port, 10);
  } else {
    host = host || '0.0.0.0';
  }

  var sock = new net.Socket;
  sock.setNoDelay();
  this.type = 'client';
  this.handleErrors(sock);

  sock.on('close', onclose.call(self, sock, port, host));
  sock.on('connect', onconnect.call(self, sock, fn));

  debug('%s connect attempt %s:%s', self.type, host, port);
  sock.connect(port, host);

  return this;
};

/**
 * Bind to `port` at `host` and invoke `fn()`.
 *
 * Defaults `host` to INADDR_ANY.
 *
 * Emits:
 *
 *  - `connection` when a client connects
 *  - `disconnect` when a client disconnects
 *  - `bind` when bound and listening
 *
 * @param {Number|String} port
 * @param {String} host
 * @param {Function} fn
 * @return {Socket}
 * @api public
 */

Socket.prototype.bind = function(port, host, fn){
  if ('client' == this.type) throw new Error('cannot bind() after connect()');
  if ('function' == typeof host) {
    fn = host;
    host = undefined;
  }
  if ('string' == typeof port) {
    port = url.parse(port);
    host = port.hostname || '0.0.0.0';
    port = parseInt(port.port, 10);
  } else {
    host = host || '0.0.0.0';
  }
  this.type = 'server';
  this.closing = false;
  this.server = net.createServer(onconnection.bind(this));

  debug('%s bind %s:%s', this.type, host, port);
  this.server.on('listening', function () {
    this.running++;
    if (this.running > 1) {
      throw new Error('cannot bind() multiple times');
    }
    this.emit('bind');
  }.bind(this));
  this.server.on('close', function () {
    this.running--;
  }.bind(this));

  this.server.listen(port, host, fn);
  return this;
};
