const { Sequelize, DataTypes, Op } = require('sequelize')
const db = new Sequelize({
    dialect: 'sqlite',
    storage: './config/database.sqlite'
})
const imgdb = new Sequelize({
    dialect: 'sqlite',
    storage: './config/images.sqlite'
})

// Define DB tables
// First, we need a Users table
const User = db.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    discordID: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
    },
    stripeID: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    hiveID: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    credits: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    tier: { // 0=free user , 1+ paid tiers
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    },
    banned: {
        type: DataTypes.BOOLEAN,
        defaultValue:false
    }
})

// Track guilds
const Guild = db.define('Guild', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey:true
    },
    name:{
        type: DataTypes.STRING,
        allowNull: true
    },
    banned: {
        type: DataTypes.BOOLEAN,
        defaultValue:false
    },
    owner:{
        type: DataTypes.INTEGER,
        allowNull:true
    }
})

// Track channels, associate with guilds
const Channel = db.define('Channel',{
    id: {
        type: DataTypes.INTEGER,
        primaryKey:true
    },
    nsfw:{
        type: DataTypes.BOOLEAN,
        defaultValue:false
    },
    name:{
        type:DataTypes.STRING,
        allowNull:true
    }
})

/*
// Track moderators per guild
const Moderator = db.define('Moderator',{
    id:{
        type: DataTypes.INTEGER,
        primaryKey:true
    },
    guild:{
        type:DataTypes.INTEGER,
        allowNull:false
    }
})
*/

// Track payments
const Payment = db.define('Payment',{
    id:{
        type: DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
    type:{
        type: DataTypes.STRING
    },
    timestamp:{
        type: DataTypes.DATE,
    },
    txid:{
        type:DataTypes.STRING,
        allowNull:true
    }
})

// Image caching proxy
const Image = imgdb.define('Image', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    data: {
        type: DataTypes.BLOB('long'),
        allowNull: false
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    }
})

// Jobs in progress
const Job = db.define('Job',{
    id: {
        type:DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
    data: {
        type:DataTypes.JSON
    }
})

// Define associations
/*
Guild.hasMany(Channel)
Channel.belongsTo(Guild)

User.hasMany(Payment)
Payment.belongsTo(User)

User.belongsToMany(Guild)
Guild.belongsToMany(User)

User.hasMany(Job)
Job.belongsTo(User)

Channel.hasMany(Job)
Job.belongsTo(Channel)
*/

const initializeDatabase = async()=>{
    try{
        await db.sync() // Sync all defined model to DB
        await imgdb.sync() // add {force:true} into the sync calls if db schema changes
    } catch (err) {
        console.log('Failed to init db')
        console.log(err)
    }
}

initializeDatabase()

module.exports = {
    db,
    User,
    Image,
    Guild,
    Channel,
    Payment,
    Job,
    Op
}
