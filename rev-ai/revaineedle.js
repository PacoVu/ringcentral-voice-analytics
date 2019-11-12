var needle = require('./needle/lib/needle')
var util = require('util')
var fs = require('fs')
var querystring = require('querystring')

// Constructor
function REVAIClient(apikey, version, proxy) {
  // always initialize all instance properties
  if (version==undefined) {this.version="v1";}
  else {this.version=version;}
  this.apikey = apikey;
  this.endpoint = "https://api.rev.ai/revspeech/"+this.version+"/%s";
  this.proxy = proxy;
  this.getJobResultEndpoint = "https://api.havenondemand.com/1/job/result/%s?apikey=%s";
  this.getJobStatusEndpoint = "https://api.havenondemand.com/1/job/status/%s?apikey=%s";
  this.jobAPIEndpoint = "https://api.havenondemand.com/1/job";
}
// class methods

needle.defaults({ timeout: 120000});

validadeREVAIParameters=function(revAiApp,params,callback) {
  if (typeof revAiApp == "undefined") {
    throw new Error("Missing revAiApp parameter. Required valid API name")
  }
  if (typeof params == "undefined") {
    throw new Error("Missing params parameter. Required API's input and configuration parameters")
  }
  if (typeof callback == "undefined") {
    throw new Error("Missing callback parameter. Required callback function")
  }else if (typeof callback != "function"){
    throw new Error("Wrong callback parameter. Required callback function")
  }
}
isJSON=function(value) {
  var ret = true
  try {
    JSON.parse(value);
  } catch (e) {
    ret = false
  }
  return ret
}

REVAIClient.prototype.post = function(revAiApp, params, callback) {
  validadeREVAIParameters(revAiApp,params,callback)
  var options = {
    apikey: this.apikey,
    json: "application/json"
  }
  if (this.proxy != undefined) {
    options['proxy'] = this.proxy
  }
  var url = util.format(this.endpoint,revAiApp);
  var callback = callback;
  var callbackmanager=function(err,resp,body){
    var error;
    if (typeof(resp) == 'undefined') {
      error = 'Problem getting result from Rev AI. Please try again.';
    } else if (resp.body.error) {
      error = resp.body;
    } else {
      error = null;
    }
    body={'data':body};
    body.status
    callback(error, resp, body);
  }
  needle.post(url, params, options, callbackmanager);
};

REVAIClient.prototype.get = function(revAiApp, params, callback) {
  //validadeREVAIParameters(revAiApp,params,callback)
  //if (params["file"]){
  //  throw new Error("Cannot perform GET with file. Use POST request.")
  //}

  var url = util.format(this.endpoint, revAiApp) //+ "?" + querystring.stringify(params)
  var callback = callback;
  var callbackmanager=function(err,resp,body){
    var error;
    if (typeof(resp) == 'undefined') {
      error = 'Problem getting result from Rev AI. Please try again.';
    } else if (resp.body.error) {
      error = resp.body;
    } else {
      error = null;
    }
    body={'data':body};
    body.status
    callback(error, resp, body);
  }
  var options = {
    apikey: this.apikey,
    accept: "application/vnd.rev.transcript.v1.0+json"
  }
  if (this.proxy != undefined) {
    options['proxy'] = this.proxy
  }
  needle.get(url, options, callbackmanager);
};

validadeREVAIGetJob=function(jobID,callback) {
  if (typeof jobID == "undefined") {
    if (typeof callback == "undefined") {
      throw new Error("Missing jobID parameter. Required valid job ID")
    }else{
      throw new Error("Wrong parameters order. Required function(jobID,callback)")
    }
  }else if (typeof jobID == "function"){
    if (typeof callback == "undefined") {
      throw new Error("Missing jobID parameter. Required valid job ID")
    }else{
      throw new Error("Wrong parameters order. Required function(jobID,callback)")
    }
  }
  if (typeof callback == "undefined") {
    throw new Error("Missing callback parameter. Required callback function")
  }else if (typeof callback != "function"){
    throw new Error("Wrong callback parameter. Required callback function")
  }
}
REVAIClient.prototype.getJobResult = function(jobID,callback) {
  validadeREVAIGetJob(jobID,callback)
  var url = util.format(this.getJobResultEndpoint, jobID, this.apikey);

  if (this.proxy != undefined) {
    return needle.get(url, {proxy: this.proxy}, callback);
  } else {
    return needle.get(url, callback);
  }
}

REVAIClient.prototype.getJobStatus = function(jobID,callback) {
  validadeREVAIGetJob(jobID,callback)
  var url = util.format(this.getJobStatusEndpoint, jobID, this.apikey);

  if (this.proxy != undefined) {
    return needle.get(url, {proxy: this.proxy}, callback);
  } else {
    return needle.get(url, callback);
  }
}

/*
REVAIClient.prototype.createIndex=function(name,arg1,arg2,arg3){
  throw new Error("Removed. Use post/get with \"createtextindex\" instead.")
}

REVAIClient.prototype.getIndex=function(name){
    throw new Error("Removed. Use post/get with \"listresources\" instead.")
}

REVAIClient.prototype.deleteIndex=function(name,arg1,arg2,arg3){
  throw new Error("Removed. Use post/get with \"deletetextindex\" instead.")
}
*/
// export the class
exports.REVAIClient=REVAIClient
