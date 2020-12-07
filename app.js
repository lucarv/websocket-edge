'use strict';

/**
 * web socket server 
 */
const WebSocket = require('ws')
const wss = new WebSocket.Server({
  port: 8080
})
console.log('Alarm Server listening to ws messages on port: ' + wss.options.port)
var clients = [],
  alarmFlag = false;

wss.on('connection', (ws, req) => {

  const ip = req.connection.remoteAddress;
  let cli = {
    ip,
    ws,
    id: ''
  }
  console.log(`client at ${ip} connected`)

  clients.push(cli);
  clients[clients.length - 1].ws.send(JSON.stringify({
    "msg": "you are now connected to the alarm server"
  }));

  ws.on('message', message => {
    let entry = clients.find(el => el.ws === ws)
    let msg = JSON.parse(message);
    console.log(`Received message => ${msg.type} from ${entry.ip}`)

    switch (msg.type) {
      case 'agent login':
        let index = clients.indexOf(entry)
        clients[index].id = msg.agentId;
        break;
      case 'clear alarm':
        if (alarmFlag) {
          console.log('agent has cleared alarm')
          alarmFlag = false
        };
        break;
      case 'ack alarm':
        alarmFlag = true
        break;
      default:
        console.log('not in protocol')
        break;
    }
  });

  ws.on('close', (code) => {
    let entry = clients.find(el => el.ws === ws)
    console.log(`${entry.ip} disconnected`)

    let index = clients.indexOf(entry)
    clients.splice(index, 1)

    if (clients.length == 0) {
      console.log('no more clients connected')
      alarmFlag = false
    } else
      console.log(`client terminated with error code ${code}\n #${clients.length} clients connected`)
  });
});



/**
 * Azure APIs
 */
var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;

Client.fromEnvironment(Transport, function (err, client) {
  if (err) {
    throw err;
  } else {
    client.on('error', function (err) {
      throw err;
    });

    // connect to the Edge instance
    client.open(function (err) {
      if (err) {
        throw err;
      } else {
        console.log('IoT Hub module client initialized');

        // Act on input messages to the module.
        client.on('inputMessage', function (inputName, msg) {
          pipeMessage(client, inputName, msg);
        });


        // Act on Direct Method Call
        client.onMethod('alert', function (request, response) {
          var agentId = request.payload.agentId;
          console.log(`\nreceived a request for alerting ${agentId}`);

          var result = 'ok';
          var entry = null;

          entry = clients.find(el => el.id === agentId);

          if (clients.indexOf(entry) > -1) {
            let timestamp = Date.now()
            entry.ws.send(JSON.stringify({
              "msg": "alarm received",
              timestamp
            }));
          } else {
            result = 'no client with this id'
          }

          response.send(200, {
            result
          }, function (err) {
            if (err) {
              console.error('Unable to send method response: ' + err.toString());
            } else {
              console.log('response to alerting method request back to cloud.');
            }
          });
        });
      }
    });
  }
});

// This function just pipes the messages without any change.
function pipeMessage(client, inputName, msg) {
  client.complete(msg, printResultFor('Receiving message'));

  if (inputName === 'input1') {
    var message = msg.getBytes().toString('utf8');
    if (message) {
      var outputMsg = new Message(message);
      client.sendOutputEvent('output1', outputMsg, printResultFor('Sending received message'));
    }
  }
}

// Helper function to print results in the console
function printResultFor(op) {
  return function printResult(err, res) {
    if (err) {
      console.log(op + ' error: ' + err.toString());
    }
    if (res) {
      console.log(op + ' status: ' + res.constructor.name);
    }
  };
}