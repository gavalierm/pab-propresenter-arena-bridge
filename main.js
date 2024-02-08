#!/usr/bin/env node

//https://github.com/MarkPinches/knx
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
console.log('#pab-uc : UPPERCASE');
console.log('#pab-lc : lovercase');
console.log('#pab-cp : Caps Each Word');
console.log('')
console.log('\nExample manipulators:\n');
console.log('#pab-fw : First word only');
console.log('#pab-lw : Last word only');
console.log('')
console.log('\nExample triggers:\nTriggers for "Zig-Zag" triggering.\n');
console.log('#pab-a : "a" means odd');
console.log('#pab-b : "b" means even');
console.log('')
console.log('Tags can be combined (order is not relevant):\n')
console.log('#pab-a-uc-fw')
console.log('#pab-fw-uc-a')
console.log('#pab-uc-a-fw')
console.log('All is the same.')
console.log('===============================\n');

//
//require('console')
import os from 'os'
import fs from 'fs';
import fetch from 'node-fetch'
import WebSocket from 'ws';
//
let config
let config_default
//
const arena_path_by_id = "/composition/clips/by-id";
//
//var config = {}
//
var arena_state = 'disconnected';
var propresenter_state = 'disconnected';
//
var arena_check_timeout;
var propresenter_check_timeout;
//
var arena = []
//cycle for odd/event
var cycle = false;
// chema "x" means default
// #pab-trigger-format-start_segment-end_segment
// parameters are optional, but can not be skipped
// #pab[-a[-uc[-3-10]]]
// #pab-x-x-1-2
// #pab-x-x

// read file everytime if needed to change conf without restart the app
function readConfiguration() {
    if (!config_default) {
        try {
            config_default = JSON.parse(fs.readFileSync('./config_default.json'))
            config = config_default
            console.log("CONFIG DEFAULT", config)
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
            console.log("CONFIG FROM DEFAULT", config)
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
            console.log(data);
            return;
        }
        if (!data.includes('"acn":"fv"')) {
            return;
        }
        //console.log(data);
        //var data = JSON.parse(message.utf8Data);
        return propresenter_determine_slide(JSON.parse(data))
    });
}

function propresenter_get_first_word(words) {
    //
    let word = ''
    let a = (words[0] !== undefined && words[0] !== '') ? words[0].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
    // feel fre to modify to your needs
    if (a.length > 5) {
        word = a;
    } else {
        let b = (words[1] !== undefined && words[1] !== '') ? words[1].replace(/^[\ \,\.\:\;\"\'\(\)\-\n]+|[\ \,\.\:\;\"\'\(\)\-\n]+$/gm, "") : ''
        word = a + ' ' + b
    }
    // add spaces between words to enhance effect
    word = word.replace(/^[\ ]+|[\ ]+$/gm, "").replace(/\ /, "   ");
    //
    return word
}

function propresenter_get_last_word(words) {
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
function propresenter_slide_segments(segments) {
    //
    let segments_ = []
    //
    for (var i = 0; i < segments.length; i++) {
        // first word ana last word is little tricky because wo cant read the words and we dont know the context
        // we use the litle trick to "join" common words with pre-words
        //
        let words = segments[i].split(' ')
        //
        let first_word = propresenter_get_first_word(words)
        let last_word = propresenter_get_last_word(words)
        //
        segments_.push({
            txt: segments[i],
            uc: segments[i].toLocaleUpperCase(),
            lc: segments[i].toLocaleLowerCase(),
            cp: segments[i].toLocaleLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
            fw: first_word,
            fw_uc: first_word.toLocaleUpperCase(),
            fw_lc: first_word.toLocaleLowerCase(),
            fw_cp: first_word.toLocaleLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()),
            lw: last_word, 
            lw_uc: last_word.toLocaleUpperCase(),
            lw_lc: last_word.toLocaleLowerCase(),
            lw_cp: last_word.toLocaleLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase())
        })
    }
    //
    return segments_;
}

function propresenter_determine_slide(data) {
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
                    //
                    slide.current = propresenter_slide_segments([txt])[0]
                    //
                    split = txt.split("\r").reverse()
                    //
                    if (split.length > 1) {
                        slide.current.segments = propresenter_slide_segments(split)
                    }
                }
                break;
            case 'ns':
                if (data.ary[i].txt !== '') {
                    // optimalisation
                    txt = data.ary[i].txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/^\r+|\r+$/gm, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
                    //
                    slide.next = propresenter_slide_segments([txt])[0]
                    //
                    split = txt.split("\r").reverse()
                    //
                    if (split.length > 1) {
                        slide.next.segments = propresenter_slide_segments(split)
                    }
                }
                break;
        }
    }

    //console.log(slide.current)

    //reverse cycle on each slide
    cycle = !cycle;
    //
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
                    block: (clip_name_pab.match(/.*\-(\d+).*/g)) ? clip_name_pab.match(/.*\-(\d+).*/g)[0] : null,
                    uc: (clip_name_pab.match(/.*\-uc.*/g)) ? true : false,
                    lc: (clip_name_pab.match(/.*\-lc.*/g)) ? true : false,
                    cp: (clip_name_pab.match(/.*\-cp.*/g)) ? true : false,
                    fw: (clip_name_pab.match(/.*\-fw.*/g)) ? true : false,
                    lw: (clip_name_pab.match(/.*\-lw.*/g)) ? true : false,
                    a: (clip_name_pab.match(/.*\-a.*/g)) ? true : false,
                    b: (clip_name_pab.match(/.*\-b.*/g)) ? true : false
                }
            }
            // now we populate array with objects
            clips.push(clip)
        }
        arena.push(clips)
    }
    console.log(arena[0])
}

