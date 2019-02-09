# cognito-export

### Pull and Run the image
```shell
$ docker run -it \
   --name cognito_export \
   -e AWS_ACCESS_ID=your_id_here \
   -e AWS_SECRET_KEY=your_key_here \
   -e AWS_SESSION_TOKEN=your_token_here \
   -e STAGE=prod \
   -e REGION=us-west-2 \
   jeffcortese/cognito-export:0.0.5
```

### Get the data out of the container
```shell
$ docker cp cognito_export:./data ./data
```

### Clean up
```shell
$ docker rm -f cognito_export && docker rmi jeffcortese/cognito-export:0.0.5
```
