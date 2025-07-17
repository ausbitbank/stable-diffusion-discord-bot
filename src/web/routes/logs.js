const express = require('express')
const router = express.Router()
const { Message, User, Guild, Channel, Op } = require('../../db')

// Define available page sizes
const PAGE_SIZES = [25, 50, 100, 250, 500]

// Add this helper function at the top of the file
function removeQueryParam(url, param) {
    const urlObj = new URL(url, 'http://dummy.com') // dummy base URL needed for URL API
    urlObj.searchParams.delete(param)
    return `${urlObj.pathname}${urlObj.search}`
}

router.get('/logs', async (req, res) => {
    try {
        const {
            userId,
            channelId,
            guildId,
            search,
            startDate,
            endDate,
            page = 1,
            pageSize = 50  // Default page size
        } = req.query

        // Ensure pageSize is one of the allowed values
        const limit = PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 50
        const offset = (Number(page) - 1) * limit

        const where = {}
        
        if (userId) where.userId = userId
        if (channelId) where.channelId = channelId
        if (guildId) where.guildId = guildId.toString()
        if (search) where.content = { [Op.like]: `%${search}%` }
        if (startDate || endDate) {
            where.timestamp = {}
            if (startDate) where.timestamp[Op.gte] = new Date(startDate)
            if (endDate) where.timestamp[Op.lte] = new Date(endDate)
        }

        const messages = await Message.findAndCountAll({
            where,
            limit,
            offset,
            order: [['timestamp', 'DESC']],
            include: [
                { model: Channel, as: 'channel' },
                { model: Guild, as: 'guild' },
                { 
                    model: User, 
                    as: 'user',
                    required: false,  // Make this a LEFT JOIN
                    attributes: ['id', 'username']  // Only get username
                }
            ]
        })

        // Get unique guilds with messages for the dropdown
        const guilds = await Guild.findAll({
            include: [{
                model: Message,
                as: 'messages',
                attributes: []
            }],
            group: ['Guild.id', 'Guild.name']
        })

        res.render('logs', {
            messages: messages.rows,
            total: messages.count,
            currentPage: parseInt(page),
            totalPages: Math.ceil(messages.count / limit),
            query: req.query,
            guilds,
            pageSize: limit,
            pageSizes: PAGE_SIZES,
            title: 'Message Logs',
            req: req,  // Pass request object
            removeQueryParam,  // Pass helper function
            formatUsername: (user) => {  // Helper function for username formatting
                if (!user) return 'Unknown User';
                return user.discriminator === '0' 
                    ? user.username 
                    : `${user.username}#${user.discriminator}`;
            }
        })
    } catch (err) {
        console.error('Error in logs route:', err)
        res.status(500).send('Error loading logs')
    }
})

module.exports = router 