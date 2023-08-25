// Discord core components
const Eris = require('eris')
const {config,log,debugLog,tidyNumber}=require('../utils.js')

const bot = new Eris.CommandClient(config.discordBotKey, {
  intents: ['guilds', 'guildMessages', 'messageContent', 'directMessages', 'guildMessageReactions', 'directMessageReactions'],
  description: config.branding.botDescription||'Just a slave to the art, maaan',
  owner: config.branding.botOwner||'ausbitbank',
  prefix: '!',
  reconnect: 'auto',
  compress: true,
  getAllUsers: false,
  maxShards: 'auto'
})

module.exports={bot}