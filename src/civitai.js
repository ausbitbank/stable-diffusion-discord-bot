const { CivitaiModel } = require('./db'); // Import the new model
const axios = require('./utils').axios; // Import axios

async function fetchModelData(hash) {
    const strippedhash = hash.replace('blake3:', ''); // Remove the prefix
    const apiresponse = await axios.get(`https://civitai.com/api/v1/model-versions/by-hash/${strippedhash}`);
    return apiresponse.data; // Return the data from the API response
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
    let modelId = data.modelId;
    // Cache the result in the database
    await CivitaiModel.create({ hash: strippedhash, modelId });
    return modelId; // Return the fetched modelId
}

async function hashToUrl(hash){
    let modelId = await hashToModelId(hash)
    let url = 'https://civitai.com/models/'+modelId
    return url
}

module.exports = {
    civitai: {
        fetchModelData,
        hashToModelId,
        hashToUrl
    }
}
