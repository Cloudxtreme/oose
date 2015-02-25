'use strict';
var P = require('bluebird')
var clc = require('cli-color')
var Table = require('cli-table')
var program = require('commander')
var fs = require('graceful-fs')
var MemoryStream = require('memory-stream')
var oose = require('oose-sdk')
var ProgressBar = require('progress')
var promisePipe = require('promisepipe')
var random = require('random-js')()

var NetworkError = oose.NetworkError
var UserError = oose.UserError

var config = require('../config')

//setup a connection to our prism
var prism = oose.api.prism(config.prism)

//setup a connection to the master
var master = oose.api.master(config.master)

//setup cli parsing
program
  .version(config.version)
  .option('-a, --above <n>','Files above this count will be analyzed')
  .option('-A, --at <n>','Files at this count will be analyzed')
  .option('-b, --below <n>','Files below this count will be analyzed')
  .option('-B, --block-size <n>','Number of files to analyze at once')
  .option('-d, --desired <n>','Desired clone count')
  .option('-D, --detail <s>','SHA1 of file to get details about')
  .option('-i, --input <s>','List of SHA1s line separated ' +
  'to analyze, use - for stdin')
  .option('-p, --pretend','Dont actually make and clones just analyze')
  .option('-r, --remove','Remove target files')
  .option('-s, --sha1 <s>','SHA1 of file to check')
  .parse(process.argv)

var analyzeFiles = function(progress,fileList){
  var files = {}
  var fileCount = fileList.length
  var blockSize = program.blockSize || 100
  var blocks = Math.ceil(fileCount / blockSize)
  var analyzeBlock = function(files){
    return prism.postAsync({
      url: prism.url('/content/exists'),
      json: {
        sha1: files
      }
    })
      .spread(prism.validateResponse())
      .spread(function(res,body){
        var keys = Object.keys(body)
        var compileResult = function(sha1){
          var add = 0
          var remove = 0
          if(
            (program.above && body[sha1].count > program.above) ||
            (program.below && body[sha1].count < program.below) ||
            (program.at && body[sha1].count === program.at)
          ){
            if(program.desired > body[sha1].count){
              add = program.desired - body[sha1].count
            } else {
              remove = body[sha1].count - program.desired
            }
          }
          return {
            sha1: sha1,
            ext: body[sha1].ext,
            exists: body[sha1].exists,
            count: body[sha1].count,
            add: add,
            remove: remove,
            map: body[sha1].map
          }
        }
        for(var i = 0; i < keys.length; i++){
          files[keys[i]] = compileResult(keys[i])
        }
        return body
      })
      .catch(prism.handleNetworkError)
      .catch(UserError,NetworkError,function(){
        files.forEach(function(sha1){
          files[sha1] = {
            sha1: sha1,
            exists: false,
            count: 0,
            add: 0,
            remove: 0,
            map: {}
          }
        })
      })
      .finally(function(){
        progress.tick(files.length)
      })
  }
  return P.try(function(){
    var blockList = []
    for(var i = 0; i < blocks; i++){
      blockList.push(fileList.slice(i * blockSize,blockSize))
    }
    return blockList
  })
    .each(function(block){
      return analyzeBlock(block)
    })
    .then(function(){
      return files
    })
}

var addClones = function(file){
  var promises = []
  var addClone = function(file){
    console.log(file.sha1,'Starting to add a clone')
    // so to create a clone we need to figure out a source store
    var prismFromWinner
    var storeFromWinner
    var prismToWinner
    var storeToWinner
    var storeFromList =[]
    var storeToList = []
    //iteration vars
    var prismNameList = Object.keys(file.map)
    var storeNameList = []
    var storeName = ''
    var prismName = ''
    var i, j
    // figure out a source store
    for(i = 0; i < prismNameList.length; i++){
      prismName = prismNameList[i]
      storeNameList = Object.keys(file.map[prismName])
      for(j = 0; j < storeNameList.length; j++){
        storeName = storeNameList[j]
        if(file.map[prismName].map[storeName]){
          storeFromList.push({prism: prismName, store: storeName})
        }
      }
    }
    // now we know possible source stores, randomly select one
    storeFromWinner = storeFromList[
      random.integer(0,(storeFromList.length - 1))]
    prismFromWinner = storeFromWinner.prism
    // figure out a destination store
    for(i = 0; i < prismNameList.length; i++){
      prismName = prismNameList[i]
      storeNameList = Object.keys(file.map[prismName])
      for(j = 0; j < storeNameList.length; j++){
        storeName = storeNameList[j]
        if(
          prismName !== prismFromWinner &&
          !file.map[prismName].map[storeName]
        ){
          storeToList.push({prism: prismName, sotre: storeName})
        }
      }
    }
    //figure out a dest winner
    storeToWinner = storeToList[
      random.integer(0,(storeToList.length - 1))]
    prismToWinner = storeToWinner.prism
    //inform of our decision
    console.log(file.sha1,'Sending from ' + storeFromWinner.store +
    ' to ' + storeToWinner.store + ' on prism ' + prismToWinner)
    //get a list of stores from master
    return master.postAsync({
      url: master.url('/store/list')
    })
      .spread(master.validateResponse())
      .spread(function(res,body){
        console.log(body)
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

var contentDetail = function(sha1){
  return prism.postAsync({
    url: prism.url('/content/exists'),
    json: {
      sha1: sha1
    }
  })
    .spread(prism.validateResponse())
    .spread(function(res,body){
      var table = new Table()
      table.push(
        {SHA1: clc.yellow(body.sha1)},
        {'File Extension': clc.cyan(body.ext)},
        {Exists: body.exists ? clc.green('Yes') : clc.red('No')},
        {'Clone Count': clc.green(body.count)}
      )
      console.log(table.toString())
      var prisms = Object.keys(body.map)
      prisms.forEach(function(prismName){
        console.log(' ' + clc.cyan(prismName))
        var stores = Object.keys(body.map[prismName].map)
        var existsLine = '  '
        stores.forEach(function(store){
          if(body.map[prismName].map[store])
            existsLine += clc.green(store) + '  '
          else existsLine += clc.red(store) + '  '
        })
        console.log('\n' + existsLine + '\n')
        console.log(' Total: ' +
          clc.yellow(body.map[prismName].count) + ' clone(s)\n')
      })
      process.exit()
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
  if(program.detail){
    return contentDetail(program.detail)
  }
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
  console.log('You have asked for ' + program.desired +
    ' clone(s) of each file ' + changeVerb +
    ' ' + program[changeVerb] + ' clone(s)')
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
    var progress = new ProgressBar(
      '  analyzing [:bar] :current/:total :percent :etas',
      {
        total: fileCount,
        width: 50,
        complete: '=',
        incomplete: '-'
      }
    )
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
