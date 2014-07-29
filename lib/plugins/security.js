
/**
 * Deps.
 */

var slice = Array.prototype.slice;
var Message = require('amp-message');
var crypto = require('crypto');
var debug = require('debug')('axon:security');

/**
 * Security plugin.
 *
 * Provides a `pack` method which will
 * write the `msg` encrypetd.
 *
 * @param {Object} socket
 * @api private
 */

module.exports = function(socket){

  /**
   * Encrypt a message
   * @param {Buffer} message The message to encrypt
   * @param {String} [cipher = 'aes256'] The cipher used to encrypt/decrypt the messages
   * @param {String} [secret = 'secret'] The shared secret password use to encrypt all messages
   * @return {Buffer} The encrypted message
   * @ignore
   */
  function encrypt(message, cipher, secret) {
    debug('encrypt message with %s', cipher);
    var _cipher = crypto.createCipher(cipher, secret);
    return Buffer.concat([_cipher.update(message), _cipher.final()]);
  }

  /**
   * Decrypt a message
   * @param {Buffer} message The encrypted message
   * @param {String} [cipher = 'aes256'] The cipher used to encrypt/decrypt the messages
   * @param {String} [secret = 'secret'] The shared secret password use to encrypt all messages
   * @return {Buffer} The decrypted buffer
   * @ignore
   */
  function decrypt(message, cipher, secret) {
    debug('decrypt message with %s', cipher);
    var _decipher = crypto.createDecipher( cipher, secret);
    return Buffer.concat([_decipher.update(message), _decipher.final()]);
  }


  return function(sock){
    if (socket.get('secure')) {
      var cipher = socket.get('cipher');
      var secret = socket.get('secret');

      function warning() {
        var key = 'secret';
        if (socket.get(key) === key) {
          console.warn('PLEASE change default secret password!');
        }
      }

      /**
       * Creates a new encrypted `Message` and write the `args`.
       *
       * @param {Array} args
       * @return {Buffer}
       * @api private
       */

      sock.pack = function (args){
        warning();
        var msg = new Message(args);
        var buf = msg.toBuffer();
        var secure_buf = [encrypt(buf, cipher, secret)];
        var secure_msg = new Message(secure_buf);

        return secure_msg.toBuffer();
      };

      /**
       * Decrypt the message and return the array with all arguments.
       *
       * @param {Buffer} sbuf
       * @return {Array}
       * @api private
       */

      sock.unpack = function (sbuf){
        warning();
        var secure_msg = new Message(sbuf);
        var secure_buf = secure_msg.args[0];
        var buf = decrypt(secure_buf, cipher, secret);
        var msg = new Message(buf);

        return msg.args;
      };
    }
  };
};
