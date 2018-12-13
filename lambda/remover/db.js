var AWS = require('aws-sdk')

var dynamodb = new AWS.DynamoDB({ "region": "eu-west-1" });

var table = "images";

var docClient = new AWS.DynamoDB.DocumentClient()

var read = function (key, callback) {

  var obj = {
    TableName: table,
    IndexName: "image_id-index",
    KeyConditionExpression: "image_id = :k",
    ExpressionAttributeValues: { ":k": { "S": key } },
    ProjectionExpression: "id"
  }

  dynamodb.query(obj, callback);

}

var remove = function (items, callback) {

  //this is the object  you have to build to insert into dynamodb
  var params = {
    RequestItems: {
      images: []    //images is the name of the dynamodb table
    }
  }

  for (i in items) {
    var item = items[i];
    var obj = {
      DeleteRequest: {
        Key: {
          id: { S: item.id.S }
        }
      }
    }
    params.RequestItems.images.push(obj)
  }
  console.log(params);
  
  dynamodb.batchWriteItem(params, function (err, data) {
    callback(err, data);
  });
}

module.exports = {
  read: read,
  remove: remove
};
