const express = require('express')
const passport = require('passport')
const crypto = require('crypto')
const {db,User} = require('../../db')
const {config} = require('../../utils')
const router = express.Router()
const csrf = require('csurf')

// Inject session messages
router.use(function(req, res, next) {
    console.log('Inject session messages into res.locals.messages')
    var msgs = req.session.messages || []
    res.locals.messages = msgs
    res.locals.hasMessages = !! msgs.length
    req.session.messages = []
    if(req.baseUrl === '/login') {
        req.session.save(() => {
            next()
        })
    } else {
        next()
    }
})

// auth / sessions / CSRF

const cookieParser = require('cookie-parser')
router.use(cookieParser())

const ensureLogIn = require('connect-ensure-login').ensureLoggedIn
router.use(require('connect-multiparty')())


// Moved this here from the db setup in case thats the problem
const passportLocalSequelize = require('passport-local-sequelize')
passportLocalSequelize.attachToUser(User, {
	usernameField: 'email',
	hashField: 'hash',
	saltField: 'salt'
})

passport.use(User.createStrategy())
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findByPk(id)
    .then(user => {
      done(null, user);
    })
    .catch(err => {
      done(err, null);
    });
});

// Replace the existing CSRF middleware with this
const csrfProtection = csrf({ cookie: true })
router.use(csrfProtection)
router.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});

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


router.get('/login', function(req, res, next) {
    console.log(req.session)
    console.log(req.session.messages)
    res.render('login')
})

router.post('/login/password', passport.authenticate('local', {
    successReturnToOrRedirect: '/',
    failureRedirect: '/login',
    failureMessage: true
}))

router.post('/logout', function(req, res, next) {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

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

// Configure Discord Strategy
const DiscordStrategy = require('passport-discord').Strategy;
passport.use(new DiscordStrategy({
    clientID: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackURL,
    scope: ['identify', 'email']
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ 
      where: { discordId: profile.id },
      defaults: {
        username: profile.username,
        email: profile.email,
        credits: config.credits.default || 100,
        hash: '', // Add a default value
        salt: ''  // Add a default value
      }
    }).then(([user, created]) => {
      return cb(null, user);
    }).catch(err => {
      return cb(err);
    });
  }
));

// Add Discord login routes
router.get('/auth/discord', passport.authenticate('discord'));

router.get('/auth/discord/callback', 
  passport.authenticate('discord', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  }
);

module.exports = router
