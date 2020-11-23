const AWS = require('aws-sdk');
const db = require('./db.js');

const rekognition = new AWS.Rekognition({"region":"eu-west-1"});
const dynamodb = new AWS.DynamoDB({"region":"eu-west-1"});

const BUCKET = process.env.BUCKET
const TABLE = process.env.TABLE

function addToDynamoDB(image_id, data) {

  var kuuid = require('kuuid')
  var wordList = []
  //console.log(data)
  for(var i in data.Labels) {
    wordList.push({ name: data.Labels[i].Name.toLowerCase(), confidence: data.Labels[i].Confidence})
    //if (data.Labels[i].Parents){
    //    data.Labels[i].Parents.map(function(s) {
    //    wordList.push({ name: s.Name.toLowerCase(), confidence: data.Labels[i].Confidence})
    //  })
    // } 
  }
  
  //sorts the list by confidence
  wordList = wordList.sort(function(a, b) {
    if (a.confidence < b.confidence) {
      return 1
    } else if (a.confidence > b.confidence) {
      return -1
    } else {
      return 0
    }
  })
  
  //this is the object  you have to build to insert into dynamodb
  var params = {
    RequestItems: {}
  }
  
  params.requestItems[TABLE] = []

  //this array contains the words we have already inserted, so that we don't insert it again
  var dedupelist = []
  for (i in wordList) {
    if (dedupelist.indexOf(wordList[i].name) === -1) {   //i.e.the word is not yet in the array
      var album = image_id.match(/(^.*)\//)[1];  //gets the album name
      var obj = {
        PutRequest: {
          Item: {
            id: { S: kuuid.id()},
            album: {S: album},
            keyword: { S: wordList[i].name},
            confidence: { N: wordList[i].confidence.toString()},
            image_id: { S: image_id}
          }
        }
      }
      params.RequestItems[TABLE].push(obj)
      if (params.RequestItems[TABLE].length ==25 ) {
        break  // limit of things you can write to the db has been reached. Stop adding...
      }
      dedupelist.push(wordList[i].name)
    }
  }
  return params
}

exports.handler = function(event, context, callback) {
  
  console.log(JSON.stringify(event));
  const key = event.key;
  console.log("key is ", key);

  //first see if the object has already been reko-gnised

  db.read(key,function(err,data){
    if (err){
      console.log(err, err.stack); // an error occurred
      throw new Error ("Error reading from db")
    }
    if (data.Count>0){
      console.log("previously reko-gnised. Ignoring");
      callback(null,"skipped");
    }else {
      console.log ("not previously reko-gnised")
      var rekoParams = {
        Image: {
         S3Object: {
          Bucket: BUCKET, 
          Name: key
         }
        }, 
        MaxLabels: 50, 
        MinConfidence: 50
       };
       rekognition.detectLabels(rekoParams, function(err, data) {
         if (err) {
           console.log(err, err.stack); // an error occurred
           throw new Error ("Error detecting labels")
         }
         //prepare data for insertion
         var params = addToDynamoDB(key,data);
         //console.log(JSON.stringify(params));
        //call dynamodb to save the data
         dynamodb.batchWriteItem(params,function (err,data) {
           if(err) {
             callback(err);
           } else {
             callback (null,data)
           }
          });
    
        });
    
    }

  })

}