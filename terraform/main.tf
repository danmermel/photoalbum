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

data "aws_iam_policy" "AmazonDynamoDBReadOnlyAccess" {
  arn = "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
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
// the source_code_hash bit makes a hash of the file you want to upload. If the hash is different from the
// last time you uploaded (i.e. you changed the lambda code), then it uploads it again. But if not, it ignores it. Neat!
// Not so good if you have more complicated scenarios because here you have the code and the infra in one place... if you want 
//more separation you need a more complicated setup, e.g. https://johnroach.io/2020/09/04/deploying-lambda-functions-with-terraform-just-dont/ 

resource "aws_lambda_function" "photoalbum_reko" {
  filename      = "../lambda/rekognition/reko.zip"
  function_name = "photoalbum_reko"
  role          = aws_iam_role.reko_role.arn
  handler       = "index.handler"
  runtime       = "nodejs12.x"
  timeout       = 10
  source_code_hash = filebase64sha256("../lambda/rekognition/reko.zip")

  environment {
    variables = {
      BUCKET = aws_s3_bucket.photoalbum-images.id
      TABLE = aws_dynamodb_table.photoalbum-images-db.id
    }
  }
}

resource "aws_lambda_function" "photoalbum_remover" {
  filename      = "../lambda/remover/remover.zip"
  function_name = "photoalbum_remover"
  role          = aws_iam_role.reko_role.arn
  handler       = "index.handler"
  runtime = "nodejs12.x"
  timeout = 10
  source_code_hash = filebase64sha256("../lambda/remover/remover.zip")

  environment {
    variables = {
      TABLE = aws_dynamodb_table.photoalbum-images-db.id
    }
  }
}

resource "aws_lambda_function" "photoalbum_resizer" {
  filename      = "../lambda/resize/resize.zip"
  function_name = "photoalbum_resizer"
  role          = aws_iam_role.reko_role.arn
  handler       = "index.handler"
  runtime = "nodejs12.x"
  timeout = 10
  source_code_hash = filebase64sha256("../lambda/resize/resize.zip")

  environment {
    variables = {
      THUMB_BUCKET = aws_s3_bucket.photoalbum-thumbs.id
      BUCKET = aws_s3_bucket.photoalbum-images.id
      REKO_LAMBDA = aws_lambda_function.photoalbum_reko.id
    }
  }
}

// give s3 permission to execute lambda

resource "aws_lambda_permission" "allow_s3_reko" {
  statement_id  = "AllowS3ToExecuteReko"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.photoalbum_reko.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.photoalbum-images.arn
}

resource "aws_lambda_permission" "allow_s3_remover" {
  statement_id  = "AllowS3ToExecuteRemover"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.photoalbum_remover.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.photoalbum-images.arn
}

resource "aws_lambda_permission" "allow_s3_resizer" {
  statement_id  = "AllowS3ToExecuteResizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.photoalbum_resizer.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.photoalbum-images.arn
}

//trigger resizer from s3
resource "aws_s3_bucket_notification" "photoalbum-triggers" {
    bucket = aws_s3_bucket.photoalbum-images.id

    lambda_function {
        lambda_function_arn = aws_lambda_function.photoalbum_resizer.arn
        events        = ["s3:ObjectCreated:*"] 
    }

    lambda_function {
      lambda_function_arn = aws_lambda_function.photoalbum_remover.arn
      events        = ["s3:ObjectRemoved:*"]
    }

    depends_on = [
      aws_lambda_permission.allow_s3_remover,
      aws_lambda_permission.allow_s3_resizer
    ]
}

resource "aws_cognito_user_pool" "photoalbum_cognito_pool" {
  name   = "photoalbum_cognito_pool"
  username_attributes = [ "email" ]
  password_policy  { 
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
    require_symbols                  = false
  }
  admin_create_user_config  {
    allow_admin_create_user_only = true
  }
 
}

resource "aws_iam_role" "photoalbum_group_role" {
  name = "photoalbum-group-role"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "${aws_cognito_identity_pool.photoalbum_id_pool.id}"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
EOF
}

resource "aws_cognito_user_group" "allusers" {
  name         = "allusers"
  user_pool_id = aws_cognito_user_pool.photoalbum_cognito_pool.id
  description  = "Managed by Terraform"
  role_arn     = aws_iam_role.photoalbum_group_role.arn
}

resource "aws_cognito_user_pool_client" "app-photoalbum" {
  name = "app-photoalbum"
  user_pool_id = aws_cognito_user_pool.photoalbum_cognito_pool.id
  callback_urls = [ "http://localhost:8001", "https://mermelstein.co.uk" ]
  logout_urls = [ "http://localhost:8001", "https://mermelstein.co.uk" ]
  allowed_oauth_flows = [ "implicit" ]
  allowed_oauth_scopes = [ "email","openid" ]
  allowed_oauth_flows_user_pool_client = true
  supported_identity_providers = [ "COGNITO" ]

}

resource "aws_cognito_user_pool_domain" "photoalbum-domain" {
  domain       = "photoalbum"
  user_pool_id = aws_cognito_user_pool.photoalbum_cognito_pool.id
}

//Create a federated identity pool
resource "aws_cognito_identity_pool" "photoalbum_id_pool" {
  identity_pool_name               = "photoalbum_pool"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
  client_id               = aws_cognito_user_pool_client.app-photoalbum.id
  provider_name           = "cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.photoalbum_cognito_pool.id}"
  server_side_token_check = false
  }
}

//create a role that will be given to the identity pool. This requires a policy 
resource "aws_iam_role" "photoalbum_cognito_authenticated" {
  name = "photoalbum_cognito_authenticated"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "${aws_cognito_identity_pool.photoalbum_id_pool.id}"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
EOF
}

resource "aws_iam_role_policy" "cognito_authenticated_policy" {
  name = "cognito_authenticated_policy"
  role = aws_iam_role.photoalbum_cognito_authenticated.id

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "mobileanalytics:PutEvents",
        "cognito-sync:*",
        "cognito-identity:*"
      ],
      "Resource": [
        "*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
          "s3:*"
      ],
      "Resource": [
          "${aws_s3_bucket.photoalbum-images.arn}/*",
          "${aws_s3_bucket.photoalbum-images.arn}",
          "${aws_s3_bucket.photoalbum-thumbs.arn}/*",
          "${aws_s3_bucket.photoalbum-thumbs.arn}"
      ]
  }
  ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "dynamodb_RO_policy" {
  role       = aws_iam_role.photoalbum_cognito_authenticated.name
  policy_arn = data.aws_iam_policy.AmazonDynamoDBReadOnlyAccess.arn
}

//attach the role to the identity pool
resource "aws_cognito_identity_pool_roles_attachment" "photoalbum_id_pool_role_attachment" {
  identity_pool_id = aws_cognito_identity_pool.photoalbum_id_pool.id

  roles = {
    "authenticated" = aws_iam_role.photoalbum_cognito_authenticated.arn
  }
}