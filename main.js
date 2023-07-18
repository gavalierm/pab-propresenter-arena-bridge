#!/usr/bin/env node

//KNX USB WS
//https://github.com/MarkPinches/knx
console.log('===============================');
console.log('   ProPresenter Arena bridge   ');
console.log('===============================');
//
require('console')
const path = require("path")
const os = require('os')
const fs = require('fs')
//
let defaultConfigFileName = 'env_default.json'
var configFilePath = 'env.json';
var config = {}
var global_connection_timer;
var request = require('request');
// Connection
var arena_path_by_id = "/composition/clips/by-id";
var arena_tagged_clips = [];
var authenticated = false;
var WebSocketClient = require('websocket').client;
var client = new WebSocketClient();

function readConfiguration() {
    const configFileContents = fs.readFileSync(configFilePath, 'utf8')
    const config = JSON.parse(configFileContents)
    return config
}

function saveConfiguration(config) {
    fs.writeFileSync(configFilePath, JSON.stringify(config), { encoding: "utf8" });
}

function findConfigurationFile() {
    const tryPath = (pathToTry) => {
        let tryFilePath = path.join(pathToTry, defaultConfigFileName)
        // Check if file exists and is RW
        if (fs.existsSync(tryFilePath)) {
            try {
                fs.accessSync(tryFilePath, fs.constants.R_OK | fs.constants.W_OK)
                return tryFilePath
            } catch (e) {
                // Did not work, so try next
            }
        }
        // Check if directory exists and is RW (so file can be created)
        if (fs.existsSync(pathToTry)) {
            try {
                fs.accessSync(pathToTry, fs.constants.R_OK | fs.constants.W_OK)
                return pathToTry
            } catch (e) {
                // Did not work, so try next
            }
        }
        return false
    }
    let pathsToTry = [
        './',
        // @TODO Add more somewhen in the future, if necessary
    ]
    if (process.platform === 'linux') {
        pathsToTry.push(path.join(os.homedir(), ''))
    }
    if (process.platform === 'darwin') {
        pathsToTry.push(path.join(os.homedir(), 'Library/Preferences'))
    }
    if (process.platform === 'win32' || process.platform === 'win64') {
        pathsToTry.push(path.join(os.homedir(), 'AppData/Roaming'))
    }
    for (const pathToTry of pathsToTry) {
        const r = tryPath(pathToTry)
        if (r) {
            if (fs.lstatSync(r).isDirectory()) {
                return path.join(r, defaultConfigFileName)
            }
            return r
        }
    }
    throw Error('Could not find a writable configuration location.')
}
//
function run() {
    // Find config file to use
    //console.log("runn");
    if (!configFilePath) {
        configFilePath = findConfigurationFile()
        //console.log("Hmmm");
        if (!fs.existsSync(configFilePath)) {
            //console.log("jop")
            fs.cpSync(path.join(__dirname, defaultConfigFileName), configFilePath)
        }
    }
    // Save configuration method
    config = readConfiguration(configFilePath)
    console.info('Config: ', config);
    //basic requests
    client.on('connectFailed', function(error) {
        console.log('ProPresenter: Connection failed ', error.toString());
        retryConnection();
    });
    client.on('connect', function(connection) {
        pp_connected = true;
        console.log('ProPresenter: Connected');
        console.log('ProPresenter: Sending auth');
        console.log("Arena: Downloading clips id with tag", config.arena.clip_name_tag);
        getTaggedClips();
        if (!authenticated) {
            // Send authentication data
            connection.send('{"acn":"ath","ptl":610,"pwd":"' + config.propresenter.pass + '"}');
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
                    if (arena_tagged_clips.length == 0) {
                        console.log("Arena: No clips with tag", config.arena.clip_name_tag);
                        getTaggedClips();
                        return;
                    }
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
                    var clip_id = 0;
                    for (var i = 0; i < arena_tagged_clips.length; i++) {
                        clip_id = arena_tagged_clips[i];
                        var target_url = 'http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_by_id + '/' + clip_id;
                        //console.log("SENDING TEXT TO TARGET", clip_id, target_url);
                        request({ url: target_url, method: 'PUT', json: snd_obj }, function(error, response, body) {
                            //request({ url: 'http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path, method: 'PUT', json: snd_obj }, function(error, response, body) {
                            //console.log(error, response, body);
                            //console.log(response.statusCode);
                            if (error) {
                                console.log("Arena: Connection error", error);
                                arena_tagged_clips = [];
                                return;
                            }
                            if (response.statusCode == 204) {
                                console.log(response.statusCode, "Arena: Upload OK", arena_path_by_id, clip_id);
                            }
                        });
                    }
                } else {
                    console.log("ProPresenter: Unknown ACN", data);
                }
            }
        });
    });
    //
    connect();
    //
}

function getTaggedClips(tag = "#pab-target") {
    console.log("getTaggedClips");
    arena_tagged_clips = [];
    request({ url: 'http://' + config.arena.host + ':' + config.arena.port + '/api/v1/composition', method: 'GET' }, function(error, response, body) {
        //console.log(error, response, body);
        //console.log(response.statusCode);
        if (error) {
            console.log("Arena: Connection error", error);
            return;
        }
        if (response.statusCode == 200) {
            body = JSON.parse(body);
            //console.log(response.statusCode, "Arena: Download OK", body);
            if (body.layers === undefined) {
                console.log("No layers");
                return arena_tagged_clips;
            }
            //console.log(body.layers);
            var layers = body.layers;
            var clips;
            for (var i = 0; i < layers.length; i++) {
                clips = layers[i].clips;
                //console.log(clips);
                for (var x = 0; x < clips.length; x++) {
                    //console.log(clips[x]);
                    if (clips[x].name.value.includes(config.arena.clip_name_tag)) {
                        arena_tagged_clips.push(clips[x].id);
                    }
                }
            }
            console.log(arena_tagged_clips);
        }
    });
}

function retryConnection() {
    clearTimeout(global_connection_timer);
    global_connection_timer = setTimeout(function() {
        connect();
    }, 5000);
}

function connect() {
    clearTimeout(global_connection_timer);
    config = readConfiguration(configFilePath)
    client.connect('ws://' + config.propresenter.host + ':' + config.propresenter.port + '/stagedisplay');
}
run();