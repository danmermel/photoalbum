'use strict';

const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  signatureVersion: 'v4',
});

const sharp = require('sharp');
const fs = require('fs');

const BUCKET = process.env.BUCKET;
const THUMB_BUCKET = process.env.THUMB_BUCKET;

exports.handler = function(event, context, callback) {
  
  console.log(JSON.stringify(event));
  if (event.Records[0].s3.object.size>0) {
    const key = event.Records[0].s3.object.key;
    if (key.match(/\.jpg$|\.png$/)) {      // it is a jpg or png so make a thumbnail

      s3.getObject({Bucket: BUCKET, Key: key}).promise()
        .then(function(data) {    
          return sharp(data.Body)
            .resize(200, 200)
            .toFormat('jpg')
            .toBuffer()
        }).then(function(data){
          console.log("here is the buffer of the converted image", data);
          console.log (THUMB_BUCKET, key)
          return s3.putObject({
            Body: data,
            Bucket: THUMB_BUCKET,
            ACL: "private",
            ContentType: 'image/jpg',
            Key: key,
          }).promise()
        }).then(function() {
          console.log("written to s3!");
          callback();
        }).catch(err => callback(err));
    } else {  // not a jpg so insert a placeholder image
      console.log("inserting placeholder...")
      var file = fs.readFileSync('./play.jpg');
      s3.putObject({
            Body: file,
            Bucket: THUMB_BUCKET,
            ACL: "private",
            ContentType: 'image/jpg',
            Key: key,
          }, function (err,data){
              console.log(err,data)
          }
      )
    }
  } else {
    callback();
  }
}
