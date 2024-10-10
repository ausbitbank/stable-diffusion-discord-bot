const express = require('express')
const passport = require('passport')
const crypto = require('crypto')
const {db,User} = require('../../db')
const {config} = require('../../utils')
const app = express()

// Inject session messages
app.use(function(req, res, next) {
    console.log('Inject session messages into res.locals.messages')
    var msgs = req.session.messages || []
    res.locals.messages = msgs
    res.locals.hasMessages = !! msgs.length
    req.session.messages = []
    if(req.baseUrl === '/login') { // just checking if we are on the initial get or post route
        req.session.save(() => {
            next()
        })
    } else {
        next()
    }
})

// auth / sessions / CSRF

const cookieParser = require('cookie-parser')
app.use(cookieParser())

const ensureLogIn = require('connect-ensure-login').ensureLoggedIn
app.use(require('connect-multiparty')())


// Moved this here from the db setup in case thats the problem
const passportLocalSequelize = require('passport-local-sequelize')
passportLocalSequelize.attachToUser(User, {
	usernameField: 'email',
	hashField: 'hash',
	saltField: 'salt'
})

passport.use(User.createStrategy())
passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())

const csrf = require('csurf')
app.use(csrf())
//app.use(csrf({cookie:true}))

// Inject csrftoken
app.use(function(req, res, next) {
    res.locals.csrfToken = req.csrfToken()
    next()
})

/* Configure session management.
 *
 * When a login session is established, information about the user will be
 * stored in the session.  This information is supplied by the `serializeUser`
 * function, which is yielding the user ID and username.
 *
 * As the user interacts with the app, subsequent requests will be authenticated
 * by verifying the session.  The same user information that was serialized at
 * session establishment will be restored when the session is authenticated by
 * the `deserializeUser` function.
 *
 * Since every request to the app needs the user ID and username, in order to
 * fetch todo records and render the user element in the navigation bar, that
 * information is stored in the session.
 */


// Local password strategy is already hooked into the sequelize database (see db.js)
// https://www.npmjs.com/package/passport-local-sequelize


var router = express.Router()

router.get('/login', function(req, res, next) {
    console.log(req.session)
    console.log(req.session.messages)
    res.render('login',{csrfToken: res.locals.csrfToken,tokenField:'csrf-token'})
})

router.post('/login/password', passport.authenticate('local', {
    successReturnToOrRedirect: '/',
    failureRedirect: '/login',
    failureMessage: true
}))

router.post('/logout', function(req, res, next) {
    req.logout(function(err) {
        if (err) { return next(err) }
        res.redirect('/')
    })
})

router.get('/signup', function(req, res, next) {
    res.render('signup', {csrfToken: res.locals.csrfToken,tokenField:'csrf-token'})
})

router.post('/signup', function (req, res, next) {
    var salt = crypto.randomBytes(16)
    crypto.pbkdf2(req.body.password, salt, 310000, 32, 'sha256', function(err, hashedPassword) {
        if (err) { return next(err) }
        let defaultCredits = parseInt(config.credits.default) ? parseInt(config.credits.default) : 100
        // todo check username/email exists, redirect to login if so
        // todo forgot password system via verified email
        User.findOrCreate({where:{username:req.body.username,email:req.body.email,username:req.body.username},defaults:{credits:defaultCredits,hash:hashedPassword,salt:salt}})
        .then(result => {
            let [user,created] = result
            console.log(user)
            console.log(created)
            req.login(user, function(err) {
                console.log('User logged in:',user)
                if (err){return next(err)}
                res.redirect('/')
            })})
        .catch(err => {if (err) { return next(err) }})
        //Users.create({username: req.body.username, email: req.body.email, hash: hashedPassword, salt: salt})
        //.then(user => {req.login(user, function(err) {if (err){return next(err)}res.redirect('/')})})
        //.catch(err => {if (err) { return next(err) }})
    })
})

module.exports = router