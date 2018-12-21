#!/bin/bash

#run this script to generate tags for all the photos in the leilaphotos bucket

aws s3 ls s3://leilaphotos --recursive | awk '{if ($3 !=0) print $4}' | xargs -L 1 ./reko.sh
