// Minimal web server for admin interface
const {config,log,debugLog,relativeTime,axios,trimText}=require('../utils')
const {exif}=require('../exif')
const fs = require('fs').promises
const {db,User,Pin}=require('../db')
const {ipfs}=require('../ipfs')
const {mod}=require('../mod')
const http = require('http')
const url = require('url')
const cookieParser = require('cookie-parser');

let host = config.web.ip??"127.0.0.1"
let port = config.web.port??"42069"

// Express
const express = require('express')
const app = express()
const path = require('path')

// Parse url and json encoded POST parameters into req.body
app.use(express.json())
app.use(express.urlencoded({extended: true}))


// web request logging
//const morgan = require('morgan')
//app.use(morgan('combined'))
// todo configure to log to specific file for traffic stats / most viewed images etc

// response compression
const compression = require('compression')
app.use(compression())


const session = require('express-session')
const passport = require('passport')
const csrf = require('csurf')
const csrfProtection = csrf({ cookie: true })

// Use cookieParser middleware
app.use(cookieParser())

app.use(session({ secret: config.web.sessionsecret, resave: false, saveUninitialized: false }))
app.use(passport.initialize())
app.use(passport.session())

// CSRF protection
app.use(csrfProtection)
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// helmet security middleware https://github.com/helmetjs/helmet
// Blocks internal scripts, breaks site. Need to rework where scripts are inserted in templates
//const helmet = require('helmet')
//app.use(helmet())


// Sonic-express automatic api endpoint documenter
//const { getResponseExpress } = require('@tiemma/sonic-express')
//import options from './swagger-config'
//console.log(options)
//app.use(getResponseExpress(app, options, '../config/swagger.json'))


// Inject global branding options
app.use(function(req, res, next) {
  res.locals.headerText = config.web.headerText
  res.locals.user = req.user // Add this line to make user available in all views
  next()
})

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Set up static file serving
app.use(express.static(path.join(__dirname, 'public')))

// Auth routing
const authRoutes = require('./routes/auth')
app.use('/', authRoutes)

app.use(function(req, res, next) {
  console.log('Post auth session:')
  console.log(req.session)
  next()
})

// Home page
let routehome = require('./routes/home')
app.use('/',routehome)

// User page
let routeuser = require('./routes/user')
app.use('/',routeuser)

// Image detail page
let routeimage = require('./routes/image')
app.use('/',routeimage)

// Use civitai api to redirect a model hash to model page
let routemodelbyhash = require('./routes/modelbyhash')
app.use('/',routemodelbyhash)

// Pins api
let routepins = require('./routes/pins')
app.use('/',routepins)

// Moderation api
let routemoderation = require('./routes/moderation')
app.use('/',routemoderation)


// IPFS cid returns raw image data from ipfs
let routeipfs = require('./routes/ipfs')
app.use('/',routeipfs)


// Error 404
let route404 = require('./routes/404')
app.use('/',route404)

// Add this after your passport middleware setup
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

const init = async()=>{
  log('Starting web interface on http://'+host+':'+port)
  await app.listen({port:port,host:host})
}

module.exports = {
    web:{
        init,
        host,
        port,
        app,
    }
}
