import fs from 'fs';
import fetch from 'node-fetch'
import WebSocket from 'ws';
import Gun from "gun";

//
let config = readConfiguration()
var propresenter_state = 'disconnected';
var propresenter_check_timeout;
var propresenter_data = {};
//
//
const arena_path_clip_by_id = "/composition/clips/by-id";
const arena_path_layer_by_id = "/composition/layers/by-id";
var arena_state = 'disconnected';
var arena_check_timeout;
var arena_cycle = false;
var arena = []
//


// run app
propresenter_connect()
arena_connect()
gun_connect()

// gun connection
// https://github.com/filiphanes/gun-overlays/tree/public
var gan_allinone_last = '{}';
var gan_shown_last = false;
function gun_connect() {
	console.log("GUN: Connect")
	//
	if (config.gun_overlays.enabled !== true) {
		console.warn("\n\n------\n\nGUN: Overlays Module is disabled!\n\n------\n\n");
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

	let text = ''
    
	//hack for now
	if (data.shown) {
		text = data.line1 + "\r\n" + data.line2 + "\r\n" + data.line3 + "\r\n" + data.line4;
	}
    
	//console.log("GUN: Slide txt ", txt)
	//translate data from gun_overlays to pab 

	// struct
	let slide = {
		presentation_title: '',
		txt: '',
		segments: [
		]
	}

	// optimalisation
	text = text.replace(/^\x82+|\x82+$/gm, "").replace(/(^\r+)|(\r+$)/g, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
	//replace non-printable char
	text = text.replace(/\u00a0/gm, " ");

	//console.log(txt);
	text = text.replaceAll(/<sup>/g, "@").replaceAll(/<\/sup>/g, "@");

	// replace html tags
	text = text.replace(/(<([^>]+)>)/ig, "");

	let split = text.split("\r")
	//
	text = parse_slide_segments([split.join("\r")])[0]
	//
	slide.txt = text.txt
	slide.fw = text.fw
	slide.lw = text.lw
	//
	if (split.length > 1) {
		slide.segments = parse_slide_segments(split)
	}
	//console.log(slide.current);
	return execute_pab_slide(slide)
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
			console.error("Arena: [" + arena_state + "] PUT failed", id, obj);
			return;
			//return arena_reconnect();
		}
		return;
		//
	} catch (error) {
		console.error("Arena: [" + arena_state + "] Connection error", error);
		return;
		//return arena_reconnect();
	}
}

let arena_execute_pab_trigger_timeout = []

