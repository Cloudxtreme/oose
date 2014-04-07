'use strict';
var readdirp = require('readdirp')
  , config = require('../config')
  , logger = require('../helpers/logger')
  , file = require('../helpers/file')
  , path = require('path')


/**
 * Run inventory
 * @param {function} done
 */
exports.start = function(done){
  if('function' !== typeof done) done = function(){}
  var fileCount = 0
  var root = config.get('root')
  logger.info('[Inventory] Starting to build inventory')
  var rdStream = readdirp({root: path.resolve(root) || path.resolve('./data'), directoryFilter: ['!tmp']})
  rdStream.on('warn',console.error)
  rdStream.on('error',console.error)
  rdStream.on('end',function(){
    done(null,fileCount)
  })
  rdStream.on('data',function(entry){
    fileCount++
    var sha1 = file.sha1FromPath(entry.path)
    file.redisInsert(sha1,function(err){
      if(err) logger.warn('[Inventory] Failed to read ' + sha1 + ' file ' + entry.path + ' ' + err)
    })
  })
}
