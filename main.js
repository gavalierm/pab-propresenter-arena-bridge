#!/usr/bin/env node

console.log('===============================');
console.log('   ProPresenter Arena bridge   ');
console.log('===============================');

console.log('\nUsage:\n');
console.log('Enable HTTP Api in Resolume Arena');
console.log('Enable Remote Conrol "Stage" in ProPresenter');
console.log('Setup config.json file according to the credentials in Arena and Propresenter');
console.log('Add "#pab" to the clip name in Resolume Arena which cointains "Text box" source');
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
console.log('-rd : Trim dot "."');
console.log('-rc : Trim comma ","');
console.log('-rv : Trim verse label "<sup>1</sup>" - works only if label is wrapped in <sup> tag');
console.log('')
console.log('\nExample box:\n');
console.log('-1,2..n : "1,2,.." means Slide first or second or nth text box only');
console.log('')
console.log('\nExample triggers:\nTriggers for "Zig-Zag" triggering.\n');
console.log('-a : "a" means trigger only on odd');
console.log('-b : "b" means trigger only on even');
console.log('-c : "c" means trigger only if all box are cleared aka nothing to show fallback');
console.log('')
console.log('Tags can be combined (order is not relevant):\n')
console.log('#pab-a-uc-fw')
console.log('#pab-fw-uc-a')
console.log('#pab-uc-a-fw')
console.log('\nAll works the same way.\n')
console.log('===============================\n');

//
//require('console')
//import os from 'os'
import fs from 'fs';
import fetch from 'node-fetch'
import WebSocket from 'ws';
import Gun from "gun";
import exp from 'constants';
//import { setgid } from 'process';
//import { clear } from 'console';
//
let config = readConfiguration()
//
const arena_path_clip_by_id = "/composition/clips/by-id";
const arena_path_layer_by_id = "/composition/layers/by-id";
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

//const sup_array = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹", "⁾ "]
const sup_array = ["0", "1", "2", "3", "4", "5", "6", "7", "9", "0", ") "]

// read file everytime if needed to change conf without restart the app
function readConfiguration() {
    var config_ = null;
    try {
        config_ = JSON.parse(fs.readFileSync('./config.json'))
    } catch (e) {
        try {
            config_ = JSON.parse(fs.readFileSync('./config_default.json'))
        } catch (e) {
            console.error("No config file", e)
            console.error("No config file")
            console.error("No config file")
            console.error("No config file")
            console.error("No config file")
            console.error("No config file")
            console.error("No config file")
            console.error("No config file")
            //die
            process.exit()
            return undefined
        }
    }
    console.log("CONFIG", config_)
    return config_;
}

function propresenter_reconnect() {
    clearTimeout(propresenter_check_timeout);
    propresenter_check_timeout = setTimeout(function () {
        return propresenter_connect();
    }, 10000);
}

function propresenter_connect() {
    //refresh config
    if (config.propresenter.enabled !== true) {
        console.warn("\n------\nProPresenter Module is disabled!\n------\n");
        return;
    }
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
        //console.log(data);
        //var data = JSON.parse(message.utf8Data);

        if (data.includes('"acn":"cc"') && config.propresenter.presentation_request) {
            console.log("\n\n\n\n\n\n\n\n\n\n\n", "CC event received", "\n\n\n\n\n\n\n\n\n\n\n")
            //i do not know what data is uid from cc event so who cares and give me whole active presentation
            return propresenter_presentation_request();
        }

        if (data.includes('"acn":"fv"')) {
            return propresenter_parse_slide(JSON.parse(data))
        }

        return;
        
    });
}

async function propresenter_presentation_request(uuid = 'active', attempt = 0) {

    if (!config.propresenter.presentation_request) {
        console.info("ProPresenter: presentation_request not enabled");
        return;
    }

    try {
        const response = await fetch('http://' + config.propresenter.host + ':' + config.propresenter.port + '/v1/presentation/' + uuid + '?chunked=false');
        //const response = await fetch('https://api.github.com/users/github');
        if (!response.ok) {
            console.log("ProPresenter: presentation_request not OK");
            if (attempt < 2) {
                return propresenter_presentation_request(uuid, attempt++);
            }
            return;
        }
        let data = await response.json();
        if (!data || data == undefined) {
            console.log("ProPresenter: presentation_request undefined response");
            return;
        }
        //console.log("ProPresenter: presentation_request OK");
        return propresenter_parse_presentation_data(data);
    } catch (error) {
        console.log("ProPresenter: presentation_request error", error);
        return;
    }
}

