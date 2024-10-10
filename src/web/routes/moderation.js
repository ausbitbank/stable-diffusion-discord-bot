const express = require('express')
const router = express.Router()
const {User,Pin,Moderation}=require('../../db')

router.get('/api/v1/moderation', async(req, res, next) => {
    // View moderation events
    let username = req.query.username
    let userid = req.query.userid
    let cid = req.query.cid
    let action = req.query.action
    if(!username&&userid){ // lookup userid from username
        let usr = await User.findOne({where:{id:userid}})
        if(!usr){res.header(500).json({error:'Invalid user id'})}
        username=usr.username
    }
    let sortby = req.query.sortby ?? 'id'
    let sortdirection = req.query.sortdirection ?? 'DESC'
    let order = [sortby,sortdirection]
    let limit = req.query.limit ?? 30
    let query = {where:{}}
    if(username){query.where.username = username}
    if(cid){query.where.cid = cid}
    if(action){query.where.action=action}
    let events = await Moderation.findAll(query,limit)
    res.json(events)
})

router.post('/api/v1/moderation', async(req, res, next)=>{
    // Send moderation events
})

module.exports = router