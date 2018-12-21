#!/bin/bash

param=$1

aws lambda invoke --invocation-type RequestResponse --function-name reko --payload "{\"key\":\"$param\"}"  lambda.txt
