var RC = require('ringcentral')
var fs = require('fs')
var async = require("async");
const pgdb = require('./db')
const WatsonEngine = require('./watson.js');
const RevAIEngine = require('./revai.js');
const RCPlatform = require('./platform.js')
require('dotenv').load()

function User(id, mode) {
  this.id = id;
  this.admin = false;
  this.extensionId = "";
  this.extIndex = 0
  this.token_json = {};
  this.extensionList = []
  this.selectedExtensionList = []
  this.categoryList = []
  this.mainCompanyPhoneNumber = ""
  if (mode != "demo"){
    this.notificationUser = {
      extensionId: "",
      telephonyStatus: "NoCall",
      startTime: "",
      hasMissedCall: false,
      callRecording: true
    }
    this.rc_platform = new RCPlatform(this, mode)
  }
  return this
}

User.prototype = {
  setExtensionId: function(id) {
    this.extensionId = id
  },
  setAdmin: function() {
    this.admin = true
  },
  setUserToken: function (token_json){
    this.token_json = token_json
  },
  setUserExtensionList: function (extList){
    this.extensionList = extList
  },
  setMainCompanyNumber: function (phoneNumber){
    this.mainCompanyPhoneNumber = phoneNumber
  },
  setCategoryList: function (catList){
    this.categoryList = catList
  },
  setNotificationUser: function(user) {
    this.notificationUser = user
  },
  getUserId: function(){
    return this.id
  },
  isAdmin: function(){
    return this.admin
  },
  getExtensionId: function(){
    return this.extensionId
  },
  getNotificationUser: function() {
    return this.notificationUser
  },
  getUserToken: function () {
    return this.token_json;
  },
  getExtensionList: function(){
    return this.extensionList;
  },
  getMainCompanyNumber: function(){
    return this.mainCompanyPhoneNumber;
  },
  getUserTable: function(){
    return "user_" + this.extensionId
  },
  getSubscriptionIdTable: function(){
    return "subscriptionids"
  },
  getCategoryList: function(){
    return this.categoryList
  },
  getPlatform: function(){
    return this.rc_platform.getPlatform()
  },
  getSubscriptionId: function(){
    return this.rc_platform.getSubscriptionId()
  },
  getUserName: function(){
    for (var ext of this.extensionList){
      if (ext.id == this.extensionId){
        return ext.fullName
      }
    }
    return "Demo Guy"
  },
  getUserLevel: function(){
    var userLevel = ''
    if (this.getUserId() == 100)
      userLevel = 'demo'
    else{
      if (this.isAdmin())
        userLevel = 'admin'
      else
      userLevel = 'standard'
    }
    return userLevel
  },
  loadDemo: function(){
    createTable("user_100", (err, res) => {

    })
  },
  loadReadLogPage: function(req, res){
    var userName = ""
    var thisRes = res
    for (var ext of this.extensionList){
      if (ext.id == this.extensionId){
        userName = ext.fullName
        break
      }
    }
    var query = "SELECT * FROM " + this.getSubscriptionIdTable() + " WHERE ext_id=" + this.getExtensionId();
    console.log(query)
    pgdb.read(query, (err, result) => {
      //console.log(result)
      var autoProcessing = false
      if(err != null){
        console.log(err);
      }
      if (result.rows.length == 0){
        console.log("no subId found. create one after")
        //this.rc_platform.removeOrphanSubscription(subId, function(err, result){
        //  console.log("OLD ORPHANED SUBSCRIPTION REMOVED")
        //})
      }else{
        // found the subId, use it to check and renew
        var subId = result.rows[0].sub_id
        if (result.rows[0].sub_id != "")
          autoProcessing = true
        console.log(subId)
        this.rc_platform.readRegisteredSubscription(subId)
        /*
        this.rc_platform.removeOrphanSubscription(subId, function(err, result){
          console.log("OLD ORPHANED SUBSCRIPTION REMOVED")
        })
        */
      }

      thisRes.render('readlog', {
        userLevel: this.getUserLevel(),
        userName: userName,
        extensionList: JSON.stringify(this.extensionList),
        autoProcessingOn: autoProcessing
      })
    })
  },
  login: function(req, res, callback){
    var thisReq = req
    if (req.query.code) {
      console.log("CALL LOGIN FROM USER")
      var rc_platform = this.rc_platform
      var thisUser = this
      rc_platform.login(req.query.code, function (err, extensionId){
        if (!err){
          thisUser.extensionId = extensionId
          req.session.extensionId = extensionId;
          console.log("EXTENSION ID: " + thisUser.extensionId)
          console.log('logged_in');
          callback(null, extensionId)
          var thisRes = res
          var p = thisUser.getPlatform()
          console.log('passed getPlatform');
          p.get('/account/~/extension/~/')
            .then(function(response) {
              //console.log(response)
              var jsonObj = response.json();
              //console.log(JSON.stringify(jsonObj))
              //console.log("Account Id: " + jsonObj.account.id)
              thisUser.rc_platform.setAccountId(jsonObj.account.id)
              var table = thisUser.getUserTable()
              createTable(table, function(err, res){
                if (err)
                  console.log("create table failed")

                table = thisUser.getSubscriptionIdTable()
                createTable(table, function(err, res){
                  if (err)
                    console.log('subscription table created failed');
                  createTable("inprogressedtranscription", function(err, res){
                    if (!err)
                      console.log('inprogressedtranscription table created');
                  })
                })
                thisRes.send('login success');
              })
              /*
              table = thisUser.getSubscriptionIdTable()
              createTable(table, function(err, res){
                if (!err)
                  console.log('subscription table created');
                createTable("transcription-inprogress", function(err, res){
                if (!err)
                    console.log('transcription-inprogress table created');
                })
              })
              */
              if (jsonObj.permissions.admin.enabled){
                thisUser.setAdmin(true)
                thisUser.getAccountExtensions(jsonObj.id)
              }else{
                var item = {}
                var extensionList = []
                item['id'] = jsonObj.id
                item['extNum'] = jsonObj.extensionNumber.toString()
                item['fullName'] = jsonObj.contact.firstName + " " + jsonObj.contact.lastName
                console.log(item.fullName)
                console.log(item.extNum)
                extensionList.push(item)
                thisUser.setUserExtensionList(extensionList)
                thisUser.readPhoneNumber()
              }
            })
            .catch(function(e) {
              console.log("Failed")
              console.error(e);
              callback("error", e.message)
            });
        }else {
          console.log("USER HANDLER ERROR: " + thisUser.extensionId)
          callback("error", thisUser.extensionId)
        }
      })
    } else {
      res.send('No Auth code');
      callback("error", null)
    }
  },
  readPhoneNumber: function(){
    var p = this.getPlatform()
    var thisUser = this
    p.get('/account/~/extension/~/phone-number')
      .then(function(response) {
        var jsonObj =response.json();
        var count = jsonObj.records.length
        for (var record of jsonObj.records){
          //console.log(JSON.stringify(record))
          if (record.usageType == "MainCompanyNumber"){
            thisUser.setMainCompanyNumber(record.phoneNumber.replace("+", ""))
            console.log("MainCompanyNumber:" + thisUser.getMainCompanyNumber())
            break;
          }
        }
      })
      .catch(function(e) {
        console.log("Failed")
        console.error(e);
      });
  },
  logout: function(req, res, callback){
    console.log("LOGOUT FUNC")
    var p = this.getPlatform()
    p.logout()
      .then(function (token) {
        console.log("logged out")
        //p.auth().cancelAccessToken()
        //p = null
        callback(null, "ok")
      })
      .catch(function (e) {
        console.log('ERR ' + e.message || 'Server cannot authorize user');
        callback(e, e.message)
      });
  },
  getAccountExtensions: function (){
    var endpoint = '/account/~/extension'
    var params = {
        status: "Enabled",
        type: "User",
        perPage: 1000
    }
    var p = this.getPlatform()
    var thisUser = this
    p.get(endpoint, params)
      .then(function(resp){
        var json = resp.json()
        var extensionList = []
        for (var record of json.records){
          var item = {}
          item['id'] = record.id
          item['extNum'] = record.extensionNumber.toString()
          item['fullName'] = record.contact.firstName + " " + record.contact.lastName
          //console.log(item.fullName)
          extensionList.push(item)
        }
        // add the fake extension info
        var item = {}
        item['id'] = "9999999"
        item['extNum'] = "5000"
        item['fullName'] = "Max Ball"
        extensionList.push(item)
        var item2 = {}
        item2['id'] = "9999999"
        item2['extNum'] = "5001"
        item2['fullName'] = "Joe Lee"
        extensionList.push(item2)
        var item3 = {}
        item3['id'] = "9999999"
        item3['extNum'] = "5002"
        item3['fullName'] = "Susan Carr"
        extensionList.push(item3)
        thisUser.setUserExtensionList(extensionList)
        thisUser.readPhoneNumber(p)
      })
      .catch(function(e){
        throw e
      })
    console.log("DONE getAccountExtensions")
  },
  readCategories: function(nextQuery, retObj, res, field, keyword){
      var query = "SELECT categories FROM " + this.getUserTable();
      var categoryArr = []
      pgdb.read(query, (err, result) => {
        //console.log(result.rows)
        if(err != null){
          console.log(err);
          return categoryArr
          //callback(err);
        }
        if (result.rows.length == 0){
          var response = {}
          res.send(response)
        }else
          //console.log("category: " + unescape(JSON.stringify(allRows)))
          categoryArr.push("Unclassified")
          for (var item of result.rows){
            var cat = unescape(item.categories)
            if (cat.length > 0){
              var c = JSON.parse(cat)
              if (c.length > 0){
                for (var o of c){
                  var arr = o.split("/")
                  for (var a of arr){
                    if (a.length){
                      var newItem = true
                      for (var existCat of categoryArr){
                        if (existCat == a){
                          newItem = false
                          break
                        }
                      }
                      if (newItem){
                        //console.log("item: " + a)
                        categoryArr.push(a)
                      }
                    }
                  }
                }
              }
            }
          }
          //console.log("categoryArr: " + JSON.stringify(categoryArr))
          this.setCategoryList(categoryArr)
          retObj['categories'] = JSON.stringify(categoryArr)
          this.readFullData(nextQuery, retObj, res, field, keyword)
      });
    },
    /*
    subscribeForNotification: function (req){
      // read subId form database
      var thisUser = this
      var selectedExtensionList = []
      if (req.body.extensionList != undefined){
        var extList = JSON.parse(req.body.extensionList)
        if (extList.length == 0){
          for (var ext of this.extensionList){
            if (this.extensionId == ext.id){
              selectedExtensionList.push(ext)
              break
            }
          }
        }else{
          for (var item of extList){
            for (var ext of this.extensionList){
              if (item == ext.id){
                selectedExtensionList.push(ext)
                break
              }
            }
          }
        }
      }else{
        selectedExtensionList = this.extensionList
      }
      var query = "SELECT * FROM " + this.getSubscriptionIdTable() + " WHERE ext_id=" + this.getExtensionId();
      pgdb.read(query, (err, result) => {
        console.log(result)
        if(err != null){
          console.log(err);
        }
        if (result.rows.length == 0){
          console.log("no subId found. create one after")
          //var extensionList = thisUser.getExtensionList()
          //var extensionList = JSON.parse(req.body.extensionList)
          thisUser.rc_platform.subscribeForNotification(selectedExtensionList, thisUser.isAdmin(), function(err, result){
            console.log("subscribed ID: " + result)
            if (!err){
              var query = "INSERT INTO " + thisUser.getSubscriptionIdTable()
              query += "(ext_id, sub_id, autotranscribe)"
              query += " VALUES ($1, $2, $3)"
              var values = [thisUser.getExtensionId(), result, true]
              query += " ON CONFLICT DO NOTHING"
              console.log("SUBS: " + query)
              pgdb.insert(query, values, (err, result) =>  {
                if (err){
                  console.error(err.message);
                }
                console.log("register subId: " + result)
              })
            }
          })
        }else{
          // found the subId, use it to check and renew
          var subId = result.rows[0].sub_id
          if (subId == ''){
            console.log("empty subID")
            var extensionList = thisUser.getExtensionList()
            thisUser.rc_platform.subscribeForNotification(selectedExtensionList, thisUser.isAdmin(), function(err, result){
              if (!err){
                var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id='" + result + "'"
                query += " WHERE ext_id=" + thisUser.getExtensionId();
                console.log("UPDATING SUB ID: " + query)
                pgdb.update(query, (err, result) => {
                  if (err){
                    return console.log("CANNOT UPDATE SUB ID" + err.message);
                  }else{
                    return console.log("RESUBSCRIBE SUBSCRIPTION: " + JSON.stringify(result))
                  }
                });
              }
            })
          }else{
            console.log("SAVED SUBSCRIPTION ID: " + subId)
            //thisUser.rc_platform.renewSubscription(subId, function(err, result){
            thisUser.rc_platform.removeOrphanSubscription(subId, function(err, result){
              console.log("REMOVE OLD SUBSCRIPTION")
              if (!err){
                var extensionList = thisUser.getExtensionList()
                thisUser.rc_platform.subscribeForNotification(selectedExtensionList, thisUser.isAdmin(), function(err, result){
                  if (!err){
                    var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id='" + result + "'"
                    query += " WHERE ext_id=" + thisUser.getExtensionId();
                    console.log("UPDATING SUB ID: " + query)
                    pgdb.update(query, (err, result) => {
                      if (err){
                        return console.log("CANNOT UPDATE SUB ID" + err.message);
                      }else{
                        return console.log("RESUBSCRIBE SUBSCRIPTION: " + JSON.stringify(result))
                      }
                    });
                  }
                })
              }else{
                console.log("PLATFORM PROBLEM:" + err.message)
              }
            })
          }
        }
      });
    },
    removeSubscription: function() {
      //this.rc_platform.removeAllSubscriptions()
      //return
      var thisUser = this
      var query = "SELECT * FROM " + this.getSubscriptionIdTable() + " WHERE ext_id=" + this.getExtensionId();
      pgdb.read(query, (err, result) => {
        //console.log(result.rows)
        if(err != null){
          return console.log(err);
        }
        if (result.rows.length == 0){
          console.log("no subId found. don't know what subscription to delete")
        }else{
          // found the subId, use it to check and renew
          var subId = result.rows[0].sub_id
          console.log("subId found: " + subId)
          thisUser.rc_platform.removeSubscription(subId, function(err, result){
            console.log("REMOVE SUBSCRIPTION")
            if (!err){
              var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id=''"
              query += " WHERE ext_id=" + thisUser.getExtensionId();
              console.log("REMOVE SUBS: " + query)
              pgdb.update(query, (err, result) => {
                if (err){
                  return console.error(err.message);
                }else{
                  return console.error(JSON.stringify(result))
                }
              });
            }else{
              console.log("PLATFORM PROBLEM:" + err.message)
              var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id=''"
              query += " WHERE ext_id=" + thisUser.getExtensionId();
              console.log("REMOVE SUBS: " + query)
              pgdb.update(query, (err, result) => {
                if (err){
                  return console.error(err.message);
                }else{
                  return console.error(JSON.stringify(result))
                }
              });
            }
          })
        }
      });
    },
    notificationHandler: function(msg){
      console.log("CALLBACK FROM PLATFORM: " + JSON.stringify(msg))
      if (msg.event.indexOf('message-store') > 0){
        console.log("message-store type: " + msg.body.changes[0].type)
        if (msg.body.changes[0].type == "VoiceMail" && msg.body.changes[0].newCount > 0){
          return this.notificationUser.hasMissedCall = true
        }
        //if (msg.body.changes[0].type == "VoiceMail" && (msg.body.changes[0].newCount > 0 || msg.body.changes[0].updatedCount > 0)){
        if (msg.body.changes[0].type == "VoiceMail" && msg.body.changes[0].updatedCount > 0){
          if (this.notificationUser.hasMissedCall == true) {
            var date = new Date()
            var time = date.getTime()
            var moreXXSeconds = time + (36 * 1000) //+ (3600 * 8)
            var toDate = new Date(moreXXSeconds)
            var stopTime = toDate.toISOString()
            stopTime = stopTime.replace('/', ':')
            console.log("END TIME: " + stopTime)
            var extId = msg.body.extensionId
            //var startTime = this.notificationUser.startTime
            this.notificationUser.stopTime = stopTime
            this.notificationUser.callRecording = false
            this.notificationUser.hasMissedCall = false
            var thisUser = this
            setTimeout(function(){
              thisUser.readExtensionCallLogs(extId)
            }, 5000)
          }
        }
        console.log("BODY: " + JSON.stringify(msg.body))
      }else if (msg.event.indexOf('presence') > 0){
        this.notificationUser.extensionId = msg.body.extensionId
        var newTelephonyStatus = msg.body.telephonyStatus
        console.log("stored: " + this.notificationUser.telephonyStatus)
        console.log("new   : " + newTelephonyStatus)
        if (this.notificationUser.telephonyStatus == "NoCall" && newTelephonyStatus == "Ringing"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          var date = new Date()
          var time = date.getTime()
          var lessXXSeconds = time - (36 * 1000)// + (3600 * 8)
          var from = new Date(lessXXSeconds)
          var dateFrom = from.toISOString()
          this.notificationUser.startTime = dateFrom.replace('/', ':')
          console.log("START TIME: " + this.notificationUser.startTime)
          console.log("this extensionId " + this.notificationUser.extensionId + " has an incoming call")
        }
        else if (this.notificationUser.telephonyStatus == "Ringing" && newTelephonyStatus == "CallConnected"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          //this.notificationUser.hasMissedCall = false
          console.log("this extensionId " + this.notificationUser.extensionId + " has a accepted a call")
        }
        else if (this.notificationUser.telephonyStatus == "Ringing" && newTelephonyStatus == "NoCall"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          //this.notificationUser.hasMissedCall = true
          console.log("this extensionId " + this.notificationUser.extensionId + " has a missed call")
        }
        else if (this.notificationUser.telephonyStatus == "CallConnected" && newTelephonyStatus == "NoCall"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          console.log("this extensionId " + this.notificationUser.extensionId + " has terminated a call")
          // now cause a 30 sec delay then check for call recordings
          var date = new Date()
          var stopTime = date.toISOString()
          stopTime = stopTime.replace('/', ':')
          console.log("END TIME: " + stopTime)
          this.notificationUser.stopTime = stopTime
          this.notificationUser.callRecording = true
          var thisUser = this
          setTimeout(function(){
            thisUser.readExtensionCallLogs(thisUser.notificationUser.extensionId)
          }, 20000)
        } else {
          this.notificationUser.telephonyStatus = newTelephonyStatus
        }
      }
    },
    */
    // WEBHOOK
    subscribeForNotification: function (req, res){
      // read subId form database
      var selectedExtensionList = []
      if (req.body.extensionList != undefined){
        var extList = JSON.parse(req.body.extensionList)
        if (extList.length == 0){
          for (var ext of this.extensionList){
            if (this.extensionId == ext.id){
              selectedExtensionList.push(ext)
              break
            }
          }
        }else{
          for (var item of extList){
            for (var ext of this.extensionList){
              if (item == ext.id){
                selectedExtensionList.push(ext)
                break
              }
            }
          }
        }
      }else{
        selectedExtensionList = this.extensionList
      }
      var thisRes = res
      var thisUser = this
      //thisRes.send('{"result":"ok"}')
      console.log("EXT ID: " + this.getExtensionId())
      var query = "SELECT * FROM " + this.getSubscriptionIdTable() + " WHERE ext_id=" + this.getExtensionId();
      pgdb.read(query, (err, result) => {
        console.log(result.rows)
        if(err != null){
          console.log(err);
        }
        if (result.rows.length == 0){
          console.log("no subId found. create one after")
          //var extensionList = thisUser.getExtensionList()
          thisUser.rc_platform.subscribeForNotification(selectedExtensionList, thisUser.isAdmin(), function(err, subId){
            console.log("subscribed ID: " + subId)
            console.log("RETURNED EXT ID: " + thisUser.getExtensionId())
            if (!err){
              thisRes.send('{"result":"ok"}')

              var query = "INSERT INTO " + thisUser.getSubscriptionIdTable()
              query += "(ext_id, sub_id, autotranscribe)"
              query += " VALUES ($1, $2, $3)"
              var extId = thisUser.getExtensionId()
              var values = [extId, subId, true]
              query += " ON CONFLICT DO NOTHING"
              console.log("SUBS: " + query)
              pgdb.insert(query, values, (err, result) =>  {
                if (err){
                  console.error(err.message);
                }
                console.log("register subId: " + result)
              })
            }else{
              thisRes.send('{"result":"failed"}')
            }
          })
        }else{
          // found the subId, use it to check and renew
          var subId = result.rows[0].sub_id
          console.log("subId :" + subId)
          if (subId == ''){
            console.log("empty subID")
            //var extensionList = thisUser.getExtensionList()
            thisUser.rc_platform.subscribeForNotification(selectedExtensionList, thisUser.isAdmin(), function(err, subId){
              console.log("RETURNED EXT ID: " + thisUser.getExtensionId())
              if (!err){
                thisRes.send('{"result":"ok"}')
                var extId = thisUser.getExtensionId()
                var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id='" + subId + "'"
                query += " WHERE ext_id=" + extId;
                console.log("UPDATING SUB ID: " + query)
                pgdb.update(query, (err, result) => {
                  if (err){
                    return console.log("CANNOT UPDATE SUB ID" + err.message);
                  }else{
                    return console.log("RESUBSCRIBE SUBSCRIPTION OK")
                  }
                });
              }else{
                thisRes.send('{"result":"failed"}')
              }
            })
          }else{
            console.log("SAVED SUBSCRIPTION ID: " + subId) //JSON.stringify(subId))
            thisUser.rc_platform.removeOrphanSubscription(subId, function(err, result){
              console.log("OLD ORPHANED SUBSCRIPTION REMOVED")
              if (!err){
                //var extensionList = thisUser.getExtensionList()
                thisUser.rc_platform.subscribeForNotification(selectedExtensionList, thisUser.isAdmin(), function(err, subId){
                  if (!err){
                    thisRes.send('{"result":"ok"}')
                    var extId = thisUser.getExtensionId()
                    var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id='" + subId + "'"
                    query += " WHERE ext_id=" + extId;
                    console.log("UPDATING SUB ID: " + query)
                    pgdb.update(query, (err, result) => {
                      if (err){
                        return console.log("CANNOT UPDATE SUB ID" + err.message);
                      }else{
                        return console.log("RESUBSCRIBE SUBSCRIPTION OK")
                      }
                    });
                  }else{
                    thisRes.send('{"result":"failed"}')
                  }
                })
              }else{
                console.log("PLATFORM PROBLEM:" + err.message)
                thisRes.send('{"result":"failed"}')
              }
            })
          }
        }
      });
    },
    removeSubscription: function(res) {
      //this.rc_platform.removeAllSubscriptions()
      //return
      //console.log(res)
      var thisRes = res
      //res.send('{"result":"ok"}')
      var thisUser = this
      var extId = thisUser.getExtensionId()
      var query = "SELECT * FROM " + this.getSubscriptionIdTable() + " WHERE ext_id=" + extId;
      pgdb.read(query, (err, result) => {
        //console.log(result.rows)
        if(err != null){
          thisRes.send('{"result":"failed"}')
          return console.log(err);
        }
        if (result.rows.length == 0){
          thisRes.send('{"result":"ok"}')
          console.log("no subId found. don't know what subscription to delete")
        }else{
          // found the subId, use it to check and renew
          var subId = result.rows[0].sub_id
          console.log("subId found: " + subId)
          thisUser.rc_platform.removeSubscription(subId, function(err, result){
            console.log("REMOVE SUBSCRIPTION")
            if (!err){
              thisRes.send('{"result":"ok"}')
              var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id=''"
              query += " WHERE ext_id=" + thisUser.getExtensionId();
              console.log("REMOVE SUBS: " + query)
              pgdb.update(query, (err, result) => {
                if (err){
                  return console.error(err.message);
                }else{
                  return console.error(JSON.stringify(result))
                }
              });
            }else{
              thisRes.send('{"result":"failed"}')
              console.log("PLATFORM PROBLEM:" + err.message)
              var query = "UPDATE " + thisUser.getSubscriptionIdTable() + " SET sub_id=''"
              query += " WHERE ext_id=" + thisUser.getExtensionId();
              console.log("REMOVE SUBS: " + query)
              pgdb.update(query, (err, result) => {
                if (err){
                  return console.error(err.message);
                }else{
                  return console.error(JSON.stringify(result))
                }
              });
            }
          })
        }
      });
    },
    handleWebhooksPost: function(msg) {
      //console.log("CALLBACK FROM WebHook: " + JSON.stringify(msg))
      //var extId = msg.body.extensionId
      var thisUser = this
      if (msg.event.indexOf('message-store') > 0){
        console.log("message-store type: " + msg.body.changes[0].type)
        console.log("BODY: " + JSON.stringify(msg.body))
        //console.log("MSG: " + JSON.stringify(msg))
        if (msg.body.changes[0].type == "VoiceMail" && msg.body.changes[0].newCount > 0){
          return this.notificationUser.hasMissedCall = true
        }
        //if (msg.body.changes[0].type == "VoiceMail" && (msg.body.changes[0].newCount > 0 || msg.body.changes[0].updatedCount > 0)){
        if (msg.body.changes[0].type == "VoiceMail" && msg.body.changes[0].updatedCount > 0){
          if (this.notificationUser.hasMissedCall == true) {
            var date = new Date()
            var time = date.getTime()
            var moreXXSeconds = time + (36 * 1000) //+ (3600 * 8)
            var toDate = new Date(moreXXSeconds)
            var stopTime = toDate.toISOString()
            stopTime = stopTime.replace('/', ':')
            console.log("END TIME: " + stopTime)
            var extId = msg.body.extensionId
            //var startTime = this.notificationUser.startTime
            this.notificationUser.stopTime = stopTime
            this.notificationUser.callRecording = false
            this.notificationUser.hasMissedCall = false
            var thisUser = this
            setTimeout(function(){
              thisUser.readExtensionCallLogs(extId)
            }, 5000)
          }
        }

      }else if (msg.event.indexOf('presence') > 0){
        this.notificationUser.extensionId = msg.body.extensionId
        var newTelephonyStatus = msg.body.telephonyStatus
        console.log("stored: " + this.notificationUser.telephonyStatus)
        console.log("new   : " + newTelephonyStatus)
        if (this.notificationUser.telephonyStatus == "NoCall" && newTelephonyStatus == "Ringing"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          var date = new Date()
          var time = date.getTime()
          var lessXXSeconds = time - (36 * 1000)// + (3600 * 8)
          var from = new Date(lessXXSeconds)
          var dateFrom = from.toISOString()
          this.notificationUser.startTime = dateFrom.replace('/', ':')

          console.log("START TIME: " + this.notificationUser.startTime)
          console.log("this extensionId " + this.notificationUser.extensionId + " has an incoming call")
        }
        else if (this.notificationUser.telephonyStatus == "Ringing" && newTelephonyStatus == "CallConnected"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          //this.notificationUser.hasMissedCall = false
          console.log("this extensionId " + this.notificationUser.extensionId + " has a accepted a call")
        }
        else if (this.notificationUser.telephonyStatus == "Ringing" && newTelephonyStatus == "NoCall"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          //this.notificationUser.hasMissedCall = true
          console.log("this extensionId " + this.notificationUser.extensionId + " has a missed call")
        }
        else if (this.notificationUser.telephonyStatus == "CallConnected" && newTelephonyStatus == "NoCall"){
          this.notificationUser.telephonyStatus = newTelephonyStatus
          console.log("this extensionId " + this.notificationUser.extensionId + " has terminated a call")
          // now cause a 30 sec delay then check for call recordings
          var date = new Date()
          var stopTime = date.toISOString()
          stopTime = stopTime.replace('/', ':')
          console.log("END TIME: " + stopTime)
          this.notificationUser.stopTime = stopTime
          this.notificationUser.callRecording = true
          var thisUser = this
          setTimeout(function(){
            thisUser.readExtensionCallLogs(thisUser.notificationUser.extensionId)
          }, 20000)
        } else {
          this.notificationUser.telephonyStatus = newTelephonyStatus
        }
      }
      /*
      this.readNotificationDatabase(extId, function(err, notificationUser){
        if (!err){
          if (msg.event.indexOf('message-store') > 0){
            console.log("message-store type: " + msg.body.changes[0].type)
            if (msg.body.changes[0].type == "VoiceMail" && msg.body.changes[0].newCount > 0){
              notificationUser.hasMissedCall = true
              return thisUser.updateNotificationDatabase(notificationUser)
            }
            //if (msg.body.changes[0].type == "VoiceMail" && (msg.body.changes[0].newCount > 0 || msg.body.changes[0].updatedCount > 0)){
            if (msg.body.changes[0].type == "VoiceMail" && msg.body.changes[0].updatedCount > 0){
              if (notificationUser.hasMissedCall == true) {
                var date = new Date()
                var time = date.getTime()
                var moreXXSeconds = time + (36 * 1000) //+ (3600 * 8)
                var toDate = new Date(moreXXSeconds)
                var stopTime = toDate.toISOString()
                stopTime = stopTime.replace('/', ':')
                console.log("END TIME: " + stopTime)
                var extId = msg.body.extensionId
                //var startTime = this.notificationUser.startTime
                notificationUser.hasMissedCall = false
                //var thisPlatfrom = thisUser.getPlatform()
                setTimeout(function(){
                  thisUser.readExtensionCallLogs(thisUser, extId, notificationUser.startTime, stopTime, false)
                }, 5000)
                thisUser.updateNotificationDatabase(notificationUser)
              }
            }
            console.log("BODY: " + JSON.stringify(msg.body))
          }else if (msg.event.indexOf('presence') > 0){
            var newTelephonyStatus = msg.body.telephonyStatus
            console.log("stored: " + notificationUser.telephonyStatus)
            console.log("new   : " + newTelephonyStatus)
            if (notificationUser.telephonyStatus == "NoCall" && newTelephonyStatus == "Ringing"){
              notificationUser.telephonyStatus = newTelephonyStatus
              var date = new Date()
              var time = date.getTime()
              var lessXXSeconds = time - (36 * 1000)// + (3600 * 8)
              var from = new Date(lessXXSeconds)
              var dateFrom = from.toISOString()
              notificationUser.startTime = dateFrom.replace('/', ':')
              console.log("START TIME: " + notificationUser.startTime)
              console.log("this extensionId " + notificationUser.extensionId + " has an incoming call")
            }
            else if (notificationUser.telephonyStatus == "Ringing" && newTelephonyStatus == "CallConnected"){
              notificationUser.telephonyStatus = newTelephonyStatus
              //this.notificationUser.hasMissedCall = false
              console.log("this extensionId " + notificationUser.extensionId + " has a accepted a call")
            }
            else if (notificationUser.telephonyStatus == "Ringing" && newTelephonyStatus == "NoCall"){
              notificationUser.telephonyStatus = newTelephonyStatus
              //this.notificationUser.hasMissedCall = true
              console.log("this extensionId " + notificationUser.extensionId + " has a missed call")
            }
            else if (notificationUser.telephonyStatus == "CallConnected" && newTelephonyStatus == "NoCall"){
              notificationUser.telephonyStatus = newTelephonyStatus
              console.log("this extensionId " + notificationUser.extensionId + " has terminated a call")
              // now cause a 30 sec delay then check for call recordings
              var date = new Date()
              var stopTime = date.toISOString()
              stopTime = stopTime.replace('/', ':')
              console.log("END TIME: " + stopTime)
              //var thisPlatfrom = thisUser.getPlatform()
              setTimeout(function(){
                thisUser.readExtensionCallLogs(thisUser, notificationUser.extensionId, notificationUser.startTime, stopTime, true)
              }, 20000)
            } else {
              notificationUser.telephonyStatus = newTelephonyStatus
            }
            thisUser.updateNotificationDatabase(notificationUser)
          }
        }
      })
      */
    },
    readNotificationDatabase: function(extId, callback){
      var query = "SELECT * FROM notificationstate WHERE ext_id=" + extId;
      pgdb.read(query, (err, result) => {
        var notificationUser = {
            extensionId: extId,
            telephonyStatus: "NoCall",
            startTime: "",
            hasMissedCall: false
        }
        console.log("SAVED NOTIFICATION STATE: " + JSON.stringify(result))
        if (result.rows.length == 0){ // no row => add row for this user
          // create one
          console.log("rows == 0")
          var query = "INSERT INTO notificationstate "
          query += "(ext_id, telephony_status, start_time, has_missed_call)"
          query += " VALUES ($1, $2, $3, $4)"
          var values = [extId, "NoCall", "", false]
          query += " ON CONFLICT DO NOTHING"
          console.log("QUERY: " + query)
          pgdb.insert(query, values, (err, result) =>  {
            if (err){
              console.error(err.message);
            }
            console.log("INSERT NEW NOTIFICATION")
            callback(null, notificationUser)
          })
        }else{
          console.log("ASSIGN OLD NOTIFICATION")
          notificationUser.telephonyStatus = result.rows[0].telephony_status
          notificationUser.startTime = result.rows[0].start_time
          notificationUser.hasMissedCall = result.rows[0].has_missed_call
          callback(null, notificationUser)
        }
      });
    },
    updateNotificationDatabase: function(data){
      var query = "UPDATE notificationstate SET telephony_status='" + data.telephonyStatus + "'"
      query += ", start_time='" + data.startTime + "'"
      query += ", has_missed_call=" + data.hasMissedCall
      query += " WHERE ext_id=" + data.extensionId;
      console.log("QUERY: " + query)
      pgdb.update(query, (err, result) =>  {
        if (err){
          console.error(err.message);
        }
        console.log("UPDATE NOTIFICATION SUCCESS")
      })
    },

    readExtensionCallLogs: function(extensionId){
      var endpoint = '/account/~/extension/'+ extensionId +'/call-log'
      var params = {}

      params['view'] = 'Detailed'
      params['dateFrom'] = this.notificationUser.startTime
      params['dateTo'] = this.notificationUser.stopTime
      if (this.notificationUser.callRecording)
        params['recordingType'] = 'All' //withCallRecording
      //console.log(JSON.stringify(params))
      var p = this.getPlatform()
      //console.log(endpoint)
      var thisUser = this
      p.get(endpoint, params)
      .then(function(resp){
        var json = resp.json()
        //console.log("RESPONSE: " + JSON.stringify(json))
        if (json.records.length == 0){
          return
        }
        async.each(json.records,
          function(record, callback){
            //console.log("RECORD: " + JSON.stringify(record))
            var item = {}
            if (record.hasOwnProperty("message") && record.message.type == "VoiceMail"){
              item['call_type'] = "VM"
              item['uid'] = record.message.id
              var recordingUrl = record.message.uri.replace("platform", "media")
              recordingUrl += "/content/" + record.message.id
              item['recording_url'] = recordingUrl
            }else if (record.hasOwnProperty("recording")){
              item['call_type'] = "CR"
              item['uid'] = record.recording.id
              item['recording_url'] = record.recording.contentUri
            }else {
              return callback(null, null)
            }
            // CR and VM has the same 'from' and 'to' data structure
            if (record.hasOwnProperty('to')){
              if (record.to.hasOwnProperty('phoneNumber'))
                item['to_number'] = record.to.phoneNumber
              else if (record.to.hasOwnProperty('extensionNumber'))
                item['to_number'] = thisUser.getMainCompanyNumber() + "*" + record.to.extensionNumber
              else
                item['to_number'] = "Unknown #"
              if (record.to.hasOwnProperty('name'))
                item['to_name'] = record.to.name
              else
                item['to_name'] = "Unknown"
            }else{
              item['to_number'] = "Unknown #"
              item['to_name'] = "Unknown"
            }

            if (record.hasOwnProperty('from')){
              if (record.from.hasOwnProperty('phoneNumber'))
                item['from_number'] = record.from.phoneNumber
              else if (record.from.hasOwnProperty('extensionNumber'))
                item['from_number'] = thisUser.getMainCompanyNumber() + "*" + record.from.extensionNumber
              else
                item['from_number'] = "Unknown #"
              if (record.from.hasOwnProperty('name'))
                item['from_name'] = record.from.name
              else
                item['from_name'] = "Unknown"
            }else{
              item['from_number'] = "Unknown #"
              item['from_name'] = "Unknown"
            }
            item['call_date'] = new Date(record.startTime).getTime()
            item['processed'] = false
            item['rec_id'] = record.id
            item['duration'] = record.duration
            item['direction'] = (record.direction == "Inbound") ? "In" : "out"
            item['extension_id'] = extensionId
            var extensionList = thisUser.getExtensionList()
            for (var ext of extensionList){
              for (var leg of record.legs){
                if (leg.hasOwnProperty('extension')){
                  if (ext.id == leg.extension.id){
                    item['extension_num'] = ext.extNum
                    item['full_name'] = ext.fullName
                    break
                  }
                  break
                }
              }
            }
            var query = "INSERT INTO " + thisUser.getUserTable()
            /*
            query += "(uid, rec_id, call_date, call_type, extension_num, full_name, from_number, from_name, to_number, to_name, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, sentiments, sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, profanities, keywords, entities, concepts, categories, actions)"
            query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)"
            var values = [item['uid'], item['rec_id'],item['call_date'],item['call_type'],item['extension_num'],item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],item['recording_url'],item['duration'],item['direction'],0,"","","","","",0,0,0,0,"","","","","",""]
            query += " ON CONFLICT DO NOTHING"
            */
            query += "(uid, rec_id, call_date, call_type, extension_id, extension_num, full_name, from_number, from_name, to_number, to_name, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, sentiments, sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, profanities, keywords, entities, concepts, categories, actions, subject)"
            query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,$28,$29,$30,$31)"
            var values = [item['uid'], item['rec_id'],item['call_date'],item['call_type'],item['extension_id'],item['extension_num'],item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],item['recording_url'],item['duration'],item['direction'],0,"","","","","",0,0,0,0,"","","","","","",""]
            query += " ON CONFLICT DO NOTHING"
            pgdb.insert(query, values, (err, result) =>  {
              if (err){
                console.error(err.message);
              }
              console.log("saveVoiceFile")
              thisUser.saveVoiceFile(item['call_type'], item['uid'], item['recording_url'])
              return callback(null, result)
            })
          },
          function (err){
            //console.log("function err")
            //return callback (null, json);
          })
        })
        .catch(function(e){
          var errorRes = {}
          var err = e.toString();
          if (err.includes("ReadCompanyCallLog")){
            errorRes['calllog_error'] = "You do not have admin role to access account level. You can choose the extension access level."
            console.log(errorRes['calllog_error'])
            //thisRes.send(JSON.stringify(errorRes))
          }else{
            errorRes['calllog_error'] = "Cannot access call log."
            console.log(errorRes['calllog_error'])
          }
          console.log(err)
        })
    },
    saveVoiceFile: function(type, recordingId, contentUri){
      console.log("saveVoiceFile")
      var p = this.getPlatform()
      var thisUser = this
      var recordingUrl = p.createUrl(contentUri, {addToken: true});
      var body = {}
      body['type'] = type
      body['audioSrc'] = recordingId
      this.setCategoryList([])
      var table = this.getUserTable()
      if (process.env.TRANSCRIPT_ENGINE == "WATSON"){
        p.get(recordingUrl)
          .then(function(res) {
            return res.response().buffer();
          })
          .then(function(buffer) {
            var stream = require('stream');
            var bufferStream = new stream.PassThrough();
            bufferStream.end(buffer);
            console.log("CALL Watson?")
            var watson = new WatsonEngine()
            watson.transcribe(table, null, body, bufferStream)
            //watson.transcribe("demos", res, body, fs.createReadStream(audioSrc))
          })
          .catch(function(e){
            console.log(e)
            throw e
          })
        }else if (process.env.TRANSCRIPT_ENGINE == "REV-AI"){
          console.log("CALL Rev AI?")
          var revai = new RevAIEngine()
          revai.transcribe(table, null, body, recordingUrl, thisUser.getExtensionId())
        }
    },
    removeItemFromDB: function(req, res){
      var thisRes = res
      var query = "DELETE FROM " + this.getUserTable() + " WHERE uid=" + req.body.id;
      //console.log(query)
      pgdb.remove(query, function (err, result) {
        if (err){
          thisRes.send('{"status":"error"}')
          return console.error(err.message);
        }
        thisRes.send('{"status":"ok"}')
      });
      /*
      var thisRes = res
      var thisUser = this
      var json = JSON.parse(req.body.calls)
      async.each(json,
        function(item, callback){
          var query = "DELETE FROM " + thisUser.getUserTable() + " WHERE uid=" + item.id;
          pgdb.remove(query, function (err, result) {
            callback(null, result)
          });
        },
        function (err){
          console.log("remove done")
          thisRes.send('{"status":"ok"}')
        })
      */
    },
    deleteItemFromCallLogDb: function(req, res){
      var thisRes = res
      var thisReq = req
      var thisUser = this
      //console.log(req.body.id)
      //console.log(req.body.rec_id)
      var json = JSON.parse(req.body.calls)
      var p = thisUser.getPlatform()
      var table = thisUser.getUserTable()
      async.each(json,
        function(item, callback){
          if (req.body.type == "PR"){
            var query = "DELETE FROM " + this.getUserTable() + " WHERE uid=" + item.id;
            pgdb.remove(query, function (err, result) {
              callback(null, result)
            });
          }else{
            var endpoint = '/restapi/v1.0/account/~/call-log/' + item.rec_id
            if (!thisUser.isAdmin())
              endpoint = '/restapi/v1.0/account/~/extension/~/call-log/' + item.rec_id
            p.delete(endpoint)
              .then(function(){
                var query = "DELETE FROM " + table + " WHERE uid=" + item.id;
                console.log(query)
                pgdb.remove(query, function (err, result) {
                  callback(null, result)
                });
              })
              .catch(function(e){
                console.log(e)
                callback(null, result)
              })
          }
        },
        function (err){
          console.log("delete done")
          //return callback (null, json);
          thisRes.send('{"status":"ok"}')
        })
    },
    /*
    deleteItemFromCallLogDb: function(req, res){
      var thisRes = res
      var thisReq = req
      //console.log(req.body.id)
      //console.log(req.body.rec_id)
      if (req.body.type == "PR"){
        var query = "DELETE FROM " + this.getUserTable() + " WHERE uid=" + req.body.id;
        //console.log(query)
        pgdb.remove(query, function (err, result) {
          if (err){
            thisRes.send('{"status":"error"}')
            return console.error(err.message);
          }
          thisRes.send('{"status":"ok"}')
        });
      }else{
        var endpoint = '/restapi/v1.0/account/~/call-log/' + req.body.rec_id
        if (!this.isAdmin())
          endpoint = '/restapi/v1.0/account/~/extension/~/call-log/' + req.body.rec_id
        var p = this.getPlatform()
        var table = this.getUserTable()
        p.delete(endpoint)
          .then(function(){
            var query = "DELETE FROM " + table + " WHERE uid=" + req.body.id;
            //console.log(query)
            pgdb.remove(query, function (err, result) {
              if (err){
                thisRes.send('{"status":"error"}')
                return console.error(err.message);
              }
              //engine.loadCallsFromDB(req, res)
              thisRes.send('{"status":"ok"}')
            });
          })
          .catch(function(e){
            console.log(e)
            //engine.loadCallsFromDB(req, res)
            thisRes.send('{"status":"error"}')
          })
      }
    },
    */
    createRecord: function(req, res){
      var item = {}
      item['from_number'] = "+16502245476"
      item['from_name'] = "Ryan"
      item['to_number'] = "+16505130930"
      item['to_name'] = "Paco"
      item['extension_id'] = "101"
      item['extension_num'] = "101"
      item['full_name'] = "Demo Account"
      item['call_date'] = new Date().getTime() /// 1000
      item['call_type'] = req.body.type
      item['processed'] = false
      item['duration'] = 1
      item['direction'] = "In"
      item['uid'] = generateRandomCode(9)
      item['rec_id'] = generateRandomCode(15)
      item['recording_url'] = "http://www.qcalendar.com/audios/" + req.body.fname
      if (req.body.type == 'VR')
        req.body.fname.replace('.mp4', '.mp3')
      var recordedFile = item.id + ".mp3"
      var query = "INSERT INTO " + this.getUserTable()
      query += "(uid, rec_id, call_date, call_type, extension_id, extension_num, full_name, from_number, from_name, to_number, to_name, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, sentiments, sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, profanities, keywords, entities, concepts, categories, actions, subject)"
      query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,$28,$29,$30,$31)"
      var values = [item['uid'], item['rec_id'],item['call_date'],item['call_type'],item['extension_id'],item['extension_num'],item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],item['recording_url'],item['duration'],item['direction'],0,"","","","","",0,0,0,0,"","","","","","",""]
      pgdb.insert(query, values, (err, result) =>  {
        if (err){
          console.error(err.message);
        }else{
          res.send('{"result":"ok"}')
        }
      })
    },
    transcriptCallRecording: function(req, res){
      console.log("transcriptCallRecording")
      var table = this.getUserTable()
      this.categoryList = []
      if (req.body.type == "PR" || req.body.type == "VR"){
        var audioSrc = req.body.recordingUrl
        audioSrc = audioSrc.replace("http://www.qcalendar.com/audios", "./recordings")
        // reset category to force the app read new category form new content
        if (process.env.TRANSCRIPT_ENGINE == "WATSON"){
          var watson = new WatsonEngine()
          watson.transcribe(table, res, req.body, fs.createReadStream(audioSrc))
        }else if (process.env.TRANSCRIPT_ENGINE == "REV-AI"){
          console.log("call REV-AI to transcribe PR")
          var revai = new RevAIEngine()
          revai.transcribe(table, res, body, audioSrc, this.getExtensionId())
        }
      }else {
        console.log("call REV-AI to transcribe VM or CR")
        var p = this.getPlatform()
        //var obj = req.body
        var thisRes = res
        var thisUser = this
        var recordingUrl = p.createUrl(req.body.recordingUrl, {addToken: true});
        //console.log("callRecordingUrl: " + recordingUrl)
        if (process.env.TRANSCRIPT_ENGINE == "WATSON"){
          p.get(recordingUrl)
            .then(function(res) {
              //console.log("ok")
              return res.response().buffer();
            })
            .then(function(buffer) {
              var stream = require('stream');
              var bufferStream = new stream.PassThrough();
              bufferStream.end(buffer);
              //watson.transcribe(table, thisRes, req.body, bufferStream)
              var watson = new WatsonEngine()
              watson.transcribe(table, thisRes, req.body, bufferStream)
            })
            .catch(function(e){
              console.log(e)
            })
        }else if (process.env.TRANSCRIPT_ENGINE == "REV-AI"){
          console.log("call revai")
          var revai = new RevAIEngine()
          revai.transcribe(table, thisRes, req.body, recordingUrl, this.getExtensionId())
        }
      }
    },
    handleRevAIWebhookPost: function(transcriptId, itemId){
      var table = this.getUserTable()
      this.categoryList = []
      var revai = new RevAIEngine()
      revai.getTranscription(transcriptId, itemId, null, table)
    },
    saveNewSubject: function(req, res){
      var query = "UPDATE " + this.getUserTable() + " SET subject='" + req.body.subject + "'"
      query += " WHERE uid=" + req.body.uid;
      console.log("UPDATING SUB ID: " + query)
      var thisRes = res
      pgdb.update(query, (err, result) => {
        if (err){
          console.log("CANNOT UPDATE SUBJECT" + err.message);
          thisRes.send('{"status":"failed","result":"' + err.message + '"}')
        }else{
          console.log("NEW SUBJECT SAVED")
          thisRes.send('{"status":"ok","result":"Subject changed"}')
        }
      });
    },
    saveNewFullName: function(req, res){
      var query = "UPDATE " + this.getUserTable() + " SET "+ req.body.field + "='" + req.body.full_name + "'"
      query += " WHERE uid=" + req.body.uid;
      console.log("UPDATING SUB ID: " + query)
      var thisRes = res
      pgdb.update(query, (err, result) => {
        if (err){
          console.log("CANNOT UPDATE FULLNAME" + err.message);
          thisRes.send('{"status":"failed","result":"' + err.message + '"}')
        }else{
          console.log("NEW SUBJECT SAVED")
          thisRes.send('{"status":"ok","result":"Full name changed"}')
        }
      });
    },
    analyzeContent: function(req, res){
      var query = "SELECT * FROM " + this.getUserTable() + " WHERE uid=" + req.body.CallId;
      pgdb.read(query, (err, result) => {
        if (err){
          return console.error(err.message);
        }
        //console.log(JSON.stringify(result.rows[0]))
        var row = result.rows[0]
        if (this.getUserId() != 100){
          var p = this.getPlatform()
          if (row.call_type == 'VM' || row.call_type == 'CR')
            row.recording_url = p.createUrl(row.recording_url, {addToken: true});
        }
        row.conversations = unescape(row.conversations)
        row.transcript = unescape(row.transcript)
        row.entities = unescape(row.entities)
        row.keywords = unescape(row.keywords)
        row.actions = unescape(row.actions)
        row.concepts = unescape(row.concepts)
        row.sentiments = unescape(row.sentiments)
        row.profanities = unescape(row.profanities)
        row.wordsandoffsets = unescape(row.wordsandoffsets)
        //console.log(row.sentiments)
        var page = 'recordedcall'
        if (row.call_type == 'VR')
          page = 'videocall'
        res.render(page, {
          results: row,
          companyNumber: this.getMainCompanyNumber(),
          searchWord: req.body.searchWord,
          searchArg: req.body.searchArg,
          userName: this.getUserName()
        })
      });
    },
    // use async
    readCallRecordingsAsync: function(req, res){
      this.extIndex = 0
      var selectedExtensionList = []
      if (req.body.extensionList != undefined){
        var extList = JSON.parse(req.body.extensionList)
        if (extList.length == 0){
          for (var ext of this.extensionList){
            if (this.extensionId == ext.id){
              selectedExtensionList.push(ext)
              //console.log("found: " + JSON.stringify(selectedExtensionList))
              break
            }
          }
        }else{
          for (var item of extList){
            console.log("setected id: " + item)
            for (var ext of this.extensionList){
              if (item == ext.id){
                selectedExtensionList.push(ext)
                //console.log("found: " + JSON.stringify(selectedExtensionList))
                break
              }
            }
          }
        }
      }else{
        selectedExtensionList = this.extensionList
      }
      this.readExtensionCallLog(req.body, selectedExtensionList, res)
    },
    findSimilar: function(req, res){
      var query = "SELECT uid, keywords FROM " + this.getUserTable();
      pgdb.read(query, (err, result) => {
        if (err){
          return console.error(err.message);
        }
        console.log(JSON.stringify(result))
        var refKeywords = []
        for (var i = 0; i < result.length; i++){
          var r = result[i]
          if (r.id == req.body.id){
            console.log("found")
            var item = {}
            item['id'] = req.body.id
            item['kw'] = JSON.parse(unescape(r.keywords))
            refKeywords.push(item)
            break
          }
        }
        for (var i = 0; i < result.length; i++){
          var r = result[i]
          if (r.id != req.body.id){
            console.log("--- new content ---")
            if (r.keywords != ""){
              var kwObj = JSON.parse(unescape(r.keywords))
              console.log("count: " + kwObj.length)
              var tempKeywords = []
              for (var refKw of refKeywords[0].kw){
                for (var kw of kwObj){
                  if (kw.text == refKw.text){
                    console.log("matched: " + refKw.text + " == " + kw.text)
                    var item = {}
                    item['text'] = kw.text
                    item['reference'] = kw.relevance
                    tempKeywords.push(item)
                    break
                  }
                }
              }
              if (tempKeywords.length > 0){
                var item = {}
                item['id'] = r.id
                item['kw'] = tempKeywords
                console.log(r.id + ": " + JSON.stringify(tempKeywords))
                refKeywords.push(item)
              }
            }
          }else{
            console.log("reference keyword!")
          }
        }
        console.log(JSON.stringify(refKeywords))

        res.send('{"status":"OK"}')
        /*
        res.render('recordedcall', {
          results: result,
          searchWord: req.body.searchWord
        })
        */
      });
    },
    searchCallsFromDB: function(req, res){
      console.log(JSON.stringify(req.body))
      var query = "SELECT uid, rec_id, call_date, call_type, extension_num, full_name, recording_url, processed, from_number, from_name, to_number, to_name, sentiment_label, conversations, keywords, sentiments, direction, duration, subject FROM " + this.getUserTable()
      var filterQuery = "true"
      var searchQuery = ""
      if (req.body.types != undefined){
        if (req.body.types != "")
          filterQuery = "call_type='" + req.body.types + "'"
      }
      if (req.body.sentiment != undefined){
        if (req.body.sentiment != ""){
          if (filterQuery == "true")
            filterQuery = "sentiment_label='" + req.body.sentiment + "'";
          else
            filterQuery += " AND sentiment_label='" + req.body.sentiment + "'";
        }
      }
      if (req.body.categories != undefined){
        if (req.body.categories != ""){
          if (filterQuery == "true")
            filterQuery = "categories LIKE '%" + escape(req.body.categories) + "%'"
          else
            filterQuery += " AND categories LIKE '%" + escape(req.body.categories) + "%'"
        }
      }
      //query += filterQuery
      var searchArg = req.body.search.trim()
      if (!searchArg) {
        searchArg = '*';
      }
      // check if needed processed field
      //if (req.body.fields == "all" OR req.body.fields == "transcript" OR req.body.fields == "all")
      if (req.body.fields == "all"){
        if (searchArg != "*") {
            //query += "processed=1 AND ("
            searchQuery += "(transcript ILIKE '%" + searchArg + "%' OR "
            //searchQuery += "to_tsvector('simple', 'transcript') @@ to_tsquery('simple', '" + searchArg + ")"
            searchQuery += "keywords ILIKE '%" + searchArg + "%' OR "
            //searchQuery += "concepts ILIKE '%" + searchArg + "%' OR "
            searchQuery += "from_number ILIKE '%" + searchArg + "%' OR "
            searchQuery += "from_name ILIKE '%" + searchArg + "%' OR "
            searchQuery += "to_number ILIKE '%" + searchArg + "%' OR "
            searchQuery += "to_name ILIKE '%" + searchArg + "%')"
            //searchQuery += "extension_num ILIKE '%" + searchArg + "%')"
            //searchQuery += "categories ILIKE '%" + searchArg + "%')"
        }
      }else if (req.body.fields == "transcript"){
        searchQuery += "processed=1"
        if (searchArg != "*") {
          searchQuery += " AND transcript ILIKE '%" + searchArg + "%'";
          //searchQuery += " AND to_tsvector('simple', string) @@ to_tsquery('simple', '" + searchArg + ")"
          //searchQuery += " OR transcript ILIKE '%" + escape(searchArg) + "%'";
          //searchQuery += " OR transcript ILIKE '%" + escape(searchArg) + "%20%')";
        }
      }else if (req.body.fields == "keywords"){
        searchQuery += "processed=1"
        if (searchArg != "*") {
          //searchQuery += " AND keywords ILIKE '%" + searchArg + "%'";
          searchQuery += " AND keywords ILIKE '%" + searchArg + "%'";
          //searchQuery += " OR keywords ILIKE '%%20" + escape(searchArg) + "%'";
          //searchQuery += " OR keywords ILIKE '%" + escape(searchArg) + "%20%')";
        }
      }else if (req.body.fields == "from"){
        if (searchArg != "*") {
          searchQuery += "from_number ILIKE '%" + searchArg + "%' OR from_name ILIKE '%" + searchArg + "%'"
        }
      }else if (req.body.fields == "to"){
        if (searchArg != "*") {
          searchQuery += "to_number ILIKE '%" + searchArg + "%' OR to_name ILIKE '%" + searchArg + "%'"
        }
      }
      /*
      else if (req.body.fields == "extension"){
        if (searchArg != "*") {
          searchQuery += "extension_num='" + searchArg + "'";
        }
      }
      */
      if (req.body.extensionnumbers != undefined){
        if (Array.isArray(req.body.extensionnumbers)){
          var count = req.body.extensionnumbers.length
          if (searchQuery == "")
            searchQuery += "(extension_num='" + req.body.extensionnumbers[0] + "'";
          else
            searchQuery += " AND (extension_num='" + req.body.extensionnumbers[0] + "'";
          for (var n=1; n<count-1; n++){
            searchQuery += " OR extension_num='" + req.body.extensionnumbers[n] + "'";
          }
          searchQuery += " OR extension_num='" + req.body.extensionnumbers[count-1] + "')";
        }else{
          if (searchQuery == "")
            searchQuery += "extension_num='" + req.body.extensionnumbers + "'";
          else
            searchQuery += " AND extension_num='" + req.body.extensionnumbers + "'";
        }
      }
      //console.log("SEARCH QUERY: " + searchQuery)
      if (filterQuery != "true")
        query +=  " WHERE " + filterQuery
      if (searchQuery != ""){
        if (filterQuery == "true")
          query +=  " WHERE " + searchQuery
        else
          query +=  " AND " + searchQuery
      }
      // console.log(filterQuery)
      // console.log(searchQuery)
      // console.log(query)
      var retObj = {}
      retObj['catIndex'] = req.body.categories
      retObj['searchArg'] = searchArg
      retObj['sentimentArg'] = req.body.sentiment
      retObj['fieldArg'] = req.body.fields
      retObj['typeArg'] = req.body.types
      retObj['extensionArgs'] = req.body.extensionnumbers || []
      //retObj['posVal'] = req.body.positiveRange
      //retObj['negVal'] = req.body.negativeRange
      if (this.categoryList.length == 0){
        this.readCategories(query, retObj, res, searchArg)
      }else{
        retObj['categories'] = JSON.stringify(this.categoryList)
        this.readFullData(query, retObj, res, req.body.fields, searchArg)
      }
    },
