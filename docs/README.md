![stable-diffusion-discord-bot](https://github.com/ausbitbank/stable-diffusion-discord-bot/assets/1692203/ab84734b-1c40-4216-8c5b-14cecc93f69d)

# Stable Diffusion Discord Bot

A powerful Discord bot that interfaces with [InvokeAI](https://github.com/invoke-ai/InvokeAI), bringing advanced AI image generation capabilities to your server.

[![top.gg](https://top.gg/api/widget/servers/973484171534172170.svg)](https://top.gg/bot/973484171534172170)
![discord](https://img.shields.io/discord/419390618209353730?style=plastic)
![license](https://img.shields.io/github/license/ausbitbank/stable-diffusion-discord-bot?style=plastic)
![size](https://img.shields.io/github/repo-size/ausbitbank/stable-diffusion-discord-bot?style=plastic)
![last commit](https://img.shields.io/github/last-commit/ausbitbank/stable-diffusion-discord-bot/arty2-invoke4-WIP?style=plastic)
[![twitter](https://img.shields.io/twitter/follow/ausbitbank?style=social)](https://twitter.com/ausbitbank)

## 🚧 Development Status

This branch represents a major rewrite of the Arty project and is currently in alpha stage. It's compatible with `invokeai 5.2.0` but is not yet ready for public use.

## ✨ Features

- Classic `!dream prompt` command with parameter support
- Multi-backend support for Invoke over local networks
- Advanced node graph generation and job tracking
- Refresh functionality using PNG metadata
- Versatile input image handling (image to latent, controlnet, ip_adapter)
- Customizable settings menu (models, aspect ratio, scale, steps, sampler, strength)
- Background removal using custom InvokeAI node
- Real-time job progress tracking via WebSocket
- Discord status updates for Invoke cluster queue information
- LLM integration for chat, image description, and prompt improvement

## 🚀 Getting Started

### Prerequisites

- Node.js
- npm
- Git
- Docker (optional)

### Installation

1. Clone the repository:
   ```
   git clone -b dev https://github.com/ausbitbank/stable-diffusion-discord-bot/
   cd stable-diffusion-discord-bot
   ```

2. Set up the configuration:
   ```
   mv .\config\config.json.example .\config\config.json
   ```
   Edit `config.json` and set at least `discordBotKey`, `adminID`, and check the cluster URL.

3. Install custom InvokeAI nodes:
   ```
   cd invokeai\nodes
   git clone https://github.com/gogurtenjoyer/nightmare-promptgen
   git clone https://github.com/blessedcoolant/invoke_bria_rmbg
   git clone https://github.com/mickr777/textfontimage
   git clone https://github.com/helix4u/interrogate_node
   ```

4. Install additional dependencies:
   ```
   pip install clip-interrogator
   ```

### Running the Bot

#### Native Launch

```
npm install
npm start
```

#### Docker Launch
```
docker-compose up --build
```

## 🤝 Contributing

Patches and pull requests are greatly appreciated! Feel free to contribute to the project.

## 📬 Support

If you have any questions, join our [Discord server](https://discord.gg/ausbit-s-stuff-and-things-419390618209353730) or DM the bot directly.

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=ausbitbank/stable-diffusion-discord-bot&type=Date)](https://star-history.com/#ausbitbank/stable-diffusion-discord-bot&Date)
