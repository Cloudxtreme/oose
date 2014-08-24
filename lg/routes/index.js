'use strict';
var async = require('async')

var redis = require('../../helpers/redis')


/**
 * Homepage
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  var peerList = [], peers = []
  async.series(
    [
      function(next){
        redis.keys('peer:db:*',function(err,results){
          if(err) return next(err)
          peerList = results
          next()
        })
      },
      function(next){
        async.each(
          peerList,
          function(item,next){
            redis.hgetall(item,function(err,result){
              if(err) return next(err)
              peers.push(result)
              next()
            })
          },
          next
        )
      }
    ],
    function(err){
      if(err) return res.send('An error occurred querying peers: ' + err)
      res.render('index',{
        peers: peers
      })
    }
  )
}
