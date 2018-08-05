'use strict';

const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  signatureVersion: 'v4',
});

const sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const THUMB_BUCKET = process.env.THUMB_BUCKET;

exports.handler = function(event, context, callback) {
  
  console.log(JSON.stringify(event));
  if (event.Records[0].s3.object.size>0) {
    const key = event.Records[0].s3.object.key;

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
          ACL: "public-read",
          ContentType: 'image/jpg',
          Key: key,
        }).promise()
      }).then(function() {
        console.log("written to s3!");
        callback();
      }).catch(err => callback(err));
  } else {
    callback();
  }
}
