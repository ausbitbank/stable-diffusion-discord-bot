const express = require('express')
const router = express.Router()

router.get('/image/:cid', async(req, res, next) => {
    let cid = req.params.cid
    res.render('image',{cid})
})

module.exports = router