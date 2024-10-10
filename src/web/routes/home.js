const express = require('express')
const router = express.Router()

router.get('/', async(req, res, next) => {
    let username = req.query.username ?? null
    let limit = parseInt(req.query.limit) ? req.query.limit : 24
    let order = req.query.order??['id','DESC']
    let page = parseInt(req.query.page) ? req.query.page : 1
    let offset = (page-1)*limit
    res.render('home',{username,limit,order,page,offset})
})

module.exports = router