async function arena_execute_pab(slide) {

	if (arena_state != 'connected') {
		console.error("Execute: Arena NOT connected")
		return;
	}

	//reverse cycle on each slide
	arena_cycle = !arena_cycle;
	//
	if (arena.length == 0) {
		console.log("arena_execute_pab", "No clips")
		return;
	}
	//
	let clip
	let layer
	let text_for_clip = ''
	let arena_scheduled_clip = null
	let actual
	let same_layer_trigger_protect = false
	let update_count = 0;
	let clear_count = 0;
	let triggers_count = 0;
	let specific = 0
	let delay = 25
	//
	for (var layer_pk = 0; layer_pk < arena.length; layer_pk++) {
		//console.log('LAYER %d\n', i)
		//layers
		layer = arena[layer_pk]
		// disable protection for triggering on same page
		same_layer_trigger_protect = false
		//
		for (var clip_pk = 0; clip_pk < layer.length; clip_pk++) {
			//slide
			//console.log('\n\tclip %d', clip_pk)
			clip = layer[clip_pk]
			//
			if ((clip.params.a && arena_cycle == true) || (clip.params.b && arena_cycle == false)) {
				//chedule for trigger
				if (same_layer_trigger_protect == true) {
					console.warn("Arena: [" + arena_state + "] Trigger schedule PROTECTION SKIP. FIX THIS IN ARENA!!! [%s, %s]\n", clip.layer_name, clip.clip_name)
					//skip whole clip
					continue;
				}
				//console.warn("Aren[a: "+arena_state+" ]Trigger scheduled")
				arena_scheduled_clip = clip
				//enable protection
				same_layer_trigger_protect = true;
                
			}

			// determine cycle
			if (clip.params.a && arena_cycle == false || clip.params.b && arena_cycle == true) {
				// if clip is in for oposite cylcle skip update
				continue;
			}

			actual = slide

			// check if the clip wants specific segment
			if (clip.params.box) {
				console.log("Arena: [" + arena_state + "] Segment [ %d ] requested [%s, %s]", clip.params.box, clip.layer_name, clip.clip_name)
				//console.log("Arena: [" + arena_state + "] Segments", actual)
				specific = parseInt(clip.params.box, 10) - 1
				//
				if (!actual.segments && specific === 0) {
					console.log("Arena: [" + arena_state + "] WARNING !!!!!!!!!!!!!!!!!!!")
					console.log("Arena: [" + arena_state + "]         Segment [ %d ] requested, but slide does NOT have segments. Dot '.' HACK is missing?! [%s, %s]", clip.params.box, clip.layer_name, clip.clip_name)
					console.log("Arena: [" + arena_state + "] WARNING !!!!!!!!!!!!!!!!!!!")
					actual.segments = []
					actual.segments[specific] = { txt: actual.txt, fw: actual.fw, lw: actual.lw }
				}

				if (actual.segments && actual.segments[specific]) {
					console.log("Arena: [" + arena_state + "] Segment [ %d ] UPDATE [%s, %s]\n", clip.params.box, clip.layer_name, clip.clip_name)
					actual = actual.segments[specific]
				} else {
					// box is wanted but not present, clear clip
					console.log("Arena: [" + arena_state + "] Segment [ %d ] CLEAR [%s, %s]\n", clip.params.box, clip.layer_name, clip.clip_name)
					clear_count++
					arena_update_clip(clip.id, '')
					continue;
				}
			}
			//
			//console.log("ACTUAL", actual)
			//default text
			text_for_clip = actual.txt
			//

			if (clip.params.fw) {
				//first word only
				text_for_clip = actual.fw
			} else if (clip.params.lw) {
				//last word only
				text_for_clip = actual.lw
			} else if (clip.params.pn || clip.params.pnc) {
				//clip needs presentation name
				text_for_clip = actual.presentation_title
				console.log("\nArena: [" + arena_state + "] Presentation title requested [%s, %s]", clip.layer_name, clip.clip_name, [text_for_clip])
			}

			//perform manupulators
			text_for_clip = perform_manipulation(text_for_clip, clip);

			if (text_for_clip && clip.params.sg && text_for_clip.length > clip.params.sg) {
				console.warn("\n\n!!!TEXT FOR CLIP OVERFLOW !!!\n\n [%s, %s]\n", clip.layer_name, clip.clip_name)
			}

			if (text_for_clip == undefined) {
				console.warn("Arena: [" + arena_state + "] UNDEFINED TEXT [%s, %s]\n", clip.layer_name, clip.clip_name)
				clear_count++
				arena_update_clip(clip.id, '')
				continue;
			}

			//update clip
			update_count++
			arena_update_clip(clip.id, text_for_clip)

		}
		if (arena_scheduled_clip) {
			delay = (config.arena.trigger_delay) ? config.arena.trigger_delay : 25
			arena_execute_pab_trigger_timeout[layer_pk] = setTimeout(function (arg_clip, arg_layer_pk) {
				arena_execute_pab_trigger(arg_clip)
				clearTimeout(arena_execute_pab_trigger_timeout[arg_layer_pk])
			}, delay, arena_scheduled_clip, layer_pk)
			//
			triggers_count++
		}
		//
		arena_scheduled_clip = null
	}
	console.log("\n")
	console.log("Arena: [" + arena_state + "] Updated: %d", update_count)
	console.log("Arena: [" + arena_state + "] Cleared: %d", clear_count)
	console.log("Arena: [" + arena_state + "] Scheduled: %d", triggers_count)
	//
	//arena_execute_pab_trigger(arena_scheduled_clip)
	//
	console.log("\n\n")
}

