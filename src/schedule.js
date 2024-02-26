var cron = require('node-cron')
const {log,debugLog}=require('./utils')
const {credits}=require('./credits')
// Free credit recharge, twice a day
log('Enabled scheduler for free recharge twice a day')
cron.schedule('0 0,12 * * *',()=>{
    credits.freeRecharge()
})
module.exports = {
    cron: cron
}
