const version = process.env.VERSION
const swaggerDefinition = {
    openapi: '3.0.1',
    info: {
    title: 'Arty server',
    version,
    description: 'Arty related API\'s',
    },
    servers: [
        {
        url: '/api/v1',
        description: 'v1 api endpoints',
        },
    ],
    definitions: {},
    paths: {},
}

// options for the swagger docs
const options = (fileName) => ({
  // import swaggerDefinitions
    swaggerDefinition,
  // path to the API docs
    apis: [fileName],
})

module.exports = options
