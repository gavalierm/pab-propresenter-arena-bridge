#!/usr/bin/env node

console.log('===============================');
console.log('   ProPresenter Arena bridge   ');
console.log('===============================');

console.log('\nUsage:\n');
console.log('Enable HTTP Api in Resolume Arena');
console.log('Enable Remote Conrol "Stage" in ProPresenter');
console.log('Setup config.json file according to the credentials in Arena and Propresenter');
console.log('Add "#pab" to the clip name in Resolume Arena which cointains "Text Block" source');
console.log('')
console.log('\nExample modificators:\n');
console.log('-uc : UPPERCASE');
console.log('-lc : lovercase');
console.log('-cp : Caps Each Word');
console.log('')
console.log('\nExample manipulators:\n');
console.log('-fw : First word only');
console.log('-lw : Last word only');
console.log('-re : Replace ENTER char to SPACE');
console.log('-td : Trim dot "."');
console.log('-tc : Trim comma ","');
console.log('')
console.log('\nExample block:\n');
console.log('-1,2..n : "1,2,.." means Slide first or second or nth text block only');
console.log('')
console.log('\nExample triggers:\nTriggers for "Zig-Zag" triggering.\n');
console.log('-a : "a" means trigger only on odd');
console.log('-b : "b" means trigger only on even');
console.log('')
console.log('Tags can be combined (order is not relevant):\n')
console.log('#pab-a-uc-fw')
console.log('#pab-fw-uc-a')
console.log('#pab-uc-a-fw')
console.log('\nAll is the same.\n')
console.log('===============================\n');

//
//require('console')
//import os from 'os'
import fs from 'fs';
import fetch from 'node-fetch'
import WebSocket from 'ws';
import Gun from "gun";
//import { setgid } from 'process';
//import { clear } from 'console';
//
let config
let config_default
//
const arena_path_by_id = "/composition/clips/by-id";
//
//var config = {}
//
var arena_state = 'disconnected';
//
var arena_check_timeout;
var propresenter_check_timeout;
//
var arena = []
//cycle for odd/event
var cycle = false;

// read file everytime if needed to change conf without restart the app
function readConfiguration() {
    if (!config_default) {
        try {
            config_default = JSON.parse(fs.readFileSync('./config_default.json'))
            config = config_default
            //console.log("CONFIG DEFAULT", config)
        } catch (e) {
            console.log("No config default")
            return undefined
        }
    }

    try {
        config = JSON.parse(fs.readFileSync('./config.json'))
        console.log("CONFIG", config)
        return config
    } catch (e) {
        if (config_default) {
            config = config_default
            //console.log("CONFIG FROM DEFAULT", config)
            return config
        }
        console.log("No config")
        return undefined
    }
}

function propresenter_reconnect() {
    clearTimeout(propresenter_check_timeout);
    propresenter_check_timeout = setTimeout(function () {
        return propresenter_connect();
    }, 10000);
}

function propresenter_connect() {
    //refresh config
    config = readConfiguration()
    console.log('ws://' + config.propresenter.host + ':' + config.propresenter.port + '/stagedisplay');
    const ws = new WebSocket('ws://' + config.propresenter.host + ':' + config.propresenter.port + '/stagedisplay');
    //
    ws.on('open', function open() {
        console.log('ProPresenter: Connection Established');
        console.log('ProPresenter: Sending Password');
        ws.send('{"acn":"ath","ptl":610,"pwd":"' + config.propresenter.pass + '"}');
    });
    
    //set error handle
    ws.on('error', function (error) {
        console.log("ProPresenter: Connection Error: " + error.toString());
    });
    //set close handle
    ws.on('close', function close() {
        console.log('ProPresenter: Connection Closed');
        return propresenter_reconnect();
    });
    //setup message handle
    ws.on('message', function message(data) {
        data = data.toString()
        //check fv data before json parse to safe cpu
        if (data.includes('"acn":"ath"')) {
            data = JSON.parse(data);
            console.log(data);
            if (!data || !data.acn || !data.ath) {
                console.error("\n\n\nPropresenter: Auth failed\n\n\n")
                return propresenter_reconnect();
            }
            return;
        }
        if (!data.includes('"acn":"fv"')) {
            return;
        }
        //console.log(data);
        //var data = JSON.parse(message.utf8Data);
        if (arena_state != 'connected') {
            console.error("ProPresenter: Arena NOT connected")
            return;
        }
        return propresenter_parse_slide(JSON.parse(data))
    });
}

