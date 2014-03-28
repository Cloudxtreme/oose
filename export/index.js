'use strict';
var express = require('express')
  , app = express()
  , redis = require('../helpers/redis')
  , fs = require('fs')
  , config = require('../config')
  , file = require('../helpers/file')

app.get('/:sha1/:filename',function(req,res){
  var sha1 = req.params.sha1
  if(!sha1){
    res.send('Invalid path')
  } else {
    var path = file.pathFromSha1(sha1)
    redis.hget(sha1,'stat',function(err,stat){
      if(err){
        console.log(err)
        res.send(err)
      } else {
        //convert stats to an object
        stat = JSON.parse(stat)
        if(!fs.existsSync(path)){
          res.status(404)
          res.send('File not found')
        } else {
          //update hits
          redis.hincrby(sha1,'hits',1)
          //add attachment for a download
          if(req.query.download){
            res.set('Content-Disposition','attachment; filename=' + req.params.filename)
          }
          //set headers
          res.set('Content-Length',stat.size)
          res.set('Content-Type',stat.type)
          //setup read stream from the file
          var rs = fs.createReadStream(path)
          //update bytes sent
          rs.on('data',function(data){
            redis.hincrby(sha1,'sent',data.length)
          })
          rs.pipe(res)
        }
      }
    })
  }
})

exports.start = function(done){
  app.listen(config.get('serve.port'),config.get('serve.host'),done)
}

if(require.main === module){
  exports.start(function(){
    var logger = require('../helpers/logger')
    logger.info('Serve  started listening on port ' + config.get('serve.port'))
  })
}