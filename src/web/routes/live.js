const express = require('express')
const router = express.Router()
const { Message, Guild, Op } = require('../../db')

router.get('/live', async (req, res) => {
    try {
        const { guildId } = req.query
        const limit = 50 // Initial load amount

        const where = {}
        if (guildId) where.guildId = guildId.toString()

        where[Op.or] = [
            { attachments: { [Op.not]: null } },
            { embeds: { [Op.not]: null } }
        ]

        const messages = await Message.findAll({
            where,
            limit,
            order: [['createdAt', 'DESC']],
            include: [{ 
                model: Guild, 
                as: 'guild',
                required: false
            }]
        })

        // Get guilds for filter dropdown (only those with media)
        const guilds = await Guild.findAll({
            include: [{
                model: Message,
                as: 'messages',
                required: true,
                where: {
                    [Op.or]: [
                        { attachments: { [Op.not]: null } },
                        { embeds: { [Op.not]: null } }
                    ]
                }
            }],
            group: ['Guild.id', 'Guild.name']
        })

        res.render('live', {
            messages,
            guilds,
            currentGuildId: guildId,
            title: 'Live Media Wall'
        })
    } catch (err) {
        console.error('Error in live route:', err)
        res.status(500).send('Error loading live view')
    }
})

// API endpoint for getting new media
router.get('/api/live-media', async (req, res) => {
    try {
        const { lastTimestamp, guildId } = req.query
        const where = {}
        
        if (guildId) where.guildId = guildId.toString()
        if (lastTimestamp) {
            where.createdAt = { [Op.gt]: new Date(lastTimestamp) }
        }

        where[Op.or] = [
            { attachments: { [Op.not]: null } },
            { embeds: { [Op.not]: null } }
        ]

        const newMessages = await Message.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 50,
            include: [{ 
                model: Guild, 
                as: 'guild',
                required: false
            }]
        })

        res.json(newMessages)
    } catch (err) {
        console.error('Error fetching new media:', err)
        res.status(500).json({ error: 'Error fetching new media' })
    }
})

module.exports = router 