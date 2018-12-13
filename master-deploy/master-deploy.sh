#!/bin/bash

echo "create main dynamodb table with one secondary index..."
aws dynamodb create-table --table-name "images" \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=keyword,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --provisioned-throughput WriteCapacityUnits=1,ReadCapacityUnits=1 \
  --global-secondary-indexes IndexName=keyword-index,KeySchema=["{AttributeName=keyword,KeyType=HASH}"],Projection="{ProjectionType=ALL}",ProvisionedThroughput="{ReadCapacityUnits=1,WriteCapacityUnits=1}"

echo "create another index on the image id"

aws dynamodb update-table --table-name images \
   --global-secondary-index-updates '[{"Create": {"IndexName":"image_id-index","ProvisionedThroughput": {"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}, "Projection": {"ProjectionType": "ALL"}, "KeySchema": [ {"KeyType": "HASH", "AttributeName": "image_id" }] } }]' \
   --attribute-definitions AttributeName=image_id,AttributeType=S

echo "create s3 bucket for leilaphotos .."
aws s3 mb "s3://leilaphotos" --region eu-west-1

echo "add cors to bucket"
aws s3api put-bucket-cors --bucket leilaphotos --cors-configuration file://cors.json


echo "create role for lambda to access stuff.."
# this one also allows lambda to invoke other lambda functions
aws iam create-role --role-name reko --assume-role-policy-document file://policy.json

echo "now add policies to the role to give access to services..."
# inline policy for lambda to be able to write logs
aws iam put-role-policy --role-name reko --policy-name logs-inline --policy-document file://inline-policy.json

# AWS managed policies
aws iam attach-role-policy --role-name reko --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
aws iam attach-role-policy --role-name reko --policy-arn arn:aws:iam::aws:policy/AmazonRekognitionFullAccess
aws iam attach-role-policy --role-name reko --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

echo "sleeping for 10 secs to allow the machine to settle!"
sleep 10

echo "create lambda functions"
aws lambda create-function --function-name "reko" \
        --runtime nodejs8.10 \
        --role arn:aws:iam::160991186365:role/reko \
        --handler index.handler --zip-file fileb://dummy.zip

aws lambda update-function-configuration --function-name "reko" \
        --timeout 10

echo "create lambda functions"
aws lambda create-function --function-name "resizer" \
        --runtime nodejs8.10 \
        --role arn:aws:iam::160991186365:role/reko \
        --handler index.handler --zip-file fileb://dummy.zip

aws lambda update-function-configuration --function-name "resizer" \
        --environment "Variables={BUCKET=leilaphotos,THUMB_BUCKET=leilaphotosthumb}" \
        --timeout 10

# create s3 permission to access lambda
echo "create S3->Lambda permission for leilaphotos"
aws lambda add-permission \
    --function-name reko \
    --statement-id rekos3 \
    --action "lambda:*" \
    --principal s3.amazonaws.com \
    --source-arn "arn:aws:s3:::leilaphotos"


echo "create S3->Lambda permission for leilaphotos"
aws lambda add-permission \
    --function-name resizer \
    --statement-id resizers3 \
    --action "lambda:*" \
    --principal s3.amazonaws.com \
    --source-arn "arn:aws:s3:::leilaphotos"


echo "create leilaphotos reko trigger from S3"
LAMBDACONFIG='{"LambdaFunctionConfigurations":[{"Id":"leilaphotos_resize_trigger","LambdaFunctionArn":"arn:aws:lambda:eu-west-1:160991186365:function:resizer","Events":["s3:ObjectCreated:*"]}]}'
aws s3api put-bucket-notification-configuration --bucket "leilaphotos" --notification-configuration "$LAMBDACONFIG"
