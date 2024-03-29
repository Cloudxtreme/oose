'use strict';
var P = require('bluebird')
var basicAuth = require('basic-auth-connect')
var bodyParser = require('body-parser')
var express = require('express')
var fs = require('graceful-fs')
var https = require('https')
var worker = require('infant').worker

var redis = require('../helpers/redis')
var userSessionValidate = require('../helpers/userSessionValidate')

var app = express()
var config = require('../config')
var sslOptions = {
  key: fs.readFileSync(config.ssl.pem),
  cert: fs.readFileSync(config.ssl.pem)
}
var server = https.createServer(sslOptions,app)
var routes = require('./routes')

//make some promises
P.promisifyAll(server)

//setup
app.use(bodyParser.json({limit: '100mb'}))

//track requests
app.use(function(req,res,next){
  redis.incr(redis.schema.counter('prism','requests'))
  next()
})

//--------------------
//public routes
//--------------------

//home page
app.get('/',routes.index)
app.post('/',routes.index)

//health test
app.get('/ping',routes.ping)
app.post('/ping',routes.ping)

//stats
app.get('/stats',routes.stats)
app.post('/stats',routes.stats)

app.get('/crossdomain.xml',function(req,res){
  redis.incr(redis.schema.counter('prism','crossdomain'))
  res.sendFile(__dirname + '/public/crossdomain.xml')
})

//--------------------
//protected routes
//--------------------

//user functions
app.post('/user/login',routes.user.login)
app.post('/user/logout',userSessionValidate,routes.user.logout)
app.post(
  '/user/session/validate',userSessionValidate,routes.user.sessionValidate)

//content functions
app.post('/content/detail',userSessionValidate,routes.content.detail)
app.post('/content/upload',userSessionValidate,routes.content.upload)
app.post('/content/retrieve',userSessionValidate,routes.content.retrieve)
app.post('/content/purchase',userSessionValidate,routes.content.purchase)
app.post(
  '/content/purchase/remove',userSessionValidate,routes.content.purchaseRemove)
app.post('/content/download',userSessionValidate,routes.content.download)

//--------------------
//private routes
//--------------------
var auth = basicAuth(config.prism.username,config.prism.password)

//cache management
app.post('/cache/flush',auth,routes.cache.flush)
app.post('/cache/detail',auth,routes.cache.detail)

//content
app.post('/content/exists',auth,routes.content.exists)
app.put('/content/put/:file',auth,routes.content.put)

//static content
app.get('/static/:hash/:filename',routes.content.contentStatic)


//main content retrieval route
app.get('/:token/:filename',routes.content.deliver)


/**
* Start oose prism
* @param {function} done
*/
exports.start = function(done){
  server.listenAsync(+config.prism.port,config.prism.host)
    .then(function(){
      done()
    })
}


/**
 * Stop oose prism
 * @param {function} done
 */
exports.stop = function(done){
  //dont wait for this since it will take to long and we are stopping now
  server.close()
  //just return now
  done()
}

if(require.main === module){
  worker(
    server,
    'oose:' + config.prism.name + ':worker',
    function(done){
      exports.start(done)
    },
    function(done){
      exports.stop(done)
    }
  )
}