function parse_slide_segments(segments) {
	//
	let segments_ = []
	//
	for (var i = 0; i < segments.length; i++) {
		// trim new lines
		segments[i] = segments[i].replace(/\{empty\}/g, "").replace(/(^\n+)|(\n+$)/g, "").trim()

		//clear out only dot
		if (segments[i] == '.' || segments[i] == '-' || segments[i] == '=') {
			segments[i] = ''
		}
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

async function propresenter_parse_slide() {

	var index = 0;
	//
	for (var g = 0; g < propresenter_data.presentation.groups.length; g++) {
		let group = propresenter_data.presentation.groups[g]
		//console.log("Grp", group)
		for (var s = 0; s < group.slides.length; s++) {
			let slide = group.slides[s]
			//console.log("slide", slide);
			if (index == propresenter_data.trigger.slideIndex) {
				slide.presentation_title = propresenter_data.presentation.id.name
				if (slide.enabled == false || slide.text == '') {
					slide.text = null
				}


				//console.log(slide);
				if (typeof slide.text == 'string') {
					// optimalisation
					let text = slide.text

					text = text.replace(/^\x82+|\x82+$/gm, "")

					text = text.replace(/(^\r+)|(\r+$)/g, "").replace(/\n|\x0B|\x0C|\u0085|\u2028|\u2029/g, "\n")
					//replace non-printable char
					text = text.replace(/\u00a0/gm, " ");

					// reverse order
					//split = txt.split("\r").reverse()
					// standard order
					let split = text.split("\r")
					//
					text = parse_slide_segments([split.join("\r")])[0]
					//
					slide.txt = text.txt
					slide.fw = text.fw
					slide.lw = text.lw
					//
					if (split.length > 1) {
						slide.segments = parse_slide_segments(split)
					}
				}

				console.log("\nProPresenter: [" + propresenter_state + "] Matched slide", slide);
				return arena_execute_pab(slide);
			}
			index++;
		}
	}
}

async function propresenter_parse_presentation_data(data) {
	if (!data) {
		console.error("ProPresenter: [" + propresenter_state + "] presentation data unknown", data)
		return
	}

	if (!data.presentation) {
		console.error("ProPresenter: [" + propresenter_state + "] presentation data unknown", data)
		return
	}

	//store presentation
	propresenter_data.presentation = data.presentation
	propresenter_data.presentation.timestamp = Date.now();
	//

	return propresenter_parse_slide()
}

async function propresenter_request_presentation(uuid = 'active', attempt = 0) {
	console.info("ProPresenter: [" + propresenter_state + "] propresenter_request_presentation")
	try {
		const response = await fetch('http://' + config.propresenter.host + ':' + config.propresenter.port + '/v1/presentation/' + uuid + '?chunked=false');
		//const response = await fetch('https://api.github.com/users/github');
		if (!response.ok) {
			console.log("ProPresenter: [" + propresenter_state + "] presentation_request not OK");
			if (attempt < 2) {
				return propresenter_request_presentation(uuid, attempt++);
			}
			return;
		}
		let data = await response.json();
		if (!data || data == undefined) {
			console.log("ProPresenter: [" + propresenter_state + "] presentation_request undefined response");
			return;
		}
		console.log("ProPresenter: [" + propresenter_state + "] presentation_request OK");
		return propresenter_parse_presentation_data(data);
	} catch (error) {
		console.log("ProPresenter: [" + propresenter_state + "] presentation_request error", error);
		return;
	}
}

async function propresenter_presentation_trigger_index(trigger) {
	//console.log(trigger)
	if (!trigger.presentationPath) {
		console.error("ProPresenter: [" + propresenter_state + "] presentationPath unknown", trigger)
		return
	}

	if (!propresenter_data.presentation || trigger.presentationPath != propresenter_data.trigger.presentationPath || parseInt(trigger.slideIndex, 10) == 0) {
		console.warn("ProPresenter: [" + propresenter_state + "] presentationPath changed")
		// store data of actual trigger
		propresenter_data.trigger = trigger;
		//
		return propresenter_request_presentation();
	}

	// store data of actual trigger
	propresenter_data.trigger = trigger;
	//

	return propresenter_parse_slide();	
}

async function propresenter_reconnect() {
	propresenter_state == 'disconnected'
	clearTimeout(propresenter_check_timeout);
	propresenter_check_timeout = setTimeout(function () {
		return propresenter_connect();
	}, 10000);
}

async function propresenter_connect() {
	//refresh config
	if (config.propresenter.enabled !== true) {
		console.warn("\n------\nProPresenter Module is disabled!\n------\n");
		return;
	}
	console.log('ws://' + config.propresenter.host + ':' + config.propresenter.port + '/remote');
	const ws = new WebSocket('ws://' + config.propresenter.host + ':' + config.propresenter.port + '/remote');
	//
	ws.on('open', function open() {
		console.log('ProPresenter: ["+propresenter_state+"] Connection Established');
		console.log('ProPresenter: ["+propresenter_state+"] Sending Password');
		ws.send('{"action":"authenticate","protocol":"701","password":"' + config.propresenter.pass + '"}');
	});
    
	//set error handle
	ws.on('error', function (error) {
		console.log("ProPresenter: [" + propresenter_state + "] Connection Error: " + error.toString());
	});
	//set close handle
	ws.on('close', function close() {
		console.log('ProPresenter: ["+propresenter_state+"] Connection Closed');
		return propresenter_reconnect();
	});
	//setup message handle
	ws.on('message', function message(data) {
		data = data.toString()
		console.log(data)
		//check fv data before json parse to safe cpu
		if (data.includes('"action":"authenticate"')) {
			data = JSON.parse(data);
			//console.log(data);
			if (!data || !data.authenticated) {
				console.error("\n\n\nProPresenter: [" + propresenter_state + "] Auth failed\n\n\n")
				return propresenter_reconnect();
			}
			propresenter_state = 'connected'
			console.log("\n\n\nProPresenter: [" + propresenter_state + "] Auth OK\n\n\n")
			return;
		}

		if (data.includes('"action":"presentationTriggerIndex"')) {
			console.log("\n\n\n\n\nProPresenter: [" + propresenter_state + "] presentationTriggerIndex")
			return propresenter_presentation_trigger_index(JSON.parse(data));
		}

		return;
        
	});
}

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

async function arena_reconnect() {
	console.log("Arena: [" + arena_state + "] Connecting")
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
			console.log("Arena: [" + arena_state + "] Not connected");
			return arena_reconnect();
		}
		console.log("Arena: [" + arena_state + "] Connection OK");
		arena_state = 'connected';
		return arena_determine_clips();
	} catch (error) {
		console.log("Arena: [" + arena_state + "] Connection error");
		return arena_reconnect();
	}
}

