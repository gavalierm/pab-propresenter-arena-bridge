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
var arena_tagged_clips = {};
var arena_tagged_clips_a = [];
var arena_tagged_clips_b = [];
var arena_tagged_clips_f = [];
var arena_tagged_clips_l = [];
var authenticated = false;
var WebSocketClient = require('websocket').client;
var client = new WebSocketClient();
var turn_ab = false;

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
                    var slideArray = null;
                    var snd_obj = {};
                    var clip_id = 0;
                    var working_clips = [];
                    turn_ab = !turn_ab;
                    //
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
                        //
                        slideArray = slideText.split("\r").reverse();
                        //
                    } else {
                        slideArray = [];
                    }
                    //console.log(slideText);
                    clip_id = 0;
                    var slideText = '';
                    var slideTextSplitted = [];
                    if (turn_ab) {
                        console.log("A turn");
                    } else {
                        console.log("B turn");
                    }
                    //
                    for (var key in arena_tagged_clips) {
                        //console.log("Do: ", key, "at turn", turn_ab);
                        if (key == config.arena.clip_name_tag) {
                            slideText = slideArray.join("\r");
                            slideText = (slideText) ? slideText : '';
                        } else {
                            //index from key
                            var index = key.split('-');
                            slideText = slideArray[parseInt(index[1], 10) - 1];
                            slideText = (slideText) ? slideText : '';
                        }
                        slideTextSplitted = slideText.split(' ');
                        full_obj = { "video": { "sourceparams": { "Text": slideText } } };
                        first_obj = { "video": { "sourceparams": { "Text": slideTextSplitted[0] } } };
                        last_obj = { "video": { "sourceparams": { "Text": slideTextSplitted[slideTextSplitted.length - 1] } } };
                        //console.log("slideText", slideText);
                        for (var i = 0; i < arena_tagged_clips[key].length; i++) {
                            //
                            clip_id = arena_tagged_clips[key][i];
                            if (turn_ab && arena_tagged_clips_b.includes(clip_id)) {
                                //onsole.log("SKIP turn A for", clip_id);
                                continue;
                            } else if (!turn_ab && arena_tagged_clips_a.includes(clip_id)) {
                                //console.log("SKIP turn B for", clip_id);
                                continue;
                            }
                            if (arena_tagged_clips_f.includes(clip_id)) {
                                snd_obj = first_obj;
                            } else if (arena_tagged_clips_l.includes(clip_id)) {
                                snd_obj = last_obj;
                            } else {
                                snd_obj = full_obj;
                            }
                            //console.log(clip_id);
                            var target_url = 'http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_by_id + '/' + clip_id;
                            //console.log("SENDING TEXT TO TARGET", clip_id, target_url);
                            request({ url: target_url, method: 'PUT', json: snd_obj }, function(error, response, body) {
                                //request({ url: 'http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path, method: 'PUT', json: snd_obj }, function(error, response, body) {
                                //console.log(error, response, body);
                                //console.log(response.statusCode);
                                var connect_url = target_url + '/connect';
                                if (error) {
                                    console.log("Arena: Connection error", error);
                                    clearTagged();
                                    return;
                                }
                                if (response.statusCode == 204) {
                                    console.log(response.statusCode, "Arena: Upload OK");
                                    setTimeout(function() {
                                        request({ url: connect_url, method: 'POST', json: true }, function(error, response, body) {
                                            //request({ url: 'http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path, method: 'PUT', json: snd_obj }, function(error, response, body) {
                                            //console.log(error, response, body);
                                            //console.log(response.statusCode);
                                            if (error) {
                                                console.log("Arena: Connection error", error);
                                                clearTagged();
                                                return;
                                            }
                                            if (response.statusCode == 204) {
                                                console.log(response.statusCode, "Arena: Triggered OK");
                                            }
                                        });
                                    }, 50);
                                }
                            });
                        }
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

function clearTagged() {
    arena_tagged_clips = {};
    arena_tagged_clips_a = [];
    arena_tagged_clips_b = [];
    arena_tagged_clips_f = [];
    arena_tagged_clips_l = [];
}

function getTaggedClips(tag = "#pab") {
    console.log("getTaggedClips");
    clearTagged();
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
            let pattern_n = /#pab\-(\d+)/i;
            let pattern_a = /#pab-a/i;
            let pattern_b = /#pab-b/i;
            let pattern_a = /#pab-f/i;
            let pattern_b = /#pab-l/i;
            for (var i = 0; i < layers.length; i++) {
                clips = layers[i].clips;
                //console.log(clips);
                for (var x = 0; x < clips.length; x++) {
                    //console.log(clips[x]);
                    if (clips[x].name.value.includes(config.arena.clip_name_tag)) {
                        let result_n = clips[x].name.value.match(pattern_n);
                        let result_a = clips[x].name.value.match(pattern_a);
                        let result_b = clips[x].name.value.match(pattern_b);
                        let result_f = clips[x].name.value.match(pattern_f);
                        let result_l = clips[x].name.value.match(pattern_l);
                        //console.log("Restul", result_n);
                        if (result_n) {
                            //result_n = parseInt(result_n[0], 10);
                            result_n = result_n[0];
                            if (arena_tagged_clips[result_n] === undefined) {
                                arena_tagged_clips[result_n] = [];
                            }
                            arena_tagged_clips[result_n].push(clips[x].id);
                        } else {
                            if (arena_tagged_clips[config.arena.clip_name_tag] === undefined) {
                                arena_tagged_clips[config.arena.clip_name_tag] = [];
                            }
                            arena_tagged_clips[config.arena.clip_name_tag].push(clips[x].id);
                        }
                        if (result_a) {
                            //result_n = parseInt(result_n[0], 10);
                            //result_n = result_n[0];
                            if (arena_tagged_clips_a === undefined) {
                                arena_tagged_clips_a = [];
                            }
                            arena_tagged_clips_a.push(clips[x].id);
                        }
                        if (result_b) {
                            //result_n = parseInt(result_n[0], 10);
                            //result_n = result_n[0];
                            if (arena_tagged_clips_b === undefined) {
                                arena_tagged_clips_b = [];
                            }
                            arena_tagged_clips_b.push(clips[x].id);
                        }
                        if (result_f) {
                            //result_n = parseInt(result_n[0], 10);
                            //result_n = result_n[0];
                            if (arena_tagged_clips_f === undefined) {
                                arena_tagged_clips_f = [];
                            }
                            arena_tagged_clips_f.push(clips[x].id);
                        }
                        if (result_l) {
                            //result_n = parseInt(result_n[0], 10);
                            //result_n = result_n[0];
                            if (arena_tagged_clips_l === undefined) {
                                arena_tagged_clips_l = [];
                            }
                            arena_tagged_clips_l.push(clips[x].id);
                        }
                    }
                }
            }
            console.log("clips X", arena_tagged_clips);
            console.log("clips A", arena_tagged_clips_a);
            console.log("clips B", arena_tagged_clips_b);
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