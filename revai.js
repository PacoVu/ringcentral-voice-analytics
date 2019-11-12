//var revai = require('rev_ai')
var rev_ai = require('./rev-ai/revaineedle.js')
var watson = require('watson-developer-cloud');
const pgdb = require('./db')

function RevAIEngine() {
  this.revAIClient = new rev_ai.REVAIClient(process.env.REVAI_APIKEY, "v1", null)
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
    var data = null
    if (process.env.REVAI_CALLBACK == "WebHook"){
      data = {
        media_url: encodeURI(audioSrc),
        skip_diarization: "false",
        metadata: "Expecting webhook callback",
        callback_url: process.env.REVAI_WEBHOOK_ADDRESS
      }
    }else{
      data = {
        media_url: encodeURI(audioSrc),
        skip_diarization: "false",
        metadata: "Polling"
      }
    }
    var thisRes = res
    var thisId = body.audioSrc
    var thisEngine = this
    var thisBody = body
    this.revAIClient.post('jobs', data, (err, resp, body) => {
      if (err){
        console.log("CANNOT POST TRANSCRIPT REQUEST")
        var response = {}
        response['status'] = "failed"
        response['message'] = "Cannot call Rev AI transcript"
        if (thisRes != null){
          thisRes.send(JSON.stringify(response))
        }
        return
      }

      var json = body.data
      // use webhook
      if (process.env.REVAI_CALLBACK == "WebHook"){
        var response = {}
        if (json.status == "in_progress"){
          response['status'] = "in_progress"
          response['message'] = "Transcribing ..."
          response['uid'] = thisId
          var query = "UPDATE " + table + " SET processed=2 WHERE uid=" + thisId;
          pgdb.update(query, function(err, result) {
            if (err){
              console.error(err.message);
            }else{
              console.error("TRANSCRIPT IN-PROGRESS");
            }
          });
          var query = "INSERT INTO inprogressedtranscription"
          query += "(transcript_id, item_id, ext_id) VALUES ($1, $2, $3)"
          var values = [json.id, thisId, extensionId]
          query += " ON CONFLICT DO NOTHING"
          pgdb.insert(query, values, (err, result) =>  {
            if (err){
              console.error(err.message);
            }
            console.log("register transcript_id")
          })
        }else{
          response['status'] = "failed"
          response['message'] = json.status
        }
        if (thisRes != null){
          thisRes.send(JSON.stringify(response))
          thisRes = null
        }
      }else{ //use polling
        var jobId = json.id
        if (json.status == "in_progress"){
          var timeOut = 0
          var response = {}
          response['status'] = "in_progress"
          response['message'] = "Transcribing ..."
          response['uid'] = thisId
          var query = "UPDATE " + table + " SET processed=2 WHERE uid=" + thisId;
          pgdb.update(query, function(err, result) {
            if (err){
              console.error(err.message);
            }else{
              console.error("TRANSCRIPT IN-PROGRESS");
            }
          });
          if (thisRes != null){
            thisRes.send(JSON.stringify(response))
            thisRes = null
          }
          // polling
          var interval = setInterval(function () {
            console.log("Polling...")
            var query = 'jobs/' + jobId
            thisEngine.revAIClient.get(query, "", (err,resp,body) => {
              var json = body.data
              if (json.status == "transcribed"){
                clearInterval(interval);
                console.log("read transcript jobid: " + json.id)
                thisEngine.getTranscription(json.id, thisId, thisRes, table)
              }else if(json.status == "failed"){
                console.log("failed transcribe")
                clearInterval(interval);
              }
            })
          }, 10000);

        }else{
          var response = {}
          response['status'] = json.status
          response['message'] = 'some error from rev ai'
          if (thisRes != null){
            thisRes.send(JSON.stringify(response))
          }
        }
      }
    })
  },
  getTranscription: function (transcriptId, id, res, table){
    var thisEngine = this
    var thisRes = res
    var thisId = id
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
              word = ""
              ts = -1
            }else{
              word = element.value
              ts = element.ts
            }
          }else {
            var wordoffset = {}
            if (word != ""){
              if (element.value == "." || element.value == "," || element.value == "?")
                word += element.value + " "
              else
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
      thisEngine.preAnalyzing(table, conversations, thisId, thisRes)
    })
  },
  preAnalyzing: function(table, conversations, thisId, res){
    var thisRes = res
    var transcript = ""
    var wordCount = 0
    var blockTimeStamp = []

    for (var i=0; i<conversations.length; i++){
      var item = conversations[i]
      var paragraph = item.sentence.join("")
      transcript += paragraph + " "
      var sentenceArr = paragraph.split(/[.?!]+/)
      var tsPos = 0
      for (sentence of sentenceArr){
        sentence = sentence.trim()
        if (sentence != ""){
          var wArr = sentence.split(" ")
          var speaker_timestamp = {}
          speaker_timestamp['sentence'] = sentence
          speaker_timestamp['speakerId'] = item.speakerId
          speaker_timestamp['timeStamp'] = item.timestamp[tsPos] // need to improve to get closer timestamp
          blockTimeStamp.push(speaker_timestamp)
          tsPos += wArr.length
        }
      }
      wordCount += item.sentence.length
    }
    transcript = transcript.trim()
    if (wordCount > 8){
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
          resp['message'] = err
          if (thisRes != null){
            thisRes.send(resp)
          }
        else{
          var google = require('./google-ai');
          google.gcp_sentiment(table, blockTimeStamp, response, transcript, thisId, function(err, result){
            if (!err){
              resp['status'] = "ok"
              resp['result'] = result
            }else{
              resp['status'] = "failed"
              resp['message'] = JSON.stringify(result)
            }
            if (thisRes != null){
              console.log("final call back from hod: " + JSON.stringify(resp))
              thisRes.send(resp)
            }
          })
        }
      });
    }else{
      var query = "UPDATE " + table + " SET processed=1"
      query += ", sentiments='" + escape("{}") + "'"
      query += ", sentiment_label='neutral'"
      query += ", sentiment_score=0"
      query += ", sentiment_score_hi=0"
      query += ", sentiment_score_low=0"
      query += ", has_profanity=false"
      query += ", profanities='" + escape("{}") + "'"
      query += ", keywords='" + escape("[]") + "'"
      query += ", actions='" + escape("[]") + "'"
      query += ", entities='" + escape("[]") + "'"
      query += ", concepts='" + escape("[]") + "'"
      query += ", categories='" + escape("[]") + "'"
      query += ", subject='" + transcript + "'"
      query += " WHERE uid=" + thisId;
      pgdb.update(query, function(err, result) {
        if (err){
          console.error(err.message);
        }else{
          console.error("TRANSCRIPT DONE. Not enough data for analytics");
        }
      });
    }
  }
}
module.exports = RevAIEngine;
