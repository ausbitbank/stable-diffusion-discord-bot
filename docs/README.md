![stable-diffusion-discord-bot](https://github.com/ausbitbank/stable-diffusion-discord-bot/assets/1692203/ab84734b-1c40-4216-8c5b-14cecc93f69d)

A discord bot built to interface with the [InvokeAI](https://github.com/invoke-ai/InvokeAI) fork of stable-diffusion.

[![top.gg](https://top.gg/api/widget/servers/973484171534172170.svg)](https://top.gg/bot/973484171534172170)
![discord](https://img.shields.io/discord/419390618209353730?style=plastic)
![license](https://img.shields.io/github/license/ausbitbank/stable-diffusion-discord-bot?style=plastic)
![size](https://img.shields.io/github/repo-size/ausbitbank/stable-diffusion-discord-bot?style=plastic)
![last commit](https://img.shields.io/github/last-commit/ausbitbank/stable-diffusion-discord-bot?style=plastic)
[![twitter](https://img.shields.io/twitter/follow/ausbitbank?style=social)](https://twitter.com/ausbitbank)

## Current features:

- ✅ Most features from InvokeAI are available via bot
- 🔁 Simple buttons for refresh and using templates/init-images
- 🖼️ Attach an image with your chat message to use as template/init-image
- 🧊 Basic FIFO queue system
- 📂 Watch folder for new files, autopost to discord with filename/info if available
- 📄 Supports loading prompt, keywords and settings from txt files with randomisation
- 🖼️ RealESRGAN face fixing and upscaling
- ⚔️ Slash commands
- 💳 Per user credit tracking system
- 💰 Credit recharging via Hive, HBD, or btc lightning payments
- 🆓 Free small credit topups for low balance users once every x hours (optional)
- 🚫 Filter blacklisted words from prompts (optional)
- 🎞️ Easily make gif animations from renders
- 🖋️ Add text overlays for instant memes
- 📅 Render prompt(s) by multiple schedules and deliver via webhooks
- 🔧 Tweak menu for altering advanced settings on past renders
- 🌅 Remove backgrounds from images automagically, export as transparent PNG
- 🤖 Supports custom model/checkpoint files, and selecting what model to use per render
- 🎭 Expanding, fading, inpainting and outpainting support
- 😷 Mask an image with a text prompt for inpainting
- ⚙️ Support for textual inversions, LORA & LYCORIS embeddings
- Loads of [commands for advanced features](https://github.com/ausbitbank/stable-diffusion-discord-bot/blob/main/commands.md)

## Add arty to your discord server (easy)

🆕 Find **arty** in the [application directory here](https://discord.com/application-directory/973484171534172170)

**Or** follow this [direct invite link](https://discord.com/oauth2/authorize?client_id=973484171534172170&scope=bot&permissions=124992)

**Or** come find **arty** in the [support server](https://discord.gg/ausbit-s-stuff-and-things-419390618209353730)

[![DiscordBanner](https://invidget.switchblade.xyz/ausbit-s-stuff-and-things-419390618209353730)](https://discord.gg/ausbit-s-stuff-and-things-419390618209353730)

Once in your server you can right click him and "**manage integrations**" to choose what channels it should interact with

**That's it!** See the getting started guide - https://peakd.com/@ausbitbank/our-new-stable-diffusion-discord-bot

## How to install and host for yourself

<details>
  <summary>Click for installation instructions</summary>

Recommend at least **8gb video ram**, **lots of storage space**, and joining the support server for help (see #bot-help)

Requirements:
-  [InvokeAI](https://github.com/invoke-ai/InvokeAI) installed and running on your system first
   - Ensure InvokeAI is running in `browser-based UI` mode
- [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- [docker-compose](https://docs.docker.com/compose/install/)

To download and configure the bot:

```
git clone https://github.com/ausbitbank/stable-diffusion-discord-bot
cd stable-diffusion-discord-bot
mv config.example config
```

Inside the `docker-compose.yml` file, check that the outputs volume maps correctly to your InvokeAI outputs folder.

```yml
volumes:
 - ~/invokeai/outputs:/app/outputs # change the left side of the colon (:) to your InvokeAI outputs folder on the host machine
```

Open the `config\.env` file in a text editor and configure at least the `discordBotKey`,`adminID` and `channelID`

To configure a new discord bot user and get the `discordBotKey` :
  - Visit [discord.com/developers/applications](https://discord.com/developers/applications)
  - Click "New Application", give it a name, click **bot** > **add bot**
  - Copy the token into the .env file as `discordBotKey`
  - Enable **Message Content Intent** under Privileged Gateway Intent
  
  ![Enable Message Content Intent](https://media.discordapp.net/attachments/1112198336368361495/1115675971509567508/image.png)

To collect the remaining `adminID` and `channelID`:

  - In discord to go **User Settings** > **App Settings** > **Advanced** > **enable Developer Mode**
  - For `adminID`, right click your own username and click "copy ID"
  - For `channelID`, right click your home/headquarters channel and click "copy ID"

After entering the required details, save the file and go back to your command prompt window and run:

```
docker-compose up
```

The bot will launch and you should see an invite link in the logs, control-click it to invite the bot to your server

The invite link will look like `https://discord.com/oauth2/authorize?client_id= APPLICATION ID HERE &scope=bot&permissions=124992`

**That's it!**

</details>

## Screenshots

<details>
  <summary>Click to view screenshots:</summary>

Tweak menu with advanced controls

![](https://media.discordapp.net/attachments/1112198336368361495/1114467432027914300/image.png)

Model/Checkpoint switching

![](https://media.discordapp.net/attachments/968822563662860338/1044069621977853962/image.png)

![](https://media.discordapp.net/attachments/1112198336368361495/1114467824375697468/image.png)

Support for unlimited LORA's and textual inversions with paging menu

![](https://media.discordapp.net/attachments/1112198336368361495/1114476921833668620/image.png)

Expanding image transparency for outpainting

![](https://media.discordapp.net/attachments/968822563662860338/1044071184720986243/image.png)

Outpainting a template image

![](https://media.discordapp.net/attachments/968822563662860338/1044071185069125813/image.png)

Inpainting using a text mask

![](https://media.discordapp.net/attachments/968822563662860338/1044071827611324436/image.png)

Automagic background removal

![](https://media.discordapp.net/attachments/968822563662860338/1044072153131274340/image.png)

![](https://media.discordapp.net/attachments/1112198336368361495/1114468571309932624/image.png)

![](https://media.discordapp.net/attachments/1112198336368361495/1114468635776397332/image.png)

Slash commands with available parameters

![](https://media.discordapp.net/attachments/968822563662860338/1020031881242222683/unknown.png)

Image from text with width/height parameters

![](https://media.discordapp.net/attachments/419466215808040980/1024623676135579708/unknown.png)

![Image from text with width/height parameters](https://media.discordapp.net/attachments/968822563662860338/1018016731475751102/unknown.png)

Generating images from text + template

![Generating images from text + templates](https://media.discordapp.net/attachments/968822563662860338/1018015274802364476/unknown.png)

Seamless tiling background creation from a template

![Seamless tiling background creation from a template](https://media.discordapp.net/attachments/968822563662860338/1018017771243720704/unknown.png)

/prompt [keyword] to remix a random prompt from 600+ in the library so far

![/prompt keyword to remix a random prompt (600+ so far)](https://media.discordapp.net/attachments/968822563662860338/1020036559036231761/unknown.png)

Use `{animal}` `{star}` `{city}` etc in prompts to replace with random keywords from a text file library

![](https://media.discordapp.net/attachments/968822563662860338/1020041729342189688/unknown.png)

![](https://media.discordapp.net/attachments/968822563662860338/1020042165491089428/unknown.png)

Using an init image via discord message attachment

![](https://media.discordapp.net/attachments/968822563662860338/1020047550167912579/unknown.png)

Recharging credit with Hive, HBD or BTC lightning

![](https://media.discordapp.net/attachments/1112198336368361495/1114469417166848101/image.png)

Generating animations with `!meme animate` and attaching images

![](https://media.discordapp.net/attachments/968822563662860338/1024638314814373928/unknown.png)
![](https://media.discordapp.net/attachments/968822563662860338/1024638318631194624/animate-1845497245.gif)

</details>

Patches/Pull request are greatly appreciated!
-----------------------

If you have any questions you can find me (ausbitbank) in ![my discord here](https://discord.gg/DSdK9KRJxq)

You can test out the bot in any of the #artspam channels or by DM'ing

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ausbitbank/stable-diffusion-discord-bot&type=Date)](https://star-history.com/#ausbitbank/stable-diffusion-discord-bot&Date)
