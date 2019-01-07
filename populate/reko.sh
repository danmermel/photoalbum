#!/bin/bash

param=$1
echo "now trying ${param}"
aws lambda invoke --invocation-type RequestResponse --function-name reko --payload "{\"key\":\"$param\"}"  lambda.txt