async function execute_pab_bridge_trigger(id) {
    console.log("execute_pab_bridge_trigger", id)
    try {
        const response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_by_id + '/' + id + '/connect', { method: 'POST', body: '' });
        //const response = await fetch('https://api.github.com/users/github');
        if (!response.ok) {
            console.error("Arena: Trigger failed");
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

async function arena_update_clip(id, text) {
    console.log("arena_update_clip", id)
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

async function execute_pab_bridge(slide) {
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
                    console.warn("Arena: Trigger schedule PROTECTION SKIP. FIX THIS IN ARENA!!!")
                    //skip whole clip
                    continue;
                }
                
            }

            // determine cycle
            if (clip.params.a && cycle == false || clip.params.b && cycle == true) {
                // if clip is in for oposite cylcle skip update
                continue;
            } else {
                actual = slide.current
            }

            if (actual.txt == undefined || actual.txt == '') {
                //just clear the clip
                arena_update_clip(clip.id, '')
                continue;
            }

            // check if the clip wants specific segment
            if (clip.params.block) {
                if (actual.segments && actual.segments[clip.params.block]) {
                    console.log("SET Specific segment", clip.params.block)
                    actual = actual.segments[clip.params.block]
                } else {
                    // block is wanted but not present, clear clip
                    arena_update_clip(clip.id, '')
                    continue;
                }
            } else {
                // clip do not want specific segment we beed 
            }
            //

            //manipulators
            if (clip.params.fw) {
                text_for_clip = actual.fw
                if (clip.params.uc) {
                    text_for_clip = actual.fw_uc
                } else if (clip.params.lc) {
                    text_for_clip = actual.fw_lc
                } else if (clip.params.cp) {
                    text_for_clip = actual.fw_cp
                }
            } else if (clip.params.lw) {
                text_for_clip = actual.lw
                if (clip.params.uc) {
                    text_for_clip = actual.lw_uc
                } else if (clip.params.lc) {
                    text_for_clip = actual.lw_lc
                } else if (clip.params.cp) {
                    text_for_clip = actual.lw_cp
                }
            } else {
                text_for_clip = actual.txt
                if (clip.params.uc) {
                    text_for_clip = actual.uc
                } else if (clip.params.lc) {
                    text_for_clip = actual.lc
                } else if (clip.params.cp) {
                    text_for_clip = actual.cp
                }
            }

            if (text_for_clip == undefined) {
                console.warn("UNDEFINED TEXT", actual)
                arena_update_clip(clip.id, '')
                continue;
            }

            //update clip
            arena_update_clip(clip.id, text_for_clip)

        }
    }

    //console.log("\n\nArena: Execute Triggers count=%d\n", arena_scheduled_clips.length)
    for (var i = 0; i < arena_scheduled_clips.length; i++) {
        execute_pab_bridge_trigger(arena_scheduled_clips[i])
    }
    //console.log("\n\n\n\n")
}

arena_connect()
propresenter_connect()