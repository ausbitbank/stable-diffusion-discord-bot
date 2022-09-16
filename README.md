# stable-diffusion-discord-bot

A basic discord bot built to interface with the webserver api built into the lstein fork of stable-diffusion.
Currently only tested on windows 10 with an nvidia 1080ti 11gb.

You'll need to have https://github.com/lstein/stable-diffusion installed and working on your system first, as well as nodejs and npm.

To install bot dependancies : `npm install` or `yarn install`

Rename `.env.example` to `.env` and enter your own details:
- Copy the Discord channel ID as `channelID`
  - User Settings > ᴀᴘᴘ sᴇᴛᴛɪɴɢs > Advanced > enable Developer Mode [per D](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-)⁽ˀ⁾
  - Right click Channel, Copy ID
- `adminID` is your full Discord username#123 
- `apiURL` is already the default for https://github.com/lstein/stable-diffusion
- Copy Bot ᴛᴏᴋᴇɴ as `discordBotKey`
  - [New Application](https://discord.com/developers/applications)
  - Settings > Bot > Add Bot
  - (If necessary: Reset Token), Copy
  - Enable the ᴍᴇssᴀɢᴇ ᴄᴏɴᴛᴇɴᴛ ɪɴᴛᴇɴᴛ Privileged Gateway Intent [per @zsoltime on SO](https://stackoverflow.com/a/73037243).
    - ![image](https://user-images.githubusercontent.com/115931/189581611-673c32d7-19ce-4710-8911-1e71481fe257.png)

Run with `npm start` or `yarn start`

Invite to your server with `https://discord.com/oauth2/authorize?client_id= APPLICATION ID HERE &scope=bot&permissions=124992` (these ᴛᴇxᴛ ᴘᴇʀᴍɪssɪᴏɴs are required for the bot to function!)

## Current features:
- Most features from the lstein fork are available via bot
- Simple buttons for refresh and using templates/init-images
- Attach an image with your chat message to use as template/init-image
- Basic FIFO queue system
- Watch folder for new files, autopost to discord with filename/info if available
- Prompt and keyword randomisation from txt files
- RealESRGAN face fixing and upscaling
- Slash commands
- Upload to imgur api if files get too big for your discord server (optional)

## WIP/future features:
- Per-user limits, credit tracking
- Hive/HBD credit topups
- Alternative render path via dreamstudio api for paying users

## Screenshots:

Slash commands with available parameters

![Slash commands with available parameters](https://media.discordapp.net/attachments/968822563662860338/1020031881242222683/unknown.png)

![Slash commands with available parameters](https://media.discordapp.net/attachments/968822563662860338/1020032558467133540/unknown.png)

Image from text with width/height parameters

![Image from text with width/height parameters](https://media.discordapp.net/attachments/968822563662860338/1018016731475751102/unknown.png)

Generating images from text + template

![Generating images from text + templates](https://media.discordapp.net/attachments/968822563662860338/1018015274802364476/unknown.png)

Seamless tiling background creation from a template

![Seamless tiling background creation from a template](https://media.discordapp.net/attachments/968822563662860338/1018017771243720704/unknown.png)

/prompt [keyword] to remix a random prompt from 600+ in the library so far

![/prompt keyword to remix a random prompt (600+ so far)](https://media.discordapp.net/attachments/968822563662860338/1020036559036231761/unknown.png)

Use {animal} {star} {city} etc in prompts to replace with random keywords from a text file library

![](https://media.discordapp.net/attachments/968822563662860338/1020041729342189688/unknown.png)

![](https://media.discordapp.net/attachments/968822563662860338/1020042165491089428/unknown.png)

Using an init image via discord message attachment

![](https://media.discordapp.net/attachments/968822563662860338/1020047550167912579/unknown.png)



Patches/Pull request are greatly appreciated!
-----------------------

If you have any questions you can find me (ausbitbank) in my discord here - https://discord.gg/DSdK9KRJxq
You can test out the bot in the #artspam channel
