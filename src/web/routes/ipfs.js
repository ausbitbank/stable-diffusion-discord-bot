const express = require('express')
const router = express.Router()
const {db,User,Pin}=require('../../db')
const {ipfs}=require('../../ipfs')

router.get('/ipfs/:cid', async(req, res, next) => {
    const cid = req.params.cid
    const pin = await Pin.findOne({ where: { cid } })
    if (!pin) {
        res.status(500).send('Invalid cid')
    } else {
        let data = await ipfs.cat(cid)
        // Todo examine the file data and set the correct headers and mime type
        //const mime = mime.getType(Buffer.from(data, 'binary')) || 'application/octet-stream'
        // in this case we control all pins, only png files are being uploaded so we can safely assume.
        let mime = 'image/png'
        let filename = cid+'.png'
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        res.setHeader('Content-Type', mime)
        res.setHeader('Content-Length',data.length)
        res.send(data)
    }
})

module.exports = router