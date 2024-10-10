const express = require('express')
const router = express.Router()
const {User,Pin}=require('../../db')
const {ipfs}=require('../../ipfs')
const {exif}=require('../../exif')
const {trimText,relativeTime}=require('../../utils')

router.get('/api/v1/pins', async(req, res, next) => {
    let username=req.query.username??undefined
    let limit=(req.query?.limit&&parseInt(req.query?.limit) < 100) ? parseInt(req.query?.limit) : 24
    let sortby=req.query.sortby??'id'
    let sortdirection=req.query.sortdirection??'DESC'
    let order=[sortby,sortdirection]
    let offset
    if(req.query.offset){ offset = parseInt(req.query.offset)
    } else {offset = 0}
    let page=(offset/limit)+1
    let r={pins:[],paging:{limit,order,offset,page}}
    let pincount
    let cid = req.query.cid
    if(cid) { // return metadata of a single pin and its owner
        const pin = await Pin.findOne({ where: { cid } })
        if(!pin) {res.header(500).json({error:'Invalid cid'})}
        let usr=await User.findOne({where:{id:pin.user}})
        if(!usr){res.header(500).json({error:'User not found'})}
        const imgdata = await ipfs.cat(cid)
        const metadata = await exif.load(imgdata)
        const title = trimText(metadata.invoke.positive_prompt,150)??cid
        r = {metadata,title,flags:pin.flags,size:pin.size,createdAt:pin.createdAt,owner:{username:usr.username,tier:usr.tier}}
    } else if(username) { // Search pins for a specific username, also return usr meta and pincount
        let usr=await User.findOne({where:{username:username}})
        if(!usr){res.header(500).json({error:'User not found'})}
        let pins = await Pin.findAll({where:{user:usr.id},limit,offset,order:[order]})
        pincount = await Pin.count({where:{user:usr.id}})
        r.paging.pagemax = Math.ceil((pincount/limit))
        r.user = {username,pincount,tier:usr.tier,since:relativeTime(usr.createdAt)}
        for (const p of pins){r.pins.push(p)}
    } else { // Return all pins
        let pins = await Pin.findAll({limit,offset,order:[order]})
        pincount = await Pin.count({})
        r.pincount = pincount
        r.paging.pagemax = Math.ceil((pincount/limit))
        for (const p of pins){r.pins.push(p)}
    }
    res.json(r)
})  

module.exports = router