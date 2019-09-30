const language = require('@google-cloud/language');

const language_client = new language.LanguageServiceClient();

const pgdb = require('./db')

var callActionDictionary = ['my number is', 'my cell phone is', 'my cell number is', 'my phone number is', 'call me back', 'give me a call', 'ring me mback', 'reach me at']

module.exports.gcp_sentiment = function(table, blockTimeStamp, input, transcript, id, callback){
  var thisId = id
  var thisCallback = callback
  var data = {}
  var reExp = new RegExp("'","g")
  data['keywords'] = JSON.stringify(input.keywords).replace(reExp, "''")
  var subject = ""
  for (var nn=0; nn<input.keywords.length; nn++){
    subject += input.keywords[nn].text
    var subjectArr = subject.split(" ")
    if (subjectArr.length > 1)
      break
    subject += "; "
  }
  if (subject != "")
    data['subject'] = subject
  else
    data['subject'] = "Not defined"

  data['concepts'] = JSON.stringify(input.concepts).replace(reExp, "''")

  //"categories":[{"score":0.706865,"label":"/style and fashion/accessories/backpacks"},{"score":0.383294,"label":"/business and industrial/advertising and marketing/advertising"},{"score":0.347209,"label":"/shopping/retail"}]}
  var categories = []
  //var classification = input.categories
  input.categories.forEach(category => {
    if (category.score > 0.2)
      categories.push(category.label)
    //console.log("CAT Label: " + category.label)
    //console.log(`Label: ${category.label}, Score: ${category.score}`);
  });
  if (categories.length == 0)
    categories.push('Unclassified')
  input['categories'] = categories
  data['categories'] = JSON.stringify(input.categories).replace(reExp, "''")

  for (var i=0; i<blockTimeStamp.length; i++){
    console.log(blockTimeStamp[i].sentence)
  }

  var request = {
        "document":{
          "type":"PLAIN_TEXT",
          "content": transcript,
          "encodingType": "UTF8"
        }
    }
  var test = language_client.analyzeSentiment(request)
    .then(results => {
      var count = -1
      var sentences = []
      //console.log(JSON.stringify(results[0]))
      var score = 0
      var num = 0
      var hi = 0
      var low = 0
      var sentiments = []
      var positives = []
      var negatives = []
      console.log(blockTimeStamp.length + " == " + results[0].sentences.length)
      for (var sentence of results[0].sentences){
        console.log("GC RESULT: " + sentence.text.content)
        count++
        var item = {}
        var positive = []
        var negative = []
        if (sentence.sentiment.score != 0){
          if (sentence.sentiment.score > 0.0){
            positive = [{"topic":null,"sentiment":null,"score": sentence.sentiment.score, "original_text": sentence.text.content}]
            if (sentence.sentiment.score > hi)
                hi = sentence.sentiment.score
            score += sentence.sentiment.score
          }else if (sentence.sentiment.score < 0.0){
            negative = [{"topic":null,"sentiment":null,"score": sentence.sentiment.score, "original_text": sentence.text.content}]
            if (sentence.sentiment.score < low)
                low = sentence.sentiment.score
            score += sentence.sentiment.score
          }
          if (count < blockTimeStamp.length){
            item['timeStamp'] = blockTimeStamp[count].timeStamp
            item['speakerId'] = blockTimeStamp[count].speakerId
            item['sentence'] = sentence.text.content
            var temp = {}
            temp['positive'] = positive
            temp['negative'] = negative
            temp['extra'] = item
            sentiments.push(temp)
          }else{
            console.log(sentence.text.content)
            console.log("OOR")
          }
        }else{
          console.log("NEUTRAL: " + sentence.text.content)
        }
      }

      if (score > 0.0)
        data['sentiment_label'] = "positive"
      else if (score < 0.0)
        data['sentiment_label'] = "negative"
      else
        data['sentiment_label'] = "neutral"
      data['sentiment_score'] = score
      data['sentiment_score_hi'] = hi
      data['sentiment_score_low'] = low
      data['emotion'] =  ""
      data['sentiment'] = sentiments

      console.log(JSON.stringify(sentences))
      var query = "UPDATE " + table + " SET processed=1"
      query += ", sentiments='" + JSON.stringify(data['sentiment']).replace(reExp, "''") + "'" //  escape(JSON.stringify(results))
      query += ", sentiment_label='" + data.sentiment_label + "'"
      query += ", sentiment_score=" + data.sentiment_score
      query += ", sentiment_score_hi=" + data.sentiment_score_hi
      query += ", sentiment_score_low=" + data.sentiment_score_low
      query += ", has_profanity=false" //+ hasBadWord
      query += ", profanities=''" //+ escape(JSON.stringify(profanity)) + "'"
      query += ", keywords='" + data.keywords + "'"
      query += ", actions='{}'" //+ JSON.stringify(actions).replace(reExp, "''") + "'" // escape(JSON.stringify(actions))
      query += ", entities='{}'" //+ JSON.stringify(resp.body.entities).replace(reExp, "''") + "'" // escape(JSON.stringify(resp.body.entities))
      query += ", concepts='" + data.concepts + "'"
      query += ", categories='" + data.categories + "'"
      query += ", subject='" + data.subject + "'"
      query += " WHERE uid=" + thisId;
      //console.log(query)
      var ret = {}
      ret['sentiment'] = data.sentiment_label
      ret['keywords'] = JSON.stringify(input.keywords)
      ret['subject'] = data.subject
      console.log("KEYWORDS: " + JSON.stringify(input.keywords))
      //thisCallback(null, ret)
      pgdb.update(query, (err, result) => {
        if (err){
          var ret = {}
          ret['sentiment'] = ""
          ret['keywords'] = ""
          ret['subject'] = ""
          thisCallback(err, JSON.stringify(ret))
          console.error(err.message);
        }else{
          console.log("MUST CALLBACK to exit: " + result);
          var ret = {}
          ret['sentiment'] = data.sentiment_label
          ret['keywords'] = input.keywords
          ret['subject'] = data.subject
          console.log("KEYWORDS: " + input.keywords) // unescape(data.keywords)
          thisCallback(null, ret)
        }
      });
      /*
      var ret = {}
      ret['sentiment'] = "positive" //data.sentiment_label
      ret['keywords'] = input.keywords
      ret['subject'] = data.subject
      console.log("KEYWORDS: " + input.keywords) // unescape(data.keywords)
      thisCallback(null, ret)
      */
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}
