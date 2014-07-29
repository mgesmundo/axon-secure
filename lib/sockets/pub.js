
/**
 * Module dependencies.
 */

var Socket = require('./sock');
var util = require('util');

/**
 * Expose `PubSocket`.
 */

module.exports = PubSocket;

/**
 * Initialize a new `PubSocket`.
 *
 * @api private
 */

function PubSocket() {
  Socket.call(this);
}

/**
 * Inherits from `Socket.prototype`.
 */
util.inherits(PubSocket, Socket);

/**
 * Send `msg` to all established peers.
 *
 * @param {Mixed} msg
 * @api public
 */

PubSocket.prototype.send = function(msg){
  var socks = this.socks;
  var len = socks.length;
  var sock;

  var buf = this.pack(arguments);

  for (var i = 0; i < len; i++) {
    sock = socks[i];
    if (sock.writable) sock.write(buf);
  }

  return this;
};
