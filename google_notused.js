const speech = require('@google-cloud/speech'); //.v1p1beta1;
const language = require('@google-cloud/language'); //.v1beta2; //.v1p1beta1;
const fs = require('fs');
//const sqlite3 = require('sqlite3').verbose();
//var CALLS_DATABASE = './db/calllogs.db';
// Creates a client
const client = new speech.SpeechClient();
const language_client = new language.LanguageServiceClient();
//console.log(language_client)

//// The name of the audio file to transcribe
const fileName = './resources/audio.raw';
var haven = require('./hpe');
///
var gcp_transcribe = function(res, id, srcFile){
  var thisRes = res
  //console.log("RESPONSE: " + thisRes)
  var thisId = id
  const file = fs.readFileSync(srcFile);
  const audioBytes = file.toString('base64');
  // The audio file's encoding, sample rate in hertz, and BCP-47 language code
  const audio = {
    content: audioBytes,
  };
  const config = {
    encoding: 'AMR',
    sampleRateHertz: 8000,
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
  };
  const request = {
    audio: audio,
    config: config,
  };

  client
    .recognize(request)
    .then(data => {
      console.log(data[0])
      const response = data[0];
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
      console.log("Transcription:" +  transcription);

      var request = {
        "document":{
          "type":"PLAIN_TEXT",
          "content":"Text message marketing has been working great for us We have followed the strategy they laid out for us and we have consistently been growing our list every week Thanks to the support of SlickText we had over 500 people on our list in less than 3 months It's been a great asset in our business for sure",
          "encodingType": "UTF8"
        }
      }
      var test = language_client.analyzeSentiment(request)
        .then(results => {
          for (var sentence of results[0].sentences)
            console.log(JSON.stringify(sentence))
        })

    var ret = {}
    ret['status'] = "ok"
    ret['result'] = "This recorde has no voice content!"
    thisRes.send(JSON.stringify(ret))
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}

module.exports.gcp_transcribe = gcp_transcribe

module.exports.gcp_sentiment = function(table, blockTimeStamp, text, transcript, input, id){
  //var thisId = id
  var request = {
        "document":{
          "type":"PLAIN_TEXT",
          "content": text,
          "encodingType": "UTF8"
        }
    }
  var test = language_client.analyzeSentiment(request)
    .then(results => {
      var count = 0
      var sentences = []
      for (var sentence of results[0].sentences){
        count++
        var item = {}
        if (sentence.sentiment.score > 0.6){
          item['timeStamp'] = blockTimeStamp[count-1].timeStamp
          item['speakerId'] = blockTimeStamp[count-1].speakerId
          item['sentence'] = sentence.text.content
          item['sentiment_label'] = "positive"
          item['sentiment_score'] = sentence.sentiment.score
          item['positive'] = [{"topic":null,"sentiment":null,"score": sentence.sentiment.score, "text": sentence.text.content}]
          sentences.push(item)
        }else if (sentence.sentiment.score < -0.6){
          item['timeStamp'] = blockTimeStamp[count-1].timeStamp
          item['speakerId'] = blockTimeStamp[count-1].speakerId
          item['sentence'] = sentence.text.content
          item['sentiment_label'] = "negative"
          item['sentiment_score'] = sentence.sentiment.score
          item['negative'] = [{"topic":null,"sentiment":null,"score": sentence.sentiment.score, "text": sentence.text.content}]
          sentences.push(item)
        }
      }
      haven.hod_sentiment(table, blockTimeStamp, text, input, transcript, id, sentences)
      //classifyContent(table, blockTimeStamp, text, input, transcript, id, sentences)
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}

function extractEntities(text){
  const document = {
    content: text,
    type: 'PLAIN_TEXT',
  };
  // Detects entities in the document
  language_client.analyzeEntities({document: document})
    .then(results => {
      const entities = results[0].entities;

      console.log('Entities:');
      entities.forEach(entity => {
        console.log(entity.name);
        console.log(` - Type: ${entity.type}, Salience: ${entity.salience}`);
        if (entity.metadata && entity.metadata.wikipedia_url) {
          console.log(` - Wikipedia URL: ${entity.metadata.wikipedia_url}$`);
        }
      });
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}

function classifyContent(table, blockTimeStamp, text, input, transcript, id, sentences){
  const document = {
    content: text,
    type: 'PLAIN_TEXT',
  };
  // Classifies text in the document
  language_client.classifyText({document: document})
    .then(results => {
      const classification = results[0];
      console.log('Categories:');
      //"categories":[{"score":0.706865,"label":"/style and fashion/accessories/backpacks"},{"score":0.383294,"label":"/business and industrial/advertising and marketing/advertising"},{"score":0.347209,"label":"/shopping/retail"}]}
      var categories = []

      classification.categories.forEach(category => {
        if (category.confidence > 0.2)
          categories.push(category.name)
        console.log("CAT NAME: " + category.name)
        console.log(`Name: ${category.name}, Confidence: ${category.confidence}`);
      });
      if (categories.length == 0)
        categories.push('Unclassified')
      input['categories'] = categories
      haven.hod_sentiment(table, blockTimeStamp, text, input, transcript, id, sentences)
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}
