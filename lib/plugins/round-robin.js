
/**
 * Deps.
 */

var roundrobin = require('roundrobin');
var _ = require('underscore');
var slice = Array.prototype.slice;

/**
 * Round-robin plugin.
 *
 * Provides a `send` method which will
 * write the `msg` to all connected peers.
 *
 * @param {Object} options
 * @api private
 */

module.exports = function(options){
  options = options || {};
  var fallback = options.fallback || function(){};

  var rr = [];
  var n = 0;

  return function(sock){

    /**
     * Bind callback to `sock`.
     */

    fallback = fallback.bind(sock);

    /**
     * Sends `msg` to all connected peers round-robin.
     */

    // TODO: introduce a central queue manager.
    // Every pusher must put a message into the queue with
    // a ttl; when a puller read the queue set every
    // message as read and cannot read it twice.
    sock.send = function(){
      var socks = this.socks;
      var msg = slice.call(arguments);
      var _sock;

      switch (socks.length) {
        case 0:
          fallback(msg);
          break;
        case 1:
          _sock = socks[0];
          if (_sock && _sock.writable) {
            _sock.write(this.pack(msg));
          } else {
            fallback(msg);
          }
          break;
        default :
          if (_.isEmpty(rr) || n !== socks.length) {
            n = socks.length;
            rr = _.map(_.flatten(roundrobin(n)), function (idx) {
              return idx - 1;
            });
          }
          var i;
          for (i = 0; i < n; i++) {
            _sock = socks[rr.shift()];
            // the single pusher as server can manage
            // many pullers and cannot queue the message.
            if (_sock && _sock.writable) {
              _sock.write(this.pack(msg));
            }
          }
          break;
      }
    };
  };
};
