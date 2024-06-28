// Client side javascript for fetching data from api and building image gallery templates etc

const apiEndpoint = '/api/v1/pins';

const fetchPins = async (options) => {
    try {
        let apiurl = apiEndpoint+'?'
        if(options.cid){
            apiurl+='cid='+options.cid
        } else if(options){
            if(options.username&&options.username!=="null"){apiurl+='&username='+options.username}
            if(options.limit){apiurl+='&limit='+options.limit}
            if(options.offset){apiurl+='&offset='+options.offset}
            if(options.sortby){apiurl+='&sortby='+options.sortby}
            if(options.sortdirection){apiurl+='&sortdirection='+options.sortdirection}
            if(options.order){apiurl+='&order='+options.order}
        }
        console.log('Fetching api result: '+apiurl)
        const response = await fetch(apiurl)
        if (!response.ok) {throw new Error(`Error: ${response.status}`)}
        const pins = await response.json()
        return pins
    } catch (error) {
        console.error('Error fetching pins:', error)
        throw error
    }
}

const displayPins = async (options,containerId,pagingId) => {
    const container = document.getElementById(containerId)
    if (!container) {throw new Error(`Element with id "${containerId}" not found`)}
    container.innerHTML = '<span class="loader"></span>' // clear, replace with loading animation
    const paging = document.getElementById(pagingId)
    //if (!paging){throw new Error(`Element with id "${pagingId}" not found`)}
    //paging.innerHTML = '<span class="loader"></span>' // clear, replace with loading animation
    let html = ''
    let pins = await fetchPins(options)
    if(pins.error){html=pins.error}
    if(pins.user){
        pins.paging.username = pins.user.username
        html+=`<span><h1>Creations by <a href="/@${pins.user.username}">${pins.user.username}</a></h1><br />Tier ${pins.user.tier} member<br />${pins.user.pincount} images pinned<br />since ${pins.user.since}</span>`
    } else {
        html+=`<span><h1>Recent creations (${pins.pincount})</h1></span>`
    }
    if(pins.pins){
        html+= pins.pins.reduce((acc, pin) => {
            acc += `<a href="/image/${pin.cid}"><img src="/ipfs/${pin.cid}" alt="${pin.cid}" /></a>`;
            return acc
        }, '')
    }
    container.innerHTML = html
    if(pagingId&&pins.paging){
        let paginghtml = await paginationLinks(pins.paging,containerId,pagingId)
        paging.innerHTML = paginghtml
        pageclick(pagingId) // setup click listeners on new page links
    }
}

const displayPin = async(cid,containerId)=>{
    const container = document.getElementById(containerId)
    if (!container) {throw new Error(`Element with id "${containerId}" not found`)}
    container.innerHTML = '<span class="loader"></span>' // clear, replace with loading animation
    let pin = await fetchPins({cid})
    console.log(pin)
    console.log(pin.title)
    let html = `
    <div class="imageview">
        <h1>${pin.title}</h1>
        <div class="imageframe">
            <a href="/ipfs/${cid}"><img src="/ipfs/${cid}" alt="${pin.title}"></a>
            <div id="modcontrols">
                <span class="modcontrol icon-happy" alt="like"></span>
                <span class="modcontrol icon-star-full" alt="star"></span>
                <span class="modcontrol icon-evil" alt="nsfw"></span>
                <span class="modcontrol icon-bin" alt="remove"></span>
            </div>
        </div>
        <div class="box">
            <h3>Metadata</h3>
            created by <a href="/@${pin.owner.username}">${pin.owner.username}</a><br />
            ${(pin.createdAt)}<br />
            ${pin.metadata?.invoke?.positive_prompt ? `<b>Positive Prompt</b>: ${pin.metadata.invoke.positive_prompt}<br />` : ''}
            ${pin.metadata?.invoke?.model?.name && pin.metadata?.invoke?.model?.base ? `<b>Model</b>: <a
                href="/modelbyhash/${pin.metadata.invoke.model.hash}">${pin.metadata.invoke.model.name}</a>
            (${pin.metadata.invoke.model.base})<br />` : ''}
            ${pin.metadata?.invoke?.steps ? `<b>Steps</b>: ${pin.metadata.invoke.steps}<br />` : ''}
            ${pin.metadata?.invoke?.scheduler ? `<b>Scheduler</b>: ${pin.metadata.invoke.scheduler}<br />` : ''}
            ${pin.metadata?.invoke?.scale ? `<b>Scale</b>: ${pin.metadata.invoke.scale}<br />` : ''}
            ${pin.metadata?.invoke?.seed ? `<b>Seed</b>: ${pin.metadata.invoke.seed}<br />` : ''}
            ${pin.metadata?.invoke?.clipskip ? `<b>Clip Skip</b>: ${pin.metadata.invoke.clipsok}<br />` : ''}
            ${pin.metadata?.invoke?.seamlessx || pin.metadata?.invoke?.seamlessy ? `<b>Seamless</b>: ` : ''}
            ${pin.metadata?.invoke?.seamlessx ? `X ` : ''}
            ${pin.metadata?.invoke?.seamlessy ? `Y` : ''}
            ${pin.metadata?.invoke?.seamlessx || pin.metadata?.invoke?.seamlessy ? `<br />` : ''}
            ${pin.metadata?.invoke?.width && pin.metadata?.invoke?.height ? `<b>Resolution</b>: ${pin.metadata.invoke.width} x
            ${pin.metadata.invoke.height}<br />` : ''}
            ${pin.metadata?.invoke?.hrf && pin.metadata?.invoke?.hrfheight && pin.metadata?.invoke?.hrfwidth ? `<b>Hi Res Fix</b>:
            ${pin.metadata.invoke.hrfwidth}x${pin.metadata.invoke.hrfheight}<br />` : ''}
            <b>IPFS</b>: <a href="/ipfs/${cid}">${cid.substring(0, 15)}</a>
        `
        if(pin.metadata?.invoke?.loras.length){
            html+='<div class="loras"><b>Using Resources</b>:'
            for (const l in pin.metadata.invoke.loras){
                let lora = pin.metadata.invoke.loras[l]
                html+=`<a href="/api/v1/modelbyhash/${lora.model.hash}">${lora.model.name}</a> (${lora.weight})`
            }
            html+='</div>'
        }
        html+='</div><div id="morefromuser" class="image-grid"></div>'
        container.innerHTML = html
        displayPins({username:pin.owner.username,limit:3},'morefromuser')
}

