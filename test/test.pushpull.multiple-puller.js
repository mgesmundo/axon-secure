
var ss = require('../')
  , should = require('should');

// one pusher that handle many pullers

var push = ss.socket('push');

// multiple puller

var puller1 = ss.socket('pull');
var puller2 = ss.socket('pull');
var puller3 = ss.socket('pull');

push.bind(4000);

var clients = 0;

push.on('connect', function () {
  clients++;
  if (clients === 3) {
    push.send('hey');
  }
});
puller1.connect(4000);
puller2.connect(4000);
puller3.connect(4000);

var msgs = [];

function listener(msg) {
  var n = msgs.push(msg.toString());
  if (n == 3) {
    msgs.join(' ').should.equal('hey hey hey');
    puller1.close();
    puller2.close();
    puller3.close();
    push.close();
  }
}

puller1.on('message', listener);
puller2.on('message', listener);
puller3.on('message', listener);
