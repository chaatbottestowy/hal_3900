const express = require('express');
const path = require('path');
const bot = require('./bot');
const hal = new bot()

module.exports = function(app)
{
    // Returns any static files in frontend `/dist`
    app.use(express.static(path.join(__dirname, '../frontend/dist')))

    // index
    app.get('/', (_, res) =>
      res.sendFile(path.join(__dirname, 'dist', 'index.html'))
    );

    // Web socket connection
    app.ws('/talk', function(ws, req) {
      ws.on('message', function(msg) {
        msg = JSON.parse(msg)
        if (msg.type === 'message') {
          ws.send(JSON.stringify({
            type: 'message',
            error: false,
            text: hal.query(msg.text)
          }))
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            error: true,
            msg: 'Unknown Message Type'
          }))
        }
      });
    });

    // 404 catch all
    app.get('*', (_, res) =>
      res.sendFile(path.join(__dirname, 'public', '404.html'))
    );    
}