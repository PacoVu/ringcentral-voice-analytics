var path = require('path')
var util = require('util')

if('production' !== process.env.LOCAL_ENV )
  require('dotenv').load();

var express = require('express');
var session = require('express-session');

var app = express();
//app.use(session());
app.use(session({ secret: 'this-is-a-secret-token', cookie: { maxAge: 24 * 60 * 60 * 1000 }}));
var bodyParser = require('body-parser');
var urlencoded = bodyParser.urlencoded({extended: false})

app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(urlencoded);

var port = process.env.PORT || 5000

var server = require('http').createServer(app);
server.listen(port);
console.log("listen to port " + port)
var router = require('./router');

app.get('/test', function (req, res) {

  res.render('test')

})
app.get('/', function (req, res) {
  console.log('load option page /')
  res.render('index')
  /*
  console.log('login to /')
  req.session.cookie = { maxAge: 24 * 60 * 60 * 1000 }
  if (!req.session.hasOwnProperty("userId"))
    req.session.userId = 0;
  console.log("SESSION:" + JSON.stringify(req.session))
  router.loadLogin(req, res)
  */
})
app.get('/login', function (req, res) {
  console.log('login to /')
  req.session.cookie = { maxAge: 24 * 60 * 60 * 1000 }
  if (!req.session.hasOwnProperty("userId"))
    req.session.userId = 0;
    if (!req.session.hasOwnProperty("extensionId"))
      req.session.extensionId = 0;
  console.log("SESSION:" + JSON.stringify(req.session))
  router.loadLogin(req, res)
})

app.get('/index', function (req, res) {
  console.log('load option page /')
  if (req.query.n != undefined && req.query.n == 1){
    console.log('logout from here?')
    router.logout(req, res)
  }else {
    res.render('index')
  }
  /*
  console.log('login to from index')
  req.session.cookie = { maxAge: 24 * 60 * 60 * 1000 }
  if (!req.session.hasOwnProperty("userId")){
    console.log('reset user id from index?')
    req.session.userId = 0;
  }
  console.log("SESSION:" + JSON.stringify(req.session))
  router.loadLogin(req, res)
  */
})

app.get('/logout', function (req, res) {
  console.log('logout why here?')
  router.logout(req, res)
})

app.get('/readlog', function (req, res) {
  console.log('readlog')
  //console.log("SESSION:" + JSON.stringify(req.session))
  //console.log(req.query.level + '/' + req.query.user_id)
  //router.setUser(req.query.level, req.query.user_id)
  router.loadReadLogPage(req, res)
})

app.get('/oauth2callback', function(req, res){
  console.log("callback redirected")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.login(req, res)
})
/*
app.post('/readlogs', function (req, res) {
  console.log(req.body.access_token)
  console.log(req.body.refresh_token)
  router.login(req, res)
})
*/

app.get('/about', function (req, res) {
  res.render('about')
})

app.get('/checktranscription', function (req, res) {
  console.log("checkTranscription clicked")
  router.checkTranscriptionResult(req, res)
})

app.get('/canceltranscription', function (req, res) {
  console.log("cancelTranscription clicked")
  router.cancelTranscriptionProcess(req, res)
})

app.post('/readlogs', function (req, res) {
  console.log("readCallRecordingsAsync")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.readCallRecordingsAsync(req, res)
})
app.post('/createrecord', function (req, res) {
  console.log("createRecord")
  router.createRecord(req, res)
})

app.post('/enablenotification', function (req, res) {
  console.log("enable notification")
  //console.log(req.body)
  router.subscribeForNotification(req, res)
  //res.send('{"result":"ok"}')
})

app.get('/disablenotification', function (req, res) {
  console.log("disable notification")
  router.removeSubscription(req, res)
  //res.send('{"result":"ok"}')
})

app.get('/recordedcalls', function (req, res) {
  console.log("loadFromDB")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.loadCallsFromDB(req, res)
})
app.post('/search', function (req, res) {
  console.log("searchCallsFromDB")
  //console.log("SESSION:" + JSON.stringify(req.session))
  //console.log(req.body)
  router.searchCallsFromDB(req, res)
})

app.post('/transcribe', function (req, res) {
  console.log("user clicks transcribe")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.transcriptCallRecording(req, res)
})

app.post('/analyze', function (req, res) {
  console.log("user clicked analyze")
  console.log("searchWord: " + req.body.searchWord)
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.analyzeContent(req, res)
})

app.get('/proxyaudio', function (req, res) {
  console.log("proxy audio")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.proxyAudio(req, res)
})

app.post('/remove', function (req, res) {
  console.log("user clicks remove")
  router.removeItemFromDB(req, res)
})

app.post('/delete', function (req, res) {
  console.log("user clicks delete")
  router.deleteItemFromCallLogDb(req, res)
})

app.post('/setsubject', function (req, res) {
  console.log("user clicks set subject")
  console.log("SESSION:" + JSON.stringify(req.session))
  router.saveNewSubject(req, res)
})

app.post('/setfullname', function (req, res) {
  console.log("user clicks set fullname")
  //console.log("SESSION:" + JSON.stringify(req.session))
  router.saveFullName(req, res)
})

app.post('/findsimilar', function (req, res) {
  console.log("findSimilar")
  router.findSimilar(req, res)
})

app.post('/webhooks', function(req, res) {
  console.log("webhook called")
  var headers = req.headers;
  var validationToken = headers['validation-token'];
  var body = [];
  if(validationToken) {
      res.setHeader('Validation-Token', validationToken);
      res.statusCode = 200;
      res.end();
  } else {
      req.on('data', function(chunk) {
          body.push(chunk);
      }).on('end', function() {
          body = Buffer.concat(body).toString();
          var jsonObj = JSON.parse(body)
          router.handleWebhooksPost(jsonObj)
          res.statusCode = 200;
          res.end();
      });
  }
})

app.post('/revaitranscriptcallback', function(req, res) {
  console.log("webhook post called")
  //console.log(util.inspect(req))
  //console.log(JSON.stringify(req.body, null, "\t"))
  //console.log(JSON.stringify(req.body))
  //router.handleRevAIWebhookPost(req)
  var body = [];
  req.on('data', function(chunk) {
      body.push(chunk);
  }).on('end', function() {
      body = Buffer.concat(body).toString();
      //console.log("BODY: " + body)
      router.handleRevAIWebhookPost(body)
      //var jsonObj = JSON.parse(body)
      res.statusCode = 200;
      res.end();
  });
})

app.post('/callback', function (req, res) {
  console.log("transcript callback")

})

app.post('/callback/vtt', function (req, res) {
  console.log("transcript callback")
})
writeGoogleJSONFile()
function writeGoogleJSONFile(){
  //ornate-destiny-209015-0737a9e7196c.json
  var fs = require('fs')
  var fileName = "ornate-destiny-209015-0737a9e7196c.json"
  fs.writeFile(fileName, process.env.GOOGLE_JSON, function(err) {
      if(err) {
          console.log(err);
      }else
          console.log("file created")
  })
}