const paginationLinks = (options,containerId,pagingId) => {
    console.log(options)
    let html = '<nav class="pagination" id="pagination-nav">'
    let pagelinks = []
    let maxPagelinks = 20 // adjust this value as needed
    let pagemax = Math.min(options.pagemax, maxPagelinks)
    let page = options.page
    let offset = options.offset
    let limit = options.limit
    let sortby = options.order[0]
    let sortdirection = options.order[1]
    let username = options.user ?? options.username ?? null
    let startpage = Math.max(1, page - Math.floor(maxPagelinks / 2))
    let endpage = Math.min(pagemax, page + Math.ceil(maxPagelinks / 2))
    if(page>1){html += `<a href="#" data-page="${page-1}" data-limit="${limit}" data-offset="${offset-limit}" data-sortby="${sortby}" data-sortdirection="${sortdirection}" data-container="${containerId}" data-paging="${pagingId}" data-username="${username}" alt="Previous page">&laquo;</a>`}
    for (let i = 1; i <= pagemax; i++) {
        let pagelink = document.createElement('span')
        let anchor = document.createElement('a')
        anchor.href='#'
        //anchor.href = `#${i === page ? 'current-page' : `page-${i}`}`
        if(i===page){
            console.log('Made link for current page '+i)
            anchor.style="background:black;color:white;"
            anchor.class="active"
        }
        anchor.textContent = i
        anchor.dataset.page = i
        anchor.dataset.limit = limit
        anchor.dataset.offset = (i-1)*limit
        anchor.dataset.sortby = sortby
        anchor.dataset.sortdirection = sortdirection
        if(username){anchor.dataset.username = username}
        anchor.dataset.container = containerId
        anchor.dataset.paging = pagingId
        anchor.dataset.username = username
        pagelink.appendChild(anchor)
        html += pagelink.outerHTML
    }
    if(page<options.pagemax){html += `<a href="#" data-page="${page+1}" data-limit="${limit}" data-offset="${(page)*limit}" data-sortby="${sortby}" data-sortdirection="${sortdirection}" data-container="${containerId}" data-paging="${pagingId}" data-username="${username}" alt="Next page">&raquo;</a>`}
    html+= `
        <select id="limit-dropdown" data-page="${page}" data-limit="${limit}" data-offset="${offset}" data-sortby="${sortby}" data-sortdirection="${sortdirection}" data-container="${containerId}" data-paging="${pagingId}" data-username="${username}">
            <option value="" dataset>${limit} per page</option><option value="11">11</option><option value="27">27</option><option value="51">51</option><option value="96">99</option>
        </select>
        </nav>
        <script>
            const dropdown = document.getElementById('limit-dropdown')
            dropdown.addEventListener('change',()=>{
                const selectedValue = dropdown.options[dropdown.selectedIndex].value
                if(parseInt(selectedValue)){
                    let options = {page:dropdown.dataset.page,limit:selectValue,offset,sortby,sortdirection,username:dropdown.dataset.username}
                    displayLinks(options,containerId,pagingId)
                }
            })
        </script>`
        return html
}

const pageclick = (pagingId)=>{
    let paginationnav = document.getElementById(pagingId)
    // Set up the event listener for pagination links
    Array.from(paginationnav.querySelectorAll('a')).forEach((link) => {
        link.addEventListener('click', async(event) => {
            let options = {
                page:link.dataset.page,
                limit:link.dataset.limit,
                offset:link.dataset.offset,
                sortby:link.dataset.sortby,
                sortdirection:link.dataset.sortdirection
            }
            if(link.dataset.username){options.username=link.dataset.username}
            let containerId = link.dataset.container
            let pagingId = link.dataset.paging
            await displayPins(options,containerId,pagingId)
        })
    })
    // Set up event listener for dropdown menu clicks (limit selector)
    const dropdown = document.getElementById('limit-dropdown')
    dropdown.addEventListener('change',()=>{
        const selectedValue = dropdown.options[dropdown.selectedIndex].value
        if(parseInt(selectedValue)){
            let options = {page:dropdown.dataset.page,limit:selectedValue,offset:dropdown.dataset.offset,sortby:dropdown.dataset.sortby,sortdirection:dropdown.dataset.sortdirection}
            if(dropdown.dataset.username){options.username=dropdown.dataset.username}
            displayPins(options,dropdown.dataset.container,dropdown.dataset.paging)
        }
    })
}
