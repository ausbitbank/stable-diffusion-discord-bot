// Track overall bot status, active/pending jobs, available models and backends
const {config,log,debugLog,sleep,shuffle}=require('../utils.js')
const {invoke}=require('../invoke')
const {bot} = require('./bot')

// Limit to 1 presence update per 15 seconds
const delay = 15000
let lastUpdate = null
let lastMsg = null
let lastType = null

init = async()=>{
    let err=false
    while(!err){
        await get()
        await sleep(delay)
    }
}

get = async()=>{
    try{
        // let rc = resultCache.get()
        let hosts = invoke.hostCount()
        let js = invoke.jobStats()
        let msg = 'Guilds: '+bot.guilds.size
        //debugLog('rc length: '+rc.length)
        js.total = js.pending + js.progress
        if (js.pending>0||js.progress>0){
            msg=msg+', Jobs: '+js.total+', Hosts: '+hosts
            busyStatusArr=[
                {type:0,name:' in '+msg}
            ]
            await set('online',{type: busyStatusArr[0].type,name:busyStatusArr[0].name})
        } else {
            idleStatusArr=[ // alternate idle messages
            // 0=playing? 1=Playing 2=listening to 3=watching 5=competing in
            {type:5,name:'meditation, '+msg}, 
            {type:3,name:'disturbing dreams, '+msg},
            {type:2,name:'your thoughts, '+msg},
            ]
            //shuffle(idleStatusArr)
            await set('idle',idleStatusArr[2])
        }
    } catch (err) {
        log(err)
    }
}

set = async(type,status)=>{
    try{
        if((lastType!==type)||(lastUpdate.name!==status.name)){
            //log(lastUpdate)
            debugLog('Updating status type '+status.type+' : '+status.name)
            await bot.editStatus(type,status)
            lastUpdate = status
            lastType = type
        }
    } catch(err) {
        log(err)
    }
}

module.exports = {
    status:{
        get,
        set,
        init
    }
}