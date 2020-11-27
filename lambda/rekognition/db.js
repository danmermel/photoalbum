var AWS = require('aws-sdk')

var dynamodb = new AWS.DynamoDB({ "region": "eu-west-1" });

const TABLE = process.env.TABLE

var docClient = new AWS.DynamoDB.DocumentClient()

var read = function (key, callback) {

  var obj = {
    TableName: TABLE,
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
    RequestItems: {}
  }

  params.RequestItems[TABLE] = []

  for (i in items) {
    var item = items[i];
    var obj = {
      DeleteRequest: {
        Key: {
          id: { S: item.id.S }
        }
      }
    }
    params.RequestItems[TABLE].push(obj)
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
