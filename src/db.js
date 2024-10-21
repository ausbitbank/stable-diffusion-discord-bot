const { Sequelize, DataTypes, Op } = require('sequelize')
const db = new Sequelize({
    dialect: 'sqlite',
    storage: './config/database.sqlite',
    logging:false
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
        type: DataTypes.STRING,  // Changed from INTEGER to STRING
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
    },
    hash: {
        type: DataTypes.STRING
    },
    salt: {
        type: DataTypes.STRING
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
    },
    value:{
        type:DataTypes.INTEGER
    },
    userid:{
        type:DataTypes.INTEGER
    }
})

// Image caching proxy - purged of old images by scheduler every 24hrs
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

// IPFS pinning database - tracks hashes/cid's , connects them to a user , creation date (auto createdAt,updatedAt), and filesize
const Pin = db.define('Pin',{
    id: {
        type: DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
    cid: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true  // Add this to ensure uniqueness
    },
    user:{
        type:DataTypes.INTEGER,
        allowNull:true
    },
    size:{ // in bytes
        type:DataTypes.BIGINT,
        allowNull:true,
        //validate:{max:200000000}
    },
    flags:{ // favorite, deleted, nsfw, etc - make a spec
        type:DataTypes.STRING,
        allowNull:true
    }
})

// Moderation table - id,cid,user,action
const Moderation = db.define('Moderation',{
    id: {
        type:DataTypes.INTEGER,
        primaryKey:true,
        autoIncrement:true
    },
    cid:{
        type: DataTypes.STRING,
        allowNull:false,
    },
    user:{
        type:DataTypes.INTEGER,
        allowNull:false
    },
    action:{
        type:DataTypes.ENUM('upvote','downvote','star','unstar','unvote','sfw','nfsw','rm'),
        allowNull:false
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

// Cached civitai model ids
const CivitaiModel = db.define('civitaimodels', {
    hash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // Ensure uniqueness for hash
    },
    modelId: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

// Define associations
Moderation.belongsTo(User, {
    foreignKey: 'user',
    targetKey: 'id',
    as: 'usr'
})

User.hasMany(Moderation, {
    foreignKey: 'user',
    as: 'moderations'
})

Pin.belongsTo(User, {
    foreignKey: 'user',
    targetKey: 'id',
    as: 'usr'
})

User.hasMany(Pin, {
    foreignKey: 'user',
    as: 'pins'
})

Payment.belongsTo(User, {
    foreignKey: 'userid',
    targetKey: 'id',
    as: 'usr'
})

User.hasMany(Payment, {
    foreignKey: 'userid',
    as: 'payments'
})

Moderation.belongsTo(Pin, {
    foreignKey: 'cid',
    targetKey: 'cid',  // Change this from 'id' to 'cid'
    as: 'pin'
})

Pin.hasMany(Moderation, {
    foreignKey: 'cid',
    sourceKey: 'cid',  // Add this line
    as: 'moderations'
})

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
    Pin,
    Moderation,
    Op,
    Sequelize,
    CivitaiModel
}
