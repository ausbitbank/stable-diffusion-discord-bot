![stable-diffusion-discord-bot](https://github.com/ausbitbank/stable-diffusion-discord-bot/assets/1692203/ab84734b-1c40-4216-8c5b-14cecc93f69d)

A discord bot built to interface with the [InvokeAI](https://github.com/invoke-ai/InvokeAI) fork of stable-diffusion.

[![top.gg](https://top.gg/api/widget/servers/973484171534172170.svg)](https://top.gg/bot/973484171534172170)
![discord](https://img.shields.io/discord/419390618209353730?style=plastic)
![license](https://img.shields.io/github/license/ausbitbank/stable-diffusion-discord-bot?style=plastic)
![size](https://img.shields.io/github/repo-size/ausbitbank/stable-diffusion-discord-bot?style=plastic)
![last commit](https://img.shields.io/github/last-commit/ausbitbank/stable-diffusion-discord-bot?style=plastic)
[![twitter](https://img.shields.io/twitter/follow/ausbitbank?style=social)](https://twitter.com/ausbitbank)

This branch is a work in progress for a major rewrite of the arty project. 

It still has a long way to go before it's ready for public use and should be considered an alpha test at best.

It's currently compatible with `invokeai 3.20` .

Working:
- Oldschool `!dream prompt` + parameters
- Supports multiple Invoke3 backends on local network (no direct file access required)
- Building node graphs from job requests,submitting,tracking,posting to discord
- Refresh button starting renders using png metadata alone (no job db required!)
- Input images can be used as sources for image to latent, controlnet, ip_adapter
- Tweak menu with aspect ratio, scale, steps, sampler, strength
- Remove background
- websocket job progress tracking, discord status updates for invoke cluster queue info


Not Working:
- Pretty much everything else
- No user/channel/guild tracking
- No db at all at this point

Setup:

- `git clone -b arty2-invoke3-WIP https://github.com/ausbitbank/stable-diffusion-discord-bot/`
- `cd stable-diffusion-discord-bot`
- `mv .\config\config.json.example .\config\config.json`
- Edit config.json, you need at least a `discordBotKey`, `adminID`, and to check the cluster url matches your invokeai webui url

Launch with:
- `docker-compose up --build`


Patches/Pull request are greatly appreciated!
-----------------------

If you have any questions you can find me (ausbitbank) in ![my discord here](https://discord.gg/DSdK9KRJxq)

You can test out the bot in any of the #artspam channels or by DM'ing

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ausbitbank/stable-diffusion-discord-bot&type=Date)](https://star-history.com/#ausbitbank/stable-diffusion-discord-bot&Date)
