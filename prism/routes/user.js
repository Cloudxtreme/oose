'use strict';
var P = require('bluebird')

var APIClient = require('../../helpers/APIClient')
var UserError = require('../../helpers/UserError')

var config = require('../../config')

var master = new APIClient(config.master.port,config.master.host)
master.setBasicAuth(config.master.username,config.master.password)


/**
 * User Login
 * @param {object} req
 * @param {object} res
 */
exports.login = function(req,res){
  var data = req.body
  P.try(function(){
    if(data.$sessionToken) throw new UserError('Already logged in')
    return master.post('/user/login',{
      username: req.body.username,
      password: req.body.password,
      ip: req.ip
    })
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
    .catch(Error,function(err){
      if(!err.message.match('invalid user or password')) throw err
      res.json({error: 'Invalid username or password to master'})
    })
}


/**
 * User Logout
 * @param {object} req
 * @param {object} res
 */
exports.logout = function(req,res){
  var data = req.body
  P.try(function(){
    if(!data.$sessionToken) throw new UserError('No token provided')
    return master.post('/user/logout',{token: data.$sessionToken, ip: req.ip})
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Password reset
 * @param {object} req
 * @param {object} res
 */
exports.passwordReset = function(req,res){
  master.post('/user/password/reset',{username: req.session.User.username})
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Session validate
 * @param {object} req
 * @param {object} res
 */
exports.sessionValidate = function(req,res){
  //the middleware will have already validated us
  res.json({success: 'Session valid'})
}


/**
 * Session update
 * @param {object} req
 * @param {object} res
 */
exports.sessionUpdate = function(req,res){
  var data = req.body
  master.post('/user/session/update',{
    token: req.session.token,
    ip: req.ip,
    data: data.data
  })
    .spread(function(response,body){
      res.json(body)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}