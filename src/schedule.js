var cron = require('node-cron')
const {log,debugLog}=require('./utils')
const {credits}=require('./credits')
const {imageproxy} = require('./imageproxy')
//const {invoke}=require('./invoke')
const {payments} = require('./payments')

cron.schedule('0 0,12 * * *',()=>{
    // credit recharge, twice a day
    credits.freeRecharge()
    credits.memberRecharge()
})
// note this is disabled because when the rescan happens, occasionally jobs already in progress before the scan get dropped. Redesign to avoid that before re-enabling
// current plan is to save ongoing jobs to the host object, and check for unfinished work before init
//cron.schedule('*/15 * * * *',()=>{
    // Rescan all invoke hosts, models, status every 5 minutes
//    invoke.init()
//})

cron.schedule('0 0,12 * * *',()=>{
    // Purge 12hr old images from image caching proxy
    imageproxy.purgeOld()
})

cron.schedule('*/5 * * * *',()=>{
    // Check for incoming payments every 5 minutes
    payments.poll()
})

module.exports = {
    cron: cron
}