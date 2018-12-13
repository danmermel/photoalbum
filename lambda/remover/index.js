'use strict';

const AWS = require('aws-sdk');
const db = require('./db.js');


exports.handler = function (event, context, callback) {

  console.log(JSON.stringify(event));
  const key = event.Records[0].s3.object.key;
  db.read(key, function (err, data) {
    console.log(err, data)
    db.remove(data.Items, function (err, data) {
      console.log(err, data)
      callback(null)
    })

  })
}
