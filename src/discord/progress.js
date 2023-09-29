// Track progress for a specific job
const {config,log,debugLog,getUUID,validUUID,urlToBuffer,sleep,shuffle,tidyNumber}=require('./utils.js')
const {invoke}=require('../invoke')

get = async(batchid) =>{
    // Return a formatted discord message tracking progress for a specific batchid
    // Should be await polled to control how often updates are sent
    let err = false
    try {
        let r = invoke.resultCache[batchid]
        log(r)
        let content = 'Job `'+batchid+'` : '+r.status+'\n'
        if(['in_progress'].includes(r.status)){
            content+=' Steps: '+r.steps+' / '+r.total_steps
        }
        
        let msg = {
            content: content,
            flags:64
        }
        return msg
    } catch (err) {
        log(err)
    }
}

module.exports = {
    progress:{
        get
    }
}