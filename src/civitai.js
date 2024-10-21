const { CivitaiModel } = require('./db'); // Import the new model
const axios = require('./utils').axios; // Import axios

async function fetchModelData(hash) {
    const strippedhash = hash.replace('blake3:', ''); // Remove the prefix
    try {
        const apiresponse = await axios.get(`https://civitai.com/api/v1/model-versions/by-hash/${strippedhash}`);
        return apiresponse?.data; // Return the data from the API response
    } catch (error) {
        //console.error(`Error fetching model data for hash ${hash}:`, error);
        return null; // Return null if there's an error
    }
}

async function hashToModelId(hash) {
    const strippedhash = hash.replace('blake3:', ''); // Remove the prefix
    // Check the database for cached modelId
    let cachedModel = await CivitaiModel.findOne({ where: { hash: strippedhash } });
    if (cachedModel) {
        return cachedModel.modelId; // Return cached modelId if found
    }
    // If not found in cache, fetch from API
    let data = await fetchModelData(strippedhash);
    if (!data) {
        console.warn(`Model data not found for hash ${strippedhash}`);
        await CivitaiModel.create({ hash: strippedhash, modelId: null }); // Save null result to db to stop future lookups
        return null; // Return null if model data is not found
    }
    let modelId = data?.modelId;
    // Cache the result in the database
    await CivitaiModel.create({ hash: strippedhash, modelId });
    return modelId; // Return the fetched modelId
}

async function hashToUrl(hash){
    let modelId = await hashToModelId(hash)
    let url
    if(modelId!==null){
        url = 'https://civitai.com/models/'+modelId
        return url
    } else {return null}
}

module.exports = {
    civitai: {
        fetchModelData,
        hashToModelId,
        hashToUrl
    }
}