/*
    searchCallsFromDB_SentimentScore: function(req, res){
      var posVal = req.body.positiveRange/1000
      var negVal = (req.body.negativeRange/1000) * -1
      //var query = "SELECT uid, rec_id, call_date, call_type, extension_num, full_name, recording_url, transcript, processed, from_number, from_name, to_number, to_name, sentiment_label, sentiment_score_hi, sentiment_score_low, has_profanity, keywords FROM " + this.getUserTable() + " WHERE "
      var query = "SELECT uid, rec_id, call_date, call_type, extension_num, full_name, recording_url, processed, from_number, from_name, to_number, to_name, sentiment_label, sentiment_score_hi, sentiment_score_low, has_profanity, keywords, sentiments, direction, concepts FROM " + this.getUserTable() + " WHERE "
      var typeQuery = ""
      if (req.body.types != "all"){
        var checkType = req.body.types
        typeQuery = "call_type='" + checkType + "' AND "
      }
      var searchArg = req.body.search.trim()
      if (!searchArg) {
        searchArg = '*'
      }
      query += typeQuery
      if (req.body.fields == "all"){
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else{
            req.body.positiveRange = 1
            req.body.negativeRange = 1
            query += "(sentiment_score_low <= 0 OR sentiment_score_hi >= 0)";
          }
        }else{
          if (req.body.sentiment == "all"){
            query += "processed=1 AND ("
            query += "transcript ILIKE '%" + searchArg + "%' OR "
            query += "keywords ILIKE '%" + searchArg + "%' OR "
            query += "concepts ILIKE '%" + searchArg + "%' OR "
            query += "from_number ILIKE '%" + searchArg + "%' OR "
            query += "from_name ILIKE '%" + searchArg + "%' OR "
            query += "to_number ILIKE '%" + searchArg + "%' OR "
            query += "to_name ILIKE '%" + searchArg + "%' OR "
            query += "extension_num ILIKE '%" + searchArg + "%' OR "
            query += "categories ILIKE '%" + searchArg + "%')"
          }else{
            query += "processed=1 AND ("
            query += "transcript ILIKE '%" + searchArg + "%' OR "
            query += "keywords ILIKE '%" + searchArg + "%' OR "
            query += "concepts ILIKE '%" + searchArg + "%' OR "
            query += "from_number ILIKE '%" + searchArg + "%' OR "
            query += "from_name ILIKE '%" + searchArg + "%' OR "
            query += "to_number ILIKE '%" + searchArg + "%' OR "
            query += "to_name ILIKE '%" + searchArg + "%' OR "
            query += "extension_num ILIKE '%" + searchArg + "%' OR "
            query += "categories LIKE '%" + searchArg + "%') AND "
            query += "sentiment_label='" + req.body.sentiment + "'";
          }
        }
      }else if (req.body.fields == "transcript"){
        query += "processed=1 AND "
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else{
            query += "(sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
          }
        }else{
          if (req.body.sentiment == "positive")
            query += "transcript ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "transcript ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "transcript ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "'";
          else
            query += "transcript ILIKE '%" + searchArg + "%' AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }
      }else if (req.body.fields == "keywords"){
        query += "processed=1 AND "
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else{
            query += "(sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
          }
        }else{
          if (req.body.sentiment == "positive")
            query += "keywords ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "keywords ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "keywords ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "'";
          else
            query += "keywords ILIKE '%" + searchArg + "%' " + " AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }
      }else if (req.body.fields == "concepts"){
        query += " processed=1 AND "
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else{
            query += "(sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
          }
        }else{
          if (req.body.sentiment == "positive")
            query += "concepts ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "concepts ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "concepts ILIKE '%" + searchArg + "%' AND sentiment_label='" + req.body.sentiment + "'";
          else
            query += "concepts ILIKE '%" + searchArg + "%' " + " AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }
      }else if (req.body.fields == "from"){
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else
            query += "(sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }else{
          query += "from_number ILIKE '%" + searchArg + "%' OR from_name ILIKE '%" + searchArg + "%'"
          if (req.body.sentiment == "positive")
            query += " AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi > " + posVal;
          else if (req.body.sentiment == "negative")
            query += " AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low < " + negVal;
          else if (req.body.sentiment == "neutral")
            query += " AND sentiment_label='" + req.body.sentiment + "'";
          else
            query += " AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi > " + posVal + ")";
        }
      }else if (req.body.fields == "to"){
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi > " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low < " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else
            //query += "1";
            query += "(sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }else{
          query += "to_number ILIKE '%" + searchArg + "%' OR to_name ILIKE '%" + searchArg + "%'"
          if (req.body.sentiment == "positive")
            query += " AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += " AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += " AND sentiment_label='" + req.body.sentiment + "'";
          else
            query += " AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }
      }else if (req.body.fields == "extension"){
        if (searchArg == "*") {
          if (req.body.sentiment == "positive")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "sentiment_label='" + req.body.sentiment + "'";
          else
            query += "(sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }else{
          if (req.body.sentiment == "positive")
            query += "extension_num='" + searchArg + "' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
          else if (req.body.sentiment == "negative")
            query += "extension_num='" + searchArg + "' AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
          else if (req.body.sentiment == "neutral")
            query += "extension_num='" + searchArg + "' AND sentiment_label='" + req.body.sentiment + "'";
          else
            query += "extension_num='" + searchArg + "' AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
        }
      }else if (req.body.fields == "categories"){
        //console.log("SEARCH ARG: " + escape(req.body.categories))
        query += "processed=1 AND categories LIKE '%" + escape(req.body.categories) + "%'"
        if (req.body.sentiment == "positive")
          query += " AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_hi >= " + posVal;
        else if (req.body.sentiment == "negative")
          query += " AND sentiment_label='" + req.body.sentiment + "' AND sentiment_score_low <= " + negVal;
        else if (req.body.sentiment == "neutral")
          query += " AND sentiment_label='" + req.body.sentiment + "'";
        else
          query += " AND (sentiment_score_low <= " + negVal + " OR sentiment_score_hi >= " + posVal + ")";
      }
      console.log(query)
      var retObj = {}
      retObj['catIndex'] = req.body.categories
      retObj['searchArg'] = searchArg
      retObj['sentimentArg'] = req.body.sentiment
      retObj['fieldArg'] = req.body.fields
      retObj['typeArg'] = req.body.types
      retObj['posVal'] = req.body.positiveRange
      retObj['negVal'] = req.body.negativeRange
      if (this.categoryList.length == 0){
        this.readCategories(query, retObj, res, searchArg)
      }else{
        retObj['categories'] = JSON.stringify(this.categoryList)
        this.readFullData(query, retObj, res, req.body.fields, searchArg)
      }
    },
*/
    readFullData: function(query, retObj, res, field, keyword){
      pgdb.read(query, (err, result) =>  {
        if (err){
          return console.error(err.message);
        }
        //console.log(result)
        var rows = result.rows
        for (var i = 0; i < rows.length; i++){
          var r = rows[i]
          rows[i].sentiments = unescape(r.sentiments)
          rows[i].keywords = unescape(r.keywords)
          rows[i].concepts = unescape(r.concepts)
          //console.log("FOUND KW: " + rows[i].keywords)
          if (retObj.searchArg != "*"){
            if (field != null && field == 'keywords'){
              rows[i]['searchMatch'] = JSON.stringify([])
              var searchMatchArr = []
              var keywordArr = JSON.parse(rows[i].keywords) //unescape(r.keywords))
              for (var keyword of keywordArr){
                var regEx = new RegExp(retObj.searchArg, "i");
                //if (keyword.text.indexOf(retObj.searchArg) >= 0 ){
                if (keyword.text.search(regEx) >= 0) {
                  console.log(retObj.searchArg + " == " + keyword.text)
                  console.log(keyword.text.search(regEx))
                  searchMatchArr.push('<span class="search-highlight">' + keyword.text + "</span>")
                  if (searchMatchArr.length > 4 || searchMatchArr.length == keywordArr.length){
                    //rows[i]['searchMatch'] = JSON.stringify(searchMatchArr)
                    break
                  }
                }else{
                  if (searchMatchArr.length < 4){
                    console.log("Add extra keywords")
                    searchMatchArr.push(keyword.text)
                  }if (searchMatchArr.length > 4 || searchMatchArr.length == keywordArr.length){
                    //rows[i]['searchMatch'] = JSON.stringify(searchMatchArr)
                    break
                  }
                }
              }
              if (searchMatchArr.length > 0)
                rows[i]['searchMatch'] = JSON.stringify(searchMatchArr)
              //console.log(rows[i]['searchMatch'])
            }else{
              rows[i]['searchMatch'] = ""
              const MAX_LENGTH = 90
              var conversations = unescape(r.conversations)
              var sentenceArr = JSON.parse(conversations)
              var searchWord = retObj.searchArg.toLowerCase()
              for (var sentence of sentenceArr){
                var sent = sentence.sentence.join('')
                var index = sent.toLowerCase().indexOf(searchWord)
                var sentenceLen = sent.length -1
                var startPos = 0
                var stopPos = 0
                var searchWordLen = retObj.searchArg.length
                if (index == 0){
                  //console.log("SENTENCE START: " + sentence)
                  stopPos = (sentenceLen > MAX_LENGTH) ? MAX_LENGTH : sentenceLen
                  break
                }else if (index > 0){
                  //console.log("SENTENCE SOMEWHERE: " + sentence)
                  // set startPos
                  //startPos = (index + searchWordLen) - MAX_LENGTH
                  startPos = index - (MAX_LENGTH/2)
                  if (startPos < 0){
                    startPos = 0
                  }
                  stopPos = startPos + MAX_LENGTH
                  stopPos = (stopPos > sentenceLen) ? sentenceLen + 1 : stopPos
                  // check and set beginning of the first word
                  if (startPos > 0){
                    for (startPos; startPos<index; startPos++){
                      if (sent[startPos] == "." /*|| sent[startPos] == "," || sent[startPos] == "."*/){
                        startPos += 1
                        break
                      }
                    }
                  }
                  // check and set end of the last word
                  var searchWordEndPos = index + searchWordLen - 1
                  //console.log("END SEARCH POS: " + searchWordEndPos)
                  if (searchWordEndPos < stopPos){
                    //console.log("cutting...")
                    if (stopPos < sentenceLen){
                      var lowBoundary = index + searchWordLen
                      for (stopPos; stopPos>=lowBoundary; stopPos--){
                        if (sent[stopPos] == " " || sent[stopPos] == "," || sent[stopPos] == "."){
                          //stopPos -= 1
                          break
                        }
                      }
                    }
                  }
                  break
                }
              }
              //console.log(startPos + "/" + stopPos + " Len: " + (stopPos - startPos))
              var truncatedText = sent.substring(startPos, stopPos)
              rows[i]['searchMatchOriginal'] = truncatedText
              if (startPos == 0){
                truncatedText += " ..."
              }else {
                truncatedText = "... " + truncatedText + " ..."
              }
              //console.log("SEARCH MATCH: " + truncatedText)
              var regEx = new RegExp(retObj.searchArg, "ig");
              var hightlightTruncatedText = truncatedText.replace(regEx, '<span class="search-highlight">' + retObj.searchArg + "</span>")

              //rows[i]['searchMatch'] = rows[i]['searchMatch'].trim()

              rows[i]['searchMatch'] = hightlightTruncatedText
              rows[i].conversations = "{}"
            }
          }

          //console.log(rows[i].concepts)
          //console.log(rows[i].keywords)
          /*
          if (field != null && field == 'keywords'){
            var kwObj = JSON.parse(unescape(r.keywords))
            for (var kw of kwObj){
              if (kw.text == keyword){
                rows[i]['score'] = kw.relevance
                break
              }
            }
          }
          */
        }
        /*
        if (field != null && field == 'keywords'){
          console.log("search keywords")
          for (var i = 0; i < rows.length; i++){
            var r = rows[i]
            rows[i].sentiments = unescape(r.sentiments)
            var kwObj = JSON.parse(unescape(r.keywords))
            for (var kw of kwObj){
              if (kw.text == keyword){
                rows[i]['score'] = kw.relevance
                break
              }
            }
          }
          //console.log("BEFORE: " + JSON.stringify(rows))
          rows.sort(sortScores)
          //console.log("AFTER: " + JSON.stringify(rows))
        }
        */
        //else
          rows.sort(sortDates)
          /* dont need as recording cannot be listened from the calls list
          // url need token when transcribes though
          var p = this.getPlatform()
          for (var i=0; i<rows.length; i++){
            if (rows[i].call_type == "CR" || rows[i].call_type == "VM"){
              rows[i].recording_url = p.createUrl(rows[i].recording_url, {addToken: true});
            }
          }
          */

        //console.log(rows)

        //if (users[index].getUserId() == 100)
        //  userLevel = 'demo'
        //console.log(JSON.stringify(retObj))
        // add comments
        res.render('recordedcalls', {
            calls: rows,
            companyNumber: this.getMainCompanyNumber(),
            categories: retObj.categories,
            catIndex: retObj.catIndex,
            searchArg: retObj.searchArg,
            sentimentArg: retObj.sentimentArg,
            fieldArg: retObj.fieldArg,
            typeArg: retObj.typeArg,
            itemCount: rows.length,
            extensionArgs: retObj.extensionArgs,
            userName: this.getUserName(),
            userLevel: this.getUserLevel(),
            extensionList: JSON.stringify(this.extensionList)
          })
      });
    },
    loadCallsFromDB: function(req, res){
      //var query = "SELECT uid, rec_id, call_date, call_type, extension_num, full_name, recording_url, transcript, processed, from_number, from_name, to_number, to_name,sentiment_label, sentiment_score_hi, sentiment_score_low, has_profanity, sentiments FROM " + this.getUserTable();
      var query = "SELECT uid, rec_id, call_date, call_type, extension_num, full_name, recording_url, processed, from_number, from_name, to_number, to_name,sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, keywords, sentiments, direction, duration, subject, concepts FROM " + this.getUserTable();
      var retObj = {}
      retObj['catIndex'] = ''
      retObj['searchArg'] = "*"
      retObj['sentimentArg'] = ''
      retObj['fieldArg'] = 'all'
      retObj['typeArg'] = ''
      retObj['extensionArgs'] = []
      //retObj['posVal'] = 0
      //retObj['negVal'] = 0
      if (this.categoryList.length == 0){
        this.readCategories(query, retObj, res, null, "")
      }else{
        retObj['categories'] = JSON.stringify(this.categoryList)
        this.readFullData(query, retObj, res, null, "")
      }
    },
    readExtensionCallLog: function(body, extList, res){
      var ext = extList[this.extIndex]

      var endpoint = '/account/~/extension/'+ ext.id +'/call-log'
      //console.log("Ext Id: " + ext.id)
      var thisBody = body
      var thisRes = res
      var thisUser = this
      //console.log("DATE: " + body.dateFrom + "/" + body.dateTo)
      var params = {
        view: "Detailed",
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        showBlocked: true,
        type: "Voice",
        perPage: 1000
      }

      var p = thisUser.rc_platform.getPlatform()
      var table = thisUser.getUserTable()

      var companyPhoneNumber = thisUser.getMainCompanyNumber()

      async.waterfall([
          this._function(p, res, endpoint, params, table, companyPhoneNumber, extList, ext.id)
        ], function (error, success) {
            if (error) {
              console.log('Something is wrong!');
            }
            thisUser.extIndex++
            console.log('read next extension.. ' + extList.length);
            console.log("EXT IND: " + thisUser.extIndex)

            if (thisUser.extIndex < extList.length){
              setTimeout(function(){
                console.log("read from timer")
                thisUser.readExtensionCallLog(body, extList, res)
              }, 1000)
            }else{
              console.log('Done read call log!');
              thisUser.extIndex = 0
              thisRes.send('{"status":"ok"}')
            }
        });
    },
    _function: function(p, res, endpoint, params, table, companyPhoneNumber, extensionList, extensionId) {
      var thisRes = res
      return function (callback) {
        p.get(endpoint, params)
          .then(function(resp){
            var json = resp.json()
            //console.log("REC LEN: " + json.records.length)
            if (json.records.length == 0){
              return callback (null, json);
            }
            async.each(json.records,
              function(record, callback0){
                //console.log("RECORD: " + JSON.stringify(record))
                var item = {}
                if (record.hasOwnProperty("message") && record.message.type == "VoiceMail"){
                  item['call_type'] = "VM"
                  item['uid'] = record.message.id
                  var recordingUrl = record.message.uri.replace("platform", "media")
                  recordingUrl += "/content/" + record.message.id
                  item['recording_url'] = recordingUrl
                }else if (record.hasOwnProperty("recording")){
                  item['call_type'] = "CR"
                  item['uid'] = record.recording.id
                  item['recording_url'] = record.recording.contentUri
                }else {
                  //console.log("NO CR/VM")
                  return callback0(null, null)
                }
                // CR and VM has the same 'from' and 'to' data structure
                if (record.hasOwnProperty('to')){
                  if (record.to.hasOwnProperty('phoneNumber'))
                    item['to_number'] = record.to.phoneNumber
                  else if (record.to.hasOwnProperty('extensionNumber'))
                    item['to_number'] = companyPhoneNumber + "*" + record.to.extensionNumber
                  else
                    item['to_number'] = "Unknown #"
                  if (record.to.hasOwnProperty('name'))
                    item['to_name'] = record.to.name
                  else
                    item['to_name'] = "Unknown"
                }else{
                  item['to_number'] = "Unknown #"
                  item['to_name'] = "Unknown"
                }

                if (record.hasOwnProperty('from')){
                  if (record.from.hasOwnProperty('phoneNumber'))
                    item['from_number'] = record.from.phoneNumber
                  else if (record.from.hasOwnProperty('extensionNumber'))
                    item['from_number'] = companyPhoneNumber + "*" + record.from.extensionNumber
                  else
                    item['from_number'] = "Unknown #"
                  if (record.from.hasOwnProperty('name'))
                    item['from_name'] = record.from.name
                  else
                    item['from_name'] = "Unknown"
                }else{
                  item['from_number'] = "Unknown #"
                  item['from_name'] = "Unknown"
                }
                //console.log("DATE: " + new Date(record.startTime).getTime())
                item['call_date'] = new Date(record.startTime).getTime() - (8*3600*1000)
                //console.log("Converted DATE: " + item['call_date'])
                item['processed'] = false
                item['rec_id'] = record.id
                item['duration'] = record.duration
                item['direction'] = (record.direction == "Inbound") ? "In" : "out"
                item['extension_id'] = extensionId
                for (var ext of extensionList){
                  for (var leg of record.legs){
                    if (leg.hasOwnProperty('extension')){
                      if (ext.id == leg.extension.id){
                        item['extension_num'] = ext.extNum
                        item['full_name'] = ext.fullName
                        break
                      }
                      break
                    }
                  }
                }
                var query = "INSERT INTO " + table
                query += "(uid, rec_id, call_date, call_type, extension_id, extension_num, full_name, from_number, from_name, to_number, to_name, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, sentiments, sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, profanities, keywords, entities, concepts, categories, actions, subject)"
                query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,$28,$29,$30,$31)"
                var values = [item['uid'], item['rec_id'],item['call_date'],item['call_type'],item['extension_id'],item['extension_num'],item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],item['recording_url'],item['duration'],item['direction'],0,"","","","","",0,0,0,0,"","","","","","",""]
                query += " ON CONFLICT DO NOTHING"
                //setTimeout(function(){
                pgdb.insert(query, values, (err, result) =>  {
                  if (err)
                    console.error("INSERT ERR: " + err.message);
                  // create index
                  var q = "CREATE INDEX " + table + "_fts_ind ON " + table + " USING gin (to_tsvector('simple', string))"
                  return callback0(null, result)
                })
                //}, 1000)
              },
              function (err){
                //console.log("function err")
                return callback (null, json);
              })
            })
            .catch(function(e){
              var errorRes = {}
              var err = e.toString();
              if (err.includes("ReadCompanyCallLog")){
                errorRes['calllog_error'] = "You do not have admin role to access account level. You can choose the extension access level."
                thisRes.send(JSON.stringify(errorRes))
              }else{
                errorRes['calllog_error'] = "Cannot access call log."
                thisRes.send(JSON.stringify(errorRes))
              }
              console.log(err)
            })
       }
    }
}

