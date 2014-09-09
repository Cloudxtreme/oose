'use strict';
var async = require('async')
var axon = require('axon')
var crypto = require('crypto')
var debug = require('debug')('oose:clone')
var fs = require('graceful-fs')
var net = require('net')
var prettyBytes = require('pretty-bytes')

var child = require('../helpers/child').child
var file = require('../helpers/file')
var logger = require('../helpers/logger').create('clone')
var peer = require('../helpers/peer')
var Sniffer = require('../helpers/Sniffer')

var config = require('../config')
var server = axon.socket('rep')


/**
 * Clone a file to another peer
 * @param {object} job
 * @param {function} cb
 */
var clone = function(job,cb){
  if('function' !== typeof cb) cb = function(){}
  var done = function(err){
    if(err) logger.error(job.sha1 + ' failed to replicate: ' + err)
    cb(err)
  }
  //track some stats
  var winner
  var bytesSent = 0
  var start = +(new Date())
  var shasum = crypto.createHash('sha1')
  //start process
  async.series(
    [
      //get peer
      function(next){
        peer.next(config.hostname,function(err,result){
          if(err) return next(err)
          if(!result) return next('No suitable peer found')
          winner = result
          next()
        })
      },
      function(next){
        logger.info('Starting to replicate ' + job.sha1)
        //setup streams
        var rs = fs.createReadStream(file.pathFromSha1(job.sha1))
        var ws = net.connect(+winner.portImport,winner.ip)
        ws.on('connect',function(){
          var sniff = new Sniffer()
          sniff.on('data',function(buff){
            sniff.pause()
            shasum.update(buff)
            bytesSent = bytesSent + buff.length
            sniff.resume()
          })
          ws.on('finish',function(){
            var sha1 = shasum.digest('hex')
            var duration = ((+new Date()) - start) / 1000
            if(!bytesSent) bytesSent = 0
            if(!duration) duration = 1
            var bytesPerSec = prettyBytes(bytesSent / duration) + '/sec'
            logger.info(
              'Finished replicating ' + job.sha1 +
              ' as ' + sha1 +
              ' to ' + winner.hostname + '.' + winner.domain +
              ' in ' + duration + ' seconds ' +
              'averaging ' + bytesPerSec)
            next()
          })
          sniff.on('error',next)
          rs.pipe(sniff).pipe(ws)
        })
      }
    ],
    function(err){
      done(err)
    }
  )
}

var q = async.queue(clone,config.clone.concurrency || 1)
//TESTING
//q.push({sha1: '77e89411d8747bcc6003bdd35768adeddfbca4cd'})


/**
 * Handle new jobs
 * @param {object} message
 * @param {function} reply
 */
var newJob = function(message,reply){
  debug('got new job',message)
  q.push({sha1: message.sha1})
  reply(null,{status: 'ok', position: q.length()})
}

if(require.main === module){
  child(
    'oose:clone',
    function(done){
      //start tcp
      server.bind(config.clone.port,config.clone.host)
      // shred:job:push - queue entry acceptor
      server.on('message',function(message,reply){
        newJob(message,reply)
      })
      server.on('error',function(err){
        logger.warning('Server socket error',err)
      })
      debug('Listening for new clone jobs')
      //check and see if there is a snapshot if so load it
      done()
    },
    function(done){
      server.close(done)
    }
  )
}