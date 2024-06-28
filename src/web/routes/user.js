const express = require('express')
const router = express.Router()
router.get('/@:username', async(req, res, next) => {
    let username = req.params.username
    console.log('Load user page for '+username)
    let limit = parseInt(req.query.limit) ? req.query.limit : 24
    let order = req.query.order??['id','DESC']
    let page = parseInt(req.query.page) ? req.query.page : 1
    let offset = (page-1)*limit
    res.render('user',{username:username,limit,order,page,offset})
})

module.exports = router