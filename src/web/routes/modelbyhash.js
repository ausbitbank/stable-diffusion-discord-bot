const express = require('express')
const router = express.Router()
const {db,User,Pin}=require('../../db')
const {ipfs}=require('../../ipfs')
const {axios}=require('../../utils')

router.get('/api/v1/modelbyhash/:modelhash', async(req, res, next) => {
    // Use civitai api to convert a model hash into a redirect to model page
    const modelhash = req.params.modelhash
    const strippedhash = modelhash.replace('blake3:', '') // civitai api needs the hash prefix removed
    const apiresponse = await axios.get(`https://civitai.com/api/v1/model-versions/by-hash/${strippedhash}`)
    if (apiresponse.data.modelId) {
        res.writeHead(302, { Location: `https://civitai.com/models/${apiresponse.data.modelId}`, 'Content-Length': 0, 'Content-Type': 'text/plain' })
        res.end()
    } else {
        debugLog(apiresponse.data)
        res.write('Unable to find model by hash: ' + modelhash)
        res.end()
    }
})

module.exports = router