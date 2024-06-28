// Handle moderation functions
// Write events to Moderation table, Aggregate results in useful ways

const {User,Pin,Moderation}=require('./db')
const {ipfs}=require('./ipfs')
const {log,debugLog,config} = require('./utils')

const mod = async(cid,user,action)=>{
    // add events to morderation db table
    // upvote,downvote,unvote,sfw,nsfw,rm
    
    // check valid user
    let usr
    if(typeof(user)==='string'){ // assume arty db id
        usr = await User.findOne({where:{id:user}})
    } else if(typeof(user)==='object') { // assume creator object, lookup arty db id from creator.discordId
        usr = await User.findOne({where:{discordID:user.discordid}})
    }
    if(!usr) return {error:'Not a valid user'}
    // check valid cid
    let pin = await Pin.findOne({where:{cid}})
    if(!pin) return {error: 'Not a valid cid'}
    // todo only hold the most recent vote state (up,down,unvoted and sfw,unsfw) per cid
    debugLog('Mod action: '+usr.username+' '+action+' '+cid)
    if(action==='rm'){
        if((usr.id===pin.user) || (usr.id===1)){ 
            await ipfs.remove(pin.cid)
        } else { return {error:'Unable to remove, not creator or admin'}}
    }
    let [m,created] = await Moderation.findOrCreate({where:{cid:cid,user:usr.id,action},defaults:{cid:cid,user:usr.id,action}})
    if(usr.id===pin.user){ // Request is from the original creator
        if(action==='rm'){await ipfs.remove(pin.cid)}
    }
    if(usr.id===1){ // Admin user can delete anything
        if(action==='rm'){await ipfs.remove(pin.cid)}
    }
    return created
}

// Write events to db
const upvote=async(cid,user)=>{return await mod(cid,user,'upvote')}
const downvote=async(cid,user)=>{return await mod(cid,user,'downvote')}
const unvote=async(cid,user)=>{return await mod(cid,user,'unvote')}
const sfw=async(cid,user)=>{return await mod(cid,user,'sfw')}
const nsfw=async(cid,user)=>{return await mod(cid,user,'nsfw')}
const rm=async(cid,user)=>{return await mod(cid,user,'rm')}
const star=async(cid,user)=>{return await mod(cid,user,'star')}
const unstar=async(cid,user)=>{return await mod(cid,user,'unstar')}

// Read useful metrics from db
const trending = async()=>{ // todo not working
    const cidResults = await Pin.raw('SELECT DISTINCT cid FROM pins')
    const pinCids = cidResults.map(row => row.cid)
    //const pinCids = await Pin.distinct('cid') // Get a list of distinct cid's
    const cidScores = {} // Create an object to store the score for each cid
    // Iterate over each cid and count the upvote and downvote scores
    pinCids.forEach(async (cid) => {
        const moderationResults = await Moderation.findAll({where: { cid },attributes: [[Sequelize.fn('COUNT', Sequelize.col('action')),'upvotes'], [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN action = 'downvote' THEN 1 ELSE 0 END")), 'downvotes']]})
        const upvotes = moderationResults[0].dataValues.upvotes
        const downvotes = moderationResults[0].dataValues.downvotes
        cidScores[cid] = upvotes - downvotes
    })
    const sortedCidScores = Object.keys(cidScores).sort((a, b) => cidScores[b] - cidScores[a]) // Sort the cid's by their scores
    const pins = await Pin.findAll({where: { cid: sortedCidScores },attributes: ['cid', 'size']}) // Get the corresponding pin data for the sorted cid's
    return pins
}

const events = async(what,user,cid,limit,order=['id','DESC'],offset=0)=>{
    let query = {where:{},limit,offset,order:[order],include:[{model: User,as: 'usr',attributes: ['username']}]}
    if(what) query.where.action=what
    if(user) query.where.user=user
    if(cid) query.where.cid=cid
    let events = await Moderation.findAll(query)
    return events
}

module.exports = {
    mod : {
        upvote,
        downvote,
        unvote,
        sfw,
        nsfw,
        rm,
        star,
        unstar,
        trending,
        events
    }
}