// global function
function dropTable(table, callback){
  console.log("DROP TABLE")
  var query = "DROP TABLE IF EXISTS " + table
  pgdb.delete_table(query, (err, res) => {
    if (err) {
      console.log(err, res)
      //copyTable(table)
    }else{
      console.log("DONE")
      callback(null, "done")
    }
  })
}
/*
function createTable(table, callback) {
  console.log("CREATE TABLE: " + table)
  if (table.indexOf('user_') >= 0) {
    var query = "SELECT subject FROM " + table;
    pgdb.read(query, (err, result) => {
      if(err != null){
        // not exist => drop old table
        console.log("err: drop old table")
        dropTable(table, (err, res) => {
          if (!err){
            pgdb.create_table(table, (err, res) => {
              if (err) {
                console.log(err, res)
                callback(err, err.message)
                copyTable(table)
              }else{
                console.log("DONE")
                callback(null, "Ok")
                if (table.indexOf('user_') >= 0)
                  copyTable(table)
              }
            })
          }
        })
      }else{
        if (result.rows.length == 0){
          console.log("empty: drop old table")
          dropTable(table, (err, res) => {
            if (!err){
              pgdb.create_table(table, (err, res) => {
                if (err) {
                  console.log(err, res)
                  callback(err, err.message)
                  copyTable(table)
                }else{
                  console.log("DONE")
                  callback(null, "Ok")
                  if (table.indexOf('user_') >= 0)
                    copyTable(table)
                }
              })
            }
          })
        }else
          console.log("just try to create a new table")
          pgdb.create_table(table, (err, res) => {
            if (err) {
              console.log(err, res)
              callback(err, err.message)
            }else{
              console.log("DONE")
              callback(null, "Ok")
              if (table.indexOf('user_') >= 0)
                copyTable(table)
            }
          })
        }
    });
  }else{
    pgdb.create_table(table, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
        copyTable(table)
      }else{
        console.log("DONE")
        callback(null, "Ok")
        if (table.indexOf('user_') >= 0)
          copyTable(table)
      }
    })
  }
}
*/

