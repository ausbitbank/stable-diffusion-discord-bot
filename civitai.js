// simple cli tool to search and download from civitai
// may eventually become a bot tool to auto install for admins, or a tool to reverse engineer a hash into the required trigger words
// npm install axios colors string-strip-html
// prereqs already in bot code
const axios = require('axios')
const log = console.log.bind(console)
var colors = require('colors')

// not included yet but should be
const {stripHtml} = require('string-strip-html')

// Civit AI api ref https://github.com/civitai/civitai/wiki/REST-API-Reference
class civitAi {
    constructor(){this.api='https://civitai.com/api/v1/'}
    async searchModel(query){
        await axios.get(this.api+'/models?query='+query+'&limit=20')
            .then(res=>{this.formatResults(res.data.items,res.data.metadata)})
            .catch(err=>{log(err)})
    }
    async searchHash(hash){
        axios.get(this.api+'/model-versions/by-hash/'+hash)
            .then(res=>{this.formatResults.ModelVersion(res.data)})
            .catch(err=>{log(err)})
    }
    formatResults(results,meta){
        if(meta&&meta.totalPages>1)log('Results:'+meta.totalItems+',page:'+meta.currentPage+' of '+meta.totalPages)
        log(results.length+' results')
        results.forEach(r=>{
            log(r.name.bgBrightGreen.black+' created by '+r.creator.username+' ('+r.type+')')
            if(r.description)log(stripHtml(r.description).result)
            log('tagged with: '.bgMagenta.black+r.tags.join(','))
            if(r.nsfw)log('nsfw: '.bgRed.black+r.nsfw)
            log(('id: '+r.id+', stats: '+r.stats.downloadCount+' downloads, '+r.stats.favoriteCount+' favorites, '+r.stats.commentCount+' comments, '+r.stats.rating+' rating from '+r.stats.ratingCount+' reviewers').dim)
            if(r.modelVersions.length>0)r.modelVersions.forEach(v=>{this.formatResultsModelVersion(v)})
            log('\n')
        })
    }
    formatResultsModelVersion(v){
        log(('version: '+v.name+', id:'+v.id+', created: '+v.createdAt+', updated:'+v.updatedAt).bgCyan.black)
        if(v.trainedWords.length>0){log('Trigger words: '.bgWhite.black+v.trainedWords.join(','))}
        if(v.files.length>0)this.formatResultsModelVersionFiles(v.files)
    }
    formatResultsModelVersionFiles(files){
        files.forEach(f=>{
            log('Download name: '.bgBrightBlue.black+f.name+', type: '+f.type+', fileSize: '+(f.sizeKB/1000).toFixed(2)+' MB')
            log('Download url: '.bgBrightBlue.black+f.downloadUrl)
        })
    }
}
const cai=new civitAi()
if(process.argv.length===2) cai.searchModel('anonymous')
if(process.argv.length===3) cai.searchModel(process.argv[2])
if(process.argv.length===4){
    if (process.argv[3] === 'name') cai.searchModel(process.argv[4])
    if (process.argv[3] === 'hash') cai.searchHash(process.argv[4])
}
//civitAiModelSearchByHash('a87fd7da')
// !civitai images search "query"
