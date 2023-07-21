# PAB - ProPresenter Arena Bridge
This app take raw text from ProPresenter current slide and upload this text into Resolume Arena text source (text block).

# How it works
Node.js wrapper contains 2 parts:
- ProPresenter stage display API, which is websocket connection
- Arena HTTP connection, which is REST API

App wait for trigger event from ProPresenter API and when is fired reads the "current slide" data and this data immediatelly PIT into Arena Text source.

# Basic setup and usecase
1. enable ProPresenter Stage Display API under network tab (and insert password)
2. enable WEB server API in Arena settings (select some port like 8090)
3. add Clip to the arena which contains TextBlock source and add "#pab" into clip name
4. edit env.json file in this app (if not exists copy one from env_default.json)
5. run app in terminal like "node main.js"

App will be search for clips with "#pab" whitin name and remember it.

# Advanced setup and usecase
Almost same as Basic setup but:
You can have this variations of #pab tag in name
- #pab-a/#pab-b : used for auto ping-pong triggering
-- if you want to use arena transition between slides
- #pab-1,#pab-2,#pab-(...) : each number means each text object in propresenter slide
-- if you have 2 text object in one slide and you want to have two different looks for each text object, you can add one clip with tag #pab-1 and second with #pab-2

# Disclaimer
If you want you can use this library freely but i do not plan to maintain. It is dirty working solution for our small needs. If you want to collaborate or maintain this, you are wellcome.
