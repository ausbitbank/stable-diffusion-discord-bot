// ipfs and libp2p functions
// https://helia.io/
// https://libp2p.io/
// https://github.com/ipfs-examples/helia-examples/blob/main/examples/helia-101/301-networking.js
// https://github.com/ipfs-examples/helia-examples/blob/main/examples/helia-cjs/index.js

const {log,debugLog,config} = require('./utils')
const {db,User,Pin}=require('./db.js')
let helia, fs

const add = async(fileBuffer,creator,flags=null)=>{
    // Add files to ipfs, save to Pin database, return object with info like cid,size,etc
    // Pin db requires cid,user,size,flags
    let usr = await User.findOne({where:{discordID:creator.discordid}})
    let user = usr.id
    let cid = await hash(fileBuffer)
    let size = Buffer.byteLength(fileBuffer)
    let [newpin,created] = await Pin.findOrCreate({where:{cid},defaults:{user,size,cid,flags}})
    let originalpinusr = await User.findOne({where:{id:newpin.user}})
    let result
    if(usr.id===originalpinusr.id){
        result = {description:'IPFS upload for '+usr.username,cid,size:newpin.size,flags:newpin.flags,createdAt:newpin.createdAt,user:newpin.user,id:newpin.id,created}
    } else {
        result = {description:'IPFS already pinned for '+originalpinusr.username,cid,size:originalpinusr.size,flags:originalpinusr.flags,createdAt:originalpinusr.createdAt,user:originalpinusr.user,id:originalpinusr.id,created}
    }
    //
    
    debugLog(result)
    return result
}

const remove = async(cid)=>{
    // remove from ipfs and Pin database
    // todo set x flag instead of delete
    let dbresult = await Pin.destroy({where:[{cid}]}) // works, local db entries removed
    let rmresult = await rm(cid) // todo not working, ipfs store still holds data
    let r = {dbresult,rmresult}
    debugLog(r)
    return r
}

const rm = async(cid)=>{
    // remove / unpin from ipfs store
    // todo not working
    //debugLog(fs)
    let res = await fs.rm(cid)
    return res
}

const hash = async(fileBuffer)=>{
    // Add a file, return its cid
    const cid = await fs.addBytes(fileBuffer)
    return cid.toString()
}

const cat = async(cid)=>{
    debugLog('ipfs: get '+cid)
    let stream = await fs.cat(cid)
    let chunks = []
    for await (const chunk of stream){chunks.push(chunk)}
    return Buffer.concat(chunks)
}

const init = async()=>{
    // Helia config
    const { createHelia } = await import('helia')
    const { unixfs } = await import('@helia/unixfs')
    // Blockstore is where we store the blocks that make up files
    const { FsBlockstore } = await import('blockstore-fs')
    const blockstore = new FsBlockstore('config/ipfs/block-store')
    // Application-specific data lives in the datastore
    const { FsDatastore } = await import('datastore-fs')
    const datastore = new FsDatastore('config/ipfs/data-store')
    // Disabled all libp2p customisation for now, let helia do it
    // todo learn why peerId isn't persistant when customizing libp2p options
    // todo remove all related dependancies if this step isn't required
    /*
    let ipfsip=config.ipfs?.ip??"0.0.0.0"
    let ipfsport=config.ipfs?.port??"0"
    // libp2p networking related configuration
    const { noise } = await import('@chainsafe/libp2p-noise') // for encrypting connections 
    // stream muxers
    const { yamux } = await import('@chainsafe/libp2p-yamux')
    const { mplex } = await import('@libp2p/mplex')
    // transports
    const { webSockets } = await import('@libp2p/websockets')
    const { tcp } = await import('@libp2p/tcp') // Required to enable TCP connection for peer to peer communication
    // peer discovery
    const { bootstrap } = await import('@libp2p/bootstrap')
    //const { gossipsub } = await import('libp2p-gossipsub')
    const { kadDHT } = await import('@libp2p/kad-dht') 
    // const { autoNAT } = await import('@libp2p/autonat')
    // const { uPnPNATService } = await import('@libp2p/upnp-nat')
    const { identify } = await import('@libp2p/identify')
    const { createLibp2p } = await import('libp2p')
    const { mdns } = await import('@libp2p/mdns')
    const { stop } = await import('@libp2p/interface')
    const libp2pArgs = {
        datastore,
        blockstore,
        addresses: {
            listen: [
                // add a listen address (localhost) to accept TCP connections on a random port
                // pull additional listening addresses/ports from config
                '/ip4/'+ipfsip+'/tcp/'+ipfsport,
                // Listen on localhost IPv4 interface on a random port
                '/ip4/127.0.0.1/tcp/0',
                // Listen on all available IPv4 interfaces on a random port
                //'/ip4/0.0.0.0/tcp/0',
                // Listen on all available IPv6 interfaces on a random port
                //'/ip6/::/tcp/0'
            ]
        },
        transports: [tcp(),webSockets()],
        connectionEncryption: [noise()],
        streamMuxers: [yamux(),mplex()],
        peerDiscovery: [
            bootstrap({
                list: [
                    // ipfs public nodes
                    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
                    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
                    '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
                    '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
                    '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
                ]
            }),
            mdns()
        ],
        services: {
            identify: identify(),
            pubsub: gossipsub({
                emitSelf: false,                                  // whether the node should emit to self on publish
                //globalSignaturePolicy: SignaturePolicy.StrictSign // message signing policy
            }),
            dht: kadDHT({kBucketSize:20,clientMode:true}),
        }
    }
    const libp2p = await createLibp2p(libp2pArgs)
    await libp2p.start // needed ? Could be triggered by createHelia step, unsure
    */
    helia = await createHelia({datastore,blockstore}) // libp2p // not passing libp2p options
    /*
    debugLog('libp2p listening on addresses:')
    helia.libp2p.getMultiaddrs().forEach((addr) => {
        debugLog(addr.toString())
    })
    */
    // Listen for new connections to peers
    helia.libp2p.addEventListener("libp2p peer:connect", (evt) => {
        const connection = evt.detail
        debugLog(`libp2p Connected to ${connection.toString()}`)
    })
    // Listen for new peer discovery events
    helia.libp2p.addEventListener('libp2p peer:discovery', (peerId) => {
        // No need to dial, autoDial is on
        debugLog('libp2p Discovered:', peerId.toString())
    })
    // Listen for peers disconnecting
    helia.libp2p.addEventListener("libp2p peer:disconnect", (evt) => {
        const connection = evt.detail
        debugLog(`libp2p Disconnected from ${connection.toCID().toString()}`)
    })
    fs = unixfs(helia)
    log('Initialized IPFS node with peer id '+helia.libp2p.peerId)
    //debugLog(helia)
    //debugLog(fs)
    //await stop(helia) // needed?
}

module.exports = {
    ipfs:{
        init,
        hash,
        cat,
        rm,
        add,
        remove,
        helia,
        fs
    }
}