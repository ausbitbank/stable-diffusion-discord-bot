var cron = require('node-cron')
const {log:log,debugLog:debugLog}=require('./utils.js')
const fsPromises = require('fs').promises
// Setup scheduler, start repeating checks
var schedule = []
var dbScheduleFile='./config/dbSchedule.json' // flat file db for schedule // todo move to db
async function dbScheduleRead(){
    await fsPromises.readFile(dbScheduleFile)
        .then(data=>{
            var j=JSON.parse(data)
            schedule=j.schedule
            scheduleInit()
        })
        .catch(err=>{log(err)})
}
function scheduleInit(){
    // cycle through the active schedule jobs, set up render jobs with cron
    schedule.filter(s=>s.enabled==='True').forEach(s=>{
        cron.schedule(s.cron,()=>{
            var randomPromptObj=s.prompts[Math.floor(Math.random()*s.prompts.length)]
            var randomPrompt = randomPromptObj.prompt
            Object.keys(randomPromptObj).forEach(key => {
                if(key!=='prompt'){
                    randomPrompt += ` --${key} ${randomPromptObj[key]}`
                }
            })
            var newRequest={cmd: randomPrompt, userid: s.admins[0].id, username: s.admins[0].username, bot: 'False', channelid: s.channel, attachments: []}
            if(s.onlyOnIdle==="True"){
                if(queue.filter((q)=>q.status==='new').length>0){
                    // dont add more jobs, already busy
                }else{
                    request(newRequest) // todo broken
                }
            }else{
                request(newRequest) // todo broken
            }
        })
    })
}
dbScheduleRead()

module.exports = {
    schedule:{
        init:scheduleInit(),
        read:dbScheduleRead()
    },
    cron: cron
}