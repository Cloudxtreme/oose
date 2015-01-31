'use strict';
var P = require('bluebird')
var program = require('commander')
var fs = require('graceful-fs')
var MemoryStream = require('memory-stream')
var oose = require('oose-sdk')
var ProgressBar = require('progress')
var promisePipe = require('promisepipe')

var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../config')

//setup a connection to our prism
var prism = oose.api.prism(config.prism)

//setup cli parsing
program
  .version(config.version)
  .option('-a, --above <n>','Files above this count will be analyzed')
  .option('-A, --at <n>','Files at this count will be analyzed')
  .option('-b, --below <n>','Files below this count will be analyzed')
  .option('-d, --desired <n>','Desired clone count')
  .option('-e, --exists','Use content exists instead of content ' +
    'detail for analysis')
  .option('-f, --file <s>','SHA1 of file to check')
  .option('-i, --input <s>','List of SHA1s line separated ' +
  'to analyze, use - for stdin')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-r, --remove','Remove target files')
  .parse(process.argv)

var analyzeFiles = function(progress,fileList){
  var files = {}
  var existsUrl =
    prism.url(program.exists ? '/content/exists' : '/content/detail')
  return P.try(function(){
    return fileList
  })
    .each(function(sha1){
      return prism.postAsync({
        url: existsUrl,
        json: {
          sha1: sha1
        }
      })
        .spread(prism.validateResponse())
        .spread(function(res,body){
          var add = 0
          var remove = 0
          if(
            (program.above && body.count > program.above) ||
            (program.below && body.count < program.below) ||
            (program.at && body.count === program.at)
          ){
            if(program.desired > body.count){
              add = program.desired - body.count
            } else {
              remove = body.count - program.desired
            }
          }
          files[sha1] = {
            sha1: sha1,
            exists: body.exists,
            count: body.count,
            add: add,
            remove: remove,
            map: body.map
          }
        })
        .catch(prism.handleNetworkError)
        .catch(NetworkError,UserError,function(err){
          console.log('Error analyzing file',err)
          files[sha1] = {
            sha1: sha1,
            exists: false,
            count: 0,
            add: 0,
            remove: 0,
            map: false
          }
        })
        .finally(function(){
          progress.tick()
        })
    })
    .then(function(){
      return files
    })
}

var addClones = function(file){
  var promises = []
  var addClone = function(file){
    return new P(function(resolve){
      console.log(file.sha1,'Would have added a clone')
      process.nextTick(resolve)
    })
  }
  for(var i = 0; i < file.add; i++){
    promises.push(addClone(file))
  }
  return P.all(promises)
}

var removeClones = function(file){
  var promises = []
  var removeClone = function(file){
    return new P(function(resolve){
      console.log(file.sha1,'Would have removed a clone')
      process.nextTick(resolve)
    })
  }
  for(var i = 0; i < file.add; i++){
    promises.push(removeClone(file))
  }
  return P.all(promises)
}

var processFile = function(file){
  return P.try(function(){
    if(file.add > 0){
      return addClones(file)
    }
  })
    .then(function(){
      if(file.remove > 0){
        return removeClones(file)
      }
    })
    .then(function(){
      console.log(file.sha1,'Processing complete')
    })
}

var files = {}
var fileStream = new MemoryStream()
var fileList = []
var fileCount = 0
P.try(function(){
  var welcomeMessage = 'Welcome to the OOSE v' + config.version + ' clonetool!'
  console.log(welcomeMessage)
  console.log('--------------------')
  //do some validation
  if(!program.file && !program.input){
    throw new UserError('No file list or file provided')
  }
  //set the desired to the default of 2 if not set
  if(!program.desired) program.desired = 2
  //if no other target information provided look for files below the default
  if(!program.below && !program.above){
    program.below = 2
    program.above = false
  }
  //print rule changes
  var changeVerb = 'below'
  if(program.above) changeVerb = 'above'
  if(program.at) changeVerb = 'at'
  console.log('You have asked for ' + program.desired + ' clone(s) of each file ' + changeVerb + ' ' + program[changeVerb] + ' clone(s)')
  console.log('--------------------')
  //get file list together
  if(program.file){
    fileStream.write(program.file)
  } else if('-' === program.input){
    return promisePipe(process.stdin,fileStream)
  } else {
    return promisePipe(fs.createReadStream(program.input),fileStream)
  }
})
  .then(function(){
    fileList = fileStream.toString().split('\n')
    fileList = fileList.filter(function(a){
      return a.match(/^[0-9a-f]{40}$/i)
    })
    fileCount = fileList.length
    var progress = new ProgressBar('  analyzing [:bar] :percent :etas',{
      total: fileCount,
      width: 50,
      complete: '=',
      incomplete: '-'
    })
    console.log('Found ' + fileCount + ' file(s) to be analyzed')
    return analyzeFiles(progress,fileList)
  })
  .then(function(result){
    files = result
    var keys = Object.keys(files)
    var file
    var doesntExist = 0
    var add = 0
    var addTotal = 0
    var remove = 0
    var removeTotal = 0
    var unchanged = 0
    for(var i = 0; i < keys.length; i++){
      file = files[keys[i]]
      if(!file.exists) doesntExist++
      else if(file.add > 0){
        addTotal += file.add
        add++
      }
      else if(file.remove > 0){
        removeTotal += file.remove
        remove++
      }
      else unchanged++
    }
    console.log('Analysis complete...')
    console.log('--------------------')
    console.log(fileCount + ' total file(s)')
    console.log(add + ' file(s) want clones totalling ' +
      addTotal + ' new clone(s)')
    console.log(remove + ' file(s) dont need as many clones totalling ' +
      removeTotal + ' fewer clones')
    console.log(unchanged + ' file(s) will not be changed')
    console.log(doesntExist + ' file(s) dont exist')
    console.log('--------------------')
    if(program.pretend){
      console.log('Pretend mode selected, taking no action, bye!')
      process.exit()
    }
    return Object.keys(files)
  })
  .each(function(sha1){
    var file = files[sha1]
    if(file.add > 0 || file.remove > 0){
      console.log('--------------------')
      console.log(file.sha1 + ' starting to process changes')
      return processFile(file)
    }
  })
  .catch(UserError,function(err){
    console.log('Oh no! An error has occurred :(')
    console.log(err.stack)
  })
