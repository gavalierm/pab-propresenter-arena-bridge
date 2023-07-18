#!/usr/bin/env node

//basic requests
var request = require('request');
// Connection
var global_connection_timer;
var pp_host = "localhost";
var pp_port = "1024";
var pp_pass = "stage";
var arena_host = "localhost";
var arena_port = "8090";
var arena_path = "/composition/layers/1/clips/1";
var authenticated = false;
var WebSocketClient = require('websocket').client;
var client = new WebSocketClient();
client.on('connectFailed', function(error) {
    console.log('ProPresenter: Connection failed ', error.toString());
    retryConnection();
});
client.on('connect', function(connection) {
    pp_connected = true;
    console.log('ProPresenter: Connected');
    console.log('ProPresenter: Sending auth');
    if (!authenticated) {
        // Send authentication data
        connection.send('{"acn":"ath","ptl":610,"pwd":"' + pp_pass + '"}');
    }
    connection.on('error', function(error) {
        console.log("ProPresenter: Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('ProPresenter: Connection Closed');
        retryConnection();
    });
    connection.on('message', function(message) {
        //console.log(message);
        if (message.type === 'utf8') {
            //console.log("Received: '" + message.utf8Data + "'");
            var data = JSON.parse(message.utf8Data);
            if (data.acn == "sys") {
                //console.log(data);
            } else if (data.acn == "ath") {
                console.log(data);
            } else if (data.acn == "fv") {
                //console.log("message", data);
                if (data.ary === undefined) {
                    console.log("ProPresenter: undefined data");
                    return;
                }
                var content = data.ary;
                //console.log(content[0]);
                var slideText = null;
                var snd_obj = {};
                for (var i = 0; i < content.length; i++) {
                    //console.log(content[i]);
                    if (content[i].acn == "cs") {
                        //console.log("ACN CS", content[i].txt);
                        slideText = content[i].txt + "";
                    }
                }
                if (slideText != null) {
                    //
                    slideText = slideText.trim();
                    //
                    slideText = slideText.replace(/^\x82+|\x82+$/gm, '');
                    //
                    slideText = slideText.replace(/^\r+|\r+$/gm, '');
                    //add br
                    slideText = slideText.replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n");
                    //add box
                    //slideText = slideText.replace(/\r/g, '</div><div class="box">');
                    //
                    //slideText = `<div class="box">${slideText}</div>`;
                    //reverse order of boxes
                    slideText = slideText.split("\r").reverse().join("\r");
                    //
                } else {
                    slideText = "";
                }
                console.log(slideText);
                snd_obj = { "video": { "sourceparams": { "Text": slideText } } };
                request({ url: 'http://' + arena_host + ':' + arena_port + '/api/v1' + arena_path, method: 'PUT', json: snd_obj }, function(error, response, body) {
                    //console.log(error, response, body);
                    //console.log(response.statusCode);
                    if (error) {
                        console.log("Arena: Connection error", error);
                        return;
                    }
                    if (response.statusCode == 204) {
                        console.log(response.statusCode, "Arena: Upload OK", arena_path);
                    }
                });
            } else {
                console.log("ProPresenter: Unknown ACN", data);
            }
        }
    });
});

function retryConnection() {
    clearTimeout(global_connection_timer);
    global_connection_timer = setTimeout(function() {
        connect();
    }, 5000);
}

function connect() {
    clearTimeout(global_connection_timer);
    client.connect('ws://' + pp_host + ':' + pp_port + '/stagedisplay');
}
connect();