async function propresenter_parse_presentation_data(data) {
    //console.log("ProPresenter: propresenter_parse_presentation_data", data)
    //
    if (data === undefined || data.presentation === undefined) {
        console.log("ProPresenter: undefined data");
        return;
    }

    return execute_pab_presentation(data.presentation)

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
        // trim new lines
        segments[i] = segments[i].replace(/(^\n+)|(\n+$)/g, "")
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

async function propresenter_parse_slide(data) {
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
                    txt = data.ary[i].txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/(^\r+)|(\r+$)/g, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
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
                    txt = data.ary[i].txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/(^\r+)|(\r+$)/g, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
                    
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
    return execute_pab_slide(slide)
}


// gun connection
// https://github.com/filiphanes/gun-overlays/tree/public
var gan_allinone_last = '{}';
var gan_shown_last = false;
function gun_connect() {
    console.log("GUN: Connect")
    //
    if (config.gun_overlays.enabled !== true) {
        console.warn("\n\n------\n\nGUN Overlays Module is disabled!\n\n------\n\n");
        return;
    }
    //
    let gun = Gun([config.gun_overlays.peer]);
    let overlay = gun.get(config.gun_overlays.service).get(config.gun_overlays.namespace);
    let data = overlay.get('allinone').on(function (data, key) {
        if (data !== gan_allinone_last) {
            // we fire the vent just if last data chanted
            gan_allinone_last = data
            // we need to know if the event is ment for show or if it is clear event
            data = JSON.parse(data)
            if (data.shown || (data.shown !== gan_shown_last)) {
                //if the last event shown is FALSE and is the same as last time wi do not trigger arena
                gan_shown_last = data.shown
                gun_overlays_parse_slide(data)
            }
           
        }
        //console.log("Last\n", allinone_last)
        //console.log("\n\n", key, "\n");
        //console.log(JSON.parse(data));
    });


}

async function gun_overlays_parse_slide(data) {

    //console.log("GUN: Slide data ", data)
    //
    if (data === undefined) {
        console.log("GUN: undefined data");
        return;
    }
    //
    //console.log("GUUUUUUUUUUUN\n", data)

    let txt = ''
    let split = []
    
    //hack for now
    if (data.shown) {
        txt = data.line1 + "\r\n" + data.line2 + "\r\n" + data.line3 + "\r\n" + data.line4;
    }
    
    //console.log("GUN: Slide txt ", txt)
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
    txt = txt.trim().replace(/^\x82+|\x82+$/gm, "").replace(/(^\r+)|(\r+$)/g, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
    //replace non-printable char
    txt = txt.replace(/\u00a0/gm, " ");

    //console.log(txt);
    txt = txt.replaceAll(/<sup>/g, "@").replaceAll(/<\/sup>/g, "@");

    // replace html tags
    txt = txt.replace(/(<([^>]+)>)/ig, "");

    // reverse order
    //split = txt.split("\r").reverse()
    // stadnard order
    split = txt.split("\r")
    txt = split.join("\r")
    //console.log(split)
    //return;
    //
    slide.current = parse_slide_segments([txt])[0]
    //
    if (split.length > 1) {
        slide.current.segments = parse_slide_segments(split)
    }
    //console.log(slide.current);
    return execute_pab_slide(slide)
}



function arena_reconnect() {
    clearTimeout(arena_check_timeout)
    arena_state = 'disconnected';
    arena_check_timeout = setTimeout(function () {
        return arena_connect();
    }, 10000)
}

async function arena_connect() {
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
        //console.log("Arena: Connection error", error);
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
    let layer_id = null
    for (var i = data.layers.length - 1; i >= 0; i--) {
        //travers all layers
        layer_id = data.layers[i].id
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
                layer_id: layer_id,
                name: layer[x].name.value,
                params: {
                    box: (clip_name_pab.match(/.*\-(\d+).*/g)) ? clip_name_pab.match(/.*\-(\d+).*/)[1] : null,
                    rd: (clip_name_pab.match(/.*\-rd(?!\w).*/g)) ? true : false, //remove dots
                    rc: (clip_name_pab.match(/.*\-rc(?!\w).*/g)) ? true : false, //remove commas
                    re: (clip_name_pab.match(/.*\-re(?!\w).*/g)) ? true : false, //remove new lines
                    rv: (clip_name_pab.match(/.*\-rv(?!\w).*/g)) ? true : false, //remove verses
                    uc: (clip_name_pab.match(/.*\-uc(?!\w).*/g)) ? true : false,
                    lc: (clip_name_pab.match(/.*\-lc(?!\w).*/g)) ? true : false,
                    cp: (clip_name_pab.match(/.*\-cp(?!\w).*/g)) ? true : false,
                    //
                    pn: (clip_name_pab.match(/.*\-pn(?!\w).*/g)) ? true : false, //presentation name
                    pnc: (clip_name_pab.match(/.*\-pnc(?!\w).*/g)) ? true : false, //presentation name
                    fw: (clip_name_pab.match(/.*\-fw(?!\w).*/g)) ? true : false,
                    lw: (clip_name_pab.match(/.*\-lw(?!\w).*/g)) ? true : false,
                    //
                    a: (clip_name_pab.match(/.*\-a(?!\w).*/g)) ? true : false, //trigger on a cycle
                    b: (clip_name_pab.match(/.*\-b(?!\w).*/g)) ? true : false, //trigger on b cycle
                    c: (clip_name_pab.match(/.*\-c(?!\w).*/g)) ? true : false, //trigger on clear
                    ns: (clip_name_pab.match(/.*\-ns(?!\w).*/g)) ? true : false,
                    sg: (clip_name_pab.match(/.*\-sg(\d+)/g)) ? parseInt(clip_name_pab.match(/.*\-sg(\d+)/g)[0].match(/.*\-sg(\d+)/)[1], 10) : false, //size guard
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

async function arena_push_presentation_data(data) {
    try {
        const response = await fetch('http://' + config.propresenter.host + ':' + config.propresenter.port + '/v1/presentation/' + uuid + '?chunked=false');
        //const response = await fetch('https://api.github.com/users/github');
        if (!response.ok) {
            console.log("ProPresenter: presentation_request not OK");
            if (attempt < 2) {
                return propresenter_presentation_request(uuid, attempt++);
            }
            return;
        }
        //console.log("ProPresenter: presentation_request OK");
        return arena_push_presentation_data();
    } catch (error) {
        console.log("ProPresenter: get_presentation error", error);
        return;
    }
}

async function execute_pab_slide_triggers(clips, connect = true) {

    if (arena_state != 'connected') {
        console.error("Execute: Arena NOT connected")
        return;
    }

    for (var i = 0; i < clips.length; i++) {
        //
        //console.log("execute_pab_slide_triggers", clips[i])
        try {
            var response = null;
            if (connect) {
                response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_clip_by_id + '/' + clips[i].id + '/connect', { method: 'POST', body: '' });
            } else {
                console.log('CLEAR WHOLE LAYER?????');
                // /composition/layers/by-id/{layer-id}/clear
                response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_layer_by_id + '/' + clips[i].layer_id + '/clear', { method: 'POST', body: '' });
            
            }
            if (!response) {
                console.error("Response not defined")
            }
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
        const response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_clip_by_id + '/' + id + '', obj);
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

async function execute_pab_presentation(presentation) {

    if (arena_state != 'connected') {
        console.error("Execute: Arena NOT connected")
        return;
    }

    if (arena.length == 0) {
        console.log("execute_pab_slide", "No clips")
        return;
    }

    let clip
    let layer
    let text_for_clip = ''
    let same_layer_triger_protect = false

    let actual = presentation; //hack

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

            //skipp all slide related clips
            if (!clip.params.pn && !clip.params.pnc) {
                continue;
            }

            //console.log(clip)
            //default text
            text_for_clip = actual.id.name
            //

            if (text_for_clip == undefined || text_for_clip == '') {
                //just clear the clip
                console.log("CLEAR clip")
                await arena_update_clip(clip.id, '')
                continue;
            }

            //perform manupulators
            text_for_clip = perform_manipulation(text_for_clip, clip);

            await arena_update_clip(clip.id, text_for_clip)

        }
    }
}


let execute_pab_slide_triggers_timeout = []
let arena_scheduled_clips_clear_timeout = null;
async function execute_pab_slide(slide) {

    if (arena_state != 'connected') {
        console.error("Execute: Arena NOT connected")
        return;
    }

    //reverse cycle on each slide
    cycle = !cycle;
    //
    //console.log('execute_pab_slide', slide);
    //now we need populate all clips according to their params
    if (arena.length == 0) {
        console.log("execute_pab_slide", "No clips")
        return;
    }
    //
    let clip
    let layer
    let text_for_clip = ''
    let arena_scheduled_clips = []
    let arena_scheduled_clips_clear = []
    let actual
    let same_layer_triger_protect = false
    let update_count = 0;
    let clear_count = 0;
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

            if (clip.params.pn || clip.params.pnc) {
                //cc clip is not mented for slide content
                continue;
            }

            if (clip.params.c) {
                //clear clips are just for trigger so schedule and skip
                arena_scheduled_clips_clear.push(clip)
                continue;
            }
            //
            if ((clip.params.a && cycle == true) || (clip.params.b && cycle == false)) {
                //chedule for trigger
                if (same_layer_triger_protect == false) {
                    //console.warn("Arena: Trigger scheduled")
                    arena_scheduled_clips.push(clip)
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
                clear_count++
                await arena_update_clip(clip.id, '')
                continue;
            }

            // check if the clip wants specific segment
            if (clip.params.box) {
                //console.log("WANTED Specific segment", clip.params.box, actual.segments)
                specific = parseInt(clip.params.box, 10) - 1

                if ((actual.segments == undefined && specific == 0) || (actual.segments && actual.segments.length == 0 && specific == 0)) {
                    console.log("SET Specific segment DEFAULT")
                    actual = actual
                } else if (actual.segments && actual.segments[specific]) {
                    console.log("SET Specific segment SPECIFIC")
                    actual = actual.segments[specific]
                } else {
                    // box is wanted but not present, clear clip
                    console.log("SET Specific segment CLEAR")
                    update_count++
                    clear_count++
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

            //perform manupulators
            text_for_clip = perform_manipulation(text_for_clip, clip);

            if (text_for_clip && clip.params.sg && text_for_clip.length > clip.params.sg) {
                console.warn("\n\n!!!TEXT FOR CLIP OVERFLOW !!!\n\n")
            }

            if (text_for_clip == undefined) {
                console.warn("UNDEFINED TEXT", actual)
                update_count++
                clear_count++
                await arena_update_clip(clip.id, '')
                continue;
            }

            //update clip
            update_count++
            await arena_update_clip(clip.id, text_for_clip)

        }

        //because this is the break point for triggers we need to hide clear clips
        if (arena_scheduled_clips.length > 0) {
            execute_pab_slide_triggers(arena_scheduled_clips_clear, false) //false means disconnect
        }

        execute_pab_slide_triggers_timeout[i] = setTimeout(function (arg_clips, arg_timeout_index) {
            clearTimeout(execute_pab_slide_triggers_timeout[arg_timeout_index])
            execute_pab_slide_triggers(arg_clips)
        }, 5, arena_scheduled_clips, i)
        console.log("Arena: Triggers count=%d", arena_scheduled_clips.length)
        arena_scheduled_clips = []
    }
    if (clear_count == update_count) {
        console.warn("CONNECT ALL CLEAR CLIPS")
        //execute_pab_slide_triggers(arena_scheduled_clips_clear)

        arena_scheduled_clips_clear_timeout = setTimeout(function (arg_clips) {
            clearTimeout(arena_scheduled_clips_clear);
            execute_pab_slide_triggers(arg_clips)
        }, 15, arena_scheduled_clips_clear)
    }
    //free the stack
    arena_scheduled_clips_clear = []

    console.log("Arena: Uptates count=%d, Clears count=%d", update_count, clear_count)
    //
    //execute_pab_slide_triggers(arena_scheduled_clips)
    //
    console.log("\n\n")
}

//nesmie byt async
function perform_manipulation(text_for_clip, clip) {

    if (text_for_clip == undefined || text_for_clip == '') {
        return text_for_clip
    }

    //
    text_for_clip = text_for_clip.normalize('NFC')
    //

    if (clip.params.pnc) {
        text_for_clip = text_for_clip.replace(/\d+[ |_]+/g, "");
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

    if (clip.params.rv) {
        //remove all numbering
        text_for_clip = text_for_clip.replaceAll(/\@.*?\@/g, "");
    } else {
        // verses
        let match = text_for_clip.matchAll(/\@(.*?)\@/g);

        for (const m of match) {
            //console.log(m)
            let n = '';
            for (var i = 0; i < m[1].length; i++) {
                n = n + sup_array[parseInt(m[1][i], 10)]
            }
            //let regex = new RegExp('.*\{\{\{\{' + m[1] + '\}\}\}\}.*', 'g');
            let regex = new RegExp('\@' + m[1] + '\@', 'g');
            //console.log(regex)
            text_for_clip = text_for_clip.replaceAll(regex, n + sup_array[10]);

            //console.log(m[1], n, text_for_clip);
        }
    }

    return text_for_clip
}

arena_connect()
propresenter_connect()
gun_connect()

let run_forever = null

run_forever = setInterval(function () {
    //console.log("running")
}, 10000)
