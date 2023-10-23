// Aspect ratio calculator and dialog
const {config,log,debugLog}=require('../utils.js')
let ratios = ['1:1','2:3','3:2','3:4','4:3','5:4','4:5','7:4','4:7','9:5','5:9','6:13','13:6','9:16','16:9','9:20','20:9','9:32','32:9']

const ratioToRes = async(ratio,pixels)=>{
    // feed in a ratio like '5:4' and a pixel count and return a width / height / label
    let r = ratio.split(':')
    let w = parseInt(r[0])
    let h = parseInt(r[1])
    let d
    let width = Math.round(Math.sqrt(pixels * w / h))
    let height = Math.round(width * h / w)
    if(ratio==='1:1'){
        d='square'
    }else if(w>h){
        d='landscape'
    }else{
        d='portrait'
    }
    return {ratio:ratio,width:width,height:height,description:d}
}

const resToRatio = async(width,height)=>{
    // feed in width, height and get a close aspect ratio in whole numbers eg 16:9
    let divisor = gcd(width, height)
    let aspect = width / divisor + ':' + height / divisor
    return aspect
}

const gcd = (a, b)=>{
    // greatest common divisor
    if (b === 0) {return a}
    return gcd(b, a % b)
}

const dialog = async(msgid,pixels)=>{
    let d = {
        content:':eye: ** Aspect Ratios**\nDifferent aspect ratios will give different compositions',
        flags:64,
        components:[{type:1,components:[{type: 3,custom_id:'chooseAspectRatio-'+msgid,placeholder:'Change aspect ratio, keep pixel count',min_values:1,max_values:1,options:[]}]}]
    }
    for (const r in ratios){
        let ratio = ratios[r]
        let res = await ratioToRes(ratio,pixels)
        d.components[d.components.length-1].components[0].options.push({label:ratio,value:ratio,description:res.description+' '+res.width+'x'+res.height})
    }
    return d
}

module.exports = {
    aspectRatio:{
        ratioToRes,
        resToRatio,
        dialog
    }
}