async function arena_execute_pab_trigger(clip, connect = true) {

	if (arena_state != 'connected') {
		console.error("Execute: Arena NOT connected")
		return;
	}


	try {
		var response = null;
		if (connect) {
			console.log("Arena: [" + arena_state + "] Trigger clip", clip.clip_name);
			response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_clip_by_id + '/' + clip.id + '/connect', { method: 'POST', body: '' });
		} else {
			console.log("Arena: [" + arena_state + "] CLEAR WHOLE LAYER?????");
			// /composition/layers/by-id/{layer-id}/clear
			response = await fetch('http://' + config.arena.host + ':' + config.arena.port + '/api/v1' + arena_path_layer_by_id + '/' + clip.layer_id + '/clear', { method: 'POST', body: '' });
            
		}
		if (!response) {
			console.error("Arena: [" + arena_state + "] Response not defined")
		}
		if (!response.ok) {
			console.error("Arena: [" + arena_state + "] Trigger failed");
		}
		return;
	} catch (error) {
		console.error("Arena: [" + arena_state + "] Connection error", error);
		return;
		//return arena_reconnect();
	}

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

//nesmie byt async
function perform_manipulation(text_for_clip, clip) {

	if (text_for_clip == undefined || text_for_clip == '') {
		return text_for_clip
	}

	//
	text_for_clip = text_for_clip.normalize('NFC').trim()
	//

	if (clip.params.pnc) {
		text_for_clip = text_for_clip.replace(/^([\d]+)/g, "").replace(/\_/g, " ").replace(/([\ ]+)/g, " ").trim();
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

async function arena_determine_clips() {
	console.log("Arena: [" + arena_state + "] arena_determine_clips");
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
			console.log("Arena: [" + arena_state + "] Response fail");
			return arena_reconnect();
		}
		console.log("Arena: [" + arena_state + "] Response OK");
		arena_state = 'connected';
		data = await response.json();
		if (!data || data == undefined) {
			console.log("Arena: [" + arena_state + "] No data");
			return arena_reconnect();
		}
		//
	} catch (error) {
		console.log("Arena: [" + arena_state + "] Response error", error);
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
	let layer_name = null
	for (var i = 0; i < data.layers.length; i++) {
		//travers all layers

		layer_name = data.layers[i].name.value.replace("#", i + 1)
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
			//console.log(layer[x])
			clip_name_pab = layer[x].name.value.match(/#pab\S*/g)[0]
			//
			clip = {
				id: layer[x].id,
				layer_id: layer_id,
				layer_name: layer_name,
				layer_postition: i + 1,
				clip_name: layer[x].name.value,
				clip_position: x + 1,
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
					cl: (clip_name_pab.match(/.*\-cl(?!\w).*/g)) ? true : false, //trigger on clear
					sg: (clip_name_pab.match(/.*\-sg(\d+)/g)) ? parseInt(clip_name_pab.match(/.*\-sg(\d+)/g)[0].match(/.*\-sg(\d+)/)[1], 10) : false, //size guard
				}
			}
            
			// now we populate array with objects
			clips.push(clip)
		}
		if (clips.length > 0) {
			console.log(clips)
			arena.push(clips)
		}     
	}
}