function parse_first_word(words) {
    //
    let word = ''
    let a = (words[0] !== undefined && words[0] !== '') ? words[0].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
    // feel fre to modify to your needs
    if (a.length > 5) {
        word = a;
    } else {
        let b = (words[1] !== undefined && words[1] !== '') ? words[1].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
        if (a == 'a' || a == 'A') {
            word = b;
        } else {
            word = a + ' ' + b
        }
       
    }
    // add spaces between words to enhance effect
    word = word.replace(/^[\ ]+|[\ ]+$/gm, "").replace(/\ /, "   ");
    //
    return word
}

function parse_last_word(words) {
    //
    let word = ''
    let a = (words[words.length - 1] !== undefined && words[words.length - 1] !== '') ? words[words.length - 1].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
    //.replace(/^\n+|\n+$/gm, "")
    // feel fre to modify to your needs is very dependant on local language
    if (a.length > 5) {
        word = a;
    } else {    
        let b = (words[words.length - 2] !== undefined && words[words.length - 2] !== '') ? words[words.length - 2].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
        //
        if (b == "to") {
            let c = (words[words.length - 3] !== undefined && words[words.length - 3] !== '') ? words[words.length - 3].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
            word = c + ' ' + b + ' ' + a;
        } else {
            if (b == "ma" || b == "sa") {
                word = a;
            } else {
                word = b + ' ' + a;
            }
        }
    }
    // add spaces between words to enhance effect
    word = word.replace(/^[\ ]+|[\ ]+$/gm, "").replace(/\ /, "   ");
    //
    return word
}
function parse_slide_segments(segments) {
    //
    let segments_ = []
    //
    for (var i = 0; i < segments.length; i++) {
        // first word ana last word is little tricky because wo cant read the words and we dont know the context
        // we use the litle trick to "join" common words with pre-words
        //
        let words = segments[i].split(' ')
        //
        let first_word = parse_first_word(words)
        let last_word = parse_last_word(words)
        //   
        // manipulaciu robim pri uploade, potrebujem uz len txt, fw, lw
        segments_.push({
            txt: segments[i],
            fw: first_word,
            lw: last_word
        })
    }
    //
    return segments_;
}

function propresenter_parse_slide(data) {
    //console.log("ProPresenter: Slide", data)
    //
    if (data.ary === undefined) {
        console.log("ProPresenter: undefined data");
        return;
    }
    // struct
    let slide = {
        current: {
            txt: '',
            segments: [
            ]
        },
        next: {
            txt: '',
            segments: [
            ]
        }
    }
    for (var i = 0; i < data.ary.length; i++) {
        //console.log(content[i]);

        if (data.ary[i].acn !== 'cs' && data.ary[i].acn !== 'ns') {
            //skip other stuff
            continue;
        }
        //
        let txt = ''
        let split = []
        switch (data.ary[i].acn) {
            case 'cs':
                if (data.ary[i].txt !== '') {
                    // optimalisation
                    txt = data.ary[i].txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/^\r+|\r+$/gm, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
                    //replace non-printable char
                    txt = txt.replace(/\u00a0/gm, " ");

                    // reverse order
                    //split = txt.split("\r").reverse()
                    // stadnard order
                    split = txt.split("\r")
                    txt = split.join("\r")
                    //
                    slide.current = parse_slide_segments([txt])[0]
                    //
                    if (split.length > 1) {
                        slide.current.segments = parse_slide_segments(split)
                    }
                }
                break;
            case 'ns':
                if (data.ary[i].txt !== '') {
                    // optimalisation
                    txt = data.ary[i].txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/^\r+|\r+$/gm, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
                    
                    //replace non-printable char
                    txt = txt.replace(/\u00a0/gm, " ");

                    // reverse order
                    //split = txt.split("\r").reverse()
                    // standard order
                    split = txt.split("\r")
                    txt = split.join("\r")
                    //
                    slide.next = parse_slide_segments([txt])[0]
                    //
                    if (split.length > 1) {
                        slide.next.segments = parse_slide_segments(split)
                    }
                }
                break;
        }
    }

    //console.log(slide.current)
    return execute_pab_bridge(slide)
}


