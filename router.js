const User = require('./usershandler.js')
require('dotenv').load()
const request = require('request');
const pgdb = require('./db')
var users = []

function getUserIndex(id){
  console.log("USERS LENGTH:" + users.length)
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (user != null){
      console.log("USER ID:" + user.getUserId())
      if (id == user.getUserId()){
        return i
      }
    }
  }
  return -1
}

function getUserIndexByExtensionId(extId){
  console.log("USERS LENGTH:" + users.length)
  for (var i=0; i<users.length; i++){
    var user = users[i]
    console.log("EXTENSiON ID:" + user.getExtensionId())
    if (extId == user.getExtensionId()){
      return i
    }
  }
  return -1
}

var router = module.exports = {
  loadLogin: function(req, res){
    if (req.query.env == "demo"){
      var user = null
      var index = getUserIndex(100)
      if (index < 0){
        req.session.userId = 100;
        user = new User(100, req.query.env)
        user.setExtensionId(100)
        users.push(user)
      }else{
        user = users[index]
        req.session.userId = 100;
        req.session.extensionId = 100;
      }
      user.loadDemo()
      res.render('readlog', {
        userName: "Demo Guy",
        userLevel: 'demo',
        autoProcessingOn: false
      })
      return
    }
    if (req.session.userId == 0) {
      console.log("load login page")
      var id = new Date().getTime()
      console.log(id)
      req.session.userId = id;
      var user = new User(id, req.query.env)
      users.push(user)
      var p = user.getPlatform()
      if (p != null){
        res.render('login', {
          authorize_uri: p.loginUrl({ // authUrl
            brandId: process.env.RINGCENTRAL_BRAND_ID,
            redirectUri: process.env.RC_APP_REDIRECT_URL
          }),
          redirect_uri: process.env.RC_APP_REDIRECT_URL,
          token_json: ''
        });
      }
    }else{
      console.log("Must be a reload page")
      var index = getUserIndex(req.session.userId)
      if (index >= 0)
        users[index].loadReadLogPage(req, res)
        /*
        res.render('readlog', {
          userName: users[index].getUserName(),
          userLevel: users[index].getUserLevel()
        })
        */
      else{
        this.forceLogin(req, res)
      }
    }
  },
  forceLogin: function(req, res){
    console.log("FORCE LOGIN")
    req.session.destroy();
    res.render('index')
    //users[index].forceLogin(req, res)
  },
  login: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].login(req, res, function(err, extensionId){
      // result contain extensionId. Use it to check for orphan user and remove it
      if (!err){
        console.log("USERLENGTH: " + users.length)
        for (var i = 0; i < users.length; i++){
          console.log("REMOVING")
          var extId = users[i].getExtensionId()
          var userId = users[i].getUserId()
          if (extId == extensionId && userId != req.session.userId){
            console.log("REMOVE USER: " )
            users[i] = null
            users.splice(i, 1);
            break
          }
        }
      }
    })
  },
  logout: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0){
      return this.forceLogin(req, res)
    }
    var thisObj = this
    users[index].logout(req, res, function(err, result){
      users[index] = null
      console.log("user length before: " + users.length)
      users.splice(index, 1);
      console.log("user length after: " + users.length)
      thisObj.forceLogin(req, res)
    })

  },
  subscribeForNotification: function (req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return //this.forceLogin(req, res)
    users[index].subscribeForNotification(req, res)
  },
  removeSubscription: function(req, res) {
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return //this.forceLogin(req, res)
    users[index].removeSubscription(res)
  },
  handleWebhooksPost: function(jsonObj){
    //console.log(jsonObj)
    //console.log(jsonObj.body.extensionId)
    var index = getUserIndexByExtensionId(jsonObj.ownerId)
    if (index < 0)
      return
    users[index].handleWebhooksPost(jsonObj)

  },
  handleRevAIWebhookPost: function(body){
    console.log("handleRevAIWebhookPost called")
    var json = JSON.parse(body)
    //console.log(json.job.id)
    //console.log(json.job.created_on)
    //console.log(json.job.status)
    var query = "SELECT * FROM inprogressedtranscription WHERE transcript_id=" + json.job.id;
    pgdb.read(query, (err, result) => {
      //console.log(result)
      if (err){
        // not found?
      }else if (result.rows.length == 1){
        console.log("transcript_id found")
        // found the transcript_id, use it to check and renew
        var transcriptId = result.rows[0].transcript_id
        var itemId = result.rows[0].item_id
        var extensionId = result.rows[0].ext_id
        console.log(transcriptId)
        console.log(itemId)
        console.log(extensionId)
        var query = "DELETE FROM inprogressedtranscription WHERE transcript_id=" + json.job.id;
        //console.log(query)
        pgdb.remove(query, function (err, result) {
          if (err){
            console.error(err.message);
          }
            console.error("DELETE transcriptionId item from inprogressedtranscription");
        });
        if (json.job.status == "transcribed") {
          // detect user then call to analyze transcript
          var index = getUserIndexByExtensionId(extensionId)
          if (index < 0)
            return
          users[index].handleRevAIWebhookPost(transcriptId, itemId)
        }else{
          // delete pending inprogress transcription
          // update calllist item with processed to 0
          var table = "user_" + extensionId
          var query = "UPDATE " + table + " SET processed=0"
          query += " WHERE uid=" + itemId;
          pgdb.update(query, (err, result) => {
            if (err){
              console.error(err.message);
            }else{
              console.log("UPDATE CL DB: " + result);
            }
          });
        }
      }
    })
  },
  removeItemFromDB: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].removeItemFromDB(req, res)
  },
  deleteItemFromCallLogDb: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].deleteItemFromCallLogDb(req, res)
  },
  createRecord: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].createRecord(req, res)
  },
  transcriptCallRecording: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].transcriptCallRecording(req, res)
  },
  saveNewSubject: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].saveNewSubject(req, res)
  },
  saveFullName: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].saveNewFullName(req, res)
  },
  analyzeContent: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].analyzeContent(req, res)
  },
  proxyAudio: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
      console.log(req.query.url);
    let remoteReq = request.get(req.query.url);
    req.on('close', function() {
        remoteReq.abort();
        res.end();
    });
    req.pipe(remoteReq).pipe(res);
  },
  // use async
  readCallRecordingsAsync: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readCallRecordingsAsync(req, res)
  },
  findSimilar: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].findSimilar(req, res)
  },
  searchCallsFromDB: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].searchCallsFromDB(req, res)
  },
  loadCallsFromDB: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].loadCallsFromDB(req, res)
  },
  loadReadLogPage(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].loadReadLogPage(req, res)
  },
  checkTranscriptionResult: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    var query = "SELECT processed FROM " + users[index].getUserTable() + " WHERE uid=" + req.query.uid;
    //console.log(query)
    pgdb.read(query, function (err, result) {
      if (err){
        res.send('{"status":"error"}')
        return console.error(err.message);
      }
      //console.log("RESULT: " + JSON.stringify(result))
      //console.log("PROCESS: " + result.rows[0].processed)
      res.send('{"status":"ok","state":' + result.rows[0].processed + ',"uid":' + req.query.uid + '}')
    });
  },
  cancelTranscriptionProcess: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    var query = "UPDATE " + users[index].getUserTable() + " SET processed=0 WHERE uid=" + req.query.uid;
    //console.log(query)
    pgdb.update(query, function (err, result) {
      if (err){
        res.send('{"status":"error"}')
        return console.error(err.message);
      }
      console.log("RESULT: " + JSON.stringify(result))
      res.send('{"status":"ok","state":0,"uid":' + req.query.uid + '}')
    });
  }
}
