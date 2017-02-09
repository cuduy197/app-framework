// Load packages
var path = require('path')
var isThere = require('is-there')
var copy = require('cpx').copy
var run = require('./run')
var showOnly = require('./show-only')
var read = require('read-file')
var deleteFiles = require('delete')
var xml = require('xml2js')
var write = require('write')
var list = require('list-dir')

// Load configuration
var cfg = require('./config.js')
var app = require(cfg.appRoot + 'package.json')

// Show message
showOnly('iOS build ongoing - please wait ...')

// Create cordova project folder
function createCordovaProject (callback) {
  if (!isThere(path.resolve(cfg.packageRoot, 'cordova/config.xml'))) {
    run('cd "' + cfg.packageRoot + '" && cordova create cordova', function () {
      callback()
    })
  } else {
    callback()
  }
}

// Install cordova plugins
function updateCordovaPlugins (callback) {
  let currentPlugins = isThere(path.resolve(cfg.packageRoot, 'cordova/plugins/fetch.json')) ? require(path.resolve(cfg.packageRoot, 'cordova/plugins/fetch.json')) : {}
  let pluginChanges = []
  for (let p = 0; p < app.useCordovaPlugins.length; p++) {
    if (currentPlugins[app.useCordovaPlugins[p]] === undefined) {
      pluginChanges.push('cordova plugin add ' + app.useCordovaPlugins[p])
    }
  }
  for (let p in currentPlugins) {
    if (app.useCordovaPlugins.indexOf(p) === -1 && p !== 'cordova-plugin-whitelist') {
      pluginChanges.push('cordova plugin rm ' + p)
    }
  }
  if (pluginChanges.length > 0) {
    let command = 'cd "' + path.resolve(cfg.packageRoot, 'cordova') + '" && ' + pluginChanges.join(' && ')
    run(command, function () {
      callback()
    })
  } else {
    callback()
  }
}

// Update cordova www folder and config.xml
function updateCordovaBuild (callback) {
  // Get version of last build to be used
  var htaccess = read.sync(path.resolve(cfg.appRoot, 'www/.htaccess'), 'utf8')
  var version = htaccess.match(/build-(.+)\//)[1]
  // Build folder exists
  if (isThere(path.resolve(cfg.appRoot, 'www/build-' + version))) {
    // Delete cordova www folder
    deleteFiles(path.resolve(cfg.packageRoot, 'cordova/www/**/*'), function (err) {
      if (err) {
        throw new Error(err)
      } else {
        // Copy build files
        copy(path.resolve(cfg.appRoot, 'www/build-' + version + '/**/*'), path.resolve(cfg.packageRoot, 'cordova/www'), function (err) {
          if (err) {
            throw new Error(err)
          } else {
            // Read cordova config file
            read(path.resolve(cfg.packageRoot, 'cordova/config.xml'), 'utf-8', function (err, content) {
              if (err) {
                throw new Error(err)
              } else {
                // Parse cordova config file
                let xmlParser = new xml.Parser()
                xmlParser.parseString(content, function (err, cordovaConfig) {
                  if (err) {
                    throw new Error(err)
                  } else {
                    // Clean-up cordova config
                    for (let i in cordovaConfig.widget) {
                      if (i === 'platform') {
                        for (let i2 in cordovaConfig.widget[i]) {
                          // Remove icons
                          if (cordovaConfig.widget[i][i2].icon !== undefined) {
                            delete cordovaConfig.widget[i][i2].icon
                          }
                        }
                      }
                    }
                    // Update application name
                    cordovaConfig.widget.name = app.title

                    // Add icons
                    cordovaConfig.widget.platform[1].icon = []
                    let iconFolder = path.resolve(cfg.packageRoot, 'icons')
                    let icons = list.sync(iconFolder)
                    for (let i = 0; i < icons.length; i++) {
                      let icon = icons[i]
                      if (/icon-with-background-([0-9]+)\.png/.test(icon)) {
                        cordovaConfig.widget.platform[1].icon.push({
                          $: {
                            src: path.join('..', 'icons', icon),
                            width: icon.match(/icon-with-background-([0-9]+)\.png/)[1],
                            height: icon.match(/icon-with-background-([0-9]+)\.png/)[1]
                          }
                        })
                      }
                    }
                    // Build cordova config file
                    let builder = new xml.Builder()
                    let cordovaConfigXml = builder.buildObject(cordovaConfig)
                    // Save cordova config file
                    write(path.resolve(cfg.packageRoot, 'cordova/config.xml'), cordovaConfigXml, function (err) {
                      if (err) {
                        throw new Error(err)
                      } else {
                        callback()
                      }
                    })
                  }
                })
              }
            })
          }
        })
      }
    })
  } else {
    throw new Error(version === '0.0.0' ? 'You must build your application first.' : 'Build folder "www/build-' + version + '" not found.')
  }
}

// (Re)build cordova ios platform
function buildCordovaIos (callback) {
  let removePlatform = isThere(path.resolve(cfg.packageRoot, 'cordova/platforms/ios')) ? 'cordova platform rm ios && ' : ''
  run('cd "' + path.resolve(cfg.packageRoot, 'cordova') + '" && ' + removePlatform + 'cordova platform add ios', function () {
    callback()
  })
}

// Start build process
createCordovaProject(function () {
  updateCordovaPlugins(function () {
    updateCordovaBuild(function () {
      buildCordovaIos(function () {
        run('open -a Xcode "' + path.resolve(cfg.packageRoot, 'cordova/platforms/ios', app.title + '.xcodeproj') + '"')
        showOnly('iOS build done! Please open Xcode to run the simulator or to publish your application to the App Store.')
      })
    })
  })
})
