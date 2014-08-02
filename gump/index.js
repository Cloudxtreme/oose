'use strict';
var express = require('express')
  , app = express()
  , config = require('../config')
  , server = require('http').createServer(app)
  , routes = require('./routes')
  , busboy = require('connect-busboy')
  , flash = require('connect-flash')
  , RedisStore = require('connect-redis')(express)

var running = false

app.locals.pretty = true
app.locals.version = config.get('version')
app.locals.prettyBytes = require('pretty-bytes')

app.set('views',__dirname + '/views')
app.set('view engine','jade')

app.use(express.static(__dirname + '/public'))
app.use(express.urlencoded())
app.use(express.json())
app.use(busboy())
app.use(express.cookieParser(config.get('gump.cookie.secret')))
app.use(express.session({
  cookie: {
    maxAge: config.get('gump.cookie.maxAge')
  },
  store: new RedisStore(),
  secret: config.get('gump.cookie.secret')
}))
app.use(flash())
app.use(function(req,res,next){
  res.locals.flash = req.flash.bind(req)
  next()
})

//login functionality
app.use(function(req,res,next){
  //allow public routes
  if(req.url.match(/\/(api|download|embed)\//)) return next()
  //dont redirect loop the login page however makr sure we are there when not logged in
  if(!req.session.user && req.url.indexOf('/login') < 0){
    return res.redirect('/login')
  }
  //normally user is logged in
  app.locals.user = req.session.user
  next()
})

//----------------
//public routes
//----------------

//api
app.get('/api/embedDetails/:handle',routes.embed.apiDetails)
app.post('/api/shredderUpdate',routes.shredderUpdate)

//download
app.get('/download',routes.download)

//embed
app.get('/embed/:handle',routes.embed.render)


//----------------
//private routes
//----------------

//auth
app.post('/login',routes.user.login)
app.get('/login',routes.user.login)
app.get('/logout',routes.user.logout)

//users (admin)
app.post('/users',routes.user.list)
app.post('/users/save',routes.user.save)
app.get('/users',routes.user.list)
app.get('/users/create',routes.user.form)
app.get('/users/edit',routes.user.form)

//file manage
app.post('/upload',routes.upload)
app.post('/folderCreate',routes.folderCreate)
app.post('/',routes.fileRemove)
app.get('/file',routes.file)
app.get('/',routes.index)


/**
 * Start server
 * @param {function} done
 */
exports.start = function(done){
  server.listen(config.get('gump.port'),config.get('gump.host'),function(err){
    if(err) return done(err)
    running = true
    done()
  })
}


/**
 * Stop server
 * @param {function} done
 */
exports.stop = function(done){
  if('function' !== typeof done) done = function(){}
  if(server && running) server.close()
  done()
}