// gun connection
// https://github.com/filiphanes/gun-overlays/tree/public
function gun_connect() {
    console.log("GUN: Connect")
    config = readConfiguration()
    let gun = Gun([config.gun_overlays.peer]);
    let overlay = gun.get(config.gun_overlays.service).get(config.gun_overlays.namespace);
    overlay.get('line2').on(function (data, key) {
        gun_overlays_parse_slide(data);
        //console.log(key, data);
    });
}

async function gun_overlays_parse_slide(data) {
    //console.log("GUN: Slide data ", data)
    //
    if (data === undefined) {
        console.log("GUN: undefined data");
        return;
    }

    let txt = ''
    let split = []
    
    //hack for now
    txt = data;
    //translate data from gun_overlays to pab 

    // struct
    let slide = {
        current: {
            txt: '',
            segments: [
            ]
        },
        next: {
            txt: '',
            segments: [
            ]
        }
    }

    // optimalisation
    txt = txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/^\r+|\r+$/gm, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
    //replace non-printable char
    txt = txt.replace(/\u00a0/gm, " ");

    // reverse order
    //split = txt.split("\r").reverse()
    // stadnard order
    split = txt.split("\r")
    txt = split.join("\r")
    //
    slide.current = parse_slide_segments([txt])[0]
    //
    if (split.length > 1) {
        slide.current.segments = parse_slide_segments(split)
    }
    //console.log(slide.current);
    return execute_pab_bridge(slide)
}



function arena_reconnect() {
    clearTimeout(arena_check_timeout)
    arena_state = 'disconnected';
    arena_check_timeout = setTimeout(function () {
        return arena_determine_clips();
    }, 10000)
}

async function arena_connect() {
    config = readConfiguration()
    clearTimeout(arena_check_timeout)

    try {
        const response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1/composition');
        //const response = await fetch('https://api.github.com/users/github');
        if (!response.ok) {
            console.log("Arena: Connection not OK");
            return arena_reconnect();
        }
        console.log("Arena: Connection OK");
        arena_state = 'connected';
        return arena_determine_clips();
    } catch (error) {
        console.log("Arena: Connection error", error);
        return arena_reconnect();
    }
}