function createTable(table, callback) {
  console.log("CREATE TABLE: " + table)
  if (process.env.FORCETODELETEUSERTABLE == 1){
    console.log("err: drop old table")
    pgdb.create_table(table, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
  }else{
    pgdb.create_table(table, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
  }
}

//const sqlite3 = require('sqlite3').verbose();
const pgescape = require('pg-escape');
var USERS_DATABASE = './db/users.db';
/*
function copyTable(table){
  console.log("Copy demos table")
  var query = 'SELECT * FROM demos'
  let db = new sqlite3.Database(USERS_DATABASE);
  db.serialize(function() {
    db.all(query, function(err, allRows) {
      if(err != null){
        console.log(err);
        //callback(err);
      }
      const math = require('mathjs')
      async.each(allRows,
        function(row, callback){
          var item = {}
          var wordsandoffsets = []
          var words = []
          var offsets = []
          Object.keys(row).forEach((key) => {
            var temp = ""
            if (key == "transcript"){
              temp = unescape(row[key])
              var reExp = new RegExp("'","g")
              item[key] = temp.replace(reExp, "''")
              //console.log(item[key])
            }else if (key == "keywords"){
              temp = unescape(row[key])
              var reExp = new RegExp("'","g")
              item[key] = temp.replace(reExp, "''")
            }else if (key == "actions"){
              temp = unescape(row[key])
              var reExp = new RegExp("'","g")
              item[key] = temp.replace(reExp, "''")
            }else if (key == "entities"){
              temp = unescape(row[key])
              var reExp = new RegExp("'","g")
              item[key] = temp.replace(reExp, "''")
            }else if (key == "categories"){
              temp = unescape(row[key])
              var reExp = new RegExp("'","g")
              item[key] = temp.replace(reExp, "''")
            }else{
              item[key] = row[key]
            }
          })

          var query = "INSERT INTO " + table
          query += "(uid, rec_id, call_date, call_type, extension_id, extension_num, full_name, from_number, from_name, to_number, to_name, recording_url, duration, direction, processed, wordsandoffsets, transcript, conversations, sentiments, sentiment_label, sentiment_score, sentiment_score_hi, sentiment_score_low, has_profanity, profanities, keywords, entities, concepts, categories, actions, subject)"
          query += " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,$28,$29,$30,$31)"
          //var values = [item['uid'], item['rec_id'],item['call_date'],item['call_type'],item['extension_id'],item['extension_num'],item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],item['recording_url'],item['duration'],item['direction'],0,"","","","","",0,0,0,0,"","","","","","",""]
          var values = [item['uid'],item['rec_id'],item['call_date'],item['call_type'],item['extension_id'],item['extension_num'],
          item['full_name'],item['from_number'],item['from_name'],item['to_number'],item['to_name'],
          item['recording_url'],item['duration'],item['direction'],item['processed'],item['wordsandoffsets'],
          item['transcript'],item['conversations'],item['sentiments'],item['sentiment_label'],
          item['sentiment_score'],item['sentiment_score_hi'],item['sentiment_score_low'],item['has_profanity'],
          item['profanities'],item['keywords'],item['entities'],item['concepts'],item['categories'],
          item['actions'],item['subject']]
          query += " ON CONFLICT DO NOTHING"

          pgdb.insert(query, values, (err, result) =>  {
            if (err){
              console.error(err.message);
              //callback0(null, result)
            }
            callback(null, result)
          })

        },
        function (err){

        })
    });
  });
}
*/
function sortDates(a,b) {
  return new Date(parseInt(b.call_date)) - new Date(parseInt(a.call_date));
}

function sortScores(a,b) {
  return b.score - a.score;
}
module.exports = User;
