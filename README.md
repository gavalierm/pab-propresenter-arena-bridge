# PAB - ProPresenter Arena Bridge

The purpose is to use ProPresenter as a source of text content and control for Resolume, where Resolume renders the text itself instead of using screen capture, Spout, NDI or similar.


## How it works

Script connect to the ProPresenter Websocket API (/stage endpoint) and wait for slide trigger.
When slide is triggered the Script read the text from the slide and PUT this text into Resolume Arena "TextBlock" source.


## What you need

You need node.js on your computer to run this script

- For MacOS users:
  - You need apple developer tools (apple way to run console apps)
  - clone the repo
  - execute 'node main.js'
- For Windows users:
  - I do not have windows but i think you need download and install node.js from https://nodejs.org/en
  - just run main app via Node.js runtime app


## Basic setup and usecase

1. enable ProPresenter Stage Display API under network tab (and insert password)
2. enable WEB server API in Arena settings (select some port like 8090)
3. add TextBlock into Clip in Resolume Arena and add "#pab" into clip name (more hastags described bellow)
4. create a copy of config_default.json to config.json
5. edit config.json credentials
6. run script in terminal like "node path/to/file/main.js" (depends on platform)

NOTE: If you add more "#pab" clip or edit existing clips names relevant to the pab (modificators) ... you need to restart the script to apply new changes.


## Advanced setup and usecase

PAB script have some builtin features to enhance the work flow.


#### Example modificators:

- -uc : UPPERCASE
- -lc : lovercase
- -cp : Caps Each Word

Note: Ease pre-formating of text. Because Resolume Arena can not do this yet.


#### Example manipulators:

- -fw : First word only
- -lw : Last word only

Note: This works in conjuction with "Block selection". First/Last word is always from selected block. No-block means whole slide.


#### Example block:

- -1,..n : Means only first text block (or nth text block) of Slide

Note: This is helpfull if your slide contains more then one text block. You cen select which textblock you can populate into this clip.


#### Example triggers for "Zig-Zag" triggering:

- -a : "a" means trigger only on odd
- -b : "b" means trigger only on even

Note: This is very helpfull (or must-have) if you want to use Resolume Arena transitions between slides. Clip A acting as prev and stay untouched. Clip B acting as actual slide and will be populated with actual slide text. Ater transitions the A will act as prev and B as actual. This will be cycled forever.


#### Tags can be combined:

- #pab-a-uc-fw
- #pab-fw-uc-a
- #pab-uc-a-fw

Note: Order is not relevant. In this example all clips will have same content, format and trigger on A cycle.


#### Next slide content:

- -ns : Means content from "Next slide", default is "Current slide" (without any special flag)


## Support and License
This script is free for scenarios such as churches, educational platforms, charity events, etc. If you want to use this script at paid events like concerts, conferences, etc., be grateful and send some "thank you" via https://paypal.me/MarcelGavalier