async function arena_determine_clips() {
    console.log("determine_arena");
    //
    // arena have http api so we dont know if is on or not we use check state before
    if (arena_state != 'connected') {
        return arena_connect()
    }
    config = readConfiguration()
    // arena is connected

    let data;
    try {
        const response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1/composition');
        //const response = await fetch('https://api.github.com/users/github');
        if (!response.ok) {
            console.log("Arena: Connection not OK");
            return arena_reconnect();
        }
        console.log("Arena: Connection OK");
        arena_state = 'connected';
        data = await response.json();
        if (!data || data == undefined) {
            console.log("Arena: No data");
            return arena_reconnect();
        }
        //
    } catch (error) {
        console.log("Arena: Connection error", error);
        return arena_reconnect();
    }

    // check layers
    if (data.layers === undefined) {
        console.log("No layers", data);
        return arena_reconnect();
    }

    let layer
    let clips
    let clip
    let clip_name_pab
    //reset global
    arena = []
    clips = []
    //
    // layers from top to bottom
    // top layers is more important
    for (var i = data.layers.length - 1; i >= 0; i--) {
        //travers all layers
        layer = data.layers[i].clips;
        clips = []
        //console.log(clips);
        for (var x = 0; x < layer.length; x++) {
            //travers all clips in layer
            if (layer[x].name == undefined || layer[x].name.value == undefined || layer[x].name.value == '' || !layer[x].name.value.includes("#pab")) {
                //skip clip because don have pab tag
                continue;
            }
            clip_name_pab = layer[x].name.value.match(/#pab\S*/g)[0]
            //
            clip = {
                id: layer[x].id,
                name: layer[x].name.value,
                params: {
                    block: (clip_name_pab.match(/.*\-(\d+).*/g)) ? clip_name_pab.match(/.*\-(\d+).*/)[1] : null,
                    rd: (clip_name_pab.match(/.*\-rd.*/g)) ? true : false,
                    rc: (clip_name_pab.match(/.*\-rc.*/g)) ? true : false,
                    re: (clip_name_pab.match(/.*\-re.*/g)) ? true : false,
                    uc: (clip_name_pab.match(/.*\-uc.*/g)) ? true : false,
                    lc: (clip_name_pab.match(/.*\-lc.*/g)) ? true : false,
                    cp: (clip_name_pab.match(/.*\-cp.*/g)) ? true : false,
                    fw: (clip_name_pab.match(/.*\-fw.*/g)) ? true : false,
                    lw: (clip_name_pab.match(/.*\-lw.*/g)) ? true : false,
                    a: (clip_name_pab.match(/.*\-a.*/g)) ? true : false,
                    b: (clip_name_pab.match(/.*\-b.*/g)) ? true : false,
                    //cs: (clip_name_pab.match(/.*\-cs.*/g)) ? true : false, //cs is default
                    ns: (clip_name_pab.match(/.*\-ns.*/g)) ? true : false
                }
            }
            // now we populate array with objects
            clips.push(clip)
        }
        if (clips.length > 0) {
            arena.push(clips)
        }     
    }
    console.log(arena)
}

async function execute_pab_bridge_triggers(clips) {

    for (var i = 0; i < clips.length; i++) {
        //
        //console.log("execute_pab_bridge_triggers", clips[i])
        try {
            const response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_by_id + '/' + clips[i] + '/connect', { method: 'POST', body: '' });
            //const response = await fetch('https://api.github.com/users/github');
            if (!response.ok) {
                console.error("Arena: Trigger failed");
                continue;
                //return arena_reconnect();
            }
            continue;
            //
        } catch (error) {
            console.error("Arena: Connection error", error);
            continue;
            //return arena_reconnect();
        }
    }
}

async function arena_update_clip(id, text) {
    //console.log("arena_update_clip", id)
    let obj = {
        method: 'PUT',
        body: JSON.stringify({ "video": { "sourceparams": { "Text": text } } }),
        headers: { 'Content-Type': 'application/json' }
    }

    try {
        const response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_by_id + '/' + id + '', obj);
        //const response = await fetch('https://api.github.com/users/github');
        if (!response.ok) {
            console.error("Arena: PUT failed");
            return;
            //return arena_reconnect();
        }
        return;
        //
    } catch (error) {
        console.error("Arena: Connection error", error);
        return;
        //return arena_reconnect();
    }
}

