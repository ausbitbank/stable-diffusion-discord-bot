var cron = require('node-cron')
const {log,debugLog}=require('./utils')
const {credits}=require('./credits')
const {invoke}=require('./invoke')
cron.schedule('0 0,12 * * *',()=>{
    // credit recharge, twice a day
    credits.freeRecharge()
    credits.memberRecharge()
})
cron.schedule('*/5 * * * *',()=>{
    // Rescan all invoke hosts, models, status every 5 minutes
    invoke.init()
})
module.exports = {
    cron: cron
}
