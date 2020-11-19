data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iam_policy" "AmazonDynamoDBFullAccess" {
  arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

data "aws_iam_policy" "AmazonRekognitionFullAccess" {
  arn = "arn:aws:iam::aws:policy/AmazonRekognitionFullAccess"
}

data "aws_iam_policy" "AmazonS3FullAccess" {
  arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

provider "aws" {
  region = "eu-west-1"
}

terraform {
  backend "s3" {
    bucket = "photoalbum-terraform"
    key = "state"
    region = "eu-west-1"
  }
}

// DynamoDB images table
resource "aws_dynamodb_table" "photoalbum-images-db" {
  name = "photoalbumImages"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  attribute {
   name = "id"
   type = "S"
  }
/*
  attribute {
   name = "image_id"
   type = "S"
  }
  attribute {
   name = "keyword"
   type = "S"
  }

  global_secondary_index {
    name = "image_id-index"
    hash_key = "image_id"
    projection_type = "ALL"
  }
  global_secondary_index {
    name = "keyword-index"
    hash_key = "keyword"
    projection_type = "ALL"
  }
*/
}

//bucket for the photos
resource "aws_s3_bucket" "photoalbum-images" {
  bucket = "photoalbum-images"
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "DELETE", "HEAD", "GET"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
  }

}

//bucket for the thumbnails
resource "aws_s3_bucket" "photoalbum-thumbs" {
  bucket = "photoalbum-thumbs"
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "DELETE", "HEAD", "GET"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
  }

}

// the role that will be running the lambdas and accessing the buckets and db
resource "aws_iam_role" "reko_role" {
  name = "photoalbum_reko_role"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

}

//add inline policy that allows writing to logs and invoking lambda functions

resource "aws_iam_role_policy" "inline_policy" {
  name = "inline_policy"
  role = aws_iam_role.reko_role.id

  policy = <<-EOF
  {
    "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": "arn:aws:logs:*:*:*"
            },
            { 
                "Effect": "Allow", 
                "Action": [ "lambda:InvokeFunction" ], 
                "Resource": ["*"] }

        ]
  }
  EOF
}

//add managed policies that allow access to db, reko and s3
//these could definitely be more restrictive
resource "aws_iam_role_policy_attachment" "dynamodb_policy" {
  role       = aws_iam_role.reko_role.name
  policy_arn = data.aws_iam_policy.AmazonDynamoDBFullAccess.arn
}

resource "aws_iam_role_policy_attachment" "s3_policy" {
  role       = aws_iam_role.reko_role.name
  policy_arn = data.aws_iam_policy.AmazonS3FullAccess.arn
}
resource "aws_iam_role_policy_attachment" "reko_policy" {
  role       = aws_iam_role.reko_role.name
  policy_arn = data.aws_iam_policy.AmazonRekognitionFullAccess.arn
}

// create the lambda functions

resource "aws_lambda_function" "photoalbum_reko" {
  filename      = "../lambda/rekognition/reko.zip"
  function_name = "photoalbum_reko"
  role          = aws_iam_role.reko_role.arn
  handler       = "index.handler"
  runtime = "nodejs12.x"
  timeout = 10
}

/*



echo "create lambda functions"
aws lambda create-function --function-name "reko" \
        --runtime nodejs8.10 \
        --role arn:aws:iam::160991186365:role/reko \
        --handler index.handler --zip-file fileb://dummy.zip

aws lambda update-function-configuration --function-name "reko" \
        --timeout 10

echo "create lambda functions"
aws lambda create-function --function-name "remover" \
        --runtime nodejs8.10 \
        --role arn:aws:iam::160991186365:role/reko \
        --handler index.handler --zip-file fileb://dummy.zip

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

echo "create S3->Lambda permission for leilaphotos"
aws lambda add-permission \
    --function-name remover \
    --statement-id removers3 \
    --action "lambda:*" \
    --principal s3.amazonaws.com \
    --source-arn "arn:aws:s3:::leilaphotos"


echo "create leilaphotos reko trigger from S3"
LAMBDACONFIG='{"LambdaFunctionConfigurations":[{"Id":"leilaphotos_resize_trigger","LambdaFunctionArn":"arn:aws:lambda:eu-west-1:160991186365:function:resizer","Events":["s3:ObjectCreated:*"]}, {"Id":"leilaphotos_remover_trigger","LambdaFunctionArn":"arn:aws:lambda:eu-west-1:160991186365:function:remover","Events":["s3:ObjectRemoved:*"]}]}'
aws s3api put-bucket-notification-configuration --bucket "leilaphotos" --notification-configuration "$LAMBDACONFIG"daniel@daniel-X550CL:~/projects/leilaphotos/terraform$ 

*/

