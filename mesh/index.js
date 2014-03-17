'use strict';
var config = require('../config')
  , logger = require('../helpers/logger')
  , os = require('os')
  , ds = require('diskspace')
  , bencode = require('bencode')
  , dgram = require('dgram')
  , path = require('path')
  , shortlink = require('shortlink')
  , ip = require('ip')

//utility functions
var getLocalIP = function(){
  var int = os.networkInterfaces()
  for(var i in int){
    int[i].forEach(function(d){
      if('IPv4' === d.family){
        if(!ip.isLoopback(d.address)){
          return d.address
        }
      }
    })
  }
  return '127.0.0.1'
}

var swap32 = function swap32(val){
  return ((val & 0xFF) << 24)
    | ((val & 0xFF00) << 8)
    | ((val >> 8) & 0xFF00)
    | ((val >> 24) & 0xFF)
}

var session = {
  ip: ip.toLong(getLocalIP()),
  sig: (new Date().getTime()) & 0xffffffff
}
var getHostHandle = function(){
  return shortlink.encode(Math.abs(swap32(session.ip) ^ session.sig) & 0xffffffff)
}

var cpuAverage = function(){
  var totalIdle = 0
    , totalTick = 0
  var cpus = os.cpus()
  for(var i=0,len=cpus.length; i<len; i++){
    for(var type in cpus[i].times) totalTick += cpus[i].times[type]
    totalIdle += cpus[i].times.idle
  }
  return {idle: totalIdle / cpus.length,  total: totalTick / cpus.length}
}
var lastMeasure = cpuAverage()
var getLoad = function(){
  var thisMeasure = cpuAverage()
  var percentageCPU = 100 - ~~(100 * (thisMeasure.idle - lastMeasure.idle) / (thisMeasure.total - lastMeasure.total))
  lastMeasure = thisMeasure
  return percentageCPU
}

//setup server side (listener)
var server = dgram.createSocket('udp4')
server.bind(config.get('serve.port'),function(){
  server.addMembership(config.get('mesh.address'))
  server.setMulticastTTL(config.get('mesh.ttl'))
  server.on('message',function(buf){
    var announce = bencode.decode(buf)
    //ignore ourselves
    if(announce.hostname.toString() === config.get('hostname')) return
    logger.info(
      announce.hostname +
        ' posted a announce' +
        ' at ' + announce.sent +
        ':[' +
        'load:' + announce.load +
        '/' +
        'free:' + announce.free / 1024 +
        ']'
    )
  })
})

//setup client side (announcer)
var client = dgram.createSocket('udp4')
client.bind(function(){
  client.addMembership(config.get('mesh.address'))
  client.setMulticastTTL(config.get('mesh.ttl'))
  var messageTemplate = {
    hostname: config.get('hostname'),
    hostkey: getHostHandle(),
    sent: 0
  }
  var sendAnnounce = function(){
    var message = messageTemplate
    message.load = getLoad()
    var spacepath = path.resolve(config.get('serve.dataRoot'))
    if('win32' === os.platform()) spacepath = spacepath.substr(0,1)
    ds.check(spacepath,function(total,free){
      message.free = parseInt(free,10) || 0
      message.sent = new Date().getTime()
      console.log(message)
      var buf = bencode.encode(message)
      client.send(buf,0,buf.length,config.get('serve.port'),config.get('mesh.address'))
      setTimeout(sendAnnounce,config.get('mesh.interval'))
    })
  }
  sendAnnounce()
})