# stable-diffusion-discord-bot

A basic discord bot built to interface with the webserver api built into the lstein fork of stable-diffusion.
Currently only tested on windows 10 with an nvidia 1080ti 11gb.

You'll need to have https://github.com/lstein/stable-diffusion installed and working on your system first, as well as nodejs and npm.

To install bot dependancies : `npm install chokidar moment axios eris dotenv minimist`

Get yourself a bot api key from https://discord.com/developers/applications

Rename `.env.example` to `.env` and enter your own details

Run with `node index.js`

Invite to your server with `https://discord.com/oauth2/authorize?client_id= BOT ID HERE &scope=bot&permissions=124992`

## Current features:
- Most features from the lstein fork are available via bot
- Simple buttons for refresh and using templates/init-images
- Attach an image with your chat message to use as template/init-image
- Basic FIFO queue system
- Watch folder for new files, autopost to discord with filename/info if available
- Prompt and keyword randomisation from txt files

## WIP/future features:
- Slash commands
- Fix realesrgan upscaling
- Per-user limits, credit tracking
- Hive/HBD credit topups
- Alternative render path via dreamstudio api for paying users

## Screenshots:

![Image from text with width/height parameters](https://media.discordapp.net/attachments/968822563662860338/1018016731475751102/unknown.png "Image from text with width/height parameters")

![Generating images from text + templates](https://media.discordapp.net/attachments/968822563662860338/1018015274802364476/unknown.png "Generating images from text + template")

![Seamless tiling background creation from a template](https://media.discordapp.net/attachments/968822563662860338/1018017771243720704/unknown.png "Seamless tiling background creation from a template")


Patches/Pull request are greatly appreciated!
-----------------------
There is no warranty and minimal support will be given, this is not a polished product :)
Enjoy!
Support Discord is here - https://discord.gg/DSdK9KRJxq
