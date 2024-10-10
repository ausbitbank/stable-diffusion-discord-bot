const express = require('express')
const router = express.Router()

router.get('*/*', (req, res, next) => {res.status(404).send('404 Not Found')})
module.exports = router