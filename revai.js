//var revai = require('rev_ai')
var rev_ai = require('./rev-ai/revaineedle.js')
var watson = require('watson-developer-cloud');
const pgdb = require('./db')

function RevAIEngine() {
  this.revAIClient = new rev_ai.REVAIClient(process.env.REVAI_APIKEY, "v1beta", null)
  this.nlu = new watson.NaturalLanguageUnderstandingV1({
      "url": "https://gateway.watsonplatform.net/natural-language-understanding/api",
      "username": process.env.WATSON_ANALYTIC_USERNAME,
      "password": process.env.WATSON_ANALYTIC_PWD,
      'version': '2018-03-16'
    });
    return this
  }
RevAIEngine.prototype = {
  transcribe: function(table, res, body, audioSrc, extensionId) {
    var data = {
      media_url: encodeURI(audioSrc),
      metadata: "This is a test call. Expecting webhook callback" //,
      //callback_url: "https://8b8f7ae3.ngrok.io/revaitranscriptcallback"
    }
    var thisRes = res
    var thisId = body.audioSrc
    var thisEngine = this
    var thisBody = body
    console.log(JSON.stringify(data))
/*
    // teemps delete till return
    console.log("Use id")
    this.getTranscription(395251314, thisId, res, table, body)
    return
    console.log("should not come here")
*/
    this.revAIClient.post('jobs', data, (err,resp,body) => {
      console.log("RESPONSE: " + resp.body.toString('utf8'))
      //var json = JSON.parse(resp.body.toString('utf8'))
      console.log("BODY: " + JSON.stringify(body))
      var json = body.data //.toString('utf8') //.toString('utf8')
      console.log("PASSED")
      /* use webhook
      if (json.status == "in_progress"){
        var resp = {}
        if (!err){
          resp['status'] = json.status
          resp['result'] = json.id
          var query = "INSERT INTO inprogressedtranscription"
          query += "(transcript_id, item_id, ext_id) VALUES ($1, $2, $3)"
          var values = [json.id, thisId, extensionId]
          query += " ON CONFLICT DO NOTHING"
          console.log("SUBS: " + query)
          pgdb.insert(query, values, (err, result) =>  {
            if (err){
              console.error(err.message);
            }
            console.log("register transcript_id")
          })
        }else{
          resp['status'] = json.status
          resp['result'] = "some error"
        }
      }else{
        resp['status'] = json.status
        resp['result'] = "some error"
      }
      if (thisRes != null){
        // return
        thisRes.send(resp)
      }
      */
      // use wait loop for testing: 498839493
      var jobId = json.id
      if (json.status == "in_progress"){
        var timeOut = 0
        var interval = setInterval(function () {
          timeOut++
          console.log("timeout: " + timeOut)
          if (timeOut > 16){
            console.log("return in_progress")
            var response = {}
            response['status'] = "in_progress"
            response['result'] = "{}"
            if (thisRes != null){
              thisRes.send(JSON.stringify(response))
              thisRes = null
            }
          }
          var query = 'jobs/' + jobId
          thisEngine.revAIClient.get(query, "", (err,resp,body) => {
            var json = body.data
            if (json.status == "transcribed"){
              clearInterval(interval);
              console.log("read transcript")
              var table = "user_" + extensionId
              thisEngine.getTranscription(json.id, thisId, thisRes, table, thisBody)
            }else if(json.status == "failed"){
              console.log("failed transcribe")
              clearInterval(interval);
            }
          })
        }, 10000);

      }else{
        var response = {}
        response['status'] = json.status
        response['result'] = '{"error":"some error from rev ai"}'
        if (thisRes != null){
          thisRes.send(JSON.stringify(response))
        }
      }
    })
  },
  getTranscription: function (transcriptId, id, res, table, body){
    var thisEngine = this
    var thisRes = res
    console.log("get transcript and process data...")
    var thisId = id //body.audioSrc
    var query = 'jobs/' + transcriptId + "/transcript"
    this.revAIClient.get(query, "", (err,resp,body) => {
      var json = JSON.parse(resp.body.toString('utf8'))
      var transcript = ""
      var conversations = []
      var wordsandoffsets = []
      var blockTimeStamp = []
      var sentencesForSentiment = []
      for (var item of json.monologues){
        var speakerSentence = {}
        speakerSentence['sentence'] = []
        speakerSentence['timestamp'] = []
        speakerSentence['speakerId'] = item.speaker
        var sentence = ""
        var word = ""
        var ts = -1
        for (var element of item.elements){
          sentence += element.value
          if (element.type == 'text'){
            if (element.value.toLowerCase() == "um" || element.value.toLowerCase() == "uh"){
              console.log("remove: " + element.value.toLowerCase())
              word = ""
              ts = -1
            }else{
              word = element.value
              ts = element.ts
            }
          }else{
            var wordoffset = {}
            if (word != ""){
              word += element.value
              wordoffset['word'] = word
              wordoffset['offset'] = ts
              wordsandoffsets.push(wordoffset)
              speakerSentence['timestamp'].push(ts)
              speakerSentence['sentence'].push(word)
              word = ""
              ts = -1
            }
          }
        }
        sentence = sentence.trim()
        transcript += sentence
        var speaker_timestamp = {}
        speaker_timestamp['speakerId'] = item.speaker
        speaker_timestamp['timeStamp'] = speakerSentence.timestamp[0]
        blockTimeStamp.push(speaker_timestamp)
        conversations.push(speakerSentence)
      }
      var query = "UPDATE " + table + " SET wordsandoffsets='" + escape(JSON.stringify(wordsandoffsets)) + "', transcript='" + escape(transcript) + "', conversations='" + escape(JSON.stringify(conversations))  + "' WHERE uid=" + thisId;
      pgdb.update(query, function(err, result) {
        if (err){
          console.error(err.message);
        }else{
          console.error("TRANSCRIPT UPDATE DB OK");
        }
      });
      thisEngine.preAnalyzing(table, blockTimeStamp, conversations, thisId, thisRes)
    })
  },
  preAnalyzing: function(table, blockTimeStamp, conversations, thisId, res){
    var thisRes = res
    var transcript = ""
    for (var item of conversations){
      transcript += item.sentence.join("")
    }
    console.log("Watson data analysis")
    var parameters = {
      'text': transcript,
      'features': {
        'concepts': {},
        'categories': {},
        'entities': {
          'emotion': false,
          'sentiment': false
        },
        'keywords': {
          'limit': 100
        }
      }
    }
    this.nlu.analyze(parameters, function(err, response) {
      var resp = {}
      if (err)
        console.log('error:', err);
        resp['status'] = "failed"
        resp['result'] = err.messsage
        if (thisRes != null){
          thisRes.send(resp)
        }
      else{
        console.log(JSON.stringify(response))
        var haven = require('./hpe-ai');
        console.log("load engine")
        haven.haven_sentiment(table, blockTimeStamp, conversations, response, transcript, thisId, function(err, result){
          console.log("TRANSCRIBE: " + result)

          if (!err){
            resp['status'] = "ok"
            resp['result'] = result
          }else{
            resp['status'] = "failed"
            resp['result'] = JSON.stringify(result)
          }
          if (thisRes != null){
            console.log("final call back from hod: " + JSON.stringify(resp))
            thisRes.send(resp)
          }
        })
      }
    });
  }
}
module.exports = RevAIEngine;
/*
var callback = function(err,resp,body){
  console.log("callback")
  //console.log(resp)
  //console.log(JSON.stringify( resp.body.toString('utf8')));
  //body.setEncoding('utf8');
  //console.log(body)
  var json = JSON.parse(resp.body.toString('utf8'))
  //console.log(resp.body.toString('utf8'))
  //console.log(json.monologues)
  var transcript = ""
  var conversations = []
  var wordswithoffsets = []
  var blockTimeStamp = []
  var sentencesForSentiment = []
  for (var item of json.monologues){
    var speakerSentence = {}
    speakerSentence['sentence'] = []
    speakerSentence['timestamp'] = []
    speakerSentence['speakerId'] = item.speaker
    var sentence = ""
    for (var element of item.elements){
      sentence += element.value
      if (element.type == 'text'){
        //var wordoffset = {}
        //wordoffset['word'] = element.value
        //wordoffset['offset'] = element.ts
        //wordswithoffsets.push(wordoffset)
        speakerSentence['timestamp'].push(element.ts)
        //speakerSentence['sentence'].push(element.value)
      }
    }
    sentence = sentence.trim()
    transcript += sentence
    var wordArr = sentence.split(" ")
    speakerSentence['sentence'] = wordArr
    //console.log("words #: " + wordArr.length)
    //console.log("times #: " + speakerSentence.timestamp.length)
    for (var i=0; i<speakerSentence.timestamp.length; i++){
      var wordoffset = {}
      if (i < wordArr.length)
      wordoffset['word'] = wordArr[i]
      wordoffset['offset'] = speakerSentence.timestamp[i]
      wordswithoffsets.push(wordoffset)
    }
    conversations.push(speakerSentence)
  }
  console.log(transcript)
  console.log(JSON.stringify(wordswithoffsets))
  console.log(JSON.stringify(conversations))
  thisObj.preAnalyzing(table, blockTimeStamp, textWithPunctuation, transcript, thisId, thisRes)
}
*/
