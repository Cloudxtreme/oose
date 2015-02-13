'use strict';
var oose = require('oose-sdk')

var sequelize = require('../../helpers/sequelize')()
var UserError = oose.UserError

var Prism = sequelize.models.Prism
var Store = sequelize.models.Store


/**
 * Store list
 * @param {object} req
 * @param {object} res
 */
exports.list = function(req,res){
  var data = req.body
  if(!data.prism){
    Store.findAll({where: {active: true}, include: [Prism]})
      .then(function(results){
        res.json({store: results || []})
      })
  } else {
    Prism.find({where: {name: data.prism}})
      .then(function(prism){
        return prism.getStores({where: {active: true}})
      })
      .then(function(result){
        res.json({store: result || []})
      })
  }
}


/**
 * Store find
 * @param {object} req
 * @param {object} res
 */
exports.find = function(req,res){
  var data = req.body
  Store.find({where: {name: data.name}})
    .then(function(result){
      if(!result) throw new UserError('No store instance found')
      res.json(result.dataValues)
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Create Store
 * @param {object} req
 * @param {object} res
 */
exports.create = function(req,res){
  var data = req.body
  Prism.find({where: {name: data.prism}})
    .then(function(result){
      if(!result) throw new UserError('Could not find prism')
      return Store.create({
        name: data.name,
        host: data.host,
        port: data.port,
        full: !!data.full,
        active: !!data.active,
        PrismId: result.id
      })
    })
    .then(function(result){
      res.json({success: 'Store instance created', id: result.id})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(sequelize.UniqueConstraintError,function(){
      res.json({error: 'Store instance already exists'})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Update an instance
 * @param {object} req
 * @param {object} res
 */
exports.update = function(req,res){
  var data = req.body
  Store.find({
    where: {name: data.name}
  })
    .then(function(result){
      if(!result) throw new UserError('No store instance found for update')
      if(data.host) result.host = data.host
      if(data.port) result.port = data.port
      result.full = !!data.full
      result.active = !!data.active
      return result.save()
    })
    .then(function(){
      res.json({success: 'Store instance updated'})
    })
    .catch(sequelize.ValidationError,function(err){
      res.json({error: sequelize.validationErrorToString(err)})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}


/**
 * Remove prism instance
 * @param {object} req
 * @param {object} res
 */
exports.remove = function(req,res){
  var data = req.body
  Store.destroy({where: {name: data.name}})
    .then(function(count){
      res.json({success: 'Store instance removed', count: count})
    })
    .catch(UserError,function(err){
      res.json({error: err.message})
    })
}