let execute_pab_bridge_triggers_timeout = []
async function execute_pab_bridge(slide) {
    //reverse cycle on each slide
    cycle = !cycle;
    //
    //console.log('execute_pab_bridge', slide);
    //now we need populate all clips according to their params
    if (arena.length == 0) {
        console.log("execute_pab_bridge", "No clips")
        return;
    }
    //
    let clip
    let layer
    let text_for_clip = ''
    let arena_scheduled_clips = []
    let actual
    let same_layer_triger_protect = false
    let update_count = 0;
    let specific = 0
    //
    for (var i = 0; i < arena.length; i++) {
        //console.log('LAYER %d\n', i)
        //layers
        layer = arena[i]
        // disable protection for triggering on same page
        same_layer_triger_protect = false
        //
        for (var x = 0; x < layer.length; x++) {
            //slide
            //console.log('\n\tclip %d', x)
            clip = layer[x]
            if ((clip.params.a && cycle == true) || (clip.params.b && cycle == false)) {
                //chedule for trigger
                if (same_layer_triger_protect == false) {
                    //console.warn("Arena: Trigger scheduled")
                    arena_scheduled_clips.push(clip.id)
                    //enable protection
                    same_layer_triger_protect = true;
                } else {
                    console.warn("Arena: Trigger schedule PROTECTION SKIP. FIX THIS IN ARENA!!! Layer = '%d' Clip = '%s'", i, clip.name)
                    //skip whole clip
                    continue;
                }
                
            }

            // determine cycle
            if (clip.params.a && cycle == false || clip.params.b && cycle == true) {
                // if clip is in for oposite cylcle skip update
                continue;
            } else {
                if (clip.params.ns) {
                    actual = slide.next
                } else {
                    actual = slide.current
                }
                
            }

            if (actual.txt == undefined || actual.txt == '') {
                //just clear the clip
                console.log("CLEAR clip")
                update_count++
                await arena_update_clip(clip.id, '')
                continue;
            }

            // check if the clip wants specific segment
            if (clip.params.block) {
                //console.log("WANTED Specific segment", clip.params.block, actual.segments)
                specific = parseInt(clip.params.block, 10) - 1

                if ((actual.segments == undefined && specific == 0) || (actual.segments && actual.segments.length == 0 && specific == 0)) {
                    console.log("SET Specific segment DEFAULT")
                    actual = actual
                } else if (actual.segments && actual.segments[specific]) {
                    console.log("SET Specific segment SPECIFIC")
                    actual = actual.segments[specific]
                } else {
                    // block is wanted but not present, clear clip
                    console.log("SET Specific segment CLEAR")
                    update_count++
                    await arena_update_clip(clip.id, '')
                    continue;
                }
            } else {
                // clip do not want specific segment we beed 
            }
            //

            //default text
            text_for_clip = actual.txt
            //

            if (clip.params.fw) {
                //first word only
                text_for_clip = actual.fw
            } else if (clip.params.lw) {
                //last word only
                text_for_clip = actual.lw
            }

            if (clip.params.uc) {
                //uppercase
                text_for_clip = text_for_clip.toUpperCase()
            } else if (clip.params.lc) {
                //lowercase
                text_for_clip = text_for_clip.toLowerCase()
            } else if (clip.params.cp) {
                //caps
                text_for_clip = text_for_clip.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())
            }

            if (clip.params.re) {
                //replace enter with space
                text_for_clip = text_for_clip.replace(/[\r\n]/g, " ")
            } 

            if (clip.params.rd && clip.params.rc) {
                //trim dot and comma
                text_for_clip = text_for_clip.replace(/(^(\.|\,)+)|((\.|\,)+$)/g, "")
            } else {
                if (clip.params.rd) {
                    //trim just dot
                    text_for_clip = text_for_clip.replace(/(^\.+)|(\.+$)/g, "")
                } 

                if (clip.params.rc) {
                    //trim just comma
                    text_for_clip = text_for_clip.replace(/(^\.+)|(\.+$)/g, "")
                } 
            }

            if (text_for_clip == undefined) {
                console.warn("UNDEFINED TEXT", actual)
                update_count++
                await arena_update_clip(clip.id, '')
                continue;
            }

            //update clip
            update_count++
            await arena_update_clip(clip.id, text_for_clip)

        }
        execute_pab_bridge_triggers_timeout[i] = setTimeout(function (arg_clips, arg_timeout_index) {
            clearTimeout(execute_pab_bridge_triggers_timeout[arg_timeout_index])
            execute_pab_bridge_triggers(arg_clips)
        }, 5, arena_scheduled_clips, i)
        console.log("Arena: Triggers count=%d", arena_scheduled_clips.length)
        arena_scheduled_clips = []
    }

    console.log("Arena: Uptates count=%d", update_count)
    //
    //execute_pab_bridge_triggers(arena_scheduled_clips)
    //
    console.log("\n\n")
}

arena_connect()
propresenter_connect()
gun_connect()
