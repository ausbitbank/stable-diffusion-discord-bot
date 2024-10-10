const {config,log,debugLog,getUUID,validUUID,urlToBuffer,sleep,shuffle,tidyNumber}=require('./utils.js')

let resultCache=[]

const get = (id=null)=>{
    if(id){
        return resultCache[id]
    } else {
        return resultCache
    }
}

const set = (id,obj)=>{
    // set the whole object at once
    resultCache[id] = obj
}

const edit = (id,key,value)=>{
    // edit a single property
    if(resultCache[id]){
        resultCache[id][key]=value
    } else {
        // create if not existing
        resultCache[id] = {
            batch_id:id,
            status:'pending',
            results:[],
            progress:{},
            hostname:null
        }
        resultCache[id][key]=value
    }
}

const addResult = (id,result)=>{
    // push an image result to the cache for a specific id
    resultCache[id]?.results?.push(result)
}

const remove = (id) =>{
    delete resultCache[id]
}

module.exports = {
    resultCache : {
        get,
        set,
        edit,
        addResult,
        remove
    }
}