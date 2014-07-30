'use strict';
var fs = require('fs')
var path = require('path')
var async = require('async')
var ObjectManage = require('object-manage')
var Resource = require('./resource')
var Parameter = require('./parameter')
var Logger = require('../../helpers/logger')
var request = require('request')
var drivers = require('../drivers')


/**
 * Load a template if there is one
 * @param {Job} job manager
 * @param {object} input
 * @return {ObjectManage}
 */
var loadTemplate = function(job,input){
  if(input instanceof ObjectManage) input = JSON.parse(JSON.stringify(input.data))
  //setup a new object manage
  var obj = new ObjectManage()
  //load our input
  obj.load(input)
  //if there is not a template we are done
  if(!input.template) return obj
  //figure out template location
  var file = path.resolve(__dirname + '/../templates/' + input.template + '.json')
  if(!fs.existsSync(file)){
    job.logger.warning('Requested template ' + input.template + ' doesnt exist')
    return obj
  }
  //since we have an existing template lets grab it
  obj.load(JSON.parse(fs.readFileSync(file)))
  //load our input over it again for overrides
  obj.load(input)
  return obj
}



/**
 * Job processor
 * @param {string} handle
 * @param {JSON} description
 * @constructor
 */
var Job = function(handle,description){
  this.logger = Logger.create('shredder:job:' + handle)
  this.resource = new Resource()
  this.description = new ObjectManage()
  this.description.load(JSON.parse(description))
  this.metrics = new ObjectManage()
  this.metrics.load(JSON.parse(JSON.stringify(this.defaultMetrics)))
}


/**
 * Default metric structure
 * @type {{}}
 */
Job.prototype.defaultMetrics = {
  status: '',
  message: '',
  frames: {
    complete: 0,
    total: 1
  }
}


/**
 * Send job update to the registered callback
 * @param {object} changes
 * @param {function} done
 */
Job.prototype.update = function(changes,done){
  //apply changes
  this.metrics.load(changes)
  //message client
  request(
    {
      method: 'POST',
      url: this.description.get('callback').url,
      json: this.metrics.get()
    },
    function(err){
      if(err) return done(err)
      done()
    }
  )
}


/**
 * Run a driver for the job
 * @param {string} category
 * @param {object} options
 * @param {function} done
 * @return {*}
 */
Job.prototype.runDriver = function(category,options,done){
  var that = this
  if(!(options instanceof Array)) options = [options]
  async.eachSeries(
    options,
    function(options,next){
      options = loadTemplate(that,options)
      //load the parameters
      var param = new Parameter()
      if(options.exists('parameters')) param.load(options.get('parameters'))
      //set the default driver if we dont already have it
      if('resource' === category && !options.exists('driver')) options.set('driver','http')
      //check to see if the driver exists
      if(!drivers[options.get('driver')]) return next('Driver ' + options.get('driver') + ' doesnt exist')
      //run the driver
      drivers[options.get('driver')].run(that,param,options,next)
    },
    done
  )
}


/**
 * Obtain resources
 * @param {function} next
 * @return {*}
 */
Job.prototype.obtainResources = function(next){
  var that = this
  //make sure we have a resource section if not we cant do anything
  if(!that.description.exists('resource') || !that.description.get('resource').length)
    return next('No resources defined')
  that.logger.info('Starting to collect defined resources')
  async.each(
    that.description.get('resource'),
    function(item,next){
      that.runDriver('resource',item,next)
    },
    function(err){
      if(err) return next(err)
      that.logger.info('Resource collection finished')
      next()
    }
  )
}


/**
 * Execute encoding jobs
 * @param {function} next
 * @return {*}
 */
Job.prototype.encode = function(next){
  var that = this
  //if there are no encoding operation just continue
  if(!that.description.exists('encoding') || !that.description.get('encoding').length) return next()
  that.logger.info('Starting to execute encoding jobs')
  async.eachSeries(
    that.description.get('encoding'),
    function(item,next){
      item = loadTemplate(that,item)
      console.log(item)
      //load the parameters
      var param = new Parameter()
      if(item.exists('parameters')) param.load(item.get('parameters'))
      if(!item.get('jobs') || !item.get('jobs').length) return next()
      async.eachSeries(
        item.get('jobs'),
        function(item,next){
          console.log(item)
          that.runDriver('encoder',item,next)
        },
        next
      )
    },
    function(err){
      if(err) return next(err)
      that.logger.info('Finished executing encoding jobs')
      next()
    }
  )
}


/**
 * Save resources created during the job
 * @param {function} next
 * @return {*}
 */
Job.prototype.save = function(next){
  var that = this
  //if there is no save section defined, warn and move on
  if(!that.description.exists('save') || !that.description.get('save').length){
    that.logger.warning('No resources will be saved')
    return next()
  }
  //save the resources
  that.resource.save(that.description.get('save'),next)
}


/**
 * Export Job manager
 * @type {Job}
 */
module.exports = Job