var tmp = require('tmp')
var yaml = require('js-yaml')
var fs = require('fs')
var Wreck = require('wreck')
var config = require('config')
var logger = require('../log.js')(module)
require('shelljs/global')

var wreck = Wreck.defaults({
  json: true
})

module.exports = function (emitter) {
  installIntoWorkflow(emitter)
  emitter.on('workspace.registeredEvent.examineSource.downloaded.travis', examineSourceTravis)

  function examineSourceTravis (job, queue, cb) {
    var workDirEnv = env['DRONE_WORK_DIR']
    var workDirectory
    if (workDirEnv) workDirectory = tmp.dirSync({dir: workDirEnv, prefix: 'drone-examineSource-', unsafeCleanup: true})
    else workDirectory = tmp.dirSync({prefix: 'drone-examineSource-', unsafeCleanup: true})
    tmp.setGracefulCleanup()

    if (job.trigger === 'github') {
      var doc = null
      try {
        doc = yaml.safeLoad(fs.readFileSync('.travis.yml', 'utf8'))
      } catch (e) {
        console.log(e)
      }
      console.log(doc)
      if(doc.hasOwnProperty('env')) {
        if(doc.env.length > 1) {
          // Matrix build
          var childNo = 1
          doc.env.forEach(function(elem, index, array) {
            var childJob = clone(job)
            console.log('1', childJob)
            childJob.parrent = job.id
            childJob.childNo = childNo
            childJob.status = 'received'
            childJob.trigger = 'rest'
            childJob.triggerInfo.cmds = []
            if(doc.hasOwnProperty('before_install')) childJob.triggerInfo.cmds = childJob.triggerInfo.cmds.concat(doc.before_install)
            if(doc.hasOwnProperty('install')) childJob.triggerInfo.cmds = childJob.triggerInfo.cmds.concat(doc.install)
            if(doc.hasOwnProperty('script')) childJob.triggerInfo.cmds = childJob.triggerInfo.cmds.concat(doc.script)
            childJob.triggerInfo.cmdsEnv = elem
            delete childJob['meta']
            delete childJob['$loki']
            delete childJob['id']
            childNo++

            Wreck.post(config.coreUrl + '/api/v1/jobs', {payload: JSON.stringify(childJob)}, function (err, res, payload) {
              if (err) logger.warn('failed to submit a child job', childJob)
              //logger.info('submitting child job', res)
            })
          })
        }
      }
    }
    if (job.trigger === 'rest') {
      // nothing to do here
    }
    cb(null, null)
  }
}

function installIntoWorkflow (emitter) {
  emitter.emit('workflow.registeredEvent.install',
    'examineSource.downloaded',
    'workspace.registeredEvent.examineSource.downloaded.travis',
    100,
    function (err, res) {
    })
}

function clone(a) {
   return JSON.parse(JSON.stringify(a));
}