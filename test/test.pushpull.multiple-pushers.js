
var ss = require('../')
  , should = require('should');

// one puller

var pull = ss.socket('pull');

pull.bind(4000);

// multiple pushers

var pusher1 = ss.socket('push');
var pusher2 = ss.socket('push');
var pusher3 = ss.socket('push');

pusher1.connect(4000);
pusher2.connect(4000);
pusher3.connect(4000);

pusher1.send('hey');
pusher2.send('hey');
pusher3.send('hey');

var msgs = [];

pull.on('message', function(msg){
  var n = msgs.push(msg.toString());
  if (n == 3) {
    msgs.join(' ').should.equal('hey hey hey');
    pusher1.close();
    pusher2.close();
    pusher3.close();
    pull.close();
  }
});
