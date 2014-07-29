
/**
 * Module dependencies.
 */

var debug = require('debug')('axon:queue');

/**
 * Queue plugin.
 *
 * Provides an `.enqueue()` method to the `sock`. Messages
 * passed to `enqueue` will be buffered until the next
 * `connect` event is emitted.
 *
 * Emits:
 *
 *  - `drop` (msg) when a message is dropped
 *  - `flush` (msgs) when the queue is flushed
 *
 * @api private
 */

module.exports = function(){
  return function(sock){

    /**
     * Message buffer.
     */

    sock.queue = [];

    /**
     * Flush `buf` on `connect`.
     */

    sock.on('connect', function(){
      var prev = sock.queue;
      var len = prev.length;
      sock.queue = [];
      debug('%s flush %d messages', sock.type, len);

      for (var i = 0; i < len; ++i) {
        this.send.apply(this, prev[i]);
      }

      sock.emit('flush', prev);
    });

    /**
     * Pushes `msg` into `buf`.
     */

    sock.enqueue = function(msg){
      var hwm = sock.get('hwm');
      if (sock.queue.length >= hwm) {
        drop(msg);
      } else {
        sock.queue.push(msg);
      }
    };

    /**
     * Drop the given `msg`.
     */

    function drop(msg) {
      debug('%s drop', sock.type);
      sock.emit('drop', msg);
    }
  };
};
